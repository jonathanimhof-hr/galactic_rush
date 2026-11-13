// V11: the game is frozen. Compares this source tree with a V10 source tree, course by course, for all eight courses:
//  - the complete course data: a hash over every number, string, array, typed array, map and object the course holds
//    (geometry and frames, corridor, racing line, checkpoints, start grid, boost pads, energy cells, obstacles, wood,
//    soft vegetation, traffic lanes, loops, tunnels, gravity strength and deck roll, section tags, announcements);
//  - whole races replayed in both handling modes: a scripted player and the five AI pilots for 75 s, hashing every
//    ship's position, velocity, orientation, hull and progress every quarter second (the flight model, the AI, the
//    collisions, the weapons, the respawns and, on Orbital Nexus, the gravity).
// Both trees run in the same Node process, so equal code gives equal bits; any difference is printed and sets exit code 1.
// usage: node tests/v11-frozen.mjs V10_SOURCE_ROOT [THIS_ROOT]
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const [rootA, rootB = '.'] = process.argv.slice(2);
if (!rootA) { console.error('usage: node tests/v11-frozen.mjs V10_SOURCE_ROOT [THIS_ROOT]'); process.exit(2); }

function deepHash(obj) {
  const h = createHash('sha256'), seen = new Map(), f8 = new Float64Array(1), b8 = Buffer.from(f8.buffer); let count = 0;
  const walk = v => {
    if (v === null) { h.update('N'); return; }
    const t = typeof v;
    if (t === 'undefined') { h.update('U'); return; }
    if (t === 'number') { f8[0] = v; h.update('n'); h.update(b8); count++; return; }
    if (t === 'boolean') { h.update(v ? 'T' : 'F'); count++; return; }
    if (t === 'string') { h.update('s' + v.length + ':' + v); count++; return; }
    if (t === 'function') { h.update('f'); return; } // behaviour, not data: covered by the replays
    if (t !== 'object') { h.update('?' + t); return; }
    if (seen.has(v)) { h.update('r' + seen.get(v)); return; } // a second reference to the same object
    seen.set(v, seen.size);
    if (ArrayBuffer.isView(v)) { h.update('v' + v.constructor.name + v.length + ':'); h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); count += v.length; return; }
    if (Array.isArray(v)) { h.update('a' + v.length + ':'); for (const x of v) walk(x); return; }
    if (v instanceof Map) { h.update('m' + v.size + ':'); for (const [k, x] of v) { walk(k); walk(x); } return; }
    if (v instanceof Set) { h.update('S' + v.size + ':'); for (const x of v) walk(x); return; }
    const keys = Object.keys(v).sort(); h.update('o' + (v.constructor ? v.constructor.name : '') + keys.length + ':');
    for (const k of keys) { h.update('k' + k + '='); walk(v[k]); }
  };
  walk(obj); return { hash: h.digest('hex').slice(0, 16), count };
}

async function load(root) {
  const url = p => pathToFileURL(join(resolve(root), p)).href;
  const { getTrack, TRACK_DEFS } = await import(url('src/sim/tracks.js'));
  const { Race } = await import(url('src/sim/race.js'));
  const { AI_ROSTER, SIM_DT } = await import(url('src/config.js'));
  const replay = (id, handling) => {
    const racers = [{ name: 'YOU', shipId: 'kestrel', isPlayer: true }, ...AI_ROSTER.map((a, k) => ({ name: a.name, shipId: a.ship, skill: 0.6 + k * 0.08 }))];
    const race = new Race({ track: getTrack(id), laps: 2, racers, mode: 'race', seed: 4242, handling, assist: 0.3, sens: 1 });
    const h = createHash('sha256'), buf = new Float64Array(12); let t = 0;
    for (let k = 0; k < 120 * 75; k++) {
      t += SIM_DT; race.step(SIM_DT, { pitch: 0.35 * Math.sin(t * 0.7), yaw: 0.5 * Math.sin(t * 0.45), roll: 0, brake: false, boost: (t % 7) < 2, drift: (t % 11) < 1, fire: (t % 5) < 0.05, shield: (t % 13) < 0.05 });
      if (k % 30 === 0) for (const r of race.racers) { const s = r.ship; buf.set([s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w, s.hull, r.prog]); h.update(Buffer.from(buf.buffer)); }
      race.events.length = 0;
    }
    return h.digest('hex').slice(0, 16) + ' ' + race.racers.map(r => r.lap + ':' + Math.round(r.prog)).join(',');
  };
  return { ids: TRACK_DEFS.map(d => d.id), names: Object.fromEntries(TRACK_DEFS.map(d => [d.id, d.name])), data: id => deepHash(getTrack(id)), replay };
}

const A = await load(rootA), B = await load(rootB);
let bad = 0; const say = (ok, line) => { console.log((ok ? 'same  ' : 'DIFFERS  ') + line); if (!ok) bad++; };
say(JSON.stringify(A.ids) === JSON.stringify(B.ids), `course list: ${A.ids.join(', ')}` + (JSON.stringify(A.ids) === JSON.stringify(B.ids) ? '' : ` | ${B.ids.join(', ')}`));
// course data first, on courses nothing has raced on yet
for (const id of A.ids) {
  const a = A.data(id), b = B.data(id), again = B.data(id);
  say(a.hash === b.hash, `${id} (${A.names[id]}): complete course data, ${a.count.toLocaleString('en')} values: ${a.hash}` + (a.hash === b.hash ? '' : ` | ${b.hash}`));
  if (b.hash !== again.hash) { console.log(`NOTE  ${id}: the hash is not repeatable within one tree (${b.hash}, ${again.hash})`); bad++; }
}
for (const id of A.ids) for (const handling of ['classic', 'relaxed']) {
  const a = A.replay(id, handling), b = B.replay(id, handling);
  say(a === b, `${id}/${handling}: race replay ${a}` + (a === b ? '' : ` | ${b}`));
}
console.log(bad ? `${bad} DIFFERENCES between ${rootA} and ${rootB}` : `all ${A.ids.length} courses: course data and race replays identical in ${rootA} and ${rootB}`);
process.exit(bad ? 1 : 0);
