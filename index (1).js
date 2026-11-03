// Course builder registry. Each course module returns { items, env, update(dt, t, race, fx, cam), hexState, hexHit, light }.
const BUILDERS = {};
export function registerCourse(theme, fn) { BUILDERS[theme] = fn; }
export function buildCourse(gfx, track) {
  const fn = BUILDERS[track.def.theme];
  if (!fn) throw new Error('No course builder for ' + track.def.theme);
  return fn(gfx, track);
}
