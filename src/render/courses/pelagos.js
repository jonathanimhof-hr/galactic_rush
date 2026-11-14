// GALACTIC RUSH V9 — Pelagos, the ocean world: a storm-tossed sea to the horizon under a drifting cloud deck with
// distant lightning, offshore extraction rigs and a research station on stilts, truss bridges between installations,
// two vertical loops held up by giant towers, islands with a lighthouse, a floating arcology and a space elevator
// on the skyline, freighters ploughing the swell and spray where ships skim the waves.
// V11 visual pass (same layout, same places, same course): the sea gains wind slicks, the cloud deck's shadow with
// sunlit patches, rain stippling and foam round everything standing in it; a lower layer of scud under the deck, rain
// curtains hanging from it and rain falling round the camera, sea mist, branching lightning; the rigs, the station and
// the plants are built as real offshore installations (tubular jackets with bracing, risers and boat landings, decks
// with girders, railings, stairs, accommodation with windows, derricks, cranes, lifeboats, containers, floodlights
// whose beams show in the rain) in weathered marine steel with a splash zone where the swell meets it; the islands get
// rock, grass and surf, the loops and towers the same steel. Each installation is its own item with a lighter level.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QX, QY, QZ, DET } from '../geo.js';
import { Chunks, fq, P, hexField, gates, pickups, hazards, routeGuides, movers, planetItems, v3 } from './common.js';
import { buildPatrol, buildHauler } from '../props.js';
import { Frustum } from '../lod.js';
import { ensurePrograms, Clearance, beam, rod, truss, domeGeo, qLook, fbm2, ridged2, vnoise2 } from './v9kit.js';
import { ensureV11Programs, bar, pipe, railing, stair, ladder, lattice, beamCone, curtain, seaSteel, seaSteelChunks, cellItems, release } from './v11kit.js';

const STEEL = [[0.36, 0.37, 0.39, 0], [0.3, 0.31, 0.33, 0], [0.42, 0.4, 0.37, 0], [0.26, 0.27, 0.29, 0]];
const PAINT = [[0.78, 0.36, 0.12, 0], [0.82, 0.68, 0.16, 0], [0.86, 0.86, 0.84, 0], [0.18, 0.36, 0.52, 0], [0.62, 0.16, 0.12, 0]];
const CONT = [[0.6, 0.22, 0.1, 0], [0.14, 0.3, 0.46, 0], [0.62, 0.5, 0.16, 0], [0.42, 0.44, 0.42, 0], [0.7, 0.7, 0.66, 0], [0.22, 0.36, 0.24, 0]];
const LAMP = [1, 0.82, 0.55, 1], RED = [1, 0.12, 0.08, 1], GRN = [0.2, 1, 0.35, 1], CYAN = [0.4, 0.9, 1, 1];
const LEGC = [0.42, 0.4, 0.36, 0], SPLASH = [0.62, 0.32, 0.12, 0], YEL = [0.8, 0.64, 0.14, 0], GRATE = [0.3, 0.31, 0.32, 0], DARKWIN = [0.05, 0.06, 0.07, 0];
const SEA = 0;
void GRN; void mat4; void rod;

export function buildPelagos(gfx, t) {
  ensurePrograms(gfx); ensureV11Programs(gfx);
  const rng = makeRng(t.def.seed * 19 + 7), items = [], N = t.N, clear = new Clearance(t);
  const ch = new Chunks(t, 96), big = new Geo(), bigLit = new Geo().mat(0, 0.4, 4, 0), lights = []; // big: the skyline's facades (one mesh)
  const steel = new Geo(), stCh = new Chunks(t, 96), beams = new Geo(), foamSrc = []; // V11: weathered steel far from the course, steel near it in chunks, light beams, foam sources
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of t.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const at = tag => t.tags.get(tag) || [], mid = tag => { const a = at(tag); return a[a.length >> 1]; };
  const nearI = p => { let b = 0, bd = 1e18; for (let i = 0; i < N; i += 3) { const q = t.pos[i], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  // world point beside the course: sample i, lateral offset x (right +), height y above the sea
  const beside = (i, x) => { const p = t.pos[i], B = t.bin[i], b = new Vec3(B.x, 0, B.z).normalize(); return new Vec3(p.x + b.x * x, 0, p.z + b.z * x); };
  const okBox = (c, sx, sy, sz, q = new Quat(), m = 6) => clear.box(c, new Vec3(sx / 2, 0, 0).applyQuat(q), new Vec3(0, sy / 2, 0).applyQuat(q), new Vec3(0, 0, sz / 2).applyQuat(q), m);

  // ---------------------------------------------------------------- the sea and the sky
  const U = { uSea: 1.35, uDeep: [0.006, 0.028, 0.036], uScatter: [0.025, 0.2, 0.19], uFoamK: [0.74, 0.85, 0.16, 0.5], uCloud: [1500, 0.00011, 0.62, 0.9], uWind: [0.0011, 0.0006, 0],
    uFlash: [0, 0, 0, 1], uCloudLo: [0.09, 0.1, 0.115], uCloudHi: [0.55, 0.58, 0.62], uGlow: [0, 0, 0], uFoamSrc: new Array(32).fill(0), uFoamN: 0,
    uCloud2: [620, 0.00034, 0.5, 0.8], uWind2: [0.0042, 0.0017, 0], uScud: [0.11, 0.12, 0.135] };
  const SU = { uWx: [SEA, 0.85, 0, 0.7], uSea: U.uSea, uHeatC: [0, 0, 0] }; // weathered steel: sea level, rust, no soot, wet with rain
  let ocean = null;
  { // ocean: rings around the camera, dense near it, out to 40 km; displaced by the swell near the camera only
    const pos = [], nor = [], col = [], mat = [], idx = [], seg = 160, rings = [0]; let r = 0; while (r < 40000) { r += Math.max(2, r * 0.055); rings.push(r); }
    for (const rr of rings) for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); nor.push(0, 1, 0); col.push(1, 1, 1, 0); mat.push(0, 0.1, 1, 0); }
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < seg; k++) { const a = j * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
    const mesh = gfx.mesh({ pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), mat: new Float32Array(mat), idx: new Uint32Array(idx) });
    ocean = { mesh, prog: 'v9ocean', pos: new Vec3(), quat: new Quat(), scale: 1, uniforms: U, visible: true }; // V11: pushed after the scenery (below), so the depth test spares the sea's shading wherever the scenery covers it
  }
  const dome = { mesh: gfx.mesh(domeGeo(64, 18).build()), prog: 'v9cloud', pos: new Vec3(), quat: new Quat(), scale: 26000, uniforms: U, blend: 'normal', layer: -1, visible: true }; items.push(dome);

  // ---------------------------------------------------------------- loops: helical side rails and a keel under the corridor,
  // U-frames every few samples, lights, and the towers and legs that carry them out of the sea
  const loopTowers = [];
  for (const L of t.loops) {
    const g = ch.get(L.i0, 'loop'), gl = ch.get(L.i0, 'loopLit'), i0 = L.i0 - 14, i1 = L.i1 + 14;
    for (let i = i0; i < i1; i += 2) {
      const k = t.wrapIdx(i), k2 = t.wrapIdx(i + 2), q = fq(t, k), w = t.w[k], h = t.h[k];
      const seg = (x, y, sx, sy, geo, c) => { const a = P(t, k, x, y), b = P(t, k2, x, y), m = new Vec3().lerpVectors(a, b, 0.5); geo.at(m.x, m.y, m.z, q).box(sx, sy, a.dist(b) + 0.4, c); };
      seg(0, -h - 4.2, 10, 3.2, g.mat(0.6, 0.45, 1, DET.struct), [0.32, 0.33, 0.35, 0]); // keel
      for (const s of [-1, 1]) { seg(s * (w + 4), -h - 2, 2.6, 2.6, g, [0.38, 0.38, 0.4, 0]); seg(s * (w + 4), h * 0.25, 1.8, 1.8, g, [0.3, 0.31, 0.33, 0]); seg(s * (w + 2.4), -h - 0.6, 0.4, 0.4, gl.mat(0, 0.4, 5, 0), s > 0 ? [0.4, 0.9, 1, 1] : [1, 0.72, 0.3, 1]); }
      // V11: the keel is a box girder: side webs with lightening holes read as dark recesses, a walkway grating with handrails along it
      for (const s of [-1, 1]) seg(s * 4.6, -h - 6.1, 0.5, 0.9, g, [0.22, 0.23, 0.25, 0]);
      if (i % 4 === 0) for (const s of [-1, 1]) { const a = P(t, k, s * 2.2, -h - 5.85), b = P(t, k2, s * 2.2, -h - 5.85); bar(g, a, b, 0.08, 0.08, YEL); }
      // V11: diagonal lacing between the lower and upper side rails
      if (i % 4 === 0) for (const s of [-1, 1]) bar(g, P(t, k, s * (w + 4), -h - 2), P(t, k2, s * (w + 4), h * 0.25), 0.55, 0.55, [0.3, 0.31, 0.33, 0]);
      if (i % 8 === 0) { // U-frame: under the keel and up both sides, never inside the corridor
        for (const s of [-1, 1]) { const a = P(t, k, s * (w + 4), -h - 2), b = P(t, k, s * (w + 4), h * 0.25), c = P(t, k, s * 6, -h - 4.2);
          g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, q).box(2.2, a.dist(b), 2.2, [0.28, 0.29, 0.31, 0]);
          g.at((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, q.clone().multiply(QZ(s * Math.atan2(2.2, w - 2) * 57.3))).box(a.dist(c), 1.8, 1.8, [0.28, 0.29, 0.31, 0]);
          // V11: gusset plates and bolted flanges where the frame meets the rails
          const gp = P(t, k, s * (w + 4), -h - 2); g.at(gp.x, gp.y, gp.z, q).box(3.4, 3.4, 0.4, [0.26, 0.27, 0.29, 0]); }
        const lp = P(t, k, 0, -h - 2.4); gl.at(lp.x, lp.y, lp.z, q).box(5, 0.3, 0.8, [1, 0.8, 0.45, 1]);
        if (i % 16 === 0) for (const s of [-1, 1]) { const bp = P(t, k, s * (w + 4), h * 0.25 + 1.2); gl.at(bp.x, bp.y, bp.z, q).box(0.7, 0.7, 0.7, s > 0 ? [0.4, 0.9, 1, 1] : [1, 0.72, 0.3, 1]); }
      }
    }
    // towers: beside the loop at its fore and aft extremes (where it runs straight up and straight down), each with an
    // arm to the side rail; a tower is only built where it stands clear of the corridor
    let iUp = L.i0, iDn = L.i0; for (let i = L.i0; i <= L.i1; i++) { if (t.tan[i].y > t.tan[iUp].y) iUp = i; if (t.tan[i].y < t.tan[iDn].y) iDn = i; }
    for (const ia of [iUp, iDn]) for (const s of [-1, 1]) {
      const rail = P(t, ia, s * (t.w[ia] + 4), 0), side = new Vec3().copy(t.bin[ia]).scale(s); side.y = 0; side.normalize();
      for (const off of [34, 52, 70]) { const head = rail.clone().addScaled(side, off), foot = head.clone(); foot.y = SEA - 6;
        if (!clear.box(new Vec3().lerpVectors(foot, head, 0.5), v3(11, 0, 0), v3(0, (head.y - foot.y) / 2, 0), v3(0, 0, 11), 6)) continue;
        const tg = stCh.get(ia, 'stl'); truss(tg.mat(0.6, 0.5, 1, 0), foot, head, 18, 18, [0.34, 0.33, 0.33, 0]); truss(tg, head, rail, 7, 8, [0.34, 0.33, 0.33, 0]);
        tg.at(foot.x, SEA + 2, foot.z).bbox(32, 18, 32, 2, [0.25, 0.26, 0.27, 0]); foamSrc.push({ x: foot.x, z: foot.z, r: 17, k: 1 });
        // V11: a service ladder cage up one face, a platform every 60 m, a beacon crown
        ladder(tg, v3(foot.x + 9.6, SEA + 11, foot.z), v3(foot.x + 9.6, head.y - 4, foot.z), 0.8, v3(0, 0, 1), YEL);
        for (let y = 60; y < head.y - 10; y += 60) { tg.at(head.x, y, head.z).box(20, 0.5, 20, GRATE); railing(tg, [v3(head.x - 10, y, head.z - 10), v3(head.x + 10, y, head.z - 10), v3(head.x + 10, y, head.z + 10), v3(head.x - 10, y, head.z + 10)], 1.1, 3, YEL, true); }
        for (let y = 30; y < head.y; y += 60) { const p = v3(head.x, y, head.z); bigLit.at(p.x, p.y, p.z).box(1.4, 1.4, 1.4, RED); lights.push({ p, c: [3, 0.25, 0.15], s: 6, blink: 0.6 }); }
        loopTowers.push(head); break; }
    }
    for (const ia of [L.i0 + 6, L.i1 - 6]) for (const s of [-1, 1]) { const top = P(t, ia, s * (t.w[ia] + 4), -t.h[ia] - 2), foot = top.clone(); foot.y = SEA - 4;
      const tg = stCh.get(ia, 'stl'); truss(tg.mat(0.6, 0.5, 1, 0), foot, top, 9, 12, [0.33, 0.33, 0.34, 0]); tg.at(foot.x, SEA + 1.5, foot.z).bbox(16, 10, 16, 1.5, [0.25, 0.26, 0.27, 0]); foamSrc.push({ x: foot.x, z: foot.z, r: 9, k: 1 }); }
    // a beacon crown at the top of the loop
    { let iTop = L.i0; for (let i = L.i0; i <= L.i1; i++) if (t.pos[i].y > t.pos[iTop].y) iTop = i; const p = P(t, iTop, 0, -t.h[iTop] - 9); lights.push({ p, c: [3.5, 0.3, 0.2], s: 10, blink: 1.2 }); bigLit.at(p.x, p.y, p.z).box(2, 2, 2, RED); }
  }

  // ---------------------------------------------------------------- platforms on stilts
  // deck at height y, size sx x sz, yaw a (deg); legs into the sea; kind: 'rig' (derrick, flare), 'station' (domes,
  // labs, helipad), 'plant' (tanks, pipe racks); every part is checked against the corridor (the footprint test in
  // placePlat covers the whole installation). V11: each installation is two items, its main forms and its fine detail
  // (railings, bracing, stairs, windows, small fittings), the detail drawn while the installation is big on screen.
  const flares = [], plats = [];
  const platform = (x, z, y, sx, sz, a, kind, seed) => {
    const r = makeRng(seed), q = QY(a), c = v3(x, y, z), g = new Geo().mat(0.5, 0.6, 1, 0), d = new Geo().mat(0.5, 0.6, 1, 0), gl = new Geo().mat(0, 0.4, 4, 0), X = (lx, ly, lz) => new Vec3(lx, ly, lz).applyQuat(q).add(c);
    const R2 = makeRng(seed * 7 + 13); // V11: detail draws, apart from the V9 draws above so the installations keep their look
    // legs: tubular jacket legs into the sea with a splash-zone collar, stiffening rings, two bays of X-bracing
    const lx = sx / 2 - 6, lz = sz / 2 - 6, legR = Math.min(6, 2.5 + sx * 0.03), LEGS = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz], ...(sx > 90 ? [[0, -lz], [0, lz]] : [])];
    for (const [px, pz] of LEGS) {
      const top = X(px, -3, pz), foot = top.clone(); foot.y = SEA - 12;
      g.mat(0.5, 0.55, 1, 0).at(top.x, (top.y + foot.y) / 2, top.z, QX(90)).cyl(legR, legR * 1.2, top.y - foot.y, 20, LEGC, false);
      g.at(top.x, SEA + 1.2, top.z, QX(90)).cyl(legR * 1.6, legR * 1.6, 6, 20, SPLASH);
      for (let yy = SEA + 10; yy < top.y - 5; yy += 7) d.at(top.x, yy, top.z, QX(90)).cyl(legR * 1.07, legR * 1.07, 0.6, 20, LEGC, false);
      foamSrc.push({ x: top.x, z: top.z, r: legR * 1.6, k: 1 });
    }
    const y1 = SEA + 9, y2 = (SEA + y) * 0.55, faces = [[-lx, -lz, lx, -lz], [-lx, lz, lx, lz], [-lx, -lz, -lx, lz], [lx, -lz, lx, lz]];
    for (const yy of [y1, y2]) for (const [ax, az, bx, bz] of faces) pipe(g, X(ax, yy - y, az), X(bx, yy - y, bz), 0.85, STEEL[1], 10);
    for (const [ax, az, bx, bz] of faces) { pipe(d, X(ax, y1 - y, az), X(bx, y2 - y, bz), 0.55, STEEL[1], 8); pipe(d, X(bx, y1 - y, bz), X(ax, y2 - y, az), 0.55, STEEL[1], 8);
      pipe(d, X(ax, y2 - y, az), X((ax + bx) / 2, -10.5, (az + bz) / 2), 0.45, STEEL[1], 8); pipe(d, X(bx, y2 - y, bz), X((ax + bx) / 2, -10.5, (az + bz) / 2), 0.45, STEEL[1], 8); }
    { // risers down the first leg into the sea, and a boat landing with fenders and a ladder up to the cellar deck
      const [px, pz] = LEGS[0], out = new Vec3(px, 0, pz).normalize().applyQuat(q), sd = v3(-out.z, 0, out.x), lp = X(px, 0, pz);
      for (let k = 0; k < 3; k++) { const o = out.clone().scale(legR + 1.3).addScaled(sd, (k - 1) * 1.3); pipe(d, v3(lp.x + o.x, y - 9, lp.z + o.z), v3(lp.x + o.x, SEA - 10, lp.z + o.z), 0.42, k === 1 ? PAINT[1] : STEEL[2], 8);
        for (let yy = SEA + 6; yy < y - 12; yy += 10) d.at(lp.x + o.x, yy, lp.z + o.z, QX(90)).cyl(0.62, 0.62, 0.5, 8, STEEL[2], false); }
      const bl = v3(lp.x, 0, lp.z).addScaled(out, legR + 4).addScaled(sd, 4); d.at(bl.x, SEA + 3.3, bl.z, q).box(7, 0.35, 4.5, GRATE);
      for (const s of [-1, 1]) { const f = bl.clone().addScaled(sd, s * 3.2).addScaled(out, 2.1); d.at(f.x, SEA + 2, f.z, QX(90)).cyl(0.45, 0.45, 5, 8, [0.05, 0.05, 0.05, 0]); }
      railing(d, [bl.clone().addScaled(sd, -3.5).addScaled(out, -2.2), bl.clone().addScaled(sd, 3.5).addScaled(out, -2.2)].map(p => v3(p.x, SEA + 3.5, p.z)), 1, 2, YEL);
      const lb = bl.clone().addScaled(out, -2.3); ladder(d, v3(lb.x, SEA + 3.5, lb.z), v3(lb.x, y - 10.5, lb.z), 0.7, sd, YEL); }
    // decks: the main deck, the cellar deck below it, the girder frame between them
    g.mat(0.55, 0.6, 1, 0).at(c.x, c.y, c.z, q).bbox(sx, 5, sz, 0.8, STEEL[0]);
    { const p9 = X(0, -9, 0); g.at(p9.x, p9.y, p9.z, q).bbox(sx - 8, 3, sz - 8, 0.5, STEEL[3]); }
    { const hx = sx / 2 - 4.5, hz = sz / 2 - 4.5, nxp = Math.max(2, Math.round(sx / 9)), nzp = Math.max(2, Math.round(sz / 9));
      for (let k = 0; k <= nxp; k++) for (const s of [-1, 1]) { const u = -hx + 2 * hx * k / nxp; bar(d, X(u, -7.5, s * hz), X(u, -2.5, s * hz), 0.5, 0.5, STEEL[1]); if (k < nxp) bar(d, X(u, -7.5, s * hz), X(-hx + 2 * hx * (k + 1) / nxp, -2.5, s * hz), 0.35, 0.35, STEEL[1]); }
      for (let k = 0; k <= nzp; k++) for (const s of [-1, 1]) { const u = -hz + 2 * hz * k / nzp; bar(d, X(s * hx, -7.5, u), X(s * hx, -2.5, u), 0.5, 0.5, STEEL[1]); }
      railing(d, [X(-hx, -7.5, -hz), X(hx, -7.5, -hz), X(hx, -7.5, hz), X(-hx, -7.5, hz)], 1.05, 2.6, YEL, true); }
    { const hx = sx / 2 - 0.3, hz = sz / 2 - 0.3; railing(d, [X(-hx, 2.5, -hz), X(hx, 2.5, -hz), X(hx, 2.5, hz), X(-hx, 2.5, hz)], 1.1, 2.4, YEL, true);
      for (const [ax, az, bx, bz] of [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz]]) bar(d, X(ax, 2.65, az), X(bx, 2.65, bz), 0.06, 0.3, YEL); // toe boards
      stair(d, X(-hx + 3, -7.5, hz - 2), X(-hx + 3 + 7.5, 2.5, hz - 2), 1.2, YEL); }
    for (let k = 0; k < 12; k++) { const u = (k + 0.5) / 12, p = X(-sx / 2 + u * sx, -2, sz / 2 + 0.2); gl.at(p.x, p.y, p.z, q).box(0.6, 0.6, 0.6, LAMP); const p2 = X(-sx / 2 + u * sx, -2, -sz / 2 - 0.2); gl.at(p2.x, p2.y, p2.z, q).box(0.6, 0.6, 0.6, LAMP); }
    // floodlights on poles at the corners, aimed in over the deck: the beams show in the rain
    for (const [fx, fz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const base = X(fx * (sx / 2 - 2), 2.5, fz * (sz / 2 - 2)), top = base.clone(); top.y += 13;
      d.at(base.x, base.y + 6.5, base.z, QX(90)).cyl(0.22, 0.3, 13, 8, STEEL[2], false);
      const aim = X(-fx * sx * 0.2, -14, -fz * sz * 0.2).sub(top).normalize(), qa = qLook(aim);
      d.at(top.x, top.y, top.z, qa).box(1.3, 0.9, 0.9, STEEL[3]); const lf = top.clone().addScaled(aim, 0.5); gl.at(lf.x, lf.y, lf.z, qa).box(1.1, 0.7, 0.1, [1, 0.92, 0.75, 1]);
      beamCone(beams, top.clone().addScaled(aim, 0.6), aim, 46, 12, [1, 0.86, 0.62]); lights.push({ p: lf, c: [2.6, 2.3, 1.8], s: 2.6 }); }
    // modules: accommodation and plant rooms with rows of windows, plant on their roofs, roof railings
    const block = (bx, bz, w, h, dd, col, win = true) => { const p = X(bx, 2.5 + h / 2, bz); g.mat(0.35, 0.6, 1, 0).at(p.x, p.y, p.z, q).bbox(w, h, dd, 0.4, col);
      if (win) for (let f = 0; f < Math.floor(h / 4); f++) for (const side of [1, -1]) { const nW = Math.max(2, Math.floor(w / 2.8));
        for (let k = 0; k < nW; k++) { const u = (k + 0.5) / nW, wp = X(bx - w / 2 + u * w, 2.5 + 2.2 + f * 4, bz + side * (dd / 2 + 0.06)), on = r() < 0.6;
          if (on) gl.at(wp.x, wp.y, wp.z, q).box(1.6, 1.1, 0.12, R2() < 0.25 ? [0.55, 0.8, 1, 1] : LAMP); else d.mat(0.2, 0.12, 1, 0).at(wp.x, wp.y, wp.z, q).box(1.6, 1.1, 0.12, DARKWIN).mat(0.5, 0.6, 1, 0); } }
      const top = 2.5 + h;
      for (let k = 0; k < 3; k++) { const pp = X(bx + (R2() - 0.5) * w * 0.6, top + 1.1, bz + (R2() - 0.5) * dd * 0.5); d.at(pp.x, pp.y, pp.z, q).bbox(2.2 + R2() * 3, 2.2, 2 + R2() * 2, 0.2, STEEL[2]); }
      { const vp = X(bx + w * 0.3, top + 2.5, bz - dd * 0.25); d.at(vp.x, vp.y, vp.z, QX(90)).cyl(0.45, 0.45, 5, 8, STEEL[0], true); }
      railing(d, [X(bx - w / 2 + 0.3, top, bz - dd / 2 + 0.3), X(bx + w / 2 - 0.3, top, bz - dd / 2 + 0.3), X(bx + w / 2 - 0.3, top, bz + dd / 2 - 0.3), X(bx - w / 2 + 0.3, top, bz + dd / 2 - 0.3)], 1, 2.5, YEL, true);
      if (h > 9) stair(d, X(bx + w / 2 + 1, 2.5, bz - dd / 2 + 2), X(bx + w / 2 + 1, top, bz + Math.min(dd / 2 - 2, h * 0.9 - dd / 2 + 2)), 1, YEL); };
    // containers and deck clutter in a free corner of the deck
    const containers = (bx, bz, n) => { for (let k = 0; k < n; k++) { const ox = bx + (k % 3) * 2.8, oz = bz + Math.floor(k / 3) * 6.6, hh = 1 + (R2() < 0.4 ? 1 : 0);
      for (let m = 0; m < hh; m++) { const p = X(ox, 2.5 + 1.3 + m * 2.6, oz); d.mat(0.35, 0.6, 1, 16).at(p.x, p.y, p.z, q).box(2.45, 2.6, 6.1, CONT[Math.floor(R2() * CONT.length)]); } } d.mat(0.5, 0.6, 1, 0); };
    if (kind === 'rig') {
      block(-sx * 0.22, sz * 0.2, sx * 0.35, 16, sz * 0.3, PAINT[seed % 5]); block(sx * 0.25, -sz * 0.25, sx * 0.25, 10, sz * 0.25, PAINT[(seed + 2) % 5]);
      // the derrick: a tapered four-legged tower on the drill floor, battens and X-bracing, the crown block on top
      const d0 = X(sx * 0.12, 2.5, -sz * 0.05), H = 70, DP = (k, u) => { const w = 6 - 4 * u; return new Vec3((k & 1 ? 1 : -1) * w, H * u, (k & 2 ? 1 : -1) * w).applyQuat(q).add(d0); };
      g.at(d0.x, d0.y + 1.5, d0.z, q).bbox(16, 3, 16, 0.3, STEEL[3]);
      for (let k = 0; k < 4; k++) bar(g, DP(k, 0), DP(k, 1), 0.7, 0.7, [0.75, 0.62, 0.18, 0]);
      const order = [0, 1, 3, 2];
      for (let j = 0; j < 10; j++) { const u0 = j / 10, u1 = (j + 1) / 10; for (let e = 0; e < 4; e++) { const A = order[e], B = order[(e + 1) % 4]; bar(d, DP(A, u1), DP(B, u1), 0.35, 0.35, [0.75, 0.62, 0.18, 0]); bar(d, DP(A, u0), DP(B, u1), 0.25, 0.25, [0.75, 0.62, 0.18, 0]); } }
      const d1 = d0.clone(); d1.y += H; g.at(d1.x, d1.y + 1.5, d1.z, q).bbox(5, 3, 5, 0.3, STEEL[2]);
      { const mb = X(sx * 0.12, 2.5 + H * 0.55, -sz * 0.05); d.at(mb.x, mb.y, mb.z, q).box(6.5, 0.3, 6.5, GRATE); }
      gl.at(d1.x, d1.y + 3.6, d1.z).box(1.4, 1.4, 1.4, RED); lights.push({ p: v3(d1.x, d1.y + 3.6, d1.z), c: [3, 0.3, 0.2], s: 5, blink: 0.9 });
      // pipe rack beside the derrick: racked drill pipe
      { const pr = X(sx * 0.12 + 11, 2.5, -sz * 0.05); for (let k = 0; k < 14; k++) { const p = X(sx * 0.12 + 9 + (k % 7) * 0.7, 3.2 + Math.floor(k / 7) * 0.7, -sz * 0.05); d.at(p.x, p.y, p.z, q).cyl(0.3, 0.3, 14, 6, [0.4, 0.38, 0.35, 0], true); } void pr; }
      // flare boom out over the sea, burning at its tip
      const fb0 = X(sx / 2 - 4, 6, sz * 0.3), fb1 = X(sx / 2 + 46, 34, sz * 0.3); truss(g, fb0, fb1, 4, 6, [0.5, 0.5, 0.52, 0]); flares.push({ p: fb1.clone().add(v3(0, 3, 0)), s: 1 + r() * 0.5 });
      d.at(fb1.x, fb1.y + 1.2, fb1.z, QX(90)).cyl(0.9, 1.1, 3, 10, [0.12, 0.11, 0.1, 1], true);
      // crane: pedestal, cab, boom and a hook on its wire
      const cb = X(-sx * 0.38, 2.5, -sz * 0.35); g.at(cb.x, cb.y + 9, cb.z, QX(90)).cyl(2, 2, 18, 12, PAINT[1], true); const tip = X(-sx * 0.38 - 30, 30, -sz * 0.35 + 18); truss(g, v3(cb.x, cb.y + 18, cb.z), tip, 2.4, 4, PAINT[1]);
      { const cab = X(-sx * 0.38 + 2.5, 2.5 + 20, -sz * 0.35); d.at(cab.x, cab.y, cab.z, q).bbox(4, 3.2, 3.2, 0.3, PAINT[1]); const cw = X(-sx * 0.38 + 4.55, 2.5 + 20.4, -sz * 0.35); gl.at(cw.x, cw.y, cw.z, q).box(0.1, 1.3, 2.4, [0.6, 0.75, 0.85, 1]);
        pipe(d, tip, v3(tip.x, tip.y - 18, tip.z), 0.06, STEEL[3], 4); d.at(tip.x, tip.y - 18.6, tip.z).box(0.8, 1.2, 0.8, PAINT[0]); }
      for (let k = 0; k < 3; k++) { const p = X(sx * 0.3 - k * 9, 2.5 + 7, sz * 0.32); g.at(p.x, p.y, p.z, QX(90)).cyl(3.6, 3.6, 14, 16, [0.7, 0.7, 0.68, 0], true); for (const yy of [-4, 0, 4]) d.at(p.x, p.y + yy, p.z, QX(90)).cyl(3.72, 3.72, 0.35, 16, [0.55, 0.55, 0.52, 0], false); }
      containers(-sx * 0.05, -sz * 0.42, 5);
    } else if (kind === 'station') {
      for (let k = 0; k < 3; k++) { const p = X(-sx * 0.28 + k * sx * 0.24, 2.5, -sz * 0.2 + (k % 2) * 8), R = 9 + r() * 6; g.mat(0.2, 0.25, 1, 0).at(p.x, p.y, p.z, QX(-90)).lathe([[R, 0], [R * 0.96, R * 0.3], [R * 0.75, R * 0.68], [R * 0.4, R * 0.92], [0.2, R]], 24, [0.82, 0.84, 0.86, 0]);
        for (let m = 0; m < 6; m++) { const aa = m / 6 * Math.PI * 2, wp = new Vec3(Math.cos(aa) * R * 0.97, 1.6, Math.sin(aa) * R * 0.97).add(p); gl.at(wp.x, wp.y, wp.z).box(1.6, 0.7, 1.6, [0.55, 0.85, 1, 1]); }
        for (const hh of [0.3, 0.62]) { const rr = R * (hh < 0.5 ? 0.97 : 0.8); d.at(p.x, p.y + R * hh, p.z, QX(90)).torus(rr, 0.18, 32, 4, [0.6, 0.62, 0.64, 0]); } // V11: ribs round the domes
        d.at(p.x, p.y + R + 0.6, p.z, QX(90)).cyl(1.2, 1.2, 1.2, 10, STEEL[2], true); }
      bar(d, X(-sx * 0.28, 4, -sz * 0.2), X(sx * 0.2, 4, -sz * 0.2 + 8), 2.6, 2.6, [0.72, 0.74, 0.76, 0]); // a covered walkway between the domes
      block(sx * 0.25, sz * 0.18, sx * 0.3, 14, sz * 0.4, [0.78, 0.8, 0.82, 0]); block(-sx * 0.2, sz * 0.3, sx * 0.3, 8, sz * 0.22, [0.2, 0.36, 0.5, 0]);
      const hp = X(sx * 0.28, 2.6, -sz * 0.3); g.at(hp.x, hp.y + 0.4, hp.z, QX(90)).cyl(12, 12, 0.8, 32, [0.22, 0.24, 0.26, 0]); gl.at(hp.x, hp.y + 0.9, hp.z, QX(90)).torus(10.5, 0.25, 40, 4, [0.4, 1, 0.6, 1]);
      { // V11: the helideck's markings (a yellow aiming circle, a white H) and its safety net
        d.at(hp.x, hp.y + 0.85, hp.z, QX(90)).torus(6.2, 0.35, 32, 3, [0.9, 0.75, 0.15, 0]);
        for (const [bx2, bz2, w2, d2] of [[-1.6, 0, 0.7, 5], [1.6, 0, 0.7, 5], [0, 0, 3.2, 0.7]]) { const p = X(sx * 0.28 + bx2, 2.6 + 0.86, -sz * 0.3 + bz2); d.at(p.x, p.y, p.z, q).box(w2, 0.04, d2, [0.9, 0.9, 0.88, 0]); }
        d.at(hp.x, hp.y + 0.2, hp.z, QX(90)).torus(12.8, 0.18, 40, 3, YEL); }
      // the mast: a lattice tower with antennas and dishes
      const mast = X(-sx * 0.42, 2.5, sz * 0.42); lattice(g, mast, 58, 3.2, [0.85, 0.85, 0.85, 0], 0.35, 4);
      for (const [hh, ang] of [[28, 0.6], [40, 2.4]]) { const dp = mast.clone().add(v3(Math.cos(ang) * 2, hh, Math.sin(ang) * 2)); d.at(dp.x, dp.y, dp.z, QY(-ang * 57.3 + 90).multiply(QX(-10))).lathe([[0.2, -0.6], [1.4, -0.2], [2.2, 0.5]], 16, [0.88, 0.88, 0.86, 0]); }
      pipe(d, v3(mast.x, mast.y + 58, mast.z), v3(mast.x, mast.y + 64, mast.z), 0.12, STEEL[2], 4);
      gl.at(mast.x, mast.y + 61, mast.z).box(1.2, 1.2, 1.2, RED); lights.push({ p: v3(mast.x, mast.y + 61, mast.z), c: [3, 0.3, 0.2], s: 4, blink: 0.7 });
      const dp = X(sx * 0.42, 2.5, sz * 0.4); g.at(dp.x, dp.y + 6, dp.z, QX(90)).cyl(1.2, 1.4, 12, 10, [0.7, 0.7, 0.7, 0], false);
      g.at(dp.x, dp.y + 14, dp.z, QX(-50).multiply(QY(30))).lathe([[0.4, -2.6], [5, -1.2], [8, 1.2]], 24, [0.86, 0.86, 0.85, 0]);
      containers(-sx * 0.42, -sz * 0.02, 4);
    } else {
      for (let k = 0; k < 6; k++) { const p = X(-sx * 0.35 + (k % 3) * sx * 0.25, 2.5 + 9, -sz * 0.18 + Math.floor(k / 3) * sz * 0.36); g.mat(0.5, 0.5, 1, 0).at(p.x, p.y, p.z, QX(90)).cyl(9, 9, 18, 20, [0.72, 0.72, 0.7, 0], true);
        g.at(p.x, p.y + 9, p.z, QX(-90)).lathe([[9, 0], [7.5, 1.6], [4, 2.6], [0.2, 3]], 20, [0.66, 0.66, 0.64, 0]); // V11: domed roofs
        for (const yy of [-5, 0, 5]) d.at(p.x, p.y + yy, p.z, QX(90)).cyl(9.12, 9.12, 0.4, 20, [0.58, 0.58, 0.56, 0], false);
        const lb = new Vec3(9.3, 0, 0).applyQuat(q).add(p); ladder(d, v3(lb.x, 2.5, lb.z), v3(lb.x, p.y + 11, lb.z), 0.7, new Vec3(0, 0, 1).applyQuat(q), YEL);
        if (k % 3 < 2) { const a2 = X(-sx * 0.35 + (k % 3) * sx * 0.25, 2.5 + 15, -sz * 0.18 + Math.floor(k / 3) * sz * 0.36), b2 = X(-sx * 0.35 + (k % 3 + 1) * sx * 0.25, 2.5 + 15, -sz * 0.18 + Math.floor(k / 3) * sz * 0.36); pipe(d, a2, b2, 0.6, PAINT[k % 2 ? 1 : 3], 8); } }
      for (const zz of [-sz * 0.42, sz * 0.42]) { beam(g, X(-sx / 2, 6, zz), X(sx / 2, 6, zz), 3, 3, PAINT[0]); for (let k = 0; k < 4; k++) pipe(d, X(-sx / 2, 7.9, zz - 1.2 + k * 0.8), X(sx / 2, 7.9, zz - 1.2 + k * 0.8), 0.32, k % 2 ? STEEL[2] : PAINT[1], 8);
        for (let k = 0; k <= 8; k++) bar(d, X(-sx / 2 + k * sx / 8, 2.5, zz), X(-sx / 2 + k * sx / 8, 6, zz), 0.4, 0.4, STEEL[1]); }
      block(sx * 0.36, 0, sx * 0.2, 12, sz * 0.5, PAINT[3]);
      const st = X(-sx * 0.42, 2.5, sz * 0.42); g.at(st.x, st.y + 25, st.z, QX(90)).cyl(3, 2.5, 50, 14, [0.35, 0.35, 0.36, 0], false); flares.push({ p: v3(st.x, st.y + 52, st.z), s: 0.6 });
      d.at(st.x, st.y + 49.5, st.z, QX(90)).cyl(2.6, 2.6, 1.2, 14, [0.1, 0.09, 0.08, 1], false);
      for (let yy = 8; yy < 46; yy += 9) d.at(st.x, st.y + yy, st.z, QX(90)).torus(3.05 - yy * 0.01, 0.25, 20, 4, STEEL[3]);
    }
    // lifeboats on davits along one long side, facing the sea
    for (let k = 0; k < (sx > 90 ? 3 : 2); k++) { const lb = X(-sx * 0.3 + k * 9, -1.2, sz / 2 + 2.6);
      d.at(lb.x, lb.y, lb.z, q.clone().multiply(QY(90))).lathe([[0.2, -4.2], [1.3, -3.6], [1.55, -1.5], [1.55, 1.8], [1.1, 3.8], [0.2, 4.4]], 12, PAINT[0], 1, 0.85);
      for (const s of [-1, 1]) { const da = X(-sx * 0.3 + k * 9 + s * 3, 2.5, sz / 2 - 0.5), db = X(-sx * 0.3 + k * 9 + s * 3, 2.5 + 2.8, sz / 2 + 2.6); bar(d, da, db, 0.3, 0.3, STEEL[2]); pipe(d, db, X(-sx * 0.3 + k * 9 + s * 3, 0.4, sz / 2 + 2.6), 0.05, STEEL[3], 4); } }
    // the installation's items: main forms, detail, lamps; bounds round all of it
    const bb = g.bounds(), bs = { x: bb.c.x, y: bb.c.y, z: bb.c.z, r: bb.r + 4 };
    const base = seaSteel(gfx, g, SEA + 9.5, { visible: true, cast: true, bs, uniforms: SU, tag: 'platform' }), det = seaSteel(gfx, d, SEA + 9.5, { visible: true, cast: true, bs, uniforms: SU, tag: 'platform detail' }); // legs and landings with the splash zone, topsides without
    const lit = { mesh: gfx.mesh(gl.build()), prog: 'pbrStruct', visible: true, bs };
    items.push(...base, ...det, lit); plats.push({ det, bs, on: true });
  };
  // places a platform beside sample i at lateral offset `off` (+ right), checks the whole footprint is clear
  const placed = [], placePlat = (i, off, y, sx, sz, a, kind, seed) => {
    const p = beside(i, off); for (let tries = 0; tries < 8; tries++) {
      const q = QY(a); if (okBox(v3(p.x, y - 1, p.z), sx + 10, 14, sz + 10, q, 8) && okBox(v3(p.x, y + 40, p.z), sx, 70, sz, q, 8) && okBox(v3(p.x, (y + SEA) / 2, p.z), sx, y - SEA, sz, q, 8)) {
        platform(p.x, p.z, y, sx, sz, a, kind, seed); placed.push({ x: p.x, z: p.z, y, r: Math.hypot(sx, sz) / 2 }); return p; }
      p.x += Math.sign(off) * t.bin[i].x * 25; p.z += Math.sign(off) * t.bin[i].z * 25; }
    return null;
  };
  const heading = i => Math.atan2(t.tan[i].x, t.tan[i].z) * 57.3;
  placePlat(mid('start'), -95, 32, 120, 90, heading(mid('start')), 'station', 3); // research station by the start straight
  placePlat(at('start')[8], 120, 26, 70, 60, heading(0) + 20, 'plant', 5);
  placePlat(mid('skim'), 110, 34, 90, 70, heading(mid('skim')) + 10, 'rig', 7);
  placePlat(at('swell')[30], -120, 30, 90, 80, heading(at('swell')[30]), 'rig', 11);
  placePlat(mid('flare'), 140, 36, 100, 80, heading(mid('flare')) + 30, 'rig', 13);
  placePlat(mid('return'), 130, 30, 110, 80, heading(mid('return')) - 15, 'plant', 17);
  placePlat(at('hook')[20], 150, 40, 80, 70, heading(at('hook')[20]), 'station', 19);
  // the skim platform: its deck spans the corridor above the wave-skimming section, legs well clear on both sides
  const skimDeck = (() => { const i = at('skim')[Math.floor(at('skim').length * 0.62)], p = t.pos[i], y = p.y + t.h[i] + 16, W = 2 * t.w[i] + 60, a = heading(i), q = QY(a), g = stCh.get(i, 'stl'), X = (lx, ly, lz) => new Vec3(lx, ly, lz).applyQuat(q).add(v3(p.x, y, p.z));
    g.mat(0.55, 0.6, 1, 0).at(p.x, y, p.z, q).bbox(W, 6, 50, 0.8, STEEL[0]); g.at(p.x, y + 8, p.z, q).bbox(W * 0.6, 10, 30, 0.5, PAINT[0]);
    for (const s of [-1, 1]) for (const zz of [-18, 18]) { const lp = new Vec3(s * (W / 2 - 6), 0, zz).applyQuat(q).add(p), top = lp.clone(); top.y = y; const foot = lp.clone(); foot.y = SEA - 12;
      g.at(lp.x, (top.y + foot.y) / 2, lp.z, QX(90)).cyl(4, 4.6, top.y - foot.y, 18, [0.42, 0.4, 0.36, 0], false); g.at(lp.x, SEA + 1.2, lp.z, QX(90)).cyl(6.5, 6.5, 6, 18, [0.62, 0.32, 0.12, 0]); foamSrc.push({ x: lp.x, z: lp.z, r: 6.5, k: 1 });
      for (let yy = SEA + 10; yy < y - 6; yy += 7) g.at(lp.x, yy, lp.z, QX(90)).cyl(4.35, 4.35, 0.6, 18, LEGC, false); }
    for (const s of [-1, 1]) { pipe(g, X(s * (W / 2 - 6), SEA + 10 - y, -18), X(s * (W / 2 - 6), SEA + 10 - y, 18), 0.9, STEEL[1], 10); pipe(g, X(s * (W / 2 - 6), SEA + 10 - y, -18), X(s * (W / 2 - 6), -6, 18), 0.6, STEEL[1], 8); pipe(g, X(s * (W / 2 - 6), SEA + 10 - y, 18), X(s * (W / 2 - 6), -6, -18), 0.6, STEEL[1], 8); }
    // V11: the deck's underside is a grid of girders (seen from below as the course passes under it), railings on top
    for (let k = -4; k <= 4; k++) bar(g, X(-W / 2 + 2, -3.8, k * 5.5), X(W / 2 - 2, -3.8, k * 5.5), 0.6, 1.4, STEEL[3]);
    for (let k = 0; k <= 10; k++) bar(g, X(-W / 2 + 2 + k * (W - 4) / 10, -3.6, -24), X(-W / 2 + 2 + k * (W - 4) / 10, -3.6, 24), 0.5, 1, STEEL[3]);
    railing(g, [X(-W / 2 + 0.4, 3, -24.6), X(W / 2 - 0.4, 3, -24.6), X(W / 2 - 0.4, 3, 24.6), X(-W / 2 + 0.4, 3, 24.6)], 1.1, 2.4, YEL, true);
    for (let k = 0; k < 10; k++) { const lp = new Vec3(-W / 2 + (k + 0.5) * W / 10, -3.4 - 1.2, 0).applyQuat(q).add(v3(p.x, y, p.z)); bigLit.at(lp.x, lp.y, lp.z, q).box(4, 0.3, 1.5, [1, 0.85, 0.6, 1]); beamCone(beams, lp.clone().add(v3(0, -0.3, 0)), v3(0, -1, 0), 26, 7, [1, 0.85, 0.6]); }
    return { p: v3(p.x, y, p.z) }; })();
  // the narrows: twin platforms either side and a deck over the corridor, carried by the two columns that stand in it
  const narrowsDeck = (() => { const cols = t.obstacles.filter(o => o.type === 'vbeam'), i = cols.length ? cols[0].i : at('narrows')[20], p = cols.length ? cols.reduce((a, o) => a.add(t.pos[o.i]), v3(0, 0, 0)).scale(1 / cols.length) : t.pos[i];
    const L = cols.length > 1 ? t.pos[cols[0].i].dist(t.pos[cols[cols.length - 1].i]) + 70 : 120, y = Math.max(...cols.map(o => t.pos[o.i].y + t.h[o.i])) + 14, a = heading(i), q = QY(a), W = 2 * t.w[i] + 50, g = stCh.get(i, 'stl'), X = (lx, ly, lz) => new Vec3(lx, ly, lz).applyQuat(q).add(v3(p.x, y, p.z));
    g.mat(0.55, 0.6, 1, 0).at(p.x, y, p.z, q).bbox(W, 6, L, 0.8, STEEL[3]); g.at(p.x, y + 7, p.z, q).bbox(W * 0.5, 8, L * 0.5, 0.5, PAINT[3]);
    for (const o of t.obstacles) if (o.type === 'vbeam') { const c = P(t, o.i, o.x, 0), topY = y - 3, botY = SEA - 10, gTop = c.y + t.h[o.i] + 4, gBot = c.y - t.h[o.i] - 4;
      g.mat(0.5, 0.6, 1, 0).at(c.x, (topY + gTop) / 2, c.z, QX(90)).cyl(o.r * 0.98, o.r * 1.1, topY - gTop, 18, [0.42, 0.4, 0.36, 0], false).at(c.x, (gBot + botY) / 2, c.z, QX(90)).cyl(o.r * 1.15, o.r * 1.3, gBot - botY, 18, [0.42, 0.4, 0.36, 0], false).at(c.x, SEA + 1.2, c.z, QX(90)).cyl(o.r * 1.9, o.r * 1.9, 6, 18, [0.62, 0.32, 0.12, 0]);
      foamSrc.push({ x: c.x, z: c.z, r: o.r * 1.9, k: 1 }); }
    for (let k = -3; k <= 3; k++) bar(g, X(-W / 2 + 2, -3.8, k * L / 7), X(W / 2 - 2, -3.8, k * L / 7), 0.6, 1.4, STEEL[1]);
    railing(g, [X(-W / 2 + 0.4, 3, -L / 2 + 0.4), X(W / 2 - 0.4, 3, -L / 2 + 0.4), X(W / 2 - 0.4, 3, L / 2 - 0.4), X(-W / 2 + 0.4, 3, L / 2 - 0.4)], 1.1, 2.4, YEL, true);
    for (let k = 0; k < 6; k++) { const lp = X(-W / 2 + (k + 0.5) * W / 6, -4.6, 0); bigLit.at(lp.x, lp.y, lp.z, q).box(3, 0.3, 1.2, [1, 0.85, 0.6, 1]); beamCone(beams, lp.clone().add(v3(0, -0.3, 0)), v3(0, -1, 0), 24, 6, [1, 0.85, 0.6]); }
    return { p: v3(p.x, y, p.z), a }; })();
  placePlat(at('narrows')[10], 115, 44, 120, 90, heading(at('narrows')[10]), 'plant', 23);
  placePlat(at('narrows')[60], -120, 46, 110, 90, heading(at('narrows')[60]), 'rig', 29);
  // truss bridges: from the narrows platforms to the bridge-straight platforms, crossing over the course
  const bridgeA = placePlat(at('bridge')[10], -130, 52, 90, 80, heading(at('bridge')[10]), 'station', 31), bridgeB = placePlat(at('island')[6], 140, 50, 90, 70, heading(at('island')[6]), 'plant', 37);
  const bridgeLine = (a, b, y) => { if (!a || !b) return; const A = v3(a.x, y, a.z), B = v3(b.x, y, b.z), n = 24; for (let k = 0; k <= n; k++) { const p = new Vec3().lerpVectors(A, B, k / n); if (!clear.sphere(p, 10, 6)) return; }
    const g = stCh.get(nearI(new Vec3().lerpVectors(A, B, 0.5)), 'stl'); truss(g.mat(0.6, 0.5, 1, 0), A, B, 9, 14, [0.36, 0.35, 0.34, 0]); const d = new Vec3().subVectors(B, A);
    g.at((A.x + B.x) / 2, y - 4.2, (A.z + B.z) / 2, qLook(d)).box(4, 0.3, d.len(), GRATE); // V11: a walkway inside the truss
    for (let k = 1; k < 20; k++) { const p = new Vec3().lerpVectors(A, B, k / 20); bigLit.at(p.x, p.y + 4.8, p.z, qLook(d)).box(0.5, 0.3, 2, LAMP); } };
  bridgeLine(bridgeA, narrowsDeck.p, 96); bridgeLine(bridgeA, bridgeB, 92);
  { const a = placed[0], b = placed[6]; if (a && b) bridgeLine(v3(a.x, 0, a.z), v3(b.x, 0, b.z), 70); }

  // ---------------------------------------------------------------- islands, a lighthouse, buoys
  const island = (x, z, R, H, seed) => {
    const g = new Geo(), seg = 72, rings = 18, rows = [];
    for (let j = 0; j <= rings; j++) { const row = [], u = j / rings; for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, n = fbm2(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed, 4), rr = R * (1 - u) * (0.75 + 0.5 * n);
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, cliff = Math.min(1, u * 6), hh = SEA - 8 + (H * (0.35 + 0.65 * Math.pow(u, 0.6)) * cliff) * (0.7 + 0.6 * ridged2(px * 0.006, pz * 0.006, seed, 4));
      const grass = u > 0.25 ? [0.12, 0.17, 0.09, 0] : [0.15, 0.14, 0.13, 0]; row.push(g.mat(0, 0.92, 1, 13).v(px, hh, pz, 0, 1, 0, grass)); } rows.push(row); }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) g.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
    // normals from the faces
    const NN = new Float32Array(g.p.length); for (let k = 0; k < g.i.length; k += 3) { const a = g.i[k] * 3, b = g.i[k + 1] * 3, c = g.i[k + 2] * 3, ux = g.p[b] - g.p[a], uy = g.p[b + 1] - g.p[a + 1], uz = g.p[b + 2] - g.p[a + 2], vx = g.p[c] - g.p[a], vy = g.p[c + 1] - g.p[a + 1], vz = g.p[c + 2] - g.p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const m of [a, b, c]) { NN[m] += nx; NN[m + 1] += ny; NN[m + 2] += nz; } }
    for (let m = 0; m < NN.length; m += 3) { const l = Math.hypot(NN[m], NN[m + 1], NN[m + 2]) || 1, s = NN[m + 1] < 0 ? -1 : 1; g.n[m] = NN[m] / l * s; g.n[m + 1] = NN[m + 1] / l * s; g.n[m + 2] = NN[m + 2] / l * s; }
    return g;
  };
  const isl = [];
  { // one inside the sweeper around the island turn, more out to sea, kept clear of the course
    const i = mid('island'), p = t.pos[i], s = Math.sign(t.kLat[i]) || 1, ctr = beside(i, s * 520), spots = [[ctr.x, ctr.z, 260, 140], [cx + 2600, cz + 1800, 520, 210], [cx - 3200, cz - 900, 700, 260], [cx + 900, cz - 3300, 380, 150], [cx - 2100, cz + 3600, 460, 190], [cx + 3800, cz - 1600, 300, 120]];
    void p; spots.forEach(([x, z, R, H], k) => { let ok = true; for (let j = 0; j < N; j += 4) if (Math.hypot(t.pos[j].x - x, t.pos[j].z - z) < R * 1.25 + t.w[j] + 40) { ok = false; break; } if (!ok) return;
      const ig = island(x, z, R, H, 40 + k * 7), b = ig.bounds(); items.push({ mesh: gfx.mesh(ig.build()), prog: 'v11coast', visible: true, cast: k === 0, uniforms: SU, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r } }); isl.push({ x, z, R, H }); });
  }
  const beacon = { p: null, a: 0 };
  if (isl.length) { const I = isl[0], b = v3(I.x, SEA + I.H * 0.95, I.z); big.mat(0.2, 0.6, 1, DET.struct).at(b.x, b.y + 16, b.z, QX(90)).cyl(4.2, 3, 32, 20, [0.88, 0.88, 0.86, 0], false);
    for (let k = 0; k < 4; k++) big.at(b.x, b.y + 4 + k * 8, b.z, QX(90)).cyl(4.3 - k * 0.3, 4.3 - k * 0.3, 2.4, 20, [0.75, 0.12, 0.1, 0], false);
    big.mat(0.8, 0.3, 1, DET.struct).at(b.x, b.y + 33.5, b.z, QX(90)).cyl(3.4, 3.4, 3, 16, [0.2, 0.2, 0.22, 0], true); bigLit.at(b.x, b.y + 36, b.z, QX(90)).cyl(2.6, 2.6, 3.6, 16, [1, 0.95, 0.75, 1]);
    // V11: the gallery round the lantern, its railing, the lantern's glazing bars and roof, the keeper's house at the foot
    steel.mat(0.5, 0.5, 1, 0).at(b.x, b.y + 32.2, b.z, QX(90)).cyl(5.2, 5.2, 0.5, 24, [0.2, 0.2, 0.22, 0], true);
    { const pts = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; pts.push(v3(b.x + Math.cos(a) * 5, b.y + 32.45, b.z + Math.sin(a) * 5)); } railing(steel, pts, 1.1, 1.4, [0.2, 0.2, 0.22, 0]); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; bar(steel, v3(b.x + Math.cos(a) * 2.7, b.y + 34.2, b.z + Math.sin(a) * 2.7), v3(b.x + Math.cos(a) * 2.7, b.y + 37.8, b.z + Math.sin(a) * 2.7), 0.12, 0.12, [0.2, 0.2, 0.22, 0]); }
    steel.at(b.x, b.y + 38.4, b.z, QX(-90)).lathe([[3.1, 0], [2.4, 1], [0.6, 2], [0.1, 2.6]], 16, [0.18, 0.2, 0.18, 0]);
    steel.at(b.x + 9, b.y + 2.5, b.z + 3, QY(25)).bbox(9, 5, 7, 0.3, [0.85, 0.84, 0.8, 0]); steel.at(b.x + 9, b.y + 5.6, b.z + 3, QY(25)).box(9.6, 0.6, 7.6, [0.5, 0.14, 0.1, 0]);
    beacon.p = v3(b.x, b.y + 36, b.z); }
  // buoys along the wave-skimming sections, just outside the corridor
  for (const tag of ['skim', 'swell']) { const ids = at(tag); for (let k = 0; k < ids.length; k += 18) for (const s of [-1, 1]) { const i = ids[k], b = beside(i, s * (t.w[i] + 16)); b.y = SEA + 1; const g = stCh.get(i, 'stl'), col = s > 0 ? [0.75, 0.1, 0.08, 0] : [0.1, 0.55, 0.2, 0];
    // V11: a navigation buoy: a float with a white band, a cage on top carrying the lamp, a radar reflector
    g.mat(0.4, 0.6, 1, 0).at(b.x, b.y, b.z, QX(-90)).lathe([[0.3, -2.4], [1.7, -1.6], [1.8, 0.4], [1.4, 1.6], [0.5, 2]], 14, col);
    g.at(b.x, b.y + 0.5, b.z, QX(90)).cyl(1.83, 1.83, 0.6, 14, [0.85, 0.85, 0.82, 0], false);
    for (let m = 0; m < 3; m++) { const a = m / 3 * Math.PI * 2; bar(g, v3(b.x + Math.cos(a) * 1.1, b.y + 1.8, b.z + Math.sin(a) * 1.1), v3(b.x + Math.cos(a) * 0.35, b.y + 5.4, b.z + Math.sin(a) * 0.35), 0.12, 0.12, col); }
    g.at(b.x, b.y + 4.2, b.z, QY(45)).box(0.7, 0.7, 0.7, [0.7, 0.7, 0.7, 0]);
    foamSrc.push({ x: b.x, z: b.z, r: 1.9, k: 0.7 });
    lights.push({ p: v3(b.x, b.y + 5.8, b.z), c: s > 0 ? [3.5, 0.3, 0.2] : [0.3, 3.5, 0.6], s: 2.2, blink: 1.4, ph: k * 0.11 }); } }

  // ---------------------------------------------------------------- the skyline: a floating arcology, a space elevator, wind turbines
  { const A = v3(cx - 7800, SEA, cz + 6400), g = big;
    g.mat(0.4, 0.5, 1, DET.struct).at(A.x, SEA + 6, A.z, QX(90)).cyl(900, 980, 24, 64, [0.3, 0.31, 0.33, 0], true);
    for (let k = 0; k < 26; k++) { const a = k / 26 * 6.283 + (k % 3) * 0.2, rr = 150 + (k * 97 % 600), p = v3(A.x + Math.cos(a) * rr, 0, A.z + Math.sin(a) * rr), hh = 120 + ((k * 53) % 9) * 55, w = 40 + (k % 4) * 15;
      g.mat(0.5, 0.35, 1, DET.facade).at(p.x, SEA + 18 + hh / 2, p.z, QY(k * 23)).box(w, hh, w * 0.8, [0.45, 0.48, 0.52, 0]); }
    g.mat(0.1, 0.15, 1, DET.glass).at(A.x, SEA + 18, A.z, QX(-90)).lathe([[700, 0], [660, 160], [520, 330], [300, 450], [10, 490]], 48, [0.22, 0.3, 0.36, 0]);
    for (let k = 0; k < 40; k++) { const a = k / 40 * 6.283, p = v3(A.x + Math.cos(a) * 905, SEA + 20, A.z + Math.sin(a) * 905); bigLit.at(p.x, p.y, p.z).box(8, 3, 8, LAMP); }
    // space elevator: anchor platform and the tether rising through the clouds
    const E = v3(cx + 6200, SEA, cz - 7400); g.mat(0.5, 0.5, 1, DET.struct).at(E.x, SEA + 20, E.z, QX(90)).cyl(260, 300, 40, 40, [0.32, 0.33, 0.35, 0], true);
    g.at(E.x, SEA + 1500, E.z, QX(90)).cyl(14, 14, 3000, 12, [0.55, 0.56, 0.6, 0], false); for (let y = 200; y < 3000; y += 250) { bigLit.at(E.x, SEA + y, E.z).box(30, 4, 30, CYAN); lights.push({ p: v3(E.x, SEA + y, E.z), c: [0.6, 2.2, 3], s: 40, blink: 0.4, ph: y * 0.001 }); }
    for (let k = 0; k < 9; k++) { const p = v3(cx + 5200 + (k % 3) * 520, SEA, cz + 2800 + Math.floor(k / 3) * 600); g.mat(0.3, 0.5, 1, DET.struct).at(p.x, SEA + 70, p.z, QX(90)).cyl(3.5, 2.2, 140, 12, [0.85, 0.86, 0.87, 0], false); g.at(p.x, SEA + 141, p.z).bbox(5, 5, 12, 1, [0.85, 0.86, 0.87, 0]); }
  }
  const turbines = gfx.mesh((() => { const g = new Geo().mat(0.3, 0.45, 1, DET.struct); for (let k = 0; k < 3; k++) g.at(0, 0, 0, QZ(k * 120).multiply(QX(-90))).plate([[-1.4, 1], [1.4, 1], [0.6, 60], [-0.6, 60]], 0.6, [0.85, 0.86, 0.87, 0]); return g.build(); })());
  const rotors = []; for (let k = 0; k < 9; k++) { const it = { mesh: turbines, pos: v3(cx + 5200 + (k % 3) * 520, SEA + 141, cz + 2800 + Math.floor(k / 3) * 600 - 6), quat: new Quat(), scale: 1, visible: true, br: 70, ph: k * 0.7 }; items.push(it); rotors.push(it); }

  // ---------------------------------------------------------------- ships at sea and craft in the sky
  const freighter = (() => { const g = new Geo(); g.mat(0.4, 0.6, 1, 0).plate([[-14, -90], [14, -90], [16, 60], [0, 95], [-16, 60]], 14, [0.18, 0.2, 0.24, 0], 1.5);
    g.at(0, -6, 0).plate([[-14.2, -90.2], [14.2, -90.2], [16.2, 60], [0, 95.5], [-16.2, 60]], 4, [0.5, 0.12, 0.1, 0], 0.5);
    const C = [[0.7, 0.3, 0.15], [0.2, 0.4, 0.6], [0.65, 0.6, 0.2], [0.3, 0.5, 0.3], [0.5, 0.5, 0.52]];
    for (let k = 0; k < 30; k++) { const x = -9 + (k % 3) * 9, z = -60 + Math.floor(k / 3) * 12, hh = 1 + (k * 7 % 3); g.mat(0.35, 0.6, 1, 16).at(x, 7 + hh * 1.3, z).box(8.4, 2.6 * hh, 11.4, [...C[(k * 5) % 5], 0]); }
    g.mat(0.4, 0.5, 1, 0).at(0, 18, -76).bbox(26, 22, 12, 1, [0.85, 0.85, 0.83, 0]);
    // V11: the bridge wings, a funnel, cranes between the container bays, a mast
    g.at(0, 28.5, -74).box(34, 1.2, 6, [0.85, 0.85, 0.83, 0]); g.at(0, 32, -83, QX(-8)).bbox(7, 12, 6, 1.2, [0.62, 0.16, 0.12, 0]); g.at(0, 38.4, -83.8).box(7.2, 1.5, 6.2, [0.08, 0.08, 0.08, 0]);
    for (const z of [-30, 6, 42]) { g.at(-12, 14, z).box(1.6, 14, 1.6, [0.82, 0.68, 0.16, 0]); bar(g, v3(-12, 21, z), v3(4, 15, z + 4), 0.8, 0.8, [0.82, 0.68, 0.16, 0]); }
    g.at(0, 36, -70).box(0.5, 16, 0.5, [0.8, 0.8, 0.8, 0]); return g; })();
  const freighterLit = gfx.mesh((() => { const g = new Geo().mat(0, 0.4, 3, 0); g.at(0, 25, -69.9).box(20, 1.4, 0.2, LAMP); for (let k = 0; k < 6; k++) g.at(-10 + k * 4, 21.5, -69.9).box(2.2, 1, 0.2, LAMP); g.at(0, 44.5, -70).box(0.8, 0.8, 0.8, [1, 0.95, 0.85, 1]); return g.build(); })());
  const boats = [];
  const freighterParts = seaSteel(gfx, freighter, 12.5, {}); // the hull (which rides 1.5 m deep and heaves) with the splash zone, the rest without
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.4, R0 = 2600 + k * 700, pos = new Vec3(), quat = new Quat(), parts = freighterParts.map(fp => ({ mesh: fp.mesh, prog: fp.prog, uniforms: SU, pos, quat, scale: 1, visible: true, br: 100, cast: false })), it = parts[0], il = { mesh: freighterLit, prog: 'pbrStruct', pos, quat, scale: 1, visible: true, br: 100 }; items.push(...parts, il); boats.push({ it, a, R0, w: (k % 2 ? 1 : -1) * 0.004 / (1 + k * 0.3) }); }
  const patrol = gfx.mesh(buildPatrol()), hauler = gfx.mesh(buildHauler());
  const mv = movers([
    ...[0, 1, 2].map(k => ({ mesh: patrol, br: 20, path: (time, p, q) => { const a = time * (0.07 + k * 0.02) + k * 2.1, R = 900 + k * 260; p.set(cx + Math.cos(a) * R, 240 + k * 70, cz + Math.sin(a) * R); q.setAxisAngle(0, 1, 0, -a); },
      lights: [{ x: 7.2, y: 0, z: -6, s: 2.4, c: [4, 0.4, 0.3], blink: 1.4, ph: k }, { x: -7.2, y: 0, z: -6, s: 2.4, c: [0.4, 4, 0.6], blink: 1.4, ph: k + 0.4 }] })),
    ...[0, 1].map(k => ({ mesh: hauler, scale: 2.5, br: 140, path: (time, p, q) => { const a = time * 0.02 * (k ? 1 : -1) + k * 2.6, R = 2200 + k * 600; p.set(cx + Math.cos(a) * R, 700 + k * 160, cz + Math.sin(a) * R); q.setAxisAngle(0, 1, 0, -a + (k ? 0 : Math.PI)); },
      lights: [{ x: 9, y: 0, z: -40, s: 5, c: [4, 0.5, 0.3], blink: 1.1, ph: k }] }))]);
  items.push(...mv.items);

  // ---------------------------------------------------------------- V12: the extraction field's new obstacles
  // Each is drawn exactly where the simulation has it solid (tracks-v9.js pelagos12, solids.js): the parts inside the
  // corridor in hazard bands, as the course has always marked what a ship can hit; the rest in the platforms' marine
  // steel, with splash collars and foam where it meets the sea. The buoys and the crane's load move every frame with
  // the race clock, the same motion the simulation gives them.
  const v12moving = [];
  { const HZB = [[0.95, 0.68, 0.08, 0], [0.07, 0.07, 0.08, 0]];
    const frameQ = i => new Quat().fromBasis(t.bin[i], t.nrm[i], t.tan[i]);
    // a vertical tube from y0 to y1 at (x, z): hazard bands between the corridor's floor and roof at sample i, steel
    // outside them, clamp rings, a splash collar and foam at the sea
    const column = (g, gl, i, x, z, y0, y1, r, steel, inCorridor = true) => {
      const lo = inCorridor ? t.pos[i].y - t.h[i] - 1.5 : y1 + 1, hi = inCorridor ? t.pos[i].y + t.h[i] + 1.5 : y1 + 1, seg = (a, b, col) => { if (b - a > 0.05) g.at(x, (a + b) / 2, z, QX(90)).cyl(r, r, b - a, 18, col, false); };
      seg(y0, Math.min(lo, y1), steel); seg(Math.max(hi, y0), y1, steel);
      for (let y = Math.max(y0, lo), k = 0; y < Math.min(y1, hi); y += 2.2, k++) seg(y, Math.min(y + 2.2, Math.min(y1, hi)), HZB[k % 2]);
      for (let y = y0 + 4; y < y1 - 2; y += 5.5) if (y < lo - 1 || y > hi + 1) g.at(x, y, z, QX(90)).cyl(r * 1.12, r * 1.12, 0.5, 18, steel, false);
      if (y0 < SEA) { g.at(x, SEA + 1.4, z, QX(90)).cyl(r * 1.45, r * 1.45, 5, 18, SPLASH); foamSrc.push({ x, z, r: r * 1.6, k: 0.9 }); }
      for (const y of [lo, hi]) if (y > y0 && y < y1) gl.at(x, y, z).box(r * 0.9, 0.5, r * 0.9, RED); // a red lamp where it enters and leaves the corridor
    };
    // the skim deck's drilling risers: from the sea up through the corridor to tensioner frames under the deck
    for (const rec of (t.solids || []).filter(r => r.kind === 'riser')) {
      const i = rec.hint, a = rec.pts[0], b = rec.pts[1], g = stCh.get(i, 'stl'), r = rec.rad[0];
      column(g, bigLit, i, a.x, a.z, a.y, b.y, r, LEGC, rec.spheres.length > 0); // a riser beside the corridor has no hazard bands
      g.mat(0.55, 0.6, 1, 0).at(a.x, b.y + 1.6, a.z).bbox(r * 4.2, 3.2, r * 4.2, 0.4, STEEL[1]); // tensioner frame
      for (const s of [-1, 1]) pipe(g, v3(a.x + s * r * 1.6, b.y + 3, a.z), v3(a.x + s * r * 1.6, b.y + 9, a.z), 0.35, STEEL[2], 8); // its rams up to the deck
      g.at(a.x, b.y - 2, a.z, QX(90)).cyl(r * 1.35, r * 1.35, 1.2, 18, PAINT[1]); // flex joint
    }
    // the rack over the return straight: towers on both sides carrying pipes over the corridor; its lowest pipe crosses
    // the corridor (the obstacle), and further on one of its legs stands in it
    for (const o of t.obstacles) if (o.kind === 'pipe' || o.kind === 'rackleg') {
      const i = o.i, g = stCh.get(i, 'stl'), top = t.h[i] + 9, W = t.w[i];
      const towerAt = x => { const foot = P(t, i, x, 0); foot.y = SEA - 8; const head = P(t, i, x, top + 2); lattice(g.mat(0.55, 0.6, 1, 0), foot, head.y - foot.y, 6.5, STEEL[1], 0.7, 5);
        g.at(foot.x, SEA + 1.4, foot.z, QX(90)).cyl(4, 4, 5, 16, SPLASH); foamSrc.push({ x: foot.x, z: foot.z, r: 4.2, k: 0.8 }); return head; };
      if (o.kind === 'pipe') {
        const L = towerAt(-W - 9), R = towerAt(W + 9);
        bar(g, P(t, i, -W - 11, top), P(t, i, W + 11, top), 1.6, 2.2, STEEL[3]);
        for (const [dy, r, col] of [[1.6, 1.1, PAINT[3]], [1.4, 0.8, PAINT[1]], [1.2, 0.6, STEEL[2]]]) pipe(g, P(t, i, -W - 14, top + dy + r, 0), P(t, i, W + 14, top + dy + r, 0), r, col, 12);
        // the low pipe beyond the corridor's walls, into the towers (inside the walls the course kit's hazard pipe)
        for (const s of [-1, 1]) { pipe(g, P(t, i, s * (W + 4), o.y), P(t, i, s * (W + 13), o.y), o.r * 0.98, LEGC, 16); for (const yy of [o.y, top]) { const c = P(t, i, s * (W + 9), yy); g.at(c.x, c.y, c.z, frameQ(i)).bbox(2.4, 2.6, 2.4, 0.3, STEEL[1]); } }
        void L; void R;
      } else {
        const foot = P(t, i, o.x, 0); foot.y = SEA - 8; const hiY = t.pos[i].y + t.h[i] + 4, loY = t.pos[i].y - t.h[i] - 4;
        g.mat(0.5, 0.6, 1, 0).at(foot.x, (foot.y + loY) / 2, foot.z, QX(90)).cyl(o.r * 1.05, o.r * 1.15, loY - foot.y, 18, LEGC, false);
        const head = P(t, i, o.x, top); g.at(head.x, (hiY + head.y) / 2, head.z, QX(90)).cyl(o.r * 0.98, o.r * 0.98, head.y - hiY, 18, LEGC, false);
        g.at(foot.x, SEA + 1.4, foot.z, QX(90)).cyl(o.r * 1.7, o.r * 1.7, 5, 18, SPLASH); foamSrc.push({ x: foot.x, z: foot.z, r: o.r * 1.8, k: 0.9 });
        towerAt(-W - 9); bar(g, P(t, i, -W - 11, top), P(t, i, o.x + 3, top), 1.6, 2.2, STEEL[3]);
        for (const [dy, r, col] of [[1.6, 1.1, PAINT[3]], [1.4, 0.8, PAINT[1]]]) pipe(g, P(t, i, -W - 14, top + dy + r, 0), P(t, i, o.x + 4, top + dy + r, 0), r, col, 12);
      }
    }
    // spar buoys of the extraction field: banded spars with a top mark and a lantern, riding the swell (moved per frame)
    for (const rec of (t.solids || []).filter(r => r.kind === 'buoy')) {
      const i = rec.hint, a = rec.pts[0], b = rec.pts[1], r = rec.rad[0], g = new Geo().mat(0.3, 0.55, 1, 0), gl = new Geo().mat(0, 0.4, 4, 0);
      for (let y = a.y, k = 0; y < b.y; y += 3, k++) g.at(a.x, Math.min(y + 1.5, (y + b.y) / 2), a.z, QX(90)).cyl(r, r, Math.min(3, b.y - y), 16, k % 2 ? [0.82, 0.8, 0.76, 0] : [0.72, 0.14, 0.1, 0], false);
      g.at(a.x, SEA + 0.9, a.z, QX(90)).cyl(r * 1.25, r * 1.25, 3, 16, [0.12, 0.13, 0.13, 0]); // the dark waterline band
      g.at(a.x, b.y + 0.4, a.z, QX(90)).cyl(r * 0.5, r * 0.5, 0.8, 12, STEEL[1]); g.at(a.x, b.y + 2.6, a.z, QX(90)).cyl(0.18, 0.18, 4, 6, STEEL[2]);
      for (const ang of [45, -45]) g.at(a.x, b.y + 4.8, a.z, QY(heading(i)).multiply(QZ(ang))).box(0.25, 2.4, 0.25, [0.9, 0.75, 0.1, 0]); // the X top mark of a special mark
      gl.at(a.x, b.y + 3.4, a.z).box(0.6, 0.6, 0.6, [1, 0.8, 0.3, 1]);
      foamSrc.push({ x: a.x, z: a.z, r: r * 1.8, k: 0.8 });
      const it = { mesh: gfx.mesh(g.merge(gl).build()), pos: new Vec3(), quat: new Quat(), scale: 1, visible: true, br: 30 };
      items.push(it); v12moving.push({ it, kind: 'bob', o: rec.spheres[0] });
    }
    // the crane barge by the island turn: a barge on the sea beside the course, a lattice boom up to its tip over the
    // corridor, the load (a subsea module) on its cable swinging under the tip (moved per frame)
    for (const rec of (t.solids || []).filter(r => r.kind === 'load')) {
      const i = rec.i, tip = P(t, i, rec.px, rec.py), side = rec.px >= 0 ? 1 : -1, g = stCh.get(i, 'stl');
      let bx = t.w[i] + 70, base; for (; bx < t.w[i] + 200; bx += 10) { base = beside(i, side * bx); base.y = SEA + 9; let ok = true; for (let u = 0.05; u < 0.95; u += 0.05) if (!clear.sphere(new Vec3().lerpVectors(base, tip, u), 4, 4)) { ok = false; break; } if (ok) break; }
      const hq = QY(heading(i)), barge = beside(i, side * (bx + 14)); barge.y = SEA;
      g.mat(0.5, 0.6, 1, 0).at(barge.x, SEA + 2, barge.z, hq).bbox(46, 7, 28, 1.2, [0.22, 0.24, 0.26, 0]); g.at(barge.x, SEA + 5.8, barge.z, hq).box(44, 0.6, 26, GRATE);
      g.at(barge.x, SEA + 1, barge.z, hq).bbox(48, 2.4, 30, 0.8, [0.55, 0.16, 0.1, 0]); // the boot top
      for (const [lx, lz, sx, sy, sz, col] of [[-14, -6, 10, 7, 9, PAINT[2]], [-14, 7, 8, 4, 8, STEEL[2]], [12, 8, 12, 3, 6, PAINT[3]]]) { const c = new Vec3(lx, 0, lz).applyQuat(hq).add(v3(barge.x, SEA + 6 + sy / 2, barge.z)); g.at(c.x, c.y, c.z, hq).bbox(sx, sy, sz, 0.3, col); }
      g.at(base.x, SEA + 7, base.z, QX(90)).cyl(5, 5.5, 4, 20, PAINT[1]); g.at(base.x, SEA + 11, base.z, hq).bbox(9, 6, 9, 0.4, PAINT[1]); // slewing ring and the crane house
      truss(g.mat(0.6, 0.5, 1, 0), v3(base.x, SEA + 12, base.z), tip, 3.2, 6, PAINT[1]); // the boom
      const aTop = v3(base.x, SEA + 34, base.z); truss(g, v3(base.x, SEA + 13, base.z), aTop, 2.2, 5, PAINT[1]); pipe(g, aTop, tip, 0.25, STEEL[2], 6); // A-frame and pendant
      bigLit.at(tip.x, tip.y + 1.5, tip.z).box(1.2, 1.2, 1.2, RED); bigLit.at(aTop.x, aTop.y + 1, aTop.z).box(1, 1, 1, RED);
      foamSrc.push({ x: barge.x, z: barge.z, r: 30, k: 0.6 });
      // the swinging part, built along +x from the pivot (the boom tip): sheave, cable, hook block, the module
      const m = new Geo().mat(0.5, 0.55, 1, 0), L = rec.L0, R = rec.r1;
      m.at(0, 0, 0, QY(0)).cyl(1.1, 1.1, 1.6, 14, STEEL[1]);
      m.at((L - R - 1.2) / 2, 0, 0, QY(90)).cyl(0.16, 0.16, L - R - 1.2, 6, [0.08, 0.08, 0.08, 0], false); // the cable
      m.at(L - R - 1.6, 0, 0).bbox(1.4, 1.4, 1.8, 0.2, PAINT[1]); // hook block
      m.at(L, 0, 0).sphere(R * 0.94, 18, 12, [0.86, 0.42, 0.12, 0]); // the module: a subsea pressure vessel, orange
      for (const ang of [0, 60, 120]) m.at(L, 0, 0, QZ(ang)).torus(R * 0.97, 0.16, 28, 6, STEEL[1]); // its cage
      const ml = new Geo().mat(0, 0.4, 4, 0); for (const s of [-1, 1]) ml.at(L, s * R * 0.95, 0).box(0.5, 0.5, 0.5, RED);
      const it = { mesh: gfx.mesh(m.merge(ml).build()), pos: tip.clone(), quat: frameQ(i), scale: 1, visible: true, br: L + R + 4 };
      items.push(it); v12moving.push({ it, kind: 'swing', rec, q0: frameQ(i) });
    }
  }

  // ---------------------------------------------------------------- the course kit: energy walls, gates on stilts, pickups,
  // the platform columns in the narrows, route lights
  const hex = hexField(gfx, t, (i, f) => t.loopId[i] < 0 || f === 'T', [0.35, 0.85, 1]); // in the loops the rails and the keel mark the walls; only the inner face glows
  const gt = gates(gfx, t), pk = pickups(gfx, t), hz = hazards(gfx, t), rg = routeGuides(gfx, t, { colL: [1, 0.72, 0.3], colR: [0.3, 0.9, 1] });
  for (const i of t.cpIdx) { const W = t.w[i] + 1.2, H = t.h[i] + 1.2; for (const s of [-1, 1]) { const top = P(t, i, s * (W + 1.3), -H - 1.3), foot = top.clone(); foot.y = SEA - 6; if (top.y - foot.y < 6) continue;
    const g = stCh.get(i, 'stl'); truss(g.mat(0.6, 0.5, 1, 0), foot, top, 3.2, 6, [0.32, 0.32, 0.33, 0]); g.at(foot.x, SEA + 1, foot.z).bbox(7, 5, 7, 0.8, [0.6, 0.3, 0.12, 0]); foamSrc.push({ x: foot.x, z: foot.z, r: 4, k: 0.8 }); } }
  items.push(...hex.items, ...gt.items, ...pk.items, ...hz.items, ...rg.items);
  items.push(...seaSteelChunks(gfx, ch, 'loop', SEA + 9.5, { cast: true, uniforms: SU, maxDist: 6000, tag: 'loop' }), ...ch.items(gfx, 'loopLit', { prog: 'pbrStruct', maxDist: 6000 }));
  items.push(...seaSteelChunks(gfx, stCh, 'stl', SEA + 9.5, { cast: true, uniforms: SU, maxDist: 9000, tag: 'steel' }));
  if (steel.i.length) { const b = steel.bounds(); items.push(...seaSteel(gfx, steel, SEA + 9.5, { uniforms: SU, visible: true, cast: true, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r }, tag: 'steel' })); }
  items.push({ mesh: gfx.mesh(big.build()), visible: true, prog: 'pbrCity' }, { mesh: gfx.mesh(bigLit.build()), visible: true, prog: 'pbrStruct' });
  items.push(...cellItems(gfx, beams, 400, { prog: 'v11beam', blend: 'add', layer: 1, uniforms: { uBeam: [0.11, 0.9, 0, 2600] }, maxDist: 2600 })); // in cells: a beam fades to nothing at its range (2.6 km) and is not drawn beyond it
  // V11: rain curtains hanging from the scud under storm cells around the course, never over it
  { const rain = new Geo(), R3 = makeRng(t.def.seed * 53 + 11);
    for (let k = 0, tries = 0; k < 7 && tries < 60; tries++) { const a = R3() * 6.283, dd = 2200 + R3() * 3800, x = cx + Math.cos(a) * dd, z = cz + Math.sin(a) * dd, r = 380 + R3() * 520;
      let ok = true; for (let j = 0; j < N; j += 6) if (Math.hypot(t.pos[j].x - x, t.pos[j].z - z) < r * 1.5 + 400) { ok = false; break; } if (!ok) continue;
      curtain(rain, x, z, r, SEA - 5, U.uCloud2[0] + 120, 24); k++; }
    if (rain.i.length) items.push({ mesh: gfx.mesh(rain.build()), prog: 'v11rain', blend: 'normal', layer: 0, visible: true, uniforms: { uRainK: [0.34, 9000, 16000, 0] } }); }
  items.push(ocean);

  const env = { sunDir: v3(0.52, 0.34, 0.78).normalize(), sunCol: [2.7, 2.45, 2.15], fogCol: [0.15, 0.18, 0.21], fog: 0.00026, fogH: [SEA, 420], sky: 'atmo', zen: [0.045, 0.06, 0.08], hor: [0.3, 0.34, 0.38],
    dirt: 0.35, streak: 0.55, flare: 0.65, envInt: 0.95, expo: 1.06, shafts: 0.55, reverb: 'open',
    nebA: [0.2, 0.3, 0.4], nebB: [0.3, 0.4, 0.5], nebC: [0.8, 0.9, 1], base: [0.02, 0.025, 0.03], neb: 0, seed: 7.7, sat: 0.94, lift: [0.004, 0.008, 0.012], gain: [0.98, 1.0, 1.03],
    planet: { dir: v3(-0.45, 0.42, -0.79), dist: 42000, r: 7000, type: 2, a: [0.74, 0.8, 0.86], b: [0.5, 0.58, 0.68], c: [0.94, 0.97, 1], atmo: [0.55, 0.72, 1], bright: 0.55 } };
  items.push(...planetItems(gfx, env, t.def.seed));

  // V11: sea mist low over the water round the course (soft haze sprites, nearest first)
  const mist = []; { const R4 = makeRng(t.def.seed * 61 + 5); for (let k = 0; k < 260; k++) { const x = minX - 1800 + R4() * (maxX - minX + 3600), z = minZ - 1800 + R4() * (maxZ - minZ + 3600), p = v3(x, SEA + 14 + R4() * 36, z), s = 140 + R4() * 220;
    if (!clear.sphere(p, s * 0.3, 0)) continue; mist.push({ p, s, rot: R4() * 9, sd: [R4() * 9, R4() * 9, R4()] }); } }
  const foamList = foamSrc.map(f => ({ ...f, d: 0 }));

  // ---------------------------------------------------------------- per frame
  const fr = new Frustum(); let flash = null, nextBolt = 2.5, sprayT = 0, flameT = 0, rainAcc = 0;
  // V11: a bolt is a jagged main channel from the cloud base to the sea with branches forking off it
  const zig = (a, b, n, amp) => { const pts = [a]; for (let k = 1; k < n; k++) { const u = k / n, p = new Vec3().lerpVectors(a, b, u); p.x += (Math.random() - 0.5) * amp; p.z += (Math.random() - 0.5) * amp; p.y += (Math.random() - 0.5) * amp * 0.3; pts.push(p); } pts.push(b); return pts; };
  const strike = (cam) => { // a lightning strike somewhere in the storm, 1.5-7 km from the camera, mostly ahead
    const a = Math.atan2(cam.fwd.x, cam.fwd.z) + (Math.random() - 0.5) * 2.2, d = 1500 + Math.random() * 5500, x = cam.pos.x + Math.sin(a) * d, z = cam.pos.z + Math.cos(a) * d;
    const sheet = Math.random() < 0.3; // a third of the flashes stay inside the cloud: no bolt, the deck lights up
    const main = sheet ? [] : zig(v3(x, U.uCloud[0] * 0.95, z), v3(x + (Math.random() - 0.5) * 300, SEA, z + (Math.random() - 0.5) * 300), 22, 110), br = [];
    if (!sheet) for (let b = 0, nb = 2 + Math.floor(Math.random() * 3); b < nb; b++) { const s = main[2 + Math.floor(Math.random() * 12)], e = s.clone().add(v3((Math.random() - 0.5) * 700, -200 - Math.random() * 500, (Math.random() - 0.5) * 700)); if (e.y < SEA + 40) e.y = SEA + 40; br.push(zig(s, e, 8, 70)); }
    flash = { x, z, t: 0, life: 0.55 + Math.random() * 0.3, main, br, sheet, fl: [0, 0.07, 0.16, 0.3].map(v => v + Math.random() * 0.05) }; };
  const drawBolt = (fx, pts, core, glow, k) => { for (let j = 0; j < pts.length - 1; j++) { const a = pts[j], b = pts[j + 1], d = new Vec3().subVectors(b, a), L = d.len(); d.scale(1 / L);
    fx.bbAdd.add((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, core, 3.4 * k, 3.6 * k, 4.6 * k, 1, d.x, d.y, d.z, L * 1.04); fx.bbAdd.add((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, glow, 0.5 * k, 0.6 * k, 1.1 * k, 0.5, d.x, d.y, d.z, L * 1.1); } };
  const pickFoam = (c) => { const F = U.uFoamSrc; for (const f of foamList) f.d = Math.hypot(f.x - c.x, f.z - c.z) - f.r; foamList.sort((a, b) => a.d - b.d);
    let n = 0; for (let k = 0; k < 8; k++) { const f = foamList[k], on = f && f.d < 700; if (on) n = k + 1; F[k * 4] = on ? f.x : 0; F[k * 4 + 1] = on ? f.z : 0; F[k * 4 + 2] = on ? f.r : 0; F[k * 4 + 3] = on ? f.k * Math.min(1, (700 - f.d) / 150) : 0; } U.uFoamN = n; }; // the foam fades in as its source comes into reach
  release(ch, stCh, big, bigLit, steel, beams); // every mesh is made: the vertex lists go (v11kit)
  return { items, env, cull(cam) { fr.set(cam, gfx);
      for (const p of plats) { const px = fr.px(p.bs.x, p.bs.y, p.bs.z, p.bs.r), on = p.on ? px > 150 * 0.89 : px > 150; p.on = on; for (const it of p.det) it.visible = on; } }, // the installation's fine detail while it is over 150 px across
    hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); hz.update(dt, time, race, fx, cam); mv.update(dt, time, fx); rg.update(fx, cam, race, time);
      // V12: the buoys ride the swell and the crane's load swings, exactly as the simulation moves them (race clock)
      { const rt = race ? race.time : time; for (const m of v12moving) { if (m.kind === 'bob') { if (!race) t.updateObstacles(rt); m.it.pos.subVectors(m.o.p, m.o.base); }
        else { const th = m.rec.rot.th0 + (m.rec.rot.amp != null ? m.rec.rot.amp * Math.sin(rt * m.rec.rot.w + (m.rec.rot.ph || 0)) : rt * m.rec.rot.w); m.it.quat.copy(m.q0).multiply(new Quat().setAxisAngle(0, 0, 1, th)); } } }
      const c = cam.pos; ocean.pos.set(Math.round(c.x / 4) * 4, 0, Math.round(c.z / 4) * 4); dome.pos.set(c.x, 0, c.z); pickFoam(c);
      // lightning: a flicker of 3-4 pulses, the bolt and its branches drawn as glowing streaks, the deck and the sea lit around it
      if ((nextBolt -= dt) < 0 && !flash) { strike(cam); nextBolt = 3 + Math.random() * 6; }
      U.uFlash[2] = 0;
      if (flash) { flash.t += dt; const f = flash, on = f.fl.some(s => f.t > s && f.t < s + 0.05) ? 1 : Math.max(0, 1 - f.t / f.life) * 0.25;
        U.uFlash[0] = f.x; U.uFlash[1] = f.z; U.uFlash[2] = on * (f.sheet ? 1.8 : 2.4); U.uFlash[3] = f.sheet ? 1500 : 1100;
        if (on > 0.5 && !f.sheet) { drawBolt(fx, f.main, 5, 26, 1); for (const b of f.br) drawBolt(fx, b, 3, 14, 0.7); const e = f.main[f.main.length - 1]; fx.bbAdd.add(e.x, e.y + 8, e.z, 70, 1.6, 1.8, 2.4, 0.8); }
        if (f.t > f.life) flash = null; }
      // flare stacks: a roaring flame and a dark smoke trail bent by the wind
      if ((flameT -= dt) < 0) { flameT = 0.05; for (const f of flares) if (f.p.dist(c) < 4500) { const s = f.s; fx.spawn(f.p.x, f.p.y, f.p.z, 2 + Math.random() * 2, 6 + Math.random() * 6, 1, 0.5, 4 * s, 9 * s, 3.4, 1.4, 0.35, 0.9, true, 0.6);
        if (Math.random() < 0.5) fx.spawn(f.p.x, f.p.y + 8 * s, f.p.z, 6, 7, 2, 5, 8 * s, 40 * s, 0.07, 0.065, 0.06, 0.5, false, 0.15); } }
      for (const f of flares) if (f.p.dist(c) < 9000) { const fl = 0.75 + 0.25 * Math.sin(time * 23 + f.p.x) * Math.sin(time * 7.1 + f.p.z); fx.bbAdd.add(f.p.x, f.p.y + 1, f.p.z, 3.2 * f.s, 3.4, 2.2, 0.9, fl); // core and the flame tongue bending downwind
        fx.bbAdd.add(f.p.x + 2 * f.s, f.p.y + 9 * f.s, f.p.z + 1 * f.s, 4 * f.s, 2.8, 1.1, 0.25, 0.8 * fl, 0.22, 1, 0.1, 20 * f.s * (0.8 + 0.3 * fl)); fx.bbAdd.add(f.p.x, f.p.y + 4, f.p.z, 22 * f.s, 0.5, 0.22, 0.06, 0.4 * fl); }
      // spray where any ship skims the waves
      if ((sprayT -= dt) < 0 && race) { sprayT = 0.03; for (const r of race.racers) { const s = r.ship, p = s.pos, alt = p.y - SEA; if (r.wrecked || alt > 13 || p.dist(c) > 600) continue;
        const v = s.vel, sp = v.len(); if (sp < 40) continue; const k = (13 - alt) / 13;
        for (let n = 0; n < 3; n++) fx.spawn(p.x - v.x * 0.03 + (Math.random() - 0.5) * 3, SEA + 1, p.z - v.z * 0.03 + (Math.random() - 0.5) * 3, -v.x * 0.08 + (Math.random() - 0.5) * 8, 6 + Math.random() * 10 * k, -v.z * 0.08 + (Math.random() - 0.5) * 8, 0.9 + Math.random() * 0.6, 1.2, 6 + 6 * k, 0.6, 0.66, 0.7, 0.32 * k, false, 1.2, 0, 9.8); } }
      // V11: rain round the camera, heavier under the storm cells: thin streaks falling and blown with the wind
      { const rk = Math.max(0, Math.min(1, 0.25 + 0.9 * (vnoise2(c.x * 0.0004 + time * 0.004, c.z * 0.0004, 31) - 0.35))); U.uFoamK[3] = 0.25 + 0.6 * rk;
        rainAcc += dt * 900 * rk; let n = Math.min(70, Math.floor(rainAcc)); rainAcc -= n; const f = cam.fwd;
        while (n-- > 0) { const ahead = 6 + Math.random() * 70, lat = (Math.random() - 0.5) * 70, x = c.x + f.x * ahead - f.z * lat, z = c.z + f.z * ahead + f.x * lat, y = c.y - 12 + Math.random() * 40;
          fx.spawn(x, y, z, 6, -32, 2.5, 0.9, 0.035, 0.035, 0.5, 0.55, 0.62, 0.32, true, 0, 0.055); } }
      // V11: spindrift: spray torn off the crests by the wind, round the camera
      if (Math.random() < dt * 14) { const f = cam.fwd, ahead = 40 + Math.random() * 260, lat = (Math.random() - 0.5) * 300, x = c.x + f.x * ahead - f.z * lat, z = c.z + f.z * ahead + f.x * lat;
        for (let k = 0; k < 3; k++) fx.spawn(x + (Math.random() - 0.5) * 6, SEA + 0.8, z + (Math.random() - 0.5) * 6, 7 + Math.random() * 4, 2 + Math.random() * 3, 2 + Math.random() * 2, 1.6 + Math.random(), 1.5, 9, 0.62, 0.66, 0.7, 0.22, false, 0.6, 0, 1.5); }
      // V11: sea mist (soft haze sprites low over the water)
      { const Rr = 2200 * (gfx.cfg.hazeDist ?? 1), hcap = Math.min(40, gfx.cfg.hazeCap ?? 120); let nh = 0;
        for (const m of mist) { const d = m.p.dist(c); if (d > Rr || nh >= hcap) continue; const a = 0.16 * Math.min(1, (Rr - d) / (Rr * 0.3)) * Math.min(1, d / (m.s * 0.7)); if (a < 0.01) continue;
          nh++; fx.bbHaze.add(m.p.x, m.p.y, m.p.z, m.s, 0.16, 0.19, 0.22, a, m.rot, m.sd[0], m.sd[1], m.sd[2]); } }
      // freighters on their courses, with a bow wave and a wake
      for (const b of boats) { const a = b.a + time * b.w, p = b.it.pos; p.set(cx + Math.cos(a) * b.R0, SEA - 1.5 + Math.sin(time * 0.6 + b.R0) * 0.6, cz + Math.sin(a) * b.R0);
        const dir = v3(-Math.sin(a) * Math.sign(b.w), 0, Math.cos(a) * Math.sign(b.w)); b.it.quat.copy(qLook(dir)).multiply(new Quat().setAxisAngle(0, 0, 1, Math.sin(time * 0.4 + b.R0) * 0.02));
        if (p.dist(c) < 5000 && Math.random() < dt * 8) { const st = p.clone().addScaled(dir, -88); fx.spawn(st.x + (Math.random() - 0.5) * 20, SEA + 1, st.z + (Math.random() - 0.5) * 20, 0, 1, 0, 6, 10, 40, 0.5, 0.55, 0.58, 0.25, false, 0.3); }
        if (p.dist(c) < 5000 && Math.random() < dt * 6) { const bw = p.clone().addScaled(dir, 92); fx.spawn(bw.x + (Math.random() - 0.5) * 10, SEA + 1.5, bw.z + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, 2.5, 4, 16, 0.6, 0.64, 0.68, 0.3, false, 0.5); } }
      for (const it of rotors) it.quat.setAxisAngle(0, 0, 1, time * 0.8 + it.ph);
      // lights: navigation and warning lamps, the lighthouse beam sweeping the sea
      for (const l of lights) { if (l.blink && Math.floor((time + (l.ph || 0)) / l.blink) % 2) continue; if (l.p.dist(c) > 9000) continue; fx.bbAdd.add(l.p.x, l.p.y, l.p.z, l.s, l.c[0], l.c[1], l.c[2], 1); }
      if (beacon.p) { const a = time * 1.6, d = v3(Math.cos(a), -0.04, Math.sin(a)); fx.bbAdd.add(beacon.p.x, beacon.p.y, beacon.p.z, 9, 3, 2.8, 2.2, 1); fx.bbAdd.add(beacon.p.x + d.x * 600, beacon.p.y + d.y * 600, beacon.p.z + d.z * 600, 22, 0.5, 0.48, 0.4, 0.5, d.x, d.y, d.z, 1200); }
    },
    light(me) { if (!flash || U.uFlash[2] < 0.5) return null; return { pos: v3(flash.x, 700, flash.z), col: [3.2, 3.5, 4.2].map(v => v * U.uFlash[2]), range: 5200 }; } };
}
