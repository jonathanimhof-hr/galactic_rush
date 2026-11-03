import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { createShipState, stepFlight, shipAxes } from '../src/sim/flight.js';
import { SHIPS, AI_ROSTER, SIM_DT, POINTS } from '../src/config.js';
import { Vec3 } from '../src/math.js';
import { Championship } from '../src/sim/championship.js';

const noCtrl = { pitch: 0, yaw: 0, roll: 0 };
const field = (skillLo = 0.7, skillHi = 1.0, autopilot = true) => [
  { name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 },
  ...AI_ROSTER.map((a, k) => ({ name: a.name, shipId: a.ship, skill: skillLo + (skillHi - skillLo) * a.bias })),
].map(r => ({ ...r, isPlayer: autopilot ? r.isPlayer : r.isPlayer }));

test('every course builds a valid, non-self-intersecting corridor', () => {
  for (const d of TRACK_DEFS) {
    const t = getTrack(d.id);
    assert.ok(t.N > 800, `${d.id} has enough samples`);
    let minR = Infinity;
    for (let i = 0; i < t.N; i++) {
      assert.ok(Math.abs(t.tan[i].len() - 1) < 1e-6 && Math.abs(t.tan[i].dot(t.bin[i])) < 1e-6 && Math.abs(t.nrm[i].dot(t.tan[i])) < 1e-6, 'orthonormal frame');
      const rLat = 1 / Math.max(Math.abs(t.kLat[i]), 1e-6);
      minR = Math.min(minR, rLat - t.w[i]);
      assert.ok(t.pos[i].dist(t.pos[(i + 1) % t.N]) < t.D * 1.05, 'continuous closed loop');
    }
    assert.ok(minR > 15, `${d.id}: inner wall radius stays positive (${minR.toFixed(1)})`);
    for (let i = 0; i < t.N; i += 2) for (let j = i + 2; j < t.N; j += 2) {
      const gap = Math.min(j - i, t.N - (j - i)) * t.D;
      const need = Math.max(t.w[i], t.h[i]) + Math.max(t.w[j], t.h[j]);
      if (gap > need * 2.2) assert.ok(t.pos[i].dist(t.pos[j]) > need, `${d.id}: corridor overlap at ${i}/${j}`);
    }
    assert.ok(t.pads.length >= 4 && t.cells.length >= 12, `${d.id} has pickups`);
    console.log(`  ${d.name}: length ${t.length.toFixed(0)}, ${t.obstacles.length} obstacles, ${t.lasers.length} lasers, ${t.traffic.length} traffic lanes, min inner radius ${minR.toFixed(0)}`);
  }
});

test('flight: throttle, top speed, brake, boost consumption and regeneration', () => {
  const s = createShipState(SHIPS[0]);
  const env = { up: new Vec3(0, 1, 0) };
  for (let k = 0; k < 120 * 6; k++) stepFlight(s, noCtrl, SIM_DT, env);
  assert.ok(Math.abs(s.vel.len() - SHIPS[0].maxSpeed) < 1, 'reaches top speed');
  s.throttle = 0.5;
  for (let k = 0; k < 120 * 4; k++) stepFlight(s, noCtrl, SIM_DT, env);
  assert.ok(Math.abs(s.vel.len() - SHIPS[0].maxSpeed * 0.5) < 2, 'throttle lever sets cruise speed');
  s.throttle = 1;
  for (let k = 0; k < 120 * 2.5; k++) stepFlight(s, { ...noCtrl, boost: true }, SIM_DT, env);
  assert.ok(s.boost < SHIPS[0].boostCap, 'boost drains energy');
  const boostTop = s.vel.len();
  assert.ok(boostTop > SHIPS[0].maxSpeed * 1.15, `boost raises speed (${boostTop.toFixed(0)})`);
  const e0 = s.boost;
  for (let k = 0; k < 120 * 2; k++) stepFlight(s, noCtrl, SIM_DT, env);
  assert.ok(s.boost > e0, 'boost regenerates');
  for (let k = 0; k < 120 * 1; k++) stepFlight(s, { ...noCtrl, brake: true }, SIM_DT, env);
  assert.ok(s.vel.len() < 60, 'brake slows the ship hard');
});

test('flight: steering changes heading; drift increases slip; frame-rate independent', () => {
  const run = (dt, ctrl, secs) => {
    const s = createShipState(SHIPS[0]); s.vel.set(0, 0, 150);
    let maxSlip = 0;
    for (let k = 0; k < secs / dt; k++) { stepFlight(s, ctrl, dt, { up: new Vec3(0, 1, 0) }); maxSlip = Math.max(maxSlip, s.slip); }
    const f = new Vec3(), u = new Vec3(); shipAxes(s.quat, f, u);
    return { s, f, maxSlip };
  };
  const right = run(SIM_DT, { ...noCtrl, yaw: 1 }, 0.5);
  assert.ok(right.f.x < -0.3, 'yaw right turns toward -X (right)');
  const up = run(SIM_DT, { ...noCtrl, pitch: 1 }, 0.5);
  assert.ok(up.f.y > 0.3, 'pitch up raises the nose');
  const drift = run(SIM_DT, { ...noCtrl, yaw: 1, drift: true }, 0.8), grip = run(SIM_DT, { ...noCtrl, yaw: 1 }, 0.8);
  assert.ok(drift.maxSlip > grip.maxSlip * 2, 'drift slides more than gripping turn');
  const a = run(1 / 60, { ...noCtrl, yaw: 0.6, pitch: 0.3 }, 2), b = run(1 / 240, { ...noCtrl, yaw: 0.6, pitch: 0.3 }, 2);
  assert.ok(a.s.pos.dist(b.s.pos) < 0.025 * 300, `60Hz vs 240Hz positions agree within 2.5% of distance flown (${a.s.pos.dist(b.s.pos).toFixed(2)})`);
});

test('checkpoints must be passed in order; laps count only going forward', () => {
  const t = getTrack('foundry');
  const race = new Race({ track: t, laps: 2, racers: [{ name: 'P', shipId: 'kestrel', isPlayer: true }], countdown: 0 });
  const r = race.player, dt = SIM_DT, ev = [];
  // drive backwards first: no checkpoint/lap credit
  let s = r.s;
  for (let k = 0; k < 400; k++) { s -= 1.2; t.pointAt(Math.floor(s / t.D), 0, 0, r.ship.pos); race.time += dt; race.collideTrack(r); race.updateProgress(r, dt); }
  assert.equal(r.lap, 0); assert.equal(r.cpNext, 0);
  // now drive forward along the centerline
  for (let k = 0; k < 20000 && !r.finished; k++) {
    s += 1.5; t.pointAt(Math.floor(((s % t.length) + t.length) % t.length / t.D), 0, 0, r.ship.pos);
    race.time += dt; race.collideTrack(r); race.updateProgress(r, dt);
    ev.push(...race.events.splice(0));
  }
  const cps = ev.filter(e => e.type === 'checkpoint').map(e => e.cp);
  const M = t.cpS.length;
  assert.deepEqual(cps, [...Array(M - 1).keys()].map(k => k + 1).concat([...Array(M - 1).keys()].map(k => k + 1)), 'checkpoints fire in order each lap');
  assert.equal(ev.filter(e => e.type === 'lap').length, 2);
  assert.ok(r.finished && r.lapTimes.length === 2);
});

test('walls and obstacles keep ships inside the corridor and cause damage', () => {
  const t = getTrack('foundry');
  const race = new Race({ track: t, laps: 1, racers: [{ name: 'P', shipId: 'kestrel', isPlayer: true }], countdown: 0 });
  const r = race.player;
  for (let k = 0; k < 120 * 4; k++) race.step(SIM_DT, { ...noCtrl, yaw: 1 });
  assert.ok(Math.abs(r.lx) <= t.w[r.ti] && Math.abs(r.ly) <= t.h[r.ti], 'still inside corridor');
  assert.ok(r.ship.hull < r.ship.def.hull || r.hits > 0, 'wall contact registered');
  // explosion and respawn
  r.ship.hull = -1; race.step(SIM_DT, noCtrl);
  assert.ok(r.wrecked);
  for (let k = 0; k < 120 * 2; k++) race.step(SIM_DT, noCtrl);
  assert.ok(!r.wrecked && r.ship.hull > 0, 'respawned after wreck');
});

for (const d of TRACK_DEFS) {
  test(`AI field completes a 3-lap race on ${d.name} through simulated flight`, () => {
    const t = getTrack(d.id);
    const race = new Race({ track: t, laps: 3, racers: field(0.7, 1.0), autopilot: true, seed: 5, countdown: 3.6 });
    let steps = 0, maxJump = 0;
    while (race.state !== 'finished' && steps < 120 * 400) {
      const before = race.racers.map(r => r.ship.pos.clone());
      race.step(SIM_DT, null); steps++;
      const resp = new Set(race.events.filter(e => e.type === 'respawn').map(e => e.r)); race.events.length = 0;
      race.racers.forEach((r, k) => { if (!r.wrecked && !resp.has(r)) maxJump = Math.max(maxJump, r.ship.pos.dist(before[k])); });
    }
    race.simulateToEnd(SIM_DT);
    const res = race.order.map(r => `${r.name}:${r.finishTime.toFixed(1)}s best ${r.bestLap.toFixed(1)} hits ${r.hits} resp ${r.resp||0}`);
    console.log(`  ${d.name}: ${res.join(' | ')}`);
    assert.ok(race.racers.every(r => r.finished), 'all racers finished');
    assert.ok(maxJump < 4, `no teleporting during flight (max step ${maxJump.toFixed(2)})`);
    for (let k = 1; k < race.order.length; k++) assert.ok(race.order[k].finishTime >= race.order[k - 1].finishTime, 'order follows finish times');
    const times = race.order.map(r => r.finishTime);
    assert.ok(times[times.length - 1] - times[0] > 0.5, 'meaningful spread of results');
    assert.ok(race.order[0].bestLap > 15 && race.order[0].bestLap < 80, 'plausible lap time');
  });
}

test('race reset restores the starting grid; same seed is deterministic', () => {
  const t = getTrack('belt');
  const mk = () => new Race({ track: t, laps: 1, racers: field(0.7, 1.0), autopilot: true, seed: 9, countdown: 0 });
  const a = mk(), b = mk();
  for (let k = 0; k < 120 * 20; k++) { a.step(SIM_DT, null); b.step(SIM_DT, null); }
  assert.ok(a.racers.every((r, k) => r.ship.pos.dist(b.racers[k].ship.pos) < 1e-6), 'deterministic');
  const start = mk().racers.map(r => r.ship.pos.clone());
  a.reset();
  assert.ok(a.racers.every((r, k) => r.ship.pos.dist(start[k]) < 1e-9 && r.lap === 0 && r.prog < 0), 'reset restores grid');
});

test('championship awards points by finishing position', () => {
  const c = new Championship(['A', 'B', 'C']);
  c.addResult(['B', 'A', 'C']); c.addResult(['A', 'C', 'B']);
  const st = c.standings();
  assert.deepEqual(st.map(e => e.name), ['A', 'B', 'C']);
  assert.equal(st[0].points, POINTS[1] + POINTS[0]);
});
