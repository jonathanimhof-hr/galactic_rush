// GALACTIC RUSH V10 — Verdant Canopy, the jungle world: a living forest of trees taller than mountains. A misty forest
// floor with streams and a gorge with waterfalls far below; colossal trees with buttress roots, limbs and crowns
// above the clouds; a canopy of thousands of crowns; giant flowers, shelf fungi, hanging lianas and moss; suspended
// platforms; shafts of sunlight through the canopy; forest-covered mountains to the horizon. Every branch, root and
// trunk inside the racing corridor is drawn exactly where its collision is (course data: track.wood, the vbeams);
// soft vegetation in the corridor (vines, leaves) never collides and bursts into leaves when a ship passes.
// V11 visual pass (same layout, same places, same course): sunlight dappled by the canopy on everything beneath it, a
// forest of many hues (gold, rust, violet and blue-green crowns among the greens, drifts of fallen leaves), foliage lit
// round the mass with a wet sheen and light shining through, deeper bark with wet runs, moss hanging from the giants'
// limbs and vines climbing their trunks (both swaying), giant flowers with glowing hearts, glowing mushrooms on the
// floor, and the forest drawn nearest first so the trees it hides cost little.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QX, QY, DET } from '../geo.js';
import { Chunks, fq, P, hexField, gates, pickups, routeGuides, planetItems, v3 } from './common.js';
import { Frustum, InstanceSet, VIS } from '../lod.js';
import { Clearance, fbm2, ridged2 } from './v9kit.js';
import { ensureV10Programs, woodTube, blob, leaf, crownCluster } from './v10kit.js';
import { qDir, release } from './v11kit.js';

const BARK = [[0.3, 0.22, 0.16], [0.36, 0.28, 0.2], [0.24, 0.19, 0.15], [0.4, 0.34, 0.27], [0.3, 0.26, 0.24]];
const GREEN = [[0.11, 0.29, 0.07], [0.08, 0.25, 0.1], [0.15, 0.33, 0.06], [0.09, 0.21, 0.11], [0.18, 0.31, 0.09], [0.12, 0.27, 0.13]];
// V11: the forest's crowns: greens of many shades (yellow-green, blue-green) and, among them, gold, rust and violet
const FOLI = [...GREEN, [0.17, 0.28, 0.06], [0.06, 0.2, 0.16], [0.26, 0.23, 0.07], [0.25, 0.12, 0.06], [0.15, 0.09, 0.17]];
const FLOOR = -185;

// V11: an instanced population drawn nearest first: the same culling, levels of detail and hysteresis as InstanceSet,
// but each level's instances go into its buffer sorted by distance, so the depth test spares the shading of whatever
// the nearer trees hide (a forest overlaps itself many times over). The order is made without comparing pairs: a
// radix sort on the bits of the squared distance (a non-negative 32-bit float, whose bits rise with its value), in
// three stable passes of eleven bits; equally distant instances stay in the order of their numbers.
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer), RADIX = new Uint32Array(3 * 2048);
export class NearFirst extends InstanceSet {
  update(fr) {
    const L = this.levels, nl = L.length, s = this.s, lv = this.lv, c = fr.cam.pos; VIS.sets++; VIS.inst += this.n;
    if (!this.kb) { this.kb = new Uint32Array(this.cap); this.ki = new Uint32Array(this.cap); this.tb = new Uint32Array(this.cap); this.ti = new Uint32Array(this.cap); }
    const kb = this.kb, ki = this.ki, tb = this.tb, ti = this.ti, H = RADIX; let nv = 0; H.fill(0);
    for (let k = 0; k < this.n; k++) {
      const x = s[k * 4], y = s[k * 4 + 1], z = s[k * 4 + 2], r = s[k * 4 + 3]; this.oc[k] = 0;
      if (!fr.sphere(x, y, z, r)) { lv[k] = -1; VIS.frustum++; continue; }
      const px = fr.px(x, y, z, r); if (px * Math.max(1, fr.bias) < this.cullPx) { lv[k] = -1; VIS.small++; continue; }
      if (this.occ && !this.occ.visible(x, y, z, r)) { VIS.occluded++; this.oc[k] = 1; continue; }
      let l = 0; while (l < nl - 1 && px < L[l].px) l++;
      const prev = lv[k]; if (prev >= 0 && prev !== l) { if (l < prev ? px < L[l].px * 1.12 : px > L[prev].px * 0.89) l = prev; }
      lv[k] = l; F32[0] = (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2; const b = U32[0]; kb[nv] = b; ki[nv++] = k; H[b & 2047]++; H[2048 + ((b >>> 11) & 2047)]++; H[4096 + (b >>> 22)]++;
      VIS.drawn++; VIS.levels[Math.min(3, l)]++;
    }
    for (let d = 0; d < 6144; d += 2048) { let sum = 0; for (let q = d; q < d + 2048; q++) { const n = H[q]; H[q] = sum; sum += n; } }
    for (let j = 0; j < nv; j++) { const b = kb[j], o = H[b & 2047]++; tb[o] = b; ti[o] = ki[j]; }
    for (let j = 0; j < nv; j++) { const b = tb[j], o = H[2048 + ((b >>> 11) & 2047)]++; kb[o] = b; ki[o] = ti[j]; }
    for (let j = 0; j < nv; j++) { const o = H[4096 + (kb[j] >>> 22)]++; ti[o] = ki[j]; }
    const cnt = new Array(nl).fill(0), m = this.m;
    for (let j = 0; j < nv; j++) { const k = ti[j], l = lv[k], md = L[l].mesh.data, o = cnt[l]++ * 20, so = k * 20; for (let i = 0; i < 20; i++) md[o + i] = m[so + i]; }
    for (let l = 0; l < nl; l++) { this.gfx.uploadInstances(L[l].mesh, cnt[l]); this.items[l].visible = cnt[l] > 0; }
  }
}

export function buildCanopy(gfx, t) {
  ensureV10Programs(gfx);
  const rng = makeRng(t.def.seed * 23 + 5), items = [], N = t.N, clear = new Clearance(t), R = () => rng();
  const DAP = { uDapple: WIND.uDapple }, late = []; // V11: sunlight dappled by the canopy (bark and floor; the foliage gets it with the wind)
  const MOSS = [[0.26, 0.31, 0.2], [0.33, 0.36, 0.24], [0.2, 0.26, 0.15]];
  // V11: a strand of hanging moss: a narrow ribbon falling from top, swaying more toward its end (foliage shader)
  const mossStrand = (g, top, len, wid, col, sd) => { const n = 6, d = v3(Math.sin(sd * 7.1), 0, Math.cos(sd * 7.1)), side = v3(-d.z, 0, d.x); g.M = [0.7, (sd * 0.37) % 1, 0, 0]; let prev = null;
    for (let k = 0; k <= n; k++) { const u = k / n, w = wid * (1 - 0.7 * u) * (0.85 + 0.3 * Math.sin(u * 9 + sd)), p = top.clone().add(v3(Math.sin(u * 4 + sd) * len * 0.05, -len * u, Math.cos(u * 3 + sd) * len * 0.05));
      const a = g.raw(p.clone().addScaled(side, -w / 2), d, [col[0], col[1], col[2], Math.min(1, u * 1.4)]), b = g.raw(p.clone().addScaled(side, w / 2), d, [col[0], col[1], col[2], Math.min(1, u * 1.4)]);
      if (prev) g.quad(prev[0], prev[1], b, a); prev = [a, b]; } };
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of t.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const at = tag => t.tags.get(tag) || [], mid = tag => { const a = at(tag); return a[a.length >> 1]; };
  // geometry buckets: wood (bark shader) and foliage (leaf shader) near the course in chunks; far scenery in one mesh each
  const ch = new Chunks(t, 80), chD = new Chunks(t, 160), bigLeaf = new Geo(), lit = new Geo().mat(0, 0.4, 4, 0), glowLights = [];
  // small near detail (moss, leaves, flowers, ferns, thin lianas, soft vegetation) in their own chunks, drawn to 1.6 km
  const woodG = i => ch.get(i, 'wood'), leafG = i => ch.get(i, 'leaf'), woodD = i => chD.get(i, 'woodd'), leafD = i => chD.get(i, 'leafd');
  // nearest course sample to a world point (plan view)
  const nearI = p => { let b = 0, bd = 1e18; for (let i = 0; i < N; i += 2) { const q = t.pos[i], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const okS = (p, r, m = 4) => clear.sphere(p, r, m);
  const okSeg = (a, b, r, m = 4) => { const n = Math.max(1, Math.ceil(a.dist(b) / Math.max(r, 3))), p = new Vec3(); for (let k = 0; k <= n; k++) if (!okS(p.lerpVectors(a, b, k / n), r, m)) return false; return true; };

  // ---------------------------------------------------------------- the forest floor: soil, moss, roots, and the gorge
  // a heightfield under the whole forest, never closer than 25 m under the corridor; a gorge crosses under the start
  const GZ = 150, gorgeX = x => 40 * Math.sin(x * 0.0021) + 25 * Math.sin(x * 0.0057 + 1);
  const gorge = (x, z) => { const d = Math.abs(z - GZ - gorgeX(x)), w = 70 + 25 * Math.sin(x * 0.003); return d < w ? -150 * (1 - (d / w) ** 2.4) : 0; };
  const cap = new Map(), CELL = 40; // highest allowed floor per 40 m cell (the corridor above it, minus 25 m)
  for (let i = 0; i < N; i++) { const p = t.pos[i], r = t.w[i] + 40, lim = p.y - t.h[i] - 25;
    for (let x = Math.floor((p.x - r) / CELL); x <= Math.floor((p.x + r) / CELL); x++) for (let z = Math.floor((p.z - r) / CELL); z <= Math.floor((p.z + r) / CELL); z++) { const k = x + ',' + z; cap.set(k, Math.min(cap.get(k) ?? 1e9, lim)); } }
  const floorY = (x, z) => { let y = FLOOR + (fbm2(x * 0.0012, z * 0.0012, 3, 4) - 0.5) * 70 + (ridged2(x * 0.004, z * 0.004, 7, 3) - 0.3) * 12 + gorge(x, z);
    const c = cap.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); return c !== undefined ? Math.min(y, c) : y; };
  { const S = 2400, X0 = minX - S, X1 = maxX + S, Z0 = minZ - S, Z1 = maxZ + S, tiles = 5;
    for (let ti = 0; ti < tiles; ti++) for (let tj = 0; tj < tiles; tj++) {
      const g = new Geo().mat(0.3, 0, 0, 0), xa = X0 + (X1 - X0) * ti / tiles, xb = X0 + (X1 - X0) * (ti + 1) / tiles, za = Z0 + (Z1 - Z0) * tj / tiles, zb = Z0 + (Z1 - Z0) * (tj + 1) / tiles;
      const near = Math.max(0, Math.max(cx - xb, xa - cx, cz - zb, za - cz)), step = near > 2500 ? 120 : 45, nx = Math.ceil((xb - xa) / step), nz = Math.ceil((zb - za) / step), ids = [];
      for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) { const x = xa + (xb - xa) * a / nx, z = za + (zb - za) * b / nz, y = floorY(x, z), e = 6;
        const nn = new Vec3(floorY(x - e, z) - floorY(x + e, z), 2 * e, floorY(x, z - e) - floorY(x, z + e)).normalize();
        ids.push(g.raw(v3(x, y, z), nn, [0.2 + 0.05 * fbm2(x * 0.01, z * 0.01, 5, 2), 0.15, 0.09, 0])); }
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const k = a * (nz + 1) + b; g.quad(ids[k], ids[k + 1], ids[k + nz + 2], ids[k + nz + 1]); }
      const bb = g.bounds(); late.push({ mesh: gfx.mesh(g.build()), prog: 'v10ground', visible: true, uniforms: DAP, bs: { x: bb.c.x, y: bb.c.y, z: bb.c.z, r: bb.r } }); // V11: drawn after the forest (late), so the depth test spares the floor it hides
    } }
  // the river at the bottom of the gorge and streams winding over the floor to its rim, falling in as waterfalls
  const water = new Geo(), falls = [];
  { const g = water; g.M = [0, 1, 0, 0];
    const ribbon = (pts, wid, col, fall) => { let prev = null; for (let k = 0; k < pts.length; k++) { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], d = new Vec3().subVectors(b, a); d.y = 0; d.normalize();
        const s = v3(-d.z, 0, d.x); g.M = [0, d.x, d.z, 0]; const p = pts[k], i0 = g.raw(v3(p.x + s.x * wid, p.y, p.z + s.z * wid), v3(0, 1, 0), [...col, fall]), i1 = g.raw(v3(p.x - s.x * wid, p.y, p.z - s.z * wid), v3(0, 1, 0), [...col, fall]);
        if (prev) g.quad(prev[0], i0, i1, prev[1]); prev = [i0, i1]; } };
    const riv = []; for (let x = minX - 2400; x <= maxX + 2400; x += 40) riv.push(v3(x, floorY(x, GZ + gorgeX(x)) + 2, GZ + gorgeX(x)));
    ribbon(riv, 16, [0.05, 0.16, 0.15], 0);
    for (let k = 0; k < 7; k++) { // streams: from the forest toward the gorge rim, then over the edge
      const x0 = cx - 1800 + k * 620 + R() * 200, side = k % 2 ? 1 : -1, pts = []; let x = x0, z = GZ + gorgeX(x0) + side * 900;
      for (let s = 0; s < 60; s++) { const zz = z - side * s * 14, xx = x + 60 * Math.sin(s * 0.21 + k), gz = GZ + gorgeX(xx), d = Math.abs(zz - gz);
        if (d < 85) { const lip = v3(xx, floorY(xx, zz) + 1, zz); pts.push(lip); falls.push({ p: lip, side, x: xx }); break; } pts.push(v3(xx, floorY(xx, zz) + 1.2, zz)); }
      ribbon(pts, 5 + R() * 3, [0.06, 0.2, 0.18], 0); }
    for (const f of falls) { // the fall: a curtain over the lip down the gorge wall to the river
      const pts = []; for (let s = 0; s <= 12; s++) { const u = s / 12, y = f.p.y - u * (f.p.y - floorY(f.x, GZ + gorgeX(f.x)) - 2), zz = f.p.z - f.side * (8 + 30 * u * u); pts.push(v3(f.x, y, zz)); }
      let prev = null; for (let s = 0; s < pts.length; s++) { const p = pts[s], w = 6 + s * 0.8; const a = g.raw(v3(p.x - w, p.y, p.z), v3(0, 0, -f.side), [0.6, 0.72, 0.75, 1]), b = g.raw(v3(p.x + w, p.y, p.z), v3(0, 0, -f.side), [0.6, 0.72, 0.75, 1]); if (prev) g.quad(prev[0], prev[1], b, a); prev = [a, b]; }
      f.base = pts[pts.length - 1]; }
    items.push({ mesh: gfx.mesh(water.build()), prog: 'v10water', blend: 'normal', layer: 1, visible: true }); }

  // ---------------------------------------------------------------- colossal trees
  // trunk (flared base, buttress fins, tapering shaft), limbs reaching out and up, crowns of huge foliage masses; every
  // piece is checked against the corridor and left out if it would reach into it. Each tree is built twice in the same
  // pass: in full detail (drawn while the camera is within 1.5 km of it) and as a light version for distance; the trees
  // on the horizon only get the light one. Every tree is its own item, so it is culled when out of view.
  const colossi = [], trees = [], sub = (a, s) => a.filter((_, k) => k % s === 0 || k === a.length - 1);
  const colossus = (x, z, r, top, seed, o = {}) => {
    const rr = makeRng(seed), r2 = makeRng(seed * 7 + 3), base = floorY(x, z) - 6, bark = BARK[seed % BARK.length], far = !!o.far;
    const F = far ? null : { wood: new Geo(), leaf: new Geo(), lit: new Geo().mat(0, 0.4, 4, 0) }, Lw = new Geo(), Ll = new Geo(), Lf = new Geo();
    const tube = (pts, rad, segF, segL, col, fungus, tip, step) => { if (F) woodTube(F.wood, pts, rad, segF, col, fungus, tip); woodTube(Lw, sub(pts, step), sub(rad, step), segL, col, fungus, tip); };
    const crown = (c, cr, sd, col, sway) => { if (F) crownCluster(F.leaf, c, cr, sd, col, 18, 2, { sway }); crownCluster(Ll, c, cr, sd, col, 10, 1, { sway, coreDetail: 2 }); crownCluster(Lf, c, cr, sd, col, 5, 1, { sway }); }; // V11: clusters of leaf masses
    // shaft: rings with a slowly wandering radius (a living trunk is never a perfect cylinder)
    const pts = [], rad = []; for (let k = 0; k <= 24; k++) { const u = k / 24, y = base + (top - base) * u; pts.push(v3(x + Math.sin(u * 3 + seed) * r * 0.08, y, z + Math.cos(u * 2.3 + seed) * r * 0.08)); rad.push(r * (1.55 - 0.55 * Math.min(1, u * 4)) * (1 - 0.45 * u) * (1 + 0.05 * Math.sin(u * 17 + seed))); }
    for (let k = 0; k < pts.length; k++) if (!okS(pts[k], rad[k], 6)) return null;
    tube(pts, rad, 28, far ? 12 : 10, [...bark, 0.5], 0.4, true, 3);
    // V11: vines climbing the trunk in long spirals, with leaves (full detail only)
    if (F) for (let vi = 0; vi < 3; vi++) { const a0 = r2() * 6.283, turns = 0.8 + r2() * 1.2, top2 = 0.35 + r2() * 0.3, vp = [], vr = []; let ok = true;
      for (let k = 0; k <= 40; k++) { const u = k / 40, uu = top2 * u, y = base + (top - base) * uu, trR = r * (1.55 - 0.55 * Math.min(1, uu * 4)) * (1 - 0.45 * uu), a = a0 + u * turns * 6.283;
        const p = v3(x + Math.sin(uu * 3 + seed) * r * 0.08 + Math.cos(a) * (trR * 1.07 + 0.8), y, z + Math.cos(uu * 2.3 + seed) * r * 0.08 + Math.sin(a) * (trR * 1.07 + 0.8)); if (!okS(p, 2, 2)) { ok = false; break; } vp.push(p); vr.push(1 - 0.5 * u); }
      if (!ok) continue; woodTube(F.wood, vp, vr, 6, [0.2, 0.25, 0.1, 0.9], 0, true);
      for (let k = 1; k < vp.length; k += 2) { const a = a0 + k / 40 * turns * 6.283, d = v3(Math.cos(a), 0.2 + r2() * 0.5, Math.sin(a)); leaf(F.leaf, vp[k], d, v3(-Math.sin(a), 0, Math.cos(a)), 2.5 + r2() * 2, 1.1 + r2() * 0.6, GREEN[(k + vi) % GREEN.length], 0.9, seed + k * 3 + vi); } }
    // buttress roots: tall fins radiating from the base
    const nf = 6 + Math.floor(rr() * 4);
    for (let f = 0; f < nf; f++) { const a = f / nf * 6.283 + rr() * 0.4, d = v3(Math.cos(a), 0, Math.sin(a)), H = r * (2.2 + rr()), L = r * (1.4 + rr() * 0.8);
      const fp = [], fr = []; for (let k = 0; k <= 6; k++) { const u = k / 6, q = v3(x + d.x * (r * 0.9 + L * u), 0, z + d.z * (r * 0.9 + L * u)); q.y = Math.max(floorY(q.x, q.z) - 4, base + H * (1 - u) ** 1.6 - 4); fp.push(q); fr.push(r * 0.22 * (1 - 0.7 * u) + 1); }
      if (fp.every(p => okS(p, r * 0.25, 5))) tube(fp, fr, 10, 5, [...bark, 0.8], 0.2, true, 2); }
    // limbs and crowns
    const nl = o.limbs ?? 6, crowns = [];
    for (let l = 0; l < nl; l++) {
      const a = l / nl * 6.283 + rr() * 0.6, y0 = base + (top - base) * (o.limbFrom ?? 0.55) + rr() * (top - base) * 0.35, rl = r * (0.28 + rr() * 0.1), L = r * (3 + rr() * 2.5);
      const d = v3(Math.cos(a), 0.35 + rr() * 0.5, Math.sin(a)).normalize(), lp = [], lr = [];
      for (let k = 0; k <= 8; k++) { const u = k / 8, q = v3(x, y0, z).addScaled(d, r * 0.7 + L * u); q.y += L * 0.25 * u * u; lp.push(q); lr.push(rl * (1 - 0.65 * u)); }
      let ok = true; for (let k = 0; k < lp.length; k++) if (!okS(lp[k], lr[k], 6)) { ok = false; break; } if (!ok) continue;
      tube(lp, lr, 14, 6, [...bark, 0.6], 0.3, true, 2);
      if (F) for (let k = 2; k <= 8; k += 2) for (let m = 0; m < 2; m++) { const top0 = lp[k].clone().add(v3((r2() - 0.5) * lr[k], -lr[k] * 0.8, (r2() - 0.5) * lr[k])), len = 8 + r2() * r * 0.45, bot = top0.clone(); bot.y -= len;
        if (okSeg(top0, bot, 2.5, 2)) mossStrand(F.leaf, top0, len, 1.3 + r2() * 1.5, MOSS[(k + m + l) % 3], seed * 3 + l * 7 + k + m * 0.5); } // V11: moss hanging from the limb
      const cc = lp[lp.length - 1].clone(); cc.y += r * 0.6; const cr = r * (1.6 + rr() * 1.2);
      if (okS(cc, cr, 10)) { crown(cc, cr, seed * 7 + l, GREEN[(seed + l) % GREEN.length], 0.15); crowns.push({ c: cc, r: cr }); }
    }
    { const cc = v3(x, top + r * 0.8, z), cr = r * (2.2 + rr()); if (okS(cc, cr, 10)) { crown(cc, cr, seed * 13, GREEN[seed % GREEN.length], 0.1); crowns.push({ c: cc, r: cr }); } }
    // shelf fungi up the trunk (glowing undersides): full detail only
    if (F) for (let k = 0; k < 10; k++) { const u = 0.08 + rr() * 0.5, y = base + (top - base) * u, a = rr() * 6.283, rad0 = r * (1.55 - 0.55 * Math.min(1, u * 4)) * (1 - 0.45 * u), p = v3(x + Math.cos(a) * rad0, y, z + Math.sin(a) * rad0), s = r * (0.25 + rr() * 0.2);
      if (!okS(p, s, 4)) continue; const q = QX(-90), wg = F.wood; // a shelf: a flat disc half in the trunk
      F.lit.at(p.x, p.y - 0.4, p.z, q).lathe([[s * 0.98, 0], [s * 0.7, 0.2], [0.1, 0.3]], 18, [0.25, 0.85, 0.65, 1]);
      wg.M = [0, 0, 1, 0]; wg.at(p.x, p.y, p.z, q).lathe([[0.1, 0.9], [s * 0.85, 0.5], [s, 0.05]], 18, [0.62, 0.5, 0.36, 0.2]);
      if (k % 4 === 0) glowLights.push({ p, c: [0.2, 1.4, 0.9], s: s * 1.5 }); }
    // items: one bounding sphere round the whole tree for culling (and to keep it out of the shadow pass when far)
    const bw = Lw.bounds(), bl = Ll.i.length ? Ll.bounds() : bw, mn = v3(Math.min(bw.min.x, bl.min.x), Math.min(bw.min.y, bl.min.y), Math.min(bw.min.z, bl.min.z)), mx = v3(Math.max(bw.max.x, bl.max.x), Math.max(bw.max.y, bl.max.y), Math.max(bw.max.z, bl.max.z));
    const c = new Vec3().lerpVectors(mn, mx, 0.5), bs = { x: c.x, y: c.y, z: c.z, r: mn.dist(mx) / 2 + 2 };
    const mk = (g, prog, more = {}) => g.i.length ? { mesh: gfx.mesh(g.build()), prog, visible: true, cast: false, bs, uniforms: DAP, ...more } : null;
    const lw = mk(Lw, 'v10bark'), lvls = [F ? [mk(F.wood, 'v10bark'), mk(F.leaf, 'v10leaf', { uniforms: WIND }), mk(F.lit, 'pbrStruct')] : null, [lw, mk(Ll, 'v10leaf', { uniforms: WIND })], [lw, mk(Lf, 'v10leaf', { uniforms: WIND })]].map(l => l && l.filter(Boolean));
    const all = [...new Set(lvls.flat().filter(Boolean))];
    for (const it of all) it.visible = lvls[1].includes(it); items.push(...all); trees.push({ x, z, r, base, top, crowns, lvls, all, lv: 1 });
    // V11: the tree's shadow is cast by its lighter version whatever level is drawn (the full one put tens of thousands of triangles of leaves, vines and moss into the shadow map): items seen by the shadow pass only
    if (!far) for (const it of lvls[1]) items.push({ mesh: it.mesh, prog: 'shadowOnly', visible: true, cast: true, bs });
    colossi.push({ x, z, r, top, base, crowns }); return colossi[colossi.length - 1];
  };
  // three levels by the size on screen of the tree's largest part as seen from the camera (the trunk, or the crown that
  // looks biggest): full detail above 140 px, then lighter crowns above 45 px, then the lightest (the quality preset's
  // LOD bias scales the switches, like every other LOD switch in the game), with a 12% hysteresis band
  const treeLod = fr => { const p = fr.cam.pos, bias = fr.bias, PX = [140, 45];
    for (const tr of trees) { const dv = Math.max(0, tr.base - p.y, p.y - tr.top), dh = Math.max(0, Math.hypot(p.x - tr.x, p.z - tr.z) - tr.r * 1.5);
      let s = tr.r / Math.max(1, Math.hypot(dh, dv)); for (const c of tr.crowns) s = Math.max(s, c.r / Math.max(1, c.c.dist(p) - c.r * 0.5));
      const px = bias > 0 ? 2 * s * fr.k / bias : 1e9;
      let lv = px > PX[0] ? 0 : px > PX[1] ? 1 : 2; if (lv !== tr.lv) { const b = Math.min(lv, tr.lv); if (lv < tr.lv ? px < PX[b] * 1.12 : px > PX[b] * 0.89) lv = tr.lv; }
      if (lv === 0 && !tr.lvls[0]) lv = 1; if (lv === tr.lv) continue; tr.lv = lv; for (const it of tr.all) it.visible = tr.lvls[lv].includes(it); } };
  // the Elder Tree at the heart of the spiral, then the giants that frame each part of the course
  const sp = at('spiral'); let ex = 0, ez = 0; for (const i of sp) { ex += t.pos[i].x; ez += t.pos[i].z; } ex /= sp.length; ez /= sp.length;
  colossus(ex, ez, 78, 1500, 3, { limbs: 9, limbFrom: 0.25 });
  const besideW = (i, side, d) => { const p = t.pos[i], B = t.bin[i], b = v3(B.x, 0, B.z).normalize(); return v3(p.x + b.x * side * d, 0, p.z + b.z * side * d); };
  const giants = [['roots', 0.35, -1, 120, 45, 900], ['roots', 0.8, 1, 110, 40, 800], ['branches', 0.2, 1, 120, 50, 1100], ['branches', 0.6, -1, 140, 55, 1000], ['skylight', 0.5, 1, 130, 48, 1300],
    ['canopy', 0.25, -1, 220, 60, 1600], ['canopy', 0.6, 1, 260, 65, 1800], ['canopy', 0.9, -1, 200, 50, 1400], ['platforms', 0.15, 1, 150, 55, 1200], ['platforms', 0.55, -1, 140, 60, 1300], ['platforms', 0.85, 1, 130, 45, 1000],
    ['slalom', 0.5, 1, 120, 40, 900], ['final', 0.3, -1, 130, 42, 1000], ['start', 0.6, 1, 120, 50, 1200], ['start', 0.25, -1, 140, 46, 1100]];
  giants.forEach(([tag, f, side, d, r, top], k) => { const i = at(tag)[Math.floor(f * at(tag).length)], p = besideW(i, side, t.w[i] + d); colossus(p.x, p.z, r, top, 11 + k * 7, { limbs: 5 + (k % 3) }); });
  // far mega-trees on the horizon, rising through the clouds
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283 + R() * 0.3, d = 3800 + R() * 5000; colossus(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 90 + R() * 70, 1800 + R() * 1400, 200 + k, { limbs: 6, far: true }); }

  // ---------------------------------------------------------------- the canopy: thousands of trees (instanced, LOD)
  // Every tree is placed first, then the instance sets are sized to hold all of them: one population near the course
  // (within 300 m of it in plan: these cast shadows on the course) and one for the rest of the forest (no shadows).
  // A trunk's level of detail follows its width on screen, not its height (its bounding sphere is ~30x its radius).
  const forest = [], R2 = makeRng(t.def.seed * 31 + 7); // R2: the trees' girth, lean and bark shade
  { const REG = 1900, step = 62;
    for (let x = minX - REG; x <= maxX + REG; x += step) for (let z = minZ - REG; z <= maxZ + REG; z += step) {
      const px = x + (R() - 0.5) * step * 0.9, pz = z + (R() - 0.5) * step * 0.9, i = nearI(v3(px, 0, pz)), dxz = Math.hypot(t.pos[i].x - px, t.pos[i].z - pz); if (dxz > REG) continue;
      const fy = floorY(px, pz); let cr = 26 + R() * 16, top = 205 + fbm2(px * 0.002, pz * 0.002, 9, 3) * 90;
      // under a section of the course the crown is lowered until it clears the corridor by 3 m, or left out
      let c = v3(px, top, pz), ok = okS(c, cr, 3); for (let k = 0; k < 6 && !ok; k++) { c.y -= 22; ok = c.y - fy > 60 && okS(c, cr, 3); } if (!ok) continue;
      // the trunk: girth varies from tree to tree, and it leans a little (its top stays under the crown); upright if a
      // leaning trunk would come near the corridor, left out if even an upright one would
      const tr = (2.2 + cr * 0.07) * (0.75 + 0.7 * R2()), lean = R2() * 0.045, la = R2() * 6.283, shade = 0.55 + 0.4 * R2(), topY = c.y - cr * 0.3;
      const clearT = (bx, bz) => { for (const u of [0.25, 0.6, 0.9]) if (!okS(v3(bx + (px - bx) * u, fy + (topY - fy) * u, bz + (pz - bz) * u), tr * 2, 3)) return false; return true; };
      let bx = px - Math.cos(la) * lean * (topY - fy), bz = pz - Math.sin(la) * lean * (topY - fy); if (!clearT(bx, bz)) { bx = px; bz = pz; if (!clearT(px, pz)) continue; }
      const rot = R() * 6.283, bk = BARK[Math.floor(R() * BARK.length)], gk = FOLI[Math.floor(R() * FOLI.length)], v = R() < 0.5 ? 0 : 1, tint = 0.8 + R() * 0.45;
      // a lower crown on a side limb (about half of the trees): foliage at mid height, so the forest has layers
      let mid = null; { const u = 0.42 + 0.3 * R2(), a = R2() * 6.283, r = cr * (0.38 + 0.2 * R2()), y = fy + (topY - fy) * u, off = tr + r * 0.55, mc = v3(bx + (px - bx) * u + Math.cos(a) * off, y, bz + (pz - bz) * u + Math.sin(a) * off);
        if (R2() < 0.55 && y - fy > r + 20 && okS(mc, r, 3)) mid = { c: mc, r, v: R2() < 0.5 ? 0 : 1 }; }
      // V12: the whole trunk is checked, every 4 m from its foot to its top, against the corridor. The three points above
      // let a few trunks (about twenty in the whole forest) stand right through the corridor, where nothing collides
      // with them and ships flew through them. Such a trunk now stands upright if that clears it and is left out
      // otherwise, as that check always meant. Decided after all of the tree's random draws, so every other tree of the
      // forest stays exactly as it was.
      const clearAll = (x0, z0) => { const f0 = floorY(x0, z0) - 3, L = Math.hypot(px - x0, topY - f0, pz - z0), n = Math.ceil(L / 4);
        for (let k = 0; k <= n; k++) { const u = k / n, rr = tr * Math.max(1 - 0.45 * u + (u < 0.1 ? 0.5 * (1 - u / 0.1) : 0), u < 0.06 ? 3.2 * (1 - u / 0.06) : 0);
          if (!okS(v3(x0 + (px - x0) * u, f0 + (topY - f0) * u, z0 + (pz - z0) * u), rr, 1.5)) return false; }
        return true; };
      if (!clearAll(bx, bz)) { if (bx !== px || bz !== pz) { if (!clearAll(px, pz)) continue; bx = px; bz = pz; } else continue; }
      forest.push({ px, pz, bx, bz, fy: floorY(bx, bz), topY, tr, c, cr, rot, bk: bk.map(k => k * shade), gk, v, tint, mid, near: dxz < t.w[i] + 300 });
    } }
  const trunkMesh = [], crownMesh = [[], []], fsets = [];
  for (const [seg, us, det] of [[10, [0, 0.05, 0.1, 0.3, 0.55, 0.8, 1], 2], [6, [0, 0.1, 0.5, 1], 1], [4, [0, 1], 0]]) {
    const g = new Geo(); g.M = [0, 0, 1, 0]; const pts = [], rad = []; for (const u of us) { pts.push(v3(0, u, 0)); rad.push(1 - 0.45 * u + (u < 0.1 ? 0.5 * (1 - u / 0.1) : 0)); }
    woodTube(g, pts, rad, seg, [1, 1, 1, 0.3], 0, false);
    // V11: buttress fins at the foot of the nearer levels: thin plates (their thickness and reach scale with the trunk's
    // girth, their height with its length), so a trunk no longer stands on the floor like a pole
    if (det > 0) for (let f = 0; f < 4; f++) { const a = f / 4 * 6.283 + 0.4 + (f % 2) * 0.3, d = v3(Math.cos(a), 0, Math.sin(a)), e = v3(-d.z, 0, d.x), th = 0.13, n = det > 1 ? 6 : 2, side = [[], []], edge = [];
      g.M = [0, 0, 1, 0];
      for (let k = 0; k <= n; k++) { const tt = k / n, rho = 1 + 2.2 * Math.pow(1 - tt, 1.8), h = 0.052 * tt + 0.004, Q = v3(d.x * 0.95, h, d.z * 0.95), Pp = v3(d.x * rho, h, d.z * rho);
        for (const [si, sg] of [[0, 1], [1, -1]]) side[si].push([g.raw(Q.clone().addScaled(e, sg * th), e.clone().scale(sg), [1, 1, 1, 0.5]), g.raw(Pp.clone().addScaled(e, sg * th * (0.4 + 0.6 * tt)), e.clone().scale(sg), [1, 1, 1, 0.5])]);
        const on = v3(d.x, 0.35, d.z).normalize(); edge.push([g.raw(Pp.clone().addScaled(e, th * (0.4 + 0.6 * tt)), on, [1, 1, 1, 0.6]), g.raw(Pp.clone().addScaled(e, -th * (0.4 + 0.6 * tt)), on, [1, 1, 1, 0.6])]); }
      for (let k = 0; k < n; k++) { const A = side[0][k], B = side[0][k + 1], C = side[1][k], D = side[1][k + 1]; g.quad(A[0], A[1], B[1], B[0]); g.quad(C[0], D[0], D[1], C[1]); g.quad(edge[k][0], edge[k][1], edge[k + 1][1], edge[k + 1][0]); } }
    trunkMesh.push(g.build());
    for (let v = 0; v < 2; v++) { const c = new Geo(); // V11: a cluster of leaf masses (12, 9, 5 by level), the two variants flatter and rounder
      crownCluster(c, v3(0, 0.05, 0), 0.92, 5 + v * 9, [1, 1, 1], det === 2 ? 12 : det === 1 ? 9 : 5, det === 2 ? 2 : det === 1 ? 1 : 0, { squash: v ? 0.7 : 0.58, sway: 0.25, coreDetail: det === 2 ? 2 : det === 1 ? 1 : 0 });
      crownMesh[v].push(c.build()); }
  }
  for (let v = 0; v < 2; v++) { const c = new Geo(); blob(c, v3(0, 0, 0), 0.95, 77 + v, [1, 1, 1], { detail: 0, squash: 0.62, sway: 0.25 }); crownMesh[v].push(c.build()); } // the farthest: one lump
  const limbMesh = [8, 5, 3].map(seg => { const g = new Geo(); woodTube(g, seg > 3 ? [v3(0, 0, 0), v3(0, 0, 0.5), v3(0, 0, 1)] : [v3(0, 0, 0), v3(0, 0, 1)], seg > 3 ? [1, 0.72, 0.45] : [1, 0.45], seg, [1, 1, 1, 0.5], 0, false); return g.build(); }); // V11: a limb, unit length along +Z (the farthest level a straight three-sided stick)
  const nearShadows = set => { for (let l = 2; l < set.items.length; l++) set.items[l].cast = false; return set; }; // only the two nearest levels of a set cast shadows: the others are beyond the reach of the shadow map
  const crownSet = (v, k, cast, cullPx = 1.2) => new NearFirst(gfx, [{ mesh: gfx.mesh(crownMesh[v][0], k), px: 160 }, { mesh: gfx.mesh(crownMesh[v][1], k), px: 60 }, { mesh: gfx.mesh(crownMesh[v][2], k), px: 24 }, { mesh: gfx.mesh(crownMesh[v][3], k), px: 0 }], k, { prog: 'v10leaf', cast, cullPx });
  { const m = mat4.create(), q = new Quat(), qt = new Quat();
    for (const nearSet of [true, false]) {
      const list = forest.filter(f => f.near === nearSet), n = Math.max(1, list.length), cast = nearSet;
      const trunks = new NearFirst(gfx, [{ mesh: gfx.mesh(trunkMesh[0], n), px: 700 }, { mesh: gfx.mesh(trunkMesh[1], n), px: 160 }, { mesh: gfx.mesh(trunkMesh[2], n), px: 0 }], n, { prog: 'v10barkTree', cast, cullPx: 10 }); nearShadows(trunks);
      const crownsI = [0, 1].map(v => nearShadows(crownSet(v, Math.max(1, list.filter(f => f.v === v).length + list.filter(f => f.mid && f.mid.v === v).length), cast)));
      for (const f of list) {
        const d = v3(f.px - f.bx, f.topY - f.fy, f.pz - f.bz), L = d.len(); d.scale(1 / L);
        q.setAxisAngle(0, 1, 0, f.rot); const ax = Math.hypot(d.z, d.x); if (ax > 1e-6) { qt.setAxisAngle(d.z / ax, 0, -d.x / ax, Math.acos(Math.min(1, d.y))); q.premultiply(qt); }
        mat4.compose(m, v3(f.bx, f.fy - 3, f.bz), q, f.tr, L + 3, f.tr); trunks.add(m, (f.bx + f.px) / 2, (f.fy + f.topY) / 2, (f.bz + f.pz) / 2, L / 2 + f.tr, f.bk[0], f.bk[1], f.bk[2]);
        q.setAxisAngle(0, 1, 0, f.rot); mat4.compose(m, f.c, q, f.cr, f.cr, f.cr); crownsI[f.v].add(m, f.c.x, f.c.y, f.c.z, f.cr * 1.2, f.gk[0] * f.tint, f.gk[1] * f.tint, f.gk[2] * f.tint);
        if (f.mid) { const M = f.mid, k = f.tint * 0.85; q.setAxisAngle(0, 1, 0, f.rot + 2); mat4.compose(m, M.c, q, M.r, M.r, M.r); crownsI[M.v].add(m, M.c.x, M.c.y, M.c.z, M.r * 1.2, f.gk[0] * k, f.gk[1] * k, f.gk[2] * k); } }
      // V11: limbs: one carries each lower crown out from its trunk (it no longer floats beside it), two more reach up
      // into the top crown from below
      const limbs = [];
      for (const f of list) { const axisAt = y => { const u = (y - f.fy) / Math.max(1, f.topY - f.fy); return v3(f.bx + (f.px - f.bx) * u, y, f.bz + (f.pz - f.bz) * u); };
        if (f.mid) { const M = f.mid; limbs.push([axisAt(M.c.y - M.r * 0.45), v3(M.c.x, M.c.y - M.r * 0.3, M.c.z), f.tr * 0.42, f.bk]); }
        const nb = 1 + Math.floor((f.rot * 7.31) % 1 * 3); for (let k = 0; k < nb; k++) { const h1 = (f.rot * 3.7 + k * 0.618) % 1, an = f.rot + k * 2.4 + 0.8 + h1, y0 = f.c.y - f.cr * (0.7 + 0.35 * h1), reach = f.cr * (0.35 + 0.35 * ((h1 * 5.3) % 1));
          limbs.push([axisAt(y0), v3(f.c.x + Math.cos(an) * reach, f.c.y - f.cr * (0.1 + 0.2 * h1), f.c.z + Math.sin(an) * reach), f.tr * (0.3 + 0.12 * h1), f.bk]); } }
      const okL = nearSet ? limbs.filter(([a, b, r]) => okSeg(a, b, r * 1.5, 2)) : limbs, nL = Math.max(1, okL.length);
      const limbSet = new NearFirst(gfx, [{ mesh: gfx.mesh(limbMesh[0], nL), px: 120 }, { mesh: gfx.mesh(limbMesh[1], nL), px: 25 }, { mesh: gfx.mesh(limbMesh[2], nL), px: 0 }], nL, { prog: 'v10barkTree', cast, cullPx: 5 }); nearShadows(limbSet);
      for (const [a, b, r, bk] of okL) { const d = new Vec3().subVectors(b, a), L = d.len(); mat4.compose(m, a, qDir(d), r, r, L); limbSet.add(m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, L / 2 + r, bk[0], bk[1], bk[2]); }
      for (const it of limbSet.items) it.uniforms = DAP; fsets.push(limbSet); items.push(...limbSet.items);
      for (const it of trunks.items) it.uniforms = DAP; for (const it of [...crownsI[0].items, ...crownsI[1].items]) it.uniforms = WIND;
      fsets.push(trunks, ...crownsI); items.push(...trunks.items, ...crownsI[0].items, ...crownsI[1].items);
    } }
  // the understory on the forest floor near the course: broadleaf thickets (the crown shapes, smaller) and tree ferns
  // (a fibrous stem with a crown of arching fronds); some in the forest's alien colours. No shadows: they stand 60 m and
  // more below the course.
  { const ALIEN = [[0.07, 0.3, 0.27], [0.3, 0.11, 0.25], [0.34, 0.3, 0.06], [0.06, 0.22, 0.2]], U = makeRng(t.def.seed * 41 + 3), REG = 750, step = 36;
    const shrubs = [[], []], ferns = [];
    for (let x = minX - REG; x <= maxX + REG; x += step) for (let z = minZ - REG; z <= maxZ + REG; z += step) {
      const px = x + (U() - 0.5) * step * 0.9, pz = z + (U() - 0.5) * step * 0.9, kind = U(), sz = U(), hue = U(), tint = 0.75 + U() * 0.5, rot = U() * 6.283;
      const i = nearI(v3(px, 0, pz)); if (Math.hypot(t.pos[i].x - px, t.pos[i].z - pz) > REG) continue;
      const fy = floorY(px, pz), col = (hue < 0.22 ? ALIEN[Math.floor(hue / 0.055)] : GREEN[Math.floor(hue * 97) % GREEN.length]).map(k => k * tint);
      if (kind < 0.45) { const r = 7 + sz * 9, c = v3(px, fy + r * 0.3, pz); if (okS(c, r, 2)) shrubs[kind < 0.22 ? 0 : 1].push({ c, r, rot, col }); }
      else if (kind < 0.8) { const s = 22 + sz * 22; if (okS(v3(px, fy + s * 0.8, pz), s * 0.6, 2)) ferns.push({ p: v3(px, fy - 1, pz), s, rot, col }); }
    }
    const m = mat4.create(), q = new Quat();
    for (const v of [0, 1]) { const list = shrubs[v], set = crownSet(v, Math.max(1, list.length), false, 3);
      for (const f of list) { q.setAxisAngle(0, 1, 0, f.rot); mat4.compose(m, f.c, q, f.r, f.r * 0.9, f.r); set.add(m, f.c.x, f.c.y, f.c.z, f.r * 1.2, f.col[0], f.col[1], f.col[2]); }
      for (const it of set.items) it.uniforms = WIND; fsets.push(set); items.push(...set.items); }
    // tree fern meshes, unit size (uniformly scaled): stem 1 tall, fronds 0.55 long arching from its top
    const fern = (fronds, rows, stemSeg) => { const g = new Geo();
      if (stemSeg) { g.M = [0.2, 0, 0, 0]; const pts = [v3(0, 0, 0), v3(0.01, 0.5, 0), v3(0, 1, 0)]; woodTube(g, pts, [0.035, 0.026, 0.02], stemSeg, [0.55, 0.45, 0.3, 0], 0, false); g.M = [0.85, 0, 0, 0]; }
      for (let k = 0; k < fronds; k++) { const a = k / fronds * 6.283 + (k % 2) * 0.3, up = 0.32 + 0.12 * (k % 3), D = v3(Math.cos(a), 0, Math.sin(a)), S = v3(-Math.sin(a), 0, Math.cos(a)), len = 0.5 + 0.08 * ((k * 7) % 3), wid = 0.09, rowsP = [];
        g.M = [0.85, (k * 0.137) % 1, 0, 0];
        for (let j = 0; j <= rows; j++) { const u = j / rows, w = Math.sin(Math.PI * Math.min(1, u * 1.05)) * wid * (1 - 0.3 * u), c = v3(0, 1, 0).addScaled(D, len * u).add(v3(0, len * (up * u - 0.85 * u * u), 0));
          const nn = v3(0, 1, 0).addScaled(D, -0.4 + 0.8 * u).normalize(), row = [];
          for (const sd of (rows > 2 ? [-1, 0, 1] : [-1, 1])) row.push(g.raw(c.clone().addScaled(S, sd * w).add(v3(0, sd ? -w * 0.25 : 0, 0)), nn, [1, 1, 1, Math.min(1, u * 1.3)]));
          rowsP.push(row); }
        for (let j = 0; j < rows; j++) for (let s = 0; s < rowsP[j].length - 1; s++) g.quad(rowsP[j][s], rowsP[j][s + 1], rowsP[j + 1][s + 1], rowsP[j + 1][s]); }
      return g.build(); };
    const nf = Math.max(1, ferns.length), fset = new NearFirst(gfx, [{ mesh: gfx.mesh(fern(11, 6, 6), nf), px: 140 }, { mesh: gfx.mesh(fern(8, 3, 4), nf), px: 40 }, { mesh: gfx.mesh(fern(6, 2, 0), nf), px: 0 }], nf, { prog: 'v10leaf', cast: false, cullPx: 3 });
    for (const f of ferns) { q.setAxisAngle(0, 1, 0, f.rot); mat4.compose(m, f.p, q, f.s, f.s, f.s); fset.add(m, f.p.x, f.p.y + f.s * 0.7, f.p.z, f.s * 0.75, f.col[0], f.col[1], f.col[2]); }
    for (const it of fset.items) it.uniforms = WIND; fsets.push(fset); items.push(...fset.items); }
  // V11: on the forest floor near the course, giant mushrooms glowing under their caps and fallen trunks gone to moss
  { const MU = makeRng(t.def.seed * 97 + 1), CAPC = [[0.36, 0.16, 0.44], [0.1, 0.38, 0.4], [0.55, 0.34, 0.12], [0.46, 0.12, 0.1]], GLOW = [[0.75, 0.3, 1, 1], [0.3, 1, 0.9, 1], [1, 0.75, 0.3, 1], [1, 0.4, 0.3, 1]];
    for (let k = 0, tries = 0; k < 46 && tries < 400; tries++) { const i = Math.floor(MU() * N), s2 = MU() < 0.5 ? -1 : 1, d = t.w[i] + 40 + MU() * 600, B = t.bin[i], p = t.pos[i], x = p.x + B.x * s2 * d, z = p.z + B.z * s2 * d, y = floorY(x, z);
      const H = 14 + MU() * 30, rc = H * (0.38 + MU() * 0.2), kind = Math.floor(MU() * 4); if (!okS(v3(x, y + H, z), rc * 1.1, 4) || !okSeg(v3(x, y, z), v3(x, y + H, z), H * 0.08, 3)) continue;
      const g = woodD(i), cnt = 1 + Math.floor(MU() * 3);
      for (let m = 0; m < cnt; m++) { const sc = m ? 0.45 + MU() * 0.3 : 1, ox = m ? (MU() - 0.5) * rc * 2.2 : 0, oz = m ? (MU() - 0.5) * rc * 2.2 : 0, h = H * sc, r = rc * sc, bx = x + ox, bz = z + oz, by = floorY(bx, bz) - 2;
        woodTube(g, [v3(bx, by, bz), v3(bx + r * 0.08, by + h * 0.5, bz), v3(bx, by + h, bz)], [r * 0.2, r * 0.13, r * 0.11], 10, [0.72, 0.68, 0.58, 0.1], 0.5, false);
        g.M = [0.85, 0, 1, 0]; g.at(bx, by + h, bz, QX(-90)).lathe([[r, -r * 0.12], [r * 0.92, r * 0.18], [r * 0.6, r * 0.42], [0.2, r * 0.52]], 20, [...CAPC[kind], 0.2]);
        lit.at(bx, by + h - r * 0.08, bz, QX(-90)).lathe([[r * 0.95, 0], [r * 0.15, r * 0.06]], 20, GLOW[kind]); glowLights.push({ p: v3(bx, by + h - r * 0.2, bz), c: GLOW[kind].slice(0, 3).map(c2 => c2 * 1.4), s: r * 1.6 }); }
      k++; }
    for (let k = 0, tries = 0; k < 36 && tries < 300; tries++) { const i = Math.floor(MU() * N), s2 = MU() < 0.5 ? -1 : 1, d = t.w[i] + 30 + MU() * 500, B = t.bin[i], p = t.pos[i], x = p.x + B.x * s2 * d, z = p.z + B.z * s2 * d, a = MU() * 6.283, L2 = 30 + MU() * 60, r = 2 + MU() * 3.5;
      const A = v3(x - Math.cos(a) * L2 / 2, 0, z - Math.sin(a) * L2 / 2), Bp = v3(x + Math.cos(a) * L2 / 2, 0, z + Math.sin(a) * L2 / 2); A.y = floorY(A.x, A.z) + r * 0.6; Bp.y = floorY(Bp.x, Bp.z) + r * 0.6;
      if (!okSeg(A, Bp, r, 3)) continue; const pts = [A, new Vec3().lerpVectors(A, Bp, 0.5).add(v3(0, r * 0.3, 0)), Bp];
      woodTube(woodD(i), pts, [r, r * 0.9, r * 0.75], 10, [...BARK[k % BARK.length].map(c2 => c2 * 0.8), 1], 0.35, false); k++; } }

  // the canopy beyond: crowns seen from above as a textured surface out to the mountains (only far from the course)
  { const g = new Geo().mat(0, 0, 0, 0), S0 = 1500, S1 = 14000, rings = 18, seg = 96, rows = [];
    for (let j = 0; j <= rings; j++) { const rr = S0 * Math.pow(S1 / S0, j / rings), row = [];
      for (let k = 0; k <= seg; k++) { const a = k / seg * 6.283, x = cx + Math.cos(a) * rr * 1.25, z = cz + Math.sin(a) * rr, y = 240 + (fbm2(x * 0.0008, z * 0.0008, 13, 3) - 0.5) * 80 + Math.max(0, rr - 9000) * 0.03;
        row.push(g.raw(v3(x, y, z), v3(0, 1, 0), [0.12, 0.3, 0.09, 1])); } rows.push(row); }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) g.quad(rows[j][k], rows[j + 1][k], rows[j + 1][k + 1], rows[j][k + 1]);
    late.push({ mesh: gfx.mesh(g.build()), prog: 'v10ground', visible: true, uniforms: DAP }); }
  // mountains clad in forest on the horizon, mist in their valleys
  { const g = new Geo().mat(0, 0, 0, 0), rows = [], seg = 160;
    for (let j = 0; j <= 10; j++) { const u = j / 10, row = []; for (let k = 0; k <= seg; k++) { const a = k / seg * 6.283, rr = 11000 + u * 9000, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const hgt = 250 + ridged2(Math.cos(a) * 3 + 7, Math.sin(a) * 3 + u * 1.5, 5, 5) * 2100 * Math.sin(Math.PI * Math.min(1, u * 1.3)) * (0.55 + 0.45 * Math.sin(a * 3 + 1));
        row.push(g.raw(v3(x, hgt, z), v3(0, 1, 0), [0.1, 0.25, 0.08, 1])); } rows.push(row); }
    for (let j = 0; j < 10; j++) for (let k = 0; k < seg; k++) g.quad(rows[j][k], rows[j + 1][k], rows[j + 1][k + 1], rows[j][k + 1]);
    const B = g.build(); // normals from the surface
    for (let k = 0; k < B.idx.length; k += 3) { const ia = B.idx[k] * 3, ib = B.idx[k + 1] * 3, ic = B.idx[k + 2] * 3, A = v3(B.pos[ia], B.pos[ia + 1], B.pos[ia + 2]), Bv = v3(B.pos[ib], B.pos[ib + 1], B.pos[ib + 2]), C = v3(B.pos[ic], B.pos[ic + 1], B.pos[ic + 2]);
      const n = new Vec3().crossVectors(new Vec3().subVectors(C, A), new Vec3().subVectors(Bv, A)); if (n.y < 0) n.scale(-1); for (const ii of [ia, ib, ic]) { B.nor[ii] += n.x; B.nor[ii + 1] += n.y; B.nor[ii + 2] += n.z; } }
    for (let k = 0; k < B.nor.length; k += 3) { const l = Math.hypot(B.nor[k], B.nor[k + 1], B.nor[k + 2]) || 1; B.nor[k] /= l; B.nor[k + 1] /= l; B.nor[k + 2] /= l; }
    late.push({ mesh: gfx.mesh(B), prog: 'v10ground', visible: true, uniforms: DAP }); }

  // ---------------------------------------------------------------- the obstacles as wood: exactly on their collision
  const hosts = [];
  for (const w of t.wood) {
    const i = w.pts.length ? nearI(w.pts[w.pts.length >> 1]) : 0, g = woodG(i), root = w.kind === 'root';
    woodTube(g, w.pts, w.rad, w.rad[0] > 2.6 ? 16 : 12, [...BARK[w.group % BARK.length].map(c => c * (root ? 0.85 : 1)), root ? 0.9 : 0.4], w.kind === 'limb' ? 0.55 : 0.75, !root);
    // a branch grows out of a tree: a trunk where its far end leaves the corridor (unless the Elder Tree is there)
    if (w.kind === 'branch') for (const end of [w.pts[0], w.pts[w.pts.length - 1]]) { const r = Math.max(4, w.rad[0] * 2.2); if (Math.hypot(end.x - ex, end.z - ez) < 130) continue;
      let ok = true; for (let y = FLOOR; y < end.y + 120; y += 20) if (!okS(v3(end.x, y, end.z), r, 3)) { ok = false; break; } if (ok) hosts.push({ p: end, r }); }
    // moss and a few leaves hanging from branches outside the corridor
    if (!root) for (let k = 1; k < w.pts.length - 1; k += 2) { const p = w.pts[k]; if (!okS(p, 6, 2)) continue; const lg = leafD(i);
      for (let m = 0; m < 3; m++) { const d = v3(R() - 0.5, -0.6 - R() * 0.4, R() - 0.5); leaf(lg, p.clone().addScaled(d, w.rad[k]), d, v3(R() - 0.5, 0, R() - 0.5).addScaled(d, 0).add(v3(0.01, 0, 0)), 4 + R() * 3, 1.4 + R() * 0.8, GREEN[(k + m) % GREEN.length], 0.9, k * 7 + m); } }
  }
  for (const h of hosts) { const g = woodG(nearI(h.p)), pts = [], rad = []; for (let k = 0; k <= 10; k++) { const u = k / 10, y = floorY(h.p.x, h.p.z) - 4 + (h.p.y + 140 - floorY(h.p.x, h.p.z)) * u; pts.push(v3(h.p.x + Math.sin(u * 4 + h.r) * 1.5, y, h.p.z + Math.cos(u * 3) * 1.5)); rad.push(h.r * (1.35 - 0.5 * u)); }
    woodTube(g, pts, rad, 16, [...BARK[Math.floor(h.r) % BARK.length], 0.6], 0.3, false);
    const c = v3(h.p.x, h.p.y + 150, h.p.z), cr = 30 + h.r * 2; if (okS(c, cr, 5)) crownCluster(leafG(nearI(h.p)), c, cr, h.r * 31, GREEN[Math.floor(h.r * 3) % GREEN.length], 12, 1, { sway: 0.2, coreDetail: 2 }); }
  // trunks, aerial roots, emergents and lianas standing through the corridor (vbeam obstacles): straight along the
  // corridor's up axis inside it, free outside
  for (const o of t.obstacles) {
    if (o.type !== 'vbeam') continue;
    const i = o.i, Nn = t.nrm[i], c = P(t, i, o.x, 0), g = woodG(i), h = t.h[i];
    const lo = c.clone().addScaled(Nn, -h - 6), hi = c.clone().addScaled(Nn, h + 6), pts = [], rad = [];
    if (o.kind === 'liana') { // a thick vine from a branch far above, hanging on below the corridor
      for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push(new Vec3().lerpVectors(c.clone().addScaled(Nn, -h - 60), c.clone().addScaled(Nn, h + 90), u).add(v3(u < 0.2 || u > 0.8 ? Math.sin(u * 9) * 2 : 0, 0, 0))); rad.push(o.r); }
      woodTube(g, pts, rad, 10, [0.2, 0.26, 0.1, 0.9], 0.1, false); continue; }
    const fy = floorY(c.x, c.z), topY = o.kind === 'emergent' ? c.y + 180 : o.kind === 'aerial' ? hi.y + 40 : Math.max(hi.y + 60, 230);
    pts.push(v3(lo.x, fy - 4, lo.z)); rad.push(o.r * (o.kind === 'aerial' ? 1.3 : 1.8)); pts.push(lo); rad.push(o.r); pts.push(hi); rad.push(o.r); pts.push(v3(hi.x, topY, hi.z)); rad.push(o.r * 0.7);
    woodTube(g, pts, rad, o.r > 3 ? 16 : 12, [...BARK[i % BARK.length], o.kind === 'aerial' ? 0.9 : 0.5], 0.7, false);
    if (o.kind !== 'aerial') { const cc = v3(hi.x, topY + 20, hi.z), cr = o.kind === 'emergent' ? 70 : 45; if (okS(cc, cr, 5)) crownCluster(o.kind === 'emergent' ? bigLeaf : leafG(i), cc, cr, i, GREEN[i % GREEN.length], 12, 1, { sway: 0.15, coreDetail: 2 }); }
  }

  // ---------------------------------------------------------------- life near the course: lianas, giant flowers, ferns
  const flowers = [], FL = makeRng(t.def.seed * 89 + 7); // V11: the flowers' new parts draw from their own sequence
  for (let i = 0; i < N; i += 3) {
    const sec = [...t.tags].find(([, v]) => v[0] <= i && v[v.length - 1] >= i), tag = sec ? sec[0] : '';
    if (tag === 'canopy') continue;
    const q = fq(t, i), w = t.w[i], h = t.h[i];
    // hanging lianas just outside the corridor walls
    if (R() < 0.45) { const s = R() < 0.5 ? -1 : 1, top = P(t, i, s * (w + 3 + R() * 25), h + 40 + R() * 60), len = 60 + R() * 140, pts = [], rad = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push(top.clone().add(v3(Math.sin(u * 3 + i) * 3, -len * u, Math.cos(u * 2 + i) * 3))); rad.push(0.5 + R() * 0.3); }
      if (pts.every(p => okS(p, 1, 1.5))) { woodTube(woodD(i), pts, rad, 6, [0.22, 0.27, 0.11, 1], 0, true); for (let k = 2; k < 7; k += 2) leaf(leafD(i), pts[k], v3(R() - 0.5, -1, R() - 0.5), v3(1, 0, 0), 3 + R() * 2, 1.2, GREEN[k % GREEN.length], 0.9, i + k); } }
    // a giant flower or a fern on the wood beside the corridor
    if (i % 9 === 0 && R() < 0.6) { const s = R() < 0.5 ? -1 : 1, p = P(t, i, s * (w + 8 + R() * 18), (R() - 0.5) * h * 1.6), r = 4 + R() * 5; if (!okS(p, r * 1.3, 2)) continue;
      const kind = R(), up = v3(t.nrm[i].x, t.nrm[i].y, t.nrm[i].z).addScaled(t.bin[i], -s * 0.6).normalize();
      if (kind < 0.55) { const petals = 5 + Math.floor(R() * 3), hue = [[0.95, 0.25, 0.55], [1, 0.55, 0.15], [0.7, 0.3, 1], [1, 0.85, 0.3]][Math.floor(R() * 4)];
        for (let k = 0; k < petals; k++) { const a = k / petals * 6.283, side = v3(Math.cos(a), 0, Math.sin(a)); const d = side.clone().addScaled(up, 0.6).normalize(); leaf(leafD(i), p, d, up, r, r * 0.45, hue, 0.95, i + k); }
        // V11: an inner ring of paler petals standing up, a cup at the heart and stamens with glowing tips
        for (let k = 0; k < petals; k++) { const a = (k + 0.5) / petals * 6.283, d = v3(Math.cos(a), 0, Math.sin(a)).addScaled(up, 1.6).normalize(); leaf(leafD(i), p, d, up, r * 0.62, r * 0.3, hue.map(c => Math.min(1, c * 0.6 + 0.4)), 0.95, i * 2 + k); }
        { const cupG = woodD(i); cupG.M = [0, up.x, up.y, up.z]; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + FL() * 0.4, sd = v3(Math.cos(a), 0, Math.sin(a)), tip = p.clone().addScaled(up, r * (0.45 + FL() * 0.2)).addScaled(sd, r * 0.18);
            woodTube(cupG, [p.clone().addScaled(up, r * 0.05), tip], [r * 0.025, r * 0.015], 4, [0.85, 0.8, 0.45, 0], 0, false); lit.at(tip.x, tip.y, tip.z).box(r * 0.07, r * 0.07, r * 0.07, [1, 0.92, 0.55, 1]); } }
        lit.at(p.x, p.y, p.z).box(r * 0.3, r * 0.3, r * 0.3, [1, 0.95, 0.5, 1]); flowers.push({ p, c: hue, s: r * 1.2 }); }
      else for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + R(), d = v3(Math.cos(a), 0.7, Math.sin(a)).normalize(); leaf(leafD(i), p, d, v3(-Math.sin(a), 0, Math.cos(a)), r * 1.6, r * 0.35, GREEN[(i + k) % GREEN.length], 0.85, i * 3 + k); } }
  }

  // ---------------------------------------------------------------- soft vegetation in the corridor: curtains of vines
  // and the leaf roof of the canopy. Thin and leafy so it reads as soft; it never collides and bursts as ships pass.
  const softFx = [];
  for (const s of t.soft) {
    const i = s.i, g = leafD(i), q = fq(t, i);
    if (s.kind === 'vines') for (let k = 0; k < 26; k++) { const x = s.x0 + (s.x1 - s.x0) * (k + R() * 0.8) / 26, len = (s.y1 - s.y0) * (0.4 + R() * 0.6), a = P(t, i + Math.round((R() - 0.5) * 2), x, t.h[i] + 20), b = P(t, i, x, s.y1 - len);
      woodTube(woodD(i), [a, b], [0.18, 0.12], 4, [0.25, 0.32, 0.12, 1], 0, true); for (let m = 0; m < 4; m++) { const p = new Vec3().lerpVectors(a, b, 0.4 + m * 0.18); leaf(g, p, v3(R() - 0.5, -1, R() - 0.5), t.bin[i], 1.8 + R(), 0.8, GREEN[(k + m) % GREEN.length], 0.9, k * 5 + m); } }
    else for (let k = 0; k < 380; k++) { const x = s.x0 + (s.x1 - s.x0) * R(), y = s.y0 + (s.y1 - s.y0) * R(), p = P(t, i + Math.round((R() - 0.5) * 2), x, y);
      leaf(g, p, v3(R() - 0.5, R() - 0.5, R() - 0.5).add(v3(0, 0.01, 0)), v3(R() - 0.5, R() - 0.5, R() - 0.5).add(v3(0.01, 0, 0)), 1.6 + R() * 1.4, 0.7 + R() * 0.4, GREEN[k % GREEN.length], 0.9, k); }
    softFx.push({ s, done: new Set() });
    void q;
  }

  // ---------------------------------------------------------------- the floating platforms under the corridor
  { const DECK = [0.42, 0.33, 0.24], FUN = [0.62, 0.52, 0.4];
    for (const pl of t.platforms) {
      const g = woodG(pl.i0), n = Math.max(1, Math.round((pl.i1 - pl.i0) / 2));
      for (let k = 0; k <= n; k++) {
        const i = t.wrapIdx(pl.i0 + Math.round((pl.i1 - pl.i0) * k / n)), j = t.wrapIdx(i + 2), q = fq(t, i), W = pl.kind === 'bridge' ? 9 : t.w[i] + 10, y = -t.h[i] - 2.2;
        const a = P(t, i, 0, y), b = P(t, j, 0, y), m = new Vec3().lerpVectors(a, b, 0.5);
        g.M = [-1, t.tan[i].x, t.tan[i].y, t.tan[i].z]; g.at(m.x, m.y, m.z, q).box(W * 2, 2.4, a.dist(b) + 0.3, [...(pl.kind === 'bridge' ? DECK.map(c => c * 0.85) : DECK), 0.15]); // V11: planks across the deck
        if (pl.kind !== 'bridge' && k % 2 === 0) { for (const s of [-1, 1]) { const rp = P(t, i, s * (W - 1), y + 3); g.at(rp.x, rp.y, rp.z, q).box(0.6, 4.5, 0.6, [...DECK, 0.3]); } }
        if (pl.kind === 'bridge') for (const s of [-1, 1]) { const ra = P(t, i, s * 9, y + 4), rb = P(t, j, s * 9, y + 4); woodTube(g, [ra, rb], [0.25, 0.25], 4, [0.3, 0.3, 0.15, 1], 0, false); }
        if (k % 4 === 0) for (const s of [-1, 1]) { const lp = P(t, i, s * (W + 0.5), y + 5); lit.at(lp.x, lp.y, lp.z).box(0.9, 1.4, 0.9, [1, 0.75, 0.35, 1]); glowLights.push({ p: lp, c: [2.2, 1.4, 0.5], s: 3 }); }
      }
      // a shelf of fungus under every deck and cables up to the branches far above
      if (pl.kind === 'deck') { const i = t.wrapIdx((pl.i0 + pl.i1) >> 1), c = P(t, i, 0, -t.h[i] - 9), r = t.w[i] + 22;
        g.M = [0, 0, 1, 0]; g.at(c.x, c.y, c.z, fq(t, i).multiply(QX(-90))).lathe([[0.5, -6], [r * 0.6, -4], [r, 0.5], [r * 0.95, 2.2], [0.5, 2]], 32, [...FUN, 0.2], 1, 0.7); // the shelf's axis is the deck's up
        for (const s of [-1, 1]) for (const e of [pl.i0, pl.i1]) { const a = P(t, e, s * (t.w[e] + 9), -t.h[e] - 1), b = a.clone(); b.y += 260; if (okSeg(a, b, 0.6, 1)) woodTube(g, [a, b], [0.35, 0.3], 5, [0.25, 0.28, 0.12, 1], 0, false); } }
    }
  }

  // ---------------------------------------------------------------- the start: a colossal limb under the grid
  { const ids = at('start'), a = P(t, ids[0] - 10, 0, -t.h[ids[0]] - 24), b = P(t, ids[ids.length - 1] + 8, 0, -t.h[ids[0]] - 24), pts = [], rad = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new Vec3().lerpVectors(a, b, u).add(v3(0, -4 * Math.sin(Math.PI * u), 0))); rad.push(20 - 4 * u); }
    woodTube(woodG(ids[30]), pts, rad, 28, [...BARK[1], 0.15], 0.3, true); }

  // ---------------------------------------------------------------- light shafts through the canopy and mist
  const shafts = new Geo(), L = v3(0.36, 0.78, 0.52).normalize();
  for (let k = 0; k < 46; k++) { const i = Math.floor(R() * N), sec = [...t.tags].find(([, v]) => v[0] <= i && v[v.length - 1] >= i); if (sec && sec[0] === 'canopy') continue;
    const s = R() < 0.5 ? -1 : 1, foot = P(t, i, s * (t.w[i] * (0.2 + R() * 1.6)), -t.h[i] * 0.8), r = 5 + R() * 14, len = 260 + R() * 160, top = foot.clone().addScaled(L, len);
    const g = shafts, rows = []; for (const [p, al] of [[top, 0], [foot, 1]]) { const row = []; for (let m = 0; m <= 12; m++) { const an = m / 12 * 6.283, B = new Vec3().crossVectors(L, v3(0, 0, 1)).normalize(), C = new Vec3().crossVectors(L, B), d = B.clone().scale(Math.cos(an)).addScaled(C, Math.sin(an));
      row.push(g.raw(p.clone().addScaled(d, r * (al ? 1.3 : 0.8)), d, [1, 0.92, 0.65, al])); } rows.push(row); }
    for (let m = 0; m < 12; m++) g.quad(rows[0][m], rows[1][m], rows[1][m + 1], rows[0][m + 1]); }
  const shaftItem = { mesh: gfx.mesh(shafts.build()), prog: 'v10shaft', blend: 'add', layer: 2, visible: true, uniforms: { uShaftI: 0.16 } }; items.push(shaftItem);
  const mist = []; for (let k = 0; k < 420; k++) { const x = minX - 1500 + R() * (maxX - minX + 3000), z = minZ - 1500 + R() * (maxZ - minZ + 3000), f = floorY(x, z), y = f + 20 + R() * R() * 240;
    const p = v3(x, y, z), s = 90 + R() * 160; if (!okS(p, s * 0.25, 0)) continue; mist.push({ p, s, rot: R() * 9, sd: [R() * 9, R() * 9, R()] }); }
  for (const f of falls) for (let k = 0; k < 4; k++) mist.push({ p: f.base.clone().add(v3((R() - 0.5) * 40, 10 + k * 18, (R() - 0.5) * 40)), s: 60 + R() * 50, rot: R() * 9, sd: [R() * 9, R() * 9, R()], fall: true });
  for (const c of colossi) if (c.top > 1500) for (let k = 0; k < 5; k++) { const a = R() * 6.283; mist.push({ p: v3(c.x + Math.cos(a) * c.r * 3, 750 + R() * 300, c.z + Math.sin(a) * c.r * 3), s: 300 + R() * 300, rot: R() * 9, sd: [R() * 9, R() * 9, R()], cloud: true }); }

  // ---------------------------------------------------------------- the course kit
  const hex = hexField(gfx, t, () => true, [0.35, 1, 0.55]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), rg = routeGuides(gfx, t, { colL: [1, 0.78, 0.3], colR: [0.45, 1, 0.55] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...rg.items);
  items.push(...ch.items(gfx, 'wood', { prog: 'v10bark', cast: true, maxDist: 5000, uniforms: DAP }), ...ch.items(gfx, 'leaf', { prog: 'v10leaf', cast: true, maxDist: 4000, uniforms: WIND }));
  items.push(...chD.items(gfx, 'woodd', { prog: 'v10bark', cast: true, maxDist: 1600, uniforms: DAP }), ...chD.items(gfx, 'leafd', { prog: 'v10leaf', cast: true, maxDist: 1600, uniforms: WIND }));
  if (bigLeaf.i.length) { const b = bigLeaf.bounds(); items.push({ mesh: gfx.mesh(bigLeaf.build()), prog: 'v10leaf', visible: true, cast: true, uniforms: WIND, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r } }); }
  if (lit.i.length) items.push({ mesh: gfx.mesh(lit.build()), visible: true, prog: 'pbrStruct' });

  items.push(...late); // the floor, the far canopy and the mountains after everything that can hide them
  const env = { sunDir: L.clone(), sunCol: [2.9, 2.6, 2.05], fogCol: [0.13, 0.19, 0.17], fog: 0.00042, fogH: [-120, 330], sky: 'atmo', zen: [0.05, 0.12, 0.2], hor: [0.42, 0.52, 0.5],
    dirt: 0.3, streak: 0.4, flare: 0.55, envInt: 1.05, expo: 1.08, shafts: 0.85, reverb: 'open',
    nebA: [0.2, 0.4, 0.3], nebB: [0.3, 0.5, 0.4], nebC: [0.8, 1, 0.9], base: [0.02, 0.03, 0.025], neb: 0, seed: 4.7, sat: 1.08, lift: [0.004, 0.012, 0.006], gain: [1.0, 1.03, 0.96],
    planet: { dir: v3(-0.55, 0.38, -0.74), dist: 30000, r: 8000, type: 1, bands: 11, tilt: 20, bright: 0.45, ringTilt: -12, a: [0.75, 0.68, 0.5], b: [0.5, 0.42, 0.32], c: [0.92, 0.88, 0.75], atmo: [0.7, 0.8, 1], ring: [0.8, 0.75, 0.62], ring2: [0.55, 0.52, 0.45] } };
  items.push(...planetItems(gfx, env, t.def.seed));

  // ---------------------------------------------------------------- the forest's parts, named on the first lap
  const notes = [['roots', 'The Root Passage'], ['branches', 'The Branch Network'], ['canopy', 'The Canopy Run'], ['platforms', 'The Floating Platforms'], ['descent', 'The Deep Forest Descent']].map(([tag, text]) => ({ i: at(tag)[0], text }));
  let lastTi = -1; const notice = me => { if (!me || me.wrecked || me.lap > 1) return null; const ti = me.ti, prev = lastTi; lastTi = ti; if (prev < 0 || ti === prev) return null;
    for (const n of notes) if (n.i > prev && n.i <= ti && ti - prev < 40) return { text: n.text, style: '', dur: 1.8 }; return null; };

  // ---------------------------------------------------------------- per frame
  const fr = new Frustum(); let moteT = 0, leafT = 0;
  const spores = []; for (let k = 0; k < 180; k++) spores.push({ o: v3((R() - 0.5) * 160, (R() - 0.5) * 70, (R() - 0.5) * 160), ph: R() * 6.28, c: R() < 0.3 ? [0.4, 1.6, 1] : [1.4, 1.3, 0.6] });
  release(ch, chD, bigLeaf, lit, water, shafts); // every mesh is made: the vertex lists go (v11kit)
  return { items, env, notice, cull(cam) { fr.set(cam, gfx); for (const s of fsets) s.update(fr); treeLod(fr); },
    hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); rg.update(fx, cam, race, time);
      const c = cam.pos;
      // mist between the trees and clouds round the giants: soft haze sprites, nearest first
      { const Rr = 2600 * (gfx.cfg.hazeDist ?? 1), hcap = gfx.cfg.hazeCap ?? 120; let nh = 0;
        for (const m of mist) { const d = m.p.dist(c); if (d > Rr || nh >= hcap) continue; const a = (m.cloud ? 0.5 : m.fall ? 0.35 : 0.22) * Math.min(1, (Rr - d) / (Rr * 0.3)) * Math.min(1, d / (m.s * 0.6));
          if (a < 0.01) continue; nh++; const k = m.cloud ? 0.9 : 0.55; fx.bbHaze.add(m.p.x, m.p.y, m.p.z, m.s, 0.19 * k + 0.05, 0.25 * k + 0.06, 0.23 * k + 0.05, a, m.rot, m.sd[0], m.sd[1], m.sd[2]); } }
      // drifting spores and pollen around the camera, a few fireflies near the floor
      for (const s of spores) { const p = v3(c.x + ((s.o.x + time * 2 + 80) % 160 + 160) % 160 - 80, c.y + s.o.y + Math.sin(time * 0.7 + s.ph) * 3, c.z + ((s.o.z + time * 1.3 + 80) % 160 + 160) % 160 - 80);
        fx.bbAdd.add(p.x, p.y, p.z, 0.35, s.c[0], s.c[1], s.c[2], 0.5 + 0.5 * Math.sin(time * 3 + s.ph)); }
      // falling leaves
      if ((leafT -= dt) < 0) { leafT = 0.06; const p = v3(c.x + (Math.random() - 0.5) * 120, c.y + 30 + Math.random() * 30, c.z + (Math.random() - 0.5) * 120);
        fx.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 3, -2.5, (Math.random() - 0.5) * 3, 6, 0.6, 0.7, 0.25, 0.4, 0.1, 0.9, false, 0.4); }
      // waterfalls: spray where they hit the river
      if ((moteT -= dt) < 0) { moteT = 0.08; for (const f of falls) if (f.base.dist(c) < 3000) fx.spawn(f.base.x + (Math.random() - 0.5) * 20, f.base.y + 4, f.base.z + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 6, 8 + Math.random() * 8, (Math.random() - 0.5) * 6, 2.5, 6, 30, 0.7, 0.78, 0.8, 0.35, false, 0.4); }
      // glowing fungi and lanterns, flower hearts
      for (const l of glowLights) { const d = l.p.dist(c); if (d > 1500) continue; fx.bbAdd.add(l.p.x, l.p.y, l.p.z, l.s, l.c[0], l.c[1], l.c[2], 0.8 + 0.2 * Math.sin(time * 2 + l.p.x)); }
      for (const f of flowers) { if (f.p.dist(c) > 1200) continue; fx.bbAdd.add(f.p.x, f.p.y, f.p.z, f.s, f.c[0] * 1.5, f.c[1] * 1.5, f.c[2] * 1.5, 0.55 + 0.25 * Math.sin(time * 1.5 + f.p.z)); }
      // soft vegetation bursts into leaves where a ship flies through it
      if (race) for (const sf of softFx) { const s = sf.s; for (const r of race.racers) { if (r.wrecked || Math.abs(t.deltaS(r.s, s.i * t.D)) > 4 || r.ly < s.y0 || r.ly > s.y1) continue; const key = r.id * 1000 + (r.lap || 0); if (sf.done.has(key)) continue; sf.done.add(key);
        const p = r.ship.pos, v = r.ship.vel; if (p.dist(c) > 400) continue; for (let k = 0; k < 26; k++) fx.spawn(p.x, p.y, p.z, v.x * 0.25 + (Math.random() - 0.5) * 30, v.y * 0.25 + (Math.random() - 0.5) * 20, v.z * 0.25 + (Math.random() - 0.5) * 30, 2.2, 0.9, 1.2, 0.2, 0.42, 0.1, 1, false, 0.6, 0, 3); } }
    } };
}
const WIND = { uWindL: [1.1, 0, 0, 0], uDapple: [0.8, 235, 0.011, 0.5] }; // V11: the foliage also takes the canopy's dappled light
