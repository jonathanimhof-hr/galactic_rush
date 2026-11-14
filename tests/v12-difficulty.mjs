// GALACTIC RUSH V12 — how fast each difficulty level is: AI-only races through the real race simulation, the five rivals
// of a quick race built exactly as main.js builds them for each level (skills, driving profile, upgrades), headless.
// Prints a table per handling mode: mean lap of all five rivals / the winner's race time / respawns per race (seconds,
// mean over the seeds). It is how the numbers in the README's V12 section were made.
// usage: node tests/v12-difficulty.mjs [courses=all] [seeds=1,2,3,4,5] [laps=3] [handling=relaxed,classic]
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { AI_ROSTER, DIFFICULTY, SIM_DT, shipById } from '../src/config.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { makeRng, clamp } from '../src/math.js';

const [courses = 'all', seeds = '1,2,3,4,5', laps = '3', hands = 'relaxed,classic'] = process.argv.slice(2);
const ids = courses === 'all' ? TRACK_DEFS.map(d => d.id) : courses.split(','), LEVELS = Object.keys(DIFFICULTY);
const field = (diffId, seed) => {
  const d = DIFFICULTY[diffId], rng = makeRng(seed * 7919 + 13);
  return AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: clamp(d.skill[0] + (d.skill[1] - d.skill[0]) * a.bias + rng.range(-0.03, 0.03), 0.3, 1), drive: d.drive, ...(d.upgrades ? { def: effectiveDef(shipById(a.ship), d.upgrades) } : {}) })).sort((a, b) => a.skill - b.skill);
};
for (const handling of hands.split(',')) {
  console.log(`\n${handling === 'classic' ? 'Classic' : 'Relaxed'} handling: mean lap of all five rivals / winner's race time / respawns per race (s; ${laps} laps; seeds ${seeds})`);
  console.log(`| course | ${LEVELS.map(l => DIFFICULTY[l].label).join(' | ')} |\n|---|${LEVELS.map(() => '---|').join('')}`);
  for (const id of ids) {
    const cells = [];
    for (const diffId of LEVELS) {
      const runs = seeds.split(',').map(Number).map(seed => {
        const race = new Race({ track: getTrack(id), laps: +laps, racers: field(diffId, seed), mode: 'race', seed, handling, countdown: 3.6 });
        let steps = 0; while (race.state !== 'finished' && steps < 120 * 1200) { race.step(SIM_DT, null); steps++; race.events.length = 0; }
        const lapsAll = race.racers.flatMap(r => r.lapTimes), fins = race.racers.filter(r => r.finished).map(r => r.finishTime);
        return { meanLap: lapsAll.reduce((a, b) => a + b, 0) / lapsAll.length, winner: Math.min(...fins), resp: race.racers.reduce((a, r) => a + (r.resp || 0), 0), finished: fins.length };
      });
      const m = k => runs.reduce((a, r) => a + r[k], 0) / runs.length;
      cells.push(`${m('meanLap').toFixed(1)} / ${m('winner').toFixed(1)} / ${m('resp').toFixed(1)}${runs.every(r => r.finished === 5) ? '' : ' (not all finished)'}`);
    }
    console.log(`| ${TRACK_DEFS.find(d => d.id === id).name} | ${cells.join(' | ')} |`);
  }
}
