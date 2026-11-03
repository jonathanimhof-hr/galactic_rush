// Foundry Trench: a slot canyon through a colossal orbital foundry.
import { Vec3, Quat, makeRng } from '../../math.js';
import { Geo, QX, QY, DET } from '../geo.js';
import { holoSign, BRANDS } from '../textures.js';
import { Chunks, ribbon, fq, P, hexField, gates, pickups, hazards, routeGuides, movers, planetItems, v3 } from './common.js';
import { buildHauler, buildPatrol, buildCarrier, carrierGlow } from '../props.js';
import { lodPair } from '../lod.js';
import { capitalShip } from '../capital.js';

const STEEL = [[0.3, 0.3, 0.32, 0], [0.24, 0.245, 0.26, 0], [0.36, 0.34, 0.31, 0], [0.33, 0.25, 0.2, 0], [0.2, 0.21, 0.23, 0]];
export function buildTrench(gfx, t) {
  const rng = makeRng(t.def.seed * 13 + 5), N = t.N, ch = new Chunks(t, 48), items = [];
  const out = (i, s) => { const k = t.kLatS[i] * s; return k > 0 ? Math.max(4, Math.min(160, (1 / k - t.w[i]) * 0.8)) : 160; };
  const DEPTH = 3.2;
  // walls: recessed backplane, machinery blocks whose fronts sit exactly on (or behind) the collision plane, ribs, pipes, lamps
  for (let i = 0; i < N; i += 3) {
    const q = fq(t, i), w = t.w[i], h = t.h[i], g = ch.get(i, 'wall'), gl = ch.get(i, 'lit'), segL = t.D * 3;
    for (const s of [-1, 1]) {
      let y = -h; while (y < h - 0.5) {
        const bh = Math.min(h - y, 5 + rng() * 16), d = 0.35 + rng() * (DEPTH - 0.35), c = STEEL[Math.floor(rng() * STEEL.length)];
        const p = P(t, i + 1, s * (w + DEPTH - d / 2), y + bh / 2);
        g.mat(0.55 + rng() * 0.3, 0.45 + rng() * 0.3, 1, DET.struct).at(p.x, p.y, p.z, q).box(d, bh - 0.4, segL - 0.3, c);
        if (rng() < 0.18 && d < DEPTH - 0.8) { const lp = P(t, i + 1, s * (w + DEPTH - d - 0.15), y + bh * 0.5); gl.mat(0, 0.4, 3.5, 0).at(lp.x, lp.y, lp.z, q).box(0.15, Math.min(1.2, bh * 0.2), segL * 0.6, rng() < 0.7 ? [1, 0.55, 0.2, 1] : [0.4, 0.8, 1, 1]); }
        y += bh;
      }
      if (i % 4 === 0) { const p = P(t, i, s * (w + DEPTH / 2), 0); g.mat(0.7, 0.4, 1, DET.struct).at(p.x, p.y, p.z, q).box(DEPTH, 2 * h, 1.8, [0.27, 0.27, 0.29, 0]); }
    }
  }
  for (const s of [-1, 1]) {
    for (let c = 0; c < N; c += 48) {
      const g = ch.get(c, 'wall'), i1 = Math.min(N, c + 48);
      ribbon(g.mat(0.5, 0.7, 1, DET.struct), t, i => [s * (t.w[i] + DEPTH), -t.h[i]], i => [s * (t.w[i] + DEPTH), t.h[i]], [0.12, 0.12, 0.13, 0], c, i1, 3);
      for (const fy of [0.55, -0.15]) { const pts = []; for (let i = c; i <= i1; i += 3) pts.push(P(t, i, s * (t.w[t.wrapIdx(i)] + 1.6), fy * t.h[t.wrapIdx(i)]));
        if (pts.length > 1) ch.get(c, 'wall').mat(0.9, 0.35, 0, 0).tube(pts, 0.55, 8, [0.42, 0.36, 0.28, 0]); }
      const gl = ch.get(c, 'lit');
      ribbon(gl.mat(0, 0.4, 4, 0), t, i => [s * (t.w[i] - 0.05), -t.h[i] + 0.05], i => [s * (t.w[i] - 0.05), -t.h[i] + 0.7], [1, 0.45, 0.1, 1], c, i1, 3);
      ribbon(gl.mat(0, 0.4, 2.2, 0), t, i => [s * (t.w[i] + 0.05), t.h[i] - 0.6], i => [s * (t.w[i] + 0.05), t.h[i] - 0.15], [0.35, 0.8, 1, 1], c, i1, 3);
    }
  }
  // floor: grated plates over molten slag, centre-line lamps
  for (let i = 0; i < N; i += 3) {
    const q = fq(t, i), w = t.w[i], h = t.h[i], g = ch.get(i, 'wall'), gl = ch.get(i, 'lit');
    const p = P(t, i + 1, 0, -h - 0.5); g.mat(0.6, 0.45, 1, DET.struct).at(p.x, p.y, p.z, q).box(2 * w + 2 * DEPTH, 1, t.D * 3 - (i % 9 === 0 ? 2.2 : 0.15), [0.31, 0.3, 0.3, 0]);
    if (i % 6 === 0) { const lp = P(t, i, 0, -h + 0.04); gl.mat(0, 0.4, 3, 0).at(lp.x, lp.y, lp.z, q).box(0.5, 0.06, 1.6, [1, 0.8, 0.5, 1]); }
  }
  const lava = new Geo().mat(0, 1, 1, 0); ribbon(lava, t, i => [-t.w[i] - DEPTH, -t.h[i] - 4], i => [t.w[i] + DEPTH, -t.h[i] - 4], [1, 0.32, 0.06, 1], 0, N, 3);
  items.push({ mesh: gfx.mesh(lava.build()), prog: 'unlit', mode: 3, intensity: 3.2, color: [1, 1, 1, 1], visible: true });
  // rim deck with lip, hazard stripes and surface greebles
  for (const s of [-1, 1]) for (let c = 0; c < N; c += 48) {
    const g = ch.get(c, 'rim'), i1 = Math.min(N, c + 48);
    ribbon(g.mat(0.6, 0.55, 1, DET.struct), t, i => [s > 0 ? t.w[i] : -t.w[i] - out(i, -1), t.h[i]], i => [s > 0 ? t.w[i] + out(i, 1) : -t.w[i], t.h[i]], [0.27, 0.27, 0.29, 0], c, i1, 3);
    for (let i = c; i < i1; i += 3) { const q = fq(t, i), p = P(t, i + 1, s * (t.w[t.wrapIdx(i)] + 1.6), t.h[t.wrapIdx(i)] + 0.5);
      g.mat(0.4, 0.5, 0, 0).at(p.x, p.y, p.z, q).box(3.2, 1, t.D * 3, (Math.floor(i / 3) % 2) ? [0.9, 0.62, 0.08, 0] : [0.08, 0.08, 0.09, 0]); }
  }
  for (let k = 0; k < 1400; k++) {
    const i = Math.floor(rng() * N), s = rng() < 0.5 ? -1 : 1, lim = out(i, s); if (lim < 16) continue;
    const x = s * (t.w[i] + 6 + rng() * (lim - 8)), tall = rng() < 0.1, hh = tall ? 12 + rng() * 40 : 1.5 + rng() * 6, q = fq(t, i), p = P(t, i, x, t.h[i] + hh / 2);
    const g = ch.get(i, 'rim'), kind = rng();
    if (tall || kind < 0.45) g.mat(0.5, 0.55, 1, DET.struct).at(p.x, p.y, p.z, q).bbox(3 + rng() * 12, hh, 3 + rng() * 14, 0.6, STEEL[k % 5]);
    else if (kind < 0.7) { const r = 1.5 + rng() * 4; g.mat(0.7, 0.4, 1, DET.struct).at(p.x, t.pointAt(i, x, t.h[i]).y + r, p.z, q.clone().multiply(QY(90))).cyl(r, r, 6 + rng() * 14, 16, [0.42, 0.4, 0.36, 0]); }
    else if (kind < 0.85) { const r = 2 + rng() * 3, hgt = 6 + rng() * 10, b = t.pointAt(i, x, t.h[i] + hgt / 2); g.mat(0.6, 0.5, 1, DET.struct).at(b.x, b.y, b.z, QX(-90)).cyl(r, r * 0.8, hgt, 14, [0.3, 0.29, 0.28, 0]); }
    else { for (let v = 0; v < 4; v++) { const b = t.pointAt(i + v, x, t.h[i] + 0.8); g.mat(0.8, 0.4, 0, 0).at(b.x, b.y, b.z, q).bbox(2.4, 1.6, 2.4, 0.3, [0.18, 0.18, 0.19, 0]); } }
    if (tall) { const lp = P(t, i, x, t.h[i] + hh + 0.8); ch.get(i, 'lit').mat(0, 0.4, 6, 0).at(lp.x, lp.y, lp.z).box(1, 1, 1, [1, 0.15, 0.1, 1]); }
  }
  // catwalk bridges above the rim (outside the corridor)
  for (let i = 40; i < N; i += 90) {
    const q = fq(t, i), w = t.w[i], h = t.h[i], g = ch.get(i, 'rim'), gl = ch.get(i, 'lit');
    const p = P(t, i, 0, h + 3.2); g.mat(0.8, 0.45, 1, DET.struct).at(p.x, p.y, p.z, q).box(2 * w + 10, 0.6, 3.2, [0.3, 0.3, 0.32, 0]);
    for (const s of [-1, 1]) { const r = P(t, i, 0, h + 4.2).addScaled(t.tan[i], s * 1.5); g.at(r.x, r.y, r.z, q).box(2 * w + 10, 0.12, 0.12, [0.6, 0.5, 0.15, 0]); }
    for (let x = -w; x <= w; x += 6) { const lp = P(t, i, x, h + 2.75); gl.mat(0, 0.4, 3, 0).at(lp.x, lp.y, lp.z, q).box(0.5, 0.1, 0.5, [1, 0.8, 0.5, 1]); }
  }
  items.push(...ch.items(gfx, 'wall', { cast: true, maxDist: 2600, prog: 'pbrStruct' }), ...ch.items(gfx, 'rim', { cast: true, maxDist: 4200, prog: 'pbrStruct' }), ...ch.items(gfx, 'lit', { maxDist: 3000, prog: 'pbrStruct' }));
  // kilometre-scale foundry: smelter stacks, cooling towers, halls with glowing slits; placed clear of every trench section
  const big = new Geo(), bigLit = new Geo().mat(0, 0.4, 3.2, 0), stacks = [];
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of t.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const clear = (x, z, r) => { for (let i = 0; i < N; i += 4) { const p = t.pos[i]; if (Math.hypot(p.x - x, p.z - z) < t.w[i] + 170 + r) return false; } return true; };
  let placed = 0;
  for (let k = 0; k < 700 && placed < 70; k++) {
    const x = minX - 900 + rng() * (maxX - minX + 1800), z = minZ - 900 + rng() * (maxZ - minZ + 1800), kind = rng();
    if (kind < 0.35) { const r = 25 + rng() * 40, hgt = 180 + rng() * 380; if (!clear(x, z, r)) continue;
      big.mat(0.6, 0.55, 1, DET.struct).at(x, 18 + hgt / 2, z, QX(-90)).cyl(r, r * 0.82, hgt, 24, [0.24, 0.23, 0.22, 0]);
      for (let b = 1; b < 5; b++) big.at(x, 18 + hgt * b / 5, z, QX(90)).torus(r * (1 - 0.18 * b / 5) + 1, 2.2, 24, 5, [0.16, 0.16, 0.17, 0]);
      bigLit.at(x, 18 + hgt * 0.35, z, QX(90)).torus(r * 0.95, 1.2, 24, 4, [1, 0.42, 0.1, 1]); stacks.push(v3(x, 18 + hgt + 4, z)); }
    else if (kind < 0.55) { const r = 60 + rng() * 50, hgt = 140 + rng() * 120; if (!clear(x, z, r)) continue;
      big.mat(0.3, 0.75, 1, DET.struct).at(x, 18 + hgt / 2, z, QX(-90)).lathe([[r, -hgt / 2], [r * 0.72, -hgt * 0.1], [r * 0.62, hgt * 0.2], [r * 0.7, hgt / 2]], 32, [0.38, 0.37, 0.35, 0]); stacks.push(v3(x, 18 + hgt, z)); }
    else { const sx = 80 + rng() * 220, sz = 80 + rng() * 260, hgt = 40 + rng() * 140; if (!clear(x, z, Math.max(sx, sz) * 0.7)) continue;
      const q = QY(rng() * 90); big.mat(0.5, 0.6, 1, DET.struct).at(x, 18 + hgt / 2, z, q).box(sx, hgt, sz, STEEL[k % 5]);
      for (let sl = 0; sl < 3; sl++) bigLit.at(x, 18 + hgt * (0.3 + sl * 0.22), z, q).box(sx + 0.6, 2.2, sz * 0.7, [1, 0.5, 0.15, 1]); }
    placed++;
  }
  items.push({ mesh: gfx.mesh(big.build()), visible: true, prog: 'pbrStruct' }, { mesh: gfx.mesh(bigLit.build()), visible: true, prog: 'pbrStruct' });
  // holo boards on the rim facing the trench
  const quad = gfx.mesh(new Geo().box(1, 1, 0.001, [1, 1, 1, 1]).build());
  for (let i = 60; i < N; i += 150) { const s = (i / 150) % 2 ? 1 : -1, q = fq(t, i).multiply(QY(180 + s * 70)), p = P(t, i, s * (t.w[i] + 14), t.h[i] + 9);
    items.push({ mesh: quad, prog: 'unlit', mode: 1, blend: 'add', tex: gfx.texture(holoSign(i * 7 + 3, [1, 0.6, 0.25], { brand: BRANDS[(i / 150) % BRANDS.length | 0] })), pos: p, quat: q, sx: 18, sy: 9, sz: 1, intensity: 1.3, color: [1, 1, 1, 1], visible: true, layer: 6, br: 12 }); }
  // background haulers and patrols crossing above the foundry
  const hauler = gfx.mesh(buildHauler()), patrol = gfx.mesh(buildPatrol()), carrier = null;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, line = (ax, ay, az, bx, by, bz, period, ph) => (time, p, q) => { const u = ((time / period + ph) % 1); p.set(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u); q.fromBasis(new Vec3(bz - az, 0, -(bx - ax)).normalize(), new Vec3(0, 1, 0), new Vec3(bx - ax, by - ay, bz - az).normalize()); };
  const mv = movers([
    { mesh: hauler, path: line(cx - 2600, 420, cz - 1800, cx + 2600, 520, cz + 1600, 160, 0), lights: [{ x: 15, y: 10, z: 70, s: 6, c: [4, 0.4, 0.3], blink: 1, ph: 0 }, { x: -15, y: 10, z: 70, s: 6, c: [0.4, 4, 0.6], blink: 1, ph: 0.5 }], br: 120 },
    { mesh: hauler, path: line(cx + 2400, 300, cz - 2200, cx - 2600, 380, cz + 600, 200, 0.4), br: 120 },
    { mesh: patrol, path: (time, p, q) => { const a = time * 0.12; p.set(cx + Math.cos(a) * 900, 160, cz + Math.sin(a) * 900); q.setAxisAngle(0, 1, 0, -a); }, lights: [{ x: 7.2, y: 0, z: -6, s: 2, c: [4, 0.4, 0.3], blink: 1.5, ph: 0 }], br: 20 },
    { mesh: carrier, path: (time, p, q) => { p.set(cx - 1800 + time * 3, 1300, cz + 3800); q.setAxisAngle(0, 1, 0, 1.2); }, br: 1400 },
  ]);
  items.push(...mv.items);
  const cBase = mv.items[mv.items.length - 1]; cBase.visible = false; const cap = capitalShip(gfx, 'bastion', cBase); items.push(...cap.items); // V6 capital class with three levels and animated turrets
  const hex = hexField(gfx, t, (i, f) => f === 'T', [1, 0.6, 0.25]);
  const gt = gates(gfx, t, { style: 'trench' }), pk = pickups(gfx, t, { floorPads: true }), hz = hazards(gfx, t);
  // armoured spans bridging the trench above its open top: layered structure overhead, lit undersides, real scale
  const spans = new Chunks(t, 96);
  for (let i = 20; i < N; i += 100) { const q = fq(t, i), w = t.w[i] + DEPTH + 10, h = t.h[i], pc = P(t, i, 0, h + 10);
    spans.get(i, 's').mat(0.6, 0.5, 1, DET.struct).at(pc.x, pc.y, pc.z, q).bbox(2 * w, 13, 18, 1.5, [0.2, 0.19, 0.18, 0]);
    for (const sx of [-1, 1]) { const pl = P(t, i, sx * (w - 4), h + 22); spans.get(i, 's').at(pl.x, pl.y, pl.z, q).bbox(8, 14, 22, 1, [0.16, 0.15, 0.14, 0]); }
    for (const z of [-7, 7]) { const pu = P(t, i, 0, h + 3.4).addScaled(t.tan[i], z); spans.get(i, 'g').mat(0, 0.4, 4, 0).at(pu.x, pu.y, pu.z, q).box(2 * w - 6, 0.25, 0.6, [1, 0.55, 0.18, 1]); } }
  items.push(...spans.items(gfx, 's', { cast: true, prog: 'pbrStruct' }), ...spans.items(gfx, 'g', { prog: 'pbrStruct' }));
  // sodium floodlights on the rim angled down into the trench, with faint light cones in the dust
  const coneM = gfx.mesh(new Geo().lathe([[0.25, 0], [1, -1]], 24, [1, 0.72, 0.42, 1]).build()), lampG = new Geo();
  for (let i = 30, k = 0; i < N; i += 47, k++) { const s = k % 2 ? 1 : -1, w = t.w[i], h = t.h[i], p = P(t, i, s * (w + 3.5), h + 3.2), B = t.bin[i], Nn = t.nrm[i];
    const d = new Vec3().copy(Nn).scale(-0.82).addScaled(B, -s * 0.57).normalize(), zA = d.clone().scale(-1), xA = new Vec3().crossVectors(Nn, zA).normalize(), yA = new Vec3().crossVectors(zA, xA);
    lampG.mat(0.7, 0.4, 1, DET.struct).at(p.x, p.y, p.z, fq(t, i)).bbox(2.4, 1.2, 1.6, 0.2, [0.22, 0.22, 0.24, 0]).mat(0, 0.4, 6, 0).at(p.x + d.x * 0.7, p.y + d.y * 0.7, p.z + d.z * 0.7).box(1.4, 0.4, 1.4, [1, 0.75, 0.45, 1]);
    items.push({ mesh: coneM, prog: 'unlit', mode: 5, blend: 'add', pos: p.clone().addScaled(d, 0.8), quat: new Quat().fromBasis(xA, yA, zA), scale: 1, sx: 7, sy: 7, sz: 2 * h + 18, intensity: 0.07, opacity: 1, color: [1, 0.85, 0.7, 1], visible: true, layer: 6, br: 2 * h + 20, maxDist: 900 }); }
  items.push({ mesh: gfx.mesh(lampG.build()), visible: true, prog: 'pbrStruct' });
  // the trench walls are the boundary at the sides and floor; guide lights mark the open top edge
  const rg = routeGuides(gfx, t, { colL: [1, 0.5, 0.14], colR: [1, 0.5, 0.14], corners: () => [2, 3], open: (i, ax, sg) => ax === 'y' && sg > 0 });
  items.push(...hex.items, ...gt.items, ...pk.items, ...hz.items, ...rg.items);
  const env = { sunDir: v3(-0.38, 0.74, 0.56).normalize(), sunCol: [3.3, 2.5, 1.85], fogCol: [0.13, 0.075, 0.055], fog: 0.0011, envInt: 1.9, expo: 1.1, shafts: 0.5, reverb: 'trench',
    nebA: [0.55, 0.08, 0.06], nebB: [0.9, 0.35, 0.08], nebC: [1, 0.8, 0.5], base: [0.012, 0.008, 0.012], neb: 1.0, seed: 3.1, sat: 1.06, lift: [0.012, 0.006, 0.004], gain: [1.03, 0.99, 0.95],
    planet: { dir: v3(0.6, 0.25, -0.75), dist: 16000, r: 5200, type: 3, /* atmospheric: a volcanic world under sulphur haze */ a: [0.5, 0.22, 0.12], b: [0.32, 0.14, 0.1], c: [0.9, 0.6, 0.4], atmo: [1, 0.45, 0.25] } };
  items.push(...planetItems(gfx, env, t.def.seed));
  let smokeT = 0, sparkT = 0;
  return { items, env, hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); hz.update(dt, time, race, fx, cam); mv.update(dt, time, fx); rg.update(fx, cam, race, time);
      cap.update(gfx, cam, time, fx);
      if (race && race.player && (sparkT -= dt) < 0) { sparkT = 0.12 + Math.random() * 0.25; // welding sparks from the wall machinery just ahead
        const i = t.wrapIdx(race.player.ti + 10 + Math.floor(Math.random() * 40)), s = Math.random() < 0.5 ? -1 : 1, y = (Math.random() * 1.6 - 0.8) * t.h[i], p = P(t, i, s * (t.w[i] + 0.3), y), b = t.bin[i];
        fx.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, 2.2, 0.6, 5, 3.2, 1.6, 1, true, 0);
        for (let k = 0; k < 9; k++) { const sp = 6 + Math.random() * 14; fx.spawn(p.x, p.y, p.z, -b.x * s * sp + (Math.random() - 0.5) * 8, (Math.random() - 0.2) * 8, -b.z * s * sp + (Math.random() - 0.5) * 8, 0.5 + Math.random() * 0.7, 0.22, 0.12, 4, 2.1, 0.7, 1, true, 0.4, 0.04, 9.8); } }
      if ((smokeT -= dt) < 0) { smokeT = 0.08; for (const s of stacks) if (s.dist(cam.pos) < 2600 && Math.random() < 0.35) fx.spawn(s.x + (Math.random() - 0.5) * 20, s.y, s.z + (Math.random() - 0.5) * 20, 6, 10 + Math.random() * 6, 3, 9, 30, 110, 0.09, 0.075, 0.07, 0.55, false, 0.05); }
    },
    light(me) { if (!me) return null; const h = t.h[me.ti]; return { pos: P(t, me.ti, me.lx, -h - 2.5), col: [2.4, 0.9, 0.25], range: 26 }; } };
}
