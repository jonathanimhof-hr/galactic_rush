// V7 economy check with real race lengths: flies 3-lap races on every course at every difficulty with the autopilot in
// the actual simulation (relaxed handling, the default), then prints race times, rewards, credits per minute and how long
// upgrades take to earn. Run: node tests/economy.mjs
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { AI_ROSTER, SIM_DT, DIFFICULTY } from '../src/config.js';
import { singleRaceReward, champRaceReward, champCompletionReward } from '../src/progress/rewards.js';
import { UPGRADES, DIFF_ORDER, lapMult } from '../src/progress/economy.js';

const OVERHEAD = 25; // seconds per race outside the race itself: countdown 3.6, finish 3 + 2.5 slow motion, results and menus
const rows = []; let lapSum = 0, lapN = 0;
for (const diff of DIFF_ORDER) for (const d of TRACK_DEFS) {
  const D = DIFFICULTY[diff], racers = [...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: D.skill[0] + (D.skill[1] - D.skill[0]) * a.bias })), { name: 'YOU', shipId: 'kestrel', isPlayer: true, skill: 0.8 }];
  const race = new Race({ track: getTrack(d.id), laps: 3, racers, mode: 'quick', seed: 7, handling: 'relaxed', autopilot: true, countdown: 3.6 });
  let n = 0; while (!race.player.finished && n < 120 * 900) { race.step(SIM_DT, null); race.events.length = 0; n++; }
  const p = race.player; race.simulateToEnd(SIM_DT); lapSum += p.lapTimes.reduce((a, b) => a + b, 0); lapN += p.lapTimes.length;
  rows.push({ diff, track: d.id, time: +p.finishTime.toFixed(1), lap: +(p.finishTime / 3).toFixed(1), place: p.place, credits: singleRaceReward({ diff, laps: 3, place: p.place }).credits });
}
console.table(rows);
const lap = lapSum / lapN; console.log(`average lap ${lap.toFixed(1)} s (autopilot, skill 0.8, relaxed handling); per-race overhead assumed ${OVERHEAD} s`);
const table = [];
for (const diff of DIFF_ORDER) for (const laps of [1, 2, 3, 5]) {
  const min = (laps * lap + OVERHEAD) / 60, s = singleRaceReward({ diff, laps, place: 3 }).credits, c = champRaceReward({ diff, laps, place: 3 }).credits, b = champCompletionReward({ diff, laps, standing: 3 });
  const champ = 4 * c + b.completion + b.standing, cmin = 4 * min + 0.5;
  table.push({ diff, laps, 'single P3': s, 'single CR/min': Math.round(s / min), 'champ total P3': champ, 'champ CR/min': Math.round(champ / cmin), 'champ vs singles': +(champ / cmin / (s / min)).toFixed(2) });
}
console.table(table);
const pro = singleRaceReward({ diff: 'pro', laps: 3, place: 3 }).credits / ((3 * lap + OVERHEAD) / 60), mix = pro * 1.5; // a mix of single races and championships
const t = cr => `${(cr / pro).toFixed(0)} min singles / ${(cr / mix).toFixed(0)} min mixed`;
console.log(`time to earn (Pro, average finish): first upgrade 500 CR: ${t(500)}; one category to level 5 (${UPGRADES.costs.reduce((a, b) => a + b)} CR): ${t(UPGRADES.costs.reduce((a, b) => a + b))}; a whole ship (${5 * UPGRADES.costs.reduce((a, b) => a + b)} CR): ${(5 * UPGRADES.costs.reduce((a, b) => a + b) / pro / 60).toFixed(1)} h singles / ${(5 * UPGRADES.costs.reduce((a, b) => a + b) / mix / 60).toFixed(1)} h mixed`);
void lapMult;
