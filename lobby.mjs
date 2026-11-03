// GALACTIC RUSH V8 server — lobbies: a unique id, a short room code to share, a host, up to six pilots with their
// ships, paint jobs, ready flags and connection status, the lobby settings and the tournament it is running.
import { MP } from '../src/mp/protocol.js';
import { cleanPaint } from '../src/mp/paint.js';
import { newCode, newId } from './identity.mjs';

export const LOBBY_RULES = Object.freeze({
  lostMemberMs: 60000,   // a pilot disconnected from an open lobby for this long is removed
  hostLostMs: 10000,     // a disconnected host hands over to the next pilot after this long
  idleLobbyMs: 600000,   // a lobby with nobody connected for this long is closed
  rematchMs: 120000,     // after a tournament the host may start another with the same pilots without new ready checks
});

export class Lobby {
  constructor({ host, visibility = 'private', handling = 'relaxed', now, code }) {
    this.id = newId('l'); this.code = code; this.visibility = visibility; this.handling = handling;
    this.host = host.pid; this.members = new Map(); this.phase = 'open'; this.tournament = null; this.createdAt = now;
    this.lastActive = now; this.last = null; this.rematchUntil = 0; this.cache = {};
    this.add(host, now);
  }
  get size() { return this.members.size; }
  connected() { return [...this.members.values()].filter(m => m.conn === 'ok'); }
  isConnected(pid) { const m = this.members.get(pid); return !!m && m.conn === 'ok'; }
  uniqueName(name, pid) {
    const taken = new Set([...this.members.values()].filter(m => m.pid !== pid).map(m => m.name));
    if (!taken.has(name)) return name;
    for (let k = 2; k < 99; k++) { const suf = ' ' + k, n = name.slice(0, MP.NAME_MAX - suf.length) + suf; if (!taken.has(n)) return n; }
    return name;
  }
  // member: { pid, name, ship, paint }
  add(m, now) {
    const paint = cleanPaint(m.paint, m.ship).paint;
    this.members.set(m.pid, { pid: m.pid, name: this.uniqueName(m.name, m.pid), ship: m.ship, paint, ready: false, conn: 'ok', lostAt: 0, joinedAt: now });
    this.lastActive = now;
  }
  remove(pid) {
    this.members.delete(pid);
    if (this.host === pid) this.pickHost();
  }
  pickHost() {
    const next = [...this.members.values()].sort((a, b) => (a.conn === 'ok' ? 0 : 1) - (b.conn === 'ok' ? 0 : 1) || a.joinedAt - b.joinedAt)[0];
    this.host = next ? next.pid : null;
  }
  setShip(pid, ship, paint) { const m = this.members.get(pid); if (!m) return false; m.ship = ship; m.paint = cleanPaint(paint === undefined ? m.paint : paint, ship).paint; return true; }
  setPaint(pid, paint) { const m = this.members.get(pid); if (!m) return false; m.paint = cleanPaint(paint, m.ship).paint; return true; }
  // can the host start now? returns null or an error code
  canStart(pid, rematch, now) {
    if (pid !== this.host) return 'not-host';
    if (this.phase !== 'open') return 'running';
    const on = this.connected();
    if (on.length < MP.MIN_PLAYERS) return 'too-few';
    if (!(rematch && now < this.rematchUntil) && on.some(m => !m.ready)) return 'not-ready';
    return null;
  }
  state(forPid, now) {
    return {
      id: this.id, code: this.code, phase: this.phase, visibility: this.visibility, handling: this.handling, host: this.host, you: forPid, max: MP.MAX_PLAYERS,
      members: [...this.members.values()].map(m => ({ pid: m.pid, name: m.name, ship: m.ship, paint: m.paint, ready: m.ready, conn: m.conn })),
      tournament: this.tournament ? this.tournament.snapshot() : null,
      rematch: now < this.rematchUntil, last: this.last ? { tid: this.last.tid, outcome: this.last.outcome, winnerName: this.last.winnerName } : null,
    };
  }
  summary() { const h = this.members.get(this.host); return { code: this.code, host: h ? h.name : '?', players: this.members.size, max: MP.MAX_PLAYERS, handling: this.handling }; }
}

export class LobbyRegistry {
  constructor({ max = 200 } = {}) { this.byId = new Map(); this.byCode = new Map(); this.max = max; }
  get count() { return this.byId.size; }
  create(host, opts, now) {
    if (this.byId.size >= this.max) return null;
    const l = new Lobby({ host, ...opts, now, code: newCode(this.byCode) });
    this.byId.set(l.id, l); this.byCode.set(l.code, l); return l;
  }
  find(code) { return this.byCode.get(code) || null; }
  remove(l) { this.byId.delete(l.id); if (this.byCode.get(l.code) === l) this.byCode.delete(l.code); }
  publicList(limit = 30) {
    return [...this.byId.values()].filter(l => l.visibility === 'public' && l.phase === 'open' && l.size < MP.MAX_PLAYERS && l.connected().length > 0)
      .sort((a, b) => b.lastActive - a.lastActive).slice(0, limit).map(l => l.summary());
  }
  all() { return [...this.byId.values()]; }
}
