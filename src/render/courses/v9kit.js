// GALACTIC RUSH V9 — shared kit for the two new worlds (Pelagos, Ignara): their own shader programs (ocean, cloud deck,
// lava, volcanic ground), registered on the renderer at load time next to its existing programs (gfx.js is unchanged:
// these programs read the same scene uniforms it already supplies), a corridor clearance test so that no scenery
// intrudes into the racing corridor, and geometry helpers. Nothing here is used by the four original courses.
import { Vec3, Quat } from '../../math.js';
import { Geo } from '../geo.js';

// ---------------------------------------------------------------- shaders
export const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=8) in vec4 aMat;
layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aICol;
uniform mat4 uModel, uVP;
out vec3 vN; out vec3 vW; out vec4 vC; out vec4 vM; out vec3 vL;
void main(){ mat4 m = uModel*mat4(aI0, aI1, aI2, aI3); vec4 w = m*vec4(aPos, 1.); vW = w.xyz; vL = aPos; vN = mat3(m)*aNor; vC = aCol*vec4(aICol.rgb, 1.); vM = aMat; gl_Position = uVP*w; }`;

// scene lighting shared by the V9 surface shaders: sun (GGX), image-based sky light, sun shadows, up to four point
// lights and the same distance and height fog as the main PBR shader
export const LIGHT = `
uniform vec3 uCam, uSunDir, uSunCol, uFogCol; uniform float uFog, uEnvInt, uTime; uniform vec2 uFogH;
uniform samplerCube uEnv; uniform sampler2DShadow uShadow; uniform mat4 uShadowVP; uniform float uShadowOn;
uniform vec4 uPL[4]; uniform vec3 uPLc[4]; uniform int uNPL; uniform highp sampler3D uNoise;
float D_GGX(float nh, float a){ float a2 = a*a, d = nh*nh*(a2 - 1.) + 1.; return a2/(3.14159*d*d); }
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
  float sh = nl > 0. ? shadowAt(W, n) : 0.;
  vec3 col = ((1. - F)*(1. - metal)*alb/3.14159 + spec)*uSunCol*nl*sh*3.14159;
  for (int i = 0; i < 4; i++) { if (i >= uNPL) break; vec3 Lp = uPL[i].xyz - W; float d = length(Lp); Lp /= d; float at = clamp(1. - d/uPL[i].w, 0., 1.); at *= at;
    col += (1. - metal)*alb*uPLc[i]*max(dot(n, Lp), 0.)*at; }
  vec3 irr = textureLod(uEnv, n, 5.).rgb, pre = min(textureLod(uEnv, reflect(-v, n), rough*5.).rgb, vec3(6.));
  vec3 Fr = f0 + (max(vec3(1. - rough), f0) - f0)*pow(1. - nv, 5.);
  col += ((1. - Fr)*(1. - metal)*alb*irr + pre*Fr*(1. - rough*.7))*uEnvInt*ao;
  return col; }
vec3 fogged(vec3 col, vec3 W, float emi){ float dist = length(uCam - W), fog = 1. - exp(-uFog*uFog*dist*dist); vec3 v = normalize(uCam - W);
#ifndef NOFOGH /* V11: a world without height fog (the station) compiles it out */
  if (uFogH.y > 0.) { float hc = (uCam.y - uFogH.x)/uFogH.y, hp = (W.y - uFogH.x)/uFogH.y, dh = hp - hc, od = abs(dh) > 1e-3 ? (exp(-hc) - exp(-hp))/dh : exp(-hc); fog = 1. - exp(-uFog*uFog*dist*dist*clamp(od, 0., 1.)*2.4); }
#endif
  vec3 fogC = uFogCol + uSunCol*.045*pow(max(dot(-v, uSunDir), 0.), 6.); return mix(col, fogC, fog*(1. - min(emi, 1.)*.6)); }`;

// a cloud deck on the horizontal plane y = uCloud.x: density from the tiling noise volume (two fetches, drifting with
// the wind), storm cells from a third, much larger one; lightning lights the deck around uFlash.xy
const CLOUD = `
uniform vec4 uCloud; /* x altitude, y scale (cycles per metre), z coverage, w storm amount */ uniform vec3 uWind; uniform vec4 uFlash; /* x, z, intensity, radius */
uniform vec3 uCloudLo, uCloudHi, uGlow; /* storm base, lit top, light from below (lava) */
float stormAt(vec2 xz){ return texture(uNoise, vec3(xz*uCloud.y*.23 + .21, .13)).r; } /* the storm cells: a field tens of kilometres across */
float cloudB(vec2 xz, float st){ vec2 q = xz*uCloud.y + uWind.xy*uTime; float a = texture(uNoise, vec3(q, .37)).r, b = texture(uNoise, vec3(q*2.7 + .5, .71)).g;
  return clamp((a*.75 + b*.45 - (1.1 - uCloud.z) + (st - .5)*uCloud.w)*2.6, 0., 1.); }
float cloudD(vec2 xz){ return cloudB(xz, stormAt(xz)); }
// colour (premultiplied) and coverage of the deck seen along ray d from p, faded toward the horizon
vec4 cloudAt(vec3 p, vec3 d){ if (d.y < .004) return vec4(0.); float t = (uCloud.x - p.y)/d.y; if (t < 0.) return vec4(0.);
  vec3 h = p + d*t; float st = stormAt(h.xz), den = cloudB(h.xz, st), den2 = cloudB(h.xz + uSunDir.xz*260., st); /* V11: the second sample, 260 m toward the sun, shares the first one's storm cell (one lookup less) */
  float lit = clamp(.55 + (den - den2)*1.8, 0., 1.), fwd = pow(max(dot(d, uSunDir), 0.), 8.);
  vec3 c = mix(uCloudLo, uCloudHi, lit*(1. - den*.45))*(.8 + .4*fwd*(1. - den)) + uGlow*(.6 + .4*den);
  if (uFlash.z > 0.) { vec2 fd = (h.xz - uFlash.xy)/uFlash.w; c += vec3(.75, .82, 1.)*uFlash.z*exp(-dot(fd, fd))*(.35 + den); }
  float far = smoothstep(.004, .09, d.y), a = den*far; c = mix(uFogCol*1.1, c, smoothstep(.0, .22, d.y));
  return vec4(c*a, a); }`;

const CLOUD_VS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uModel, uVP; out vec3 vW; void main(){ vec4 w = uModel*vec4(aPos, 1.); vW = w.xyz; gl_Position = uVP*w; }`;
const CLOUD_FS = `#version 300 es
precision highp float; in vec3 vW; out vec4 o;
uniform vec3 uCam, uSunDir, uSunCol, uFogCol; uniform float uTime; uniform highp sampler3D uNoise;
${CLOUD}
uniform vec4 uCloud2; /* V11: a lower layer of torn scud under the deck: x altitude, y scale, z coverage, w opacity (0: none) */ uniform vec3 uWind2, uScud;
void main(){ vec3 d = normalize(vW - uCam); vec4 c = cloudAt(uCam, d);
  if (uCloud2.w > 0. && d.y > .004) { float t = (uCloud2.x - uCam.y)/d.y; vec2 h = uCam.xz + d.xz*t, q = h*uCloud2.y + uWind2.xy*uTime;
    float a = texture(uNoise, vec3(q, .52)).b, b = texture(uNoise, vec3(q*vec2(2.6, 3.4) + .3, .27)).a;
    float den = clamp((a*.8 + b*.45 - (1.18 - uCloud2.z))*2.4, 0., 1.)*uCloud2.w*smoothstep(.004, .1, d.y);
    vec3 sc = mix(uFogCol*1.05, uScud*(.75 + .5*b) + uGlow*.9, smoothstep(.0, .25, d.y));
    if (uFlash.z > 0.) { vec2 fd = (h - uFlash.xy)/uFlash.w; sc += vec3(.75, .82, 1.)*uFlash.z*exp(-dot(fd, fd))*.5; }
    c = vec4(sc*den, den) + c*(1. - den); }
  if (c.a < .003) discard; o = c; }`;

// Ocean: Gerstner swell displaced in the vertex shader near the camera (the grid follows the camera), the same waves
// plus two noise layers as per-pixel normals (band-limited with distance), Fresnel reflection of the sky and of the
// cloud deck, sun glitter, light scattered through thin wave crests, whitecaps and streaks of foam.
export const WAVES = `
const int NW = 9;
const vec4 WV[9] = vec4[9](vec4(0.960, 0.280, 160., 1.0), vec4(0.639, 0.769, 113., 0.72), vec4(0.982, -0.186, 79., 0.52), vec4(0.271, 0.963, 57., 0.38), vec4(0.841, -0.541, 41., 0.27), vec4(0.855, 0.519, 29., 0.19), vec4(0.577, -0.817, 21., 0.13), vec4(-0.144, 0.990, 15., 0.085), vec4(0.997, 0.074, 10., 0.055)); /* dir x, dir z, wavelength m, amplitude m */
uniform float uSea; /* sea state: 1 calm .. 2 storm */
vec3 waves(vec2 p, float t, float att, out vec3 nrm, out float crest){ vec3 d = vec3(0.); vec3 n = vec3(0., 1., 0.); crest = 0.;
  att *= .72 + .28*sin(p.x*.0023 + 1.3 + t*.02)*sin(p.y*.0019 - .7) + .12*sin((p.x + p.y)*.0061 + 2.);
  for (int i = 0; i < NW; i++) { vec4 w = WV[i]; float k = 6.2832/w.z, c = sqrt(9.8/k), A = w.w*uSea*att, Q = .5/(k*A*float(NW) + 1e-4);
    Q = min(Q, 1.); float f = k*(dot(w.xy, p) - c*t) + float(i)*1.7, cf = cos(f), sf = sin(f);
    d.x += Q*A*w.x*cf; d.z += Q*A*w.y*cf; d.y += A*sf; n.x -= w.x*k*A*cf; n.z -= w.y*k*A*cf; n.y -= Q*k*A*sf; crest += sf*A; }
  nrm = normalize(n); return d; }`;
const OCEAN_VS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uModel, uVP; uniform vec3 uCam; uniform float uTime;
out vec3 vW; out float vCrest; out vec3 vNv;
${WAVES}
void main(){ vec4 w = uModel*vec4(aPos, 1.); float d = length(w.xz - uCam.xz), att = 1. - smoothstep(500., 1500., d); vec3 n; float cr;
  vec3 disp = waves(w.xz, uTime, att, n, cr); vW = vec3(w.x + disp.x, disp.y, w.z + disp.z); vCrest = cr; vNv = n; gl_Position = uVP*vec4(vW, 1.); }`;
const OCEAN_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in float vCrest; in vec3 vNv; out vec4 o;
${LIGHT}
${CLOUD}
${WAVES}
uniform vec3 uDeep, uScatter; uniform vec4 uFoamK; /* x whitecap threshold, y amount, z streaks, w rain on the surface (V11) */
uniform vec4 uFoamSrc[8]; uniform float uFoamN; /* V11: the legs, columns and towers standing in the sea nearest the camera (x, z, radius, foam), nearest first, and how many of them are in reach: the loop stops there, so open sea pays nothing */
// V11: the deck's density where a ray from p along d meets it (one lookup set: the reflection and the shadow on the sea
// need no self-shadowing of the deck)
float deckAt(vec3 p, vec3 d){ float t = (uCloud.x - p.y)/max(d.y, .02); return cloudD(p.xz + d.xz*t); }
void main(){
  vec3 v = normalize(uCam - vW); float dist = length(uCam - vW), fw = length(fwidth(vW.xz));
  // the swell at the pixel's footprint: waves shorter than about four pixels fade to flat (no shimmer far away)
  float attP = 1. - smoothstep(10., 40., fw*6.); vec3 nw; float cr; waves(vW.xz, uTime, max(attP, .25), nw, cr);
  vec2 wr = vec2(dot(vW.xz, vec2(.96, .28)), dot(vW.xz, vec2(-.28, .96))); /* wind frame */
  // V11: wind streaks, long bands down the wind where the sea is calmer (a clearer mirror) or rougher
  float sl = texture(uNoise, vec3(wr*vec2(.0009, .0055) + vec2(uTime*.004, 0.), .83)).g, slick = smoothstep(.55, .7, sl), rgh = smoothstep(.42, .28, sl);
  // two noise layers drifting with the wind: wind chop and capillary ripples
  vec2 q1 = vW.xz*.021 + vec2(uTime*.012, uTime*.007), q2 = vW.xz*.083 - vec2(uTime*.03, -uTime*.021);
  float k1 = 1. - smoothstep(.3, 1.2, fw*.021*4.), k2 = 1. - smoothstep(.3, 1.2, fw*.083*4.);
  vec4 A = texture(uNoise, vec3(q1, uTime*.004)), B = texture(uNoise, vec3(q2, .5 + uTime*.009));
  float chop = (1. - slick*.65)*(1. + rgh*.45);
  vec3 n = normalize(nw + vec3((A.r - .5)*.5*k1 + (B.g - .5)*.35*k2, 0., (A.g - .5)*.5*k1 + (B.r - .5)*.35*k2)*chop);
  // V11: rain stippling the surface near the camera
  float kr = (1. - smoothstep(.03, .15, fw))*uFoamK.w; if (kr > .01) { vec4 Rn = texture(uNoise, vec3(vW.xz*.8, uTime*2.3)); n = normalize(n + vec3(Rn.r - .5, 0., Rn.b - .5)*.6*kr); }
  if (dot(n, v) < .02) n = normalize(n + v*(.02 - dot(n, v)));
  float nv = max(dot(n, v), 0.), F = .02 + .98*pow(1. - nv, 5.); vec3 R = reflect(-v, n); R.y = abs(R.y);
  // reflection: the sky, blurred with distance where many facets share a pixel (less on the slicks), and the cloud deck
  float blur = clamp(log2(1. + fw*.3), 0., 3.)*(1. - slick*.6);
  vec3 sky = min(textureLod(uEnv, R, 1. + blur).rgb, vec3(8.));
  float cd = R.y > .004 ? deckAt(vW, R)*smoothstep(.004, .09, R.y) : 0.;
  vec3 cc = mix(uFogCol*1.1, mix(uCloudLo, uCloudHi, .5 - cd*.25) + uGlow, smoothstep(0., .22, R.y));
  if (uFlash.z > 0.) { vec2 fd = (vW.xz + R.xz*(uCloud.x - vW.y)/max(R.y, .02) - uFlash.xy)/uFlash.w; cc += vec3(.75, .82, 1.)*uFlash.z*exp(-dot(fd, fd))*.6; }
  vec3 refl = mix(sky, cc, cd);
  // V11: the deck's shadow on the sea: sunlit patches where the sun breaks through
  float cs = uSunDir.y > .02 ? deckAt(vW, uSunDir) : 1., sunK = (1. - cs*.82)*smoothstep(0., .05, uSunDir.y);
  // body colour: deep water lit by the sky; brighter blue-green where the sun shines through thin crests
  float sunUp = max(uSunDir.y, 0.), thin = clamp(vCrest/(2.*uSea) + .5, 0., 1.);
  vec3 skyI = textureLod(uEnv, vec3(0., 1., 0.), 5.).rgb*uEnvInt;
  float through = pow(thin, 2.)*(.3 + .7*pow(max(dot(-v, uSunDir)*.5 + .5, 0.), 2.));
  vec3 body = uDeep*(.35 + .65*sunUp)*(.7 + .6*min(dot(skyI, vec3(.33)), 1.)) + uScatter*(through*sunUp*(.35 + 1.6*sunK) + .12*max(dot(n, uSunDir), 0.)*(.3 + .7*sunK) + .04*thin);
  // whitecaps: on the highest crests, torn into filaments by ridged noise stretched across the wind; between them faint
  // streaks of old foam drawn out along the wind. Both fade to their average once their detail is under a pixel.
  float kf = 1. - smoothstep(.25, 1., fw*.03), ks = 1. - smoothstep(.25, 1., fw*.012);
  float fil = mix(.45, texture(uNoise, vec3(wr*vec2(.022, .07) + vec2(uTime*.02, 0.), .23)).a, kf), old = mix(.3, texture(uNoise, vec3(wr*vec2(.003, .016), .61) + vec3(uTime*.001, 0., 0.)).a, ks);
  float patchy = texture(uNoise, vec3(vW.xz*.0011 + .3, .9)).r; /* foam gathers in patches a kilometre across */
  float cap = smoothstep(uFoamK.x, uFoamK.x + .18, thin + (A.b - .5)*.25 + rgh*.06)*smoothstep(.3, .6, patchy + .15)*(1. - smoothstep(1.2, 5., fw));
  float foam = cap*smoothstep(.35, .8, fil)*uFoamK.y*(.75 + .5*B.b) + smoothstep(.62, .9, old)*uFoamK.z*(.3 + .7*thin)*smoothstep(.45, .7, patchy)*smoothstep(.3, .6, fil);
  // V11: foam round everything standing in the sea: churned water hugging each leg and a tail streaming downwind
  float ring = 0.;
  for (int i = 0; i < 8; i++) { if (float(i) >= uFoamN) break; vec4 s = uFoamSrc[i]; vec2 d = vW.xz - s.xy; float r = length(d) - s.z;
    float al = dot(d, vec2(.96, .28)), lat = abs(dot(d, vec2(-.28, .96))), ap = max(al, 0.);
    float tail = smoothstep(0., s.z, al)*exp(-ap/(45. + s.z*3.))*exp(-max(lat - s.z, 0.)/(3. + ap*.1))*(1. - smoothstep(45., 70., r));
    ring = max(ring, s.w*max(exp(-max(r, 0.)/(2.5 + s.z*.5))*(.8 + .2*sin(uTime*1.7 + r*.9 + cr*2.)), tail*.8)); }
  ring *= smoothstep(.15, .6, fil + (B.b - .5)*.4 + .2)*(1. - smoothstep(3., 10., fw));
  foam = max(foam, ring);
  // aerated water under and around the foam: lighter and greener
  body = mix(body, uScatter*(.5 + .9*sunK) + uDeep, clamp(cap*.6 + ring*.45, 0., 1.)*.55);
  vec3 col = mix(body, refl, F*(1. - ring*.5));
  // sun glitter: a GGX lobe that widens with distance (many facets per pixel), sharper on the slicks, in the sunlit patches
  vec3 h = normalize(uSunDir + v); float rough = (.06 + clamp(fw*.004, 0., .25))*(1. - slick*.35), nh = max(dot(n, h), 0.);
  col += uSunCol*D_GGX(nh, rough*rough)*.04*sunK;
  vec3 foamC = vec3(.62, .66, .7)*(skyI*.9 + uSunCol*max(uSunDir.y, 0.)*(.12 + .3*sunK));
  col = mix(col, foamC, clamp(foam, 0., 1.)*.85);
  for (int i = 0; i < 4; i++) { if (i >= uNPL) break; vec3 Lp = uPL[i].xyz - vW; float d = length(Lp); Lp /= d; float at = clamp(1. - d/uPL[i].w, 0., 1.); col += uPLc[i]*at*at*(.04 + .4*pow(max(dot(n, normalize(Lp + v)), 0.), 60.)); }
  if (uFlash.z > 0.) { vec2 fd = (vW.xz - uFlash.xy)/(uFlash.w*1.4); col += vec3(.6, .7, .9)*uFlash.z*.06*exp(-dot(fd, fd))*(.3 + F); }
  o = vec4(fogged(col, vW, 0.), 1.); }`;

// Lava: emissive rock melt flowing along the mesh's own (u, v) coordinates (colour channels: u along the flow in
// metres/100, v across 0..1, flow speed, heat; material w: the flow's width in metres, material x = 1: lay the
// pattern out in world x, z instead, for lakes). A dark crust of plates drifts on the flow; the plates crack open to the
// hot melt beneath, wider where the flow is hotter and faster, and melt away into pools; their rims glow dull red. The
// banks crust over. A slow wobble of the lookup is the heat shimmer. Detail fades to its average with distance.
export const CELL = `
vec2 h22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p)*43758.5453); }
// cellular pattern: x = F2 - F1 (zero on the cell borders), y = a random value per cell
vec2 vor(vec2 x){ vec2 n = floor(x), f = fract(x); float d1 = 9., d2 = 9.; vec2 id = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), r = g + .06 + .88*h22(n + g) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d2) - sqrt(d1), h22(id*1.37 + 4.1).x); }`;
const LAVA_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
${CELL}
uniform float uGlowK, uCrustK;
// V11: a wider ramp, from crust barely glowing through deep red and orange to yellow and white-hot
vec3 heatCol(float t){ return t < .3 ? mix(vec3(.06, .005, 0.), vec3(.55, .05, .004), t/.3) : t < .55 ? mix(vec3(.55, .05, .004), vec3(1.15, .22, .016), (t - .3)/.25) : t < .8 ? mix(vec3(1.15, .22, .016), vec3(1.75, .72, .1), (t - .55)/.25) : mix(vec3(1.75, .72, .1), vec3(2.4, 1.65, .8), (t - .8)/.2); }
void main(){
  float u = vC.r*100., vv = vC.g, sp = vC.b, heat = vC.a, W = max(vM.w, 8.), lake = vM.x;
  vec2 sh = vec2(sin(uTime*1.7 + vW.x*.07), cos(uTime*1.3 + vW.z*.06))*.35; /* heat shimmer, metres */
  vec2 m = mix(vec2(u - uTime*sp*5., (vv - .5)*W), vW.xz + vec2(uTime*sp*2., 0.), lake) + sh;
  vec4 A = texture(uNoise, vec3(m*.012, .3)), B = texture(uNoise, vec3(m*.05, .7 + uTime*.01)), Lg = texture(uNoise, vec3(m*.0035, .55));
  float bank = smoothstep(0., .16, vv)*smoothstep(1., .84, vv);
  // V11: the flow's state along its length (crusted stretches, broken plates, open runs of melt), a hot channel down the
  // middle of a river, and the falls all melt
  float mid = (1. - lake)*(1. - smoothstep(0., .3, abs(vv - .5))), zone = smoothstep(.3, .7, Lg.r + (A.g - .5)*.3), fall = smoothstep(2.4, 3.1, sp);
  float open = clamp(heat*bank*(zone*(.42 + .45*A.r) + mid*(.25 + .55*zone))*(1. - uCrustK*.3) + fall*.85, 0., 1.);
  vec2 pc = m/mix(vec2(7.*(1. + sp*.3), 5.), vec2(12., 10.), lake); float fw = max(length(fwidth(pc)), 1e-4); /* the plates keep one size along a flow: a size that varied from place to place would squeeze them into bands (the flow's coordinate runs into the thousands) */
  float k = 1. - smoothstep(.22, .7, fw); /* 1 near; 0 where a plate is down to about two pixels */
  vec2 wp = pc + (texture(uNoise, vec3(m*.021, .61)).rg - .5)*1.5; /* warped: irregular plates with curved edges */
  vec2 V = k > .002 ? vor(wp) : vec2(.5), V2 = k > .002 ? vor(wp*2.6 + 13.7) : vec2(.5); /* plates and the fine fractures within them */
  // V11: crust rafts drifting on the melt: where the flow is open the rafts are small and far apart, where it has crusted
  // over they close up into plates with only cracks between them; the rafts' edges glow dull red
  float n1 = A.g*.55 + B.b*.45 + (V.y - .5)*.12*k, thr = mix(.34, .78, open);
  float molten = 1. - smoothstep(thr - .05, thr + .05, n1);
  float cw = (.036 + .1*open)*(.35 + 1.3*B.g), aa = fw*1.2 + .004;
  float crack = mix(min(1., cw*1.9), 1. - smoothstep(cw, cw + aa, V.x), k)*(1. - molten);
  float fine = (1. - smoothstep(cw*.3, cw*.3 + aa*2.6, V2.x))*k*.22*(1. - molten);
  float melt = clamp(max(molten, max(crack*(.8 + .2*open), fine*.4)), 0., 1.);
  float rim = (1. - smoothstep(0., .1, n1 - thr))*step(thr, n1)*(1. - crack)*k;
  float st = texture(uNoise, vec3(m.x*.03, m.y*.24, .41 + uTime*.02)).b; /* streaks of brightness drawn out along the flow */
  float tM = clamp(heat*(.5 + .22*mid + .1*open) + (st - .5)*.32 + fall*.12 + (B.r - .5)*.1, 0., 1.), tC = clamp(heat*(.64 + .2*open) + (B.r - .5)*.12, 0., 1.);
  float flick = .93 + .07*sin(uTime*2.3 + A.b*30.);
  vec3 emi = (heatCol(tM)*molten + heatCol(tC)*max(crack*(.8 + .2*open), fine*.4)*(1. - molten) + vec3(.3, .03, 0.)*rim*heat*(.4 + .6*zone))*uGlowK*flick;
  // the crust: dark scoria, each plate tilted a little, rough; cold stretches carry a skin of grey ash
  vec3 v = normalize(uCam - vW), n = normalize(vN + vec3(V.y - .5, 0., fract(V.y*7.3) - .5)*.35*k + vec3(B.g - .5, 0., B.b - .5)*.5*k);
  vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n, gn) < 0.) n = -n;
  vec3 crust = vec3(.036, .031, .028)*(.75 + .5*B.a) + vec3(.02, .004, 0.)*heat; crust = mix(crust, vec3(.11, .1, .095)*(.8 + .4*A.b), (1. - zone)*(1. - mid)*smoothstep(.55, .75, B.a)*.6);
  vec3 col = lit(crust, .84, 0., n, v, vW, 1.)*(1. - melt) + emi;
  o = vec4(fogged(col, vW, min(1., melt*1.5)), 1.); }`;

// Volcanic ground: basalt and scoria with ash settled on the flatter ground, rust streaks, slope cliffs; near lava
// (vertex heat, colour alpha) the rock is lit orange from below and thin fissures glow, pulsing slowly. Detail from the
// noise volume and a cellular crack pattern, band-limited by distance.
const ROCK_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vM; in vec3 vL; out vec4 o;
${LIGHT}
${CELL}
void main(){
  vec3 n0 = normalize(vN), v = normalize(uCam - vW); vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n0, gn) < 0.) n0 = -n0;
  float fw = length(fwidth(vW)), slope = 1. - abs(n0.y), heat = vC.a;
  // V11: near the lava the rock's detail wavers in the rising hot air
  vec3 Wp = vW + vec3(sin(uTime*3.1 + vW.y*.9 + vW.x*.05), 0., cos(uTime*2.7 + vW.y*.8 + vW.z*.05))*.3*smoothstep(.35, .9, heat);
  vec2 hp = Wp.xz; vec2 cp = abs(n0.x) > abs(n0.z) ? Wp.zy : Wp.xy; /* horizontal and cliff projections */
  float cliff = step(.55, slope); vec2 pp = mix(hp, cp, cliff);
  float kA = 1. - smoothstep(.4, 1.6, fw*.05), kB = 1. - smoothstep(.4, 1.6, fw*.21);
  vec4 A = texture(uNoise, vec3(pp*.05, .19)), B = texture(uNoise, vec3(pp*.21, .43));
  vec4 C = texture(uNoise, vec3(hp*.0035, .87));
  float ash = smoothstep(.35, .05, slope)*smoothstep(.45, .8, C.r + (A.g - .5)*.4*kA)*(1. - heat), rust = smoothstep(.62, .82, C.g + (B.r - .5)*.3*kB);
  vec3 alb = vC.rgb*(.75 + .5*mix(.5, A.r, kA))*(.85 + .3*mix(.5, B.g, kB));
  alb = mix(alb, vec3(.12, .115, .11), ash*.75); alb = mix(alb, alb*vec3(1.5, .8, .55), rust*.6*(1. - ash));
  // V11: the ground's colours beyond basalt grey: broad fields of oxidised red scoria, sulphur crusts round hot vents,
  // dark glassy obsidian in patches (smooth: it catches the light)
  float ox = smoothstep(.52, .8, C.b + (A.b - .5)*.3)*(1. - ash);
  alb = mix(alb, alb*vec3(1.45, .8, .58) + vec3(.02, .004, 0.), ox*.5);
  float obs = smoothstep(.7, .8, mix(.5, B.r, kB) + (C.a - .5)*.5)*smoothstep(.15, .35, slope)*(1. - ash);
  alb = mix(alb, vec3(.035, .034, .04), obs*.6);
  // cliffs: lava flows stacked in layers with a ledge at each, cut into columns by cooling joints
  float ly = (Wp.y + (A.g - .5)*8.)/9.5 + A.r*.6, /* layers about 9.5 m thick, their beds wavering by a few metres */ lyr = fract(ly), ledge = (1. - smoothstep(.0, .08, lyr))*cliff*kA;
  alb *= mix(1., .82 + .36*fract(sin(floor(ly)*12.9898)*43758.5453), cliff*kA); alb *= 1. - ledge*.45;
  vec2 cc = vec2(cp.x/3.4, cp.y/17.) + (A.gb - .5)*.35; float fcc = length(fwidth(cc)), kc2 = (1. - smoothstep(.05, .14, fcc))*cliff; /* columns only within a few hundred metres: beyond, their joints are a pixel or less */
  /* the columns stand in courses about 17 m tall, each course shifted against the one below: the joints are the edges of a brick-like lattice (two hashes; a cellular field here cost ten for every pixel of rock) */
  float crow = floor(cc.y), cu = cc.x + fract(sin(crow*78.233)*43758.5453)*7., dj = min(.5 - abs(fract(cu) - .5), (.5 - abs(fract(cc.y) - .5))*5.);
  vec2 Vc = vec2(dj*2., fract(sin(floor(cu)*12.9898 + crow*37.719)*43758.5453)); float joint = (1. - smoothstep(.02, .05 + fcc, Vc.x))*kc2;
  alb *= (1. - joint*.6)*(1. + (Vc.y - .5)*.3*kc2);
  vec3 tH = normalize(vec3(-n0.z, 0., n0.x) + 1e-5);
  vec3 n = normalize(n0 + vec3(A.r - .5, 0., A.g - .5)*.55*kA*(1. - ash*.6) + vec3(B.g - .5, 0., B.b - .5)*.3*kB + tH*(Vc.y - .5)*.5*kc2 - vec3(0., 1., 0.)*ledge*.3);
  vec3 col = lit(alb, .9 - ash*.05 - obs*.5, 0., n, v, vW, (.8 + .2*A.b)*(1. - joint*.4));
  // light from the lava below: strongest on faces turned down and toward it, flickering with the melt
  col += alb*vec3(1.25, .38, .08)*heat*heat*(.55 - .45*n.y)*(.9 + .1*sin(uTime*2.1 + vW.x*.02 + vW.z*.03));
  // fissures: thin cellular cracks (cells about 9 m), open only where the rock is hot
  vec2 pc = pp/9. + (A.gb - .5)*.35; float fc = length(fwidth(pc)), kc = 1. - smoothstep(.15, .5, fc);
  float hot = smoothstep(.35, .9, heat)*smoothstep(.5, .66, A.b + (heat - .5)*.25), cw = .012 + .03*hot; /* in patches */
  vec2 V = kc*hot > .002 ? vor(pc) : vec2(.5);
  float cr = mix(cw*1.2, 1. - smoothstep(cw, cw + fc*1.2 + .003, V.x), kc)*hot, pulse = .8 + .2*sin(uTime*1.3 + C.b*20. + V.y*6.);
  vec3 emi = mix(vec3(.9, .12, .01), vec3(1.6, .6, .1), hot*(1. - smoothstep(0., cw, V.x)))*cr*1.4*pulse + vec3(.5, .07, .01)*smoothstep(.6, 1., heat)*.06;
  // V11: sulphur crusts on the hot ground round the open fissures
  float sulf = hot*kc*(1. - smoothstep(cw, cw + .1, V.x))*smoothstep(.5, .7, mix(.5, B.a, kB))*(1. - cr);
  col = mix(col, vec3(.42, .36, .08)*(.35 + .65*max(dot(n, uSunDir), 0.)*length(uSunCol)*.35) + vec3(.3, .1, .02)*heat, sulf*.6);
  col += emi;
  o = vec4(fogged(col, vW, cr*.8), 1.); }`;

export function ensurePrograms(gfx) {
  if (gfx.P.v9ocean) return gfx.P;
  gfx.P.v9ocean = gfx.prog(OCEAN_VS, OCEAN_FS); gfx.P.v9cloud = gfx.prog(CLOUD_VS, CLOUD_FS);
  gfx.P.v9lava = gfx.prog(VS, LAVA_FS); gfx.P.v9rock = gfx.prog(VS, ROCK_FS);
  return gfx.P;
}

// ---------------------------------------------------------------- corridor clearance
// Is a sphere (centre p, radius r) clear of the racing corridor by `margin` metres? Checks every course sample near
// the point in the sample's own frame (along, lateral, vertical), so it also holds in banked turns and in loops.
export class Clearance {
  constructor(t, cell = 80) {
    this.t = t; this.cell = cell; this.map = new Map();
    for (let i = 0; i < t.N; i++) { const p = t.pos[i], R = Math.hypot(t.w[i], t.h[i]) + 4, c = cell;
      for (let x = Math.floor((p.x - R) / c); x <= Math.floor((p.x + R) / c); x++) for (let y = Math.floor((p.y - R) / c); y <= Math.floor((p.y + R) / c); y++) for (let z = Math.floor((p.z - R) / c); z <= Math.floor((p.z + R) / c); z++) {
        const k = x + ',' + y + ',' + z; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(i); } }
  }
  // lateral/vertical distance outside the corridor box (negative inside) for the nearest samples; null if none near
  sphere(p, r = 0, margin = 4) {
    const t = this.t, c = this.cell, R = r + margin;
    for (let x = Math.floor((p.x - R) / c); x <= Math.floor((p.x + R) / c); x++) for (let y = Math.floor((p.y - R) / c); y <= Math.floor((p.y + R) / c); y++) for (let z = Math.floor((p.z - R) / c); z <= Math.floor((p.z + R) / c); z++) {
      const a = this.map.get(x + ',' + y + ',' + z); if (!a) continue;
      for (const i of a) { const q = t.pos[i], dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, T = t.tan[i], B = t.bin[i], N = t.nrm[i];
        const al = dx * T.x + dy * T.y + dz * T.z; if (Math.abs(al) > t.D * 0.6 + R) continue;
        const lx = Math.abs(dx * B.x + dy * B.y + dz * B.z) - t.w[i], ly = Math.abs(dx * N.x + dy * N.y + dz * N.z) - t.h[i];
        if (lx < R && ly < R) return false; } }
    return true;
  }
  // a box given by its centre and three half-axis vectors: tested through spheres along its longest axis
  box(c, ax, ay, az, margin = 4) {
    const L = [ax, ay, az].map(a => a.len()), k = L.indexOf(Math.max(...L)), a = [ax, ay, az][k], other = [ax, ay, az].filter((_, j) => j !== k), r = Math.hypot(other[0].len(), other[1].len());
    const n = Math.max(1, Math.ceil(L[k] / Math.max(r, 2))), p = new Vec3();
    for (let s = -n; s <= n; s++) { p.copy(c).addScaled(a, s / n); if (!this.sphere(p, r, margin)) return false; }
    return true;
  }
}

// ---------------------------------------------------------------- geometry helpers
const UP = new Vec3(0, 1, 0), X1 = new Vec3(1, 0, 0);
// rotation taking +Z to direction d (and +Y toward up as far as possible)
export function qLook(d, up = UP) { const z = d.clone().normalize(), x = new Vec3().crossVectors(Math.abs(z.dot(up)) > 0.98 ? X1 : up, z).normalize(), y = new Vec3().crossVectors(z, x); return new Quat().fromBasis(x, y, z); }
// box spanning two points (a beam or a strut) with cross-section sx x sy
export function beam(g, a, b, sx, sy, col) { const d = new Vec3().subVectors(b, a), L = d.len(); g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, qLook(d)).box(sx, sy, L, col); return g; }
export function rod(g, a, b, r, seg, col) { const d = new Vec3().subVectors(b, a), L = d.len(); g.at((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, qLook(d)).cyl(r, r, L, seg, col, false); return g; }
// a square box truss between two points: four chords, battens and diagonals every `bay` metres
export function truss(g, a, b, size, bay, col, up = UP) {
  const d = new Vec3().subVectors(b, a), L = d.len(), z = d.clone().scale(1 / L), x = new Vec3().crossVectors(Math.abs(z.dot(up)) > 0.98 ? X1 : up, z).normalize(), y = new Vec3().crossVectors(z, x);
  const h = size / 2, cs = Math.max(0.25, size * 0.07), C = [[-h, -h], [h, -h], [h, h], [-h, h]], P = (s, cx, cy) => a.clone().addScaled(z, s).addScaled(x, cx).addScaled(y, cy);
  for (const [cx, cy] of C) beam(g, P(0, cx, cy), P(L, cx, cy), cs, cs, col);
  const n = Math.max(1, Math.round(L / bay));
  for (let k = 0; k <= n; k++) { const s = L * k / n; for (let e = 0; e < 4; e++) { const [ax, ay] = C[e], [bx, by] = C[(e + 1) % 4]; beam(g, P(s, ax, ay), P(s, bx, by), cs * 0.8, cs * 0.8, col);
    if (k < n) { const s2 = L * (k + 1) / n; beam(g, P(k % 2 ? s : s2, ax, ay), P(k % 2 ? s2 : s, bx, by), cs * 0.6, cs * 0.6, col); } } }
  return g;
}
// flat-shaded mesh from raw arrays (positions, normals, colours rgba, material) without the Geo transform overhead
export function rawMesh(gfx, pos, nor, col, mat, idx) { return gfx.mesh({ pos: Float32Array.from(pos), nor: Float32Array.from(nor), col: Float32Array.from(col), mat: Float32Array.from(mat), idx: Uint32Array.from(idx) }); }
// hemisphere (dome) for the cloud deck, radius 1, slightly below the horizon
export function domeGeo(seg = 48, rings = 16) {
  const g = new Geo();
  const rows = []; for (let j = 0; j <= rings; j++) { const el = -0.06 + (Math.PI / 2 + 0.06) * j / rings, row = []; for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; row.push(g.v(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a), 0, 1, 0, [1, 1, 1, 0])); } rows.push(row); }
  for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) g.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
  return g;
}
// small deterministic hash noise for CPU-side terrain and placement
export function hash2(x, z, s = 0) { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
export function vnoise2(x, z, s = 0) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; }
export function fbm2(x, z, s = 0, o = 5) { let a = 0.5, t = 0, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise2(x * f, z * f, s + i * 13); f *= 2.03; a *= 0.5; } return t; }
export function ridged2(x, z, s = 0, o = 5) { let a = 0.5, t = 0, f = 1, w = 1; for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vnoise2(x * f, z * f, s + i * 7) * 2 - 1); n *= n * w; w = Math.min(1, n * 2); t += a * n; f *= 2.07; a *= 0.5; } return t; }
