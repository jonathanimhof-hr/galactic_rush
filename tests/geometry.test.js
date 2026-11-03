// V5 geometry and visibility checks that run without a browser: gameplay-rock silhouettes against their collision
// radius at both levels of detail, lite levels keeping the full silhouette, hero facade relief staying on its
// facades, and the software occlusion test on a constructed scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, MEGA, rockGeo } from '../src/render/courses/belt.js';
import { ARCH, heroRelief } from '../src/render/courses/citygen.js';
import { buildCarrier } from '../src/render/props.js';
import { buildWarden, buildAtlas } from '../src/render/capital.js';
import { Geo } from '../src/render/geo.js';
import { Occlusion } from '../src/render/lod.js';
import { Vec3 } from '../src/math.js';

const radii = geo => { let lo = Infinity, hi = 0; const p = geo.p; for (let k = 0; k < p.length; k += 3) { const r = Math.hypot(p[k], p[k + 1], p[k + 2]); lo = Math.min(lo, r); hi = Math.max(hi, r); } return [lo, hi]; };

test('gameplay rocks stay within 0.93..1.05 of the collision radius at both levels of detail', () => {
  VARIANTS.forEach((v, s) => { for (const d of [3, 2]) { const [lo, hi] = radii(rockGeo(v, d, s * 17.3 + 2));
    assert.ok(lo >= 0.93 - 1e-6 && hi <= 1.05 + 1e-6, `variant ${s} (${v.fam}) detail ${d}: ${lo.toFixed(4)}..${hi.toFixed(4)}`); } });
  for (const d of [4, 3]) { const [lo, hi] = radii(rockGeo(MEGA, d, 91, 0.94, 1.05)); assert.ok(lo >= 0.94 - 1e-6 && hi <= 1.05 + 1e-6, `mega detail ${d}: ${lo}..${hi}`); }
});

const bounds = g => g.bounds();
test('every lite building level keeps its full level\'s silhouette box', () => {
  for (const [k, a] of Object.entries(ARCH)) { const F = new Geo(), L = new Geo(); a.b(F, false); a.b(L, true); const f = bounds(F), l = bounds(L);
    for (const ax of ['x', 'y', 'z']) { assert.ok(Math.abs(f.min[ax] - l.min[ax]) < 0.03 && Math.abs(f.max[ax] - l.max[ax]) < 0.03, `${k} ${ax}: full ${f.min[ax].toFixed(3)}..${f.max[ax].toFixed(3)} lite ${l.min[ax].toFixed(3)}..${l.max[ax].toFixed(3)}`); } }
});

test('the lite carrier keeps the full carrier\'s silhouette box', () => {
  const g = new Geo(), f = (() => { const o = buildCarrier(); return o; })(), l = buildCarrier(1400, true);
  const bb = d => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let k = 0; k < d.pos.length; k += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], d.pos[k + a]); hi[a] = Math.max(hi[a], d.pos[k + a]); } return [lo, hi]; };
  const [fl, fh] = bb(f), [ll, lh] = bb(l); void g;
  for (let a = 0; a < 3; a++) { assert.ok(Math.abs(fl[a] - ll[a]) < 0.04 * (fh[a] - fl[a]) && Math.abs(fh[a] - lh[a]) < 0.04 * (fh[a] - fl[a]), `axis ${a}: full ${fl[a]}..${fh[a]} lite ${ll[a]}..${lh[a]}`); }
  assert.ok(l.idx.length < f.idx.length * 0.5, `lite is lighter: ${l.idx.length / 3} vs ${f.idx.length / 3} triangles`);
});

test('every capital class keeps its silhouette box at all three levels of detail, each level lighter than the one before', () => {
  const bb = d => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let k = 0; k < d.pos.length; k += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], d.pos[k + a]); hi[a] = Math.max(hi[a], d.pos[k + a]); } return [lo, hi]; };
  for (const [name, build] of [['bastion', l => buildCarrier(1400, l >= 1, l >= 2)], ['warden', buildWarden], ['atlas', buildAtlas]]) {
    const L = [0, 1, 2].map(build), [fl, fh] = bb(L[0]);
    for (const l of [1, 2]) { const [ll, lh] = bb(L[l]);
      for (let a = 0; a < 3; a++) { const tol = 0.05 * (fh[a] - fl[a]); assert.ok(Math.abs(fl[a] - ll[a]) < tol && Math.abs(fh[a] - lh[a]) < tol, `${name} level ${l} axis ${a}: full ${fl[a].toFixed(1)}..${fh[a].toFixed(1)}, level ${ll[a].toFixed(1)}..${lh[a].toFixed(1)}`); }
      assert.ok(L[l].idx.length < L[l - 1].idx.length, `${name} level ${l} is lighter: ${L[l].idx.length / 3} vs ${L[l - 1].idx.length / 3} triangles`); }
  }
});

test('hero facade relief stays on its facades (at most 1.6 m proud, never above the roof band)', () => {
  const box = [-20, 20, -460, 140, -15, 15, 7], hero = { boxes: [box, [-25, 25, -460, -300, -25, 25, 5], [-30, 30, -460, -100, -30, 30, 6], [-24, 24, -460, 200, -24, 24, 8]], tint: [1, 1, 1], band: [-500, 300] };
  const g = heroRelief(hero), b = g.bounds(); assert.ok(g.i.length > 0, 'relief has geometry');
  assert.ok(b.min.x >= -30 - 1.6 - 1e-6 && b.max.x <= 30 + 1.6 + 1e-6 && b.min.z >= -30 - 1.6 - 1e-6 && b.max.z <= 30 + 1.6 + 1e-6, `x ${b.min.x}..${b.max.x} z ${b.min.z}..${b.max.z}`);
  assert.ok(b.max.y <= 200 + 0.5 && b.min.y >= -460 - 1, `y ${b.min.y}..${b.max.y}`);
});

test('software occlusion: hides only what is fully behind a solid occluder', () => {
  const O = new Occlusion(128, 72), cam = { pos: new Vec3(0, 0, 0), fwd: new Vec3(0, 0, -1), up: new Vec3(0, 1, 0), fov: 60, near: 0.5 }, gfx = { w: 960, h: 540 };
  O.begin(cam, gfx); const c = []; for (let q = 0; q < 8; q++) c.push(q & 1 ? 40 : -40, q & 2 ? 40 : -40, q & 4 ? -100 : -120); O.offer(Float32Array.from(c), 1); O.rasterize(8);
  assert.equal(O.used, 1);
  assert.equal(O.visible(0, 0, -300, 10), false, 'small sphere straight behind the wall is hidden');
  assert.equal(O.visible(0, 0, -60, 10), true, 'sphere in front of the wall is visible');
  assert.equal(O.visible(200, 0, -300, 10), true, 'sphere beside the wall is visible');
  assert.equal(O.visible(116, 0, -300, 10), true, 'sphere straddling the wall\'s silhouette edge (tan 0.4 at 300 m) is visible');
  assert.equal(O.visible(100, 0, -300, 10), false, 'sphere just inside the silhouette, behind the wall, is hidden');
  assert.equal(O.visible(0, 0, -300, 200), true, 'sphere larger than the wall is visible');
});
