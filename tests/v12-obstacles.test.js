// GALACTIC RUSH V12 — the obstacles V12 adds to Pelagos and Orbital Nexus: every one reaches into the corridor (none is
// scenery pretending to be a hazard), leaves a free passage at every moment of its motion, keeps clear of the
// checkpoints, moves as a pure function of the race clock (so every client and the server see it in the same place),
// and AI fields at the lowest and the highest difficulty still finish full races through them in both handling modes.
// (That no ship passes through any of them at racing speed is tests/v12-collision.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { AI_ROSTER, DIFFICULTY, SIM_DT, shipById } from '../src/config.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { makeRng, clamp } from '../src/math.js';
import { buildPathTrack } from '../src/sim/pathtrack.js';
import { buildPathTrack10 } from '../src/sim/pathtrack10.js';

export const V12_BY_COURSE = { pelagos: ['riser', 'load', 'buoy', 'pipe', 'rackleg'], nexus: ['servo', 'door', 'conduit', 'main', 'sweeper', 'dockarm', 'radiator'] };
export const V12_KINDS = new Set(Object.values(V12_BY_COURSE).flat());
const TIMES = Array.from({ length: 40 }, (_, k) => k * 0.37); // 0 .. 14.4 s: every motion's full cycle (the slowest, the sweeper, turns once in 7 s)
const SHIP_R = 1.6, MARGIN = 2.5;

// where an obstacle is solid in the cross-section of its own sample: [x, y, r] (a beam: points along it)
function solidAt(t, o) {
  if (o.type === 'sphere') { const loc = {}; t.locate(o.p, o.i, loc, 12); return [[loc.x, loc.y, o.r, loc.along]]; }
  const pts = []; for (let f = -1.2; f <= 1.2; f += 0.05) pts.push(o.type === 'vbeam' ? [o.ox ?? o.x, f * t.h[o.i], o.r, 0] : [f * t.w[o.i], o.oy ?? o.y, o.r, 0]);
  return pts;
}

for (const id of Object.keys(V12_BY_COURSE)) {
  test(`${TRACK_DEFS.find(d => d.id === id).name}: V12's obstacles reach into the corridor, leave a passage at every moment, keep checkpoints clear`, () => {
    const t = getTrack(id), mine = t.obstacles.filter(o => V12_KINDS.has(o.kind));
    assert.deepEqual([...new Set(mine.map(o => o.kind))].sort(), [...V12_BY_COURSE[id]].sort(), 'every V12 obstacle kind is on the course');
    const samples = [...new Set(mine.map(o => o.i))];
    for (const i of samples) for (const c of t.cpIdx) { const d = Math.abs(((i - c) % t.N + t.N * 1.5) % t.N - t.N / 2); assert.ok(d > 2, `${id}: obstacle at ${i} stands ${d} samples from the checkpoint at ${c}`); }
    for (const time of TIMES) {
      t.updateObstacles(time);
      // every obstacle reaches into the corridor at some moment (checked over all times below)
      for (const o of mine) for (const [x, y, r, along] of solidAt(t, o)) if (Math.abs(along) <= t.D && Math.abs(x) < t.w[o.i] + r && Math.abs(y) < t.h[o.i] + r) o._in = true;
      // a free passage: in the cross-section of each obstacle's sample, some point keeps a ship and a margin clear of
      // every solid within two samples of it and of the walls
      for (const i of samples) {
        const near = t.obstacles.filter(o => Math.abs(((o.i - i) % t.N + t.N * 1.5) % t.N - t.N / 2) <= 2).flatMap(o => solidAt(t, o));
        let free = 0;
        for (let x = -t.w[i] + SHIP_R + 0.5; x <= t.w[i] - SHIP_R - 0.5; x += 1) for (let y = -t.h[i] + SHIP_R + 0.5; y <= t.h[i] - SHIP_R - 0.5; y += 1)
          if (near.every(([sx, sy, r]) => Math.hypot(x - sx, y - sy) > r + SHIP_R + MARGIN)) free++;
        assert.ok(free >= 12, `${id}: at sample ${i} at ${time.toFixed(2)} s only ${free} m² of the cross-section is free`);
      }
    }
    for (const o of mine) { assert.ok(o._in, `${id}: ${o.kind} at ${o.i} never reaches into the corridor`); delete o._in; }
    t.updateObstacles(0);
  });
}

test('V12 moving obstacles: their place is a function of the race clock alone (identical on every client and the server)', () => {
  for (const id of Object.keys(V12_BY_COURSE)) {
    const def = TRACK_DEFS.find(d => d.id === id), b = def.build === 'path10' ? buildPathTrack10(def) : buildPathTrack(def); def.populate(b, makeRng(def.seed)); // a fresh build, as another client makes it
    const a = getTrack(id), moving = a.obstacles.filter(o => V12_KINDS.has(o.kind) && o.move);
    if (id === 'pelagos') assert.ok(moving.some(o => o.kind === 'load') && moving.some(o => o.kind === 'buoy'), 'the crane load swings and the buoys bob');
    if (id === 'nexus') assert.ok(moving.some(o => o.kind === 'servo') && moving.some(o => o.kind === 'sweeper'), 'the servicing arm swings and the sweeper turns');
    for (const time of [0, 1.234, 7.5, 33.3, 120.01]) {
      a.updateObstacles(time); const pa = moving.map(o => o.p.clone());
      a.updateObstacles(time * 0.5); a.updateObstacles(time); // any history in between changes nothing
      moving.forEach((o, k) => assert.ok(o.p.dist(pa[k]) < 1e-9, `${id}: ${o.kind} at ${time} s depends on the clock only`));
      { b.updateObstacles(time); const mb = b.obstacles.filter(o => V12_KINDS.has(o.kind) && o.move); mb.forEach((o, k) => assert.ok(o.p.dist(pa[k]) < 1e-9, `${id}: a fresh build agrees`)); }
    }
    a.updateObstacles(0);
  }
});

// full AI fields as main.js builds them for a quick race, both handling modes, the easiest and the hardest level
function field(diffId, seed) {
  const d = DIFFICULTY[diffId], rng = makeRng(seed * 7919 + 13);
  return AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: clamp(d.skill[0] + (d.skill[1] - d.skill[0]) * a.bias + rng.range(-0.03, 0.03), 0.3, 1), drive: d.drive, ...(d.upgrades ? { def: effectiveDef(shipById(a.ship), d.upgrades) } : {}) }));
}
for (const id of Object.keys(V12_BY_COURSE)) for (const handling of [undefined, 'relaxed']) {
  test(`${TRACK_DEFS.find(d => d.id === id).name} (${handling || 'classic'}): Rookie and Legend fields finish two laps through the new obstacles`, () => {
    for (const diffId of ['rookie', 'legend']) {
      const race = new Race({ track: getTrack(id), laps: 2, racers: field(diffId, 5), mode: 'race', seed: 5, handling, countdown: 3.6 });
      let steps = 0, obsHits = 0;
      while (race.state !== 'finished' && steps < 120 * 900) { race.step(SIM_DT, null); steps++; for (const e of race.events.splice(0)) if (e.type === 'hit' && e.kind === 'obs' && e.power > 25) obsHits++; }
      assert.equal(race.state, 'finished', `${id} ${diffId}: the race ends`);
      assert.ok(race.racers.every(r => r.finished), `${id} ${diffId}: every rival finishes`);
      console.log(`  ${id} ${handling || 'classic'} ${diffId}: winner ${Math.min(...race.racers.map(r => r.finishTime)).toFixed(1)} s, ${race.racers.reduce((a, r) => a + (r.resp || 0), 0)} respawns, ${obsHits} hard obstacle hits`);
    }
  });
}
