// GALACTIC RUSH V11 — the visual pass over the four newer worlds (Pelagos, Ignara, Verdant Canopy, Orbital Nexus):
// materials and effects of their own, registered on the renderer next to its programs like the V9 and V10 kits (gfx.js
// is unchanged: these programs read the scene uniforms it already supplies), and geometry helpers for the detail that
// dresses their structures. Nothing here is used by the four original courses, and nothing here reads or changes the
// course data beyond its geometry: every added part is checked against the racing corridor by the builders.
import { Vec3, Quat } from '../../math.js';
import { Geo } from '../geo.js';
import { VS, LIGHT, WAVES, beam } from './v9kit.js';

// ---------------------------------------------------------------- weathered steel
// Painted steel that has lived outside: plates with seams, faded and uneven paint, rust where the paint has failed and
// runs of rust and grime streaking down from it, soot (industry: colour alpha, more toward the top of stacks), hot
// steel glowing dull red (material z above 1), and, at sea, the splash zone: dark weed and barnacles below the reach
// of the swell (the same waves as the ocean), wet steel above it and foam where the swell slaps the leg; rain leaves
// everything wet, with puddles on decks. uWx: x sea level (below -1e4: no sea), y rust, z soot, w rain.
// The shader is compiled once per use with only the parts that use needs (SEA: the splash zone, for steel that reaches
// down to the swell; WET: rain and puddles, all of Pelagos; STATION: hazard stripes, station plating and solar cells,
// Orbital Nexus; CRATE: corrugated containers), so that nothing pays per pixel for another's parts: a renderer that
// evaluates both sides of a branch (software WebGL does) would otherwise compute the ocean's swell for every pixel of
// steel on a volcano or a space station. The variants draw the same picture wherever both apply.
const METAL_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
#ifdef SEA
${WAVES}
#endif
uniform vec4 uWx; uniform vec3 uHeatC;
#ifdef STATION
/* a height field's relief as a tilt of the normal, from screen-space derivatives (as the engine's own structure shader does for its panels) */
vec3 bumpN(vec3 P, vec3 N, float h, float k){ vec3 dx = dFdx(P), dy = dFdy(P); float hx = dFdx(h)*k, hy = dFdy(h)*k; vec3 r1 = cross(dy, N), r2 = cross(N, dx); float dt = dot(dx, r1);
  return abs(dt) < 1e-14 ? N : normalize(abs(dt)*N - sign(dt)*(hx*r1 + hy*r2)); }
#endif
float seams(vec2 p, vec2 cell, float lw){ vec2 q = p/cell, f = abs(fract(q) - .5), w = fwidth(q) + 1e-4; vec2 s = smoothstep(vec2(.5 - lw) - w, vec2(.5 - lw), f); return max(s.x, s.y)*(1. - smoothstep(.1, .28, max(w.x, w.y))); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n0, gn) < 0.) n0 = -n0;
  float fw = length(fwidth(vW)); vec3 an = abs(n0);
  bool isFlat = an.y > max(an.x, an.z); vec2 pl = isFlat ? vW.xz : an.x > an.z ? vW.zy : vW.xy;
  float k1 = 1. - smoothstep(.3, 1.2, fw*.08), k2 = 1. - smoothstep(.3, 1.2, fw*.45), k3 = 1. - smoothstep(.3, 1.2, fw*1.6);
  vec4 N1 = texture(uNoise, vW*.08 + vec3(.13, .37, .71)), N3 = texture(uNoise, vW*1.6 + .31);
#ifdef STATION
  vec4 N2 = vec4(N1.b, .45, .5, .5); /* no rust runs or soot streaks to speak of on a station kept clean: their field stays at its mean, one lookup less */
#else
  vec4 N2 = texture(uNoise, vec3(vW.x*.45, vW.y*.05, vW.z*.45) + .57);
#endif
  float big = mix(.5, N1.r, k1), run = mix(.45, N2.g, k2), grain = mix(.5, N3.r, k3);
  vec3 alb = vC.rgb*(.8 + .4*mix(.5, N1.a, k1));
  /* plates: a grid on decks and flat walls; on curved walls (legs, tanks) the welded rings only, so the grid never turns with the projection */
  float s = (isFlat ? seams(pl, vec2(3.2, 2.4), .022) : max(seams(vec2(vW.y, 0.), vec2(2.4, 1e4), .03), seams(pl, vec2(3.2, 1e4), .022)*step(.97, max(an.x, an.z))))*k2;
  float rust = smoothstep(.66, .8, big + (grain - .5)*.3 + (N2.b - .5)*.2)*uWx.y;
  float runs = smoothstep(.58, .82, run)*smoothstep(.35, .6, big)*uWx.y*step(an.y, .7);
  vec3 rustC = mix(vec3(.22, .085, .035), vec3(.4, .19, .075), N3.g)*(.8 + .4*grain);
  float tone = h21(floor(pl/vec2(3.2, 2.4)) + floor(vW.y*.1)*7.); alb *= .9 + .2*tone*k2; /* each plate its own tone */
  float det = vM.w, rough = vM.y, metal = vM.x*.3; /* paint is not metal: painted steel reflects as a dielectric */
#ifdef STATION
  if (det > 17.5 && det < 18.5) metal = vM.x; /* station plating is bare metal */
  if (det > 16.5 && det < 17.5) { float sq = (pl.x + pl.y)*.6, fs = fwidth(sq) + 1e-4, st = smoothstep(.5 - fs, .5 + fs, abs(fract(sq) - .5)*2.); alb = mix(vec3(.85, .62, .07), vec3(.035, .033, .03), st*(1. - smoothstep(.3, .6, fs))); rough = .6; metal = .1; } /* hazard stripes */
  if (det > 17.5 && det < 18.5) { float s2 = seams(pl + 1.6, vec2(1.6, 1.2), .03)*k3; alb *= 1. - s2*.3; vec2 bq = fract(pl/vec2(1.6, 1.2)) - .5; float bolt = (1. - smoothstep(.02, .035, length(abs(bq) - vec2(.44, .42))))*k3; alb = mix(alb, alb*1.6 + .04, bolt*.4); rough -= bolt*.2;
    /* station plating is bare metal at three scales: big panels of clearly different tone and finish (some dull, some polished enough to carry the lamps), the plates inside them, the sub-panels inside those; grime in broad patches; and every seam pressed into the surface so that its edges catch the light */
    float tb = h21(floor(pl/vec2(12.8, 9.6)) + 31.7), sb = seams(pl, vec2(12.8, 9.6), .009)*k1; /* the big panels the plates are hung in: four plates by four */
    alb *= mix(1., .6 + .75*tb, k1)*mix(1., (.8 + .36*tone)/(.9 + .2*tone), k2)*(.82 + .36*big)*(1. - sb*.5);
    rough = clamp(rough + (fract(tb*7.31) - .5)*.5*k1 + ((fract(tone*5.17) - .5)*.2 + (big - .5)*.2)*k2, .14, 1.);
    alb *= 1. + s*.3; /* (plate seams on the station are shallow: most of their darkening is taken back, the relief below shows them) */
    n0 = bumpN(vW, n0, 1. - s*.45 - sb*1.3 + big*.25, .32); } /* station plating: big panels, plates, sub-panels and their bolts */
  if (det > 18.5 && det < 19.5) { vec2 cq = pl/.5, cf = abs(fract(cq) - .5), cw2 = fwidth(cq); float cell = 1. - max(smoothstep(.44 - cw2.x, .44, cf.x), smoothstep(.44 - cw2.y, .44, cf.y))*(1. - smoothstep(.2, .5, max(cw2.x, cw2.y)));
    alb = mix(vec3(.55, .57, .6), vec3(.02, .035, .08)*(.8 + .4*h21(floor(cq))), cell); rough = mix(.35, .12, cell); metal = mix(.8, .3, cell); } /* solar cells */
#endif
  alb = mix(alb, alb*vec3(.64, .53, .46), runs*.75); alb = mix(alb, rustC, rust); alb *= 1. - s*.45;
  rough = mix(rough, .9, rust)*(.95 + .1*grain); metal = metal*(1. - rust)*(1. - runs*.5);
#ifdef CRATE
  if (vM.w > 15.5 && vM.w < 16.5) { float u = an.x > an.z ? vW.z : vW.x; float cor = sin(u*2.6)*(1. - smoothstep(.25, .7, fw*2.6))*step(an.y, .5); n0 = normalize(n0 + (an.x > an.z ? vec3(0., 0., 1.) : vec3(1., 0., 0.))*cor*.35); }
#endif
  float soot = clamp(vC.a*1.3*(.6 + .6*run) + smoothstep(.62, .9, N1.g)*.4, 0., 1.)*uWx.z;
  alb = mix(alb, vec3(.024, .021, .019), soot*.88); rough = mix(rough, .95, soot);
#if defined(SEA) || defined(WET)
  float wet = uWx.w*(.3 + .7*max(n0.y, 0.));
#ifdef SEA
  float foam = 0.;
  if (vW.y < uWx.x + 9.) { vec3 nw; float cr; vec3 d = waves(vW.xz, uTime, 1. - smoothstep(500., 1500., length(uCam.xz - vW.xz)), nw, cr);
    float h = vW.y - uWx.x - d.y, weed = 1. - smoothstep(-.5, .8 + (N1.b - .5)*1.6, h);
    alb = mix(alb, mix(vec3(.035, .045, .028), vec3(.12, .1, .07), N3.b)*(.7 + .6*grain), weed*.92); rough = mix(rough, .45, weed); metal *= 1. - weed;
    wet = max(wet, 1. - smoothstep(0., 4.5 + N1.g*2., h));
    foam = (1. - smoothstep(0., .5 + .6*N3.a, abs(h - .15)))*smoothstep(.3, .6, N2.r)*k2; }
#endif
  alb *= 1. - wet*.3; rough = mix(rough, .14, wet*.65*(1. - rust*.5));
  float pud = smoothstep(.62, .72, N1.b)*smoothstep(.85, .95, n0.y)*uWx.w; rough = mix(rough, .05, pud); alb *= 1. - pud*.25;
#endif
  vec3 n = normalize(n0 + (N3.rgb - .5)*.18*k3*(.4 + rust) + (N1.rgb - .5)*.08*k1);
  vec3 col = lit(alb, clamp(rough, .04, 1.), clamp(metal, 0., 1.), n, v, vW, (1. - s*.5)*(.8 + .2*big));
#ifdef SEA
  col = mix(col, vec3(.8, .85, .88)*(textureLod(uEnv, vec3(0., 1., 0.), 4.).rgb*uEnvInt + uSunCol*max(uSunDir.y, 0.)*.3), foam*.8);
#endif
  float heat = clamp(vM.z - 1., 0., 1.)*(.65 + .35*N2.r)*(1. - soot*.5); col += uHeatC*heat*heat*(.7 + .3*sin(uTime*1.3 + N1.g*12.));
  o = vec4(fogged(col, vW, heat), 1.); }`;

// ---------------------------------------------------------------- Pelagos coast
// Island rock: dark weathered stone with strata on the cliffs, grass and heather on gentler ground above the spray,
// pale lichen; at the waterline (the ocean's own waves) wet black rock, weed and a line of surf. uWx.x: sea level.
const COAST_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
${WAVES}
uniform vec4 uWx;
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n0, gn) < 0.) n0 = -n0;
  float fw = length(fwidth(vW)), slope = 1. - n0.y;
  float k1 = 1. - smoothstep(.3, 1.2, fw*.03), k2 = 1. - smoothstep(.3, 1.2, fw*.21), k3 = 1. - smoothstep(.3, 1.2, fw*.9);
  vec4 A = texture(uNoise, vW*.03 + .21), B = texture(uNoise, vW*.21 + .47), C = texture(uNoise, vec3(vW.x*.06, vW.y*.45, vW.z*.06) + .73);
  vec3 rock = vec3(.16, .155, .15)*(.65 + .7*mix(.5, A.r, k1))*(.9 + .2*mix(.5, B.g, k2));
  float strata = smoothstep(.42, .58, mix(.5, C.g, k2))*smoothstep(.35, .55, slope); rock *= 1. - strata*.3; rock = mix(rock, rock*vec3(1.25, 1.05, .85), smoothstep(.6, .8, A.b)*.5);
  float above = vW.y - uWx.x;
  float grassK = smoothstep(.5, .25, slope + (A.g - .5)*.35)*smoothstep(5., 14., above + (B.r - .5)*8.);
  vec3 grass = mix(vec3(.05, .08, .035), vec3(.13, .12, .07), smoothstep(.3, .7, A.b))*(.8 + .4*mix(.5, A.r, k1))*(.92 + .16*mix(.5, B.r, k2));
  vec3 alb = mix(rock, grass, grassK);
  alb = mix(alb, vec3(.4, .4, .36), smoothstep(.78, .88, B.a)*k3*(1. - grassK)*.45);
  float rough = mix(.88, .95, grassK), foam = 0., wet = 0.;
  if (above < 12.) { vec3 nw; float cr; vec3 d = waves(vW.xz, uTime, 1. - smoothstep(500., 1500., length(uCam.xz - vW.xz)), nw, cr);
    float h = above - d.y, weed = 1. - smoothstep(-.4, .9 + (A.g - .5)*1.4, h);
    alb = mix(alb, vec3(.04, .05, .03)*(.7 + .6*B.b), weed*.9); wet = 1. - smoothstep(.5, 4. + B.r*2.5, h);
    foam = (1. - smoothstep(0., .7 + .8*B.a, abs(h - .2)))*smoothstep(.25, .6, A.a + (B.g - .5)*.5)*k1; }
  alb *= 1. - wet*.45; rough = mix(rough, .2, wet*.8);
  vec3 n = normalize(n0 + (vec3(B.r, B.g, B.b) - .5)*.5*k2*(1. - grassK*.5) + (vec3(A.r, A.g, A.b) - .5)*.35*k1);
  vec3 col = lit(alb, rough, 0., n, v, vW, .75 + .25*A.r);
  col = mix(col, vec3(.8, .85, .88)*(textureLod(uEnv, vec3(0., 1., 0.), 4.).rgb*uEnvInt + uSunCol*max(uSunDir.y, 0.)*.3), clamp(foam, 0., 1.)*.85);
  o = vec4(fogged(col, vW, 0.), 1.); }`;

// ---------------------------------------------------------------- rain curtains (premultiplied alpha)
// Veils of rain hanging from the cloud base: streaks falling, uneven along the curtain, faded at the cloud base, the
// sea and the silhouette; colour alpha = height (0 at the sea, 1 at the cloud base), material y = position round it.
const RAIN_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam, uSunDir, uSunCol, uFogCol; uniform float uTime, uEnvInt; uniform highp sampler3D uNoise; uniform samplerCube uEnv; uniform vec4 uRainK;
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); float edge = abs(dot(n, v)), h = vC.a;
  float veil = texture(uNoise, vec3(vM.y*1.4 + .2, h*.35 - uTime*.01, .63)).r, streak = texture(uNoise, vec3(vM.y*22., h*1.5 - uTime*.31, .17)).g;
  float a = smoothstep(.15, .8, edge)*smoothstep(0., .3, h)*smoothstep(1., .5, h)*smoothstep(.3, .78, veil + (1. - h)*.15)*(.75 + .25*streak)*uRainK.x;
  float d = length(uCam - vW), far = 1. - smoothstep(uRainK.y, uRainK.z, d);
  vec3 col = mix(uFogCol, textureLod(uEnv, vec3(0., 1., 0.), 4.).rgb*uEnvInt*.5, .4)*(.9 + .2*streak);
  a *= far; o = vec4(col*a, a); }`;

// ---------------------------------------------------------------- light beams (additive)
// Cones of light from floodlights and lamps, seen in rain, dust or haze: brightest seen across the beam and near the
// lamp, faded toward its end (colour alpha: 0 at the lamp, 1 at the end), never in the camera's face; uBeam.y > 0 adds
// rain falling through the light, uBeam.z > 0 drifting dust.
const BEAM_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform float uTime; uniform highp sampler3D uNoise; uniform vec4 uBeam;
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); float f = pow(abs(dot(n, v)), 1.6), h = vC.a;
  float fade = (1. - h)*(1. - h)*smoothstep(0., .04, h), d = length(uCam - vW), near = smoothstep(3., 25., d)*(1. - smoothstep(uBeam.w*.6, uBeam.w, d));
  float tex = 1.; if (uBeam.y > 0.) tex += (texture(uNoise, vec3(vW.x*.35, vW.y*.04 + uTime*1.4, vW.z*.35)).r - .5)*uBeam.y*1.6;
  if (uBeam.z > 0.) tex += (texture(uNoise, vW*.05 + vec3(uTime*.01, uTime*.02, 0.)).g - .5)*uBeam.z*1.4;
  o = vec4(vC.rgb*uBeam.x*f*fade*near*max(tex, 0.), 1.); }`;

// ---------------------------------------------------------------- energy shields (additive)
// A containment field: a hexagonal lattice over the shell (in its own coordinates), cells lighting up as waves of
// energy pass over it, a bright rim toward the silhouette and cells that flicker. uShield: x intensity, y cells, z speed.
const SHIELD_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform float uTime; uniform highp sampler3D uNoise; uniform vec4 uShield;
float hexD(vec2 p){ p = abs(p); return max(dot(p, vec2(.5, .866)), p.x); }
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); float rim = pow(1. - abs(dot(n, v)), 2.5);
  vec3 q = normalize(vL); vec2 uv = vec2(atan(q.z, q.x)/3.14159*uShield.y, asin(clamp(q.y, -1., 1.))/1.5708*uShield.y*.6);
  vec2 r = vec2(1., 1.732), h = r*.5, a = mod(uv, r) - h, b = mod(uv - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b, id = uv - g;
  float fw = length(fwidth(uv)), border = smoothstep(.44 - fw, .5, hexD(g))*(1. - smoothstep(.15, .4, fw));
  float wave = pow(sin(dot(id, vec2(.31, .47)) - uTime*uShield.z)*.5 + .5, 3.), flick = smoothstep(.8, .95, texture(uNoise, vec3(id*.07, uTime*.15)).r);
  o = vec4(vC.rgb*(border*(.25 + .75*wave) + rim*.7 + flick*.35*(1. - border))*uShield.x, 1.); }`;

// ---------------------------------------------------------------- detail by what a pixel can still show
// Layers of fine geometry (railings, ladders, lacing, pipes) are drawn only while a feature of `size` metres at the
// nearest point of the item's bounds still covers about `px` pixels, with the preset's LOD bias counted in and some
// hysteresis: beyond that the layer is thousands of triangles thinner than a pixel, which cost time and only shimmer.
export class DetailLOD {
  constructor() { this.L = []; }
  add(items, size, px = 0.6) { for (const it of items) if (it.bs) this.L.push({ it, size, px, on: true }); return items; }
  update(fr) { if (!(fr.bias > 0)) { for (const e of this.L) e.it.visible = e.on = true; return; } const c = fr.cam.pos, k = fr.k / fr.bias;
    for (const e of this.L) { const b = e.it.bs, d = Math.max(1, Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) - b.r), p = e.size * k / d; e.on = e.on ? p > e.px * 0.85 : p > e.px; e.it.visible = e.on; } }
}
// v9kit's box truss in two layers: the four chords, which carry its outline at any distance, into g; the battens and
// diagonals between them into gm (a detail layer). Together they are the same boxes truss() makes. M: the material.
const UPV = new Vec3(0, 1, 0), X1V = new Vec3(1, 0, 0);
export function trussLOD(g, gm, M, a, b, size, bay, col, up = UPV) {
  g.mat(...M); gm.mat(...M);
  const d = new Vec3().subVectors(b, a), L = d.len(), z = d.clone().scale(1 / L), x = new Vec3().crossVectors(Math.abs(z.dot(up)) > 0.98 ? X1V : up, z).normalize(), y = new Vec3().crossVectors(z, x);
  const h = size / 2, cs = Math.max(0.25, size * 0.07), C = [[-h, -h], [h, -h], [h, h], [-h, h]], P = (s, cx, cy) => a.clone().addScaled(z, s).addScaled(x, cx).addScaled(y, cy);
  for (const [cx, cy] of C) beam(g, P(0, cx, cy), P(L, cx, cy), cs, cs, col);
  const n = Math.max(1, Math.round(L / bay));
  for (let k = 0; k <= n; k++) { const s2 = L * k / n; for (let e = 0; e < 4; e++) { const [ax, ay] = C[e], [bx, by] = C[(e + 1) % 4]; beam(gm, P(s2, ax, ay), P(s2, bx, by), cs * 0.8, cs * 0.8, col);
    if (k < n) { const s3 = L * (k + 1) / n; beam(gm, P(k % 2 ? s2 : s3, ax, ay), P(k % 2 ? s3 : s2, bx, by), cs * 0.6, cs * 0.6, col); } } }
}
// The triangles of a Geo for which pick(a, b, c) holds (vertex numbers) and the rest, as two Geos
export function splitGeo(g, pick) {
  const out = [new Geo(), new Geo()], maps = [new Map(), new Map()];
  for (let t = 0; t < g.i.length; t += 3) { const k = pick(g.i[t], g.i[t + 1], g.i[t + 2]) ? 0 : 1, G = out[k], M = maps[k];
    for (let e = 0; e < 3; e++) { const v = g.i[t + e]; let j = M.get(v);
      if (j === undefined) { j = G.p.length / 3; M.set(v, j); G.p.push(g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]); G.n.push(g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]); G.c.push(g.c[v * 4], g.c[v * 4 + 1], g.c[v * 4 + 2], g.c[v * 4 + 3]); G.m.push(g.m[v * 4], g.m[v * 4 + 1], g.m[v * 4 + 2], g.m[v * 4 + 3]); }
      G.i.push(j); } }
  return out; }
// A Geo cut into square cells of `cell` metres (by the first corner of each triangle), as items with bounds of their
// own: what lies outside the view or beyond its range is then not drawn at all
export function cellItems(gfx, g, cell, opts) { const cells = new Map();
  for (let t = 0; t < g.i.length; t += 3) { const v0 = g.i[t], key = Math.floor(g.p[v0 * 3] / cell) + ',' + Math.floor(g.p[v0 * 3 + 2] / cell); let c = cells.get(key); if (!c) cells.set(key, c = { G: new Geo(), M: new Map() });
    for (let e = 0; e < 3; e++) { const v = g.i[t + e]; let j = c.M.get(v);
      if (j === undefined) { const G = c.G; j = G.p.length / 3; c.M.set(v, j); G.p.push(g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]); G.n.push(g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]); G.c.push(g.c[v * 4], g.c[v * 4 + 1], g.c[v * 4 + 2], g.c[v * 4 + 3]); G.m.push(g.m[v * 4], g.m[v * 4 + 1], g.m[v * 4 + 2], g.m[v * 4 + 3]); }
      c.G.i.push(j); } }
  return [...cells.values()].map(({ G }) => { const b = G.bounds(); return { mesh: gfx.mesh(G.build()), visible: true, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r }, ...opts }; }); }
// Pelagos steel as items: the triangles that reach down into the splash zone of the shader (within 9.5 m of sea level;
// top: that height in the Geo's own coordinates) are drawn with the sea variant, everything above with the wet variant,
// which draws the same picture there without working out the swell for every pixel
export function seaSteel(gfx, g, top, opts) { const [lo, hi] = splitGeo(g, (a, b, c) => Math.min(g.p[a * 3 + 1], g.p[b * 3 + 1], g.p[c * 3 + 1]) < top), out = [];
  if (lo.i.length) out.push({ mesh: gfx.mesh(lo.build()), prog: 'v11metal', ...opts }); if (hi.i.length) out.push({ mesh: gfx.mesh(hi.build()), prog: 'v11metalWet', ...opts }); return out; }
// the same for the chunks of a Chunks set under one key (each chunk keeps its own bounds)
export function seaSteelChunks(gfx, ch, key, top, opts) { const out = [];
  for (const v of ch.m.values()) { if (v.key !== key || !v.geo.i.length) continue; const b = v.geo.bounds(); out.push(...seaSteel(gfx, v.geo, top, { visible: true, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r }, ...opts })); }
  return out; }
// a shader compiled with some of its parts switched on
const variant = (fs, ...defs) => fs.replace('#version 300 es\n', '#version 300 es\n' + defs.map(d => `#define ${d}\n`).join(''));
export function ensureV11Programs(gfx) {
  if (gfx.P.v11metal) return gfx.P;
  gfx.P.v11metal = gfx.prog(VS, variant(METAL_FS, 'SEA', 'CRATE')); gfx.P.v11metalWet = gfx.prog(VS, variant(METAL_FS, 'WET', 'CRATE')); // Pelagos: steel that reaches the swell, and everything above it
  gfx.P.v11metalDry = gfx.prog(VS, METAL_FS); gfx.P.v11metalStn = gfx.prog(VS, variant(METAL_FS, 'STATION', 'CRATE', 'NOFOGH')); // Ignara; Orbital Nexus
  gfx.P.v11coast = gfx.prog(VS, COAST_FS); gfx.P.v11rain = gfx.prog(VS, RAIN_FS); gfx.P.v11beam = gfx.prog(VS, BEAM_FS); gfx.P.v11shield = gfx.prog(VS, SHIELD_FS);
  return gfx.P;
}

// ---------------------------------------------------------------- geometry helpers
const UP = new Vec3(0, 1, 0), X1 = new Vec3(1, 0, 0);
// A Geo split into cells by position: every primitive goes into the cell that holds the point it is placed at, so each
// cell becomes its own item with bounds the renderer can cull (and leave out of the shadow pass when far). Parts marked
// as detail (detail(true) ... detail(false)) go into cells of their own, drawn only within `detailDist` metres. It takes
// the Geo calls the builders and the helpers here use (mat, at, box, bbox, cyl, lathe, torus, plate, sphere).
export class CellGeo {
  constructor(cell = 350) { this.cell = cell; this.cells = new Map(); this.M = [0, 0.6, 1, 0]; this.cur = null; this.det = false; }
  _g(x, z) { const k = (this.det ? 'd' : 'm') + Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); let g = this.cells.get(k); if (!g) { g = new Geo(); g.det = this.det; this.cells.set(k, g); } return g; }
  detail(on) { this.det = !!on; return this; }
  mat(m, r, e = 1, d = 0) { this.M = [m, r, e, d]; return this; }
  at(x = 0, y = 0, z = 0, q = null, sx = 1, sy = sx, sz = sx) { this.cur = this._g(x, z); this.cur.M = this.M.slice(); this.cur.at(x, y, z, q, sx, sy, sz); return this; }
  box(...a) { this.cur.box(...a); return this; }
  bbox(...a) { this.cur.bbox(...a); return this; }
  cyl(...a) { this.cur.cyl(...a); return this; }
  lathe(...a) { this.cur.lathe(...a); return this; }
  torus(...a) { this.cur.torus(...a); return this; }
  plate(...a) { this.cur.plate(...a); return this; }
  sphere(...a) { this.cur.sphere(...a); return this; }
  get i() { let n = []; for (const g of this.cells.values()) n = n.concat(g.i.length ? [1] : []); return n; }
  items(gfx, opts = {}, detailDist = 1500) { const out = [];
    for (const g of this.cells.values()) { if (!g.i.length) continue; const b = g.bounds(); out.push({ mesh: gfx.mesh(g.build()), visible: true, bs: { x: b.c.x, y: b.c.y, z: b.c.z, r: b.r }, ...opts, ...(g.det ? { maxDist: detailDist } : {}) }); }
    return out; }
}
// A builder's accumulators (Geo, Chunks, CellGeo) are used by the helper functions of its scope, and that scope lives
// as long as the course does (its update and cull belong to it): their vertex lists, tens of megabytes of numbers
// that nothing reads again once the meshes are made, would stay in memory with it. The builder empties them at its end.
export function release(...accs) {
  for (const a of accs) {
    if (!a) continue;
    if (a instanceof Geo) a.p.length = a.n.length = a.c.length = a.m.length = a.i.length = 0;
    else if (a.cells instanceof Map) { for (const g of a.cells.values()) release(g); a.cells.clear(); a.cur = null; }
    else if (a.m instanceof Map) { for (const v of a.m.values()) release(v.geo); a.m.clear(); }
    else if (Array.isArray(a)) release(...a);
  }
}
const v3 = (x, y, z) => new Vec3(x, y, z);
// rotation taking +Z to direction d (+Y toward up as far as possible)
export function qDir(d, up = UP) { const z = d.clone().normalize(), x = new Vec3().crossVectors(Math.abs(z.dot(up)) > 0.98 ? X1 : up, z).normalize(), y = new Vec3().crossVectors(z, x); return new Quat().fromBasis(x, y, z); }
// a box spanning two points (cross-section sx x sy)
export function bar(g, a, b, sx, sy, col) { const d = new Vec3().subVectors(b, a), L = d.len(); if (L < 1e-4) return g; g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, qDir(d)).box(sx, sy, L, col); return g; }
// a round pipe between two points
export function pipe(g, a, b, r, col, seg = 8) { const d = new Vec3().subVectors(b, a), L = d.len(); if (L < 1e-4) return g; g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, qDir(d)).cyl(r, r, L, seg, col, false); return g; }
// a guard rail along a polyline: posts every `step` metres, a hand rail and a knee rail
export function railing(g, pts, h = 1.1, step = 2.4, col = [0.78, 0.62, 0.14, 0], closed = false) {
  const n = pts.length, segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) { const a = pts[k], b = pts[(k + 1) % n], L = a.dist(b), m = Math.max(1, Math.round(L / step));
    for (let j = 0; j < m; j++) { const p = new Vec3().lerpVectors(a, b, j / m); g.at(p.x, p.y + h / 2, p.z).box(0.09, h, 0.09, col); }
    for (const y of [h, h * 0.5]) bar(g, v3(a.x, a.y + y, a.z), v3(b.x, b.y + y, b.z), 0.07, 0.07, col); }
  if (!closed) { const p = pts[n - 1]; g.at(p.x, p.y + h / 2, p.z).box(0.09, h, 0.09, col); }
  return g;
}
// a straight stair from a (bottom) to b (top), w wide: two stringers and level treads
export function stair(g, a, b, w, col) {
  const d = new Vec3().subVectors(b, a), L = d.len(), q = qDir(d), side = new Vec3(1, 0, 0).applyQuat(q), hz = v3(d.x, 0, d.z), qt = qDir(hz.lenSq() > 1e-6 ? hz : v3(0, 0, 1)), n = Math.max(2, Math.round(Math.abs(d.y) / 0.3));
  for (const s of [-1, 1]) bar(g, a.clone().addScaled(side, s * w / 2), b.clone().addScaled(side, s * w / 2), 0.08, 0.3, col);
  for (let k = 1; k < n; k++) { const p = new Vec3().lerpVectors(a, b, k / n); g.at(p.x, p.y, p.z, qt).box(w, 0.05, Math.min(0.32, hz.len() / n + 0.05), col); }
  return g;
}
// a ladder from a (bottom) to b (top) with rungs every 0.3 m; `side` is the direction across it
export function ladder(g, a, b, w, side, col) {
  const s = side.clone().normalize(), n = Math.max(2, Math.round(a.dist(b) / 0.3));
  for (const k of [-1, 1]) bar(g, a.clone().addScaled(s, k * w / 2), b.clone().addScaled(s, k * w / 2), 0.07, 0.07, col);
  for (let k = 1; k < n; k++) { const p = new Vec3().lerpVectors(a, b, k / n); bar(g, p.clone().addScaled(s, -w / 2), p.clone().addScaled(s, w / 2), 0.045, 0.045, col); }
  return g;
}
// a lattice mast (three legs, battens and diagonals) from base p, height h, base width w tapering to w*t
export function lattice(g, p, h, w, col, t = 0.4, bay = 4) {
  const legs = [0, 1, 2].map(k => { const a = k / 3 * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }), P = (k, u) => { const r = w * (1 - (1 - t) * u) / 1.7; return v3(p.x + legs[k][0] * r, p.y + h * u, p.z + legs[k][1] * r); };
  const nb = Math.max(1, Math.round(h / bay));
  for (let k = 0; k < 3; k++) { bar(g, P(k, 0), P(k, 1), 0.18, 0.18, col);
    for (let j = 0; j < nb; j++) { const u0 = j / nb, u1 = (j + 1) / nb; bar(g, P(k, u1), P((k + 1) % 3, u1), 0.1, 0.1, col); bar(g, P(k, u0), P((k + 1) % 3, u1), 0.08, 0.08, col); } }
  return g;
}
// a light cone for the beam shader: apex at p along dir, length L, end radius R; colour alpha runs 0 (lamp) to 1 (end)
export function beamCone(g, p, dir, L, R, col, seg = 10, r0 = 0.3) {
  const q = qDir(dir), rows = [];
  for (const [u, r] of [[0, r0], [1, R]]) { const row = []; for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nn = new Vec3(c, s, 0).applyQuat(q), pp = new Vec3(c * r, s * r, u * L).applyQuat(q).add(p);
    row.push(g.raw(pp, nn, [col[0], col[1], col[2], u])); } rows.push(row); }
  for (let k = 0; k < seg; k++) g.quad(rows[0][k], rows[1][k], rows[1][k + 1], rows[0][k + 1]);
  return g;
}
// a rain curtain: an open cylinder of radius r from y0 to y1 round (x, z), for the rain shader
export function curtain(g, x, z, r, y0, y1, seg = 20) {
  const rows = [];
  for (const u of [0, 0.25, 0.5, 0.75, 1]) { const row = []; for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, wob = 1 + 0.18 * Math.sin(a * 3 + x * 0.001) + 0.1 * Math.sin(a * 7 + z * 0.002);
    g.M = [0, k / seg, 0, 0]; row.push(g.raw(v3(x + Math.cos(a) * r * wob * (1 + u * 0.25), y0 + (y1 - y0) * u, z + Math.sin(a) * r * wob * (1 + u * 0.25)), v3(Math.cos(a), 0, Math.sin(a)), [1, 1, 1, u])); } rows.push(row); }
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < seg; k++) g.quad(rows[j][k], rows[j + 1][k], rows[j + 1][k + 1], rows[j][k + 1]);
  return g;
}
