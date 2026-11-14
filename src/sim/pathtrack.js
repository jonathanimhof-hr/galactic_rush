// GALACTIC RUSH V9 — courses defined as a 3D path: a plan-view turtle (straights and arcs), a smooth height profile and
// genuine vertical loops. The result has exactly the fields and methods of Track (track.js), so the race simulation,
// the AI, the cameras, the renderer and the multiplayer server use it unchanged. Only the V9 courses (Pelagos, Ignara)
// are built here; the V2–V8 courses are still built by Track from their filleted polygons, byte for byte as before.
//
// Course frames: on ordinary sections "up" is the world up (as in Track: right = tangent x up, then the bank angle); in
// a loop "up" turns with the loop (the inward normal of the loop's own plane), so it points at the loop's centre all the
// way round and is the world up again at both ends. Every frame stays orthonormal and continuous, so the flight model's
// roll levelling, the steering assist, the wall collisions, progress, respawns and the chase camera all follow the
// track through the full 360 degrees without any change to their code.
//
// def.path = { x, z, y, heading (deg, 0 = +z), w, h, segs: [...] }. Segments (plan turns: + = right):
//   { s: length }                    straight
//   { turn: deg, r: radius }         arc
//   { loop: R, ramp, shift }         vertical loop: curvature eases in over `ramp` metres, holds 1/R, eases out (the
//                                    total pitch is exactly 360 deg); the exit is `shift` metres to the right of the
//                                    entry line (negative: left) so the corridor never passes through itself
//   any segment may add y (height at its end), w, h (corridor half-width and half-height at its end; both ease in with
//   smootherstep across the segment), bank (deg, arcs), tunnel: true, tag: 'name' (for the course builders)
//   free: 'len' on two straights and free: 'turn' on one arc: the builder solves them so the circuit closes exactly
import { Track, SPACING } from './track.js';
import { Vec3, clamp, smoother } from '../math.js';

const RAD = Math.PI / 180, DS = 0.5, UP = new Vec3(0, 1, 0);
const dirOf = psi => [Math.sin(psi), Math.cos(psi)]; // plan direction (x, z) of heading psi
const rightOf = psi => [-Math.cos(psi), Math.sin(psi)]; // tangent x up, as Track's binormal

// Loop in its own plane: X forward, Y up; curvature k(s) = g(s)/R with g easing 0->1 over `ramp`, 1, then 1->0, so
// the total turn is (L - ramp)/R = 2*PI for L = 2*PI*R + ramp. Integrated finely, then rescaled to exactly 2*PI.
const LOOPS = new Map();
export function loopProfile(R, ramp) {
  const key = R + '|' + ramp; if (LOOPS.has(key)) return LOOPS.get(key);
  const L = 2 * Math.PI * R + ramp, n = Math.ceil(L / 0.05), h = L / n, g = s => s < ramp ? smoother(s / ramp) : s > L - ramp ? smoother((L - s) / ramp) : 1;
  const phi = new Float64Array(n + 1); for (let k = 1; k <= n; k++) phi[k] = phi[k - 1] + (g((k - 0.5) * h) / R) * h;
  const fix = 2 * Math.PI / phi[n]; let x = 0, y = 0; const X = new Float64Array(n + 1), Y = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) { phi[k] *= fix; const a = (phi[k - 1] + phi[k]) / 2; x += Math.cos(a) * h; y += Math.sin(a) * h; X[k] = x; Y[k] = y; }
  const at = s => { const f = clamp(s / h, 0, n), k = Math.min(n - 1, Math.floor(f)), u = f - k; return [X[k] + (X[k + 1] - X[k]) * u, Y[k] + (Y[k + 1] - Y[k]) * u, phi[k] + (phi[k + 1] - phi[k]) * u]; };
  const P = { L, R, ramp, dx: X[n], dy: Y[n], top: Math.max(...Y), at };
  LOOPS.set(key, P); return P;
}
// lateral drift across a loop: 0 -> 1 with zero slope at both ends
const drift = u => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);

// plan-view displacement of one segment for heading psi: [dx, dz, dpsi]
function segMove(sg, psi) {
  const [dx, dz] = dirOf(psi), [rx, rz] = rightOf(psi);
  if (sg.loop) { const P = loopProfile(sg.loop, sg.ramp ?? 60), f = P.dx, l = sg.shift || 0; return [dx * f + rx * l, dz * f + rz * l, 0]; }
  if (sg.turn) { const a = sg.turn * RAD, r = sg.r, fwd = r * Math.sin(Math.abs(a)), lat = r * (1 - Math.cos(Math.abs(a))) * Math.sign(a); return [dx * fwd + rx * lat, dz * fwd + rz * lat, -a]; }
  return [dx * sg.s, dz * sg.s, 0];
}

// Solve the free segments so the plan closes: one free arc closes the heading (the turns add up to +-360 deg), then two
// free straights close the position (a 2x2 linear system). Throws if the design cannot close with positive lengths.
export function closePlan(path) {
  const segs = path.segs.map(s => ({ ...s })), turnFree = segs.filter(s => s.free === 'turn'), lenFree = segs.filter(s => s.free === 'len');
  if (turnFree.length !== 1 || lenFree.length !== 2) throw new Error('a path needs one free arc and two free straights');
  const total = segs.reduce((a, s) => a + (s.turn && s.free !== 'turn' ? s.turn : 0), 0), want = path.turns ?? 360;
  turnFree[0].turn = want - total;
  for (const s of lenFree) s.s = 0;
  let psi = (path.heading || 0) * RAD, X = 0, Z = 0; const dirs = [];
  for (const s of segs) { if (s.free === 'len') dirs.push(dirOf(psi)); const [dx, dz, dp] = segMove(s, psi); X += dx; Z += dz; psi += dp; }
  const [a, b] = dirs, det = a[0] * b[1] - a[1] * b[0]; if (Math.abs(det) < 1e-6) throw new Error('free straights are parallel');
  const L1 = (-X * b[1] + Z * b[0]) / det, L2 = (-Z * a[0] + X * a[1]) / det;
  lenFree[0].s = L1; lenFree[1].s = L2;
  if (!(L1 > (lenFree[0].min ?? 40) && L2 > (lenFree[1].min ?? 40))) throw new Error(`path does not close with positive straights (${L1.toFixed(1)}, ${L2.toFixed(1)}), free turn ${turnFree[0].turn.toFixed(1)}`);
  return segs;
}

// Fine samples along the closed path (about DS metres apart): position, corridor size, bank target, up vector, tags
function sample(path, segs) {
  const pts = []; let psi = (path.heading || 0) * RAD, x = path.x || 0, z = path.z || 0, y = path.y ?? 0, w = path.w, h = path.h;
  segs.forEach((sg, si) => {
    const y0 = y, y1 = sg.y ?? y, w0 = w, w1 = sg.w ?? w, h0 = h, h1 = sg.h ?? h, push = (px, py, pz, u, ux, uy, uz, bank, loop) => {
      const e = smoother(u); pts.push({ x: px, y: py, z: pz, w: w0 + (w1 - w0) * e, h: h0 + (h1 - h0) * e, ux, uy, uz, bank, loop, seg: si }); };
    if (sg.loop) {
      if (sg.y !== undefined && sg.y !== y) throw new Error('a loop keeps its height');
      const P = loopProfile(sg.loop, sg.ramp ?? 60), n = Math.max(2, Math.ceil(P.L / DS)), [ex, ez] = dirOf(psi), [rx, rz] = rightOf(psi), sh = sg.shift || 0;
      for (let k = 0; k < n; k++) { const u = k / n, [X, Y, ph] = P.at(u * P.L), lat = sh * drift(u);
        push(x + ex * X + rx * lat, y + Y, z + ez * X + rz * lat, u, -ex * Math.sin(ph), Math.cos(ph), -ez * Math.sin(ph), 0, si); }
      x += ex * P.dx + rx * sh; z += ez * P.dx + rz * sh;
    } else if (sg.turn) {
      const a = sg.turn * RAD, L = Math.abs(a) * sg.r, n = Math.max(2, Math.ceil(L / DS)), sgn = Math.sign(a), bank = sg.bank ?? sgn * Math.min(path.maxBank ?? 22, (path.bankK ?? 2600) / sg.r);
      const [rx0, rz0] = rightOf(psi), cx = x + rx0 * sg.r * sgn, cz = z + rz0 * sg.r * sgn; // centre of the arc, on the inside
      for (let k = 0; k < n; k++) { const u = k / n, p = psi - a * u, [rx, rz] = rightOf(p), e = smoother(u);
        push(cx - rx * sg.r * sgn, y0 + (y1 - y0) * e, cz - rz * sg.r * sgn, u, 0, 1, 0, bank, -1); }
      psi -= a; const [rx, rz] = rightOf(psi); x = cx - rx * sg.r * sgn; z = cz - rz * sg.r * sgn;
    } else {
      const n = Math.max(2, Math.ceil(sg.s / DS)), [dx, dz] = dirOf(psi);
      for (let k = 0; k < n; k++) { const u = k / n, e = smoother(u); push(x + dx * sg.s * u, y0 + (y1 - y0) * e, z + dz * sg.s * u, u, 0, 1, 0, 0, -1); }
      x += dx * sg.s; z += dz * sg.s;
    }
    y = y1; w = w1; h = h1;
  });
  const end = Math.hypot(x - (path.x || 0), z - (path.z || 0)), dpsi = Math.abs(((psi - (path.heading || 0) * RAD) / (2 * Math.PI)) % 1);
  if (end > 0.05 || Math.min(dpsi, 1 - dpsi) > 1e-6 || Math.abs(y - (path.y ?? 0)) > 1e-6 || Math.abs(w - path.w) > 1e-6 || Math.abs(h - path.h) > 1e-6)
    throw new Error(`path does not close: ${end.toFixed(3)} m, height ${(y - (path.y ?? 0)).toFixed(2)}, size ${(w - path.w).toFixed(2)} x ${(h - path.h).toFixed(2)}`);
  return pts;
}

export function buildPathTrack(def) {
  const segs = closePlan(def.path), pts = sample(def.path, segs), M = pts.length;
  // bank: the arcs' targets eased along the course (box filter over +-bankEase metres, twice); never inside a loop
  const ease = Math.round((def.path.bankEase ?? 36) / DS); let bk = Float64Array.from(pts, p => p.bank);
  for (let pass = 0; pass < 2; pass++) { const o = new Float64Array(M); let acc = 0; for (let k = -ease; k <= ease; k++) acc += bk[(k + M) % M];
    for (let i = 0; i < M; i++) { o[i] = acc / (2 * ease + 1); acc += bk[(i + ease + 1) % M] - bk[(i - ease + M) % M]; } bk = o; }
  pts.forEach((p, i) => { p.bank = p.loop >= 0 ? 0 : bk[i]; });
  const t = Object.create(Track.prototype);
  t.def = def; t.id = def.id; t.name = def.name; t.segs = segs;
  // uniform samples SPACING apart along the 3D length, starting at the start line (the first segment)
  const s3 = new Float64Array(M + 1); for (let i = 1; i <= M; i++) { const a = pts[i - 1], b = pts[i % M]; s3[i] = s3[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
  const L = s3[M], N = Math.round(L / SPACING); t.length = L; t.N = N; t.D = L / N;
  t.pos = []; t.tan = []; t.nrm = []; t.bin = []; t.w = new Float32Array(N); t.h = new Float32Array(N); t.bank = new Float32Array(N);
  t.loopId = new Int8Array(N).fill(-1); t.segIdx = new Int16Array(N); const ups = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * t.D; while (s3[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % M], u = (s - s3[j]) / (s3[j + 1] - s3[j] || 1), L3 = (k) => a[k] + (b[k] - a[k]) * u;
    t.pos.push(new Vec3(L3('x'), L3('y'), L3('z'))); t.w[i] = L3('w'); t.h[i] = L3('h'); t.bank[i] = L3('bank') * RAD;
    ups.push(new Vec3(L3('ux'), L3('uy'), L3('uz')).normalize());
    const near = u < 0.5 ? a : b; t.segIdx[i] = near.seg; if (a.loop >= 0 && b.loop >= 0) t.loopId[i] = a.loop;
  }
  for (let i = 0; i < N; i++) {
    const T = new Vec3().subVectors(t.pos[(i + 1) % N], t.pos[(i - 1 + N) % N]).normalize();
    const B = new Vec3().crossVectors(T, ups[i]).normalize(), Nn = new Vec3().crossVectors(B, T);
    const c = Math.cos(t.bank[i]), s = Math.sin(t.bank[i]);
    t.tan.push(T); t.bin.push(new Vec3(B.x * c - Nn.x * s, B.y * c - Nn.y * s, B.z * c - Nn.z * s)); t.nrm.push(new Vec3(Nn.x * c + B.x * s, Nn.y * c + B.y * s, Nn.z * c + B.z * s));
  }
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
  // loops: sample range, entry frame and geometry, for the course builders
  t.loops = [];
  segs.forEach((sg, si) => { if (!sg.loop) return; let i0 = -1, i1 = -1; for (let i = 0; i < N; i++) if (t.loopId[i] === si) { if (i0 < 0) i0 = i; i1 = i; }
    const e = new Vec3().copy(t.tan[t.wrapIdx(i0 - 2)]); e.y = 0; e.normalize(); const r = new Vec3().crossVectors(e, UP).normalize(), base = t.pos[t.wrapIdx(i0 - 1)].clone();
    t.loops.push({ seg: si, i0, i1, R: sg.loop, ramp: sg.ramp ?? 60, shift: sg.shift || 0, e, r, base, profile: loopProfile(sg.loop, sg.ramp ?? 60), tag: sg.tag }); });
  // checkpoints (index 0 = start/finish line): evenly spaced, or at the fractions the course lists
  const C = def.checkpoints || 8, at = def.cpAt || Array.from({ length: C }, (_, k) => k / C);
  t.cpS = []; t.cpIdx = []; for (const f of at) { const i = Math.round(f * N) % N; t.cpIdx.push(i); t.cpS.push(i * t.D); }
  t.obstacles = []; t.lasers = []; t.traffic = []; t.pads = []; t.cells = []; t.buckets = new Map();
  return t;
}
