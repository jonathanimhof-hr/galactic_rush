// V11: what the course builders hand to the renderer, compared between two source trees, for all eight courses.
// Each course is built in Node with a recording renderer, and compared:
//  - every mesh in the order it is made: its vertex positions, normals, colours, material values and indices
//    (bytes), and its instance capacity;
//  - every shader program a builder makes (its arguments);
//  - the scene's items (program, flags, ranges, bounds, uniforms) and the course's environment;
//  - the instance buffers after culling from five cameras along the racing line (which instances are drawn, at which
//    level of detail, in which order), and the meshes a course makes while culling.
// Each tree builds each course once, freshly loaded, as the game does when it starts.
// Against a V10 source tree the four original courses must come out identical (nothing of the visual pass leaks into
// them) and the four courses of the pass differ; between two builds of V11 everything must be identical.
// usage: node tests/v11-scenes.mjs SOURCE_ROOT_A [SOURCE_ROOT_B] [--expect-same=all|originals]
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter(a => !a.startsWith('--')), expect = (process.argv.find(a => a.startsWith('--expect-same=')) || '--expect-same=originals').split('=')[1];
const [rootA, rootB = '.'] = args;
if (!rootA) { console.error('usage: node tests/v11-scenes.mjs SOURCE_ROOT_A [SOURCE_ROOT_B] [--expect-same=all|originals]'); process.exit(2); }

// a canvas whose 2D context swallows every call (the builders draw gate numbers and signs into canvases)
const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : typeof k === 'symbol' ? undefined : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

function deepHash(obj) {
  const h = createHash('sha256'), seen = new Map(), f8 = new Float64Array(1), b8 = Buffer.from(f8.buffer);
  const walk = v => {
    if (v === null) { h.update('N'); return; }
    const t = typeof v;
    if (t === 'undefined') { h.update('U'); return; }
    if (t === 'number') { f8[0] = v; h.update('n'); h.update(b8); return; }
    if (t === 'boolean') { h.update(v ? 'T' : 'F'); return; }
    if (t === 'string') { h.update('s' + v.length + ':' + v); return; }
    if (t === 'function') { h.update('f'); return; }
    if (t !== 'object') { h.update('?' + t); return; }
    if (seen.has(v)) { h.update('r' + seen.get(v)); return; }
    seen.set(v, seen.size);
    if (ArrayBuffer.isView(v)) { h.update('v' + v.constructor.name + v.length + ':'); h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); return; }
    if (Array.isArray(v)) { h.update('a' + v.length + ':'); for (const x of v) walk(x); return; }
    if (v instanceof Map) { h.update('m' + v.size + ':'); for (const [k, x] of v) { walk(k); walk(x); } return; }
    if (v instanceof Set) { h.update('S' + v.size + ':'); for (const x of v) walk(x); return; }
    const keys = Object.keys(v).sort(); h.update('o' + (v.constructor ? v.constructor.name : '') + keys.length + ':');
    for (const k of keys) { h.update('k' + k + '='); walk(v[k]); }
  };
  walk(obj); return h.digest('hex').slice(0, 16);
}

async function load(root) {
  const url = p => pathToFileURL(join(resolve(root), p)).href;
  const { getTrack, TRACK_DEFS } = await import(url('src/sim/tracks.js'));
  await import(url('src/render/courses/all.js')); const { buildCourse } = await import(url('src/render/courses/index.js'));
  const scene = id => {
    const meshH = createHash('sha256'), progs = []; let meshes = 0, tris = 0, instCap = 0;
    const gfx = { P: {}, w: 960, h: 540, lodBias: 1, cfg: {},
      prog: (...a) => { progs.push(deepHash(a)); return { program: progs.length }; },
      mesh(d, n = 0) { for (const k of ['pos', 'nor', 'col', 'mat', 'idx']) if (d[k]) { meshH.update(k + d[k].length + ':'); meshH.update(Buffer.from(d[k].buffer, d[k].byteOffset, d[k].byteLength)); } meshH.update('i' + n + ';');
        meshes++; tris += d.idx.length / 3; instCap += n; return { mesh: meshes, tris: d.idx.length / 3, count: d.idx.length, cap: n, n: 0, data: n ? new Float32Array(n * 20) : null }; },
      uploadInstances(m, n) { m.n = n; }, setInstance(m, k, mat, col) { if (m.data && mat) { m.data.set(mat, k * 20); if (col) m.data.set(col, k * 20 + 16); } }, freeMesh() {},
      texture: () => ({ texture: 1 }), dataTexture: (...a) => ({ texture: deepHash(a) }), bakeCube: () => ({ cube: 1 }) };
    const t = getTrack(id), c = buildCourse(gfx, t);
    const out = { items: c.items.length, meshes, tris, instCap, geometry: meshH.copy().digest('hex').slice(0, 16), programs: deepHash(progs), scene: deepHash(c.items), env: deepHash(c.env) };
    // five cameras along the racing line, looking down it; then the instance buffers and the items' visibility
    const culls = [];
    if (typeof c.cull === 'function') for (let k = 0; k < 5; k++) { const i = Math.floor(t.N * (0.1 + 0.2 * k)), p = t.pointAt(i, 0, 3), f = t.tan[i];
      const cam = { pos: p, fwd: f.clone ? f.clone() : f, up: (t.up && t.up[i]) || { x: 0, y: 1, z: 0 }, fov: 70, near: 0.5, far: 60000 };
      try { c.cull(cam, cam); culls.push(deepHash(c.items)); } catch (e) { culls.push('ERROR ' + e.message.slice(0, 80)); } }
    out.culled = culls.length ? deepHash(culls) + (meshes > out.meshes ? '+' + meshH.copy().digest('hex').slice(0, 8) : '') : '-'; out.meshesAfterCull = meshes; out.cullErrors = culls.filter(x => String(x).startsWith('ERROR')).slice(0, 1).join(''); return out;
  };
  return { ids: TRACK_DEFS.map(d => d.id), names: Object.fromEntries(TRACK_DEFS.map(d => [d.id, d.name])), scene };
}

const A = await load(rootA), B = await load(rootB); const ORIGINALS = ['foundry', 'belt', 'spire', 'ring']; let bad = 0;
for (const id of A.ids) {
  const a = A.scene(id), b = B.scene(id);
  const parts = ['geometry', 'programs', 'scene', 'env', 'culled'], diff = parts.filter(k => a[k] !== b[k]), same = diff.length === 0 && a.meshes === b.meshes && a.tris === b.tris;
  const must = expect === 'all' || ORIGINALS.includes(id);
  console.log(`${same ? 'same    ' : 'DIFFERS '} ${id} (${A.names[id]}): ${a.items} items, ${a.meshes} meshes, ${a.tris.toLocaleString('en')} triangles, geometry ${a.geometry}, scene ${a.scene}, after culling ${a.culled}` + (same ? '' : `  |  ${b.items} items, ${b.meshes} meshes, ${b.tris.toLocaleString('en')} triangles; differs in: ${diff.join(', ')}`) + (a.cullErrors || b.cullErrors ? `  [cull: ${a.cullErrors || b.cullErrors}]` : ''));
  if (must && !same) { console.log(`   UNEXPECTED: ${id} must be identical`); bad++; }
  if (!must && same) console.log(`   note: ${id} is identical in both trees`);
}
console.log(bad ? `${bad} UNEXPECTED DIFFERENCES between ${rootA} and ${rootB}` : expect === 'all' ? `all ${A.ids.length} courses: the scenes are identical in ${rootA} and ${rootB}` : `the four original courses' scenes are identical in ${rootA} and ${rootB}`);
process.exit(bad ? 1 : 0);
