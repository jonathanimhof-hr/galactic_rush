// GALACTIC RUSH V9 — Ignara, the volcanic world: a lava river in a basalt canyon, lava falls pouring off the rims, a
// rock tunnel lit by glowing fissures, a ridge with the volcanoes on the horizon (one of them erupting), a mining
// complex on stilts above a lava lake, a natural arch, smoke, ash and embers under a sky lit orange from below.
// V11 visual pass (same layout, same places, same course): the lava runs in crusted stretches, broken plates and open
// runs with a hot channel down its middle, the falls all melt; the rock is stacked lava flows cut into cooling columns
// on the cliffs, with oxidised red fields, sulphur round hot vents and glassy obsidian; fields of basalt boulders and
// outcrops (instanced, three levels of detail) cover the slopes; the erupting volcano has its own detailed cone with
// gullies its lava runs down; the works are built in sooty, rusted, heat-darkened steel with furnace glow, chimneys,
// stairs, pipes, conveyors and warning lights; a lower layer of ash under the deck, ash haze lit from below.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QX, QY, QZ, DET } from '../geo.js';
import { Chunks, ribbon, fq, P, hexField, gates, pickups, routeGuides, movers, v3 } from './common.js';
import { buildHauler, buildPatrol } from '../props.js';
import { rockGeo } from './belt.js';
import { Frustum, InstanceSet } from '../lod.js';
import { ensurePrograms, Clearance, beam, domeGeo, qLook, fbm2, ridged2, vnoise2 } from './v9kit.js';
import { ensureV11Programs, bar, pipe, railing, stair, ladder, lattice, beamCone, trussLOD, DetailLOD, cellItems, release } from './v11kit.js';

const LAMP = [1, 0.75, 0.45, 1], RED = [1, 0.12, 0.08, 1];
const STEEL = [[0.3, 0.29, 0.28, 0], [0.24, 0.23, 0.22, 0], [0.36, 0.3, 0.24, 0], [0.2, 0.2, 0.21, 0]];
const RUST = [[0.42, 0.22, 0.12, 0], [0.55, 0.42, 0.18, 0], [0.32, 0.18, 0.12, 0]];

export function buildIgnara(gfx, t) {
  ensurePrograms(gfx); ensureV11Programs(gfx);
  const rng = makeRng(t.def.seed * 29 + 3), items = [], N = t.N, clear = new Clearance(t);
  const at = tag => t.tags.get(tag) || [], mid = tag => { const a = at(tag); return a[a.length >> 1]; };
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of t.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const ch = new Chunks(t, 96), big = new Geo(), bigLit = new Geo().mat(0, 0.4, 4, 0), lights = [], vents = [], smokes = [];
  const stCh = new Chunks(t, 96), beams = new Geo(), IU = { uWx: [-1e5, 0.9, 0.85, 0], uSea: 0, uHeatC: [1.15, 0.3, 0.05] }; // V11: the works in weathered steel (soot, rust, heat), in chunks; lamp beams in the smoke
  const nearI = p => { let b = 0, bd = 1e18; for (let i = 0; i < N; i += 3) { const q = t.pos[i], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const STEEP = new Set(['descent', 'canyon', 'falls', 'hairpin', 'basin', 'tunnel', 'portal', 'mine']);
  const tagOf = i => t.def.path.segs[t.segIdx[i]].tag || ''; void tagOf;

  // ---------------------------------------------------------------- lava: rivers along polylines and lakes
  const rivers = [], lakes = [];
  { // the canyon river follows the course from the canyon down the falls into the basin lake; its surface never climbs downstream
    const ids = [...at('canyon'), ...at('falls'), ...at('hairpin')], pts = []; let lvl = Infinity;
    for (let k = 0; k < ids.length; k += 2) { const i = ids[k], p = t.pos[i]; lvl = Math.min(lvl, p.y - t.h[i] - 9); pts.push({ x: p.x, z: p.z, y: lvl, w: t.w[i] * 1.25 }); }
    rivers.push({ pts, speed: 1.6, heat: 0.95 });
    const b = t.pos[mid('basin')]; lakes.push({ x: b.x, z: b.z, r: 210, y: lvl - 1.5 });
  }
  { const i = mid('bridge'), p = t.pos[i]; lakes.push({ x: p.x, z: p.z, r: 330, y: p.y - t.h[i] - 30 }); }
  { // a river crossing under the start bridge, from the hills to the mine lake
    const i = mid('start'), p = t.pos[i], B = t.bin[i], b = new Vec3(B.x, 0, B.z).normalize(), y0 = p.y - t.h[i] - 32, pts = [];
    for (let k = -14; k <= 14; k++) { const d = k * 80, wob = Math.sin(k * 0.7) * 40; pts.push({ x: p.x + b.x * d + t.tan[i].x * wob, z: p.z + b.z * d + t.tan[i].z * wob, y: y0 - k * 1.2, w: 34 }); }
    rivers.push({ pts, speed: 0.9, heat: 0.85 });
  }
  // nearest lava (distance in plan, surface height) for terrain carving and heat
  const lavaAt = (x, z) => { let best = 1e9, y = 0, w = 0;
    for (const R of rivers) for (let k = 0; k < R.pts.length - 1; k++) { const a = R.pts[k], b = R.pts[k + 1], ux = b.x - a.x, uz = b.z - a.z, L2 = ux * ux + uz * uz || 1, s = Math.max(0, Math.min(1, ((x - a.x) * ux + (z - a.z) * uz) / L2));
      const d = Math.hypot(x - a.x - ux * s, z - a.z - uz * s); if (d - (a.w + (b.w - a.w) * s) < best) { best = d - (a.w + (b.w - a.w) * s); y = a.y + (b.y - a.y) * s; w = a.w; } }
    for (const L of lakes) { const d = Math.hypot(x - L.x, z - L.z) - L.r; if (d < best) { best = d; y = L.y; w = L.r; } }
    return { d: best, y, w }; };

  // ---------------------------------------------------------------- terrain: the near field around the course and the far field
  // natural relief: ridged mountains with plateaus; near the course the ground is held below the corridor (with margin
  // for its bank), rising steeply into canyon walls on the technical sections and gently on the open ones
  const natural = (x, z) => 55 + 120 * ridged2(x / 950 + 3.1, z / 950 - 1.7, 11, 5) + 45 * fbm2(x / 260, z / 260, 5, 4) - 40;
  const SP = 14, X0 = Math.floor((minX - 1100) / SP) * SP, X1 = Math.ceil((maxX + 1100) / SP) * SP, Z0 = Math.floor((minZ - 1100) / SP) * SP, Z1 = Math.ceil((maxZ + 1100) / SP) * SP;
  const NX = (X1 - X0) / SP + 1, NZ = (Z1 - Z0) / SP + 1, H = new Float32Array(NX * NZ), HEAT = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = natural(X0 + i * SP, Z0 + j * SP);
  // the corridor holds the ground down: each course sample lowers the cells in its own slab (14 m either side along the
  // course) to below the corridor's lowest corner, then lets it rise with distance (steep or gentle by section)
  for (let i = 0; i < N; i++) {
    const p = t.pos[i], T = t.tan[i], th = Math.hypot(T.x, T.z) || 1, tx = T.x / th, tz = T.z / th, w = t.w[i], tg = t.def.path.segs[t.segIdx[i]].tag || '', k = STEEP.has(tg) ? 2.6 : 0.45;
    const low = p.y - t.h[i] * Math.cos(t.bank[i]) - w * Math.abs(Math.sin(t.bank[i])) - 7, reach = w + 14 + Math.min(420, (260 - low) / k);
    const i0 = Math.max(0, Math.floor((p.x - reach - X0) / SP)), i1 = Math.min(NX - 1, Math.ceil((p.x + reach - X0) / SP)), j0 = Math.max(0, Math.floor((p.z - reach - Z0) / SP)), j1 = Math.min(NZ - 1, Math.ceil((p.z + reach - Z0) / SP));
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const dx = X0 + ii * SP - p.x, dz = Z0 + jj * SP - p.z, al = dx * tx + dz * tz; if (al > 14 || al < -14) continue;
      const dl = Math.abs(dx * tz - dz * tx); if (dl > reach) continue; const lim = dl < w + 14 ? low : low + (dl - w - 14) * k, m = jj * NX + ii; if (lim < H[m]) H[m] = lim; } }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = X0 + i * SP, z = Z0 + j * SP, m = j * NX + i, lv = lavaAt(x, z);
    H[m] = lv.d < 18 ? Math.min(H[m], lv.y - 2 + Math.max(0, lv.d) * 0.6) : Math.min(H[m], lv.y - 2 + lv.d * 1.8 + 6);
    // heat: next to the lava and not far above it, plus a few hot fields
    HEAT[m] = Math.max(0, 1 - Math.max(0, lv.d) / 45) * Math.max(0, 1 - Math.max(0, H[m] - lv.y) / 32) * (0.75 + 0.25 * vnoise2(x * 0.02, z * 0.02, 3)) + 0.25 * Math.max(0, vnoise2(x * 0.004, z * 0.004, 9) - 0.72) * 4; }
  const hAt = (x, z) => { const fi = (x - X0) / SP, fj = (z - Z0) / SP; if (fi < 0 || fj < 0 || fi >= NX - 1 || fj >= NZ - 1) return natural(x, z); const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, A = H[j * NX + i], B = H[j * NX + i + 1], C = H[(j + 1) * NX + i], D = H[(j + 1) * NX + i + 1]; return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v; };
  const BASALT = [[0.17, 0.15, 0.135], [0.13, 0.12, 0.11], [0.2, 0.16, 0.13], [0.15, 0.13, 0.12]];
  const CS = 40; // chunk size in cells
  for (let cj = 0; cj < NZ - 1; cj += CS) for (let ci = 0; ci < NX - 1; ci += CS) {
    const pos = [], nor = [], col = [], mat = [], idx = [], ni = Math.min(CS, NX - 1 - ci) + 1, nj = Math.min(CS, NZ - 1 - cj) + 1;
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const gi = ci + i, gj = cj + j, k = gj * NX + gi, x = X0 + gi * SP, z = Z0 + gj * SP, y = H[k];
      const hx = H[gj * NX + Math.min(NX - 1, gi + 1)] - H[gj * NX + Math.max(0, gi - 1)], hz = H[Math.min(NZ - 1, gj + 1) * NX + gi] - H[Math.max(0, gj - 1) * NX + gi], nl = Math.hypot(hx, 2 * SP, hz);
      const c = BASALT[(Math.floor(vnoise2(x * 0.01, z * 0.01, 2) * 4)) & 3], v = 0.8 + 0.4 * vnoise2(x * 0.05, z * 0.05, 4);
      pos.push(x, y, z); nor.push(-hx / nl, 2 * SP / nl, -hz / nl); col.push(c[0] * v, c[1] * v, c[2] * v, Math.min(1, HEAT[k])); mat.push(0, 0.9, 1, 0);
      lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)]; }
    for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) { const a = j * ni + i, b = a + 1, c = a + ni, d = c + 1; idx.push(a, c, d, a, d, b); }
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    items.push({ mesh: gfx.mesh({ pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), mat: new Float32Array(mat), idx: new Uint32Array(idx) }), prog: 'v9rock', visible: true, cast: true, bs: { x: c[0], y: c[1], z: c[2], r } });
  }
  // far field: 26 km of mountains and three volcanoes, coarse, dropped below the near field where they overlap; the
  // erupting one stands straight ahead of the ridge and the ridge descent, the open high section of the course
  const volc = [{ x: cx + 1500, z: cz - 7400, h: 2300, r: 4200, erupt: true }, { x: cx - 6200, z: cz + 2600, h: 1500, r: 3200 }, { x: cx + 5600, z: cz + 4200, h: 1800, r: 3600 }];
  const farH = (x, z) => { let h = natural(x, z) * 1.6;
    for (const V of volc) { const d = Math.hypot(x - V.x, z - V.z); if (d < V.r) { const u = 1 - d / V.r, cone = V.h * Math.pow(u, 1.6) * (0.9 + 0.2 * fbm2(x / 300, z / 300, 7, 3)), crater = d < 260 ? (260 - d) * 0.55 : 0; h = Math.max(h, cone - crater); } }
    const inNear = x > X0 + SP && x < X1 - SP && z > Z0 + SP && z < Z1 - SP; return inNear ? Math.min(h, hAt(x, z)) - 25 : h; };
  { const FS = 160, R = 13000, n = Math.floor(2 * R / FS) + 1, x0 = cx - R, z0 = cz - R, pos = [], nor = [], col = [], mat = [], idx = [], Hf = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) Hf[j * n + i] = farH(x0 + i * FS, z0 + j * FS);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = x0 + i * FS, z = z0 + j * FS, y = Hf[j * n + i], hx = Hf[j * n + Math.min(n - 1, i + 1)] - Hf[j * n + Math.max(0, i - 1)], hz = Hf[Math.min(n - 1, j + 1) * n + i] - Hf[Math.max(0, j - 1) * n + i], nl = Math.hypot(hx, 2 * FS, hz);
      let heat = 0; for (const V of volc) if (V.erupt) { const d = Math.hypot(x - V.x, z - V.z); heat = Math.max(heat, d < 300 ? 1 : 0); }
      const c = BASALT[(i + j) & 3]; pos.push(x, y, z); nor.push(-hx / nl, 2 * FS / nl, -hz / nl); col.push(c[0], c[1], c[2], heat); mat.push(0, 0.9, 1, 0); }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; const xm = x0 + (i + 0.5) * FS, zm = z0 + (j + 0.5) * FS;
      if (xm > X0 + FS && xm < X1 - FS && zm > Z0 + FS && zm < Z1 - FS) continue; if (Math.hypot(xm - volc[0].x, zm - volc[0].z) < volc[0].r * 0.97) continue; idx.push(a, c, d, a, d, b); }
    items.push({ mesh: gfx.mesh({ pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), mat: new Float32Array(mat), idx: new Uint32Array(idx) }), prog: 'v9rock', visible: true });
  }
  // V11: the erupting volcano gets its own, finer cone (rings tighter toward the summit), its flanks cut by gullies
  // (sharp ridges between broad valleys, deepest mid-slope); its lava follows the gullies down
  const V0 = volc[0], gully = (x, z) => { const dx = x - V0.x, dz = z - V0.z, d = Math.hypot(dx, dz); if (d >= V0.r || d < 1) return 0; const u = 1 - d / V0.r, a = Math.atan2(dz, dx);
    return (ridged2(a * 4.8 + 9, d * 0.0013, 41, 4) - 0.55) * 150 * u * (1 - u) * 4 * Math.min(1, (d - 240) / 400 > 0 ? (d - 240) / 400 : 0); };
  const farH2 = (x, z) => farH(x, z) + gully(x, z);
  { const RG = 72, SG = 200, pos = [], nor = [], col = [], mat = [], idx = [], e = 25;
    for (let j = 0; j <= RG; j++) { const rr = V0.r * Math.pow(j / RG, 1.25); for (let k = 0; k <= SG; k++) { const a = k / SG * Math.PI * 2, x = V0.x + Math.cos(a) * rr, z = V0.z + Math.sin(a) * rr, y = farH2(x, z);
      const hx = farH2(x + e, z) - farH2(x - e, z), hz = farH2(x, z + e) - farH2(x, z - e), nl = Math.hypot(hx, 2 * e, hz), c = BASALT[(Math.floor(vnoise2(x * 0.004, z * 0.004, 8) * 4)) & 3], sh = 0.85 + 0.3 * vnoise2(x * 0.02, z * 0.02, 2);
      pos.push(x, y, z); nor.push(-hx / nl, 2 * e / nl, -hz / nl); col.push(c[0] * sh, c[1] * sh, c[2] * sh, rr < 300 ? 1 : rr < 600 ? (600 - rr) / 300 : 0); mat.push(0, 0.9, 1, 0); } }
    for (let j = 0; j < RG; j++) for (let k = 0; k < SG; k++) { const a = j * (SG + 1) + k, b = a + SG + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
    items.push({ mesh: gfx.mesh({ pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), mat: new Float32Array(mat), idx: new Uint32Array(idx) }), prog: 'v9rock', visible: true, bs: { x: V0.x, y: V0.h * 0.5, z: V0.z, r: V0.r * 1.05 } }); }

  // ---------------------------------------------------------------- lava meshes: (u along /100, v across, speed, heat) in the colour channels
  const lava = new Geo().mat(0, 0.6, 1, 0);
  for (const R of rivers) { let u = 0; const rows = []; lava.mat(0, 0.6, 1, 2.3 * R.pts[R.pts.length >> 1].w); // material w: the flow's width (metres)
    for (let k = 0; k < R.pts.length; k++) { const a = R.pts[Math.max(0, k - 1)], b = R.pts[Math.min(R.pts.length - 1, k + 1)], p = R.pts[k], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      if (k) u += Math.hypot(p.x - R.pts[k - 1].x, p.z - R.pts[k - 1].z, p.y - R.pts[k - 1].y);
      const row = []; for (let m = 0; m <= 6; m++) { const v = m / 6, o = (v - 0.5) * 2 * p.w * 1.15; row.push(lava.v(p.x + nx * o, p.y + (Math.abs(v - 0.5) > 0.45 ? 0.6 : 0), p.z + nz * o, 0, 1, 0, [u / 100, v, R.speed * (1 + Math.max(0, (R.pts[Math.max(0, k - 1)].y - p.y)) * 0.08), R.heat])); }
      rows.push(row); }
    for (let k = 0; k < rows.length - 1; k++) for (let m = 0; m < 6; m++) lava.quad(rows[k][m], rows[k + 1][m], rows[k + 1][m + 1], rows[k][m + 1]); }
  for (const L of lakes) { const rows = []; lava.mat(1, 0.6, 1, 2 * L.r); /* material x = 1: the pattern in world x, z */ for (let j = 0; j <= 10; j++) { const rr = L.r * 1.08 * j / 10, row = []; for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2, x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
      row.push(lava.v(x, L.y, z, 0, 1, 0, [(x - L.x) / 100, 0.5 + 0.5 * (j / 10), 0.25, 0.7])); } rows.push(row); }
    for (let j = 0; j < 10; j++) for (let k = 0; k < 48; k++) lava.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]); }
  // lava falls pouring off the canyon rims into the river, and down the erupting volcano
  const falls = [];
  for (const [tag, f, s] of [['canyon', 0.25, 1], ['canyon', 0.62, -1], ['falls', 0.3, 1], ['falls', 0.7, -1], ['canyon', 0.88, -1]]) {
    const ids = at(tag), i = ids[Math.floor(ids.length * f)], p = t.pos[i], B = t.bin[i], b = new Vec3(B.x, 0, B.z).normalize(); let top = null;
    for (let d = t.w[i] + 30; d < t.w[i] + 140; d += 6) { const x = p.x + b.x * s * d, z = p.z + b.z * s * d, h = hAt(x, z); if (h > p.y + t.h[i] + 10) { top = v3(x, h, z); break; } }
    if (!top) continue; lava.mat(0, 0.6, 1, 12); const lv = lavaAt(top.x, top.z), bot = v3(p.x + b.x * s * (t.w[i] * 1.1), lv.y, p.z + b.z * s * (t.w[i] * 1.1)), n = 10, W = 9 + rng() * 6, tg = new Vec3(t.tan[i].x, 0, t.tan[i].z).normalize(), rows = [];
    for (let k = 0; k <= n; k++) { const u = k / n, e = u * u, pk = v3(top.x + (bot.x - top.x) * (0.15 * u + 0.85 * e), top.y + (bot.y - top.y) * u, top.z + (bot.z - top.z) * (0.15 * u + 0.85 * e)), row = [];
      for (let m = 0; m <= 6; m++) { const v = m / 6, o = (v - 0.5) * W * (1.15 + u * 0.7), bul = Math.sin(Math.PI * v) * W * 0.22 * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.2))); // V11: wider, a curtain that bulges out as it falls
        row.push(lava.v(pk.x + tg.x * o - b.x * s * bul, pk.y, pk.z + tg.z * o - b.z * s * bul, b.x * -s, 0.2, b.z * -s, [u * 2.4, v, 3.2, 1])); } rows.push(row); }
    for (let k = 0; k < n; k++) for (let m = 0; m < 6; m++) lava.quad(rows[k][m], rows[k + 1][m], rows[k + 1][m + 1], rows[k][m + 1]);
    falls.push({ bot, top, W });
  }
  { const V = volc[0]; lava.mat(0, 0.6, 1, 120); for (let f = 0; f < 5; f++) { const a = f * 1.3 + 0.4, pts = []; let x = V.x + Math.cos(a) * 270, z = V.z + Math.sin(a) * 270;
      for (let k = 0; k < 40; k++) { const h = farH2(x, z) + 3; pts.push({ x, z, y: h, w: 40 + k * 2 }); const e = 30, gx = farH2(x + e, z) - farH2(x - e, z), gz = farH2(x, z + e) - farH2(x, z - e), gl = Math.hypot(gx, gz) || 1; x -= gx / gl * 90 + Math.cos(a) * 20; z -= gz / gl * 90 + Math.sin(a) * 20; }
      let u = 0; const rows = pts.map((p, k) => { if (k) u += Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y, p.z - pts[k - 1].z); const b = pts[Math.min(pts.length - 1, k + 1)], a2 = pts[Math.max(0, k - 1)], dx = b.x - a2.x, dz = b.z - a2.z, L = Math.hypot(dx, dz) || 1;
        return [-1, 0, 1].map(s => lava.v(p.x - dz / L * s * p.w, p.y, p.z + dx / L * s * p.w, 0, 1, 0, [u / 100, (s + 1) / 2, 1.2, 1 - k / 50])); });
      for (let k = 0; k < rows.length - 1; k++) for (let m = 0; m < 2; m++) lava.quad(rows[k][m], rows[k + 1][m], rows[k + 1][m + 1], rows[k][m + 1]); }
    // crater lake
    lava.mat(1, 0.6, 1, 420); const rows = []; for (let j = 0; j <= 4; j++) { const rr = 210 * j / 4, row = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * 6.283; row.push(lava.v(V.x + Math.cos(a) * rr, V.h - 120, V.z + Math.sin(a) * rr, 0, 1, 0, [Math.cos(a) * rr / 100, 0.5 + j / 8, 0.4, 1])); } rows.push(row); }
    for (let j = 0; j < 4; j++) for (let k = 0; k < 32; k++) lava.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]); }
  items.push({ mesh: gfx.mesh(lava.build()), prog: 'v9lava', visible: true, uniforms: { uGlowK: 0.85, uCrustK: 0.78 } });

  // ---------------------------------------------------------------- the rock tunnel: a bore exactly on the corridor walls, a
  // thick rock lid over it, fissures glowing in the walls; tunnel ribs are the two rock ribs that cross the bore
  { const tun = i => !!t.tunnel[i], RK = [0.12, 0.1, 0.09, 0.62];
    for (let c = 0; c < N; c += 48) { const i1 = Math.min(N, c + 48), g = ch.get(c, 'tun').mat(0, 0.9, 1, 0);
      ribbon(g, t, i => [-t.w[i], -t.h[i]], i => [t.w[i], -t.h[i]], RK, c, i1, 2, tun); ribbon(g, t, i => [t.w[i], t.h[i]], i => [-t.w[i], t.h[i]], RK, c, i1, 2, tun);
      ribbon(g, t, i => [-t.w[i], t.h[i]], i => [-t.w[i], -t.h[i]], RK, c, i1, 2, tun); ribbon(g, t, i => [t.w[i], -t.h[i]], i => [t.w[i], t.h[i]], RK, c, i1, 2, tun);
      ribbon(g, t, i => [-t.w[i] - 60, t.h[i] + 26 + 6 * Math.sin(i * 0.3)], i => [t.w[i] + 60, t.h[i] + 26 + 6 * Math.cos(i * 0.21)], [0.12, 0.105, 0.1, 0.1], c, i1, 2, tun);
      for (const s of [-1, 1]) ribbon(g, t, i => [s * (t.w[i] + 60), t.h[i] + 26], i => [s * (t.w[i] + 60), -t.h[i] - 10], [0.11, 0.1, 0.09, 0.05], c, i1, 2, tun);
      ribbon(g, t, i => [-t.w[i] - 1, t.h[i] + 1], i => [t.w[i] + 1, t.h[i] + 1], [0.1, 0.09, 0.08, 0.2], c, i1, 2, tun); }
    // lighting: amber work lamps on both walls, a seam of glowing rock low on each wall, light rings at the mouths
    for (let i = 0; i < N; i++) { if (!t.tunnel[i]) continue; const q = fq(t, i), w = t.w[i], h = t.h[i], gl = ch.get(i, 'tunLit').mat(0, 0.4, 5, 0);
      if (i % 5 === 0) for (const s of [-1, 1]) { const lp = P(t, i, s * (w + 0.1), h * 0.55); gl.at(lp.x, lp.y, lp.z, q).box(0.3, 0.7, 2.2, [1, 0.62, 0.25, 1]); }
      const i2 = t.wrapIdx(i + 1); for (const s of [-1, 1]) { const a = P(t, i, s * (w + 0.05), -h * 0.62 + Math.sin(i * 0.4) * 1.2), b = P(t, i2, s * (w + 0.05), -h * 0.62 + Math.sin(i2 * 0.4) * 1.2), m = new Vec3().lerpVectors(a, b, 0.5); gl.mat(0, 0.4, 3, 0).at(m.x, m.y, m.z, q).box(0.2, 0.45, a.dist(b) + 0.1, [1, 0.32, 0.06, 1]); }
      if (!t.tunnel[t.wrapIdx(i - 1)] || !t.tunnel[t.wrapIdx(i + 1)] || i % 24 === 0) for (const [x, y, sx, sy] of [[0, h + 0.3, 2 * w, 0.5], [0, -h - 0.3, 2 * w, 0.5], [w + 0.3, 0, 0.5, 2 * h], [-w - 0.3, 0, 0.5, 2 * h]]) { const p = P(t, i, x, y); gl.mat(0, 0.4, 4, 0).at(p.x, p.y, p.z, q).box(sx, sy, 0.8, [1, 0.5, 0.12, 1]); } }
    items.push(...ch.items(gfx, 'tunLit', { prog: 'pbrStruct' }));
    // portal frames: heavy basalt lintels at both mouths
    const ids = at('tunnel'); for (const i of [ids[0], ids[ids.length - 1]]) { const q = fq(t, i), w = t.w[i], h = t.h[i];
      for (const [x, y, sx, sy] of [[0, h + 9.5, 2 * w + 40, 16], [w + 14, -2, 24, 2 * h + 24], [-w - 14, -2, 24, 2 * h + 24]]) { const p = P(t, i, x, y); ch.get(i, 'tunR').mat(0, 0.9, 1, 14).at(p.x, p.y, p.z, q).polyRock(1, i * 0.37 + x, [0.13, 0.11, 0.1, 0], { planes: 16, lo: 0.85, hi: 1.05, stretch: [sx / 2, sy / 2, 14], seg: 0.3, rings: 2 }); } }
    items.push(...ch.items(gfx, 'tun', { prog: 'v9rock', cast: true }), ...ch.items(gfx, 'tunR', { prog: 'pbrRock', cast: true }));
  }

  // ---------------------------------------------------------------- rock formations: obstacles (basalt pillars, rock ribs), the
  // hairpin spire, basalt column clusters along the canyon, the natural arch
  const rocks = new Geo(), ribLit = new Geo().mat(0, 0.4, 4, 0), hz = [];
  for (const o of t.obstacles) {
    if (o.kind === 'basalt') { const base = P(t, o.i, o.x, 0), lv = lavaAt(base.x, base.z), y0 = Math.min(lv.y, base.y - t.h[o.i]) - 4, y1 = base.y + t.h[o.i] + 18 + rng() * 20;
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4, d = k ? o.r * 1.05 : 0, hh = (y1 - y0) * (k ? 0.55 + rng() * 0.35 : 1), rr = k ? o.r * 0.55 : o.r * 0.97; if (k && !clear.sphere(v3(base.x + Math.cos(a) * d, base.y, base.z + Math.sin(a) * d), rr, 2)) continue;
        rocks.mat(0.1, 0.85, 1, 14).at(base.x + Math.cos(a) * d, y0 + hh / 2, base.z + Math.sin(a) * d, QX(90)).cyl(rr * 1.04, rr * 1.04, hh, 6, [0.12, 0.105, 0.1, 0], true); } // hexagonal: 0.9..1.04 of the collision radius
      hz.push({ o, p: base }); }
    else if (o.kind === 'rib') { const q = fq(t, o.i), c = P(t, o.i, 0, o.y); rocks.mat(0, 0.9, 1, 14).at(c.x, c.y, c.z, q).polyRock(1, o.i * 0.71, [0.13, 0.11, 0.1, 0], { planes: 18, lo: 0.95, hi: 1.02, stretch: [t.w[o.i] + 4, o.r, o.r], seg: 0.25, rings: 2 }); hz.push({ o, p: c });
      // the rib is a hazard in a dark bore: a glowing seam along both faces and a red lamp where it meets each wall
      for (const s of [-1, 1]) { const p = new Vec3(0, 0, s * o.r * 1.01).applyQuat(q).add(c); ribLit.at(p.x, p.y, p.z, q).box(2 * t.w[o.i] - 1.5, 0.32, 0.3, [1, 0.42, 0.08, 1]); }
      for (const s of [-1, 1]) { const lp = P(t, o.i, s * (t.w[o.i] - 0.6), o.y + o.r * 1.05); ribLit.at(lp.x, lp.y, lp.z, q).box(0.6, 0.6, 0.6, [1, 0.2, 0.08, 1]); } }
  }
  { // the spire at the heart of the hairpin
    const ids = at('hairpin'), m = ids[ids.length >> 1], s = Math.sign(t.kLat[m]) || -1, B = t.bin[m], p = t.pos[m], R = Math.abs(1 / t.kLat[m]), cx2 = p.x + B.x * s * R, cz2 = p.z + B.z * s * R, r = Math.max(12, R - t.w[m] - 22), base = hAt(cx2, cz2) - 10;
    if (clear.sphere(v3(cx2, base + 60, cz2), r * 1.1, 4)) for (let k = 0; k < 4; k++) { const hh = 220 - k * 45, rr = r * (1 - k * 0.2); rocks.mat(0, 0.9, 1, 14).at(cx2 + (k % 2) * 4, base + hh / 2 + k * 30, cz2, QX(-90)).polyRock(1, 77 + k, [0.13, 0.11, 0.1, 0], { planes: 20, lo: 0.8, hi: 1.05, stretch: [rr, rr, hh / 2], seg: 0.35, rings: 2, strata: { axis: [0, 0, 1], k: 3, depth: 0.05 } }); }
  }
  // basalt column clusters on the canyon rims and in the basin: columns packed on a hexagonal grid, tallest at the
  // cluster's heart, stepping down to its edge
  { const ids = [...at('canyon'), ...at('falls'), ...at('basin'), ...at('descent')];
    for (let n = 0; n < 34; n++) { const i = ids[Math.floor(rng() * ids.length)], s = rng() < 0.5 ? -1 : 1, d = t.w[i] + 45 + rng() * 150, B = t.bin[i], p = t.pos[i];
      const x0 = p.x + B.x * s * d, z0 = p.z + B.z * s * d, rr = 2.2 + rng() * 1.6, top = 14 + rng() * 34, ring = 1 + Math.floor(rng() * 3), a0 = rng() * 6.283;
      for (let qa = -ring; qa <= ring; qa++) for (let qb = Math.max(-ring, -qa - ring); qb <= Math.min(ring, -qa + ring); qb++) { if (rng() < 0.18) continue;
        const hx = (qa + qb * 0.5) * rr * 1.78, hz = qb * rr * 1.54, x = x0 + hx * Math.cos(a0) - hz * Math.sin(a0), z = z0 + hx * Math.sin(a0) + hz * Math.cos(a0), y = hAt(x, z);
        const k = Math.max(Math.abs(qa), Math.abs(qb), Math.abs(qa + qb)) / (ring + 1), hh = top * (1 - 0.7 * k) * (0.8 + rng() * 0.3);
        if (!clear.sphere(v3(x, y + hh / 2, z), Math.max(rr, hh / 2), 4)) continue;
        rocks.mat(0.1, 0.85, 1, 14).at(x, y + hh / 2 - 3, z, QX(90).multiply(QZ(a0 * 57.3))).cyl(rr, rr, hh + 6, 6, [0.11 + rng() * 0.03, 0.1, 0.095, 0], true); } } }
  { // the natural arch over the course
    const i = mid('arch'), q = fq(t, i), w = t.w[i], h = t.h[i], R = w + 34, top = h + 38, c = P(t, i, 0, -h - 10);
    for (let j = 0; j <= 14; j++) { const a = Math.PI * j / 14, x = Math.cos(a) * R, y = Math.sin(a) * (top + h + 10), pc = new Vec3(x, y, 0), p = P(t, i, pc.x, pc.y - h - 10), rr = 13 + 5 * Math.sin(a);
      if (!clear.sphere(p, rr * 0.9, 2)) continue; rocks.mat(0, 0.9, 1, 14).at(p.x, p.y, p.z, q.clone().multiply(QZ(a * 57.3))).polyRock(rr, 90 + j * 3.3, [0.14, 0.115, 0.1, 0], { planes: 14, lo: 0.8, hi: 1.15, stretch: [1.3, 1, 1.4], seg: 0.3, rings: 2, strata: { axis: [0, 1, 0], k: 2.4, depth: 0.05 } }); }
    void c; }
  items.push({ mesh: gfx.mesh(rocks.build()), prog: 'pbrRock', visible: true, cast: true }, { mesh: gfx.mesh(ribLit.build()), prog: 'pbrStruct', visible: true });

  // ---------------------------------------------------------------- industry: the start bridge, the mine bridge across the lava
  // lake, smelters, cooling towers, drill rigs, conveyors and pipelines. V11: weathered steel (soot gathers toward the
  // top of stacks and furnaces, steel near the lava glows dull red), and the fittings of working plant
  const YEL = [0.78, 0.6, 0.12, 0], HOT = 1.75; // material z above 1: heat (the lowest steel over the lava)
  // (the chords of a truss go into g, its lacing into gm: a detail layer drawn while a pixel can still show it)
  const trussH = (g, gm, foot, top, size, bay, col) => { const lv = lavaAt(foot.x, foot.z), hot = lv.d < 25 && foot.y - lv.y < 20;
    if (!hot) { trussLOD(g, gm, [0.6, 0.55, 1, 0], foot, top, size, bay, col); return; } const m = new Vec3().lerpVectors(foot, top, Math.min(0.5, 24 / Math.max(1, foot.dist(top))));
    trussLOD(g, gm, [0.6, 0.55, HOT, 0], foot, m, size, bay, col); trussLOD(g, gm, [0.6, 0.55, 1, 0], m, top, size, bay, col); };
  const deckUnder = (tag, f0, f1, col) => { const ids = at(tag), a = Math.floor(ids.length * f0), b = Math.floor(ids.length * f1);
    for (let k = a; k < b; k += 2) { const i = ids[k], i2 = t.wrapIdx(i + 2), q = fq(t, i), w = t.w[i] + 6, h = t.h[i], g = ch.get(i, 'ind').mat(0.6, 0.55, 1, 0), m = new Vec3().lerpVectors(P(t, i, 0, -h - 3), P(t, i2, 0, -h - 3), 0.5);
      g.at(m.x, m.y, m.z, q).box(2 * w, 3, t.D * 2 + 0.2, col); for (const s of [-1, 1]) { const r = new Vec3().lerpVectors(P(t, i, s * w, -h + 1.5), P(t, i2, s * w, -h + 1.5), 0.5); g.at(r.x, r.y, r.z, q).box(1, 4.5, t.D * 2 + 0.2, [0.3, 0.22, 0.07, 0]); }
      // V11: plate girders under the deck, a cable tray and a pipe along one side
      const gm = ch.get(i, 'indm').mat(0.6, 0.55, 1, 0);
      for (const s of [-1, 0.35, 1]) { const r = new Vec3().lerpVectors(P(t, i, s * (w - 2), -h - 6.2), P(t, i2, s * (w - 2), -h - 6.2), 0.5); gm.at(r.x, r.y, r.z, q).box(0.6, 3.6, t.D * 2 + 0.2, [0.26, 0.24, 0.22, 0]); }
      { const r = new Vec3().lerpVectors(P(t, i, w + 1.6, -h - 1.5), P(t, i2, w + 1.6, -h - 1.5), 0.5); gm.at(r.x, r.y, r.z, q).cyl(0.7, 0.7, t.D * 2 + 0.2, 8, [0.42, 0.38, 0.32, 0], false); }
      if (k % 6 === 0) { const gl = ch.get(i, 'indLit'); for (const s of [-1, 1]) { const lp = P(t, i, s * (w - 0.6), -h + 3.9); gl.mat(0, 0.4, 5, 0).at(lp.x, lp.y, lp.z, q).box(0.5, 0.5, 0.5, LAMP); }
        const cb = P(t, i, 0, -h - 4.6); gm.at(cb.x, cb.y, cb.z, q).box(2 * w - 2, 1.2, 0.8, [0.28, 0.26, 0.24, 0]); }
      if (k % 12 === 0) for (const s of [-1, 1]) { const top = P(t, i, s * (w - 3), -h - 4.5), foot = top.clone(); foot.y = Math.min(lavaAt(top.x, top.z).y, hAt(top.x, top.z)) - 6;
        if (top.y - foot.y > 4) { trussH(g, gm, foot, top, 5, 9, [0.28, 0.27, 0.26, 0]); vents.push(v3(foot.x, foot.y + 6, foot.z)); } } } };
  deckUnder('start', 0.05, 0.95, [0.11, 0.105, 0.1, 0]); deckUnder('bridge', 0.08, 0.92, [0.12, 0.1, 0.085, 0]); // V11: sooty steel decks, as dark as before (the energy field over them stays as readable)
  const okAt = (x, z, rr, hh) => { const y = hAt(x, z); return clear.box(v3(x, y + hh / 2, z), v3(rr, 0, 0), v3(0, hh / 2 + 6, 0), v3(0, 0, rr), 8) ? y : null; };
  const building = (x, z, kind, seed) => { const r = makeRng(seed), R2 = makeRng(seed * 13 + 5), ni = nearI(v3(x, 0, z)), g = stCh.get(ni, 'stl'), gm = stCh.get(ni, 'stlm'), gd = stCh.get(ni, 'stld'); void R2; // g: the forms that carry the outline; gm: lacing, rings, stairs, pipes; gd: railings, ladders, louvres, guy lines (the two detail layers are drawn while a pixel can still show them)
    if (kind === 'smelter') { const sx = 50 + r() * 40, sz = 70 + r() * 50, hh = 40 + r() * 30, y = okAt(x, z, Math.hypot(sx, sz) / 2, hh + 40); if (y === null) return false; const q = QY(r() * 180), X = (lx, ly, lz) => new Vec3(lx, ly, lz).applyQuat(q).add(v3(x, y, z));
      g.mat(0.5, 0.65, 1, 0).at(x, y + hh / 2, z, q).bbox(sx, hh, sz, 1, STEEL[seed % 4]);
      for (let k = 0; k < 3; k++) { const p = new Vec3(0, hh * (0.3 + k * 0.22), sz / 2 + 0.3).applyQuat(q); bigLit.at(x + p.x, y + p.y, z + p.z, q).box(sx * 0.8, 1.6, 0.2, [1, 0.45, 0.1, 1]); }
      for (let k = 0; k < 2; k++) { const p = new Vec3((k - 0.5) * sx * 0.5, hh, 0).applyQuat(q); g.at(x + p.x, y + hh + 14, z + p.z, QX(90)).cyl(4, 3.6, 28, 14, [0.26, 0.24, 0.23, 0], false); g.at(x + p.x, y + hh + 34, z + p.z, QX(90)).cyl(3.6, 3.4, 12, 14, [0.2, 0.19, 0.18, 1], false); smokes.push(v3(x + p.x, y + hh + 42, z + p.z));
        for (const yy of [8, 18, 28]) gm.mat(0.5, 0.65, 1, 0).at(x + p.x, y + hh + yy, z + p.z, QX(90)).cyl(4.2 - yy * 0.012, 4.2 - yy * 0.012, 0.7, 14, [0.22, 0.2, 0.19, 0.5], false);
        ladder(gd, v3(x + p.x + 4.1, y + hh + 1, z + p.z), v3(x + p.x + 3.6, y + hh + 38, z + p.z), 0.6, new Vec3(0, 0, 1), [0.3, 0.27, 0.24, 0.6]);
        bigLit.at(x + p.x, y + hh + 41, z + p.z).box(0.9, 0.9, 0.9, RED); lights.push({ p: v3(x + p.x, y + hh + 41, z + p.z), c: [3.5, 0.3, 0.2], s: 4, blink: 1, ph: k * 0.5 }); }
      // V11: a roof monitor with louvres, buttress columns, an annex, furnace mouths glowing at the base, pipes up the wall
      { const m = X(0, hh + 3, 0); g.at(m.x, m.y, m.z, q).bbox(sx * 0.32, 6, sz * 0.9, 0.5, STEEL[1]); for (let k = 0; k < 9; k++) for (const s of [-1, 1]) { const lv = X(s * sx * 0.162, hh + 3, -sz * 0.4 + k * sz * 0.1); gd.mat(0.5, 0.65, 1, 0).at(lv.x, lv.y, lv.z, q).box(0.2, 4, sz * 0.07, [0.08, 0.075, 0.07, 0.6]); } }
      for (let k = 0; k <= Math.round(sz / 10); k++) for (const s of [-1, 1]) { const zz = -sz / 2 + k * sz / Math.round(sz / 10); bar(gm.mat(0.5, 0.65, 1, 0), X(s * (sx / 2 + 0.6), 0, zz), X(s * (sx / 2 + 0.6), hh - 1, zz), 1.2, 1.2, [0.22, 0.21, 0.2, 0.25]); }
      { const an = X(sx / 2 + 9, hh * 0.3, sz * 0.15); g.at(an.x, an.y, an.z, q).bbox(18, hh * 0.6, sz * 0.4, 0.6, STEEL[(seed + 1) % 4]); }
      for (let k = 0; k < 3; k++) { const fm = X(-sx * 0.3 + k * sx * 0.3, 4, sz / 2 + 0.25); bigLit.at(fm.x, fm.y, fm.z, q).box(5, 6, 0.3, [1, 0.38, 0.06, 1]); g.mat(0.5, 0.65, HOT, 0).at(fm.x, fm.y + 4.4, fm.z, q).box(7, 1.6, 1.4, [0.2, 0.18, 0.16, 0.8]).mat(0.5, 0.65, 1, 0); lights.push({ p: X(-sx * 0.3 + k * sx * 0.3, 4, sz / 2 + 2), c: [2.4, 0.7, 0.12], s: 9 }); }
      for (let k = 0; k < 3; k++) pipe(gm.mat(0.6, 0.55, 1, 0), X(sx / 2 + 1.6, 1, -sz * 0.3 + k * 2), X(sx / 2 + 1.6, hh + 1, -sz * 0.3 + k * 2), 0.6, k ? [0.4, 0.36, 0.3, 0.3] : YEL, 8);
      railing(gd.mat(0.6, 0.55, 1, 0), [X(-sx / 2 + 0.5, hh, -sz / 2 + 0.5), X(sx / 2 - 0.5, hh, -sz / 2 + 0.5), X(sx / 2 - 0.5, hh, sz / 2 - 0.5), X(-sx / 2 + 0.5, hh, sz / 2 - 0.5)], 1.1, 2.6, YEL, true);
      stair(gm.mat(0.6, 0.55, 1, 0), X(-sx / 2 - 1.8, 0, -sz * 0.35), X(-sx / 2 - 1.8, hh, -sz * 0.35 + hh * 0.9), 1.2, YEL);
      // a conveyor from the ore heap to the roof
      { const c0 = X(-sx / 2 - 40, 0, 0), c1 = X(-sx / 2 + 4, hh + 2, 0); if (okAt(c0.x, c0.z, 8, 20) !== null) { trussLOD(g, gm, [0.6, 0.55, 1, 0], v3(c0.x, hAt(c0.x, c0.z) + 3, c0.z), c1, 3.4, 6, RUST[1]); g.at(c0.x, hAt(c0.x, c0.z) + 6, c0.z).polyRock(9, seed * 0.3, [0.16, 0.12, 0.1, 0], { planes: 10, lo: 0.6, hi: 1, stretch: [1.3, 0.55, 1.1], seg: 0.5, rings: 1 }); } }
      return true; }
    if (kind === 'tower') { const R0 = 26 + r() * 14, hh = 90 + r() * 60, y = okAt(x, z, R0, hh); if (y === null) return false;
      g.mat(0.2, 0.8, 1, 0).at(x, y + hh / 2 + 6, z, QX(-90)).lathe([[R0, -hh / 2], [R0 * 0.74, -hh * 0.05], [R0 * 0.66, hh * 0.22], [R0 * 0.72, hh / 2]], 32, [0.42, 0.39, 0.36, 0]);
      g.at(x, y + hh + 6, z, QX(-90)).lathe([[R0 * 0.72, -0.5], [R0 * 0.74, 0], [R0 * 0.72, 4]], 32, [0.18, 0.17, 0.16, 1]); // V11: a sooty band round the lip
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, a2 = (k + 0.5) / 24 * Math.PI * 2; bar(g, v3(x + Math.cos(a) * R0 * 1.02, y - 1, z + Math.sin(a) * R0 * 1.02), v3(x + Math.cos(a2) * R0 * 0.99, y + 7, z + Math.sin(a2) * R0 * 0.99), 1, 1, [0.36, 0.34, 0.32, 0]); } // the V-legs it stands on
      smokes.push(v3(x, y + hh + 10, z)); return true; }
    if (kind === 'rig') { const hh = 60 + r() * 40, y = okAt(x, z, 14, hh + 10); if (y === null) return false; trussLOD(g, gm, [0.7, 0.5, 1, 0], v3(x, y - 2, z), v3(x, y + hh, z), 10, 8, RUST[seed % 3]);
      g.mat(0.5, 0.6, 1, 0).at(x, y + 3, z).bbox(26, 6, 26, 1, STEEL[1]); bigLit.at(x, y + hh + 2, z).box(1.4, 1.4, 1.4, RED); lights.push({ p: v3(x, y + hh + 2, z), c: [3.5, 0.3, 0.2], s: 5, blink: 0.8 }); vents.push(v3(x, y + 1, z));
      // V11: a working floor, the drill string, a winch house, guy lines, a floodlight
      g.at(x, y + 14, z).box(16, 0.5, 16, [0.3, 0.28, 0.26, 0]); railing(gd.mat(0.6, 0.55, 1, 0), [v3(x - 8, y + 14.2, z - 8), v3(x + 8, y + 14.2, z - 8), v3(x + 8, y + 14.2, z + 8), v3(x - 8, y + 14.2, z + 8)], 1.1, 2.4, YEL, true);
      pipe(g, v3(x, y + 1, z), v3(x, y + hh - 6, z), 0.35, [0.5, 0.48, 0.45, 0], 6); g.at(x + 9, y + 9, z + 4).bbox(7, 6, 8, 0.3, STEEL[(seed + 2) % 4]);
      for (const [gx, gz] of [[30, 0], [-22, 22], [-22, -22]]) { const gy = hAt(x + gx, z + gz); if (clear.sphere(v3(x + gx * 0.5, (gy + y + hh * 0.7) / 2, z + gz * 0.5), 6, 4)) pipe(gd, v3(x, y + hh * 0.7, z), v3(x + gx, gy, z + gz), 0.08, [0.2, 0.2, 0.2, 0], 4); }
      { const fl = v3(x - 4, y + hh * 0.5, z - 4), aim = v3(-0.5, -0.8, -0.3).normalize(); bigLit.at(fl.x, fl.y, fl.z, qLook(aim)).box(1.2, 0.8, 0.2, [1, 0.85, 0.6, 1]); beamCone(beams, fl, aim, 55, 14, [1, 0.8, 0.55]); }
      return true; }
    if (kind === 'tanks') { const y = okAt(x, z, 36, 30); if (y === null) return false; for (let k = 0; k < 4; k++) { const tx = x + (k % 2) * 22 - 11, tz = z + Math.floor(k / 2) * 22 - 11;
        g.mat(0.6, 0.45, 1, 0).at(tx, y + 11, tz, QX(90)).cyl(9, 9, 22, 20, [0.5, 0.48, 0.44, 0], true); g.at(tx, y + 22, tz, QX(-90)).lathe([[9, 0], [7, 1.8], [3, 2.8], [0.2, 3.1]], 20, [0.44, 0.42, 0.39, 0.3]);
        for (const yy of [5, 11, 17]) gm.mat(0.6, 0.45, 1, 0).at(tx, y + yy, tz, QX(90)).cyl(9.12, 9.12, 0.4, 20, [0.38, 0.36, 0.33, 0], false);
        stair(gm.mat(0.6, 0.55, 1, 0), v3(tx + 9.6, y, tz - 6), v3(tx + 9.6, y + 22, tz + 6), 0.9, YEL); }
      pipe(g, v3(x - 11, y + 3, z), v3(x + 11, y + 3, z), 1.1, YEL, 10); pipe(g, v3(x, y + 3, z - 11), v3(x, y + 3, z + 11), 1.1, YEL, 10); return true; }
    return false; };
  const sites = []; for (const tag of ['bridge', 'mine', 'arch', 'ridgedown', 'start', 'final', 'sweep']) { for (const i of at(tag).filter((_, k) => k % 7 === 0)) for (const s of [-1, 1]) { const d = t.w[i] + 70 + rng() * 260, B = t.bin[i], p = t.pos[i]; sites.push([p.x + B.x * s * d, p.z + B.z * s * d]); } }
  let nb = 0; const KIND = ['smelter', 'tower', 'rig', 'tanks', 'rig', 'smelter'];
  for (const [x, z] of sites) { if (nb > 46) break; if (building(x, z, KIND[nb % KIND.length], 300 + nb)) nb++; }
  // the mine chicane: towers either side carrying the conveyor gantry (the obstacle) across the corridor
  for (const o of t.obstacles) if (!o.kind && o.type === 'hbeam') { const q = fq(t, o.i), w = t.w[o.i], h = t.h[o.i], c = P(t, o.i, 0, o.y), g = ch.get(o.i, 'ind');
    g.mat(0.6, 0.5, 1, 0).at(c.x, c.y, c.z, q.clone().multiply(QY(90))).cyl(o.r * 0.98, o.r * 0.98, 2 * w + 8, 16, [0.62, 0.48, 0.14, 0], false);
    for (const s of [-1, 1]) { const top = P(t, o.i, s * (w + 8), o.y + 30), foot = top.clone(); foot.y = hAt(foot.x, foot.z) - 4; trussH(g, ch.get(o.i, 'indm'), foot, top, 9, 9, RUST[0]); beam(g.mat(0.6, 0.5, 1, 0), P(t, o.i, s * (w + 1), o.y), P(t, o.i, s * (w + 8), o.y), 3, 3, RUST[1]);
      for (const k of [-1, 1]) { const rp = P(t, o.i, s * (w + 8), o.y + 30).addScaled(t.tan[o.i], k * 4.8); ladder(ch.get(o.i, 'indd').mat(0.6, 0.5, 1, 0), v3(rp.x, foot.y + 4, rp.z), v3(rp.x, rp.y, rp.z), 0.6, t.bin[o.i], YEL); break; } }
    const span = P(t, o.i, 0, o.y + 30); trussLOD(g, ch.get(o.i, 'indm'), [0.6, 0.5, 1, 0], P(t, o.i, -w - 8, o.y + 30), P(t, o.i, w + 8, o.y + 30), 6, 8, RUST[1]); void span;
    for (let k = -3; k <= 3; k++) { const lp = P(t, o.i, k * w / 3.5, o.y + o.r + 0.4); ch.get(o.i, 'indLit').mat(0, 0.4, 5, 0).at(lp.x, lp.y, lp.z, q).box(0.6, 0.3, 0.6, [1, 0.5, 0.15, 1]); } }
  // pipelines on stilts across the flats, conveyors between the smelters
  for (let n = 0; n < 6; n++) { const i = at('sweep')[Math.floor(rng() * at('sweep').length)], B = t.bin[i], p = t.pos[i], s = n % 2 ? 1 : -1, a = v3(p.x + B.x * s * (t.w[i] + 40), 0, p.z + B.z * s * (t.w[i] + 40)), dir = v3(B.x * s, 0, B.z * s), b = a.clone().addScaled(dir, 500);
    let ok = true; for (let k = 0; k <= 10; k++) { const pp = new Vec3().lerpVectors(a, b, k / 10); pp.y = hAt(pp.x, pp.z) + 8; if (!clear.sphere(pp, 6, 4)) ok = false; } if (!ok) continue;
    const g = stCh.get(i, 'stl'), gm = stCh.get(i, 'stlm').mat(0.8, 0.4, 1, 0);
    for (let k = 0; k < 10; k++) { const p0 = new Vec3().lerpVectors(a, b, k / 10), p1 = new Vec3().lerpVectors(a, b, (k + 1) / 10); p0.y = hAt(p0.x, p0.z) + 8; p1.y = hAt(p1.x, p1.z) + 8;
      g.mat(0.8, 0.4, 1, 0); const d = new Vec3().subVectors(p1, p0); g.at((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, qLook(d)).cyl(1.6, 1.6, d.len(), 10, [0.36, 0.33, 0.3, 0], false); g.at(p0.x, p0.y - 4, p0.z).box(1, 8, 1, STEEL[1]);
      gm.at(p0.x, p0.y, p0.z, qLook(d)).cyl(2.1, 2.1, 0.6, 10, [0.3, 0.28, 0.26, 0], false); bar(gm, v3(p0.x - 2.4, p0.y - 1.7, p0.z), v3(p0.x + 2.4, p0.y - 1.7, p0.z), 0.5, 0.5, STEEL[1]); } } // V11: flanges and pipe saddles
  // the detail layers are drawn while their features (lacing and pipes of about 0.6 m, railings and ladders of about 0.2 m) still cover most of a pixel
  const lod = new DetailLOD(), STEELO = { prog: 'v11metalDry', cast: true, uniforms: IU };
  items.push(...ch.items(gfx, 'ind', { ...STEELO, tag: 'trackside' }), ...lod.add(ch.items(gfx, 'indm', { ...STEELO, tag: 'trackside lacing' }), 0.6), ...lod.add(ch.items(gfx, 'indd', { ...STEELO, tag: 'trackside detail' }), 0.2), ...ch.items(gfx, 'indLit', { prog: 'pbrStruct' }));
  items.push(...stCh.items(gfx, 'stl', { ...STEELO, maxDist: 7000, tag: 'plant' }), ...lod.add(stCh.items(gfx, 'stlm', { ...STEELO, maxDist: 7000, tag: 'plant lacing' }), 0.6), ...lod.add(stCh.items(gfx, 'stld', { ...STEELO, maxDist: 1200, tag: 'plant detail' }), 0.2));
  items.push({ mesh: gfx.mesh(big.build()), visible: true, prog: 'pbrStruct' }, { mesh: gfx.mesh(bigLit.build()), visible: true, prog: 'pbrStruct' });
  items.push(...cellItems(gfx, beams, 400, { prog: 'v11beam', blend: 'add', layer: 1, uniforms: { uBeam: [0.1, 0, 0.8, 2400] }, maxDist: 2400 })); // in cells: a beam fades to nothing at its range and is not drawn beyond it

  // ---------------------------------------------------------------- V11: boulders and outcrops of basalt on the slopes round the
  // course (instanced, three levels of detail; those near the course cast shadows on it)
  const boulderSets = [];
  { const BC = [[0.13, 0.115, 0.105], [0.15, 0.12, 0.1], [0.11, 0.1, 0.095], [0.16, 0.13, 0.11]], R5 = makeRng(t.def.seed * 71 + 9), list = [];
    const shapes = [{ fam: 'frac', c: BC[0], craters: 0, cuts: 4, flat: true, fresh: 1.12 }, { fam: 'layer', c: BC[1], craters: 0, cuts: 2 }, { fam: 'frac', c: BC[2], craters: 0, cuts: 6, flat: true, fresh: 1.1 }, { fam: 'layer', c: BC[3], craters: 0, cuts: 3 }];
    const meshes = shapes.map((v, k) => [2, 1, 0].map(d => rockGeo(v, d, 300 + k * 13.7, 0.7, 1.08, [1, 0.62 + 0.1 * k, 1.1]).build()));
    for (let k = 0, tries = 0; k < 2200 && tries < 9000; tries++) { const i = Math.floor(R5() * N), s = R5() < 0.5 ? -1 : 1, B = t.bin[i], p = t.pos[i], d = t.w[i] + 22 + Math.pow(R5(), 1.6) * 420, x = p.x + B.x * s * d, z = p.z + B.z * s * d;
      const sz = 1.6 + Math.pow(R5(), 2.6) * 18, y = hAt(x, z), lv = lavaAt(x, z); if (lv.d < sz * 0.5) continue;
      if (!clear.sphere(v3(x, y + sz * 0.4, z), sz * 1.15, 3)) continue;
      const q = new Quat().setAxisAngle(0, 1, 0, R5() * 6.283).multiply(new Quat().setAxisAngle(1, 0, 0, (R5() - 0.5) * 0.5)), sy = sz * (0.6 + R5() * 0.6), m = mat4.create(); mat4.compose(m, v3(x, y - sz * 0.25, z), q, sz, sy, sz * (0.8 + R5() * 0.4));
      list.push({ m, x, y: y + sy * 0.3, z, r: sz * 1.3, v: k % 4, near: d < t.w[i] + 120, tint: 0.8 + R5() * 0.35 }); k++; }
    for (const near of [true, false]) for (let v = 0; v < 4; v++) { const L = list.filter(b => b.v === v && b.near === near), n = Math.max(1, L.length);
      const set = new InstanceSet(gfx, [{ mesh: gfx.mesh(meshes[v][0], n), px: 110 }, { mesh: gfx.mesh(meshes[v][1], n), px: 28 }, { mesh: gfx.mesh(meshes[v][2], n), px: 0 }], n, { prog: 'pbrRock', cast: near, cullPx: 2 });
      set.items[2].cast = false; // the smallest level is always beyond the reach of the shadow map
      for (const b of L) set.add(b.m, b.x, b.y, b.z, b.r, b.tint, b.tint * 0.97, b.tint * 0.95, 1); for (const it of set.items) it.tag = 'boulders'; boulderSets.push(set); items.push(...set.items); } }

  // ---------------------------------------------------------------- the course kit
  const hex = hexField(gfx, t, i => !t.tunnel[i], [1, 0.45, 0.15]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), rg = routeGuides(gfx, t, { colL: [1, 0.55, 0.15], colR: [1, 0.85, 0.4], corners: i => t.tunnel[i] ? [] : [0, 1, 2, 3], open: i => !t.tunnel[i] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...rg.items);
  const hauler = gfx.mesh(buildHauler()), patrol = gfx.mesh(buildPatrol());
  const mv = movers([
    { mesh: hauler, scale: 2.2, br: 150, path: (time, p, q) => { const a = time * 0.025, R = 1900; p.set(cx + Math.cos(a) * R, 520, cz + Math.sin(a) * R); q.setAxisAngle(0, 1, 0, -a); }, lights: [{ x: 9, y: 0, z: -40, s: 5, c: [4, 0.5, 0.3], blink: 1.1, ph: 0 }] },
    ...[0, 1].map(k => ({ mesh: patrol, br: 20, path: (time, p, q) => { const a = -time * (0.09 + k * 0.03) + k * 2.4, R = 800 + k * 300; p.set(cx + Math.cos(a) * R, 230 + k * 50, cz + Math.sin(a) * R); q.setAxisAngle(0, 1, 0, -a + Math.PI); },
      lights: [{ x: 7.2, y: 0, z: -6, s: 2.4, c: [4, 0.4, 0.3], blink: 1.3, ph: k }] }))]);
  items.push(...mv.items);

  // ---------------------------------------------------------------- sky: ash clouds lit from below by the lava
  const U = { uCloud: [1700, 0.00016, 0.78, 0.7], uWind: [0.0016, -0.0009, 0], uFlash: [0, 0, 0, 1], uCloudLo: [0.035, 0.025, 0.022], uCloudHi: [0.2, 0.12, 0.08], uGlow: [0.16, 0.035, 0.008],
    uCloud2: [950, 0.00028, 0.5, 0.75], uWind2: [0.0034, -0.0021, 0], uScud: [0.06, 0.035, 0.026] }; // V11: a lower layer of ash torn by the wind, lit from below
  const dome = { mesh: gfx.mesh(domeGeo(64, 18).build()), prog: 'v9cloud', pos: new Vec3(), quat: new Quat(), scale: 26000, uniforms: U, blend: 'normal', layer: -1, visible: true }; items.push(dome);
  const env = { sunDir: v3(-0.62, 0.34, -0.72).normalize(), sunCol: [2.4, 1.35, 0.8], fogCol: [0.1, 0.045, 0.028], fog: 0.00032, fogH: [-60, 460], sky: 'atmo', zen: [0.025, 0.018, 0.018], hor: [0.42, 0.14, 0.05],
    dirt: 0.4, streak: 0.6, flare: 0.5, envInt: 1.2, expo: 1.1, shafts: 0.35, reverb: 'open', nebA: [0.4, 0.1, 0.05], nebB: [0.5, 0.2, 0.05], nebC: [1, 0.6, 0.3], base: [0.01, 0.005, 0.004], neb: 0, seed: 9.3, sat: 1.04, lift: [0.01, 0.004, 0.002], gain: [1.04, 0.98, 0.92] };

  // ---------------------------------------------------------------- per frame: embers, smoke, eruptions, lava bubbles, ash
  const fr = new Frustum(), V = volc[0], crater = v3(V.x, V.h - 110, V.z); let emberT = 0, smokeT = 0, eruptT = 4, erupting = 0, bubbleT = 0;
  // V11: ash and fume hanging over the lava, lit orange from below (soft haze sprites, nearest first)
  const ash = []; { const R6 = makeRng(t.def.seed * 83 + 1); for (const Rv of rivers) for (let k = 0; k < Rv.pts.length; k += 2) for (let m = 0; m < 2; m++) { const p = Rv.pts[k], c = v3(p.x + (R6() - 0.5) * p.w * 4, p.y + 14 + R6() * 50, p.z + (R6() - 0.5) * p.w * 4), sz = 60 + R6() * 90;
      if (clear.sphere(c, sz * 0.3, 0)) ash.push({ p: c, s: sz, rot: R6() * 9, sd: [R6() * 9, R6() * 9, R6()], hot: 1 }); }
    for (const L of lakes) for (let k = 0; k < 10; k++) { const a = R6() * 6.283, d = R6() * L.r, c = v3(L.x + Math.cos(a) * d, L.y + 18 + R6() * 60, L.z + Math.sin(a) * d), sz = 80 + R6() * 120; if (clear.sphere(c, sz * 0.3, 0)) ash.push({ p: c, s: sz, rot: R6() * 9, sd: [R6() * 9, R6() * 9, R6()], hot: 1 }); }
    for (let k = 0; k < 120; k++) { const x = minX - 1200 + R6() * (maxX - minX + 2400), z = minZ - 1200 + R6() * (maxZ - minZ + 2400), c = v3(x, hAt(x, z) + 40 + R6() * 160, z), sz = 160 + R6() * 220; if (clear.sphere(c, sz * 0.3, 0)) ash.push({ p: c, s: sz, rot: R6() * 9, sd: [R6() * 9, R6() * 9, R6()], hot: 0 }); } }
  release(ch, stCh, big, bigLit, beams, lava, rocks, ribLit); // every mesh is made: the vertex lists go (v11kit)
  return { items, env, cull(cam) { fr.set(cam, gfx); for (const s of boulderSets) s.update(fr); lod.update(fr); },
    hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); mv.update(dt, time, fx); rg.update(fx, cam, race, time);
      const c = cam.pos; dome.pos.set(c.x, 0, c.z);
      { const Rr = 2400 * (gfx.cfg.hazeDist ?? 1), hcap = Math.min(60, gfx.cfg.hazeCap ?? 120); let nh = 0;
        for (const m of ash) { const d = m.p.dist(c); if (d > Rr || nh >= hcap) continue; const a = (m.hot ? 0.22 : 0.16) * Math.min(1, (Rr - d) / (Rr * 0.3)) * Math.min(1, d / (m.s * 0.7)); if (a < 0.01) continue; nh++;
          fx.bbHaze.add(m.p.x, m.p.y, m.p.z, m.s, m.hot ? 0.34 : 0.13, m.hot ? 0.11 : 0.07, m.hot ? 0.045 : 0.05, a, m.rot + time * 0.02, m.sd[0], m.sd[1], m.sd[2]); } }
      // embers rising off the lava around the camera, and ash drifting down
      if ((emberT -= dt) < 0) { emberT = 0.02; for (let n = 0; n < 6; n++) { const a = Math.random() * 6.283, d = 20 + Math.random() * 380, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, lv = lavaAt(x, z);
          if (lv.d < 30) fx.spawn(x, lv.y + 2, z, (Math.random() - 0.5) * 4, 6 + Math.random() * 10, (Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, 0.35 + Math.random() * 0.4, 0.1, 3, 1.1, 0.25, 1, true, 0.3, 0, -1.5); }
        const a = Math.random() * 6.283, d = Math.random() * 120; fx.spawn(c.x + Math.cos(a) * d, c.y + 40 + Math.random() * 30, c.z + Math.sin(a) * d, 3, -4, 1, 6, 0.25, 0.25, 0.05, 0.045, 0.04, 0.6, false, 0.1); }
      // lava bubbles bursting near the camera
      if ((bubbleT -= dt) < 0) { bubbleT = 0.15; const a = Math.random() * 6.283, d = 30 + Math.random() * 300, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, lv = lavaAt(x, z);
        if (lv.d < 0) { fx.spawn(x, lv.y + 0.5, z, 0, 0, 0, 0.6, 1, 5, 3, 1.4, 0.35, 0.9, true, 0); for (let k = 0; k < 6; k++) fx.spawn(x, lv.y + 1, z, (Math.random() - 0.5) * 10, 8 + Math.random() * 10, (Math.random() - 0.5) * 10, 1 + Math.random(), 0.6, 0.2, 3.2, 1.3, 0.3, 1, true, 0.2, 0, 14); } }
      // smoke from stacks, vents and the lava falls
      if ((smokeT -= dt) < 0) { smokeT = 0.08; for (const s of smokes) if (s.dist(c) < 3000 && Math.random() < 0.4) fx.spawn(s.x, s.y, s.z, 3, 8 + Math.random() * 4, 1, 9, 10, 60, 0.09, 0.08, 0.075, 0.5, false, 0.05);
        for (const v of vents) if (v.dist(c) < 1200 && Math.random() < 0.3) fx.spawn(v.x, v.y, v.z, 1, 6, 0, 5, 4, 26, 0.18, 0.1, 0.07, 0.35, false, 0.1);
        for (const f of falls) if (f.bot.dist(c) < 1800) { fx.spawn(f.bot.x, f.bot.y + 2, f.bot.z, 0, 6, 0, 3, f.W * 0.6, f.W * 2.5, 0.25, 0.08, 0.03, 0.4, false, 0.2); fx.spawn(f.bot.x + (Math.random() - 0.5) * f.W, f.bot.y + 1, f.bot.z + (Math.random() - 0.5) * f.W, (Math.random() - 0.5) * 12, 10 + Math.random() * 12, (Math.random() - 0.5) * 12, 1.2, 0.7, 0.2, 3.2, 1.3, 0.3, 1, true, 0.1, 0, 12); } }
      for (const f of falls) if (f.bot.dist(c) < 4000) fx.bbAdd.add(f.bot.x, f.bot.y + 6, f.bot.z, f.W * 2.2, 1.6, 0.45, 0.08, 0.6);
      // the volcano: a plume always, eruptions every so often: a flash, glowing bombs arcing out and a dark column
      if (Math.random() < dt * 6) fx.spawn(crater.x + (Math.random() - 0.5) * 120, crater.y + 60, crater.z + (Math.random() - 0.5) * 120, 8, 40 + Math.random() * 20, -4, 30, 120, 520, 0.07, 0.055, 0.05, 0.5, false, 0.02);
      fx.bbAdd.add(crater.x, crater.y + 40, crater.z, 420, 1.4, 0.35, 0.06, 0.6 + 0.2 * Math.sin(time * 2.1));
      if ((eruptT -= dt) < 0) { eruptT = 9 + Math.random() * 12; erupting = 2.5; }
      if (erupting > 0) { erupting -= dt; for (let k = 0; k < 6; k++) { const a = Math.random() * 6.283, sp = 120 + Math.random() * 200; fx.spawn(crater.x, crater.y + 40, crater.z, Math.cos(a) * sp * 0.5, sp, Math.sin(a) * sp * 0.5, 6 + Math.random() * 3, 18, 8, 3.4, 1.4, 0.3, 1, true, 0, 0, 40); }
        if (Math.random() < dt * 10) fx.spawn(crater.x, crater.y + 100, crater.z, 0, 80, 0, 14, 200, 900, 0.06, 0.045, 0.04, 0.6, false, 0.03);
        fx.bbAdd.add(crater.x, crater.y + 120, crater.z, 900, 2.2, 0.7, 0.15, Math.min(1, erupting)); }
      for (const l of lights) { if (l.blink && Math.floor((time + (l.ph || 0)) / l.blink) % 2) continue; if (l.p.dist(c) > 7000) continue; fx.bbAdd.add(l.p.x, l.p.y, l.p.z, l.s, l.c[0], l.c[1], l.c[2], 1); }
      for (const h of hz) if (h.o.kind === 'basalt' && h.p.dist(c) < 400 && Math.random() < dt * 3) { const p = h.p; fx.spawn(p.x, p.y - t.h[h.o.i], p.z, 0, 4, 0, 3, 2, 12, 0.2, 0.09, 0.05, 0.3, false, 0.1); }
    },
    // the lava lights the ship's underside wherever it flies over it
    light(me) { if (!me) return null; const p = me.ship.pos, lv = lavaAt(p.x, p.z); if (lv.d > 40) return null; const k = Math.max(0, 1 - Math.max(0, lv.d) / 40) * Math.max(0, 1 - (p.y - lv.y) / 70);
      return k > 0.02 ? { pos: v3(p.x, lv.y + 2, p.z), col: [3.2 * k, 1.1 * k, 0.25 * k], range: 70 } : null; } };
}
