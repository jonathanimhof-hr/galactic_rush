// V10: wrecks, wall/obstacle hits and lap times on the new courses in full-field five-lap races (seeds 7, 11, 19), both
// handling modes, with the worst spots by course section. Run: node tests/v10-wrecks.mjs [course ...]
import { getTrack } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { AI_ROSTER, SIM_DT } from '../src/config.js';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['canopy', 'nexus'];
for (const id of ids) for (const handling of [undefined, 'relaxed']) {
  const t = getTrack(id), tagOf = i => { for (const [k, v] of t.tags) if (v.includes(i)) return k; return '?'; };
  let wrecks = 0, resp = 0, hits = 0, laps = [], dnf = 0; const bins = new Map(), hitBins = new Map();
  for (const seed of [7, 11, 19]) {
    const racers = [{ name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 }, ...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.7 + 0.3 * a.bias }))];
    const race = new Race({ track: t, laps: 5, racers, autopilot: true, seed, countdown: 3.6, handling });
    let steps = 0;
    while (!race.racers.every(r => r.finished) && steps < 120 * 900) { race.step(SIM_DT, null); steps++;
      for (const e of race.events) {
        if (e.type === 'explode') { wrecks++; const b = tagOf(e.r.ti) + '@' + e.r.ti; bins.set(b, (bins.get(b) || 0) + 1); }
        if (e.type === 'respawn') resp++;
        if (e.type === 'hit' && e.dmg > 2) { hits++; const b = tagOf(e.r.ti); hitBins.set(b, (hitBins.get(b) || 0) + 1); }
        if (e.type === 'lap') laps.push(e.time);
      }
      race.events.length = 0; }
    dnf += race.racers.filter(r => !r.finished).length;
  }
  laps.sort((a, b) => a - b);
  const worst = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} x${v}`).join(', ');
  const hb = [...hitBins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(id.padEnd(7), (handling || 'classic').padEnd(8), 'wrecks/race', (wrecks / 3).toFixed(1).padStart(5), 'respawns', String(resp).padStart(3), 'hits>2/race', (hits / 3).toFixed(0).padStart(4), 'dnf', dnf,
    '| laps', laps.length ? `${laps[0].toFixed(1)}-${laps[laps.length - 1].toFixed(1)} s (median ${laps[laps.length >> 1].toFixed(1)})` : '-', '| wrecks at:', worst || '-', '| hits by section:', hb);
}
