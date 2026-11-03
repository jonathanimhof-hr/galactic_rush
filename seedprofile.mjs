// Builds a mid-game career profile through the game's own progression service (races, championships, purchases and
// upgrades paid exactly as in play), for screenshots and manual testing. Prints the profile JSON for
// localStorage['galactic-rush.profile']. Run: node tests/seedprofile.mjs > seed.json
import { Progression } from '../src/progress/index.js';
import { MemoryStorage, KEYS } from '../src/progress/store.js';
import { AI_ROSTER, CHAMPIONSHIP } from '../src/config.js';

let t = Date.UTC(2026, 9, 20, 18, 0); const P = new Progression(new MemoryStorage(), { now: () => (t += 60000) });
const order = place => { const n = AI_ROSTER.map(a => a.name); n.splice(place - 1, 0, 'YOU'); return n; };
const tracks = ['foundry', 'belt', 'spire', 'ring'], places = [2, 1, 4, 3, 1, 5, 2, 6, 3, 1];
let k = 0; const race = o => P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'quick', track: tracks[k % 4], diff: 'pro', laps: 3, ship: 'kestrel', place: places[k++ % places.length], field: 6, time: 120 + k, record: k < 5, ...o });
for (let i = 0; i < 30; i++) race({ diff: i < 6 ? 'rookie' : i < 22 ? 'pro' : 'ace' });
for (const [diff, pl] of [['rookie', [2, 1, 3, 1]], ['pro', [4, 2, 3, 2]]]) {
  const r = P.startRun({ diff, laps: 3, ship: 'kestrel' });
  CHAMPIONSHIP.forEach((trk, i) => P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'champ', runId: r.run.runId, track: trk, diff, laps: 3, ship: 'kestrel', place: pl[i], field: 6, order: order(pl[i]) }));
}
P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'trial', track: 'belt', laps: 3, ship: 'kestrel', place: 1, field: 1, time: 131, record: true });
for (const id of ['pattern.chevron', 'finish.metallic', 'exhaust.plasma', 'pattern.hex']) { const r = P.buyItem(id); if (!r.ok) console.error(id, r.message); }
for (const [cat, n] of [['engine', 2], ['accel', 2], ['handling', 1]]) for (let lv = 0; lv < n; lv++) { const r = P.buyUpgrade('kestrel', cat, lv); if (!r.ok) console.error(cat, r.message); }
P.setCustom('kestrel', { ...P.custom('kestrel'), primary: '#d7263d', secondary: '#e9ecef', accent: '#1fb5ac', pattern: 'pattern.chevron', finish: 'finish.metallic', exhaust: 'exhaust.plasma' });
const s = P.startRun({ diff: 'ace', laps: 3, ship: 'kestrel' }); // a saved Ace run after round 1, for "Continue championship"
P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'champ', runId: s.run.runId, track: CHAMPIONSHIP[0], diff: 'ace', laps: 3, ship: 'kestrel', place: 3, field: 6, order: order(3) });
console.error('seed wallet', JSON.stringify(P.wallet()), 'unlocked', P.profile.championships.unlocked.join());
process.stdout.write(P.store.s.getItem(KEYS.main));
