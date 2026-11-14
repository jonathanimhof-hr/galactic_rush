// GALACTIC RUSH V9 — the two new courses, Pelagos (ocean world, two vertical loops) and Ignara (volcanic world).
// Both are 3D paths built by pathtrack.js; tracks.js appends them to TRACK_DEFS after the four original courses.
// populate() places checkpoints, boost rings, energy cells and hazards with its own seeded random stream.
// V12: Pelagos gets seven more obstacles (pelagos12 below), all parts of the extraction field it already shows.
import { part, arm } from './solids.js';
const frac = (t, f) => Math.floor(f * t.N) % t.N;
const nearAny = (t, i, list, gap) => list.some(o => Math.abs(t.deltaS(i * t.D, o.i * t.D)) < gap);
const inLoop = (t, i, pad = 0) => { for (let k = -pad; k <= pad; k++) if (t.loopId[t.wrapIdx(i + k)] >= 0) return true; return false; };
const tagged = (t, tag) => t.tags.get(tag) || [];
const along = (t, tag, f) => { const a = tagged(t, tag); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
// sample at fraction f of the k-th segment that carries a tag
const alongSeg = (t, tag, k, f) => { const ids = [...new Set(tagged(t, tag).map(i => t.segIdx[i]))], a = tagged(t, tag).filter(i => t.segIdx[i] === ids[k]); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };

// checkpoints evenly spaced along the course outside its loops (a gate frame reads better on open track); index 0 is
// the start line
function checkpoints(t, n) {
  const ok = []; for (let i = 0; i < t.N; i++) if (!inLoop(t, i, 12)) ok.push(i);
  t.cpIdx = []; t.cpS = [];
  for (let k = 0; k < n; k++) { const i = ok[Math.round(k * ok.length / n)]; t.cpIdx.push(i); t.cpS.push(i * t.D); }
  if (t.cpIdx[0] !== 0) throw new Error('the start line must be checkpoint 0');
}
// boost rings on the racing line
function pads(t, list) { for (const i of list) t.pads.push({ i, x: t.lineX[i], y: t.lineY[i], r: 8 }); }
// clusters of four energy cells along one side of the corridor (the third of every other cluster carries an ion bolt)
function cells(t, list, rng, side0 = 1) {
  list.forEach((i0, k) => { const side = (k % 2 ? -1 : 1) * side0;
    for (let j = 0; j < 4; j++) { const i = t.wrapIdx(i0 + j * 5); t.cells.push({ i, x: side * t.w[i] * 0.45 + rng.range(-2, 2), y: rng.range(-0.3, 0.3) * t.h[i], ion: j === 3 && k % 3 === 1 }); } });
}
// energy cells in a loop sit on its inside line (toward the loop's centre), where the fast line runs
function loopCells(t, i0, rng) { for (let j = 0; j < 5; j++) { const i = t.wrapIdx(i0 + j * 6); t.cells.push({ i, x: rng.range(-2, 2), y: t.h[i] * 0.4, ion: j === 2 }); } }

// V12: seven more obstacles on Pelagos, each part of an installation the course already has, none in a loop, none
// within 40 m of a checkpoint or a boost ring:
//   the skim deck's two drilling risers, hanging from the deck into the sea through the wave-skimming section;
//   a crane barge by the island turn, its load swinging on the cable across the top of the corridor;
//   two spar buoys of the extraction field standing in the swell, riding it up and down;
//   a pipe rack across the return straight: a low pipe, then a support leg of the rack.
// Every motion follows the race clock (solids.js), so all pilots see and meet the same thing.
function pelagos12(t) {
  const at = (tag, f) => along(t, tag, f), Wd = i => t.w[i], Ht = i => t.h[i], SEA = 0;
  const up = (i, x, y0, y1, r, kind, move) => { const a = t.pointAt(i, x, 0), b = a.clone(); a.y = y0; b.y = y1; return part(t, [a, b], [r, r], kind, i, move); };
  // the skim deck spans the corridor at 62 % of the skim section; its risers hang from it: one stands in the corridor at
  // the deck's front edge on the inside of the line out of the turn before (off the fast line, like every hazard of the
  // course), the other beside the corridor (a part is solid only where it reaches in, so that one is scenery)
  { const d = tagged(t, 'skim')[Math.floor(tagged(t, 'skim').length * 0.62)];
    for (const [k, fx] of [[-4, -0.42], [6, 1.3]]) { const i = t.wrapIdx(d + k), top = t.pos[i].y + Ht(i) + 13; up(i, fx * Wd(i), SEA - 6, top, 1.7, 'riser'); } }
  // the crane barge's load: a module of 3.2 m on a cable from the boom tip 24 m over the corridor, swinging +-0.55 rad
  { const i = at('island', 0.78), py = Ht(i) + 24, L = 24 + Ht(i) * 0.5; arm(t, i, Wd(i) * 0.15, py, L, L, 3.2, 3.2, { th0: -Math.PI / 2, amp: 0.55, w: 0.85, ph: 0.6 }, 'load'); }
  // spar buoys in the swell: from 6 m under the sea up to 30 % of the corridor's height, bobbing 1.5 m with the swell, off
  // the fast line: they catch ships that skim the waves wide
  for (const [f, fx, ph] of [[0.25, 0.36, 0.4], [0.62, -0.38, 2.1]]) { const i = at('swell', f), top = t.pos[i].y - Ht(i) * 0.4; up(i, fx * Wd(i), SEA - 6, top, 1.8, 'buoy', { ax: 0, ay: 1.5, w: 0.7, ph }); }
  // the pipe rack over the return straight: its lowest pipe across the corridor, then one of its legs standing in it
  { const i = at('return', 0.12); t.addObstacle({ type: 'hbeam', kind: 'pipe', i, y: -Ht(i) * 0.38, r: 2.0 });
    const j = at('return', 0.27); t.addObstacle({ type: 'vbeam', kind: 'rackleg', i: j, x: Wd(j) * 0.42, r: 2.2 }); }
}

export const V9_TRACKS = [
  {
    id: 'pelagos', name: 'Pelagos', short: 'OCEAN WORLD', theme: 'ocean', checkpoints: 9, seed: 71,
    tagline: 'Skim a storm-tossed ocean, thread the extraction rigs and fly two full vertical loops above the waves.',
    path: { x: 0, z: 0, y: 40, heading: 0, w: 30, h: 20, turns: 360, segs: [
      { s: 300, tag: 'start' },
      { turn: 30, r: 450, y: 26 },
      { s: 200, y: 16, h: 10, w: 26, tag: 'skim' },
      { s: 380, tag: 'skim' },
      { turn: -30, r: 400, y: 56, w: 30, h: 18 },
      { s: 220, w: 18, h: 13, y: 66, tag: 'preloop1' },
      { loop: 150, ramp: 90, shift: 56, tag: 'loop1' },
      { s: 180, w: 30, h: 20, tag: 'postloop1' },
      { turn: 135, r: 190, y: 42, tag: 'hook' },
      { s: 160, w: 22, tag: 'narrows' },
      { turn: -40, r: 200, tag: 'narrows' },
      { turn: 40, r: 200, w: 28, tag: 'narrows' },
      { s: 200, y: 52, h: 18, tag: 'bridge' },
      { turn: 45, r: 450, tag: 'island' },
      { s: 200, y: 66, w: 18, h: 13, tag: 'preloop2' },
      { loop: 135, ramp: 80, shift: -56, tag: 'loop2' },
      { s: 180, w: 30, h: 20, tag: 'postloop2' },
      { turn: 45, r: 350, free: 'turn', y: 40, tag: 'flare' },
      { s: 260, y: 18, h: 11, w: 26, tag: 'swell' },
      { s: 400, free: 'len', tag: 'swell' },
      { s: 240, y: 40, h: 20, w: 30, tag: 'return' },
      { turn: 45, r: 300, tag: 'return' },
      { s: 300, free: 'len', tag: 'return' },
      { turn: 90, r: 260, tag: 'final' },
      { s: 120, tag: 'final' },
    ] },
    populate(t, rng) {
      checkpoints(t, this.checkpoints);
      pads(t, [along(t, 'start', 0.5), along(t, 'skim', 0.55), along(t, 'postloop1', 0.6), along(t, 'bridge', 0.5), along(t, 'postloop2', 0.6), along(t, 'swell', 0.5), along(t, 'return', 0.7)]);
      cells(t, [along(t, 'skim', 0.2), along(t, 'narrows', 0.1), along(t, 'island', 0.4), along(t, 'return', 0.35)], rng);
      for (const L of t.loops) loopCells(t, t.wrapIdx(L.i0 + Math.round((L.i1 - L.i0) * 0.42)), rng);
      // the narrows: two support columns of the extraction platform stand in the straight, clear of the racing line,
      // then a pipe bridge spans the corridor at the end of the S-bend
      for (const [f, sx] of [[0.3, 1], [0.75, -1]]) { const i = alongSeg(t, 'narrows', 0, f); t.addObstacle({ type: 'vbeam', i, x: sx * t.w[i] * 0.45, r: 3.5 }); }
      { const i = along(t, 'narrows', 0.86); t.addObstacle({ type: 'hbeam', i, y: t.h[i] * 0.4, r: 2.8 }); }
      pelagos12(t);
    },
  },
  {
    id: 'ignara', name: 'Ignara', short: 'VOLCANIC WORLD', theme: 'volcano', checkpoints: 9, seed: 83,
    tagline: 'Race a lava canyon, drop down the falls, burn through a ridge tunnel and cross the mines on molten bridges.',
    path: { x: 0, z: 0, y: 60, heading: 0, w: 24, h: 16, turns: -360, segs: [
      { s: 320, tag: 'start' },
      { turn: -40, r: 300, y: 32, tag: 'descent' },
      { s: 260, y: 20, h: 12, tag: 'canyon' },
      { turn: 35, r: 260, tag: 'canyon' },
      { turn: -45, r: 240, tag: 'canyon' },
      { s: 220, tag: 'canyon' },
      { s: 300, y: -40, tag: 'falls' },
      { turn: -150, r: 80, w: 18, h: 13, tag: 'hairpin' },
      { s: 180, w: 20, h: 14, y: -20, tag: 'basin' },
      { s: 380, y: 45, w: 18, h: 13, tunnel: true, tag: 'tunnel' },
      { s: 150, y: 72, w: 24, h: 16, tag: 'portal' },
      { turn: 60, r: 450, y: 120, w: 26, tag: 'ridge' },
      { s: 300, tag: 'ridge' },
      { turn: -70, r: 300, y: 80, w: 24, tag: 'ridgedown' },
      { s: 350, y: 70, tag: 'bridge' },
      { turn: -55, r: 110, w: 20, h: 14, tag: 'mine' },
      { turn: 55, r: 110, tag: 'mine' },
      { turn: -40, r: 220, w: 24, h: 16, tag: 'arch' },
      { s: 300, free: 'len', y: 60, tag: 'flats' },
      { turn: -90, r: 260, free: 'turn', tag: 'sweep' },
      { s: 200, tag: 'sweep' },
      { turn: -20, r: 300, tag: 'final' },
      { s: 150, free: 'len', tag: 'final' },
    ] },
    populate(t, rng) {
      checkpoints(t, this.checkpoints);
      pads(t, [along(t, 'start', 0.55), along(t, 'canyon', 0.3), along(t, 'basin', 0.5), along(t, 'ridge', 0.6), along(t, 'bridge', 0.4), along(t, 'flats', 0.5)]);
      cells(t, [along(t, 'canyon', 0.6), along(t, 'tunnel', 0.25), along(t, 'ridge', 0.25), along(t, 'mine', 0.2), along(t, 'final', 0.2)], rng);
      // basalt columns rising out of the lava river in the canyon, and two in the basin below the falls
      // (on the straights, outside the racing line)
      for (const [tag, k, f, sx] of [['canyon', 0, 0.5, 1], ['canyon', 3, 0.45, -1], ['basin', 0, 0.55, -1]]) { const i = alongSeg(t, tag, k, f); t.addObstacle({ type: 'vbeam', kind: 'basalt', i, x: sx * t.w[i] * 0.45, r: 3.8 }); }
      // the tunnel: two rock ribs across the bore
      for (const f of [0.35, 0.7]) { const i = along(t, 'tunnel', f); t.addObstacle({ type: 'hbeam', kind: 'rib', i, y: (f < 0.5 ? -1 : 1) * t.h[i] * 0.42, r: 2.6 }); }
      // the mine: a conveyor gantry over the chicane, above the racing line
      { const i = along(t, 'mine', 0.5); t.addObstacle({ type: 'hbeam', i, y: t.h[i] * 0.55, r: 2.8 }); }
    },
  },
];
