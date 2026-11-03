// GALACTIC RUSH V8 server — the two-stage elimination tournament.
//   Stage 1, the qualifier: everyone in the lobby races five laps on a course the server picks. The two best-placed
//   pilots who are still connected qualify; everyone else is eliminated (and may watch the final).
//   Stage 2, the final: the two finalists race five laps on a second course; the first across the line wins.
// The server is the only one that changes this state; games show what it sends.
//
// Disconnection policy (see README):
//   - during a race a pilot may reconnect within 20 s and carry on; after that they are out of the race;
//   - qualifying needs a pilot who raced and is still connected when the qualifier ends;
//   - a finalist who is gone when the final is set up is replaced by the next qualifier in order, if any;
//   - a finalist who drops out of the final before finishing forfeits: the other finalist wins at once;
//   - one finalist left: they win by walkover; nobody left: the tournament ends without a result.
import { RaceSession, RACE_RULES, isOutReason } from './race.mjs';
import { tournamentRewards } from './rewards.mjs';
import { MP } from '../src/mp/protocol.js';

export const TOURNAMENT_RULES = Object.freeze({ transitionMs: 12000 });

export class Tournament {
  // entrants: [{ pid, name, ship, paint }] (the lobby when the host started); hooks:
  //   connected(pid) -> bool, emit(type, payload), newId(prefix) -> string, pickTrack(exclude) -> id, shuffle(array) -> array
  constructor({ tid, entrants, handling, now, timeScale = 1, rules = TOURNAMENT_RULES, raceRules = RACE_RULES, hooks }) {
    this.tid = tid; this.entrants = new Map(entrants.map(e => [e.pid, { ...e }])); this.order = entrants.map(e => e.pid);
    this.handling = handling; this.k = timeScale; this.rules = rules; this.raceRules = raceRules; this.h = hooks;
    this.phase = 'created'; this.stage = 0; this.race = null; this.stages = []; this.qualified = []; this.eliminated = [];
    this.finalists = []; this.promoted = []; this.winner = null; this.runnerUp = null; this.outcome = null; this.rewards = null;
    this.nextAt = 0; this.startedAt = now; this.completedAt = 0;
  }
  get done() { return this.phase === 'complete'; }
  name(pid) { const e = this.entrants.get(pid); return e ? e.name : '?'; }
  start(now) { if (this.phase !== 'created') return false; this.prepare(1, this.h.shuffle(this.order.slice()), now); return true; }

  prepare(stage, grid, now) {
    const track = this.h.pickTrack(this.stages.map(s => s.track)), rid = this.h.newId('r');
    this.stage = stage; this.phase = 'race'; if (stage === 2) this.finalists = grid.slice();
    this.race = new RaceSession({ rid, stage, track, laps: MP.LAPS, handling: this.handling, participants: grid.map(pid => ({ pid, ship: this.entrants.get(pid).ship })), now, timeScale: this.k, rules: this.raceRules });
    this.h.emit('prepare', { tid: this.tid, rid, stage, track, trackName: this.race.track.name, laps: MP.LAPS, handling: this.handling, seed: 1 + this.h.rand(1e6),
      grid: grid.map(pid => { const e = this.entrants.get(pid); return { pid, name: e.name, ship: e.ship, paint: e.paint }; }), deadline: now + this.raceRules.loadTimeoutMs });
  }

  // ---------- messages from pilots ----------
  loaded(pid, rid, ok, now) { if (!this.race || this.race.rid !== rid) return false; return this.race.loaded(pid, ok, now); }
  state(pid, rid, arr, now) { if (!this.race || this.race.rid !== rid) return { ok: false, reason: 'not-racing' }; const r = this.race.state(pid, arr, now); if (r.out) this.onOut(r.out, now); return r; }
  finish(pid, rid, m, now, rtt) {
    if (!this.race || this.race.rid !== rid) return { ok: false, reason: 'not-racing' };
    const r = this.race.finish(pid, m, now, rtt);
    if (r.ok) this.h.emit('fin', { rid, pid, time: r.time, adjusted: r.adjusted });
    else if (r.out) this.onOut(r.out, now);
    return r;
  }
  connLost(pid, now) { if (this.race && !this.race.over) { this.race.connLost(pid, now); } }
  connBack(pid, now, rid) { if (this.race && !this.race.over) { const e = this.race.connBack(pid, now, rid === this.race.rid); if (e) this.onOut(e, now); } }
  leave(pid, now) { if (this.race && !this.race.over) { const e = this.race.leave(pid, now); if (e) this.onOut(e, now); } }
  spectate(pid, rid, now) { if (this.race && this.race.rid === rid && !this.race.over) { const e = this.race.leave(pid, now); if (e) this.onOut(e, now); } }

  // ---------- clock ----------
  tick(now) {
    if (this.phase === 'race') {
      for (const e of this.race.tick(now)) {
        if (e.type === 'start') this.h.emit('start', { rid: this.race.rid, startAt: e.startAt });
        else if (e.type === 'out') this.onOut(e, now);
        else if (e.type === 'over') this.stageOver(now);
        if (this.phase !== 'race') break;
      }
    } else if (this.phase === 'transition' && now >= this.nextAt) this.beginFinal(now);
  }
  onOut(e, now) {
    this.h.emit('status', { rid: this.race.rid, pid: e.pid, out: e.reason });
    if (this.stage === 2 && this.phase === 'race' && !this.race.over) { // a finalist who drops out before finishing forfeits
      const other = this.race.racing().find(p => p.pid !== e.pid);
      const gone = this.race.part(e.pid);
      if (gone && gone.status === 'dnf' && other && this.race.phase !== 'loading') { this.race.forceOver('forfeit', now); this.stageOver(now); }
    }
  }

  // ---------- stage results and transitions ----------
  rowsWithNames(rows) { return rows.map(r => ({ ...r, name: this.name(r.pid) })); }
  eligible(rows) { return rows.filter(r => (r.status === 'finished' || !isOutReason(r.reason)) && this.h.connected(r.pid)).map(r => r.pid); }
  stageOver(now) {
    if (this.phase !== 'race') return;
    const race = this.race, rows = this.rowsWithNames(race.results());
    this.stages.push({ stage: race.stage, rid: race.rid, track: race.track.id, trackName: race.track.name, endReason: race.endReason, rows });
    if (race.stage === 1) {
      const elig = this.eligible(rows);
      this.qualified = elig.slice(0, MP.QUALIFIERS);
      this.eliminated = rows.map(r => r.pid).filter(pid => !this.qualified.includes(pid));
      if (this.qualified.length >= MP.QUALIFIERS) {
        this.phase = 'transition'; this.nextAt = now + this.rules.transitionMs;
        this.h.emit('results', { tid: this.tid, rid: race.rid, stage: 1, track: race.track.id, trackName: race.track.name, laps: race.laps, endReason: race.endReason, rows, qualified: this.qualified, eliminated: this.eliminated, nextAt: this.nextAt });
      } else {
        this.h.emit('results', { tid: this.tid, rid: race.rid, stage: 1, track: race.track.id, trackName: race.track.name, laps: race.laps, endReason: race.endReason, rows, qualified: this.qualified, eliminated: this.eliminated, nextAt: 0 });
        this.complete(now, this.qualified.length === 1 ? 'walkover' : 'no-result', this.qualified[0] || null, null);
      }
      return;
    }
    // the final
    const first = rows[0], second = rows[1];
    let winner = null, runnerUp = null, outcome;
    if (race.endReason === 'forfeit') { winner = rows.find(r => r.status === 'finished' || !isOutReason(r.reason)) || null; outcome = winner ? 'forfeit' : 'no-result'; }
    else if (first && (first.status === 'finished' || !isOutReason(first.reason))) { winner = first; outcome = first.status === 'finished' ? 'raced' : 'distance'; }
    else outcome = 'no-result';
    if (winner) runnerUp = rows.find(r => r.pid !== winner.pid) || null;
    this.h.emit('results', { tid: this.tid, rid: race.rid, stage: 2, track: race.track.id, trackName: race.track.name, laps: race.laps, endReason: race.endReason, rows, winner: winner ? winner.pid : null, outcome });
    this.complete(now, outcome, winner ? winner.pid : null, runnerUp ? runnerUp.pid : null);
    void second;
  }
  beginFinal(now) {
    if (this.phase !== 'transition') return;
    const rows = this.stages[0].rows, finalists = this.qualified.filter(pid => this.h.connected(pid));
    for (const pid of this.eligible(rows)) { if (finalists.length >= MP.QUALIFIERS) break; if (!finalists.includes(pid) && !this.qualified.includes(pid)) { finalists.push(pid); this.promoted.push(pid); } }
    const dropped = this.qualified.filter(pid => !finalists.includes(pid));
    if (dropped.length || this.promoted.length) this.h.emit('notice', { tid: this.tid, kind: 'finalists', dropped, promoted: this.promoted.slice(), finalists: finalists.slice() });
    if (finalists.length >= MP.QUALIFIERS) { this.prepare(2, finalists, now); return; }
    this.complete(now, finalists.length === 1 ? 'walkover' : 'no-result', finalists[0] || null, null);
  }
  complete(now, outcome, winner, runnerUp) {
    this.phase = 'complete'; this.outcome = outcome; this.winner = winner; this.runnerUp = runnerUp; this.completedAt = now; this.race = null;
    this.rewards = tournamentRewards({ stages: this.stages, winner, runnerUp });
    this.h.emit('complete', this.summary());
  }
  summary() {
    return { tid: this.tid, outcome: this.outcome, winner: this.winner, runnerUp: this.runnerUp, winnerName: this.winner ? this.name(this.winner) : null,
      runnerUpName: this.runnerUp ? this.name(this.runnerUp) : null, stages: this.stages.map(s => ({ stage: s.stage, track: s.track, trackName: s.trackName, endReason: s.endReason, rows: s.rows })),
      qualified: this.qualified, finalists: this.finalists, promoted: this.promoted, rewards: this.rewards };
  }
  // what a pilot who connects mid-tournament needs to know
  snapshot() {
    const r = this.race;
    return { tid: this.tid, phase: this.phase, stage: this.stage, rid: r ? r.rid : null, racePhase: r ? r.phase : null, startAt: r ? r.startAt : 0, track: r ? r.track.id : null, trackName: r ? r.track.name : null,
      parts: r ? [...r.parts.values()].map(p => ({ pid: p.pid, status: p.status, reason: p.reason })) : [],
      entrants: [...this.entrants.values()].map(e => ({ pid: e.pid, name: e.name, ship: e.ship })),
      qualified: this.qualified, eliminated: this.eliminated, finalists: this.finalists, stages: this.stages.map(s => ({ stage: s.stage, track: s.track, trackName: s.trackName })), nextAt: this.nextAt };
  }
}
