// Geometry builder: primitives placed with a transform. Per vertex: colour (rgb + emissive mask in alpha)
// and material (metalness, roughness, emissive strength, detail shader id).
import { Vec3, Quat } from '../math.js';

const tv = new Vec3(), tn = new Vec3();
export const Q = (ax, ay, az, deg) => new Quat().setAxisAngle(ax, ay, az, deg * Math.PI / 180);
export const QX = d => Q(1, 0, 0, d);
export const QY = d => Q(0, 1, 0, d);
export const QZ = d => Q(0, 0, 1, d);
export const DET = { none: 0, hull: 1, glass: 2, rock: 3, struct: 4, facade: 5, capital: 15, container: 16, interior: 25 }; // interior: 25..29 encodes baked openness (sun and sky reach)

// small deterministic value noise for geometry displacement
function h3(x, y, z, s) { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return v - Math.floor(v); }
export function vnoise(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz, s), h3(ix + 1, iy, iz, s), u), L(h3(ix, iy + 1, iz, s), h3(ix + 1, iy + 1, iz, s), u), v),
    L(L(h3(ix, iy, iz + 1, s), h3(ix + 1, iy, iz + 1, s), u), L(h3(ix, iy + 1, iz + 1, s), h3(ix + 1, iy + 1, iz + 1, s), u), v), w);
}
export const fbm3 = (x, y, z, s = 0, o = 4) => { let a = 0.5, t = 0, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, z * f, s + i * 7); f *= 2.03; a *= 0.5; } return t; };
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ONE3 = [1, 1, 1], cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rngOf = seed => { let a = (Math.floor(Math.abs(seed) * 1000003) ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// corners of the convex polytope { x : n.x <= d for every plane }
function polyVerts(planes) {
  const V = [], n = planes.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = planes[i], b = planes[j], c = planes[k], bc = cross3(b.n, c.n), den = dot3(a.n, bc); if (Math.abs(den) < 1e-9) continue;
    const ca = cross3(c.n, a.n), ab = cross3(a.n, b.n), x = [0, 1, 2].map(q => (a.d * bc[q] + b.d * ca[q] + c.d * ab[q]) / den);
    let ok = true; for (let m = 0; m < n; m++) { const p = planes[m]; if (dot3(p.n, x) > p.d + 1e-9) { ok = false; break; } }
    if (ok && !V.some(v => Math.abs(v[0] - x[0]) + Math.abs(v[1] - x[1]) + Math.abs(v[2] - x[2]) < 1e-7)) V.push(x);
  }
  return V;
}
// fracture planes for one rock (cached: every level of detail shares them): jittered, randomly rotated Fibonacci
// directions so the faces cover the whole body, plane distances in [dMin, dMax], corners beyond hi chipped off
const POLY = new Map();
export function polytopeFor(seed, opt, lo, hi) {
  const key = [seed, opt.planes, opt.dMin, opt.dMax, opt.dPow, opt.chipK, opt.chipD, lo, hi, opt.fresh, opt.craters, opt.craterSize, opt.spread, JSON.stringify(opt.extra || 0)].join('|');
  let P = POLY.get(key); if (P) return P;
  const rnd = rngOf(seed * 7.13 + 1), n = opt.planes ?? 14, dMin = opt.dMin ?? lo, dMax = opt.dMax ?? Math.min(hi * 0.985, 1), dPow = opt.dPow ?? 1;
  const ax = norm3([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), q = new Quat().setAxisAngle(ax[0], ax[1], ax[2], rnd() * 6.283), t = new Vec3(), planes = [];
  for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), th = i * 2.399963 + (rnd() - 0.5) * (opt.spread ?? 0.9), jt = 0.35;
    t.set(Math.cos(th) * rr + (rnd() - 0.5) * jt, y + (rnd() - 0.5) * jt, Math.sin(th) * rr + (rnd() - 0.5) * jt).normalize().applyQuat(q).normalize();
    planes.push({ n: [t.x, t.y, t.z], d: dMin + Math.pow(rnd(), dPow) * (dMax - dMin), fresh: rnd() < (opt.fresh ?? 0.3) }); }
  for (const e of opt.extra || []) planes.push({ n: norm3(e), d: e[3], fresh: true });
  let verts = polyVerts(planes);
  for (let it = 0; it < 6; it++) { let added = 0;
    for (const v of verts) { const L = Math.hypot(v[0], v[1], v[2]); if (L <= hi * (opt.chipK ?? 1.6)) continue; const u = [v[0] / L, v[1] / L, v[2] / L]; /* only spikes are chipped; ordinary corners are rounded onto the hi sphere later */
      if (planes.some(p => p.chip && dot3(p.n, u) > 0.99)) continue; planes.push({ n: u, d: hi * (opt.chipD ?? 1.15), fresh: false, chip: true }); added++; }
    if (!added) break; verts = polyVerts(planes); }
  const faces = [];
  for (const p of planes) { const ids = []; verts.forEach((v, k) => { if (Math.abs(dot3(p.n, v) - p.d) < 1e-6) ids.push(k); }); if (ids.length < 3) continue;
    const c = [0, 0, 0]; for (const k of ids) for (let a = 0; a < 3; a++) c[a] += verts[k][a] / ids.length;
    const u = norm3(cross3(Math.abs(p.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], p.n)), w = cross3(p.n, u), ang = k => { const d = [verts[k][0] - c[0], verts[k][1] - c[1], verts[k][2] - c[2]]; return Math.atan2(dot3(d, w), dot3(d, u)); };
    ids.sort((a, b) => ang(a) - ang(b)); faces.push({ ids, n: p.n, fresh: p.fresh }); }
  const craters = []; for (let k = 0; k < (opt.craters || 0); k++) { const z = rnd() * 2 - 1, a = rnd() * 6.283, s = Math.sqrt(1 - z * z); craters.push([s * Math.cos(a), s * Math.sin(a), z, (opt.craterSize ?? 0.32) * (0.5 + rnd()), Math.min(hi - lo, opt.craterDepth ?? 0.16) * (0.35 + rnd() * 0.5)]); }
  P = { planes, verts, faces, craters }; POLY.set(key, P); return P;
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; this.i = []; this.M = [0, 0.6, 1, 0]; this.T = { pos: new Vec3(), q: new Quat(), s: new Vec3(1, 1, 1) }; }
  mat(metal, rough, emis = 1, detail = 0) { this.M = [metal, rough, emis, detail]; return this; }
  at(x = 0, y = 0, z = 0, q = null, sx = 1, sy = sx, sz = sx) { const T = this.T; T.pos.set(x, y, z); T.q.copy(q || IDQ); T.s.set(sx, sy, sz); return this; }
  atV(p, q, s = 1) { return this.at(p.x, p.y, p.z, q, s, s, s); }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, col) {
    const T = this.T;
    tv.set(x * T.s.x, y * T.s.y, z * T.s.z).applyQuat(T.q).add(T.pos);
    tn.set(nx / T.s.x, ny / T.s.y, nz / T.s.z).normalize().applyQuat(T.q);
    return this.raw(tv, tn, col);
  }
  raw(p, n, col) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(col[0], col[1], col[2], col[3] ?? 0);
    const M = this.M; this.m.push(M[0], M[1], M[2], M[3] + (col.reg || 0)); return this.p.length / 3 - 1; // V7: colours may carry a paint-region tag (models.js)
  }
  vw(p, n, col) { return this.raw(p, n, col); }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  box(w, h, d, col) {
    const x = w / 2, y = h / 2, z = d / 2;
    for (const [nn, vs] of BOXF) { const ids = vs.map(v => this.v(v[0] * x, v[1] * y, v[2] * z, nn[0], nn[1], nn[2], col)); this.quad(ids[0], ids[1], ids[2], ids[3]); }
    return this;
  }
  // bevelled (chamfered, smooth-shaded edge) box
  bbox(w, h, d, b, col) {
    const hx = w / 2, hy = h / 2, hz = d / 2; b = Math.min(b, hx * 0.9, hy * 0.9, hz * 0.9);
    const ix = hx - b, iy = hy - b, iz = hz - b, ts = [-1, -0.999, 0.999, 1];
    const pt = (X, Y, Z) => { const px = X * hx, py = Y * hy, pz = Z * hz, cx = Math.max(-ix, Math.min(ix, px)), cy = Math.max(-iy, Math.min(iy, py)), cz = Math.max(-iz, Math.min(iz, pz));
      let nx = px - cx, ny = py - cy, nz = pz - cz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; return [cx + nx * b, cy + ny * b, cz + nz * b, nx, ny, nz]; };
    const face = (f) => {
      const ids = [];
      for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) { const u = ts[a], v = ts[c]; const q = f(u, v); const r = pt(q[0], q[1], q[2]); ids.push(this.v(r[0], r[1], r[2], r[3], r[4], r[5], col)); }
      for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) { const k = a * 4 + c; this.quad(ids[k], ids[k + 4], ids[k + 5], ids[k + 1]); }
    };
    // map each face's (u,v) so triangles wind outward
    face((u, v) => [1, v, u]); face((u, v) => [-1, u, v]); face((u, v) => [u, 1, v]); face((u, v) => [v, -1, u]); face((u, v) => [v, u, 1]); face((u, v) => [u, v, -1]);
    return this;
  }
  // cylinder / cone along +Z (rFront at +len/2, rBack at -len/2)
  cyl(rBack, rFront, len, seg, col, caps = true) {
    const z0 = -len / 2, z1 = len / 2, slope = (rBack - rFront) / len, base = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a), nl = Math.hypot(1, slope);
      base.push([this.v(cx * rBack, cy * rBack, z0, cx / nl, cy / nl, slope / nl, col), this.v(cx * rFront, cy * rFront, z1, cx / nl, cy / nl, slope / nl, col)]);
    }
    for (let k = 0; k < seg; k++) this.quad(base[k][0], base[k + 1][0], base[k + 1][1], base[k][1]);
    if (caps) for (const [r, z, s] of [[rBack, z0, -1], [rFront, z1, 1]]) {
      if (r < 1e-3) continue;
      const c = this.v(0, 0, z, 0, 0, s, col), ring = [];
      for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; ring.push(this.v(Math.cos(a) * r, Math.sin(a) * r, z, 0, 0, s, col)); }
      for (let k = 0; k < seg; k++) s > 0 ? this.tri(c, ring[k], ring[k + 1]) : this.tri(c, ring[k + 1], ring[k]);
    }
    return this;
  }
  // surface of revolution around Z. profile: [[r, z], ...] from back to front. ex/ey scale the cross-section (ellipse).
  lathe(profile, seg, col, ex = 1, ey = 1, a0 = 0, a1 = Math.PI * 2) {
    const rows = [], full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    for (let j = 0; j < profile.length; j++) {
      const [r, z] = profile[j], pr = profile[Math.max(0, j - 1)], nx = profile[Math.min(profile.length - 1, j + 1)];
      const dz = nx[1] - pr[1], dr = nx[0] - pr[0], l = Math.hypot(dz, dr) || 1, nr = dz / l, nz = -dr / l, row = [];
      for (let k = 0; k <= seg; k++) {
        const a = a0 + (k / seg) * (a1 - a0), ca = Math.cos(a), sa = Math.sin(a);
        row.push(this.v(ca * r * ex, sa * r * ey, z, ca * nr / ex, sa * nr / ey, nz, col));
      }
      rows.push(row);
    }
    for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < seg; k++) this.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
    void full;
    return this;
  }
  sphere(r, ws, hs, col) {
    const rows = [];
    for (let j = 0; j <= hs; j++) {
      const ph = (j / hs) * Math.PI, row = [];
      for (let k = 0; k <= ws; k++) { const th = (k / ws) * Math.PI * 2, x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th); row.push(this.v(x * r, y * r, z * r, x, y, z, col)); }
      rows.push(row);
    }
    for (let j = 0; j < hs; j++) for (let k = 0; k < ws; k++) this.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
    return this;
  }
  // torus in the XY plane (axis +Z)
  torus(R, r, segR, segT, col, a0 = 0, a1 = Math.PI * 2) {
    const rows = [];
    for (let j = 0; j <= segR; j++) {
      const u = a0 + (j / segR) * (a1 - a0), row = [];
      for (let k = 0; k <= segT; k++) {
        const v = (k / segT) * Math.PI * 2, cx = Math.cos(u), cy = Math.sin(u);
        row.push(this.v((R + r * Math.cos(v)) * cx, (R + r * Math.cos(v)) * cy, r * Math.sin(v), Math.cos(v) * cx, Math.cos(v) * cy, Math.sin(v), col));
      }
      rows.push(row);
    }
    for (let j = 0; j < segR; j++) for (let k = 0; k < segT; k++) this.quad(rows[j][k], rows[j + 1][k], rows[j + 1][k + 1], rows[j][k + 1]);
    return this;
  }
  // convex outline in XZ ([x,z] list, any winding) extruded in Y with chamfered edges (b = bevel)
  plate(outline, th, col, b = 0) {
    const n = outline.length; let cx = 0, cz = 0; for (const [x, z] of outline) { cx += x; cz += z; } cx /= n; cz /= n;
    let area = 0; for (let k = 0; k < n; k++) { const [x0, z0] = outline[k], [x1, z1] = outline[(k + 1) % n]; area += x0 * z1 - x1 * z0; }
    const ol = area < 0 ? outline : outline.slice().reverse();
    const h = th / 2, bb = Math.min(b, h * 0.9);
    const inner = ol.map(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1, k = Math.max(0.2, 1 - bb / d); return [cx + (x - cx) * k, cz + (z - cz) * k]; });
    const top = inner.map(([x, z]) => this.v(x, h, z, 0, 1, 0, col)), bot = inner.map(([x, z]) => this.v(x, -h, z, 0, -1, 0, col));
    for (let k = 1; k < n - 1; k++) { this.tri(top[0], top[k], top[k + 1]); this.tri(bot[0], bot[k + 1], bot[k]); }
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n, [x0, z0] = ol[k], [x1, z1] = ol[j];
      let nx = -(z1 - z0), nz = x1 - x0; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (bb > 0) {
        const e = 0.7071, yo = h - bb;
        const a = this.v(inner[k][0], h, inner[k][1], nx * e, e, nz * e, col), c = this.v(inner[j][0], h, inner[j][1], nx * e, e, nz * e, col);
        const a2 = this.v(x0, yo, z0, nx * e, e, nz * e, col), c2 = this.v(x1, yo, z1, nx * e, e, nz * e, col);
        this.quad(a, a2, c2, c);
        const s0 = this.v(x0, yo, z0, nx, 0, nz, col), s1 = this.v(x1, yo, z1, nx, 0, nz, col), s2 = this.v(x1, -yo, z1, nx, 0, nz, col), s3 = this.v(x0, -yo, z0, nx, 0, nz, col);
        this.quad(s0, s3, s2, s1);
        const d = this.v(inner[k][0], -h, inner[k][1], nx * e, -e, nz * e, col), f = this.v(inner[j][0], -h, inner[j][1], nx * e, -e, nz * e, col);
        const d2 = this.v(x0, -yo, z0, nx * e, -e, nz * e, col), f2 = this.v(x1, -yo, z1, nx * e, -e, nz * e, col);
        this.quad(d2, d, f, f2);
      } else {
        const a = this.v(x0, h, z0, nx, 0, nz, col), c = this.v(x1, h, z1, nx, 0, nz, col), d = this.v(x0, -h, z0, nx, 0, nz, col), f = this.v(x1, -h, z1, nx, 0, nz, col);
        this.quad(a, d, f, c);
      }
    }
    return this;
  }
  // tube through world-space points (closed = loop)
  tube(pts, r, seg, col, closed = false) {
    const n = pts.length, rows = [], up = new Vec3(0, 1, 0), T = new Vec3(), B = new Vec3(), N = new Vec3();
    for (let j = 0; j < n; j++) {
      const a = pts[closed ? (j - 1 + n) % n : Math.max(0, j - 1)], b = pts[closed ? (j + 1) % n : Math.min(n - 1, j + 1)];
      T.subVectors(b, a).normalize(); B.crossVectors(T, Math.abs(T.y) > 0.95 ? X1 : up).normalize(); N.crossVectors(B, T);
      const row = [];
      for (let k = 0; k <= seg; k++) { const ang = (k / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        tn.set(B.x * c + N.x * s, B.y * c + N.y * s, B.z * c + N.z * s); tv.copy(pts[j]).addScaled(tn, r); row.push(this.raw(tv, tn, col)); }
      rows.push(row);
    }
    for (let j = 0; j < n - (closed ? 0 : 1); j++) { const A = rows[j], C = rows[(j + 1) % n]; for (let k = 0; k < seg; k++) this.quad(A[k], C[k], C[k + 1], A[k + 1]); }
    return this;
  }
  // smooth rock: icosphere with low-amplitude noise so the silhouette stays within [lo, hi] x r (gameplay fairness)
  rock(r, seed, col, detail = 2, amp = 0.07, lo = 0.93, hi = 1.05, stretch = [1, 1, 1], opt = {}) {
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const mid = new Map(), m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!mid.has(k)) { const v = V[a].map((c, i) => c + V[b][i]), l = Math.hypot(...v); V.push(v.map(c => c / l)); mid.set(k, V.length - 1); } return mid.get(k); };
      F = F.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
    }
    const P = V.map(([x, y, z]) => { const nse = fbm3(x * 1.6 + seed, y * 1.6, z * 1.6, seed, 4) * 2 - 0.95, k = Math.max(lo, Math.min(hi, 1 + nse * amp * 2));
      return new Vec3(x * k * r * stretch[0], y * k * r * stretch[1], z * k * r * stretch[2]); });
    const planes = []; // every fracture plane as [nx, ny, nz, d] in rock space
    if (opt.craters || opt.cuts) { // impact craters with raised rims, then planar fractures: flat broken faces with hard edges
      let sd = Math.floor(seed * 9973) % 2147483646 + 1; const rn = () => (sd = sd * 16807 % 2147483647) / 2147483647, dir = () => { const z = rn() * 2 - 1, a = rn() * 6.283, q = Math.sqrt(1 - z * z); return new Vec3(q * Math.cos(a), q * Math.sin(a), z); };
      for (let c = 0; c < (opt.craters || 0); c++) { const cd = dir(), ang = 0.18 + rn() * 0.3, dep = (0.05 + rn() * 0.06) * r;
        P.forEach((p, k) => { const u = V[k], a = Math.acos(Math.min(1, u[0] * cd.x + u[1] * cd.y + u[2] * cd.z)) / ang; if (a >= 1.25) return;
          const len = p.len(), prof = a < 1 ? -dep * (1 - a * a) : dep * 0.35 * Math.sin((a - 1) / 0.25 * Math.PI); p.scale(Math.min(hi * r * Math.max(...stretch), Math.max(lo * r, len + prof)) / len); }); }
      for (let c = 0; c < (opt.cuts || 0); c++) { const cn = dir(), d0 = r * (opt.cutMin ?? lo) + rn() * r * 0.15; planes.push([cn.x, cn.y, cn.z, d0]); for (const p of P) { const dd = p.dot(cn); if (dd > d0) p.addScaled(cn, d0 - dd); } }
    }
    if (opt.planes) { // explicit fracture planes (normal, distance in radii) for fragments, projected repeatedly so corners settle on the intersections
      const E = opt.planes.map(([x, y, z, d]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, d * r]; }); planes.push(...E);
      for (let it = 0; it < 5; it++) for (const [nx, ny, nz, d] of E) for (const p of P) { const dd = p.x * nx + p.y * ny + p.z * nz; if (dd > d) { p.x -= (dd - d) * nx; p.y -= (dd - d) * ny; p.z -= (dd - d) * nz; } }
    }
    // opt.flat: triangles lying wholly on one fracture plane become flat-shaded, freshly broken faces (lighter, own normal, hard edge)
    const flat = !!(opt.flat && planes.length), on = flat ? new Uint32Array(P.length) : null;
    if (flat) P.forEach((p, k) => planes.forEach(([nx, ny, nz, d], j) => { if (j < 32 && Math.abs(p.x * nx + p.y * ny + p.z * nz - d) < r * 2e-3) on[k] |= 1 << j; }));
    const isFlat = (a, b, c) => flat ? (on[a] & on[b] & on[c]) : 0;
    const NN = P.map(() => new Vec3()), e1 = new Vec3(), e2 = new Vec3(), fn = new Vec3();
    for (const [a, b, c] of F) { if (isFlat(a, b, c)) continue; fn.crossVectors(e1.subVectors(P[b], P[a]), e2.subVectors(P[c], P[a])); NN[a].add(fn); NN[b].add(fn); NN[c].add(fn); }
    const base = this.count, shade = k => 0.85 + 0.3 * vnoise(V[k][0] * 3, V[k][1] * 3, V[k][2] * 3, seed);
    for (let k = 0; k < P.length; k++) {
      const n = NN[k].len() > 1e-12 ? NN[k].normalize() : NN[k].copy(P[k]).normalize(), sh = shade(k);
      this.v(P[k].x, P[k].y, P[k].z, n.x, n.y, n.z, [col[0] * sh, col[1] * sh, col[2] * sh, col[3] || 0]);
    }
    const fr = opt.fresh ?? 1.3, ft = opt.freshTint || [1, 1, 1];
    for (const [a, b, c] of F) { const m = isFlat(a, b, c); if (!m) { this.tri(base + a, base + b, base + c); continue; }
      const [nx, ny, nz] = planes[31 - Math.clz32(m & -m)], ids = [a, b, c].map(i => { const sh = shade(i) * fr; return this.v(P[i].x, P[i].y, P[i].z, nx, ny, nz, [col[0] * sh * ft[0], col[1] * sh * ft[1], col[2] * sh * ft[2], col[3] || 0]); });
      this.tri(ids[0], ids[1], ids[2]); }
    return this;
  }
  // V6 asteroid: a convex polytope of fracture planes (large flat faces, straight sharp edges, chipped corners) instead
  // of a noisy sphere. Every level of detail uses the same planes and corners, so the outline is the same at every
  // level and only the face tessellation changes. Faces then bulge (weathered) or dip (fresh) between their edges,
  // edges wobble, craters and terraces are carved, and the radius is clamped to [lo, hi], so a gameplay rock still
  // fits its collision sphere. opt: planes, dMin, dMax, lo, hi, seg (edge length), rings, crease (deg), bulge, wobble,
  // fresh (share of fresh planes), freshMul, freshTint, craters, craterSize, strata {axis, k, depth}, extra (planes
  // [nx, ny, nz, d] always cut fresh), stretch.
  polyRock(r, seed, col, opt = {}) {
    const lo = opt.lo ?? 0.93, hi = opt.hi ?? 1.05, poly = polytopeFor(seed, opt, lo, hi), S = opt.stretch || [1, 1, 1];
    const sL = opt.seg ?? 0.12, R = opt.rings ?? 3, crease = Math.cos((opt.crease ?? 30) * Math.PI / 180), bulge = opt.bulge ?? 0.03, wob = opt.wobble ?? 0.012;
    const fm = opt.freshMul ?? 1.18, ft = opt.freshTint || [1, 1, 1], craters = poly.craters, strata = opt.strata, M0 = this.M.slice();
    const disp = (x, y, z, w, f) => { // radial displacement: edge wobble everywhere, face bulge (w = 0 on edges), craters, terraces
      const L = Math.hypot(x, y, z), ux = x / L, uy = y / L, uz = z / L; let d = wob * (fbm3(x * 2.3 + 11, y * 2.3, z * 2.3, seed, 3) - 0.5) * 2;
      d += w * (f ? -0.35 * bulge + bulge * 0.5 * (vnoise(x * 6 + 3, y * 6, z * 6, seed) - 0.5) : bulge * (0.6 + 0.8 * vnoise(x * 1.7, y * 1.7, z * 1.7, seed + 5)));
      for (const c of craters) { const a = Math.acos(Math.min(1, ux * c[0] + uy * c[1] + uz * c[2])) / c[3]; if (a < 1) d -= c[4] * (1 - a * a); else if (a < 1.35) d += c[4] * 0.3 * Math.sin((a - 1) / 0.35 * Math.PI); }
      if (strata) { const s = (x * strata.axis[0] + y * strata.axis[1] + z * strata.axis[2]) * strata.k; d -= strata.depth * smoothstep(0.62, 0.98, s - Math.floor(s)); }
      const k = Math.max(lo, Math.min(hi, L + d)) / L; return [x * k, y * k, z * k]; };
    const verts = [], faceOf = [], tris = []; // per face: own vertices (normals stay sharp across edges unless merged below)
    const edgePts = new Map(), V = poly.verts;
    const edge = (a, b) => { const key = a < b ? a + '_' + b : b + '_' + a; let e = edgePts.get(key); if (!e) { const A = V[Math.min(a, b)], B = V[Math.max(a, b)], m = Math.max(1, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) / sL)); e = []; for (let t = 0; t <= m; t++) e.push([A[0] + (B[0] - A[0]) * t / m, A[1] + (B[1] - A[1]) * t / m, A[2] + (B[2] - A[2]) * t / m]); edgePts.set(key, e); } return a < b ? e : e.slice().reverse(); };
    poly.faces.forEach((F, fi) => {
      const per = []; for (let i = 0; i < F.ids.length; i++) { const e = edge(F.ids[i], F.ids[(i + 1) % F.ids.length]); for (let t = 0; t < e.length - 1; t++) per.push(e[t]); }
      const c = [0, 0, 0]; for (const v of F.ids) for (let a = 0; a < 3; a++) c[a] += V[v][a] / F.ids.length;
      const base = verts.length, n = per.length, Rf = Math.max(1, R);
      const add = (x, y, z, w) => { verts.push(disp(x, y, z, w, F.fresh)); faceOf.push(fi); };
      add(c[0], c[1], c[2], 1);
      for (let j = 1; j <= Rf; j++) { const t = j / Rf, w = 1 - t * t; for (const e of per) add(c[0] + (e[0] - c[0]) * t, c[1] + (e[1] - c[1]) * t, c[2] + (e[2] - c[2]) * t, w); }
      const ring = j => base + 1 + (j - 1) * n;
      for (let i = 0; i < n; i++) tris.push([base, ring(1) + i, ring(1) + (i + 1) % n]);
      for (let j = 2; j <= Rf; j++) for (let i = 0; i < n; i++) { const a = ring(j - 1) + i, b = ring(j) + i, c2 = ring(j) + (i + 1) % n, d = ring(j - 1) + (i + 1) % n; tris.push([a, b, c2]); tris.push([a, c2, d]); }
    });
    // normals: smooth within a face; across an edge only where the faces meet at a shallow angle (eroded edges)
    const NN = verts.map(() => [0, 0, 0]);
    for (const [a, b, c] of tris) { const A = verts[a], B = verts[b], C = verts[c], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const k of [a, b, c]) { NN[k][0] += nx; NN[k][1] += ny; NN[k][2] += nz; } }
    const groups = new Map(); verts.forEach((p, k) => { const key = p.map(v => Math.round(v * 1e5)).join(','); let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(k); });
    const FN = poly.faces.map(f => f.n), NF = NN.map(v => v.slice());
    for (const g of groups.values()) { if (g.length < 2) continue; for (const k of g) { const acc = NN[k].slice(); for (const j of g) if (j !== k) { const a = FN[faceOf[k]], b = FN[faceOf[j]]; if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > crease) { acc[0] += NN[j][0]; acc[1] += NN[j][1]; acc[2] += NN[j][2]; } } NF[k] = acc; } }
    const off = this.count;
    verts.forEach((p, k) => { const F = poly.faces[faceOf[k]], sh = 0.86 + 0.28 * vnoise(p[0] * 3.1, p[1] * 3.1, p[2] * 3.1, seed + 2), f = F.fresh ? fm : 1, t = F.fresh ? ft : ONE3;
      let nx = NF[k][0] / S[0], ny = NF[k][1] / S[1], nz = NF[k][2] / S[2]; const l = Math.hypot(nx, ny, nz) || 1;
      this.M = [M0[0], M0[1], F.fresh ? 2 : 1, M0[3]]; // the detail shader reads emissive strength 2 as "fresh fracture face" (rocks never glow)
      this.v(p[0] * r * S[0], p[1] * r * S[1], p[2] * r * S[2], nx / l, ny / l, nz / l, [col[0] * sh * f * t[0], col[1] * sh * f * t[1], col[2] * sh * f * t[2], col[3] || 0]); });
    this.M = M0; for (const [a, b, c] of tris) this.tri(off + a, off + b, off + c);
    return this;
  }
  merge(g) { const off = this.count; this.p.push(...g.p); this.n.push(...g.n); this.c.push(...g.c); this.m.push(...g.m); for (const k of g.i) this.i.push(k + off); return this; }
  bounds() {
    const p = this.p, mn = new Vec3(Infinity, Infinity, Infinity), mx = new Vec3(-Infinity, -Infinity, -Infinity);
    for (let k = 0; k < p.length; k += 3) { mn.x = Math.min(mn.x, p[k]); mn.y = Math.min(mn.y, p[k + 1]); mn.z = Math.min(mn.z, p[k + 2]); mx.x = Math.max(mx.x, p[k]); mx.y = Math.max(mx.y, p[k + 1]); mx.z = Math.max(mx.z, p[k + 2]); }
    const c = new Vec3().lerpVectors(mn, mx, 0.5); let r = 0; for (let k = 0; k < p.length; k += 3) r = Math.max(r, Math.hypot(p[k] - c.x, p[k + 1] - c.y, p[k + 2] - c.z));
    return { min: mn, max: mx, c, r };
  }
  // scale all vertices about the origin (after building)
  scaleAll(s) { for (let k = 0; k < this.p.length; k++) this.p[k] *= s; return this; }
  build() { return { pos: new Float32Array(this.p), nor: new Float32Array(this.n), col: new Float32Array(this.c), mat: new Float32Array(this.m), idx: new Uint32Array(this.i) }; }
}
const IDQ = new Quat(), X1 = new Vec3(1, 0, 0);
const BOXF = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
  [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
  [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
