// GALACTIC RUSH V10 — the two new courses: Verdant Canopy (jungle world, dense organic obstacles) and Orbital Nexus
// (orbital station, gravity sections). The six V2–V9 courses unchanged (course data fingerprints, and replays of whole
// races that must match the V9 build bit for bit, which also covers the flight model, the AI, the collisions, the
// handling modes and the weapons), course data and continuity, every branch and root drawn where it collides, free
// passages at every obstacle, connected platforms, soft vegetation that never collides, the gravity sections (ride
// height in every orientation, respawns in every orientation, boost/brake/steer through the transitions, the chase
// camera through them, no gravity anywhere else), full fields over five laps in both handling modes, every ship, every
// lap count, and identical course data on every build. Run with `npm test`.
import test from 'node:test';
import { V12_KINDS } from './v12-obstacles.test.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { buildPathTrack10 } from '../src/sim/pathtrack10.js';
import { GRAVITY } from '../src/sim/gravity.js';
import { Race } from '../src/sim/race.js';
import { shipAxes } from '../src/sim/flight.js';
import { SHIPS, AI_ROSTER, SIM_DT, CHAMPIONSHIP } from '../src/config.js';
import { CameraRig } from '../src/camera.js';
import { Vec3, makeRng } from '../src/math.js';
import { trackInfo } from '../server/race.mjs';
import { ALL_TRACKS } from '../server/maps.mjs';

const NEW = ['canopy', 'nexus'], OLD = ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara'];
const deg = r => r * 180 / Math.PI, ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
const HANDLINGS = [['classic', undefined], ['relaxed', 'relaxed']];
const field = () => [{ name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 }, ...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.7 + 0.3 * a.bias }))];

// fingerprint of a course's gameplay data (the same function as the V9 tests)
function fingerprint(t) {
  let h = 2166136261 >>> 0; const mix = v => { const s = (Math.round(v * 1000) | 0) >>> 0; for (let k = 0; k < 4; k++) { h ^= (s >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; } };
  mix(t.N); mix(t.length); mix(t.D);
  for (let i = 0; i < t.N; i++) { for (const v of [t.pos[i], t.tan[i], t.nrm[i], t.bin[i]]) { mix(v.x); mix(v.y); mix(v.z); } mix(t.w[i]); mix(t.h[i]); mix(t.bank[i]); mix(t.lineX[i]); mix(t.lineY[i]); mix(t.tunnel[i] ? 1 : 0); }
  for (const s of t.cpS) mix(s);
  for (const o of t.obstacles) { if (V12_KINDS.has(o.kind)) continue; mix(o.i); mix(o.x || 0); mix(o.y || 0); mix(o.r || 0); } // V12: without the obstacles V12 adds
  for (const p of t.pads) { mix(p.i); mix(p.x); mix(p.y); }
  for (const c of t.cells) { mix(c.i); mix(c.x); mix(c.y); mix(c.ion ? 1 : 0); }
  mix(t.lasers.length); mix(t.traffic.length);
  return h.toString(16).padStart(8, '0');
}
// the same function run on the published V9 source tree gave these values
const V9_FINGERPRINTS = { foundry: '47f46046', belt: 'a7a1a731', spire: '9c0349a3', ring: 'f27b448e', pelagos: '1c25edac', ignara: '0e64dec0' };
// whole races replayed on the V9 build (a scripted player plus the five AI pilots, 75 s, both handling modes): hash of
// every ship's position, velocity, orientation, hull and progress every quarter second, then each racer's lap:progress
const V9_REPLAYS = {
  'foundry/classic': '37f4735c174047ef 1:422,2:9830,2:10339,2:10360,2:9877,2:10537', 'foundry/relaxed': 'f2df884799afa23d 1:771,2:7571,2:8073,2:8358,2:8180,2:7754',
  'belt/classic': 'cedb27dcc2a2a6f6 1:1923,2:9919,2:10961,2:10723,2:9317,2:9979', 'belt/relaxed': 'e06526ddc4bed49e 1:1382,2:8879,2:8324,2:9010,2:8838,2:9042',
  'spire/classic': 'c5bf865c701d801a 1:1476,2:12835,2:11045,2:12078,2:11322,2:11409', 'spire/relaxed': '72149ddeb0111f39 1:1352,2:8643,2:8632,2:8854,2:9390,2:8310',
  'ring/classic': 'ab8845aba9041593 1:1909,2:11279,2:10955,2:11790,2:11142,2:10680', 'ring/relaxed': 'e439abf7bd1411af 1:1112,2:9070,2:8099,2:8736,2:8920,2:8821',
  'pelagos/classic': 'd11735cc52655136 1:1009,2:12777,2:11848,2:12517,2:12307,2:12573', 'pelagos/relaxed': '63f864c74c9e3ad5 1:1199,2:9807,2:8676,2:9569,2:9523,2:9239',
  'ignara/classic': 'c45ed4c9cd2de8fb 1:1396,2:12345,2:11113,2:11995,2:11539,2:11459', 'ignara/relaxed': 'c0f0c969b93fe11f 1:1664,2:10145,2:8668,2:9283,2:8615,2:9529',
};
function replay(id, handling) {
  const racers = [{ name: 'YOU', shipId: 'kestrel', isPlayer: true }, ...AI_ROSTER.map((a, k) => ({ name: a.name, shipId: a.ship, skill: 0.6 + k * 0.08 }))];
  const race = new Race({ track: getTrack(id), laps: 2, racers, mode: 'race', seed: 4242, handling, assist: 0.3, sens: 1 });
  const h = createHash('sha256'), buf = new Float64Array(12); let t = 0;
  for (let k = 0; k < 120 * 75; k++) {
    t += SIM_DT; race.step(SIM_DT, { pitch: 0.35 * Math.sin(t * 0.7), yaw: 0.5 * Math.sin(t * 0.45), roll: 0, brake: false, boost: (t % 7) < 2, drift: (t % 11) < 1, fire: (t % 5) < 0.05, shield: (t % 13) < 0.05 });
    if (k % 30 === 0) for (const r of race.racers) { const s = r.ship; buf.set([s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w, s.hull, r.prog]); h.update(Buffer.from(buf.buffer)); }
    race.events.length = 0;
  }
  return h.digest('hex').slice(0, 16) + ' ' + race.racers.map(r => r.lap + ':' + Math.round(r.prog)).join(',');
}

test('V10: eight courses, the six V9 courses first and unchanged (course data), then Verdant Canopy and Orbital Nexus', () => {
  assert.deepEqual(TRACK_DEFS.map(d => d.id), [...OLD, ...NEW]);
  for (const [id, fp] of Object.entries(V9_FINGERPRINTS)) assert.equal(fingerprint(getTrack(id)), fp, `${id} unchanged since V9`);
  assert.deepEqual(CHAMPIONSHIP, OLD, 'the default calendar (runs saved by V9) is the V9 one');
  assert.deepEqual(ALL_TRACKS, TRACK_DEFS.map(d => d.id), 'the multiplayer server may pick every course');
  for (const id of NEW) { const d = TRACK_DEFS.find(x => x.id === id); assert.ok(d.name && d.short && d.tagline && d.theme, `${id} has its menu texts`); }
});

// V12 added obstacles to Pelagos, so whole Pelagos races no longer replay as in V9 (the ships meet the new structures);
// its course data without them still matches V9 (the fingerprint above), and the other V9 courses replay bit for bit
test('V9 courses: whole races replay bit for bit as in the V9 build (flight model, AI, collisions, handling, weapons)', () => {
  for (const [key, want] of Object.entries(V9_REPLAYS)) { const [id, hand] = key.split('/'); if (id === 'pelagos') continue; assert.equal(replay(id, hand), want, `${key} differs from V9`); }
  assert.notEqual(replay('pelagos', 'relaxed'), V9_REPLAYS['pelagos/relaxed'], 'Pelagos races meet the V12 obstacles');
});

test('no gravity outside Orbital Nexus: no other course has a gravity field or a roll, and the race loop leaves them alone', () => {
  for (const d of TRACK_DEFS) { const t = getTrack(d.id);
    if (d.id === 'nexus') { assert.ok(t.grav && t.grav.some(g => g > 0.99) && t.roll, 'Nexus has gravity sections'); continue; }
    assert.equal(t.grav, undefined, `${d.id} has no gravity field`); assert.ok(!t.roll || t.roll.every(r => r === 0), `${d.id} has no roll`);
    assert.ok(!(d.path && d.path.segs.some(s => s.grav || s.roll)), `${d.id} declares no gravity`); }
});

test('V10 courses: closed and continuous, smooth frames everywhere (through the gravity rolls too), checkpoints in order', () => {
  for (const id of NEW) {
    const t = getTrack(id); let rot = 0, dwh = 0;
    for (let i = 0; i < t.N; i++) {
      const j = (i + 1) % t.N;
      assert.ok(Math.abs(t.pos[i].dist(t.pos[j]) / t.D - 1) < 0.03, `${id}: even sample spacing at ${i}`);
      rot = Math.max(rot, ang(t.tan[i], t.tan[j]), ang(t.nrm[i], t.nrm[j]), ang(t.bin[i], t.bin[j]));
      dwh = Math.max(dwh, Math.abs(t.w[j] - t.w[i]), Math.abs(t.h[j] - t.h[i]));
      assert.ok(Math.abs(t.tan[i].len() - 1) < 1e-6 && Math.abs(t.nrm[i].dot(t.tan[i])) < 1e-6 && Math.abs(t.bin[i].dot(t.tan[i])) < 1e-6 && Math.abs(t.bin[i].dot(t.nrm[i])) < 1e-6, `${id}: orthonormal frame at ${i}`);
    }
    assert.ok(deg(rot) < 5, `${id}: frames turn at most ${deg(rot).toFixed(2)} deg per sample (no flips)`);
    assert.ok(dwh < 0.6, `${id}: corridor size changes gradually (${dwh.toFixed(2)} m per sample)`);
    assert.equal(t.cpIdx[0], 0, 'checkpoint 0 is the start line'); for (let k = 1; k < t.cpIdx.length; k++) assert.ok(t.cpIdx[k] > t.cpIdx[k - 1], 'checkpoints in order');
    // the corridor never passes through itself: parts more than 250 m apart along the course keep their distance
    let worst = 1e9; for (let i = 0; i < t.N; i += 2) for (let j = i + 2; j < t.N; j += 2) { const ds = Math.min(j - i, t.N - j + i) * t.D; if (ds < 250) continue;
      worst = Math.min(worst, t.pos[i].dist(t.pos[j]) - Math.hypot(t.w[i], t.h[i]) - Math.hypot(t.w[j], t.h[j])); }
    assert.ok(worst > 10, `${id}: separate parts of the course stay ${worst.toFixed(1)} m apart (no shortcut through a wall)`);
    console.log(`  ${id}: ${(t.length / 1000).toFixed(2)} km, ${t.cpS.length} checkpoints, ${t.obstacles.length} obstacle pieces, ${t.pads.length} boost rings, ${t.cells.length} cells; frames turn at most ${deg(rot).toFixed(2)} deg per sample; separate parts at least ${worst.toFixed(0)} m apart`);
  }
});

test('Verdant Canopy: every branch and root collides exactly where it is drawn, and there is always a way through', () => {
  const t = getTrack('canopy'); let spheres = 0, worstFit = 0;
  // every collision sphere lies on its piece of wood (the polyline the renderer draws a tube along) with the tube's radius there
  for (const o of t.obstacles) { if (o.type !== 'sphere') continue; spheres++; const w = t.wood[o.group]; assert.ok(w, 'sphere belongs to a piece of wood');
    let best = 1e9, rAt = 0; for (let k = 0; k < w.pts.length - 1; k++) { const a = w.pts[k], b = w.pts[k + 1], ab = new Vec3().subVectors(b, a), u = Math.max(0, Math.min(1, new Vec3().subVectors(o.p, a).dot(ab) / ab.lenSq())), q = new Vec3().copy(a).addScaled(ab, u), d = q.dist(o.p);
      if (d < best) { best = d; rAt = w.rad[k] + (w.rad[k + 1] - w.rad[k]) * u; } }
    worstFit = Math.max(worstFit, best, Math.abs(rAt - o.r)); }
  assert.ok(worstFit < 0.01, `collision spheres sit on the drawn wood (worst ${worstFit.toFixed(4)} m)`);
  // a cross-section scan at every obstacle: free cells (clear of every obstacle by the ship radius plus 2 m) must form an
  // opening at least 9 m across, so a ship always has a way through
  const near = []; let worstGap = 1e9;
  for (let i = 0; i < t.N; i++) { t.obstaclesNear(i, near, 1); const here = near.filter(o => Math.abs(t.deltaS(i * t.D, o.i * t.D)) < 6); if (!here.length) continue;
    const W = t.w[i] - 2.2, H = t.h[i] - 2.2, step = 1; let best = 0;
    for (let x = -W; x <= W; x += step) for (let y = -H; y <= H; y += step) { const p = t.pointAt(i, x, y); let d = 1e9;
      for (const o of here) d = Math.min(d, o.type === 'sphere' ? p.dist(o.p) - o.r : o.type === 'vbeam' ? Math.abs(x - o.x) - o.r : Math.abs(y - o.y) - o.r);
      d = Math.min(d, W + 2.2 - Math.abs(x), H + 2.2 - Math.abs(y)); best = Math.max(best, d); }
    worstGap = Math.min(worstGap, best); }
  assert.ok(worstGap > 4.5 + 2.2, `at every obstacle a ship fits through with room to spare (smallest opening radius ${worstGap.toFixed(1)} m)`);
  // obstacles come in a readable rhythm: no two separate obstacles closer than 45 m along the course
  const groups = [...new Set(t.obstacles.map(o => o.group !== undefined ? 'g' + o.group : 'b' + o.i))].map(k => t.obstacles.filter(o => (o.group !== undefined ? 'g' + o.group : 'b' + o.i) === k).map(o => o.i));
  const centres = groups.map(a => a.reduce((s, v) => s + v, 0) / a.length).sort((a, b) => a - b), feats = []; // pieces within 12 m of each other form one feature (a fork, a V)
  for (const c of centres) { if (feats.length && (c - feats[feats.length - 1][1]) * t.D < 12) feats[feats.length - 1][1] = c; else feats.push([c, c]); }
  let minGap = 1e9; for (let k = 1; k < feats.length; k++) minGap = Math.min(minGap, (feats[k][0] - feats[k - 1][1]) * t.D);
  assert.ok(minGap > 40, `obstacles at least ${minGap.toFixed(0)} m apart (${feats.length} features)`);
  console.log(`  ${spheres} collision spheres on ${t.wood.length} pieces of wood, worst fit ${worstFit.toFixed(4)} m; smallest free opening radius ${worstGap.toFixed(1)} m; obstacles at least ${minGap.toFixed(0)} m apart`);
});

test('Verdant Canopy: the floating platforms form one unbroken surface, the soft vegetation never collides', () => {
  const t = getTrack('canopy'), ids = t.tags.get('platforms'), pl = t.platforms;
  assert.equal(pl[0].i0, ids[0], 'the first platform starts the section'); assert.equal(pl[pl.length - 1].i1, ids[ids.length - 1], 'the last ends it');
  for (let k = 1; k < pl.length; k++) assert.equal(pl[k].i0, pl[k - 1].i1 + 1, `piece ${k} joins the one before (no gap)`);
  assert.ok(pl.filter(p => p.kind === 'deck').length >= 3 && pl.some(p => p.kind === 'ramp') && pl.some(p => p.kind === 'bridge'), 'decks, ramps between levels and bridges');
  // soft vegetation: a ship flown straight through each curtain of vines and the leaf roof takes no hit
  assert.ok(t.soft.length >= 3);
  for (const s of t.soft) {
    const race = new Race({ track: t, laps: 1, racers: [{ name: 'P1', shipId: 'kestrel', isPlayer: true }], countdown: 0, seed: 1 }), r = race.racers[0], sh = r.ship;
    const i = t.wrapIdx(s.i - 6), x = (s.x0 + s.x1) / 2 * 0.3, y = Math.min(s.y1 - 3, Math.max(s.y0 + 3, (s.y0 + s.y1) / 2));
    t.pointAt(i, x, y, sh.pos); sh.prevPos.copy(sh.pos); sh.quat.fromBasis(new Vec3().copy(t.bin[i]).scale(-1), t.nrm[i], t.tan[i]); sh.vel.copy(t.tan[i]).scale(60); r.ti = i;
    let hits = 0; for (let k = 0; k < 120 * 0.4; k++) { race.step(SIM_DT, { pitch: 0, yaw: 0, roll: 0 }); hits += race.events.filter(e => e.type === 'hit' && e.kind === 'obs').length; race.events.length = 0; }
    assert.ok(Math.abs(t.deltaS(s.i * t.D, r.s)) < 40 && t.deltaS(s.i * t.D, r.s) > 0, 'the ship went through');
    assert.equal(hits, 0, `${s.kind} at ${s.i}: no collision`); }
});

test('Orbital Nexus: gravity sections turn the deck to the wall and the ceiling and back, smoothly and completely', () => {
  const t = getTrack('nexus');
  assert.ok(Math.abs(deg(t.roll[t.N - 1]) + 360) < 1, 'the deck turns a full 360 deg over the lap (and is upright again at the line)');
  let maxRate = 0; for (let i = 0; i < t.N; i++) maxRate = Math.max(maxRate, Math.abs(t.roll[(i + 1) % t.N] - t.roll[i] + (i === t.N - 1 ? -2 * Math.PI : 0)) / t.D); // across the line the roll has gone a full turn
  assert.ok(deg(maxRate) < 0.8, `the deck turns at most ${deg(maxRate).toFixed(2)} deg per metre (about ${(deg(maxRate) * 170).toFixed(0)} deg/s at full speed)`);
  const rolls = new Set(); for (let i = 0; i < t.N; i++) if (t.grav[i] > 0.99) rolls.add(Math.round(deg(t.roll[i]) / 90) * 90);
  for (const r of [0, -90, -180]) assert.ok([...rolls].some(v => ((v - r) % 360 + 360) % 360 === 0), `a plated section with the deck at ${-r} deg`);
  assert.equal(t.gravZones.length, 2, 'two gravity sections: the reactor-glass-spindle run and the cargo levels');
  for (const z of t.gravZones) { assert.ok(t.grav[z.i0] < 0.01 && t.grav[t.wrapIdx(z.i0 + Math.round(GRAVITY.ramp / t.D))] > 0.99, 'the field fades in over the ramp'); }
  // the deck stays where it was during a roll: the ride line (GRAVITY.ride above the deck) is continuous through every transition
  let jump = 0; for (let i = 0; i < t.N; i++) { const j = (i + 1) % t.N, a = t.pointAt(i, 0, -t.h[i] + GRAVITY.ride), b = t.pointAt(j, 0, -t.h[j] + GRAVITY.ride); jump = Math.max(jump, Math.abs(a.dist(b) - t.D)); }
  assert.ok(jump < 0.6, `the ride line runs on without steps (${jump.toFixed(2)} m)`);
  console.log(`  deck orientations ${[...rolls].sort((a, b) => b - a).join(', ')} deg; roll rate at most ${deg(maxRate).toFixed(2)} deg/m`);
});

test('Orbital Nexus: in every gravity orientation the field holds every ship on the deck (full fields, both handling modes)', () => {
  const t = getTrack('nexus'), D = deg;
  for (const [name, handling] of HANDLINGS) {
    const st = {}; const race = new Race({ track: t, laps: 2, racers: field(), autopilot: true, seed: 5, countdown: 3.6, handling });
    let steps = 0; while (!race.racers.every(r => r.finished) && steps < 120 * 300) { race.step(SIM_DT, null); steps++; race.events.length = 0;
      if (steps % 6) continue;
      for (const r of race.racers) { if (r.wrecked || t.grav[r.ti] < 0.99 || Math.abs(t.roll[t.wrapIdx(r.ti + 8)] - t.roll[t.wrapIdx(r.ti - 8)]) > 0.035) continue; // steady sections (between the rolls)
        const k = Math.round(D(t.roll[r.ti]) / 90) * 90 % 360; const s = st[k] = st[k] || { n: 0, hs: [], up: 0 };
        s.n++; s.hs.push(r.ly + t.h[r.ti]); const U = new Vec3(); shipAxes(r.ship.quat, new Vec3(), U); if (D(ang(U, t.nrm[r.ti])) < 30) s.up++; } }
    assert.ok(race.racers.every(r => r.finished), `${name}: the whole field finished`);
    for (const [k, s] of Object.entries(st)) { s.hs.sort((a, b) => a - b); const med = s.hs[s.hs.length >> 1];
      assert.ok(med > 2.2 && med < 7, `${name}, deck at ${-k} deg: median ride height ${med.toFixed(2)} m above the deck`);
      assert.ok(s.up / s.n > 0.9, `${name}, deck at ${-k} deg: ships stay upright on the deck (${(100 * s.up / s.n).toFixed(0)}%)`);
      console.log(`  ${name}, deck at ${-k} deg: ${s.n} samples, median ride ${med.toFixed(2)} m, 10-90% ${s.hs[Math.floor(s.n * 0.1)].toFixed(1)}-${s.hs[Math.floor(s.n * 0.9)].toFixed(1)} m, upright ${(100 * s.up / s.n).toFixed(0)}%`); }
  }
});

test('Orbital Nexus: respawn in every gravity orientation puts the ship on the deck, oriented with it, and the lap goes on', () => {
  const t = getTrack('nexus'), F = new Vec3(), U = new Vec3(), at = (tag, f) => { const a = t.tags.get(tag); return a[Math.floor(f * a.length)]; };
  for (const [tag, f] of [['core', 0.5], ['coreexit', 0.5], ['glass', 0.4], ['spindle', 0.3], ['spindle', 0.7], ['cargo', 0.5], ['exterior', 0.4]]) for (const manual of [false, true]) {
    const race = new Race({ track: t, laps: 2, racers: [{ name: 'P1', shipId: 'kestrel', isPlayer: true }], autopilot: true, countdown: 0, seed: 3 }), r = race.racers[0], i = at(tag, f);
    t.pointAt(i, 0, 0, r.ship.pos); r.ship.prevPos.copy(r.ship.pos); r.ti = i; r.s = i * t.D; r.prog = r.s - t.length; r.cpNext = Math.max(0, t.cpIdx.findIndex(c => c > i));
    if (manual) race.respawn(r, true); else { r.ship.hull = -1; for (let k = 0; k < 120 * 1.8 && !(r.resp > 0); k++) { race.step(SIM_DT, null); race.events.length = 0; } }
    assert.equal(r.resp, 1, `${tag}: respawned`); const ri = r.ti; shipAxes(r.ship.quat, F, U);
    assert.ok(U.dot(t.nrm[ri]) > 0.99 && F.dot(t.tan[ri]) > 0.99, `${tag} (${manual ? 'reset' : 'wreck'}): oriented with the deck (deck at ${-Math.round(deg(t.roll[ri]))} deg)`);
    assert.ok(Math.abs(r.lx) < t.w[ri] && Math.abs(r.ly) < t.h[ri], `${tag}: inside the corridor`);
    for (let k = 0; k < 120 * 2.5; k++) { race.step(SIM_DT, null); race.events.length = 0; }
    const hgt = r.ly + t.h[r.ti]; shipAxes(r.ship.quat, F, U);
    if (t.grav[r.ti] > 0.99) assert.ok(hgt > 2 && hgt < 9, `${tag} (${manual ? 'reset' : 'wreck'}): settled on the deck (${hgt.toFixed(1)} m)`);
    assert.ok(ang(U, t.nrm[r.ti]) < 0.6, `${tag}: upright on the deck`); assert.ok(!r.wrecked && r.ship.vel.dot(t.tan[r.ti]) > 40, `${tag}: racing on`);
  }
});

test('Orbital Nexus: boost, brake and hard steering through every gravity transition stay on the deck (every ship)', () => {
  const t = getTrack('nexus'), zones = t.gravZones;
  for (const s of SHIPS) for (const mode of ['boost', 'brake', 'weave']) {
    const race = new Race({ track: t, laps: 1, racers: [{ name: 'P1', shipId: s.id, isPlayer: true }], autopilot: true, countdown: 0, seed: 9 }), r = race.racers[0], z = zones[0];
    const i0 = t.wrapIdx(z.i0 - 10); t.pointAt(i0, 0, 0, r.ship.pos); r.ship.prevPos.copy(r.ship.pos); r.ship.quat.fromBasis(new Vec3().copy(t.bin[i0]).scale(-1), t.nrm[i0], t.tan[i0]); r.ship.vel.copy(t.tan[i0]).scale(140); r.ti = i0; r.s = i0 * t.D;
    let wrecks = 0, tt = 0;
    while (t.deltaS(r.s, t.gravZones[0].i1 * t.D) > 0 && tt < 60) { tt += SIM_DT; const c = r.ai.update(SIM_DT);
      if (mode === 'boost') { c.boost = true; r.ship.boost = r.ship.def.boostCap; } if (mode === 'brake') c.brake = (tt % 2) < 0.5; if (mode === 'weave') { c.yaw = Math.max(-1, Math.min(1, c.yaw + 0.4 * Math.sin(tt * 2.2))); c.pitch = Math.max(-1, Math.min(1, c.pitch + 0.3 * Math.sin(tt * 1.7))); }
      r.ai.update = () => c; race.step(SIM_DT, null); delete r.ai.update; wrecks += race.events.filter(e => e.type === 'explode').length; race.events.length = 0; }
    assert.ok(tt < 60, `${s.id} ${mode}: through the gravity sections`); assert.equal(wrecks, 0, `${s.id} ${mode}: no wreck`);
  }
});

test('Orbital Nexus: the chase camera follows the deck through every roll without jumps', () => {
  const t = getTrack('nexus');
  for (const mode of ['chase', 'far']) {
    const race = new Race({ track: t, laps: 1, racers: [{ name: 'P1', shipId: 'kestrel', isPlayer: true }], autopilot: true, countdown: 0, seed: 2, handling: 'relaxed' }), r = race.racers[0], rig = new CameraRig(), settings = { fov: 72, shake: 0 };
    let maxUp = 0, maxFwd = 0, worstAlign = 0, steadyAlign = 0, prevUp = null, prevFwd = null, hitAt = -99, frames = 0;
    while (!r.finished && frames < 60 * 120) {
      for (let k = 0; k < 2; k++) { race.step(SIM_DT, null); if (race.events.some(e => e.type === 'hit')) hitAt = frames; race.events.length = 0; }
      rig.follow(1 / 60, { p: r.ship.pos, q: r.ship.quat, vel: r.ship.vel, boost: r.ship.boosting, bank: 0, eye: { x: 0, y: 0.6, z: 1 } }, mode, { settings, maxSpeed: r.ship.def.maxSpeed, track: t, ti: r.ti }); frames++;
      const c = rig.cam; if (prevUp && frames - hitAt > 30 && t.grav[r.ti] > 0.01) { maxUp = Math.max(maxUp, deg(ang(c.up, prevUp))); maxFwd = Math.max(maxFwd, deg(ang(c.fwd, prevFwd))); const a = deg(ang(c.up, t.nrm[r.ti])); worstAlign = Math.max(worstAlign, a);
        if (Math.abs(t.roll[t.wrapIdx(r.ti - 30)] - t.roll[r.ti]) < 0.01) steadyAlign = Math.max(steadyAlign, a); } // 120 m after a roll
      prevUp = c.up.clone(); prevFwd = c.fwd.clone();
    }
    assert.ok(r.finished, `${mode}: lap completed`); assert.ok(maxUp < 4, `${mode}: camera up turns at most ${maxUp.toFixed(2)} deg per frame in the gravity sections`); assert.ok(maxFwd < 4, `${mode}: view direction turns at most ${maxFwd.toFixed(2)} deg per frame`);
    assert.ok(steadyAlign < 25, `${mode}: once a roll is done the camera is upright on the deck again (within ${steadyAlign.toFixed(0)} deg)`); assert.ok(worstAlign < 50, `${mode}: during a roll the view trails the deck by at most ${worstAlign.toFixed(0)} deg`);
    console.log(`  camera ${mode}: at most ${maxUp.toFixed(2)} deg (up) / ${maxFwd.toFixed(2)} deg (forward) per frame in the gravity sections; the view trails a rolling deck by up to ${worstAlign.toFixed(0)} deg and is within ${steadyAlign.toFixed(0)} deg of it between rolls`);
  }
});

for (const id of NEW) for (const [name, handling] of HANDLINGS) test(`5 laps on ${TRACK_DEFS.find(d => d.id === id).name} (${name}): the full AI field finishes`, () => {
  const race = new Race({ track: getTrack(id), laps: 5, racers: field(), autopilot: true, seed: 17, countdown: 3.6, handling });
  let steps = 0, passes = new Map(); while (!race.racers.every(r => r.finished) && steps < 120 * 900) { race.step(SIM_DT, null); steps++; for (const e of race.events) if (e.type === 'checkpoint' || e.type === 'lap') passes.set(e.r.id, (passes.get(e.r.id) || 0) + 1); race.events.length = 0; }
  assert.ok(race.racers.every(r => r.finished), 'all finished'); assert.ok(race.racers.every(r => r.lapTimes.length === 5), 'five laps each');
  for (const r of race.racers) assert.equal(passes.get(r.id), 5 * race.track.cpS.length, `${r.name}: every checkpoint of every lap, in order`);
  console.log(`  ${id} ${name}: winner ${race.order[0].name} ${race.order[0].finishTime.toFixed(1)} s, last ${race.order[5].finishTime.toFixed(1)} s, best lap ${Math.min(...race.racers.map(r => r.bestLap)).toFixed(2)} s`);
});

test('every ship, both handling modes, every lap count: a lap on each new course', () => {
  for (const id of NEW) for (const s of SHIPS) for (const [, handling] of HANDLINGS) {
    const race = new Race({ track: getTrack(id), laps: 1, racers: [{ name: 'P1', shipId: s.id, isPlayer: true }], autopilot: true, seed: 3, countdown: 0, handling });
    let steps = 0; while (!race.racers[0].finished && steps < 120 * 200) { race.step(SIM_DT, null); steps++; race.events.length = 0; }
    assert.ok(race.racers[0].finished, `${s.id} on ${id} (${handling || 'classic'}) finished a lap`);
  }
  for (const id of NEW) for (const laps of [1, 2, 3]) { const race = new Race({ track: getTrack(id), laps, racers: field(), autopilot: true, seed: 11, countdown: 0 });
    let steps = 0; while (!race.racers.every(r => r.finished) && steps < 120 * 600) { race.step(SIM_DT, null); steps++; race.events.length = 0; }
    assert.ok(race.racers.every(r => r.finished && r.lapTimes.length === laps), `${id}: ${laps} lap race finished`); }
});

test('every client and the server compute the same course: fresh builds equal the shared course data', () => {
  for (const id of NEW) {
    const def = TRACK_DEFS.find(d => d.id === id), shared = getTrack(id), fresh = buildPathTrack10(def); def.populate(fresh, makeRng(def.seed)); fresh.updateObstacles(0);
    assert.equal(fingerprint(fresh), fingerprint(shared), `${id}: identical course data`);
    if (shared.grav) { assert.deepEqual([...fresh.grav], [...shared.grav], 'identical gravity field'); assert.deepEqual([...fresh.roll], [...shared.roll], 'identical roll'); }
    const info = trackInfo(id); assert.equal(info.L, shared.length); assert.deepEqual(info.cpS, shared.cpS);
  }
});
