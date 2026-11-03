// Background life and hazard props (original designs): capital carrier, hauler, patrol craft, traffic pod,
// wreckage chunks sized to their collision spheres, mining rig, pickup crystal.
import { Vec3 } from '../math.js';
import { Geo, QX, QY, QZ, DET, fbm3 } from './geo.js';

const HULL = [0.42, 0.43, 0.46, 0], DARKH = [0.2, 0.205, 0.22, 0], LIGHT = [1, 0.85, 0.6, 1], BLUE = [0.55, 0.8, 1, 1], RED = [1, 0.15, 0.1, 1];

// "Bastion" fleet carrier. CARRIER_ENGINES: [x, y, radius, z of the nozzle root] for exhaust glow billboards.
export const CARRIER_ENGINES = [[0, 4, 36, -722], [-82, 4, 30, -722], [82, 4, 30, -722], [-42, 54, 22, -722], [42, 54, 22, -722], [-122, -24, 18, -722], [122, -24, 18, -722], [-232, -10, 26, -592], [232, -10, 26, -592]];
// turret pivots [x, y, z, side]: the heads are animated instances (capital.js), the base rings stay in the hull
export const CARRIER_TURRETS = (() => { const t = []; for (const s of [-1, 1]) for (let i = 0; i < 7; i++) t.push([s * 100, 75, -520 + i * 150, s]); return t; })();
// exhaust glow billboards on every carrier nozzle, for a carrier item with pos/quat
const EV = new Vec3();
export function carrierGlow(fx, it) { for (const [x, y, r, z] of CARRIER_ENGINES) { EV.set(x, y, z - 36).applyQuat(it.quat).add(it.pos); fx.bbAdd.add(EV.x, EV.y, EV.z, r * 2.4, 0.4, 0.75, 1.8, 0.55); } }
// Hangar light baking (V6): each bay's interior (deck, ceiling, back and side walls, parked craft, cargo, gantry) is
// lit by its own fixtures - ceiling strips, door lights, the control gallery, the blue lip emitters - with distance
// falloff, the fixtures' facing and shadows cast by the craft and cargo (rays against their boxes). The result is
// stored per vertex as emission (colour and strength), so the bays read as lit rooms with pools of light and shadowed
// corners rather than glowing openings, at no cost per frame.
function bakeBays(g, bays) {
  const P = g.p, N = g.n, Cc = g.c, Mm = g.m, EM = 2.4;
  const hit = (ox, oy, oz, dx, dy, dz, len, b) => { let t0 = 0, t1 = len; for (let a = 0; a < 3; a++) { const o = a ? (a > 1 ? oz : oy) : ox, d = a ? (a > 1 ? dz : dy) : dx, lo = b[a * 2], hi = b[a * 2 + 1];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; } let u = (lo - o) / d, v = (hi - o) / d; if (u > v) { const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; } return true; };
  // 48 cosine-weighted directions about +z, turned onto each vertex normal, for the bay's openness (how much of its sky
  // the vertex sees through the mouth): it scales the sun and sky light in the shader, so the interior reads shadowed
  const DIRS = []; for (let i = 0; i < 48; i++) { const u = (i + 0.5) / 48, a = i * 2.39996, r = Math.sqrt(u); DIRS.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - u)]); }
  for (const B of bays) for (const [v0, v1] of B.ranges) for (let i = v0; i < v1; i++) {
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2]; let r = 0.004, gg = 0.004, bb = 0.005;
    const ox = px + nx * 0.25, oy = py + ny * 0.25, oz = pz + nz * 0.25;
    for (const L of B.lights) { let dx = L.p[0] - px, dy = L.p[1] - py, dz = L.p[2] - pz; const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2); dx /= d; dy /= d; dz /= d;
      const cr = nx * dx + ny * dy + nz * dz; if (cr <= 0.02) continue; const ce = L.dir ? -(L.dir[0] * dx + L.dir[1] * dy + L.dir[2] * dz) : 1; if (ce <= 0) continue;
      let lit = 1; for (const b of B.occ) if (hit(ox, oy, oz, dx, dy, dz, d - 0.5, b)) { lit = 0; break; } if (!lit) continue;
      const e = L.I * cr * Math.pow(ce, L.lobe || 1) / (1 + d2 / (L.R * L.R)); r += e * L.c[0]; gg += e * L.c[1]; bb += e * L.c[2]; }
    // openness: rays that leave through the mouth rectangle without striking parked craft or cargo
    const tx = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0], ax = [ny * tx[2] - nz * tx[1], nz * tx[0] - nx * tx[2], nx * tx[1] - ny * tx[0]], al = Math.hypot(...ax); ax[0] /= al; ax[1] /= al; ax[2] /= al;
    const ay = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]]; let open = 0;
    for (const [u, v, w] of DIRS) { const dx = ax[0] * u + ay[0] * v + nx * w, dy = ax[1] * u + ay[1] * v + ny * w, dz = ax[2] * u + ay[2] * v + nz * w;
      if (dx * B.s <= 1e-4) continue; const t = (B.mouth - ox) / dx, y = oy + dy * t, z = oz + dz * t; if (t < 0 || y < B.y0 || y > B.y1 || z < B.z0 || z > B.z1) continue;
      let ok = true; for (const b of B.occ) if (hit(ox, oy, oz, dx, dy, dz, t, b)) { ok = false; break; } if (ok) open++; }
    const occ = Math.min(1, open / 48 * 1.6);
    const m = Math.max(r, gg, bb), k = 1 / m; // vertex colour keeps the surface albedo, tinted toward the light; alpha carries the strength
    for (let a = 0; a < 3; a++) Cc[i * 4 + a] *= 0.6 + 0.4 * Math.pow([r, gg, bb][a] * k, 0.4545);
    Cc[i * 4 + 3] = m / (m + 1); Mm[i * 4 + 2] = EM; Mm[i * 4 + 3] = DET.interior + 4 * occ;
  }
}
export function buildCarrier(len = 1400, lite = false, far = false) {
  // Original dreadnought, V5/V6 construction, in three tiers. Primary: stepped plate hull, ventral keel, terraced spine
  // with a command deck, sponsons on pylons, radiator wings, clustered engines. Secondary: flank armour, recessed
  // hangar bays cut into the sponsons (frames, decks, back-wall doors and galleries, ceiling light rows, parked craft,
  // lit by baked interior light), layered engine bells, conduits, turret bases (animated heads in capital.js), sensor
  // dishes, landing pads, dorsal superstructure. Tertiary: window rows and plating (capital-hull shader), lights.
  // lite = the same silhouette and lights with plain boxes and no small parts; far = primary forms and lights only.
  const g = new Geo(), k = len / 1400, S = pts => pts.map(([x, z]) => [x * k, z * k]);
  const plan = (w, z0, z1, nose) => S([[0, z1 + nose], [w * 0.45, z1], [w, z1 - 260], [w, z0], [-w, z0], [-w, z1 - 260], [-w * 0.45, z1]]);
  const PAINT = [0.44, 0.45, 0.47, 0], CER = [0.58, 0.57, 0.54, 0], MECH = [0.17, 0.175, 0.19, 0], STL = [0.3, 0.3, 0.32, 0], SOOTC = [0.1, 0.095, 0.09, 0];
  const WALL = [0.36, 0.37, 0.39, 0], DECKC = [0.27, 0.27, 0.28, 0], CEILC = [0.3, 0.31, 0.33, 0], RIB = [0.22, 0.225, 0.24, 0], PAINTY = [0.62, 0.48, 0.16, 0];
  const hull = () => g.mat(0.3, 0.6, 1, DET.capital), mech = () => g.mat(0.7, 0.45, 1, 0), glow = (e = 3) => g.mat(0, 0.45, e, 0);
  const bx = (x, y, z, w, h, d, c, q) => lite ? g.at(x * k, y * k, z * k, q || null).box(w * k, h * k, d * k, c) : g.at(x * k, y * k, z * k, q || null).bbox(w * k, h * k, d * k, Math.min(w, h, d) * 0.08 * k, c);
  const lt = (x, y, z, w, h, d, c, e = 3) => glow(e).at(x * k, y * k, z * k).box(w * k, h * k, d * k, c);
  // a subdivided panel (for baked light): origin o, edge vectors u, v (carrier units), nu x nv cells, facing n
  const panel = (o, u, v, nu, nv, n, col) => { g.mat(0.1, 0.75, 1, 0); const tp = new Vec3(), tn = new Vec3(n[0], n[1], n[2]); nu = Math.max(1, Math.round(nu)); nv = Math.max(1, Math.round(nv)); /* whole cells: a fractional count made the lite grid index past its rows (V6 fix: stray triangles to vertex 0) */
    const flip = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2] < 0;
    const V = (a, b, c) => { tp.set((o[0] + u[0] * a + v[0] * b) * k, (o[1] + u[1] * a + v[1] * b) * k, (o[2] + u[2] * a + v[2] * b) * k); return g.raw(tp, tn, c); };
    if (lite) { const ids = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) ids.push(V(i / nu, j / nv, col));
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = ids[j * (nu + 1) + i], b = ids[j * (nu + 1) + i + 1], c = ids[(j + 1) * (nu + 1) + i + 1], d = ids[(j + 1) * (nu + 1) + i]; flip ? g.quad(a, d, c, b) : g.quad(a, b, c, d); }
      return; }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { // every plate its own shade of grey, so baked light reads across a plated surface
      const hv = Math.sin(i * 12.9898 + j * 78.233 + o[2] * 0.37) * 43758.5453, f = 0.93 + 0.11 * (hv - Math.floor(hv)), c = [col[0] * f, col[1] * f, col[2] * f, col[3]];
      const a = V(i / nu, j / nv, c), b = V((i + 1) / nu, j / nv, c), cc = V((i + 1) / nu, (j + 1) / nv, c), d = V(i / nu, (j + 1) / nv, c); flip ? g.quad(a, d, cc, b) : g.quad(a, b, cc, d); } };
  // primary forms
  hull().at(0, 0, 0).plate(plan(150, -700, 560, 140), 70 * k, PAINT, 10 * k);
  g.at(0, 52 * k, -40 * k).plate(plan(118, -640, 470, 90), 40 * k, CER, 6 * k);
  g.at(0, 84 * k, -120 * k).plate(plan(80, -560, 300, 60), 30 * k, PAINT, 5 * k);
  g.at(0, -48 * k, 0).plate(plan(110, -660, 430, 80), 30 * k, MECH, 6 * k);
  for (let t = 0; t < 5; t++) { hull(); bx(0, 110 + t * 22, -420 + t * 70, 90 - t * 14, 22, 220 - t * 26, t % 2 ? PAINT : CER); }
  hull(); bx(0, 218, -150, 70, 18, 46, PAINT);
  const BAYS = [-430, -260, -90, 80], BW = 74, bays = [];
  for (const s of [-1, 1]) {
    const X = v => s * v;
    // sponson: a core plus an outer layer with real 30 m recesses for the hangar bays
    hull(); bx(X(217), -10, -120, 40, 60, 900, PAINT); bx(X(252), 13, -120, 30, 14, 900, PAINT); bx(X(252), -35, -120, 30, 10, 900, PAINT);
    let zc = -570; for (const bz of BAYS) { bx(X(252), -12, (zc + bz - BW / 2) / 2, 30, 36, bz - BW / 2 - zc, PAINT); zc = bz + BW / 2; } bx(X(252), -12, (zc + 330) / 2, 30, 36, 330 - zc, PAINT);
    for (let q = 0; q < 4; q++) { hull(); bx(X(176), -10, -480 + q * 260, 56, 26, 40, MECH); }
    hull(); g.at(X(300) * k, 30 * k, -560 * k, QZ(s * 12)).bbox(150 * k, 6 * k, 150 * k, 2 * k, MECH);
    for (let i = 0; i < 12; i++) { hull(); bx(X(152), (i % 2) * 6 - 3, -660 + i * 90, 6, 50 + (i % 2) * 12, 80, i % 3 ? PAINT : CER); } // flank armour
    for (const bz of BAYS) {
      if (far) { // far level: the bay as a dim recess with its light rows
        g.mat(0.1, 0.8, 1, 0); bx(X(239), -12, bz, 2, 36, BW, [0.3, 0.3, 0.32, 0]); lt(X(241), -12, bz, 0.5, 30, BW - 8, [0.75, 0.72, 0.66, 0.22], 3); continue; }
      mech(); bx(X(268.5), 7.5, bz, 3, 3, BW + 6, STL); bx(X(268.5), -31.5, bz, 3, 3, BW + 6, STL); bx(X(268.5), -12, bz - BW / 2 - 1.5, 3, 36, 3, STL); bx(X(268.5), -12, bz + BW / 2 + 1.5, 3, 36, 3, STL);
      const B = { ranges: [], lights: [], occ: [], s, mouth: X(268) * k, y0: -29.2 * k, y1: 5.2 * k, z0: (bz - 36.4) * k, z1: (bz + 36.4) * k }, v0 = g.count, z0 = bz - 36.4, z1 = bz + 36.4, xb = X(240), xm = X(267), dv = lite ? 2 : 1;
      // receivers: deck, ceiling, back wall and side walls as subdivided panels
      panel([xb, -29.2, z0], [xm - xb, 0, 0], [0, 0, z1 - z0], 7 / dv, 18 / dv, [0, 1, 0], DECKC);
      panel([xb, 5.2, z0], [xm - xb, 0, 0], [0, 0, z1 - z0], 7 / dv, 18 / dv, [0, -1, 0], CEILC);
      panel([xb, -29.2, z0], [0, 34.4, 0], [0, 0, z1 - z0], 9 / dv, 18 / dv, [s, 0, 0], WALL);
      for (const [zz, nz] of [[z0, 1], [z1, -1]]) panel([xb, -29.2, zz], [xm - xb, 0, 0], [0, 34.4, 0], 7 / dv, 9 / dv, [0, 0, nz], WALL);
      if (!lite) { // parked shuttles, a gantry across the bay, cargo by the back wall (all receive light and cast shadows)
        for (const [dz, dx] of [[-20, 0], [6, 4], [24, -2]]) { mech(); bx(X(252 + dx), -27.2, bz + dz, 4.5, 3, 11, [0.5, 0.5, 0.52, 0]); bx(X(252 + dx), -27.4, bz + dz - 1, 12, 0.6, 4, [0.42, 0.42, 0.44, 0]);
          const cx = X(252 + dx); B.occ.push([Math.min(cx - 6, cx + 6) * k, Math.max(cx - 6, cx + 6) * k, -28.7 * k, -25.7 * k, (bz + dz - 5.5) * k, (bz + dz + 5.5) * k]); }
        mech(); bx(X(250), 3, bz, 2, 2, BW - 4, STL); bx(X(250), 1, bz - 10, 4, 2, 4, MECH); B.occ.push([(X(250) - 1) * k, (X(250) + 1) * k, 2 * k, 4 * k, (bz - 35) * k, (bz + 35) * k]);
        for (let c = 0; c < 6; c++) { mech(); bx(X(242.5), -27 + (c % 2) * 2.6, bz - 30 + c * 3.2, 4, 2.4, 2.8, [[0.5, 0.25, 0.12, 0], [0.25, 0.32, 0.4, 0], [0.45, 0.42, 0.2, 0]][c % 3]); }
        B.occ.push([(Math.min(X(240.5), X(244.5))) * k, Math.max(X(240.5), X(244.5)) * k, -28.2 * k, -24.5 * k, (bz - 31.4) * k, (bz - 12.6) * k]); }
      if (!lite) { // painted taxi lines and pad outlines on the deck, ribs on the back wall, beams between the light rows
        g.mat(0.05, 0.6, 1, 0); for (const xx of [246, 260]) bx(X(xx), -29.1, bz, 0.6, 0.12, BW - 10, PAINTY);
        for (const [dz, dx] of [[-20, 0], [6, 4], [24, -2]]) for (const e of [-1, 1]) { bx(X(252 + dx), -29.1, bz + dz + e * 7.5, 15, 0.12, 0.45, PAINTY); bx(X(252 + dx + e * 7.5), -29.1, bz + dz, 0.45, 0.12, 15, PAINTY); }
        mech(); for (let j = -3; j <= 3; j++) bx(X(240.9), -12, bz + j * 9.5 + 4.75, 1.4, 34, 1.2, RIB);
        for (let r = -3; r < 3; r++) bx(X(253.5), 4.4, bz + r * 10 + 5, 27, 1.4, 1, RIB); }
      B.ranges.push([v0, g.count]);
      // fixtures: ceiling strips (three samples each, facing down), door lights and the gallery (facing the mouth), lip emitters
      const W = [1, 0.8, 0.58], C2 = [0.86, 0.92, 1], BL = [0.45, 0.75, 1];
      for (let r = -3; r <= 3; r++) for (const xx of [245, 253, 261]) B.lights.push({ p: [X(xx) * k, 4.7 * k, (bz + r * 10) * k], dir: [0, -1, 0], c: C2, I: 0.42, R: 10 * k, lobe: 2.2 });
      B.lights.push({ p: [X(241.5) * k, -25.5 * k, bz * k], dir: [s, 0, 0], c: W, I: 0.9, R: 6 * k }); for (const dz of [-25, 25]) B.lights.push({ p: [X(241.5) * k, -27 * k, (bz + dz) * k], dir: [s, 0, 0], c: W, I: 0.4, R: 4.5 * k });
      B.lights.push({ p: [X(241.5) * k, -8 * k, bz * k], dir: [s, 0, 0], c: C2, I: 0.3, R: 8 * k });
      for (const dz of [-28, 0, 28]) for (const yy of [4.5, -28.5]) B.lights.push({ p: [X(266) * k, yy * k, (bz + dz) * k], dir: null, c: BL, I: 0.22, R: 5 * k });
      bays.push(B);
      // the fixtures themselves
      lt(X(240.2), -25.5, bz, 0.4, 4, 10, [1, 0.78, 0.5, 1], 0.75); for (const dz of [-25, 25]) lt(X(240.2), -27, bz + dz, 0.4, 2.6, 4.5, [1, 0.8, 0.55, 1], 0.6);
      g.mat(0.9, 0.12, 1, 0); bx(X(240.3), -8, bz, 0.5, 2.6, 54, [0.05, 0.06, 0.08, 0]); // control gallery: a dark glazed band, some panes lit
      for (let j = -6; j <= 6; j++) if ((j * 7 + 3) % 4) lt(X(240.1), -8, bz + j * 4, 0.3, 1.8, 3, j % 3 ? [0.8, 0.88, 1, 1] : [1, 0.82, 0.6, 1], 0.9);
      for (let r = -3; r <= 3; r++) lt(X(253), 5, bz + r * 10, 26, 0.4, 1.2, [0.92, 0.95, 1, 1], 2.4);
      lt(X(253), -29.1, bz, 26, 0.2, 0.8, [1, 0.62, 0.25, 1], 2.5);
      for (const e of [-1, 1]) lt(X(266), -29, bz + e * (BW / 2 - 3), 1.2, 0.5, 3, [1, 0.45, 0.15, 1], 3.5);
      lt(X(267.2), 5.4, bz, 0.5, 0.5, BW - 4, [0.45, 0.75, 1, 1], 2.2); lt(X(267.2), -29.4, bz, 0.5, 0.5, BW - 4, [0.45, 0.75, 1, 1], 2.2);
      if (!lite) for (const [dz, dx] of [[-20, 0], [6, 4], [24, -2]]) lt(X(252 + dx), -26.5, bz + dz - 5.6, 1.2, 0.8, 0.3, [0.5, 0.8, 1, 1], 4);
    }
    // landing pad cantilevered off the sponson's bow, with edge lights
    hull(); bx(X(232), 22, 345, 90, 3, 60, STL); lt(X(232), 23.6, 375, 88, 0.4, 0.6, [1, 0.7, 0.3, 1]); lt(X(232), 23.6, 315, 88, 0.4, 0.6, [1, 0.7, 0.3, 1]);
    for (let r = 0; r < 16; r++) lt(X(156.5), 36, -660 + r * 78, 1.5, 2.2, 2.6, r % 4 ? [1, 0.85, 0.6, 1] : [1, 0.15, 0.1, 1], 4); // running lights
  }
  // engines: housing, collar, flared bell with an exit lip, dark liner into a glowing throat with a hot core and an inner ring
  const sg = far ? 10 : lite ? 16 : 24;
  const engine = (x, y, r, z) => { mech().at(x * k, y * k, (z + 6) * k).cyl(r * k, r * k, 36 * k, sg, MECH, false);
    if (!far) { g.mat(0.85, 0.35, 1, 0).at(x * k, y * k, (z - 12) * k).torus((r + 0.6) * k, 1.6 * k, sg, 6, STL);
      g.mat(0.8, 0.5, 1, 0).at(x * k, y * k, 0).lathe([[(r + 2.6) * k, (z - 34) * k], [(r + 1.2) * k, (z - 22) * k], [r * k, (z - 12) * k]], sg, STL);
      g.at(x * k, y * k, (z - 34) * k).torus((r + 1.8) * k, 1 * k, sg, 6, STL);
      g.mat(0.6, 0.75, 1, 0).at(x * k, y * k, 0).lathe([[(r + 1) * k, (z - 34) * k], [(r - 4) * k, (z - 16) * k], [(r - 7) * k, (z - 6) * k]], sg, SOOTC); }
    glow(2.6).at(x * k, y * k, (z - 6) * k).cyl((r - 7) * k, (r - 7) * k, 0.5 * k, sg, BLUE);
    glow(6).at(x * k, y * k, (z - 6.6) * k).cyl((r - 7) * 0.5 * k, (r - 7) * 0.5 * k, 0.5 * k, sg, [0.85, 0.93, 1, 1]);
    if (!far) glow(1.6).at(x * k, y * k, (z - 15) * k).torus((r - 4.2) * k, 0.5 * k, sg, 4, BLUE);
    if (!lite) for (let p = 0; p < 4; p++) { const a = p * Math.PI / 2 + Math.PI / 4; mech(); bx(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), z + 10, 5, 5, 26, STL); } };
  for (const [x, y, r, z] of CARRIER_ENGINES) engine(x, y, r, z);
  // bow: a dorsal armour ridge running forward from the spine, and nav lights at the tip (every level)
  hull().at(0, 38 * k, 0).plate(S([[0, 690], [9, 600], [12, 420], [12, 240], [-12, 240], [-12, 420], [-9, 600]]), 7 * k, CER, 2 * k);
  lt(-10.5, 2, 676, 2, 2, 2, RED, 6); lt(10.5, 2, 676, 2, 2, 2, [0.2, 1, 0.4, 1], 6); lt(0, 44, 640, 1.5, 1.5, 1.5, LIGHT, 5);
  // command deck: window band and beacons stay in every level
  lt(0, 220, -126.8, 60, 3, 0.5, [1, 0.85, 0.6, 1], 2); for (let m = 0; m < 3; m++) lt(0, 262, -330 + m * 90, 3, 3, 3, RED, 6);
  if (far) { for (let m = 0; m < 3; m++) { mech(); g.at(0, 235 * k, (-330 + m * 90) * k).box(2.4 * k, 52 * k, 2.4 * k, MECH); } return g.build(); }
  if (lite) { for (let m = 0; m < 3; m++) { mech(); bx(0, 235, -330 + m * 90, 2.4, 52, 2.4, MECH); } for (const [x, y, z] of CARRIER_TURRETS) { mech(); bx(x, y + 5, z, 10, 5, 12, MECH); } bakeBays(g, bays); return g.build(); }
  // secondary: conduits, turret bases (heads are animated instances), deck ribs, dorsal superstructure, sensor dishes, masts, markings
  for (const s of [-1, 1]) mech().at(s * 156 * k, 28 * k, -150 * k).cyl(3 * k, 3 * k, 900 * k, 8, STL).at(s * 156 * k, -22 * k, -150 * k).cyl(2.2 * k, 2.2 * k, 900 * k, 8, STL);
  for (const [x, y, z] of CARRIER_TURRETS) mech().at(x * k, y * k, z * k, QX(-90)).cyl(6 * k, 6 * k, 4 * k, 12, STL);
  for (let z = -600; z <= 160; z += 60) { mech(); bx(0, 73, z, 236, 3, 6, MECH); }
  let sd = 7; const rn = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) { const w = 4 + rn() * 16, d = 6 + rn() * 30, h = 3 + rn() * rn() * 24, top = i < 50, z = top ? -540 + rn() * 560 : -620 + rn() * 760;
    const x = top ? (rn() < 0.5 ? -1 : 1) * (w / 2 + rn() * (74 - w)) : (rn() < 0.5 ? -1 : 1) * (84 + w / 2 + rn() * (30 - w / 2)), y = top ? 99 : 72;
    hull(); bx(x, y + h / 2, z, w, h, d, rn() < 0.3 ? CER : rn() < 0.5 ? MECH : PAINT); }
  for (const s of [-1, 1]) mech().at(s * 22 * k, 232 * k, -165 * k, QX(-55)).lathe([[0.02, 0], [6 * k, 1.6 * k], [10 * k, 4 * k], [11 * k, 4.6 * k]], 16, STL);
  for (let m = 0; m < 3; m++) { const z = -330 + m * 90; mech().at(0, 235 * k, z * k, QX(-90)).cyl(1.6 * k, 1, 50 * k, 6, MECH); }
  for (let i = 0; i < 8; i++) { const z = 280 + i * 34; for (const sd of [-1, 1]) { mech(); bx(sd * (24 + (i % 3) * 9), 37, z, 6, 2.5, 14, MECH); } } // bow deck fittings either side of the ridge
  for (let i = 0; i < 5; i++) { mech().at(((i % 2) * 2 - 1) * 30 * k, 50 * k, (330 + i * 40) * k, QX(-90)).cyl(0.8 * k, 0.5 * k, 22 * k, 6, STL); } // forward sensor masts
  g.mat(0.3, 0.5, 1, DET.capital).at(0, 36 * k, 420 * k).plate(S([[-40, 0], [40, 0], [26, 70], [-26, 70]]), 1.2 * k, [0.5, 0.14, 0.1, 0]);
  bakeBays(g, bays);
  return g.build();
}
// cargo hauler: cab, truss spine, container stacks, twin engines
export function buildHauler() {
  const g = new Geo(), C = [[0.7, 0.3, 0.15], [0.2, 0.4, 0.6], [0.65, 0.6, 0.2], [0.3, 0.5, 0.3], [0.5, 0.5, 0.52]];
  g.mat(0.5, 0.5, 1, DET.struct).at(0, 0, 80).bbox(26, 20, 30, 4, HULL);
  g.mat(0, 0.3, 2.5, 0).at(0, 4, 95.2).box(18, 4, 0.5, LIGHT);
  for (const [x, y] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) g.mat(0.8, 0.5, 0, 0).at(x, y, 0).box(1.6, 1.6, 140, DARKH);
  for (let z = -60; z <= 60; z += 15) g.mat(0.6, 0.5, 0, 0).at(0, 0, z).box(13, 13, 1.2, DARKH);
  for (let k = 0; k < 16; k++) { const z = -56 + (k % 8) * 15, side = k < 8 ? 1 : -1; g.mat(0.35, 0.6, 1, DET.hull).at(side * 13, 0, z).bbox(12, 12, 14, 0.6, [...C[(k * 7) % 5], 0]); }
  g.mat(0.6, 0.5, 1, DET.struct).at(0, 0, -78).bbox(30, 18, 26, 4, HULL);
  for (const s of [-1, 1]) { g.mat(0.8, 0.4, 0, 0).at(s * 8, 0, -94).cyl(7, 6, 10, 16, DARKH); g.mat(0, 0.4, 5, 0).at(s * 8, 0, -99.2).cyl(5.4, 5.4, 0.4, 16, [1, 0.7, 0.35, 1]); g.mat(0, 0.4, 6, 0).at(s * 15, 10, 70).box(1.2, 1.2, 1.2, s > 0 ? RED : [0.2, 1, 0.3, 1]); }
  return g.build();
}
export function buildPatrol() {
  const g = new Geo();
  g.mat(0.5, 0.4, 1, DET.hull).at(0, 0, 0).plate([[0, 14], [7, -6], [5, -12], [-5, -12], [-7, -6]], 3, [0.36, 0.38, 0.42, 0], 0.8);
  g.mat(0.9, 0.05, 0, DET.glass).at(0, 1.6, 5).sphere(1.6, 12, 8, [0.05, 0.08, 0.1, 0]);
  for (const s of [-1, 1]) { g.mat(0.8, 0.4, 0, 0).at(s * 3.5, 0, -12.5).cyl(1.6, 1.4, 3, 12, DARKH); g.mat(0, 0.4, 6, 0).at(s * 3.5, 0, -14.1).cyl(1.2, 1.2, 0.2, 12, BLUE); }
  g.mat(0, 0.4, 6, 0).at(7.2, 0, -6).box(0.6, 0.6, 0.6, RED).at(-7.2, 0, -6).box(0.6, 0.6, 0.6, [0.2, 1, 0.3, 1]);
  return g.build();
}
// traffic pod for Neon Spire: rounded hover bus filling its 4.2 m collision sphere
export function buildPod(accent) {
  const g = new Geo(), R = 4.2;
  g.mat(0.45, 0.32, 1, DET.hull).at(0, 0, 0).lathe([[0.4, -R * 0.99], [1.9, -R * 0.82], [2.55, -R * 0.45], [2.7, 0], [2.55, R * 0.45], [1.9, R * 0.8], [0.4, R * 0.99]], 24, [0.62, 0.64, 0.7, 0], 1.05, 0.82);
  g.mat(0.9, 0.06, 0, DET.glass).at(0, 0.9, 1.0).lathe([[0.2, -2.0], [1.7, -1.4], [1.85, 0.6], [1.2, 2.0], [0.2, 2.5]], 20, [0.05, 0.08, 0.12, 0], 1.0, 0.7, 0, Math.PI);
  g.mat(0, 0.4, 4, 0).at(0, -0.2, 0).lathe([[2.72, -2.4], [2.74, 2.4]], 24, [...accent, 1], 1.06, 0.84, Math.PI * 1.05, Math.PI * 1.95);
  g.mat(0, 0.3, 6, 0).at(0, 0, R * 0.98).box(2.4, 0.5, 0.1, [1, 0.95, 0.85, 1]).at(0, 0, -R * 0.98).box(2.4, 0.5, 0.1, [1, 0.1, 0.08, 1]);
  return g.build();
}
// wreckage chunk: overlapping hull sections and frames, scaled so every vertex is within the unit sphere
export function buildWreck(seed) {
  const g = new Geo(), rnd = (a) => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280 - 0.5) * 2 * a; };
  const parts = 4 + (seed % 3);
  for (let k = 0; k < parts; k++) {
    const q = QY(rnd(180)).multiply(QX(rnd(60))), c = k === 0 ? [0.38, 0.39, 0.42, 0] : k % 2 ? [0.25, 0.26, 0.28, 0] : [0.5, 0.36, 0.22, 0];
    g.mat(0.6, 0.5, 1, DET.hull).at(rnd(0.3), rnd(0.25), rnd(0.3), q).bbox(1.1 + rnd(0.3), 0.55 + rnd(0.15), 0.9 + rnd(0.3), 0.08, c);
  }
  for (let k = 0; k < 3; k++) g.mat(0.9, 0.4, 0, 0).at(rnd(0.3), rnd(0.3), rnd(0.3), QZ(rnd(180)).multiply(QX(rnd(90)))).box(0.06, 0.06, 1.3, [0.3, 0.3, 0.32, 0]);
  g.mat(0, 0.5, 3, 0).at(rnd(0.3), rnd(0.2), 0.45).box(0.08, 0.08, 0.08, [1, 0.45, 0.15, 1]);
  const b = g.bounds(), P = g.p, s = 1.02 / b.r;
  for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - b.c.x) * s; P[i + 1] = (P[i + 1] - b.c.y) * s; P[i + 2] = (P[i + 2] - b.c.z) * s; }
  return g.build();
}
export function buildRig() {
  const g = new Geo();
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.mat(0.8, 0.5, 0, 0).at(Math.cos(a) * 6, 30, Math.sin(a) * 6, QX(90)).cyl(0.8, 0.8, 60, 6, [0.5, 0.42, 0.2, 0]); }
  for (let y = 4; y < 60; y += 8) g.mat(0.8, 0.5, 0, 0).at(0, y, 0, QX(90)).torus(6, 0.4, 16, 4, [0.5, 0.42, 0.2, 0]);
  g.mat(0.5, 0.5, 1, DET.struct).at(0, 62, 0).bbox(18, 8, 18, 2, [0.4, 0.4, 0.42, 0]);
  g.mat(0.8, 0.4, 0, 0).at(0, -4, 0, QX(90)).cyl(4, 0.5, 14, 12, [0.3, 0.3, 0.32, 0]);
  g.mat(0, 0.4, 6, 0).at(0, 67, 0).box(1.5, 1.5, 1.5, RED).at(9.2, 62, 0).box(0.8, 3, 6, LIGHT).at(-9.2, 62, 0).box(0.8, 3, 6, LIGHT);
  return g.build();
}
export function buildCrystal() { return new Geo().mat(0.2, 0.15, 3, 0).at(0, 0, 0, QX(-90)).lathe([[0.02, -1.35], [0.85, 0], [0.02, 1.35]], 6, [1, 1, 1, 1]).build(); }
export const buildCapital = buildCarrier;
