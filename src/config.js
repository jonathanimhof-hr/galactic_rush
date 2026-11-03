// Ship roster (all original designs), difficulty and championship settings.
const base = { response: 9, drag: 38, brakeDecel: 140, boostDrain: 30, boostRegen: 8, boostMult: 1.42, driftTurn: 1.38, driftGrip: 0.2, redirect: 0.9, radius: 2.2 };

export const SHIPS = [
  { ...base, id: 'kestrel', name: 'KESTREL', cls: 'Balanced racer', color: [0.85, 0.55, 0.18], accent: [0.15, 0.6, 1.0],
    desc: 'Forward-swept gull wings and twin tail booms. Predictable, quick and forgiving.',
    maxSpeed: 170, accel: 72, yawRate: 1.55, pitchRate: 1.7, rollRate: 3.2, grip: 9, boostCap: 100, hull: 100, mass: 1.0 },
  { ...base, id: 'wisp', name: 'WISP', cls: 'Interceptor', color: [0.2, 0.75, 0.7], accent: [1.0, 0.35, 0.6],
    desc: 'A teardrop pod inside a ring wing. Razor handling and acceleration, paper-thin armour.',
    maxSpeed: 163, accel: 88, yawRate: 1.9, pitchRate: 2.0, rollRate: 3.8, grip: 10.5, boostCap: 85, hull: 70, mass: 0.8 },
  { ...base, id: 'lancer', name: 'LANCER', cls: 'Speedster', color: [0.9, 0.9, 0.95], accent: [1.0, 0.25, 0.2],
    desc: 'A needle-nosed tri-fin built for straight-line speed. Wide in the corners.',
    maxSpeed: 186, accel: 64, yawRate: 1.36, pitchRate: 1.5, rollRate: 2.8, grip: 8, boostCap: 110, hull: 90, mass: 1.0 },
  { ...base, id: 'halberd', name: 'HALBERD', cls: 'Heavy fighter', color: [0.38, 0.42, 0.48], accent: [1.0, 0.7, 0.1],
    desc: 'A broad armoured wedge with three engines. Slow to wind up, shrugs off hits, huge boost tank.',
    maxSpeed: 174, accel: 54, yawRate: 1.32, pitchRate: 1.42, rollRate: 2.4, grip: 8.5, boostCap: 140, hull: 160, mass: 1.6, boostRegen: 10 },
  { ...base, id: 'corsair', name: 'CORSAIR', cls: 'Drifter', color: [0.55, 0.2, 0.75], accent: [0.3, 1.0, 0.5],
    desc: 'Twin hulls joined by a swept bridge wing. Loose and slidey, with the strongest drift boost.',
    maxSpeed: 176, accel: 68, yawRate: 1.5, pitchRate: 1.55, rollRate: 3.0, grip: 7, boostCap: 100, hull: 115, mass: 1.2, driftTurn: 1.5 },
];
export const shipById = id => SHIPS.find(s => s.id === id) || SHIPS[0];

export const STAT_BARS = [
  ['SPEED', s => (s.maxSpeed - 150) / 40], ['ACCEL', s => (s.accel - 40) / 55], ['HANDLING', s => (s.yawRate - 1.1) / 0.9],
  ['BOOST', s => (s.boostCap - 60) / 90], ['ARMOUR', s => (s.hull - 50) / 120],
];

export const DIFFICULTY = {
  rookie: { label: 'ROOKIE', skill: [0.45, 0.68] },
  pro: { label: 'PRO', skill: [0.68, 0.86] },
  ace: { label: 'ACE', skill: [0.86, 1.0] },
};

// AI pilots: invented call signs. bias spreads skill inside the difficulty band.
export const AI_ROSTER = [
  { name: 'VEX ARDEN', ship: 'lancer', bias: 1.0, paint: [0.85, 0.15, 0.15] },
  { name: 'MARA QUELL', ship: 'wisp', bias: 0.85, paint: [0.95, 0.85, 0.2] },
  { name: 'DAX ORIN', ship: 'halberd', bias: 0.7, paint: [0.25, 0.45, 0.9] },
  { name: 'NYLA VOSS', ship: 'corsair', bias: 0.5, paint: [0.9, 0.45, 0.75] },
  { name: 'KIRO THAL', ship: 'kestrel', bias: 0.3, paint: [0.3, 0.8, 0.35] },
];

export const POINTS = [10, 8, 6, 5, 4, 3];
export const CHAMPIONSHIP = ['foundry', 'belt', 'spire', 'ring'];
export const SIM_DT = 1 / 120;
