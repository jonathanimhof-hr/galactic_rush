// GALACTIC RUSH V7 — the upgrade pipeline: base stats (config.js, never modified) + saved levels -> effective stats,
// recomputed from scratch every time, so nothing accumulates however often a race is started or restarted.
import { UPGRADES, UPGRADE_IDS } from './economy.js';

export const CATEGORY = Object.fromEntries(UPGRADES.categories.map(c => [c.id, c]));
export const upgradeCost = level => (Number.isInteger(level) && level >= 0 && level < UPGRADES.maxLevel ? UPGRADES.costs[level] : null);
export const levelShare = level => UPGRADES.curve[Math.max(0, Math.min(UPGRADES.maxLevel, level | 0))];
export const remainingCost = level => UPGRADES.costs.slice(level).reduce((a, b) => a + b, 0);

// A new definition object; the base is only read. Unknown or out-of-range levels count as 0.
export function effectiveDef(base, levels = {}) {
  const def = { ...base };
  for (const c of UPGRADES.categories) {
    const lv = Number.isInteger(levels[c.id]) && levels[c.id] >= 0 && levels[c.id] <= UPGRADES.maxLevel ? levels[c.id] : 0, k = levelShare(lv);
    if (!k) continue;
    for (const [key, op, v] of c.effects) def[key] = op === 'mul' ? base[key] * (1 + v * k) : base[key] + v * k;
  }
  def.upgrades = Object.fromEntries(UPGRADE_IDS.map(id => [id, Number.isInteger(levels[id]) ? levels[id] : 0]));
  return def;
}

// What the UI shows for a category: current and next value of its headline stat, in the units the hangar uses
const KMH = v => Math.round(v * 3.6);
export const HEADLINE = {
  engine: { label: 'Top speed', unit: 'km/h', get: d => KMH(d.maxSpeed) },
  accel: { label: 'Thrust', unit: 'm/s²', get: d => +d.accel.toFixed(1) },
  handling: { label: 'Turn rate', unit: 'rad/s', get: d => +d.yawRate.toFixed(2) },
  boost: { label: 'Boost tank', unit: '', get: d => Math.round(d.boostCap) },
  stability: { label: 'Hull', unit: '', get: d => Math.round(d.hull) },
};
// full stat table rows: [label, getter, unit]
export const STAT_ROWS = [
  ['Top speed', d => KMH(d.maxSpeed), 'km/h'], ['Thrust', d => +d.accel.toFixed(1), 'm/s²'], ['Yaw rate', d => +d.yawRate.toFixed(2), 'rad/s'], ['Pitch rate', d => +d.pitchRate.toFixed(2), 'rad/s'],
  ['Grip', d => +d.grip.toFixed(2), ''], ['Boost tank', d => Math.round(d.boostCap), ''], ['Boost recharge', d => +d.boostRegen.toFixed(1), '/s'], ['Boost power', d => '×' + d.boostMult.toFixed(2), ''],
  ['Hull', d => Math.round(d.hull), ''], ['Mass', d => d.mass.toFixed(2), 't×'],
];
export function preview(base, levels, cat) {
  const lv = levels[cat] | 0, cur = effectiveDef(base, levels), nxt = lv < UPGRADES.maxLevel ? effectiveDef(base, { ...levels, [cat]: lv + 1 }) : null, h = HEADLINE[cat];
  return { level: lv, max: UPGRADES.maxLevel, cost: upgradeCost(lv), now: h.get(cur), next: nxt ? h.get(nxt) : null, base: h.get(base), full: h.get(effectiveDef(base, { ...levels, [cat]: UPGRADES.maxLevel })), label: h.label, unit: h.unit };
}
