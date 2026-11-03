// GALACTIC RUSH V7 — the one place for progression numbers: currencies, race and championship rewards, Style Token
// sources, milestones and spacecraft upgrades. Game code and UI read these; nothing else hard-codes a reward or a cost.
// Calibration (see README "Economy"): relaxed-handling laps measure 37-63 s (about 45 s on average) and every race
// adds ~25 s of countdown, finish and menus, so a 3-lap race is ~2.8 minutes from start to start.

export const CURRENCIES = {
  CR: { id: 'CR', name: 'Credits', short: 'CR', desc: 'Earned by racing. Spent on upgrades and on some cosmetics.' },
  ST: { id: 'ST', name: 'Style Tokens', short: 'ST', desc: 'Earned through wins, course records, championships and milestones. Spent on cosmetics only.' },
};
export const DIFF_ORDER = ['rookie', 'pro', 'ace'];
export const MODES = ['quick', 'champ', 'trial'];
export const MAX_BALANCE = 999999999;
export const MAX_REWARD = 100000; // a single reward line above this is treated as invalid data

// Lap multipliers for the lap counts the game offers (1, 2, 3, 5). They keep credits per minute nearly flat across
// lap counts (1 lap ~1.2 min, 3 laps ~2.8 min, 5 laps ~4.4 min with overheads): longer races pay more in total,
// and short races are not a faster way to farm. Other counts interpolate (and extrapolate at +0.25 per lap).
export const LAP_MULT = { 1: 0.45, 2: 0.75, 3: 1.0, 5: 1.5 };
export function lapMult(laps) {
  const n = Math.round(+laps); if (!(n >= 1)) return 0;
  if (LAP_MULT[n] != null) return LAP_MULT[n];
  const keys = Object.keys(LAP_MULT).map(Number).sort((a, b) => a - b), hi = keys[keys.length - 1];
  if (n > hi) return LAP_MULT[hi] + (n - hi) * 0.25;
  for (let k = 1; k < keys.length; k++) if (n < keys[k]) { const a = keys[k - 1], b = keys[k]; return LAP_MULT[a] + (LAP_MULT[b] - LAP_MULT[a]) * (n - a) / (b - a); }
  return 1;
}

// Single races (Quick race): Base x Difficulty x Laps x Placement, rounded. Every finisher is paid, on every replay.
export const SINGLE_RACE = {
  base: 150,
  difficulty: { rookie: 1.0, pro: 1.3, ace: 1.6 },
  placement: [1.25, 1.15, 1.08, 1.0, 0.95, 0.9], // P1..P6: a modest bonus at the front, a fair wage at the back
};
// Time trial: no rivals, so no difficulty or placement factor; a practice wage per run.
export const TIME_TRIAL = { base: 60 };

// Championships: four rounds. Each round pays its own (slightly smaller) race reward; finishing all four rounds pays a
// completion bonus once per run, plus a final-standing bonus. Both bonuses scale with difficulty and lap count.
export const CHAMPIONSHIP_REWARDS = {
  race: { base: 140, difficulty: { rookie: 1.0, pro: 1.3, ace: 1.6 }, placement: [1.25, 1.15, 1.08, 1.0, 0.95, 0.9] },
  completion: { rookie: 500, pro: 800, ace: 1200 }, // x lap multiplier
  standing: [0.4, 0.25, 0.1, 0, 0, 0], // final standing P1..P6, as a fraction of the completion bonus
  tokens: { completion: { rookie: 2, pro: 3, ace: 5 }, title: { rookie: 1, pro: 2, ace: 3 } },
};

// Style Token sources that hook into systems the game already has (race results, course records, championships).
// Add a source here and it is paid by the same transaction as the race it belongs to.
export const TOKEN_SOURCES = [
  { id: 'raceWin', name: 'Race win', ST: 1, when: c => c.mode !== 'trial' && c.place === 1 },
  { id: 'courseRecord', name: 'New course record', ST: 1, when: c => !!c.record },
];

// One-time career milestones (lifetime achievements, not replayable content).
export const MILESTONES = [
  { id: 'races-1', stat: 'races', at: 1, ST: 2, name: 'First race completed' },
  { id: 'races-10', stat: 'races', at: 10, ST: 3, name: '10 races completed' },
  { id: 'races-25', stat: 'races', at: 25, ST: 4, name: '25 races completed' },
  { id: 'races-50', stat: 'races', at: 50, ST: 6, name: '50 races completed' },
  { id: 'races-100', stat: 'races', at: 100, ST: 10, name: '100 races completed' },
  { id: 'wins-1', stat: 'wins', at: 1, ST: 2, name: 'First win' },
  { id: 'wins-10', stat: 'wins', at: 10, ST: 4, name: '10 wins' },
  { id: 'wins-25', stat: 'wins', at: 25, ST: 6, name: '25 wins' },
  { id: 'podiums-10', stat: 'podiums', at: 10, ST: 3, name: '10 podium finishes' },
];

// Spacecraft upgrades. Every category changes real flight-model parameters (src/sim/flight.js, race.js).
// Effects are a share of each ship's own base value, so ships keep their character: a fully upgraded ship still trails
// the class leader of that stat (e.g. a maxed Corsair stays below a stock Lancer's top speed).
export const UPGRADES = {
  maxLevel: 5,
  costs: [500, 900, 1500, 2400, 3600], // CR to go from level k to k+1
  curve: [0, 0.25, 0.48, 0.68, 0.85, 1], // share of the full effect at each level (later levels give a little less)
  categories: [
    { id: 'engine', name: 'Engine', stat: 'SPEED', desc: 'Raises top speed.', effects: [['maxSpeed', 'mul', 0.05]] },
    { id: 'accel', name: 'Acceleration', stat: 'ACCEL', desc: 'More thrust: reaches top speed sooner and exits corners faster.', effects: [['accel', 'mul', 0.15]] },
    { id: 'handling', name: 'Handling', stat: 'HANDLING', desc: 'Faster pitch, yaw and roll, and more lateral grip.', effects: [['yawRate', 'mul', 0.08], ['pitchRate', 'mul', 0.08], ['rollRate', 'mul', 0.08], ['grip', 'mul', 0.08]] },
    { id: 'boost', name: 'Boost', stat: 'BOOST', desc: 'Bigger boost tank, faster recharge and a slightly stronger boost.', effects: [['boostCap', 'mul', 0.15], ['boostRegen', 'mul', 0.2], ['boostMult', 'add', 0.04]] },
    { id: 'stability', name: 'Stability', stat: 'ARMOUR', desc: 'Heavier armour: more hull, less damage and less knock-back in collisions.', effects: [['hull', 'mul', 0.15], ['mass', 'mul', 0.1]] },
  ],
};
export const UPGRADE_IDS = UPGRADES.categories.map(c => c.id);
