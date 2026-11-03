// AI pilot: flies the same physics as the player by producing control inputs.
import { Vec3, Quat, clamp } from '../math.js';

const tmp = new Vec3(), tgt = new Vec3(), qi = new Quat(), near = [];

export class AIPilot {
  constructor(racer, race, skill, rng) {
    this.r = racer; this.race = race; this.skill = skill; this.rng = rng;
    this.ph = rng() * 10; this.px = 0; this.py = 0; this.obs = []; this.fireCD = 3 + rng() * 4;
    this.ctrl = { pitch: 0, yaw: 0, roll: 0, brake: false, boost: false, drift: false, fire: false, shield: false };
    const d = racer.ship.def;
    this.turn = Math.min(d.yawRate, d.pitchRate * 1.05);
    this.decel = d.brakeDecel * 0.7;
    this.maxThrottle = 0.86 + 0.14 * skill;
    this.margin = 0.84 + 0.14 * skill;
  }

  cornerSpeed(i) {
    const t = this.race.track, d = this.r.ship.def;
    const lf = t.w[i] < 30 ? 0.97 : 0.82;
    const kl = Math.max(Math.abs(t.kLatS[i]), Math.abs(t.kLat[i]) * 0.9) * lf + 1e-4, kv = Math.max(Math.abs(t.kVertS[i]), Math.abs(t.kVert[i]) * 0.9) * lf + 1e-4;
    const yr = d.yawRate * 0.92, pr = d.pitchRate * 0.92;
    return Math.min(yr / kl, pr / kv) * this.margin;
  }

  update(dt) {
    const race = this.race, t = race.track, r = this.r, s = r.ship, c = this.ctrl, N = t.N;
    const speed = s.vel.len(), i0 = r.ti;
    // --- speed planning: brake early for upcoming corners
    let vTarget = Infinity, straight = Infinity;
    for (let k = 2; k < 90; k += 2) {
      const i = (i0 + k) % N, dist = k * t.D, vc = this.cornerSpeed(i);
      vTarget = Math.min(vTarget, Math.sqrt(vc * vc + 2 * this.decel * dist));
      if (k < 70) straight = Math.min(straight, vc);
    }
    // --- path planning: racing line, then pick the clearest cross-section slot around obstacles
    const la = clamp(24 + speed * 0.4, 30, 110);
    let ti = (i0 + Math.round(la / t.D)) % N;
    const obs = this.obs; obs.length = 0;
    const arrive = d => d / Math.max(speed, 30);
    t.obstaclesNear(i0 + 24, near, 2);
    for (const o of near) {
      const di = t.deltaS(i0 * t.D, o.i * t.D);
      if (di < 2 || di > 170) continue;
      let x = o.x, y = o.y;
      if (o.move) { const a = (race.time + arrive(di)) * o.move.w + o.move.ph; x += Math.sin(a) * o.move.ax; y += Math.cos(a * 0.8) * o.move.ay; }
      obs.push({ di, i: o.i, k: o.type === 'sphere' ? 0 : o.type === 'hbeam' ? 1 : 2, x, y, r: o.r });
    }
    for (const g of t.lasers) {
      const di = t.deltaS(i0 * t.D, g.i * t.D);
      if (di < 2 || di > 190 || (!race.laserActive(g, race.time + arrive(di)) && this.skill > 0.35)) continue;
      obs.push({ di, i: g.i, k: 3, side: g.side, r: 0 });
    }
    for (const lane of t.traffic) {
      const di = t.deltaS(i0 * t.D, lane.i * t.D);
      if (di < 2 || di > 150) continue;
      for (let k = 0; k < lane.n; k++) obs.push({ di, i: lane.i, k: 0, x: t.trafficCarX(lane, k, race.time + arrive(di)), y: lane.y, r: lane.r + 1.5 });
    }
    for (const o of race.racers) {
      if (o === r || o.wrecked) continue;
      const di = o.prog - r.prog;
      if (di > 4 && di < 50) obs.push({ di, i: o.ti, k: 0, x: o.lx, y: o.ly, r: 2.8 });
    }
    const lx = t.lineX[ti], ly = t.lineY[ti];
    let bx = lx, by = ly, nearI = -1, nearD = Infinity;
    if (obs.length) {
      const W = Math.min(t.w[i0], t.w[ti]) * 0.66, H = Math.min(t.h[i0], t.h[ti]) * 0.66, pad = 4.6 + this.skill * 1.6;
      const pen = (cx, cy) => {
        let p = 0;
        for (const o of obs) {
          const wgt = 1.6 - o.di / 170;
          let d;
          if (o.k === 0) d = Math.hypot(cx - o.x, cy - o.y) - o.r - pad;
          else if (o.k === 1) d = Math.abs(cy - o.y) - o.r - pad;
          else if (o.k === 2) d = Math.abs(cx - o.x) - o.r - pad;
          else d = (o.side === 'L' ? cx : o.side === 'R' ? -cx : o.side === 'T' ? -cy : cy) - 4;
          if (d < 0) p += (2 - d) * wgt;
        }
        return p;
      };
      let best = Infinity;
      const tryC = (cx, cy) => {
        const sc = pen(cx, cy) * 6 + Math.hypot(cx - lx, cy - ly) * 0.05 + Math.hypot(cx - this.px, cy - this.py) * 0.14;
        if (sc < best) { best = sc; bx = cx; by = cy; }
      };
      tryC(lx, ly); tryC(this.px, this.py);
      for (let gx = -3; gx <= 3; gx++) for (let gy = -2; gy <= 2; gy++) tryC((gx / 3) * W, (gy / 2) * H);
      this.blocked = best > 6;
      if (bx !== lx || by !== ly) for (const o of obs) if (o.di < nearD && o.k !== 3) { nearD = o.di; nearI = o.i; }
    } else this.blocked = false;
    const ka = Math.min(1, (obs.length ? 7 : 4) * dt);
    this.px += (bx - this.px) * ka; this.py += (by - this.py) * ka;
    if (nearI >= 0 && nearD < la) ti = t.wrapIdx(nearI + 2);
    const wantX = clamp(this.px, -t.w[ti] + 4, t.w[ti] - 4), wantY = clamp(this.py, -t.h[ti] + 4, t.h[ti] - 4);
    t.pointAt(ti, wantX, wantY, tgt);
    // --- steering toward target in ship-local space
    tmp.subVectors(tgt, s.pos).applyQuat(qi.copy(s.quat).conjugate());
    const yawErr = Math.atan2(-tmp.x, tmp.z), pitchErr = Math.atan2(tmp.y, tmp.z);
    const wob = (1 - this.skill) * 0.22 * Math.sin(race.time * 1.3 + this.ph);
    c.yaw = clamp(yawErr * 2.6 - s.ang.y * 0.18 + wob, -1, 1);
    c.pitch = clamp(pitchErr * 2.6 - s.ang.x * 0.18, -1, 1);
    c.roll = 0;
    // --- throttle / brake / drift / boost
    const lim = this.blocked ? Math.min(vTarget, 120) : vTarget;
    s.throttle = clamp(Math.min(lim, s.def.maxSpeed) / s.def.maxSpeed, 0.35, this.maxThrottle);
    c.brake = speed > lim + 6;
    const needTurn = Math.max(Math.abs(yawErr), Math.abs(pitchErr));
    c.drift = false;
    const boostOK = s.boost > (this.skill > 0.7 ? 20 : 60) && straight > s.def.maxSpeed * 1.15 && needTurn < 0.25 && !c.drift;
    c.boost = boostOK && (this.skill > 0.4 || s.boost > s.def.boostCap * 0.9);
    // --- weapons
    this.fireCD -= dt; c.fire = false; c.shield = false;
    if (this.fireCD <= 0 && r.ammo > 0) {
      const tg = race.findTarget(r, 0.22, 320);
      if (tg && this.rng() < 0.5 + this.skill * 0.4) { c.fire = true; this.fireCD = 5 + this.rng() * 6; } else this.fireCD = 0.5;
    }
    for (const p of race.projectiles) if (p.target === r && p.pos.dist(s.pos) < 110 && r.shieldCharges > 0 && this.rng() < this.skill * 0.08) c.shield = true;
    return c;
  }
}
