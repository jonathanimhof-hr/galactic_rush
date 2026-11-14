// GALACTIC RUSH V9 — the two new courses: Pelagos (ocean world, two vertical loops) and Ignara (volcanic world).
// Course data (closure, smooth frames, the loops' full turn, clearance, checkpoints, hazards off the racing line), the
// four original courses unchanged since V8, every ship type through the loops in both handling modes, full fields over
// five laps, respawns inside a loop, the chase camera through the loops, and identical course data on every build (every
// client and the server compute the same corridor, checkpoints and laps). Run with `npm test`.
import test from 'node:test';
import { V12_KINDS } from './v12-obstacles.test.js';
import assert from 'node:assert/strict';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { buildPathTrack } from '../src/sim/pathtrack.js';
import { Race } from '../src/sim/race.js';
import { shipAxes } from '../src/sim/flight.js';
import { SHIPS, AI_ROSTER, SIM_DT, CHAMPIONSHIP } from '../src/config.js';
import { CameraRig } from '../src/camera.js';
import { Vec3, makeRng } from '../src/math.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { UPGRADES, UPGRADE_IDS } from '../src/progress/economy.js';
import { trackInfo } from '../server/race.mjs';
import { ALL_TRACKS } from '../server/maps.mjs';

const NEW = ['pelagos', 'ignara'];
const deg = r => r * 180 / Math.PI, ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
const MAXED = Object.fromEntries(UPGRADE_IDS.map(k => [k, UPGRADES.maxLevel]));
const HANDLINGS = [['classic', undefined], ['relaxed', 'relaxed']];

// fingerprint of a course's gameplay data: geometry and frames, corridor, checkpoints, pickups and hazards
function fingerprint(t) {
  let h = 2166136261 >>> 0; const mix = v => { const s = (Math.round(v * 1000) | 0) >>> 0; for (let k = 0; k < 4; k++) { h ^= (s >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; } };
  mix(t.N); mix(t.length); mix(t.D);
  for (let i = 0; i < t.N; i++) { for (const v of [t.pos[i], t.tan[i], t.nrm[i], t.bin[i]]) { mix(v.x); mix(v.y); mix(v.z); } mix(t.w[i]); mix(t.h[i]); mix(t.bank[i]); mix(t.lineX[i]); mix(t.lineY[i]); mix(t.tunnel[i] ? 1 : 0); }
  for (const s of t.cpS) mix(s);
  for (const o of t.obstacles) { mix(o.i); mix(o.x || 0); mix(o.y || 0); mix(o.r || 0); }
  for (const p of t.pads) { mix(p.i); mix(p.x); mix(p.y); }
  for (const c of t.cells) { mix(c.i); mix(c.x); mix(c.y); mix(c.ion ? 1 : 0); }
  mix(t.lasers.length); mix(t.traffic.length);
  return h.toString(16).padStart(8, '0');
}
// the same function run on the V8 source tree (published V8 build) gave these values
const V8_FINGERPRINTS = { foundry: '47f46046', belt: 'a7a1a731', spire: '9c0349a3', ring: 'f27b448e' };

test('V9: six courses, the four original ones first and with exactly the V8 course data, then Pelagos and Ignara (V10 appends two more after them)', () => {
  assert.deepEqual(TRACK_DEFS.slice(0, 6).map(d => d.id), ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara']);
  for (const [id, fp] of Object.entries(V8_FINGERPRINTS)) assert.equal(fingerprint(getTrack(id)), fp, `${id} unchanged since V8`);
  assert.deepEqual(CHAMPIONSHIP, ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara'], 'championship rounds 5 and 6');
  assert.deepEqual(ALL_TRACKS, TRACK_DEFS.map(d => d.id), 'the multiplayer server may pick every course');
  for (const id of NEW) { const d = TRACK_DEFS.find(x => x.id === id); assert.ok(d.name && d.short && d.tagline && d.theme, `${id} has its menu texts`); }
});

test('V9 courses: closed and continuous, with smooth frames everywhere, through the loops too', () => {
  for (const id of NEW) {
    const t = getTrack(id); let rot = 0, dwh = 0;
    for (let i = 0; i < t.N; i++) {
      const j = (i + 1) % t.N; // includes the seam where the course closes on itself
      assert.ok(Math.abs(t.pos[i].dist(t.pos[j]) / t.D - 1) < 0.01, `${id}: even sample spacing at ${i}`);
      rot = Math.max(rot, ang(t.tan[i], t.tan[j]), ang(t.nrm[i], t.nrm[j]), ang(t.bin[i], t.bin[j]));
      dwh = Math.max(dwh, Math.abs(t.w[j] - t.w[i]), Math.abs(t.h[j] - t.h[i]));
      assert.ok(Math.abs(t.tan[i].len() - 1) < 1e-6 && Math.abs(t.nrm[i].dot(t.tan[i])) < 1e-6 && Math.abs(t.bin[i].dot(t.tan[i])) < 1e-6, `${id}: orthonormal frame at ${i}`);
    }
    assert.ok(deg(rot) < 3.5, `${id}: frames turn at most ${deg(rot).toFixed(2)} deg per sample (no flips)`);
    assert.ok(dwh < 0.6, `${id}: corridor size changes gradually (${dwh.toFixed(2)} m per sample)`);
    // checkpoints: in order along the course, start line first, none inside a loop
    assert.equal(t.cpIdx[0], 0); for (let k = 1; k < t.cpS.length; k++) assert.ok(t.cpS[k] > t.cpS[k - 1], `${id}: checkpoint ${k} after ${k - 1}`);
    for (const i of t.cpIdx) assert.ok(!t.loopId || t.loopId[i] < 0, `${id}: checkpoint ${i} outside the loops`);
    assert.ok(t.pads.length >= 6 && t.cells.length >= 16, `${id} has boost rings and energy cells`);
    // hazards stand off the racing line (the AI's line and the natural line through the section). V12's added structures
    // (risers, buoys, the crane load, the pipe rack) are checked by tests/v12-obstacles.test.js
    for (const o of t.obstacles) {
      if (V12_KINDS.has(o.kind)) continue;
      const clear = o.type === 'vbeam' ? Math.abs(o.x - t.lineX[o.i]) : Math.abs(o.y - t.lineY[o.i]);
      assert.ok(clear > o.r + 3, `${id}: ${o.type} at ${o.i} is ${clear.toFixed(1)} m from the racing line`);
      assert.ok(o.type === 'vbeam' ? Math.abs(o.x) + o.r < t.w[o.i] : Math.abs(o.y) + o.r < t.h[o.i], `${id}: ${o.type} at ${o.i} inside the corridor`);
    }
  }
  const ig = getTrack('ignara'), tun = []; for (let i = 0; i < ig.N; i++) if (ig.tunnel[i]) tun.push(i);
  assert.ok(tun.length > 60 && tun.at(-1) - tun[0] === tun.length - 1, 'Ignara has one continuous rock tunnel');
});

test('Pelagos: two genuine 360° vertical loops, inverted at the top, wide enough, exit beside the entry', () => {
  const t = getTrack('pelagos');
  assert.equal(t.loops.length, 2);
  for (const L of t.loops) {
    const A = t.bin[L.i0]; let turn = 0, minNy = 1, kmax = 0, top = L.i0;
    for (let i = L.i0; i < L.i1; i++) {
      const a = t.tan[i], b = t.tan[i + 1]; turn += Math.atan2(new Vec3().crossVectors(a, b).dot(A), a.dot(b));
      minNy = Math.min(minNy, t.nrm[i].y); kmax = Math.max(kmax, t.kAbs[i]); if (t.pos[i].y > t.pos[top].y) top = i;
      assert.equal(t.loopId[i], L.seg);
    }
    assert.ok(Math.abs(Math.abs(deg(turn)) - 360) < 3, `${L.tag}: the course turns ${deg(turn).toFixed(1)} deg about the loop axis`);
    assert.ok(minNy < -0.999 && t.nrm[top].y < -0.99, `${L.tag}: upside down at the top`);
    assert.ok(t.pos[top].y - t.pos[L.i0].y > 2 * L.R - 20, `${L.tag}: climbs ${(t.pos[top].y - t.pos[L.i0].y).toFixed(0)} m`);
    assert.ok(1 / kmax >= 130 && 1 / kmax - t.h[top] > 100, `${L.tag}: radius ${(1 / kmax).toFixed(0)} m, corridor fits inside the curve`);
    let md = Infinity; for (let i = L.i0 - 60; i <= L.i0; i++) for (let j = L.i1; j <= L.i1 + 60; j++) md = Math.min(md, t.pos[t.wrapIdx(i)].dist(t.pos[t.wrapIdx(j)]));
    assert.ok(md > t.w[L.i0] + t.w[L.i1] + 20, `${L.tag}: the exit passes ${md.toFixed(0)} m beside the entry`);
  }
});

// one racer alone on the course, flown by the game's AI pilot; counts loop passages, inversion and damage in the loops
function loopRun(shipId, def, handling, skill, { laps = 1, onStep } = {}) {
  const t = getTrack('pelagos'), F = new Vec3(), U = new Vec3();
  const race = new Race({ track: t, laps, racers: [{ name: 'X', shipId, def, isPlayer: true, skill }], autopilot: true, seed: 3, countdown: 0, handling });
  const r = race.racers[0], st = { passes: 0, inverted: new Set(), wrecks: 0, loopWrecks: 0, loopDmg: 0, steps: 0 }; let L0 = -1, hull0 = 0;
  while (!r.finished && st.steps < 120 * 200 * laps) {
    race.step(SIM_DT, null); st.steps++;
    for (const e of race.events) if (e.type === 'explode') { st.wrecks++; if (t.loopId[r.ti] >= 0) st.loopWrecks++; }
    race.events.length = 0;
    const L = t.loopId[r.ti];
    if (L >= 0) { shipAxes(r.ship.quat, F, U); if (U.y < -0.9) st.inverted.add(L); }
    if (L >= 0 && L0 < 0) hull0 = r.ship.hull;
    if (L < 0 && L0 >= 0) { st.passes++; st.loopDmg = Math.max(st.loopDmg, (hull0 - r.ship.hull) / r.ship.def.hull); }
    L0 = L; if (onStep) onStep(race, r);
  }
  return { race, r, st };
}

test('Pelagos loops: every ship, standard and fully upgraded, flies both loops upside down in both handling modes', () => {
  const rows = []; let worst = 0;
  for (const [hn, handling] of HANDLINGS) for (const s of SHIPS) for (const def of [undefined, effectiveDef(s, MAXED)]) for (const skill of [0.45, 1]) {
    const { r, st } = loopRun(s.id, def, handling, skill); worst = Math.max(worst, st.loopDmg);
    const tag = `${hn} ${s.id}${def ? ' (upgraded)' : ''} skill ${skill}`;
    assert.ok(r.finished, `${tag}: finishes the lap`);
    assert.equal(st.passes, 2, `${tag}: through both loops`); assert.equal(st.inverted.size, 2, `${tag}: upside down in both loops`);
    assert.equal(st.loopWrecks, 0, `${tag}: no wreck in a loop`); assert.equal(r.resp || 0, 0, `${tag}: no respawn`);
    assert.ok(st.loopDmg < 0.15, `${tag}: at most ${(st.loopDmg * 100).toFixed(0)} % of the hull lost in a loop`);
    rows.push(`${tag}: ${r.finishTime.toFixed(1)} s`);
  }
  console.log('  ' + rows.length + ' single laps through both loops, at most ' + (worst * 100).toFixed(1) + ' % of a hull lost in one loop: ' + rows.filter((_, k) => k % 4 === 3).join(' | '));
});

for (const id of NEW) for (const [hn, handling] of HANDLINGS) {
  test(`5 laps on ${id === 'pelagos' ? 'Pelagos' : 'Ignara'} (${hn}): the full AI field finishes${id === 'pelagos' ? ', every racer flies both loops on every lap' : ''}`, () => {
    const t = getTrack(id);
    const racers = [{ name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 }, ...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.7 + 0.3 * a.bias }))];
    const race = new Race({ track: t, laps: 5, racers, autopilot: true, seed: 7, countdown: 3.6, handling });
    const passes = race.racers.map(() => 0), L0 = race.racers.map(() => -1), loops = t.loops && t.loops.length; let steps = 0, maxJump = 0;
    while (!race.racers.every(r => r.finished) && steps < 120 * 900) { // on past the race end (3 s after P1) until everyone is home
      const before = race.racers.map(r => r.ship.pos.clone());
      race.step(SIM_DT, null); steps++;
      const resp = new Set(race.events.filter(e => e.type === 'respawn').map(e => e.r)); race.events.length = 0;
      race.racers.forEach((r, k) => { if (!r.wrecked && !resp.has(r)) maxJump = Math.max(maxJump, r.ship.pos.dist(before[k]));
        if (loops) { const L = r.finished ? -1 : t.loopId[r.ti]; if (L < 0 && L0[k] >= 0) passes[k]++; L0[k] = L; } });
    }
    assert.ok(race.racers.every(r => r.finished && r.lapTimes.length === 5), 'all racers finished five laps');
    assert.ok(maxJump < 4, `no teleporting (max step ${maxJump.toFixed(2)} m)`);
    if (loops) race.racers.forEach((r, k) => assert.ok(passes[k] >= 10, `${r.name} flew the loops ${passes[k]} times`));
    for (const r of race.racers) assert.ok(r.bestLap > 25 && r.bestLap < 90, `${r.name}: plausible lap ${r.bestLap.toFixed(1)} s`);
    console.log(`  ${id} ${hn}: ` + race.order.map(r => `${r.name} ${r.finishTime.toFixed(1)}s resp ${r.resp || 0}`).join(' | '));
  });
}

test('respawn inside a loop: back on the course, oriented with the loop, and the lap goes on (wreck and manual reset)', () => {
  const t = getTrack('pelagos'), F = new Vec3(), U = new Vec3();
  for (const L of t.loops) for (const manual of [false, true]) for (const [hn, handling] of HANDLINGS) {
    let top = L.i0; for (let i = L.i0; i <= L.i1; i++) if (t.pos[i].y > t.pos[top].y) top = i;
    let done = false, checked = false;
    const { r, st } = loopRun('kestrel', undefined, handling, 0.8, { onStep: (race, rr) => {
      if (!done && Math.abs(t.deltaS(rr.s, top * t.D)) < 20) { done = true; if (manual) race.respawn(rr, true); else { rr.ship.hull = -1; } }
      if (done && !checked && !rr.wrecked && (rr.resp || 0) > 0) { checked = true;
        shipAxes(rr.ship.quat, F, U); const i = rr.ti;
        assert.ok(t.loopId[i] === L.seg, `${hn}: respawned inside the loop (at ${i})`);
        assert.ok(U.dot(t.nrm[i]) > 0.95 && F.dot(t.tan[i]) > 0.95, `${hn}: oriented with the loop`);
        assert.ok(Math.abs(rr.lx) < t.w[i] && Math.abs(rr.ly) < t.h[i], `${hn}: inside the corridor`);
        assert.ok(rr.ship.vel.dot(t.tan[i]) > 30, `${hn}: moving on along the loop`); } } });
    assert.ok(done && checked, `${L.tag} ${hn}: respawn happened`);
    assert.ok(r.finished, `${L.tag} ${hn} ${manual ? 'reset' : 'wreck'}: the lap is completed`); assert.equal(r.resp, 1); void st;
  }
});

// The chase view looks ahead along the ship's velocity, so a wall impact jolts it for a moment on every course (V8
// behaviour, unchanged); smoothness is measured in the loops away from impacts, and impacts are counted.
test('chase camera: follows the ship through both loops without flips or jumps (chase and far views)', () => {
  const t = getTrack('pelagos');
  for (const mode of ['chase', 'far']) for (const [hn, handling] of HANDLINGS) {
    const rig = new CameraRig(), F = new Vec3(), U = new Vec3(), up0 = new Vec3(), fwd0 = new Vec3(); let n = 0, maxUp = 0, maxFwd = 0, maxD = 0, minD = 1e9, minAlign = 1, inLoopFrames = 0, lastHit = -1e9, impacts = 0;
    loopRun('lancer', effectiveDef(SHIPS.find(s => s.id === 'lancer'), MAXED), handling, 1, { onStep: (race, r) => {
      n++;
      if (r.hits !== race._hits0) { race._hits0 = r.hits; lastHit = n; if (t.loopId[r.ti] >= 0) impacts++; }
      if (n % 2) return; // 60 frames per second
      const s = r.ship; rig.follow(1 / 60, { p: s.pos, q: s.quat, vel: s.vel, boost: s.boosting, eye: { x: 0, y: 0.6, z: 1 }, bank: 0 }, mode, { settings: { fov: 72, shake: 0 }, track: t, ti: r.ti, maxSpeed: s.def.maxSpeed });
      const c = rig.cam, inLoop = t.loopId[r.ti] >= 0;
      if (n > 2 && inLoop && n - lastHit > 30) { maxUp = Math.max(maxUp, ang(c.up, up0)); maxFwd = Math.max(maxFwd, ang(c.fwd, fwd0)); }
      up0.copy(c.up); fwd0.copy(c.fwd);
      if (inLoop) { inLoopFrames++; shipAxes(s.quat, F, U); minAlign = Math.min(minAlign, c.up.dot(U)); const d = c.pos.dist(s.pos); maxD = Math.max(maxD, d); minD = Math.min(minD, d); }
    } });
    assert.ok(inLoopFrames > 300, `${mode} ${hn}: frames in the loops`);
    assert.ok(deg(maxUp) < 4 && deg(maxFwd) < 4, `${mode} ${hn}: the view turns at most ${deg(maxUp).toFixed(2)} (up) / ${deg(maxFwd).toFixed(2)} (forward) deg per frame`);
    console.log(`  camera ${mode} ${hn}: ${inLoopFrames} frames in the loops, at most ${deg(maxUp).toFixed(2)} deg (up) / ${deg(maxFwd).toFixed(2)} deg (forward) per frame away from impacts, ${minD.toFixed(1)}-${maxD.toFixed(1)} m behind the ship, up vector within ${deg(Math.acos(minAlign)).toFixed(0)} deg of the ship's, ${impacts} wall contacts in the loops`);
    assert.ok(minAlign > 0.7, `${mode} ${hn}: the camera rolls with the ship through the loop (${minAlign.toFixed(2)})`);
    assert.ok(minD > 3 && maxD < 20, `${mode} ${hn}: the camera stays ${minD.toFixed(1)}..${maxD.toFixed(1)} m behind the ship`);
  }
});

test('every client and the server compute the same course: fresh builds equal the shared course data', () => {
  for (const id of NEW) {
    const def = TRACK_DEFS.find(d => d.id === id), a = buildPathTrack(def); def.populate(a, makeRng(def.seed)); a.updateObstacles(0);
    const b = getTrack(id);
    assert.equal(fingerprint(a), fingerprint(b), `${id}: a second build is identical`);
    const info = trackInfo(id); assert.equal(info.L, b.length); assert.deepEqual(info.cpS, b.cpS); assert.equal(info.M, def.checkpoints);
  }
});
