// Level of detail and visibility for big scenes. Every LOD switch is decided by how many pixels an object covers,
// not by raw distance, so the thresholds hold at any resolution and field of view. gfx.lodBias scales every
// decision (test hook: 0 = always the most detailed level, large values = always the simplest).
import { mat4 } from '../math.js';

// pixels covered per metre of size at one metre of distance, for the current camera and render height
export const pxScale = (gfx, cam) => gfx.h * 0.5 / Math.tan((cam.fov || 60) * Math.PI / 360);
export function projPx(gfx, cam, pos, size) {
  const d = Math.max(1, Math.hypot(pos.x - cam.pos.x, pos.y - cam.pos.y, pos.z - cam.pos.z));
  return gfx.lodBias > 0 ? size * pxScale(gfx, cam) / (d * gfx.lodBias) : 1e9;
}
// Two items of one object (full and lite) drawn with complementary dither patterns while the projected size is
// inside [lo, hi] px, so the change between levels is a short cross-fade rather than a pop.
export function lodPair(full, lite, size, lo, hi) {
  full.prog = lite.prog = 'pbrFade'; lite.fadeInv = true;
  return { full, lite, update(gfx, cam) {
    const f = Math.min(1, Math.max(0, (projPx(gfx, cam, full.pos, size) - lo) / (hi - lo)));
    full.fade = lite.fade = f; full.visible = f > 0; lite.visible = f < 1;
  } };
}

// Per-frame view volume of a camera (the same projection the renderer uses), with the pixel scale for LOD
export class Frustum {
  constructor() { this.pl = new Float32Array(24); this.pr = mat4.create(); this.vw = mat4.create(); this.vp = mat4.create(); this.k = 1; this.cam = null; this.bias = 1; }
  set(cam, gfx) {
    const m = this.vp, p = this.pl; this.cam = cam; this.bias = gfx.lodBias;
    mat4.perspective(this.pr, cam.fov * Math.PI / 180, gfx.w / gfx.h, cam.near || 0.5, cam.far || 60000); mat4.view(this.vw, cam.pos, cam.fwd, cam.up); mat4.multiply(m, this.pr, this.vw);
    const set = (k, a, b, c, d) => { const l = Math.hypot(a, b, c); p[k] = a / l; p[k + 1] = b / l; p[k + 2] = c / l; p[k + 3] = d / l; };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
    this.k = pxScale(gfx, cam); return this;
  }
  sphere(x, y, z, r) { const p = this.pl; for (let k = 0; k < 24; k += 4) if (p[k] * x + p[k + 1] * y + p[k + 2] * z + p[k + 3] < -r) return false; return true; }
  // projected diameter in pixels of a sphere of radius r at (x, y, z)
  px(x, y, z, r) { if (!(this.bias > 0)) return 1e9; const c = this.cam.pos, d = Math.max(1, Math.hypot(x - c.x, y - c.y, z - c.z)); return 2 * r * this.k / (d * this.bias); }
}

// Running totals of what the visibility system did this frame (read by the benchmark and the tests)
export const VIS = { sets: 0, inst: 0, drawn: 0, frustum: 0, occluded: 0, small: 0, levels: [0, 0, 0, 0], reset() { this.sets = this.inst = this.drawn = this.frustum = this.occluded = this.small = 0; this.levels.fill(0); } };

// An instanced population with frustum culling, optional occlusion culling, small-object culling and screen-size
// LOD. levels: [{ mesh, px }] from the most detailed down; an instance takes the first level whose px it exceeds
// (the last level takes anything above cullPx). Switches have a 12% hysteresis band so nothing flickers between
// levels, and instances are compacted into each level's buffer every frame.
export class InstanceSet {
  constructor(gfx, levels, cap, o = {}) {
    this.gfx = gfx; this.levels = levels; this.cap = cap; this.n = 0; this.cullPx = o.cullPx ?? 0.75; this.occ = o.occlusion || null;
    this.m = new Float32Array(cap * 20); this.s = new Float32Array(cap * 4); this.lv = new Int8Array(cap).fill(-1); this.oc = new Uint8Array(cap); // oc: hidden by occlusion last frame (for the tests)
    this.items = levels.map(l => ({ mesh: l.mesh, visible: true, rim: o.rim, cast: o.cast, prog: o.prog }));
  }
  add(mat, x, y, z, r, cr = 1, cg = 1, cb = 1, ca = 1) {
    if (this.n >= this.cap) return -1; const k = this.n++, o = k * 20; this.m.set(mat, o); this.m[o + 16] = cr; this.m[o + 17] = cg; this.m[o + 18] = cb; this.m[o + 19] = ca;
    this.s[k * 4] = x; this.s[k * 4 + 1] = y; this.s[k * 4 + 2] = z; this.s[k * 4 + 3] = r; return k;
  }
  update(fr) {
    const L = this.levels, nl = L.length, cnt = new Array(nl).fill(0), s = this.s, lv = this.lv; VIS.sets++; VIS.inst += this.n;
    for (let k = 0; k < this.n; k++) {
      const x = s[k * 4], y = s[k * 4 + 1], z = s[k * 4 + 2], r = s[k * 4 + 3]; this.oc[k] = 0;
      if (!fr.sphere(x, y, z, r)) { lv[k] = -1; VIS.frustum++; continue; }
      const px = fr.px(x, y, z, r); if (px * Math.max(1, fr.bias) < this.cullPx) { lv[k] = -1; VIS.small++; continue; } // size culling ignores the LOD bias
      if (this.occ && !this.occ.visible(x, y, z, r)) { VIS.occluded++; this.oc[k] = 1; continue; } // keeps its level: occlusion is not a size change
      let l = 0; while (l < nl - 1 && px < L[l].px) l++;
      const prev = lv[k]; if (prev >= 0 && prev !== l) { if (l < prev ? px < L[l].px * 1.12 : px > L[prev].px * 0.89) l = prev; }
      lv[k] = l; const md = L[l].mesh.data, o = cnt[l]++ * 20, so = k * 20, m = this.m; for (let i = 0; i < 20; i++) md[o + i] = m[so + i]; VIS.drawn++; VIS.levels[Math.min(3, l)]++;
    }
    for (let l = 0; l < nl; l++) { this.gfx.uploadInstances(L[l].mesh, cnt[l]); this.items[l].visible = cnt[l] > 0; }
  }
}

// Conservative software occlusion. The nearest big solid volumes (inner boxes that are certainly solid) are
// rasterised into a small depth grid at their farthest depth, covering only cells that lie wholly inside their
// silhouette; an instance is hidden only when every cell its bounding sphere could touch holds a nearer occluder.
export class Occlusion {
  constructor(W = 128, H = 72) {
    this.W = W; this.H = H; this.mips = []; let w = W, h = H;
    while (w >= 1 && h >= 1) { this.mips.push({ w, h, d: new Float32Array(w * h) }); if (w === 1 && h === 1) break; w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2)); }
    this.cand = []; this.used = 0; this.on = true; this.pts = new Float32Array(16); this.hull = []; this.usedList = [];
  }
  begin(cam, gfx) {
    const f = cam.fwd, u0 = cam.up; this.cam = cam; this.near = Math.max(1, cam.near || 0.5);
    let rx = f.y * u0.z - f.z * u0.y, ry = f.z * u0.x - f.x * u0.z, rz = f.x * u0.y - f.y * u0.x; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    this.R = [rx, ry, rz]; this.U = [ry * f.z - rz * f.y, rz * f.x - rx * f.z, rx * f.y - ry * f.x]; this.F = [f.x, f.y, f.z];
    this.ty = Math.tan(cam.fov * Math.PI / 360); this.tx = this.ty * gfx.w / gfx.h; this.mips[0].d.fill(Infinity); this.cand.length = 0; this.used = 0; this.usedList.length = 0;
  }
  // world point -> [buffer x, buffer y, view depth]
  proj(x, y, z, out, o) {
    const c = this.cam.pos, dx = x - c.x, dy = y - c.y, dz = z - c.z, R = this.R, U = this.U, F = this.F;
    const vz = dx * F[0] + dy * F[1] + dz * F[2]; out[o + 2] = vz; if (vz < this.near) return false;
    out[o] = ((dx * R[0] + dy * R[1] + dz * R[2]) / (vz * this.tx) * 0.5 + 0.5) * this.W; out[o + 1] = (0.5 - (dx * U[0] + dy * U[1] + dz * U[2]) / (vz * this.ty) * 0.5) * this.H; return true;
  }
  // candidate occluder: 8 world-space corners (24 floats) and a priority (bigger is better)
  offer(corners, prio, ref = null) { this.cand.push({ c: corners, prio, ref }); }
  rasterize(maxN = 48) {
    this.cand.sort((a, b) => b.prio - a.prio); const P = new Float32Array(24), d0 = this.mips[0].d, W = this.W, H = this.H;
    for (let q = 0; q < this.cand.length && this.used < maxN; q++) {
      const c = this.cand[q].c; let ok = true, zmax = 0;
      for (let i = 0; i < 8 && ok; i++) { ok = this.proj(c[i * 3], c[i * 3 + 1], c[i * 3 + 2], P, i * 3); zmax = Math.max(zmax, P[i * 3 + 2]); }
      if (!ok) continue; const hull = convexHull(P); if (hull.length < 3) continue; this.used++; this.usedList.push(this.cand[q].ref || c);
      let y0 = Infinity, y1 = -Infinity; for (const [, y] of hull) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let row = Math.max(0, Math.floor(y0)); row < Math.min(H, Math.ceil(y1)); row++) {
        const a = span(hull, row), b = span(hull, row + 1); if (!a || !b) continue;
        const xl = Math.ceil(Math.max(a[0], b[0])), xr = Math.floor(Math.min(a[1], b[1])); // cells wholly inside: both their top and bottom edges
        for (let x = Math.max(0, xl); x < Math.min(W, xr); x++) { const i = row * W + x; if (zmax < d0[i]) d0[i] = zmax; }
      }
    }
    for (let l = 1; l < this.mips.length; l++) { const A = this.mips[l - 1], B = this.mips[l];
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { let m = 0;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const xx = Math.min(A.w - 1, x * 2 + i), yy = Math.min(A.h - 1, y * 2 + j); m = Math.max(m, A.d[yy * A.w + xx]); }
        B.d[y * B.w + x] = m; } }
  }
  visible(x, y, z, r) {
    if (!this.on || !this.used) return true; const c = this.cam.pos, F = this.F, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const vz = dx * F[0] + dy * F[1] + dz * F[2], zn = vz - r; if (zn < this.near * 2) return true;
    // screen bounds of the sphere's bounding cube: x/z and y/z are monotonic in each coordinate, so the extremes sit at
    // the cube's corners (nearest and farthest depth); this stays conservative far off-axis, where r/z alone does not
    const R = this.R, U = this.U, cx = dx * R[0] + dy * R[1] + dz * R[2], cy = dx * U[0] + dy * U[1] + dz * U[2], zf = vz + r;
    const nx0 = Math.min((cx - r) / zn, (cx - r) / zf) / this.tx, nx1 = Math.max((cx + r) / zn, (cx + r) / zf) / this.tx;
    const ny0 = Math.min((cy - r) / zn, (cy - r) / zf) / this.ty, ny1 = Math.max((cy + r) / zn, (cy + r) / zf) / this.ty;
    let x0 = (nx0 * 0.5 + 0.5) * this.W, x1 = (nx1 * 0.5 + 0.5) * this.W, y0 = (0.5 - ny1 * 0.5) * this.H, y1 = (0.5 - ny0 * 0.5) * this.H;
    if (x1 < 0 || y1 < 0 || x0 > this.W || y0 > this.H) return true; // off the grid: leave it to the frustum test
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(this.W - 1, Math.floor(x1)); y1 = Math.min(this.H - 1, Math.floor(y1));
    let l = 0; while (l < this.mips.length - 1 && ((x1 >> l) - (x0 >> l) > 3 || (y1 >> l) - (y0 >> l) > 3)) l++;
    const M = this.mips[l]; for (let yy = y0 >> l; yy <= Math.min(M.h - 1, y1 >> l); yy++) for (let xx = x0 >> l; xx <= Math.min(M.w - 1, x1 >> l); xx++) if (M.d[yy * M.w + xx] > zn) return true;
    return false;
  }
}
// convex hull (monotone chain) of 8 projected points [x, y, z]* -> [[x, y], ...] counter-clockwise
function convexHull(P) {
  const pts = []; for (let i = 0; i < 8; i++) pts.push([P[i * 3], P[i * 3 + 1]]); pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
// x-interval of a convex polygon on the horizontal line y (null when the line misses it)
function span(h, y) {
  let a = Infinity, b = -Infinity;
  for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length];
    if ((p[1] <= y && q[1] >= y) || (q[1] <= y && p[1] >= y)) { const t = q[1] === p[1] ? 0 : (y - p[1]) / (q[1] - p[1]), x = p[0] + (q[0] - p[0]) * t;
      if (q[1] === p[1]) { a = Math.min(a, p[0], q[0]); b = Math.max(b, p[0], q[0]); } else { a = Math.min(a, x); b = Math.max(b, x); } } }
  return a <= b ? [a, b] : null;
}
