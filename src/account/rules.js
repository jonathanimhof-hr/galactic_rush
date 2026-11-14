// GALACTIC RUSH V12 — account data rules shared by the game and the account server: what an account holds besides the
// career profile (best laps, ghosts, the settings that follow the player), how each piece is checked, how a career
// saved in a browser is checked before it may become an account's career, and the short summary both sides show when
// a device's career and an account's career differ. Nothing here trusts its input: the server runs every check
// again on everything it is sent.
import { SHIPS } from '../config.js';
import { TRACK_DEFS } from '../sim/tracks.js';
import { MODES, UPGRADES, UPGRADE_IDS } from '../progress/economy.js';
import { ITEM } from '../progress/catalog.js';
import { migrate, sanitize, PROFILE_VERSION } from '../progress/profile.js';

const SHIP_IDS = SHIPS.map(s => s.id), TRACK_IDS = TRACK_DEFS.map(d => d.id);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export const COURSES_V12 = new Set(['pelagos', 'nexus']); // V12 changed their layout: their records are kept apart

// ---------- best laps and ghosts ----------
// the key a best lap and a ghost are filed under: course, '@12' for a course V12 changed, '~relaxed' for Relaxed handling
export function recordKey(track, handling) { const k = COURSES_V12.has(track) ? track + '@12' : track; return handling === 'classic' ? k : k + '~relaxed'; }
const REC_KEY = new RegExp(`^(${TRACK_IDS.join('|')})(@12)?(~relaxed)?$`);
export function parseRecordKey(key) {
  const m = typeof key === 'string' && REC_KEY.exec(key);
  if (!m || (m[2] && !COURSES_V12.has(m[1]))) return null;
  return { track: m[1], v12: !!m[2], handling: m[3] ? 'relaxed' : 'classic' };
}
// no ship covers a lap faster than at 450 m/s all the way round (more than any fully upgraded ship reaches on boost and a
// pad), so a lap or race time below length / 450 m/s cannot be real
export const VMAX = 450;
export function minLap(trackLength) { return trackLength / VMAX; }
export const MAX_GHOST_FRAMES = 20 * 600; // 20 frames a second, ten minutes

export function cleanRecords(raw, lengthOf, issues = []) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [key, r] of Object.entries(raw).slice(0, 200)) {
    const k = parseRecordKey(key);
    if (!k) { issues.push(`records: unknown course key ${String(key).slice(0, 30)}, dropped`); continue; }
    // V1-V11 records of Pelagos and Orbital Nexus were set on the old layouts: kept under their old keys, never under V12's
    if (!isObj(r) || !Number.isFinite(r.lap) || r.lap < minLap(lengthOf(k.track)) || r.lap > 3600) { issues.push(`records.${key}: impossible lap time, dropped`); continue; }
    out[key] = { lap: +r.lap.toFixed(3), ship: SHIP_IDS.includes(r.ship) ? r.ship : SHIP_IDS[0], ...(Number.isFinite(r.at) ? { at: Math.round(r.at) } : {}) };
  }
  return out;
}
// a ghost: { lap, ship, f: [[x, y, z, qx, qy, qz, qw], ...] } recorded at 20 frames a second through one lap
export function checkGhost(g, lengthOf, key) {
  const k = parseRecordKey(key);
  if (!k) return 'unknown course key';
  if (!isObj(g) || !Number.isFinite(g.lap) || g.lap < minLap(lengthOf(k.track)) || g.lap > 3600) return 'impossible lap time';
  if (!SHIP_IDS.includes(g.ship)) return 'unknown ship';
  if (!Array.isArray(g.f) || g.f.length < 2 || g.f.length > Math.min(MAX_GHOST_FRAMES, Math.ceil(g.lap * 20) + 80)) return 'frame count does not fit the lap';
  for (const fr of g.f) if (!Array.isArray(fr) || fr.length !== 7 || !fr.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6)) return 'malformed frame';
  return null;
}

// ---------- settings that follow the player (graphics stay with each device) ----------
const num = (lo, hi) => v => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const oneOf = (...vals) => v => (vals.includes(String(v)) ? String(v) : undefined);
export const SYNCED_SETTINGS = {
  handling: oneOf('relaxed', 'classic'), assist: oneOf('0', '0.3', '0.6'), sens: num(0.6, 1.4), padSens: num(0.6, 1.6), invert: oneOf('false', 'true'), rumble: oneOf('on', 'off'),
  cam: oneOf('chase', 'far', 'cockpit'), fov: num(60, 90), shake: num(0, 1.5), hudScale: num(0.8, 1.3), reducedMotion: oneOf('on', 'off'),
  sound: oneOf('on', 'off'), master: num(0, 1), music: num(0, 1), sfx: num(0, 1),
};
export function cleanSettings(raw) {
  const out = {}; if (!isObj(raw)) return out;
  for (const [k, check] of Object.entries(SYNCED_SETTINGS)) if (raw[k] !== undefined) { const v = check(raw[k]); if (v !== undefined) out[k] = v; }
  return out;
}
export const PILOT_NAME = /^[A-Za-z0-9 ._-]{2,16}$/;

// ---------- a browser career offered to an account ----------
// The career a browser kept could have been edited by hand, so before it becomes an account's career it must pass the
// game's own load checks (migration and validation, progress/profile.js) and the bookkeeping every career written by
// the game keeps: balance = earned - spent for both currencies (every credit and debit since V7 moves both), the
// credits spent cover the upgrades owned, and the race statistics add up.
export function checkCareer(raw, now = Date.now()) {
  const problems = [];
  if (!isObj(raw)) return { ok: false, problems: ['not a career'] };
  const m = migrate(raw);
  if (m.future) return { ok: false, problems: [`saved by a newer version of the game (v${raw.version})`] };
  if (!m.data) return { ok: false, problems: ['unsupported career version'] };
  const { profile: p, issues } = sanitize(m.data, now);
  for (const c of ['CR', 'ST']) if (p.wallet[c] !== p.earned[c] - p.spent[c]) problems.push(`${c} balance ${p.wallet[c]} does not match earned ${p.earned[c]} minus spent ${p.spent[c]}`);
  let upgradeCost = 0;
  for (const id of SHIP_IDS) for (const u of UPGRADE_IDS) for (let k = 0; k < p.ships[id].upgrades[u]; k++) upgradeCost += UPGRADES.costs[k];
  let itemCost = 0; for (const id of p.inventory.unlocked) { const it = ITEM[id], a = p.inventory.acquired[id]; if (it && a && a.via === 'CR' && it.currency === 'CR') itemCost += it.price; }
  if (p.spent.CR < upgradeCost) problems.push(`upgrades worth ${upgradeCost} CR but only ${p.spent.CR} CR spent`);
  const s = p.stats, sum = o => Object.values(o).reduce((a, x) => a + x.races, 0);
  if (sum(s.byMode) !== s.races || sum(s.byTrack) !== s.races) problems.push('race statistics do not add up');
  if (s.byMode && MODES.every(mm => s.byMode[mm]) && sum(s.byDiff) !== s.races - s.byMode.trial.races) problems.push('race statistics by difficulty do not add up');
  return { ok: problems.length === 0, problems, issues, profile: p, itemCost, version: PROFILE_VERSION };
}

// ---------- the summary a player compares when a device's career and an account's career differ ----------
export function careerSummary(p, records = {}) {
  if (!isObj(p) || !isObj(p.wallet)) return null;
  const ups = SHIP_IDS.reduce((a, id) => a + UPGRADE_IDS.reduce((b, u) => b + ((p.ships[id] && p.ships[id].upgrades[u]) || 0), 0), 0);
  const champs = Object.values((p.championships && p.championships.completed) || {}).reduce((a, n) => a + n, 0);
  return { CR: p.wallet.CR, ST: p.wallet.ST, earnedCR: p.earned.CR, races: p.stats ? p.stats.races : 0, wins: p.stats ? p.stats.wins : 0, upgrades: ups, items: (p.inventory && p.inventory.unlocked.length) || 0,
    champs, records: Object.keys(records || {}).length, updatedAt: p.updatedAt || 0, empty: !(p.stats && p.stats.races) && !p.earned.CR && !p.earned.ST && !ups };
}
// the progress two careers have in common, compared after both went through the same checks: equal means the server
// stored exactly the career the device sent
export function progressDigest(p, records = {}) {
  const pick = { wallet: p.wallet, earned: p.earned, spent: p.spent, ships: Object.fromEntries(SHIP_IDS.map(id => [id, p.ships[id] && p.ships[id].upgrades])), items: [...p.inventory.unlocked].sort(),
    champs: p.championships && { completed: p.championships.completed, titles: p.championships.titles }, stats: p.stats && { races: p.stats.races, wins: p.stats.wins, podiums: p.stats.podiums }, milestones: [...(p.milestones || [])].sort(),
    records: Object.fromEntries(Object.entries(records || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, r]) => [k, r.lap])) };
  const text = JSON.stringify(pick); let h = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0') + ':' + text.length;
}
