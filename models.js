// Racer models (original designs) and the cockpit. Nose +Z, up +Y, ship's right is -X.
// Each ship is modelled in design units, then centred on its collision sphere and scaled so that every
// vertex lies within 2.3 m of the centre (collision radius 2.2 m, inside the 5% fairness budget).
import { Vec3, Quat } from '../math.js';
import { Geo, QX, QY, QZ, DET } from './geo.js';

export const SHIP_EXTENT = 2.3;
// V7 paint regions for the garage paint shop (src/progress): a colour array may carry a tag that Geo adds to the vertex
// detail code (hull 1.1 primary, 1.2 secondary, 1.3 accent; engine glow 0.4). The hull shader reads it only for a ship with a
// custom paint job; geometry, factory colours and every other surface are unchanged.
export const REGION = { primary: 0.1, secondary: 0.2, accent: 0.3, glow: 0.4 };
const tag = (c, r) => Object.assign(c, { reg: r });
const DARK = tag([0.13, 0.135, 0.15, 0], REGION.secondary), GUN = tag([0.26, 0.27, 0.29, 0], REGION.secondary), STEEL = [0.62, 0.62, 0.64, 0], SOOT = [0.07, 0.07, 0.075, 0], GLASS = [0.05, 0.08, 0.1, 0];
const deg = r => r * 180 / Math.PI;

class Builder {
  constructor(def, paint, accent) {
    this.g = new Geo(); this.flaps = []; this.engines = []; this.nav = []; this.tips = [];
    this.P = tag([...paint, 0], REGION.primary); this.A = tag([...accent, 0], REGION.accent); this.Aglow = tag([...accent.map(c => 0.55 + c * 0.45), 1], REGION.glow);
  }
  paint() { return this.g.mat(0.35, 0.3, 1, DET.hull); }
  dark() { return this.g.mat(0.75, 0.5, 0, DET.hull); }
  metal() { return this.g.mat(1, 0.3, 0, 0); }
  glass() { return this.g.mat(0.9, 0.05, 0, DET.glass); }
  glow(k = 5) { return this.g.mat(0, 0.4, k, 0); }
  nozzle(x, y, z, r, len, petals = 10) {
    const g = this.g;
    this.dark().at(x, y, z).lathe([[r * 1.0, -len / 2], [r * 1.16, -len * 0.18], [r * 1.12, len * 0.3], [r * 0.98, len / 2]], 26, GUN);
    this.metal().at(x, y, z).lathe([[r * 0.99, -len / 2 + 0.01], [r * 0.9, -len * 0.15], [r * 0.66, len * 0.22]], 26, [0.32, 0.31, 0.3, 0]);
    this.glow(4.5).at(x, y, z + len * 0.2).cyl(r * 0.64, r * 0.64, 0.02, 26, this.Aglow);
    // V5 layered throat (inside the bell, silhouette unchanged): heat-tempered band, an inner glow ring, a white-hot core
    this.metal().at(x, y, z).lathe([[r * 0.8, len * 0.02], [r * 0.7, len * 0.12], [r * 0.655, len * 0.19]], 26, [0.3, 0.24, 0.36, 0]);
    this.glow(3).at(x, y, z + len * 0.1).torus(r * 0.6, r * 0.035, 26, 4, this.Aglow);
    this.glow(7).at(x, y, z + len * 0.195).cyl(r * 0.3, r * 0.3, 0.02, 20, [0.92, 0.96, 1, 1]);
    this.dark().at(x, y, z - len * 0.06).cyl(r * 0.2, 0.02, len * 0.42, 12, SOOT);
    for (let k = 0; k < petals; k++) { const a = (k / petals) * Math.PI * 2;
      this.metal().at(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, z - len * 0.38, QZ(deg(a))).bbox(r * 0.1, r * 0.34, len * 0.32, 0.015, STEEL); }
    this.dark().at(x, y, z + len * 0.45).torus(r * 1.1, r * 0.06, 26, 6, DARK);
    this.engines.push({ x, y, z: z - len / 2 - 0.02, r });
  }
  canopy(y, z0, z1, r, ex = 1, x = 0) {
    const L = z1 - z0, g = this.g; this.eye = { x, y: y + r * 0.42, z: z0 + L * 0.42 };
    this.glass().at(x, y, 0).lathe([[0.02, z0], [r * 0.55, z0 + L * 0.08], [r * 0.9, z0 + L * 0.3], [r, z0 + L * 0.55], [r * 0.85, z0 + L * 0.8], [r * 0.4, z0 + L * 0.96], [0.02, z1]], 22, GLASS, ex, 1, 0, Math.PI);
    for (const t of [0.3, 0.62]) this.dark().at(x, y, z0 + L * t).torus(r * (t < 0.5 ? 0.92 : 0.98) * ex, 0.035, 14, 5, DARK, 0, Math.PI);
    this.dark().at(x, y + r * 0.98, z0 + L * 0.5).bbox(0.06, 0.05, L * 0.62, 0.02, DARK);
    void g;
  }
  greebleStrip(x, y, z, n, dz, w = 0.18, h = 0.08) { for (let k = 0; k < n; k++) this.dark().at(x, y, z + k * dz).bbox(w * (0.7 + 0.6 * ((k * 7) % 3) / 2), h, Math.abs(dz) * 0.7, 0.02, k % 2 ? GUN : DARK); }
  light(x, y, z, col, mode) { this.glow(6).at(x, y, z).sphere(0.07, 8, 6, [...col, 1]); this.nav.push({ x, y, z, col, mode }); }
  // control surface: outline/hinge points (ha, hb) are in the plate's local XZ frame placed at origin with rotation q
  flap(outline, th, origin, q, ha, hb, kind, sign, col) {
    q = q || new Quat();
    const A = new Vec3(ha[0], 0, ha[1]).applyQuat(q), Bv = new Vec3(hb[0], 0, hb[1]).applyQuat(q);
    const pivot = new Vec3(origin[0] + A.x, origin[1] + A.y, origin[2] + A.z), axis = new Vec3().subVectors(Bv, A).normalize();
    const f = new Geo().mat(0.35, 0.3, 1, DET.hull);
    f.at(origin[0] - pivot.x, origin[1] - pivot.y, origin[2] - pivot.z, q).plate(outline, th, col, th * 0.3);
    this.flaps.push({ geo: f, pivot, axis: [axis.x, axis.y, axis.z], kind, sign });
  }
  // centre on the bounding box, scale so the largest half-extent is SHIP_EXTENT
  finish(decal) {
    const b = this.g.bounds(), c = b.c;
    const S = SHIP_EXTENT / b.r, T = p => { p.x = (p.x - c.x) * S; p.y = (p.y - c.y) * S; p.z = (p.z - c.z) * S; return p; };
    const P = this.g.p; for (let k = 0; k < P.length; k += 3) { P[k] = (P[k] - c.x) * S; P[k + 1] = (P[k + 1] - c.y) * S; P[k + 2] = (P[k + 2] - c.z) * S; }
    for (const f of this.flaps) { f.geo.scaleAll(S); T(f.pivot); f.mesh = f.geo.build(); }
    for (const e of this.engines) { T(e); e.r *= S; }
    for (const n of this.nav) T(n);
    for (const t of this.tips) T(t);
    if (this.eye) T(this.eye);
    const box = [(decal[0] - c.z) * S, (decal[1] - c.y) * S, decal[2] * S, decal[3] * S];
    const tris = this.g.i.length / 3 + this.flaps.reduce((a, f) => a + f.geo.i.length / 3, 0);
    // V7 pattern frame: centre line (x) and length (z) of the primary paint, so paint patterns sit on each ship's own
    // spine and ends (Wisp and Corsair carry their main hull off-centre)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const M = this.g.m;
    for (let k = 0, v = 0; k < P.length; k += 3, v++) if (Math.abs(M[v * 4 + 3] - (DET.hull + REGION.primary)) < 1e-4) { x0 = Math.min(x0, P[k]); x1 = Math.max(x1, P[k]); z0 = Math.min(z0, P[k + 2]); z1 = Math.max(z1, P[k + 2]); }
    const frame = isFinite(x0) ? [(x0 + x1) / 2, z0, z1] : [0, -SHIP_EXTENT, SHIP_EXTENT];
    return { geo: this.g.build(), flaps: this.flaps, engines: this.engines, nav: this.nav, tips: this.tips, eye: this.eye || { x: 0, y: 0.6, z: 0.4 }, decal: { box, maxX: (decal[4] - 0) * S }, scale: S, tris, frame };
  }
}

const RED = [1, 0.12, 0.08], GRN = [0.15, 1, 0.3], WHT = [1, 1, 1];

// V4 designs: five engineering philosophies, each readable from behind and at distance by its silhouette.
// Kestrel = elite crescent wing with root-integrated engines; Wisp = asymmetric experimental ring craft;
// Lancer = needle interceptor with forward mandibles; Halberd = broad armoured heavy racer with four engines;
// Corsair = independent build from mismatched hulls on an exposed truss.
const CER = tag([0.82, 0.8, 0.76, 0], REGION.secondary), RUST = [0.42, 0.27, 0.16, 0], OLIVE = tag([0.33, 0.35, 0.27, 0], REGION.secondary);
function kestrel(B) {
  const P = B.P, A = B.A, d = Math.PI / 180;
  B.paint().at(0, 0, 0).lathe([[0.35, -2.3], [0.5, -1.8], [0.56, -0.6], [0.52, 0.8], [0.4, 1.9], [0.22, 3.0], [0.07, 3.8], [0.01, 4.1]], 28, P, 1, 0.78);
  B.canopy(0.28, 0.4, 2.3, 0.36, 0.95);
  for (const s of [-1, 1]) {
    B.paint().at(0.72 * s, -0.02, -0.6).lathe([[0.32, -1.6], [0.4, -1.2], [0.42, 0.4], [0.3, 1.2], [0.08, 1.7], [0.01, 1.8]], 18, P, 1, 0.85);
    B.nozzle(0.72 * s, -0.02, -2.4, 0.32, 0.55, 10);
    B.paint().at(0.95 * s, 0.05, 0, QZ(14 * s)).plate([[0, -1.5], [0, 0.4], [1.3 * s, -0.2], [1.3 * s, -1.3]], 0.13, P, 0.04);
    const kx = 0.95 + 1.3 * Math.cos(14 * d), ky = 0.05 + 1.3 * Math.sin(14 * d);
    B.paint().at(kx * s, ky, 0, QZ(-8 * s)).plate([[0, -1.3], [0, -0.2], [1.9 * s, -1.4], [2.0 * s, -1.75], [1.7 * s, -1.8]], 0.11, P, 0.035);
    B.paint().at(kx * s, ky + 0.015, 0, QZ(-8 * s)).plate([[0.05 * s, -0.3], [1.85 * s, -1.42], [1.8 * s, -1.52], [0.05 * s, -0.48]], 0.12, A, 0.02);
    B.flap([[0.3 * s, -1.25], [1.65 * s, -1.68], [1.6 * s, -1.9], [0.3 * s, -1.45]], 0.05, [kx * s, ky, 0], QZ(-8 * s), [0.3 * s, -1.25], [1.65 * s, -1.68], 'roll', s, A);
    const tx = (kx + 2.0 * Math.cos(8 * d)) * s, ty = ky - 2.0 * Math.sin(8 * d);
    B.light(tx, ty, -1.75, s > 0 ? RED : GRN, 'steady'); B.tips.push({ x: tx, y: ty, z: -1.8 });
    B.paint().at(0.3 * s, 0.35, 0, QZ(90 - 35 * s)).plate([[0, -2.3], [0, -1.4], [0.8, -2.1], [0.85, -2.4]], 0.07, A, 0.025);
    B.flap([[0.1, -2.22], [0.8, -2.22], [0.83, -2.42], [0.1, -2.42]], 0.05, [0.3 * s, 0.35, 0], QZ(90 - 35 * s), [0.1, -2.22], [0.8, -2.22], 'yaw', 1, A);
  }
  B.dark().at(0, -0.42, 0.6).bbox(0.5, 0.1, 2.0, 0.04, DARK);
  B.metal().at(0, 0, 4.2).cyl(0.02, 0.008, 0.3, 6, STEEL);
  B.light(0, 0.4, -2.1, WHT, 'strobe');
  return B.finish([-0.6, 0.0, 0.9, 0.26, 0.6]);
}

function wisp(B) {
  const P = B.P, A = B.A, px = -0.85, rx = 0.75, R = 1.45;
  B.paint().at(px, 0, 0).lathe([[0.02, -1.9], [0.32, -1.7], [0.5, -1.1], [0.56, -0.2], [0.52, 0.8], [0.4, 1.6], [0.2, 2.3], [0.02, 2.6]], 26, P, 0.95, 0.9);
  B.canopy(0.32, 0.1, 1.9, 0.36, 0.92, px);
  B.g.mat(0, 0.65, 0, DET.hull).at(px, -0.42, 0.2).bbox(0.7, 0.12, 2.2, 0.05, CER);
  const prof = [[R, 0.15], [R + 0.07, 0], [R + 0.09, -0.4], [R + 0.05, -0.85], [R - 0.02, -1.1], [R - 0.07, -0.85], [R - 0.08, -0.4], [R - 0.05, 0], [R, 0.15]];
  B.g.mat(0.1, 0.45, 1, DET.hull).at(rx, 0.1, -0.3, QZ(12)).lathe(prof, 48, CER);
  B.dark().at(rx, 0.1, -0.15, QZ(12)).torus(R, 0.03, 48, 5, DARK);
  B.dark().at((px + rx) / 2 + 0.55, 0.05, -0.5, QY(90)).cyl(0.11, 0.11, rx - px + 1.6, 10, GUN);
  B.paint().at(rx + 1.05, -0.95, -0.4).lathe([[0.3, -1.2], [0.38, -0.9], [0.38, 0.6], [0.22, 1.1], [0.02, 1.3]], 18, A);
  B.dark().at(rx + 0.62, -0.55, -0.4, QZ(-50)).bbox(0.12, 0.9, 0.5, 0.03, GUN);
  B.nozzle(rx + 1.05, -0.95, -1.75, 0.34, 0.55, 9);
  B.nozzle(px, -0.05, -2.1, 0.2, 0.35, 6);
  B.paint().at(px, 0.45, 0, QZ(90)).plate([[0, -1.6], [0, -0.6], [1.1, -1.4], [1.15, -1.7]], 0.06, A, 0.02);
  B.flap([[0.1, -1.52], [1.05, -1.52], [1.1, -1.72], [0.1, -1.72]], 0.04, [px, 0.45, 0], QZ(90), [0.1, -1.52], [1.05, -1.52], 'yaw', 1, A);
  B.flap([[-1.2, 0], [1.2, 0], [1.2, -0.28], [-1.2, -0.28]], 0.04, [rx, 0.1, -0.95], QZ(12), [-1.2, 0], [1.2, 0], 'pitch', 1, CER);
  B.light(rx + R + 0.1, 0.1, -0.5, RED, 'steady'); B.light(px - 0.6, 0, -0.5, GRN, 'steady'); B.light(rx, R + 0.25, -0.5, WHT, 'strobe');
  B.tips.push({ x: rx + R, y: 0.1, z: -1 }, { x: px - 0.5, y: 0, z: -1.5 });
  B.metal().at(px, 0.55, 1.2, QX(-70)).cyl(0.016, 0.008, 0.5, 6, STEEL);
  return B.finish([0.2, 0.0, 0.7, 0.25, 1.45]);
}

function lancer(B) {
  const P = B.P, A = B.A;
  B.paint().at(0, 0, 0).lathe([[0.3, -2.7], [0.42, -2.3], [0.46, -1.0], [0.44, 0.6], [0.36, 1.8], [0.24, 2.9], [0.1, 3.8], [0.01, 4.3]], 24, P, 0.85, 1);
  B.canopy(0.3, -0.6, 1.0, 0.34, 0.85);
  for (const s of [-1, 1]) {
    B.dark().at(0.5 * s, -0.05, 2.4).lathe([[0.1, -1.4], [0.14, -1.1], [0.13, 0.9], [0.06, 1.6], [0.01, 1.8]], 12, GUN);
    B.dark().at(0.34 * s, -0.05, 1.0).bbox(0.3, 0.12, 0.5, 0.03, DARK);
    B.paint().at(0.4 * s, -0.04, 0).plate([[0, -2.1], [0, -0.7], [1.15 * s, -1.85], [1.15 * s, -2.2]], 0.07, P, 0.025);
    B.paint().at(0.42 * s, -0.02, 0).plate([[0.1 * s, -1.0], [1.05 * s, -1.95], [1.05 * s, -2.05], [0.1 * s, -1.2]], 0.075, A, 0.02);
    B.flap([[0.15 * s, -2.1], [1.1 * s, -2.1], [1.1 * s, -2.32], [0.15 * s, -2.32]], 0.04, [0.4 * s, -0.04, 0], null, [0.15 * s, -2.1], [1.1 * s, -2.1], 'roll', s, A);
    B.light(1.55 * s, -0.04, -2.0, s > 0 ? RED : GRN, 'steady'); B.tips.push({ x: 1.55 * s, y: -0.04, z: -2.1 });
    B.dark().at(0.2 * s, -0.3, -2.75).cyl(0.07, 0.06, 0.3, 10, GUN);
  }
  B.paint().at(0, 0.3, 0, QZ(90)).plate([[0, -2.7], [0, -1.5], [1.05, -2.45], [1.1, -2.75]], 0.07, A, 0.025);
  B.flap([[0.1, -2.62], [1.0, -2.62], [1.02, -2.82], [0.1, -2.82]], 0.05, [0, 0.3, 0], QZ(90), [0.1, -2.62], [1.0, -2.62], 'yaw', 1, A);
  B.paint().at(0, -0.3, 0, QZ(-90)).plate([[0, -2.7], [0, -1.9], [0.55, -2.55], [0.6, -2.75]], 0.07, P, 0.025);
  B.light(0, 1.45, -2.7, WHT, 'strobe');
  B.metal().at(0, 0, 4.4).cyl(0.02, 0.008, 0.3, 6, STEEL);
  B.greebleStrip(0, 0.42, -2.0, 4, 0.32, 0.16, 0.06);
  B.nozzle(0, 0, -2.95, 0.36, 0.6, 10);
  return B.finish([-1.2, 0.0, 0.8, 0.28, 0.5]);
}

function halberd(B) {
  const P = B.P, A = B.A;
  B.paint().at(0, 0, 0).plate([[-1.3, -2.1], [-1.3, 1.2], [-0.7, 2.2], [0.7, 2.2], [1.3, 1.2], [1.3, -2.1]], 0.62, P, 0.12);
  B.dark().at(0, -0.36, -0.1).plate([[-1.2, -2.0], [-1.2, 1.0], [-0.5, 1.9], [0.5, 1.9], [1.2, 1.0], [1.2, -2.0]], 0.2, GUN, 0.05);
  for (const s of [-1, 1]) {
    B.paint().at(1.75 * s, 0.05, -0.2).bbox(0.75, 0.95, 4.1, 0.14, P);
    B.paint().at(1.75 * s, 0.05, 2.0, QX(28)).bbox(0.72, 0.6, 0.7, 0.1, A);
    B.dark().at(1.75 * s, 0.05, 1.9).bbox(0.5, 0.35, 0.5, 0.05, SOOT);
    for (let k = 0; k < 4; k++) B.dark().at(2.14 * s, 0.05, -1.6 + k * 0.9).bbox(0.05, 0.5, 0.55, 0.01, GUN);
    B.paint().at(1.75 * s, 0.75, -1.3, QZ(90 - 8 * s)).plate([[0, -1.1], [0, 0.2], [0.75, -0.6], [0.8, -1.1]], 0.08, A, 0.03);
    B.flap([[0.1, -0.95], [0.72, -0.95], [0.75, -1.12], [0.1, -1.12]], 0.05, [1.75 * s, 0.75, -1.3], QZ(90 - 8 * s), [0.1, -0.95], [0.72, -0.95], 'yaw', 1, A);
    B.light(2.15 * s, 0.3, 1.2, s > 0 ? RED : GRN, 'steady'); B.tips.push({ x: 2.1 * s, y: 0.05, z: -2.2 });
    for (const x of [0.45, 1.25]) B.nozzle(x * s, 0.02, -2.45, 0.3, 0.6, 9);
  }
  B.paint().at(0, 0.42, 0.9).bbox(0.9, 0.3, 1.3, 0.1, P);
  B.canopy(0.5, 0.3, 1.6, 0.36, 1.1);
  for (let k = 0; k < 7; k++) B.metal().at(0, 0.42, -0.5 - k * 0.2).bbox(1.3, 0.22, 0.04, 0.01, STEEL);
  B.flap([[-1.1, -1.75], [1.1, -1.75], [1.1, -2.05], [-1.1, -2.05]], 0.06, [0, 0.33, 0], null, [-1.1, -1.75], [1.1, -1.75], 'pitch', 1, A);
  B.metal().at(-0.4, 0.75, 0.2, QX(-75)).cyl(0.02, 0.01, 0.6, 6, STEEL);
  B.light(0, 0.62, -1.9, WHT, 'strobe');
  return B.finish([0.0, 0.05, 1.0, 0.35, 2.2]);
}

function corsair(B) {
  const P = B.P, A = B.A;
  B.paint().at(-1.05, 0, -0.2).lathe([[0.42, -2.0], [0.5, -1.5], [0.52, 0.8], [0.4, 1.7], [0.15, 2.3], [0.02, 2.45]], 18, P);
  B.nozzle(-1.05, 0, -2.3, 0.44, 0.6, 10);
  B.paint().at(1.0, -0.05, -0.4).bbox(0.85, 0.8, 3.2, 0.12, OLIVE);
  B.dark().at(1.0, -0.05, 1.35).bbox(0.7, 0.6, 0.4, 0.15, GUN);
  for (const y of [-0.22, 0.14]) B.nozzle(1.0, y, -2.25, 0.2, 0.42, 6);
  for (const [y, z] of [[0.25, 0.4], [-0.25, 0.4], [0.25, -1.2], [-0.25, -1.2]]) B.metal().at(0, y, z, QY(90)).cyl(0.05, 0.05, 1.6, 6, STEEL);
  for (const z of [0.4, -1.2]) for (const s of [-1, 1]) B.metal().at(0, 0, z, QZ(55 * s).multiply(QY(90))).cyl(0.035, 0.035, 0.9, 6, STEEL);
  B.paint().at(0, 0.05, 1.6).lathe([[0.02, -0.6], [0.32, -0.45], [0.36, 0.2], [0.26, 0.7], [0.02, 0.95]], 16, A);
  B.canopy(0.18, 1.2, 2.3, 0.27, 1);
  B.metal().at(0, 0.05, 0.95).bbox(0.8, 0.08, 0.12, 0.02, STEEL).at(0, 0.05, 1.0).bbox(0.08, 0.08, 1.2, 0.02, STEEL);
  B.dark().at(-1.05, 0.38, -0.6).bbox(0.5, 0.1, 0.9, 0.03, RUST);
  B.paint().at(-1.42, 0.1, 0.4).bbox(0.12, 0.42, 0.7, 0.03, OLIVE);
  B.dark().at(1.0, 0.38, -0.8).bbox(0.6, 0.06, 1.3, 0.02, GUN);
  B.metal().at(0, 0, 0).tube([new Vec3(-0.62, 0.32, 1.0), new Vec3(-0.6, 0.35, -0.4), new Vec3(-0.75, 0.3, -1.6)], 0.05, 6, STEEL);
  for (let k = 0; k < 6; k++) B.metal().at(1.0, 0.42, 0.1 - k * 0.22).bbox(0.7, 0.14, 0.04, 0.01, STEEL);
  B.paint().at(-1.05, 0.45, 0, QZ(102)).plate([[0, -2.0], [0, -1.0], [0.75, -1.8], [0.8, -2.1]], 0.07, A, 0.025);
  B.flap([[0.1, -1.92], [0.72, -1.92], [0.75, -2.1], [0.1, -2.1]], 0.05, [-1.05, 0.45, 0], QZ(102), [0.1, -1.92], [0.72, -1.92], 'yaw', 1, A);
  B.dark().at(1.0, 0.65, -1.7).bbox(0.06, 0.55, 0.6, 0.02, OLIVE);
  B.flap([[-0.6, 0], [0.6, 0], [0.6, -0.25], [-0.6, -0.25]], 0.05, [0, -0.05, -1.25], null, [-0.6, 0], [0.6, 0], 'pitch', 1, P);
  B.light(-1.55, 0, -0.4, GRN, 'steady'); B.light(1.47, -0.05, -0.4, RED, 'steady'); B.light(1.0, 0.95, -1.9, WHT, 'strobe');
  B.tips.push({ x: -1.5, y: 0, z: -1.6 }, { x: 1.45, y: 0, z: -1.6 });
  return B.finish([-0.4, 0.0, 0.8, 0.3, 1.5]);
}

const BUILDERS = { kestrel, wisp, lancer, halberd, corsair };
export function buildShip(def, paint, accent) { return BUILDERS[def.id](new Builder(def, paint || def.color, accent || def.accent)); }

// Cockpit interior, in ship-local coordinates around the pilot's eye (origin)
export function buildCockpit() {
  const g = new Geo(), D = [0.08, 0.085, 0.095, 0], F = [0.16, 0.165, 0.18, 0];
  g.mat(0.6, 0.55, 0, DET.hull).at(0, -0.36, 0.62).bbox(1.1, 0.16, 0.42, 0.05, D);
  g.mat(0.6, 0.55, 0, DET.hull).at(0, -0.3, 0.83, QX(-28)).bbox(1.06, 0.06, 0.2, 0.02, F);
  for (const s of [-1, 1]) {
    g.mat(0.5, 0.5, 0, DET.hull).at(0.62 * s, -0.42, 0.15).bbox(0.22, 0.2, 0.9, 0.05, D);
    for (let k = 0; k < 6; k++) g.mat(0, 0.4, 3, 0).at(0.62 * s - 0.06 + (k % 3) * 0.05, -0.31, -0.05 + Math.floor(k / 3) * 0.08).box(0.025, 0.012, 0.025, k % 2 ? [1, 0.6, 0.2, 1] : [0.3, 0.9, 1, 1]);
    g.mat(0.7, 0.45, 0, DET.hull).at(0.38 * s, 0.02, 0.85, QZ(-24 * s).multiply(QX(-12))).bbox(0.045, 0.8, 0.05, 0.015, F);
  }
  g.mat(0.7, 0.45, 0, DET.hull).at(0, 0.4, 0.86).bbox(1.05, 0.04, 0.05, 0.015, F);
  const screen = new Geo().mat(0, 0.3, 2.2, 0).at(0, -0.255, 0.71, QX(-62)).box(0.62, 0.24, 0.005, [1, 1, 1, 1]);
  const glass = new Geo().mat(0.9, 0.04, 0, DET.glass).at(0, 0.0, -0.1).lathe([[0.62, 0.9], [0.58, 1.05], [0.4, 1.2], [0.05, 1.3]], 24, GLASS, 1.25, 1.0, 0.15, Math.PI - 0.15);
  return { body: g.build(), screen: screen.build(), glass: glass.build() };
}
export { Vec3, QY };
