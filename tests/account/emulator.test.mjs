// GALACTIC RUSH V12 — the account system against Firebase's own emulators (Authentication and Cloud Firestore),
// run in CI by .github/workflows/v12-checks.yml:
//   firebase emulators:exec --only auth,firestore --project demo-galactic-rush "node --test tests/account/emulator.test.mjs"
// The game's sign-in client and the account server talk to the emulators exactly as they talk to Firebase (same REST
// API; the emulators accept the project's demo id and issue unsigned tokens, which the server accepts only in
// emulator mode). Checks: registration, the verification email, log-in, the account server's careers stored in
// Firestore, a race paid once, password reset ending old sessions, and that the security rules keep browsers out of
// the database. Skipped when the emulators are not running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseAuth } from '../../src/account/firebase.js';
import { startServer } from '../../server/index.mjs';
import { FirestoreDb } from '../../server/account/firestore.mjs';
import { minLap } from '../../src/account/rules.js';
import { getTrack } from '../../src/sim/tracks.js';

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST, STORE = process.env.FIRESTORE_EMULATOR_HOST, PROJECT = process.env.GCLOUD_PROJECT || 'demo-galactic-rush';
const skip = !AUTH || !STORE ? 'the Firebase emulators are not running (see the header)' : false;
const silent = { debug() {}, info() {}, warn() {}, error: (...a) => console.error(...a) };
const PW = 'Emu-only-' + Math.random().toString(36).slice(2, 9) + '5', PW2 = 'Emu-new-' + Math.random().toString(36).slice(2, 9) + '8';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const oob = async (email, type) => { const r = await (await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json(); return (r.oobCodes || []).filter(c => c.email === email && c.requestType === type).at(-1); };

test('accounts against the Firebase emulators: sign-up, verification, careers in Firestore, races, reset, security rules', { skip, timeout: 240000 }, async () => {
  const auth = new FirebaseAuth({ apiKey: 'demo-api-key', emulator: `http://${AUTH}` }), email = `emu.${Date.now().toString(36)}@example.test`;
  const srv = startServer({ PORT: '0', HOST: '127.0.0.1', TOKEN_SECRET: 'emulator-test-secret-0123456789abcdef', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_AUTH_EMULATOR_HOST: AUTH, FIRESTORE_EMULATOR_HOST: STORE }, { log: silent });
  const base = `http://127.0.0.1:${await srv.ready}`;
  const api = (path, tok, method = 'GET', body) => fetch(base + path, { method, headers: { authorization: 'Bearer ' + tok, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, ...(await r.json()) }));
  try {
    const s = await auth.signUp(email, PW);
    await assert.rejects(auth.signUp(email, PW), e => e.code === 'EMAIL_EXISTS', 'one account per address');
    await assert.rejects(auth.signIn(email, PW + 'x'), e => /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(e.code), 'a wrong password is refused');
    assert.equal((await api('/v12/account', s.idToken)).verified, false);
    assert.equal((await api('/v12/account/start', s.idToken, 'POST', {})).code, 'verify-email');
    await auth.sendVerification(s.idToken); const v = await oob(email, 'VERIFY_EMAIL'); assert.ok(v, 'the verification email went out');
    await fetch(v.oobLink); // the player opens the link
    const s2 = await auth.refresh(s.refreshToken);
    const st = await api('/v12/account/start', s2.idToken, 'POST', {}); assert.equal(st.ok, true, JSON.stringify(st));
    // a race on the shortest course, paid once by the server
    const course = ['spire', 'foundry', 'belt'].map(id => [id, getTrack(id).length]).sort((a, b) => a[1] - b[1])[0], lap = minLap(course[1]);
    const t = await api('/v12/race/start', s2.idToken, 'POST', { mode: 'quick', track: course[0], diff: 'rookie', laps: 1, ship: 'kestrel', field: 6, handling: 'relaxed' }); assert.equal(t.ok, true, JSON.stringify(t));
    await sleep(lap * 1000 + 500);
    const f = await api('/v12/race/finish', s2.idToken, 'POST', { ticket: t.ticket, place: 2, time: lap * 1.6, bestLap: lap * 1.6, order: [] }); assert.equal(f.ok, true, JSON.stringify(f));
    assert.equal((await api('/v12/race/finish', s2.idToken, 'POST', { ticket: t.ticket, place: 1, time: lap * 1.6, bestLap: lap * 1.6 })).repeated, true);
    // stored in Firestore, read back through the database directly
    const db = new FirestoreDb({ projectId: PROJECT, emulator: STORE }), doc = await db.get(`players/${s.uid}`);
    assert.ok(doc.exists); assert.equal(JSON.parse(doc.data.profile).wallet.CR, f.credits, 'the payout is in Firestore');
    // the security rules keep browsers out of the database (a signed-in user's own token, not the server's)
    const direct = await fetch(`http://${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/players/${s.uid}`, { headers: { authorization: 'Bearer ' + s2.idToken } });
    assert.equal(direct.status, 403, 'a browser cannot read even its own account document');
    const write = await fetch(`http://${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/players/${s.uid}?updateMask.fieldPaths=rev`, { method: 'PATCH', headers: { authorization: 'Bearer ' + s2.idToken, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { rev: { integerValue: '999' } } }) });
    assert.equal(write.status, 403, 'nor write to it');
    // password reset: a link by email, the new password works, the old one does not
    await auth.sendReset(email); const r = await oob(email, 'PASSWORD_RESET'); assert.ok(r, 'the reset email went out');
    await auth.sendReset('nobody.' + email); // an unknown address gets the same quiet answer
    const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: r.oobCode, newPassword: PW2 }) });
    assert.equal(res.status, 200, 'reset applied');
    await assert.rejects(auth.signIn(email, PW), e => /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(e.code), 'the old password no longer works');
    const s3 = await auth.signIn(email, PW2); assert.equal((await api('/v12/account', s3.idToken)).view.profile.wallet.CR, f.credits, 'the career is all there');
  } finally { await srv.close(); }
});
