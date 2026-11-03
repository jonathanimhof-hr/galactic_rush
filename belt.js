// Cinder Belt: a winding run through a dense, drifting asteroid field.
// V5: five geological families with their own geometry and shading (ancient cratered regolith, metallic, icy,
// fractured with freshly broken flat faces, layered formations), screen-size LOD for the gameplay rocks, a culled
// and LOD-bucketed instanced background field, and the seven landmark formations rebuilt as spire clusters, a
// natural arch, a sundered moonlet and ice spires in the same places as before.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QX, QY, QZ } from '../geo.js';
import { hexField, gates, pickups, routeGuides, movers, skirmish, planetItems, v3 } from './common.js';
import { buildRig, buildHauler, buildPatrol } from '../props.js';
import { Frustum, InstanceSet } from '../lod.js';
import { capitalShip } from '../capital.js';

const ROCKC = [[0.25, 0.22, 0.2], [0.3, 0.24, 0.2], [0.22, 0.22, 0.23], [0.34, 0.3, 0.27], [0.42, 0.45, 0.5], [0.27, 0.2, 0.17], [0.2, 0.19, 0.19], [0.36, 0.33, 0.3]];
export const FAM = { ancient: 10, metal: 11, ice: 12, frac: 13, layer: 14 }; // detail-shader ids in gfx.js
const ICE = [0.44, 0.48, 0.54], METAL = [0.38, 0.35, 0.32]; // dirty ice: a cinder belt's ice is dusted dark
// gameplay variants: every silhouette stays inside 0.93..1.05 of the collision radius at both levels of detail
export const MEGA = { fam: 'ancient', c: [0.27, 0.23, 0.21], craters: 9, cuts: 3, flat: true, fresh: 1.15, amp: 0.06 };
export const VARIANTS = [
  { fam: 'ancient', c: ROCKC[0], craters: 7, cuts: 1 },
  { fam: 'frac', c: ROCKC[1], craters: 2, cuts: 5, flat: true, fresh: 1.2 },
  { fam: 'ice', c: ICE, craters: 1, cuts: 2, flat: true, fresh: 1.12, tint: [0.95, 1, 1.06], amp: 0.05, rough: 0.4 },
  { fam: 'metal', c: METAL, craters: 2, cuts: 2, flat: true, fresh: 1.25, amp: 0.05, metal: 0.6, rough: 0.5 },
  { fam: 'ancient', c: ROCKC[2], craters: 8, cuts: 0 },
  { fam: 'frac', c: ROCKC[3], craters: 1, cuts: 6, flat: true, fresh: 1.18 },
  { fam: 'ancient', c: ROCKC[5], craters: 6, cuts: 2 },
  { fam: 'metal', c: [0.33, 0.31, 0.3], craters: 1, cuts: 3, flat: true, fresh: 1.25, amp: 0.05, metal: 0.6, rough: 0.5 }];
// V6 family recipes for the polytope rock builder (Geo.polyRock): how many fracture planes, how deep they cut, how
// sharp the edges stay (crease angle), how much faces bulge, the share of fresh fracture faces, craters, terraces.
// Gameplay rocks keep the [lo, hi] band of their collision sphere; landmarks and the background field use wider bands.
export const RECIPE = {
  ancient: { planes: 18, dPow: 0.7, crease: 42, bulge: 0.05, wobble: 0.02, fresh: 0.12, craterSize: 0.34 },
  frac: { planes: 26, dPow: 1.3, crease: 16, bulge: 0.026, wobble: 0.012, fresh: 0.55, craterSize: 0.22 },
  ice: { planes: 22, dPow: 1.1, crease: 14, bulge: 0.02, wobble: 0.01, fresh: 0.45, craterSize: 0.22 },
  metal: { planes: 15, dPow: 0.8, crease: 44, bulge: 0.045, wobble: 0.016, fresh: 0.25, craterSize: 0.28 },
  layer: { planes: 20, dPow: 1, crease: 24, bulge: 0.03, wobble: 0.014, fresh: 0.2, craterSize: 0.26, strata: true } };
// level of detail: edge segment length and face rings (detail 3 near, 2 mid, 1 far, 0 silhouette); every level has the
// same planes and corners, so the outline holds through every switch
export const ROCK_LOD = { 4: [0.1, 4], 3: [0.16, 3], 2: [0.34, 2], 1: [0.75, 1], 0: [9, 1] };
export const rockGeo = (v, detail, seed, lo = 0.93, hi = 1.05, stretch = [1, 1, 1], extra = {}) => {
  const R = RECIPE[v.fam] || RECIPE.ancient, [seg, rings] = ROCK_LOD[detail] ?? ROCK_LOD[2], wide = hi - lo > 0.3;
  const strata = R.strata ? { axis: [0.24, 0.94, 0.24], k: wide ? 2.6 : 3.4, depth: Math.min(0.08, (hi - lo) * 0.45) } : null;
  return new Geo().mat(v.metal || 0, v.rough ?? 0.88, 1, FAM[v.fam]).polyRock(1, seed, [...v.c, 0], { ...R, planes: wide ? Math.round(R.planes * 0.6) : R.planes, ...(v.shape || {}),
    lo, hi, stretch, seg, rings, craters: v.craters, freshMul: v.fresh ?? 1.15, freshTint: v.tint, strata, extra: extra.planes, ...(extra.cutMin !== undefined ? { dMin: extra.cutMin } : {}) });
};

export function buildBelt(gfx, t) {
  const rng = makeRng(t.def.seed * 31 + 7), rng2 = makeRng(t.def.seed * 57 + 3), items = [], N = t.N;
  // gameplay rocks, two levels of detail each (both cut by the same fracture planes, so the switch keeps the outline)
  const rockMesh = VARIANTS.map((v, s) => [3, 2].map(d => gfx.mesh(rockGeo(v, d, s * 17.3 + 2).build())));
  const megaMesh = [4, 3].map(d => gfx.mesh(rockGeo(MEGA, d, 91, 0.94, 1.05).build()));
  // landmark formations: layered rock spires, ice spires, moonlet fragments and a natural arch
  const formMesh = [0, 1, 2].map(s => gfx.mesh(rockGeo({ fam: 'layer', c: ROCKC[s * 2], craters: 4, cuts: 5, flat: true, fresh: 1.15, amp: 0.18, rough: 0.9 }, 3, 300 + s * 11, 0.62, 1.3, [0.55, 1.9, 0.6], { cutMin: 0.5 }).build()));
  const iceMesh = [0, 1, 2].map(s => gfx.mesh(rockGeo({ fam: 'ice', c: ICE, craters: 1, cuts: 5, flat: true, fresh: 1.12, tint: [0.92, 1, 1.1], amp: 0.14, rough: 0.4 }, 3, 320 + s * 7, 0.7, 1.25, [0.5, 1.9, 0.55], { cutMin: 0.55 }).build()));
  const fragMesh = [0, 1, 2, 3].map(f => { const rr = makeRng(500 + f * 31), u = new Vec3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
    const planes = [0, 1, 2].map(() => { const n = new Vec3(rr() - 0.5, rr() - 0.5, rr() - 0.5).scale(1.6).sub(u).normalize(); return [n.x, n.y, n.z, 0.06 + rr() * 0.22]; });
    return gfx.mesh(rockGeo({ fam: 'frac', c: [0.3, 0.26, 0.23], craters: 2, fresh: 1.22, tint: [1.04, 1, 0.96], shape: { planes: 30, dMin: 0.95, dMax: 1, crease: 35, fresh: 0 } }, 3, 700 + f * 13, 0.8, 1.15, [1, 1, 1], { planes }).build()); });
  const archMesh = gfx.mesh((() => { const g = new Geo(), C = [0.3, 0.25, 0.21, 0];
    for (let j = 0; j <= 12; j++) { const u = j / 12, x = -1 + 2 * u, y = 2 * u * (1 - u) * 1.9, tx = 2, ty = 1.9 * (2 - 4 * u), r = 0.34 - 0.13 * Math.sin(u * Math.PI);
      g.mat(0, 0.9, 1, FAM.layer).at(x, y, 0, QZ(Math.atan2(ty, tx) * 180 / Math.PI)).polyRock(r, 40 + j * 3.1, C, { ...RECIPE.layer, planes: 12, lo: 0.8, hi: 1.2, dMin: 0.7, stretch: [1.7, 1, 1.1], seg: 0.3, rings: 2, craters: 1, strata: { axis: [0, 1, 0], k: 2.4, depth: 0.06 } }); }
    for (const s of [-1, 1]) g.at(s * 1.05, -0.15, 0).polyRock(0.5, 60 + s, C, { ...RECIPE.layer, planes: 14, lo: 0.7, hi: 1.25, dMin: 0.6, stretch: [1.2, 0.8, 1.1], seg: 0.2, rings: 3, craters: 2, strata: { axis: [0, 1, 0], k: 2.4, depth: 0.07 } });
    return g.build(); })());
  const halos = [], put = (mesh, p, q, s, br = 1.4) => items.push({ mesh, pos: p, quat: q, scale: s, visible: true, br, prog: 'pbrRock' });
  const THEME = ['spires', 'arch', 'moonlet', 'ice', 'spires', 'arch', 'moonlet'], marks = [];
  for (let k = 0, placed = 0; k < 80 && placed < 7; k++) { const i = Math.floor(rng() * N), side = rng() < 0.5 ? -1 : 1, s = 70 + rng() * 90, p = t.pointAt(i, side * (t.w[i] + s * 2.6 + 80 + rng() * 300), (rng() - 0.5) * 200);
    let ok = true; for (let j = 0; j < N; j += 4) if (t.pos[j].dist(p) < t.w[j] + s * 2.8 + 60) { ok = false; break; }
    if (!ok) continue; const theme = THEME[placed++]; marks.push({ p, s, theme });
    for (let c = 0; c < 3; c++) { // the same random draws as V4, so every landmark keeps its place, pieces and proportions
      const pp = p.clone().add(v3((rng() - 0.5) * s, (c - 1) * s * 1.1, (rng() - 0.5) * s)), q = QY(rng() * 360).multiply(QX((rng() - 0.5) * 30)), sc = s * (0.55 + rng() * 0.45);
      if (theme === 'moonlet') put(fragMesh[(k + c) % 4], pp, q, sc * 1.25);
      else if (theme === 'ice') put(iceMesh[(k + c) % 3], pp, q, sc);
      else if (theme === 'arch' && c === 1) put(archMesh, pp, QY(rng2() * 360).multiply(QX((rng2() - 0.5) * 20)), s * 1.15, 2.4);
      else put(formMesh[(k + c) % 3], pp, q, sc, 2.6);
    }
    if (theme === 'moonlet') for (let f = 0; f < 11; f++) { const d = new Vec3(rng2() - 0.5, (rng2() - 0.5) * 0.7, rng2() - 0.5).normalize(), pp = p.clone().addScaled(d, s * (1.2 + rng2() * 1.1));
      put(fragMesh[f % 4], pp, new Quat().setAxisAngle(rng2() - 0.5, rng2() - 0.5, rng2() - 0.5, rng2() * 6.28), s * (0.18 + rng2() * 0.3));
      if (f % 2 === 0) halos.push({ p: pp.clone(), s: s * 0.9, ice: false }); }
    if (theme === 'spires') for (let b = 0; b < 8; b++) put(rockMesh[(b * 3) % 8][1], p.clone().add(v3((rng2() - 0.5) * s * 2, -s * (1.2 + rng2() * 0.7), (rng2() - 0.5) * s * 2)), QY(rng2() * 360), s * (0.06 + rng2() * 0.1), 1.06);
    if (theme === 'ice') for (let b = 0; b < 6; b++) halos.push({ p: p.clone().add(v3((rng2() - 0.5) * s * 2, (rng2() - 0.5) * s * 3, (rng2() - 0.5) * s * 2)), s: s * 0.7, ice: true });
  }
  const obs = [];
  for (const o of t.obstacles) if (o.type === 'sphere') {
    const L = o.kind === 'mega' ? megaMesh : rockMesh[o.seed % rockMesh.length];
    const it = { mesh: L[0], pos: o.p, quat: new Quat().setAxisAngle(0, 1, 0, o.seed % 6), scale: o.r, cast: true, br: 1.06, visible: true, prog: 'pbrRock' };
    items.push(it); obs.push({ o, it, L, lv: 0, axis: new Vec3(Math.sin(o.seed), 1, Math.cos(o.seed)).normalize() });
  }
  // background field: elongated rocks in four families, three levels of detail, culled and bucketed per frame
  const VAR = 6, BGV = [{ fam: 'ancient', c: ROCKC[0] }, { fam: 'frac', c: ROCKC[1], flat: true, fresh: 1.15 }, { fam: 'metal', c: METAL, metal: 0.6, rough: 0.5 }, { fam: 'ice', c: ICE, rough: 0.4, flat: true, fresh: 1.1 }, { fam: 'ancient', c: ROCKC[4] }, { fam: 'frac', c: ROCKC[5], flat: true, fresh: 1.15 }];
  const bgMesh = BGV.map((v, s) => [3, 2, 1].map(d => gfx.mesh(rockGeo({ ...v, craters: 3, cuts: 3, amp: 0.16 }, d, s * 9.1 + 40, 0.7, 1.3, [1, 0.7 + (s % 3) * 0.12, 1 + (s % 2) * 0.35], { cutMin: 0.62 }).build(), 1400)));
  const bg = [], m = mat4.create(), q = new Quat(), ax = new Vec3(), sample = []; for (let i = 0; i < N; i += 4) sample.push(i);
  const clearOf = (p, r) => { for (const i of sample) if (t.pos[i].distSq(p) < (t.w[i] + 18 + r) ** 2) return false; return true; };
  for (let k = 0; k < 5200 && bg.length < 2600; k++) {
    const i = Math.floor(rng() * N), a = rng() * Math.PI * 2, d = t.w[i] + 30 + Math.pow(rng(), 1.5) * 1300, s = 2.5 + Math.pow(rng(), 3.2) * 95;
    const p = t.pointAt(i, Math.cos(a) * d, Math.sin(a) * d * 0.75).addScaled(t.tan[i], (rng() - 0.5) * 40);
    if (!clearOf(p, s * 1.35)) continue;
    ax.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); q.setAxisAngle(ax.x, ax.y, ax.z, rng() * 6.28); mat4.compose(m, p, q, s, s, s);
    const tint = 0.75 + rng() * 0.45; bg.push({ p, s, v: k % VAR, mat: Float32Array.from(m), tint });
  }
  const sets = bgMesh.map((L, v) => new InstanceSet(gfx, [{ mesh: L[0], px: 150 }, { mesh: L[1], px: 24 }, { mesh: L[2], px: 0 }], bg.filter(b => b.v === v).length, { prog: 'pbrRock' }));
  for (const b of bg) sets[b.v].add(b.mat, b.p.x, b.p.y, b.p.z, b.s * 1.8, b.tint, b.tint * 0.97, b.tint * 0.94, 1);
  for (const S of sets) items.push(...S.items);
  // mining rigs on big rocks, with haulers shuttling between them
  const rigMesh = gfx.mesh(buildRig()), rigs = [];
  for (const b of bg) { if (rigs.length >= 8) break; if (b.s < 45 || b.s > 95) continue; const p = b.p.clone(); p.y += b.s * 0.92; rigs.push(p);
    items.push({ mesh: rigMesh, pos: p, quat: new Quat(), scale: 1.4, visible: true, br: 100 }); }
  const hauler = gfx.mesh(buildHauler()), patrol = gfx.mesh(buildPatrol()), list = [];
  for (let k = 0; k + 1 < rigs.length; k += 2) { const A = rigs[k].clone().add(v3(0, 140, 0)), B = rigs[k + 1].clone().add(v3(0, 140, 0)), per = 70 + k * 9;
    list.push({ mesh: hauler, scale: 0.8, br: 120, path: (time, p, qq) => { const u = 0.5 - 0.5 * Math.cos((time / per + k * 0.13) * Math.PI * 2); p.lerpVectors(A, B, u); const d = new Vec3().subVectors(B, A).normalize(); qq.fromBasis(new Vec3(d.z, 0, -d.x).normalize(), v3(0, 1, 0), d); },
      lights: [{ x: 15, y: 10, z: 70, s: 5, c: [4, 0.4, 0.3], blink: 1, ph: 0 }, { x: -15, y: 10, z: 70, s: 5, c: [0.4, 4, 0.6], blink: 1, ph: 0.5 }] }); }
  let cx = 0, cz = 0; for (const p of t.pos) { cx += p.x; cz += p.z; } cx /= N; cz /= N;
  for (let k = 0; k < 3; k++) list.push({ mesh: patrol, br: 20, path: (time, p, qq) => { const a = time * (0.07 + k * 0.02) + k * 2; p.set(cx + Math.cos(a) * (900 + k * 200), 260 + k * 60, cz + Math.sin(a) * (900 + k * 200)); qq.setAxisAngle(0, 1, 0, -a); },
    lights: [{ x: 7.2, y: 0, z: -6, s: 2, c: [4, 0.4, 0.3], blink: 1.5, ph: k }] });
  list.push({ mesh: null, br: 1400, path: (time, p, qq) => { p.set(cx + 3400 - time * 2.5, 900, cz - 2600); qq.setAxisAngle(0, 1, 0, -2.2); } });
  const mv = movers(list); items.push(...mv.items);
  const cBase = list[list.length - 1].it; cBase.visible = false; const cap = capitalShip(gfx, 'atlas', cBase); items.push(...cap.items); // V6: an Atlas tender, fitting a mining belt
  // dust clouds and ice glitter around the big rocks and the formations
  halos.push(...bg.filter(b => b.s > 30).slice(0, 260).map(b => ({ p: b.p.clone().add(v3((rng() - 0.5) * b.s, (rng() - 0.5) * b.s * 0.5, (rng() - 0.5) * b.s)), s: b.s * (1.4 + rng()), ice: rng() < 0.4 })).filter(h => clearOf(h.p, h.s * 0.6)));
  // family lineup for the asteroid sheet (?gallery): one of each kind, far outside the field
  let gallery = null;
  if (typeof location !== 'undefined' && /[?&]gallery/.test(location.search)) { const gz = cz - 9000, R = 60, row = [rockMesh[0][0], rockMesh[1][0], rockMesh[2][0], rockMesh[3][0], megaMesh[0], formMesh[0], iceMesh[0], fragMesh[0], archMesh];
    gallery = { z: gz, x0: cx - 1000, step: 260, y: 0, n: row.length, r: R };
    row.forEach((mesh, j) => put(mesh, v3(cx - 1000 + j * 260, 0, gz), QY(25 + j * 40), j >= 5 ? R * 0.8 : R, 2.6)); }
  const hex = hexField(gfx, t, () => true, [0.35, 0.85, 1]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), bc = routeGuides(gfx, t, { colL: [0.2, 1, 0.55], colR: [1, 0.45, 0.2] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...bc.items);
  const env = { sunDir: v3(0.5, 0.33, 0.8).normalize(), sunCol: [3.4, 3.3, 3.2], fogCol: [0.025, 0.045, 0.06], fog: 0.0007, envInt: 1.0, expo: 1.0, shafts: 0.65, reverb: 'open',
    nebA: [0.05, 0.4, 0.5], nebB: [0.15, 0.2, 0.6], nebC: [0.8, 1, 1], base: [0.008, 0.012, 0.02], neb: 1.0, seed: 7.7, sat: 1.05, lift: [0.004, 0.008, 0.012], gain: [0.98, 1.0, 1.04],
    planet: { dir: v3(-0.7, 0.3, 0.6), dist: 15000, r: 3800, type: 0, a: [0.36, 0.3, 0.26], b: [0.2, 0.18, 0.17], c: [0.7, 0.62, 0.5], atmo: [0.4, 0.7, 1] } };
  items.push(...planetItems(gfx, env, t.def.seed));
  const sk = skirmish(v3(cx - 2600, 700, cz + 2400), 700, 5), tq = new Quat(), fr = new Frustum();
  return { items, env, marks, gallery, hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); mv.update(dt, time, fx); sk.update(dt, time, fx, cam); bc.update(fx, cam, race, time);
      cap.update(gfx, cam, time, fx);
      for (const d of obs) d.it.quat.multiply(tq.setAxisAngle(d.axis.x, d.axis.y, d.axis.z, d.o.spin * dt));
      const c = cam.pos, R = 2500 * (gfx.cfg.hazeDist ?? 1), hcap = gfx.cfg.hazeCap ?? 120, F = cam.fwd; let nh = 0;
      for (const h of halos) { const d = h.p.dist(c); if (d > R) continue; if ((h.p.x - c.x) * F.x + (h.p.y - c.y) * F.y + (h.p.z - c.z) * F.z < -h.s * 1.3) continue; // behind the camera
        if (h.ice) { const tw = 0.5 + 0.5 * Math.sin(time * 3 + h.p.x); fx.bbAdd.add(h.p.x, h.p.y, h.p.z, h.s * 0.5, 0.25 * tw, 0.32 * tw, 0.4 * tw, 0.35); }
        else if (nh++ < hcap) fx.bbHaze.add(h.p.x, h.p.y, h.p.z, h.s * 1.15, 0.1, 0.085, 0.072, 0.2 * Math.min(1, (R - d) / (R * 0.25)), h.p.x * 0.0131, (h.p.x * 0.0071) % 9, (h.p.z * 0.0053) % 9, (h.p.y * 0.017) % 1); } // dust: half-resolution haze clouds, each its own shape
    },
    // visibility with the frame's final camera: background-field culling and LOD buckets, gameplay-rock LOD
    cull(cam) { fr.set(cam, gfx); for (const S of sets) S.update(fr);
      for (const d of obs) { const px = fr.px(d.o.p.x, d.o.p.y, d.o.p.z, d.o.r), want = px > 110 ? 0 : 1; if (want !== d.lv && (want ? px < 110 * 0.89 : px > 110 * 1.12)) d.lv = want; d.it.mesh = d.L[d.lv]; } } };
}
