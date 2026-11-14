// V11: Verdant Canopy draws its instanced trees nearest first (class NearFirst in src/render/courses/canopy.js), so that
// the depth test spares the shading of what nearer trees hide. The order is made by sorting numbers in a typed array
// (the squared distance as float bits above, the instance number below) instead of calling a comparator for every
// pair. This check feeds the game's class and a reference with the comparator sort the same random populations and
// cameras, frame after frame (the level-of-detail hysteresis carries over from frame to frame), and compares every
// level's instance buffer and count byte for byte. It also times both on a forest-sized population.
// usage: node tests/v11-nearfirst.mjs
import { InstanceSet, VIS } from '../src/render/lod.js';
import { NearFirst } from '../src/render/courses/canopy.js';
import { makeRng } from '../src/math.js';

// the reference: InstanceSet's culling and levels, the visible instances ordered by a comparator on their distances
class Reference extends InstanceSet {
  update(fr) {
    const L = this.levels, nl = L.length, s = this.s, lv = this.lv, c = fr.cam.pos; VIS.sets++; VIS.inst += this.n;
    const vis = this.vis || (this.vis = []), dk = this.dk || (this.dk = new Float32Array(this.cap)); vis.length = 0;
    for (let k = 0; k < this.n; k++) {
      const x = s[k * 4], y = s[k * 4 + 1], z = s[k * 4 + 2], r = s[k * 4 + 3]; this.oc[k] = 0;
      if (!fr.sphere(x, y, z, r)) { lv[k] = -1; VIS.frustum++; continue; }
      const px = fr.px(x, y, z, r); if (px * Math.max(1, fr.bias) < this.cullPx) { lv[k] = -1; VIS.small++; continue; }
      if (this.occ && !this.occ.visible(x, y, z, r)) { VIS.occluded++; this.oc[k] = 1; continue; }
      let l = 0; while (l < nl - 1 && px < L[l].px) l++;
      const prev = lv[k]; if (prev >= 0 && prev !== l) { if (l < prev ? px < L[l].px * 1.12 : px > L[prev].px * 0.89) l = prev; }
      lv[k] = l; dk[k] = (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2; vis.push(k); VIS.drawn++; VIS.levels[Math.min(3, l)]++;
    }
    vis.sort((a, b) => dk[a] - dk[b]);
    const cnt = new Array(nl).fill(0), m = this.m;
    for (const k of vis) { const l = lv[k], md = L[l].mesh.data, o = cnt[l]++ * 20, so = k * 20; for (let i = 0; i < 20; i++) md[o + i] = m[so + i]; }
    for (let l = 0; l < nl; l++) { this.gfx.uploadInstances(L[l].mesh, cnt[l]); this.items[l].visible = cnt[l] > 0; }
  }
}

const gfx = { uploadInstances(m, n) { m.n = n; } };
const levels = cap => [160, 60, 0].map(px => ({ mesh: { data: new Float32Array(cap * 20), n: 0 }, px }));
// a view volume like lod.js's Frustum, without the renderer: a cone in front of the camera, sizes in pixels by distance
const view = (pos, fwd, bias) => ({ cam: { pos }, bias, k: 700,
  sphere(x, y, z, r) { const dx = x - pos.x, dy = y - pos.y, dz = z - pos.z, f = dx * fwd.x + dy * fwd.y + dz * fwd.z; return f > -r && f * f > 0.3 * (dx * dx + dy * dy + dz * dz) - r * r; },
  px(x, y, z, r) { const d = Math.max(1, Math.hypot(x - pos.x, y - pos.y, z - pos.z)); return 2 * r * this.k / (d * this.bias); } });
const fill = (set, n, rng, span, grid) => { const m = new Float32Array(16);
  for (let k = 0; k < n; k++) { for (let i = 0; i < 16; i++) m[i] = rng();
    // grid > 0: positions snapped to a grid, so that many instances are exactly as far from the camera as others (ties)
    let x = (rng() - 0.5) * span, y = (rng() - 0.5) * span * 0.2, z = (rng() - 0.5) * span; if (grid) { x = Math.round(x / grid) * grid; y = Math.round(y / grid) * grid; z = Math.round(z / grid) * grid; }
    set.add(m, x, y, z, 2 + rng() * 30, rng(), rng(), rng(), 1); } };

let bad = 0, frames = 0, drawn = 0, ties = 0;
for (let trial = 0; trial < 60; trial++) {
  const rng = makeRng(1000 + trial), n = trial < 4 ? [0, 1, 2, 3][trial] : 50 + Math.floor(rng() * 4000), cap = n + 3, grid = trial % 3 === 0 ? 40 : 0;
  const A = new NearFirst(gfx, levels(cap), cap, { cullPx: 1.2 }), B = new Reference(gfx, levels(cap), cap, { cullPx: 1.2 });
  const r1 = makeRng(77 + trial), r2 = makeRng(77 + trial); fill(A, n, r1, 3000, grid); fill(B, n, r2, 3000, grid);
  let p = { x: 0, y: 0, z: 0 };
  for (let f = 0; f < 40; f++) {
    // the camera wanders (small steps keep the hysteresis busy), now and then it jumps; on the grid it sits on grid points
    if (f % 13 === 0) p = { x: (rng() - 0.5) * 2000, y: (rng() - 0.5) * 100, z: (rng() - 0.5) * 2000 }; else p = { x: p.x + (rng() - 0.5) * 30, y: p.y + (rng() - 0.5) * 4, z: p.z + (rng() - 0.5) * 30 };
    if (grid && f % 2 === 0) p = { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid, z: Math.round(p.z / grid) * grid };
    const a = rng() * 6.283, fwd = { x: Math.cos(a), y: (rng() - 0.5) * 0.4, z: Math.sin(a) }, l = Math.hypot(fwd.x, fwd.y, fwd.z); fwd.x /= l; fwd.y /= l; fwd.z /= l;
    const bias = [1, 1, 1.6, 0.7][f % 4]; A.update(view(p, fwd, bias)); B.update(view(p, fwd, bias)); frames++;
    for (let l2 = 0; l2 < 3; l2++) { const ma = A.levels[l2].mesh, mb = B.levels[l2].mesh; drawn += mb.n;
      let same = ma.n === mb.n && A.items[l2].visible === B.items[l2].visible; if (same) for (let i = 0; i < mb.n * 20; i++) if (ma.data[i] !== mb.data[i]) { same = false; break; }
      if (!same) { if (bad < 5) console.log(`DIFFERS  trial ${trial} (${n} instances${grid ? ', on a grid' : ''}), frame ${f}, level ${l2}: ${ma.n} / ${mb.n} instances`); bad++; } }
    if (B.dk) { const seen = new Set(); for (const k of B.vis) { if (seen.has(B.dk[k])) ties++; else seen.add(B.dk[k]); } }
    for (let k = 0; k < n; k++) if (A.lv[k] !== B.lv[k]) { if (bad < 5) console.log(`DIFFERS  trial ${trial}, frame ${f}: the level of instance ${k}`); bad++; break; }
  }
}
console.log(`${frames} frames of 60 random populations: ${drawn.toLocaleString('en')} instances drawn, ${ties.toLocaleString('en')} of them exactly as far from the camera as another one`);
console.log(bad ? `${bad} DIFFERENCES between NearFirst and the comparator sort` : 'every level buffer, count and level is identical to the comparator sort');

// timing on a forest-sized population: Verdant Canopy orders about 9,000 visible instances a frame, in 11 sets
{ const sets = 11, n = 820, mk = C => { const out = []; for (let k = 0; k < sets; k++) { const set = new C(gfx, levels(n), n, { cullPx: 0 }); fill(set, n, makeRng(9 + k), 3000, 0); out.push(set); } return out; };
  const all = (pos, bias) => ({ cam: { pos }, bias, k: 700, sphere: () => true, px(x, y, z, r) { const d = Math.max(1, Math.hypot(x - pos.x, y - pos.y, z - pos.z)); return 2 * r * this.k / (d * this.bias); } });
  const time = group => { const ts = []; for (let f = 0; f < 240; f++) { const v = all({ x: Math.sin(f * 0.05) * 400, y: 10, z: f * 3 }, 1), t0 = performance.now(); for (const set of group) set.update(v); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return ts[ts.length >> 1]; };
  const A = mk(NearFirst), B = mk(Reference), C = mk(InstanceSet); time(A); time(B); time(C); const r = [time(C), time(A), time(B), time(C), time(A), time(B)].map(x => x.toFixed(2));
  console.log(`a frame's update of ${sets} sets with ${(sets * n).toLocaleString('en')} visible instances, median of 240 frames, measured twice: no ordering (InstanceSet) ${r[0]} and ${r[3]} ms, NearFirst ${r[1]} and ${r[4]} ms, the comparator sort ${r[2]} and ${r[5]} ms`); }
process.exit(bad ? 1 : 0);
