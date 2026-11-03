// GALACTIC RUSH V8 server — course selection for tournament stages. The server picks; the games only load what it
// sends, so every pilot races the same course. Each stage gets its own random pick from the eligible courses; a course
// already raced in the tournament is not picked again while another eligible course is left.
import { randomInt } from 'node:crypto';
import { TRACK_DEFS } from '../src/sim/tracks.js';

export const ALL_TRACKS = Object.freeze(TRACK_DEFS.map(d => d.id));
export const cryptoRng = n => randomInt(n); // uniform integer in [0, n)

// eligible: course ids; rng(n) -> integer in [0, n)
export function createMapPicker({ eligible = ALL_TRACKS, rng = cryptoRng } = {}) {
  const list = eligible.filter(id => ALL_TRACKS.includes(id));
  if (!list.length) throw new Error('no eligible courses');
  return {
    eligible: list,
    pick(exclude = []) {
      const fresh = list.filter(id => !exclude.includes(id)), pool = fresh.length ? fresh : list;
      return pool[rng(pool.length)];
    },
  };
}
