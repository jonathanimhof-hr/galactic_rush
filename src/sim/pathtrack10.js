// GALACTIC RUSH V10 — the path builder of the two V10 courses (Verdant Canopy, Orbital Nexus). It reads the same path
// format as pathtrack.js (V9) and produces exactly the fields and methods of Track, with two differences that only
// these courses use (the V9 builder and its courses are untouched; tracks.js calls this builder for a course whose
// definition says build: 'path10'):
//   * heights: the heights given at segment ends are joined by one smooth curve along the whole course (a periodic
//     monotone cubic: no overshoot, level wherever two neighbouring heights are equal) instead of easing in and out of
//     every segment. A climb that runs over several turns and straights is one continuous climb.
//   * roll: deg on a segment turns the course's "up" about the direction of travel (Orbital Nexus's gravity sections;
//     the turn happens about the ride line, see gravity.js), and grav: true marks gravity-plated segments.
import { Track, SPACING } from './track.js';
import { closePlan } from './pathtrack.js';
import { Vec3, clamp, smoother } from '../math.js';
import { GRAVITY, gravityField } from './gravity.js';

const RAD = Math.PI / 180, DS = 0.5;
const dirOf = psi => [Math.sin(psi), Math.cos(psi)];
const rightOf = psi => [-Math.cos(psi), Math.sin(psi)];

// periodic monotone cubic (Fritsch–Carlson) through knots (s_k, y_k), s strictly increasing, period P
function heightCurve(S, Y, P) {
  const n = S.length, h = [], d = [];
  for (let k = 0; k < n; k++) { const s1 = k + 1 < n ? S[k + 1] : S[0] + P, y1 = Y[(k + 1) % n]; h.push(s1 - S[k]); d.push((y1 - Y[k]) / h[k]); }
  const m = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = d[(k - 1 + n) % n], b = d[k];
    if (a * b <= 0) m[k] = 0; else { const ha = h[(k - 1 + n) % n], hb = h[k], w1 = 2 * hb + ha, w2 = hb + 2 * ha; m[k] = (w1 + w2) / (w1 / a + w2 / b); } }
  return s => { s = ((s % P) + P) % P; let k = n - 1; for (let j = 0; j < n; j++) if (S[j] <= s) k = j; let u = s - S[k]; if (u < 0) u += P;
    const t = u / h[k], t2 = t * t, t3 = t2 * t, y0 = Y[k], y1 = Y[(k + 1) % n];
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h[k] * m[(k + 1) % n]; };
}

// fine samples along the closed path (DS metres apart in plan): position, corridor size, bank target, roll, segment
function sample(path, segs) {
  // plan length of every segment and the height knots at the segment ends
  const len = segs.map(sg => sg.turn ? Math.abs(sg.turn) * RAD * sg.r : sg.s);
  const P = len.reduce((a, b) => a + b, 0), S = [0], Y = [path.y ?? 0]; let acc = 0, y = path.y ?? 0;
  segs.forEach((sg, k) => { acc += len[k]; y = sg.y ?? y; if (k < segs.length - 1) { S.push(acc); Y.push(y); } });
  if (Math.abs(y - (path.y ?? 0)) > 1e-6) throw new Error('the course must end at its start height');
  const H = heightCurve(S, Y, P);
  const pts = []; let psi = (path.heading || 0) * RAD, x = path.x || 0, z = path.z || 0, w = path.w, h = path.h, s0 = 0, roll = 0;
  segs.forEach((sg, si) => {
    if (sg.loop) throw new Error('the V10 builder has no loops');
    const w0 = w, w1 = sg.w ?? w, h0 = h, h1 = sg.h ?? h, r0 = roll, r1 = roll + (sg.roll || 0) * RAD;
    const push = (px, pz, u, bank) => { const e = smoother(u); pts.push({ x: px, y: H(s0 + u * len[si]), z: pz, w: w0 + (w1 - w0) * e, h: h0 + (h1 - h0) * e, bank, roll: r0 + (r1 - r0) * e, seg: si }); };
    if (sg.turn) {
      const a = sg.turn * RAD, L = len[si], n = Math.max(2, Math.ceil(L / DS)), sgn = Math.sign(a), bank = sg.bank ?? sgn * Math.min(path.maxBank ?? 22, (path.bankK ?? 2600) / sg.r);
      const [rx0, rz0] = rightOf(psi), cx = x + rx0 * sg.r * sgn, cz = z + rz0 * sg.r * sgn;
      for (let k = 0; k < n; k++) { const u = k / n, p = psi - a * u, [rx, rz] = rightOf(p); push(cx - rx * sg.r * sgn, cz - rz * sg.r * sgn, u, bank); }
      psi -= a; const [rx, rz] = rightOf(psi); x = cx - rx * sg.r * sgn; z = cz - rz * sg.r * sgn;
    } else {
      const n = Math.max(2, Math.ceil(sg.s / DS)), [dx, dz] = dirOf(psi);
      for (let k = 0; k < n; k++) { const u = k / n; push(x + dx * sg.s * u, z + dz * sg.s * u, u, 0); }
      x += dx * sg.s; z += dz * sg.s;
    }
    s0 += len[si]; w = w1; h = h1; roll = r1;
  });
  const end = Math.hypot(x - (path.x || 0), z - (path.z || 0)), dpsi = Math.abs(((psi - (path.heading || 0) * RAD) / (2 * Math.PI)) % 1), turns = roll / (2 * Math.PI);
  if (end > 0.05 || Math.min(dpsi, 1 - dpsi) > 1e-6 || Math.abs(w - path.w) > 1e-6 || Math.abs(h - path.h) > 1e-6 || Math.abs(turns - Math.round(turns)) > 1e-9)
    throw new Error(`path does not close: ${end.toFixed(3)} m, size ${(w - path.w).toFixed(2)} x ${(h - path.h).toFixed(2)}, roll ${(roll / RAD).toFixed(1)} deg`);
  return pts;
}

export function buildPathTrack10(def) {
  const segs = closePlan(def.path), pts = sample(def.path, segs), M = pts.length;
  // bank: the arcs' targets eased along the course (box filter over +-bankEase metres, twice), as in pathtrack.js
  const ease = Math.round((def.path.bankEase ?? 36) / DS); let bk = Float64Array.from(pts, p => p.bank);
  for (let pass = 0; pass < 2; pass++) { const o = new Float64Array(M); let acc = 0; for (let k = -ease; k <= ease; k++) acc += bk[(k + M) % M];
    for (let i = 0; i < M; i++) { o[i] = acc / (2 * ease + 1); acc += bk[(i + ease + 1) % M] - bk[(i - ease + M) % M]; } bk = o; }
  pts.forEach((p, i) => { p.bank = bk[i]; });
  // the course's up at every fine point: the world up turned by the bank, then by the roll about the direction of
  // travel. A rolled point moves by (h - ride) * (rolled up - up): the roll turns the corridor about its ride line, so a
  // ship riding the deck stays on it. Sampling comes after this, so the samples stay evenly spaced along the course.
  const RT = segs.reduce((a, sg) => a + (sg.roll || 0), 0) * RAD, rolled = pts.some(p => p.roll !== 0);
  { const T = new Vec3(), B = new Vec3(), Nn = new Vec3(), UPV = new Vec3(0, 1, 0), base = pts.map(p => new Vec3(p.x, p.y, p.z));
    for (let k = 0; k < M; k++) { const p = pts[k];
      T.subVectors(base[(k + 1) % M], base[(k - 1 + M) % M]).normalize(); B.crossVectors(T, UPV).normalize(); Nn.crossVectors(B, T);
      const cb = Math.cos(p.bank * RAD), sb = Math.sin(p.bank * RAD), b0 = new Vec3(B.x * cb - Nn.x * sb, B.y * cb - Nn.y * sb, B.z * cb - Nn.z * sb), n0 = new Vec3(Nn.x * cb + B.x * sb, Nn.y * cb + B.y * sb, Nn.z * cb + B.z * sb);
      const c = Math.cos(p.roll), s = Math.sin(p.roll), u = new Vec3(n0.x * c + b0.x * s, n0.y * c + b0.y * s, n0.z * c + b0.z * s), off = rolled ? Math.max(0, p.h - GRAVITY.ride) : 0;
      p.ux = u.x; p.uy = u.y; p.uz = u.z; p.x += (u.x - n0.x) * off; p.y += (u.y - n0.y) * off; p.z += (u.z - n0.z) * off; } }
  const t = Object.create(Track.prototype);
  t.def = def; t.id = def.id; t.name = def.name; t.segs = segs;
  const s3 = new Float64Array(M + 1); for (let i = 1; i <= M; i++) { const a = pts[i - 1], b = pts[i % M]; s3[i] = s3[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
  const L = s3[M], N = Math.round(L / SPACING); t.length = L; t.N = N; t.D = L / N;
  const pos = [], ups = [], w = new Float32Array(N), h = new Float32Array(N), bank = new Float64Array(N), roll = new Float64Array(N);
  t.loopId = new Int8Array(N).fill(-1); t.segIdx = new Int16Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * t.D; while (s3[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % M], u = (s - s3[j]) / (s3[j + 1] - s3[j] || 1), L3 = k => a[k] + (b[k] - a[k]) * u;
    pos.push(new Vec3(L3('x'), L3('y'), L3('z'))); ups.push(new Vec3(L3('ux'), L3('uy'), L3('uz')).normalize());
    w[i] = L3('w'); h[i] = L3('h'); bank[i] = L3('bank') * RAD; roll[i] = a.roll + ((j + 1 === M ? b.roll + RT : b.roll) - a.roll) * u; // across the start line the roll has gone round RT
    t.segIdx[i] = (u < 0.5 ? a : b).seg;
  }
  t.w = w; t.h = h; t.bank = Float32Array.from(bank); t.pos = pos; t.tan = []; t.bin = []; t.nrm = [];
  for (let i = 0; i < N; i++) {
    const T = new Vec3().subVectors(pos[(i + 1) % N], pos[(i - 1 + N) % N]).normalize();
    if (!rolled) { // as pathtrack.js: world up, then the bank
      const B = new Vec3().crossVectors(T, new Vec3(0, 1, 0)).normalize(), Nn = new Vec3().crossVectors(B, T), c = Math.cos(bank[i]), s = Math.sin(bank[i]);
      t.tan.push(T); t.bin.push(new Vec3(B.x * c - Nn.x * s, B.y * c - Nn.y * s, B.z * c - Nn.z * s)); t.nrm.push(new Vec3(Nn.x * c + B.x * s, Nn.y * c + B.y * s, Nn.z * c + B.z * s));
    } else { const B = new Vec3().crossVectors(T, ups[i]).normalize(); t.tan.push(T); t.bin.push(B); t.nrm.push(new Vec3().crossVectors(B, T)); }
  }
  t.roll = Float32Array.from(roll);
  // curvature and the smoothed racing line: the same formulas as Track
  t.kLat = new Float32Array(N); t.kVert = new Float32Array(N); t.kAbs = new Float32Array(N);
  const dT = new Vec3();
  for (let i = 0; i < N; i++) { dT.subVectors(t.tan[(i + 1) % N], t.tan[(i - 1 + N) % N]).scale(1 / (2 * t.D)); t.kLat[i] = dT.dot(t.bin[i]); t.kVert[i] = dT.dot(t.nrm[i]); t.kAbs[i] = dT.len(); }
  const smooth = (arr, r, passes) => { let a = arr; for (let p = 0; p < passes; p++) { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let sum = 0; for (let k = -r; k <= r; k++) sum += a[(i + k + N) % N]; o[i] = sum / (2 * r + 1); } a = o; } return a; };
  t.kLatS = smooth(t.kLat, 10, 2); t.kVertS = smooth(t.kVert, 10, 2);
  t.lineX = new Float32Array(N); t.lineY = new Float32Array(N);
  for (let i = 0; i < N; i++) { t.lineX[i] = clamp(t.kLatS[i] * 90, -1, 1) * Math.max(0, t.w[i] - 7) * 0.75; t.lineY[i] = clamp(t.kVertS[i] * 90, -1, 1) * Math.max(0, t.h[i] - 6) * 0.6; }
  // tunnels and tags from the segments
  t.tunnel = new Uint8Array(N); t.tags = new Map();
  for (let i = 0; i < N; i++) { const sg = segs[t.segIdx[i]]; if (sg.tunnel) t.tunnel[i] = 1; if (sg.tag) { if (!t.tags.has(sg.tag)) t.tags.set(sg.tag, []); t.tags.get(sg.tag).push(i); } }
  t.loops = [];
  // gravity sections (Orbital Nexus): the field and the racing line on the deck
  if (segs.some(sg => sg.grav)) gravityField(t);
  // checkpoints (index 0 = start/finish line): evenly spaced; the course's populate() may move them
  const C = def.checkpoints || 8;
  t.cpS = []; t.cpIdx = []; for (let k = 0; k < C; k++) { const i = Math.round(k * N / C) % N; t.cpIdx.push(i); t.cpS.push(i * t.D); }
  t.obstacles = []; t.lasers = []; t.traffic = []; t.pads = []; t.cells = []; t.buckets = new Map();
  return t;
}
