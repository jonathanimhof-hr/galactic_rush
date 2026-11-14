// GALACTIC RUSH V10 — shared kit for the two new worlds (Verdant Canopy, Orbital Nexus): their shader programs (bark,
// foliage, forest floor and canopy, water, light shafts; reactor plasma, gravity plating, glass), registered on the
// renderer at load time next to its existing programs (gfx.js is unchanged: these programs read the scene uniforms it
// already supplies), and geometry helpers for wood, foliage and leaves. Nothing here is used by the V2–V9 courses. The
// vertex shader and the lighting block are the same as the V9 kit's (copied, so the V9 files stay untouched).
import { Vec3, Quat } from '../../math.js';
import { Geo } from '../geo.js';

// ---------------------------------------------------------------- shaders
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=8) in vec4 aMat;
layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aICol;
uniform mat4 uModel, uVP;
out vec3 vN; out vec3 vW; out vec4 vC; out vec4 vM; out vec3 vL;
void main(){ mat4 m = uModel*mat4(aI0, aI1, aI2, aI3); vec4 w = m*vec4(aPos, 1.); vW = w.xyz; vL = aPos; vN = mat3(m)*aNor; vC = aCol*vec4(aICol.rgb, 1.); vM = aMat; gl_Position = uVP*w; }`;

const LIGHT = `
uniform vec3 uCam, uSunDir, uSunCol, uFogCol; uniform float uFog, uEnvInt, uTime; uniform vec2 uFogH;
uniform samplerCube uEnv; uniform sampler2DShadow uShadow; uniform mat4 uShadowVP; uniform float uShadowOn;
uniform vec4 uPL[4]; uniform vec3 uPLc[4]; uniform int uNPL; uniform highp sampler3D uNoise;
float D_GGX(float nh, float a){ float a2 = a*a, d = nh*nh*(a2 - 1.) + 1.; return a2/(3.14159*d*d); }
// V11 (Verdant Canopy): sunlight broken by the canopy above (uDapple: x strength, y canopy top, z scale, w drift): the
// canopy over a point, followed up along the sun: open where light gets through, one lookup. Compiled only into the
// forest's own programs (DAPPLE): the station's shaders carry no trace of it.
#ifdef DAPPLE
uniform vec4 uDapple;
float dapple(vec3 W){ float below = smoothstep(uDapple.y + 20., uDapple.y - 70., W.y);
  vec2 p = (W.xz + uSunDir.xz/max(uSunDir.y, .2)*(uDapple.y - W.y))*uDapple.z + uTime*uDapple.w*vec2(.6, .4);
  vec4 N = texture(uNoise, vec3(p, .41)); return mix(1., .1 + .9*smoothstep(.5, .7, N.r*.62 + N.b*.48), below*uDapple.x); }
#else
#define dapple(W) 1.
#endif
float shadowAt(vec3 w, vec3 n){ if (uShadowOn < .5) return 1.; vec4 s = uShadowVP*vec4(w + n*.3, 1.); vec3 p = s.xyz/s.w*.5 + .5;
  float edge = max(abs(p.x - .5), abs(p.y - .5))*2.; if (edge > 1. || p.z > 1. || p.z < 0.) return 1.;
  vec2 t = 1./vec2(textureSize(uShadow, 0)); float acc = 0.;
  for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) acc += texture(uShadow, vec3(p.xy + vec2(i, j)*t*.75, p.z - .00012));
  return mix(acc*.25, 1., smoothstep(.8, 1., edge)); }
vec3 lit(vec3 alb, float rough, float metal, vec3 n, vec3 v, vec3 W, float ao){
  vec3 L = uSunDir, h = normalize(L + v); float nl = max(dot(n, L), 0.), nv = max(dot(n, v), 1e-3), nh = max(dot(n, h), 0.);
  vec3 f0 = mix(vec3(.04), alb, metal); float a = max(rough*rough, .002), k = (rough + 1.)*(rough + 1.)/8.;
  vec3 F = f0 + (1. - f0)*pow(1. - max(dot(v, h), 0.), 5.); float G = nv/(nv*(1. - k) + k)*nl/(nl*(1. - k) + k);
  vec3 spec = min(D_GGX(nh, a)*G*F/max(4.*nv*nl, 1e-3), vec3(30.))*smoothstep(0., .12, nv);
  float sh = nl > 0. ? shadowAt(W, n)*dapple(W) : 0.;
  vec3 col = ((1. - F)*(1. - metal)*alb/3.14159 + spec)*uSunCol*nl*sh*3.14159;
  for (int i = 0; i < 4; i++) { if (i >= uNPL) break; vec3 Lp = uPL[i].xyz - W; float d = length(Lp); Lp /= d; float at = clamp(1. - d/uPL[i].w, 0., 1.); at *= at;
    col += (1. - metal)*alb*uPLc[i]*max(dot(n, Lp), 0.)*at; }
  vec3 irr = textureLod(uEnv, n, 5.).rgb, pre = min(textureLod(uEnv, reflect(-v, n), rough*5.).rgb, vec3(6.));
  vec3 Fr = f0 + (max(vec3(1. - rough), f0) - f0)*pow(1. - nv, 5.);
  col += ((1. - Fr)*(1. - metal)*alb*irr + pre*Fr*(1. - rough*.7))*uEnvInt*ao;
  return col; }
vec3 fogged(vec3 col, vec3 W, float emi){ float dist = length(uCam - W), fog = 1. - exp(-uFog*uFog*dist*dist); vec3 v = normalize(uCam - W);
  if (uFogH.y > 0.) { float hc = (uCam.y - uFogH.x)/uFogH.y, hp = (W.y - uFogH.x)/uFogH.y, dh = hp - hc, od = abs(dh) > 1e-3 ? (exp(-hc) - exp(-hp))/dh : exp(-hc); fog = 1. - exp(-uFog*uFog*dist*dist*clamp(od, 0., 1.)*2.4); }
  vec3 fogC = uFogCol + uSunCol*.045*pow(max(dot(-v, uSunDir), 0.), 6.); return mix(col, fogC, fog*(1. - min(emi, 1.)*.6)); }`;

// ---------------------------------------------------------------- Verdant Canopy
// Bark: ridges and furrows that run with the grain of each piece of wood (the wood's axis travels in the material
// attribute: x = glowing fungus amount, yzw = axis), moss on the upper sides and in damp patches (more near the forest
// floor; colour alpha = moss bias), lichen flecks, and patches of glowing fungus that also make the wood easy to read
// at speed. Detail fades to its average with distance.
const BARK_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n0, gn) < 0.) n0 = -n0;
  vec3 A = vM.yzw; A = dot(A, A) > .01 ? normalize(A) : vec3(0., 1., 0.);
  float fw = length(fwidth(vW));
  vec3 q = vW - A*dot(vW, A)*.85; /* the lookup is stretched along the grain */
  float kA = 1. - smoothstep(.3, 1.2, fw*.3), kB = 1. - smoothstep(.3, 1.2, fw*1.3);
  vec4 N1 = texture(uNoise, q*.3 + vec3(.13, .29, .41)), N2 = texture(uNoise, q*1.3 + .37), N3 = texture(uNoise, vW*.045 + .71);
  float ridge = mix(.5, N1.a, kA), fine = mix(.5, N2.r, kB), plank = step(vM.x, -.5);
  float furrow = smoothstep(.42, .2, ridge)*kA; /* V11: deep furrows between the ridges of the bark */
  vec3 alb = vC.rgb*(.5 + .8*ridge)*(.85 + .3*fine)*(1. - furrow*.45);
  float runs = smoothstep(.58, .8, texture(uNoise, vec3(vW.x*.12, vW.y*.008, vW.z*.12) + .29).g)*(1. - smoothstep(-.2, .6, n0.y)); /* dark wet runs down the trunk */
  alb *= 1. - runs*.35;
  vec3 tU = cross(n0, A); tU = dot(tU, tU) > 1e-4 ? normalize(tU) : vec3(1., 0., 0.);
  vec3 n = normalize(n0 + tU*(N1.g - .5)*1.6*kA + cross(tU, n0)*(N2.g - .5)*.35*kB);
  float up = n0.y, damp = smoothstep(.3, .8, N3.r + vC.a*.5 - (vW.y - 60.)*.0012);
  float moss = clamp(smoothstep(-.15, .55, up)*.75 + damp*.55, 0., 1.)*smoothstep(.32, .62, N3.g + (N1.r - .5)*.45*kA + vC.a*.25);
  vec3 mossC = mix(vec3(.07, .18, .035), vec3(.2, .33, .06), mix(.5, N2.b, kB));
  // V11: a deck of planks (material x = -1, its axis along the deck): seams across it, each plank its own shade, less moss
#ifndef TREE /* the forest's instanced trunks and limbs carry neither planks nor glowing fungus (material x = 0): their variant leaves both out, and the fungus lookup with them, for the same picture */
  if (plank > .5) { float pu = dot(vW, A)/1.15, pf = fwidth(pu) + 1e-4, seam = (1. - smoothstep(.04, .04 + pf*1.5, abs(fract(pu) - .5)*2. - .9))*(1. - smoothstep(.3, .8, pf));
    alb *= (.8 + .4*fract(sin(floor(pu)*12.9898)*43758.5453))*(1. - seam*.6); moss *= .35; }
#endif
  alb = mix(alb, mossC, moss); n = normalize(mix(n, n0, moss*.55));
  float li = smoothstep(.8, .87, N2.a)*kB*(1. - moss); alb = mix(alb, vec3(.4, .43, .34), li*.55);
  vec3 col = lit(alb, .9 - moss*.08 - runs*.25, 0., n, v, vW, (.5 + .5*ridge)*(1. - furrow*.35));
#ifdef TREE
  float fs = 0.;
#else
  float fs = max(vM.x, 0.)*smoothstep(.7, .78, texture(uNoise, vW*.09 + .53).b)*smoothstep(.4, .58, N3.b);
  col += vec3(.12, .95, .62)*fs*1.6*(.85 + .15*sin(uTime*1.7 + N3.r*30.));
#endif
  o = vec4(fogged(col, vW, fs), 1.); }`;

// Foliage: leaf masses and leaves. The vertex shader sways them in the wind (colour alpha = sway weight, 0 where a
// leaf is attached); the fragment shader breaks the mass into leaves with two noise layers, varies the green (young,
// yellowing, blue-green), lets sunlight through from behind (material x = translucency) and shades the inside darker.
const LEAF_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=8) in vec4 aMat;
layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aICol;
uniform mat4 uModel, uVP; uniform float uTime; uniform vec4 uWindL;
out vec3 vN; out vec3 vW; out vec4 vC; out vec4 vM; out vec3 vL;
void main(){ mat4 m = uModel*mat4(aI0, aI1, aI2, aI3); vec4 w = m*vec4(aPos, 1.);
  float ph = dot(m[3].xz, vec2(.011, .017)) + aMat.y*6.283, sw = aCol.a*uWindL.x;
  w.xyz += vec3(sin(uTime*1.25 + ph + w.y*.05), sin(uTime*1.9 + ph*1.7)*.35, cos(uTime*1.05 + ph*1.3 + w.x*.04))*sw;
  vW = w.xyz; vL = aPos; vN = mat3(m)*aNor; vC = vec4(aCol.rgb*aICol.rgb, aCol.a); vM = aMat; gl_Position = uVP*w; }`;
const LEAF_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); if (dot(n0, v) < 0.) n0 = -n0;
  float fw = length(fwidth(vW)), k1 = 1. - smoothstep(.3, 1.2, fw*.45), k2 = 1. - smoothstep(.3, 1.2, fw*1.6);
  vec4 N1 = texture(uNoise, vW*.45 + vec3(.13, .5, .7)), N2 = texture(uNoise, vW*1.6 + .41), N3 = texture(uNoise, vW*.011 + .77);
  float cell = mix(.55, N2.b, k2), clump = mix(.5, N1.a, k1);
  /* sprays of leaves a few metres across: they stay visible far further than the leaves, with dark gaps between them */
  float k0 = 1. - smoothstep(.3, 1.2, fw*.07); vec4 N4 = texture(uNoise, vW*.085 + vec3(.19, .61, .07));
  float spray = mix(.5, N4.a, k0), gap = smoothstep(.6, .8, N4.b)*k0;
  vec3 alb = vC.rgb*(.55 + .75*clump)*(.75 + .4*(1. - cell))*(.6 + .75*spray)*(1. - .5*gap);
  alb = mix(alb, alb*vec3(1.45, 1.2, .5), smoothstep(.64, .82, N3.r)*.55); alb = mix(alb, alb*vec3(.72, .9, 1.15), smoothstep(.6, .8, N3.g)*.45);
  vec3 n = normalize(n0 + (vec3(N1.r, N1.g, N2.r) - .5)*1.3*k1 + (N4.rgb - .5)*1.1*k0);
  // V11: one shadow lookup serves the lit side and the light shining through; light wraps round a mass of leaves; a wet
  // sheen on the leaves; the inside of a crown darker and bluer
  float ao = (.35 + .65*clump)*(1. - .45*gap), shw = shadowAt(vW, n0)*dapple(vW);
  vec3 L = uSunDir, h = normalize(L + v); float wrap = max((dot(n, L) + .22)/1.22, 0.), sheen = pow(max(dot(n, h), 0.), 48.)*.35*(.3 + .7*clump)*(1. - gap);
  vec3 col = (alb*wrap*.95 + vec3(sheen)*vec3(.9, 1., .8))*uSunCol*shw;
  for (int i = 0; i < 4; i++) { if (i >= uNPL) break; vec3 Lp = uPL[i].xyz - vW; float d = length(Lp); Lp /= d; float at = clamp(1. - d/uPL[i].w, 0., 1.); col += alb*uPLc[i]*max(dot(n, Lp), 0.)*at*at; }
  col += alb*textureLod(uEnv, n, 5.).rgb*uEnvInt*ao*ao*mix(vec3(.72, .85, 1.08), vec3(1.), ao);
  float back = max(dot(-n0, L), 0.)*vM.x; col += alb*vec3(1.1, 1.3, .45)*uSunCol*back*shw*.34*(.5 + .5*clump);
  o = vec4(fogged(col, vW, 0.), 1.); }`;

// Ground: the forest floor (moss, leaf litter, mud and roots, wet sheen in the hollows; material x = wetness) and, with
// colour alpha = 1, the canopy of distant forests seen from above: crowns as cells with dark gaps between them, each
// crown its own green, a few in flower, lit from the sun's side; detail fades to an even forest with distance.
const GROUND_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n0, gn) < 0.) n0 = -n0;
  float fw = length(fwidth(vW));
  if (vC.a > .5) { // forest canopy
    vec2 p = vW.xz/34.; float kc = 1. - smoothstep(.25, .9, length(fwidth(p)));
    vec4 C = texture(uNoise, vec3(p*.25, .21)), D = texture(uNoise, vec3(p*.06, .63));
    float crown = mix(.55, 1. - C.b, kc), hue = C.a;
    vec3 alb = vC.rgb*mix(vec3(.75, .95, .7), vec3(1.15, 1.05, .8), hue)*(.45 + .75*crown);
    alb = mix(alb, vec3(.55, .3, .45), smoothstep(.86, .93, hue)*kc*.6); /* trees in flower */
    float tone = mix(.5, C.g, kc)*.6 + D.g*.4; alb = mix(alb, vec3(.3, .2, .04), smoothstep(.66, .74, tone)*.6); alb = mix(alb, vec3(.24, .07, .03), smoothstep(.75, .8, tone)*.55); /* V11: crowns turning gold and rust */
    alb *= .8 + .4*D.r;
    vec3 n = normalize(n0 + vec3(C.r - .5, 0., C.g - .5)*1.4*kc);
    vec3 col = lit(alb, .75, 0., n, v, vW, .4 + .6*crown);
    o = vec4(fogged(col, vW, 0.), 1.); return; }
  float kA = 1. - smoothstep(.4, 1.5, fw*.12), kB = 1. - smoothstep(.4, 1.5, fw*.6);
  vec4 A = texture(uNoise, vec3(vW.xz*.12, .19)), B = texture(uNoise, vec3(vW.xz*.6, .43)), Cc = texture(uNoise, vec3(vW.xz*.01, .87));
  float moss = smoothstep(.35, .65, Cc.r + (A.g - .5)*.4*kA)*smoothstep(.3, .0, 1. - n0.y);
  vec3 litter = vC.rgb*(.7 + .6*mix(.5, A.r, kA))*(.8 + .4*mix(.5, B.g, kB)), mossC = vec3(.06, .16, .03)*(.8 + .5*mix(.5, B.r, kB));
  litter = mix(litter, litter*vec3(1.7, .95, .45), smoothstep(.6, .8, A.b)*.55); /* V11: drifts of fallen leaves, gold and rust */
  vec3 alb = mix(litter, mossC, moss);
  float wet = vM.x*smoothstep(.55, .75, Cc.g + (A.b - .5)*.3*kA);
  alb *= 1. - wet*.35;
  vec3 n = normalize(n0 + vec3(A.r - .5, 0., A.g - .5)*.6*kA + vec3(B.g - .5, 0., B.b - .5)*.3*kB);
  vec3 col = lit(alb, mix(.92, .25, wet), 0., mix(n, n0, wet*.7), v, vW, .7 + .3*A.b);
  o = vec4(fogged(col, vW, 0.), 1.); }`;

// Falling and running water: foam streaks that run down a waterfall (colour alpha = 1) or along a stream (material yz
// = flow direction in the plane), body colour from the vertex colour, a little sky reflection, premultiplied alpha.
const WATER_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); if (dot(n0, v) < 0.) n0 = -n0;
  float fall = vC.a, fw = length(fwidth(vW)), k = 1. - smoothstep(.4, 1.5, fw*.15);
  vec3 q = fall > .5 ? vec3(vW.x*.09 + vW.z*.07, vW.y*.012 + uTime*.55, .3) : vec3(dot(vW.xz, vM.yz)*.03 - uTime*.25, dot(vW.xz, vec2(-vM.z, vM.y))*.09, .6);
  vec4 A = texture(uNoise, q), B = texture(uNoise, q*vec3(2.3, 1.7, 1.) + .5);
  float foam = mix(.5, smoothstep(.45, .8, A.r*.7 + B.g*.5), k)*(fall > .5 ? 1. : .55);
  vec3 sky = textureLod(uEnv, reflect(-v, n0), 2.).rgb*uEnvInt, F = vec3(.02 + .98*pow(1. - max(dot(n0, v), 0.), 5.));
  vec3 body = vC.rgb*(.4 + .6*max(uSunDir.y, 0.)), foamC = vec3(.75, .82, .85)*(uSunCol*max(uSunDir.y, .1)*.3 + textureLod(uEnv, vec3(0., 1., 0.), 4.).rgb*uEnvInt);
  vec3 col = mix(body + sky*F, foamC, foam);
  float a = clamp(.55 + .45*foam, 0., 1.)*(fall > .5 ? .9 : 1.);
  col = fogged(col, vW, 0.);
  o = vec4(col*a, a); }`;

// Shafts of sunlight through gaps in the canopy (additive): brightest where the viewer looks across the beam, faded
// at both ends (colour alpha: 0 at the top, 1 at the bottom), with slowly drifting motes, never in the camera's face.
const SHAFT_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform float uTime, uShaftI; uniform highp sampler3D uNoise;
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); float f = pow(abs(dot(n, v)), 2.), h = vC.a;
  float fade = smoothstep(0., .2, h)*smoothstep(1., .5, h), dist = length(uCam - vW), near = smoothstep(15., 90., dist)*(1. - smoothstep(2500., 5000., dist));
  float m = texture(uNoise, vW*.012 + vec3(0., -uTime*.01, uTime*.004)).r;
  o = vec4(vC.rgb*uShaftI*f*fade*near*(.55 + .9*m), 1.); }`;

// ---------------------------------------------------------------- Orbital Nexus
// Reactor plasma (emissive): turbulent filaments flowing over the core and along the energy conduits, hotter where the
// noise folds, a bright rim; colour = tint, alpha = intensity.
const PLASMA_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform float uTime; uniform highp sampler3D uNoise;
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); float rim = pow(1. - abs(dot(n, v)), 2.);
  vec3 p = vL*vM.y + vec3(0., -uTime*vM.z, uTime*vM.z*.3);
  float a = texture(uNoise, p).r, b = texture(uNoise, p*2.1 + vec3(uTime*.05, .3, 0.)).g, c = texture(uNoise, p*4.3 - uTime*.07).a;
  float fil = pow(1. - abs(a*1.3 + b*.6 - 1.), 6.), hot = smoothstep(.55, 1., fil + c*.35);
  vec3 col = vC.rgb*(.35 + 1.3*fil + .6*rim) + vec3(1., .95, .9)*hot*1.4;
  o = vec4(col*vC.a, 1.); }`;

// Gravity plating: the deck of a gravity section. A dark metal deck (lit) with emissive chevrons that run forward along
// the course, field lines across, both scaled by the field strength (colour alpha); material y = metres along the
// course / 100, z = 0..1 across the deck.
const GRAV_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
uniform vec3 uGravCol;
void main(){
  vec3 n = normalize(vN), v = normalize(uCam - vW); if (dot(n, v) < 0.) n = -n;
  float u = vM.y*100., w = vM.z, fw = fwidth(u)*.08, g = vC.a;
  float panel = step(.04, fract(u/8.))*step(.03, fract(w*6.)), seam = 1. - panel;
  vec3 alb = vC.rgb*(.75 + .25*panel);
  vec3 col = lit(alb, .35, .8, n, v, vW, .8 + .2*panel);
  float ch = fract(u/12. - abs(w - .5)*1.6 - uTime*1.6), chev = smoothstep(.0, .06 + fw, ch)*smoothstep(.22 + fw, .16, ch)*smoothstep(.5, .38, abs(w - .5));
  float lane = smoothstep(.02 + fw*.02, 0., abs(abs(w - .5) - .44)), pulse = .7 + .3*sin(u*.05 - uTime*4.);
  float k = 1. - smoothstep(.4, 1.2, fw);
  col += uGravCol*g*(chev*1.6*k + lane*1.2*pulse + seam*.15 + .05);
  o = vec4(fogged(col, vW, g*(chev + lane)), 1.); }`;

// Glass of the transparent corridors (premultiplied alpha): mostly clear, reflecting the sky and the station toward
// grazing angles, a faint tint, dust in the corners of every pane (material y = pane coordinate u, z = v)
const GLASS_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
uniform vec3 uCam, uSunDir, uSunCol; uniform float uEnvInt; uniform samplerCube uEnv; uniform highp sampler3D uNoise;
void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW); if (dot(n, v) < 0.) n = -n;
  float nv = max(dot(n, v), 0.), F = .04 + .96*pow(1. - nv, 5.);
  vec3 R = reflect(-v, n), refl = min(textureLod(uEnv, R, .5).rgb, vec3(6.))*uEnvInt + uSunCol*pow(max(dot(R, uSunDir), 0.), 400.)*2.;
  vec2 e = min(vM.yz, 1. - vM.yz); float edge = min(e.x, e.y), dust = smoothstep(.12, 0., edge)*.25;
  // V11: faint streaks of grime down each pane, fine scratches that catch the sun near its reflection, and a bright
  // line where each pane meets its frame
  float fw = length(fwidth(vW)), k = 1. - smoothstep(.2, .8, fw*.3);
  float streak = smoothstep(.55, .8, texture(uNoise, vec3(vW.x*.06 + vM.y*3., vW.y*.012, vW.z*.06)).g)*k;
  float scratch = smoothstep(.72, .9, texture(uNoise, vW*.45 + .2).b)*k*pow(max(dot(R, uSunDir), 0.), 12.);
  float rim = smoothstep(.025, 0., edge);
  vec3 col = refl*F*(1. + rim*1.2) + vC.rgb*(dust*.3 + streak*.05) + uSunCol*(scratch*.25 + rim*.015);
  float a = clamp(F*.9 + .05 + dust*.3 + streak*.06 + scratch*.2 + rim*.12, 0., 1.);
  o = vec4(col, a); }`;

const variant = (fs, ...defs) => fs.replace('#version 300 es\n', '#version 300 es\n' + defs.map(d => `#define ${d}\n`).join('')); // a shader with some of its parts switched on
export function ensureV10Programs(gfx) {
  if (gfx.P.v10bark) return gfx.P;
  gfx.P.v10bark = gfx.prog(VS, variant(BARK_FS, 'DAPPLE')); gfx.P.v10barkTree = gfx.prog(VS, variant(BARK_FS, 'DAPPLE', 'TREE'));
  // V11: a program that draws nothing (every vertex outside the view): for items that exist only to cast a shadow, which the shadow pass draws with its own program
  gfx.P.shadowOnly = gfx.prog('#version 300 es\nlayout(location=0) in vec3 aPos; void main(){ gl_Position = vec4(2., 2., 2., 1.); }', '#version 300 es\nprecision mediump float; out vec4 o; void main(){ o = vec4(0.); }'); gfx.P.v10leaf = gfx.prog(LEAF_VS, variant(LEAF_FS, 'DAPPLE')); gfx.P.v10ground = gfx.prog(VS, variant(GROUND_FS, 'DAPPLE'));
  gfx.P.v10water = gfx.prog(VS, WATER_FS); gfx.P.v10shaft = gfx.prog(VS, SHAFT_FS);
  gfx.P.v10plasma = gfx.prog(VS, PLASMA_FS); gfx.P.v10grav = gfx.prog(VS, GRAV_FS); gfx.P.v10glass = gfx.prog(VS, GLASS_FS);
  return gfx.P;
}

// ---------------------------------------------------------------- geometry helpers
const UP = new Vec3(0, 1, 0), X1 = new Vec3(1, 0, 0), tv = new Vec3(), tn = new Vec3();
// A piece of wood: a tube through world points with a radius at each point, tapering to a closed tip when the last
// radius is small. Every ring carries the local grain direction (bark shader) and the fungus amount.
export function woodTube(g, pts, rad, seg, col, fungus = 0, tip = true) {
  const n = pts.length, rows = [], T = new Vec3(), B = new Vec3(), N = new Vec3(); let prevB = null;
  for (let j = 0; j < n; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(n - 1, j + 1)];
    T.subVectors(b, a).normalize();
    if (prevB) { B.copy(prevB).addScaled(T, -prevB.dot(T)); if (B.lenSq() < 1e-6) B.crossVectors(T, Math.abs(T.y) > 0.95 ? X1 : UP); B.normalize(); }
    else B.crossVectors(T, Math.abs(T.y) > 0.95 ? X1 : UP).normalize();
    prevB = B.clone(); N.crossVectors(B, T);
    g.M = [fungus, T.x, T.y, T.z]; const row = [];
    for (let k = 0; k <= seg; k++) { const an = (k / seg) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
      tn.set(B.x * c + N.x * s, B.y * c + N.y * s, B.z * c + N.z * s); tv.copy(pts[j]).addScaled(tn, rad[j]); row.push(g.raw(tv, tn, col)); }
    rows.push(row);
  }
  for (let j = 0; j < n - 1; j++) { const A = rows[j], C = rows[j + 1]; for (let k = 0; k < seg; k++) g.quad(A[k], C[k], C[k + 1], A[k + 1]); }
  if (tip && n > 1) { const L = rows[n - 1], d = new Vec3().subVectors(pts[n - 1], pts[n - 2]).normalize(), c = g.raw(new Vec3().copy(pts[n - 1]).addScaled(d, rad[n - 1] * 1.5), d, col);
    for (let k = 0; k < seg; k++) g.tri(L[k], c, L[k + 1]); }
  return g;
}
// smooth curve through control points (Catmull-Rom), `per` points per span
export function spline(P, per = 6) {
  const out = [];
  for (let k = 0; k < P.length - 1; k++) { const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
    for (let j = 0; j < per; j++) { const t = j / per, t2 = t * t, t3 = t2 * t, o = new Vec3();
      for (const c of ['x', 'y', 'z']) o[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      out.push(o); } }
  out.push(P[P.length - 1].clone()); return out;
}
// icosphere (unit), cached per detail level
const ICO = new Map();
export function icosphere(detail) {
  if (ICO.has(detail)) return ICO.get(detail);
  const t = (1 + Math.sqrt(5)) / 2; let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) { const mid = new Map(), m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid.has(k)) return mid.get(k); const p = v[a].map((c, i) => (c + v[b][i]) / 2), l = Math.hypot(...p); v.push(p.map(c => c / l)); mid.set(k, v.length - 1); return v.length - 1; };
    const nf = []; for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } f = nf; }
  const r = { v, f }; ICO.set(detail, r); return r;
}
// A mass of foliage: a lumpy icosphere (several lobes), flattened underneath; colour alpha = sway weight (0 at the
// bottom centre, 1 at the outside), material x = translucency, y = per-clump random (wind phase)
export function blob(g, c, r, seed, col, o = {}) {
  const { v, f } = icosphere(o.detail ?? 2), sq = o.squash ?? 0.75, lobes = o.lobes ?? 5, rnd = k => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const L = []; for (let k = 0; k < lobes; k++) { const a = rnd(k) * 6.283, e = (rnd(k + 9) - 0.3) * 1.2; L.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.25 + 0.3 * rnd(k + 17)]); }
  g.M = [o.trans ?? 0.8, rnd(99), 0, 0]; const ids = [];
  for (const p of v) {
    let d = 1; for (const l of L) { const dt = p[0] * l[0] + p[1] * l[1] + p[2] * l[2]; d += l[3] * Math.max(0, dt) ** 3; }
    d += 0.08 * Math.sin(p[0] * 9 + seed) * Math.sin(p[1] * 7 + seed * 2) * Math.sin(p[2] * 8 - seed);
    const y = p[1] < 0 ? p[1] * sq * 0.7 : p[1] * sq;
    tv.set(c.x + p[0] * r * d, c.y + y * r * d, c.z + p[2] * r * d); tn.set(p[0], p[1] < 0 ? p[1] * 0.7 : p[1], p[2]).normalize();
    const sway = Math.min(1, 0.25 + 0.75 * Math.hypot(p[0], p[2])) * (o.sway ?? 1);
    ids.push(g.raw(tv, tn, [col[0], col[1], col[2], sway]));
  }
  for (const [a, b, cc] of f) g.tri(ids[a], ids[cc], ids[b]);
  return g;
}
// V11: a crown of foliage as a cluster of leaf masses, a core and n masses over its top and sides (directions on a
// golden spiral, sizes and shades varied), so its outline breaks up into clumps of leaves instead of one smooth dome
export function crownCluster(g, c, r, seed, col, n, detail, o = {}) {
  const rnd = k => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }, sq = o.squash ?? 0.72, sway = o.sway ?? 0.15;
  blob(g, new Vec3(c.x, c.y - r * 0.06, c.z), r * 0.7, seed, col, { detail: o.coreDetail ?? detail, squash: sq, sway, trans: o.trans });
  for (let k = 0; k < n; k++) {
    const y = 1 - (k + 0.5) / n * 1.3, rad = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996 + seed * 0.7, d = new Vec3(Math.cos(a) * rad, y * sq, Math.sin(a) * rad);
    const rr = r * (0.28 + 0.16 * rnd(k)), p = new Vec3(c.x, c.y, c.z).addScaled(d, r * (0.6 + 0.14 * rnd(k + 31))), tint = 0.82 + 0.34 * rnd(k + 7);
    blob(g, p, rr, seed * 3 + k * 1.7, [col[0] * tint, col[1] * tint, col[2] * tint * (0.9 + 0.2 * rnd(k + 3))], { detail, squash: 0.8, sway: Math.min(1, sway * 1.6), lobes: 4, trans: o.trans });
  }
  return g;
}
// One big leaf: an oval blade from `base` along `dir` (length len, width wid), curled down along its length and folded
// along the midrib; colour alpha = sway weight (0 at the stem)
export function leaf(g, base, dir, side, len, wid, col, trans = 0.9, seed = 0) {
  const D = dir.clone().normalize(), S = side.clone().addScaled(D, -side.dot(D)).normalize(), U = new Vec3().crossVectors(S, D).normalize(), n = 6, rows = [];
  g.M = [trans, (seed * 0.137) % 1, 0, 0];
  for (let k = 0; k <= n; k++) { const u = k / n, w = Math.sin(Math.PI * Math.min(1, u * 1.05)) * wid * (1 - 0.3 * u), curl = -0.35 * len * u * u, row = [];
    for (const s of [-1, 0, 1]) { const fold = s ? -Math.abs(s) * w * 0.18 : 0, p = new Vec3().copy(base).addScaled(D, len * u).addScaled(U, curl + fold).addScaled(S, s * w);
      const nn = new Vec3().copy(U).addScaled(S, s * 0.25).addScaled(D, 0.5 * u).normalize(); row.push(g.raw(p, nn, [col[0], col[1], col[2], Math.min(1, u * 1.2)])); }
    rows.push(row); }
  for (let k = 0; k < n; k++) for (let s = 0; s < 2; s++) g.quad(rows[k][s], rows[k][s + 1], rows[k + 1][s + 1], rows[k + 1][s]);
  return g;
}
export { UP };
