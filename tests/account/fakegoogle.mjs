// GALACTIC RUSH V12 tests — a local stand-in for the Google services the account system uses, built from Google's
// documentation of their requests and responses, so the game's client code and the account server can be tested
// end to end without network access or real credentials:
//   * Firebase Authentication's REST API, at the paths the Firebase Auth emulator uses
//     (/identitytoolkit.googleapis.com/v1/accounts:*, /securetoken.googleapis.com/v1/token): sign-up, sign-in,
//     token refresh, account lookup, verification and password-reset emails (kept in an outbox the test reads),
//     password reset, Firebase's error codes, email enumeration protection (one error for a wrong email or password)
//   * the securetoken certificates endpoint (/certs, X.509, Cache-Control max-age) and RS256-signed ID tokens
//   * Google's OAuth token endpoint for service accounts (/oauth: checks the signed JWT assertion)
//   * Cloud Firestore's REST API (/v1/projects/.../documents: get, list, commit with preconditions), which only
//     accepts the access tokens /oauth issued
// Every key is generated when the stand-in starts; nothing here is a real credential. CI also runs the account tests
// against Firebase's own emulators (.github/workflows/v12-checks.yml).
import http from 'node:http';
import { generateKeyPairSync, createSign, createVerify, randomBytes, scryptSync, timingSafeEqual, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function selfSignedCert(privatePem) { // an X.509 certificate for the signing key, as Google publishes its keys (openssl)
  const dir = mkdtempSync(join(tmpdir(), 'grcert-'));
  try { writeFileSync(join(dir, 'k.pem'), privatePem); execFileSync('openssl', ['req', '-new', '-x509', '-key', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=securetoken.test'], { stdio: 'ignore' }); return readFileSync(join(dir, 'c.pem'), 'utf8'); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
export function testServiceAccount(projectId) { // a throwaway service account key in Google's key-file format
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { type: 'service_account', project_id: projectId, private_key_id: randomBytes(8).toString('hex'), private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: `game-server@${projectId}.iam.gserviceaccount.com`, client_id: '1' };
}

export async function startFakeGoogle({ projectId = 'gr-test', apiKey = 'test-api-key', serviceAccounts = [], enumerationProtection = true } = {}) {
  const sign = generateKeyPairSync('rsa', { modulusLength: 2048 }), kid = randomBytes(10).toString('hex');
  const certPem = selfSignedCert(sign.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const users = new Map(), byEmail = new Map(), refresh = new Map(), outbox = [], tokens = new Set(), docs = new Map();
  const saKeys = new Map(serviceAccounts.map(sa => [sa.client_email, createPublicKey(sa.private_key)]));
  const st = { now: () => Date.now(), calls: [], down: false, latencyMs: 0, docN: 0 };
  const hash = pw => { const salt = randomBytes(16); return { salt, h: scryptSync(pw, salt, 32) }; };
  const pwOk = (u, pw) => { const h = scryptSync(String(pw), u.pw.salt, 32); return timingSafeEqual(h, u.pw.h); };
  const idToken = (u, { expired = false } = {}) => {
    const iat = Math.floor(st.now() / 1000) - (expired ? 7200 : 0);
    const head = b64({ alg: 'RS256', kid, typ: 'JWT' }), body = b64({ iss: 'https://securetoken.google.com/' + projectId, aud: projectId, auth_time: u.authTime, user_id: u.uid, sub: u.uid, iat, exp: iat + 3600, email: u.email, email_verified: u.verified, firebase: { identities: { email: [u.email] }, sign_in_provider: 'password' } });
    return `${head}.${body}.${createSign('RSA-SHA256').update(head + '.' + body).sign(sign.privateKey).toString('base64url')}`;
  };
  const session = u => { const rt = randomBytes(24).toString('base64url'); refresh.set(rt, { uid: u.uid, at: st.now() }); return { idToken: idToken(u), refreshToken: rt, expiresIn: '3600', localId: u.uid, email: u.email }; };
  const err = (res, code, message, status = 400) => send(res, status, { error: { code: status, message, errors: [{ message, domain: 'global', reason: 'invalid' }] } });
  const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };
  const decodeTok = t => { try { const [h, p, s] = String(t).split('.'); if (!createVerify('RSA-SHA256').update(h + '.' + p).verify(sign.publicKey, Buffer.from(s, 'base64url'))) return null; const c = JSON.parse(Buffer.from(p, 'base64url')); return c.exp > st.now() / 1000 ? c : null; } catch (e) { return null; } };
  const readBody = req => new Promise(r => { const b = []; req.on('data', c => b.push(c)); req.on('end', () => r(Buffer.concat(b).toString('utf8'))); });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE' }); res.end(); return; }
    if (st.latencyMs) await new Promise(r => setTimeout(r, st.latencyMs));
    if (st.down) { res.destroy(); return; }
    const raw = await readBody(req); let body = {}; try { body = raw ? (req.headers['content-type'] || '').includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)) : {}; } catch (e) { return err(res, 400, 'INVALID_JSON'); }
    st.calls.push(`${req.method} ${p}`);
    // ---------- test controls ----------
    if (p === '/_outbox') return send(res, 200, outbox.filter(m => !url.searchParams.get('email') || m.email === url.searchParams.get('email')));
    if (p === '/_click') { const m = outbox.find(x => x.oobCode === url.searchParams.get('oobCode')); if (!m || m.used || st.now() - m.at > 3600e3) return err(res, 400, 'INVALID_OOB_CODE'); const u = users.get(m.uid);
      if (m.type === 'VERIFY_EMAIL') { u.verified = true; m.used = true; return send(res, 200, { ok: true }); }
      if (m.type === 'PASSWORD_RESET') { const np = url.searchParams.get('newPassword') || ''; if (np.length < 6) return err(res, 400, 'WEAK_PASSWORD : Password should be at least 6 characters'); u.pw = hash(np); u.validSince = st.now(); m.used = true; return send(res, 200, { ok: true }); } }
    if (p === '/_mint') { const u = users.get(url.searchParams.get('uid')); return u ? send(res, 200, { idToken: idToken(u, { expired: url.searchParams.get('expired') === '1' }) }) : err(res, 404, 'USER_NOT_FOUND', 404); }
    // ---------- Google certificates and OAuth ----------
    if (p === '/certs') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=19800, must-revalidate, no-transform' }); res.end(JSON.stringify({ [kid]: certPem })); return; }
    if (p === '/oauth' && req.method === 'POST') {
      if (body.grant_type !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || typeof body.assertion !== 'string') return send(res, 400, { error: 'unsupported_grant_type' });
      const [h, pl, s] = body.assertion.split('.'); let c; try { c = JSON.parse(Buffer.from(pl, 'base64url')); } catch (e) { return send(res, 400, { error: 'invalid_grant' }); }
      const key = saKeys.get(c.iss), now = st.now() / 1000;
      if (!key || !createVerify('RSA-SHA256').update(h + '.' + pl).verify(key, Buffer.from(s, 'base64url'))) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      if (c.aud !== `http://127.0.0.1:${server.address().port}/oauth` || !(c.exp > now) || c.exp - c.iat > 3600 || !String(c.scope).includes('datastore')) return send(res, 400, { error: 'invalid_grant' });
      const tok = 'ya29.' + randomBytes(24).toString('base64url'); tokens.add(tok); return send(res, 200, { access_token: tok, expires_in: 3599, token_type: 'Bearer' });
    }
    // ---------- Firebase Authentication REST API (emulator paths) ----------
    if (p.startsWith('/identitytoolkit.googleapis.com/v1/') || p.startsWith('/securetoken.googleapis.com/v1/')) {
      if (url.searchParams.get('key') !== apiKey) return err(res, 400, 'API key not valid. Please pass a valid API key.');
      const op = p.split('/').pop();
      if (op === 'accounts:signUp') {
        const email = String(body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 400, 'INVALID_EMAIL');
        if (!body.password) return err(res, 400, 'MISSING_PASSWORD');
        if (String(body.password).length < 6) return err(res, 400, 'WEAK_PASSWORD : Password should be at least 6 characters');
        if (byEmail.has(email)) return err(res, 400, 'EMAIL_EXISTS');
        const u = { uid: randomBytes(14).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 28), email, pw: hash(String(body.password)), verified: false, authTime: Math.floor(st.now() / 1000), validSince: 0 };
        users.set(u.uid, u); byEmail.set(email, u); return send(res, 200, { kind: 'identitytoolkit#SignupNewUserResponse', ...session(u) });
      }
      if (op === 'accounts:signInWithPassword') {
        const u = byEmail.get(String(body.email || '').trim().toLowerCase());
        if (!u) return err(res, 400, enumerationProtection ? 'INVALID_LOGIN_CREDENTIALS' : 'EMAIL_NOT_FOUND');
        if (!pwOk(u, body.password)) return err(res, 400, enumerationProtection ? 'INVALID_LOGIN_CREDENTIALS' : 'INVALID_PASSWORD');
        u.authTime = Math.floor(st.now() / 1000); return send(res, 200, { kind: 'identitytoolkit#VerifyPasswordResponse', registered: true, ...session(u) });
      }
      if (op === 'token') {
        if (body.grant_type !== 'refresh_token') return err(res, 400, 'INVALID_GRANT_TYPE');
        const r = refresh.get(body.refresh_token); if (!r) return err(res, 400, 'INVALID_REFRESH_TOKEN');
        const u = users.get(r.uid); if (!u) return err(res, 400, 'USER_NOT_FOUND');
        if (u.validSince && r.at < u.validSince) return err(res, 400, 'TOKEN_EXPIRED');
        return send(res, 200, { access_token: idToken(u), expires_in: '3600', token_type: 'Bearer', refresh_token: body.refresh_token, id_token: idToken(u), user_id: u.uid, project_id: '1' });
      }
      if (op === 'accounts:lookup') { const c = decodeTok(body.idToken), u = c && users.get(c.sub); if (!u) return err(res, 400, 'INVALID_ID_TOKEN'); return send(res, 200, { kind: 'identitytoolkit#GetAccountInfoResponse', users: [{ localId: u.uid, email: u.email, emailVerified: u.verified, passwordUpdatedAt: 0, validSince: String(Math.floor(u.validSince / 1000)) }] }); }
      if (op === 'accounts:sendOobCode') {
        if (body.continueUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(body.continueUrl)) return err(res, 400, 'UNAUTHORIZED_DOMAIN : Domain not allowlisted by project');
        if (body.requestType === 'VERIFY_EMAIL') { const c = decodeTok(body.idToken), u = c && users.get(c.sub); if (!u) return err(res, 400, 'INVALID_ID_TOKEN'); outbox.push({ type: 'VERIFY_EMAIL', email: u.email, uid: u.uid, oobCode: randomBytes(12).toString('hex'), at: st.now(), continueUrl: body.continueUrl || null }); return send(res, 200, { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: u.email }); }
        if (body.requestType === 'PASSWORD_RESET') { const email = String(body.email || '').trim().toLowerCase(), u = byEmail.get(email);
          if (u) outbox.push({ type: 'PASSWORD_RESET', email, uid: u.uid, oobCode: randomBytes(12).toString('hex'), at: st.now(), continueUrl: body.continueUrl || null }); else if (!enumerationProtection) return err(res, 400, 'EMAIL_NOT_FOUND');
          return send(res, 200, { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email }); }
        return err(res, 400, 'INVALID_REQ_TYPE');
      }
      return err(res, 404, 'NOT_FOUND', 404);
    }
    // ---------- Cloud Firestore REST API ----------
    const pre = `/v1/projects/${projectId}/databases/(default)/documents`;
    if (p.startsWith(pre)) {
      const auth = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if (!auth || !tokens.has(auth[1])) return send(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } });
      if (p === pre + ':commit' && req.method === 'POST') {
        const writes = body.writes || [], name = n => n.slice(`projects/${projectId}/databases/(default)/documents/`.length);
        for (const w of writes) { const d = docs.get(name(w.update ? w.update.name : w.delete)), c = w.currentDocument;
          if (c && c.exists === false && d) return send(res, 409, { error: { code: 409, message: 'Document already exists', status: 'ALREADY_EXISTS' } });
          if (c && c.exists === true && !d) return send(res, 404, { error: { code: 404, message: 'No document to update', status: 'NOT_FOUND' } });
          if (c && c.updateTime && (!d || d.updateTime !== c.updateTime)) return send(res, 400, { error: { code: 400, message: 'the stored version does not match the required base version.', status: 'FAILED_PRECONDITION' } }); }
        const commitTime = new Date(st.now()).toISOString().replace('Z', String(++st.docN).padStart(6, '0') + 'Z'), results = [];
        for (const w of writes) { if (w.update) { const n = name(w.update.name), old = docs.get(n); docs.set(n, { fields: w.update.fields || {}, createTime: old ? old.createTime : commitTime, updateTime: commitTime }); results.push({ updateTime: commitTime }); } else { docs.delete(name(w.delete)); results.push({}); } }
        return send(res, 200, { writeResults: results, commitTime });
      }
      const rest = decodeURIComponent(p.slice(pre.length + 1)), segs = rest.split('/');
      if (req.method === 'GET' && segs.length % 2 === 0) { const d = docs.get(rest); return d ? send(res, 200, { name: `projects/${projectId}/databases/(default)/documents/${rest}`, ...d }) : send(res, 404, { error: { code: 404, message: `Document "${rest}" not found.`, status: 'NOT_FOUND' } }); }
      if (req.method === 'GET') { const list = [...docs].filter(([n]) => n.startsWith(rest + '/') && !n.slice(rest.length + 1).includes('/')).map(([n, d]) => ({ name: `projects/${projectId}/databases/(default)/documents/${n}`, ...d })); return send(res, 200, list.length ? { documents: list } : {}); }
      return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT' } });
    }
    send(res, 404, { error: 'not found' });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, projectId, apiKey, st, users, outbox, docs, certsUrl: base + '/certs', oauthUrl: base + '/oauth', firestoreUrl: base + '/v1', authEmulator: base,
    async click(oobCode, newPassword) { const r = await fetch(`${base}/_click?oobCode=${oobCode}${newPassword ? '&newPassword=' + encodeURIComponent(newPassword) : ''}`, { method: 'POST' }); return r.json(); },
    async mint(uid, expired = false) { const r = await fetch(`${base}/_mint?uid=${uid}${expired ? '&expired=1' : ''}`); return (await r.json()).idToken; },
    close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) };
}
