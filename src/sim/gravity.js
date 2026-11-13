// GALACTIC RUSH V10 — the gravity sections of Orbital Nexus, a system of that course alone.
//
// Everywhere else in the game ships fly without gravity: the flight model levels the roll toward the course's "up" and
// the corridor walls keep the ship on the course. Orbital Nexus adds gravity plating in designed sections of the
// station (its course data has `grav` and `roll` on those segments; no other course has either; pathtrack10.js builds
// both into the course):
//   * roll: deg on a segment turns the course's "up" about the direction of travel by that angle, eased across the
//     segment, so the deck you race on becomes a wall (90 deg) or the ceiling (180 deg) and back. The turn happens
//     about the ride line (GRAVITY.ride above the deck), so a ship riding the deck stays on it while it turns.
//   * grav: true marks the plated segments. There the deck pulls every ship toward itself (GRAVITY.g) and a hover
//     cushion holds it GRAVITY.ride above the plating; the field fades in and out over GRAVITY.ramp metres at the ends
//     of each plated stretch. The pull always points at the course's current floor, so it turns with the deck.
// The flight model, the collisions and the AI are untouched: the race loop calls gravityStep() for a ship only when
// its course has a gravity field (track.grav), and the field is a function of the course position alone, so every
// game in an online race feels exactly the same gravity at the same place.
import { clamp, smoother } from '../math.js';

export const GRAVITY = Object.freeze({ g: 32, ride: 3.8, k: 90, c: 15, band: 2.5, ramp: 100 });

// track.grav (0..1 per sample), track.gravZones, and the racing line on the deck inside the field
export function gravityField(t) {
  const N = t.N, raw = new Uint8Array(N); for (let i = 0; i < N; i++) raw[i] = t.segs[t.segIdx[i]].grav ? 1 : 0;
  if (raw.every(v => v)) throw new Error('a gravity course needs open sections');
  const g = new Float32Array(N), zones = [];
  let s0 = 0; while (raw[s0]) s0++; // scan from outside a zone so a zone across the start line stays whole
  for (let k = 0; k < N; k++) { const i = (s0 + k) % N; if (!raw[i] || raw[(i - 1 + N) % N]) continue; let n = 0; while (raw[(i + n) % N]) n++; zones.push({ i0: i, n }); }
  for (const z of zones) for (let j = 0; j < z.n; j++) { const d = Math.min(j, z.n - 1 - j) * t.D; g[(z.i0 + j) % N] = smoother(clamp(d / GRAVITY.ramp, 0, 1)); }
  t.grav = g; t.gravZones = zones.map(z => ({ i0: z.i0, i1: (z.i0 + z.n - 1) % N, n: z.n }));
  for (let i = 0; i < N; i++) { const deck = -t.h[i] + GRAVITY.ride + 0.4; t.lineY[i] += (deck - t.lineY[i]) * g[i]; }
  return t;
}

// One step of the plating for one ship, after its collisions (so r.ti and r.ly are current): the pull toward the deck
// and the hover cushion, both along the course's "up" and both scaled by the field there.
export function gravityStep(t, r, dt) {
  const f = t.grav[r.ti]; if (!(f > 0)) return;
  const G = GRAVITY, s = r.ship, N = t.nrm[r.ti], hgt = r.ly + t.h[r.ti], vn = s.vel.dot(N);
  let a = -G.g;
  if (hgt < G.ride) a += G.k * (G.ride - hgt);
  if (hgt < G.ride + G.band) a -= G.c * vn * Math.min(1, (G.ride + G.band - hgt) / G.band);
  s.vel.addScaled(N, a * f * dt);
}
