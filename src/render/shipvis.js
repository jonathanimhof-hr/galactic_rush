// Everything drawn for one racer: hull with livery, animated control surfaces, engine glow and afterburner,
// nav lights, shield bubble, damage smoke/sparks, stun arcs and wingtip vapour.
import { Vec3, Quat, clamp, damp } from '../math.js';
import { Geo } from './geo.js';
import { buildShip } from './models.js';
import { liveryDecal } from './textures.js';

const tmp = new Vec3(), tmp2 = new Vec3(), tq = new Quat(), F = new Vec3();
const rnd = s => (Math.random() * 2 - 1) * s;
let SHARED = null;
function shared(gfx) {
  if (SHARED && SHARED.gfx === gfx) return SHARED;
  const cone = new Geo().mat(0, 1, 1, 0).lathe([[1, 0], [0.92, -0.12], [0.62, -0.45], [0.3, -0.8], [0.02, -1]], 18, [1, 1, 1, 1]);
  const bubble = new Geo().sphere(1, 36, 22, [1, 1, 1, 1]);
  SHARED = { gfx, cone: gfx.mesh(cone.build()), bubble: gfx.mesh(bubble.build()), models: new Map() };
  return SHARED;
}
export function shipModel(gfx, def, paint, accent) {
  const S = shared(gfx), key = def.id + '|' + (paint || def.color).join() + '|' + (accent || def.accent).join();
  if (!S.models.has(key)) {
    const m = buildShip(def, paint, accent);
    m.mesh = gfx.mesh(m.geo); for (const f of m.flaps) f.gmesh = gfx.mesh(f.mesh);
    S.models.set(key, m);
  }
  return S.models.get(key);
}

// V7: a custom paint job's race-number band lives in one texture per ship, redrawn in place when the accent changes,
// so trying colours in the garage never piles up textures
function playerDecal(gfx, livery) {
  const S = shared(gfx); if (!S.pdecals) S.pdecals = new Map();
  let e = S.pdecals.get(livery.decalSlot); const sig = [livery.number, livery.band.map(v => v.toFixed(3))].join('|');
  if (!e) { e = { tex: gfx.texture(liveryDecal(livery.number, '', livery.band)), sig }; S.pdecals.set(livery.decalSlot, e); }
  else if (e.sig !== sig) { gfx.updateTexture(e.tex, liveryDecal(livery.number, '', livery.band)); e.sig = sig; }
  return e.tex;
}
// a paint job's uniforms with this model's pattern frame (centre line and length of its primary paint); control surfaces
// are separate meshes built around their hinge, so they pass the hinge position to keep patterns lined up with the hull
function custFor(model, c, pivot) { if (!c) return null; const data = Float32Array.from(c.data); data.set(model.frame, 18); if (pivot) data.set([pivot.x, pivot.y, pivot.z], 21); return { ...c, data }; }
function decalTex(gfx, livery, accent) {
  if (livery.decalSlot && livery.band) return playerDecal(gfx, livery);
  const key = [livery.number, livery.callsign, livery.band || accent, livery.ink].join('|'), S2 = shared(gfx);
  if (!S2.decals) S2.decals = new Map();
  if (!S2.decals.has(key)) S2.decals.set(key, gfx.texture(liveryDecal(livery.number, livery.callsign || '', livery.band || accent, livery.ink)));
  return S2.decals.get(key);
}
export class ShipVisual {
  // livery: { paint, accent, stripe:[r,g,b,width], number, callsign, band, ink } (V7 adds modelAccent, custom, trail, decalSlot)
  constructor(gfx, def, livery = {}) {
    const S = shared(gfx); this.gfx = gfx; this.def = def;
    this.model = shipModel(gfx, def, livery.paint, livery.modelAccent || livery.accent);
    this.accent = livery.accent || def.accent;
    const m = this.model, ds = 1 / m.scale;
    const decal = livery.number != null ? { tex: decalTex(gfx, livery, this.accent), box: m.decal.box, maxX: m.decal.maxX } : null;
    const stripe = livery.stripe || null; this.trail = livery.trail || null;
    this.hull = { mesh: m.mesh, prog: 'pbrShip', pos: new Vec3(), quat: new Quat(), scale: 1, visible: true, cast: true, br: 2.4, ds, stripe, decal, damage: 0, rim: [0, 0, 0], cust: custFor(m, livery.custom),
      eng: (() => { const a = new Float32Array(12); m.engines.slice(0, 3).forEach((e, i) => a.set([e.x, e.y, e.z, e.r], i * 4)); return a; })(),
      faction: def.id === 'lancer' || def.id === 'halberd' ? 1 : 0, seedS: ((livery.number || 7) * 0.618) % 1 };
    this.flaps = m.flaps.map(f => ({ f, angle: 0, it: { mesh: f.gmesh, prog: 'pbrShip', pos: new Vec3(), quat: new Quat(), scale: 1, visible: true, cast: true, br: 1.6, ds, cust: custFor(m, livery.custom, f.pivot) } }));
    const ac = this.accent;
    this.flames = m.engines.map(e => ({ e, it: { mesh: S.cone, prog: 'unlit', blend: 'add', mode: 2, pos: new Vec3(), quat: new Quat(), sx: 1, sy: 1, sz: 1, visible: false, color: [0.55 + ac[0] * 0.6, 0.55 + ac[1] * 0.6, 0.6 + ac[2] * 0.5, 1], intensity: 2, opacity: 1, layer: 4, br: 6 } }));
    this.shield = { mesh: S.bubble, prog: 'unlit', blend: 'add', mode: 4, pos: new Vec3(), quat: new Quat(), scale: 2.65, visible: false, color: [0.35, 0.75, 1, 1], intensity: 1.05, opacity: 1, layer: 5, br: 3 };
    this.items = [this.hull, ...this.flaps.map(f => f.it), ...this.flames.map(f => f.it), this.shield];
    this.exh = 0; this.vap = 0; this.smk = 0; this.flick = 1; this.boostK = 0; this.navPhase = Math.random() * 3;
    this.enginesW = m.engines.map(() => new Vec3());
  }
  // V7: apply a new paint job to this ship without rebuilding anything (garage preview, Apply)
  setLivery(livery) {
    const ac = this.accent = livery.accent || this.def.accent;
    this.hull.cust = custFor(this.model, livery.custom); for (const f of this.flaps) f.it.cust = custFor(this.model, livery.custom, f.f.pivot);
    this.hull.stripe = livery.stripe || null; this.trail = livery.trail || null;
    for (const f of this.flames) f.it.color = [0.55 + ac[0] * 0.6, 0.55 + ac[1] * 0.6, 0.6 + ac[2] * 0.5, 1];
    if (this.hull.decal && livery.number != null) this.hull.decal.tex = decalTex(this.gfx, livery, ac);
  }
  setVisible(v) { this.hull.visible = v; for (const f of this.flaps) f.it.visible = v; if (!v) { for (const f of this.flames) f.it.visible = false; this.shield.visible = false; } this.visible = v; }

  // st: { pos, quat, vel, ctrl, boosting, pad, drifting, shield, stun, hull01, throttle, invulnBlink }
  update(dt, t, st, fx, camPos, detail = 1) {
    const hull = this.hull, m = this.model, ac = this.accent;
    hull.pos.copy(st.pos); hull.quat.copy(st.quat); hull.damage = clamp((0.85 - st.hull01) * 1.4, 0, 1);
    const vis = st.visible !== false; this.setVisible(vis);
    if (!vis) return;
    const c = st.ctrl || {}, k = damp(10, dt);
    for (const f of this.flaps) {
      const fl = f.f; let target = 0;
      if (fl.kind === 'pitch') target = -(c.pitch || 0) * 0.42 * fl.sign + (c.roll || 0) * 0.1;
      else if (fl.kind === 'yaw') target = (c.yaw || 0) * 0.4 * fl.sign;
      else target = ((c.roll || 0) * 0.45 + (c.yaw || 0) * 0.22) * fl.sign;
      if (st.stun > 0) target += Math.sin(t * 40 + fl.pivot.x * 9) * 0.25;
      f.angle += (target - f.angle) * k;
      tmp.copy(fl.pivot).applyQuat(st.quat); f.it.pos.copy(st.pos).add(tmp);
      f.it.quat.copy(st.quat).multiply(tq.setAxisAngle(fl.axis[0], fl.axis[1], fl.axis[2], f.angle));
    }
    // engines
    const boost = st.boosting || st.pad > 0; this.boostK += ((boost ? 1 : 0) - this.boostK) * damp(boost ? 9 : 4, dt);
    const low = st.hull01 < 0.3; this.flick = low ? (Math.random() < 0.12 ? 0.15 : 0.75 + Math.random() * 0.25) : 1;
    const thr = (st.stun > 0 ? 0.25 : clamp(st.throttle ?? 1, 0, 1)) * this.flick, bk = this.boostK;
    F.set(0, 0, 1).applyQuat(st.quat);
    const near = camPos ? camPos.dist(st.pos) : 0, sp = st.vel ? st.vel.len() : 0;
    m.engines.forEach((e, i) => {
      const w = this.enginesW[i]; w.set(e.x, e.y, e.z).applyQuat(st.quat).add(st.pos);
      const fl = this.flames[i].it, len = e.r * (0.9 + thr * 1.1 + bk * 4.2 * (0.85 + Math.random() * 0.3)); // short, hot exhaust rather than long glowing cones
      fl.visible = thr > 0.05; fl.pos.copy(w); fl.quat.copy(st.quat); fl.sx = fl.sy = e.r * (0.82 + bk * 0.15); fl.sz = len;
      fl.intensity = (0.35 + thr * 0.35 + bk * 2.4) * this.flick; fl.opacity = 0.55 + bk * 0.45;
      const g = (0.55 + thr * 0.45 + bk * 0.7) * this.flick;
      fx.bbAdd.add(w.x, w.y, w.z, e.r * (1.3 + bk * 1.4), (0.25 + ac[0]) * 1.1 * g, (0.25 + ac[1]) * 1.1 * g, (0.3 + ac[2]) * 1.1 * g, 0.75);
      if (bk > 0.05) fx.bbAdd.add(w.x, w.y, w.z, e.r * 0.65, 2.4 * bk, 2.2 * bk, 2.0 * bk, 0.9);
      if (near < 260 * detail) {
        this.exh += dt * (10 + 30 * thr + 50 * bk) * detail;
        while (this.exh > 1) { this.exh--; const v = st.vel;
          fx.spawn(w.x, w.y, w.z, (v ? v.x * 0.8 : 0) - F.x * 22 + rnd(2), (v ? v.y * 0.8 : 0) - F.y * 22 + rnd(2), (v ? v.z * 0.8 : 0) - F.z * 22 + rnd(2), 0.18 + bk * 0.12, e.r * (0.6 + bk * 0.5), e.r * 0.1,
            (0.3 + ac[0] * 0.7) * (1 + bk), (0.3 + ac[1] * 0.7) * (1 + bk), (0.35 + ac[2] * 0.65) * (1 + bk), 0.5, true, 2); }
      }
    });
    // nav lights
    const blink = (t + this.navPhase) % 1.2;
    for (const n of m.nav) {
      tmp.set(n.x, n.y, n.z).applyQuat(st.quat).add(st.pos);
      const on = n.mode === 'strobe' ? (blink < 0.06 || (blink > 0.16 && blink < 0.21)) : true, kk = n.mode === 'strobe' ? 3.2 : 1.6;
      if (on) fx.bbAdd.add(tmp.x, tmp.y, tmp.z, n.mode === 'strobe' ? 0.36 : 0.2, n.col[0] * kk, n.col[1] * kk, n.col[2] * kk, 1);
    }
    // vapour trails while sliding or pulling hard
    const pull = Math.abs(c.pitch || 0) + Math.abs(c.yaw || 0);
    if ((st.drifting || pull > 1.2) && sp > 60 && near < 300 * detail) {
      let tr = 0.9, tg = 0.93, tb = 1; const T = this.trail; // V7 contrail colour (special effects); prism cycles the hue
      if (T === 'prism') { const h = (t * 0.35) % 1; tr = 0.5 + 0.5 * Math.cos(6.283 * h); tg = 0.5 + 0.5 * Math.cos(6.283 * (h - 0.333)); tb = 0.5 + 0.5 * Math.cos(6.283 * (h - 0.667)); }
      else if (T) { tr = T[0]; tg = T[1]; tb = T[2]; }
      for (const tp of m.tips) { tmp.set(tp.x, tp.y, tp.z).applyQuat(st.quat).add(st.pos);
        fx.spawn(tmp.x, tmp.y, tmp.z, st.vel.x * 0.05, st.vel.y * 0.05, st.vel.z * 0.05, 0.55, 0.11, 0.22, tr, tg, tb, st.drifting ? 0.32 : 0.18, false, 0, 0.0); }
    }
    // shield bubble
    this.shield.visible = st.shield > 0; if (st.shield > 0) { this.shield.pos.copy(st.pos); this.shield.quat.copy(st.quat); this.shield.opacity = (st.shield < 0.6 ? (Math.floor(t * 18) % 2 ? 0.35 : 1) : 1) * (0.85 + 0.15 * Math.sin(t * 9)); }
    // damage: smoke trail and sparks
    if (st.hull01 < 0.55 && near < 400 * detail) {
      this.smk += dt * (6 + (0.55 - st.hull01) * 40) * detail;
      while (this.smk > 1) { this.smk--; tmp.set(rnd(0.7), 0.2 + rnd(0.3), -0.8 + rnd(0.6)).applyQuat(st.quat).add(st.pos); tmp2.copy(st.vel).scale(0.55);
        const p = fx.smoke(tmp, tmp2, 0.5, 1.4, 0.07 + Math.random() * 0.05); if (p) p.a = 0.35 + (0.55 - st.hull01); }
      if (low && Math.random() < dt * 5) { tmp.set(rnd(0.9), rnd(0.4), rnd(1)).applyQuat(st.quat).add(st.pos); fx.sparks(tmp, 18, st.vel.clone().scale(0.7)); }
    }
    // ion stun arcs
    if (st.stun > 0) for (let a = 0; a < 2; a++) {
      tmp.set(rnd(1.6), rnd(0.6), rnd(1.8)).applyQuat(st.quat).add(st.pos);
      let x = tmp.x, y = tmp.y, z = tmp.z;
      for (let s = 0; s < 4; s++) { const dx = rnd(0.7), dy = rnd(0.7), dz = rnd(0.7);
        fx.bbAdd.add(x + dx / 2, y + dy / 2, z + dz / 2, 0.05, 2.4, 1.2, 3.2, 0.9, dx, dy, dz, Math.hypot(dx, dy, dz)); x += dx; y += dy; z += dz; }
    }
    if (st.invulnBlink) { hull.visible = false; for (const f of this.flaps) f.it.visible = false; }
  }
}
