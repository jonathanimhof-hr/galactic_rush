// Binds a Race to its visuals: interpolated, banked ship transforms, per-pilot liveries, ghost hologram.
import { Vec3, Quat, clamp, damp } from '../math.js';
import { ShipVisual, shipModel } from './shipvis.js';

const tq = new Quat();
export const RACE_NUMBERS = { 'VEX ARDEN': 11, 'MARA QUELL': 23, 'DAX ORIN': 4, 'NYLA VOSS': 88, 'KIRO THAL': 61, 'RIO KADE': 9 };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function liveryFor(r) {
  const d = r.ship.def;
  if (r.isPlayer) return r.livery || { paint: d.color, accent: d.accent, stripe: [...mix(d.accent, [1, 1, 1], 0.25), 0.11], number: 1, callsign: '', band: mix(d.accent, [0, 0, 0], 0.15) }; // V7: the player's paint job (progress/customize.js)
  const paint = r.paint || d.color;
  return { paint, accent: d.accent, stripe: [0.93, 0.93, 0.95, 0.09], number: RACE_NUMBERS[r.name] ?? (10 + r.id), callsign: r.name, band: mix(paint, [0, 0, 0], 0.45), ink: [1, 1, 1] };
}

export class RaceView {
  constructor(gfx, race) {
    this.gfx = gfx; this.race = race;
    this.rv = race.racers.map(r => {
      const sv = new ShipVisual(gfx, r.ship.def, liveryFor(r));
      return { r, sv, p: new Vec3().copy(r.ship.pos), q: new Quat().copy(r.ship.quat), bank: 0, eye: sv.model.eye };
    });
    this.byRacer = new Map(this.rv.map(v => [v.r, v]));
    this.ghost = null;
  }
  setGhostShip(def) {
    const m = shipModel(this.gfx, def);
    this.ghost = { mesh: m.mesh, prog: 'unlit', mode: 1, blend: 'add', pos: new Vec3(), quat: new Quat(), scale: 1, color: [0.25, 0.75, 1, 1], intensity: 1.0, opacity: 1, visible: false, layer: 3, br: 2.4 };
  }
  items() { const out = []; for (const v of this.rv) out.push(...v.sv.items); if (this.ghost) out.push(this.ghost); return out; }
  visOf(r) { const v = this.byRacer.get(r); if (!v) return null; const s = r.ship; return { p: v.p, q: v.it || v.q, vel: s.vel, boost: s.boosting || s.padTimer > 0, eye: v.eye, bank: v.bank }; }
  update(dt, t, alpha, camPos, fx, hideMe, detail) {
    for (const v of this.rv) {
      const r = v.r, s = r.ship;
      v.p.lerpVectors(s.prevPos, s.pos, alpha); v.q.slerpQuats(s.prevQuat, s.quat, alpha);
      const target = clamp(s.ang.y * 0.33 + (s.drifting ? Math.sign(s.ang.y) * 0.3 : 0), -0.8, 0.8);
      v.bank += (target - v.bank) * damp(6, dt);
      v.it = v.it || new Quat(); v.it.copy(v.q).multiply(tq.setAxisAngle(0, 0, 1, v.bank));
      const visible = !r.wrecked && !(hideMe && r.isPlayer);
      v.sv.update(dt, t, { pos: v.p, quat: v.it, vel: s.vel, ctrl: r.ctrl, boosting: s.boosting, pad: s.padTimer, drifting: s.drifting, shield: s.shield, stun: s.stun,
        hull01: Math.max(0, s.hull / s.def.hull), throttle: s.throttle, visible, invulnBlink: s.invuln > 0 && Math.floor(t * 12) % 2 === 0 }, fx, camPos, r.isPlayer ? 1.4 : detail);
    }
  }
}
