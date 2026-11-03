// GALACTIC RUSH V8 — smooth remote ships. Each remote racer keeps a short buffer of the states the server relayed,
// stamped with the server's receive time. Every frame the ship is drawn a little in the past (the render delay, which
// adapts to the connection), between the two states around that moment: position by a cubic Hermite curve through
// both states' positions and velocities, rotation by slerp. If the next state is late, the ship carries on along its
// velocity for at most 250 ms and then holds, so it never jumps backwards or teleports. Everyone draws a ship at the
// same server time minus a similar delay, so all players see it in the same place.
const EXTRAP_MS = 250, STALE_MS = 1500;

export class SnapBuffer {
  constructor(max = 40) { this.a = []; this.max = max; this.lagAvg = 60; this.lagDev = 20; }
  get last() { return this.a.length ? this.a[this.a.length - 1] : null; }
  // ts: server time of the state (ms); st: unpacked state; arrival: server time when it reached this game
  push(ts, st, arrival) {
    const a = this.a; if (a.length && ts <= a[a.length - 1].ts) return false;
    a.push({ ts, st }); if (a.length > this.max) a.shift();
    if (arrival != null) { const lag = arrival - ts; this.lagAvg += (lag - this.lagAvg) * 0.1; this.lagDev += (Math.abs(lag - this.lagAvg) - this.lagDev) * 0.1; }
    return true;
  }
  // how far in the past to draw: one sender interval plus the usual lag and its jitter
  delay() { return Math.min(400, Math.max(90, 50 + this.lagAvg + 2.5 * this.lagDev)); }
  clear() { this.a.length = 0; }
  // pose at server time t (ms) into out { p, q, v, state, extrapolated, stale }
  sample(t, out) {
    const a = this.a; if (!a.length) return null;
    const first = a[0], last = a[a.length - 1];
    if (t >= last.ts) {
      const dt = Math.min(t - last.ts, EXTRAP_MS) / 1000, s = last.st;
      for (let k = 0; k < 3; k++) { out.p[k] = s.p[k] + s.v[k] * dt; out.v[k] = s.v[k]; }
      for (let k = 0; k < 4; k++) out.q[k] = s.q[k];
      out.state = s; out.extrapolated = t > last.ts; out.stale = t - last.ts > STALE_MS; return out;
    }
    if (t <= first.ts) { copyPose(first.st, out); out.state = first.st; out.extrapolated = false; out.stale = false; return out; }
    let i = a.length - 1; while (i > 1 && a[i - 1].ts > t) i--;
    const A = a[i - 1], B = a[i], span = B.ts - A.ts, u = (t - A.ts) / span, d = span / 1000;
    hermite(A.st, B.st, u, d, out); slerp(A.st.q, B.st.q, u, out.q);
    out.state = u < 0.5 ? A.st : B.st; out.extrapolated = false; out.stale = false; return out;
  }
}
export const newPose = () => ({ p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], state: null, extrapolated: false, stale: false });
function copyPose(s, out) { for (let k = 0; k < 3; k++) { out.p[k] = s.p[k]; out.v[k] = s.v[k]; } for (let k = 0; k < 4; k++) out.q[k] = s.q[k]; }
function hermite(A, B, u, d, out) {
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let k = 0; k < 3; k++) { out.p[k] = h00 * A.p[k] + h10 * d * A.v[k] + h01 * B.p[k] + h11 * d * B.v[k]; out.v[k] = A.v[k] + (B.v[k] - A.v[k]) * u; }
}
export function slerp(a, b, t, out) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3], c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  out[0] = a[0] * k0 + bx * k1; out[1] = a[1] * k0 + by * k1; out[2] = a[2] * k0 + bz * k1; out[3] = a[3] * k0 + bw * k1;
  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1; for (let k = 0; k < 4; k++) out[k] /= n;
  return out;
}
