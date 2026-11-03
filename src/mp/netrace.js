// GALACTIC RUSH V8 — one online race in the game. It uses the game's own Race, RaceView, HUD, camera and effects:
// the local pilot's ship is simulated exactly as in single-player, and the other pilots are ordinary racers whose
// ships are posed from the server's states instead of being simulated here. The Race and the view are wrapped at
// run time, not changed: during each simulation step the remote racers are taken out of the list the step simulates
// and put back for bumps with the local ship and for the standings. The start is the server's: the countdown follows
// the server clock, so every game says GO at the same moment. The local end of race is ignored; the server ends it.
import { Vec3 } from '../math.js';
import { Race } from '../sim/race.js';
import { getTrack } from '../sim/tracks.js';
import { resolveLivery } from '../progress/customize.js';
import { C, unpackState, MP } from './protocol.js';
import { localState, applyRemote } from './sync.js';
import { SnapBuffer, newPose } from './interp.js';
import { cleanPaint } from './paint.js';
import { devPage } from './config.js';

const now = () => performance.now(), loc = {};
const COUNT_FROM = 3.7; // the game's 3-2-1 runs in the last seconds before the server's start time

// a pilot's paint job as the game draws it (V7 customisation), with their grid number and name on the band
export function mpLivery({ ship, paint, name }, number) {
  const { decalSlot, ...lv } = resolveLivery(ship, cleanPaint(paint, ship).paint); // decalSlot is the garage's own decal: not shared with online pilots
  return { ...lv, number, callsign: name };
}

export class NetRace {
  // m: the server's prepare message for this race
  constructor(mp, m) {
    this.mp = mp; this.g = mp.g; this.conn = mp.conn; this.m = m; this.rid = m.rid; this.stage = m.stage;
    this.startLocal = 0; this.synced = false; this.frameT = -1; this.lastSend = 0;
    this.official = null; this.adjusted = false; this.provisional = null; this.finishedAt = 0; this.finishState = null; this.watched = false;
    this.out = null; this.over = false; this.follow = null; this.firstFin = null; this.closeAt = 0;
    const st = (m.status || {})[mp.pid];
    this.participant = m.grid.some(e => e.pid === mp.pid) && !(st && (st.startsWith('out:') || st === 'finished'));
    this.build();
  }
  // watching someone else's ship (eliminated, out of the race, or after the finish line)
  get spectating() { return !!this.follow && this.race.player === this.follow; }
  get canWatch() { return !this.participant || !!this.out || !!(this.me && this.me.finished); }

  build() {
    const g = this.g, m = this.m, me = this.mp.pid, track = getTrack(m.track);
    // factory stats for everyone online (no upgrades); paint jobs are cosmetic
    const racers = m.grid.map((e, k) => e.pid === me && this.participant ? { name: e.name, shipId: e.ship, isPlayer: true, livery: mpLivery(e, k + 1) } : { name: e.name, shipId: e.ship, skill: 0.8 });
    const race = new Race({ track, laps: m.laps, racers, mode: 'online', seed: m.seed, handling: m.handling, assist: +g.settings.assist, sens: +g.settings.sens, autopilot: g.autotest && devPage(), countdown: 99 });
    race.racers.forEach((r, k) => {
      const e = m.grid[k]; r.pid = e.pid; r.ammo = 0; r.fireCD = 1e9; // ion bolts are off online
      if (r !== race.player) r.remote = { pid: e.pid, base: e.name, buf: new SnapBuffer(), pose: newPose(), lost: false, out: null, fin: null, lap: 0, located: false, at: new Vec3(), wreck: false };
    });
    this.race = race; this.me = race.player; this.byPid = new Map(race.racers.map(r => [r.pid, r]));
    this.all = race.racers.slice(); this.local = this.all.filter(r => !r.remote); this.remotes = this.all.filter(r => r.remote);
    g.opts.mode = 'online';
    g.courseScene(m.track, race, false);
    const sc = g.scene; sc.mp = this; this.view = sc.view;
    race.racers.forEach((r, k) => {
      if (!r.remote) return;
      const e = m.grid[k], v = sc.view.byRacer.get(r); if (v) v.sv.setLivery(mpLivery(e, k + 1));
      const p = cleanPaint(e.paint, e.ship).paint; if (p && /^#[0-9a-f]{6}$/i.test(p.primary || '')) r.paintCss = p.primary;
    });
    const step = race.step.bind(race), upd = sc.view.update.bind(sc.view);
    race.step = (dt, pc) => this.step(step, dt, pc);
    sc.view.update = (...a) => { if (!this.over) this.poseRemotes(); return upd(...a); };
    // the same set-up as a single-player start (main.js startRace), without the course flyover
    g.ghost = null; g.rec = []; g.recT = 0; g.ghostTi = 0; g.bestSplits = []; g.curSplits = [];
    g.result = null; g.slowmo = 0; g.hud.setupMinimap(track); g.ui.clearMessages();
    g.camMode = g.settings.cam; g.input.capture = true; g.audio.music('race');
    g.endIntro();
    for (const [pid, s] of Object.entries(m.status || {})) if (pid !== me && typeof s === 'string' && s.startsWith('out:')) this.markOut(pid, s.slice(4));
    if (!this.participant) this.spectate(0);
    else this.conn.send(C.LOADED, { rid: this.rid, ok: true });
  }
  destroy() { this.over = true; }

  // ---------- simulation ----------
  step(base, dt, pc) {
    if (this.over) return;
    const race = this.race, t = now(), n0 = race.events.length, counting = race.state === 'countdown';
    if (counting) this.countdown(t);
    race.racers = this.local;
    try { base(dt, this.mp.menuOpen ? null : pc); } finally { race.racers = this.all; }
    if (counting && race.state !== 'countdown') this.goAt = performance.timeOrigin + t; // when this game said GO (wall clock), for checks against the server's start time
    if (this.me) this.me.ammo = 0;
    if (race.state === 'finished') race.state = 'racing'; // only the server ends an online race
    this.poseRemotes();
    if (this.me && this.participant && !this.out && !this.me.wrecked && race.state === 'racing') this.collide();
    race.updateStandings();
    for (let i = race.events.length - 1; i >= n0; i--) {
      const e = race.events[i];
      if (e.type === 'raceOver') race.events.splice(i, 1);
      else if (e.type === 'cell') e.ion = false; // a magenta cell still refills boost; it gives no bolt
      else if (e.type === 'finish' && e.r === this.me && this.participant && !this.out) this.localFinish(e);
    }
    if (this.finishedAt && !this.watched && t - this.finishedAt > 3500) this.afterFinish();
    this.maybeSend(t);
  }
  // before the server's start the grid waits; then the countdown is set from the server's start time (once per frame
  // at most, and only when it has drifted), so the game's own 3-2-1-GO lands on that moment
  countdown(t) {
    const race = this.race;
    if (!this.startLocal) { race.countdown = 99; return; }
    const k = this.g.timeScale || 1, target = ((this.startLocal - t) / 1000) * k + 0.6, first = this.g.t !== this.frameT; this.frameT = this.g.t;
    if (!this.synced) { if (target <= COUNT_FROM) { race.countdown = Math.max(0.6001, target); this.synced = true; } else race.countdown = 99; return; }
    if (first && Math.abs(race.countdown - target) > 0.1 * k) race.countdown = Math.max(0.6001, target);
  }
  // remote ships: drawn a little in the past, between the server's states (interp.js)
  poseRemotes() {
    const ts = this.conn.serverNow(), race = this.race, tr = race.track;
    for (const r of this.remotes) {
      const R = r.remote;
      if (R.buf.a.length) {
        const pose = R.buf.sample(ts - R.buf.delay(), R.pose);
        if (pose) {
          applyRemote(r, pose, pose.state);
          // where the ship is along the course, for the camera and course effects (Race.collideTrack does this for simulated ships)
          const jump = !R.located || r.ship.pos.distSq(R.at) > 3600;
          tr.locate(r.ship.pos, jump ? tr.nearestIndex(r.ship.pos) : r.ti, loc);
          r.ti = loc.i; r.s = loc.s; r.lx = loc.x; r.ly = loc.y; R.located = true; R.at.copy(r.ship.pos);
          // lap times for the HUD while watching this pilot (display only; official times come from the server)
          const lap = pose.state.lap;
          if (lap > R.lap) { if (R.lap >= 1) { const lt = race.time - r.lapStart; if (lt > 0) { r.lapTimes.push(lt); if (lt < r.bestLap) r.bestLap = lt; } } r.lapStart = race.time; R.lap = lap; }
          if (r.wrecked && !R.wreck && !R.out) race.emit('explode', r, { pos: r.ship.pos.clone() }); // their game reported the ship destroyed
          R.wreck = r.wrecked;
        }
      }
      if (R.out) r.wrecked = true;
      if (R.fin != null) { r.finished = true; r.finishTime = R.fin; }
    }
  }
  // bumps between the local ship and a remote ship use the game's own collision code; each game moves only its own
  // ship, so the remote ship is put back where the server says it is
  collide() {
    const race = this.race, me = this.me, a = me.ship;
    for (const rr of this.remotes) {
      const R = rr.remote;
      if (rr.wrecked || R.out || R.lost || !R.buf.a.length || R.pose.stale) continue;
      const b = rr.ship, min = a.def.radius + b.def.radius;
      if (a.pos.distSq(b.pos) >= min * min) continue;
      race.racers = [me, rr];
      try { race.shipCollisions(); } finally { race.racers = this.all; }
      b.pos.copy(b.prevPos);
    }
  }
  maybeSend(t) {
    if (!this.participant || this.out || this.race.state !== 'racing' || t - this.lastSend < 50) return;
    if (this.finishedAt && this.official == null) return; // the finish waits for the server's answer (see resendFinish)
    this.lastSend = t; this.conn.send(C.STATE, { rid: this.rid, s: localState(this.race, this.me) });
  }
  localFinish(e) {
    if (this.finishedAt) return;
    // provisional place until the server's result: remote pilots already over the line, by the server or in this view
    const line = this.race.cpProg(this.race.laps * this.race.track.cpS.length);
    e.place = 1 + this.remotes.filter(r => !r.remote.out && (r.remote.fin != null || r.prog >= line)).length;
    this.provisional = { place: e.place, time: e.time }; this.finishedAt = now();
    this.finishState = localState(this.race, this.me); this.finishMsg = { rid: this.rid, time: e.time, laps: this.me.lapTimes.slice(0, 20) };
    this.resendFinish(); this.mp.bar();
  }
  // also called when the connection comes back: a finish the server has not answered is sent again with the state at the line
  resendFinish() {
    if (!this.finishMsg || this.official != null || this.out || !this.conn.online) return;
    this.conn.send(C.STATE, { rid: this.rid, s: this.finishState }); this.conn.send(C.FINISH, this.finishMsg);
  }
  // after the finish line: watch whoever is still racing, with the HUD back on
  afterFinish() {
    this.watched = true;
    if (this.out || !this.remotes.some(r => !r.remote.out && !r.finished)) return; // nobody left on course: keep the finish camera
    this.spectate(0); this.g.state = 'race'; this.g.hud.show(true);
  }

  // ---------- spectating ----------
  watchable() { return this.remotes.filter(r => !r.remote.out); }
  spectate(dir) {
    const list = this.watchable(); if (!list.length) return false;
    let i = this.follow ? list.indexOf(this.follow) : -1;
    if (i < 0) { const lead = this.race.order.find(r => list.includes(r) && !r.finished) || this.race.order.find(r => list.includes(r)); i = Math.max(0, list.indexOf(lead)); dir = 0; }
    this.follow = list[(i + dir + list.length) % list.length];
    this.race.player = this.follow;
    if (this.g.camMode === 'cockpit') this.g.camMode = 'chase'; // the cockpit view is the local pilot's own
    this.g.rig.snap = true; this.mp.bar(); return true;
  }
  markOut(pid, reason) {
    if (pid === this.mp.pid) { if (this.participant || this.me) this.goOut(reason); return; }
    const r = this.byPid.get(pid); if (!r || !r.remote || r.remote.out) return;
    r.remote.out = reason; r.name = r.remote.base + ' · OUT'; r.wrecked = true;
    if (this.follow === r) { this.follow = null; if (!this.spectate(0) && this.me) this.race.player = this.me; }
    this.mp.bar();
  }
  // the server took this pilot out of the race (disconnected too long, inactive, invalid data, left): watch the rest
  goOut(reason) {
    if (this.out) return;
    this.out = reason; this.participant = false; this.local = [];
    if (this.me) { this.me.wrecked = true; this.me.wreckTimer = 1e9; this.me.name += ' · OUT'; }
    if (this.g.state === 'finishing') this.g.state = 'race';
    this.g.hud.show(true); this.spectate(0); this.mp.bar();
  }

  // ---------- messages ----------
  onStart(m) { if (m.rid === this.rid && Number.isFinite(m.startAt)) { this.startLocal = this.conn.toLocal(m.startAt); this.mp.bar(); } }
  onSnap(m) {
    if (m.rid !== this.rid || !Array.isArray(m.s)) return;
    const arrival = this.conn.serverNow();
    for (const e of m.s) {
      if (!Array.isArray(e) || e.length < 3) continue;
      const r = this.byPid.get(e[0]); if (!r || !r.remote) continue;
      const st = unpackState(e.slice(2)); if (st && Number.isFinite(e[1])) r.remote.buf.push(e[1], st, arrival);
    }
  }
  onFin(m) {
    if (m.rid !== this.rid || !Number.isFinite(m.time)) return;
    if (this.firstFin == null) { // the race closes a while after the first finish (server rules, shown in the bar)
      this.firstFin = m.time; const k = this.mp.serverTimeScale || 1;
      this.closeAt = this.conn.serverNow() + (Math.max(MP.FINISH_WINDOW_S, MP.FINISH_WINDOW_FRAC * m.time) * 1000) / k;
    }
    if (m.pid === this.mp.pid) { this.official = m.time; this.adjusted = !!m.adjusted; if (this.me) this.me.finishTime = m.time; }
    else { const r = this.byPid.get(m.pid); if (r && r.remote) r.remote.fin = m.time; }
    this.mp.bar();
  }
  onStatus(m) {
    if (m.statuses) { if (m.rid === this.rid) for (const [pid, s] of Object.entries(m.statuses)) if (typeof s === 'string' && s.startsWith('out:')) this.markOut(pid, s.slice(4)); return; }
    if (m.rid && m.rid !== this.rid) return;
    if (m.out) { this.markOut(m.pid, m.out); return; }
    const r = this.byPid.get(m.pid); if (!r || !r.remote || !m.conn) return;
    if (m.conn === 'gone') { this.markOut(m.pid, 'left'); return; }
    r.remote.lost = m.conn === 'lost'; if (!r.remote.out) r.name = r.remote.base + (r.remote.lost ? ' · LOST' : '');
    this.mp.bar();
  }
}
