// Shared course kit: chunked static geometry, hex energy walls, checkpoint gates, start gantry with countdown
// lamps, boost rings, energy crystals, girders, laser gates, corridor beacons and background traffic.
// Rule: nothing solid-looking may intrude into the collision corridor (|x| < w, |y| < h) unless it collides.
import { Vec3, Quat, makeRng } from '../../math.js';
import { Geo, QX, QY, QZ, DET } from '../geo.js';
import { gateNumber, textPanel } from '../textures.js';
import { buildCrystal } from '../props.js';

export const fq = (t, i) => new Quat().fromBasis(new Vec3().copy(t.bin[t.wrapIdx(i)]).scale(-1), t.nrm[t.wrapIdx(i)], t.tan[t.wrapIdx(i)]);
export const P = (t, i, x, y) => t.pointAt(i, x, y);
const v3 = (x, y, z) => new Vec3(x, y, z);

// Static geometry split into track chunks so whole chunks can be frustum- and distance-culled
export class Chunks {
  constructor(t, size = 64) { this.t = t; this.size = size; this.m = new Map(); }
  get(i, key = 'main') { const c = Math.floor(this.t.wrapIdx(Math.round(i)) / this.size), k = key + '|' + c; if (!this.m.has(k)) this.m.set(k, { key, geo: new Geo() }); return this.m.get(k).geo; }
  items(gfx, key, opts = {}) {
    const out = [];
    for (const [k, v] of this.m) { if (v.key !== key || !v.geo.i.length) continue; const b = v.geo.bounds();
      out.push({ mesh: gfx.mesh(v.geo.build()), visible: true, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r }, ...opts }); }
    return out;
  }
}
// quad strip between two lateral profiles a(i) -> [x, y] and b(i) -> [x, y]; optional uv(i, side) -> colour override
export function ribbon(g, t, a, b, col, i0 = 0, i1 = t.N, step = 2, only = null, uv = null) {
  let prev = null; const e1 = new Vec3();
  for (let k = i0; k <= i1; k += step) {
    const i = t.wrapIdx(k); if (only && !only(i)) { prev = null; continue; }
    const [ax, ay] = a(i), [bx, by] = b(i), pa = P(t, i, ax, ay), pb = P(t, i, bx, by);
    const n = new Vec3().crossVectors(e1.subVectors(pb, pa), t.tan[i]).normalize();
    const ia = g.vw(pa, n, uv ? uv(i, 0, k) : col), ib = g.vw(pb, n, uv ? uv(i, 1, k) : col);
    if (prev) g.quad(prev[0], prev[1], ib, ia);
    prev = [ia, ib];
  }
}
// Hex energy field on the open faces of the corridor; brightens near the player and ripples where ships hit it
export function hexField(gfx, t, faceFn, tint, step = 2) {
  const ch = new Chunks(t, 48);
  const faces = [['L', i => [-t.w[i], -t.h[i]], i => [-t.w[i], t.h[i]], i => t.h[i] * 2], ['R', i => [t.w[i], t.h[i]], i => [t.w[i], -t.h[i]], i => t.h[i] * 2],
    ['T', i => [-t.w[i], t.h[i]], i => [t.w[i], t.h[i]], i => t.w[i] * 2], ['B', i => [t.w[i], -t.h[i]], i => [-t.w[i], -t.h[i]], i => t.w[i] * 2]];
  for (const [f, a, b, span] of faces) for (let c = 0; c < t.N; c += 48) {
    const g = ch.get(c, 'hex'), i1 = Math.min(t.N, c + 48);
    ribbon(g, t, a, b, null, c, i1, step, i => faceFn(i, f), (i, side, k) => [k * t.D / 40, side ? span(i) / 40 : 0, 0, 1]);
  }
  const state = { ship: v3(0, 0, 0), hits: [], tint };
  return { items: ch.items(gfx, 'hex', { prog: 'hex', blend: 'add', opacity: 1, maxDist: 260, layer: 7 }), state,
    hit(pos, time) { state.hits.unshift({ x: pos.x, y: pos.y, z: pos.z, t: time }); if (state.hits.length > 4) state.hits.pop(); } };
}
// Checkpoint gates (outside the corridor) with holo numerals, and the start/finish gantry with countdown lamps
export function gates(gfx, t, o = {}) {
  const g = new Geo(), lit = new Geo().mat(0, 0.4, 4, 0), items = [], quad = gfx.mesh(new Geo().box(1, 1, 0.001, [1, 1, 1, 1]).build());
  const frame = (i, W, H, th, depth, col, glow) => {
    const q = fq(t, i), put = (x, y, sx, sy, sz, c, geo = g) => { const p = P(t, i, x, y); geo.at(p.x, p.y, p.z, q).bbox(sx, sy, sz, Math.min(sx, sy, sz) * 0.2, c); };
    g.mat(0.7, 0.42, 1, DET.struct);
    put(0, H + th / 2, 2 * W + 2 * th, th, depth, col); put(0, -H - th / 2, 2 * W + 2 * th, th, depth, col);
    put(W + th / 2, 0, th, 2 * H, depth, col); put(-W - th / 2, 0, th, 2 * H, depth, col);
    for (const [x, y] of [[W + th / 2, H + th / 2], [-W - th / 2, H + th / 2], [W + th / 2, -H - th / 2], [-W - th / 2, -H - th / 2]]) put(x, y, th * 1.6, th * 1.6, depth * 1.3, [0.18, 0.19, 0.21, 0]);
    if (glow) { const gl = (x, y, sx, sy) => { const p = P(t, i, x, y); lit.at(p.x, p.y, p.z, q).box(sx, sy, 0.35, [...glow, 1]); };
      gl(0, H + 0.05, 2 * W - 2, 0.25); gl(0, -H - 0.05, 2 * W - 2, 0.25); gl(W + 0.05, 0, 0.25, 2 * H - 2); gl(-W - 0.05, 0, 0.25, 2 * H - 2); }
    return q;
  };
  const style = o.style || 'open';
  t.cpIdx.forEach((i, k) => {
    if (k === 0) return;
    const W = t.w[i] + 1.2, H = t.h[i] + 1.2, th = style === 'trench' ? 3.5 : 2.6;
    const q = frame(i, W, H, th, 3.2, [0.3, 0.31, 0.34, 0], [0.35, 0.85, 1]);
    const p = P(t, i, 0, H + th + Math.max(4, W * 0.18) + 1.5), sz = Math.max(8, W * 0.36);
    items.push({ mesh: quad, prog: 'unlit', mode: 1, blend: 'add', tex: gfx.texture(gateNumber(String(k), [0.4, 0.9, 1])), pos: p, quat: q.clone().multiply(QY(180)), sx: sz, sy: sz, sz: 1, intensity: 1.5, color: [1, 1, 1, 1], visible: true, layer: 6, br: sz });
  });
  // start/finish gantry
  const i0 = t.cpIdx[0], W0 = t.w[i0] + 1.5, H0 = t.h[i0] + 1.5, q0 = frame(i0, W0, H0, 4, 5, [0.36, 0.34, 0.3, 0], [1, 0.75, 0.3]);
  const top = H0 + 4 + 4;
  { const p = P(t, i0, 0, top); g.mat(0.7, 0.42, 1, DET.struct).at(p.x, p.y, p.z, q0).bbox(2 * W0 + 16, 8, 6, 1, [0.24, 0.25, 0.27, 0]); }
  const cheq = document.createElement('canvas'); cheq.width = 256; cheq.height = 32; { const c = cheq.getContext('2d'); for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#eee'; c.fillRect(x * 8, y * 8, 8, 8); } }
  const ctex = gfx.texture(cheq), btex = gfx.texture(textPanel('STARLANE GRAND PRIX', [1, 0.72, 0.25]));
  for (const side of [1, -1]) {
    const q = q0.clone().multiply(QY(side > 0 ? 180 : 0)), p = P(t, i0, 0, top + 0.5).addScaled(t.tan[i0], 3.05 * -side);
    items.push({ mesh: quad, prog: 'unlit', blend: 'add', tex: btex, pos: p, quat: q, sx: Math.min(2 * W0, 70), sy: Math.min(2 * W0, 70) / 8, sz: 1, intensity: 1.6, color: [1, 1, 1, 1], visible: true, layer: 6, br: 40 });
    const p2 = P(t, i0, 0, H0 + 2).addScaled(t.tan[i0], 2.55 * -side);
    items.push({ mesh: quad, pos: p2, quat: q, sx: 2 * W0 + 6, sy: 3.4, sz: 1, tex: ctex, prog: 'unlit', intensity: 0.9, color: [1, 1, 1, 1], visible: true, br: 40 });
  }
  // countdown lamps facing the grid
  const lamp = gfx.mesh(new Geo().sphere(1, 16, 10, [1, 1, 1, 1]).build()), lamps = [];
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * Math.min(6, W0 * 0.22), p = P(t, i0, x, top - 1).addScaled(t.tan[i0], -3.4);
    { const ph = P(t, i0, x, top - 1).addScaled(t.tan[i0], -3.0); g.mat(0.8, 0.4, 0, 0).at(ph.x, ph.y, ph.z, q0).bbox(2.8, 2.8, 1.2, 0.3, [0.06, 0.06, 0.07, 0]); }
    const it = { mesh: lamp, prog: 'unlit', pos: p, quat: new Quat(), scale: 1, color: [1, 0.1, 0.05, 1], intensity: 0.2, visible: true, br: 2 }; items.push(it); lamps.push(it);
  }
  items.push({ mesh: gfx.mesh(g.build()), visible: true, cast: true }, { mesh: gfx.mesh(lit.build()), visible: true });
  return { items, lamps, update(race, time) {
    let mode = 'idle', lit = 0;
    if (race.state === 'countdown') { mode = 'count'; lit = Math.floor(Math.max(0, Math.min(1, (3.6 - race.countdown) / 3.0)) * 5.0 + 1e-6); }
    else if (race.time < 2.2 && race.state === 'racing') mode = 'go';
    lamps.forEach((l, k) => {
      if (mode === 'count') { l.color = [1, 0.08, 0.04, 1]; l.intensity = k < lit ? 7 : 0.15; }
      else if (mode === 'go') { l.color = [0.15, 1, 0.3, 1]; l.intensity = 7; }
      else { l.color = [1, 0.55, 0.1, 1]; l.intensity = (Math.floor(time * 3) % 5) === k ? 4 : 0.4; }
    });
  } };
}
// Boost rings and energy crystals
export function pickups(gfx, t, o = {}) {
  const items = [], ringG = new Geo(), lit = new Geo().mat(0, 0.4, 5, 0), energy = new Geo().mat(0, 1, 1, 0);
  for (const p of t.pads) {
    const q = fq(t, p.i), c = P(t, p.i, p.x, p.y), arch = o.floorPads;
    const a0 = arch ? -0.32 : 0, a1 = arch ? Math.PI + 0.32 : Math.PI * 2;
    ringG.mat(0.85, 0.35, 0, DET.hull).at(c.x, c.y, c.z, q).torus(p.r + 0.7, 0.55, 48, 8, [0.12, 0.12, 0.13, 0], a0, a1);
    for (let k = 0; k < 12; k++) { const a = a0 + (k + 0.5) / 12 * (a1 - a0), pp = new Vec3(Math.cos(a) * (p.r + 0.7), Math.sin(a) * (p.r + 0.7), 0).applyQuat(q).add(c); lit.at(pp.x, pp.y, pp.z, q.clone().multiply(QZ(a * 180 / Math.PI))).box(0.25, 1.4, 1.25, [1, 0.62, 0.15, 1]); }
    energy.at(c.x, c.y, c.z, q).torus(p.r - 0.1, 0.12, 48, 4, [1, 0.7, 0.25, 1], a0, a1);
    for (let k = 0; k < 3; k++) { const cc = P(t, p.i - 3 - k * 3, p.x, p.y - (arch ? 3.6 : 0)), hq = fq(t, p.i - 3 - k * 3).multiply(QX(arch ? 90 : 0));
      energy.at(cc.x, cc.y, cc.z, hq).plate([[0, 1.6], [0, 0.6], [2.8, -1.4], [2.8, -0.4]], 0.05, [1, 0.8, 0.3, 1]).plate([[0, 1.6], [-2.8, -0.4], [-2.8, -1.4], [0, 0.6]], 0.05, [1, 0.8, 0.3, 1]); }
  }
  items.push({ mesh: gfx.mesh(ringG.build()), visible: true }, { mesh: gfx.mesh(lit.build()), visible: true });
  const en = { mesh: gfx.mesh(energy.build()), prog: 'unlit', blend: 'add', intensity: 2.2, opacity: 1, color: [1, 1, 1, 1], visible: true, layer: 2 }; items.push(en);
  const crystal = gfx.mesh(buildCrystal()), cells = [];
  for (const c of t.cells) { const it = { mesh: crystal, pos: P(t, c.i, c.x, c.y), quat: new Quat(), scale: 1.1, color: c.ion ? [1, 0.3, 1, 1] : [0.3, 0.95, 1, 1], visible: true, br: 1.6 }; items.push(it); cells.push({ c, it, base: it.pos.clone() }); }
  return { items, update(dt, time, fx) {
    en.intensity = 1.8 + Math.sin(time * 7) * 0.6;
    for (const k of cells) { k.it.visible = k.c.active; if (!k.c.active) continue; k.it.quat.setAxisAngle(0, 1, 0, time * 2.2 + k.c.i); k.it.pos.copy(k.base); k.it.pos.y += Math.sin(time * 2 + k.c.i) * 0.25;
      const p = k.it.pos, ion = k.c.ion; fx.bbAdd.add(p.x, p.y, p.z, 3.4, ion ? 0.9 : 0.15, ion ? 0.2 : 0.75, 1, 0.35); fx.bbAdd.add(p.x, p.y, p.z, 5.4, ion ? 0.5 : 0.1, ion ? 0.1 : 0.4, 0.6, 0.6, 0, 0, 0, -1); }
  } };
}
// Girders and pillars sized to their collision radius (within 5%), laser gates with armoured emitters
export function hazards(gfx, t, o = {}) {
  const items = [], g = new Geo(), lit = new Geo().mat(0, 0.4, 4, 0), HZ = [[0.95, 0.68, 0.08, 0], [0.07, 0.07, 0.08, 0]];
  for (const ob of t.obstacles) {
    if (ob.type !== 'hbeam' && ob.type !== 'vbeam') continue;
    const q = fq(t, ob.i), r = ob.r, hb = ob.type === 'hbeam', span = hb ? t.w[ob.i] + 4 : t.h[ob.i] + 4, ax = hb ? QY(90) : QX(90);
    const c = P(t, ob.i, hb ? 0 : ob.x, hb ? ob.y : 0), qq = q.clone().multiply(ax), segs = Math.round(span / 3);
    for (let k = -segs; k < segs; k++) { const p = new Vec3(0, 0, (k + 0.5) * span / segs).applyQuat(qq).add(c); g.mat(0.5, 0.5, 1, DET.hull).at(p.x, p.y, p.z, qq).cyl(r * 0.98, r * 0.98, span / segs, 20, HZ[(k + 100) % 2], false); }
    for (let k = -segs; k <= segs; k += 2) { const p = new Vec3(0, 0, k * span / segs).applyQuat(qq).add(c); g.mat(0.8, 0.4, 0, 0).at(p.x, p.y, p.z, qq).torus(r * 0.98, r * 0.05, 24, 6, [0.3, 0.3, 0.32, 0]); }
    for (const s of [-1, 1]) { const p = new Vec3(0, 0, s * (span - 1)).applyQuat(qq).add(c); g.mat(0.6, 0.5, 1, DET.struct).at(p.x, p.y, p.z, qq).bbox(r * 3.2, r * 3.2, 3, 0.4, [0.22, 0.23, 0.25, 0]);
      const lp = new Vec3(0, r * 1.7, s * (span - 2.5)).applyQuat(qq).add(c); lit.at(lp.x, lp.y, lp.z).box(0.6, 0.6, 0.6, [1, 0.25, 0.1, 1]); }
    items.push({ kind: 'spark', ob });
  }
  const gatesV = [];
  for (const gt of t.lasers) {
    const q = fq(t, gt.i), w = t.w[gt.i], h = t.h[gt.i], hor = gt.side === 'L' || gt.side === 'R', red = [1, 0.12, 0.06, 1];
    const sx = gt.side === 'L' ? -w / 2 : w / 2, sy = gt.side === 'B' ? -h / 2 : h / 2;
    const beams = new Geo(), sheet = new Geo();
    for (let k = 0; k < 6; k++) {
      if (hor) { const p = P(t, gt.i, sx, -h + (k + 0.5) * (2 * h / 6)); beams.at(p.x, p.y, p.z, q.clone().multiply(QY(90))).cyl(0.16, 0.16, w, 8, red, false); }
      else { const p = P(t, gt.i, -w + (k + 0.5) * (2 * w / 6), sy); beams.at(p.x, p.y, p.z, q.clone().multiply(QX(90))).cyl(0.16, 0.16, h, 8, red, false); }
    }
    const pc = P(t, gt.i, hor ? sx : 0, hor ? 0 : sy); sheet.at(pc.x, pc.y, pc.z, q).box(hor ? w : 2 * w, hor ? 2 * h : h, 0.05, [1, 0.15, 0.08, 1]);
    // emitters on both sides of the active half, set into the walls/floor (outside the corridor)
    for (const s of [-1, 1]) {
      const ep = hor ? P(t, gt.i, sx + s * (w / 2 + 1.2), 0) : P(t, gt.i, s * (w + 1.2), sy);
      g.mat(0.7, 0.4, 1, DET.hull).at(ep.x, ep.y, ep.z, q).bbox(hor ? 2.4 : 2.4, hor ? 2 * h : h, 4, 0.5, [0.16, 0.16, 0.18, 0]);
      lit.at(ep.x, ep.y, ep.z, q).box(0.4, hor ? 2 * h - 2 : h - 2, 0.6, [1, 0.3, 0.12, 1]);
    }
    const bIt = { mesh: gfx.mesh(beams.build()), prog: 'unlit', blend: 'add', intensity: 5, color: [1, 1, 1, 1], visible: false, layer: 3 };
    const sIt = { mesh: gfx.mesh(sheet.build()), prog: 'unlit', mode: 1, blend: 'add', intensity: 0.5, opacity: 0.6, color: [1, 1, 1, 1], visible: false, layer: 3 };
    items.push(bIt, sIt); gatesV.push({ gt, bIt, sIt, strobe: P(t, gt.i, hor ? sx : 0, hor ? h + 1 : sy) });
  }
  const sparks = items.filter(x => x.kind === 'spark'); for (const s of sparks) items.splice(items.indexOf(s), 1);
  if (g.i.length) items.push({ mesh: gfx.mesh(g.build()), visible: true, cast: true });
  if (lit.i.length) items.push({ mesh: gfx.mesh(lit.build()), visible: true });
  return { items, update(dt, time, race, fx, cam) {
    for (const v of gatesV) {
      const on = race.laserActive(v.gt, race.time), warn = !on && race.state === 'racing' && race.laserActive(v.gt, race.time + 0.6);
      v.bIt.visible = on; v.sIt.visible = on || warn; v.sIt.intensity = on ? 0.5 + Math.random() * 0.2 : (Math.floor(time * 14) % 2 ? 0.25 : 0);
      if ((on || warn) && cam.pos.dist(v.strobe) < 500 && Math.floor(time * 8) % 2) fx.bbAdd.add(v.strobe.x, v.strobe.y, v.strobe.z, 3, 4, 0.5, 0.2, 1);
    }
    // sparks raining off girders near the camera
    for (const s of sparks) { const ob = s.ob, p = P(t, ob.i, ob.type === 'hbeam' ? (Math.random() - 0.5) * 2 * t.w[ob.i] : ob.x, ob.type === 'hbeam' ? ob.y - ob.r : (Math.random() - 0.5) * 2 * t.h[ob.i]);
      if (cam.pos.dist(p) < 220 && Math.random() < dt * 9) fx.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, 1.4, 0.05, 0.03, 3.2, 1.8, 0.6, 1, true, 0.3, 0.04, 14); }
  } };
}
// Corridor beacons: small lamps on the four edges every few samples
export function beacons(gfx, t, colL, colR, every = 10, skip = null) {
  const ch = new Chunks(t, 64);
  for (let i = 0; i < t.N; i += every) {
    if (skip && skip(i)) continue;
    const q = fq(t, i), w = t.w[i] + 0.6, h = t.h[i] + 0.6, g = ch.get(i, 'b'), gl = ch.get(i, 'l');
    for (const [x, y, c] of [[-w, -h, colL], [w, -h, colR], [-w, h, colL], [w, h, colR]]) { const p = P(t, i, x, y);
      g.mat(0.8, 0.4, 0, 0).at(p.x, p.y, p.z, q).bbox(1.1, 1.1, 2.2, 0.25, [0.12, 0.12, 0.13, 0]); gl.mat(0, 0.4, 5, 0).at(p.x, p.y, p.z, q).box(0.5, 0.5, 2.4, [...c, 1]); }
  }
  return [...ch.items(gfx, 'b', { maxDist: 1600 }), ...ch.items(gfx, 'l', { maxDist: 2400 })];
}
// Route guides: light pylons on the corridor corners joined by guide beams, with a pulse that runs ahead of the
// field, plus amber chevron boards outside every real turn. Everything sits on or outside the collision boundary.
// o: { colL, colR, corners(i) -> corner ids (0 BL, 1 BR, 2 TL, 3 TR), open(i, axis, sign) -> that face has no wall }
export function routeGuides(gfx, t, o) {
  const N = t.N, E = 8, nodes = [], ch = new Chunks(t, 64), CS = [[-1, -1], [1, -1], [-1, 1], [1, 1]], loc = {};
  const corners = o.corners || (() => [0, 1, 2, 3]), open = o.open || (() => true);
  for (let i = 0; i < N; i += E) {
    const q = fq(t, i), w = t.w[i] + 0.8, h = t.h[i] + 0.8, pts = [null, null, null, null];
    for (const k of corners(i)) { const [sx, sy] = CS[k], p = P(t, i, sx * w, sy * h); pts[k] = p;
      ch.get(i, 'b').mat(0.8, 0.4, 0, 0).at(p.x, p.y, p.z, q).bbox(1.3, 1.3, 2.6, 0.25, [0.16, 0.16, 0.17, 0]);
      ch.get(i, 'l').mat(0, 0.4, 5, 0).at(p.x, p.y, p.z, q).box(0.6, 0.6, 2.8, [...(sx < 0 ? o.colL : o.colR), 1]); }
    nodes.push({ i, pts });
  }
  // chevrons: look 120 m ahead; a turn of more than ~20 degrees gets three boards on its outside, pointing inward
  const cg = new Geo(), AMB = [1, 0.56, 0.14, 1];
  for (let i = 0; i < N;) {
    const j = t.wrapIdx(i + 30), lat = t.tan[j].dot(t.bin[i]), ver = t.tan[j].dot(t.nrm[i]);
    if (Math.max(Math.abs(lat), Math.abs(ver)) < 0.34) { i += 4; continue; }
    const hz = Math.abs(lat) >= Math.abs(ver), sg = Math.sign(hz ? lat : ver), dx = hz ? sg : 0, dy = hz ? 0 : sg;
    for (const off of [4, 12, 20]) {
      const k = t.wrapIdx(i + off); if (!open(k, hz ? 'x' : 'y', -sg)) continue;
      const a = Math.min(3.6, Math.max(1.8, t.h[k] * 0.09)), PL = a * 3.5, PC = a * 1.9, pw = hz ? PL : PC, ph = hz ? PC : PL;
      const cx = hz ? -sg * (t.w[k] + pw / 2 + 0.6) : 0, cy = hz ? 0 : -sg * (t.h[k] + ph / 2 + 0.6), pc = P(t, k, cx, cy);
      cg.mat(0.7, 0.5, 0, 0).at(pc.x, pc.y, pc.z, fq(t, k)).bbox(pw, ph, 0.35, 0.06, [0.07, 0.07, 0.08, 0]);
      for (let m = -1; m <= 1; m++) {
        const ccx = cx + dx * m * a * 1.05, ccy = cy + dy * m * a * 1.05, tx = ccx + dx * a * 0.42, ty = ccy + dy * a * 0.42;
        for (const sd of [-1, 1]) {
          const ex = ccx - dx * a * 0.42 - dy * sd * a * 0.55, ey = ccy - dy * a * 0.42 + dx * sd * a * 0.55, ux = tx - ex, uy = ty - ey, L = Math.hypot(ux, uy);
          const mp = P(t, k, (tx + ex) / 2, (ty + ey) / 2).addScaled(t.tan[k], -0.25);
          cg.mat(0, 0.4, 4.5, 0).at(mp.x, mp.y, mp.z, fq(t, k).multiply(QZ(Math.atan2(ux, uy) * 180 / Math.PI))).box(a * 0.3, L + a * 0.15, 0.2, AMB);
        }
      }
    }
    i += 44;
  }
  const items = [...ch.items(gfx, 'b', { maxDist: 1800 }), ...ch.items(gfx, 'l', { maxDist: 2600 })];
  if (cg.i.length) items.push({ mesh: gfx.mesh(cg.build()), visible: true });
  let hint = 0;
  return { items, update(fx, cam, race, time) {
    const me = race && race.player; let ti;
    if (me && !me.wrecked) ti = me.ti; else { t.locate(cam.pos, hint, loc, 80); ti = loc.i; }
    hint = ti;
    const n = nodes.length, k0 = Math.floor(ti / E), cp = cam.pos;
    for (let j = -2; j < 72; j++) {
      const a = nodes[((k0 + j) % n + n) % n], b = nodes[((k0 + j + 1) % n + n) % n], fade = j < 0 ? 0.6 : Math.min(1, (2300 - j * E * t.D) / 900);
      if (fade <= 0) break;
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(a.i * t.D * 0.03 - time * 7.5), 12);
      for (let c = 0; c < 4; c++) {
        const p = a.pts[c], q = b.pts[c]; if (!p || !q) continue;
        const col = c % 2 ? o.colR : o.colL, dist = Math.hypot((p.x + q.x) / 2 - cp.x, (p.y + q.y) / 2 - cp.y, (p.z + q.z) / 2 - cp.z), parts = dist < 90 ? 4 : 1;
        const th = Math.max(0.42, dist * 0.0026), al = (0.5 + 0.9 * pulse) * fade * Math.min(1, 0.9 / th), I = 3.4;
        fx.bbAdd.add(p.x, p.y, p.z, Math.max(1.8, dist * 0.005), col[0] * 2.4, col[1] * 2.4, col[2] * 2.4, (0.55 + 0.45 * pulse) * fade); // pylon lamp halo
        const dx = (q.x - p.x) / parts, dy = (q.y - p.y) / parts, dz = (q.z - p.z) / parts, L = Math.hypot(dx, dy, dz) || 1;
        for (let m = 0; m < parts; m++) fx.bbAdd.add(p.x + dx * (m + 0.5), p.y + dy * (m + 0.5), p.z + dz * (m + 0.5), th, col[0] * I, col[1] * I, col[2] * I, al, dx / L, dy / L, dz / L, L * 1.36);
      }
    }
  } };
}
// Background movers: meshes on parametric paths with blinking running lights
export function movers(list) {
  const items = list.map(m => { m.it = { mesh: m.mesh, pos: new Vec3(), quat: new Quat(), scale: m.scale || 1, visible: true, br: m.br || 200, cast: false }; return m.it; });
  return { items, update(dt, time, fx) {
    for (const m of list) { m.path(time, m.it.pos, m.it.quat);
      if (m.lights) for (const l of m.lights) { if (l.blink && Math.floor((time + l.ph) * l.blink) % 2) continue; const p = new Vec3(l.x, l.y, l.z).scale(m.scale || 1).applyQuat(m.it.quat).add(m.it.pos); fx.bbAdd.add(p.x, p.y, p.z, l.s, l.c[0], l.c[1], l.c[2], 1); } }
  } };
}
// Distant fleet skirmish: fighters, tracer fire, flak and the odd explosion. Never near the racing line.
export function skirmish(center, radius, seed = 1) {
  const rng = makeRng(seed), ships = Array.from({ length: 26 }, (_, k) => ({ a: rng() * 6.28, w: 0.12 + rng() * 0.12, r: radius * (0.4 + rng() * 0.6), tilt: rng() * 1.2 - 0.6, y: (rng() - 0.5) * radius * 0.4, side: k % 2 }));
  const pos = s => new Vec3(Math.cos(s.a) * s.r, s.y + Math.sin(s.a * 2) * s.r * 0.15 * s.tilt, Math.sin(s.a) * s.r).add(center);
  let boom = 3;
  return { update(dt, time, fx, cam) {
    if (cam && cam.pos.dist(center) > radius * 7) return;
    for (const s of ships) { s.a += s.w * dt; const p = pos(s); fx.bbAdd.add(p.x, p.y, p.z, 6, s.side ? 2.5 : 0.8, s.side ? 0.6 : 1.4, s.side ? 0.3 : 2.6, 0.9);
      if (Math.random() < dt * 1.2) { const o = ships[Math.floor(Math.random() * ships.length)], q = pos(o), d = q.sub(p).normalize();
        fx.spawn(p.x, p.y, p.z, d.x * 700, d.y * 700, d.z * 700, 1.6, 2.4, 2.4, s.side ? 3 : 0.6, s.side ? 0.5 : 2.6, s.side ? 0.3 : 0.8, 1, true, 0, 0.05); } }
    if (Math.random() < dt * 2) { const p = new Vec3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 2).scale(radius * 0.8).add(center);
      fx.spawn(p.x, p.y, p.z, 0, 0, 0, 0.5, 6, 22, 3, 1.6, 0.6, 0.9, true, 0); fx.spawn(p.x, p.y, p.z, 0, 4, 0, 2.5, 10, 40, 0.1, 0.1, 0.1, 0.4, false, 0.5); }
    if ((boom -= dt) < 0) { boom = 4 + Math.random() * 6; const s = ships[Math.floor(Math.random() * ships.length)]; fx.explosion(pos(s), null, 9); }
  } };
}
export { v3 };
// Sky body: planet with atmosphere shell and optional ring system. V6: the shell is sized to the atmosphere's scale
// height and shaded with the same optical-depth model as the body; the planet shadows its ring and the ring shadows
// the planet, both through one radial profile texture.
let RING = null, SPH = null;
const ATM = [[0.016, 0.12, 0.3], [0.008, 0.05, 0.3], [0.008, 0.004, 0.25], [0.025, 0.45, 0.36]]; // per type: scale height (radii), vertical optical depth, brightness
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// radial ring profile (opacity and colour across the ring, inner edge to outer edge): a faint inner ring, a broad
// dense ring, a clean division, an outer ring with a narrow gap, a thin ringlet beyond, all broken into ringlets
export function ringProfile(seed, colA, colB, N = 2048) {
  const rng = makeRng(seed * 977 + 13), data = new Uint8Array(N * 4);
  const vn = k => { const T = Array.from({ length: k + 2 }, () => rng()); return x => { x *= k; const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return T[i] * (1 - s) + T[i + 1] * s; }; };
  const n1 = vn(7), n2 = vn(36), n3 = vn(150), n4 = vn(620), nc = vn(11);
  const gap = 0.58 + rng() * 0.08, gw = 0.03 + rng() * 0.025, enk = gap + gw + 0.12 + rng() * 0.1, fr = 0.955 + rng() * 0.02;
  for (let i = 0; i < N; i++) { const u = (i + 0.5) / N;
    let op = u < 0.22 ? 0.1 + 0.15 * smooth(0, 0.22, u) : u < gap ? 0.45 + 0.45 * smooth(0.22, 0.36, u) : u < gap + gw ? 0.03 : u < 0.92 ? 0.55 : 0.03;
    op *= (0.72 + 0.56 * n2(u)) * (0.82 + 0.36 * n3(u)) * (0.85 + 0.3 * n4(u)) * (0.85 + 0.3 * n1(u));
    if (Math.abs(u - enk) < 0.003) op *= 0.08;
    if (Math.abs(u - fr) < 0.004) op = 0.55 * (1 - Math.abs(u - fr) / 0.004);
    op = Math.min(0.97, Math.max(0, op * smooth(0, 0.015, u) * smooth(1, 0.99, u)));
    const t = Math.min(1, Math.max(0, 0.3 + 0.55 * nc(u) + (op - 0.4) * 0.5));
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(Math.pow(colB[c] + (colA[c] - colB[c]) * t, 2.2) * 255); // linear colour: the ring shader needs no pow()
    data[i * 4 + 3] = Math.round(op * 255); }
  return data;
}
export function planetItems(gfx, env, seed) {
  const pl = env.planet; if (!pl) return [];
  if (!SPH || SPH.gfx !== gfx) { SPH = { gfx, m: gfx.mesh(new Geo().sphere(1, 96, 64, [1, 1, 1, 0]).build()) };
    const g = new Geo(), seg = 160, inner = 0.55; let prev = null;
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); const i0 = g.v(c * inner, 0, s * inner, 0, 1, 0, [1, 1, 1, 0]), i1 = g.v(c, 0, s, 0, 1, 0, [1, 1, 1, 0]); if (prev) g.quad(prev[0], prev[1], i1, i0); prev = [i0, i1]; }
    RING = gfx.mesh(g.build()); }
  const ppos = new Vec3().copy(pl.dir).normalize().scale(pl.dist), tilt = QZ(pl.tilt ?? 18), A = i => { const v = new Vec3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuat(tilt); return [v.x, v.y, v.z]; };
  const [Hs, kk, gain] = pl.atm || ATM[pl.type], shell = 1 + Math.max(0.03, Hs * 6), rq = QX(pl.ringTilt ?? -8), rn = new Vec3(0, 1, 0).applyQuat(rq);
  const ringTex = pl.ring && gfx.dataTexture ? gfx.dataTexture(2048, 1, ringProfile(seed, pl.ring, pl.ring2 || [0.5, 0.45, 0.4])) : null;
  // the surface is baked once into cube maps in the planet's frame (sizes per type: surface, clouds / hot spots)
  const [ss, as] = [[768, 512], [1024, 0], [512, 0], [512, 256]][pl.type], bu = { uType: pl.type, uSeed: seed, uBands: pl.bands || 10, uColA: pl.a, uColB: pl.b, uColC: pl.c, uHS: pl.type === 2 ? [2, 0.45, 0, 0] : [0.5, 0.25, 0, 0] };
  const planetTex = gfx.bakeCube ? { surf: gfx.bakeCube(gfx.P.planetBake, ss, { ...bu, uMode: 0 }), aux: as ? gfx.bakeCube(gfx.P.planetBake, as, { ...bu, uMode: 1 }) : null } : null;
  const pu = { uColA: pl.a, uColB: pl.b, uColC: pl.c, uAtmo: pl.atmo, uType: pl.type, uSeed: seed, uBands: pl.bands || 10, uShell: 0, uBright: pl.bright ?? 1,
    uPC: [ppos.x, ppos.y, ppos.z], uPR: pl.r, uAx: A(0), uAy: A(1), uAz: A(2), uAtm: [Hs, kk, gain, shell], uRingN: [rn.x, rn.y, rn.z], uRingP: [0.55 * 2.4, 2.4, 0, ringTex ? 1 : 0], uSkyAdd: env.sky === 'atmo' ? 1 : 0, uTexD: ss * 0.75, uHS: bu.uHS };
  const out = [{ mesh: SPH.m, prog: 'planet', pos: ppos, quat: tilt, scale: pl.r, uniforms: pu, ringTex, planetTex, visible: true },
    { mesh: SPH.m, prog: 'planet', pos: ppos, quat: tilt, scale: pl.r * shell, uniforms: { ...pu, uShell: 1 }, planetTex, blend: 'add', cull: true, cullFront: true, layer: -2, visible: true }];
  if (pl.ring) out.push({ mesh: RING, prog: 'ring', pos: ppos, quat: tilt.clone().multiply(rq), scale: pl.r * 2.4, uniforms: { uInner: 0.55, uPlanet: [ppos.x, ppos.y, ppos.z], uPR: pl.r, uSkyAdd: env.sky === 'atmo' ? 1 : 0 }, ringTex, blend: 'ring', layer: -1, visible: true });
  return out;
}
