// GALACTIC RUSH V12 — Verdant Canopy's wood against its collision. Builds the course twice: the simulation (src/sim, as
// every client and the server build it) and the drawn scene (src/render, in Node with a stub renderer, from a patched
// copy of the source that records every piece of wood it draws: wood tubes, the instanced forest trunks and limbs).
// Every drawn piece is sampled every metre along its axis; a sample "reaches the corridor" when the wood's surface lies
// inside the volume a ship's centre can reach. Such a sample is "covered" when a simulation obstacle is solid there.
// Uncovered samples are wood a ship flies through. Collision lives in the simulation only (no level of detail, no
// camera or graphics setting takes part), so this one build of the course is what every client and the server collide with.
// Passable by design: the vines (soft vegetation that bursts as ships pass) and the thin vine cords along the three
// short bridges, as in V10 and V11. Everything else that reaches the corridor must be covered, and no forest tree may
// reach it at all (the forest's trees have no collision, so V12 keeps them out of the corridor).
// usage: node tests/v12-canopy-audit.mjs [ROOT=this repository] [--json OUT]   (exit code 1 when the check fails)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2), jsonAt = args.indexOf('--json'), OUT = jsonAt >= 0 ? args[jsonAt + 1] : null;
const pos = args.filter((a, k) => !a.startsWith('--') && !(jsonAt >= 0 && k === jsonAt + 1));
const ROOT = pos[0] || join(dirname(fileURLToPath(import.meta.url)), '..');
const COURSE = 'canopy', TMP = mkdtempSync(join(tmpdir(), 'gr-canopy-audit-'));
try {
  cpSync(join(ROOT, 'src'), join(TMP, 'src'), { recursive: true });
  const patch = (f, a, b) => { const p = join(TMP, f), s = readFileSync(p, 'utf8'); if (!s.includes(a)) throw new Error('patch failed: ' + f + ': ' + a.slice(0, 60)); writeFileSync(p, s.replace(a, b)); };
  // record every wood tube with the line that drew it, the forest's trees and their limbs (same lines, nothing else changes)
  patch('src/render/courses/v10kit.js', 'export function woodTube(g, pts, rad, seg, col, fungus = 0, tip = true) {', 'export function woodTube(g, pts, rad, seg, col, fungus = 0, tip = true) { if (!globalThis.__noLog) (globalThis.__wood ||= []).push({ pts: pts.map(p => [p.x, p.y, p.z]), rad: [...rad], site: (new Error().stack.split("\\n")[2] || "").replace(/.*courses\\//, "").replace(/\\).*/, "") });');
  patch('src/render/courses/canopy.js', '  const trunkMesh = [], crownMesh = [[], []], fsets = [];', '  globalThis.__forest = forest; globalThis.__noLog = true; const trunkMesh = [], crownMesh = [[], []], fsets = [];');
  patch('src/render/courses/canopy.js', '      const okL = nearSet ? limbs.filter(([a, b, r]) => okSeg(a, b, r * 1.5, 2)) : limbs, nL = Math.max(1, okL.length);', '      const okL = nearSet ? limbs.filter(([a, b, r]) => okSeg(a, b, r * 1.5, 2)) : limbs, nL = Math.max(1, okL.length); (globalThis.__limbs ||= []).push(...okL.map(([a, b, r]) => ({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r })));');
  patch('src/render/courses/canopy.js', '  // the understory on the forest floor near the course', '  globalThis.__noLog = false; // the understory on the forest floor near the course');
  const canopyLines = readFileSync(join(TMP, 'src/render/courses/canopy.js'), 'utf8').split('\n');
  const fake = () => new Proxy(function () {}, { get: (o, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : fake(), apply: () => fake() });
  globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => fake() }) };
  const { getTrack } = await import(pathToFileURL(join(ROOT, 'src/sim/tracks.js')));
  const t = getTrack(COURSE);
  const { buildCourse } = await import(pathToFileURL(join(TMP, 'src/render/courses/index.js')));
  await import(pathToFileURL(join(TMP, 'src/render/courses/all.js')));
  const { getTrack: getTrackR } = await import(pathToFileURL(join(TMP, 'src/sim/tracks.js')));
  const gfx = { P: {}, cfg: {}, prog: () => ({ u: {} }), mesh: (g, n = 0) => ({ count: g.idx.length, tris: g.idx.length / 3, data: n ? new Float32Array(n * 20) : null, inst: n }), uploadInstances() {}, texture: () => ({}), w: 960, h: 540, lodBias: 1 };
  buildCourse(gfx, getTrackR(COURSE));

  // what drew a wood tube: the vines and the bridges' cords are passable by design, everything else is meant to be solid
  // (a tube is named by the section of canopy.js that draws it: the nearest "// -----" heading above the line)
  const kindOf = site => { const m = /canopy\.js:(\d+):/.exec(site), n = m ? +m[1] - 1 : -1, line = canopyLines[n] || '';
    let k = n; while (k > 0 && !/^\s*\/\/ -{10,}/.test(canopyLines[k])) k--;
    const section = k > 0 ? canopyLines[k].replace(/^\s*\/\/ -+\s*/, '').split(':')[0].trim() : site;
    if (/^soft vegetation/.test(section)) return 'vines (soft, passable)';
    if (/pl\.kind === 'bridge'/.test(line) && /woodTube/.test(line)) return 'bridge cords (thin, passable)';
    return `wood: ${section} (line ${n + 1})`; };
  const PASSABLE = new Set(['vines (soft, passable)', 'bridge cords (thin, passable)']);
  // the drawn wood as segments [a, b, ra, rb, kind, forest index]
  const segs = [];
  for (const w of globalThis.__wood || []) { const kind = kindOf(w.site); for (let k = 0; k < w.pts.length - 1; k++) segs.push([w.pts[k], w.pts[k + 1], w.rad[k], w.rad[k + 1], kind]); }
  for (const [fi, f] of (globalThis.__forest || []).entries()) { const base = [f.bx, f.fy - 3, f.bz], top = [f.px, f.topY, f.pz];
    // the trunk mesh: radius 1 - 0.45 u along its length (with a flare at the foot), scaled by tr
    for (const [u0, u1] of [[0, 0.1], [0.1, 0.3], [0.3, 0.55], [0.55, 0.8], [0.8, 1]]) { const at = u => base.map((v, j) => v + (top[j] - v) * u); segs.push([at(u0), at(u1), f.tr * (1 - 0.45 * u0 + (u0 < 0.1 ? 0.5 : 0)), f.tr * (1 - 0.45 * u1), 'forest trunk', fi]); } }
  for (const l of globalThis.__limbs || []) segs.push([l.a, l.b, l.r, l.r * 0.45, 'forest limb']);
  // course samples in a 3D grid for nearest-sample lookups
  const G = 60, grid = new Map(), key = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
  for (let i = 0; i < t.N; i++) { const p = t.pos[i], k = key(p.x, p.y, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  const nearestI = (x, y, z) => { let best = -1, bd = 1e18; const cx = Math.floor(x / G), cy = Math.floor(y / G), cz = Math.floor(z / G);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const i of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) { const p = t.pos[i], d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best; };
  const loc = {}, near = [], Vp = { x: 0, y: 0, z: 0 };
  const covered = (p, r, l) => { t.obstaclesNear(l.i, near, 2);
    for (const o of near) {
      if (o.type === 'sphere') { if (Math.hypot(o.p.x - p[0], o.p.y - p[1], o.p.z - p[2]) <= o.r + Math.max(1, r * 0.35)) return true; continue; }
      const di = Math.abs(((l.s - o.i * t.D) % t.length + t.length * 1.5) % t.length - t.length / 2);
      if (di > o.r + Math.max(1, r * 0.35)) continue;
      if (o.type === 'vbeam' && Math.abs(l.x - o.x) <= o.r + Math.max(1, r * 0.35)) return true;
      if (o.type === 'hbeam' && Math.abs(l.y - o.y) <= o.r + Math.max(1, r * 0.35)) return true;
    }
    return false; };
  const byKind = {}, pieces = [], treesReaching = new Set();
  for (const [a, b, ra, rb, kind, fi] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L)); let inPiece = 0, unc = 0, worst = null;
    for (let k = 0; k <= n; k++) { const u = k / n, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], r = ra + (rb - ra) * u;
      const i = nearestI(p[0], p[1], p[2]); if (i < 0) continue; Vp.x = p[0]; Vp.y = p[1]; Vp.z = p[2]; t.locate(Vp, i, loc, 6);
      if (Math.abs(loc.along) > t.D * 0.75 || Math.abs(loc.x) > t.w[loc.i] + r - 0.5 || Math.abs(loc.y) > t.h[loc.i] + r - 0.5) continue;
      inPiece++; if (!covered(p, r, loc)) { unc++; const depth = Math.min(t.w[loc.i] + r - Math.abs(loc.x), t.h[loc.i] + r - Math.abs(loc.y)); if (!worst || depth > worst.depth) worst = { i: loc.i, x: +loc.x.toFixed(1), y: +loc.y.toFixed(1), r: +r.toFixed(2), depth: +depth.toFixed(1) }; } }
    const s = byKind[kind] ||= { segments: 0, reaching: 0, uncovered: 0, samples: 0, uncoveredSamples: 0 };
    s.segments++; if (inPiece) s.reaching++; if (unc) s.uncovered++; s.samples += inPiece; s.uncoveredSamples += unc;
    if (inPiece && fi !== undefined) treesReaching.add(fi);
    if (unc) pieces.push({ kind, a: a.map(v => +v.toFixed(1)), b: b.map(v => +v.toFixed(1)), samples: inPiece, uncovered: unc, worst });
  }
  const wrong = pieces.filter(p => !PASSABLE.has(p.kind)), forest = (globalThis.__forest || []).length;
  console.log(`Verdant Canopy: ${segs.length} drawn wood segments (${forest} forest trees), ${t.obstacles.length} solid obstacles in the simulation`);
  for (const [kind, s] of Object.entries(byKind).sort((x, y) => y[1].reaching - x[1].reaching)) if (s.reaching) console.log(`  ${kind}: ${s.segments} segments, ${s.reaching} reach the corridor (${s.samples} one-metre samples), without collision: ${s.uncovered} segments (${s.uncoveredSamples} samples)`);
  console.log(`forest trees reaching the corridor: ${treesReaching.size}`);
  console.log(`solid-looking wood in the corridor without collision: ${wrong.length} segments`);
  for (const p of wrong.sort((x, y) => y.worst.depth - x.worst.depth).slice(0, 20)) console.log('  ', JSON.stringify(p));
  if (OUT) writeFileSync(OUT, JSON.stringify({ course: COURSE, forest, byKind, treesReaching: [...treesReaching], wrong }, null, 1));
  const ok = treesReaching.size === 0 && wrong.length === 0;
  console.log(ok ? 'PASS: no forest tree reaches the corridor; all other wood there collides, except the vines and the bridge cords (passable by design)' : 'FAIL');
  process.exitCode = ok ? 0 : 1;
} finally { rmSync(TMP, { recursive: true, force: true }); }
