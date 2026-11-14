// GALACTIC RUSH V10 — the two new courses: Verdant Canopy (a jungle world of giant trees: dense organic obstacles)
// and Orbital Nexus (a multi-level orbital station with gravity sections). Both are 3D paths built by pathtrack.js;
// tracks.js appends them to TRACK_DEFS after the six V2–V9 courses. populate() places checkpoints, boost rings, energy
// cells and the obstacles with its own seeded random stream. Orbital Nexus first turns its plated segments into
// gravity sections (gravity.js); Verdant Canopy builds its branches and roots as chains of sphere obstacles that follow
// the visible wood, so every solid branch inside the corridor collides and nothing else does.
import { Vec3 } from '../math.js';
import { GRAVITY } from './gravity.js';
// V12: Orbital Nexus's new obstacles (nexus12 below)
import { part, arm } from './solids.js';

const frac = (t, f) => Math.floor(f * t.N) % t.N;
const tagged = (t, tag) => t.tags.get(tag) || [];
const along = (t, tag, f) => { const a = tagged(t, tag); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
// sample at fraction f of the k-th segment that carries a tag
const alongSeg = (t, tag, k, f) => { const ids = [...new Set(tagged(t, tag).map(i => t.segIdx[i]))], a = tagged(t, tag).filter(i => t.segIdx[i] === ids[k]); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };

// checkpoints evenly spaced along the course; index 0 is the start line
function checkpoints(t, n, ok = () => true) {
  const list = []; for (let i = 0; i < t.N; i++) if (ok(i)) list.push(i);
  t.cpIdx = []; t.cpS = [];
  for (let k = 0; k < n; k++) { const i = list[Math.round(k * list.length / n)]; t.cpIdx.push(i); t.cpS.push(i * t.D); }
  if (t.cpIdx[0] !== 0) throw new Error('the start line must be checkpoint 0');
}
function pads(t, list) { for (const i of list) t.pads.push({ i, x: t.lineX[i], y: t.lineY[i], r: 8 }); }
function cells(t, list, rng, side0 = 1, yk = 0.3) {
  list.forEach((i0, k) => { const side = (k % 2 ? -1 : 1) * side0;
    for (let j = 0; j < 4; j++) { const i = t.wrapIdx(i0 + j * 5); t.cells.push({ i, x: side * t.w[i] * 0.45 + rng.range(-2, 2), y: t.lineY[i] + rng.range(-yk, yk) * Math.min(6, t.h[i]), ion: j === 3 && k % 3 === 1 }); } });
}

// ---------------------------------------------------------------- Verdant Canopy: wood as sphere chains
// A piece of wood is a polyline of world points with a radius at each point. Spheres follow it about 0.6 radii apart
// (the dips between them are under 5% of the radius); only the spheres that reach into the corridor are kept, each at
// its exact world position. The visual record (t.wood) keeps the whole polyline for the renderer.
const loc = {};
function wood(t, pts, rad, kind, hint) {
  const rec = { kind, pts: pts.map(p => p.clone()), rad: rad.slice(), spheres: 0, group: t.wood.length };
  let h = hint;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = a.dist(b), n = Math.max(1, Math.ceil(L / (Math.min(rad[k], rad[k + 1]) * 0.6)));
    for (let j = k ? 1 : 0; j <= n; j++) {
      const u = j / n, r = rad[k] + (rad[k + 1] - rad[k]) * u, p = new Vec3().lerpVectors(a, b, u);
      t.locate(p, h, loc, 40); h = loc.i;
      if (Math.abs(loc.along) > t.D || Math.abs(loc.x) > t.w[loc.i] + r - 0.2 || Math.abs(loc.y) > t.h[loc.i] + r - 0.2) continue;
      t.addObstacle({ type: 'sphere', kind, i: loc.i, x: loc.x, y: loc.y, r, group: rec.group, seed: rec.group });
      const o = t.obstacles[t.obstacles.length - 1]; o.base.copy(p); o.p.copy(p); rec.spheres++;
    }
  }
  t.wood.push(rec);
  return rec;
}
// world point at a fractional sample position s, lateral x, height y in the course frame
function atf(t, s, x, y) {
  const i0 = Math.floor(s), u = s - i0, a = t.pointAt(t.wrapIdx(i0), x, y);
  return u > 1e-6 ? a.lerp(t.pointAt(t.wrapIdx(i0 + 1), x, y), u) : a;
}
// a branch across the corridor at sample i, from (x0, y0) to (x1, y1) in the cross-section (metres), carried on beyond
// those points by ext0 / ext1 metres (so a branch across the corridor visibly grows out of the forest on both sides, and
// a limb ends in a tip inside it); tapering from r0 to r1, its two ends `lean` metres apart along the course (an
// oblique branch), sagging a little when it lies flat
function branch(t, i, x0, y0, x1, y1, r0, r1, kind = 'branch', ext0 = 30, lean = 0, ext1 = ext0) {
  const n = 8, pts = [], rad = [], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  for (let k = 0; k <= n; k++) { const u = k / n, s = -ext0 + (L + ext0 + ext1) * u, sag = 2.5 * Math.sin(Math.PI * u) * (1 - Math.abs(uy));
    pts.push(atf(t, i + lean * (u - 0.5) / t.D, x0 + ux * s, y0 + uy * s - sag)); rad.push(r0 + (r1 - r0) * u); }
  return wood(t, pts, rad, kind, i);
}
// a polyline given in the cross-section of sample i (points [x, y]) — roots that arch across the corridor
function arch(t, i, xy, r, kind = 'root', lean = 0) {
  const cp = xy.map(([x, y], k) => atf(t, i + lean * (k / (xy.length - 1) - 0.5) / t.D, x, y)), pts = [];
  // a smooth curve through the control points (Catmull-Rom, four points per span): the collision and the drawn root
  // follow the same polyline
  for (let k = 0; k < cp.length - 1; k++) { const p0 = cp[Math.max(0, k - 1)], p1 = cp[k], p2 = cp[k + 1], p3 = cp[Math.min(cp.length - 1, k + 2)];
    for (let j = 0; j < 4; j++) { const u = j / 4, u2 = u * u, u3 = u2 * u, o = new Vec3();
      for (const c of ['x', 'y', 'z']) o[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
      pts.push(o); } }
  pts.push(cp[cp.length - 1]);
  return wood(t, pts, pts.map(() => r), kind, i);
}
// a vertical root or trunk standing through the corridor: a vbeam (it spans the corridor's full height)
function column(t, i, x, r, kind) { t.addObstacle({ type: 'vbeam', kind, i: t.wrapIdx(i), x, r }); }
// soft vegetation inside the corridor (hanging vines, leaf curtains, moss): drawn, flown through, never collides
function soft(t, i, x0, x1, y0, y1, kind) { t.soft.push({ i: t.wrapIdx(i), x0, x1, y0, y1, kind }); }

// V12: eight more obstacles on Orbital Nexus, all station machinery, none within 40 m of a checkpoint or a boost ring.
// They sit in the course's own frame, so in the gravity sections they stand on whichever wall is the deck:
//   the hangar's servicing arm, hanging from the ceiling gantry and swinging across the top of the corridor;
//   the bulkhead's blast door, its two leaves half open;
//   a coolant conduit from the energy core to the chamber wall, across the corridor; the airlock's service main;
//   in the Spindle, a maintenance arm on a ring turning round the shaft, sweeping through it as the ring turns;
//   outside, a docking arm reaching across the hull and a radiator truss over it.
// Every motion follows the race clock (solids.js), so all pilots see and meet the same thing.
function nexus12(t, I, S, W, H) {
  // servicing arm: pivot on the gantry 20 m over the corridor, the arm reaching down through the upper half of it
  { const i = I('hangar', 0.32), py = H(i) + 20; arm(t, i, W(i) * 0.2, py, 20, 20 + H(i), 2.4, 2.0, { th0: -Math.PI / 2, amp: 0.42, w: 0.75, ph: 1.1 }, 'servo'); }
  // blast door leaves: from each wall, the left one standing further in
  { const i = I('bulkhead', 0.82); t.addObstacle({ type: 'vbeam', kind: 'door', i, x: -(W(i) - 4.5), r: 3.0 }); t.addObstacle({ type: 'vbeam', kind: 'door', i: t.wrapIdx(i + 2), x: W(i) - 2.5, r: 3.0 }); }
  // a coolant conduit from the energy core to the chamber wall, across the corridor high over the deck
  { const i = I('core', 0.63); t.addObstacle({ type: 'hbeam', kind: 'conduit', i, y: 0.45 * H(i), r: 1.9 }); }
  // the airlock's service main: from the left wall to just past the middle, low, then down into the deck (no gravity
  // here: over it, or round it on the right)
  { const i = I('airlock', 0.5); part(t, [t.pointAt(i, -W(i) - 6, -0.42 * H(i)), t.pointAt(i, 0.12 * W(i), -0.36 * H(i)), t.pointAt(i, 0.12 * W(i) + 3, -H(i) - 6)], [2.0, 2.0, 2.0], 'main', i); }
  // the Spindle's maintenance arm: carried by a ring turning round the shaft (once every 7 s), reaching in through a
  // slot in the shaft to 7 m from its axis; it sweeps one side of the corridor at a time
  { const i = I('spindle', 0.42); arm(t, i, 0, 0, 7, Math.hypot(W(i), H(i)) + 3, 2.2, 2.4, { th0: 0, w: 2 * Math.PI / 7, ph: 0 }, 'sweeper'); }
  // outside: a docking arm from the hull reaching across, then a radiator truss spanning the corridor high up
  { const i = S('exterior', 1, 0.85), a = t.pointAt(i - 10, W(i) * 1.15, -H(i) * 1.1), b = t.pointAt(i, -W(i) * 0.15, H(i) * 0.15), c = t.pointAt(i + 6, -W(i) * 0.55, H(i) * 0.25);
    part(t, [a, b, c], [3.0, 2.6, 2.2], 'dockarm', i); }
  { const i = S('exterior', 3, 0.25); t.addObstacle({ type: 'hbeam', kind: 'radiator', i, y: H(i) * 0.5, r: 2.4 }); }
}

export const V10_TRACKS = [
  {
    id: 'canopy', name: 'Verdant Canopy', short: 'JUNGLE WORLD', theme: 'jungle', checkpoints: 10, seed: 97, build: 'path10',
    tagline: 'Weave through the roots and branches of trees taller than mountains, skim the canopy and spiral down the Elder Tree.',
    path: { x: 0, z: 0, y: -20, heading: 0, w: 26, h: 17, turns: -720, maxBank: 24, segs: [
      { s: 300, tag: 'start' },
      { turn: -55, r: 160, y: -45, w: 26, h: 16, tag: 'roots' },
      { s: 140, y: -75, tag: 'roots' },
      { turn: 70, r: 120, y: -98, tag: 'roots' },
      { turn: -90, r: 105, y: -110, tag: 'roots' },
      { s: 150, tag: 'roots' },
      { turn: -15, r: 200, y: -95, tag: 'roots' },
      { s: 200, y: -40, w: 28, h: 18, tag: 'branches' },
      { turn: -50, r: 230, y: 15, tag: 'branches' },
      { turn: 40, r: 220, y: 60, tag: 'branches' },
      { s: 180, y: 105, tag: 'branches' },
      { turn: -80, r: 210, y: 160, tag: 'branches' },
      { s: 330, y: 225, w: 30, h: 19, free: 'len', tag: 'skylight' },
      { s: 200, y: 290, w: 42, h: 21, tag: 'canopy' },
      { turn: 30, r: 650, y: 312, tag: 'canopy' },
      { s: 160, y: 300, tag: 'canopy' },
      { turn: -90, r: 520, y: 322, tag: 'canopy' },
      { s: 280, y: 305, free: 'len', tag: 'canopy' },
      { turn: -60, r: 280, y: 285, w: 30, h: 16, tag: 'platforms' },
      { s: 120, y: 285, tag: 'platforms' },
      { s: 140, y: 250, tag: 'platforms' },
      { s: 150, y: 250, tag: 'platforms' },
      { turn: 50, r: 220, y: 250, tag: 'platforms' },
      { s: 140, y: 212, tag: 'platforms' },
      { turn: -30, r: 220, y: 212, tag: 'platforms' },
      { s: 130, y: 160, w: 26, h: 17, tag: 'descent' },
      { turn: -440, r: 155, y: 10, tag: 'spiral' },
      { s: 120, w: 30, h: 16, tag: 'slalom' },
      { turn: 40, r: 200, tag: 'slalom' },
      { turn: -40, r: 200, tag: 'slalom' },
      { s: 150, y: -5, tag: 'slalom' },
      { turn: -60, r: 200, free: 'turn', tag: 'final' },
      { s: 150, tag: 'final' },
      { turn: 60, r: 220, y: -20, w: 26, h: 17, tag: 'final' },
      { s: 160, tag: 'final' },
    ] },
    populate(t, rng) {
      t.wood = []; t.soft = []; t.platforms = [];
      checkpoints(t, this.checkpoints);
      const I = (tag, f) => along(t, tag, f), W = i => t.w[i], H = i => t.h[i];
      const S = (tag, k, f) => alongSeg(t, tag, k, f);
      // ---- the Root Passage: gates of buttress roots, aerial roots, a root across the floor, one reaching down from above
      const gate = (i, top, r) => arch(t, i, [[-W(i) - 14, -H(i) - 12], [-W(i) - 1.5, -H(i) * 0.2], [-W(i) * 0.55, H(i) * top], [0, H(i) + 2], [W(i) * 0.55, H(i) * top], [W(i) + 1.5, -H(i) * 0.2], [W(i) + 14, -H(i) - 12]], r, 'root', 10);
      { let i = S('roots', 0, 0.55); gate(i, 0.7, 3.0);
        i = S('roots', 1, 0.25); arch(t, i, [[-W(i) - 10, -H(i) - 6], [-W(i) * 0.5, -H(i) * 0.62], [0, -H(i) * 0.45], [W(i) * 0.5, -H(i) * 0.62], [W(i) + 10, -H(i) - 6]], 3.0, 'root', 16);
        i = S('roots', 2, 0.54); column(t, i, W(i) * 0.52, 2.8, 'aerial');
        i = S('roots', 4, 0.05); arch(t, i, [[-W(i) - 12, H(i) + 10], [-W(i) * 0.7, H(i) * 0.4], [-W(i) * 0.5, -H(i) * 0.1], [-W(i) * 0.45, -H(i) - 10]], 3.2, 'root', 12);
        i = S('roots', 5, 0.5); gate(i, 0.55, 3.0); }
      // ---- the Branch Network: a branch every 100 m or so, each leaving a different part of the corridor open
      { const B = [[0, 0.3, -1.08, 0.6, 0.25, -1.08, 2.6, 1.8], [0, 0.8, -1.08, 0.15, 1.08, -0.05, 2.4, 2.0], [1, 0.35, -0.15, -1.08, 1.08, 0.5, 2.6, 1.9], [4, 0.55, -1.08, 0.45, 1.08, 0.55, 2.2, 1.8],
          [3, 0.5, 0.55, 1.08, -0.05, -1.08, 2.8, 2.0], [4, 0.3, -1.08, -0.5, 1.08, -0.4, 2.4, 2.0]];
        B.forEach(([k, f, x0, y0, x1, y1, r0, r1], n) => { const i = S('branches', k, f); branch(t, i, x0 * W(i), y0 * H(i), x1 * W(i), y1 * H(i), r0, r1, 'branch', 34, (n % 2 ? 1 : -1) * 10); });
        // a fork reaching in from the right, and a V hanging from above
        let i = S('branches', 1, 0.66); branch(t, i, 1.08 * W(i), -0.4 * H(i), -0.3 * W(i), 0.35 * H(i), 2.6, 1.4, 'branch', 34, 0, 0); branch(t, i + 2, 1.08 * W(i), -0.45 * H(i), -0.45 * W(i), -0.75 * H(i), 2.2, 1.3, 'branch', 34, 0, 0);
        i = S('branches', 4, 0.75); branch(t, i, -0.9 * W(i), 1.08 * H(i), -0.3 * W(i), -0.3 * H(i), 2.2, 1.4, 'branch', 30, 0, 0); branch(t, i + 1, 0.3 * W(i), 1.08 * H(i), -0.28 * W(i), -0.28 * H(i), 2.2, 1.4, 'branch', 30, 0, 0);
        for (const [k, f] of [[0, 0.55], [2, 0.8], [4, 0.5]]) { const j = S('branches', k, f); soft(t, j, -W(j), W(j), H(j) * 0.1, H(j), 'vines'); } }
      // ---- the Skylight: one last branch, then the leaves of the canopy roof
      { const i = I('skylight', 0.3); branch(t, i, -1.08 * W(i), 0.38 * H(i), 1.08 * W(i), 0.62 * H(i), 2.2, 1.8, 'branch', 34);
        const k = I('skylight', 0.65); soft(t, k, -W(k), W(k), -H(k), H(k), 'leaves'); }
      // ---- the Canopy Run: the trunks of emergent giants standing up through the canopy
      for (const [k, f, x] of [[0, 0.6, 0.45], [2, 0.5, -0.4], [3, 0.5, 0.5], [4, 0.5, 0.35]]) { const i = S('canopy', k, f); column(t, i, x * W(i), 4, 'emergent'); }
      // ---- the Floating Platforms: hanging lianas at the platform edges
      for (const [k, f, x] of [[1, 0.5, 0.7], [4, 0.5, -0.65], [6, 0.5, 0.7]]) { const i = S('platforms', k, f); column(t, i, x * W(i), 1.8, 'liana'); }
      // ---- the Elder Tree spiral: limbs growing out of the trunk on the inside of the curve
      { const sp = tagged(t, 'spiral'); for (let k = 0; k < 7; k++) { const i = sp[Math.floor((0.1 + k * 0.13) * sp.length)], y = [-0.45, 0.35, -0.05, 0.5, -0.5, 0.2, -0.3][k], L = [0.33, 0.42, 0.36, 0.42, 0.38, 0.42, 0.36][k];
        branch(t, i, -1.08 * W(i), y * H(i), (-1 + L * 2) * W(i), (y + (k % 2 ? -0.2 : 0.2)) * H(i), 3.0, 1.6, 'limb', 60, 0, 0); }
        const i = I('descent', 0.5); branch(t, i, -0.4 * W(i), 1.08 * H(i), -1.08 * W(i), -0.2 * H(i), 2.4, 1.8, 'branch', 30); }
      // ---- the slalom between trunks to the finish
      for (const [k, f, x] of [[1, 0.53, 0.55], [2, 0.45, 0.45], [3, 0.24, -0.48]]) { const i = S('slalom', k, f); column(t, i, x * W(i), 3.2, 'trunk'); }
      { const i = S('final', 1, 0.5); gate(i, 0.6, 3.0); }
      pads(t, [I('start', 0.55), S('roots', 4, 0.15), S('branches', 3, 0.15), I('skylight', 0.85), S('canopy', 0, 0.2), S('canopy', 2, 0.15), S('canopy', 4, 0.75), S('platforms', 2, 0.5), I('spiral', 0.55), S('final', 3, 0.4)]);
      cells(t, [S('roots', 1, 0.15), S('branches', 3, 0.85), S('canopy', 1, 0.5), S('platforms', 3, 0.6), I('spiral', 0.22), S('slalom', 3, 0.85)], rng);
      // ---- the platforms under the corridor: decks where the course is level, ramps where it steps down, a bridge of
      // living wood between decks; one unbroken surface from the first platform to the last
      { const ids = tagged(t, 'platforms'); let k = 0;
        while (k < ids.length) { const i = ids[k], slope = Math.abs(t.tan[i].y), kind = slope > 0.03 ? 'ramp' : 'deck'; let n = 1;
          while (k + n < ids.length && (Math.abs(t.tan[ids[k + n]].y) > 0.03 ? 'ramp' : 'deck') === kind && (kind === 'ramp' || n < 36)) n++;
          t.platforms.push({ i0: i, i1: ids[k + n - 1], kind }); k += n;
          if (kind === 'deck' && k < ids.length && Math.abs(t.tan[ids[k]].y) <= 0.03) { const m = Math.min(8, ids.length - k); t.platforms.push({ i0: ids[k], i1: ids[k + m - 1], kind: 'bridge' }); k += m; } } }
    },
  },
  {
    id: 'nexus', name: 'Orbital Nexus', short: 'ORBITAL STATION', theme: 'station', checkpoints: 10, seed: 109, build: 'path10',
    tagline: 'Launch from a megastation hangar, ride the walls of the energy core and the ceilings of glass corridors, then race its hull.',
    path: { x: 0, z: 0, y: 0, heading: 0, w: 24, h: 14, turns: -360, segs: [
      { s: 300, tag: 'start' },
      { turn: 75, r: 100, w: 26, tag: 'hangar' },
      { s: 90, tag: 'hangar' },
      { turn: -75, r: 100, tag: 'hangar' },
      { s: 160, y: 10, w: 21, h: 11, tunnel: true, tag: 'bulkhead' },
      { s: 300, grav: true, roll: -90, w: 22, h: 10, tunnel: true, tag: 'coreentry' },
      { turn: -270, r: 210, bank: 0, grav: true, y: 90, tag: 'core' },
      { s: 300, grav: true, roll: -90, tunnel: true, tag: 'coreexit' },
      { s: 120, grav: true, tag: 'glassentry' },
      { turn: 180, r: 210, bank: 0, grav: true, y: 110, tag: 'glass' },
      { s: 200, grav: true, tag: 'glass' },
      { s: 560, grav: true, roll: -180, tunnel: true, tag: 'spindle' },
      { s: 120, w: 30, h: 18, tunnel: true, tag: 'airlock' },
      { s: 200, w: 46, h: 30, tag: 'exterior' },
      { turn: -90, r: 280, y: 50, tag: 'exterior' },
      { s: 250, free: 'len', y: -10, tag: 'exterior' },
      { turn: -90, r: 230, free: 'turn', y: -50, w: 36, h: 24, tag: 'exterior' },
      { s: 200, w: 26, h: 16, y: -70, tag: 'aperture' },
      { s: 100, grav: true, w: 20, h: 10, tunnel: true, tag: 'cargo' },
      { turn: 70, r: 70, bank: 0, grav: true, tunnel: true, tag: 'cargo' },
      { turn: -70, r: 70, bank: 0, grav: true, tunnel: true, tag: 'cargo' },
      { s: 200, free: 'len', grav: true, tunnel: true, tag: 'cargo' },
      { turn: -90, r: 90, bank: 0, grav: true, tunnel: true, tag: 'cargo' },
      { s: 360, y: 0, w: 24, h: 14, tag: 'ramp' },
    ] },
    populate(t, rng) {
      checkpoints(t, this.checkpoints);
      const S = (tag, k, f) => alongSeg(t, tag, k, f), I = (tag, f) => along(t, tag, f), W = i => t.w[i], H = i => t.h[i];
      // the hangar: a crane bridge over the launch straight
      { const i = I('start', 0.82); t.addObstacle({ type: 'hbeam', kind: 'crane', i, y: H(i) * 0.62, r: 2.4 }); }
      // the energy core: conduit struts reaching out of the wall toward the core (columns of the rolled frame)
      for (const [f, x] of [[0.22, 0.55], [0.5, -0.55], [0.78, 0.5]]) { const i = I('core', f); column(t, i, x * W(i), 2.4, 'strut'); }
      // the exterior: antenna masts on the hull beside the fast line
      for (const [k, f, x] of [[0, 0.6, 0.62], [1, 0.55, -0.6], [3, 0.5, 0.6]]) { const i = S('exterior', k, f); column(t, i, x * W(i), 2.6, 'mast'); }
      // the cargo levels: pillars, and two lanes of cargo pods crossing the deck
      { let i = S('cargo', 0, 0.5); column(t, i, W(i) * 0.55, 2.4, 'pillar');
        i = S('cargo', 3, 0.75); column(t, i, -W(i) * 0.55, 2.4, 'pillar');
        { const j = S('cargo', 3, 0.35), span = 2 * (W(j) + 70);
          t.traffic.push({ i: j, y: t.lineY[j], dir: 1, speed: 24, spacing: span / 2, phase: rng.range(0, span), n: 2, r: 3.2, seed: Math.floor(rng() * 1e6), kind: 'pod' }); } }
      pads(t, [I('start', 0.45), S('hangar', 2, 0.2), I('glass', 0.85), S('exterior', 0, 0.3), S('exterior', 2, 0.5), I('aperture', 0.5), I('ramp', 0.5)]);
      cells(t, [I('bulkhead', 0.3), I('core', 0.35), I('glass', 0.45), S('exterior', 1, 0.3), S('cargo', 0, 0.2)], rng);
      nexus12(t, I, S, W, H);
    },
  },
];
