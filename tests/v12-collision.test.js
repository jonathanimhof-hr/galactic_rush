// GALACTIC RUSH V12 — every solid obstacle of every course stops a ship, at any racing speed and from any reasonable
// angle: a ship is flown straight at each obstacle (spheres: their centre; beams: several points along them) at speeds
// from 150 m/s to 420 m/s (above the fastest a fully upgraded ship reaches on boost and a pad), head-on and at angles,
// through the game's own collision code (Race.collideTrack, the same code every client and the server run). A pass
// counts as a tunnel when the ship's continuous path came deeper into the obstacle than 0.5 m without the game
// registering the contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrack, TRACK_DEFS } from '../src/sim/tracks.js';
import { Race } from '../src/sim/race.js';
import { SIM_DT } from '../src/config.js';
import { Vec3 } from '../src/math.js';

const SPEEDS = [150, 250, 350, 420], ANGLES = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.2], [0, -0.2]];
const segDist = (a, b, c) => { const ab = new Vec3().subVectors(b, a), ac = new Vec3().subVectors(c, a), L2 = ab.lenSq(); const u = L2 > 0 ? Math.max(0, Math.min(1, ac.dot(ab) / L2)) : 0; return a.clone().addScaled(ab, u).dist(c); };

export function targetsOf(t, o) {
  if (o.type === 'sphere') return [o.p.clone()];
  const out = [];
  for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) out.push(o.type === 'vbeam' ? t.pointAt(o.i, o.ox ?? o.x, f * t.h[o.i]) : t.pointAt(o.i, f * t.w[o.i], o.oy ?? o.y));
  return out;
}
// distance from a point to the obstacle's solid axis (sphere centre, or the beam's line through the cross-section)
function axisDist(t, o, p, loc) {
  if (o.type === 'sphere') return p.dist(o.p);
  t.locate(p, o.i, loc, 12);
  const di = Math.abs(((loc.s - o.i * t.D) % t.length + t.length * 1.5) % t.length - t.length / 2);
  return Math.hypot(di, o.type === 'vbeam' ? loc.x - (o.ox ?? o.x) : loc.y - (o.oy ?? o.y));
}

export function flyAt(courseId, filter = () => true) {
  const t = getTrack(courseId), res = { runs: 0, contacts: 0, tunnels: [], deepest: 0, skipped: 0 };
  const race = new Race({ track: t, laps: 1, racers: [{ name: 'P', shipId: 'kestrel', isPlayer: true }], countdown: 0 });
  const r = race.player, s = r.ship, R = s.def.radius, loc = {}, dir = new Vec3();
  for (const o of t.obstacles) {
    if (!filter(o)) continue;
    for (const target of targetsOf(t, o)) for (const v of SPEEDS) for (const [ax, ay] of ANGLES) {
      race.time = 0; t.updateObstacles(0);
      const T = t.tan[o.i], B = t.bin[o.i], N = t.nrm[o.i];
      dir.copy(T).addScaled(B, ax).addScaled(N, ay).normalize();
      const start = target.clone().addScaled(dir, -34);
      t.locate(start, t.wrapIdx(o.i - 8), loc, 20);
      if (Math.abs(loc.x) > t.w[loc.i] - R - 0.5 || Math.abs(loc.y) > t.h[loc.i] - R - 0.5) { res.skipped++; continue; } // would start inside a wall
      s.pos.copy(start); s.prevPos.copy(start); s.vel.copy(dir).scale(v); s.hull = 1e9; s.invuln = 0; s.shield = 0;
      r.ti = loc.i; r.s = loc.s; race.events.length = 0;
      let hit = false, deepest = 0;
      for (let k = 0; k < Math.ceil(70 / (v * SIM_DT)); k++) {
        const a = s.pos.clone(); race.time += SIM_DT; t.updateObstacles(race.time);
        s.prevPos.copy(s.pos); s.pos.addScaled(s.vel, SIM_DT);
        // how deep the straight path between the two steps went (before the game resolves the contact)
        const pen = o.type === 'sphere' ? o.r + R - segDist(a, s.pos, o.p) : o.r + R - Math.min(axisDist(t, o, a, loc), axisDist(t, o, s.pos, loc), axisDist(t, o, a.clone().lerp(s.pos, 0.5), loc));
        race.collideTrack(r);
        if (race.events.some(e => e.type === 'hit' && e.kind === 'obs')) hit = true;
        race.events.length = 0;
        if (!hit) deepest = Math.max(deepest, pen);
      }
      res.runs++; if (hit) res.contacts++;
      if (!hit && deepest > 0.5) res.tunnels.push({ obstacle: `${o.type}:${o.kind || ''}@${o.i}`, speed: v, angle: [ax, ay], depth: +deepest.toFixed(2) });
      res.deepest = Math.max(res.deepest, hit ? 0 : deepest);
    }
  }
  return res;
}

for (const d of TRACK_DEFS) {
  test(`${d.name}: no ship passes through a solid obstacle at 150-420 m/s from any of five angles`, () => {
    const res = flyAt(d.id);
    if (!getTrack(d.id).obstacles.length) return;
    assert.ok(res.runs > 0, 'flights made');
    assert.equal(res.tunnels.length, 0, `tunnels: ${JSON.stringify(res.tunnels.slice(0, 5))}`);
  });
}
