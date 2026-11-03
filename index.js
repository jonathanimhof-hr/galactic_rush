// GALACTIC RUSH V7 — the progression service the game talks to. It owns the player profile and is the only code that
// changes it. Every change is a transaction: validated, applied to a copy, checked, then committed and saved in one
// step, or rejected with nothing changed. Committed state is frozen, so UI code can read it but never write to it.
import { SHIPS, CHAMPIONSHIP } from '../config.js';
import { TRACK_DEFS } from '../sim/tracks.js';
import { Championship } from '../sim/championship.js';
import { CURRENCIES, DIFF_ORDER, MODES, MAX_BALANCE, MAX_REWARD, UPGRADES, UPGRADE_IDS } from './economy.js';
import { ITEM, ITEMS, RARITIES, SLOTS, SLOT_DEFAULT, PREMIUM_LABEL, isPurchasable, isPremium, defaultCustom } from './catalog.js';
import { createProfile, sanitizeCustom, derivedChampUnlocks, conditionMet, LIMITS, RUN_ID, EVENT_ID, CHAMP_NAMES } from './profile.js';
import { ProfileStore, browserStorage, MemoryStorage } from './store.js';
import { singleRaceReward, trialReward, champRaceReward, champCompletionReward, nextDifficulty, tokenLines, milestonesReached } from './rewards.js';
import { effectiveDef, preview, CATEGORY } from './upgrades.js';
import { resolveLivery } from './customize.js';

const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
const SHIP_IDS = SHIPS.map(s => s.id), TRACK_IDS = TRACK_DEFS.map(d => d.id);
const rand36 = n => Array.from({ length: n }, () => Math.floor(Math.random() * 36).toString(36)).join('');
const RACE_ID = /^[a-z0-9]{4,12}-[a-z0-9]{4,12}-[a-z0-9]{1,8}$/;
class TxError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new TxError(code, message); };
export const fmtCR = n => `${Math.round(n).toLocaleString('en-US')} CR`;
export const fmtST = n => `${Math.round(n)} ST`;
export const fmtCur = (cur, n) => (cur === 'ST' ? fmtST(n) : fmtCR(n));

// standings from finishing orders, with the game's own championship scoring (sim/championship.js)
export function standingsOf(orders) { const c = new Championship(CHAMP_NAMES); for (const o of orders) c.addResult(o); return c; }

export class Progression {
  constructor(storage = browserStorage() || new MemoryStorage(), { now = () => Date.now() } = {}) {
    this.now = now; this.store = new ProfileStore(storage, now); this.subs = new Set(); this.counter = 0; this.saveT = null;
    const r = this.store.load(); this.loadStatus = r.status; this.loadIssues = r.issues;
    this.p = freeze(r.profile);
    if (this.p.championships.active && this.p.championships.active.round >= CHAMPIONSHIP.length) this.completeRun(this.p.championships.active.runId); // finish a run interrupted between its last round and its bonus
  }
  get profile() { return this.p; }
  wallet() { return { CR: this.p.wallet.CR, ST: this.p.wallet.ST }; }
  onChange(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(kind) { for (const f of this.subs) try { f(kind, this.p); } catch (e) { console.error(e); } }
  get saveOk() { return !this.store.lastError && !this.store.readOnly; }

  // ---------- transaction core ----------
  // mutate(draft, T) applies the change to a copy; T.credit / T.debit are the only way a balance moves.
  transact(kind, reason, mutate, { events = [] } = {}) {
    for (const e of events) {
      if (typeof e !== 'string' || !EVENT_ID.test(e)) return { ok: false, code: 'bad-event', message: 'Invalid event identifier.' };
      if (this.p.ledger.seen.includes(e)) return { ok: false, code: 'duplicate', duplicate: true, message: 'Already processed: this reward was paid once.' };
    }
    const d = clone(this.p), lines = [];
    const amount = (cur, amt) => { if (!CURRENCIES[cur]) fail('bad-currency', `Unknown currency ${cur}.`); if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_REWARD * 10) fail('bad-amount', `Invalid amount ${amt}.`); };
    const T = {
      credit: (cur, amt, why) => { amount(cur, amt); if (amt > MAX_REWARD) fail('bad-amount', 'Reward out of range.'); if (d.wallet[cur] + amt > MAX_BALANCE) fail('limit', 'Balance limit reached.');
        d.wallet[cur] += amt; d.earned[cur] += amt; lines.push({ cur, amt, why }); },
      debit: (cur, amt, why) => { amount(cur, amt); if (d.wallet[cur] < amt) fail('funds', `Not enough ${CURRENCIES[cur].name}: ${fmtCur(cur, amt)} needed, ${fmtCur(cur, d.wallet[cur])} available.`);
        d.wallet[cur] -= amt; d.spent[cur] += amt; lines.push({ cur, amt: -amt, why }); },
    };
    let out;
    try { out = mutate(d, T) || {}; }
    catch (e) { if (!(e instanceof TxError)) console.error('progression: transaction failed', e); return { ok: false, code: e.code || 'error', message: e instanceof TxError ? e.message : 'Unexpected error; nothing was changed.' }; }
    for (const c of Object.keys(CURRENCIES)) if (!Number.isInteger(d.wallet[c]) || d.wallet[c] < 0 || d.wallet[c] > MAX_BALANCE) return { ok: false, code: 'invariant', message: 'Balance check failed; nothing was changed.' };
    for (const e of events) d.ledger.seen.push(e);
    if (d.ledger.seen.length > LIMITS.seen) d.ledger.seen.splice(0, d.ledger.seen.length - LIMITS.seen);
    d.ledger.seq++; const txId = `${kind}-${d.ledger.seq}`;
    if (lines.length) { d.ledger.tx.push({ id: txId, at: this.now(), kind, reason: String(reason).slice(0, 80), lines: lines.map(l => ({ cur: l.cur, amt: l.amt })) }); if (d.ledger.tx.length > LIMITS.tx) d.ledger.tx.splice(0, d.ledger.tx.length - LIMITS.tx); }
    d.updatedAt = this.now();
    this.p = freeze(d); clearTimeout(this.saveT); this.saveT = null;
    const saved = this.store.save(this.p);
    this.emit(kind);
    return { ok: true, saved, txId, lines, balance: this.wallet(), ...out };
  }
  // low-stakes preference changes (selected ship): same validation, saved shortly after
  light(mutate) {
    const d = clone(this.p); mutate(d); d.updatedAt = this.now(); this.p = freeze(d); this.emit('light');
    clearTimeout(this.saveT); this.saveT = setTimeout(() => { this.saveT = null; this.store.save(this.p); }, 400);
  }
  flush() { if (this.saveT) { clearTimeout(this.saveT); this.saveT = null; this.store.save(this.p); } }

  // ---------- ships and upgrades ----------
  shipOk(id) { return SHIP_IDS.includes(id) && this.p.ships[id] && this.p.ships[id].unlocked; }
  selectShip(id) { if (!this.shipOk(id) || this.p.selectedShip === id) return false; this.light(d => { d.selectedShip = id; }); return true; }
  upgrades(shipId) { return this.shipOk(shipId) ? { ...this.p.ships[shipId].upgrades } : null; }
  // base stats + saved levels -> a fresh effective definition (base stats in config.js are never touched)
  effectiveDef(shipId) { const base = SHIPS.find(s => s.id === shipId); if (!base) return null; return effectiveDef(base, this.p.ships[shipId] ? this.p.ships[shipId].upgrades : {}); }
  upgradeRows(shipId) {
    const base = SHIPS.find(s => s.id === shipId), lv = this.upgrades(shipId);
    return UPGRADES.categories.map(c => {
      if (!base || !lv) return { cat: c, ok: false, reason: 'Ship data unavailable.' };
      const pv = preview(base, lv, c.id), cr = this.p.wallet.CR;
      const reason = pv.level >= UPGRADES.maxLevel ? 'Maximum level reached.' : cr < pv.cost ? `Need ${fmtCR(pv.cost - cr)} more.` : null;
      return { cat: c, ...pv, ok: !reason, reason, after: pv.cost != null ? cr - pv.cost : null };
    });
  }
  buyUpgrade(shipId, cat, expectLevel) {
    if (!this.shipOk(shipId)) return { ok: false, code: 'bad-ship', message: 'Unknown spacecraft.' };
    if (!CATEGORY[cat]) return { ok: false, code: 'bad-upgrade', message: 'Unknown upgrade.' };
    return this.transact('upgrade', `${shipId} ${cat}`, (d, T) => {
      const up = d.ships[shipId].upgrades, lv = up[cat];
      if (!Number.isInteger(lv) || lv < 0 || lv > UPGRADES.maxLevel) fail('bad-data', 'Upgrade data is invalid.');
      if (expectLevel !== undefined && expectLevel !== lv) fail('stale', 'That upgrade was already applied.'); // a second click on the same button
      if (lv >= UPGRADES.maxLevel) fail('max', `${CATEGORY[cat].name} is already at level ${UPGRADES.maxLevel}.`);
      const cost = UPGRADES.costs[lv]; T.debit('CR', cost, `${CATEGORY[cat].name} ${lv + 1}`); up[cat] = lv + 1;
      return { shipId, cat, level: lv + 1, cost };
    });
  }

  // ---------- cosmetics: catalog, shop, inventory, paint jobs ----------
  isUnlocked(id) { return this.p.inventory.unlocked.includes(id); }
  itemState(it, shipId) {
    const unlocked = this.isUnlocked(it.id), equipped = !!shipId && it.slot !== 'skin' && this.p.ships[shipId] && this.p.ships[shipId].custom[it.slot] === it.id;
    let status, reason = null;
    if (isPremium(it)) { status = 'premium'; reason = PREMIUM_LABEL; }
    else if (unlocked) status = equipped ? 'equipped' : 'owned';
    else if (isPurchasable(it)) { status = 'buy'; const have = this.p.wallet[it.currency]; if (have < it.price) reason = `Need ${fmtCur(it.currency, it.price - have)} more.`; }
    else { status = 'locked'; reason = unlockText(it.unlock); }
    return { ...it, unlocked, equipped, status, reason, canBuy: status === 'buy' && !reason, canEquip: unlocked && !isPremium(it) };
  }
  catalog(shipId, { category = 'all', rarity = 'all', status = 'all' } = {}) {
    return ITEMS.filter(it => (category === 'all' || it.category === category) && (rarity === 'all' || it.rarity === rarity)).map(it => this.itemState(it, shipId))
      .filter(s => status === 'all' || (status === 'unlocked' ? s.unlocked : status === 'locked' ? !s.unlocked : status === 'equipped' ? s.equipped : true));
  }
  buyItem(id) {
    const it = ITEM[id];
    if (!it) return { ok: false, code: 'unknown', message: 'Unknown item.' };
    if (isPremium(it)) return { ok: false, code: 'premium', message: `${PREMIUM_LABEL}. Premium items cannot be bought or unlocked in this version.` };
    if (!isPurchasable(it)) return { ok: false, code: 'not-for-sale', message: `${it.name} is not sold in the shop: ${unlockText(it.unlock)}` };
    return this.transact('purchase', it.name, (d, T) => {
      if (d.inventory.unlocked.includes(id)) fail('owned', `${it.name} is already unlocked.`);
      T.debit(it.currency, it.price, it.name); d.inventory.unlocked.push(id); d.inventory.acquired[id] = { at: this.now(), via: it.currency };
      return { item: id, price: it.price, currency: it.currency };
    });
  }
  custom(shipId) { return this.shipOk(shipId) ? { ...this.p.ships[shipId].custom } : null; }
  // validate a paint job strictly: nothing is silently changed; anything locked or malformed rejects the whole change
  checkCustom(shipId, c) { const issues = []; const clean = sanitizeCustom(c, shipId, new Set(this.p.inventory.unlocked), issues); return { clean, issues }; }
  setCustom(shipId, c) {
    if (!this.shipOk(shipId)) return { ok: false, code: 'bad-ship', message: 'Unknown spacecraft.' };
    const { clean, issues } = this.checkCustom(shipId, c);
    if (issues.length) return { ok: false, code: 'invalid', message: issues[0], issues };
    return this.transact('paint', shipId, d => { d.ships[shipId].custom = clean; return { custom: clean }; });
  }
  equip(shipId, id) {
    const it = ITEM[id];
    if (!it || !SLOTS.includes(it.slot)) return { ok: false, code: 'unknown', message: 'Unknown item.' };
    if (isPremium(it)) return { ok: false, code: 'premium', message: PREMIUM_LABEL };
    if (!this.isUnlocked(id)) return { ok: false, code: 'locked', message: `${it.name} is locked.` };
    return this.setCustom(shipId, { ...this.custom(shipId), [it.slot]: id });
  }
  unequip(shipId, slot) { if (!SLOTS.includes(slot)) return { ok: false, code: 'bad-slot', message: 'Unknown slot.' }; return this.setCustom(shipId, { ...this.custom(shipId), [slot]: SLOT_DEFAULT[slot] }); }
  resetCustom(shipId) { return this.setCustom(shipId, defaultCustom(shipId)); }
  livery(shipId, draft) { return resolveLivery(shipId, draft || this.custom(shipId)); }

  // ---------- races ----------
  newRaceId() { return `${this.now().toString(36)}-${rand36(6)}-${(++this.counter).toString(36)}`; }
  // ctx comes from the race simulation once the player has crossed the line: { raceId, mode, track, diff, laps, ship, place,
  // field, time, record, runId (championship), order (finishing order by name, championship) }
  completeRace(ctx) {
    const c = ctx || {}, mode = c.mode;
    if (!c.finished) return { ok: false, code: 'not-finished', message: 'Race not completed.' };
    if (!MODES.includes(mode)) return { ok: false, code: 'bad-mode', message: 'Unknown game mode.' };
    if (typeof c.raceId !== 'string' || !RACE_ID.test(c.raceId)) return { ok: false, code: 'bad-event', message: 'Missing race identifier.' };
    if (!TRACK_IDS.includes(c.track) || !SHIP_IDS.includes(c.ship)) return { ok: false, code: 'bad-race', message: 'Unknown course or spacecraft.' };
    const laps = c.laps, field = c.field, place = c.place;
    if (!Number.isInteger(laps) || laps < 1 || laps > 9 || !Number.isInteger(field) || field < 1 || field > 6 || !Number.isInteger(place) || place < 1 || place > field) return { ok: false, code: 'bad-race', message: 'Race result out of range.' };
    if (mode !== 'trial' && !DIFF_ORDER.includes(c.diff)) return { ok: false, code: 'bad-race', message: 'Unknown difficulty.' };
    const diff = mode === 'trial' ? null : c.diff;
    const r = mode === 'quick' ? singleRaceReward({ diff, laps, place }) : mode === 'trial' ? trialReward({ laps }) : champRaceReward({ diff, laps, place });
    if (!r) return { ok: false, code: 'bad-race', message: 'No reward configuration for this race.' };
    const eventId = `race:${c.raceId}`;
    const res = this.transact('race', `${mode} ${c.track}`, (d, T) => {
      let run = null;
      if (mode === 'champ') {
        run = d.championships.active;
        if (!run || run.runId !== c.runId) fail('bad-run', 'No matching championship run.');
        if (run.round >= CHAMPIONSHIP.length || CHAMPIONSHIP[run.round] !== c.track || run.diff !== diff || run.laps !== laps) fail('bad-run', 'Race does not match the championship run.');
        if (!Array.isArray(c.order) || c.order.length !== CHAMP_NAMES.length || !CHAMP_NAMES.every(n => c.order.includes(n)) || c.order.indexOf('YOU') + 1 !== place) fail('bad-run', 'Finishing order invalid.');
      }
      const lines = [{ id: 'race', name: mode === 'champ' ? `Round ${run.round + 1} reward` : mode === 'trial' ? 'Time trial reward' : 'Race reward', CR: r.credits }];
      T.credit('CR', r.credits, lines[0].name);
      // statistics
      const S = d.stats, win = mode !== 'trial' && place === 1, pod = mode !== 'trial' && place <= 3;
      const bump = o => { o.races++; if (win) o.wins++; if (pod) o.podiums++; o.credits = Math.min(MAX_BALANCE, (o.credits || 0) + r.credits); };
      S.races++; if (win) S.wins++; if (pod) S.podiums++;
      bump(S.byMode[mode]); bump(S.byTrack[c.track]); if (diff) bump(S.byDiff[diff]);
      if (mode !== 'trial') { const bt = S.byTrack[c.track]; bt.best = bt.best == null ? place : Math.min(bt.best, place); }
      // Style Tokens from existing systems (wins, course records) and one-time milestones
      let tokens = 0;
      for (const t of tokenLines({ mode, place, record: !!c.record })) { T.credit('ST', t.ST, t.name); lines.push({ id: t.id, name: t.name, ST: t.ST }); tokens += t.ST; }
      const ms = milestonesReached(S, d.milestones);
      for (const m of ms) { d.milestones.push(m.id); T.credit('ST', m.ST, m.name); lines.push({ id: m.id, name: `Milestone: ${m.name}`, ST: m.ST }); tokens += m.ST; }
      const unlocks = unlockSpecials(d, this.now());
      d.history.push({ id: c.raceId, at: this.now(), mode, track: c.track, diff, laps, ship: c.ship, place, field, time: Number.isFinite(c.time) ? +c.time.toFixed(2) : 0, credits: r.credits, tokens });
      if (d.history.length > LIMITS.history) d.history.splice(0, d.history.length - LIMITS.history);
      let champ = null;
      if (run) {
        const pts = standingsOf([c.order]).points.YOU;
        run.results.push({ round: run.round, track: c.track, place, points: pts, credits: r.credits, eventId }); run.orders.push([...c.order]);
        run.round++; run.credits.races += r.credits; run.tokens += tokens;
        champ = { runId: run.runId, round: run.round, rounds: CHAMPIONSHIP.length, runCredits: run.credits.races, done: run.round >= CHAMPIONSHIP.length };
      }
      return { mode, credits: r.credits, tokens, parts: r.parts, lines, unlocks, champ };
    }, { events: [eventId] });
    if (res.ok && res.champ && res.champ.done) res.completion = this.completeRun(res.champ.runId);
    return res;
  }

  // ---------- championships ----------
  champUnlocked(diff) { return this.p.championships.unlocked.includes(diff); }
  activeRun() { return this.p.championships.active; }
  runStandings(run) { return standingsOf((run || this.activeRun() || { orders: [] }).orders || []); }
  startRun({ diff, laps, ship }) {
    if (!DIFF_ORDER.includes(diff)) return { ok: false, code: 'bad-diff', message: 'Unknown difficulty.' };
    if (!this.champUnlocked(diff)) return { ok: false, code: 'locked', message: `${label(diff)} Championship is locked: ${unlockText({ type: 'championship', diff: DIFF_ORDER[DIFF_ORDER.indexOf(diff) - 1] })}` };
    if (!Number.isInteger(laps) || laps < 1 || laps > 9 || !this.shipOk(ship)) return { ok: false, code: 'bad-run', message: 'Invalid championship settings.' };
    if (this.activeRun()) return { ok: false, code: 'active-run', message: 'A championship is already in progress. Continue or abandon it first.' };
    let runId; do runId = `champ-${this.now().toString(36)}-${rand36(6)}`; while (this.p.championships.runs.some(r => r.runId === runId));
    return this.transact('run', `start ${diff}`, d => {
      d.championships.active = { runId, diff, laps, ship, startedAt: this.now(), round: 0, results: [], orders: [], credits: { races: 0, completion: 0, standing: 0, total: 0 }, tokens: 0 };
      return { run: d.championships.active };
    });
  }
  abandonRun(runId) {
    return this.transact('run', 'abandon', d => {
      const a = d.championships.active; if (!a || a.runId !== runId) fail('bad-run', 'No such championship in progress.');
      d.championships.runs.push(summary(a, 'abandoned', null, this.now())); trimRuns(d); d.championships.active = null;
      return { runId };
    });
  }
  // completion bonus + final-standing bonus + Style Tokens + next-difficulty unlock, paid once per run id
  completeRun(runId) {
    return this.transact('champ', `complete ${runId}`, (d, T) => {
      const a = d.championships.active;
      if (!a || a.runId !== runId) fail('bad-run', 'No such championship in progress.');
      if (a.round < CHAMPIONSHIP.length) fail('incomplete', 'The championship is not finished yet.');
      const st = standingsOf(a.orders).standings(), standing = st.findIndex(e => e.name === 'YOU') + 1;
      const b = champCompletionReward({ diff: a.diff, laps: a.laps, standing });
      T.credit('CR', b.completion, 'Championship completion bonus'); if (b.standing > 0) T.credit('CR', b.standing, `Final standing P${standing}`); if (b.tokens > 0) T.credit('ST', b.tokens, 'Championship tokens');
      const ch = d.championships, before = [...ch.unlocked];
      ch.completed[a.diff]++; if (standing === 1) ch.titles[a.diff]++; ch.best[a.diff] = ch.best[a.diff] == null ? standing : Math.min(ch.best[a.diff], standing);
      ch.unlocked = derivedChampUnlocks(ch);
      const newly = ch.unlocked.find(x => !before.includes(x)) || null;
      a.credits.completion = b.completion; a.credits.standing = b.standing; a.tokens += b.tokens;
      const unlocks = unlockSpecials(d, this.now());
      const s = summary(a, 'completed', standing, this.now()); s.unlocked = newly;
      ch.runs.push(s); trimRuns(d); ch.active = null;
      return { run: s, standing, standings: st, parts: b.parts, standingShare: b.share, bonusTokens: b.tokens, newlyUnlocked: newly, isHighest: a.diff === DIFF_ORDER[DIFF_ORDER.length - 1], next: nextDifficulty(a.diff), unlocks };
    }, { events: [`champdone:${runId}`] });
  }
  runSummary(runId) { return this.p.championships.runs.find(r => r.runId === runId) || null; }

  // ---------- career overview ----------
  career() {
    const p = this.p, ups = SHIP_IDS.reduce((a, id) => a + UPGRADE_IDS.reduce((b, k) => b + p.ships[id].upgrades[k], 0), 0), upMax = SHIP_IDS.length * UPGRADE_IDS.length * UPGRADES.maxLevel;
    const earnable = ITEMS.filter(i => i.class !== 'premium' && i.class !== 'event'), owned = earnable.filter(i => this.isUnlocked(i.id)).length;
    return { wallet: this.wallet(), earned: { ...p.earned }, spent: { ...p.spent }, stats: p.stats, upgrades: [ups, upMax], cosmetics: [owned, earnable.length], champs: p.championships, history: p.history, milestones: p.milestones };
  }
}

function summary(a, status, standing, now) {
  const cr = a.credits, completion = cr.completion || 0, stand = cr.standing || 0;
  return { runId: a.runId, diff: a.diff, laps: a.laps, ship: a.ship, startedAt: a.startedAt, endedAt: now, status, standing, points: standingsOf(a.orders).points.YOU || 0,
    results: a.results.map(r => ({ ...r })), credits: { races: cr.races, completion, standing: stand, total: cr.races + completion + stand }, tokens: a.tokens, unlocked: null };
}
function trimRuns(d) { const r = d.championships.runs; if (r.length > LIMITS.runs) r.splice(0, r.length - LIMITS.runs); }
// special items unlock themselves when their condition is met (championships, milestones, achievements)
function unlockSpecials(d, now) {
  const out = [];
  for (const it of ITEMS) if (it.class === 'special' && !d.inventory.unlocked.includes(it.id) && conditionMet(d, it.unlock)) { d.inventory.unlocked.push(it.id); d.inventory.acquired[it.id] = { at: now, via: 'earned' }; out.push(it.id); }
  return out;
}
const label = d => ({ rookie: 'Rookie', pro: 'Pro', ace: 'Ace' })[d] || d;
export function unlockText(u) {
  if (!u) return '';
  switch (u.type) {
    case 'default': return 'Owned from the start.';
    case 'credits': return `Unlock in the shop for ${fmtCR(u.price)}.`;
    case 'tokens': return `Unlock in the shop for ${fmtST(u.price)}.`;
    case 'championship': return u.title ? `Win the ${label(u.diff)} Championship title.` : `Complete the ${label(u.diff)} Championship.`;
    case 'milestone': return `Complete ${u.at} ${u.stat}.`;
    case 'achievement': return u.stat === 'trackWins' ? 'Win a race on every course.' : u.stat === 'byDiff.ace.wins' ? `Win ${u.at} races on Ace.` : `Reach ${u.at} ${u.stat}.`;
    case 'event': return 'Reward for a future event. No event is running in this version.';
    case 'premium': return PREMIUM_LABEL;
    default: return '';
  }
}
export { RARITIES, ITEMS, ITEM, CATEGORY, RUN_ID };
