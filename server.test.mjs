// GALACTIC RUSH V8 — multiplayer integration tests: the real server (server/index.mjs) on a local port, and several real
// WebSocket clients at once, each flying the game's own race simulation through the game's own connection code
// (tests/mp/bot.mjs). Lobbies, whole tournaments, disconnections, a server restart, hostile messages, cheating clients
// and parallel lobbies. The server runs its race clock 16x (GR_TIME_SCALE, tests only) and shorter waits, so a
// five-lap race takes about 15 s. Needs the server's dependency: `npm install --prefix server` (ws).
// Run: npm run test:mp
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from '../../server/index.mjs';
import { RACE_RULES } from '../../server/race.mjs';
import { LOBBY_RULES } from '../../server/lobby.mjs';
import { HUB_RULES } from '../../server/hub.mjs';
import { tournamentRewards } from '../../src/mp/rewards.js';
import { C, S, MP, PROTOCOL } from '../../src/mp/protocol.js';
import { Bot, sleep } from './bot.mjs';

const WS = createRequire(new URL('../../server/package.json', import.meta.url))('ws'); // the server's own dependency
const SCALE = 16;
const FAST = {
  raceRules: { ...RACE_RULES, countdownMs: 1500, loadTimeoutMs: 8000, graceMs: 4000, inactiveMs: 8000 },
  tournamentRules: { transitionMs: 2500 },
  lobbyRules: { ...LOBBY_RULES, lostMemberMs: 3000, hostLostMs: 1500, idleLobbyMs: 20000, rematchMs: 20000 },
};
const silent = { debug() {}, info() {}, warn() {}, error(...a) { console.error(...a); } };
async function server(env = {}, hub = {}) {
  const srv = startServer({ PORT: '0', HOST: '127.0.0.1', GR_TIME_SCALE: String(SCALE), TOKEN_SECRET: 'integration-test-secret-0123456789abcdef', ...env }, { log: silent, hub: { ...FAST, ...hub } });
  const port = await srv.ready; return { srv, port, url: `ws://127.0.0.1:${port}/ws` };
}
const bots = [];
function bot(url, name, o = {}) { const b = new Bot({ url, name, speed: SCALE, ...o }); bots.push(b); return b; }
test.afterEach(() => { for (const b of bots.splice(0)) b.close(); });
async function lobbyOf(url, names, opts = {}) {
  const list = names.map((n, i) => bot(url, n, { ship: ['kestrel', 'lancer', 'wisp', 'halberd', 'corsair', 'kestrel'][i], skill: [0.95, 0.85, 0.7, 0.6, 0.5, 0.45][i], ...(opts.bot || {}) }));
  for (const b of list) await b.connect();
  const code = (await list[0].create(opts.lobby)).lobby.code;
  for (const b of list.slice(1)) { const r = await b.join(code); assert.equal(r.t, S.LOBBY, `${b.name} joined`); }
  return { list, code };
}
async function startTournament(list) {
  for (const b of list) b.ready(true);
  await list[0].waitFor(S.LOBBY, m => m.lobby.members.every(x => x.ready));
  list[0].send(C.START, {});
  return list[0].waitFor(S.PREPARE);
}
// raw socket for hostile-client tests
function raw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url, { headers }), msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d.toString())));
    ws.on('open', () => resolve({ ws, msgs, send: m => ws.send(typeof m === 'string' ? m : JSON.stringify(m)), closed: new Promise(r => ws.on('close', (code, reason) => r({ code, reason: reason.toString() }))) }));
    ws.on('unexpected-response', (req, res) => reject(Object.assign(new Error('refused'), { status: res.statusCode })));
    ws.on('error', reject);
  });
}
const until = async (fn, ms = 10000, what = 'condition') => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(25); } throw new Error('timed out waiting for ' + what); };

test('health check and the WebSocket endpoint', async () => {
  const { srv, port } = await server();
  try {
    const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(h.ok, true); assert.equal(h.protocol, PROTOCOL); assert.equal(h.version, '8.0.0'); assert.equal(h.lobbies, 0);
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
    await assert.rejects(raw(`ws://127.0.0.1:${port}/other`), e => e.status === 404);
  } finally { await srv.close(); }
});

test('lobbies: create, join by code, errors, unique names, ships, ready flags and leaving reach everyone', async () => {
  const { srv, url } = await server();
  try {
    const a = bot(url, 'ACE'), b = bot(url, 'ACE'), c = bot(url, 'BEE', { ship: 'wisp' });
    for (const x of [a, b, c]) await x.connect();
    assert.match(a.pid, /^p[0-9a-f]{12}$/); assert.notEqual(a.pid, b.pid);
    const L = (await a.create({ visibility: 'public' })).lobby;
    assert.match(L.code, /^[A-Z2-9]{5}$/); assert.equal(L.host, a.pid); assert.equal(L.members.length, 1);
    assert.equal((await b.join('ZZZZZ')).code, 'no-room');
    assert.equal((await b.join('12')).code, 'bad-code');
    const j = await b.join(L.code.toLowerCase().slice(0, 2) + '-' + L.code.slice(2));
    assert.equal(j.t, S.LOBBY); assert.deepEqual(j.lobby.members.map(m => m.name), ['ACE', 'ACE 2'], 'names are unique within a lobby');
    await c.join(L.code);
    c.send(C.SHIP, { ship: 'corsair', paint: { primary: '#ff2200' } });
    await a.waitFor(S.LOBBY, m => m.lobby.members.some(x => x.pid === c.pid && x.ship === 'corsair' && x.paint && x.paint.primary === '#ff2200'));
    b.ready(true); await a.waitFor(S.LOBBY, m => m.lobby.members.find(x => x.pid === b.pid).ready);
    b.send(C.START, {}); assert.equal((await b.waitFor(S.ERROR)).code, 'not-host');
    a.send(C.START, {}); assert.equal((await a.waitFor(S.ERROR)).code, 'not-ready');
    a.send(C.SETTINGS, { handling: 'classic' }); await c.waitFor(S.LOBBY, m => m.lobby.handling === 'classic');
    b.send(C.SETTINGS, { handling: 'relaxed' }); assert.equal((await b.waitFor(S.ERROR, e => e.code === 'not-host')).code, 'not-host');
    const pub = bot(url, 'LOOKER'); await pub.connect(); pub.send(C.LIST, {}); const ls = await pub.waitFor(S.LOBBIES);
    assert.deepEqual(ls.list.map(x => [x.code, x.players]), [[L.code, 3]]);
    await a.leave();
    const after = await b.waitFor(S.LOBBY, m => m.lobby.members.length === 2);
    assert.equal(after.lobby.host, b.pid, 'the next pilot to have joined becomes host');
    await b.leave(); await c.leave(); await until(() => srv.hub.lobbies.count === 0, 2000, 'lobby closed when empty');
  } finally { await srv.close(); }
});

test('lobbies: seven pilots joining at once never make more than six', async () => {
  const { srv, url } = await server();
  try {
    const host = bot(url, 'HOST'); await host.connect(); const code = (await host.create()).lobby.code;
    const crowd = Array.from({ length: 7 }, (_, i) => bot(url, 'PILOT ' + (i + 1)));
    await Promise.all(crowd.map(b => b.connect()));
    const res = await Promise.all(crowd.map(b => b.join(code)));
    assert.equal(res.filter(r => r.t === S.LOBBY).length, MP.MAX_PLAYERS - 1); assert.deepEqual(res.filter(r => r.t === S.ERROR).map(r => r.code), ['full', 'full']);
    assert.equal(srv.hub.lobbies.find(code).size, MP.MAX_PLAYERS);
  } finally { await srv.close(); }
});

test('lobbies: a disconnected host hands over; a pilot gone too long is removed', async () => {
  const { srv, url } = await server();
  try {
    const { list: [a, b, c], code } = await lobbyOf(url, ['ALPHA', 'BRAVO', 'CHARLIE']);
    a.offlineFor(60000);
    await b.waitFor(S.LOBBY, m => m.lobby.members.find(x => x.pid === a.pid).conn === 'lost');
    await b.waitFor(S.LOBBY, m => m.lobby.host === b.pid, 6000);
    await c.waitFor(S.LOBBY, m => !m.lobby.members.some(x => x.pid === a.pid), 8000);
    assert.equal(srv.hub.lobbies.find(code).size, 2);
  } finally { await srv.close(); }
});

test('tournament: three real clients race the qualifier and the final; the server decides everything', async () => {
  const { srv, url } = await server();
  try {
    const { list } = await lobbyOf(url, ['ALPHA', 'BRAVO', 'CHARLIE']);
    const [a, b, c] = list, t0 = Date.now();
    const p1 = await startTournament(list);
    assert.equal(p1.stage, 1); assert.equal(p1.laps, 5); assert.equal(p1.grid.length, 3); assert.deepEqual(new Set(p1.grid.map(g => g.pid)), new Set(list.map(x => x.pid)));
    await until(() => list.every(x => x.prepares.some(p => p.rid === p1.rid)), 5000, 'every pilot gets the race');
    for (const x of list) { const st = await x.waitFor(S.START, m => m.rid === p1.rid, 20000); assert.ok(st.startAt > Date.now() - 2000); }
    assert.ok(new Set(list.map(x => x.startAt)).size === 1, 'one start time for everyone');
    // remote ships arrive for everyone during the race
    await until(() => list.every(x => x.snapPids.size === 3), 20000, 'everyone sees every ship');
    const b0 = { in: srv.hub.stats.bytesIn, out: srv.hub.stats.bytesOut, at: Date.now() };
    await sleep(4000);
    // laps and checkpoints: what the others receive for a pilot matches that pilot's own race (within one checkpoint of latency)
    for (const x of list) for (const y of list) if (x !== y) {
      const seen = y.states.get(x.pid); assert.ok(seen, `${y.name} has ${x.name}'s state`);
      assert.ok(Math.abs(seen[2 + 14] - x.me.cpNext) <= 1, `checkpoint of ${x.name}: own ${x.me.cpNext}, seen by ${y.name} ${seen[2 + 14]}`);
      assert.ok(Math.abs(seen[2 + 13] - Math.max(0, x.me.lap)) <= 1, `lap of ${x.name}: own ${x.me.lap}, seen by ${y.name} ${seen[2 + 13]}`);
    }
    const secs = (Date.now() - b0.at) / 1000, upKB = (srv.hub.stats.bytesIn - b0.in) / secs / 3 / 1024, downKB = (srv.hub.stats.bytesOut - b0.out) / secs / 3 / 1024;
    console.log(`    traffic while racing (3 pilots): ${upKB.toFixed(1)} KB/s up and ${downKB.toFixed(1)} KB/s down per pilot (message text, without WebSocket framing)`);
    assert.ok(upKB < 8 && downKB < 16, 'state traffic stays small');
    const r1 = await a.waitFor(S.RESULTS, m => m.stage === 1, 90000);
    assert.equal(r1.rows.length, 3); assert.deepEqual(r1.rows.map(r => r.place), [1, 2, 3]);
    for (const r of r1.rows) { assert.ok(['ALPHA', 'BRAVO', 'CHARLIE'].includes(r.name)); assert.ok(r.ship); }
    const fins = r1.rows.filter(r => r.status === 'finished'); assert.ok(fins.length >= 2, JSON.stringify(r1.rows));
    for (let k = 1; k < fins.length; k++) assert.ok(fins[k].time >= fins[k - 1].time, 'ordered by time');
    assert.deepEqual(r1.qualified, r1.rows.slice(0, 2).map(r => r.pid)); assert.deepEqual(r1.eliminated, [r1.rows[2].pid]);
    await until(() => list.every(x => x.results.some(m => m.rid === r1.rid)), 5000, 'everyone gets the result');
    const p2 = await a.waitFor(S.PREPARE, m => m.stage === 2, 20000);
    assert.notEqual(p2.track, p1.track, 'the final is on another course'); assert.deepEqual(p2.grid.map(g => g.pid), r1.qualified); assert.equal(p2.laps, 5); assert.equal(p2.stage, 2);
    const eliminated = list.find(x => x.pid === r1.eliminated[0]);
    await until(() => eliminated.prepares.some(m => m.rid === p2.rid), 5000, 'the final reaches the eliminated pilot'); assert.equal(eliminated.spectating, true, 'the eliminated pilot can watch the final');
    const done = await a.waitFor(S.COMPLETE, () => true, 90000);
    await until(() => list.every(x => x.completes.some(m => m.tid === done.tid)), 5000, 'everyone gets the tournament result');
    const fin = done.stages.find(s => s.stage === 2);
    assert.equal(done.outcome, 'raced'); assert.equal(done.winner, fin.rows[0].pid); assert.equal(done.runnerUp, fin.rows[1].pid);
    assert.equal(fin.track, p2.track); assert.equal(fin.rows[0].status, 'finished');
    const expected = tournamentRewards(done);
    for (const x of list) {
      const rw = x.complete.reward, want = expected[x.pid];
      if (want) { assert.equal(rw.tid, done.tid); assert.equal(rw.CR, want.CR); assert.equal(rw.ST, want.ST); } else assert.equal(rw, null);
      assert.ok(!('rewards' in x.complete), 'each pilot sees only their own reward');
    }
    assert.ok(expected[done.winner].ST >= 3);
    // the host starts another tournament with the same pilots: a new tournament id, so a new reward
    a.send(C.START, { rematch: true });
    const p3 = await b.waitFor(S.PREPARE, m => m.stage === 1 && m.rid !== p1.rid, 10000);
    assert.notEqual(p3.tid, done.tid); assert.equal(p3.grid.length, 3);
    const done2 = await a.waitFor(S.COMPLETE, m => m.tid !== done.tid, 150000);
    assert.notEqual(done2.tid, done.tid);
    console.log(`    two tournaments in ${((Date.now() - t0) / 1000).toFixed(0)} s; first: ${p1.track} then ${p2.track}, winner ${done.winnerName}`);
    assert.equal(srv.hub.stats.rejected, 0, 'no valid state was rejected');
    for (const x of list) assert.deepEqual(x.errors, [], x.name);
  } finally { await srv.close(); }
});

test('connections: a pilot back within the grace period races on; one gone longer is out but stays in the lobby', async () => {
  const { srv, url } = await server();
  try {
    const { list } = await lobbyOf(url, ['ALPHA', 'BRAVO', 'CHARLIE']);
    const [a, b, c] = list;
    const p1 = await startTournament(list);
    await b.waitFor(S.START, m => m.rid === p1.rid, 20000);
    await sleep(3000);
    b.offlineFor(1500); c.offlineFor(FAST.raceRules.graceMs + 3000);
    await b.waitFor(S.WELCOME, m => m.resumed, 10000);
    const r1 = await a.waitFor(S.RESULTS, m => m.stage === 1, 90000);
    const rb = r1.rows.find(r => r.pid === b.pid), rc = r1.rows.find(r => r.pid === c.pid);
    assert.equal(rb.status, 'finished', 'BRAVO reconnected and finished: ' + JSON.stringify(rb));
    assert.equal(rc.status, 'dnf'); assert.equal(rc.reason, 'disconnected');
    assert.ok(!r1.qualified.includes(c.pid));
    await c.waitFor(S.WELCOME, m => m.resumed, 20000);
    const p2 = await c.waitFor(S.PREPARE, m => m.stage === 2, 20000);
    assert.ok(!p2.grid.some(g => g.pid === c.pid)); assert.equal(c.spectating, true);
    assert.ok(a.inbox.some(e => e.type === S.STATUS && e.m.pid === b.pid && e.m.conn === 'lost'), 'others are told about the dropped connection');
    await a.waitFor(S.COMPLETE, () => true, 90000);
  } finally { await srv.close(); }
});

test('connections: after a server restart the clients reconnect as the same pilots and learn the lobby is gone', async () => {
  let { srv, port, url } = await server();
  try {
    const { list: [a, b] } = await lobbyOf(url, ['ALPHA', 'BRAVO']);
    const pa = a.pid;
    await srv.close();
    await until(() => a.connStates.includes('reconnecting:lost'), 5000, 'the client notices');
    ({ srv } = await server({ PORT: String(port) }));
    const w = await a.waitFor(S.WELCOME, m => m !== a.welcomes[0], 15000);
    assert.equal(w.pid, pa, 'same pilot id (the token is signed with the same secret)'); assert.equal(w.resumed, false);
    assert.ok(a.inbox.some(e => e.type === S.NOTICE && e.m.kind === 'shutdown'), 'the server announced the restart');
    await b.waitFor(S.WELCOME, m => m !== b.welcomes[0], 15000);
    const code = (await a.create()).lobby.code; assert.equal((await b.join(code)).t, S.LOBBY, 'they can carry on in a new lobby');
  } finally { await srv.close(); }
});

test('hostile clients: malformed, unknown, oversized, binary, flooding and silent connections are refused', async () => {
  const { srv, url } = await server({}, { rules: { ...HUB_RULES, helloTimeoutMs: 800, floodLimit: 50 } });
  try {
    const r = await raw(url);
    r.send('not json'); r.send({ t: 'grant', amount: 1e9 }); r.send({ t: C.LIST }); r.send({ t: C.HELLO, v: PROTOCOL, name: '<b>' }); r.send({ t: C.HELLO, v: 999, name: 'OK NAME' });
    r.send({ t: C.HELLO, v: PROTOCOL, name: 'GOOD NAME', token: 'forged.token.value' });
    await until(() => r.msgs.some(m => m.t === S.WELCOME), 3000, 'welcome');
    assert.deepEqual(r.msgs.slice(0, 5).map(m => m.code), ['bad-msg', 'bad-msg', 'hello-first', 'bad-name', 'version']);
    const w = r.msgs.find(m => m.t === S.WELCOME); assert.match(w.pid, /^p[0-9a-f]{12}$/, 'a forged token just gets a new pilot id');
    r.send({ t: C.PING, c: 1, rtt: 2000 }); await until(() => r.msgs.some(m => m.t === S.PONG), 3000, 'pong');
    assert.ok(srv.hub.sessions.get(w.pid).rtt < 500, 'the round trip used to time finishes is measured by the server, not taken from the game');
    r.send({ t: C.FINISH, rid: 'r1', time: 1 }); r.send({ t: C.STATE, rid: 'x', s: [1, 2] }); r.send({ t: C.START });
    await until(() => r.msgs.filter(m => m.t === S.ERROR).length >= 8, 3000, 'errors');
    assert.deepEqual(r.msgs.filter(m => m.t === S.ERROR).slice(5).map(m => m.code), ['not-in-lobby', 'bad-msg', 'not-in-lobby']);
    r.send('{"t":"ping","c":1,"pad":"' + 'x'.repeat(MP.MAX_MSG_BYTES + 10) + '"}');
    assert.equal((await r.closed).code, 1009, 'too large');
    const bin = await raw(url); bin.ws.send(Buffer.from([1, 2, 3])); assert.equal((await bin.closed).code, 1003);
    const quiet = await raw(url); assert.equal((await quiet.closed).code, 4001, 'no hello in time');
    const flood = await raw(url); flood.send({ t: C.HELLO, v: PROTOCOL, name: 'FLOOD' });
    for (let k = 0; k < 400; k++) flood.send({ t: C.PING, c: k });
    assert.equal((await flood.closed).code, 1008); assert.ok(flood.msgs.some(m => m.code === 'rate'));
    await until(() => srv.hub.conns.size === 0, 3000, 'all hostile connections closed');
  } finally { await srv.close(); }
});

test('cheating clients: an early finish claim, teleporting and never loading are refused; honest pilots are unaffected', async () => {
  const { srv, url } = await server();
  try {
    const honest = bot(url, 'HONEST', { skill: 0.9 }), early = bot(url, 'EARLY', { cheat: 'fast-finish' }), jumper = bot(url, 'JUMPER', { cheat: 'teleport' }), idle = bot(url, 'IDLE', { cheat: 'noload' });
    for (const x of [honest, early, jumper, idle]) await x.connect();
    const code = (await honest.create()).lobby.code; for (const x of [early, jumper, idle]) await x.join(code);
    await startTournament([honest, early, jumper, idle]);
    const r1 = await honest.waitFor(S.RESULTS, m => m.stage === 1, 120000), row = n => r1.rows.find(r => r.name === n);
    assert.equal(row('HONEST').status, 'finished'); assert.equal(row('HONEST').place, 1);
    assert.notEqual(row('EARLY').status, 'finished', 'a finish claimed before the pilot got there is refused');
    assert.ok(early.errors.some(e => e.startsWith('finish-rejected')), early.errors.join());
    assert.equal(row('JUMPER').reason, 'invalid'); assert.equal(row('IDLE').reason, 'notloaded');
    assert.ok(jumper.notices.some(n => n.kind === 'state-rejected'));
  } finally { await srv.close(); }
});

test('two lobbies race at the same time without seeing each other', async () => {
  const { srv, url } = await server();
  try {
    const one = await lobbyOf(url, ['ONE A', 'ONE B']), two = await lobbyOf(url, ['TWO A', 'TWO B']);
    const [pa, pb] = await Promise.all([startTournament(one.list), startTournament(two.list)]);
    assert.notEqual(pa.rid, pb.rid);
    const [ca, cb] = await Promise.all([one.list[0].waitFor(S.COMPLETE, () => true, 150000), two.list[0].waitFor(S.COMPLETE, () => true, 150000)]);
    assert.notEqual(ca.tid, cb.tid);
    for (const x of one.list) assert.deepEqual([...x.snapPids].sort(), one.list.map(y => y.pid).sort(), 'only ships of this lobby');
    for (const x of two.list) assert.deepEqual([...x.snapPids].sort(), two.list.map(y => y.pid).sort());
    for (const [L] of [[one.list], [two.list]]) { const ids = new Set(L.map(y => y.pid)); for (const x of L) for (const p of x.prepares) assert.ok(p.grid.every(g => ids.has(g.pid)), 'grids hold only this lobby\'s pilots'); }
  } finally { await srv.close(); }
});

test('only the configured website may connect when ALLOWED_ORIGINS is set; a pilot is signed in once', async () => {
  const { srv, url } = await server({ ALLOWED_ORIGINS: 'https://good.example' });
  try {
    await assert.rejects(raw(url, { Origin: 'https://evil.example' }), e => e.status === 403);
    await assert.rejects(raw(url), e => e.status === 403);
    const ok = await raw(url, { Origin: 'https://good.example' }); ok.send({ t: C.HELLO, v: PROTOCOL, name: 'FIRST' });
    await until(() => ok.msgs.some(m => m.t === S.WELCOME), 3000, 'welcome');
    const tok = ok.msgs.find(m => m.t === S.WELCOME).token, pid = ok.msgs.find(m => m.t === S.WELCOME).pid;
    const again = await raw(url, { Origin: 'https://good.example' }); again.send({ t: C.HELLO, v: PROTOCOL, name: 'SECOND', token: tok });
    await until(() => again.msgs.some(m => m.t === S.WELCOME), 3000, 'welcome 2');
    assert.equal(again.msgs.find(m => m.t === S.WELCOME).pid, pid, 'the token is this pilot\'s session');
    assert.equal((await ok.closed).code, 4002, 'the older connection is closed: one connection per pilot');
    assert.ok(ok.msgs.some(m => m.t === S.NOTICE && m.kind === 'replaced'));
  } finally { await srv.close(); }
});
