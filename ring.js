// Halo of Vashti: flat-out sweepers through the ring plane of a gas giant, past wreckage and a fleet at anchor.
import { Vec3, Quat, makeRng, mat4 } from '../../math.js';
import { Geo, QY, DET } from '../geo.js';
import { hexField, gates, pickups, routeGuides, movers, skirmish, planetItems, v3 } from './common.js';
import { buildWreck, buildCarrier, buildPatrol, buildHauler, CARRIER_ENGINES } from '../props.js';
import { lodPair, Frustum, InstanceSet } from '../lod.js';
import { rockGeo } from './belt.js';
import { capitalShip } from '../capital.js';

export function buildRing(gfx, t) {
  const rng = makeRng(t.def.seed * 23 + 11), items = [], N = t.N;
  // gameplay wreckage: every vertex within 1.02 of the collision radius
  const wreckMesh = [11, 23, 37, 41, 59, 67].map(s => gfx.mesh(buildWreck(s))), obs = [];
  for (const o of t.obstacles) if (o.type === 'sphere') {
    const it = { mesh: wreckMesh[o.seed % wreckMesh.length], prog: 'pbrShip', pos: o.p, quat: new Quat().setAxisAngle(0, 1, 0, o.seed % 6), scale: o.r, cast: true, br: 1.04, visible: true };
    items.push(it); obs.push({ o, it, axis: new Vec3(Math.sin(o.seed * 1.3), Math.cos(o.seed), 0.4).normalize() });
  }
  // ring particle slab hugging the racing line (never inside the corridor): water-ice, dusty rock and fractured
  // chunks, three levels of detail each, culled and LOD-bucketed every frame; soft dust sheets give the ring depth
  const KIND = [{ fam: 'ice', c: [0.52, 0.56, 0.6], s: 3, st: [1, 0.6, 1.2], fresh: 1.1, rough: 0.45 }, { fam: 'ancient', c: [0.4, 0.36, 0.32], s: 8.7, st: [1, 0.7, 1.1], rough: 0.8 }, { fam: 'frac', c: [0.46, 0.42, 0.37], s: 14.4, st: [1.2, 0.6, 1], fresh: 1.15, rough: 0.8 }];
  const chunkSets = KIND.map(K => new InstanceSet(gfx, [2, 1, 0].map((d, l) => ({ mesh: gfx.mesh(rockGeo({ fam: K.fam, c: K.c, craters: 2, fresh: K.fresh, rough: K.rough }, d, K.s, 0.7, 1.3, K.st).build(), 3000), px: [60, 10, 0][l] })), 3000, { prog: 'pbrRock' }));
  const sample = []; for (let i = 0; i < N; i += 4) sample.push(i);
  const clearOf = (p, r) => { for (const i of sample) if (t.pos[i].distSq(p) < (t.w[i] + 12 + r) ** 2) return false; return true; };
  const m = mat4.create(), q = new Quat(), ax = new Vec3(), cnt = [0, 0, 0];
  for (let k = 0; k < 14000 && cnt[0] + cnt[1] + cnt[2] < 7200; k++) {
    const i = Math.floor(rng() * N), side = rng() < 0.5 ? -1 : 1, d = t.w[i] + 25 + Math.pow(rng(), 1.3) * 700, s = 0.6 + Math.pow(rng(), 4) * 9;
    const p = t.pointAt(i, side * d, (rng() - 0.5) * (30 + d * 0.06)).addScaled(t.tan[i], (rng() - 0.5) * 30);
    if (!clearOf(p, s)) continue;
    const v = k % 3; if (cnt[v] >= 3000) continue;
    ax.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); q.setAxisAngle(ax.x, ax.y, ax.z, rng() * 6.28); mat4.compose(m, p, q, s, s, s);
    const tn = 0.8 + rng() * 0.4; chunkSets[v].add(m, p.x, p.y, p.z, s * 1.6, tn, tn, tn, 1); cnt[v]++;
  }
  for (const S of chunkSets) items.push(...S.items);
  // V6 dust clouds: about a hundred large clouds well off the racing line instead of overlapping full-resolution sheets.
  // Each cut from its own region of the noise volume, lit gold toward the sun and teal in shadow, faded near the camera
  // and with distance, drawn by the half-resolution haze pass (own random stream: the chunk field above is unchanged)
  const crng = makeRng(t.def.seed * 41 + 5), clouds = [];
  for (let i = 0; i < N; i += Math.max(1, Math.round(N / 70))) for (const side of [-1, 1]) { if (crng() < 0.3) continue;
    const d = t.w[i] + 150 + crng() * 520; clouds.push({ p: t.pointAt(i, side * d, (crng() - 0.5) * 70), s: 230 + crng() * 340, rot: crng() * 6.283, sd: [crng() * 9, crng() * 9, crng()], w: crng() }); }
  // the fleet at anchor: carriers with lit hangar bays, shuttles in and out, burning hulks of the last battle
  let cx = 0, cz = 0; for (const p of t.pos) { cx += p.x; cz += p.z; } cx /= N; cz /= N;
  // V6: one ship of each capital class (Bastion carrier, Warden command cruiser, Atlas tender), three levels each
  const fleetIts = [], fleetShips = [], fleet = [[cx - 3200, 380, cz + 1800, 30], [cx + 2600, -420, cz + 3000, -60], [cx - 4300, 900, cz - 1600, 100]], KINDS = ['bastion', 'warden', 'atlas'];
  fleet.forEach(([x, y, z, yaw], i) => { const sh = capitalShip(gfx, KINDS[i], { pos: v3(x, y, z), quat: QY(yaw) }, { rim: [0.08, 0.06, 0.04] }); items.push(...sh.items); fleetIts.push(sh.full); fleetShips.push(sh); });
  const hulks = [];
  for (let k = 0; k < 7; k++) { const a = rng() * 6.28, d = 1500 + rng() * 1800, p = v3(cx + Math.cos(a) * d, (rng() - 0.5) * 500, cz + Math.sin(a) * d), s = 70 + rng() * 160;
    items.push({ mesh: wreckMesh[k % wreckMesh.length], prog: 'pbrShip', pos: p, quat: new Quat().setAxisAngle(0.3, 1, 0.2, rng() * 6), scale: s, visible: true, br: 1.1 }); hulks.push({ p, s }); }
  const patrol = gfx.mesh(buildPatrol()), hauler = gfx.mesh(buildHauler()), list = [];
  fleet.forEach(([x, y, z, yaw], k) => { const base = v3(x, y, z), side = new Vec3(Math.cos(yaw * Math.PI / 180), 0, -Math.sin(yaw * Math.PI / 180));
    for (let j = 0; j < 2; j++) list.push({ mesh: patrol, br: 20, path: (time, p, qq) => { const u = ((time / 40 + j * 0.5 + k * 0.17) % 1), out = Math.sin(u * Math.PI) * 900;
      p.copy(base).addScaled(side, (j ? 1 : -1) * (100 + out)); p.y += 30 + j * 20; qq.fromBasis(v3(0, 0, 1), v3(0, 1, 0), side.clone().scale(j ? 1 : -1)); },
      lights: [{ x: 7.2, y: 0, z: -6, s: 2.5, c: [4, 0.4, 0.3], blink: 1.5, ph: j }, { x: -7.2, y: 0, z: -6, s: 2.5, c: [0.4, 4, 0.6], blink: 1.5, ph: j + 0.3 }] }); });
  list.push({ mesh: hauler, br: 120, path: (time, p, qq) => { const a = time * 0.03; p.set(cx + Math.cos(a) * 2400, 240, cz + Math.sin(a) * 2400); qq.setAxisAngle(0, 1, 0, -a); } });
  const mv = movers(list); items.push(...mv.items);
  const carrierLights = []; for (const [x, y, z, yaw] of fleet.slice(0, 1)) { const qq = QY(yaw); for (let r = 0; r < 12; r++) for (const s of [-1, 1]) carrierLights.push(new Vec3(s * 157, 18, -660 + r * 90).applyQuat(qq).add(v3(x, y, z))); }
  const hex = hexField(gfx, t, () => true, [1, 0.75, 0.35]);
  const gt = gates(gfx, t), pk = pickups(gfx, t), bc = routeGuides(gfx, t, { colL: [1, 0.75, 0.25], colR: [0.3, 0.85, 1] });
  items.push(...hex.items, ...gt.items, ...pk.items, ...bc.items);
  const env = { sunDir: v3(0.65, 0.28, -0.7).normalize(), sunCol: [3.4, 2.9, 2.3], fogCol: [0.07, 0.05, 0.035], fog: 0.00045, envInt: 0.95, expo: 1.0, shafts: 0.55, reverb: 'open',
    nebA: [0.45, 0.25, 0.08], nebB: [0.08, 0.2, 0.3], nebC: [1, 0.85, 0.6], base: [0.006, 0.009, 0.013], neb: 0.85, seed: 21.9, sat: 1.06, lift: [0.004, 0.008, 0.012], gain: [1.05, 1.0, 0.92], // gold light, teal shadows: unlike Neon Spire's grey-blue dusk
    planet: { dir: v3(-0.55, 0.12, 0.83), dist: 17000, r: 9500, type: 1, bands: 16, tilt: 12, bright: 0.55, ringTilt: -6, a: [0.85, 0.6, 0.35], b: [0.55, 0.3, 0.18], c: [0.95, 0.85, 0.7], atmo: [1, 0.75, 0.45], ring: [0.85, 0.7, 0.5], ring2: [0.55, 0.48, 0.4] } };
  items.push(...planetItems(gfx, env, t.def.seed));
  const sk1 = skirmish(v3(cx - 3600, 600, cz + 900), 900, 9), sk2 = skirmish(v3(cx + 3200, -200, cz + 2200), 700, 13), tq = new Quat();
  let fireT = 0; const fr = new Frustum();
  return { items, env, fleet: fleetIts, cull(cam) { fr.set(cam, gfx); for (const S of chunkSets) S.update(fr); }, hexState: me => { hex.state.ship.copy(me ? me.ship.pos : v3(0, 0, 0)); return hex.state; }, hexHit: (p, time) => hex.hit(p, time),
    update(dt, time, race, fx, cam) {
      gt.update(race, time); pk.update(dt, time, fx); mv.update(dt, time, fx); sk1.update(dt, time, fx, cam); sk2.update(dt, time, fx, cam); bc.update(fx, cam, race, time);
      for (const sh of fleetShips) sh.update(gfx, cam, time, fx); // levels of detail, turrets and cranes, exhaust glow on every nozzle
      for (const d of obs) d.it.quat.multiply(tq.setAxisAngle(d.axis.x, d.axis.y, d.axis.z, d.o.spin * dt));
      { const cp = cam.pos, L = env.sunDir, R = 4300 * (gfx.cfg.hazeDist ?? 1), hcap = gfx.cfg.hazeCap ?? 120; let nc = 0;
        for (const c of clouds) { const dx = c.p.x - cp.x, dy = c.p.y - cp.y, dz = c.p.z - cp.z, dd = Math.hypot(dx, dy, dz); if (dd > R || dd < c.s * 0.6 || nc >= hcap || !fr.sphere(c.p.x, c.p.y, c.p.z, c.s)) continue; /* a cloud the camera is inside or right next to is faded out: skip it */
          const fwd = Math.max(0, (dx * L.x + dy * L.y + dz * L.z) / dd), glow = 0.55 + 1.6 * fwd ** 4, a = 0.2 * Math.min(1, (R - dd) / (R * 0.28));
          fx.bbHaze.add(c.p.x, c.p.y, c.p.z, c.s, 0.3 * glow + 0.03, 0.22 * glow + 0.05, 0.12 * glow + 0.055, a, c.rot, c.sd[0], c.sd[1], c.sd[2]); nc++; } }
      for (let k = 0; k < carrierLights.length; k++) { if ((Math.floor(time * 2 + k * 0.37) % 4) === 0) continue; const p = carrierLights[k]; fx.bbAdd.add(p.x, p.y, p.z, 7, 3, 2.4, 1.6, 1); }
      if ((fireT -= dt) < 0) { fireT = 0.12; for (const h of hulks) if (h.p.dist(cam.pos) < 5000) { const p = h.p.clone().add(v3((Math.random() - 0.5) * h.s, (Math.random() - 0.3) * h.s * 0.5, (Math.random() - 0.5) * h.s));
        fx.spawn(p.x, p.y, p.z, 0, 3, 0, 1.2, h.s * 0.08, h.s * 0.02, 3, 1.3, 0.4, 0.9, true, 0); fx.spawn(p.x, p.y, p.z, 0, 6, 0, 5, h.s * 0.1, h.s * 0.5, 0.08, 0.075, 0.07, 0.45, false, 0.2); } }
    } };
}
