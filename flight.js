// Arcade flight model. Ship local axes: +Z forward, +Y up, -X right.
import { Vec3, Quat, clamp, damp } from '../math.js';

const F = new Vec3(), U = new Vec3(), R = new Vec3(), tmp = new Vec3(), lat = new Vec3(), dq = new Quat();

export function shipAxes(q, f, u, r) {
  f.set(0, 0, 1).applyQuat(q); u.set(0, 1, 0).applyQuat(q); if (r) r.set(-1, 0, 0).applyQuat(q);
}

export function createShipState(def) {
  return {
    def, pos: new Vec3(), vel: new Vec3(), quat: new Quat(), ang: new Vec3(),
    prevPos: new Vec3(), prevQuat: new Quat(),
    throttle: 1, boost: def.boostCap, boostCD: 0, boosting: false, padTimer: 0, stun: 0,
    drifting: false, driftTime: 0, slip: 0, hull: def.hull, shield: 0, invuln: 0,
  };
}

// env: { up: Vec3 (track up), tan: Vec3 (track tangent), assist: 0..1, sens: number }
// returns an event name or null
export function stepFlight(s, c, dt, env) {
  const P = s.def;
  let ev = null;
  const drift = !!c.drift && s.stun <= 0;
  const mul = (drift ? P.driftTurn : 1) * (env.sens || 1);
  shipAxes(s.quat, F, U, R);
  let tp = clamp(c.pitch, -1, 1) * P.pitchRate * mul;
  let ty = clamp(c.yaw, -1, 1) * P.yawRate * mul;
  let tr = clamp(c.roll, -1, 1) * P.rollRate;
  if (s.stun > 0) { ty += Math.sin(s.stun * 40) * 0.6; }
  // roll auto-level toward track up (keeps flight readable on a keyboard)
  if (Math.abs(c.roll) < 0.05 && env.up) {
    tmp.copy(env.up).addScaled(F, -env.up.dot(F));
    if (tmp.lenSq() > 0.01) { tmp.normalize(); tr += clamp(Math.atan2(tmp.dot(R), tmp.dot(U)) * 4.5, -P.rollRate, P.rollRate); }
  }
  // optional steering assist toward the course direction when not steering
  if (env.assist > 0 && env.tan) {
    const fwd = env.tan.dot(F);
    if (Math.abs(c.yaw) < 0.05) ty += clamp(Math.atan2(env.tan.dot(R), fwd) * env.assist * 1.6, -0.8, 0.8) * P.yawRate;
    if (Math.abs(c.pitch) < 0.05) tp += clamp(Math.atan2(env.tan.dot(U), fwd) * env.assist * 1.6, -0.8, 0.8) * P.pitchRate;
  }
  const k = damp(P.response, dt);
  s.ang.x += (tp - s.ang.x) * k; s.ang.y += (ty - s.ang.y) * k; s.ang.z += (tr - s.ang.z) * damp(P.response * 1.3, dt);
  // local rotation: nose-up = -X axis, yaw-right = -Y axis, roll-right = +Z axis
  const wx = -s.ang.x, wy = -s.ang.y, wz = s.ang.z, wl = Math.hypot(wx, wy, wz);
  if (wl > 1e-6) { dq.setAxisAngle(wx / wl, wy / wl, wz / wl, wl * dt); s.quat.multiply(dq).normalize(); }
  shipAxes(s.quat, F, U, R);

  // velocity: decompose into forward + lateral; lateral bleeds into forward (grip)
  const vf = s.vel.dot(F);
  lat.copy(s.vel).addScaled(F, -vf);
  const vl2 = lat.lenSq();
  const grip = drift ? P.grip * P.driftGrip : P.grip;
  const keep = Math.exp(-grip * dt);
  lat.scale(keep);
  let nvf = (vf >= 0 ? 1 : -1) * Math.sqrt(vf * vf + vl2 * (1 - keep * keep) * P.redirect);
  s.slip = Math.sqrt(vl2) / (Math.abs(vf) + 20);

  // boost energy
  s.boosting = !!c.boost && s.boost > 0.5 && s.stun <= 0 && !c.brake;
  if (s.boosting) { s.boost = Math.max(0, s.boost - P.boostDrain * dt); s.boostCD = 0.7; }
  else if ((s.boostCD -= dt) <= 0) s.boost = Math.min(P.boostCap, s.boost + P.boostRegen * dt);

  let target = clamp(s.throttle, 0, 1) * P.maxSpeed;
  let acc = P.accel;
  if (s.boosting) { target *= P.boostMult; acc *= 1.9; }
  if (s.padTimer > 0) { target *= 1.28; acc *= 2.4; }
  if (drift) target *= 0.94;
  if (s.stun > 0) target *= 0.5;
  if (s.hull < P.hull * 0.25) target *= 0.93;
  if (c.brake) nvf = Math.max(-25, nvf - P.brakeDecel * dt);
  else if (nvf < target) nvf = Math.min(target, nvf + acc * dt);
  else nvf = Math.max(target, nvf - P.drag * dt * (1 + (nvf - target) / 30));
  s.vel.copy(F).scale(nvf).add(lat);

  // drift: reward a held, committed slide with a short boost on release
  if (drift && Math.abs(nvf) > 50) { s.drifting = true; s.driftTime += dt; }
  else if (s.drifting) {
    if (s.driftTime > 0.45) { s.padTimer = Math.max(s.padTimer, Math.min(1.1, 0.3 + s.driftTime * 0.32 * (P.driftTurn / 1.38))); ev = 'driftBoost'; }
    s.drifting = false; s.driftTime = 0;
  }
  s.padTimer = Math.max(0, s.padTimer - dt); s.stun = Math.max(0, s.stun - dt);
  s.shield = Math.max(0, s.shield - dt); s.invuln = Math.max(0, s.invuln - dt);
  s.pos.addScaled(s.vel, dt);
  return ev;
}
