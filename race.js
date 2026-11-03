// Race simulation: grid, countdown, checkpoints/laps, collisions, pickups, weapons, standings.
import { Vec3, Quat, clamp, makeRng, wrapDelta } from '../math.js';
import { createShipState, stepFlight, shipAxes } from './flight.js';
import { AIPilot } from './ai.js';
import { shipById } from '../config.js';

// Handling profiles. 'classic' is V1's model untouched (V1 ghosts and records stay valid there).
// 'relaxed' slows the whole field, steers the player's nose along the course when not steering,
// eases the player back from the walls and softens wall hits.
export const HANDLING = {
  classic: null,
  relaxed: { speed: 0.74, accel: 0.85, assist: 0.75, guide: 1, wallDmg: 0.35, bounce: 1.12 },
};
const scaleDef = (d, H) => H ? { ...d, maxSpeed: d.maxSpeed * H.speed, accel: d.accel * H.accel, drag: d.drag * H.speed, brakeDecel: d.brakeDecel * H.speed } : d;

const F = new Vec3(), U = new Vec3(), n = new Vec3(), tmp = new Vec3(), loc = {}, near = [];
const NOCTRL = { pitch: 0, yaw: 0, roll: 0, brake: false, boost: false, drift: false, fire: false, shield: false };

export class Race {
  // opts: { track, laps, racers:[{name, shipId, isPlayer, skill, paint}], mode, seed, assist, sens, countdown }
  constructor(opts) { this.opts = opts; this.track = opts.track; this.reset(); }

  reset() {
    const o = this.opts, t = this.track;
    this.H = HANDLING[o.handling] || null;
    this.rng = makeRng(o.seed || 1);
    this.laps = o.laps; this.mode = o.mode || 'race';
    this.time = 0; this.countdown = o.countdown ?? 3.6; this.state = this.countdown > 0 ? 'countdown' : 'racing';
    this.events = []; this.projectiles = []; this.finishOrder = []; this.postFinish = 0;
    for (const c of t.cells) { c.active = true; c.timer = 0; }
    this.racers = o.racers.map((cfg, k) => {
      const def = scaleDef(cfg.def || shipById(cfg.shipId), this.H), ship = createShipState(def); // V7: cfg.def = the player's effective (upgraded) stats, rebuilt from base stats for every race
      const row = Math.floor(k / 2), col = k % 2 ? 1 : -1;
      const gi = t.wrapIdx(-5 - row * 6), lx = col * Math.min(9, t.w[gi] * 0.4), ly = 0;
      t.pointAt(gi, lx, ly, ship.pos); ship.prevPos.copy(ship.pos);
      ship.quat.fromBasis(tmp.copy(t.bin[gi]).scale(-1), t.nrm[gi], t.tan[gi]); ship.prevQuat.copy(ship.quat);
      const r = {
        id: k, name: cfg.name, isPlayer: !!cfg.isPlayer, paint: cfg.paint, livery: cfg.livery, ship, ti: gi, lx, ly, s: gi * t.D,
        prog: -(t.length - gi * t.D), cpNext: 0, lap: 0, lapStart: 0, lapTimes: [], bestLap: Infinity,
        finished: false, finishTime: 0, place: k + 1, wrecked: false, wreckTimer: 0, wrongTime: 0, wrongWay: false,
        stuckT: 0, stuckProg: 0, stuckCheck: 0, ammo: 3, shieldCharges: 2, fireCD: 0, resetCD: 0, ctrl: NOCTRL,
        hits: 0, splits: [],
      };
      if (!cfg.isPlayer || o.autopilot) r.ai = new AIPilot(r, this, cfg.skill ?? 0.8, makeRng((o.seed || 1) * 31 + k));
      return r;
    });
    this.player = this.racers.find(r => r.isPlayer) || null;
    this.updateStandings();
  }

  emit(type, r, extra) { this.events.push({ type, r, ...extra }); }
  laserActive(g, time) { return this.state === 'racing' && ((time + g.phase) % g.period) < g.on; }

  step(dt, playerCtrl) {
    const t = this.track;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown - 0.6);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown - 0.6);
      if (after !== before && after >= 1) this.emit('count', null, { n: after });
      for (const r of this.racers) { r.ship.prevPos.copy(r.ship.pos); r.ship.prevQuat.copy(r.ship.quat); }
      if (this.countdown <= 0.6) { this.state = 'racing'; this.emit('go'); }
      return;
    }
    this.time += dt;
    t.updateObstacles(this.time);
    for (const c of t.cells) if (!c.active && (c.timer -= dt) <= 0) c.active = true;
    for (const r of this.racers) {
      const s = r.ship;
      s.prevPos.copy(s.pos); s.prevQuat.copy(s.quat);
      if (r.wrecked) { if ((r.wreckTimer -= dt) <= 0) this.respawn(r); continue; }
      let c;
      if (r.ai && (!r.isPlayer || this.opts.autopilot || r.finished)) c = r.ai.update(dt);
      else if (r.isPlayer && r.finished) c = NOCTRL;
      else c = playerCtrl || NOCTRL;
      if (r.isPlayer && r.finished && !r.ai) { r.ai = new AIPilot(r, this, 0.75, makeRng(99)); }
      r.ctrl = c;
      if (r.isPlayer && c.throttleDelta) s.throttle = clamp(s.throttle + c.throttleDelta * dt, 0, 1);
      const ev = stepFlight(s, c, dt, { up: t.nrm[r.ti], tan: t.tan[r.ti], assist: r.isPlayer && !r.ai ? Math.max(this.opts.assist ?? 0.3, this.H ? this.H.assist : 0) : 0, sens: r.isPlayer ? this.opts.sens : 1 });
      if (ev) this.emit(ev, r);
      if (this.H && r.isPlayer && !r.ai) this.guide(r, dt);
      this.collideTrack(r);
      this.updateProgress(r, dt);
      this.pickups(r);
      this.weapons(r, c, dt);
      this.watchdogs(r, dt);
      if (s.hull <= 0) this.wreck(r);
    }
    this.shipCollisions();
    this.updateProjectiles(dt);
    this.updateStandings();
    const pl = this.player;
    if (this.state === 'racing') {
      const allDone = this.racers.every(r => r.finished);
      if (pl && pl.finished) this.postFinish += dt;
      if (allDone || (pl && pl.finished && this.postFinish > 3) || (!pl && this.time > 900)) { this.state = 'finished'; this.emit('raceOver'); }
    }
  }

  // ----- collisions with corridor walls and hazards
  collideTrack(r) {
    const t = this.track, s = r.ship, d = s.def;
    const prevS = r.s;
    t.locate(s.pos, r.ti, loc);
    r.ti = loc.i; r.lx = loc.x; r.ly = loc.y; r.dsStep = wrapDelta(loc.s - prevS, t.length); r.s = loc.s;
    const w = t.w[r.ti] - d.radius, h = t.h[r.ti] - d.radius, B = t.bin[r.ti], N = t.nrm[r.ti];
    if (loc.x > w) this.wallHit(r, B, loc.x - w, 1); else if (loc.x < -w) this.wallHit(r, B, -w - loc.x, -1);
    if (loc.y > h) this.wallHit(r, N, loc.y - h, 1); else if (loc.y < -h) this.wallHit(r, N, -h - loc.y, -1);
    t.obstaclesNear(r.ti, near, 1);
    for (const o of near) {
      if (o.type === 'sphere') this.sphereHit(r, o.p, o.r, o.kind === 'mega' ? 0.25 : 0.3);
      else {
        const di = wrapDelta(r.s - o.i * t.D, t.length);
        if (Math.abs(di) > o.r + d.radius + 1) continue;
        const off = o.type === 'hbeam' ? r.ly - o.y : r.lx - o.x, dist = Math.hypot(di, off), min = o.r + d.radius;
        if (dist < min) {
          const ax = o.type === 'hbeam' ? N : B, T = t.tan[o.i];
          n.copy(T).scale(di / (dist || 1)).addScaled(ax, off / (dist || 1)).normalize();
          this.applyHit(r, n, min - dist, 0.4);
        }
      }
    }
    for (const g of t.lasers) {
      const a = wrapDelta(prevS - g.i * t.D, t.length), b = wrapDelta(r.s - g.i * t.D, t.length);
      if (a < 0 && b >= 0 && b < 20 && this.laserActive(g, this.time)) {
        const inSide = g.side === 'L' ? r.lx < 0 : g.side === 'R' ? r.lx > 0 : g.side === 'T' ? r.ly > 0 : r.ly < 0;
        if (inSide) {
          if (s.shield <= 0 && s.invuln <= 0) { s.hull -= 16; s.vel.scale(0.62); s.stun = Math.max(s.stun, 0.35); }
          this.emit('laserHit', r, { pos: s.pos.clone() });
        }
      }
    }
    for (const lane of t.traffic) {
      if (Math.abs(wrapDelta(r.s - lane.i * t.D, t.length)) > 12) continue;
      for (let k = 0; k < lane.n; k++) { t.pointAt(lane.i, t.trafficCarX(lane, k, this.time), lane.y, tmp); this.sphereHit(r, tmp, lane.r, 0.36); }
    }
  }

  // relaxed handling: in the outer quarter of the corridor the player is eased back toward the middle
  guide(r, dt) {
    const t = this.track, s = r.ship, i = r.ti, rad = s.def.radius;
    for (const [off, half, ax] of [[r.lx, t.w[i] - rad, t.bin[i]], [r.ly, t.h[i] - rad, t.nrm[i]]]) {
      const g = Math.abs(off) - half * 0.72; if (g <= 0) continue;
      const k = Math.min(1, g / (half * 0.28)), sg = Math.sign(off), out = Math.max(0, s.vel.dot(ax) * sg);
      s.vel.addScaled(ax, -sg * (this.H.guide * 70 * k + out * 3 * k) * dt);
    }
  }

  wallHit(r, axis, pen, sign) {
    const s = r.ship, vn = s.vel.dot(axis) * sign, soft = this.H && r.isPlayer && !r.ai ? this.H : null;
    s.pos.addScaled(axis, -pen * sign);
    if (vn > 0) {
      s.vel.addScaled(axis, -vn * (soft ? soft.bounce : 1.3) * sign);
      s.vel.scale(1 - Math.min(soft ? 0.12 : 0.25, vn * (soft ? 0.002 : 0.004)));
      const dmg = Math.max(0, vn - 12) * 0.32 * (soft ? soft.wallDmg : 1);
      if (vn > 4) this.damage(r, dmg, vn, n.copy(axis).scale(sign), 'wall');
    }
  }

  sphereHit(r, c, rad, k) {
    const s = r.ship, min = rad + s.def.radius;
    if (s.pos.distSq(c) >= min * min) return;
    n.subVectors(s.pos, c); const d = n.len() || 0.01; n.scale(1 / d);
    this.applyHit(r, n, min - d, k);
  }

  applyHit(r, normal, pen, k) {
    const s = r.ship;
    s.pos.addScaled(normal, pen);
    const vn = -s.vel.dot(normal);
    if (vn > 0) {
      s.vel.addScaled(normal, vn * 1.35); s.vel.scale(0.9);
      if (vn > 4) this.damage(r, Math.max(0, vn - 8) * k, vn, tmp.copy(normal).scale(-1), 'obs');
    }
  }

  damage(r, amount, power, dirOut, kind = 'ship') {
    const s = r.ship;
    if (s.shield > 0 || s.invuln > 0) amount *= 0.1;
    s.hull -= amount / Math.sqrt(s.def.mass); r.hits++;
    this.emit('hit', r, { power, kind, pos: s.pos.clone().addScaled(dirOut, s.def.radius), dmg: amount });
  }

  wreck(r) {
    r.wrecked = true; r.wreckTimer = 1.7; r.ship.hull = 0;
    this.emit('explode', r, { pos: r.ship.pos.clone() });
    r.ship.vel.set(0, 0, 0);
  }

  respawn(r, manual) {
    const t = this.track, s = r.ship, i = t.wrapIdx(r.ti + (manual ? 0 : 3));
    t.obstaclesNear(i, near, 1);
    const spots = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.5, 0.5], [-0.5, -0.5]];
    for (const [fx, fy] of spots) {
      t.pointAt(i, fx * t.w[i], fy * t.h[i], s.pos);
      if (!near.some(o => (o.p && o.p.dist(s.pos) < o.r + 6) || (o.type === 'hbeam' && Math.abs(fy * t.h[i] - o.y) < o.r + 5 && Math.abs(o.i - i) < 4) || (o.type === 'vbeam' && Math.abs(fx * t.w[i] - o.x) < o.r + 5 && Math.abs(o.i - i) < 4))) break;
    }
    s.prevPos.copy(s.pos);
    s.quat.fromBasis(tmp.copy(t.bin[i]).scale(-1), t.nrm[i], t.tan[i]); s.prevQuat.copy(s.quat);
    s.vel.copy(t.tan[i]).scale(s.def.maxSpeed * 0.45); s.ang.set(0, 0, 0);
    if (!manual) s.hull = s.def.hull * 0.6;
    s.invuln = 2; s.stun = 0; r.wrecked = false; r.stuckT = 0; r.wrongTime = 0;
    const prevS = r.s; r.ti = i; t.locate(s.pos, i, loc); r.s = loc.s; r.prog += wrapDelta(r.s - prevS, t.length); r.lx = loc.x; r.ly = loc.y;
    r.resp = (r.resp || 0) + 1; this.emit('respawn', r);
  }

  // ----- progress: ordered checkpoints and laps
  cpProg(g) { const M = this.track.cpS.length; return Math.floor(g / M) * this.track.length + this.track.cpS[g % M]; }

  updateProgress(r, dt) {
    if (r.finished) { r.prog += r.dsStep; return; }
    const prev = r.prog; r.prog += r.dsStep;
    const M = this.track.cpS.length;
    while (r.prog >= this.cpProg(r.cpNext)) {
      const g = r.cpNext++, target = this.cpProg(g);
      const tc = this.time - (r.dsStep > 0 ? dt * clamp((r.prog - target) / r.dsStep, 0, 1) : 0);
      if (g % M === 0) {
        if (g > 0) {
          const lt = tc - r.lapStart; r.lapTimes.push(lt);
          const best = lt < r.bestLap; if (best) r.bestLap = lt;
          this.emit('lap', r, { lap: g / M, time: lt, best });
        }
        r.lapStart = tc; r.lap = g / M + 1; r.splits = [];
        if (g === this.laps * M) {
          r.finished = true; r.finishTime = tc; r.lap = this.laps; this.finishOrder.push(r);
          this.emit('finish', r, { place: this.finishOrder.length, time: tc });
          return;
        }
        if (r.lap === this.laps && this.laps > 1 && g > 0) this.emit('finalLap', r);
      } else { r.splits.push(tc - r.lapStart); this.emit('checkpoint', r, { cp: g % M, split: tc - r.lapStart }); }
    }
    if (r.prog < prev - 0.5 && r.isPlayer) r.backtrack = true;
  }

  // ----- pickups: boost pads and energy cells
  pickups(r) {
    const t = this.track, s = r.ship;
    for (const p of t.pads) {
      const di = wrapDelta(r.s - p.i * t.D, t.length);
      if (di >= 0 && di < r.dsStep + 0.01 && Math.hypot(r.lx - p.x, r.ly - p.y) < p.r) { s.padTimer = 1.3; this.emit('pad', r); }
    }
    for (const c of t.cells) {
      if (!c.active || Math.abs(r.ti - c.i) > 3) continue;
      t.pointAt(c.i, c.x, c.y, tmp);
      if (tmp.distSq(s.pos) < 30) {
        c.active = false; c.timer = 7;
        s.boost = Math.min(s.def.boostCap, s.boost + s.def.boostCap * 0.3);
        if (c.ion) r.ammo = Math.min(5, r.ammo + 1);
        this.emit('cell', r, { ion: c.ion, pos: tmp.clone() });
      }
    }
  }

  // ----- weapons: limited ion bolts and shields
  findTarget(r, cone, range) {
    shipAxes(r.ship.quat, F, U);
    let best = null, bd = range;
    for (const o of this.racers) {
      if (o === r || o.wrecked || o.finished) continue;
      tmp.subVectors(o.ship.pos, r.ship.pos); const d = tmp.len();
      if (d < bd && d > 5 && tmp.dot(F) / d > Math.cos(cone)) { best = o; bd = d; }
    }
    return best;
  }

  weapons(r, c, dt) {
    const s = r.ship;
    r.fireCD -= dt; r.resetCD -= dt;
    if (c.fire && r.ammo > 0 && r.fireCD <= 0 && this.state === 'racing') {
      r.ammo--; r.fireCD = 0.6;
      shipAxes(s.quat, F, U);
      const p = { pos: s.pos.clone().addScaled(F, 4), vel: F.clone().scale(Math.max(0, s.vel.dot(F)) + 520), owner: r, target: this.findTarget(r, 0.35, 450), life: 1.6, ti: r.ti };
      this.projectiles.push(p); this.emit('fire', r, { pos: p.pos.clone() });
    }
    if (c.shield && r.shieldCharges > 0 && s.shield <= 0) { r.shieldCharges--; s.shield = 3; this.emit('shield', r); }
    if (c.reset && r.resetCD <= 0) { r.resetCD = 3; this.respawn(r, true); }
  }

  updateProjectiles(dt) {
    const t = this.track;
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k], tg = p.target;
      p.life -= dt;
      if (tg && !tg.wrecked) {
        tmp.subVectors(tg.ship.pos, p.pos).normalize();
        const sp = p.vel.len(); F.copy(p.vel).scale(1 / sp);
        if (F.dot(tmp) > 0.5) { F.lerp(tmp, Math.min(1, 3.2 * dt)).normalize(); p.vel.copy(F).scale(sp); }
      }
      p.pos.addScaled(p.vel, dt);
      t.locate(p.pos, p.ti, loc, 12); p.ti = loc.i;
      let dead = p.life <= 0 || Math.abs(loc.x) > t.w[p.ti] || Math.abs(loc.y) > t.h[p.ti];
      for (const o of this.racers) {
        if (o === p.owner || o.wrecked || dead) continue;
        if (o.ship.pos.distSq(p.pos) < 20) {
          dead = true;
          if (o.ship.shield > 0) this.emit('shieldBlock', o, { pos: p.pos.clone() });
          else { o.ship.stun = 1.0; o.ship.vel.scale(0.72); o.ship.hull -= 10; this.emit('ionHit', o, { pos: p.pos.clone(), by: p.owner }); }
        }
      }
      if (dead) { this.projectiles.splice(k, 1); this.emit('boltEnd', null, { pos: p.pos.clone() }); }
    }
  }

  shipCollisions() {
    const R = this.racers;
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const A = R[a], B = R[b];
      if (A.wrecked || B.wrecked) continue;
      const sa = A.ship, sb = B.ship, min = sa.def.radius + sb.def.radius;
      if (sa.pos.distSq(sb.pos) >= min * min) continue;
      n.subVectors(sa.pos, sb.pos); const d = n.len() || 0.01; n.scale(1 / d);
      const ma = sa.def.mass, mb = sb.def.mass, pen = min - d;
      sa.pos.addScaled(n, pen * mb / (ma + mb)); sb.pos.addScaled(n, -pen * ma / (ma + mb));
      const rel = sa.vel.dot(n) - sb.vel.dot(n);
      if (rel < 0) {
        const j = -(1.4 * rel) / (1 / ma + 1 / mb);
        sa.vel.addScaled(n, j / ma); sb.vel.addScaled(n, -j / mb);
        const dmg = Math.max(0, -rel - 10) * 0.18;
        if (dmg > 0 || -rel > 6) { this.damage(A, dmg, -rel, tmp.copy(n).scale(-1)); this.damage(B, dmg, -rel, tmp.copy(n)); this.emit('bump', A, { other: B }); }
      }
    }
  }

  watchdogs(r, dt) {
    const t = this.track, s = r.ship;
    shipAxes(s.quat, F, U);
    const back = F.dot(t.tan[r.ti]) < -0.25 && s.vel.dot(t.tan[r.ti]) < 5;
    r.wrongTime = back ? r.wrongTime + dt : 0; r.wrongWay = r.wrongTime > 1.2;
    if ((r.stuckCheck += dt) >= 1) {
      r.stuckCheck = 0;
      if (r.prog - r.stuckProg < 10 && !r.finished) r.stuckT++; else r.stuckT = 0;
      r.stuckProg = r.prog;
      if (r.stuckT >= 3 && (r.ai && !r.isPlayer)) this.respawn(r, true);
    }
  }

  updateStandings() {
    const order = [...this.racers].sort((a, b) => (a.finished || b.finished)
      ? (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : 1)
      : b.prog - a.prog);
    order.forEach((r, k) => { r.place = k + 1; });
    this.order = order;
  }

  // Fast-forward the remaining racers (used once the player has finished)
  simulateToEnd(dt, maxTime = 240) {
    const end = this.time + maxTime;
    while (!this.racers.every(r => r.finished) && this.time < end) { this.step(dt, null); this.events.length = 0; }
    this.state = 'finished';
  }
}
