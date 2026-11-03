// Track geometry: a closed 3D corridor built from a filleted polygon (straights + circular corners).
import { Vec3, clamp, smoother, wrapDelta } from '../math.js';

export const SPACING = 4;

function buildPlan(verts) {
  const n = verts.length, fil = [];
  for (let i = 0; i < n; i++) {
    const p = verts[(i - 1 + n) % n], v = verts[i], q = verts[(i + 1) % n];
    let ax = v.x - p.x, az = v.z - p.z; const la = Math.hypot(ax, az); ax /= la; az /= la;
    let bx = q.x - v.x, bz = q.z - v.z; const lb = Math.hypot(bx, bz); bx /= lb; bz /= lb;
    const phi = Math.atan2(ax * bz - az * bx, ax * bx + az * bz); // > 0 means right turn
    const t = v.r * Math.tan(Math.abs(phi) / 2);
    fil.push({ ax, az, phi, t, lb, x1: v.x - ax * t, z1: v.z - az * t, x2: v.x + bx * t, z2: v.z + bz * t });
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (fil[i].t + fil[j].t > fil[i].lb) throw new Error(`corners ${i} and ${j} overlap`);
  }
  const pts = [], keys = [];
  for (let i = 0; i < n; i++) {
    const f = fil[i], v = verts[i], sg = f.phi >= 0 ? 1 : -1;
    const cx = f.x1 - f.az * v.r * sg, cz = f.z1 + f.ax * v.r * sg, rx = f.x1 - cx, rz = f.z1 - cz;
    const steps = Math.max(2, Math.ceil(v.r * Math.abs(f.phi)));
    for (let k = 0; k < steps; k++) {
      const a = (f.phi * k) / steps, c = Math.cos(a), s = Math.sin(a);
      if (k === steps >> 1) keys.push({ idx: pts.length, v, turn: sg });
      pts.push({ x: cx + rx * c - rz * s, z: cz + rx * s + rz * c });
    }
    const g = fil[(i + 1) % n], sl = Math.hypot(g.x1 - f.x2, g.z1 - f.z2), ss = Math.max(1, Math.ceil(sl));
    for (let k = 0; k < ss; k++) { const u = k / ss; pts.push({ x: f.x2 + (g.x1 - f.x2) * u, z: f.z2 + (g.z1 - f.z2) * u }); }
    if (i === 0) fil.startIdx = pts.length - ss; // first point of the straight after corner 0
  }
  return { pts, keys, startIdx: fil.startIdx };
}

export class Track {
  constructor(def) {
    this.def = def; this.id = def.id; this.name = def.name;
    const { pts, keys, startIdx } = buildPlan(def.verts);
    const M = pts.length;
    // 2D cumulative length
    const s2 = new Float64Array(M + 1);
    for (let i = 1; i <= M; i++) { const a = pts[i - 1], b = pts[i % M]; s2[i] = s2[i - 1] + Math.hypot(b.x - a.x, b.z - a.z); }
    const L2 = s2[M];
    // interpolate vertex attributes between corner midpoints with smootherstep
    const attr = ['y', 'w', 'h', 'bank'], K = keys.length;
    for (let k = 0; k < K; k++) {
      const A = keys[k], B = keys[(k + 1) % K];
      const sa = s2[A.idx]; let span = s2[B.idx] - sa; if (span <= 0) span += L2;
      const val = (key, a) => a === 'bank' ? (key.v.bank || 0) * key.turn * Math.PI / 180 : key.v[a] ?? def[a] ?? 0;
      for (let j = A.idx, c = 0; c <= M; c++, j = (j + 1) % M) {
        let d = s2[j] - sa; if (d < 0) d += L2; if (d > span) break;
        const u = smoother(d / span), p = pts[j];
        for (const a of attr) p[a] = val(A, a) + (val(B, a) - val(A, a)) * u;
      }
    }
    // 3D cumulative length starting at the start line
    const start = (startIdx + Math.round(def.startOffset)) % M;
    const ord = []; for (let i = 0; i < M; i++) ord.push(pts[(start + i) % M]);
    const s3 = new Float64Array(M + 1);
    for (let i = 1; i <= M; i++) { const a = ord[i - 1], b = ord[i % M]; s3[i] = s3[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
    const L = s3[M], N = Math.round(L / SPACING);
    this.length = L; this.N = N; this.D = L / N;
    this.pos = []; this.tan = []; this.nrm = []; this.bin = [];
    this.w = new Float32Array(N); this.h = new Float32Array(N); this.bank = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.D;
      while (s3[j + 1] < s) j++;
      const a = ord[j], b = ord[(j + 1) % M], u = (s - s3[j]) / (s3[j + 1] - s3[j] || 1);
      this.pos.push(new Vec3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u));
      this.w[i] = a.w + (b.w - a.w) * u; this.h[i] = a.h + (b.h - a.h) * u; this.bank[i] = a.bank + (b.bank - a.bank) * u;
    }
    const up = new Vec3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const T = new Vec3().subVectors(this.pos[(i + 1) % N], this.pos[(i - 1 + N) % N]).normalize();
      const B = new Vec3().crossVectors(T, up).normalize(), Nn = new Vec3().crossVectors(B, T);
      const c = Math.cos(this.bank[i]), s = Math.sin(this.bank[i]);
      const B2 = new Vec3(B.x * c - Nn.x * s, B.y * c - Nn.y * s, B.z * c - Nn.z * s);
      const N2 = new Vec3(Nn.x * c + B.x * s, Nn.y * c + B.y * s, Nn.z * c + B.z * s);
      this.tan.push(T); this.bin.push(B2); this.nrm.push(N2);
    }
    // curvature (lateral = toward right, vertical = toward up), smoothed racing line
    this.kLat = new Float32Array(N); this.kVert = new Float32Array(N); this.kAbs = new Float32Array(N);
    const dT = new Vec3();
    for (let i = 0; i < N; i++) {
      dT.subVectors(this.tan[(i + 1) % N], this.tan[(i - 1 + N) % N]).scale(1 / (2 * this.D));
      this.kLat[i] = dT.dot(this.bin[i]); this.kVert[i] = dT.dot(this.nrm[i]); this.kAbs[i] = dT.len();
    }
    const smooth = (arr, r, passes) => {
      let a = arr;
      for (let p = 0; p < passes; p++) {
        const o = new Float32Array(N);
        for (let i = 0; i < N; i++) { let sum = 0; for (let k = -r; k <= r; k++) sum += a[(i + k + N) % N]; o[i] = sum / (2 * r + 1); }
        a = o;
      }
      return a;
    };
    this.kLatS = smooth(this.kLat, 10, 2); this.kVertS = smooth(this.kVert, 10, 2);
    this.lineX = new Float32Array(N); this.lineY = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.lineX[i] = clamp(this.kLatS[i] * 90, -1, 1) * Math.max(0, this.w[i] - 7) * 0.75;
      this.lineY[i] = clamp(this.kVertS[i] * 90, -1, 1) * Math.max(0, this.h[i] - 6) * 0.6;
    }
    // tunnels / tags
    this.tunnel = new Uint8Array(N);
    for (const [u0, u1] of def.tunnels || []) for (let i = Math.floor(u0 * N); i < Math.floor(u1 * N); i++) this.tunnel[i] = 1;
    // checkpoints (index 0 = start/finish line)
    const C = def.checkpoints || 8;
    this.cpS = []; this.cpIdx = [];
    for (let k = 0; k < C; k++) { const i = Math.round((k * N) / C) % N; this.cpIdx.push(i); this.cpS.push(i * this.D); }
    this.obstacles = []; this.lasers = []; this.traffic = []; this.pads = []; this.cells = [];
    this.buckets = new Map();
  }

  wrapIdx(i) { return ((i % this.N) + this.N) % this.N; }
  deltaS(a, b) { return wrapDelta(b - a, this.length); }

  // World position at sample i with lateral offset x (right) and vertical offset y (up)
  pointAt(i, x, y, out = new Vec3()) {
    i = this.wrapIdx(i);
    const p = this.pos[i], B = this.bin[i], N = this.nrm[i];
    return out.set(p.x + B.x * x + N.x * y, p.y + B.y * x + N.y * y, p.z + B.z * x + N.z * y);
  }

  // Locate a point relative to the corridor using a local search around hint index.
  locate(p, hint, out, win = 10) {
    let best = hint, bd = Infinity;
    for (let o = -win; o <= win; o++) {
      const i = this.wrapIdx(hint + o), q = this.pos[i];
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    const q = this.pos[best], dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const T = this.tan[best], B = this.bin[best], N = this.nrm[best];
    out.i = best;
    out.along = dx * T.x + dy * T.y + dz * T.z;
    out.x = dx * B.x + dy * B.y + dz * B.z;
    out.y = dx * N.x + dy * N.y + dz * N.z;
    out.s = (((best * this.D + out.along) % this.length) + this.length) % this.length;
    return out;
  }

  nearestIndex(p) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i++) { const d = this.pos[i].distSq(p); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  addObstacle(o) {
    o.i = this.wrapIdx(o.i);
    if (o.type === 'sphere') o.base = this.pointAt(o.i, o.x, o.y);
    o.p = o.base ? o.base.clone() : null; o.ox = o.x || 0; o.oy = o.y || 0;
    this.obstacles.push(o);
    const b = Math.floor(o.i / 16);
    if (!this.buckets.has(b)) this.buckets.set(b, []);
    this.buckets.get(b).push(o);
  }

  // Update moving obstacles for time t
  updateObstacles(t) {
    for (const o of this.obstacles) {
      if (!o.move) continue;
      const m = o.move, a = t * m.w + m.ph, B = this.bin[o.i], N = this.nrm[o.i];
      const dx = Math.sin(a) * m.ax, dy = Math.cos(a * 0.8) * m.ay;
      o.p.set(o.base.x + B.x * dx + N.x * dy, o.base.y + B.y * dx + N.y * dy, o.base.z + B.z * dx + N.z * dy);
      o.ox = o.x + dx; o.oy = o.y + dy;
    }
  }

  obstaclesNear(i, out, range = 1) {
    out.length = 0;
    const b = Math.floor(this.wrapIdx(i) / 16), nb = Math.ceil(this.N / 16);
    for (let k = -range; k <= range; k++) { const arr = this.buckets.get(((b + k) % nb + nb) % nb); if (arr) out.push(...arr); }
    return out;
  }

  trafficCarX(lane, k, t) {
    const span = this.w[lane.i] + 70, per = 2 * span;
    const u = (((t * lane.speed + k * lane.spacing + lane.phase) % per) + per) % per;
    return (u - span) * lane.dir;
  }
}
