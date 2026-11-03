// GALACTIC RUSH V8 server — connections and sessions. Every message from a game is size-checked, parsed, validated
// against the shared protocol and rate-limited before it can touch a lobby or a tournament; the hub then routes it,
// broadcasts what changed, relays ship states 20 times a second and runs the timers (start, timeouts, grace periods).
import { randomInt } from 'node:crypto';
import { parseMessage, checkClientMessage, normalizeName, normalizeCode, C, S, PROTOCOL, MP } from '../src/mp/protocol.js';
import { LobbyRegistry, LOBBY_RULES } from './lobby.mjs';
import { Tournament, TOURNAMENT_RULES } from './tournament.mjs';
import { RACE_RULES } from './race.mjs';
import { createMapPicker, cryptoRng } from './maps.mjs';
import { newPid, newId } from './identity.mjs';

export const HUB_RULES = Object.freeze({
  helloTimeoutMs: 10000,
  bucketSize: 60, bucketRate: 45,       // messages: a burst of 60, then 45 a second (ship states are 20 a second)
  floodLimit: 400, floodWindowMs: 10000, // dropped messages that close the connection
  sessionIdleMs: 30 * 60000,
  lastResultMs: 10 * 60000,            // a pilot who reconnects within this time still gets the tournament result
});

export class Hub {
  // the *Rules options exist for automated tests (shorter waits); the server itself always runs with the defaults
  constructor({ cfg, identity, log, now = () => Date.now(), mapRng = cryptoRng, rand = n => randomInt(n), rules = HUB_RULES, lobbyRules = LOBBY_RULES, tournamentRules = TOURNAMENT_RULES, raceRules = RACE_RULES }) {
    this.cfg = cfg; this.ident = identity; this.log = log; this.now = now; this.rand = rand; this.rules = rules;
    this.lobbyRules = lobbyRules; this.tournamentRules = tournamentRules; this.raceRules = raceRules;
    this.sessions = new Map(); this.conns = new Set(); this.lobbies = new LobbyRegistry({ max: cfg.maxLobbies });
    this.maps = createMapPicker({ eligible: cfg.eligibleTracks, rng: mapRng });
    this.stats = { messages: 0, rejected: 0, connections: 0, bytesIn: 0, bytesOut: 0 }; // bytes: message text, without WebSocket framing
  }

  // ---------- transport ----------
  // socket: { send(text, droppable), close(code, reason) }; returns the handlers the transport calls
  connect(socket, meta = {}) {
    const now = this.now(), conn = { id: newId('c'), socket, session: null, tokens: this.rules.bucketSize, refillAt: now, drops: [], meta, open: true, lastErr: 0 };
    this.conns.add(conn); this.stats.connections++;
    conn.helloTimer = setTimeout(() => { if (!conn.session && conn.open) this.closeConn(conn, 4001, 'hello timeout'); }, this.rules.helloTimeoutMs);
    if (conn.helloTimer.unref) conn.helloTimer.unref();
    return { message: text => this.onMessage(conn, text), close: () => this.onClose(conn), rtt: ms => this.rtt(conn, ms) };
  }
  send(conn, msg, droppable = false) { if (conn && conn.open) conn.socket.send(JSON.stringify(msg), droppable); }
  sendTo(pid, msg, droppable) { const s = this.sessions.get(pid); if (s && s.conn) this.send(s.conn, msg, droppable); }
  error(conn, code, extra) { this.send(conn, { t: S.ERROR, code, ...extra }); }
  closeConn(conn, code, reason) { if (!conn.open) return; try { conn.socket.close(code, reason); } catch (e) { /* already closed */ } this.onClose(conn); }

  onMessage(conn, text) {
    if (!conn.open) return;
    const now = this.now(), R = this.rules;
    conn.tokens = Math.min(R.bucketSize, conn.tokens + ((now - conn.refillAt) / 1000) * R.bucketRate); conn.refillAt = now;
    if (conn.tokens < 1) {
      conn.drops = conn.drops.filter(t => now - t < R.floodWindowMs); conn.drops.push(now);
      if (conn.drops.length > R.floodLimit) { this.log.warn('flood: closing connection', { pid: conn.session && conn.session.pid }); this.closeConn(conn, 1008, 'too many messages'); return; }
      if (now - conn.lastErr > 1000) { conn.lastErr = now; this.error(conn, 'rate'); }
      return;
    }
    conn.tokens -= 1; this.stats.messages++;
    const { msg, error } = parseMessage(typeof text === 'string' ? text : String(text));
    if (error || !checkClientMessage(msg)) { this.stats.rejected++; this.error(conn, (msg && msg.t === C.HELLO && msg.v !== PROTOCOL) ? 'version' : 'bad-msg', { for: msg && typeof msg.t === 'string' ? msg.t.slice(0, 16) : undefined }); return; }
    if (msg.t === C.HELLO) { this.hello(conn, msg, now); return; }
    if (!conn.session) { this.error(conn, 'hello-first'); return; }
    const s = conn.session; s.lastSeen = now;
    try { this.handle(s, conn, msg, now); }
    catch (e) { this.log.error('handler failed', { t: msg.t, err: String(e && e.stack || e) }); this.error(conn, 'bad-msg'); }
  }
  onClose(conn) {
    if (!conn.open) return; conn.open = false; clearTimeout(conn.helloTimer); this.conns.delete(conn);
    const s = conn.session; if (!s || s.conn !== conn) return;
    s.conn = null; s.lastSeen = this.now();
    const l = this.lobbyOf(s);
    if (l) {
      const m = l.members.get(s.pid); if (m) { m.conn = 'lost'; m.lostAt = this.now(); }
      if (l.tournament) { l.tournament.connLost(s.pid, this.now()); this.broadcast(l, { t: S.STATUS, pid: s.pid, conn: 'lost' }); }
      this.pushLobby(l);
    }
  }

  // ---------- sessions ----------
  lobbyOf(s) { return s && s.lobbyId ? this.lobbies.byId.get(s.lobbyId) || null : null; }
  hello(conn, m, now) {
    if (conn.session) { this.error(conn, 'bad-msg'); return; }
    const name = normalizeName(m.name);
    if (!name) { this.error(conn, 'bad-name'); return; }
    let pid = m.token ? this.ident.verify(m.token) : null, s = pid ? this.sessions.get(pid) : null;
    if (s && s.conn && s.conn !== conn) { const old = s.conn; s.conn = null; this.send(old, { t: S.NOTICE, kind: 'replaced' }); try { old.socket.close(4002, 'signed in elsewhere'); } catch (e) { /* closed */ } old.open = false; this.conns.delete(old); }
    if (!s) { pid = pid || newPid(); s = { pid, name, conn: null, lobbyId: null, rtt: 0, lastSeen: now, createdAt: now }; this.sessions.set(pid, s); }
    clearTimeout(conn.helloTimer); conn.session = s; s.conn = conn; s.lastSeen = now;
    const l = this.lobbyOf(s); if (!l) s.name = name;
    this.send(conn, { t: S.WELCOME, pid, token: this.ident.issue(pid), name: s.name, now, timeScale: this.cfg.timeScale, resumed: !!l, protocol: PROTOCOL });
    if (l) {
      const mem = l.members.get(pid);
      if (mem) { mem.conn = 'ok'; mem.lostAt = 0; }
      if (l.tournament) { l.tournament.connBack(pid, now, m.rid || null); this.broadcast(l, { t: S.STATUS, pid, conn: 'ok' }); this.resendRace(l, s, m.rid || null); }
      this.pushLobby(l);
      if (l.last && l.last.forPids.has(pid) && now - l.last.at < this.rules.lastResultMs && !l.tournament) this.sendComplete(l, l.last.summary, [pid]);
    }
    this.log.info('hello', { pid, resumed: !!l });
  }
  // a pilot who reconnects during a tournament gets the race as it stands, so their game can carry on or watch
  resendRace(l, s, rid) {
    const t = l.tournament, c = l.cache;
    if (t.phase === 'race' && c.prepare && t.race && c.prepare.rid === t.race.rid) {
      const status = Object.fromEntries([...t.race.parts.values()].map(p => [p.pid, p.status === 'dnf' ? 'out:' + p.reason : p.status]));
      if (rid !== t.race.rid) this.send(s.conn, { ...c.prepare, resend: true, status });
      else this.send(s.conn, { t: S.STATUS, rid, statuses: status });
      if (c.start && c.start.rid === t.race.rid) this.send(s.conn, c.start);
    } else if (t.phase === 'transition' && c.results) this.send(s.conn, c.results);
  }

  handle(s, conn, m, now) {
    const l = this.lobbyOf(s), T = l && l.tournament;
    switch (m.t) {
      case C.PING: this.send(conn, { t: S.PONG, c: m.c, s: now }); return; // the game's own clock sync; the server measures round trips itself (rtt below)
      case C.LIST: this.send(conn, { t: S.LOBBIES, list: this.lobbies.publicList() }); return;
      case C.CREATE: {
        if (l) return this.error(conn, 'in-lobby');
        if (!this.rename(s, m.name)) return this.error(conn, 'bad-name');
        const lb = this.lobbies.create({ pid: s.pid, name: s.name, ship: m.ship, paint: m.paint }, { visibility: m.visibility || 'private', handling: m.handling || 'relaxed' }, now);
        if (!lb) return this.error(conn, 'server-full');
        s.lobbyId = lb.id; this.log.info('lobby created', { code: lb.code, pid: s.pid }); this.pushLobby(lb); return;
      }
      case C.JOIN: {
        const code = normalizeCode(m.code); if (!code) return this.error(conn, 'bad-code');
        const lb = this.lobbies.find(code); if (!lb) return this.error(conn, 'no-room');
        if (l) return l === lb ? this.pushLobby(lb) : this.error(conn, 'in-lobby');
        if (lb.phase !== 'open') return this.error(conn, 'in-progress');
        if (lb.size >= MP.MAX_PLAYERS) return this.error(conn, 'full');
        if (!this.rename(s, m.name)) return this.error(conn, 'bad-name');
        lb.add({ pid: s.pid, name: s.name, ship: m.ship, paint: m.paint }, now); s.lobbyId = lb.id;
        this.pushLobby(lb); return;
      }
      case C.LEAVE: { if (!l) return this.send(conn, { t: S.LEFT }); this.removeMember(l, s.pid, now, 'left'); this.send(conn, { t: S.LEFT }); return; }
    }
    if (!l) return this.error(conn, 'not-in-lobby');
    const me = l.members.get(s.pid); l.lastActive = now;
    switch (m.t) {
      case C.SHIP: if (l.phase !== 'open') return this.error(conn, 'running'); l.setShip(s.pid, m.ship, m.paint); this.pushLobby(l); return;
      case C.PAINT: if (l.phase !== 'open') return this.error(conn, 'running'); l.setPaint(s.pid, m.paint); this.pushLobby(l); return;
      case C.READY: if (l.phase !== 'open') return this.error(conn, 'running'); me.ready = m.ready; this.pushLobby(l); return;
      case C.SETTINGS:
        if (s.pid !== l.host) return this.error(conn, 'not-host'); if (l.phase !== 'open') return this.error(conn, 'running');
        if (m.handling) l.handling = m.handling; if (m.visibility) l.visibility = m.visibility; this.pushLobby(l); return;
      case C.START: { const err = l.canStart(s.pid, !!m.rematch, now); if (err) return this.error(conn, err); this.startTournament(l, now); return; }
      case C.LOADED: if (T) T.loaded(s.pid, m.rid, m.ok !== false, now); this.pushLobby(l); return;
      case C.SPECTATE: if (T) T.spectate(s.pid, m.rid, now); return;
      // states still in flight for a race that has just ended (not-started / not-racing) are not counted as rejected
      case C.STATE: { if (!T) return; const r = T.state(s.pid, m.rid, m.s, now); if (!r.ok && r.reason !== 'not-started' && r.reason !== 'not-racing') { this.stats.rejected++; if (now - (s.lastReject || 0) > 2000) { s.lastReject = now; this.send(conn, { t: S.NOTICE, kind: 'state-rejected', reason: r.reason }); } } return; }
      case C.FINISH: { if (!T) return this.error(conn, 'not-racing'); const r = T.finish(s.pid, m.rid, m, now, s.rtt); if (!r.ok) this.send(conn, { t: S.ERROR, code: 'finish-rejected', reason: r.reason }); return; }
    }
  }

  // round trip measured by the server (WebSocket ping / pong), smoothed; used to time finishes, never taken from the game
  rtt(conn, ms) { const s = conn.session; if (!s || !(ms >= 0) || ms > 10000) return; s.rtt = s.rtt ? s.rtt * 0.7 + ms * 0.3 : ms; }
  // the name a pilot types on the online screen comes with create / join; it is checked like the one in hello
  rename(s, raw) { if (raw == null) return true; const n = normalizeName(raw); if (!n) return false; s.name = n; return true; }

  // ---------- lobbies ----------
  pushLobby(l) { const now = this.now(); for (const m of l.members.values()) this.sendTo(m.pid, { t: S.LOBBY, lobby: l.state(m.pid, now) }); }
  broadcast(l, msg, droppable = false) { const text = JSON.stringify(msg); for (const m of l.members.values()) { const s = this.sessions.get(m.pid); if (s && s.conn && s.conn.open) s.conn.socket.send(text, droppable); } }
  removeMember(l, pid, now, why) {
    if (!l.members.has(pid)) return;
    if (l.tournament) l.tournament.leave(pid, now);
    l.remove(pid); const s = this.sessions.get(pid); if (s && s.lobbyId === l.id) s.lobbyId = null;
    this.log.info('member removed', { code: l.code, pid, why });
    if (!l.size) { this.closeLobby(l); return; }
    this.broadcast(l, { t: S.STATUS, pid, conn: 'gone' }); this.pushLobby(l);
  }
  closeLobby(l) { this.lobbies.remove(l); this.log.info('lobby closed', { code: l.code }); }
  startTournament(l, now) {
    const entrants = l.connected().map(m => ({ pid: m.pid, name: m.name, ship: m.ship, paint: m.paint }));
    const t = new Tournament({ tid: newId('t'), entrants, handling: l.handling, now, timeScale: this.cfg.timeScale, rules: this.tournamentRules, raceRules: this.raceRules, hooks: {
      connected: pid => l.isConnected(pid),
      emit: (type, payload) => this.onTournament(l, t, type, payload),
      newId, pickTrack: exclude => this.maps.pick(exclude), rand: n => this.rand(n),
      shuffle: a => { for (let i = a.length - 1; i > 0; i--) { const j = this.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    } });
    l.phase = 'running'; l.tournament = t; l.cache = {}; l.rematchUntil = 0;
    for (const m of l.members.values()) m.ready = false;
    this.log.info('tournament started', { code: l.code, tid: t.tid, pilots: entrants.length });
    t.start(now); this.pushLobby(l);
  }
  onTournament(l, t, type, p) {
    const now = this.now();
    switch (type) {
      case 'prepare': l.cache = { prepare: { t: S.PREPARE, ...p } }; this.broadcast(l, l.cache.prepare); this.pushLobby(l); break;
      case 'start': l.cache.start = { t: S.START, ...p }; this.broadcast(l, l.cache.start); break;
      case 'fin': this.broadcast(l, { t: S.FINISHED, ...p }); break;
      case 'status': this.broadcast(l, { t: S.STATUS, ...p }); break;
      case 'notice': this.broadcast(l, { t: S.NOTICE, ...p }); break;
      case 'results': l.cache.results = { t: S.RESULTS, ...p }; this.broadcast(l, l.cache.results); this.log.info('stage results', { code: l.code, tid: p.tid, stage: p.stage, track: p.track, end: p.endReason }); break;
      case 'complete': {
        l.phase = 'open'; l.tournament = null; l.rematchUntil = now + this.lobbyRules.rematchMs;
        l.last = { tid: p.tid, outcome: p.outcome, winnerName: p.winnerName, summary: p, at: now, forPids: new Set(t.entrants.keys()) };
        this.sendComplete(l, p, [...l.members.keys()]);
        this.log.info('tournament complete', { code: l.code, tid: p.tid, outcome: p.outcome, winner: p.winner });
        this.pushLobby(l); break;
      }
    }
  }
  // each pilot gets the full result but only their own reward
  sendComplete(l, p, pids) {
    const { rewards, ...rest } = p;
    for (const pid of pids) this.sendTo(pid, { t: S.COMPLETE, ...rest, reward: rewards && rewards[pid] ? { tid: p.tid, ...rewards[pid] } : null });
  }

  // ---------- clocks ----------
  // 20 times a second: tournament timers and the ship-state relay
  tick() {
    const now = this.now();
    for (const l of this.lobbies.all()) {
      const t = l.tournament; if (!t) continue;
      t.tick(now);
      if (l.tournament === t && t.race && (t.race.phase === 'racing' || t.race.phase === 'countdown')) {
        const d = t.race.takeDirty();
        if (d.length) this.broadcast(l, { t: S.SNAP, rid: t.race.rid, now, s: d }, true);
      }
    }
  }
  // once a second: grace periods, host hand-over, closing empty lobbies, forgetting idle sessions
  housekeeping() {
    const now = this.now(), R = this.lobbyRules;
    for (const l of this.lobbies.all()) {
      for (const m of [...l.members.values()]) if (m.conn === 'lost' && l.phase === 'open' && now - m.lostAt > R.lostMemberMs) this.removeMember(l, m.pid, now, 'connection lost');
      if (!this.lobbies.byId.has(l.id)) continue;
      const h = l.members.get(l.host);
      if ((!h || (h.conn === 'lost' && now - h.lostAt > R.hostLostMs)) && l.connected().length) { const before = l.host; l.pickHost(); if (l.host !== before) { this.log.info('host handed over', { code: l.code, host: l.host }); this.pushLobby(l); } }
      if (!l.connected().length && !l.tournament && now - Math.max(l.lastActive, ...[...l.members.values()].map(m => m.lostAt || 0)) > R.idleLobbyMs) this.closeLobby(l);
    }
    for (const [pid, s] of this.sessions) if (!s.conn && !this.lobbyOf(s) && now - s.lastSeen > this.rules.sessionIdleMs) this.sessions.delete(pid);
  }
  status() { return { lobbies: this.lobbies.count, sessions: this.sessions.size, connections: this.conns.size, running: this.lobbies.all().filter(l => l.tournament).length, bytesIn: this.stats.bytesIn, bytesOut: this.stats.bytesOut }; }
  // server shutdown or restart: tell every game, then close
  shutdown(reason = 'server restarting') { for (const c of [...this.conns]) { this.send(c, { t: S.NOTICE, kind: 'shutdown', reason }); this.closeConn(c, 1012, reason); } }
}
