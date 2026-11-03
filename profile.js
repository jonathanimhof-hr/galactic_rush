// GALACTIC RUSH V7 — the player profile: a versioned data model, its migrations, and validation that repairs or rejects
// anything inconsistent. Loaded data is never trusted: every field is checked, clamped or reset before the game uses it.
import { SHIPS, CHAMPIONSHIP, AI_ROSTER } from '../config.js';
import { TRACK_DEFS } from '../sim/tracks.js';
import { DIFF_ORDER, MODES, MAX_BALANCE, MILESTONES, UPGRADES, UPGRADE_IDS } from './economy.js';
import { ITEM, DEFAULT_ITEMS, SLOTS, SLOT_DEFAULT, defaultCustom } from './catalog.js';

export const PROFILE_VERSION = 1;
export const LIMITS = { history: 30, runs: 30, seen: 400, tx: 60 };
const SHIP_IDS = SHIPS.map(s => s.id), TRACK_IDS = TRACK_DEFS.map(d => d.id);
export const CHAMP_NAMES = [...AI_ROSTER.map(a => a.name), 'YOU'];
export const RUN_ID = /^champ-[a-z0-9]{4,12}-[a-z0-9]{4,12}$/;
export const EVENT_ID = /^[a-z]{2,12}:[a-z0-9:-]{4,80}$/;
export const HEX = /^#[0-9a-f]{6}$/;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, lo, hi, d = lo) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const zeroUp = () => Object.fromEntries(UPGRADE_IDS.map(k => [k, 0]));
const tally = () => ({ races: 0, wins: 0, podiums: 0, credits: 0 });

export function createProfile(now = Date.now()) {
  return {
    version: PROFILE_VERSION, createdAt: now, updatedAt: now,
    wallet: { CR: 0, ST: 0 }, earned: { CR: 0, ST: 0 }, spent: { CR: 0, ST: 0 },
    selectedShip: SHIP_IDS[0],
    ships: Object.fromEntries(SHIP_IDS.map(id => [id, { unlocked: true, upgrades: zeroUp(), custom: defaultCustom(id) }])),
    inventory: { unlocked: [...DEFAULT_ITEMS], acquired: {} },
    championships: { unlocked: ['rookie'], completed: { rookie: 0, pro: 0, ace: 0 }, titles: { rookie: 0, pro: 0, ace: 0 }, best: { rookie: null, pro: null, ace: null }, active: null, runs: [] },
    stats: { races: 0, wins: 0, podiums: 0, byMode: Object.fromEntries(MODES.map(m => [m, tally()])), byTrack: Object.fromEntries(TRACK_IDS.map(t => [t, { ...tally(), best: null }])), byDiff: Object.fromEntries(DIFF_ORDER.map(d => [d, tally()])) },
    history: [], milestones: [],
    ledger: { seen: [], tx: [], seq: 0 },
  };
}

// Championship difficulty unlocks follow from completion records: Rookie always, Pro after a completed Rookie run, Ace after Pro.
export function derivedChampUnlocks(ch) { const u = ['rookie']; if ((ch.completed.rookie || 0) > 0) u.push('pro'); if ((ch.completed.pro || 0) > 0) u.push('ace'); return u; }

// numbers the unlock conditions of special items and milestones refer to
export function statValue(p, path) {
  if (path === 'trackWins') return TRACK_IDS.filter(t => (p.stats.byTrack[t] || {}).wins > 0).length;
  return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : 0), p.stats);
}
export function conditionMet(p, u) {
  if (!u) return false;
  if (u.type === 'default') return true;
  if (u.type === 'championship') return ((u.title ? p.championships.titles : p.championships.completed)[u.diff] || 0) > 0;
  if (u.type === 'milestone' || u.type === 'achievement') return statValue(p, u.stat) >= u.at;
  return false; // credits/tokens need a purchase; event and premium cannot be met in this version
}
export const unlockedSet = p => new Set(p.inventory.unlocked);

export function sanitizeCustom(raw, shipId, unlocked, issues = [], tag = '') {
  const d = defaultCustom(shipId), c = { ...d };
  if (!isObj(raw)) { if (raw !== undefined) issues.push(`${tag}custom: not an object, reset`); return c; }
  for (const k of ['primary', 'secondary', 'accent']) {
    const v = typeof raw[k] === 'string' ? raw[k].toLowerCase() : null;
    if (v && HEX.test(v)) c[k] = v; else if (raw[k] !== undefined) issues.push(`${tag}${k}: invalid colour, reset`);
  }
  for (const s of SLOTS) {
    const v = raw[s];
    if (v === undefined) continue;
    if (v === null && s === 'paint') { c.paint = null; continue; }
    const it = ITEM[v];
    if (it && it.slot === s && it.class !== 'premium' && unlocked.has(v)) c[s] = v;
    else { issues.push(`${tag}${s}: ${it ? (it.class === 'premium' ? 'premium item cannot be equipped' : 'item not unlocked') : 'unknown item'} (${String(v).slice(0, 40)}), reset`); c[s] = SLOT_DEFAULT[s]; }
  }
  return c;
}

function sanitizeRun(r, issues, active) {
  if (!isObj(r) || typeof r.runId !== 'string' || !RUN_ID.test(r.runId)) { issues.push('championship run: bad id, dropped'); return null; }
  if (!DIFF_ORDER.includes(r.diff) || !SHIP_IDS.includes(r.ship)) { issues.push(`championship run ${r.runId}: bad difficulty or ship, dropped`); return null; }
  const rounds = CHAMPIONSHIP.length, out = { runId: r.runId, diff: r.diff, laps: int(r.laps, 1, 9, 3), ship: r.ship, startedAt: int(r.startedAt, 0, 9e15, 0), round: int(r.round, 0, rounds, 0),
    results: [], credits: { races: int(r.credits && r.credits.races, 0, MAX_BALANCE, 0), completion: 0, standing: 0, total: 0 }, tokens: int(r.tokens, 0, MAX_BALANCE, 0) };
  const res = Array.isArray(r.results) ? r.results : [];
  for (const x of res) { if (!isObj(x)) continue; const round = int(x.round, 0, rounds - 1, -1); if (round < 0 || out.results.some(e => e.round === round)) continue;
    out.results.push({ round, track: TRACK_IDS.includes(x.track) ? x.track : CHAMPIONSHIP[round], place: int(x.place, 1, 6, 6), points: int(x.points, 0, 99, 0), credits: int(x.credits, 0, MAX_BALANCE, 0), eventId: typeof x.eventId === 'string' && EVENT_ID.test(x.eventId) ? x.eventId : null }); }
  out.results.sort((a, b) => a.round - b.round);
  if (active) {
    if (out.results.length !== out.round || out.results.some((e, k) => e.round !== k)) { issues.push(`championship run ${r.runId}: results do not match its round counter, dropped`); return null; }
    // finishing order of every round so far (the standings are recomputed from these with the game's own points table)
    const orders = Array.isArray(r.orders) ? r.orders : [];
    if (orders.length !== out.round || !orders.every(o => Array.isArray(o) && o.length === CHAMP_NAMES.length && CHAMP_NAMES.every(n => o.includes(n)))) { issues.push(`championship run ${r.runId}: finishing orders invalid, dropped`); return null; }
    if (out.results.some((e, k) => orders[k].indexOf('YOU') + 1 !== e.place)) { issues.push(`championship run ${r.runId}: results disagree with finishing orders, dropped`); return null; }
    out.orders = orders.map(o => [...o]);
    return out;
  }
  // a finished run (completed or abandoned)
  out.status = r.status === 'completed' ? 'completed' : 'abandoned'; out.endedAt = int(r.endedAt, 0, 9e15, 0); out.standing = r.standing == null ? null : int(r.standing, 1, 6, 6);
  for (const k of ['completion', 'standing']) out.credits[k] = int(r.credits && r.credits[k], 0, MAX_BALANCE, 0);
  out.credits.total = out.credits.races + out.credits.completion + out.credits.standing; out.unlocked = DIFF_ORDER.includes(r.unlocked) ? r.unlocked : null;
  out.points = int(r.points, 0, 999, 0);
  return out;
}

// Returns a valid profile whatever it is given; `issues` lists everything that had to be repaired.
export function sanitize(raw, now = Date.now()) {
  const issues = [], p = createProfile(now);
  if (!isObj(raw)) { issues.push('profile: not an object, started fresh'); return { profile: p, issues }; }
  p.createdAt = int(raw.createdAt, 0, 9e15, now); p.updatedAt = int(raw.updatedAt, 0, 9e15, now);
  for (const k of ['wallet', 'earned', 'spent']) for (const c of ['CR', 'ST']) {
    const v = raw[k] && raw[k][c]; if (v === undefined) continue;
    const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > MAX_BALANCE || Math.round(n) !== n) issues.push(`${k}.${c}: invalid amount (${String(v).slice(0, 20)}), ${n < 0 ? 'set to 0' : 'clamped'}`);
    p[k][c] = int(v, 0, MAX_BALANCE, 0);
  }
  // inventory first: equipped items are checked against it
  const inv = isObj(raw.inventory) ? raw.inventory : {}, un = new Set(DEFAULT_ITEMS);
  for (const id of Array.isArray(inv.unlocked) ? inv.unlocked : []) {
    const it = ITEM[id];
    if (!it) { issues.push(`inventory: unknown item ${String(id).slice(0, 40)}, dropped`); continue; }
    if (it.class === 'premium' || it.class === 'event') { issues.push(`inventory: ${id} cannot be unlocked in this version, dropped`); continue; }
    if (it.class === 'special') continue; // re-derived from progress below
    un.add(id);
  }
  if (isObj(inv.acquired)) for (const [id, a] of Object.entries(inv.acquired)) if (un.has(id) && isObj(a)) p.inventory.acquired[id] = { at: int(a.at, 0, 9e15, 0), via: ['CR', 'ST', 'default', 'earned'].includes(a.via) ? a.via : 'earned' };
  // stats (needed to re-derive special items)
  const st = isObj(raw.stats) ? raw.stats : {};
  for (const k of ['races', 'wins', 'podiums']) p.stats[k] = int(st[k], 0, 1e9, 0);
  const fixTally = (o, src, best) => { if (!isObj(src)) return; for (const k of ['races', 'wins', 'podiums', 'credits']) o[k] = int(src[k], 0, k === 'credits' ? MAX_BALANCE : 1e9, 0);
    if (o.podiums > o.races) o.podiums = o.races; if (o.wins > o.podiums) o.wins = o.podiums; if (best) o.best = src.best == null ? null : int(src.best, 1, 6, null); };
  for (const m of MODES) fixTally(p.stats.byMode[m], st.byMode && st.byMode[m]);
  for (const t of TRACK_IDS) fixTally(p.stats.byTrack[t], st.byTrack && st.byTrack[t], true);
  for (const d of DIFF_ORDER) fixTally(p.stats.byDiff[d], st.byDiff && st.byDiff[d]);
  if (p.stats.podiums > p.stats.races) { issues.push('stats: more podiums than races, clamped'); p.stats.podiums = p.stats.races; }
  if (p.stats.wins > p.stats.podiums) { issues.push('stats: more wins than podiums, clamped'); p.stats.wins = p.stats.podiums; }
  // championships: unlocks must agree with completion records
  const ch = isObj(raw.championships) ? raw.championships : {};
  for (const d of DIFF_ORDER) { p.championships.completed[d] = int(ch.completed && ch.completed[d], 0, 1e6, 0); p.championships.titles[d] = Math.min(p.championships.completed[d], int(ch.titles && ch.titles[d], 0, 1e6, 0));
    p.championships.best[d] = ch.best && ch.best[d] != null ? int(ch.best[d], 1, 6, null) : null; }
  p.championships.unlocked = derivedChampUnlocks(p.championships);
  if (Array.isArray(ch.unlocked) && ch.unlocked.some(d => !p.championships.unlocked.includes(d))) issues.push(`championships: unlock list (${ch.unlocked.join(',')}) does not match completion records, corrected`);
  if (ch.active != null) { const a = sanitizeRun(ch.active, issues, true); if (a && !p.championships.unlocked.includes(a.diff)) issues.push(`championship run ${a.runId}: ${a.diff} is not unlocked, dropped`); else p.championships.active = a; }
  if (Array.isArray(ch.runs)) p.championships.runs = ch.runs.map(r => sanitizeRun(r, issues, false)).filter(Boolean).slice(-LIMITS.runs);
  // special items follow from progress
  for (const it of Object.values(ITEM)) if (it.class === 'special' && conditionMet(p, it.unlock)) un.add(it.id);
  p.inventory.unlocked = [...un];
  // ships: upgrades and paint jobs
  const ships = isObj(raw.ships) ? raw.ships : {};
  for (const id of Object.keys(ships)) if (!SHIP_IDS.includes(id)) issues.push(`ships: unknown ship ${String(id).slice(0, 30)}, dropped`);
  for (const id of SHIP_IDS) {
    const s = ships[id]; if (s === undefined) continue; if (!isObj(s)) { issues.push(`ships.${id}: not an object, reset`); continue; }
    for (const u of UPGRADE_IDS) { const v = s.upgrades && s.upgrades[u]; if (v === undefined) continue; const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > UPGRADES.maxLevel) issues.push(`ships.${id}.${u}: invalid level ${String(v).slice(0, 10)}, clamped`); p.ships[id].upgrades[u] = int(v, 0, UPGRADES.maxLevel, 0); }
    p.ships[id].custom = sanitizeCustom(s.custom, id, un, issues, `ships.${id}.`);
  }
  p.selectedShip = SHIP_IDS.includes(raw.selectedShip) ? raw.selectedShip : SHIP_IDS[0];
  // history, milestones, ledger
  if (Array.isArray(raw.history)) p.history = raw.history.filter(isObj).slice(-LIMITS.history).map(h => ({ id: typeof h.id === 'string' ? h.id.slice(0, 90) : '', at: int(h.at, 0, 9e15, 0), mode: MODES.includes(h.mode) ? h.mode : 'quick',
    track: TRACK_IDS.includes(h.track) ? h.track : TRACK_IDS[0], diff: DIFF_ORDER.includes(h.diff) ? h.diff : null, laps: int(h.laps, 1, 9, 3), ship: SHIP_IDS.includes(h.ship) ? h.ship : SHIP_IDS[0],
    place: int(h.place, 1, 6, 6), field: int(h.field, 1, 6, 6), time: Number.isFinite(+h.time) ? +(+h.time).toFixed(2) : 0, credits: int(h.credits, 0, MAX_BALANCE, 0), tokens: int(h.tokens, 0, MAX_BALANCE, 0) }));
  if (Array.isArray(raw.milestones)) p.milestones = [...new Set(raw.milestones.filter(m => MILESTONES.some(x => x.id === m)))];
  const lg = isObj(raw.ledger) ? raw.ledger : {};
  if (Array.isArray(lg.seen)) p.ledger.seen = [...new Set(lg.seen.filter(e => typeof e === 'string' && EVENT_ID.test(e)))].slice(-LIMITS.seen);
  if (Array.isArray(lg.tx)) p.ledger.tx = lg.tx.filter(isObj).slice(-LIMITS.tx).map(t => ({ id: String(t.id || '').slice(0, 90), at: int(t.at, 0, 9e15, 0), kind: String(t.kind || '').slice(0, 20), reason: String(t.reason || '').slice(0, 80),
    lines: Array.isArray(t.lines) ? t.lines.filter(l => isObj(l) && (l.cur === 'CR' || l.cur === 'ST')).slice(0, 8).map(l => ({ cur: l.cur, amt: int(l.amt, -MAX_BALANCE, MAX_BALANCE, 0) })) : [] }));
  p.ledger.seq = int(lg.seq, 0, 1e12, 0);
  return { profile: p, issues };
}

// v0 -> v1: an unversioned profile (the shape sketched in the design brief, or an early prototype) is mapped field by
// field onto v1; anything unrecognised is left out and sanitize() repairs the rest.
const UP_ALIASES = { engine: 'engine', acceleration: 'accel', accel: 'accel', handling: 'handling', boost: 'boost', stability: 'stability' };
export const MIGRATIONS = {
  0: raw => {
    const out = { version: 1, createdAt: raw.createdAt, wallet: { CR: raw.credits ?? (raw.wallet && raw.wallet.CR), ST: raw.styleTokens ?? (raw.wallet && raw.wallet.ST) }, ships: {}, selectedShip: raw.selectedShip };
    if (isObj(raw.ships)) for (const [id, s] of Object.entries(raw.ships)) { if (!isObj(s)) continue; const up = {};
      if (isObj(s.upgrades)) for (const [k, v] of Object.entries(s.upgrades)) if (UP_ALIASES[k]) up[UP_ALIASES[k]] = v;
      const c = isObj(s.customization) ? s.customization : isObj(s.custom) ? s.custom : {};
      out.ships[id] = { upgrades: up, custom: { primary: c.primaryColor ?? c.primary, secondary: c.secondaryColor ?? c.secondary, accent: c.accentColor ?? c.accent } }; }
    if (isObj(raw.inventory)) out.inventory = { unlocked: raw.inventory.unlockedCosmetics || raw.inventory.unlocked || [] };
    if (isObj(raw.championships)) { const c = raw.championships, completed = { rookie: 0, pro: 0, ace: 0 };
      for (const r of Array.isArray(c.completedRuns) ? c.completedRuns : []) if (isObj(r) && DIFF_ORDER.includes(r.difficulty || r.diff)) completed[r.difficulty || r.diff]++;
      out.championships = { completed }; }
    if (isObj(raw.statistics)) out.stats = { races: raw.statistics.racesCompleted, wins: raw.statistics.racesWon, podiums: raw.statistics.podiums };
    return out;
  },
};
export function migrate(raw) {
  if (!isObj(raw)) return { data: raw, from: null };
  let v = Number.isInteger(raw.version) ? raw.version : 0, data = raw; const from = v;
  if (v > PROFILE_VERSION) return { data: null, from, future: true };
  while (v < PROFILE_VERSION) { const m = MIGRATIONS[v]; if (!m) return { data: null, from }; data = m(data); v++; }
  return { data, from };
}
