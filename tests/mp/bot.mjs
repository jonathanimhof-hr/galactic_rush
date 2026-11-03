// Test client for the multiplayer server: a real WebSocket connection through the game's own Connection class, and a
// real race through the game's own simulation (src/sim/race.js, flown by the game's autopilot). It sends exactly what
// the browser game sends (sync.js), so the server cannot tell it from a game. `speed` runs the race clock faster for
// tests against a server started with the same GR_TIME_SCALE. These clients exist only for automated tests.
import { performance } from 'node:perf_hooks';
import { Connection } from '../../src/mp/net.js';
import { C, S } from '../../src/mp/protocol.js';
import { Race } from '../../src/sim/race.js';
import { getTrack } from '../../src/sim/tracks.js';
import { SIM_DT } from '../../src/config.js';
import { localState } from '../../src/mp/sync.js';

export class Bot {
  constructor({ url, name, ship = 'kestrel', skill = 0.85, speed = 1, retryForMs = 30000, cheat = null, WebSocketImpl }) {
    this.url = url; this.name = name; this.ship = ship; this.skill = skill; this.speed = speed; this.cheat = cheat; this.retryForMs = retryForMs; this.WS = WebSocketImpl;
    this.inbox = []; this.waiters = []; this.pid = null; this.token = null; this.lobby = null; this.race = null; this.rid = null; this.startLocal = 0;
    this.sendRace = true; this.finishSent = null; this.official = null; this.results = []; this.completes = []; this.complete = null; this.errors = []; this.notices = [];
    this.states = new Map(); this.snapPids = new Set(); this.timer = null; this.prepares = []; this.welcomes = []; this.connStates = [];
  }
  log(...a) { if (process.env.BOT_LOG) console.log(`[${this.name}]`, ...a); }
  connect() {
    this.conn = new Connection({ url: this.url, now: () => performance.now(), retryForMs: this.retryForMs, ...(this.WS ? { WebSocketImpl: this.WS } : {}),
      hello: () => ({ name: this.name, token: this.token || undefined, rid: this.race && !this.race.dead ? this.rid : undefined }) });
    for (const type of [...Object.values(S), 'conn']) this.conn.on(type, m => this.onMsg(type, m));
    this.conn.connect();
    return this.waitFor(S.WELCOME);
  }
  onMsg(type, m) {
    this.inbox.push({ type, m, at: performance.now() });
    switch (type) {
      case 'conn': this.connStates.push(m.state + (m.reason ? ':' + m.reason : '')); if (m.state === 'online') this.resendFinish(); break;
      case S.WELCOME: this.pid = m.pid; this.token = m.token; this.welcomes.push(m); break;
      case S.LOBBY: this.lobby = m.lobby; break;
      case S.LEFT: this.lobby = null; break;
      case S.ERROR: this.errors.push(m.code + (m.reason ? ':' + m.reason : '')); break;
      case S.NOTICE: this.notices.push(m); break;
      case S.PREPARE: this.prepares.push(m); this.prepare(m); break;
      case S.START: if (m.rid === this.rid) { this.startAt = m.startAt; this.startLocal = this.conn.toLocal(m.startAt); } break;
      case S.SNAP: for (const s of m.s) { this.states.set(s[0], s); this.snapPids.add(s[0]); } break;
      case S.FINISHED: if (m.pid === this.pid && m.rid === this.rid) this.official = m.time; break;
      case S.RESULTS: this.results.push(m); if (m.rid === this.rid) this.stopRace(); break; // like the game: the race view closes with the result
      case S.COMPLETE: this.complete = m; this.completes.push(m); this.stopRace(); break;
    }
    for (const w of [...this.waiters]) if (w.specs.some(([t, pred = () => true]) => t === type && pred(m))) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.t); w.resolve(m); }
  }
  // resolves with the first message matching any of [[type, pred], ...] (seen already and unused, or still to come)
  waitAny(specs, timeoutMs = 15000) {
    for (const [type, pred = () => true] of specs) { const seen = this.inbox.find(e => e.type === type && !e.used && pred(e.m)); if (seen) { seen.used = true; return Promise.resolve(seen.m); } }
    return new Promise((resolve, reject) => {
      const w = { specs, resolve: m => { const e = this.inbox.find(x => x.m === m); if (e) e.used = true; resolve(m); } };
      w.t = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error(`${this.name}: timed out waiting for ${specs.map(s => s[0]).join(' or ')}`)); }, timeoutMs);
      this.waiters.push(w);
    });
  }
  waitFor(type, pred = () => true, timeoutMs = 15000) { return this.waitAny([[type, pred]], timeoutMs); }
  send(type, payload) { return this.conn.send(type, payload); }
  create(opts = {}) { this.send(C.CREATE, { ship: this.ship, visibility: opts.visibility || 'private', handling: opts.handling || 'relaxed', ...(opts.name ? { name: opts.name } : {}) }); return this.waitAny([[S.LOBBY], [S.ERROR]]); }
  join(code) { this.send(C.JOIN, { code, ship: this.ship }); return this.waitAny([[S.LOBBY, l => l.lobby.code === String(code).toUpperCase().replace(/[\s-]/g, '')], [S.ERROR]]); }
  ready(on = true) { this.send(C.READY, { ready: on }); }

  // ---------- racing ----------
  prepare(m) {
    this.stopRace(); this.rid = m.rid; this.finishSent = null; this.official = null; this.startLocal = 0;
    const mine = m.grid.find(g => g.pid === this.pid), st = m.status && m.status[this.pid];
    if (!mine || (st && (st.startsWith('out:') || st === 'finished'))) { this.spectating = true; return; }
    this.spectating = false;
    const racers = m.grid.map(g => ({ name: g.name, shipId: g.ship, isPlayer: g.pid === this.pid, skill: this.skill }));
    const race = new Race({ track: getTrack(m.track), laps: m.laps, racers, mode: 'online', seed: m.seed, handling: m.handling, autopilot: true, countdown: 0 });
    race.racers = [race.player]; // only this pilot's ship is simulated here
    race.player.fireCD = 1e9; race.player.ammo = 0;
    this.race = race; this.me = race.player; this.acc = 0; this.lastT = performance.now(); this.lastSend = 0;
    if (this.cheat !== 'noload') this.send(C.LOADED, { rid: m.rid, ok: true });
    this.timer = setInterval(() => this.loop(), 8);
  }
  stopRace() { clearInterval(this.timer); this.timer = null; if (this.race) this.race.dead = true; }
  loop() {
    const now = performance.now(), race = this.race; if (!race || race.dead) return;
    const dt = Math.min(0.25, (now - this.lastT) / 1000); this.lastT = now;
    if (!this.startLocal || now < this.startLocal) return;
    this.acc += dt * this.speed;
    while (this.acc >= SIM_DT) {
      race.step(SIM_DT, null); this.acc -= SIM_DT; race.state = 'racing';
      for (const e of race.events) if (e.type === 'finish' && e.r === this.me && !this.finishSent) {
        this.finishSent = { state: localState(race, this.me), msg: { rid: this.rid, time: this.cheat === 'fast-finish' ? e.time * 0.6 : e.time, laps: this.me.lapTimes.slice(0, 20) } };
        this.resendFinish();
      }
      race.events.length = 0;
    }
    if (this.finishSent && this.official == null) return; // like the game: the finish waits for the server's answer
    if (now - this.lastSend >= 50) { this.lastSend = now; if (this.sendRace) this.sendState(); }
  }
  resendFinish() { if (!this.finishSent || this.official != null || !this.sendRace || !this.conn.online) return; this.send(C.STATE, { rid: this.rid, s: this.finishSent.state }); this.send(C.FINISH, this.finishSent.msg); }
  sendState() {
    const s = localState(this.race, this.me);
    if (this.cheat === 'teleport' && this.race.time > 5) { s[15] += 400; }
    this.send(C.STATE, { rid: this.rid, s });
  }
  // network trouble on purpose: the socket drops; the game keeps racing and reconnects by itself
  dropConnection() { try { this.conn.ws.close(); } catch (e) { /* closed */ } }
  // stay offline for ms (the network is down), then let the game's own reconnection run
  offlineFor(ms) {
    const c = this.conn, open = c.open.bind(c), until = performance.now() + ms; c.retryForMs = Math.max(c.retryForMs, ms + 30000);
    c.open = () => { const wait = until - performance.now(); if (wait > 0) { c.retryT = setTimeout(() => c.open(), wait); return; } c.open = open; open(); };
    this.dropConnection();
  }
  async leave() { this.send(C.LEAVE, {}); return this.waitFor(S.LEFT); }
  close() { this.stopRace(); for (const w of this.waiters) clearTimeout(w.t); this.waiters = []; if (this.conn) this.conn.close(); }
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
