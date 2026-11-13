// GALACTIC RUSH V10 — the championship calendar: still six rounds, but the player picks the six courses (and their
// order) from all eight. Runs carry their calendar, races must follow it, rewards are the same whatever the courses,
// saves keep it, V9 runs (no calendar of their own) keep the V9 calendar, and broken calendars never get in. Run with
// `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Progression } from '../src/progress/index.js';
import { MemoryStorage, KEYS } from '../src/progress/store.js';
import { validCalendar, calendarOf } from '../src/progress/profile.js';
import { AI_ROSTER, CHAMPIONSHIP, CHAMPIONSHIP_ROUNDS } from '../src/config.js';
import { TRACK_DEFS } from '../src/sim/tracks.js';

let clock = 1800000000000; const now = () => (clock += 1000);
const fresh = (storage = new MemoryStorage()) => ({ P: new Progression(storage, { now }), storage });
const order = place => { const n = AI_ROSTER.map(a => a.name); n.splice(place - 1, 0, 'YOU'); return n; };
const round = (P, run, track, place = 2, o = {}) => P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'champ', runId: run.runId, track, diff: run.diff, laps: run.laps, ship: run.ship, place, field: 6, order: order(place), ...o });
const PICK = ['nexus', 'canopy', 'ignara', 'foundry', 'pelagos', 'ring'];

test('a championship has six rounds; the player picks them from all eight courses, in any order', () => {
  assert.equal(CHAMPIONSHIP_ROUNDS, 6); assert.equal(TRACK_DEFS.length, 8);
  const { P } = fresh(), s = P.startRun({ diff: 'rookie', laps: 2, ship: 'kestrel', tracks: PICK });
  assert.ok(s.ok, s.message); assert.deepEqual(s.run.tracks, PICK);
  // a round on any other course than the next one in the calendar is refused
  assert.equal(round(P, s.run, 'foundry').code, 'bad-run'); assert.equal(round(P, s.run, 'canopy').code, 'bad-run');
  let last; for (const [k, id] of PICK.entries()) { last = round(P, P.activeRun(), id, 1 + (k % 3)); assert.ok(last.ok, last.message); assert.equal(last.champ.rounds, 6); }
  assert.ok(last.champ.done && last.completion && last.completion.ok, 'complete after round six, with its bonus');
  const done = P.profile.championships.runs.at(-1); assert.deepEqual(done.tracks, PICK, 'the finished run remembers its calendar'); assert.equal(done.results.map(r => r.track).join(), PICK.join());
});

test('rewards do not depend on the courses picked: the same places pay the same, round by round and in the bonus', () => {
  const pay = tracks => { const { P } = fresh(), s = P.startRun({ diff: 'rookie', laps: 3, ship: 'kestrel', tracks }); assert.ok(s.ok, s.message);
    const races = []; let last; for (const [k, id] of (tracks || CHAMPIONSHIP).entries()) { last = round(P, P.activeRun(), id, [1, 3, 2, 5, 1, 4][k]); races.push(last.credits); }
    return { races, total: last.completion.run.credits.total, tokens: P.wallet().ST }; };
  assert.deepEqual(pay(PICK), pay(undefined)); assert.deepEqual(pay(['canopy', 'nexus', 'belt', 'spire', 'ring', 'foundry']), pay(undefined));
});

test('only real calendars are accepted: six different known courses', () => {
  const { P } = fresh();
  for (const bad of [PICK.slice(0, 5), [...PICK, 'belt'], ['nexus', 'nexus', 'ignara', 'foundry', 'pelagos', 'ring'], ['nexus', 'canopy', 'ignara', 'foundry', 'pelagos', 'moon'], 'nexus', null, [1, 2, 3, 4, 5, 6]]) {
    const r = P.startRun({ diff: 'rookie', laps: 1, ship: 'kestrel', tracks: bad }); assert.equal(r.ok, false, `refused: ${JSON.stringify(bad)}`); assert.equal(P.activeRun(), null); }
  assert.deepEqual(validCalendar(PICK), PICK); assert.equal(validCalendar(PICK.slice(1)), null);
});

test('the calendar survives a reload; a V9 run without one keeps the V9 calendar; a damaged one is repaired', () => {
  { const { P, storage } = fresh(), s = P.startRun({ diff: 'rookie', laps: 1, ship: 'wisp', tracks: PICK }); round(P, s.run, PICK[0]);
    const P2 = new Progression(storage, { now }), a = P2.activeRun(); assert.deepEqual(a.tracks, PICK); assert.equal(a.round, 1);
    assert.ok(round(P2, a, PICK[1]).ok, 'the next round follows the saved calendar'); }
  { // a run saved by V9: no calendar field, two rounds done on the V9 calendar
    const { P, storage } = fresh(), s = P.startRun({ diff: 'rookie', laps: 1, ship: 'kestrel' }); round(P, s.run, CHAMPIONSHIP[0]); round(P, P.activeRun(), CHAMPIONSHIP[1]);
    const raw = JSON.parse(storage.getItem(KEYS.main)); delete raw.championships.active.tracks; storage.setItem(KEYS.main, JSON.stringify(raw));
    const P2 = new Progression(storage, { now }), a = P2.activeRun(); assert.deepEqual(calendarOf(a), CHAMPIONSHIP, 'V9 calendar');
    let last; for (let k = 2; k < 6; k++) { last = round(P2, P2.activeRun(), CHAMPIONSHIP[k]); assert.ok(last.ok, last.message); } assert.ok(last.completion.ok, 'completes after six rounds'); }
  { // tampered: a calendar with a duplicate and an unknown course is replaced by the V9 calendar, nothing crashes
    const { P, storage } = fresh(); P.startRun({ diff: 'rookie', laps: 1, ship: 'kestrel', tracks: PICK });
    const raw = JSON.parse(storage.getItem(KEYS.main)); raw.championships.active.tracks = ['nexus', 'nexus', 'x', 'y', 'z', 'w']; storage.setItem(KEYS.main, JSON.stringify(raw));
    const P2 = new Progression(storage, { now }); assert.deepEqual(P2.activeRun().tracks, CHAMPIONSHIP); }
});
