// GALACTIC RUSH V12 server — the two Google services the account server relies on, done the way Google documents them:
//  * Firebase ID tokens (sent by the game with every account request) are checked exactly as Firebase Authentication
//    documents for servers without the Admin SDK: an RS256 signature against Google's published securetoken
//    certificates (cached as long as Google's Cache-Control allows), then audience = project id, issuer =
//    https://securetoken.google.com/<project id>, expiry in the future, issue and sign-in times in the past, and a
//    non-empty subject, which is the account's uid.
//  * The service account reaches Firestore with Google's OAuth 2.0 flow for server-to-server applications: a JWT signed
//    with the service account's private key is exchanged at oauth2.googleapis.com for a one-hour access token.
// Node's built-in crypto does the RSA work. No credential, token or key is ever logged or sent to the game.
import { createPrivateKey, createSign, createVerify, X509Certificate } from 'node:crypto';

export const GOOGLE = Object.freeze({
  certs: 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  oauth: 'https://oauth2.googleapis.com/token',
  firestore: 'https://firestore.googleapis.com/v1',
});
export class AuthError extends Error { constructor(code, message) { super(message || code); this.code = code; } }
const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const CLOCK_SKEW_S = 30;

// verify(idToken) -> { uid, email, emailVerified, authTime, exp } or throws AuthError
// emulator: Firebase's Auth emulator issues unsigned tokens; only accepted when the server runs against the emulator
export function createTokenVerifier({ projectId, certsUrl = GOOGLE.certs, fetch = globalThis.fetch, now = () => Date.now(), emulator = false }) {
  if (!projectId) throw new Error('token verifier: project id missing');
  let keys = null, keysUntil = 0, pending = null;
  const loadKeys = (force = false) => {
    if (!force && keys && now() < keysUntil) return Promise.resolve(keys);
    if (!pending) pending = (async () => {
      const res = await fetch(certsUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new AuthError('certs-unavailable', `Google signing certificates unavailable (HTTP ${res.status})`);
      const json = await res.json(), next = new Map();
      for (const [kid, pem] of Object.entries(json)) next.set(kid, new X509Certificate(pem).publicKey);
      const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
      keys = next; keysUntil = now() + Math.min(m ? +m[1] * 1000 : 3600e3, 6 * 3600e3);
      return keys;
    })().finally(() => { pending = null; });
    return pending;
  };
  return async function verify(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new AuthError('malformed');
    const parts = token.split('.');
    if (parts.length !== 3) throw new AuthError('malformed');
    let header, p; try { header = b64json(parts[0]); p = b64json(parts[1]); } catch (e) { throw new AuthError('malformed'); }
    if (!header || !p || typeof p !== 'object') throw new AuthError('malformed');
    if (emulator && header.alg === 'none') { /* the Auth emulator's own tokens (local testing only) */ }
    else {
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new AuthError('algorithm');
      let key = (await loadKeys()).get(header.kid);
      if (!key) key = (await loadKeys(true)).get(header.kid); // Google rotated its keys: fetch them again once
      if (!key) throw new AuthError('unknown-key');
      const ok = createVerify('RSA-SHA256').update(parts[0] + '.' + parts[1]).verify(key, Buffer.from(parts[2], 'base64url'));
      if (!ok) throw new AuthError('signature');
    }
    const t = now() / 1000;
    if (p.aud !== projectId) throw new AuthError('audience');
    if (p.iss !== 'https://securetoken.google.com/' + projectId) throw new AuthError('issuer');
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) throw new AuthError('subject');
    if (!Number.isFinite(p.exp) || p.exp <= t) throw new AuthError('expired');
    if (!Number.isFinite(p.iat) || p.iat > t + CLOCK_SKEW_S) throw new AuthError('issued-in-future');
    if (!Number.isFinite(p.auth_time) || p.auth_time > t + CLOCK_SKEW_S) throw new AuthError('auth-time');
    return { uid: p.sub, email: typeof p.email === 'string' ? p.email : null, emailVerified: p.email_verified === true, authTime: p.auth_time, exp: p.exp };
  };
}

// the service account's credentials: the JSON key file's content (as JSON text or base64 of it)
export function parseServiceAccount(text) {
  if (!text) return null;
  let raw = String(text).trim(); if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  let c; try { c = JSON.parse(raw); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the whole key file, or its base64)'); }
  if (c.type !== 'service_account' || typeof c.client_email !== 'string' || typeof c.private_key !== 'string' || typeof c.project_id !== 'string') throw new Error('FIREBASE_SERVICE_ACCOUNT is not a service account key (type, client_email, private_key, project_id)');
  try { createPrivateKey(c.private_key); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT: the private key cannot be read'); }
  return { clientEmail: c.client_email, privateKey: c.private_key, keyId: c.private_key_id || undefined, projectId: c.project_id };
}

// accessToken() -> a cached OAuth access token for the given scope
export function createServiceAuth({ credentials, tokenUrl = GOOGLE.oauth, scope = 'https://www.googleapis.com/auth/datastore', fetch = globalThis.fetch, now = () => Date.now() }) {
  const key = createPrivateKey(credentials.privateKey);
  let token = null, until = 0, pending = null;
  return function accessToken() {
    if (token && now() < until - 120e3) return Promise.resolve(token);
    if (!pending) pending = (async () => {
      const iat = Math.floor(now() / 1000), head = b64url({ alg: 'RS256', typ: 'JWT', ...(credentials.keyId ? { kid: credentials.keyId } : {}) });
      const body = b64url({ iss: credentials.clientEmail, scope, aud: tokenUrl, iat, exp: iat + 3600 });
      const sig = createSign('RSA-SHA256').update(head + '.' + body).sign(key).toString('base64url');
      const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }).toString(), signal: AbortSignal.timeout(15000) });
      let j = {}; try { j = await res.json(); } catch (e) { /* no body */ }
      if (!res.ok || typeof j.access_token !== 'string') throw new Error(`service account sign-in refused (HTTP ${res.status}${j.error ? ', ' + j.error : ''})`);
      token = j.access_token; until = now() + (Number(j.expires_in) || 3600) * 1000;
      return token;
    })().finally(() => { pending = null; });
    return pending;
  };
}
