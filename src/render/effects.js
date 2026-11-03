// Particles drawn as soft, depth-faded billboards (additive light and alpha-blended smoke batches).
// Billboard size is capped relative to screen height in the vertex shader, so nothing can white-out the view.
import { Vec3 } from '../math.js';

const ZERO = new Vec3();
const rnd = s => (Math.random() * 2 - 1) * s;
function rndDir() { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); return { x: s * Math.cos(a), y: u, z: s * Math.sin(a) }; }

export class Effects {
  constructor(gfx) {
    this.bbAdd = gfx.billboards(9000); this.bbNorm = gfx.billboards(3500); this.bbHaze = gfx.billboards(400); // haze: big soft clouds, drawn at half resolution (V6)
    this.p = []; this.free = []; this.scale = 1; this.max = 5000;
  }
  // kind: 0 plain, 1 streak, 2 ring. emit: optional trail emitter {rate, life, size, col, add}
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, add = true, drag = 0, streak = 0, grav = 0, emit = null) {
    if (this.p.length >= this.max) return null;
    const p = this.free.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.life = life; p.s0 = s0; p.s1 = s1;
    p.r = r; p.g = g; p.b = b; p.a = a; p.add = add; p.drag = drag; p.streak = streak; p.grav = grav; p.emit = emit; p.acc = 0; p.ring = false; p.cool = 0;
    this.p.push(p); return p;
  }
  burst(pos, n, speed, life, size, col, o = {}) {
    n = Math.max(1, Math.round(n * this.scale));
    for (let k = 0; k < n; k++) {
      const v = rndDir(), sp = speed * (0.3 + Math.random() * 0.7), base = o.vel || ZERO;
      const p = this.spawn(pos.x + rnd(o.spread || 0), pos.y + rnd(o.spread || 0), pos.z + rnd(o.spread || 0), base.x + v.x * sp, base.y + v.y * sp, base.z + v.z * sp, life * (0.55 + Math.random() * 0.6),
        size * (0.7 + Math.random() * 0.6), o.s1 ?? size * 0.2, col[0], col[1], col[2], col[3] ?? 1, o.add ?? true, o.drag ?? 2, o.streak ?? 0, o.grav ?? 0, o.emit || null);
      if (p && o.cool) p.cool = o.cool;
    }
  }
  ring(pos, size0, size1, life, col) { const p = this.spawn(pos.x, pos.y, pos.z, 0, 0, 0, life, size0, size1, col[0], col[1], col[2], col[3] ?? 1, true, 0, 0); if (p) p.ring = true; }
  sparks(pos, power, vel) {
    this.burst(pos, Math.min(36, 5 + power * 0.32), 18 + power * 0.7, 0.5, 0.06, [3.2, 1.9, 0.8], { streak: 0.045, drag: 2.2, vel, grav: 14, s1: 0.03 });
    if (power > 25) this.burst(pos, 2, 3, 0.25, 0.9, [2.4, 1.4, 0.6], { s1: 0.2, vel });
  }
  scrape(pos, vel) { this.burst(pos, 4, 12, 0.35, 0.05, [3, 1.8, 0.7], { streak: 0.05, vel, grav: 10, drag: 3 }); }
  smoke(pos, vel, size, life = 1.6, dark = 0.12) { const p = this.spawn(pos.x + rnd(0.3), pos.y + rnd(0.3), pos.z + rnd(0.3), vel.x + rnd(1.5), vel.y + rnd(1.5) + 1, vel.z + rnd(1.5), life, size, size * 3.2, dark, dark * 0.95, dark * 0.92, 0.5, false, 1.2); return p; }
  // fireball, rolling smoke, burning debris with smoke trails, shockwave ring
  explosion(pos, vel, k = 1) {
    const v = vel || ZERO, vv = { x: v.x * 0.35, y: v.y * 0.35, z: v.z * 0.35 };
    this.burst(pos, 3, 2, 0.18, 2.2 * k, [9, 7, 5], { s1: 6 * k, vel: vv, drag: 6 });
    this.burst(pos, 16, 9 * k, 0.9, 1.8 * k, [3.4, 1.5, 0.45], { s1: 4.8 * k, vel: vv, drag: 3.5, spread: 0.8 * k });
    this.burst(pos, 12, 6 * k, 2.6, 1.6 * k, [0.09, 0.085, 0.085, 0.75], { s1: 7 * k, add: false, drag: 1.4, vel: vv, spread: 1.2 * k });
    this.burst(pos, 26, 55 * k, 0.8, 0.07, [3.5, 2.2, 1], { streak: 0.04, drag: 1.2, vel: vv, grav: 9 });
    this.burst(pos, 7, 26 * k, 2.2, 0.35, [3, 1.4, 0.4], { drag: 0.7, vel: vv, grav: 7, emit: { rate: 40, life: 0.9, size: 0.45, s1: 1.8, col: [0.12, 0.11, 0.11, 0.5], add: false, fire: true } });
    this.ring(pos, 0.8 * k, 26 * k, 0.55, [1.6, 1.1, 0.75, 0.9]);
  }
  update(dt) {
    const A = this.bbAdd, Nb = this.bbNorm, ps = this.p;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.t += dt;
      if (p.t >= p.life) { ps[k] = ps[ps.length - 1]; ps.pop(); p.emit = null; this.free.push(p); continue; }
      const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.emit) {
        p.acc += dt * p.emit.rate;
        while (p.acc > 1) { p.acc--; const e = p.emit, c = e.col; this.spawn(p.x, p.y, p.z, rnd(0.6), rnd(0.6) + 0.8, rnd(0.6), e.life, e.size, e.s1, c[0], c[1], c[2], c[3], e.add, 1.5);
          if (e.fire) this.spawn(p.x, p.y, p.z, 0, 0, 0, 0.18, 0.5, 0.15, 2.6, 1.2, 0.35, 0.8, true, 0); }
      }
      const u = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * (p.add ? u : 1 - (1 - u) * (1 - u)), fade = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
      let r = p.r, g = p.g, b = p.b;
      if (p.cool) { const c = Math.max(0, 1 - u * p.cool); r *= c; g *= c * c; b *= c * c * c; }
      const B = p.add ? A : Nb;
      if (p.ring) B.add(p.x, p.y, p.z, s, r, g, b, p.a * (1 - u) * (1 - u), 0, 0, 0, -1);
      else if (p.streak) B.add(p.x, p.y, p.z, s, r, g, b, p.a * fade, p.vx, p.vy, p.vz, Math.hypot(p.vx, p.vy, p.vz) * p.streak + 0.05);
      else B.add(p.x, p.y, p.z, s, r, g, b, p.a * fade);
    }
  }
  begin() { this.bbAdd.n = 0; this.bbNorm.n = 0; this.bbHaze.n = 0; }
  clear() { for (const p of this.p) p.emit = null; this.free.push(...this.p); this.p.length = 0; }
}
export { rnd };
