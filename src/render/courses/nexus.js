// GALACTIC RUSH V10 — Orbital Nexus, a megastation in orbit over a blue world: a launch hangar with docked ships,
// cranes and cargo; a bulkhead tunnel into the reactor hall, where the course rides the chamber wall round a sun of
// plasma held in rotating rings; glass corridors outside the hull where gravity holds you to the ceiling and the
// planet hangs overhead; the Spindle, a rotating shaft that turns gravity back upright; the open hull, with radiators,
// solar wings, masts, docking arms and a habitat ring; a docking aperture into the cargo levels and the ramp up into
// the hangar. Gravity sections (course data: track.grav, track.roll) have glowing plating on their deck, chevrons
// running forward and gates where the field begins and ends. Nothing solid reaches into the corridor unless it
// collides (the masts, struts, pillars, the crane and the cargo pods are the course's obstacles).
// V11 visual pass (same layout, same places, same course): the station is built in plated steel (plates and their
// bolts, hazard stripes, solar cells); the halls get pilasters, girders, conduits, catwalks, floor markings and roof
// floodlights whose beams show in the dust; the tunnels cable trays and pipe runs; the reactor a containment field,
// magnetic coils, capacitor banks and arcs of energy; the hull outside antennas, dishes, pipe runs and lit ports; a
// shipyard and a second station in the distance; rings of light turning round the corridor where the deck turns, and
// dust that falls toward the deck wherever a gravity field holds it.
import { Vec3, Quat, makeRng } from '../../math.js';
import { Geo, QX, QY, QZ, DET } from '../geo.js';
import { Chunks, fq, P, hexField, gates, pickups, routeGuides, movers, planetItems, v3 } from './common.js';
import { buildPatrol, buildHauler } from '../props.js';
import { Clearance, truss, qLook } from './v9kit.js';
import { ensureV10Programs } from './v10kit.js';
import { ensureV11Programs, bar, pipe, railing, ladder, lattice, beamCone, CellGeo, cellItems, DetailLOD, release } from './v11kit.js';
import { Frustum } from '../lod.js';

const HULL = [[0.5, 0.52, 0.55, 0], [0.42, 0.44, 0.47, 0], [0.6, 0.6, 0.62, 0], [0.34, 0.36, 0.4, 0]];
const ACC = [[0.85, 0.42, 0.12, 0], [0.12, 0.42, 0.7, 0], [0.8, 0.7, 0.2, 0]];
const CONT = [[0.52, 0.2, 0.1], [0.14, 0.27, 0.4], [0.58, 0.47, 0.17], [0.4, 0.42, 0.4], [0.66, 0.66, 0.62], [0.2, 0.32, 0.22]]; // cargo containers: weathered industrial colours
const LAMP = [1, 0.9, 0.75, 1], CYAN = [0.45, 0.85, 1, 1], VIOLET = [0.7, 0.45, 1, 1], AMBER = [1, 0.62, 0.2, 1], RED = [1, 0.15, 0.1, 1];
const GRAV = [0.45, 0.62, 1]; // gravity plating glow

export function buildNexus(gfx, t) {
  ensureV10Programs(gfx); ensureV11Programs(gfx);
  const rng = makeRng(t.def.seed * 17 + 3), R = () => rng(), items = [], N = t.N, clear = new Clearance(t);
  const ch = new Chunks(t, 64), big = new CellGeo(350), bigLit = new CellGeo(350).mat(0, 0.4, 4, 0), facade = new CellGeo(350), lights = []; // V11: the station's structure in cells by position, so what is out of view is culled (V10: one mesh each)
  const beams = new Geo(), NU = { uWx: [-1e5, 0.12, 0.06, 0], uSea: 0, uHeatC: [0.35, 0.55, 1.3] }, PL = 18, HZ = 17, SOLAR = 19; // V11: plated steel (station plating, hazard stripes, solar cells), beams in the dust
  const at = tag => t.tags.get(tag) || [], bbox = tags => { const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }; for (const g of tags) for (const i of at(g)) { const p = t.pos[i];
    b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z); } return b; };
  const okBox = (c, sx, sy, sz, m = 3) => clear.box(c, v3(sx / 2, 0, 0), v3(0, sy / 2, 0), v3(0, 0, sz / 2), m);
  const S = i => t.wrapIdx(i);

  // ---------------------------------------------------------------- halls: the hangar, the reactor hall, the cargo hall
  // floors, walls and ceilings of panels; a panel is left out where a corridor passes through it, so every tunnel
  // and ramp opens into the hall exactly where it arrives
  const halls = [];
  const hall = (b, o) => {
    const T = o.tile || 24, th = 3, g = big, gl = bigLit;
    halls.push(b);
    const face = (axis, val, out) => { // axis: 'x'|'y'|'z' fixed at val; tiles over the other two
      const [u0, u1, v0, v1] = axis === 'y' ? [b.x0, b.x1, b.z0, b.z1] : axis === 'x' ? [b.z0, b.z1, b.y0, b.y1] : [b.x0, b.x1, b.y0, b.y1];
      const nu = Math.ceil((u1 - u0) / T), nv = Math.ceil((v1 - v0) / T);
      for (let a = 0; a < nu; a++) for (let c = 0; c < nv; c++) {
        const u = u0 + (u1 - u0) * (a + 0.5) / nu, v = v0 + (v1 - v0) * (c + 0.5) / nv, su = (u1 - u0) / nu, sv = (v1 - v0) / nv;
        const p = axis === 'y' ? v3(u, val, v) : axis === 'x' ? v3(val, v, u) : v3(u, v, val), sz = axis === 'y' ? [su, th, sv] : axis === 'x' ? [th, sv, su] : [su, sv, th];
        if (!okBox(p, sz[0], sz[1], sz[2], 2)) continue;
        const col = HULL[(a * 7 + c * 3) % HULL.length]; g.mat(0.55, 0.55, 1, PL).at(p.x, p.y, p.z).box(sz[0] - 0.3, sz[1], sz[2] - 0.3, col);
        if (axis === 'y' && out < 0 && (a + c) % 3 === 0) { const lp = p.clone(); lp.y -= th / 2 + 0.2; gl.at(lp.x, lp.y, lp.z).box(su * 0.7, 0.3, 1.2, LAMP); } // ceiling light strips
        if (axis !== 'y' && c === 1 && a % 2 === 0) { const lp = p.clone(); lp[axis] -= out * (th / 2 + 0.2); gl.at(lp.x, lp.y, lp.z).box(axis === 'x' ? 0.3 : su * 0.6, 1, axis === 'x' ? su * 0.6 : 0.3, o.strip || CYAN); }
      } };
    face('y', b.y0 - 1.5, 1); face('y', b.y1 + 1.5, -1); face('x', b.x0 - 1.5, 1); face('x', b.x1 + 1.5, -1); face('z', b.z0 - 1.5, 1); face('z', b.z1 + 1.5, -1);
    // structural ribs across the ceiling
    for (let x = b.x0 + T * 2; x < b.x1; x += T * 3) { const c = v3(x, b.y1 - 2, (b.z0 + b.z1) / 2); if (okBox(c, 4, 4, b.z1 - b.z0, 2)) g.mat(0.6, 0.5, 1, PL).at(c.x, c.y, c.z).bbox(4, 4, b.z1 - b.z0, 0.4, HULL[3]); }
    // V11: pilasters and a girder on every wall, conduits along the long walls, a catwalk high on each, hazard stripes
    // round the floor, painted bay lines, vents, and floodlights in the roof
    const H = b.y1 - b.y0, put = (c, sx, sy, sz, col, det = PL) => { if (okBox(c, sx, sy, sz, 2)) g.mat(0.6, 0.5, 1, det).at(c.x, c.y, c.z).box(sx, sy, sz, col); };
    for (const [wx, sgn] of [[b.x0, 1], [b.x1, -1]]) { for (let z = b.z0; z <= b.z1 + 0.1; z += T) put(v3(wx + sgn * 0.8, (b.y0 + b.y1) / 2, z), 1.6, H, 1.8, HULL[3]);
      put(v3(wx + sgn * 0.7, b.y0 + H * 0.62, (b.z0 + b.z1) / 2), 1.4, 1.6, b.z1 - b.z0, HULL[1]); put(v3(wx + sgn * 1.1, b.y0 + 0.06, (b.z0 + b.z1) / 2), 2.2, 0.12, b.z1 - b.z0, ACC[2], HZ); }
    for (const [wz, sgn] of [[b.z0, 1], [b.z1, -1]]) { for (let x = b.x0; x <= b.x1 + 0.1; x += T) put(v3(x, (b.y0 + b.y1) / 2, wz + sgn * 0.8), 1.8, H, 1.6, HULL[3]);
      put(v3((b.x0 + b.x1) / 2, b.y0 + H * 0.62, wz + sgn * 0.7), b.x1 - b.x0, 1.6, 1.4, HULL[1]); put(v3((b.x0 + b.x1) / 2, b.y0 + 0.06, wz + sgn * 1.1), b.x1 - b.x0, 0.12, 2.2, ACC[2], HZ);
      g.detail(true); for (let k = 0; k < 3; k++) { const y = b.y0 + 7 + k * 0.9, A = v3(b.x0 + 2, y, wz + sgn * (2.2 + k * 0.15)), B2 = v3(b.x1 - 2, y, wz + sgn * (2.2 + k * 0.15)); if (okBox(new Vec3().lerpVectors(A, B2, 0.5), b.x1 - b.x0, 1.4, 1.4, 2)) pipe(g.mat(0.7, 0.4, 1, PL), A, B2, 0.32 + k * 0.08, k === 1 ? ACC[1] : HULL[2], 8); }
      // the catwalk: a grating on brackets with a railing on its open side
      const cy = b.y1 - 16, cz = wz + sgn * 2.8; if (okBox(v3((b.x0 + b.x1) / 2, cy, cz), b.x1 - b.x0 - 8, 2.4, 3.6, 2)) { g.mat(0.6, 0.5, 1, PL).at((b.x0 + b.x1) / 2, cy, cz).box(b.x1 - b.x0 - 8, 0.3, 3.4, HULL[2]);
        railing(g, [v3(b.x0 + 4, cy + 0.15, cz + sgn * 1.6), v3(b.x1 - 4, cy + 0.15, cz + sgn * 1.6)], 1.1, 2.5, ACC[2]); for (let x = b.x0 + 6; x < b.x1 - 4; x += 8) bar(g, v3(x, cy - 0.2, wz + sgn * 0.4), v3(x, cy - 2.6, wz + sgn * 0.4), 0.3, 0.3, HULL[3]); } g.detail(false); }
    g.detail(true); for (let x = b.x0 + T; x < b.x1 - T / 2; x += T) for (let z = b.z0 + T; z < b.z1 - T / 2; z += T) { const c = v3(x, b.y0 + 0.05, z); if (okBox(c, T * 0.7, 0.2, 0.5, 1)) g.mat(0.3, 0.6, 1, 0).at(c.x, c.y, c.z).box(T * 0.7, 0.1, 0.35, [0.75, 0.75, 0.72, 0]); } g.detail(false); // painted bay lines (detail: drawn within 1.5 km)
    // a dark dado band round the foot of every wall with amber beacons on it, and bay doors in the end walls framed in hazard stripes
    for (const [wx, sgn] of [[b.x0, 1], [b.x1, -1]]) { put(v3(wx + sgn * 0.5, b.y0 + 3.5, (b.z0 + b.z1) / 2), 1, 7, b.z1 - b.z0, [0.16, 0.17, 0.19, 0]);
      for (let z = b.z0 + T; z < b.z1; z += T * 2) { const lp = v3(wx + sgn * 1.1, b.y0 + 7.4, z); if (okBox(lp, 1, 1, 1, 1)) gl.at(lp.x, lp.y, lp.z).box(0.6, 0.5, 1.4, AMBER); } }
    for (const [wz, sgn] of [[b.z0, 1], [b.z1, -1]]) { put(v3((b.x0 + b.x1) / 2, b.y0 + 3.5, wz + sgn * 0.5), b.x1 - b.x0, 7, 1, [0.16, 0.17, 0.19, 0]);
      for (let x = b.x0 + T; x < b.x1; x += T * 2) { const lp = v3(x, b.y0 + 7.4, wz + sgn * 1.1); if (okBox(lp, 1, 1, 1, 1)) gl.at(lp.x, lp.y, lp.z).box(1.4, 0.5, 0.6, AMBER); }
      for (const f of [0.3, 0.7]) { const dx = b.x0 + (b.x1 - b.x0) * f, dw = Math.min(34, (b.x1 - b.x0) * 0.18), dh = Math.min(24, H * 0.55), dc = v3(dx, b.y0 + dh / 2, wz + sgn * 0.3);
        if (!okBox(dc, dw + 4, dh + 4, 2, 2)) continue; put(dc, dw, dh, 0.4, [0.07, 0.075, 0.085, 0]);
        put(v3(dx, b.y0 + dh + 1, wz + sgn * 0.7), dw + 2.4, 2, 1.2, ACC[2], HZ); for (const sd of [-1, 1]) put(v3(dx + sd * (dw / 2 + 0.6), b.y0 + dh / 2, wz + sgn * 0.7), 1.2, dh, 1.2, ACC[2], HZ);
        for (let k = 1; k < 6; k++) put(v3(dx, b.y0 + dh * k / 6, wz + sgn * 0.55), dw - 1, 0.25, 0.3, [0.2, 0.21, 0.23, 0]); } }
    for (let x = b.x0 + T * 1.5; x < b.x1 - T; x += T * 2) for (let z = b.z0 + T; z < b.z1 - T / 2; z += T * 2) { const lp = v3(x, b.y1 - 0.6, z); if (!okBox(lp, 3, 2, 3, 2)) continue;
      gl.at(lp.x, lp.y, lp.z).box(2.6, 0.3, 1.2, LAMP); g.mat(0.6, 0.5, 1, PL).at(lp.x, lp.y + 0.5, lp.z).box(3.2, 0.7, 1.8, HULL[3]); beamCone(beams, lp.clone().add(v3(0, -0.2, 0)), v3(0, -1, 0), H * 0.85, 9, [1, 0.9, 0.75]); }
  };
  // the hangar around the launch straight and the chicane
  const hb = bbox(['start', 'hangar']), HG = { x0: hb.x0 - 90, x1: hb.x1 + 75, y0: -34, y1: 64, z0: hb.z0 - 80, z1: hb.z1 + 70 };
  hall(HG, { tile: 26, strip: AMBER });
  // the cargo hall
  const cb = bbox(['cargo']), CG = { x0: cb.x0 - 40, x1: cb.x1 + 30, y0: cb.y0 - 16, y1: cb.y0 + 26, z0: cb.z0 - 40, z1: cb.z1 + 40 };
  hall(CG, { tile: 20, strip: AMBER });

  // ---------------------------------------------------------------- tunnels round the enclosed course sections
  // an octagonal shell just outside the corridor, built from the course frames (so it twists with a gravity roll),
  // ribs every 16 m, light strips along the upper corners; in a gravity section the floor is the plating (below)
  for (let i = 0; i < N; i += 2) {
    if (!t.tunnel[i]) continue;
    const j = S(i + 2), g = ch.get(i, 'tun'), gl = ch.get(i, 'tunLit'), w = t.w[i] + 2.2, h = t.h[i] + 2.2, c = 0.3, grav = t.grav[i] > 0.01;
    const oct = [[-w * (1 - c), -h], [w * (1 - c), -h], [w, -h * (1 - c)], [w, h * (1 - c)], [w * (1 - c), h], [-w * (1 - c), h], [-w, h * (1 - c)], [-w, -h * (1 - c)]];
    g.mat(0.55, 0.5, 1, PL); g.M = [0.55, 0.5, 1, PL];
    for (let k = 0; k < 8; k++) { if (grav && k === 0) continue; const [ax, ay] = oct[k], [bx, by] = oct[(k + 1) % 8], a0 = P(t, i, ax, ay), b0 = P(t, i, bx, by), a1 = P(t, j, ax, ay), b1 = P(t, j, bx, by);
      const n = new Vec3().crossVectors(new Vec3().subVectors(b0, a0), t.tan[i]).normalize(); const col = HULL[(k + (i >> 3)) % 4];
      const ia = g.raw(a0, n, col), ib = g.raw(b0, n, col), ic = g.raw(b1, n, col), id = g.raw(a1, n, col); g.quad(ia, ib, ic, id); }
    if (i % 8 === 0) { const q = fq(t, i); // a rib: a heavier frame round the shell, and the light strips
      for (let k = 0; k < 8; k++) { if (grav && k === 0) continue; const [ax, ay] = oct[k], [bx, by] = oct[(k + 1) % 8], a = P(t, i, ax * 1.06, ay * 1.06), b = P(t, i, bx * 1.06, by * 1.06), m = new Vec3().lerpVectors(a, b, 0.5);
        g.at(m.x, m.y, m.z, qLook(new Vec3().subVectors(b, a), t.tan[i])).box(1.6, 1.4, a.dist(b) + 1.2, HULL[3]); }
      for (const s of [-1, 1]) { const lp = P(t, i, s * w * 0.92, h * 0.86); gl.at(lp.x, lp.y, lp.z, q).box(0.4, 0.4, 5, i % 32 ? LAMP : RED); }
      for (const s of [-1, 1]) for (const yy of [-0.45, 0.55]) { const bp = P(t, i, s * (t.w[i] + 1.6), yy * t.h[i]); g.mat(0.6, 0.5, 1, PL).at(bp.x, bp.y, bp.z, q).box(1.2, 0.3, 0.5, HULL[3]); } } // V11: brackets
    // V11: pipe runs low on both walls and a cable tray high on them, between the corridor and the shell
    for (const s of [-1, 1]) { pipe(g.mat(0.7, 0.4, 1, PL), P(t, i, s * (t.w[i] + 1.25), -t.h[i] * 0.45), P(t, j, s * (t.w[j] + 1.25), -t.h[j] * 0.45), 0.34, s > 0 ? ACC[1] : HULL[2], 6);
      pipe(g, P(t, i, s * (t.w[i] + 1.35), -t.h[i] * 0.45 - 0.9), P(t, j, s * (t.w[j] + 1.35), -t.h[j] * 0.45 - 0.9), 0.24, HULL[2], 6);
      bar(g.mat(0.6, 0.5, 1, PL), P(t, i, s * (t.w[i] + 1.5), t.h[i] * 0.55), P(t, j, s * (t.w[j] + 1.5), t.h[j] * 0.55), 0.9, 0.18, HULL[3]); }
  }

  // ---------------------------------------------------------------- gravity plating on the deck of every gravity section
  const deck = new Chunks(t, 64);
  for (let i = 0; i < N; i += 1) {
    const f = t.grav[i], f2 = t.grav[S(i + 1)]; if (f < 0.002 && f2 < 0.002) continue;
    const j = S(i + 1), g = deck.get(i, 'deck'), w = t.w[i] + 1.4, y = -t.h[i] - 0.25, u0 = i * t.D / 100, u1 = (i + 1) * t.D / 100;
    const n0 = t.nrm[i], n1 = t.nrm[j], col0 = [0.16, 0.17, 0.2, f], col1 = [0.16, 0.17, 0.2, f2];
    let prev = null; for (let k = 0; k <= 6; k++) { const x = -w + 2 * w * k / 6; g.M = [0, u0, k / 6, 0]; const a = g.raw(P(t, i, x, y), n0, col0); g.M = [0, u1 < u0 ? u0 + t.D / 100 : u1, k / 6, 0]; const b = g.raw(P(t, j, x, y), n1, col1); if (prev) g.quad(prev[0], a, b, prev[1]); prev = [a, b]; }
  }
  // gates where a field begins and ends: a ring of emitters round the corridor with a holographic band
  const gravGates = [];
  for (const z of t.gravZones) for (const i of [S(z.i0 + 6), S(z.i1 - 6)]) { const q = fq(t, i), w = t.w[i] + 3, h = t.h[i] + 3, g = ch.get(i, 'tun'), gl = ch.get(i, 'tunLit');
    for (const [x, y, sx, sy] of [[0, h, 2 * w, 1.6], [0, -h, 2 * w, 1.6], [w, 0, 1.6, 2 * h], [-w, 0, 1.6, 2 * h]]) { const p = P(t, i, x, y); g.mat(0.6, 0.45, 1, DET.struct).at(p.x, p.y, p.z, q).bbox(sx + 1.6, sy + 1.6, 4, 0.4, HULL[3]); gl.at(p.x, p.y, p.z, q).box(sx * 0.96, sy * 0.96, 0.5, [GRAV[0], GRAV[1], GRAV[2], 1]); }
    gravGates.push({ i, p: P(t, i, 0, 0) }); }

  // ---------------------------------------------------------------- the reactor hall: chamber, core, rings, conduits
  const cr = bbox(['core']), CC = v3((cr.x0 + cr.x1) / 2, 0, (cr.z0 + cr.z1) / 2), Rpath = (cr.x1 - cr.x0) / 2, RC = Rpath + 34;
  const coreY0 = cr.y0 - 52, coreY1 = cr.y1 + 52, coreC = v3(CC.x, (coreY0 + coreY1) / 2, CC.z);
  { // chamber: a cylinder of wall panels beyond the plated band, a floor and a dome; panels where a corridor arrives are left out
    const g = big, nA = 64, nY = Math.ceil((coreY1 - coreY0) / 16);
    for (let a = 0; a < nA; a++) for (let k = 0; k < nY; k++) { const an = (a + 0.5) / nA * 6.283, y = coreY0 + (k + 0.5) * (coreY1 - coreY0) / nY, p = v3(CC.x + Math.cos(an) * RC, y, CC.z + Math.sin(an) * RC);
      const q = QY(-an * 57.296 + 90), sz = 6.283 * RC / nA; if (!clear.box(p, v3(sz / 2, 0, 0).applyQuat(q), v3(0, 8, 0), v3(0, 0, 2).applyQuat(q), 2)) continue;
      g.mat(0.6, 0.45, 1, DET.struct).at(p.x, p.y, p.z, q).box(sz - 0.4, (coreY1 - coreY0) / nY - 0.4, 3, HULL[(a + k) % 4]);
      if (k % 3 === 1 && a % 2 === 0) { const lp = new Vec3(Math.cos(an) * (RC - 1.8), 0, Math.sin(an) * (RC - 1.8)).add(v3(CC.x, y, CC.z)); bigLit.at(lp.x, lp.y, lp.z, q).box(sz * 0.6, 0.6, 0.3, VIOLET); } }
    for (const [y, s] of [[coreY0 - 2, 1], [coreY1 + 2, -1]]) for (let r = 0; r < RC; r += 30) for (let a = 0; a < Math.max(8, Math.round(r / 12)); a++) { const n = Math.max(8, Math.round(r / 12)), an = (a + 0.5) / n * 6.283, p = v3(CC.x + Math.cos(an) * (r + 15), y, CC.z + Math.sin(an) * (r + 15));
      if (okBox(p, 30, 3, 6.283 * (r + 15) / n, 2)) g.mat(0.55, 0.5, 1, DET.struct).at(p.x, p.y, p.z, QY(-an * 57.296)).box(28, 3, 6.283 * (r + 15) / n - 0.5, HULL[(a + r) % 4]); void s; }
  }
  const coreItems = [];
  { const sph = new Geo(); sph.M = [0, 0.045, 0.35, 0]; sph.sphere(1, 48, 32, [0.55, 0.65, 1.6, 1.4]);
    const it = { mesh: gfx.mesh(sph.build()), prog: 'v10plasma', pos: coreC.clone(), quat: new Quat(), scale: 52, visible: true }; items.push(it); coreItems.push(it);
    const halo = new Geo(); halo.M = [0, 0.03, 0.2, 0]; halo.sphere(1, 32, 20, [0.25, 0.3, 0.9, 0.5]); items.push({ mesh: gfx.mesh(halo.build()), prog: 'v10plasma', pos: coreC.clone(), quat: new Quat(), scale: 66, blend: 'add', visible: true }); }
  const rings = [];
  for (let k = 0; k < 3; k++) { const g = new Geo().mat(0.7, 0.35, 1, DET.struct); g.torus(1, 0.035, 96, 10, HULL[2]); const gl = new Geo().mat(0, 0.4, 5, 0); for (let m = 0; m < 24; m++) { const a = m / 24 * 6.283; gl.at(Math.cos(a), Math.sin(a), 0).box(0.03, 0.03, 0.06, CYAN); }
    g.merge(gl); const it = { mesh: gfx.mesh(g.build()), prog: 'pbrStruct', pos: coreC.clone(), quat: new Quat(), scale: 80 + k * 16, visible: true }; items.push(it); rings.push({ it, ax: [v3(1, 0, 0), v3(0, 0, 1), v3(0.6, 0.3, 0.74).normalize()][k], w: [0.21, -0.15, 0.11][k] }); }
  // V11: the containment field round the core, magnetic coils stacked above and below it, capacitor banks round the chamber
  const shield = { mesh: gfx.mesh(new Geo().sphere(1, 48, 32, [0.45, 0.65, 1.4, 1]).build()), prog: 'v11shield', blend: 'add', layer: 1, pos: coreC.clone(), quat: new Quat(), scale: 62, visible: true, uniforms: { uShield: [0.55, 14, 1.6, 0] } }; items.push(shield);
  const coilTops = [];
  for (const sgn of [-1, 1]) for (let k = 0; k < 4; k++) { const y = coreC.y + sgn * (64 + k * 11), R0 = 30 - k * 3.5, c = v3(CC.x, y, CC.z); if (!clear.box(c, v3(R0 + 4, 0, 0), v3(0, 3.5, 0), v3(0, 0, R0 + 4), 3)) continue;
    big.mat(0.8, 0.35, 1, PL).at(c.x, c.y, c.z, QX(90)).torus(R0, 2.6, 64, 10, HULL[2]); bigLit.at(c.x, c.y - sgn * 2.2, c.z, QX(90)).torus(R0 - 1.4, 0.35, 64, 4, CYAN);
    for (let m = 0; m < 8; m++) { const a = m / 8 * 6.283; big.at(c.x + Math.cos(a) * R0, c.y, c.z + Math.sin(a) * R0, QY(-a * 57.3)).box(1.4, 6.4, 6.4, HULL[3]); } coilTops.push(c); }
  { const nC = 16; for (let k = 0; k < nC; k++) { const an = (k + 0.5) / nC * 6.283, p = v3(CC.x + Math.cos(an) * (RC - 7), (coreY0 + coreY1) / 2, CC.z + Math.sin(an) * (RC - 7)), hh = coreY1 - coreY0 - 10;
    if (!clear.box(p, v3(4, 0, 0), v3(0, hh / 2, 0), v3(0, 0, 4), 3)) continue; big.mat(0.7, 0.4, 1, PL).at(p.x, p.y, p.z, QX(90)).cyl(2.6, 2.6, hh, 16, HULL[1], true);
    for (let m = 0; m < 6; m++) { const yy = coreY0 + 5 + (m + 0.5) * hh / 6; bigLit.at(p.x, yy, p.z, QX(90)).torus(2.75, 0.22, 20, 4, m % 2 ? CYAN : VIOLET); } } }
  { // conduits: from the core out to the chamber wall above and below the plated band, glowing; and the struts (obstacles)
    const g = new Geo();
    for (let k = 0; k < 12; k++) { const an = k / 12 * 6.283 + 0.13, y = k % 2 ? coreY0 + 14 : coreY1 - 14, a = coreC.clone().add(v3(Math.cos(an) * 56, (y - coreC.y) * 0.25, Math.sin(an) * 56)), b = v3(CC.x + Math.cos(an) * (RC - 2), y, CC.z + Math.sin(an) * (RC - 2));
      if (!clear.box(new Vec3().lerpVectors(a, b, 0.5), new Vec3().subVectors(b, a).scale(0.5), v3(3, 0, 0), v3(0, 3, 0), 3)) continue;
      g.M = [0, 0.06, 0.6, 0]; g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, qLook(new Vec3().subVectors(b, a))).cyl(2.2, 2.6, a.dist(b), 14, [0.4, 0.55, 1.4, 1.2], false); }
    items.push({ mesh: gfx.mesh(g.build()), prog: 'v10plasma', visible: true }); }
  for (const o of t.obstacles) if (o.kind === 'strut') { const i = o.i, a = P(t, i, o.x, -t.h[i] - 3), b = P(t, i, o.x, t.h[i] + 40), m = new Vec3().lerpVectors(a, b, 0.5), q = qLook(new Vec3().subVectors(b, a), t.tan[i]);
    ch.get(i, 'tun').mat(0.7, 0.4, 1, PL).at(m.x, m.y, m.z, q).cyl(o.r * 0.98, o.r * 0.98, a.dist(b), 20, HULL[2], true);
    for (let k = -3; k <= 3; k++) { const p = new Vec3().lerpVectors(a, b, 0.5 + k * 0.1); ch.get(i, 'tunLit').at(p.x, p.y, p.z, q).torus(o.r * 1.02, 0.12, 24, 4, k % 2 ? AMBER : CYAN); } }

  // ---------------------------------------------------------------- the glass corridors: frames, panes, the planet below
  const glass = new Chunks(t, 64);
  for (const tag of ['glassentry', 'glass']) for (const i0 of at(tag)) { if (i0 % 3) continue;
    const i = i0, j = S(i + 3), w = t.w[i] + 1.6, h = t.h[i] + 1.6, c = 0.32, oct = [[-w * (1 - c), -h], [w * (1 - c), -h], [w, -h * (1 - c)], [w, h * (1 - c)], [w * (1 - c), h], [-w * (1 - c), h], [-w, h * (1 - c)], [-w, -h * (1 - c)]];
    const g = glass.get(i, 'glass'), fg = ch.get(i, 'tun'), gl = ch.get(i, 'tunLit');
    for (let k = 1; k < 8; k++) { const [ax, ay] = oct[k], [bx, by] = oct[(k + 1) % 8]; const a0 = P(t, i, ax, ay), b0 = P(t, i, bx, by), a1 = P(t, j, ax, ay), b1 = P(t, j, bx, by), n = new Vec3().crossVectors(new Vec3().subVectors(b0, a0), t.tan[i]).normalize();
      g.M = [0, 0, 0, 0]; const ia = g.raw(a0, n, [0.6, 0.7, 0.8, 0]); g.M = [0, 1, 0, 0]; const ib = g.raw(b0, n, [0.6, 0.7, 0.8, 0]); g.M = [0, 1, 1, 0]; const ic = g.raw(b1, n, [0.6, 0.7, 0.8, 0]); g.M = [0, 0, 1, 0]; const id = g.raw(a1, n, [0.6, 0.7, 0.8, 0]); g.quad(ia, ib, ic, id); }
    if (i % 12 === 0) { const q = fq(t, i); for (let k = 0; k < 8; k++) { const [ax, ay] = oct[k], [bx, by] = oct[(k + 1) % 8], a = P(t, i, ax * 1.04, ay * 1.04), b = P(t, i, bx * 1.04, by * 1.04), m = new Vec3().lerpVectors(a, b, 0.5);
      fg.mat(0.6, 0.4, 1, DET.struct).at(m.x, m.y, m.z, qLook(new Vec3().subVectors(b, a), t.tan[i])).box(1.2, 1.2, a.dist(b) + 1, HULL[2]); }
      const lp = P(t, i, 0, -h * 1.02); gl.at(lp.x, lp.y, lp.z, q).box(w * 1.6, 0.3, 0.5, CYAN); }
    if (i % 60 === 0) { // pylons that hold the tube to the hull above it (the station's side)
      const top = P(t, i, 0, -h - 2), up = new Vec3().copy(t.nrm[i]).scale(-1), foot = top.clone().addScaled(up, 70); if (okBox(new Vec3().lerpVectors(top, foot, 0.5), 6, 6, 6, 2)) truss(fg.mat(0.6, 0.5, 1, DET.struct), top, foot, 4, 6, HULL[1]); }
  }

  // ---------------------------------------------------------------- the Spindle: great rings turning round the shaft
  const spinners = [];
  { const ids = at('spindle'), a = t.pos[ids[0]], b = t.pos[ids[ids.length - 1]], ax = new Vec3().subVectors(b, a).normalize();
    const ringG = new Geo().mat(0.7, 0.4, 1, DET.struct); ringG.torus(1, 0.06, 64, 8, HULL[2]); for (let k = 0; k < 6; k++) { const an = k / 6 * 6.283; ringG.at(Math.cos(an) * 0.93, Math.sin(an) * 0.93, 0, QZ(an * 57.3)).box(0.14, 0.05, 0.08, HULL[0]); }
    const ringLit = new Geo().mat(0, 0.4, 5, 0); for (let k = 0; k < 18; k++) { const an = k / 18 * 6.283; ringLit.at(Math.cos(an) * 1.06, Math.sin(an) * 1.06, 0).box(0.03, 0.03, 0.04, k % 3 ? CYAN : VIOLET); } ringG.merge(ringLit);
    const mesh = gfx.mesh(ringG.build());
    for (let k = 0; k < 6; k++) { const p = new Vec3().lerpVectors(a, b, (k + 0.5) / 6), it = { mesh, pos: p, quat: qLook(ax), scale: 46 + (k % 2) * 6, visible: true, prog: 'pbrStruct', br: 1.2 }; items.push(it); spinners.push({ it, q0: qLook(ax), w: (k % 2 ? 1 : -1) * (0.5 + k * 0.08) }); }
    // the shaft's outer casing between the rings
    for (let k = 0; k <= 6; k++) { const p = new Vec3().lerpVectors(a, b, k / 6); big.mat(0.6, 0.5, 1, DET.struct).at(p.x, p.y, p.z, qLook(ax)).torus(36, 2.5, 40, 8, HULL[3]); }
  }

  // ---------------------------------------------------------------- the station body: hull blocks with windows round the halls
  { const B0 = { x0: HG.x0 - 140, x1: 440, z0: CG.z0 - 60, z1: CC.z + RC + 90 };
    for (let x = B0.x0; x < B0.x1; x += 70) for (let z = B0.z0; z < B0.z1; z += 70) {
      const inHall = halls.some(b => x > b.x0 - 40 && x < b.x1 + 40 && z > b.z0 - 40 && z < b.z1 + 40) || Math.hypot(x - CC.x, z - CC.z) < RC + 40; if (inHall && R() < 0.85) continue;
      const hgt = 60 + R() * 120, y0 = -150 + R() * 40, c = v3(x + 35 + (R() - 0.5) * 10, y0 + hgt / 2, z + 35 + (R() - 0.5) * 10), sx = 50 + R() * 18, sz = 50 + R() * 18;
      if (!okBox(c, sx, hgt, sz, 6) || halls.some(b => c.x + sx / 2 > b.x0 && c.x - sx / 2 < b.x1 && c.z + sz / 2 > b.z0 && c.z - sz / 2 < b.z1 && c.y + hgt / 2 > b.y0 - 6 && c.y - hgt / 2 < b.y1 + 6)) continue;
      facade.mat(0.45, 0.5, 1, DET.facade).at(c.x, c.y, c.z).bbox(sx, hgt, sz, 1.5, HULL[Math.floor(R() * 4)]);
      if (R() < 0.4) { const tp = v3(c.x, c.y + hgt / 2 + 12, c.z); if (okBox(tp, 14, 24, 14, 6)) { big.mat(0.6, 0.5, 1, DET.struct).at(tp.x, tp.y, tp.z).bbox(14, 24, 14, 1, HULL[1]); bigLit.at(tp.x, tp.y + 13, tp.z).box(1.5, 1.5, 1.5, RED); lights.push({ p: v3(tp.x, tp.y + 14, tp.z), c: [3, 0.3, 0.2], s: 4, blink: 1.1, ph: R() }); } }
    }
    // the hangar's outer shell and its open space door on the west side
    const S0 = HG; for (const [x, z, sx, sz] of [[S0.x0 - 12, (S0.z0 + S0.z1) / 2, 18, S0.z1 - S0.z0 + 40]]) { const c = v3(x, 15, z); if (okBox(c, sx, 98, sz, 4)) facade.mat(0.45, 0.5, 1, DET.facade).at(c.x, c.y, c.z).bbox(sx, 98, sz, 2, HULL[1]); }
  }
  // radiators and solar wings on the hull along the exterior section, docking arms with ships
  { const ex = at('exterior');
    for (let k = 0; k < ex.length; k += 9) { const i = ex[k], s = -1, base = P(t, i, s * (t.w[i] + 60), -20), up = v3(0, 1, 0);
      if (k % 18 === 0) { const c = base.clone().add(v3(0, 40, 0)); if (okBox(c, 6, 80, 40, 4)) { big.mat(0.6, 0.5, 1, DET.struct).at(c.x, c.y, c.z, qLook(t.tan[i])).box(4, 80, 36, [0.82, 0.83, 0.85, 0]); for (let m = 0; m < 6; m++) bigLit.at(c.x, c.y - 36 + m * 14, c.z, qLook(t.tan[i])).box(4.4, 0.6, 30, [1, 0.55, 0.2, 1]); } }
      else { const c = base.clone().add(v3(0, -30, 0)); if (okBox(c, 40, 3, 70, 4)) { big.mat(0.3, 0.3, 1, SOLAR).at(c.x, c.y, c.z, qLook(t.tan[i])).box(60, 1.5, 70, [0.12, 0.22, 0.5, 0]); big.mat(0.6, 0.5, 1, DET.struct).at(c.x, c.y, c.z, qLook(t.tan[i])).box(62, 0.8, 4, HULL[2]); } } void up; } }
  // the hull under the exterior section: plating with seams, vents and pipe runs, and beacons along its edges, 42 m
  // below the course, so the open section is raced over the station's skin rather than over empty space
  { const ids = at('exterior');
    for (let k = 0; k < ids.length; k += 4) { const i = ids[k], q = fq(t, i), W = t.w[i] + 70, y = -t.h[i] - 42, c = P(t, i, 0, y); if (!okBox(c, 2 * W, 8, 20, 6)) continue;
      big.mat(0.55, 0.55, 1, DET.struct).at(c.x, c.y, c.z, q).bbox(2 * W, 8, 17.6, 0.8, HULL[(k >> 2) % 4]);
      for (let m = 0; m < 3; m++) { const x = (R() - 0.5) * 1.8 * W, sz = 2 + R() * 6, p = P(t, i, x, y + 4 + sz / 2); if (okBox(p, sz * 3, sz, sz * 3, 4)) big.at(p.x, p.y, p.z, q).box(sz * (1 + R()), sz, sz * (1 + R() * 2), HULL[(m + k) % 4]); }
      if (k % 16 === 0) for (const sd of [-1, 1]) { const p = P(t, i, sd * (W - 3), y + 5); bigLit.at(p.x, p.y, p.z, q).box(1.2, 1.2, 1.2, sd < 0 ? RED : [0.3, 1, 0.4, 1]); lights.push({ p, c: sd < 0 ? [3, 0.3, 0.2] : [0.4, 3, 0.6], s: 3, blink: 1.3, ph: k * 0.1 }); }
      // V11: pipe runs along the skin, a lattice antenna or a dish now and then, rows of lit ports, vents
      const j2 = ids[Math.min(ids.length - 1, k + 4)]; big.detail(true); for (const xx of [-0.62, -0.55, 0.58]) { const a2 = P(t, i, xx * W, y + 4.8), b2 = P(t, j2, xx * W, y + 4.8); if (okBox(new Vec3().lerpVectors(a2, b2, 0.5), 3, 3, a2.dist(b2), 4)) pipe(big.mat(0.7, 0.4, 1, PL), a2, b2, 0.8, xx > 0 ? ACC[1] : HULL[2], 8); }
      if (k % 24 === 8) { const ap = P(t, i, -0.3 * W, y + 4); if (okBox(v3(ap.x, ap.y + 14, ap.z), 6, 30, 6, 4)) { lattice(big.mat(0.6, 0.5, 1, PL), v3(ap.x, ap.y, ap.z), 26, 2.6, HULL[2], 0.35, 3); bigLit.at(ap.x, ap.y + 27, ap.z).box(0.8, 0.8, 0.8, RED); lights.push({ p: v3(ap.x, ap.y + 27, ap.z), c: [3, 0.3, 0.2], s: 3, blink: 0.9, ph: k * 0.3 }); } } big.detail(false);
      if (k % 24 === 20) { const dp = P(t, i, 0.35 * W, y + 4); if (okBox(v3(dp.x, dp.y + 8, dp.z), 16, 16, 16, 4)) { big.mat(0.6, 0.45, 1, PL).at(dp.x, dp.y + 3, dp.z, QX(90)).cyl(1.2, 1.6, 6, 10, HULL[1], false); big.at(dp.x, dp.y + 8, dp.z, QX(-60).multiply(QY(k * 17))).lathe([[0.4, -1.5], [4, -0.5], [7, 1.6]], 24, [0.86, 0.87, 0.88, 0]); } }
      if (k % 8 === 4) for (let m = 0; m < 6; m++) { const lp = P(t, i, (-0.9 + m * 0.07) * W, y + 4.1); bigLit.at(lp.x, lp.y, lp.z, q).box(1.6, 0.25, 1, m % 3 ? [0.75, 0.88, 1, 1] : LAMP); } } }
  // the docking spine: arms reaching out with freighters moored at them
  const hauler = gfx.mesh(buildHauler()), patrol = gfx.mesh(buildPatrol());
  { const sp = v3(CC.x + 520, -40, CC.z - 120);
    for (let k = 0; k < 5; k++) { const a = v3(sp.x + k * 140, -40, sp.z + 60), b = v3(a.x, -40, a.z + 260); if (!okBox(new Vec3().lerpVectors(a, b, 0.5), 12, 12, 260, 6)) continue; truss(big.mat(0.6, 0.5, 1, DET.struct), a, b, 10, 12, HULL[1]);
      const it = { mesh: hauler, pos: v3(b.x, -40, b.z + 90), quat: QY(180), scale: 3.2, visible: true, br: 200 }; if (okBox(it.pos, 120, 60, 260, 6)) items.push(it); } }
  // ships in the hangar: freighters and patrol craft on cradles along the walls
  for (let k = 0; k < 8; k++) { const side = k % 2 ? 1 : -1, z = HG.z0 + 60 + (k >> 1) * ((HG.z1 - HG.z0 - 120) / 3), x = side > 0 ? HG.x1 - 34 : HG.x0 + 34, p = v3(x, HG.y0 + 14, z), big2 = k % 3 === 0;
    if (!okBox(p, big2 ? 60 : 30, 24, big2 ? 110 : 40, 4)) continue; items.push({ mesh: big2 ? hauler : patrol, pos: p, quat: QY(side > 0 ? -90 : 90), scale: big2 ? 1.6 : 2.2, visible: true, br: 120 });
    big.mat(0.6, 0.5, 1, PL).at(x, HG.y0 + 3, z).bbox(40, 6, 60, 1, ACC[k % 3]); bigLit.at(x, HG.y0 + 6.2, z).box(30, 0.3, 0.6, AMBER);
    // V11: docking clamps reaching up to the hull, fuel and power lines from the wall, a gantry with steps to the hatch
    big.detail(true); for (const sd of [-1, 1]) for (const dz of [-14, 14]) bar(big.mat(0.7, 0.45, 1, HZ), v3(x + sd * 16, HG.y0 + 6, z + dz), v3(x + sd * (big2 ? 9 : 6), HG.y0 + 12, z + dz), 1.4, 1.4, ACC[2]);
    { const wx = side > 0 ? HG.x1 - 1.5 : HG.x0 + 1.5; pipe(big.mat(0.7, 0.4, 1, PL), v3(wx, HG.y0 + 1.2, z - 4), v3(x - side * 18, HG.y0 + 1.2, z - 4), 0.5, ACC[1], 8); pipe(big, v3(wx, HG.y0 + 1.2, z + 4), v3(x - side * 18, HG.y0 + 1.2, z + 4), 0.4, HULL[2], 8);
      const gw = v3(x - side * 22, HG.y0 + 8, z + 20); if (okBox(gw, 6, 16, 6, 3)) { big.mat(0.6, 0.5, 1, PL).at(gw.x, gw.y, gw.z).box(4, 0.4, 4, HULL[2]); bar(big, v3(gw.x, HG.y0, gw.z), v3(gw.x, gw.y, gw.z), 0.5, 0.5, HULL[3]); railing(big, [v3(gw.x - 2, gw.y + 0.2, gw.z - 2), v3(gw.x + 2, gw.y + 0.2, gw.z - 2), v3(gw.x + 2, gw.y + 0.2, gw.z + 2)], 1.1, 2, ACC[2]); } } big.detail(false); }
  // cargo containers stacked in both halls and cranes over the hangar floor
  for (const Hh of [HG, CG]) for (let k = 0; k < 70; k++) { const p = v3(Hh.x0 + 8 + R() * (Hh.x1 - Hh.x0 - 16), Hh.y0 + 3, Hh.z0 + 8 + R() * (Hh.z1 - Hh.z0 - 16)), n = 1 + Math.floor(R() * 3), q = QY(R() < 0.5 ? 0 : 90);
    for (let m = 0; m < n; m++) { const c = v3(p.x, Hh.y0 + 1.5 + m * 6.2 + 3, p.z); if (!okBox(c, 14, 6, 14, 3)) break; big.mat(0.4, 0.6, 1, DET.container).at(c.x, c.y, c.z, q).box(6, 6, 13, [...CONT[(k * 5 + m * 3) % CONT.length].map(v => v * (0.8 + 0.1 * ((k * 7 + m) % 3))), 0]); } }
  for (let x = HG.x0 + 40; x < HG.x1 - 20; x += 90) { const a = v3(x, HG.y1 - 8, HG.z0 + 10), b = v3(x, HG.y1 - 8, HG.z1 - 10); if (okBox(new Vec3().lerpVectors(a, b, 0.5), 6, 6, HG.z1 - HG.z0, 2)) { truss(big.mat(0.6, 0.5, 1, DET.struct), a, b, 5, 8, ACC[2]); } }
  // the obstacles of the open and enclosed sections: the crane bridge over the launch straight, masts, pillars, clamps
  for (const o of t.obstacles) {
    const i = o.i, q = fq(t, i), g = ch.get(i, 'tun'), gl = ch.get(i, 'tunLit');
    if (o.type === 'hbeam') { const a = P(t, i, -t.w[i] - 30, o.y), b = P(t, i, t.w[i] + 30, o.y), m = new Vec3().lerpVectors(a, b, 0.5); g.mat(0.65, 0.45, 1, HZ).at(m.x, m.y, m.z, qLook(new Vec3().subVectors(b, a), t.nrm[i])).cyl(o.r * 0.98, o.r * 0.98, a.dist(b), 18, ACC[2], true);
      for (let k = -4; k <= 4; k++) { const p = new Vec3().lerpVectors(a, b, 0.5 + k * 0.08); gl.at(p.x, p.y - o.r - 0.2, p.z, q).box(1.2, 0.3, 1.2, AMBER); } continue; }
    if (o.type !== 'vbeam' || o.kind === 'strut') continue;
    const a = P(t, i, o.x, -t.h[i] - (o.kind === 'mast' ? 60 : 4)), b = P(t, i, o.x, t.h[i] + (o.kind === 'mast' ? 30 : 4)), m = new Vec3().lerpVectors(a, b, 0.5);
    g.mat(0.6, 0.45, 1, o.kind === 'mast' ? PL : HZ).at(m.x, m.y, m.z, qLook(new Vec3().subVectors(b, a), t.tan[i])).cyl(o.r * 0.98, o.r * 0.98, a.dist(b), 18, o.kind === 'mast' ? HULL[2] : ACC[(i >> 2) % 3], true);
    for (let k = 0; k < 5; k++) { const p = new Vec3().lerpVectors(a, b, 0.2 + k * 0.15); gl.at(p.x, p.y, p.z, q).torus(o.r * 1.03, 0.1, 20, 4, k % 2 ? RED : AMBER); }
    if (o.kind === 'mast') { lights.push({ p: b.clone().addScaled(t.nrm[i], 2), c: [3.5, 0.4, 0.2], s: 4, blink: 0.8, ph: i * 0.1 }); gl.at(b.x, b.y, b.z).box(1.5, 1.5, 1.5, RED); }
  }
  // cargo pods (the moving obstacles): one mesh per pod, moved along their lane every frame
  const pods = [], podMesh = gfx.mesh(new Geo().mat(0.5, 0.5, 1, DET.container).bbox(5.6, 5.6, 5.6, 0.6, ACC[0]).merge(new Geo().mat(0, 0.4, 4, 0).at(0, 2.9, 0).box(4, 0.2, 4, AMBER)).build());
  for (const lane of t.traffic) for (let k = 0; k < lane.n; k++) { const it = { mesh: podMesh, pos: new Vec3(), quat: fq(t, lane.i), scale: lane.r / 2.9, visible: true, br: 6 }; items.push(it); pods.push({ lane, k, it }); }
  for (const lane of t.traffic) { const a = P(t, lane.i, -t.w[lane.i] - 70, lane.y - lane.r - 0.5), b = P(t, lane.i, t.w[lane.i] + 70, lane.y - lane.r - 0.5), m = new Vec3().lerpVectors(a, b, 0.5); ch.get(lane.i, 'tunLit').at(m.x, m.y, m.z, fq(t, lane.i)).box(a.dist(b), 0.25, 1, AMBER); }

  // V11: a shipyard in the distance, a capital hull half built inside its frame, and a second, smaller station
  { const Y = v3(CC.x - 2600, 300, CC.z + 1900), L2 = 900, W2 = 260, H2 = 220;
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bar(big.mat(0.6, 0.5, 1, PL), v3(Y.x + ax * W2 / 2, Y.y - H2 / 2, Y.z + az * L2 / 2), v3(Y.x + ax * W2 / 2, Y.y + H2 / 2, Y.z + az * L2 / 2), 10, 10, HULL[1]);
    for (let k = 0; k <= 8; k++) { const z = Y.z - L2 / 2 + k * L2 / 8; for (const yy of [-1, 1]) bar(big, v3(Y.x - W2 / 2, Y.y + yy * H2 / 2, z), v3(Y.x + W2 / 2, Y.y + yy * H2 / 2, z), 8, 8, HULL[3]); for (const xx of [-1, 1]) bar(big, v3(Y.x + xx * W2 / 2, Y.y - H2 / 2, z), v3(Y.x + xx * W2 / 2, Y.y + H2 / 2, z), 7, 7, HULL[3]);
      for (const xx of [-1, 1]) { bigLit.at(Y.x + xx * W2 / 2, Y.y + H2 / 2 + 6, z).box(6, 6, 6, k % 2 ? AMBER : LAMP); lights.push({ p: v3(Y.x + xx * W2 / 2, Y.y + H2 / 2 + 6, z), c: [3, 2.2, 1.2], s: 26, blink: k % 3 ? 0 : 1.6, ph: k * 0.2 }); } }
    big.mat(0.55, 0.55, 1, PL).at(Y.x, Y.y, Y.z - L2 * 0.12).plate([[-70, -330], [70, -330], [85, 150], [0, 330], [-85, 150]], 110, HULL[0], 6); // the hull on its slip, its stern still open frames
    for (let k = 0; k < 6; k++) bar(big, v3(Y.x - 80, Y.y - 50 + k * 20, Y.z - L2 * 0.12 - 330), v3(Y.x + 80, Y.y - 50 + k * 20, Y.z - L2 * 0.12 - 330), 4, 4, HULL[2]);
    const S2 = v3(CC.x + 4200, 900, CC.z - 3600); big.mat(0.6, 0.5, 1, PL).at(S2.x, S2.y, S2.z, QX(70)).torus(380, 26, 96, 10, HULL[0]); big.at(S2.x, S2.y, S2.z, QX(70)).cyl(40, 40, 520, 20, HULL[1], true);
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283; bar(big, S2, new Vec3(Math.cos(a) * 380, Math.sin(a) * 380, 0).applyQuat(QX(70)).add(S2), 9, 9, HULL[2]); }
    for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283, p = new Vec3(Math.cos(a) * 408, Math.sin(a) * 408, 0).applyQuat(QX(70)).add(S2); bigLit.at(p.x, p.y, p.z).box(8, 8, 8, LAMP); } }

  // ---------------------------------------------------------------- the habitat ring, traffic in space, the planet below
  const hab = { it: null, ax: v3(0.2, 0.95, -0.25).normalize() };
  { const g = new Geo().mat(0.6, 0.5, 1, DET.facade); g.torus(1, 0.05, 160, 16, HULL[0]); const gl = new Geo().mat(0, 0.4, 4, 0); for (let k = 0; k < 120; k++) { const a = k / 120 * 6.283; gl.at(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0).box(0.012, 0.012, 0.03, LAMP); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.at(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0, QZ(a * 57.3)).box(1, 0.02, 0.02, HULL[1]); } g.at(0, 0, 0).cyl(0.06, 0.06, 0.12, 24, HULL[2], true); g.merge(gl);
    hab.it = { mesh: gfx.mesh(g.build()), pos: v3(CC.x + 1600, 450, CC.z + 2400), quat: qLook(hab.ax), scale: 1500, visible: true, prog: 'pbrCity' }; items.push(hab.it); }
  const mv = movers([
    ...[0, 1, 2, 3].map(k => ({ mesh: patrol, scale: 1.5, br: 30, path: (time, p, q) => { const a = time * (0.05 + k * 0.012) + k * 1.6, Rr = 1300 + k * 240; p.set(CC.x + Math.cos(a) * Rr, -200 + k * 120 + Math.sin(a * 2) * 40, CC.z - 400 + Math.sin(a) * Rr); q.setAxisAngle(0, 1, 0, -a); },
      lights: [{ x: 7.2, y: 0, z: -6, s: 2.4, c: [4, 0.4, 0.3], blink: 1.4, ph: k }, { x: -7.2, y: 0, z: -6, s: 2.4, c: [0.4, 4, 0.6], blink: 1.4, ph: k + 0.4 }] })),
    ...[0, 1].map(k => ({ mesh: hauler, scale: 3, br: 160, path: (time, p, q) => { const u = ((time * 0.012 + k * 0.5) % 1), a = v3(CC.x - 3000, 200 + k * 300, CC.z - 2000 + k * 900), b = v3(CC.x + 1800, -60, CC.z - 200 + k * 200); p.lerpVectors(a, b, u); q.copy(qLook(new Vec3().subVectors(b, a))); },
      lights: [{ x: 9, y: 0, z: -40, s: 5, c: [4, 0.5, 0.3], blink: 1.1, ph: k }] }))]);
  items.push(...mv.items);

  // ---------------------------------------------------------------- the course kit
  const hex = hexField(gfx, t, i => !t.tunnel[i] && !(t.grav[i] > 0.01), [0.5, 0.65, 1]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), rg = routeGuides(gfx, t, { colL: [1, 0.62, 0.2], colR: [0.35, 0.75, 1], corners: i => t.tunnel[i] ? [] : [0, 1, 2, 3], open: i => !t.tunnel[i] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...rg.items);
  items.push(...ch.items(gfx, 'tun', { prog: 'v11metalStn', uniforms: NU, cast: true, maxDist: 4000 }), ...ch.items(gfx, 'tunLit', { prog: 'pbrStruct', maxDist: 4000 }));
  items.push(...deck.items(gfx, 'deck', { prog: 'v10grav', maxDist: 3000, uniforms: { uGravCol: GRAV } }), ...glass.items(gfx, 'glass', { prog: 'v10glass', blend: 'normal', layer: 1, maxDist: 3000 }));
  // the detail layer (conduits, railings, bay lines, hull pipes, masts) is drawn while a feature of about 0.4 m still covers most of a pixel
  const lod = new DetailLOD(), fr = new Frustum(), bigItems = big.items(gfx, { prog: 'v11metalStn', uniforms: NU, cast: true }, 1500); lod.add(bigItems.filter(it => it.maxDist), 0.4);
  items.push(...bigItems, ...facade.items(gfx, { prog: 'pbrCity', cast: true }), ...bigLit.items(gfx, { prog: 'pbrStruct' }));
  items.push(...cellItems(gfx, beams, 300, { prog: 'v11beam', blend: 'add', layer: 1, uniforms: { uBeam: [0.12, 0, 0.9, 1500] }, maxDist: 1500 })); // in cells: a beam fades to nothing at its range (1.5 km) and is not drawn beyond it

  const env = { sunDir: v3(0.62, 0.42, -0.66).normalize(), sunCol: [3.6, 3.4, 3.15], fogCol: [0.012, 0.016, 0.03], fog: 0.00008, envInt: 1.85, expo: 1.05, shafts: 0.45, reverb: 'trench',
    dirt: 0.45, streak: 0.55, flare: 0.75, nebA: [0.18, 0.28, 0.65], nebB: [0.45, 0.2, 0.55], nebC: [0.85, 0.9, 1], base: [0.004, 0.006, 0.012], neb: 0.75, seed: 31.3, sat: 1.04, lift: [0.004, 0.006, 0.012], gain: [1.0, 1.0, 1.04],
    planet: { dir: v3(-0.25, -0.88, 0.4), dist: 15500, r: 10500, type: 0, tilt: 8, bright: 0.9, a: [0.14, 0.3, 0.55], b: [0.32, 0.42, 0.22], c: [0.85, 0.82, 0.72], atmo: [0.45, 0.7, 1] } };
  items.push(...planetItems(gfx, env, t.def.seed));
  items.push(...planetItems(gfx, { ...env, sky: null, planet: { dir: v3(0.55, 0.32, 0.77), dist: 26000, r: 1600, type: 2, tilt: 30, bright: 0.7, a: [0.75, 0.72, 0.7], b: [0.5, 0.48, 0.46], c: [0.95, 0.94, 0.92], atmo: [0.6, 0.6, 0.65] } }, t.def.seed + 7));

  // ---------------------------------------------------------------- announcements: the station's districts on the first
  // lap, and on every lap a word before each gravity change (where the field begins, where the deck turns, where it ends)
  const notes = [], RAD = 180 / Math.PI, dR = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  for (let i = 0; i < N; i++) if (Math.abs(dR(t.roll[S(i - 1)], t.roll[i])) < 1e-5 && Math.abs(dR(t.roll[i], t.roll[S(i + 1)])) > 1e-5) { let j = i; while (Math.abs(dR(t.roll[S(j)], t.roll[S(j + 1)])) > 1e-5 && j < i + N) j++;
    const to = ((Math.round(t.roll[S(j)] * RAD / 90) * 90) % 360 + 360) % 360; notes.push({ i: S(i - 25), text: to === 270 ? 'Gravity · the deck turns to the wall' : to === 180 ? 'Gravity · the deck turns to the ceiling' : 'Gravity · the deck turns upright', style: 'ion' }); }
  for (const z of t.gravZones) { if (!notes.some(n => Math.abs(n.i - z.i0) < 40)) notes.push({ i: S(z.i0 - 8), text: 'Gravity field · hold the deck', style: 'ion' }); notes.push({ i: S(z.i1 - 25), text: 'Gravity off · zero-g', style: 'ion' }); }
  for (const [tag, text] of [['hangar', 'Hangar District'], ['coreentry', 'Energy Core'], ['glassentry', 'Transparent Corridors'], ['spindle', 'Gravity Spindle'], ['exterior', 'Exterior'], ['aperture', 'Return to the station'], ['cargo', 'Cargo Levels']]) { const a = at(tag); if (!a.length) continue;
    const g = notes.find(n => !n.first && Math.abs(t.deltaS(n.i * t.D, a[0] * t.D)) < 160); if (g) g.section = text; else notes.push({ i: a[0], text, style: '', first: true }); }
  notes.sort((a, b) => a.i - b.i); let lastTi = -1;
  const notice = (me) => { if (!me || me.wrecked) return null; const ti = me.ti, prev = lastTi; lastTi = ti; if (prev < 0 || prev === ti) return null;
    const passed = n => (prev < ti ? n.i > prev && n.i <= ti : n.i > prev || n.i <= ti) && Math.abs(ti - prev) < 40;
    for (const n of notes) if (passed(n) && (!n.first || me.lap <= 1)) return { text: n.section && me.lap <= 1 ? `${n.section} · ${n.text.replace('Gravity · ', '')}` : n.text, style: n.style, dur: 1.8 }; return null; };

  // V11: where the deck turns, lights chase round the shell in the direction it turns (just inside the shell)
  const turns = []; for (let i = 0; i < N; i++) { const d0 = dR(t.roll[S(i - 1)], t.roll[i]), d1 = dR(t.roll[i], t.roll[S(i + 1)]); if (Math.abs(d0) < 1e-5 && Math.abs(d1) > 1e-5) turns.push({ i, dir: Math.sign(d1) }); }
  const chase = []; for (const tn of turns) for (let k = -10; k <= 30; k += 8) { const i = S(tn.i + k), w = t.w[i] + 1.9, h = t.h[i] + 1.9, pts = [];
    for (let m = 0; m < 20; m++) { const a = m / 20 * 6.283, ca = Math.cos(a), sa = Math.sin(a), sc = 1 / Math.max(Math.abs(ca) / w, Math.abs(sa) / h); pts.push({ x: ca * sc * 0.97, y: sa * sc * 0.97, a }); }
    chase.push({ i, dir: tn.dir, pts, ph: k * 0.05 }); }
  let moteT = 0, arc = null, arcT = 1.5;
  // ---------------------------------------------------------------- per frame
  let sparkT = 0;
  release(ch, deck, glass, big, bigLit, facade, beams); // every mesh is made: the vertex lists go (v11kit)
  return { items, env, cull(cam) { fr.set(cam, gfx); lod.update(fr); }, notice,
    hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); mv.update(dt, time, fx); rg.update(fx, cam, race, time);
      const c = cam.pos;
      for (const r of rings) r.it.quat.setAxisAngle(r.ax.x, r.ax.y, r.ax.z, time * r.w);
      coreItems[0].quat.setAxisAngle(0, 1, 0, time * 0.05);
      for (const s of spinners) s.it.quat.copy(s.q0).multiply(new Quat().setAxisAngle(0, 0, 1, time * s.w));
      hab.it.quat.copy(qLook(hab.ax)).multiply(new Quat().setAxisAngle(0, 0, 1, time * 0.02));
      if (race) for (const p of pods) { const l = p.lane, x = t.trafficCarX(l, p.k, race.time); P(t, l.i, x, l.y).clone(); p.it.pos.copy(P(t, l.i, x, l.y)); p.it.visible = Math.abs(x) < t.w[l.i] + 60; }
      // the core's corona and sparks along the plated decks near the camera
      if (coreC.dist(c) < 2500) { fx.bbAdd.add(coreC.x, coreC.y, coreC.z, 190, 0.5, 0.6, 1.6, 0.55); fx.bbAdd.add(coreC.x, coreC.y, coreC.z, 120, 1.2, 1.3, 2.4, 0.7); }
      if ((sparkT -= dt) < 0 && race) { sparkT = 0.05; const me = race.player; if (me && t.grav[me.ti] > 0.2) { const i = S(me.ti + 6 + Math.floor(Math.random() * 20)), p = P(t, i, (Math.random() - 0.5) * 2 * t.w[i], -t.h[i] + 0.4), n = t.nrm[i];
        fx.spawn(p.x, p.y, p.z, n.x * 3, n.y * 3, n.z * 3, 0.8, 0.5, 0.1, GRAV[0] * 2, GRAV[1] * 2, GRAV[2] * 2.6, 1, true, 0.5); } }
      for (const g of gravGates) if (g.p.dist(c) < 900) fx.bbAdd.add(g.p.x, g.p.y, g.p.z, 10, GRAV[0], GRAV[1], GRAV[2] * 1.4, 0.25 + 0.15 * Math.sin(time * 4 + g.i));
      // V11: the lights chasing round the shell where the deck turns
      for (const ch2 of chase) { const p0 = t.pos[ch2.i]; if (p0.dist(c) > 500) continue; const head = (time * 1.6 * ch2.dir + ch2.ph) % 1;
        for (const pt of ch2.pts) { let d = (pt.a / 6.283 - head) * ch2.dir; d -= Math.floor(d); const k = Math.max(0, 1 - d * 4); if (k < 0.05) continue; const p = P(t, ch2.i, pt.x, pt.y); fx.bbAdd.add(p.x, p.y, p.z, 1.4 + k, GRAV[0] * 2, GRAV[1] * 2, GRAV[2] * 2.6, k); } }
      // V11: motes of dust: falling to the deck wherever a field holds it, drifting where there is none
      if ((moteT -= dt) < 0 && race && race.player) { moteT = 0.04; const me = race.player, i0 = me.ti, g0 = t.grav[i0] > 0.2;
        for (let n = 0; n < 3; n++) { const i = S(i0 + 2 + Math.floor(Math.random() * 14)), p = P(t, i, (Math.random() - 0.5) * 2 * t.w[i], (Math.random() - 0.5) * 2 * t.h[i]), nn = t.nrm[i];
          if (g0) fx.spawn(p.x, p.y, p.z, -nn.x * 5, -nn.y * 5, -nn.z * 5, 1.2, 0.07, 0.07, 0.8, 0.9, 1.2, 0.5, true, 0, 0.05); else fx.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 2.5, 0.06, 0.06, 0.7, 0.75, 0.85, 0.35, true, 0); } }
      // V11: arcs of energy between the core and its coils and capacitor banks
      if (coreC.dist(c) < 1500) { if ((arcT -= dt) < 0 && !arc && coilTops.length) { const to = Math.random() < 0.6 ? coilTops[Math.floor(Math.random() * coilTops.length)].clone().add(v3((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50)) : coreC.clone().add(v3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2).normalize().scale(RC - 8));
          const from = coreC.clone().addScaled(new Vec3().subVectors(to, coreC).normalize(), 50), pts = [from]; for (let k = 1; k < 10; k++) { const pp = new Vec3().lerpVectors(from, to, k / 10); pp.x += (Math.random() - 0.5) * 9; pp.y += (Math.random() - 0.5) * 9; pp.z += (Math.random() - 0.5) * 9; pts.push(pp); } pts.push(to); arc = { pts, t: 0 }; arcT = 0.6 + Math.random() * 1.6; }
        if (arc) { arc.t += dt; for (let k = 0; k < arc.pts.length - 1; k++) { const a = arc.pts[k], b = arc.pts[k + 1], d = new Vec3().subVectors(b, a), L = d.len(); d.scale(1 / L); const f = Math.max(0, 1 - arc.t / 0.2);
            fx.bbAdd.add((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 1.2, 2.2 * f, 2.6 * f, 4 * f, 1, d.x, d.y, d.z, L * 1.05); fx.bbAdd.add((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 6, 0.3 * f, 0.45 * f, 1.2 * f, 0.6, d.x, d.y, d.z, L * 1.1); }
          if (arc.t > 0.2) arc = null; } }
      for (const l of lights) { if (l.blink && Math.floor((time + (l.ph || 0)) / l.blink) % 2) continue; if (l.p.dist(c) > 6000) continue; fx.bbAdd.add(l.p.x, l.p.y, l.p.z, l.s, l.c[0], l.c[1], l.c[2], 1); }
    },
    light(me, cam) { const c = cam ? cam.pos : null; if (c && coreC.dist(c) < RC + 60) return { pos: coreC.clone(), col: [3, 3.6, 7], range: RC * 1.6 }; return null; } };
}
