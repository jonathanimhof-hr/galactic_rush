// V7 progression tests (no browser): rewards, championships, upgrades, paint jobs, inventory and shop, premium
// placeholders, the save system, and regression checks against V6 data. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Progression, standingsOf } from '../src/progress/index.js';
import { MemoryStorage, KEYS } from '../src/progress/store.js';
import { SINGLE_RACE, CHAMPIONSHIP_REWARDS, TIME_TRIAL, UPGRADES, LAP_MULT, lapMult, DIFF_ORDER } from '../src/progress/economy.js';
import { singleRaceReward, champRaceReward, champCompletionReward, trialReward, economyTable } from '../src/progress/rewards.js';
import { ITEMS, ITEM, PREMIUM_LABEL, defaultCustom, SLOT_DEFAULT } from '../src/progress/catalog.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { resolveLivery } from '../src/progress/customize.js';
import { createProfile, PROFILE_VERSION } from '../src/progress/profile.js';
import { SHIPS, AI_ROSTER, CHAMPIONSHIP, DIFFICULTY, POINTS } from '../src/config.js';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race, HANDLING } from '../src/sim/race.js';
import { buildShip } from '../src/render/models.js';

const ROOT = new URL('..', import.meta.url).pathname;
let clock = 1700000000000; const now = () => (clock += 1000);
const fresh = (storage = new MemoryStorage()) => ({ P: new Progression(storage, { now }), storage });
const order = place => { const n = AI_ROSTER.map(a => a.name); n.splice(place - 1, 0, 'YOU'); return n; };
const race = (P, o = {}) => P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'quick', track: 'foundry', diff: 'pro', laps: 3, ship: 'kestrel', place: 3, field: 6, time: 130, ...o });
function runChamp(P, diff, laps = 3, place = 2) {
  const s = P.startRun({ diff, laps, ship: 'kestrel' }); assert.ok(s.ok, s.message); const id = s.run.runId; let last;
  for (let k = 0; k < CHAMPIONSHIP.length; k++) { last = P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'champ', runId: id, track: CHAMPIONSHIP[k], diff, laps, ship: 'kestrel', place, field: 6, order: order(place) }); assert.ok(last.ok, last.message); }
  return { runId: id, last };
}
// give a test profile money the honest way: by racing (Ace, 5 laps, wins)
function earn(P, cr) { while (P.wallet().CR < cr) race(P, { diff: 'ace', laps: 5, place: 1 }); }
const SHIP_SNAPSHOT = JSON.stringify(SHIPS);

// ---------------- 16.1 single race rewards ----------------
test('single race reward = base x difficulty x laps x placement, from one central config', () => {
  for (const diff of DIFF_ORDER) for (const laps of [1, 2, 3, 5]) for (let place = 1; place <= 6; place++) {
    const r = singleRaceReward({ diff, laps, place });
    assert.equal(r.credits, Math.round(SINGLE_RACE.base * SINGLE_RACE.difficulty[diff] * LAP_MULT[laps] * SINGLE_RACE.placement[place - 1]));
    assert.ok(Number.isInteger(r.credits) && r.credits > 0, 'every finisher is paid a whole number of credits');
  }
  assert.deepEqual(SINGLE_RACE.difficulty, { rookie: 1.0, pro: 1.3, ace: 1.6 });
});
test('higher difficulty pays more; more laps pay more; better placement pays more; last place is still paid', () => {
  for (const laps of [1, 3, 5]) for (let p = 1; p <= 6; p++) {
    const [a, b, c] = DIFF_ORDER.map(diff => singleRaceReward({ diff, laps, place: p }).credits); assert.ok(a < b && b < c, `difficulty order at ${laps} laps P${p}`); }
  for (const diff of DIFF_ORDER) { const v = [1, 2, 3, 5].map(laps => singleRaceReward({ diff, laps, place: 3 }).credits); assert.ok(v.every((x, k) => !k || x > v[k - 1]), `laps increase reward (${v})`);
    const pl = [1, 2, 3, 4, 5, 6].map(place => singleRaceReward({ diff, laps: 3, place }).credits); assert.ok(pl.every((x, k) => !k || x < pl[k - 1]), `placement order (${pl})`);
    assert.ok(pl[5] >= pl[0] * 0.7, 'P6 earns at least 70% of a win: lower places are still rewarded'); }
  // lap counts the game offers keep credits per minute nearly flat (measured ~45 s laps + ~25 s per race overhead)
  const perMin = [1, 2, 3, 5].map(l => lapMult(l) / ((l * 45 + 25) / 60)); assert.ok(Math.max(...perMin) / Math.min(...perMin) < 1.25, `credits per minute across lap counts ${perMin.map(x => x.toFixed(3))}`);
});
test('a completed single race grants credits, and replaying the same race pays every time', () => {
  const { P } = fresh(); const pay = singleRaceReward({ diff: 'pro', laps: 3, place: 3 }).credits; let last = 0;
  for (let k = 0; k < 5; k++) { const r = race(P); assert.ok(r.ok, r.message); assert.equal(r.credits, pay); assert.equal(P.wallet().CR, last + pay); last = P.wallet().CR; }
  assert.equal(P.profile.stats.byTrack.foundry.races, 5); assert.equal(P.profile.stats.byMode.quick.races, 5);
});
test('the same completion event is paid once: re-processing, reopening results and reloading do not pay again', () => {
  const { P, storage } = fresh(); const id = P.newRaceId(), ctx = { finished: true, raceId: id, mode: 'quick', track: 'belt', diff: 'ace', laps: 2, ship: 'wisp', place: 1, field: 6 };
  const a = P.completeRace(ctx), cr = P.wallet().CR, st = P.wallet().ST, w = storage.writes; assert.ok(a.ok);
  const b = P.completeRace(ctx); assert.equal(b.ok, false); assert.equal(b.code, 'duplicate'); assert.equal(P.wallet().CR, cr); assert.equal(P.wallet().ST, st);
  P.career(); P.catalog('wisp'); P.upgradeRows('wisp'); assert.equal(storage.writes, w, 'reading (as the results screen does) writes nothing');
  const P2 = new Progression(storage, { now }); const c = P2.completeRace(ctx); assert.equal(c.code, 'duplicate', 'after a reload the old event is still recognised'); assert.equal(P2.wallet().CR, cr);
});
test('a new race is never mistaken for an old one: ids are unique and not derived from course, difficulty or laps', () => {
  const { P } = fresh(), ids = new Set(); for (let k = 0; k < 5000; k++) ids.add(P.newRaceId()); assert.equal(ids.size, 5000);
  const r1 = race(P, { track: 'spire', diff: 'rookie', laps: 1 }), r2 = race(P, { track: 'spire', diff: 'rookie', laps: 1 }); assert.ok(r1.ok && r2.ok, 'identical settings, two races, two payments');
  const bad = P.completeRace({ finished: true, raceId: 'foundry-pro-3', mode: 'quick', track: 'foundry', diff: 'pro', laps: 3, ship: 'kestrel', place: 1, field: 6 }); assert.equal(bad.ok, false, 'a settings-shaped id is rejected');
});
test('rewards need a confirmed finish and valid data', () => {
  const { P } = fresh();
  assert.equal(P.completeRace({ raceId: P.newRaceId(), mode: 'quick', track: 'foundry', diff: 'pro', laps: 3, ship: 'kestrel', place: 1, field: 6 }).code, 'not-finished');
  for (const bad of [{ mode: 'drag' }, { track: 'moon' }, { ship: 'xwing' }, { place: 7 }, { place: 0 }, { laps: 0 }, { diff: 'extreme' }, { field: 9 }]) assert.equal(race(P, bad).ok, false, JSON.stringify(bad));
  assert.equal(P.wallet().CR, 0, 'nothing paid for invalid races');
});
test('time trials pay a small practice wage and never count as wins', () => {
  const { P } = fresh(); const r = race(P, { mode: 'trial', diff: undefined, place: 1, field: 1, laps: 3 });
  assert.ok(r.ok); assert.equal(r.credits, Math.round(TIME_TRIAL.base * lapMult(3))); assert.equal(P.profile.stats.wins, 0); assert.equal(P.profile.stats.byMode.trial.races, 1);
});
test('Style Tokens come from existing systems (wins, course records, championships) and one-time milestones', () => {
  const { P } = fresh(); const r = race(P, { place: 1, record: true });
  const ids = r.lines.map(l => l.id); assert.ok(ids.includes('raceWin') && ids.includes('courseRecord') && ids.includes('races-1') && ids.includes('wins-1'), ids.join());
  const r2 = race(P, { place: 4 }); assert.equal(r2.tokens, 0, 'no tokens for a plain P4, and milestones are paid once');
});

// ---------------- 16.2 championships ----------------
test('championship ladder: Rookie first, Rookie unlocks Pro, Pro unlocks Ace, Ace is the highest', () => {
  const { P } = fresh(); assert.deepEqual(P.profile.championships.unlocked, ['rookie']);
  assert.equal(P.startRun({ diff: 'pro', laps: 3, ship: 'kestrel' }).code, 'locked'); assert.equal(P.startRun({ diff: 'ace', laps: 3, ship: 'kestrel' }).code, 'locked');
  assert.equal(P.startRun({ diff: 'extreme', laps: 3, ship: 'kestrel' }).code, 'bad-diff', 'only the existing difficulty names');
  let c = runChamp(P, 'rookie').last.completion; assert.ok(c.ok); assert.equal(c.newlyUnlocked, 'pro'); assert.deepEqual(P.profile.championships.unlocked, ['rookie', 'pro']);
  c = runChamp(P, 'pro').last.completion; assert.equal(c.newlyUnlocked, 'ace'); assert.deepEqual(P.profile.championships.unlocked, ['rookie', 'pro', 'ace']);
  c = runChamp(P, 'ace').last.completion; assert.equal(c.newlyUnlocked, null); assert.equal(c.isHighest, true); assert.equal(c.next, null);
});
test('championship races use the championship reward table; completion bonus scales with difficulty', () => {
  for (const diff of DIFF_ORDER) for (let p = 1; p <= 6; p++) assert.equal(champRaceReward({ diff, laps: 3, place: p }).credits, Math.round(CHAMPIONSHIP_REWARDS.race.base * CHAMPIONSHIP_REWARDS.race.difficulty[diff] * CHAMPIONSHIP_REWARDS.race.placement[p - 1]));
  const b = DIFF_ORDER.map(diff => champCompletionReward({ diff, laps: 3, standing: 4 }).completion); assert.ok(b[0] < b[1] && b[1] < b[2], `completion ${b}`);
  const { P } = fresh(); const { last } = runChamp(P, 'rookie', 3, 2), run = last.completion.run;
  assert.equal(run.credits.races, 4 * champRaceReward({ diff: 'rookie', laps: 3, place: 2 }).credits);
  assert.equal(run.credits.completion, CHAMPIONSHIP_REWARDS.completion.rookie); assert.equal(run.credits.standing, Math.round(CHAMPIONSHIP_REWARDS.completion.rookie * CHAMPIONSHIP_REWARDS.standing[1]));
  assert.equal(P.wallet().CR, run.credits.total, 'the wallet holds exactly the run total');
});
test('a championship is worth more than the same number of single races, at every difficulty and length', () => {
  for (const r of economyTable()) assert.ok(r.champTotalP3 > r.fourSingles * 1.5, `${r.diff} ${r.laps} laps: ${r.champTotalP3} vs ${r.fourSingles}`);
  for (const r of economyTable()) assert.ok(r.champTotalP3 < r.fourSingles * 3, `${r.diff} ${r.laps} laps stays balanced against its time: ${r.champTotalP3} vs ${r.fourSingles}`);
});
test('a championship race pays once, from the championship table only (never also as a single race)', () => {
  const { P } = fresh(); const s = P.startRun({ diff: 'rookie', laps: 3, ship: 'kestrel' }), id = P.newRaceId();
  const ctx = { finished: true, raceId: id, mode: 'champ', runId: s.run.runId, track: CHAMPIONSHIP[0], diff: 'rookie', laps: 3, ship: 'kestrel', place: 1, field: 6, order: order(1) };
  const r = P.completeRace(ctx); assert.equal(r.credits, champRaceReward({ diff: 'rookie', laps: 3, place: 1 }).credits);
  assert.equal(P.completeRace({ ...ctx, mode: 'quick' }).code, 'duplicate', 'the same race cannot be paid again as a single race');
  assert.equal(P.completeRace({ ...ctx, raceId: P.newRaceId(), track: 'ring' }).code, 'bad-run', 'a race that does not match the run is rejected');
});
test('the completion bonus is paid once per run; replays with a new run pay again', () => {
  const { P, storage } = fresh(); const { runId, last } = runChamp(P, 'rookie'); const cr = P.wallet().CR, st = P.wallet().ST;
  assert.equal(P.completeRun(runId).code, 'duplicate'); assert.equal(P.completeRun(runId).code, 'duplicate'); assert.equal(P.wallet().CR, cr); assert.equal(P.wallet().ST, st);
  const P2 = new Progression(storage, { now }); assert.equal(P2.completeRun(runId).code, 'duplicate', 'after reload too'); assert.deepEqual(P2.profile.championships.unlocked, ['rookie', 'pro'], 'unlock not repeated or lost');
  const again = runChamp(P2, 'rookie'); assert.notEqual(again.runId, runId); assert.ok(again.last.completion.ok);
  assert.equal(P2.wallet().CR, cr + again.last.completion.run.credits.total, 'the replay earned its own full reward');
  assert.equal(P2.profile.championships.completed.rookie, 2); assert.equal(last.completion.run.status, 'completed');
});
test('championship progress survives a reload, including a run in progress', () => {
  const { P, storage } = fresh(); const s = P.startRun({ diff: 'rookie', laps: 2, ship: 'lancer' });
  P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'champ', runId: s.run.runId, track: CHAMPIONSHIP[0], diff: 'rookie', laps: 2, ship: 'lancer', place: 4, field: 6, order: order(4) });
  const P2 = new Progression(storage, { now }), a = P2.activeRun(); assert.equal(a.runId, s.run.runId); assert.equal(a.round, 1); assert.equal(a.ship, 'lancer');
  assert.equal(standingsOf(a.orders).points.YOU, POINTS[3], 'standings rebuilt from saved finishing orders');
});
test('a run interrupted between its last round and its bonus is completed once on the next load', () => {
  const { P, storage } = fresh(); const s = P.startRun({ diff: 'rookie', laps: 1, ship: 'kestrel' });
  const raw = JSON.parse(storage.getItem(KEYS.main)), a = raw.championships.active; a.round = 4; a.orders = [0, 1, 2, 3].map(() => order(1)); a.results = [0, 1, 2, 3].map(k => ({ round: k, track: CHAMPIONSHIP[k], place: 1, points: 10, credits: 0 }));
  storage.setItem(KEYS.main, JSON.stringify(raw));
  const P2 = new Progression(storage, { now }); assert.equal(P2.activeRun(), null); assert.equal(P2.profile.championships.completed.rookie, 1); const cr = P2.wallet().CR; assert.ok(cr > 0);
  const P3 = new Progression(storage, { now }); assert.equal(P3.wallet().CR, cr, 'not paid twice'); void s;
});
test('abandoning a run pays no bonus and frees the slot for a new run; single races stay open at every difficulty', () => {
  const { P } = fresh(); const s = P.startRun({ diff: 'rookie', laps: 3, ship: 'kestrel' });
  assert.equal(P.startRun({ diff: 'rookie', laps: 3, ship: 'kestrel' }).code, 'active-run');
  assert.ok(P.abandonRun(s.run.runId).ok); assert.equal(P.profile.championships.runs.at(-1).status, 'abandoned'); assert.equal(P.wallet().CR, 0);
  assert.ok(P.startRun({ diff: 'rookie', laps: 3, ship: 'kestrel' }).ok);
  for (const diff of DIFF_ORDER) assert.ok(race(P, { diff }).ok, `quick race at ${diff} while the ${diff} championship is ${P.champUnlocked(diff) ? 'open' : 'locked'}`);
});

// ---------------- 16.3 upgrades ----------------
test('upgrade costs come from the central curve; level 5 is the maximum; credits are required', () => {
  assert.deepEqual(UPGRADES.costs, [500, 900, 1500, 2400, 3600]);
  const { P } = fresh(); const r0 = P.buyUpgrade('kestrel', 'engine', 0); assert.equal(r0.code, 'funds'); assert.equal(P.upgrades('kestrel').engine, 0, 'nothing changes without funds');
  earn(P, 9000); let spent = 0;
  for (let lv = 0; lv < 5; lv++) { const before = P.wallet().CR, r = P.buyUpgrade('kestrel', 'engine', lv); assert.ok(r.ok, r.message); assert.equal(r.level, lv + 1); assert.equal(before - P.wallet().CR, UPGRADES.costs[lv]); spent += r.cost; }
  assert.equal(spent, 8900); const r6 = P.buyUpgrade('kestrel', 'engine', 5); assert.equal(r6.code, 'max'); assert.equal(P.upgrades('kestrel').engine, 5);
});
test('a second press of the same upgrade button cannot buy a second level', () => {
  const { P } = fresh(); earn(P, 2000); assert.ok(P.buyUpgrade('wisp', 'boost', 0).ok); const cr = P.wallet().CR;
  assert.equal(P.buyUpgrade('wisp', 'boost', 0).code, 'stale'); assert.equal(P.wallet().CR, cr); assert.equal(P.upgrades('wisp').boost, 1);
});
test('effective stats: base + levels, recomputed from base every time; base stats never change', () => {
  const k = SHIPS[0], { P } = fresh(); earn(P, 25000);
  for (const c of ['engine', 'accel', 'handling', 'boost', 'stability']) for (let lv = 0; lv < 2; lv++) assert.ok(P.buyUpgrade('kestrel', c, lv).ok);
  const e = P.effectiveDef('kestrel'), s = UPGRADES.curve[2];
  assert.ok(Math.abs(e.maxSpeed - k.maxSpeed * (1 + 0.05 * s)) < 1e-9); assert.ok(Math.abs(e.accel - k.accel * (1 + 0.15 * s)) < 1e-9);
  assert.ok(Math.abs(e.yawRate - k.yawRate * (1 + 0.08 * s)) < 1e-9); assert.ok(Math.abs(e.boostMult - (k.boostMult + 0.04 * s)) < 1e-9); assert.ok(Math.abs(e.hull - k.hull * (1 + 0.15 * s)) < 1e-9);
  assert.equal(e.radius, k.radius, 'collision sphere unchanged');
  for (let n = 0; n < 200; n++) P.effectiveDef('kestrel'); assert.deepEqual(P.effectiveDef('kestrel'), e, 'no accumulation');
  assert.equal(JSON.stringify(SHIPS), SHIP_SNAPSHOT, 'config.js base stats untouched');
});
test('upgrades reach the race physics exactly once, however often a race is started or reset', () => {
  const { P } = fresh(); earn(P, 3000); assert.ok(P.buyUpgrade('kestrel', 'engine', 0).ok); assert.ok(P.buyUpgrade('kestrel', 'engine', 1).ok);
  const mk = () => new Race({ track: getTrack('foundry'), laps: 1, handling: 'relaxed', countdown: 0, seed: 3, racers: [...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.8 })), { name: 'YOU', shipId: 'kestrel', isPlayer: true, def: P.effectiveDef('kestrel') }] });
  const want = SHIPS[0].maxSpeed * (1 + 0.05 * UPGRADES.curve[2]) * HANDLING.relaxed.speed, r = mk();
  for (let k = 0; k < 5; k++) { assert.ok(Math.abs(r.player.ship.def.maxSpeed - want) < 1e-9, `start ${k}`); r.reset(); }
  for (let k = 0; k < 5; k++) assert.ok(Math.abs(mk().player.ship.def.maxSpeed - want) < 1e-9);
  // AI pilots and difficulty are untouched by the player's upgrades
  const ai = r.racers.filter(x => !x.isPlayer); for (const a of ai) { const base = SHIPS.find(s => s.id === a.ship.def.id); assert.ok(Math.abs(a.ship.def.maxSpeed - base.maxSpeed * HANDLING.relaxed.speed) < 1e-9, a.name); }
  assert.deepEqual(DIFFICULTY, JSON.parse(readFileSync(new URL('specs/v6-gameplay.json', import.meta.url))).difficulty);
});
test('upgrades persist after reload and each ship keeps its own profile', () => {
  const { P, storage } = fresh(); earn(P, 3000); assert.ok(P.buyUpgrade('halberd', 'stability', 0).ok); assert.ok(P.buyUpgrade('halberd', 'accel', 0).ok);
  const P2 = new Progression(storage, { now }); assert.deepEqual(P2.upgrades('halberd'), { engine: 0, accel: 1, handling: 0, boost: 0, stability: 1 });
  for (const s of SHIPS) if (s.id !== 'halberd') assert.deepEqual(P2.upgrades(s.id), { engine: 0, accel: 0, handling: 0, boost: 0, stability: 0 }, s.id);
});

// ---------------- 16.4 customization ----------------
test('primary, secondary and accent colours are stored per ship and reach the hull shader uniforms', () => {
  const { P, storage } = fresh(); const c = { ...P.custom('corsair'), primary: '#112233', secondary: '#445566', accent: '#778899' };
  assert.ok(P.setCustom('corsair', c).ok);
  const L = resolveLivery('corsair', P.custom('corsair')), d = [...L.custom.data].map(v => Math.round(v * 255));
  assert.deepEqual(d.slice(0, 3), [0x11, 0x22, 0x33]); assert.deepEqual(d.slice(3, 6), [0x44, 0x55, 0x66]); assert.deepEqual(d.slice(6, 9), [0x77, 0x88, 0x99]);
  assert.equal(new Progression(storage, { now }).custom('corsair').secondary, '#445566', 'persists after reload');
  assert.equal(P.custom('kestrel').primary, defaultCustom('kestrel').primary, 'other ships keep their own paint');
  assert.equal(P.setCustom('corsair', { ...c, primary: 'red' }).code, 'invalid'); assert.equal(P.custom('corsair').primary, '#112233', 'invalid colour rejected, nothing changed');
});
test('patterns and finishes map to the hull shader; stock paint is the exact V6 livery', () => {
  const { P } = fresh(); earn(P, 3000); assert.ok(P.buyItem('pattern.chevron').ok); assert.ok(P.buyItem('finish.matte').ok);
  assert.ok(P.setCustom('kestrel', { ...P.custom('kestrel'), pattern: 'pattern.chevron', finish: 'finish.matte' }).ok);
  const L = resolveLivery('kestrel', P.custom('kestrel')); assert.equal(L.custom.pattern, 4); assert.equal(L.custom.finish, 1);
  for (const s of SHIPS) { const f = resolveLivery(s.id, defaultCustom(s.id)), mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    assert.equal(f.custom, null, 'factory paint takes the V6 shader path'); assert.deepEqual(f.stripe, [...mix(s.accent, [1, 1, 1], 0.25), 0.11]); assert.deepEqual(f.band, mix(s.accent, [0, 0, 0], 0.15)); }
});
test('cosmetics never change gameplay stats', () => {
  const { P } = fresh(); earn(P, 6000); const before = JSON.stringify(SHIPS.map(s => P.effectiveDef(s.id)));
  for (const id of ['pattern.chevron', 'finish.metallic', 'exhaust.plasma', 'trail.neon', 'paint.glacier']) assert.ok(P.buyItem(id).ok, id);
  for (const s of SHIPS) for (const id of ['pattern.chevron', 'finish.metallic', 'exhaust.plasma', 'trail.neon', 'paint.glacier']) assert.ok(P.equip(s.id, id).ok);
  assert.equal(JSON.stringify(SHIPS.map(s => P.effectiveDef(s.id))), before);
  for (const it of ITEMS) for (const k of ['maxSpeed', 'accel', 'yawRate', 'grip', 'boostCap', 'hull', 'mass', 'radius']) assert.ok(!(k in it) && !(k in (it.render || {})), `${it.id} has no ${k}`);
});
test('locked items cannot be applied (preview only)', () => {
  const { P } = fresh(); assert.equal(P.equip('kestrel', 'pattern.camo').code, 'locked');
  assert.equal(P.setCustom('kestrel', { ...P.custom('kestrel'), finish: 'finish.brushed' }).code, 'invalid'); assert.equal(P.custom('kestrel').finish, SLOT_DEFAULT.finish);
});

// ---------------- 16.5 inventory and shop ----------------
test('shop: correct currency, insufficient funds, duplicates, double execution, persistence, no currency mix-ups', () => {
  const { P, storage } = fresh();
  assert.equal(P.buyItem('pattern.double').code, 'funds'); assert.equal(P.isUnlocked('pattern.double'), false, 'no unlock without funds');
  earn(P, 1000); const cr = P.wallet().CR, st = P.wallet().ST;
  const r = P.buyItem('pattern.double'); assert.ok(r.ok); assert.equal(P.wallet().CR, cr - 600); assert.equal(P.wallet().ST, st, 'a Credits item never touches Style Tokens');
  assert.equal(P.buyItem('pattern.double').code, 'owned'); assert.equal(P.wallet().CR, cr - 600, 'second click: no second charge');
  const stItem = ITEMS.find(i => i.currency === 'ST' && i.price > P.wallet().ST); assert.equal(P.buyItem(stItem.id).code, 'funds', 'plenty of Credits cannot pay a Style Token price');
  assert.equal(P.wallet().CR, cr - 600);
  while (P.wallet().ST < 4) race(P, { place: 1, record: true }); const cr2 = P.wallet().CR, st2 = P.wallet().ST;
  assert.ok(P.buyItem('pattern.hex').ok); assert.equal(P.wallet().ST, st2 - 4); assert.equal(P.wallet().CR, cr2, 'a Style Token item never touches Credits');
  assert.ok(P.equip('lancer', 'pattern.hex').ok); assert.equal(P.itemState(ITEM['pattern.hex'], 'lancer').status, 'equipped'); assert.equal(P.itemState(ITEM['pattern.hex'], 'kestrel').status, 'owned');
  const P2 = new Progression(storage, { now }); assert.ok(P2.isUnlocked('pattern.double') && P2.isUnlocked('pattern.hex')); assert.equal(P2.custom('lancer').pattern, 'pattern.hex');
  assert.equal(P2.buyItem('pattern.solid').code, 'not-for-sale'); assert.equal(P2.buyItem('pattern.hazard').code, 'not-for-sale', 'special items are earned, not sold');
});
test('special items unlock through play: Rookie championship -> Industrial Hazard', () => {
  const { P } = fresh(); assert.equal(P.isUnlocked('pattern.hazard'), false);
  const c = runChamp(P, 'rookie').last.completion; assert.ok(c.unlocks.includes('pattern.hazard')); assert.ok(P.equip('kestrel', 'pattern.hazard').ok);
});

// ---------------- 16.6 premium placeholders and no payments ----------------
test('premium placeholders: visible, locked, not purchasable with either currency, never unlocked, no advantage', () => {
  const prem = ITEMS.filter(i => i.class === 'premium'); assert.deepEqual(prem.map(i => i.name).sort(), ['Premium Carbon Skin', 'Premium Championship Finish', 'Premium Neon Skin', 'Premium Plasma Pattern']);
  assert.equal(PREMIUM_LABEL, 'Premium Cosmetic — Coming Soon');
  const { P, storage } = fresh(); earn(P, 50000); while (P.wallet().ST < 200) race(P, { place: 1, record: true }); const w = P.wallet();
  for (const it of prem) { assert.equal(it.price, null); assert.equal(it.currency, null); const s = P.itemState(it, 'kestrel'); assert.equal(s.status, 'premium'); assert.equal(s.unlocked, false); assert.equal(s.canBuy, false);
    assert.equal(P.buyItem(it.id).code, 'premium'); const e = P.equip('kestrel', it.id); assert.equal(e.ok, false); assert.ok(['premium', 'unknown'].includes(e.code), e.code); }
  assert.deepEqual(P.wallet(), w, 'no currency moved');
  runChamp(P, 'rookie'); runChamp(P, 'pro'); runChamp(P, 'ace', 3, 1); for (const it of prem) assert.equal(P.isUnlocked(it.id), false, 'not unlocked by any progress');
  const raw = JSON.parse(storage.getItem(KEYS.main)); raw.inventory.unlocked.push(...prem.map(i => i.id)); raw.ships.kestrel.custom.pattern = 'premium.plasma-pattern'; storage.setItem(KEYS.main, JSON.stringify(raw));
  const P2 = new Progression(storage, { now }); for (const it of prem) assert.equal(P2.isUnlocked(it.id), false, 'a tampered save cannot grant premium items'); assert.equal(P2.custom('kestrel').pattern, SLOT_DEFAULT.pattern);
});
test('no real-money payment code anywhere in the game', () => {
  const files = [], walk = d => { for (const f of readdirSync(d)) { const p = d + '/' + f; if (statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(f)) files.push(p); } };
  walk(ROOT + 'src'); files.push(ROOT + 'index.html'); assert.ok(files.length > 30, `scanned ${files.length} files`);
  const banned = [/PaymentRequest/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /checkout/i, /paypal/i, /stripe\.com|Stripe\(/, /apple\s?pay|google\s?pay/i, /card\s?number|cvv|cvc\b/i, /autocomplete=["']cc-/i, /billing/i, /in-app purchase/i, /\$\s?\d+(\.\d\d)?\b/, /\bUSD\b|\bEUR\b|€/];
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const b of banned) assert.ok(!b.test(t), `${f.replace(ROOT, '')} matches ${b}`); }
});

// ---------------- save system ----------------
test('save data is versioned JSON in its own key; v0 data migrates', () => {
  const { P, storage } = fresh(); race(P); const raw = JSON.parse(storage.getItem(KEYS.main)); assert.equal(raw.version, PROFILE_VERSION); assert.equal(raw.wallet.CR, P.wallet().CR);
  const v0 = { credits: 1234, styleTokens: 7, ships: { wisp: { upgrades: { engine: 2, acceleration: 1 }, customization: { primaryColor: '#00E5FF', secondaryColor: '#18243A', accentColor: '#FF3DCE', pattern: 'solid' } } },
    inventory: { unlockedCosmetics: ['pattern.chevron'] }, championships: { unlockedDifficulties: ['rookie', 'pro'], completedRuns: [{ difficulty: 'rookie' }] }, statistics: { racesCompleted: 12, racesWon: 3, podiums: 5 } };
  const s2 = new MemoryStorage({ [KEYS.main]: JSON.stringify(v0) }), P2 = new Progression(s2, { now });
  assert.equal(P2.loadStatus, 'migrated'); assert.deepEqual(P2.wallet(), { CR: 1234, ST: 7 }); assert.equal(P2.upgrades('wisp').engine, 2); assert.equal(P2.upgrades('wisp').accel, 1);
  assert.equal(P2.custom('wisp').primary, '#00e5ff'); assert.ok(P2.isUnlocked('pattern.chevron')); assert.deepEqual(P2.profile.championships.unlocked, ['rookie', 'pro']); assert.equal(P2.profile.stats.races, 12);
  assert.equal(JSON.parse(s2.getItem(KEYS.main)).version, PROFILE_VERSION, 'migrated data is saved back as v1');
});
test('damaged data is validated and repaired; unreadable data recovers from the backup', () => {
  const bad = { version: 1, wallet: { CR: -50, ST: 'lots' }, ships: { kestrel: { upgrades: { engine: 9, accel: -2, handling: 2.5 }, custom: { primary: 'blue', pattern: 'pattern.camo' } }, ufo: {} },
    inventory: { unlocked: ['pattern.nope', 'premium.neon-skin'] }, championships: { unlocked: ['rookie', 'pro', 'ace'], completed: { rookie: 0 } }, stats: { races: 2, wins: 5, podiums: 1 }, ledger: { seen: ['<script>'] } };
  const P = new Progression(new MemoryStorage({ [KEYS.main]: JSON.stringify(bad) }), { now }), issues = P.loadIssues.join('\n');
  assert.deepEqual(P.wallet(), { CR: 0, ST: 0 }); assert.deepEqual(P.upgrades('kestrel'), { engine: 5, accel: 0, handling: 3, boost: 0, stability: 0 });
  assert.equal(P.custom('kestrel').primary, defaultCustom('kestrel').primary); assert.equal(P.custom('kestrel').pattern, SLOT_DEFAULT.pattern, 'equipped but locked item reset');
  assert.deepEqual(P.profile.championships.unlocked, ['rookie'], 'unlocks must agree with completion records'); assert.ok(P.profile.stats.wins <= P.profile.stats.podiums);
  assert.ok(!('ufo' in P.profile.ships)); assert.equal(P.profile.ledger.seen.length, 0); for (const k of ['invalid amount', 'unknown ship', 'not unlocked', 'cannot be unlocked', 'corrected']) assert.ok(issues.includes(k), k);
  // corruption: the backup from the last good load is restored and the damaged text kept
  const st = new MemoryStorage(), A = new Progression(st, { now }); race(A); new Progression(st, { now }); const good = A.wallet().CR;
  st.setItem(KEYS.main, '{"version":1,"wallet":{"CR":'); const B = new Progression(st, { now }); assert.equal(B.loadStatus, 'recovered'); assert.equal(B.wallet().CR, good); assert.ok(st.getItem(KEYS.damaged).startsWith('{"version"'));
  const C = new Progression(new MemoryStorage({ [KEYS.main]: 'garbage', [KEYS.backup]: 'also garbage' }), { now }); assert.equal(C.loadStatus, 'reset'); assert.deepEqual(C.wallet(), { CR: 0, ST: 0 });
});
test('a profile from a newer version is left untouched; storage failures never break the game', () => {
  const st = new MemoryStorage({ [KEYS.main]: JSON.stringify({ version: 99, wallet: { CR: 5 } }) }), P = new Progression(st, { now }); race(P);
  assert.equal(P.loadStatus, 'readonly'); assert.equal(JSON.parse(st.getItem(KEYS.main)).version, 99, 'future data not overwritten');
  const f = new MemoryStorage(); f.fail = true; const Q = new Progression(f, { now }); const r = race(Q); assert.ok(r.ok); assert.equal(r.saved, false); assert.ok(Q.wallet().CR > 0, 'the game carries on in memory');
});
test('no storage writes while racing: one write per transaction', () => {
  const { P, storage } = fresh(); const w0 = storage.writes, R = new Race({ track: getTrack('ring'), laps: 1, countdown: 0, seed: 1, autopilot: true, racers: [{ name: 'YOU', shipId: 'kestrel', isPlayer: true, def: P.effectiveDef('kestrel') }] });
  for (let k = 0; k < 120 * 20; k++) R.step(1 / 120, null); assert.equal(storage.writes, w0, 'twenty seconds of racing, no writes');
  race(P); assert.equal(storage.writes, w0 + 1);
});
test('committed state is read-only to the UI', () => {
  const { P } = fresh(); assert.throws(() => { P.profile.wallet.CR = 1e6; }); assert.throws(() => { P.profile.ships.kestrel.upgrades.engine = 5; }); assert.equal(P.wallet().CR, 0);
});

// ---------------- regression: V6 gameplay data and ship meshes ----------------
test('tracks, handling modes, ships, difficulty, championship and AI roster are exactly V6', () => {
  const v6 = JSON.parse(readFileSync(new URL('specs/v6-gameplay.json', import.meta.url)));
  const h = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
  for (const d of TRACK_DEFS) { const t = getTrack(d.id), e = v6.tracks[d.id];
    assert.equal(t.N, e.N); assert.equal(+t.length.toFixed(6), e.length); assert.equal(h(t.pos.map(p => [p.x, p.y, p.z].map(v => v.toFixed(4)).join(',')).join(';')), e.pos, `${d.id} centreline`);
    assert.equal(h(t.w.join(',')), e.w); assert.equal(h(t.h.join(',')), e.h); assert.equal(t.cpS.join(','), e.cp); assert.equal(t.obstacles.length, e.obstacles); }
  assert.deepEqual(JSON.parse(JSON.stringify(HANDLING)), v6.handling); assert.deepEqual(JSON.parse(JSON.stringify(SHIPS)), v6.ships); assert.deepEqual(DIFFICULTY, v6.difficulty);
  assert.deepEqual(CHAMPIONSHIP, v6.championship); assert.deepEqual(POINTS, v6.points); assert.deepEqual(AI_ROSTER, v6.ai);
});
test('ship meshes are exactly V6 (silhouettes, normals, colours, control surfaces); only paint-region tags were added', () => {
  const v6 = JSON.parse(readFileSync(new URL('specs/ships-geometry-v6.json', import.meta.url))).ships;
  const h = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 16);
  for (const s of SHIPS) { const m = buildShip(s), e = v6[s.id];
    assert.equal(h(m.geo.pos), e.pos, `${s.id} positions`); assert.equal(h(m.geo.nor), e.nor); assert.equal(h(m.geo.col), e.col); assert.equal(h(m.geo.idx), e.idx); assert.equal(m.tris, e.tris);
    assert.deepEqual(m.flaps.map(f => h(f.mesh.pos) + ':' + h(f.mesh.idx)), e.flaps);
    const det = new Set(); for (let k = 3; k < m.geo.mat.length; k += 4) det.add(Math.round(m.geo.mat[k] * 10) / 10); assert.ok([...det].every(d => [0, 0.4, 1, 1.1, 1.2, 1.3, 2].includes(d)), `${s.id} detail codes ${[...det]}`);
    let r = 0; for (let k = 0; k < m.geo.pos.length; k += 3) r = Math.max(r, Math.hypot(m.geo.pos[k], m.geo.pos[k + 1], m.geo.pos[k + 2])); assert.ok(r <= 2.3 + 1e-4, `${s.id} still inside its collision budget`); }
});
