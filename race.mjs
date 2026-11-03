// GALACTIC RUSH V8 server — one race of a tournament stage. The server decides when the race starts and ends, checks
// every ship state it relays, accepts a finish only after it has seen the pilot pass every checkpoint of all five laps
// at speeds the ship can reach, and produces the official result. Track lengths, checkpoint positions, ship speeds
// and the handling scale come from the game's own modules, so the server measures progress exactly as the game does.
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { HANDLING } from '../src/sim/race.js';
import { shipById } from '../src/config.js';
import { unpackState, packState, MP } from '../src/mp/protocol.js';

export const RACE_RULES = Object.freeze({
  loadTimeoutMs: 30000,  // a pilot who has not loaded the course by then is left out of this race
  countdownMs: 5000,     // the start is announced this long ahead; the game counts 3-2-1 in the last three seconds
  graceMs: 20000,        // a dropped connection may come back within this time and keep racing
  inactiveMs: 45000,     // connected but no ship state for this long: out of the race
  finishWindowS: MP.FINISH_WINDOW_S,       // after the first pilot finishes, the others get this many race seconds,
  finishWindowFrac: MP.FINISH_WINDOW_FRAC, // or a quarter of the winner's time if that is longer (about 70 s in a 5-lap race)
  maxRaceS: 900,         // hard limit, in race seconds
  finishTolS: 0.5,       // real seconds a claimed finish time may be below the server's own clock (clock error, jitter)
  aheadTolS: 2,          // real seconds a pilot's race clock may run ahead of the server's
  stepSlackM: 15,        // extra metres allowed between two states (respawn jumps forward a few metres)
  strikeLimit: 12,       // rejected states within strikeWindowMs before a pilot is taken out of the race
  strikeWindowMs: 10000,
});

const NAMES = Object.fromEntries(TRACK_DEFS.map(d => [d.id, d.name]));
const cache = new Map();
export function trackInfo(id) {
  let t = cache.get(id);
  if (!t) { const tr = getTrack(id); t = { id, name: NAMES[id] || id, L: tr.length, cpS: tr.cpS.slice(), M: tr.cpS.length }; cache.set(id, t); }
  return t;
}
// Highest speed a ship can reach (boost and a boost pad together), with a margin.
export function shipVmax(shipId, handling) {
  const d = shipById(shipId), H = HANDLING[handling] || null;
  return d.maxSpeed * (H ? H.speed : 1) * d.boostMult * 1.28 * 1.12;
}
const OUT = new Set(['notloaded', 'disconnected', 'left', 'inactive', 'invalid']);
const r3 = v => Math.round(v * 1000) / 1000;

export class RaceSession {
  // participants: [{ pid, ship }] in grid order
  constructor({ rid, stage, track, laps = MP.LAPS, handling = 'relaxed', participants, now, timeScale = 1, rules = RACE_RULES }) {
    this.rid = rid; this.stage = stage; this.track = trackInfo(track); this.laps = laps; this.handling = handling; this.k = timeScale; this.rules = rules;
    this.phase = 'loading'; this.loadDeadline = now + rules.loadTimeoutMs; this.startAt = 0; this.endReason = null; this.endedAt = 0;
    this.finishSeq = 0; this.firstFinishT = null;
    this.parts = new Map(participants.map((p, grid) => [p.pid, {
      pid: p.pid, ship: p.ship, grid, vmax: shipVmax(p.ship, handling), status: 'loading', reason: null, conn: true, lostAt: 0,
      seen: false, cp: 0, lap: 0, prog: 0, prog0: 0, t: 0, lastWall: 0, packed: null, ts: 0, dirty: false, strikes: [],
      finishTime: null, finishSeq: 0, adjusted: false, lapTimes: null,
    }]));
  }
  get over() { return this.phase === 'over'; }
  gameTime(now) { return this.startAt ? Math.max(0, ((now - this.startAt) / 1000) * this.k) : 0; }
  cpProg(g) { const T = this.track; return Math.floor(g / T.M) * T.L + T.cpS[g % T.M]; }
  get finishCp() { return this.laps * this.track.M; }      // the finish line is checkpoint 0 of the lap after the last
  part(pid) { return this.parts.get(pid) || null; }
  racing() { return [...this.parts.values()].filter(p => p.status === 'racing'); }

  // ---------- loading and start ----------
  loaded(pid, ok, now) {
    const p = this.part(pid); if (!p || this.phase !== 'loading' || p.status !== 'loading') return false;
    if (ok === false) { this.out(p, 'notloaded', now); return true; }
    p.status = 'ready'; return true;
  }
  // events: { type: 'start', startAt } | { type: 'out', pid, reason } | { type: 'over', reason }
  tick(now) {
    const ev = [], R = this.rules, all = [...this.parts.values()];
    if (this.phase === 'loading') {
      for (const p of all) if (p.status === 'loading' && !p.conn && now - p.lostAt > R.graceMs) ev.push(this.out(p, 'disconnected', now));
      const waiting = all.filter(p => p.status === 'loading');
      if (!waiting.length || now >= this.loadDeadline) {
        for (const p of waiting) ev.push(this.out(p, 'notloaded', now));
        const ready = all.filter(p => p.status === 'ready');
        if (!ready.length) { this.end('nobody', now); ev.push({ type: 'over', reason: 'nobody' }); return ev; }
        for (const p of ready) { p.status = 'racing'; p.lastWall = now + R.countdownMs; }
        this.startAt = now + R.countdownMs; this.phase = 'countdown'; ev.push({ type: 'start', startAt: this.startAt });
      }
      return ev;
    }
    if (this.phase === 'countdown' && now >= this.startAt) this.phase = 'racing';
    if (this.phase !== 'racing' && this.phase !== 'countdown') return ev;
    const gt = this.gameTime(now);
    for (const p of all) {
      if (p.status !== 'racing') continue;
      if (!p.conn && now - p.lostAt > R.graceMs) ev.push(this.out(p, 'disconnected', now));
      else if (p.conn && this.phase === 'racing' && now - p.lastWall > R.inactiveMs) ev.push(this.out(p, 'inactive', now));
    }
    if (this.phase !== 'racing') return ev;
    let reason = null;
    if (!this.racing().length) reason = 'all-done';
    else if (this.firstFinishT != null && gt - this.firstFinishT > Math.max(R.finishWindowS, R.finishWindowFrac * this.firstFinishT)) reason = 'finish-window';
    else if (gt > R.maxRaceS) reason = 'time-limit';
    if (reason) { this.end(reason, now); ev.push({ type: 'over', reason }); }
    return ev;
  }
  end(reason, now) {
    if (this.phase === 'over') return;
    for (const p of this.parts.values()) if (p.status === 'racing' || p.status === 'loading' || p.status === 'ready') { p.status = 'dnf'; p.reason = p.reason || 'unfinished'; }
    this.phase = 'over'; this.endReason = reason; this.endedAt = now;
  }
  forceOver(reason, now) { this.end(reason, now); }
  out(p, reason, now) { p.status = 'dnf'; p.reason = reason; p.dirty = false; p.outAt = now; return { type: 'out', pid: p.pid, reason }; }

  // ---------- connections ----------
  connLost(pid, now) { const p = this.part(pid); if (p && p.conn) { p.conn = false; p.lostAt = now; } }
  // hasRace: the reconnecting game still has this race running locally, so it can carry on where it was
  connBack(pid, now, hasRace) {
    const p = this.part(pid); if (!p) return null;
    p.conn = true;
    if ((p.status === 'racing' || p.status === 'loading' || p.status === 'ready') && !hasRace && this.phase !== 'loading') return this.out(p, 'left', now);
    if (p.status === 'racing') p.lastWall = Math.max(p.lastWall, now);
    return null;
  }
  leave(pid, now) { const p = this.part(pid); if (!p || p.status === 'dnf' || p.status === 'finished') { if (p) p.conn = false; return null; } p.conn = false; return this.out(p, 'left', now); }

  // ---------- live states ----------
  strike(p, why, now) {
    const R = this.rules; p.strikes = p.strikes.filter(t => now - t < R.strikeWindowMs); p.strikes.push(now);
    if (p.strikes.length >= R.strikeLimit) return { ok: false, reason: why, out: this.out(p, 'invalid', now) };
    return { ok: false, reason: why };
  }
  state(pid, arr, now) {
    const p = this.part(pid), R = this.rules;
    if (!p) return { ok: false, reason: 'not-participant' };
    if (this.phase !== 'racing' && !(this.phase === 'countdown' && now >= this.startAt - 1000)) return { ok: false, reason: 'not-started' };
    if (p.status === 'finished') { const s = unpackState(arr); if (!s) return this.strike(p, 'shape', now); p.packed = packState(s); p.ts = now; p.dirty = true; return { ok: true }; } // cruising after the line: relayed only
    if (p.status !== 'racing') return { ok: false, reason: 'not-racing' };
    const s = unpackState(arr); if (!s) return this.strike(p, 'shape', now);
    const gt = this.gameTime(now), T = this.track;
    if (s.t > gt + R.aheadTolS * this.k) return this.strike(p, 'clock-ahead', now);
    if (p.seen && s.t + 1e-6 < p.t) return this.strike(p, 'time-back', now);
    if (s.cp < p.cp || s.cp > this.finishCp + 1) return this.strike(p, 'checkpoint', now);
    if (!p.seen) {
      if (s.cp > 1 || s.prog < -T.L * 0.3 || s.prog > 400) return this.strike(p, 'start', now);
      p.prog0 = Math.min(s.prog, 0);
    } else {
      const dt = Math.max(0.02, s.t - p.t);
      if (s.prog - p.prog > p.vmax * dt * 1.3 + R.stepSlackM) return this.strike(p, 'speed', now);
    }
    if (s.prog > p.prog0 + p.vmax * s.t * 1.02 + 60) return this.strike(p, 'distance', now);
    if (s.cp > p.cp && s.cp >= 1 && s.prog < this.cpProg(s.cp - 1) - 5) return this.strike(p, 'checkpoint-skipped', now);
    if (s.cp <= this.finishCp && s.prog >= this.cpProg(s.cp) + 30) return this.strike(p, 'checkpoint-missed', now);
    p.seen = true; p.cp = s.cp; p.prog = s.prog; p.t = s.t; p.lastWall = now;
    p.lap = s.cp >= 1 ? Math.min(this.laps, Math.floor((s.cp - 1) / T.M) + 1) : 0;
    p.packed = packState({ ...s, lap: p.lap }); p.ts = now; p.dirty = true;
    return { ok: true };
  }
  // the changed states since the last call: [[pid, serverTime, ...state], ...]
  takeDirty() {
    const out = [];
    for (const p of this.parts.values()) if (p.dirty && p.packed) { out.push([p.pid, p.ts, ...p.packed]); p.dirty = false; }
    return out;
  }

  // ---------- finish ----------
  // rttMs: the round trip the server measured to this pilot; half of it is taken off the server's clock for the arrival time
  finish(pid, m, now, rttMs = 0) {
    const p = this.part(pid), R = this.rules, T = this.track;
    if (!p) return { ok: false, reason: 'not-participant' };
    if (this.phase !== 'racing') return { ok: false, reason: 'not-started' };
    if (p.status !== 'racing') return { ok: false, reason: p.status === 'finished' ? 'already-finished' : 'not-racing' };
    if (p.cp < this.finishCp) return this.strike(p, 'laps-missing', now);
    if (p.prog < this.cpProg(this.finishCp) - (p.vmax * 1.0 + 30)) return this.strike(p, 'not-at-line', now);
    const t = m.time;
    if (!(t > 0) || t + 0.5 < p.t || t > p.t + 2) return this.strike(p, 'bad-time', now);
    if (t < (this.laps * T.L) / p.vmax) return this.strike(p, 'too-fast', now);
    const wall = this.gameTime(now - Math.min(Math.max(rttMs, 0), 2000) / 2);
    let time = Math.min(t, wall + 0.5), adjusted = false;
    if (time < wall - R.finishTolS * this.k) { time = wall; adjusted = true; } // this pilot's game ran behind real time; the server's clock counts
    p.status = 'finished'; p.finishTime = r3(time); p.adjusted = adjusted; p.finishSeq = ++this.finishSeq;
    p.lapTimes = Array.isArray(m.laps) ? m.laps.slice(0, this.laps).map(r3) : null; p.cp = this.finishCp + 1; p.lap = this.laps;
    if (this.firstFinishT == null) this.firstFinishT = this.gameTime(now);
    return { ok: true, time: p.finishTime, adjusted };
  }

  // ---------- result ----------
  // Finishers by time, then everyone else by distance covered; pilots who left, dropped out or never loaded come last.
  results() {
    const rows = [...this.parts.values()].map(p => ({ pid: p.pid, ship: p.ship, grid: p.grid, status: p.status === 'finished' ? 'finished' : 'dnf', reason: p.status === 'finished' ? null : (p.reason || 'unfinished'),
      time: p.finishTime, adjusted: p.adjusted, lap: p.lap, cp: p.cp, prog: Math.round(p.prog), lapTimes: p.lapTimes, seq: p.finishSeq }));
    const tier = r => (r.status === 'finished' ? 0 : OUT.has(r.reason) ? 2 : 1);
    rows.sort((a, b) => tier(a) - tier(b) || (tier(a) === 0 ? a.time - b.time || a.seq - b.seq : b.prog - a.prog || a.grid - b.grid));
    rows.forEach((r, k) => { r.place = k + 1; delete r.seq; });
    return rows;
  }
}
export const isOutReason = r => OUT.has(r);
