// Race events -> particles, lights, camera trauma, rumble, HUD cues and audio. Also ion bolts, speed streaks,
// the boost tunnel, ghost playback and per-frame HUD updates.
import { Vec3, Quat, clamp, wrapDelta } from './math.js';
import { shipAxes } from './sim/flight.js';
import { SHIPS, SIM_DT } from './config.js';
import { storeSave } from './input.js';
import { fmt } from './ui.js';

const F = new Vec3(), U = new Vec3(), R = new Vec3(), tmp = new Vec3(), tq = new Quat(), loc = {};
const rnd = s => (Math.random() * 2 - 1) * s;

export class RaceFX {
  constructor(game) { this.g = game; this.flashes = []; this.splitT = 0; this.wwT = 0; this.boltBeep = 0; this.tunnelT = 0; this.hullWarnT = 0; }
  reset(course, race) { this.course = course; this.race = race; this.flashes.length = 0; this.splitT = 0; this.ghostDelta = null; }
  items() { return []; }
  flash(pos, col, range, ttl) { this.flashes.push({ pos: pos.clone(), col, range, ttl, max: ttl }); if (this.flashes.length > 6) this.flashes.shift(); }
  near(p) { return p ? Math.max(0, 1 - this.g.rig.cam.pos.dist(p) / 300) : 0; }

  events(race, silent = false) {
    const g = this.g, sc = g.scene, me = race.player, A = g.audio, ui = g.ui, fx = g.fx, rig = g.rig, att = sc.attract, rm = g.reduced;
    const rumble = (s, w, ms) => { if (g.settings.rumble === 'on' && !att) g.input.rumble(s, w, ms); };
    for (const e of race.events) {
      if (silent && e.type !== 'raceOver') continue;
      const mine = e.r && e.r === me && !att;
      switch (e.type) {
        case 'count': if (!att) { ui.count(e.n); A.play('count'); } break;
        case 'go': if (!att) { ui.count('GO'); A.play('go'); rumble(0.3, 0.5, 200); setTimeout(() => ui.count(''), 700); } break;
        case 'hit': {
          const k = Math.min(1, e.power / 90);
          if (e.power > 10 || mine) fx.sparks(e.pos, e.power, e.r.ship.vel.clone().scale(0.6));
          if (e.kind === 'wall' && this.course.hexHit) this.course.hexHit(e.pos, g.gfx.time);
          if (mine) {
            rig.addTrauma(0.15 + k * 0.55); if (e.power > 45) rig.kick(k);
            A.play(e.power > 22 ? 'hit' : 'scrape', k); rumble(k, 0.3 + k * 0.5, 120 + k * 200);
            if (e.power > 18) this.damageDir(e.pos, me);
            if (e.power > 50 && !rm) document.getElementById('flash').style.opacity = 0.5, clearTimeout(this.fT), this.fT = setTimeout(() => (document.getElementById('flash').style.opacity = 0), 160);
          } else if (this.near(e.pos) > 0.4 && e.power > 30) A.play('hit', k * this.near(e.pos), e.pos);
          break;
        }
        case 'explode': fx.explosion(e.pos, e.r.ship.vel, 1.3); this.flash(e.pos, [9, 4.5, 1.6], 140, 0.8);
          if (mine) { ui.banner('Ship destroyed', 'warn', 1.8); rig.addTrauma(1); rig.kick(1); rumble(1, 1, 600); if (!rm) { g.gfx.post.flash = 0.35; g.gfx.post.flashCol = [1, 0.55, 0.25]; } A.play('explode', 1); }
          else { const n = this.near(e.pos); if (n > 0.02) { A.play('explode', n, e.pos); if (!att) rig.addTrauma(n * 0.6); } }
          break;
        case 'respawn': if (mine) ui.message('Back on course', 'amber', 1.2); break;
        case 'pad': fx.ring(e.r.ship.pos, 1, 14, 0.4, [2.2, 1.4, 0.4, 0.8]); fx.burst(e.r.ship.pos, 14, 30, 0.45, 0.08, [3, 2, 0.6], { streak: 0.05, vel: e.r.ship.vel.clone().scale(0.85) });
          if (mine) { A.play('pad'); ui.message('Speed surge', 'amber', 0.9); rumble(0.2, 0.6, 250); if (!rm) { g.gfx.post.flash = 0.08; g.gfx.post.flashCol = [1, 0.6, 0.2]; } } break;
        case 'driftBoost': if (mine) { A.play('boost'); ui.message('Drift boost', 'good', 0.9); rumble(0.1, 0.5, 200); } break;
        case 'cell': fx.ring(e.pos, 0.5, 9, 0.35, e.ion ? [2.6, 0.7, 2.6, 0.9] : [0.6, 2.4, 2.8, 0.9]); fx.burst(e.pos, 18, 22, 0.5, 0.25, e.ion ? [2.6, 0.7, 2.6] : [0.7, 2.4, 2.8], { drag: 3 });
          if (mine) { A.play('cell'); if (e.ion) ui.message('+1 ion bolt', 'ion', 0.9); } break;
        case 'fire': this.flash(e.pos, [3, 0.9, 3], 30, 0.15); if (mine || this.near(e.pos) > 0.2) A.play('fire', 1, e.pos); break;
        case 'ionHit': fx.burst(e.pos, 30, 30, 0.6, 0.35, [2.6, 0.8, 2.8], { streak: 0.04 }); fx.ring(e.pos, 0.5, 10, 0.3, [2.4, 0.8, 2.6, 0.9]); this.flash(e.pos, [5, 1.5, 5], 50, 0.35);
          if (mine) { ui.message('Ion hit · systems stunned', 'ion', 1.2); A.play('ionHit'); rig.addTrauma(0.5); rumble(0.6, 0.6, 500); this.damageDir(e.pos, me); }
          else if (e.by === me && !att) { ui.message('Target stunned', 'good', 1); A.play('ionHit', 0.6); } break;
        case 'shield': if (mine) { A.play('shield'); ui.message('Shield up', 'good', 0.8); } break;
        case 'shieldBlock': fx.burst(e.pos, 20, 25, 0.4, 0.3, [0.6, 1.6, 2.8]); fx.ring(e.pos, 0.5, 6, 0.3, [0.6, 1.6, 2.8, 0.9]); break;
        case 'laserHit': fx.sparks(e.pos, 60); if (mine) { ui.message('Laser gate', 'warn', 0.9); A.play('hit', 0.6); rig.addTrauma(0.5); rumble(0.7, 0.4, 250); } break;
        case 'boltEnd': fx.burst(e.pos, 8, 18, 0.3, 0.2, [2.4, 0.8, 2.6]); break;
        case 'bump': if (mine) { rig.addTrauma(0.25); A.play('scrape', 0.5); } break;
        case 'checkpoint': if (mine) { A.play('checkpoint'); this.showSplit(e.cp, e.split); } break;
        case 'lap': if (mine) this.onLap(e); break;
        case 'finalLap': if (mine) { ui.banner('Final lap', 'amber', 2.2); A.play('finalLap'); A.music('final'); } break;
        case 'finish': if (mine) { A.play('finish'); ui.banner(race.mode === 'trial' ? 'Run complete' : `P${e.place} · ${fmt(e.time)}`, 'good', 2.8); g.slowmo = 2.5; g.state = 'finishing'; g.rig.orbitA = -0.6; g.hud.show(false); A.music('finish'); } break;
        case 'raceOver': if (!att) this.pendingEnd = true; break;
      }
    }
    race.events.length = 0;
    if (this.pendingEnd && g.slowmo <= 0) { this.pendingEnd = false; g.endRace(); }
  }
  damageDir(pos, me) { const cam = this.g.rig.cam; tmp.subVectors(pos, me.ship.pos); R.crossVectors(cam.fwd, cam.up).normalize(); this.g.hud.damage(Math.atan2(tmp.dot(R), tmp.dot(cam.up))); }
  showSplit(cp, split) {
    const g = this.g, best = g.bestSplits[cp - 1]; g.curSplits[cp - 1] = split; const el = document.getElementById('hSplit');
    if (best != null) { const d = split - best; el.textContent = `CP${cp}  ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`; el.className = 'split ' + (d > 0 ? 'bad' : 'good'); }
    else { el.textContent = `CP${cp}  ${fmt(split)}`; el.className = 'split'; }
    this.splitT = 2.2;
  }
  onLap(e) {
    const g = this.g, ui = g.ui, tid = g.scene.id;
    if (e.best) g.bestSplits = g.curSplits.slice();
    g.curSplits = []; g.audio.play('lap');
    ui.message(e.best && e.lap > 1 ? `Best lap ${fmt(e.time)}` : `Lap ${e.lap} · ${fmt(e.time)}`, e.best ? 'good' : '', 1.6);
    if (g.opts.mode === 'trial') {
      const cur = g.save.ghosts[g.recKey(tid)];
      if (g.rec.length > 20 && (!cur || e.time < cur.lap)) { g.save.ghosts[g.recKey(tid)] = { lap: e.time, ship: SHIPS[g.opts.ship].id, f: g.rec }; storeSave(g.save); ui.message('New ghost saved', 'good', 1.4); }
      g.ghost = g.save.ghosts[g.recKey(tid)] || g.ghost;
      if (g.ghost) g.scene.view.setGhostShip(SHIPS.find(s => s.id === g.ghost.ship) || SHIPS[0]);
    }
    g.rec = []; g.recT = 0;
  }

  frame(dt) {
    const g = this.g, sc = g.scene, race = sc.race, fx = g.fx, me = race.player, cam = g.rig.cam, t = g.t;
    // ion bolts: white-hot core, magenta glow, sparking trail
    for (const p of race.projectiles) {
      fx.bbAdd.add(p.pos.x, p.pos.y, p.pos.z, 0.16, 4, 3.4, 4, 1, p.vel.x, p.vel.y, p.vel.z, 7);
      fx.bbAdd.add(p.pos.x, p.pos.y, p.pos.z, 1.6, 2.2, 0.5, 2.4, 0.7);
      if (Math.random() < 0.7) fx.spawn(p.pos.x, p.pos.y, p.pos.z, rnd(3), rnd(3), rnd(3), 0.35, 0.3, 0.05, 2.2, 0.6, 2.4, 0.8, true, 2);
    }
    for (let k = this.flashes.length - 1; k >= 0; k--) if ((this.flashes[k].ttl -= dt) <= 0) this.flashes.splice(k, 1);
    if (!me || sc.attract || !(g.state === 'race' || g.state === 'finishing' || g.state === 'intro')) return;
    // speed streaks and the boost tunnel
    const s = me.ship, sp = s.vel.len(), boost = s.boosting || s.padTimer > 0, k = clamp((sp - 100) / 110, 0, 1.4) * (g.reduced ? 0.3 : 1);
    shipAxes(s.quat, F, U, R);
    for (let n = 0; n < k * 5; n++) {
      const a = Math.random() * 6.283, rad = 4 + Math.random() * 14, ahead = 25 + Math.random() * 50, c = cam.pos;
      fx.spawn(c.x + F.x * ahead + (R.x * Math.cos(a) + U.x * Math.sin(a)) * rad, c.y + F.y * ahead + (R.y * Math.cos(a) + U.y * Math.sin(a)) * rad, c.z + F.z * ahead + (R.z * Math.cos(a) + U.z * Math.sin(a)) * rad,
        -F.x * sp * 0.2, -F.y * sp * 0.2, -F.z * sp * 0.2, 0.4, 0.03, 0.03, 0.75, 0.82, 0.9, 0.35 * k, true, 0, 0.1);
    }
    if (boost && !g.reduced && (this.tunnelT -= dt) <= 0) { this.tunnelT = 0.045; const p = tmp.copy(s.pos).addScaled(s.vel, 0.28); fx.ring(p, 4.5, 6.5, 0.32, [0.35, 0.7, 1.1, 0.35]); }
  }
  lights(me) {
    const g = this.g, sc = g.scene, out = [];
    if (me && !sc.attract) { const v = sc.view.visOf(me); if (v) { const s = me.ship, b = s.boosting || s.padTimer > 0, a = s.def.accent; shipAxes(v.q, F, U); out.push({ pos: tmp.copy(v.p).addScaled(F, -3).clone(), col: a.map(c => (0.4 + c) * (b ? 3.2 : 1.4)), range: b ? 26 : 16 }); } }
    let best = null, bd = 1e9; for (const p of sc.race.projectiles) { const d = p.pos.dist(g.rig.cam.pos); if (d < bd) { bd = d; best = p; } }
    if (best && bd < 220) out.push({ pos: best.pos.clone(), col: [4, 1.2, 4.4], range: 28 });
    for (const f of this.flashes.slice().reverse()) { if (out.length >= 3) break; const k = f.ttl / f.max; out.push({ pos: f.pos, col: f.col.map(c => c * k), range: f.range }); }
    if (this.course.light) { const l = this.course.light(me, g.rig.cam); if (l) out.push(l); }
    return out.slice(0, 4);
  }
  hud(dt) {
    const g = this.g, sc = g.scene, race = sc.race, me = race.player, hud = g.hud, gfx = g.gfx; if (!me) return;
    this.ghost(dt);
    hud.update(dt, race, me, this.ghostDelta);
    const W = innerWidth, H = innerHeight, m = gfx.vp;
    const project = p => { const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12], y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13], w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
      if (w <= 0.1) return { behind: true }; return { x: (x / w * 0.5 + 0.5) * W, y: (1 - (y / w * 0.5 + 0.5)) * H }; };
    if (g.state === 'race') {
      hud.markers(race, me, project, sc.view.ghost && sc.view.ghost.visible ? sc.view.ghost.pos : null);
      const tg = me.ammo > 0 && !me.finished ? race.findTarget(me, 0.35, 450) : null;
      hud.reticle(tg ? project(tg.ship.pos.clone()) : null, tg && tg.ship.pos.dist(me.ship.pos) < 250);
      const inc = race.projectiles.some(p => p.target === me && p.owner !== me && p.pos.dist(me.ship.pos) < 260); hud.warnBolt(inc);
      if (inc && (this.boltBeep -= dt) <= 0) { this.boltBeep = 0.35; g.audio.play('warn'); }
    } else { hud.reticle(null); hud.warnBolt(false); }
    hud.drawMinimap(race, sc.view.ghost && sc.view.ghost.visible ? sc.view.ghost.pos : null);
    if ((this.splitT -= dt) <= 0) document.getElementById('hSplit').textContent = '';
    if (me.wrongWay && g.state === 'race') { if ((this.wwT -= dt) <= 0) { g.ui.banner('Wrong way', 'ww', 1.3); this.wwT = 1.3; g.audio.play('warn'); } } else this.wwT = 0;
    if (me.stuckT >= 3 && !this.stuckShown) { g.ui.message('Press T to reset', 'amber', 2); this.stuckShown = true; setTimeout(() => (this.stuckShown = false), 3000); }
    if (me.ship.hull < me.ship.def.hull * 0.25 && g.state === 'race' && (this.hullWarnT -= dt) <= 0) { this.hullWarnT = 4; g.audio.play('warn'); g.ui.message('Hull critical', 'warn', 1.2); }
    const zone = sc.track.tunnel[me.ti] ? 'tunnel' : (sc.course.env.reverb || 'open'); if (zone !== this.zone) { this.zone = zone; g.audio.setEnv(zone); }
    const s = me.ship; g.audio.engine(s.vel.len() / s.def.maxSpeed / 1.4, s.throttle, s.boosting || s.padTimer > 0, g.state === 'race' || g.state === 'finishing', s.hull / s.def.hull);
    g.audio.rivals(race.racers.filter(r => r !== me && !r.wrecked).map(r => ({ id: r.id, pos: r.ship.pos, vel: r.ship.vel })), g.rig.cam.pos, me.ship.vel);
  }
  ghost() {
    const g = this.g, sc = g.scene, race = sc.race, me = race.player, gi = sc.view.ghost; this.ghostDelta = null;
    if (!gi) return; gi.visible = false;
    if (!g.ghost || !me || me.lap < 1 || me.finished || race.state !== 'racing') return;
    const f = g.ghost.f, x = (race.time - me.lapStart + clamp(g.acc / SIM_DT, 0, 1) * SIM_DT) / 0.05, i = Math.floor(x);
    if (i >= f.length - 1) return;
    const a = f[i], b = f[i + 1], u = x - i;
    gi.pos.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    gi.quat.set(a[3], a[4], a[5], a[6]).slerp(tq.set(b[3], b[4], b[5], b[6]), u); gi.visible = true;
    sc.track.locate(gi.pos, g.ghostTi || 0, loc, 30); g.ghostTi = loc.i;
    this.ghostDelta = -wrapDelta(me.s - loc.s, sc.track.length) / Math.max(50, me.ship.vel.len());
  }
}
