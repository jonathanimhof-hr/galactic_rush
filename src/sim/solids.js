// GALACTIC RUSH V12 — solid parts of course structures beyond the original sphere and beam obstacles, for the obstacles
// V12 adds to Pelagos and Orbital Nexus. A part is a polyline with a radius at each point, made solid as a chain of
// spheres about 0.6 radii apart (the way Verdant Canopy has made its wood solid since V10): only the spheres that reach
// into the corridor are kept, so the solid part is exactly the part a ship can meet. A part can move as one piece:
// bob (every sphere by the same Lissajous offset, Track.updateObstacles) or swing / turn round a pivot in the
// cross-section (Track.rotAt). Every motion is a function of the race clock alone, so every client and the server see a
// part in the same place. The visual record (t.solids) keeps the whole part for the renderer, which draws it where the
// simulation has it.
import { Vec3 } from '../math.js';

const loc = {};
// a static or bobbing part along world points pts (Vec3) with radii rad; hint: a sample index near it
export function part(t, pts, rad, kind, hint, move = null) {
  const rec = { kind, pts: pts.map(p => p.clone()), rad: rad.slice(), spheres: [], move, hint };
  let h = hint;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = a.dist(b), n = Math.max(1, Math.ceil(L / (Math.min(rad[k], rad[k + 1]) * 0.6)));
    for (let j = k ? 1 : 0; j <= n; j++) {
      const u = j / n, r = rad[k] + (rad[k + 1] - rad[k]) * u, p = new Vec3().lerpVectors(a, b, u);
      t.locate(p, h, loc, 40); h = loc.i;
      const reach = r + (move ? Math.abs(move.ax || 0) + Math.abs(move.ay || 0) : 0) - 0.2;
      if (Math.abs(loc.along) > t.D || Math.abs(loc.x) > t.w[loc.i] + reach || Math.abs(loc.y) > t.h[loc.i] + reach) continue;
      t.addObstacle({ type: 'sphere', kind, i: loc.i, x: loc.x, y: loc.y, r, ...(move ? { move: { ...move } } : {}) });
      const o = t.obstacles[t.obstacles.length - 1]; o.base.copy(p); o.p.copy(p); rec.spheres.push(o);
    }
  }
  (t.solids || (t.solids = [])).push(rec);
  return rec;
}
// an arm in the cross-section of sample i, from L0 to L1 metres out from the pivot (px, py), radius r0 -> r1, swinging
// (amp given: th0 + amp sin(w t + ph)) or turning (th0 + w t); its spheres all ride the same rule
export function arm(t, i, px, py, L0, L1, r0, r1, rot, kind) {
  i = t.wrapIdx(i);
  const rec = { kind, i, px, py, L0, L1, r0, r1, rot: { ...rot }, spheres: [] }, n = L1 > L0 ? Math.max(1, Math.ceil((L1 - L0) / (Math.min(r0, r1) * 0.6))) : 0;
  for (let j = 0; j <= n; j++) {
    const u = n ? j / n : 0, L = L0 + (L1 - L0) * u, r = r0 + (r1 - r0) * u, m = { rot: true, px, py, L, th0: rot.th0, w: rot.w, ph: rot.ph || 0, ...(rot.amp != null ? { amp: rot.amp } : {}) };
    const [x, y] = t.rotAt(m, 0);
    t.addObstacle({ type: 'sphere', kind, i, x, y, r, move: m });
    rec.spheres.push(t.obstacles[t.obstacles.length - 1]);
  }
  (t.solids || (t.solids = [])).push(rec);
  return rec;
}
export const worldAt = (t, i, x, y) => t.pointAt(t.wrapIdx(i), x, y);
