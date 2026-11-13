// V10: the course's own announcements over a whole lap, asked for after every simulation step as the HUD asks every frame
// (the scene is built in Node with a stub renderer; the race is the game's own simulation flown by its autopilot)
// Run: node tests/v10-notices.mjs
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname; // the repository
const fake = () => new Proxy(function () {}, { get: (o, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => fake() }) };
const { getTrack } = await import(pathToFileURL(join(root, 'src/sim/tracks.js')));
const { buildCourse } = await import(pathToFileURL(join(root, 'src/render/courses/index.js')));
await import(pathToFileURL(join(root, 'src/render/courses/all.js')));
const { Race } = await import(pathToFileURL(join(root, 'src/sim/race.js')));
const { AI_ROSTER, SIM_DT } = await import(pathToFileURL(join(root, 'src/config.js')));
const gfx = { P: {}, cfg: {}, prog: () => ({ u: {} }), w: 960, h: 540, lodBias: 1, mesh: (g, n = 0) => ({ count: g.idx.length, tris: g.idx.length / 3, data: n ? new Float32Array(n * 20) : null, inst: n ? 1 : null, cap: n }), uploadInstances() {}, texture: () => ({}) };
for (const id of ['canopy', 'nexus']) {
  const t = getTrack(id), c = buildCourse(gfx, t), racers = [{ name: 'P1', shipId: 'kestrel', isPlayer: true, skill: 0.9 }, ...AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, skill: 0.8 }))];
  const race = new Race({ track: t, laps: 2, racers, autopilot: true, seed: 5, countdown: 3.6 }), out = [];
  for (let k = 0; k < 120 * 200; k++) { race.step(SIM_DT, null); const p = race.player, m = c.notice(p, race); if (m) out.push(`lap ${p.lap} #${p.ti}: ${m.text}`); if (p.lap >= 2 && p.ti > 200) break; }
  console.log(id, out.length, 'announcements over two laps:\n  ' + out.join('\n  '));
}
