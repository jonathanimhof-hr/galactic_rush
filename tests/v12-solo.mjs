// GALACTIC RUSH V12 — the pace a pilot can reach: one ship alone on the course, flown by the autopilot with a
// difficulty level's driving profile (V12: elite, master, legend) and every upgrade at a given level, through the real
// race simulation. Prints, per course and ship, the best lap / the average lap over 3 laps (seconds). Compared with the
// winners of that level's races (tests/v12-difficulty.mjs) it shows whether a player who drives that well can win.
// usage: node tests/v12-solo.mjs [courses=all] [level=legend] [upgrade level=5] [handling=relaxed]
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { SHIPS, DIFFICULTY, SIM_DT } from '../src/config.js';
import { effectiveDef } from '../src/progress/upgrades.js';

const [courses = 'all', level = 'legend', up = '5', handling = 'relaxed'] = process.argv.slice(2);
const ids = courses === 'all' ? TRACK_DEFS.map(d => d.id) : courses.split(','), lv = +up;
const levels = { engine: lv, accel: lv, handling: lv, boost: lv, stability: lv };
console.log(`a lone pilot with ${DIFFICULTY[level].label}'s driving profile, upgrades at level ${lv}, ${handling} handling: best lap / average lap (s)`);
for (const id of ids) {
  const out = [];
  for (const ship of SHIPS) {
    const race = new Race({ track: getTrack(id), laps: 3, racers: [{ name: 'P', shipId: ship.id, isPlayer: true, def: effectiveDef(ship, levels), skill: 1, drive: DIFFICULTY[level].drive }], mode: 'race', seed: 3, handling, countdown: 3.6, autopilot: true });
    let k = 0; while (race.state !== 'finished' && k < 120 * 900) { race.step(SIM_DT, null); k++; race.events.length = 0; }
    const r = race.racers[0]; out.push(`${ship.name}: ${r.lapTimes.length ? Math.min(...r.lapTimes).toFixed(1) : '-'} / ${r.finished ? (r.finishTime / 3).toFixed(1) : '-'}`);
  }
  console.log(`${TRACK_DEFS.find(d => d.id === id).name}: ${out.join(', ')}`);
}
