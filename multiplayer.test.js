// GALACTIC RUSH V8 — multiplayer unit tests: the shared protocol, identity, course selection, rewards, the server's race
// referee (RaceSession) and the two-stage tournament, all on a fake clock. Pilots here are synthetic state streams
// along the real course data (the integration tests in tests/mp/ use real WebSocket clients flying the game's own
// simulation). Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrack } from '../src/sim/tracks.js';
import { MP, PROTOCOL, C, normalizeName, normalizeCode, packState, unpackState, parseMessage, checkClientMessage, STATE_LEN, fmtTime } from '../src/mp/protocol.js';
import { toWsUrl, mpServer } from '../src/mp/config.js';
import { SnapBuffer, newPose } from '../src/mp/interp.js';
import { cleanPaint } from '../src/mp/paint.js';
import { MP_REWARDS, raceCredits, tournamentRewards, checkReward, TID } from '../src/mp/rewards.js';
import { createIdentity, newPid, newId, newCode } from '../server/identity.mjs';
import { createMapPicker, ALL_TRACKS } from '../server/maps.mjs';
import { RaceSession, RACE_RULES, shipVmax, trackInfo } from '../server/race.mjs';
import { Tournament, TOURNAMENT_RULES } from '../server/tournament.mjs';
import { Lobby, LobbyRegistry } from '../server/lobby.mjs';
import { loadConfig } from '../server/config.mjs';
import { EVENT_ID } from '../src/progress/profile.js';

// ---------- synthetic pilots ----------
// a pilot flying the course's centre line at a constant speed v (m/s), starting at progress prog0 (behind the line)
function pilot(trackId, { v = 120, prog0 = -20, laps = MP.LAPS } = {}) {
  const tr = getTrack(trackId), L = tr.length, M = tr.cpS.length, cpProg = g => Math.floor(g / M) * L + tr.cpS[g % M];
  const finishProg = cpProg(laps * M);
  const at = t => {
    const prog = prog0 + v * t; let cp = 0; while (cp <= laps * M && cpProg(cp) <= prog) cp++;
    const s = ((prog % L) + L) % L, i = Math.floor(s / tr.D) % tr.N, p = tr.pointAt(i, 0, 0);
    return packState({ t, p: [p.x, p.y, p.z], q: [0, 0, 0, 1], v: [0, 0, v], b: 0.5, f: 0, lap: cp >= 1 ? Math.min(laps, Math.floor((cp - 1) / M) + 1) : 0, cp, prog, ay: 0, hull: 1, thr: 1 });
  };
  return { at, finishT: (finishProg - prog0) / v, cpProg, M, L, finishProg };
}
const K = 1; // race clock = wall clock in these tests

test('protocol: names and room codes are normalised and validated', () => {
  assert.equal(normalizeName('  ace  pilot '), 'ACE PILOT');
  assert.equal(normalizeName('Zoë_7'), 'ZOË_7');
  assert.equal(normalizeName('ＡＢＣ'), 'ABC'); // full-width letters fold (NFKC)
  for (const bad of ['', 'a', 'x'.repeat(17), '<script>', '  ', '-lead', 'a\u0000b', 42, null, 'ab\ncd'.repeat(20)]) assert.equal(normalizeName(bad), null, String(bad));
  assert.equal(normalizeCode('k7qx2'), 'K7QX2'); assert.equal(normalizeCode('k7q-x2'), 'K7QX2'); assert.equal(normalizeCode(' K7 QX2 '), 'K7QX2');
  for (const bad of ['K7QX', 'K7QX22', 'K7QXI', 'K7QX0', 'K7QX1', 'K7QXO', 'K7QXL', '', null, 12345]) assert.equal(normalizeCode(bad), null, String(bad));
  const codes = new Set(); for (let k = 0; k < 500; k++) { const c = newCode(codes); assert.equal(normalizeCode(c), c); codes.add(c); }
  assert.equal(codes.size, 500);
});

test('protocol: ship states pack, unpack and reject bad values', () => {
  const s = { t: 12.3456, p: [1.234, -5.678, 9000.1], q: [0, 0.7071, 0, 0.7071], v: [10.04, 0, -3.5], b: 0.5, f: 129, lap: 2, cp: 13, prog: 1234.56, ay: 0.31, hull: 0.8, thr: 1 };
  const a = packState(s); assert.equal(a.length, STATE_LEN);
  const u = unpackState(a); assert.ok(u);
  assert.equal(u.t, 12.346); assert.deepEqual(u.p, [1.23, -5.68, 9000.1]); assert.equal(u.cp, 13); assert.equal(u.f, 129);
  assert.ok(Math.abs(Math.hypot(...u.q) - 1) < 1e-9);
  const bad = (i, v) => { const b = a.slice(); b[i] = v; return unpackState(b); };
  assert.equal(unpackState(a.slice(0, 18)), null); assert.equal(unpackState([...a, 1]), null); assert.equal(unpackState('x'), null);
  for (const [i, v] of [[0, NaN], [0, -1], [1, 1e6], [4, 5], [8, 3000], [11, 2], [12, 1.5], [12, 300], [13, -1], [14, 2.5], [15, 2e6], [16, 99], [17, 2], [18, -0.1], [3, Infinity], [2, '1']]) assert.equal(bad(i, v), null, `index ${i} = ${v}`);
  assert.equal(fmtTime(83.456), '1:23.46'); assert.equal(fmtTime(null), '--:--.--');
});

test('protocol: every client message type is checked field by field', () => {
  const st = packState({ t: 1, p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], b: 0, f: 0, lap: 0, cp: 0, prog: 0, ay: 0, hull: 1, thr: 0 });
  const ok = [
    { t: C.HELLO, v: PROTOCOL, name: 'ACE' }, { t: C.HELLO, v: PROTOCOL, name: 'ACE', token: 'abc', rid: 'r1' },
    { t: C.CREATE, ship: 'kestrel' }, { t: C.CREATE, ship: 'wisp', visibility: 'public', handling: 'classic', paint: {}, name: 'ACE' },
    { t: C.JOIN, code: 'K7QX2', ship: 'lancer' }, { t: C.LEAVE }, { t: C.LIST }, { t: C.SHIP, ship: 'halberd' }, { t: C.PAINT, paint: {} },
    { t: C.READY, ready: true }, { t: C.SETTINGS, handling: 'relaxed' }, { t: C.START }, { t: C.START, rematch: true },
    { t: C.LOADED, rid: 'r1', ok: true }, { t: C.STATE, rid: 'r1', s: st }, { t: C.FINISH, rid: 'r1', time: 100.5, laps: [20, 20] }, { t: C.PING, c: 5 }, { t: C.SPECTATE, rid: 'r1' },
  ];
  for (const m of ok) assert.equal(checkClientMessage(m), true, JSON.stringify(m));
  const bad = [
    { t: C.HELLO, v: 99, name: 'ACE' }, { t: C.HELLO, v: PROTOCOL }, { t: C.HELLO, v: PROTOCOL, name: 'x'.repeat(65) }, { t: C.CREATE, ship: 'xwing' },
    { t: C.CREATE, ship: 'wisp', visibility: 'secret' }, { t: C.CREATE, ship: 'wisp', handling: 'arcade' }, { t: C.CREATE, ship: 'wisp', paint: [] }, { t: C.CREATE, ship: 'wisp', name: 7 },
    { t: C.JOIN, ship: 'wisp' }, { t: C.JOIN, code: 'K7QX2'.repeat(5), ship: 'wisp' }, { t: C.READY, ready: 'yes' }, { t: C.SETTINGS, handling: 'fast' },
    { t: C.START, rematch: 1 }, { t: C.STATE, rid: 'r1', s: st.slice(1) }, { t: C.STATE, s: st }, { t: C.FINISH, rid: 'r1', time: NaN }, { t: C.FINISH, rid: 'r1', time: 1, laps: new Array(21).fill(1) },
    { t: C.PING }, { t: 'admin' }, { t: 'grant', amount: 1e6 },
  ];
  for (const m of bad) assert.equal(checkClientMessage(m), false, JSON.stringify(m));
  assert.ok(parseMessage('{"t":"ping","c":1}').msg); assert.equal(parseMessage('nope').error, 'bad-msg'); assert.equal(parseMessage('[1]').error, 'bad-msg');
  assert.equal(parseMessage('{"t":"ping","pad":"' + 'x'.repeat(MP.MAX_MSG_BYTES) + '"}').error, 'bad-msg');
});

test('config: the server address is read from site config, build meta tag or a local ?mp=, never invented', () => {
  assert.equal(toWsUrl('https://gr.example.com'), 'wss://gr.example.com/ws'); assert.equal(toWsUrl('wss://gr.example.com/ws'), 'wss://gr.example.com/ws');
  assert.equal(toWsUrl('http://localhost:8787'), 'ws://localhost:8787/ws'); assert.equal(toWsUrl('ftp://x'), ''); assert.equal(toWsUrl(''), '');
  const loc = (href) => new URL(href), doc = content => ({ querySelector: () => (content ? { content } : null) });
  assert.deepEqual(mpServer(loc('https://me.github.io/gr/'), doc(''), {}), { url: '', source: 'none', insecure: false });
  assert.equal(mpServer(loc('https://me.github.io/gr/'), doc('wss://a.example/ws'), {}).source, 'build');
  assert.equal(mpServer(loc('https://me.github.io/gr/'), doc('wss://a.example/ws'), { GALACTIC_RUSH_CONFIG: { multiplayerServer: 'wss://b.example' } }).url, 'wss://b.example/ws');
  assert.equal(mpServer(loc('https://me.github.io/gr/?mp=ws://evil.example'), doc(''), {}).url, '', 'a public page ignores ?mp=');
  assert.equal(mpServer(loc('http://localhost:8099/?mp=ws://127.0.0.1:8787'), doc(''), {}).url, 'ws://127.0.0.1:8787/ws');
  assert.equal(mpServer(loc('http://192.168.1.20:5173/?mp=ws://192.168.1.20:8787'), doc(''), {}).url, 'ws://192.168.1.20:8787/ws', 'a page on the local network may name a LAN server');
  assert.equal(mpServer(loc('http://203.0.113.9/?mp=ws://203.0.113.9:8787'), doc(''), {}).url, '', 'a public address may not');
  assert.equal(mpServer(loc('https://gr.example.com/?mp=ws://x'), doc(''), { GALACTIC_RUSH_CONFIG: { multiplayerServer: 'wss://a.example' } }).url, 'wss://a.example/ws');
  assert.equal(mpServer(loc('https://me.github.io/'), doc('ws://a.example'), {}).insecure, true);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://me.github.io' }), /TOKEN_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x'.repeat(40) }), /ALLOWED_ORIGINS/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x'.repeat(40), ALLOWED_ORIGINS: 'https://a', GR_TIME_SCALE: '8' }), /GR_TIME_SCALE/);
  const { cfg } = loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x'.repeat(40), ALLOWED_ORIGINS: 'https://a.github.io, https://b.example', ELIGIBLE_TRACKS: 'ring,nowhere', PORT: '0' });
  assert.deepEqual(cfg.allowedOrigins, ['https://a.github.io', 'https://b.example']); assert.deepEqual(cfg.eligibleTracks, ['ring']); assert.equal(cfg.port, 0); assert.equal(cfg.timeScale, 1);
});

test('identity: the server issues pilot ids and tokens that cannot be forged, reused elsewhere or kept forever', () => {
  let now = 1_000_000;
  const id = createIdentity('s'.repeat(32), { now: () => now, ttlMs: 60_000 }), other = createIdentity('t'.repeat(32), { now: () => now });
  const pid = newPid(); assert.match(pid, /^p[0-9a-f]{12}$/);
  const tok = id.issue(pid); assert.equal(id.verify(tok), pid);
  assert.equal(other.verify(tok), null, 'another server secret');
  const [p, ts, sig] = tok.split('.');
  assert.equal(id.verify(`${newPid()}.${ts}.${sig}`), null, 'someone else\'s id with this signature');
  assert.equal(id.verify(`${p}.${ts}.${sig.slice(0, -2)}xx`), null); assert.equal(id.verify('garbage'), null); assert.equal(id.verify(null), null);
  now += 61_000; assert.equal(id.verify(tok), null, 'expired');
  const ids = new Set(Array.from({ length: 2000 }, () => newId('t'))); assert.equal(ids.size, 2000);
  for (const t of [...ids].slice(0, 50)) { assert.match(t, TID); assert.match('mp:' + t, EVENT_ID); }
});

test('maps: the server picks each stage at random and avoids repeating a course in a tournament', () => {
  let n = 0; const seq = [0, 1, 2, 3, 0, 0, 1];
  const pick = createMapPicker({ rng: k => seq[n++ % seq.length] % k });
  const a = pick.pick([]); const b = pick.pick([a]); assert.notEqual(a, b);
  const real = createMapPicker(); const counts = Object.fromEntries(ALL_TRACKS.map(t => [t, 0]));
  for (let k = 0; k < 4000; k++) counts[real.pick([])]++;
  for (const t of ALL_TRACKS) assert.ok(counts[t] > 800 && counts[t] < 1200, `${t} picked ${counts[t]} of 4000`);
  for (let k = 0; k < 200; k++) { const s1 = real.pick([]), s2 = real.pick([s1]); assert.notEqual(s1, s2); }
  const one = createMapPicker({ eligible: ['ring'] }); assert.equal(one.pick(['ring']), 'ring', 'a single eligible course may repeat');
  assert.throws(() => createMapPicker({ eligible: ['nowhere'] }));
});

test('rewards: amounts follow the V7 economy and the game pays only what the results give', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(raceCredits), [366, 336, 316, 293, 278, 263]);
  const stages = [{ stage: 1, rows: [{ pid: 'a', place: 1, status: 'finished' }, { pid: 'b', place: 2, status: 'finished' }, { pid: 'c', place: 3, status: 'dnf' }] },
    { stage: 2, rows: [{ pid: 'b', place: 1, status: 'finished' }, { pid: 'a', place: 2, status: 'finished' }] }];
  const r = tournamentRewards({ stages, winner: 'b', runnerUp: 'a' });
  assert.deepEqual(r.b, { CR: 336 + 366 + MP_REWARDS.winner.CR, ST: 3, lines: [{ name: 'Qualifier: P2', CR: 336, ST: 0 }, { name: 'Final: P1', CR: 366, ST: 0 }, { name: 'Tournament winner', CR: 500, ST: 3 }] });
  assert.equal(r.a.CR, 366 + 336); assert.equal(r.a.ST, 1); assert.equal(r.c, undefined, 'no race finished, no reward');
  const complete = { tid: 't0123456789', stages, winner: 'b', runnerUp: 'a' };
  assert.equal(checkReward(complete, 'b', { tid: complete.tid, ...r.b }).ok, true);
  assert.equal(checkReward(complete, 'b', { tid: complete.tid, ...r.b, CR: r.b.CR + 1 }).ok, false);
  assert.equal(checkReward(complete, 'b', { tid: 't9999999999', ...r.b }).ok, false);
  assert.equal(checkReward(complete, 'c', { tid: complete.tid, CR: 100, ST: 0, lines: [{ name: 'x', CR: 100, ST: 0 }] }).ok, false);
  assert.equal(checkReward({ ...complete, tid: 'T-BAD' }, 'b', { tid: 'T-BAD', ...r.b }).ok, false);
});

test('paint: online paint jobs are cleaned with the career validator (no premium items, valid colours)', () => {
  assert.ok(cleanPaint({ primary: '#ff0000' }, 'kestrel').paint);
  assert.equal(cleanPaint({ primary: 'javascript:alert(1)' }, 'kestrel').paint.primary.startsWith('#'), true);
  assert.equal(cleanPaint({}, 'xwing').paint, null);
  const prem = cleanPaint({ pattern: 'premium.plasma-pattern' }, 'wisp'); assert.notEqual(prem.paint.pattern, 'premium.plasma-pattern'); assert.ok(prem.issues.length);
  assert.equal(cleanPaint({ paint: 'paint.aurora' }, 'wisp').paint.paint, 'paint.aurora', 'earnable items are shown as the pilot saved them');
});

test('interpolation: remote ships move smoothly between states and never jump back', () => {
  const b = new SnapBuffer(), st = (x, vx) => ({ p: [x, 0, 0], q: [0, 0, 0, 1], v: [vx, 0, 0] }), out = newPose();
  b.push(1000, st(0, 100), 1050); b.push(1050, st(5, 100), 1100); b.push(1100, st(10, 100), 1150);
  assert.equal(b.push(1075, st(99, 0)), false, 'out-of-order state dropped');
  b.sample(1025, out); assert.ok(Math.abs(out.p[0] - 2.5) < 1e-6);
  b.sample(1200, out); assert.ok(Math.abs(out.p[0] - 20) < 1e-6 && out.extrapolated, 'extrapolates along the velocity');
  b.sample(5000, out); assert.ok(Math.abs(out.p[0] - 35) < 1e-6 && out.stale, 'then holds (at most 250 ms ahead)');
  assert.ok(b.delay() >= 90 && b.delay() <= 400);
});

// ---------- the race referee ----------
function session(over = {}) {
  const parts = over.parts || [{ pid: 'a', ship: 'kestrel' }, { pid: 'b', ship: 'kestrel' }];
  return new RaceSession({ rid: 'r1', stage: 1, track: over.track || 'foundry', handling: 'relaxed', participants: parts, now: 0, ...over });
}
function started(rs) { for (const p of rs.parts.keys()) rs.loaded(p, true, 0); const ev = rs.tick(10); assert.equal(ev[0].type, 'start'); rs.tick(rs.startAt); return rs.startAt; }
const wall = (rs, t) => rs.startAt + (t * 1000) / K;

test('race: starts when everyone has loaded, with a countdown; a pilot who never loads is left out', () => {
  const rs = session(); rs.loaded('a', true, 0); assert.deepEqual(rs.tick(1000), []);
  rs.loaded('b', true, 2000); const ev = rs.tick(2000);
  assert.deepEqual(ev, [{ type: 'start', startAt: 2000 + RACE_RULES.countdownMs }]); assert.equal(rs.phase, 'countdown');
  const rs2 = session(); rs2.loaded('a', true, 0);
  const ev2 = rs2.tick(RACE_RULES.loadTimeoutMs + 1);
  assert.deepEqual(ev2.map(e => e.type), ['out', 'start']); assert.equal(rs2.part('b').reason, 'notloaded');
  const rs3 = session(); const ev3 = rs3.tick(RACE_RULES.loadTimeoutMs + 1); assert.equal(ev3.at(-1).type, 'over'); assert.equal(rs3.endReason, 'nobody');
});

test('race: legitimate states are accepted and the finish is official only after every checkpoint of five laps', () => {
  const rs = session(), P = pilot('foundry', { v: 140 }), t0 = started(rs);
  let n = 0;
  for (let t = 0.05; t < P.finishT + 0.05; t += 0.05) { const r = rs.state('a', P.at(t), wall(rs, t)); assert.ok(r.ok, `t=${t.toFixed(2)} ${r.reason}`); n++; }
  assert.equal(rs.part('a').cp, rs.finishCp + 1);
  const r = rs.finish('a', { time: P.finishT }, wall(rs, P.finishT + 0.05), 60);
  assert.ok(r.ok, r.reason); assert.equal(r.adjusted, false); assert.ok(Math.abs(r.time - P.finishT) < 0.01);
  assert.equal(rs.finish('a', { time: P.finishT }, wall(rs, P.finishT + 0.1)).reason, 'already-finished');
  assert.ok(n > 600); void t0;
});

test('race: a finish without all laps, at the wrong place or time, or faster than the ship can fly is refused', () => {
  const rs = session(), P = pilot('foundry', { v: 140 }); started(rs);
  for (let t = 0.05; t < P.finishT * 0.6; t += 0.05) rs.state('a', P.at(t), wall(rs, t));
  assert.equal(rs.finish('a', { time: P.finishT * 0.6 }, wall(rs, P.finishT * 0.6)).reason, 'laps-missing');
  const rs2 = session(); started(rs2); const p = rs2.part('a');
  Object.assign(p, { seen: true, cp: rs2.finishCp + 1, prog: rs2.cpProg(rs2.finishCp) + 5, t: 30 });
  assert.equal(rs2.finish('a', { time: 30 }, wall(rs2, 30)).reason, 'too-fast');
  Object.assign(p, { t: 200 }); assert.equal(rs2.finish('a', { time: 150 }, wall(rs2, 200)).reason, 'bad-time');
  Object.assign(p, { prog: rs2.cpProg(rs2.finishCp) - 2000 }); assert.equal(rs2.finish('a', { time: 200 }, wall(rs2, 200)).reason, 'not-at-line');
  assert.equal(session().finish('a', { time: 1 }, 0).reason, 'not-started');
});

test('race: teleports, skipped checkpoints, clocks running ahead and impossible speeds are rejected', () => {
  const P = pilot('foundry', { v: 140 }), T0 = 15; // at 15 s the pilot is well between two checkpoints
  const go = (fn) => { const rs = session(); started(rs); for (let t = 0.05; t < T0; t += 0.05) rs.state('a', P.at(t), wall(rs, t)); return [rs, fn(rs)]; };
  const atT = P.at(T0);
  const mod = (i, v) => { const s = P.at(T0 + 0.05); s[i] = v; return s; };
  const w = rs => wall(rs, T0 + 0.05);
  assert.equal(go(rs => rs.state('a', mod(0, T0 + 5), w(rs)))[1].reason, 'clock-ahead');
  assert.equal(go(rs => rs.state('a', mod(0, 10), w(rs)))[1].reason, 'time-back');
  assert.equal(go(rs => rs.state('a', mod(14, atT[14] - 1), w(rs)))[1].reason, 'checkpoint');
  assert.equal(go(rs => rs.state('a', mod(15, atT[15] + 400), w(rs)))[1].reason, 'speed');
  assert.equal(go(rs => rs.state('a', mod(14, atT[14] + 1), w(rs)))[1].reason, 'checkpoint-skipped');
  const late = P.at(T0 + 10); late[0] = T0 + 0.05; late[14] = atT[14]; // progress far past the next checkpoint without passing it
  assert.ok(['checkpoint-missed', 'speed'].includes(go(rs => rs.state('a', late, w(rs)))[1].reason));
  assert.equal(go(rs => rs.state('a', mod(14, 999), w(rs)))[1].reason, 'checkpoint', 'beyond the finish');
  // faster than the ship can sustain: every step is within the per-step margin, the total distance is not
  const vmax = shipVmax('kestrel', 'relaxed'), F = pilot('foundry', { v: vmax * 1.2 }), rs = session(); started(rs); let reason = null;
  for (let t = 0.05; t < 10 && !reason; t += 0.05) { const r = rs.state('a', F.at(t), wall(rs, t)); if (!r.ok) reason = r.reason; }
  assert.equal(reason, 'distance');
  const shaped = session(); started(shaped); assert.equal(shaped.state('a', [1, 2, 3], wall(shaped, 1)).reason, 'shape');
});

test('race: repeated invalid states take the pilot out of the race', () => {
  const rs = session(); started(rs); const P = pilot('foundry'); rs.state('a', P.at(1), wall(rs, 1));
  let r; for (let k = 0; k < RACE_RULES.strikeLimit; k++) { const s = P.at(1.2 + k * 0.1); s[15] += 5000; r = rs.state('a', s, wall(rs, 1.2 + k * 0.1)); }
  assert.deepEqual(r.out, { type: 'out', pid: 'a', reason: 'invalid' }); assert.equal(rs.part('a').status, 'dnf');
  assert.equal(rs.state('a', P.at(3), wall(rs, 3)).reason, 'not-racing');
});

test('race: a lost connection has 20 s to come back; a reload, inactivity or leaving takes the pilot out', () => {
  const rs = session({ parts: [{ pid: 'a', ship: 'wisp' }, { pid: 'b', ship: 'wisp' }, { pid: 'c', ship: 'wisp' }, { pid: 'd', ship: 'wisp' }] }); started(rs);
  const P = pilot('foundry'); for (const pid of ['a', 'b', 'c', 'd']) rs.state(pid, P.at(1), wall(rs, 1));
  rs.connLost('a', wall(rs, 2)); rs.connLost('b', wall(rs, 2));
  assert.equal(rs.connBack('a', wall(rs, 2 + 19), true), null); assert.equal(rs.part('a').status, 'racing', 'back within the grace period');
  assert.deepEqual(rs.tick(wall(rs, 2 + RACE_RULES.graceMs / 1000 + 0.1)).filter(e => e.type === 'out'), [{ type: 'out', pid: 'b', reason: 'disconnected' }]);
  rs.connLost('c', wall(rs, 3)); assert.equal(rs.connBack('c', wall(rs, 4), false).reason, 'left', 'the page reloaded: the local race is gone');
  for (let t = 1.05; t < 50; t += 1) rs.state('a', P.at(t), wall(rs, t));
  const ev = rs.tick(wall(rs, 1 + RACE_RULES.inactiveMs / 1000 + 1)); assert.deepEqual(ev.filter(e => e.type === 'out').map(e => [e.pid, e.reason]), [['d', 'inactive']]);
  assert.equal(rs.leave('a', wall(rs, 50)).reason, 'left');
});

test('race: after the first finish the others have a limited window; results rank finishers, then distance, then drop-outs', () => {
  const parts = ['a', 'b', 'c', 'd'].map(pid => ({ pid, ship: 'kestrel' })), rs = session({ parts }); started(rs);
  const fast = pilot('foundry', { v: 150 }), slow = pilot('foundry', { v: 90 }), slower = pilot('foundry', { v: 80 });
  const win = Math.max(RACE_RULES.finishWindowS, RACE_RULES.finishWindowFrac * fast.finishT);
  let over = null;
  for (let t = 0.05; !over && t < fast.finishT + win + 2; t += 0.05) {
    const w = wall(rs, t);
    if (t < fast.finishT + 0.05) rs.state('a', fast.at(t), w); else if (rs.part('a').status === 'racing') assert.ok(rs.finish('a', { time: fast.finishT }, w).ok);
    rs.state('b', slow.at(t), w); if (t < 30) rs.state('c', slower.at(t), w); else if (rs.part('c').status === 'racing') rs.leave('c', w);
    rs.state('d', slower.at(t), w);
    over = rs.tick(w).find(e => e.type === 'over');
  }
  assert.equal(over.reason, 'finish-window'); assert.ok(Math.abs(rs.gameTime(rs.endedAt) - fast.finishT - win) < 0.2);
  const rows = rs.results();
  assert.deepEqual(rows.map(r => [r.pid, r.place, r.status, r.reason]), [['a', 1, 'finished', null], ['b', 2, 'dnf', 'unfinished'], ['d', 3, 'dnf', 'unfinished'], ['c', 4, 'dnf', 'left']]);
});

test('race: a finish reported late (the pilot\'s game ran behind) is timed by the server clock', () => {
  const rs = session(), P = pilot('foundry', { v: 140 }); started(rs);
  const lag = 3; // this game's race clock is 3 s behind real time
  for (let t = 0.05; t < P.finishT + 0.05; t += 0.05) assert.ok(rs.state('a', P.at(t), wall(rs, t + lag)).ok);
  const r = rs.finish('a', { time: P.finishT }, wall(rs, P.finishT + lag), 100);
  assert.ok(r.ok); assert.equal(r.adjusted, true); assert.ok(r.time > P.finishT + lag - 0.2, `${r.time} vs ${P.finishT}`);
});

// ---------- the tournament ----------
// pilots: { pid: { v: [stage1, stage2] speeds, dropAt: { stage, t }, leaveAt, noload } }
function runTournament(pilots, { tracks = ALL_TRACKS, maxMs = 3_000_000, transitionMs = TOURNAMENT_RULES.transitionMs, onEvent } = {}) {
  let now = 0, idn = 0; const events = [], disconnected = new Set(), left = new Set(), finished = new Set(), picker = createMapPicker({ eligible: tracks, rng: k => (idn * 7 + 3) % k });
  const entrants = Object.keys(pilots).map(pid => ({ pid, name: pid.toUpperCase(), ship: 'kestrel', paint: null }));
  const T = new Tournament({ tid: 't0000000001', entrants, handling: 'relaxed', now, rules: { transitionMs }, hooks: {
    connected: pid => !disconnected.has(pid) && !left.has(pid), emit: (type, p) => { events.push({ type, p, now }); if (onEvent) onEvent(type, p, T); },
    newId: prefix => prefix + String(++idn).padStart(10, '0'), pickTrack: ex => picker.pick(ex), rand: n => (idn * 13) % n, shuffle: a => a } });
  T.start(now);
  let race = null, streams = null;
  while (!T.done && now < maxMs) {
    const prep = events.filter(e => e.type === 'prepare').at(-1);
    if (prep && (!race || race.rid !== prep.p.rid)) {
      race = prep.p; finished.clear();
      for (const g of race.grid) if (!pilots[g.pid].noload && !disconnected.has(g.pid)) T.loaded(g.pid, race.rid, true, now);
      streams = Object.fromEntries(race.grid.map(g => [g.pid, pilot(race.track, { v: (pilots[g.pid].v || [120, 120])[race.stage - 1] })]));
    }
    T.tick(now);
    const start = events.find(e => e.type === 'start' && race && e.p.rid === race.rid);
    if (start && T.race && T.race.rid === race.rid && now >= start.p.startAt) {
      const t = (now - start.p.startAt) / 1000;
      for (const g of race.grid) {
        const P = pilots[g.pid], S = streams[g.pid];
        if (disconnected.has(g.pid) || finished.has(g.pid) || left.has(g.pid) || P.noload) continue;
        if (P.leaveAt && P.leaveAt.stage === race.stage && t >= P.leaveAt.t) { T.leave(g.pid, now); left.add(g.pid); continue; } // left the lobby
        if (P.dropAt && P.dropAt.stage === race.stage && t >= P.dropAt.t) { disconnected.add(g.pid); T.connLost(g.pid, now); continue; }
        if (t < S.finishT) T.state(g.pid, race.rid, S.at(t), now);
        else { T.state(g.pid, race.rid, S.at(S.finishT + 0.01), now); T.finish(g.pid, race.rid, { time: S.finishT }, now, 50); finished.add(g.pid); }
      }
    }
    if (T.phase === 'transition') for (const [pid, P] of Object.entries(pilots)) if (P.dropBetween && !disconnected.has(pid)) disconnected.add(pid);
    now += 50;
  }
  return { T, events, summary: T.done ? events.find(e => e.type === 'complete').p : null };
}

test('tournament: qualifier with everyone, the top two race a final on another course, the winner takes it', () => {
  const { T, events, summary } = runTournament({ a: { v: [150, 120] }, b: { v: [140, 150] }, c: { v: [135, 160] } });
  const preps = events.filter(e => e.type === 'prepare').map(e => e.p), res = events.filter(e => e.type === 'results').map(e => e.p);
  assert.equal(preps.length, 2); assert.equal(preps[0].laps, 5); assert.equal(preps[1].laps, 5);
  assert.deepEqual(preps[0].grid.map(g => g.pid), ['a', 'b', 'c']); assert.notEqual(preps[0].track, preps[1].track, 'the final is on another course');
  assert.deepEqual(res[0].rows.map(r => [r.pid, r.place, r.status]), [['a', 1, 'finished'], ['b', 2, 'finished'], ['c', 3, 'finished']]);
  assert.deepEqual(res[0].qualified, ['a', 'b']); assert.deepEqual(res[0].eliminated, ['c']); assert.ok(res[0].nextAt > 0);
  assert.deepEqual(preps[1].grid.map(g => g.pid), ['a', 'b'], 'the finalists, qualifier winner on pole');
  assert.ok(events.find(e => e.type === 'prepare' && e.p.stage === 2).now >= res[0].nextAt, 'the final waits for the transition');
  assert.equal(summary.outcome, 'raced'); assert.equal(summary.winner, 'b'); assert.equal(summary.runnerUp, 'a'); assert.equal(summary.winnerName, 'B');
  assert.equal(summary.stages.length, 2); assert.equal(summary.stages[1].rows[0].pid, 'b');
  assert.deepEqual(summary.rewards, tournamentRewards(summary)); assert.equal(summary.rewards.c.CR, raceCredits(3)); assert.equal(summary.rewards.b.ST, 3);
  assert.equal(T.phase, 'complete');
});

test('tournament: a finalist who drops out of the final forfeits and the other finalist wins at once', () => {
  const { events, summary } = runTournament({ a: { v: [150, 150], dropAt: { stage: 2, t: 30 } }, b: { v: [140, 100] }, c: { v: [100, 100] } });
  assert.equal(summary.outcome, 'forfeit'); assert.equal(summary.winner, 'b'); assert.equal(summary.runnerUp, 'a');
  const fin = events.filter(e => e.type === 'results').at(-1).p; assert.equal(fin.endReason, 'forfeit');
  const outAt = events.find(e => e.type === 'status' && e.p.pid === 'a' && e.p.out).now;
  assert.ok(events.find(e => e.type === 'complete').now - outAt < 100, 'decided as soon as the finalist is out');
});

test('tournament: a qualifier who is gone before the final is replaced by the next pilot in the qualifier', () => {
  const { events, summary } = runTournament({ a: { v: [150, 120], dropBetween: true }, b: { v: [140, 120] }, c: { v: [130, 150] }, d: { v: [100, 150] } });
  const note = events.find(e => e.type === 'notice' && e.p.kind === 'finalists').p;
  assert.deepEqual(note.dropped, ['a']); assert.deepEqual(note.promoted, ['c']); assert.deepEqual(note.finalists, ['b', 'c']);
  assert.deepEqual(events.filter(e => e.type === 'prepare')[1].p.grid.map(g => g.pid), ['b', 'c']); assert.equal(summary.winner, 'c');
});

test('tournament: walkover with one eligible pilot, no result with none; a pilot who never loads is left out', () => {
  const w = runTournament({ a: { v: [150, 150] }, b: { v: [120, 120], leaveAt: { stage: 1, t: 20 } } });
  assert.equal(w.summary.outcome, 'walkover'); assert.equal(w.summary.winner, 'a'); assert.equal(w.summary.stages.length, 1);
  assert.equal(w.events.filter(e => e.type === 'prepare').length, 1, 'no final is raced');
  const n = runTournament({ a: { v: [150, 150], dropAt: { stage: 1, t: 10 } }, b: { v: [120, 120], dropAt: { stage: 1, t: 10 } } });
  assert.equal(n.summary.outcome, 'no-result'); assert.equal(n.summary.winner, null); assert.deepEqual(n.summary.rewards, {});
  const nl = runTournament({ a: { v: [150, 150] }, b: { v: [140, 140] }, c: { v: [160, 160], noload: true } });
  const q = nl.events.find(e => e.type === 'results').p; assert.equal(q.rows.at(-1).pid, 'c'); assert.equal(q.rows.at(-1).reason, 'notloaded');
  assert.deepEqual(q.qualified, ['a', 'b']);
});

test('tournament: with nobody over the line in time the final goes to the pilot who got furthest', () => {
  const { summary } = runTournament({ a: { v: [150, 4] }, b: { v: [140, 5] } }, { maxMs: 6_000_000 });
  assert.equal(summary.outcome, 'distance'); assert.equal(summary.winner, 'b'); assert.equal(summary.stages[1].endReason, 'time-limit');
  assert.ok(!summary.rewards.b.lines.some(l => l.name.startsWith('Final')), 'an unfinished final pays no race reward');
});

test('lobbies: unique codes, unique names, host hand-over, ready checks and a rematch window', () => {
  const reg = new LobbyRegistry({ max: 2 });
  const l = reg.create({ pid: 'p1', name: 'ACE', ship: 'kestrel', paint: null }, { visibility: 'public' }, 0);
  l.add({ pid: 'p2', name: 'ACE', ship: 'wisp', paint: { primary: '#123456' } }, 1);
  assert.equal(l.members.get('p2').name, 'ACE 2', 'display names stay unique within a lobby');
  assert.equal(l.canStart('p2', false, 2), 'not-host'); assert.equal(l.canStart('p1', false, 2), 'not-ready');
  l.members.get('p1').ready = true; l.members.get('p2').ready = true; assert.equal(l.canStart('p1', false, 2), null);
  l.members.get('p2').conn = 'lost'; assert.equal(l.canStart('p1', false, 3), 'too-few');
  l.remove('p1'); assert.equal(l.host, 'p2');
  assert.deepEqual(reg.publicList(), [], 'a lobby with nobody connected is not listed');
  l.members.get('p2').conn = 'ok'; assert.equal(reg.publicList()[0].code, l.code);
  reg.create({ pid: 'p3', name: 'B', ship: 'kestrel' }, {}, 0); assert.equal(reg.create({ pid: 'p4', name: 'C', ship: 'kestrel' }, {}, 0), null, 'lobby limit');
  l.rematchUntil = 100; l.add({ pid: 'p5', name: 'D', ship: 'corsair' }, 50); l.members.get('p2').ready = false;
  assert.equal(l.canStart('p2', true, 60), null, 'rematch without new ready checks'); assert.equal(l.canStart('p2', true, 200), 'not-ready');
  assert.equal(trackInfo('ring').M, 9);
});
