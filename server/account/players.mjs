// GALACTIC RUSH V12 server — player accounts: the authoritative copy of every account's career, best laps, ghosts and
// synced settings, and every change to them. The server runs the game's own career code (src/progress, the same
// Progression class the game runs) on its copy, so prices, upgrade costs, rewards, unlock rules and the one-time
// payout of every reward are exactly the game's; a game can only ask for an operation, never send balances. Races are
// paid against race tickets the server issued when the race started (one payout per ticket, with time checks).
//
// Documents (see firestore.mjs):
//   players/{uid}                 the account: career (profile), best laps (records), settings, pilot name, revision
//   players/{uid}/tickets/{id}    race tickets: what was started when, and the result once paid
//   players/{uid}/ghosts/{key}    the ghost of the best lap per course key (rules.js recordKey)
//   players/{uid}/backups/{id}    an account's previous content, kept whenever an import replaced it
// Every change is read-check-write with the document's version as the write's condition, so two devices changing the
// same account at once can never overwrite each other: the second one re-reads and re-applies.
import { randomBytes } from 'node:crypto';
import { Progression } from '../../src/progress/index.js';
import { MemoryStorage, KEYS } from '../../src/progress/store.js';
import { createProfile, RUN_ID } from '../../src/progress/profile.js';
import { calendarOf } from '../../src/progress/profile.js';
import { DIFF_ORDER, MODES } from '../../src/progress/economy.js';
import { SHIPS } from '../../src/config.js';
import { getTrack, TRACK_DEFS } from '../../src/sim/tracks.js';
import { checkCareer, cleanRecords, cleanSettings, checkGhost, parseRecordKey, recordKey, minLap, careerSummary, progressDigest, PILOT_NAME } from '../../src/account/rules.js';
import { DbConflict } from './firestore.mjs';

const SCHEMA = 1, SHIP_IDS = SHIPS.map(s => s.id), TRACK_IDS = TRACK_DEFS.map(d => d.id);
const lengthOf = id => getTrack(id).length;
const OP_ID = /^[a-z0-9-]{8,40}$/, TICKET_ID = /^[a-z0-9]{4,12}-[a-z0-9]{4,12}-[a-z0-9]{1,8}$/;
export const LIMITS = { ops: 40, ticketHours: 3, backups: 5 };
const rand36 = n => Array.from(randomBytes(n), b => (b % 36).toString(36)).join('');
const json = (text, d) => { try { return text ? JSON.parse(text) : d; } catch (e) { return d; } };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const fail = (code, message, status = 400, extra = {}) => ({ ok: false, code, message, status, ...extra });

export class PlayerService {
  constructor({ db, now = () => Date.now(), log }) { this.db = db; this.now = now; this.log = log; this.locks = new Map(); }

  // one change at a time per account in this process; across processes the version conditions keep it safe
  lock(uid, fn) {
    const prev = this.locks.get(uid) || Promise.resolve(), run = prev.then(fn, fn);
    const tail = run.catch(() => {}); this.locks.set(uid, tail); tail.then(() => { if (this.locks.get(uid) === tail) this.locks.delete(uid); });
    return run;
  }
  // read the account (and any other documents), let fn decide, write with version conditions; retried on a conflict
  async change(uid, fn, more = []) {
    return this.lock(uid, async () => {
      for (let attempt = 0; ; attempt++) {
        const [doc, ...others] = await Promise.all([this.db.get(path(uid)), ...more.map(p => this.db.get(p))]);
        const out = await fn(doc, others);
        if (!out.writes || !out.writes.length) return out.result;
        try { await this.db.commit(out.writes); return out.result; }
        catch (e) { if (!(e instanceof DbConflict) || attempt >= 5) throw e; }
      }
    });
  }
  // the server's working copy of a stored career: the game's own Progression over it; a stored career that cannot be
  // read is never replaced by a new one (that would lose the player's progress): the request fails instead
  career(data) {
    const P = new Progression(new MemoryStorage({ [KEYS.main]: data.profile }), { now: this.now });
    if (!['loaded', 'migrated'].includes(P.loadStatus)) { if (this.log) this.log.error('stored career unreadable', { status: P.loadStatus }); throw Object.assign(new Error('stored career unreadable'), { code: 'career-unreadable' }); }
    return P;
  }
  view(data) {
    const imp = json(data.imported, null);
    return { rev: data.rev, profile: json(data.profile, null), records: json(data.records, {}), settings: json(data.settings, {}), name: data.name || null,
      imported: imp ? { at: imp.at, replaced: !!imp.replaced } : null, createdAt: data.createdAt, updatedAt: data.updatedAt };
  }
  next(data, patch) { return { ...data, ...patch, schema: SCHEMA, rev: (data.rev || 0) + 1, updatedAt: this.now() }; }

  // ---------- reading and creating ----------
  async load(uid) { const d = await this.db.get(path(uid)); return d.exists ? { exists: true, view: this.view(d.data) } : { exists: false }; }
  // a new account's career starts fresh (when the player chose not to bring a device's career): idempotent
  async start(uid) {
    return this.change(uid, doc => {
      if (doc.exists) return { result: { ok: true, already: true, view: this.view(doc.data) } };
      const now = this.now(), data = { schema: SCHEMA, rev: 1, createdAt: now, updatedAt: now, profile: JSON.stringify(createProfile(now)), records: '{}', settings: '{}', name: null, imported: null, ops: '[]' };
      return { writes: [{ set: path(uid), data, ifVersion: null }], result: { ok: true, view: this.view(data) } };
    });
  }

  // ---------- a device's career becomes the account's (once per import id; an existing career only on request) ----------
  async importCareer(uid, { importId, profile, records, settings, name, replace = false, expectRev } = {}) {
    if (typeof importId !== 'string' || !OP_ID.test(importId)) return fail('bad-request', 'Missing import id.');
    const chk = checkCareer(profile, this.now());
    if (!chk.ok) return fail('career-invalid', 'This career cannot be added to an account: its records do not add up.', 422, { problems: chk.problems.slice(0, 6) });
    const recIssues = [], recs = cleanRecords(records, lengthOf, recIssues), sets = cleanSettings(settings), pilot = typeof name === 'string' && PILOT_NAME.test(name) ? name : null;
    return this.change(uid, doc => {
      const now = this.now();
      if (doc.exists) {
        const prev = json(doc.data.imported, null);
        if (prev && prev.id === importId) return { result: { ok: true, already: true, view: this.view(doc.data), digest: prev.digest } }; // the same import again: nothing to do
        if (!replace) return { result: fail('account-has-career', 'This account already has a career.', 409, { account: careerSummary(json(doc.data.profile, null), json(doc.data.records, {})), rev: doc.data.rev }) };
        if (expectRev !== doc.data.rev) return { result: fail('stale', 'The account changed since you compared the two careers. Compare them again.', 409, { account: careerSummary(json(doc.data.profile, null), json(doc.data.records, {})), rev: doc.data.rev }) };
      }
      const digest = progressDigest(chk.profile, recs);
      const data = { ...(doc.exists ? doc.data : {}), schema: SCHEMA, rev: (doc.exists ? doc.data.rev : 0) + 1, createdAt: doc.exists ? doc.data.createdAt : now, updatedAt: now,
        profile: JSON.stringify(chk.profile), records: JSON.stringify(recs), settings: JSON.stringify(sets), name: pilot || (doc.exists ? doc.data.name : null) || null,
        imported: JSON.stringify({ id: importId, at: now, replaced: doc.exists, digest }), ops: '[]' };
      const writes = [{ set: path(uid), data, ifVersion: doc.exists ? doc.version : null }];
      if (doc.exists) writes.push({ set: `${path(uid)}/backups/${now.toString(36)}-${rand36(4)}`, data: { at: now, reason: 'replaced by an import', doc: JSON.stringify(doc.data) }, ifVersion: null });
      if (this.log) this.log.info('career imported', { uid: short(uid), replaced: doc.exists, races: chk.profile.stats.races });
      return { writes, result: { ok: true, view: this.view(data), digest, issues: [...chk.issues, ...recIssues].slice(0, 20) } };
    });
  }

  // ---------- career operations the game asks for ----------
  async op(uid, { opId, op, args } = {}) {
    if (typeof opId !== 'string' || !OP_ID.test(opId)) return fail('bad-request', 'Missing operation id.');
    const run = OPS[op]; if (!run) return fail('bad-request', 'Unknown operation.');
    if (!isObj(args)) return fail('bad-request', 'Missing arguments.');
    return this.change(uid, doc => {
      if (!doc.exists) return { result: fail('no-career', 'This account has no career yet.', 409) };
      const done = json(doc.data.ops, []).find(o => o.id === opId);
      if (done) return { result: { ...done.res, view: this.view(doc.data), repeated: true } }; // a retry of an operation already applied
      const P = this.career(doc.data); let res;
      try { res = run(P, args); } finally { P.flush(); }
      res = { ok: !!res.ok, ...(res.ok ? {} : { code: res.code || 'refused', message: res.message || 'Refused.' }), ...pickResult(res) };
      const ops = [...json(doc.data.ops, []), { id: opId, res }].slice(-LIMITS.ops);
      const data = this.next(doc.data, { profile: JSON.stringify(P.profile), ops: JSON.stringify(ops) });
      return { writes: [{ set: path(uid), data, ifVersion: doc.version }], result: { ...res, view: this.view(data) } };
    });
  }

  // ---------- races ----------
  // a ticket for a race that is starting: everything that decides its reward is fixed now, checked against the career
  async raceStart(uid, a = {}) {
    const doc = await this.db.get(path(uid));
    if (!doc.exists) return fail('no-career', 'This account has no career yet.', 409);
    const P = this.career(doc.data), mode = a.mode, track = a.track, laps = a.laps, field = a.field, ship = a.ship, handling = a.handling === 'classic' ? 'classic' : 'relaxed';
    if (!MODES.includes(mode) || !TRACK_IDS.includes(track) || !SHIP_IDS.includes(ship) || !P.shipOk(ship)) return fail('bad-race', 'Unknown mode, course or spacecraft.');
    if (!Number.isInteger(laps) || laps < 1 || laps > 9 || !Number.isInteger(field) || field < 1 || field > 6) return fail('bad-race', 'Race settings out of range.');
    const diff = mode === 'trial' ? null : a.diff;
    if (mode !== 'trial' && !DIFF_ORDER.includes(diff)) return fail('bad-race', 'Unknown difficulty.');
    let runId = null, round = null;
    if (mode === 'champ') {
      const run = P.activeRun();
      if (!run || typeof a.runId !== 'string' || !RUN_ID.test(a.runId) || run.runId !== a.runId || run.diff !== diff || run.laps !== laps || calendarOf(run)[run.round] !== track) return fail('bad-run', 'This race is not the next round of the championship in progress.', 409);
      runId = run.runId; round = run.round;
    }
    const now = this.now(), id = `${now.toString(36)}-${rand36(6)}-${rand36(2)}`;
    const ticket = { mode, track, diff, laps, ship, field, runId, round, handling, issuedAt: now, used: false };
    await this.db.commit([{ set: `${path(uid)}/tickets/${id}`, data: ticket, ifVersion: null }]);
    return { ok: true, ticket: id, issuedAt: now, expiresAt: now + LIMITS.ticketHours * 3600e3 };
  }
  // the result of a ticket's race: checked, paid once through the game's own reward code, the best lap filed
  async raceFinish(uid, a = {}) {
    if (typeof a.ticket !== 'string' || !TICKET_ID.test(a.ticket)) return fail('bad-request', 'Missing race ticket.');
    const tp = `${path(uid)}/tickets/${a.ticket}`;
    return this.change(uid, (doc, [tk]) => {
      if (!tk.exists) return { result: fail('no-ticket', 'Unknown race ticket.', 404) };
      const T = tk.data;
      if (T.used) return { result: { ...json(T.result, { ok: false, code: 'used' }), view: doc.exists ? this.view(doc.data) : null, repeated: true } };
      if (!doc.exists) return { result: fail('no-career', 'This account has no career yet.', 409) };
      const now = this.now(), L = lengthOf(T.track), lapMin = minLap(L), raceMin = lapMin * T.laps;
      const place = a.place, time = a.time, best = a.bestLap == null ? null : a.bestLap;
      let bad = null;
      if (now - T.issuedAt > LIMITS.ticketHours * 3600e3) bad = fail('ticket-expired', 'This race ticket has expired.', 410);
      else if (!Number.isInteger(place) || place < 1 || place > T.field) bad = fail('bad-race', 'Finishing place out of range.');
      else if (!Number.isFinite(time) || time < raceMin || time > 3600 * T.laps) bad = fail('implausible', 'The race time is not possible on this course.', 422);
      else if (best != null && (!Number.isFinite(best) || best < lapMin || best > time + 0.01)) bad = fail('implausible', 'The lap time is not possible on this course.', 422);
      else if ((now - T.issuedAt) / 1000 < raceMin * 0.9) bad = fail('implausible', 'The race was reported sooner than it can be flown.', 422);
      let res, data = doc.data;
      if (bad) res = bad;
      else {
        const records = json(doc.data.records, {}), key = recordKey(T.track, T.handling), prev = records[key], record = best != null && (!prev || best < prev.lap - 0.0005);
        const P = this.career(doc.data);
        const r = P.completeRace({ finished: true, raceId: a.ticket, mode: T.mode, track: T.track, diff: T.diff, laps: T.laps, ship: T.ship, place, field: T.field, time, record, runId: T.runId, order: Array.isArray(a.order) ? a.order.slice(0, 6).map(String) : undefined });
        res = { ok: !!r.ok, ...(r.ok ? {} : { code: r.code || 'refused', message: r.message || 'Refused.' }), ...pickResult(r), record: r.ok && record ? { key, lap: +best.toFixed(3) } : null };
        if (r.ok) { if (record) records[key] = { lap: +best.toFixed(3), ship: T.ship, at: now }; data = this.next(doc.data, { profile: JSON.stringify(P.profile), records: JSON.stringify(records) }); }
      }
      const writes = [{ set: tp, data: { ...T, used: true, usedAt: now, result: JSON.stringify(res) }, ifVersion: tk.version }];
      if (data !== doc.data) writes.unshift({ set: path(uid), data, ifVersion: doc.version });
      return { writes, result: { ...res, view: this.view(data) } };
    }, [tp]);
  }

  // ---------- settings, pilot name, ghosts ----------
  async putSettings(uid, settings) {
    const clean = cleanSettings(settings);
    return this.change(uid, doc => {
      if (!doc.exists) return { result: fail('no-career', 'This account has no career yet.', 409) };
      const data = this.next(doc.data, { settings: JSON.stringify({ ...json(doc.data.settings, {}), ...clean }) });
      return { writes: [{ set: path(uid), data, ifVersion: doc.version }], result: { ok: true, view: this.view(data) } };
    });
  }
  async putName(uid, name) {
    if (typeof name !== 'string' || !PILOT_NAME.test(name)) return fail('bad-name', 'Pilot names are 2-16 letters, digits, spaces, dots, dashes or underscores.');
    return this.change(uid, doc => {
      if (!doc.exists) return { result: fail('no-career', 'This account has no career yet.', 409) };
      const data = this.next(doc.data, { name }); return { writes: [{ set: path(uid), data, ifVersion: doc.version }], result: { ok: true, view: this.view(data) } };
    });
  }
  // a ghost is kept only for the account's current best lap on that course key
  async putGhost(uid, key, g) {
    const why = checkGhost(g, lengthOf, key); if (why) return fail('bad-ghost', 'Ghost refused: ' + why + '.');
    const doc = await this.db.get(path(uid)); if (!doc.exists) return fail('no-career', 'This account has no career yet.', 409);
    const rec = json(doc.data.records, {})[key];
    if (!rec || Math.abs(rec.lap - g.lap) > 0.002) return fail('not-record', 'A ghost is kept for the course record only.', 409);
    const text = JSON.stringify(g.f); if (text.length > 900000) return fail('too-large', 'Ghost too large.', 413);
    await this.db.commit([{ set: `${path(uid)}/ghosts/${key}`, data: { lap: g.lap, ship: g.ship, f: text, at: this.now() } }]);
    return { ok: true };
  }
  async getGhost(uid, key) {
    if (!parseRecordKey(key)) return fail('bad-request', 'Unknown course key.');
    const [doc, gh] = await Promise.all([this.db.get(path(uid)), this.db.get(`${path(uid)}/ghosts/${key}`)]);
    const rec = doc.exists ? json(doc.data.records, {})[key] : null;
    if (!gh.exists || !rec || Math.abs(rec.lap - gh.data.lap) > 0.002) return fail('no-ghost', 'No ghost for this course.', 404);
    return { ok: true, ghost: { lap: gh.data.lap, ship: gh.data.ship, f: json(gh.data.f, []) } };
  }
  // the ghosts kept for the account's current records (a ghost of a lap that is no longer the record is not offered)
  async listGhosts(uid) {
    const [doc, list] = await Promise.all([this.db.get(path(uid)), this.db.list(`${path(uid)}/ghosts`)]), recs = doc.exists ? json(doc.data.records, {}) : {};
    return { ok: true, ghosts: list.filter(d => recs[d.id] && Math.abs(recs[d.id].lap - d.data.lap) <= 0.002).map(d => ({ key: d.id, lap: d.data.lap, ship: d.data.ship })) };
  }

  // ---------- online tournaments: the multiplayer server pays its own results into the account ----------
  async creditTournament(uid, tid, reward) {
    if (!isObj(reward) || !Array.isArray(reward.lines) || !/^t[0-9a-f]{10}$/.test(tid)) return fail('bad-request', 'Bad tournament reward.');
    return this.change(uid, doc => {
      if (!doc.exists) return { result: fail('no-career', 'This account has no career yet.', 409) };
      const P = this.career(doc.data);
      const r = P.transact('mp', `online tournament ${tid}`, (d, T) => { for (const l of reward.lines) { if (l.CR) T.credit('CR', l.CR, String(l.name).slice(0, 60)); if (l.ST) T.credit('ST', l.ST, String(l.name).slice(0, 60)); } }, { events: ['mp:' + tid] });
      if (!r.ok) return { result: { ok: false, code: r.duplicate ? 'duplicate' : r.code, message: r.message, view: this.view(doc.data) } };
      const data = this.next(doc.data, { profile: JSON.stringify(P.profile) });
      return { writes: [{ set: path(uid), data, ifVersion: doc.version }], result: { ok: true, lines: r.lines, view: this.view(data) } };
    });
  }
}

const path = uid => { if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('bad uid'); return `players/${uid}`; };
const short = uid => uid.slice(0, 6) + '…';
// what a career operation's result tells the game (no profile copies: the view carries the career)
function pickResult(r) {
  const out = {};
  for (const k of ['txId', 'lines', 'balance', 'shipId', 'cat', 'level', 'cost', 'item', 'price', 'currency', 'custom', 'runId', 'mode', 'credits', 'tokens', 'parts', 'unlocks', 'champ', 'duplicate']) if (r[k] !== undefined) out[k] = r[k];
  if (r.run) out.run = r.run;
  if (r.completion) out.completion = { ok: r.completion.ok, ...pickResult(r.completion), ...(r.completion.run ? { run: r.completion.run, standing: r.completion.standing, newlyUnlocked: r.completion.newlyUnlocked, isHighest: r.completion.isHighest, next: r.completion.next, bonusTokens: r.completion.bonusTokens } : {}) };
  return out;
}
const str = (v, n = 64) => (typeof v === 'string' && v.length <= n ? v : '');
// the operations a game may ask for, each the game's own career method
const OPS = {
  buyUpgrade: (P, a) => P.buyUpgrade(str(a.ship), str(a.cat), Number.isInteger(a.expectLevel) ? a.expectLevel : undefined),
  buyItem: (P, a) => P.buyItem(str(a.id)),
  setCustom: (P, a) => P.setCustom(str(a.ship), isObj(a.custom) ? a.custom : null),
  selectShip: (P, a) => (P.shipOk(str(a.ship)) ? (P.selectShip(a.ship), { ok: true }) : { ok: false, code: 'bad-ship', message: 'Unknown spacecraft.' }),
  startRun: (P, a) => P.startRun({ diff: str(a.diff), laps: a.laps, ship: str(a.ship), tracks: Array.isArray(a.tracks) ? a.tracks.slice(0, 8).map(x => str(x)) : undefined, runId: str(a.runId) || undefined }),
  abandonRun: (P, a) => P.abandonRun(str(a.runId)),
};
