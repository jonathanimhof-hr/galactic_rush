// GALACTIC RUSH V12 — online play with accounts: a signed-in pilot's session is linked to the account (verified ID
// token, verified email), a guest pilot plays exactly as before, a forged token links nothing, and when the tournament
// ends the server pays the signed-in pilot's reward into the account itself, once, from its own results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGoogle } from './fakegoogle.mjs';
import { createTokenVerifier } from '../../server/account/google.mjs';
import { MemoryDb } from '../../server/account/firestore.mjs';
import { PlayerService } from '../../server/account/players.mjs';
import { startServer } from '../../server/index.mjs';
import { LOBBY_RULES } from '../../server/lobby.mjs';
import { RACE_RULES } from '../../server/race.mjs';
import { FirebaseAuth } from '../../src/account/firebase.js';
import { C, S } from '../../src/mp/protocol.js';
import { Bot } from '../mp/bot.mjs';

const silent = { debug() {}, info() {}, warn() {}, error: (...a) => console.error(...a) }, SCALE = 16;
const FAST = { raceRules: { ...RACE_RULES, countdownMs: 1500, loadTimeoutMs: 8000, graceMs: 4000, inactiveMs: 8000 }, tournamentRules: { transitionMs: 2500 }, lobbyRules: { ...LOBBY_RULES, lostMemberMs: 3000, hostLostMs: 1500, idleLobbyMs: 20000, rematchMs: 20000 } };
const PW = 'Mp-test-only-' + Math.random().toString(36).slice(2, 8) + '1';

test('online: signed-in pilots are linked to their account and paid into it by the server, once; guests play as before', async () => {
  const G = await startFakeGoogle({ projectId: 'gr-mp' }), auth = new FirebaseAuth({ apiKey: G.apiKey, emulator: G.authEmulator });
  const s0 = await auth.signUp(`mp.${Date.now().toString(36)}@example.test`, PW); await auth.sendVerification(s0.idToken); await G.click(G.outbox.at(-1).oobCode);
  const s = await auth.refresh(s0.refreshToken), players = new PlayerService({ db: new MemoryDb(), log: silent }); await players.start(s.uid);
  const srv = startServer({ PORT: '0', HOST: '127.0.0.1', GR_TIME_SCALE: String(SCALE), TOKEN_SECRET: 'mp-account-test-secret-0123456789abcdef' }, { log: silent, hub: FAST, accounts: { verify: createTokenVerifier({ projectId: 'gr-mp', certsUrl: G.certsUrl }), players } });
  const port = await srv.ready, url = `ws://127.0.0.1:${port}/ws`;
  const a = new Bot({ url, name: 'ALPHA', speed: SCALE, skill: 0.95, auth: s.idToken }), b = new Bot({ url, name: 'BRAVO', speed: SCALE, skill: 0.6, ship: 'lancer' }), c = new Bot({ url, name: 'FORGER', speed: SCALE, auth: s.idToken.slice(0, -6) + 'AAAAAA' });
  try {
    for (const x of [a, b, c]) await x.connect();
    assert.equal((await a.waitFor(S.ACCOUNT)).linked, true, 'the signed-in pilot is linked');
    assert.equal((await c.waitFor(S.ACCOUNT)).linked, false, 'a forged token links nothing');
    assert.ok(!b.inbox.some(e => e.type === S.ACCOUNT), 'a guest is not asked about accounts');
    c.conn.close();
    const code = (await a.create()).lobby.code; assert.equal((await b.join(code)).t, S.LOBBY);
    for (const x of [a, b]) x.ready(true);
    await a.waitFor(S.LOBBY, m => m.lobby.members.length === 2 && m.lobby.members.every(x => x.ready)); a.send(C.START, {});
    const done = await a.waitFor(S.COMPLETE, () => true, 180000); await b.waitFor(S.COMPLETE, m => m.tid === done.tid, 10000);
    assert.equal(a.complete.paidTo, 'account', 'the signed-in pilot is told the server pays into the account'); assert.equal(b.complete.paidTo, null, 'the guest pays into its own career, as before');
    const paid = await a.waitFor(S.ACCOUNT, m => m.tid === done.tid, 15000); assert.equal(paid.paid, true);
    const rw = a.complete.reward, v = (await players.load(s.uid)).view.profile, cr = rw.lines.reduce((n, l) => n + (l.CR || 0), 0);
    assert.ok(cr > 0); assert.equal(v.wallet.CR, cr, 'the reward reached the account'); assert.ok(v.ledger.seen.includes('mp:' + done.tid));
    assert.equal((await players.creditTournament(s.uid, done.tid, rw)).code, 'duplicate', 'and is never paid twice');
  } finally { for (const x of [a, b, c]) try { x.close(); } catch (e) { /* closed */ } await srv.close(); await G.close(); }
});
