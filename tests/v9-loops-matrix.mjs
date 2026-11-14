// V9: every ship (standard and fully upgraded, skill 0.45 and 1) alone through Pelagos in both handling modes: loop passages, inversion, wall contacts, respawns. Run: node tests/v9-loops-matrix.mjs [course] [laps]
import { getTrack } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { SHIPS, SIM_DT } from '../src/config.js';
import { shipAxes } from '../src/sim/flight.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { UPGRADES, UPGRADE_IDS } from '../src/progress/economy.js';
import { Vec3 } from '../src/math.js';
const id = process.argv[2] || 'pelagos', laps = +(process.argv[3] || 1), t = getTrack(id), F = new Vec3(), U = new Vec3();
const maxed = Object.fromEntries(UPGRADE_IDS.map(k => [k, UPGRADES.maxLevel]));
for (const handling of ['classic', 'relaxed']) for (const s of SHIPS) for (const up of [false, true]) for (const skill of [0.45, 1]) {
  const def = up ? effectiveDef(s, maxed) : undefined;
  const race = new Race({ track: t, laps, racers: [{ name: 'X', shipId: s.id, def, isPlayer: true, skill }], autopilot: true, seed: 3, countdown: 0, handling: handling === 'classic' ? undefined : handling });
  const r = race.racers[0]; let steps = 0, inLoop = -1, passes = 0, invLoops = new Set(), wall = 0, loopWall = 0, wreckInLoop = 0, maxSp = 0, minUpLoop = 1;
  while (!r.finished && steps < 120 * 200 * laps) { race.step(SIM_DT, null); steps++;
    for (const e of race.events) { if (e.type === 'hit') { wall++; if (t.loopId[r.ti] >= 0) loopWall++; } if (e.type === 'explode' && t.loopId[r.ti] >= 0) wreckInLoop++; }
    race.events.length = 0; const L = t.loopId[r.ti];
    if (L >= 0) { shipAxes(r.ship.quat, F, U); minUpLoop = Math.min(minUpLoop, U.y); if (U.y < -0.9) invLoops.add(L); }
    if (inLoop >= 0 && L < 0) passes++; inLoop = L; maxSp = Math.max(maxSp, r.ship.vel.len()); }
  console.log(handling.padEnd(8), s.id.padEnd(8), up ? 'max' : 'base', 'skill', skill, r.finished ? 'lap ' + r.finishTime.toFixed(1) : 'DNF', 'passes', passes, 'inverted in', invLoops.size, 'minUp', minUpLoop.toFixed(2), 'hits', wall, 'loop hits', loopWall, 'resp', r.resp || 0, 'wreck in loop', wreckInLoop, 'vmax', maxSp.toFixed(0));
}
