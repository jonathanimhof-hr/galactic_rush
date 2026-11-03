// V6 capital ships: three original classes with three levels of detail each, animated turrets (or cargo cranes),
// engine glows and hangar bays lit by baked interior lights.
//  - Bastion fleet carrier (props.js buildCarrier): stepped plate hull, terraced spine, sponsons with hangar bays.
//  - Warden command cruiser: a long six-sided armoured prism with a forked bow, a faceted command ring round its
//    waist carrying sensors and turrets, a stacked command citadel inside the ring, twin keel blades and a framed
//    block of six engines.
//  - Atlas industrial tender: an open lattice spine carrying clamped container racks and a tank cluster, a blocky bow
//    module with two docking cranes, radiator fins and four engines on cross-braced pylons.
// Every class keeps its silhouette at all three levels (full, lite, far); the levels cross-fade with a dithered,
// complementary pattern by projected size, so there is no pop.
import { Vec3, Quat, mat4 } from '../math.js';
import { Geo, QX, QY, QZ, DET } from './geo.js';
import { buildCarrier, CARRIER_ENGINES, CARRIER_TURRETS } from './props.js';
import { projPx } from './lod.js';

const PAINT = [0.44, 0.45, 0.47, 0], CER = [0.58, 0.57, 0.54, 0], MECH = [0.17, 0.175, 0.19, 0], STL = [0.3, 0.3, 0.32, 0], SOOT = [0.1, 0.095, 0.09, 0], DARK = [0.12, 0.125, 0.135, 0];
const LIGHT = [1, 0.85, 0.6, 1], BLUE = [0.55, 0.8, 1, 1], RED = [1, 0.15, 0.1, 1], GREEN = [0.2, 1, 0.4, 1];

// a lofted prism: polygon sections [z, rx, ry] joined by flat-shaded faces (sides = 6: a hexagonal armoured hull)
function loft(g, secs, sides, col, rot = Math.PI / 6, caps = true) {
  const ring = ([z, rx, ry]) => { const r = []; for (let j = 0; j < sides; j++) { const a = rot + j / sides * Math.PI * 2; r.push([Math.cos(a) * rx, Math.sin(a) * ry, z]); } return r; };
  const R = secs.map(ring), N = new Vec3(), A = new Vec3(), B = new Vec3();
  for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = R[i][j], b = R[i][(j + 1) % sides], c = R[i + 1][(j + 1) % sides], d = R[i + 1][j];
    A.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); B.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]); N.crossVectors(B, A).normalize();
    const ids = [a, b, c, d].map(p => g.v(p[0], p[1], p[2], N.x, N.y, N.z, col)); g.quad(ids[0], ids[1], ids[2], ids[3]); }
  if (caps) for (const [r, s] of [[R[0], -1], [R[R.length - 1], 1]]) { const c = g.v(0, 0, r[0][2], 0, 0, s, col), ids = r.map(p => g.v(p[0], p[1], p[2], 0, 0, s, col));
    for (let j = 0; j < sides; j++) s > 0 ? g.tri(c, ids[j], ids[(j + 1) % sides]) : g.tri(c, ids[(j + 1) % sides], ids[j]); }
  return g;
}
const engineBell = (g, x, y, z, r, lite) => { // housing, collar, flared bell, dark liner into a glowing throat with a hot core
  g.mat(0.7, 0.45, 1, 0).at(x, y, z + 6).cyl(r, r, 36, lite ? 12 : 24, MECH, false);
  g.mat(0.8, 0.5, 1, 0).at(x, y, 0).lathe([[r + 2.6, z - 34], [r + 1.2, z - 22], [r, z - 12]], lite ? 12 : 24, STL);
  g.mat(0.6, 0.75, 1, 0).at(x, y, 0).lathe([[r + 1, z - 34], [r - 4, z - 16], [r - 7, z - 6]], lite ? 12 : 24, SOOT);
  g.mat(0, 0.45, 2.6, 0).at(x, y, z - 6).cyl(r - 7, r - 7, 0.5, lite ? 12 : 24, BLUE);
  g.mat(0, 0.45, 6, 0).at(x, y, z - 6.6).cyl((r - 7) * 0.5, (r - 7) * 0.5, 0.5, lite ? 12 : 24, [0.85, 0.93, 1, 1]);
};

// ---------- Warden command cruiser (length 1100) ----------
export const WARDEN_ENGINES = [[-34, -18, 26, -560], [0, -18, 26, -560], [34, -18, 26, -560], [-34, 22, 26, -560], [0, 22, 26, -560], [34, 22, 26, -560], [-150, -4, 18, -440], [150, -4, 18, -440]];
export const WARDEN_TURRETS = (() => { const t = []; for (let i = 0; i < 5; i++) for (const s of [-1, 1]) t.push([s * 52, 64, -360 + i * 120, s]); for (const a of [0.6, 2.54, 3.74, 5.68]) t.push([Math.cos(a) * 168, Math.sin(a) * 168, -60, 0, a]); return t; })();
export function buildWarden(level = 0) {
  const g = new Geo(), lite = level >= 1, far = level >= 2;
  const hull = () => g.mat(0.3, 0.6, 1, DET.capital), mech = () => g.mat(0.7, 0.45, 1, 0), lt = (x, y, z, w, h, d, c, e = 3) => g.mat(0, 0.45, e, 0).at(x, y, z).box(w, h, d, c);
  // primary: six-sided armoured prism, its bow split into two prongs round a recessed spinal slot
  hull(); loft(g, [[-520, 70, 46], [-470, 98, 62], [-200, 106, 68], [150, 106, 68], [300, 96, 60]], 6, PAINT);
  for (const s of [-1, 1]) { hull(); g.at(s * 46, 0, 0); loft(g, [[290, 46, 58], [430, 40, 50], [520, 26, 34], [575, 8, 12]], 6, s > 0 ? PAINT : CER); }
  g.at(0, 0, 0); mech(); g.at(0, 0, 430).box(14, 40, 280, DARK);
  // waist: a faceted command ring on four pylons, the stacked command citadel inside it
  hull(); g.at(0, 0, -60).torus(168, 18, far ? 12 : 24, 4, CER); for (const a of [0, 1.5708, 3.1416, 4.7124]) { hull(); g.at(Math.cos(a) * 128, Math.sin(a) * 128, -60, QZ(a * 57.3)).box(60, 22, 34, PAINT); }
  hull(); g.at(0, 68, -60, QX(-90)).cyl(46, 52, 30, far ? 8 : 16, PAINT); g.at(0, 96, -60, QX(-90)).cyl(32, 40, 26, far ? 8 : 16, CER); g.at(0, 118, -60, QX(-90)).cyl(20, 26, 20, far ? 8 : 16, PAINT);
  lt(0, 118, -40, 30, 3, 0.6, [1, 0.85, 0.6, 1], 2.2); lt(0, 140, -60, 2, 2, 2, RED, 6);
  // keel blades and engine block
  for (const s of [-1, 1]) { hull(); g.at(s * 40, -86, -120).box(12, 40, 640, PAINT); }
  mech(); g.at(0, 2, -540).box(130, 96, 70, MECH); hull(); g.at(0, 2, -520).box(140, 104, 30, PAINT);
  for (const s of [-1, 1]) { mech(); g.at(s * 120, -4, -420).box(60, 10, 60, MECH); hull(); g.at(s * 150, -4, -420).box(44, 44, 110, PAINT); }
  for (const [x, y, r, z] of WARDEN_ENGINES) engineBell(g, x, y, z, r, lite);
  // lights that give the scale away at every level
  for (let r = 0; r < 14; r++) for (const s of [-1, 1]) lt(s * 107, 0, -440 + r * 60, 1.2, 2, 2.4, r % 4 ? LIGHT : RED, 4);
  lt(-46, 0, 576, 2, 2, 2, RED, 6); lt(46, 0, 576, 2, 2, 2, GREEN, 6);
  for (let a = 0; a < 12; a++) { const q = a / 12 * 6.2832; lt(Math.cos(q) * 187, Math.sin(q) * 187, -60, 2, 2, 2, a % 3 ? LIGHT : BLUE, 5); }
  if (far) return g.build();
  // secondary: armour bands, sensor arrays on the ring, turret bases, dorsal and ventral fittings
  for (let z = -440; z <= 280; z += 80) { hull(); g.at(0, 0, z); loft(g, [[-6, 108, 70], [6, 108, 70]], 6, CER, Math.PI / 6, false); }
  for (const [x, y, z] of WARDEN_TURRETS) { mech(); g.at(x, y, z, Math.abs(x) > 150 || Math.abs(y) > 150 ? null : QX(-90)).cyl(9, 9, 4, 12, STL); }
  if (lite) return g.build();
  for (let a = 0; a < 24; a++) { const q = (a + 0.5) / 24 * 6.2832; mech(); g.at(Math.cos(q) * 186, Math.sin(q) * 186, -60, QZ(q * 57.3)).box(4, 10, 24, a % 2 ? STL : MECH); }
  // layered armour: plates standing proud of every prism face along the parallel mid-section, with dark seams between rows
  for (let j = 0; j < 6; j++) { const a0 = Math.PI / 6 + j * Math.PI / 3, a1 = a0 + Math.PI / 3, p0 = [Math.cos(a0) * 106, Math.sin(a0) * 68], p1 = [Math.cos(a1) * 106, Math.sin(a1) * 68];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], wl = Math.hypot(ex, ey), nx = ey / wl, ny = -ex / wl, cx = (p0[0] + p1[0]) / 2, cy = (p0[1] + p1[1]) / 2, ang = Math.atan2(ey, ex) * 57.2958;
    for (let z = -190, row = 0; z < 140; z += 42, row++) for (let c = 0; c < 2; c++) { const off = (c - 0.5) * wl * 0.5, px = cx + ex / wl * off + nx * 1.3, py = cy + ey / wl * off + ny * 1.3;
      hull(); g.at(px, py, z + 18, QZ(ang)).box(wl * 0.46, 2.6, 36, (j + c + row) % 3 ? PAINT : CER); }
    mech(); g.at(cx + nx * 0.6, cy + ny * 0.6, -25, QZ(ang)).box(wl * 0.94, 1.4, 340, DARK); }
  let sd = 11; const rn = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { const w = 4 + rn() * 14, d = 6 + rn() * 26, h = 2 + rn() * rn() * 14, z = -480 + rn() * 740, s = rn() < 0.5 ? -1 : 1, x = s * (8 + rn() * 40), top = rn() < 0.6;
    hull(); g.at(x, top ? 68 + h / 2 : -68 - h / 2, z).box(w, h, d, rn() < 0.3 ? CER : rn() < 0.5 ? MECH : PAINT); }
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { mech(); g.at(s * 78, 56, -400 + i * 120, QZ(s * 30)).box(10, 22, 40, MECH); }
  mech(); g.at(0, 130, -60, QX(-90)).cyl(0.9, 0.6, 40, 6, STL); for (const s of [-1, 1]) { mech(); g.at(s * 22, 112, -84, QX(-50)).lathe([[0.02, 0], [5, 1.4], [8, 3.2], [9, 3.8]], 16, STL); }
  return g.build();
}

// ---------- Atlas industrial tender (length 960) ----------
export const ATLAS_ENGINES = [[-58, -58, 22, -470], [58, -58, 22, -470], [-58, 58, 22, -470], [58, 58, 22, -470]];
export const ATLAS_CRANES = [[-62, 30, 330, -1], [62, 30, 330, 1]];
export function buildAtlas(level = 0) {
  const g = new Geo(), lite = level >= 1, far = level >= 2;
  const hull = () => g.mat(0.3, 0.6, 1, DET.capital), mech = () => g.mat(0.75, 0.45, 1, 0), lt = (x, y, z, w, h, d, c, e = 3) => g.mat(0, 0.45, e, 0).at(x, y, z).box(w, h, d, c);
  // spine: four longerons and cross frames (an open lattice); far level: one solid beam
  if (far) { mech(); g.at(0, 0, -20).box(34, 34, 760, MECH); }
  else { for (const [x, y] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) { mech(); g.at(x, y, -20).box(4, 4, 760, STL); }
    for (let z = -390; z <= 350; z += lite ? 60 : 30) { mech(); for (const [x, y, w, h] of [[0, -15, 34, 3], [0, 15, 34, 3], [-15, 0, 3, 34], [15, 0, 3, 34]]) g.at(x, y, z).box(w, h, 3, STL); }
    if (!lite) for (let z = -375; z <= 335; z += 30) for (const [x, y, rz] of [[0, 15.5, 0], [0, -15.5, 0]]) { mech(); g.at(x, y, z, QY(45)).box(2, 1.6, 40, MECH); void rz; } }
  // container racks clamped round the spine: four sides, bays of stacked containers with gaps between racks
  const CC = [[0.62, 0.3, 0.16], [0.2, 0.36, 0.55], [0.66, 0.58, 0.2], [0.32, 0.45, 0.32], [0.5, 0.5, 0.52], [0.55, 0.2, 0.18]];
  let sd = 5; const rn = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  for (let rack = 0; rack < 5; rack++) { const z0 = -330 + rack * 128;
    for (const [ax, ay] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { if (far) { g.mat(0.35, 0.65, 1, DET.container); g.at(ax * 40, ay * 40, z0 + 52).box(ax ? 46 : 70, ay ? 46 : 70, 108, [...CC[(rack + ax * 2 + ay + 6) % 6], 0]); continue; }
      for (let c = 0; c < (lite ? 2 : 4); c++) for (let lay = 0; lay < 2; lay++) { const k = rn(); if (k < 0.12) continue; const col = [...CC[Math.floor(rn() * 6)], 0];
        const along = z0 + 14 + c * (lite ? 54 : 27), off = 24 + lay * 13, side = (lay ? -1 : 1) * 0;
        g.mat(0.35, 0.65, 1, DET.container); if (ax) g.at(ax * off, side + (rn() - 0.5) * 2, along).bbox(12, 26, 25, 0.5, col); else g.at(side, ay * off, along).bbox(26, 12, 25, 0.5, col); } }
    mech(); g.at(0, 0, z0 - 4).box(92, 92, 4, STL); }
  // tank cluster amidships
  for (let a = 0; a < 6; a++) { const q = a / 6 * 6.2832; g.mat(0.5, 0.4, 1, 0).at(Math.cos(q) * 34, Math.sin(q) * 34, 330).sphere(18, far ? 8 : 16, far ? 6 : 10, [0.5, 0.49, 0.47, 0]); }
  // bow module: habitat block, bridge band, docking cranes
  hull(); g.at(0, 8, 410).bbox(110, 72, 90, 6, PAINT); hull(); g.at(0, 50, 400).bbox(64, 22, 50, 4, CER); lt(0, 52, 425.3, 50, 4, 0.5, [1, 0.88, 0.65, 1], 2.4);
  for (const [x, y, z] of ATLAS_CRANES) { mech(); g.at(x, y - 8, z + 60).box(14, 14, 30, MECH); }
  // stern: engine block on four cross-braced pylons, radiator fins
  hull(); g.at(0, 0, -420).bbox(80, 80, 70, 5, PAINT);
  for (const [x, y, r, z] of ATLAS_ENGINES) { mech(); g.at(x * 0.5, y * 0.5, z + 40, QZ(x * y > 0 ? 45 : -45)).box(14, 70, 18, MECH); engineBell(g, x, y, z, r, lite); }
  for (const s of [-1, 1]) { g.mat(0.6, 0.55, 1, 0).at(s * 120, 0, -200).box(150, 2, 120, [0.32, 0.31, 0.3, 0]); mech(); g.at(s * 50, 0, -200).box(60, 6, 10, STL); }
  // lights
  for (let r = 0; r < 12; r++) for (const s of [-1, 1]) lt(s * 47, 0, -360 + r * 64, 1.6, 1.6, 1.6, r % 3 ? LIGHT : [1, 0.5, 0.15, 1], 4);
  lt(-55, 8, 456, 2, 2, 2, RED, 6); lt(55, 8, 456, 2, 2, 2, GREEN, 6); for (const s of [-1, 1]) lt(s * 196, 0, -200, 2, 2, 2, s < 0 ? RED : GREEN, 6);
  if (far || lite) return g.build();
  for (let i = 0; i < 40; i++) { const w = 3 + rn() * 10, d = 4 + rn() * 16, h = 2 + rn() * 8; hull(); g.at((rn() - 0.5) * 100, 44 + h / 2, 380 + rn() * 60).box(w, h, d, rn() < 0.5 ? MECH : PAINT); }
  for (let i = 0; i < 10; i++) { mech(); g.at(-30 + i * 6.5, 62, 410, QX(-90)).cyl(0.7, 0.5, 26, 6, STL); }
  return g.build();
}

// turret head (housing and twin barrels; pivot at the origin, barrels along +z) and crane boom (pivot at the origin)
function turretHead() { const g = new Geo(); g.mat(0.7, 0.45, 1, 0).at(0, 4, 0).box(10, 5, 12, MECH).mat(0.85, 0.35, 1, 0); for (const b of [-2, 2]) g.at(b, 4.5, 13).cyl(0.7, 0.6, 14, 8, STL); g.mat(0, 0.4, 3, 0).at(0, 6.8, -5).box(1.2, 0.6, 0.6, RED); return g.build(); }
function craneBoom() { const g = new Geo(); g.mat(0.7, 0.5, 1, 0).at(0, 0, 0, QX(-90)).cyl(5, 5, 6, 12, MECH); g.at(0, 4, 40).box(5, 5, 84, [0.62, 0.48, 0.12, 0]).at(0, 4, 84).box(8, 10, 6, MECH);
  g.at(0, -10, 84).box(1, 26, 1, STL).mat(0, 0.4, 4, 0).at(0, 7, 86).box(1.6, 1.6, 1.6, [1, 0.6, 0.2, 1]); return g.build(); }

const CLASSES = {
  bastion: { len: 1400, build: l => buildCarrier(1400, l >= 1, l >= 2), engines: CARRIER_ENGINES, turrets: CARRIER_TURRETS, head: turretHead, px: [[300, 450], [60, 95]] },
  warden: { len: 1100, build: buildWarden, engines: WARDEN_ENGINES, turrets: WARDEN_TURRETS, head: turretHead, px: [[260, 400], [55, 85]] },
  atlas: { len: 960, build: buildAtlas, engines: ATLAS_ENGINES, turrets: ATLAS_CRANES, head: craneBoom, crane: true, px: [[250, 380], [52, 80]] } };
const MESHES = new Map();
const meshOf = (gfx, kind, l) => { const key = kind + l; if (!MESHES.has(key)) MESHES.set(key, gfx.mesh(CLASSES[kind].build(l))); return MESHES.get(key); };
export const capitalClasses = () => Object.keys(CLASSES);

// A capital ship of one class following base.pos / base.quat (shared references, so movers can drive it).
// Returns { items, full, lite, far, update(gfx, cam, time, fx) }: three levels cross-faded by projected size,
// animated turret heads (or cranes) on the full level, an exhaust glow on every nozzle.
export function capitalShip(gfx, kind, base, opt = {}) {
  const C = CLASSES[kind], br = C.len * 0.62, mk = l => ({ mesh: meshOf(gfx, kind, l), pos: base.pos, quat: base.quat, scale: 1, visible: l === 0, br, rim: opt.rim, prog: 'pbrFade', fade: 1 });
  const full = mk(0), lite = mk(1), far = mk(2), T = C.turrets, tm = gfx.mesh(C.head(), T.length), heads = { mesh: tm, visible: false, prog: 'pbrFade', fade: 1 };
  const m = mat4.create(), tq = new Quat(), tp = new Vec3(), ev = new Vec3(), q2 = new Quat(), M = mat4.create(), S = [1, 1, 1];
  return { items: [full, lite, far, heads], full, lite, far, kind, update(gfx, cam, time, fx) {
    const px = projPx(gfx, cam, base.pos, C.len), [[a0, a1], [b0, b1]] = C.px, fa = Math.min(1, Math.max(0, (px - a0) / (a1 - a0))), fb = Math.min(1, Math.max(0, (px - b0) / (b1 - b0)));
    if (fa > 0) { full.visible = true; full.fade = fa; full.fadeInv = false; lite.visible = fa < 1; lite.fade = fa; lite.fadeInv = true; far.visible = false; }
    else { full.visible = false; lite.visible = fb > 0; lite.fade = fb; lite.fadeInv = false; far.visible = fb < 1; far.fade = fb; far.fadeInv = true; }
    heads.visible = full.visible; heads.fade = full.fade;
    if (heads.visible) { // turrets sweep slowly within their arcs and track together in bursts; cranes swing a few degrees
      mat4.compose(M, base.pos, base.quat, 1, 1, 1);
      T.forEach(([x, y, z, side, ring], i) => { const ph = i * 1.7 + (kind.length * 0.9), sweep = Math.sin(time * 0.11 + ph) * 0.9 + Math.sin(time * 0.37 + ph * 2.3) * 0.25;
        if (C.crane) q2.setAxisAngle(0, 1, 0, side * (0.25 + 0.2 * Math.sin(time * 0.06 + ph)));
        else if (ring !== undefined) { q2.setAxisAngle(0, 0, 1, ring - Math.PI / 2); tq.setAxisAngle(1, 0, 0, -0.25 + sweep * 0.25); q2.multiply(tq); }
        else { q2.setAxisAngle(0, 1, 0, (side || 1) * 0.35 + sweep * 0.8); tq.setAxisAngle(1, 0, 0, -0.08 - Math.max(0, Math.sin(time * 0.23 + ph)) * 0.25); q2.multiply(tq); }
        mat4.compose(m, tp.set(x, y + (C.crane || ring !== undefined ? 0 : 2), z), q2, S[0], S[1], S[2]); mat4.multiply(m, M, m); gfx.setInstance(tm, i, m); });
      gfx.uploadInstances(tm, T.length); }
    if (fx) for (const [x, y, r, z] of C.engines) { ev.set(x, y, z - 36).applyQuat(base.quat).add(base.pos); fx.bbAdd.add(ev.x, ev.y, ev.z, r * 2.4, 0.4, 0.75, 1.8, 0.55); }
  } };
}
