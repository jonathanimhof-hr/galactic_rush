// Cameras: spring-arm chase, far, cockpit, orbit, broadcast director (attract), pre-race flyover, hangar.
import { Vec3, Quat, clamp, damp } from './math.js';
import { shipAxes } from './sim/flight.js';

const F = new Vec3(), U = new Vec3(), R = new Vec3(), tmp = new Vec3(), tmp2 = new Vec3(), loc = {};
const noise = t => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 3.1 + 1.3) * 0.3 + Math.sin(t * 5.3 + 2.1) * 0.2;
const catmull = (p0, p1, p2, p3, t, out) => { const t2 = t * t, t3 = t2 * t;
  for (const k of ['x', 'y', 'z']) out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3); return out; };

export class CameraRig {
  constructor() {
    this.cam = { pos: new Vec3(0, 40, -80), fwd: new Vec3(0, 0, 1), up: new Vec3(0, 1, 0), fov: 70, near: 0.3, far: 60000 };
    this.off = new Vec3(0, 2, -8); this.offV = new Vec3(); this.look = new Vec3(); this.upS = new Vec3(0, 1, 0);
    this.fovS = 70; this.trauma = 0; this.punch = 0; this.t = 0; this.snap = true; this.roll = 0;
    this.shot = null; this.shotT = 0; this.orbitA = 0;
  }
  addTrauma(k) { this.trauma = Math.min(1, this.trauma + k); }
  kick(k) { this.punch = Math.min(1, this.punch + k); }
  set(pos, at, up, fov) { this.cam.pos.copy(pos); this.cam.fwd.subVectors(at, pos).normalize(); this.cam.up.copy(up || UPV); this.cam.fov = fov; this.fovS = fov; }

  // v: { p (pos), q (quat incl. bank), vel, boost, eye (local eye point), bank } ; track/trackUp optional
  follow(dt, v, mode, opts) {
    const cam = this.cam, s = opts.settings; this.t += dt;
    shipAxes(v.q, F, U, R);
    const sp = v.vel.len(), lookBack = opts.lookBack;
    if (mode === 'cockpit') {
      tmp.set(v.eye.x, v.eye.y, v.eye.z).applyQuat(v.q); cam.pos.copy(v.p).add(tmp);
      cam.fwd.copy(F); if (lookBack) cam.fwd.scale(-1); cam.up.copy(U);
    } else if (mode === 'orbit') {
      this.orbitA += dt * 0.42;
      tmp.copy(v.p).addScaled(R, Math.cos(this.orbitA) * 9).addScaled(F, Math.sin(this.orbitA) * 9).addScaled(U, 2.4);
      if (this.snap) cam.pos.copy(tmp); else cam.pos.lerp(tmp, damp(5, dt));
      cam.fwd.subVectors(v.p, cam.pos).normalize(); this.upS.lerp(U, damp(3, dt)).normalize(); cam.up.copy(this.upS);
    } else {
      const far = mode === 'far', boost = v.boost ? 1 : 0;
      const dist = (far ? 9.5 : 5.6) + sp * (far ? 0.011 : 0.0065) + boost * 0.9, hgt = far ? 2.6 : 1.45;
      // spring the camera offset in world space; the ship's own motion is not lagged, only its rotation and speed changes
      tmp.copy(F).scale(lookBack ? dist : -dist).addScaled(U, hgt);
      if (this.snap) { this.off.copy(tmp); this.offV.set(0, 0, 0); }
      else { const k = 70, c = 2 * Math.sqrt(k) * 0.95; tmp2.subVectors(tmp, this.off).scale(k).addScaled(this.offV, -c); this.offV.addScaled(tmp2, Math.min(dt, 0.05)); this.off.addScaled(this.offV, Math.min(dt, 0.05)); }
      cam.pos.copy(v.p).add(this.off);
      // look-ahead along the velocity, slightly above the ship
      tmp.copy(v.vel); const vl = tmp.len(); if (vl > 1) tmp.scale(1 / vl); else tmp.copy(F);
      if (lookBack) tmp.copy(F).scale(-1);
      this.look.copy(v.p).addScaled(tmp, lookBack ? -14 : 9 + sp * 0.03).addScaled(U, lookBack ? 1.2 : 0.7);
      cam.fwd.subVectors(this.look, cam.pos).normalize();
      // roll partly with the ship and into the bank
      this.upS.lerp(U, this.snap ? 1 : damp(4.5, dt)).normalize();
      this.roll += (clamp(-v.bank * 0.35, -0.3, 0.3) - this.roll) * damp(3, dt);
      tmp.crossVectors(cam.fwd, this.upS).normalize(); cam.up.copy(this.upS).scale(Math.cos(this.roll)).addScaled(tmp, Math.sin(this.roll)).normalize();
    }
    // keep the camera inside solid corridors (trench, tunnels)
    if (opts.track && mode !== 'cockpit') {
      const t = opts.track; t.locate(cam.pos, opts.ti, loc, 16);
      if (t.def.theme === 'trench' || t.tunnel[loc.i]) {
        const w = t.w[loc.i] - 0.9, h = t.h[loc.i] - 0.9, cx = clamp(loc.x, -w, w), cy = clamp(loc.y, -h, h);
        if (cx !== loc.x || cy !== loc.y) cam.pos.addScaled(t.bin[loc.i], cx - loc.x).addScaled(t.nrm[loc.i], cy - loc.y);
      }
    }
    // field of view: speed and boost kick
    const frac = sp / opts.maxSpeed, base = +s.fov || 72;
    const target = mode === 'cockpit' ? base + 4 : base + clamp(frac - 0.5, 0, 1) * 9 + (v.boost ? 7 : 0) - this.punch * 6;
    this.fovS += (target - this.fovS) * (this.snap ? 1 : damp(v.boost ? 5 : 2.5, dt));
    cam.fov = this.fovS;
    this.applyShake(dt, s);
    this.snap = false;
  }
  applyShake(dt, s) {
    const cam = this.cam, k = (s.reducedMotion === 'on' ? 0 : +(s.shake ?? 1));
    if (k > 0) { const t2 = this.t * 0.8, h = 0.0032 * k; tmp.crossVectors(cam.fwd, cam.up).normalize(); cam.fwd.addScaled(tmp, noise(t2 + 3.1) * h).addScaled(cam.up, noise(t2 + 8.7) * h * 0.7).normalize(); } // handheld drift
    if (k > 0 && this.trauma > 0.001) {
      const a = this.trauma * this.trauma * k, t = this.t * 28;
      tmp.crossVectors(cam.fwd, cam.up).normalize();
      cam.pos.addScaled(tmp, noise(t) * a * 0.45).addScaled(cam.up, noise(t + 17) * a * 0.35);
      cam.fwd.addScaled(tmp, noise(t + 31) * a * 0.025).addScaled(cam.up, noise(t + 47) * a * 0.02).normalize();
    }
    if (k > 0 && this.punch > 0.001) cam.pos.addScaled(cam.fwd, -this.punch * 0.6 * k);
    this.trauma = Math.max(0, this.trauma - dt * 1.3); this.punch = Math.max(0, this.punch - dt * 5);
  }

  // Broadcast director for the attract race: chase, dolly, flyby, orbit and heli shots
  broadcast(dt, race, track, visOf) {
    this.t += dt; this.shotT -= dt;
    const pick = () => {
      const pool = race.racers.filter(r => !r.wrecked), r = pool[Math.floor(Math.random() * pool.length)] || race.racers[0];
      const kinds = ['chase', 'dolly', 'flyby', 'orbit', 'heli', 'flyby'], kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.shot = { r, kind, len: kind === 'flyby' ? 6.5 : 5.5 }; this.shotT = this.shot.len; this.snap = true; this.orbitA = Math.random() * 6;
      if (kind === 'flyby') { const i = track.wrapIdx(r.ti + 55 + Math.floor(Math.random() * 25)), side = Math.random() < 0.5 ? -1 : 1, inTrench = track.def.theme === 'trench' || track.tunnel[i];
        this.shot.fixed = track.pointAt(i, side * (inTrench ? track.w[i] * 0.75 : track.w[i] + 10), inTrench ? -track.h[i] * 0.55 : track.h[i] * 0.4); this.shot.fov = 34 + Math.random() * 12; }
    };
    if (!this.shot || this.shotT <= 0 || this.shot.r.wrecked) pick();
    const sh = this.shot, v = visOf(sh.r), cam = this.cam; if (!v) return;
    shipAxes(v.q, F, U, R);
    const ti = sh.r.ti, tU = track.nrm[ti], tB = track.bin[ti], tT = track.tan[ti];
    if (sh.kind === 'chase') { this.follow(dt, v, 'chase', { settings: { fov: 70, shake: 0 }, maxSpeed: 180, track, ti }); return; }
    if (sh.kind === 'orbit') { this.follow(dt, v, 'orbit', { settings: { fov: 60, shake: 0 }, maxSpeed: 180 }); cam.fov = 55; return; }
    let pos = tmp, at = tmp2.copy(v.p), fov = 50;
    if (sh.kind === 'dolly') { const w = track.def.theme === 'trench' ? Math.min(14, track.w[ti] * 0.6) : 14; pos.copy(v.p).addScaled(tB, -w).addScaled(tU, 2.5).addScaled(tT, -3); fov = 46; }
    else if (sh.kind === 'heli') { pos.copy(v.p).addScaled(tU, 55).addScaled(tT, -40).addScaled(tB, 18); fov = 52; }
    else { pos.copy(sh.fixed); fov = sh.fov; }
    if (this.snap) cam.pos.copy(pos); else cam.pos.lerp(pos, sh.kind === 'flyby' ? 1 : damp(6, dt));
    cam.fwd.subVectors(at, cam.pos).normalize(); cam.up.copy(tU); cam.fov = fov; this.fovS = fov; this.snap = false;
  }

  // Pre-race reveal: sweep from high above the first sector back down onto the player's grid slot
  flyover(u, track, player, pv) {
    const cam = this.cam, i0 = player.ti, w = track.w[i0], trench = track.def.theme === 'trench';
    const P = k => track.pointAt(track.wrapIdx(i0 + k), 0, 0);
    shipAxes(pv.q, F, U, R);
    const end = new Vec3().copy(pv.p).addScaled(F, -5.6).addScaled(U, 1.45);
    const pts = [P(170).addScaled(track.nrm[track.wrapIdx(i0 + 170)], trench ? 70 : 110), P(110).addScaled(track.nrm[track.wrapIdx(i0 + 110)], trench ? 45 : 70).addScaled(track.bin[track.wrapIdx(i0 + 110)], w * 1.4),
      P(45).addScaled(track.nrm[track.wrapIdx(i0 + 45)], trench ? 10 : 22).addScaled(track.bin[track.wrapIdx(i0 + 45)], -w * 0.5), P(-6).addScaled(track.nrm[i0], 6), end, end];
    const e = u * u * (3 - 2 * u), seg = Math.min(3.999, e * 4), k = Math.floor(seg), f = seg - k;
    catmull(pts[Math.max(0, k - 1)], pts[k], pts[k + 1], pts[Math.min(5, k + 2)], f, cam.pos);
    const at = new Vec3().lerpVectors(P(20), pv.p, Math.min(1, e * 1.3));
    cam.fwd.subVectors(at, cam.pos).normalize(); cam.up.copy(UPV).lerp(track.nrm[i0], e).normalize(); cam.fov = 60 + (1 - e) * 8; this.fovS = cam.fov;
    this.off.subVectors(cam.pos, pv.p); this.offV.set(0, 0, 0); this.upS.copy(cam.up);
  }
}
const UPV = new Vec3(0, 1, 0);
