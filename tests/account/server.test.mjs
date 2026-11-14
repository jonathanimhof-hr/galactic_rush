// GALACTIC RUSH V12 — the account server: Firebase ID token checks, the service account's Firestore access, the
// accounts' authoritative careers (operations, imports, race tickets, records, ghosts, settings, tournament rewards,
// two devices at once) and the HTTP API (sign-in required, verified email, CORS, limits). Google's services are the
// local stand-in in fakegoogle.mjs; every key is generated for the test run. Run: npm run test:accounts
import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGoogle, testServiceAccount } from './fakegoogle.mjs';
import { createTokenVerifier, createServiceAuth, parseServiceAccount } from '../../server/account/google.mjs';
import { FirestoreDb, MemoryDb, DbConflict, encode, decode } from '../../server/account/firestore.mjs';
import { PlayerService } from '../../server/account/players.mjs';
import { startServer } from '../../server/index.mjs';
import { FirebaseAuth } from '../../src/account/firebase.js';
import { Progression } from '../../src/progress/index.js';
import { MemoryStorage } from '../../src/progress/store.js';
import { createProfile } from '../../src/progress/profile.js';
import { progressDigest, recordKey, minLap } from '../../src/account/rules.js';
import { getTrack } from '../../src/sim/tracks.js';

const PROJECT = 'gr-test', SA = testServiceAccount(PROJECT);
const silent = { debug() {}, info() {}, warn() {}, error() {} };
let G; // the Google stand-in, shared by all tests
test.before(async () => { G = await startFakeGoogle({ projectId: PROJECT, serviceAccounts: [SA] }); });
test.after(async () => { await G.close(); });
const auth = () => new FirebaseAuth({ apiKey: G.apiKey, emulator: G.authEmulator });
let n = 0; const email = () => `pilot${++n}.${Date.now().toString(36)}@example.test`;
const PW = 'Test-only-pw-' + Math.random().toString(36).slice(2, 8) + '9'; // generated for this run, never a real password

// a career as the game makes it: races really run through the game's own Progression
function playedCareer(races = 4, { upgrade = true } = {}) {
  let t = 1_700_000_000_000; const P = new Progression(new MemoryStorage(), { now: () => (t += 60000) });
  for (let k = 0; k < races; k++) { const r = P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', place: 1 + (k % 3), field: 6, time: 120, record: false }); assert.ok(r.ok, 'race paid'); }
  if (upgrade) assert.ok(P.buyUpgrade('kestrel', 'engine', 0).ok, 'upgrade bought');
  return JSON.parse(JSON.stringify(P.profile));
}

test('Firebase ID tokens: genuine ones pass; expired, foreign, tampered, unsigned and malformed ones are refused', async () => {
  const s = await auth().signUp(email(), PW), verify = createTokenVerifier({ projectId: PROJECT, certsUrl: G.certsUrl });
  const who = await verify(s.idToken);
  assert.equal(who.uid, s.uid); assert.equal(who.emailVerified, false);
  const refuse = async (tok, code, v = verify) => { await assert.rejects(v(tok), e => e.code === code, code); };
  await refuse(await G.mint(s.uid, true), 'expired');
  await refuse(s.idToken, 'audience', createTokenVerifier({ projectId: 'another-project', certsUrl: G.certsUrl }));
  const [h, p, sig] = s.idToken.split('.'), body = JSON.parse(Buffer.from(p, 'base64url'));
  await refuse(`${h}.${Buffer.from(JSON.stringify({ ...body, sub: 'someone-else' })).toString('base64url')}.${sig}`, 'signature');
  await refuse(`${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`, 'algorithm');
  await refuse(`${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'not-a-google-key' })).toString('base64url')}.${p}.${sig}`, 'unknown-key');
  await refuse('not-a-token', 'malformed'); await refuse('a.b.c.d.e.f.g.h.i.j.k.l.m', 'malformed'); await refuse(null, 'malformed');
  const certCalls = G.st.calls.filter(c => c.endsWith('/certs')).length;
  for (let k = 0; k < 5; k++) await verify(s.idToken);
  assert.equal(G.st.calls.filter(c => c.endsWith('/certs')).length, certCalls, 'Google\'s certificates are cached as Cache-Control allows');
});

test('service account: a signed assertion buys an access token; Firestore reads and conditional writes', async () => {
  for (const text of [JSON.stringify(SA), Buffer.from(JSON.stringify(SA)).toString('base64')]) assert.equal(parseServiceAccount(text).clientEmail, SA.client_email);
  assert.throws(() => parseServiceAccount('{not json'), /not valid JSON/); assert.throws(() => parseServiceAccount(JSON.stringify({ type: 'user' })), /not a service account/);
  const db = new FirestoreDb({ projectId: PROJECT, accessToken: createServiceAuth({ credentials: parseServiceAccount(JSON.stringify(SA)), tokenUrl: G.oauthUrl }), baseUrl: G.firestoreUrl });
  const doc = 'players/test-doc-' + n++;
  assert.deepEqual(await db.get(doc), { exists: false, data: null, version: null });
  const value = { s: 'Grüße ✓', i: 42, f: 1.5, b: true, z: null, a: [1, 'x', { y: 2 }], m: { deep: { er: -7 } } };
  await db.commit([{ set: doc, data: value, ifVersion: null }]);
  await assert.rejects(db.commit([{ set: doc, data: { s: 'again' }, ifVersion: null }]), DbConflict, 'creating twice conflicts');
  const got = await db.get(doc); assert.deepEqual(got.data, value); assert.ok(got.version);
  await db.commit([{ set: doc, data: { ...value, i: 43 }, ifVersion: got.version }]);
  await assert.rejects(db.commit([{ set: doc, data: { i: 44 }, ifVersion: got.version }]), DbConflict, 'a stale version conflicts');
  await db.commit([{ set: doc + '/ghosts/spire', data: { lap: 30 } }, { set: doc + '/ghosts/belt~relaxed', data: { lap: 40 } }]);
  assert.deepEqual((await db.list(doc + '/ghosts')).map(d => d.id).sort(), ['belt~relaxed', 'spire']);
  await db.commit([{ remove: doc + '/ghosts/spire' }]); assert.equal((await db.list(doc + '/ghosts')).length, 1);
  for (const v of [0, -3, 2 ** 40, 0.1, '', [], {}]) assert.deepEqual(decode(encode(v)), v);
  const stranger = testServiceAccount(PROJECT);
  await assert.rejects(new FirestoreDb({ projectId: PROJECT, accessToken: createServiceAuth({ credentials: parseServiceAccount(JSON.stringify(stranger)), tokenUrl: G.oauthUrl }), baseUrl: G.firestoreUrl }).get(doc), /sign-in refused/, 'an unknown service account gets no token');
});

// ---------- the authoritative career ----------
function service(clock = { t: 1_800_000_000_000 }, db = new MemoryDb()) { return { svc: new PlayerService({ db, now: () => clock.t, log: silent }), db, clock }; }

test('accounts: a fresh career, career operations applied once, refusals change nothing', async () => {
  const { svc } = service(), uid = 'uidA1';
  const a = await svc.start(uid); assert.equal(a.ok, true); assert.equal(a.view.rev, 1); assert.equal(a.view.profile.wallet.CR, 0);
  assert.equal((await svc.start(uid)).already, true, 'starting again changes nothing');
  const poor = await svc.op(uid, { opId: 'op-0000001', op: 'buyUpgrade', args: { ship: 'kestrel', cat: 'engine', expectLevel: 0 } });
  assert.equal(poor.ok, false); assert.equal(poor.code, 'funds'); assert.equal(poor.view.profile.ships.kestrel.upgrades.engine, 0);
  assert.equal((await svc.op(uid, { opId: 'op-0000002', op: 'grantCredits', args: { amount: 1e6 } })).code, 'bad-request', 'only the game\'s own operations exist');
  assert.equal((await svc.op(uid, { opId: 'x', op: 'buyItem', args: { id: 'a' } })).code, 'bad-request', 'operations need an id');
  // the career after a few won races (imported), then an upgrade bought twice with the same operation id
  const imp = await service().svc; const uid2 = 'uidA2', career = playedCareer(6, { upgrade: false });
  assert.equal((await imp.importCareer(uid2, { importId: 'imp-00000001', profile: career })).ok, true);
  const before = (await imp.load(uid2)).view.profile.wallet.CR;
  const buy = await imp.op(uid2, { opId: 'op-0000003', op: 'buyUpgrade', args: { ship: 'kestrel', cat: 'engine', expectLevel: 0 } });
  assert.equal(buy.ok, true); assert.equal(buy.view.profile.ships.kestrel.upgrades.engine, 1); assert.equal(buy.view.profile.wallet.CR, before - buy.cost);
  const again = await imp.op(uid2, { opId: 'op-0000003', op: 'buyUpgrade', args: { ship: 'kestrel', cat: 'engine', expectLevel: 0 } });
  assert.equal(again.repeated, true); assert.equal(again.view.profile.ships.kestrel.upgrades.engine, 1, 'a retried request is not applied twice'); assert.equal(again.view.profile.wallet.CR, before - buy.cost);
  const stale = await imp.op(uid2, { opId: 'op-0000004', op: 'buyUpgrade', args: { ship: 'kestrel', cat: 'engine', expectLevel: 0 } });
  assert.equal(stale.ok, false); assert.equal(stale.code, 'stale', 'a purchase made from an outdated screen is refused');
});

test('accounts: a device\'s career is checked before it becomes the account\'s; imports are idempotent and never merge', async () => {
  const { svc, db } = service(), uid = 'uidB1', career = playedCareer(5);
  const ok = await svc.importCareer(uid, { importId: 'imp-00000010', profile: career, records: { spire: { lap: 31.2, ship: 'kestrel' }, 'nexus@12~relaxed': { lap: 44.5, ship: 'wisp' }, 'mars': { lap: 1 } }, settings: { handling: 'classic', preset: 'ultra', sens: 1.2, evil: '<script>' }, name: 'ACE' });
  assert.equal(ok.ok, true); assert.equal(ok.digest, progressDigest(ok.view.profile, ok.view.records), 'the server stored exactly the career it checked');
  assert.equal(progressDigest(career, { spire: { lap: 31.2 }, 'nexus@12~relaxed': { lap: 44.5 } }), ok.digest, 'and that is the device\'s career');
  assert.deepEqual(Object.keys(ok.view.records).sort(), ['nexus@12~relaxed', 'spire'], 'unknown course keys are dropped');
  assert.deepEqual(ok.view.settings, { handling: 'classic', sens: 1.2 }, 'only settings that follow the player, with valid values');
  const same = await svc.importCareer(uid, { importId: 'imp-00000010', profile: career });
  assert.equal(same.already, true); assert.equal(same.view.rev, ok.view.rev, 'the same import again changes nothing');
  const other = await svc.importCareer(uid, { importId: 'imp-00000011', profile: playedCareer(2) });
  assert.equal(other.code, 'account-has-career'); assert.equal(other.account.races, 5, 'the player is shown the account\'s career to compare');
  assert.equal((await svc.importCareer(uid, { importId: 'imp-00000011', profile: playedCareer(2), replace: true, expectRev: other.rev - 1 })).code, 'stale');
  const rep = await svc.importCareer(uid, { importId: 'imp-00000011', profile: playedCareer(2), replace: true, expectRev: other.rev });
  assert.equal(rep.ok, true); assert.equal(rep.view.profile.stats.races, 2, 'replaced as a whole, never merged');
  const backups = await db.list(`players/${uid}/backups`); assert.equal(backups.length, 1); assert.equal(JSON.parse(JSON.parse(backups[0].data.doc).profile).stats.races, 5, 'the replaced career is kept as a backup');
  // edited careers are refused, the account keeps what it had
  const edits = {
    'a raised balance': c => { c.wallet.CR += 50000; },
    'free upgrades': c => { c.ships.wisp.upgrades.engine = 5; },
    'invented races': c => { c.stats.races += 40; },
    'a newer game version': c => { c.version = 99; },
  };
  for (const [what, edit] of Object.entries(edits)) {
    const c = playedCareer(3); edit(c);
    const r = await svc.importCareer('uidB2', { importId: 'imp-0000002' + what.length, profile: c });
    assert.equal(r.ok, false, what); assert.equal(r.code, 'career-invalid', what);
  }
  assert.equal((await svc.importCareer('uidB2', { importId: 'imp-00000030', profile: 'garbage' })).code, 'career-invalid');
  assert.equal((await svc.load('uidB2')).exists, false, 'nothing was stored for refused careers');
  assert.equal((await svc.importCareer('uidB3', { importId: 'imp-00000031', profile: createProfile(1) })).ok, true, 'a career with no progress is fine');
});

test('accounts: races are paid once against tickets, with time checks; records and ghosts follow; championships in order', async () => {
  const { svc, clock } = service(), uid = 'uidC1';
  await svc.start(uid);
  const spire = getTrack('spire').length, lap = minLap(spire);
  const t1 = await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', field: 6, handling: 'relaxed' });
  assert.equal(t1.ok, true);
  assert.equal((await svc.raceFinish(uid, { ticket: t1.ticket, place: 1, time: 100, bestLap: 31 })).code, 'implausible', 'a result reported sooner than the race can be flown');
  const t2 = await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', field: 6, handling: 'relaxed' });
  clock.t += 110e3;
  assert.equal((await svc.raceFinish(uid, { ticket: t2.ticket, place: 1, time: lap * 3 * 0.8, bestLap: lap })).code, 'implausible', 'a race time below what the course allows');
  const t3 = await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', field: 6, handling: 'relaxed' });
  clock.t += 110e3;
  const won = await svc.raceFinish(uid, { ticket: t3.ticket, place: 1, time: 105.4, bestLap: 33.25 });
  assert.equal(won.ok, true); assert.ok(won.credits > 0); assert.deepEqual(won.record, { key: recordKey('spire', 'relaxed'), lap: 33.25 });
  assert.equal(won.view.profile.wallet.CR, won.credits); assert.equal(won.view.records['spire~relaxed'].lap, 33.25);
  const twice = await svc.raceFinish(uid, { ticket: t3.ticket, place: 1, time: 105.4, bestLap: 33.25 });
  assert.equal(twice.repeated, true); assert.equal(twice.view.profile.wallet.CR, won.credits, 'one payout per ticket');
  assert.equal((await svc.raceFinish(uid, { ticket: 'zzzz-zzzz-zz', place: 1, time: 105, bestLap: 33 })).code, 'no-ticket');
  const t4 = await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', field: 6, handling: 'relaxed' });
  clock.t += 110e3; assert.equal((await svc.raceFinish(uid, { ticket: t4.ticket, place: 7, time: 105, bestLap: 33 })).code, 'bad-race', 'place outside the field');
  const t5 = await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'ace', laps: 3, ship: 'kestrel', field: 6, handling: 'relaxed' });
  clock.t += 4 * 3600e3; assert.equal((await svc.raceFinish(uid, { ticket: t5.ticket, place: 1, time: 105, bestLap: 33 })).code, 'ticket-expired');
  assert.equal((await svc.raceStart(uid, { mode: 'quick', track: 'mars', diff: 'ace', laps: 3, ship: 'kestrel', field: 6 })).code, 'bad-race');
  assert.equal((await svc.raceStart(uid, { mode: 'quick', track: 'spire', diff: 'godlike', laps: 3, ship: 'kestrel', field: 6 })).code, 'bad-race');
  // ghosts: only for the record lap
  const frames = Array.from({ length: 670 }, (_, k) => [k, 1, 2, 0, 0, 0, 1]);
  assert.equal((await svc.putGhost(uid, 'spire~relaxed', { lap: 33.25, ship: 'kestrel', f: frames })).ok, true);
  assert.equal((await svc.putGhost(uid, 'spire~relaxed', { lap: 34, ship: 'kestrel', f: frames })).code, 'not-record');
  assert.equal((await svc.putGhost(uid, 'spire~relaxed', { lap: 33.25, ship: 'kestrel', f: [[1, 2]] })).code, 'bad-ghost');
  assert.equal((await svc.getGhost(uid, 'spire~relaxed')).ghost.f.length, 670);
  assert.deepEqual((await svc.listGhosts(uid)).ghosts.map(g => g.key), ['spire~relaxed']);
  // a championship: the round's course only, in order
  const runId = 'champ-' + clock.t.toString(36) + '-abc123';
  const st = await svc.op(uid, { opId: 'op-run-0001', op: 'startRun', args: { diff: 'rookie', laps: 1, ship: 'kestrel', runId } });
  assert.equal(st.ok, true); assert.equal(st.run.runId, runId, 'the game\'s run id is the account\'s');
  const first = st.view.profile.championships.active.tracks[0], wrong = first === 'belt' ? 'spire' : 'belt';
  assert.equal((await svc.raceStart(uid, { mode: 'champ', track: wrong, diff: 'rookie', laps: 1, ship: 'kestrel', field: 6, runId })).code, 'bad-run');
  const ct = await svc.raceStart(uid, { mode: 'champ', track: first, diff: 'rookie', laps: 1, ship: 'kestrel', field: 6, runId });
  assert.equal(ct.ok, true, 'the next round\'s course');
});

test('accounts: settings and pilot name, tournament rewards paid once, an unreadable stored career is never replaced', async () => {
  const { svc, db } = service(), uid = 'uidD1';
  await svc.start(uid);
  assert.deepEqual((await svc.putSettings(uid, { handling: 'classic', fov: 75, resScale: 0.5, invert: 'maybe' })).view.settings, { handling: 'classic', fov: 75 });
  assert.equal((await svc.putName(uid, '<b>bad</b>')).code, 'bad-name'); assert.equal((await svc.putName(uid, 'Nova Ace')).view.name, 'Nova Ace');
  const reward = { lines: [{ name: 'Tournament win', CR: 2500 }, { name: 'Victory tokens', ST: 3 }] };
  const p1 = await svc.creditTournament(uid, 't0123456789', reward); assert.equal(p1.ok, true); assert.equal(p1.view.profile.wallet.CR, 2500);
  const p2 = await svc.creditTournament(uid, 't0123456789', reward); assert.equal(p2.ok, false); assert.equal(p2.code, 'duplicate');
  assert.equal((await svc.load(uid)).view.profile.wallet.CR, 2500, 'paid once');
  const d = await db.get(`players/${uid}`); await db.commit([{ set: `players/${uid}`, data: { ...d.data, profile: '{"broken":' }, ifVersion: d.version }]);
  await assert.rejects(svc.op(uid, { opId: 'op-0000009', op: 'selectShip', args: { ship: 'wisp' } }), e => e.code === 'career-unreadable');
  assert.equal((await db.get(`players/${uid}`)).data.profile, '{"broken":', 'left as it was for repair, not reset');
});

test('accounts: two devices (and two server processes) changing one account at once never lose a change', async () => {
  const slow = new MemoryDb(), get = slow.get.bind(slow); slow.get = async p => { const r = await get(p); await new Promise(res => setTimeout(res, 5)); return r; }; // reads that overlap
  const clock = { t: 1_800_000_000_000 }, A = new PlayerService({ db: slow, now: () => clock.t, log: silent }), B = new PlayerService({ db: slow, now: () => clock.t, log: silent }), uid = 'uidE1';
  assert.equal((await A.importCareer(uid, { importId: 'imp-00000040', profile: playedCareer(14, { upgrade: false }) })).ok, true);
  const cr = (await A.load(uid)).view.profile.wallet.CR;
  const res = await Promise.all([
    A.op(uid, { opId: 'op-dev-a-01', op: 'buyUpgrade', args: { ship: 'kestrel', cat: 'engine', expectLevel: 0 } }),
    B.op(uid, { opId: 'op-dev-b-01', op: 'buyUpgrade', args: { ship: 'lancer', cat: 'boost', expectLevel: 0 } }),
    B.putSettings(uid, { handling: 'classic' }),
    A.creditTournament(uid, 't00000000ab', { lines: [{ name: 'Win', CR: 1000 }] }),
  ]);
  assert.ok(res.every(r => r.ok), 'all four applied');
  const v = (await A.load(uid)).view;
  assert.equal(v.profile.ships.kestrel.upgrades.engine, 1); assert.equal(v.profile.ships.lancer.upgrades.boost, 1); assert.equal(v.settings.handling, 'classic');
  assert.equal(v.profile.wallet.CR, cr - res[0].cost - res[1].cost + 1000, 'every change counted exactly once');
  assert.equal(v.rev, 1 + 4, 'four revisions after the import');
});

// ---------- the HTTP API ----------
async function apiServer(env = {}) {
  const db = new FirestoreDb({ projectId: PROJECT, accessToken: createServiceAuth({ credentials: parseServiceAccount(JSON.stringify(SA)), tokenUrl: G.oauthUrl }), baseUrl: G.firestoreUrl });
  const srv = startServer({ PORT: '0', HOST: '127.0.0.1', TOKEN_SECRET: 'account-api-test-secret-0123456789', ALLOWED_ORIGINS: 'https://game.example', ...env },
    { log: silent, accounts: { verify: createTokenVerifier({ projectId: PROJECT, certsUrl: G.certsUrl }), players: new PlayerService({ db, log: silent }) } });
  const port = await srv.ready; return { srv, base: `http://127.0.0.1:${port}` };
}
const call = (base, path, { token, method = 'GET', body, origin = 'https://game.example', type = 'application/json' } = {}) =>
  fetch(base + path, { method, headers: { ...(origin ? { origin } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'content-type': type } : {}) }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
    .then(async r => ({ status: r.status, headers: r.headers, j: await r.json().catch(() => null) }));

test('account API: sign-in required, verified email for careers, CORS for the game\'s site only, size and rate limits', async () => {
  const { srv, base } = await apiServer();
  try {
    const health = await (await fetch(base + '/health')).json(); assert.equal(health.version, '12.0.0'); assert.equal(health.protocol, 4); assert.equal(health.accounts, 'on');
    const pre = await fetch(base + '/v12/account', { method: 'OPTIONS', headers: { origin: 'https://game.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'https://game.example'); assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    assert.equal((await call(base, '/v12/account', { origin: 'https://evil.example' })).status, 403, 'other websites are refused');
    assert.equal((await call(base, '/v12/account')).status, 401, 'no token, no account');
    assert.equal((await call(base, '/v12/account', { token: 'forged.token.value' })).status, 401);
    const fa = auth(), mail = email(), s = await fa.signUp(mail, PW);
    const g = await call(base, '/v12/account', { token: s.idToken }); assert.equal(g.status, 200); assert.equal(g.j.verified, false);
    const blocked = await call(base, '/v12/account/start', { token: s.idToken, method: 'POST', body: {} }); assert.equal(blocked.status, 403); assert.equal(blocked.j.code, 'verify-email');
    // the player opens the verification link, the game renews its token
    await fa.sendVerification(s.idToken); const mailItem = G.outbox.find(m => m.email === mail && m.type === 'VERIFY_EMAIL'); assert.ok(mailItem, 'verification email sent');
    await G.click(mailItem.oobCode); const s2 = await fa.refresh(s.refreshToken);
    const st = await call(base, '/v12/account/start', { token: s2.idToken, method: 'POST', body: {} }); assert.equal(st.status, 200); assert.equal(st.j.view.rev, 1);
    assert.equal((await call(base, '/v12/account', { token: await G.mint(s.uid, true) })).j.message, 'Your session expired. Log in again.');
    assert.equal((await call(base, '/v12/account/op', { token: s2.idToken, method: 'POST', body: 'x'.repeat(70000) })).status, 413);
    assert.equal((await call(base, '/v12/account/op', { token: s2.idToken, method: 'POST', body: '{"a":', type: 'application/json' })).status, 400);
    assert.equal((await call(base, '/v12/account/op', { token: s2.idToken, method: 'POST', body: 'a=1', type: 'application/x-www-form-urlencoded' })).status, 415);
    assert.equal((await call(base, '/v12/nothing', { token: s2.idToken })).status, 404);
    // the same account on a second device
    const other = await auth().signIn(mail, PW), seen = await call(base, '/v12/account', { token: other.idToken });
    assert.equal(seen.j.exists, true); assert.equal(seen.j.view.rev, 1);
    // flooding one account is slowed down
    let limited = 0; for (let k = 0; k < 90; k++) if ((await call(base, '/v12/account', { token: s2.idToken })).status === 429) limited++;
    assert.ok(limited > 0, 'rate limited');
  } finally { await srv.close(); }
});

test('account API: the server refuses to start in production without a service account, or with test-only settings', () => {
  const prod = { NODE_ENV: 'production', PORT: '0', TOKEN_SECRET: 'x'.repeat(40), ALLOWED_ORIGINS: 'https://game.example' };
  assert.throws(() => startServer({ ...prod, FIREBASE_PROJECT_ID: PROJECT }, { log: silent }), /FIREBASE_SERVICE_ACCOUNT/);
  assert.throws(() => startServer({ ...prod, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA), ACCOUNTS_DB: 'memory' }, { log: silent }), /local testing only/);
  assert.throws(() => startServer({ ...prod, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA), FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, { log: silent }), /local testing only/);
});
