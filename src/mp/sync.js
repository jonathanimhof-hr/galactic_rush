// GALACTIC RUSH V8 — what a racer sends and how a remote racer is shown. The local ship is simulated by the game's
// own Race exactly as in single-player; 20 times a second its state (pose, speed, boost, lap, checkpoint, progress
// and a few visual flags) is packed and sent. Remote racers are ordinary Race racers whose ships are not simulated
// locally but posed from the server's states. Nothing graphical is transmitted.
import { packState, FLAG } from './protocol.js';

export function localState(race, r) {
  const s = r.ship, f = (s.boosting ? FLAG.BOOST : 0) | (s.padTimer > 0 ? FLAG.PAD : 0) | (s.drifting ? FLAG.DRIFT : 0) | (s.shield > 0 ? FLAG.SHIELD : 0)
    | (s.stun > 0 ? FLAG.STUN : 0) | (r.wrecked ? FLAG.WRECK : 0) | (s.invuln > 0 ? FLAG.INVULN : 0) | (r.finished ? FLAG.FINISHED : 0);
  return packState({ t: race.time, p: [s.pos.x, s.pos.y, s.pos.z], q: [s.quat.x, s.quat.y, s.quat.z, s.quat.w], v: [s.vel.x, s.vel.y, s.vel.z],
    b: s.boost / s.def.boostCap, f, lap: r.lap, cp: r.cpNext, prog: r.prog, ay: s.ang.y, hull: s.hull / s.def.hull, thr: s.throttle });
}

// pose: interpolated { p, q, v }; st: the latest state (flags, lap, progress)
export function applyRemote(r, pose, st) {
  const s = r.ship;
  s.pos.set(pose.p[0], pose.p[1], pose.p[2]); s.prevPos.copy(s.pos);
  s.quat.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]); s.prevQuat.copy(s.quat);
  s.vel.set(pose.v[0], pose.v[1], pose.v[2]);
  if (!st) return;
  const f = st.f;
  s.boosting = !!(f & FLAG.BOOST); s.padTimer = f & FLAG.PAD ? 0.3 : 0; s.drifting = !!(f & FLAG.DRIFT);
  s.shield = f & FLAG.SHIELD ? 1 : 0; s.stun = f & FLAG.STUN ? 0.3 : 0; s.invuln = f & FLAG.INVULN ? 0.5 : 0;
  s.boost = st.b * s.def.boostCap; s.hull = st.hull * s.def.hull; s.throttle = st.thr; s.ang.y = st.ay;
  r.wrecked = !!(f & FLAG.WRECK); r.lap = st.lap; r.cpNext = st.cp; r.prog = st.prog;
}
