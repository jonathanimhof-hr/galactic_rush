// Course definitions (all original). Each course: filleted polygon + hazards placed by populate().
import { Track } from './track.js';
import { makeRng, Vec3 } from '../math.js';

const TOP = 18; // trench rim height for Foundry Trench
const tv = (x, z, floor, r, w) => ({ x, z, r, w, y: (TOP + floor) / 2, h: (TOP - floor) / 2 });

function nearestXZ(t, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < t.N; i++) { const p = t.pos[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
const frac = (t, f) => Math.floor(f * t.N) % t.N;

function addPads(t, fracs, opts = {}) {
  for (const f of fracs) {
    const i = frac(t, f);
    const x = opts.floor ? 0 : t.lineX[i], y = opts.floor ? -t.h[i] + 4 : t.lineY[i];
    t.pads.push({ i, x, y, r: opts.r || 8 });
  }
}
function addCells(t, fracs, rng) {
  fracs.forEach((f, k) => {
    const i0 = frac(t, f), side = k % 2 ? 1 : -1;
    for (let j = 0; j < 4; j++) {
      const i = t.wrapIdx(i0 + j * 5);
      t.cells.push({ i, x: side * t.w[i] * 0.45 + rng.range(-2, 2), y: rng.range(-0.3, 0.3) * t.h[i], ion: j === 3 && k % 3 === 1 });
    }
  });
}
const nearAny = (t, i, list, gap) => list.some(o => Math.abs(t.deltaS(i * t.D, o.i * t.D)) < gap);

// Scatter sphere obstacles while guaranteeing gaps between them.
function scatter(t, rng, { from, to, stepMin, stepMax, rMin, rMax, moving, kind }) {
  const placed = [];
  for (let i = from; i < to; i += Math.round(rng.range(stepMin, stepMax))) {
    if (nearAny(t, i, t.pads, 40) || nearAny(t, i, t.cells, 30)) continue;
    const r = rng.range(rMin, rMax), w = t.w[i], h = t.h[i];
    const mx = w - r - 9, my = h - r - 9;
    if (mx < 2 || my < 2) continue;
    const x = rng.range(-mx, mx), y = rng.range(-my, my);
    const p = t.pointAt(i, x, y);
    if (placed.some(o => o.base.dist(p) < o.r + r + 16)) continue;
    const o = { type: 'sphere', kind, i, x, y, r, spin: rng.range(-0.6, 0.6), seed: Math.floor(rng() * 1e6) };
    if (rng() < moving) o.move = { ax: Math.min(rng.range(8, 18), mx - Math.abs(x)), ay: Math.min(rng.range(5, 12), my - Math.abs(y)), w: rng.range(0.3, 0.8), ph: rng.range(0, 6.28) };
    t.addObstacle(o); placed.push(o);
  }
}

export const TRACK_DEFS = [
  {
    id: 'foundry', name: 'Foundry Trench', short: 'TRENCH', theme: 'trench', checkpoints: 9, startOffset: 700, seed: 11,
    tagline: 'A narrow slot canyon cut through a colossal orbital foundry. Hard corners, girders and laser gates.',
    verts: [tv(0, 0, 0, 120, 22), tv(0, 1150, 0, 90, 22), tv(-380, 1150, -10, 80, 22), tv(-380, 800, -60, 70, 24),
      tv(-700, 800, -60, 70, 24), tv(-700, 1250, -20, 90, 22), tv(-1050, 1250, -20, 110, 20), tv(-1050, 150, -140, 150, 22),
      tv(-600, -150, -80, 200, 20)],
    populate(t, rng) {
      addPads(t, [0.075, 0.37, 0.56, 0.82], { floor: true, r: 7 });
      addCells(t, [0.15, 0.3, 0.47, 0.64, 0.74, 0.9], rng);
      let k = 0;
      for (let i = 30; i < t.N - 200; i += 22) {
        if (t.h[i] < 34 || nearAny(t, i, t.pads, 30)) continue;
        t.addObstacle({ type: 'hbeam', i, y: (k++ % 2 ? 0.38 : -0.38) * t.h[i], r: 3.5 });
      }
      for (const f of [0.255, 0.285, 0.315]) {
        const i = frac(t, f), sx = f === 0.285 ? 0 : 1;
        if (sx) { t.addObstacle({ type: 'vbeam', i, x: -t.w[i] * 0.5, r: 3 }); t.addObstacle({ type: 'vbeam', i, x: t.w[i] * 0.5, r: 3 }); }
        else t.addObstacle({ type: 'vbeam', i, x: 0, r: 3.5 });
      }
      ['L', 'T', 'R', 'B'].forEach((side, n) => t.lasers.push({ i: t.N - 160 + n * 26, side, period: 2.8, on: 1.4, phase: n * 0.7 }));
    },
  },
  {
    id: 'belt', name: 'Cinder Belt', short: 'ASTEROIDS', theme: 'asteroids', checkpoints: 8, startOffset: 560, seed: 23,
    tagline: 'A winding run through a dense, drifting asteroid field. Pick your gap and keep it clean.',
    w: 46, h: 34,
    verts: [{ x: 0, z: 0, y: 0, r: 150 }, { x: 200, z: 1000, y: 60, r: 180 }, { x: -300, z: 1500, y: 160, r: 160 },
      { x: -900, z: 1300, y: 90, r: 140, h: 38 }, { x: -700, z: 800, y: -60, r: 130, w: 64 }, { x: -1200, z: 500, y: -140, r: 170, w: 64 },
      { x: -1000, z: -200, y: -60, r: 150 }, { x: -400, z: -300, y: 50, r: 160 }],
    populate(t, rng) {
      addPads(t, [0.1, 0.32, 0.5, 0.72, 0.9]);
      addCells(t, [0.18, 0.4, 0.62, 0.82], rng);
      const mid = nearestXZ(t, -950, 650);
      t.addObstacle({ type: 'sphere', kind: 'mega', i: mid, x: 0, y: 0, r: 27, spin: 0.08, seed: 7 });
      scatter(t, rng, { from: 70, to: t.N - 40, stepMin: 7, stepMax: 14, rMin: 4, rMax: 11, moving: 0.3, kind: 'rock' });
    },
  },
  {
    id: 'spire', name: 'Neon Spire', short: 'MEGACITY', theme: 'city', checkpoints: 8, startOffset: 300, seed: 37,
    tagline: 'Dive between kilometre-high towers, thread traffic lanes and blast through megastructure tunnels.',
    w: 30, h: 22, tunnels: [[0.03, 0.13], [0.395, 0.46]],
    verts: [{ x: 0, z: 0, y: 40, r: 130, bank: 18 }, { x: 0, z: 1200, y: 40, r: 110, bank: 24 }, { x: -500, z: 1300, y: -60, r: 120, bank: 15 },
      { x: -800, z: 900, y: -130, r: 100, bank: 20 }, { x: -500, z: 500, y: -130, r: 90, bank: 18 }, { x: -900, z: 150, y: 20, r: 130, bank: 24 },
      { x: -700, z: -450, y: 140, r: 140, bank: 20 }, { x: -200, z: -350, y: 90, r: 120, bank: 15 }],
    populate(t, rng) {
      addPads(t, [0.17, 0.36, 0.64, 0.86]);
      addCells(t, [0.22, 0.5, 0.7, 0.93], rng);
      for (const f of [0.2, 0.27, 0.33, 0.53, 0.6, 0.69, 0.77, 0.9]) {
        const i = frac(t, f), span = 2 * (t.w[i] + 70);
        t.traffic.push({ i, y: rng.range(-0.6, 0.6) * t.h[i], dir: rng() < 0.5 ? 1 : -1, speed: rng.range(30, 55), spacing: span / 3, phase: rng.range(0, span), n: 3, r: 4.2, seed: Math.floor(rng() * 1e6) });
      }
      const a = frac(t, 0.415), b = frac(t, 0.44);
      t.addObstacle({ type: 'vbeam', i: a, x: -t.w[a] * 0.35, r: 3.5 });
      t.addObstacle({ type: 'vbeam', i: b, x: t.w[b] * 0.35, r: 3.5 });
    },
  },
  {
    id: 'ring', name: 'Halo of Vashti', short: 'GAS GIANT', theme: 'gasgiant', checkpoints: 9, startOffset: 800, seed: 53,
    tagline: 'Flat-out sweepers through the ring plane of a gas giant, past drifting wreckage and fleets at anchor.',
    w: 54, h: 40,
    verts: [{ x: 0, z: 0, y: 0, r: 300 }, { x: 300, z: 1500, y: 80, r: 260 }, { x: -600, z: 2100, y: 220, r: 280 },
      { x: -1700, z: 1700, y: 120, r: 240 }, { x: -1500, z: 900, y: -80, r: 200 }, { x: -2000, z: 200, y: -200, r: 260 },
      { x: -1100, z: -500, y: -60, r: 300 }],
    populate(t, rng) {
      addPads(t, [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9]);
      addCells(t, [0.15, 0.43, 0.57, 0.85], rng);
      scatter(t, rng, { from: 80, to: t.N - 50, stepMin: 10, stepMax: 22, rMin: 5, rMax: 13, moving: 0.5, kind: 'debris' });
    },
  },
];

const cache = new Map();
export function getTrack(id) {
  if (!cache.has(id)) {
    const def = TRACK_DEFS.find(d => d.id === id);
    if (!def) throw new Error('unknown track ' + id);
    const t = new Track(def);
    def.populate(t, makeRng(def.seed));
    t.updateObstacles(0);
    cache.set(id, t);
  }
  return cache.get(id);
}
export { Vec3 };
