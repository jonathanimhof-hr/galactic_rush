// Neon Spire: dive between kilometre-high towers, thread traffic lanes and blast through megastructure tunnels.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QX, QY, DET } from '../geo.js';
import { holoSign, BRANDS } from '../textures.js';
import { Chunks, ribbon, fq, P, hexField, gates, pickups, hazards, routeGuides, movers, planetItems, v3 } from './common.js';
import { buildPod, buildPatrol, buildCarrier, buildHauler, carrierGlow } from '../props.js';
import { buildCityBlocks, heroRelief } from './citygen.js';
import { Frustum, Occlusion, lodPair } from '../lod.js';
import { capitalShip } from '../capital.js';

const NEON = [[1, 0.2, 0.7], [0.2, 0.9, 1], [1, 0.72, 0.2], [0.55, 1, 0.3], [0.7, 0.35, 1], [1, 0.35, 0.25]];
const GROUND = -460;
export function buildCity(gfx, t) {
  const rng = makeRng(t.def.seed * 17 + 3), items = [], N = t.N;
  // the city itself: districts of instanced building families, under-city decks, far skyline and arcologies
  const blocks = buildCityBlocks(gfx, t, rng, GROUND), { minX, maxX, minZ, maxZ } = blocks.bounds, signSpots = blocks.signSpots, beaconsTop = blocks.beacons;
  items.push(...blocks.items);
  // ground far below: dark slab with a faint street grid, mostly lost in the haze
  const ground = new Geo().mat(0.2, 0.7, 1, DET.struct).at((minX + maxX) / 2, GROUND - 2, (minZ + maxZ) / 2).box(30000, 4, 30000, [0.04, 0.04, 0.045, 0]);
  const streets = new Geo().mat(0, 0.5, 2, 0);
  for (let x = minX - 900; x < maxX + 900; x += 66) streets.at(x, GROUND + 0.2, (minZ + maxZ) / 2).box(3, 0.2, maxZ - minZ + 1800, [1, 0.55, 0.25, 1]);
  for (let z = minZ - 900; z < maxZ + 900; z += 66) streets.at((minX + maxX) / 2, GROUND + 0.2, z).box(maxX - minX + 1800, 0.2, 3, [1, 0.55, 0.25, 1]);
  items.push({ mesh: gfx.mesh(ground.build()), visible: true, ds: 0.25, prog: 'pbrCity' }, { mesh: gfx.mesh(streets.build()), visible: true, prog: 'pbrCity' });
  // holo boards on tower faces, turned toward the course
  const quad = gfx.mesh(new Geo().box(1, 1, 0.001, [1, 1, 1, 1]).build()), signs = [];
  signSpots.forEach((s, k) => {
    const tp = t.pos[s.di], dx = tp.x - s.px, dz = tp.z - s.pz, faceX = Math.abs(dx) > Math.abs(dz), vertical = k % 3 === 0;
    const off = faceX ? v3(Math.sign(dx) * (s.sx / 2 + 0.8), 0, 0) : v3(0, 0, Math.sign(dz) * (s.sz / 2 + 0.8));
    const y = Math.min(s.top - 30, tp.y + (rng() - 0.5) * 70), col = NEON[k % NEON.length];
    const yaw = faceX ? (dx > 0 ? 90 : -90) : (dz > 0 ? 0 : 180), pos = v3(s.px, y, s.pz).add(off), sz = vertical ? [10, 40] : [34, 17];
    const it = { mesh: quad, prog: 'unlit', mode: 1, blend: 'add', tex: gfx.texture(holoSign(k * 13 + 5, col, { brand: BRANDS[k % BRANDS.length], vertical })), pos, quat: QY(yaw), sx: sz[0], sy: sz[1], sz: 1, intensity: 1.7, color: [1, 1, 1, 1], visible: true, layer: 6, br: 25 };
    items.push(it); signs.push({ pos, col });
  });
  // tunnels: solid walls exactly on the corridor boundary, megastructure shell outside, light rings with a travelling pulse
  const ch = new Chunks(t, 48), tun = i => !!t.tunnel[i], rings = [];
  for (let c = 0; c < N; c += 48) {
    const g = ch.get(c, 'tun').mat(0.6, 0.42, 1, DET.struct), i1 = Math.min(N, c + 48), col = [0.21, 0.21, 0.23, 0];
    ribbon(g, t, i => [-t.w[i], -t.h[i]], i => [t.w[i], -t.h[i]], col, c, i1, 2, tun); ribbon(g, t, i => [t.w[i], t.h[i]], i => [-t.w[i], t.h[i]], col, c, i1, 2, tun);
    ribbon(g, t, i => [-t.w[i], t.h[i]], i => [-t.w[i], -t.h[i]], col, c, i1, 2, tun); ribbon(g, t, i => [t.w[i], -t.h[i]], i => [t.w[i], t.h[i]], col, c, i1, 2, tun);
    const sh = ch.get(c, 'shell').mat(0.3, 0.4, 1, DET.facade), sc = [0.16, 0.16, 0.18, 0];
    ribbon(ch.get(c, 'tun').mat(0.6, 0.5, 1, DET.struct), t, i => [-t.w[i] - 60, t.h[i] + 70], i => [t.w[i] + 60, t.h[i] + 70], [0.2, 0.2, 0.24, 0], c, i1, 2, tun); sh.mat(0.3, 0.4, 1, DET.facade);
    ribbon(sh, t, i => [-t.w[i] - 60, -t.h[i] - 90], i => [-t.w[i] - 60, t.h[i] + 70], sc, c, i1, 2, tun); ribbon(sh, t, i => [t.w[i] + 60, t.h[i] + 70], i => [t.w[i] + 60, -t.h[i] - 90], sc, c, i1, 2, tun);
  }
  let ringK = 0;
  for (let i = 0; i < N; i++) {
    if (!t.tunnel[i]) continue;
    if (!t.tunnel[t.wrapIdx(i - 1)] || !t.tunnel[t.wrapIdx(i + 1)]) { const q = fq(t, i), w = t.w[i], h = t.h[i], g = ch.get(i, 'tun');
      for (const [x, y, sx, sy] of [[0, h + 9, 2 * w + 36, 18], [0, -h - 9, 2 * w + 36, 18], [w + 9, 0, 18, 2 * h], [-w - 9, 0, 18, 2 * h]]) { const p = P(t, i, x, y); g.mat(0.7, 0.4, 1, DET.struct).at(p.x, p.y, p.z, q).bbox(sx, sy, 8, 1.5, [0.3, 0.3, 0.34, 0]); }
      const gl = ch.get(i, 'lit'); for (const [x, y, sx, sy] of [[0, h + 0.4, 2 * w, 0.6], [0, -h - 0.4, 2 * w, 0.6]]) { const p = P(t, i, x, y); gl.mat(0, 0.4, 5, 0).at(p.x, p.y, p.z, q).box(sx, sy, 8.4, [1, 0.6, 0.2, 1]); } }
    if (i % 7 !== 0) continue;
    const q = fq(t, i), w = t.w[i] - 0.25, h = t.h[i] - 0.25, rg = new Geo().mat(0, 0.4, 1, 0), col = [...NEON[(ringK % 2) ? 1 : 0], 1];
    for (const [x, y, sx, sy] of [[0, h, 2 * w, 0.4], [0, -h, 2 * w, 0.4], [w, 0, 0.4, 2 * h], [-w, 0, 0.4, 2 * h]]) { const p = P(t, i, x, y); rg.at(p.x, p.y, p.z, q).box(sx, sy, 0.9, col); }
    const it = { mesh: gfx.mesh(rg.build()), prog: 'unlit', intensity: 2, color: [1, 1, 1, 1], visible: true, bs: { x: t.pos[i].x, y: t.pos[i].y, z: t.pos[i].z, r: w + h }, maxDist: 900 };
    items.push(it); rings.push({ it, s: i * t.D, k: ringK++ });
  }
  items.push(...ch.items(gfx, 'tun', { cast: true, prog: 'pbrCity' }), ...ch.items(gfx, 'shell', { maxDist: 5000, prog: 'pbrCity' }), ...ch.items(gfx, 'lit', { prog: 'pbrCity' }));
  // traffic pods (hazards): sized to their 4.2 m collision sphere, headlights forward along the lane
  const podMesh = NEON.map(c => gfx.mesh(buildPod(c))), pods = [];
  t.traffic.forEach((lane, li) => { for (let k = 0; k < lane.n; k++) { const it = { mesh: podMesh[(li + k) % NEON.length], pos: new Vec3(), quat: fq(t, lane.i).multiply(QY(lane.dir > 0 ? -90 : 90)), scale: 1, cast: true, br: 4.5, visible: true };
    items.push(it); pods.push({ lane, k, it }); }
    // lane signal posts outside the corridor
    const q = fq(t, lane.i), g = ch.get(lane.i, 'lane');
    for (const s of [-1, 1]) for (let j = 1; j <= 6; j++) { const p = P(t, lane.i, s * (t.w[lane.i] + j * 7), lane.y + 5.5); g.mat(0, 0.4, 4, 0).at(p.x, p.y, p.z, q).box(1.2, 0.5, 0.5, [1, 0.75, 0.2, 1]); }
  });
  items.push(...ch.items(gfx, 'lane', { prog: 'pbrCity' }));
  // traffic: lanes over the street grid at many altitudes, each with its own speed and direction. Near cars are
  // real meshes, distant ones light pairs; a car hides wherever it would pass through a building or the corridor.
  const occ = new Map(), foot = blocks.foot;
  for (let i = 0; i < N; i += 2) for (let s = -1; s <= 1; s += 0.5) { const p = t.pointAt(i, s * t.w[i], 0), k = Math.floor(p.x / 100) + ',' + Math.floor(p.z / 100), o = occ.get(k), lo = p.y - t.h[i] - 30, hi = p.y + t.h[i] + 30;
    if (o) { o[0] = Math.min(o[0], lo); o[1] = Math.max(o[1], hi); } else occ.set(k, [lo, hi]); }
  const blocked = (x, y, z) => { const o = occ.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); return (o && y > o[0] && y < o[1]) || foot(x, y, z); };
  // air lanes at eight altitudes (kept clear of the two highway levels) plus two-way traffic on every highway segment;
  // four vehicle types: cars, delivery vans, transit buses, cargo haulers; heavy cargo flies the top lanes
  const ALT = [-350, -280, -190, -100, 140, 230, 330, 430], lanes = [];
  for (let k = 0, nl = gfx.cfg && gfx.cfg.msaa === 0 ? 24 : 44; k < nl; k++) { const ax = k % 2, base = ax ? minX : minZ, span = ax ? maxX - minX : maxZ - minZ;
    lanes.push({ ax, line: base - 900 + 66 * Math.floor(rng() * (span + 1800) / 66), y: ALT[k % ALT.length] + rng() * 20, sp: (35 + rng() * 75) * (rng() < 0.5 ? 1 : -1), n: 7 + (rng() * 9 | 0), len: 2600 + rng() * 1800, ph: rng() * 3000, o: (ax ? minZ : minX) - 300 + rng() * 600, type: k % 8 > 5 ? 3 : 0, off: 0 }); }
  for (const hw of blocks.hwys) if (hw.segs.length) for (const dir of [-1, 1]) { const lo = hw.segs[0][0], hi = hw.segs[hw.segs.length - 1][1];
    lanes.push({ ax: hw.ax, line: hw.line, y: hw.y + 2.6, sp: dir * (30 + rng() * 25), n: 6 + (rng() * 6 | 0), len: hi - lo, ph: rng() * 1000, o: lo, type: 1 + Math.floor(rng() * 3), off: dir * 4.2, segs: hw.segs }); }
  const vehicle = kind => { const g = new Geo(), D = [0.12, 0.12, 0.13, 0], GL = [0.05, 0.06, 0.08, 0];
    if (kind === 0) g.mat(0.7, 0.35, 1, DET.hull).bbox(2.4, 1.1, 5.4, 0.35, [0.3, 0.3, 0.33, 0]).mat(0.9, 0.05, 1, DET.glass).at(0, 0.5, 0.9).bbox(1.5, 0.5, 1.8, 0.2, GL).mat(0.6, 0.4, 1, 0).at(1.45, -0.1, -0.6).cyl(0.42, 0.42, 2.6, 10, D).at(-1.45, -0.1, -0.6).cyl(0.42, 0.42, 2.6, 10, D);
    else if (kind === 1) g.mat(0.5, 0.5, 1, DET.hull).bbox(2.6, 2.3, 6.2, 0.25, [0.62, 0.6, 0.55, 0]).mat(0.9, 0.05, 1, DET.glass).at(0, 0.45, 2.7).bbox(2.2, 0.9, 0.9, 0.1, GL).mat(0.6, 0.4, 1, 0).at(0, -1.3, -0.5).bbox(2.0, 0.3, 4.5, 0.08, D);
    else if (kind === 2) g.mat(0.5, 0.45, 1, DET.hull).bbox(3.0, 3.0, 14, 0.5, [0.2, 0.35, 0.5, 0]).mat(0, 0.4, 2.5, 0).at(1.51, 0.4, 0).box(0.02, 0.8, 11, [1, 0.85, 0.6, 1]).at(-1.51, 0.4, 0).box(0.02, 0.8, 11, [1, 0.85, 0.6, 1]);
    else g.mat(0.6, 0.5, 1, DET.hull).at(0, 0, 5.5).bbox(3.0, 2.6, 3.6, 0.3, [0.55, 0.3, 0.12, 0]).mat(0.4, 0.7, 1, DET.struct).at(0, 0.3, -1.6).bbox(3.4, 3.4, 10.5, 0.1, [0.32, 0.3, 0.28, 0]).mat(0.6, 0.4, 1, 0).at(1.9, -0.6, -1).cyl(0.6, 0.6, 9, 10, D).at(-1.9, -0.6, -1).cyl(0.6, 0.6, 9, 10, D);
    const tl = kind >= 2 ? 7.2 : kind === 1 ? 3.15 : 2.72; g.mat(0, 0.4, 4, 0).at(0, 0, -tl).box(1.8, 0.2, 0.05, [1, 0.12, 0.08, 1]).at(0.8, 0, tl).box(0.35, 0.15, 0.05, [1, 1, 1, 1]).at(-0.8, 0, tl).box(0.35, 0.15, 0.05, [1, 1, 1, 1]);
    return g.build(); };
  const VEH = [0, 1, 2, 3].map(k => gfx.mesh(vehicle(k), 40)); for (const mesh of VEH) items.push({ mesh, visible: true });
  const vn = [0, 0, 0, 0], mc = mat4.create(), qc = new Quat(), tv = new Vec3();
  // haze between towers
  const haze = []; for (let k = 0; k < 600 && haze.length < 70; k++) { const p = v3(minX - 300 + rng() * (maxX - minX + 600), -300 + rng() * 420, minZ - 300 + rng() * (maxZ - minZ + 600)), sz = 120 + rng() * 200;
    let ok = true; for (let i = 0; i < N; i += 6) if (t.pos[i].dist(p) < t.w[i] + sz * 0.6 + 40) { ok = false; break; } if (ok) haze.push({ p, s: sz }); }
  const hex = hexField(gfx, t, i => !t.tunnel[i], [1, 0.35, 0.85]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), hz = hazards(gfx, t), bc = routeGuides(gfx, t, { colL: [1, 0.25, 0.75], colR: [0.25, 0.9, 1], corners: i => t.tunnel[i] ? [] : [0, 1, 2, 3], open: i => !t.tunnel[i] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...hz.items, ...bc.items);
  // orbital ring and a space elevator on the skyline, patrols and a carrier overhead
  items.push({ mesh: gfx.mesh(new Geo().mat(0.6, 0.5, 1, DET.struct).at(0, 0, 0, QX(90)).torus(5200, 60, 200, 8, [0.3, 0.3, 0.36, 0]).build()), pos: v3(-500, 2600, 400), quat: new Quat().setAxisAngle(0, 0, 1, 0.24), scale: 1, visible: true },
    { mesh: gfx.mesh(new Geo().mat(0.6, 0.5, 1, DET.struct).at(0, 0, 0, QX(-90)).cyl(30, 30, 4000, 16, [0.4, 0.4, 0.45, 0]).build()), pos: v3(1800, 1500, -2600), quat: new Quat(), visible: true });
  const patrol = gfx.mesh(buildPatrol()), hauler = gfx.mesh(buildHauler()), carrier = null, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const mv = movers([
    ...[0, 1, 2, 3].map(k => ({ mesh: patrol, br: 20, path: (time, p, q) => { const a = time * (0.09 + k * 0.015) + k * 1.6; p.set(cx + Math.cos(a) * (700 + k * 150), 260 + k * 45, cz + Math.sin(a) * (700 + k * 150)); q.setAxisAngle(0, 1, 0, -a); },
      lights: [{ x: 7.2, y: 0, z: -6, s: 2.2, c: [4, 0.4, 0.3], blink: 1.4, ph: k }, { x: -7.2, y: 0, z: -6, s: 2.2, c: [0.4, 4, 0.6], blink: 1.4, ph: k + 0.4 }] })),
    ...[0, 1, 2].map(k => ({ mesh: hauler, scale: 3, br: 160, path: (time, p, q) => { const a = time * 0.018 * (k % 2 ? 1 : -1) + k * 2.1, R = 1300 + k * 450; p.set(cx + Math.cos(a) * R, 1380 + k * 60, cz + Math.sin(a) * R); q.setAxisAngle(0, 1, 0, -a + (k % 2 ? 0 : Math.PI)); },
      lights: [{ x: 9, y: 0, z: -40, s: 5, c: [4, 0.5, 0.3], blink: 1.1, ph: k }, { x: -9, y: 0, z: -40, s: 5, c: [0.4, 4, 0.6], blink: 1.1, ph: k + 0.5 }] })),
    { mesh: carrier, br: 1400, path: (time, p, q) => { p.set(cx + 2600 - time * 4, 1700, cz - 3600); q.setAxisAngle(0, 1, 0, -1.9); } }]);
  items.push(...mv.items);
  const cBase = mv.items[mv.items.length - 1]; cBase.visible = false; const cap = capitalShip(gfx, 'warden', cBase); items.push(...cap.items); // V6 capital class with three levels and animated turrets
  const env = { sunDir: v3(-0.7, 0.2, 0.65).normalize(), sunCol: [3.1, 2.35, 1.75], fogCol: [0.105, 0.11, 0.12], fog: 0.0008, fogH: [GROUND, 380], sky: 'atmo', zen: [0.03, 0.05, 0.1], hor: [0.46, 0.36, 0.27], dirt: 0.25, streak: 0.5, flare: 0.5, envInt: 0.85, expo: 1.0, shafts: 0.12, reverb: 'city',
    nebA: [0.5, 0.1, 0.45], nebB: [0.95, 0.35, 0.3], nebC: [1, 0.7, 0.9], base: [0.02, 0.025, 0.04], neb: 0, seed: 12.4, sat: 0.95, lift: [0.006, 0.008, 0.012], gain: [1.03, 1.0, 0.96],
    planet: { dir: v3(0.3, 0.45, 0.85), dist: 15000, r: 2600, type: 2, a: [0.78, 0.82, 0.86], b: [0.55, 0.62, 0.7], c: [0.95, 0.97, 1], atmo: [0.55, 0.7, 1], ring: [0.8, 0.8, 0.82] } };
  items.push(...planetItems(gfx, env, t.def.seed));
  // visibility: frustum + conservative occlusion + screen-size LOD for every instanced building, and the hero
  // facade relief layer (built on demand for the nearest few landmark and course-side towers, faded in with dither)
  const fr = new Frustum(), ocl = new Occlusion(128, 72), sd = env.sunDir; for (const S of blocks.sets) S.occ = ocl;
  const heroes = blocks.heroes, live = new Set(), MAXLIVE = 14;
  const boxDist = (h, p) => Math.hypot(Math.max(h.lo[0] - p.x, 0, p.x - h.hi[0]), Math.max(h.lo[1] - p.y, 0, p.y - h.hi[1]), Math.max(h.lo[2] - p.z, 0, p.z - h.hi[2]));
  const cull = (cam, dt) => {
    fr.set(cam, gfx); ocl.begin(cam, gfx); const cp = cam.pos;
    for (const o of blocks.occl) { const dx = o.x - cp.x, dy = o.y - cp.y, dz = o.z - cp.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > 9e6 || !fr.sphere(o.x, o.y, o.z, Math.sqrt(o.a))) continue; ocl.offer(o.c, o.a / Math.max(d2, 100), o); }
    ocl.rasterize(48); for (const S of blocks.sets) S.update(fr);
    const far = gfx.cfg.msaa === 0 ? 0 : gfx.cfg.ao ? 440 : 340, near = far * 0.7; // relief fades in where a 0.7 m ledge covers about a pixel
    for (const h of heroes) h.d = boxDist(h, cp);
    if (far > 0) { let best = null; for (const h of heroes) if (!h.it && h.d < far + 160 && (!best || h.d < best.d)) best = h; // one new hero per frame at most
      if (best && live.size >= MAXLIVE) { let worst = null; for (const h of live) if (!worst || h.d > worst.d) worst = h; if (worst.d > best.d + 100) { gfx.freeMesh(worst.it.mesh); const ix = items.indexOf(worst.it); if (ix >= 0) items.splice(ix, 1); live.delete(worst); worst.it = null; } else best = null; }
      if (best) { best.it = { mesh: gfx.mesh(heroRelief(best).build()), prog: 'pbrFade', fade: 0, ft: 0, visible: false, cast: true, bs: { x: best.c.x, y: best.c.y, z: best.c.z, r: best.r } }; items.push(best.it); live.add(best); } }
    for (const h of live) { const it = h.it; it.ft = Math.min(1, it.ft + (dt || 0.016) * 1.6); it.fade = Math.min(it.ft, Math.max(0, Math.min(1, (far - h.d) / (far - near)))); it.visible = it.fade > 0; it.cast = h.d < 240; }
  };
  return { items, env, blocks, cull: (cam, dt) => cull(cam, Math.min(dt || 0.016, 1)), ocl, live, fr, hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); hz.update(dt, time, race, fx, cam); mv.update(dt, time, fx); bc.update(fx, cam, race, time); cap.update(gfx, cam, time, fx);
      for (const p of pods) { t.pointAt(p.lane.i, t.trafficCarX(p.lane, p.k, race.time), p.lane.y, p.it.pos); }
      for (const r of rings) { const wave = 0.5 + 0.5 * Math.sin(r.s * 0.035 - time * 9); r.it.intensity = 0.6 + 3.4 * Math.pow(wave, 6); }
      const c = cam.pos;
      vn.fill(0);
      for (const L of lanes) for (let k = 0; k < L.n; k++) {
        const u = ((time * L.sp + k * L.len / L.n + L.ph) % L.len + L.len) % L.len, a = L.o + u;
        if (L.segs && !L.segs.some(s => a > s[0] + 4 && a < s[1] - 4)) continue;
        const x = L.ax ? L.line + L.off : a, z = L.ax ? a : L.line + L.off, y = L.y + (L.segs ? 0 : (k % 3) * 4);
        const dx = x - c.x, dy = y - c.y, dz = z - c.z, dd = dx * dx + dy * dy + dz * dz; if (dd > 2.5e7 || (!L.segs && blocked(x, y, z))) continue;
        const sg = Math.sign(L.sp), hx = L.ax ? 0 : sg, hz2 = L.ax ? sg : 0, s = Math.max(1.2, Math.sqrt(dd) * 0.0035), T = L.type, fl = T >= 2 ? 7 : 2.8;
        if (dd < 4.2e5 && vn[T] < 40) { qc.setAxisAngle(0, 1, 0, Math.atan2(hx, hz2)); mat4.compose(mc, tv.set(x, y, z), qc, 1, 1, 1); gfx.setInstance(VEH[T], vn[T]++, mc, 1, 1, 1, 1); }
        fx.bbAdd.add(x + hx * fl, y, z + hz2 * fl, s, 2.6, 2.5, 2.2, 0.85); fx.bbAdd.add(x - hx * fl, y, z - hz2 * fl, s, 2.8, 0.25, 0.15, 0.8); }
      VEH.forEach((mesh, T) => gfx.uploadInstances(mesh, vn[T]));
      for (const st of blocks.stacks) { if (st.dist(c) > 2200) continue; for (let k = 0; k < 4; k++) { const ph = (time * 0.12 + k * 0.25 + st.x * 0.001) % 1; fx.bbNorm.add(st.x + ph * 12, st.y + ph * 70, st.z, 8 + ph * 30, 0.32, 0.3, 0.3, 0.16 * (1 - ph)); } }
      for (const b of beaconsTop) if (Math.floor(time * 1.2 + b.x) % 2 && b.dist(c) < 3500) fx.bbAdd.add(b.x, b.y, b.z, 3.5, 4, 0.3, 0.2, 1);
      for (const h of haze) { const d = h.p.dist(c); if (d < 2000) { const k = Math.max(0, (h.p.x - c.x) * sd.x + (h.p.z - c.z) * sd.z) / Math.max(1, d); fx.bbNorm.add(h.p.x, h.p.y, h.p.z, h.s, 0.1 + k * 0.05, 0.1 + k * 0.03, 0.105, 0.12); } } // neutral haze, warmer toward the sun
    },
    light(me) { if (!me) return null; let best = null, bd = 160; for (const s of signs) { const d = s.pos.dist(me.ship.pos); if (d < bd) { bd = d; best = s; } } return best ? { pos: best.pos, col: best.col.map(c => c * 3), range: 90 } : null; } };
}
