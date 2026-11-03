// Hangar: a dedicated lit scene for ship selection and the podium. Polished floor with planar reflection,
// turntable, three-point lighting, light-strip ceiling with haze cones and a hangar door open to space.
import { Vec3, Quat } from '../math.js';
import { Geo, QX, QY, QZ, DET } from './geo.js';
import { holoSign, textPanel, gateNumber } from './textures.js';

const v3 = (x, y, z) => new Vec3(x, y, z);
const HZ = [[0.95, 0.68, 0.08, 0], [0.06, 0.06, 0.07, 0]];

export function buildHangar(gfx) {
  const items = [], add = (geo, o = {}) => { const it = { mesh: gfx.mesh(geo.build ? geo.build() : geo), visible: true, ...o }; items.push(it); return it; };
  // floor (transparent so the mirrored ship shows through as a reflection)
  const floor = new Geo().mat(0.75, 0.14, 1, DET.struct).at(0, -0.06, 0).box(90, 0.12, 90, [0.09, 0.093, 0.1, 0]);
  const floorIt = add(floor, { blend: 'normal', opacity: 0.72, ds: 6, layer: -5 });
  const deco = new Geo();
  // turntable (showcase) and podium steps (results)
  const tt = new Geo();
  tt.mat(0.85, 0.32, 0, DET.hull).at(0, 0.12, 0, QX(90)).cyl(3.7, 3.7, 0.3, 64, [0.1, 0.105, 0.115, 0]);
  tt.mat(0.9, 0.25, 0, 0).at(0, 0.29, 0, QX(90)).torus(3.7, 0.06, 64, 6, [0.5, 0.5, 0.52, 0]);
  const pod = new Geo(), podLit = new Geo().mat(0, 0.4, 4, 0);
  for (const [x, h, z] of [[0, 1.4, 0], [-7, 0.8, 1.5], [7, 0.5, 1.5]]) {
    pod.mat(0.8, 0.28, 1, DET.hull).at(x, h / 2, z).bbox(5.6, h, 4.6, 0.12, [0.12, 0.125, 0.135, 0]);
    podLit.at(x, h + 0.02, z).box(5.2, 0.04, 0.12, [1, 0.72, 0.25, 1]).at(x, h / 2, z + 2.31).box(5.0, 0.06, 0.04, [1, 0.72, 0.25, 1]);
  }
  const glow = new Geo().mat(0, 0.4, 4, 0);
  // hangar door frame (back), walls, ceiling girders with light strips
  deco.mat(0.55, 0.5, 1, DET.struct);
  for (const s of [-1, 1]) {
    deco.at(26 * s, 13, -32).bbox(5, 28, 5, 0.4, [0.22, 0.23, 0.25, 0]);
    for (let k = 0; k < 14; k++) deco.mat(0.4, 0.5, 0, 0).at(26 * s - 2.55 * s, 1 + k * 1.9, -32 + 2.3, QZ(35)).box(0.15, 1.9, 0.2, HZ[k % 2]);
    deco.mat(0.55, 0.5, 1, DET.struct).at(31 * s, 12, 0).bbox(4, 24, 64, 0.4, [0.17, 0.175, 0.19, 0]);
    for (let z = -26; z <= 26; z += 8) { deco.at(28.8 * s, 12, z).bbox(0.8, 24, 1.2, 0.15, [0.25, 0.26, 0.28, 0]); glow.mat(0, 0.4, 3, 0).at(28.35 * s, 12, z + 4, null).box(0.1, 18, 0.25, [1, 0.85, 0.6, 1]); }
    deco.mat(0.6, 0.45, 1, DET.struct).at(9 * s, 22, 0).bbox(2.2, 1.6, 70, 0.3, [0.2, 0.21, 0.23, 0]);
    glow.mat(0, 0.4, 7, 0).at(9 * s, 21.15, 0).box(1.3, 0.1, 64, [1, 0.97, 0.92, 1]);
    for (let z = -28; z <= 28; z += 7) deco.mat(0.6, 0.45, 1, DET.struct).at(0, 22.5, z).bbox(60, 1.2, 1.2, 0.2, [0.19, 0.2, 0.22, 0]);
    // crates and cables
    for (let k = 0; k < 4; k++) { const x = (12 + (k % 2) * 3.2) * s, z = -8 - Math.floor(k / 2) * 3.4;
      deco.mat(0.3, 0.55, 1, DET.hull).at(x, 1.3, z, QY(k * 7 * s)).bbox(3, 2.6, 3, 0.12, k % 3 ? [0.32, 0.36, 0.3, 0] : [0.42, 0.18, 0.12, 0]);
      deco.mat(0.3, 0.5, 0, 0).at(x, 2.65, z, QY(k * 7 * s)).box(3.05, 0.12, 0.5, HZ[0]); }
    deco.mat(0.2, 0.7, 0, 0).tube([v3(4.8 * s, 0.1, 1), v3(7 * s, 0.12, 3), v3(11 * s, 0.12, 2), v3(13 * s, 0.4, -4), v3(13 * s, 1.8, -6)], 0.14, 8, [0.05, 0.05, 0.055, 0]);
  }
  deco.mat(0.55, 0.5, 1, DET.struct).at(0, 26.5, -32).bbox(57, 5, 5.5, 0.4, [0.22, 0.23, 0.25, 0]);
  deco.mat(0.55, 0.5, 1, DET.struct).at(0, 12, 34).bbox(60, 26, 3, 0.3, [0.15, 0.155, 0.17, 0]);
  for (let k = 0; k < 22; k++) deco.mat(0.4, 0.5, 0, 0).at(-24 + k * 2.3, 23.9, -29.6).box(2.3, 0.6, 0.2, HZ[k % 2]);
  // door edge lights and a gantry crane over the door
  for (let k = 0; k < 9; k++) glow.mat(0, 0.4, 5, 0).at(-24 + k * 6, 0.05, -29).box(2.4, 0.06, 0.4, [1, 0.6, 0.15, 1]);
  deco.mat(0.6, 0.45, 1, DET.struct).at(0, 19, -20).bbox(50, 1.4, 1.4, 0.2, [0.3, 0.27, 0.12, 0]);
  deco.mat(0.6, 0.45, 1, DET.struct).at(-6, 17.6, -20).bbox(3, 1.6, 2.4, 0.2, [0.3, 0.27, 0.12, 0]);
  deco.mat(0.9, 0.3, 0, 0).at(-6, 13, -20, QX(90)).cyl(0.05, 0.05, 9, 6, [0.5, 0.5, 0.5, 0]);
  add(deco, { cast: true });
  add(glow, {});
  const showIt = [add(tt, { cast: true }), null], podIt = [add(pod, { cast: true }), add(podLit, {})];
  items.pop(); items.pop(); items.pop(); // tt, pod and podLit are mode-specific, kept outside the base list
  const ttGlow = new Geo().mat(0, 0.4, 4, 0); ttGlow.at(0, 0.28, 0, QX(90)).torus(3.5, 0.03, 72, 5, [0.35, 0.85, 1, 1]).at(0, 0.28, 0, QX(90)).torus(1.8, 0.022, 48, 5, [0.35, 0.85, 1, 1]);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ttGlow.at(Math.cos(a) * 2.65, 0.28, Math.sin(a) * 2.65, QY(-k * 30)).box(1.5, 0.02, 0.035, [0.35, 0.85, 1, 1]); }
  showIt[1] = { mesh: gfx.mesh(ttGlow.build()), visible: true };
  const numQuad = gfx.mesh(new Geo().box(1, 1, 0.001, [1, 1, 1, 1]).build());
  const nums = [[0, 1.4, 0], [-7, 0.8, 1.5], [7, 0.5, 1.5]].map(([x, h, z], k) => ({ mesh: numQuad, prog: 'unlit', mode: 1, blend: 'add', tex: gfx.texture(gateNumber(String(k + 1), [1, 0.75, 0.3])), pos: v3(x, h / 2, z + 2.36), quat: new Quat(), scale: Math.min(1.3, h * 0.9), intensity: 1.6, color: [1, 1, 1, 1], visible: true, layer: 6 }));
  // haze cones under the ceiling strips
  const coneG = new Geo().lathe([[0.4, 0], [6.5, -1]], 32, [1, 0.96, 0.9, 1]);
  const cone = gfx.mesh(coneG.build());
  for (const s of [-1, 1]) for (const z of [-14, 0, 14]) items.push({ mesh: cone, prog: 'unlit', mode: 5, blend: 'add', pos: v3(9 * s, 21, z), quat: QX(-90), sx: 1, sy: 1, sz: 21, intensity: 0.05, opacity: 1, color: [1, 0.97, 0.92, 1], visible: true, layer: 6 });
  // holo board
  const holo = new Geo().at(0, 0, 0).box(1, 0.5, 0.001, [1, 1, 1, 1]);
  const holoIt = { mesh: gfx.mesh(holo.build()), prog: 'unlit', mode: 1, blend: 'add', tex: gfx.texture(holoSign(77, [0.35, 0.85, 1], { brand: 'BAY 07' })), pos: v3(-10, 7, -26), quat: new Quat(), scale: 10, intensity: 1.6, color: [1, 1, 1, 1], visible: true, layer: 6 };
  items.push(holoIt);
  const banner = { mesh: holoIt.mesh, prog: 'unlit', blend: 'add', tex: gfx.texture(textPanel('STARLANE GRAND PRIX', [1, 0.72, 0.25])), pos: v3(0, 30.5, -29.2), quat: new Quat(), sx: 34, sy: 8.5, sz: 1, intensity: 1.4, color: [1, 1, 1, 1], visible: true, layer: 6 };
  items.push(banner);
  const env = { studio: true, sunDir: v3(0.42, 0.82, 0.38).normalize(), sunCol: [3.4, 3.2, 3.0], fogCol: [0.006, 0.007, 0.01], fog: 0.009, envInt: 1.0,
    nebA: [0.25, 0.12, 0.35], nebB: [0.1, 0.2, 0.45], nebC: [0.9, 0.8, 1], base: [0.002, 0.002, 0.004], neb: 0.8, seed: 31.7, expo: 1.05, shafts: 0, sat: 1.04,
    lift: [0.004, 0.005, 0.008], gain: [1, 1, 1], shadowR: 14 };
  const motes = Array.from({ length: 140 }, () => ({ p: v3((Math.random() - 0.5) * 34, Math.random() * 20, (Math.random() - 0.5) * 40), ph: Math.random() * 6 }));
  const base = items.slice();
  const H = {
    get items() { return this.mode === 'podium' ? base.concat(podIt, nums) : base.concat(showIt); }, env, floorIt, mode: 'showcase', show: [], spin: 0,
    // V7 garage preview: turntable angle (auto spin, or eased to a chosen angle), tilt toward the camera and zoom on the ship
    view: { auto: true, tYaw: null, tilt: 0, tTilt: 0, zoom: 1, tZoom: 1 },
    setView(o) { Object.assign(this.view, o); },
    resetView() { this.view = { auto: true, tYaw: null, tilt: 0, tTilt: 0, zoom: 1, tZoom: 1 }; },
    lights: [{ pos: v3(-7, 4, 5), col: [1.2, 1.5, 2.2], range: 24 }, { pos: v3(2, 5, -9), col: [3, 2.4, 1.8], range: 26 }, { pos: v3(0, 0.6, 0), col: [0.3, 0.8, 1.1], range: 8 }],
    // vis: ShipVisual list; showcase uses vis[0], podium uses three
    setShow(list, mode) { this.show = list; this.mode = mode; },
    poses() {
      if (this.mode === 'podium') return [{ x: 0, y: 3.15, z: 0 }, { x: -7, y: 2.55, z: 1.5 }, { x: 7, y: 2.25, z: 1.5 }];
      return [{ x: 0, y: 1.9, z: 0 }];
    },
    update(dt, t, fx, cam) {
      const V = this.view, TAU = Math.PI * 2, e = Math.min(1, dt * 6);
      if (this.freezeSpin != null) this.spin = this.freezeSpin; // freezeSpin: test hook for silhouette sheets
      else if (V.tYaw != null) this.spin += ((((V.tYaw - this.spin) % TAU) + TAU * 1.5) % TAU - Math.PI) * e;
      else if (V.auto) this.spin += dt * 0.32;
      V.tilt += (V.tTilt - V.tilt) * e; V.zoom += (V.tZoom - V.zoom) * e;
      const ax = cam ? new Vec3(cam.pos.z, 0, -cam.pos.x).normalize() : new Vec3(1, 0, 0), tq = new Quat().setAxisAngle(ax.x, ax.y, ax.z, V.tilt); // tilt about the horizontal axis across the line of sight
      const poses = this.poses(), out = [];
      this.show.forEach((vis, k) => {
        const p = poses[k] || poses[0], bob = Math.sin(t * 1.3 + k) * 0.08;
        const q = this.mode === 'podium' ? QY(160 + k * 12 * (k === 1 ? 1 : -1)).multiply(QX(-4)) : (V.tilt ? tq.clone() : new Quat()).multiply(new Quat().setAxisAngle(0, 1, 0, this.spin)).multiply(QX(-3));
        vis.update(dt, t, { pos: v3(p.x, p.y + bob, p.z), quat: q, vel: v3(0, 0, 0), ctrl: { pitch: Math.sin(t * 0.7) * 0.3, yaw: Math.sin(t * 0.5) * 0.3, roll: 0 }, throttle: 0.35, hull01: 1, shield: 0, stun: 0, pad: 0, boosting: false }, fx, cam.pos, 1);
        for (const it of vis.items) if (it.visible) out.push(it, mirror(it));
      });
      for (const m of motes) { const y = (m.p.y + t * 0.15) % 20; fx.bbAdd.add(m.p.x + Math.sin(t * 0.3 + m.ph) * 0.5, y, m.p.z, 0.05, 0.6, 0.58, 0.55, 0.5); }
      return out;
    },
    camera(t) {
      if (this.mode === 'podium') return { pos: v3(Math.sin(t * 0.1) * 3, 6.5, 19), at: v3(0, 2.6, 0), fov: 42 };
      const wide = innerWidth / innerHeight > 1.2;
      // wide screens: ship centred at ~65% of the width, about a third of the screen across, clear of the menu rail
      const c = wide ? { pos: v3(4.4, 2.15, 6.6), at: v3(-1.16, 1.35, 0.77), fov: 36 } : { pos: v3(3.5, 2.25, 5.8), at: v3(0, 1.0, 0), fov: 52 };
      const z = this.view.zoom; if (Math.abs(z - 1) > 1e-4) { const sp = v3(0, 1.9, 0); c.pos = sp.clone().addScaled(c.pos.sub(sp), z); c.at = sp.clone().addScaled(c.at.sub(sp), z); } // V7 zoom: scale the rig about the ship so it stays framed
      return c;
    },
  };
  return H;
}

const mirrors = new WeakMap();
function mirror(it) {
  let e = mirrors.get(it);
  if (!e) { e = { p: new Vec3(), q: new Quat(), m: {} }; mirrors.set(it, e); }
  const m = Object.assign(e.m, it);
  m.pos = e.p.set(it.pos.x, -it.pos.y, it.pos.z); m.quat = e.q.set(-it.quat.x, it.quat.y, -it.quat.z, it.quat.w);
  const s = it.scale ?? 1; m.sx = it.sx ?? s; m.sy = -(it.sy ?? s); m.sz = it.sz ?? s; m.scale = undefined; m.cast = false;
  return m;
}
