// V9: wrecks per course in full-field five-lap races (seeds 7, 11, 19), both handling modes: total, per race and the worst spot. Run: node tests/v9-wrecks.mjs
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { AI_ROSTER, SIM_DT } from '../src/config.js';
for (const d of TRACK_DEFS) for (const handling of [undefined, 'relaxed']) {
  const t = getTrack(d.id); let wrecks = 0, resp = 0; const bins = new Map();
  for (const seed of [7, 11, 19]) {
    const racers = [{ name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 }, ...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.7 + 0.3 * a.bias }))];
    const race = new Race({ track: t, laps: 5, racers, autopilot: true, seed, countdown: 3.6, handling });
    let steps = 0;
    while (!race.racers.every(r => r.finished) && steps < 120 * 900) { race.step(SIM_DT, null); steps++;
      for (const e of race.events) { if (e.type === 'explode') { wrecks++; const b = Math.floor(e.r.ti / 25); bins.set(b, (bins.get(b) || 0) + 1); } if (e.type === 'respawn') resp++; }
      race.events.length = 0; }
  }
  const worst = [...bins.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  console.log(d.id.padEnd(8), (handling || 'classic').padEnd(8), 'wrecks', String(wrecks).padStart(3), 'respawns', String(resp).padStart(3), 'per race', (wrecks / 3).toFixed(1), '| worst spot: samples', worst[0] * 25, '-', worst[0] * 25 + 24, 'wrecks', worst[1]);
}
