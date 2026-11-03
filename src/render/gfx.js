// GALACTIC RUSH V2 renderer: WebGL2, half-float HDR, PBR + prefiltered sky IBL, sun shadow map,
// MSAA, soft particles, HDR bloom, light shafts, SSAO, ACES tone mapping and a cinematic final pass.
import { mat4, Vec3 } from '../math.js';

const NOISE = `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a*noise(p); p = p*2.03+vec3(1.7,9.2,3.1); a *= .5; } return s; }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++) { s += a*noise(p); p = p*2.03+vec3(1.7,9.2,3.1); a *= .5; } return s + .0625; }
// band-limited fbm: fw = pixel footprint in p units; octaves finer than lim cycles/pixel fade to their mean,
// so detail never aliases into sparkle or into 2x2-quad blocks when it feeds a derivative bump
float fbmL(vec3 p, float fw, float lim){ float a = .5, s = 0., f = 1.; for (int i = 0; i < 5; i++) { float k = smoothstep(lim*.5, lim, fw*f); s += a*(k < .999 ? mix(noise(p), .5, k) : .5); p = p*2.03+vec3(1.7,9.2,3.1); f *= 2.03; a *= .5; } return s; }`;

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=8) in vec4 aMat;
layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aICol;
uniform mat4 uModel, uVP; uniform vec4 uColor;
out vec3 vN; out vec3 vW; out vec4 vC; out vec3 vL; out vec4 vM; out vec3 vLN; flat out vec4 vO;
void main(){ mat4 m = uModel*mat4(aI0,aI1,aI2,aI3); vec4 w = m*vec4(aPos,1.); vW = w.xyz; vL = aPos; vLN = aNor; vO = vec4(m[3].xyz, length(m[0].xyz)); /* instance origin and width: per-instance noise offsets, cylindrical facade mapping */
  mat3 a3 = mat3(m); vN = a3*(aNor/vec3(dot(a3[0], a3[0]), dot(a3[1], a3[1]), dot(a3[2], a3[2]))); /* inverse-transpose for rotation x non-uniform scale: tall curved towers keep horizontal normals */ vC = aCol*vec4(uColor.rgb*aICol.rgb, 1.); vC.a = clamp(aCol.a + aICol.a - 1. + (uColor.a - 1.), 0., 1.); vM = aMat;
  gl_Position = uVP*w; }`;

const PBR_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vC; in vec3 vL; in vec4 vM; in vec3 vLN; flat in vec4 vO;
uniform highp sampler3D uNoise; /* 64^3 tiling noise: r fbm, g fbm (finer), b cellular distance, a ridged */
uniform vec3 uCam, uSunDir, uSunCol, uFogCol, uRim; uniform vec4 uEng0, uEng1, uEng2; uniform float uFaction, uSeedS; uniform float uDS, uDecalX; uniform vec4 uStripe; uniform float uFog, uEnvInt, uTime, uOpacity, uDamage, uExpo;
uniform samplerCube uEnv; uniform sampler2DShadow uShadow; uniform mat4 uShadowVP; uniform float uShadowOn;
uniform vec4 uPL[4]; uniform vec3 uPLc[4]; uniform int uNPL;
uniform sampler2D uDecal; uniform vec4 uDecalBox; uniform float uDecalOn; uniform vec2 uFade, uFogH;
#ifdef M_CUSTOM
uniform vec4 uCu0; uniform vec3 uCuC[8]; /* V7 paint job (src/progress/customize.js): x on, y pattern, z finish, w special paint; primary, secondary, accent, secondary reference, paint second colour, engine glow, pattern frame (centre x, tail and nose z of the primary paint), part offset (control-surface hinge) */
#endif
out vec4 o;
${NOISE}
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
// interior mapping: the view ray continues into a box-shaped room behind each lit window (side walls, floor, a ceiling
// with a light panel, a back wall), so windows show depth and parallax without any extra geometry
float room(vec2 f, vec3 V, vec3 n, vec3 U, vec2 cs, float sd){ vec3 rd = vec3(dot(V, U)/cs.x, V.y/cs.y, max(dot(V, -n), .04)/cs.x), ro = vec3(f, 0.); float D = 1. + .8*sd;
  float tx = rd.x > 0. ? (1. - ro.x)/rd.x : ro.x/max(-rd.x, 1e-4), ty = rd.y > 0. ? (1. - ro.y)/rd.y : ro.y/max(-rd.y, 1e-4), tz = D/rd.z, t = min(min(tx, ty), tz); vec3 h = ro + rd*t;
  float k = t == tz ? .95 : t == ty ? (rd.y > 0. ? .6 + .9*(1. - smoothstep(.12, .2, abs(h.x - .5)))*(1. - smoothstep(.25, .35, abs(h.z/D - .45))) : .3) : .5 + .1*sd;
  return k*(1. - .4*h.z/D); }
// facade coordinates in metres: a flat projection on straight walls; on curved walls (V6) columns run around the
// instance's vertical axis, a fixed number per tier (multiple of 4), so mullions follow the curve and stay aligned
vec2 fq(vec3 n, float curved, float cw){ if (curved > .5) { float rl = length(vL.xz)*vO.w, nc = max(4., 4.*floor(6.2832*rl/(4.*cw) + .5)); return vec2((atan(vL.x, vL.z)/6.2832 + .5)*nc*cw, vW.y); }
  return abs(n.x) > abs(n.z) ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y); }
vec3 sm3(vec3 q){ vec3 t = q*64. - .5, i = floor(t), f = fract(t); return (i + .5 + f*f*(3. - 2.*f))/64.; } // C1 interpolation of the 64^3 noise volume when magnified
// p must be in the same (world) orientation as n: object-space positions with a world normal tilt the relief the wrong way on
// any rotated instance (V6 fix: callers pass vW/vO.w, world orientation at object scale, so relief still scales with the object)
vec3 bumpC(vec3 p, vec3 n, float h, float k, float mx){ vec3 dx = dFdx(p), dy = dFdy(p); float hx = dFdx(h)*k, hy = dFdy(h)*k; /* slope-limited: relief no finer than the pixels cannot tilt the normal past atan(mx) */
  vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1), ad = abs(det); vec3 g = sign(det)*(hx*r1 + hy*r2); g *= min(1., mx*ad/max(length(g), 1e-20)); return normalize(ad*n - g); }
vec3 bump(vec3 p, vec3 n, float h, float k){ vec3 dx = dFdx(p), dy = dFdy(p); float hx = dFdx(h)*k, hy = dFdy(h)*k;
  vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1); vec3 g = sign(det)*(hx*r1 + hy*r2); return normalize(abs(det)*n - g); }
float seams(vec3 p, vec3 n, vec3 s){ vec3 g = abs(fract(p/s) - .5); vec3 an = abs(n);
  float a = an.x > an.y && an.x > an.z ? max(g.y, g.z) : an.y > an.z ? max(g.x, g.z) : max(g.x, g.y);
  vec3 w = fwidth(p/s); float aa = max(max(w.x, w.y), w.z); return smoothstep(.5 - aa*1.5 - .012, .5 - .012, a)*(1. - smoothstep(.3, .6, aa)); }
#ifdef M_CUSTOM
// V7 paint patterns in the ship's own coordinates (metres; nose +z, up +y, starboard -x), centred on the primary paint's own
// centre line fr.x and spanning its length fr.y..fr.z. Returns how much of the secondary colour (x) and of the accent colour
// (y) covers this point. aa is the pixel footprint in metres: every edge is anti-aliased, and fine patterns fade to their
// average with distance instead of shimmering.
float cuBand(float x, float w, float aa){ return 1. - smoothstep(w - aa, w + aa, x); }
vec2 cuUV(vec3 p, vec3 a){ return a.y >= a.x && a.y >= a.z ? p.xz : a.x >= a.z ? p.zy : p.xy; }
vec2 cuPattern(float id, vec3 p, vec3 nl, float aa, vec3 fr){
  p.x -= fr.x; vec3 a = abs(nl); float wy = smoothstep(.25, .45, a.y);
  if (id < 1.5) return vec2(0.); // factory livery (its stripe is uStripe) and solid
  if (id < 2.5) return vec2(cuBand(abs(p.x), .15, aa), cuBand(abs(abs(p.x) - .2), .018, aa))*wy; // racing stripes
  if (id < 3.5) return vec2(cuBand(abs(abs(p.x) - .14), .06, aa), cuBand(abs(abs(p.x) - .225), .014, aa))*wy; // double stripes
  if (id < 4.5) { float c = p.z + .8*abs(p.x), d = abs(fract(c/.95) - .5)*.95; return vec2(cuBand(d, .17, aa*1.3), cuBand(abs(d - .2), .014, aa)); } // chevrons
  if (id < 5.5) { float l = cuBand(abs(p.x), .018, aa); return vec2(smoothstep(aa, -aa, p.x)*(1. - l), l); } // split: starboard secondary
  vec2 uv = cuUV(p, a);
  if (id < 6.5) { vec2 q = uv/.55, sk = vec2(q.x - q.y*.57735, q.y*1.1547), c = floor(sk), f = fract(sk); float up = step(1., f.x + f.y); // geometric triangles in three tones
    float t = h2(c*1.7 + up*13.1 + 3.), e = min(min(f.x, f.y), abs(1. - f.x - f.y))*.55*.866, k = smoothstep(.02, .05, aa), tone = t < .42 ? 0. : t < .76 ? 1. : .5;
    return vec2(mix(tone, .45, k), cuBand(e, .011, aa)*(1. - k)); }
  if (id < 7.5) { vec2 r = uv/.3, sg = vec2(1., 1.7320508), g1 = mod(r, sg) - sg*.5, g2 = mod(r - sg*.5, sg) - sg*.5, g = dot(g1, g1) < dot(g2, g2) ? g1 : g2, ag = abs(g); // honeycomb
    float hd = max(dot(ag, vec2(.5, .8660254)), ag.x), k = smoothstep(.015, .045, aa), wall = cuBand(.5 - hd, .055, aa/.3), fill = step(h2(floor((r - g)*2. + .5)), .2)*.55;
    return vec2(mix(max(wall, fill), .3, k), 0.); }
  if (id < 8.5) { float nz = h2(floor(uv/.3) + 7.)*.6 + h2(floor(uv/.12) + 31.)*.4, k = smoothstep(.02, .06, aa); return vec2(mix(nz < .4 ? 0. : nz < .66 ? 1. : .5, .45, k), 0.); } // digital camouflage
  float L = fr.z - fr.y, z0 = fr.y + .3*L, z1 = fr.z - .17*L; // industrial hazard: diagonal bands over the tail and the nose
  float zone = max(smoothstep(-aa, aa, z0 - p.z), smoothstep(-aa, aa, p.z - z1)), d = abs(fract((uv.x + uv.y)/.26) - .5)*.26;
  float st = cuBand(d, .065, aa), ln = cuBand(abs(p.z - z0), .014, aa) + cuBand(abs(p.z - z1), .014, aa);
  return vec2(zone*(1. - st), min(1., zone*st + ln)); }
#endif
float D_GGX(float nh, float a){ float a2 = a*a, d = nh*nh*(a2 - 1.) + 1.; return a2/(3.14159*d*d); }
vec2 envBRDF(float r, float nv){ vec4 c0 = vec4(-1., -.0275, -.572, .022), c1 = vec4(1., .0425, 1.04, -.04); vec4 r4 = r*c0 + c1;
  float a004 = min(r4.x*r4.x, exp2(-9.28*nv))*r4.x + r4.y; return vec2(-1.04, 1.04)*a004 + r4.zw; }
float shadowAt(vec3 w, vec3 n, float off){ if (uShadowOn < .5) return 1.; vec4 s = uShadowVP*vec4(w + n*off, 1.); vec3 p = s.xyz/s.w*.5 + .5;
  float edge = max(abs(p.x - .5), abs(p.y - .5))*2.; if (edge > 1. || p.z > 1. || p.z < 0.) return 1.;
  vec2 t = 1./vec2(textureSize(uShadow, 0)); float acc = 0.;
  for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) acc += texture(uShadow, vec3(p.xy + vec2(i, j)*t*.75, p.z - .00012));
  return mix(acc*.25, 1., smoothstep(.8, 1., edge)); }
void main(){
#ifdef FADE
  { float dth = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))); if (uFade.y > .5 ? dth < uFade.x : dth >= uFade.x) discard; } /* dithered LOD cross-fade */
#endif
  vec3 n = normalize(vN); vec3 v = normalize(uCam - vW); float dist = length(uCam - vW);
  vec3 gn = cross(dFdx(vW), dFdy(vW)); if (dot(gn, v) < 0.) gn = -gn; if (dot(n, gn) < 0.) n = -n;
  vec3 alb = pow(vC.rgb, vec3(2.2)); float emi = vC.a, metal = vM.x, rough = vM.y, det = vM.w; float ao = 1., clear = 0., so = .3, trans = 0.;
  float occ = 1.; if (det > 24.5 && det < 29.5) { occ = (det - 25.)*.25; det = 0.; } /* baked interiors: how much sun and sky reach in through the opening */
#ifdef M_CUSTOM
  float cuOn = uCu0.x, cuR = cuOn > .5 ? floor(fract(det)*10. + .5) : 0., cuAA = length(fwidth(vL))*.7; vec2 cuM = vec2(0.); /* paint region tagged in models.js */
  if (cuOn > .5 && det > .35 && det < .45) alb = pow(.55 + .45*uCuC[5], vec3(2.2)); // engine glow in the accent or exhaust colour
#endif
#ifdef M_HULL
  if (det > .5 && det < 1.5) { // ship hull: livery stripe, panels, rivets, grime, wear, clearcoat
    vec3 q = vL*uDS*.5;
#ifdef M_CUSTOM
    float fWearLo = .7, fWearHi = .86, fWearK = .7, fTrail = 1., fClear = 1.; // finish parameters; these defaults are the V6 paint
    if (cuOn > .5) { // V7 paint job: colours per region, pattern and special paint on the primary paint, finish on all painted panels
      if (cuR > .5 && cuR < 1.5) { float pt = uCu0.w, fr = 1. - max(dot(n, v), 0.); vec3 base = uCuC[0];
        if (pt > .5 && pt < 1.5) base = mix(uCuC[0], uCuC[4], smoothstep(.1, .85, fr)); else if (pt > 1.5 && pt < 2.5) base = mix(uCuC[0], uCuC[4], fr*fr*.75); // colour-shift and pearl paints
        cuM = cuPattern(uCu0.y, vL + uCuC[7], normalize(vLN), cuAA, uCuC[6]);
        alb = mix(mix(pow(base, vec3(2.2)), pow(uCuC[1], vec3(2.2)), clamp(cuM.x, 0., 1.)), pow(uCuC[2], vec3(2.2)), clamp(cuM.y, 0., 1.));
        if (pt > 2.5) emi = max(emi, .22*(1. - max(cuM.x, cuM.y))); } // neon paint: a soft self-glow
      else if (cuR > 1.5 && cuR < 2.5) alb = pow(min(vC.rgb*uCuC[1]/max(uCuC[3], vec3(.02)), vec3(1.)), vec3(2.2)); // trim tinted relative to its factory colour
      else if (cuR > 2.5 && cuR < 3.5) alb = pow(uCuC[2], vec3(2.2));
      if (vM.z > .5) { float fin = uCu0.z;
        if (fin > .5 && fin < 1.5) { metal = .04; rough = .74; fClear = 0.; } // matte
        else if (fin > 1.5 && fin < 2.5) { metal = .68; rough = .3; fClear = .75; } // metallic: metal flake in a tinted coat (keeps some diffuse colour)
        else if (fin > 2.5 && fin < 3.5) { metal = .86; rough = .4; fClear = 0.; fWearK = .2; } // brushed metal
        else if (fin > 3.5) { fWearLo = .5; fWearHi = .74; fWearK = .95; fTrail = 1.8; fClear = .35; alb = mix(alb, vec3(dot(alb, vec3(.3, .59, .11)))*1.1, .3); } } // worn paint
    }
#else
    const float fWearLo = .7, fWearHi = .86, fWearK = .7, fTrail = 1., fClear = 1.;
#endif
    if (vM.z > .5 && uStripe.w > 0. && abs(vLN.y) > .3) alb = mix(alb, pow(uStripe.rgb, vec3(2.2)), 1. - smoothstep(uStripe.w*.85, uStripe.w, abs(vL.x)));
    alb = mix(vec3(dot(alb, vec3(.3, .59, .11))), alb, .8); // weathered, film-like paint rather than toy-bright
    float fq = length(fwidth(q));
    float s = seams(q*1.6, vLN, vec3(1.3, .55, 1.1)); /* object-space patterns pick their plane from the object-space normal (V6 fix: the world normal picked the wrong plane on any ship not heading along a world axis) */ vec3 c = floor(q*9.); float riv = step(.975, h2(c.xz + c.y))*smoothstep(.15, .1, length(fract(q*9.) - .5))*(1. - smoothstep(.04, .09, fq*9.));
    // V6: inset access hatches with corner fasteners in some panels, and small stencilled marks on upper surfaces
    vec3 pq = q*1.6/vec3(1.3, .55, 1.1), cid = floor(pq), gq = fract(pq) - .5, an = abs(vLN); bool fx = an.x > an.y && an.x > an.z, fy = !fx && an.y > an.z;
    vec2 g2 = fx ? gq.yz : fy ? gq.xz : gq.xy, c2 = fx ? cid.yz : fy ? cid.xz : cid.xy; float hv = h2(c2*1.37 + cid.x*3.1 + cid.y*5.7 + cid.z*7.3 + 17.), fwq = length(fwidth(g2)), mark = 0.;
    if (hv > .74 && fwq < .08) { vec2 hsz = vec2(.17 + .12*fract(hv*13.), .13 + .1*fract(hv*29.)), hc = (vec2(fract(hv*7.), fract(hv*11.)) - .5)*.3, dd = abs(g2 - hc) - hsz;
      float hl = (1. - smoothstep(0., fwq*1.2 + .01, abs(max(dd.x, dd.y))))*(1. - smoothstep(.04, .08, fwq)); s = max(s, hl*.75);
      riv = max(riv, (1. - smoothstep(.012, .02 + fwq, length(abs(g2 - hc) - hsz + .04)))*(1. - smoothstep(.03, .06, fwq))); }
    else if (hv > .66 && fy && vLN.y > .55 && uFaction < .5) mark = (1. - smoothstep(.018 - fwq*.5, .018 + fwq*.5, abs(abs(g2.y) - .3)))*(1. - smoothstep(.22 - fwq, .22 + fwq, abs(g2.x - (hv - .7)*3.)))*(1. - smoothstep(.015, .03, fwq));
    float gr = fbmL(q*3.1, fq*3.1, .15); float h = (1. - s)*.4 - riv*.25 + gr*.1; n = bump(vW/vO.w, n, h, .45/max(uDS, .01));
    alb *= mix(.74, 1., 1. - s*.8)*(.9 + .2*gr); alb = mix(alb, fract(hv*31.) > .5 ? vec3(.62, .5, .2) : vec3(.6, .6, .58), mark*.75);
    // grime swept back along the hull from its seams and edges (the flow runs along local z), lighter on navy ships
    vec4 Gz = texture(uNoise, vec3(vL.x*.8, vL.y*.8, vL.z*.08) + .41); float trail = smoothstep(.48, .74, Gz.r)*(.55 + .45*s)*(1. - .5*max(vLN.y, 0.))*(uFaction > .5 ? .35 : 1.)*fTrail;
    alb *= 1. - trail*.2; rough = rough + trail*.12;
    float wear = smoothstep(fWearLo, fWearHi, fbmL(q*3.2 + 3., fq*3.2, .3))*fWearK*(.35 + .65*max(smoothstep(.3, .95, vLN.z), s)); // wear lives on leading edges and seams
    alb = mix(alb, vec3(.42, .43, .45), wear*.5*(1. - metal)); rough = clamp(rough + gr*.25 - .1 + wear*.25, .08, 1.); metal = mix(metal, .9, wear*.6);
    clear = (1. - wear)*fClear;
#ifdef M_CUSTOM
    if (cuOn > .5 && vM.z > .5) { float fin = uCu0.z;
      if (fin > 2.5 && fin < 3.5) { float bs = texture(uNoise, vec3(vL.x*7., vL.y*7., vL.z*.22) + .29).g; rough = clamp(rough + (bs - .5)*.32, .2, .7); alb *= .9 + .2*bs; } // brushing along the hull
      else if (fin > 1.5 && fin < 2.5) { float fl = h2(floor(vL.xz*140.) + floor(vL.y*140.)*.37), fk = 1. - smoothstep(.002, .006, cuAA); rough = clamp(rough + (fl - .5)*.2*fk, .15, 1.); } } // metal flake, close up only
#endif
    float sc = uDamage > 0. ? smoothstep(.55, .75, fbmL(q*2.3 + 9., fq*2.3, .3))*uDamage : 0.; /* scorch noise only on damaged hulls */ alb *= 1. - sc*.85; rough = mix(rough, 1., sc);
    float heat = 0., soot = 0.; // tempering colours close to each nozzle, a soot ring just beyond
    for (int i = 0; i < 3; i++) { vec4 e = i == 0 ? uEng0 : i == 1 ? uEng1 : uEng2; if (e.w <= 0.) continue; float dl = length(vL - e.xyz);
      heat = max(heat, smoothstep(e.w*2.3, e.w*.9, dl)); soot = max(soot, smoothstep(e.w*3.4, e.w*1.1, dl)); }
    vec3 temper = mix(vec3(.62, .45, .22), vec3(.28, .3, .62), smoothstep(.3, .9, heat));
    alb = mix(alb, temper*.55, heat*.6); metal = mix(metal, .95, heat*.7); rough = mix(rough, .38, heat*.5); clear *= 1. - heat; alb *= 1. - soot*(1. - heat)*.4*(.6 + .4*gr);
    float cuDs = 1., cuPt = 1.;
#ifdef M_CUSTOM
    if (cuOn > .5) { cuDs = 0.; cuPt = uCu0.z > 3.5 ? 1. : 0.; } // a custom paint job keeps its colours: no navy greying; patched grey panels only on worn paint
#endif
    if (uFaction > .5) { alb = mix(alb, vec3(dot(alb, vec3(.3, .59, .11)))*.9, .65*cuDs); rough *= .8; wear *= .3; } // navy: clean, glossy, near-monochrome greys
    else { vec3 pc = floor(q*1.6/vec3(1.3, .55, 1.1)); float pv = h2(pc.xz + pc.y*7.31 + uSeedS*13.); alb *= mix(1., .72 + .5*pv, .6*(1. - s)*(.4 + .6*cuPt)); alb = mix(alb, vec3(.36, .37, .38), step(.86, pv)*.7*(1. - s)*cuPt); } // independents: patched, mismatched panels
  }
  if (det > 1.5 && det < 2.5) { // canopy: coated glass (warm at grazing angles), a centre spine and frame ribs, faint instrument glow inside
    float fwc = length(fwidth(vL)), fr = max(1. - smoothstep(.035, .05 + fwc, abs(vL.x)), smoothstep(.455 - fwc, .47, abs(fract(vL.z*1.15) - .5)));
    fr *= 1. - smoothstep(.05, .12, fwc); rough = mix(.05, .5, fr); metal = mix(.9, .4, fr); alb = mix(mix(vec3(.04, .06, .08), vec3(.12, .085, .03), pow(1. - max(dot(n, v), 0.), 2.)), vec3(.08), fr); clear = 1. - fr;
    emi = max(emi, (1. - fr)*step(.985, h2(floor(vL.xz*24.)))*.6); alb += (1. - fr)*vec3(0., .02, .03)*step(.985, h2(floor(vL.xz*24.))); }
#endif
#ifdef M_ROCK
  if ((det > 2.5 && det < 3.5) || (det > 9.5 && det < 14.5)) { // V6 rock: object space, two fetches of the tiling noise volume instead of a dozen noise octaves; mipmaps band-limit it.
    // families: 10 ancient regolith, 11 metallic, 12 icy, 13 fractured, 14 layered formation; emissive strength 2 marks fresh fracture faces
    float fam = det > 9.5 ? floor(det - 9.5) : -1., fresh = step(1.5, vM.z);
    vec3 p = vL + fract(vO.xyz*.00731)*7., gx = dFdx(p), gy = dFdy(p), qa = p*.5, qb = p*2.3 + .37;
    float fwp = max(length(fwidth(p)), 1e-6), kA = clamp(fwp*48., 0., 1.), tA = .03125/fwp, tB = .0068/fwp, tN = .00172/fwp, tN2 = tN*.25; /* texel sizes of the fetches in pixels */
    /* every fetch samples plainly: a smoothstep texel remap would flatten each texel centre into a plateau, which material
       thresholds draw as squares and relief shades as a grid. Instead the fetches form an octave chain (each about 4x finer):
       a fetch's relief fades out once its texels pass ~2.5 px (trilinear kinks would shade as facets) while the next finer
       one fades in as its own texels reach a pixel, so some fetch near 1-2 px per texel always carries the relief */
    float wA = 1. - smoothstep(2.5, 8., tA), wB = 1. - smoothstep(2.5, 8., tB), wNa = smoothstep(.6, 1.2, tN), wN = wNa*(1. - smoothstep(2.5, 8., tN)), wN2 = smoothstep(.6, 1.2, tN2)*(1. - smoothstep(4., 12., tN2));
    vec4 A = textureGrad(uNoise, qa, gx*.85, gy*.85), B = vec4(.5, .5, .42, .3); /* gradients x1.7: the volume's finest octaves sit near its own Nyquist limit, so near 1:1 they would alias into speckle */
    if (tB > .3) B = mix(B, textureGrad(uNoise, qb, gx*3.9, gy*3.9), smoothstep(.3, .45, tB)); /* on small rocks the finer fetch is all but averaged out by its mipmaps: its mean instead of a fetch */
    float hn = 0., hn2 = 0.; if (tN > .55) { vec3 qn = p*9.1 + (A.rgb - .5)*2.; hn = textureGrad(uNoise, qn, gx*15.5, gy*15.5).r - .5; /* close up: finer fetches (shifted by coarser ones so they never tile visibly) for grain and relief, and to break up the magnified fetches' contours */
      if (tN2 > .55) { vec3 q2 = p*36.4 + (B.rgb - .5)*3.; hn2 = textureGrad(uNoise, q2, gx*62., gy*62.).r - .5; } }
    vec4 Bw = B + hn*wNa*.5;
    vec4 Aw = A + (B.grba - .5)*vec4(.3, .3, .2, .2); /* the finer fetch breaks up the large-scale contours, which magnified trilinear texels would draw as straight segments */
    so += .12*length(fwidth(vW))/max(length(fwidth(vL)), 1e-7); // offset grows with rock size so coarse facets never shadow themselves
    float reg = smoothstep(.36, .62, Aw.r + .25*Aw.g), field = smoothstep(.48, .66, Aw.g); /* craters gather in regions and fields instead of one per noise cell */
    /* craters from the cellular channel fade once its texels are magnified a few times (near a cell centre the trilinear cone has square contours); close up, the analytic field below takes over */
    float cA = 1. - smoothstep(3., 6., tA), cB = 1. - smoothstep(2.5, 5., tB), rA = smoothstep(.25, .7, tA), rB = smoothstep(.25, .7, tB); /* rA, rB: sharp features keep their colour but lose their relief once they shrink toward a pixel (per-quad derivatives would shade them as blocks) */
    float crat = smoothstep(.4, .12, Aw.b)*reg*cA, rim = smoothstep(.36, .46, Aw.b)*smoothstep(.6, .46, Aw.b)*reg*cA, r2 = mix(.1, .3, Bw.r), crat2 = smoothstep(r2, r2*.35, Bw.b)*field*cB, hA, hB, tex; rough = .88;
    /* relief in two parts: hA from the coarse fetch, hB from the finer one */
    if (fam < -.5) { hA = Aw.r*.6; hB = Bw.r*.3; tex = .7 + .45*Aw.r + .2*Bw.g; }
    else if (fam < .5) { /* ancient: dark space-weathered regolith, darker plains, brighter fresh ejecta around small craters */
      hA = Aw.r*.5 + (rim*.2 - crat*.4)*rA; hB = Bw.r*.15 - crat2*.16*rB; tex = mix(.58, 1.06, smoothstep(.32, .68, Aw.r))*(.86 + .28*Bw.g) + rim*.12 + crat2*.05; rough = .95; }
    else if (fam < 1.5) { /* metallic: dark mineral rock with exposed metal deposits, bright veins, rust in the hollows */
      /* veins: thin lines along a contour of the smooth field (thresholding the ridged channel near its peaks drew its texels as squares), in some parts only, anti-aliased and fading where thinner than a pixel */
      float dep = smoothstep(.68, .8, Aw.g + Bw.r*.1), vd = abs(Aw.r + (Bw.g - .5)*.12 - .56), fv = fwidth(vd) + 1e-4;
      float vein = (1. - smoothstep(.006, .016 + fv, vd))*min(1., .016/(fv*1.5))*smoothstep(.48, .64, Bw.g)*(1. - fresh*.5), mm = max(dep, vein*.8);
      hA = Aw.r*.4 + vein*.1*smoothstep(1.5, 4., .016/fv); hB = Bw.r*.22 - crat2*.15*rB; tex = mix(.6, 1.1, dep) + vein*.25 + Bw.g*.1;
      metal = mix(.12, .72, mm); rough = mix(.8 - Bw.r*.12, .52, mm) - fresh*.08; /* dull, hammered metal rather than chrome */
      alb = mix(alb, vec3(.2, .085, .035), smoothstep(.52, .7, Aw.r)*(1. - mm)*.55); }
    else if (fam < 2.5) { /* icy: layered ice with dust bands, translucent where clean, fractures of varying width that only some cells carry */
      float band = sin(dot(vL, vec3(.3, 1., .2))*9. + Aw.r*6.)*.5 + .5, dust = smoothstep(.6, .9, band*.7 + Bw.g*.4)*(1. - fresh*.7);
      float cd = abs(A.g + (B.r - .5)*.08 - .52), fc = fwidth(cd) + 1e-4, cd2 = abs(Bw.g - .5), fc2 = fwidth(cd2) + 1e-4; /* fractures along contours of the smooth fields, anti-aliased like the veins */
      float c1 = (1. - smoothstep(.008, .022 + fc, cd))*min(1., .022/(fc*1.5))*smoothstep(.46, .66, Aw.r + (B.r - .5)*.3), c2 = (1. - smoothstep(.006, .015 + fc2, cd2))*min(1., .015/(fc2*1.5))*smoothstep(.55, .75, Aw.r)*.35, crack = c1 + c2;
      hA = Aw.r*.3 - (c1*smoothstep(1.5, 4., .022/fc) + c2*smoothstep(1.5, 4., .015/fc2))*.3; hB = Bw.g*.06; tex = .95 + .12*Bw.r; /* a groove's relief needs a few pixels of width */
      alb = mix(alb, alb*vec3(.32, .52, .85), crack*.75); alb = mix(alb, vec3(.09, .085, .08), dust*.55); alb *= mix(.92, 1.1, fresh);
      rough = mix(.3, .55, Bw.g)*(1. - crack*.3) + dust*.2 - fresh*.1; trans = (1. - dust)*(.5 + .3*fresh); }
    else if (fam < 3.5) { /* fractured: weathered skin over fresh, fine-grained broken faces */
      hA = Aw.r*.35; hB = Bw.r*.3*(1. + fresh) - crat2*.12*(1. - fresh)*rB; tex = mix(.74 + .3*Aw.g, .95 + .2*Bw.g, fresh); rough = mix(.9, .78, fresh); }
    else { /* layered formation: strata of different material with ledges */
      float y = dot(vL, vec3(.24, .94, .24))*3.4 + Aw.r*.8, band = fract(y), led = smoothstep(.0, .1, band)*(1. - smoothstep(.85, .95, band));
      hA = led*.4*rA + Aw.g*.2; hB = Bw.r*.3; tex = mix(.55, 1.1, hash(vec3(floor(y), 3., 7.)))*(.85 + .3*Bw.g); rough = .9; }
    float h = hA + hB; tex *= (1. + hn*.35*wNa)*(1. + hn2*.2*wN2); /* close up: grain and pitting instead of magnified volume texels */
    float hb = (hA - .3)*wA + (hB - .1)*wB + hn*wN*.45 + hn2*wN2*.16;
    if (fam < .5 && kA < .6) { /* close up, the ancient family's craters come from an analytic field (two sizes, raised rims) instead of magnified texels */
      float cr = 0.; int NL = kA < .32 ? 2 : 1; for (int L = 0; L < 2; L++) { if (L >= NL) break; float cs = L == 0 ? .34 : .12, wl = L == 0 ? 1. : smoothstep(.32, .22, kA); vec3 c = p/cs, b0 = floor(c - .5);
        for (int k = 0; k < 8; k++) { vec3 cell = b0 + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1)); float hh = hash(cell + float(L)*17.);
          if (hh > .6) continue; float rr = .2 + .26*fract(hh*7.3), Rm = rr*cs, d = length(c - cell - vec3(fract(hh*13.1), fract(hh*29.7), fract(hh*43.9)))/rr;
          if (d < 2.) cr += wl*smoothstep(3., 6., Rm/fwp)*Rm*(.36*(d*d - 1.)*(1. - smoothstep(.75, 1., d)) + .07*exp(-(d - 1.)*(d - 1.)/.09)); } } /* craters only a few pixels across fade (their bump would shade as single quads) */ /* continuous through the rim: no step for the bump to outline */ /* bowls about a fifth as deep as they are wide, soft raised rims (heights in rock units) */
      float kc = smoothstep(.6, .45, kA); hb += cr*kc*11.; tex *= 1. + clamp(cr*kc*1.5, -.2, .1); }
    n = bumpC(vW/vO.w, n, hb, .07, .7); alb *= tex; ao = .72 + .28*clamp(h + .3, 0., 1.);
  }
#endif
#ifdef M_STRUCT
  if (det > 3.5 && det < 4.5) { // structure: world panels, grime, bump
    vec3 wq = vW*uDS; float s = seams(wq, n, vec3(16., 10., 16.)); float g = fbmL(wq*.05, length(fwidth(wq))*.05, .15); float h = (1. - s) + g*.4; n = bump(vW, n, h, .55/uDS);
    alb *= (.7 + .45*h2(floor(wq.xz/16.) + floor(wq.y/10.)))*(.75 + .4*g)*(1. - s*.55); rough = clamp(rough + g*.3 - .15, .15, 1.); ao = .8 + .2*(1. - s);
  }
#endif
#ifdef M_FACADE
  float curved = step(19.5, det)*step(det, 24.5); det -= 15.*curved; /* V6: facades on surfaces of revolution */
  vec3 tU = curved > .5 ? normalize(vec3(n.z, 0., -n.x) + 1e-5) : (abs(n.x) > abs(n.z) ? vec3(0., 0., 1.) : vec3(1., 0., 0.));
  float mechOff = floor(h2(floor(vO.xz*.01))*16.); /* every 16th floor is a mechanical floor, offset per building */
  if (det > 4.5 && det < 5.5) { // facade: floors of windows that fade to their average once cells get small on screen
    vec2 q = fq(n, curved, 3.2)*vec2(1./3.2, 1./4.2);
    vec2 c = floor(q), f = fract(q), w = curved > .5 ? vec2(length(fwidth(vW.xz))/3.2, fwidth(vW.y)/4.2) : fwidth(q); float px = max(w.x, w.y);
    float floorLit = step(.4, h2(vec2(c.y, floor(vW.x*.013) + floor(vW.z*.017)*7.)));
    float lit = step(.42, h2(c))*floorLit, win = smoothstep(.1, .16, f.x)*smoothstep(.9, .84, f.x)*smoothstep(.2, .26, f.y)*smoothstep(.84, .78, f.y)*step(abs(n.y), .6);
    float mech = step(15.5, mod(c.y + mechOff, 16.)); win *= 1. - mech; lit *= 1. - mech; alb = mix(alb, alb*(.45 + .35*step(.5, fract(f.y*7.))), mech*(1. - smoothstep(.07, .32, px)));
    float lod = smoothstep(.07, .32, px), e2 = mix(lit*win, .16*(1. - mech*.8), lod), glass = mix(win, .4, lod);
    n = normalize(n + (vec3(h2(c + 11.), h2(c + 17.), h2(c + 23.)) - .5)*.07*(1. - lod)*win); /* panes sit a degree or two off true: sun glints break up pane by pane */
    vec3 wc = mix(vec3(1., .72, .42), vec3(.55, .76, 1.), step(.62, h2(c + 7.)));
    float blind = step(.55, h2(c + 31.))*(.25 + .6*h2(c + 37.)); wc *= mix(1., .3, step(1. - blind, f.y)*(1. - lod)); /* blinds part-way down in some offices */
    if (lod < .99 && lit*win > 0.) wc *= mix(room(f, normalize(vW - uCam), n, tU, vec2(3.2, 4.2), h2(c + 9.)), 1., lod);
    alb = mix(alb, alb*.4, glass); alb = mix(alb, wc*mix(.55 + .5*h2(c + 3.), .75, lod), e2); emi = max(emi, e2);
    float ledge = 1. - smoothstep(.0, .025, abs(fract(vW.y/48.) - .5) - .475); alb *= 1. - ledge*.5; rough = mix(.3, .55, ledge); metal = .4;
    rough = max(rough, .3 + .35*lod); /* far facades average many panes: a broad, dim lobe instead of one smooth tower-wide glare */
  }
  if (det > 5.5 && det < 9.5) { // building facades: 6 residential, 7 glass curtain wall, 8 brutalist concrete, 9 industrial cladding
    float wall = step(abs(n.y), .6), id = floor(det + .5);
    vec2 cs = id < 6.5 ? vec2(6., 3.4) : id < 7.5 ? vec2(1.6, 4.) : id < 8.5 ? vec2(5., 3.6) : vec2(9., 7.), q = fq(n, curved, cs.x);
    vec2 qq = q/cs, c = floor(qq), f = fract(qq), w2 = curved > .5 ? vec2(length(fwidth(vW.xz)), fwidth(vW.y))/cs : fwidth(qq); float px = max(w2.x, w2.y), lod = smoothstep(.08, .35, px);
    float rnd = h2(c), fl = h2(vec2(c.y, floor(vW.x*.011) + floor(vW.z*.013)*5.)), win = 0., lit = 0.; vec3 wc = vec3(1., .74, .46); vec2 rc = c, rf = f, rs = cs; /* room cell */
    if (id < 6.5) { // residential: window bands over balcony slabs, warm and varied rooms
      win = smoothstep(.06, .12, f.x)*smoothstep(.94, .88, f.x)*smoothstep(.3, .36, f.y)*smoothstep(.9, .84, f.y);
      alb *= 1. - (1. - smoothstep(.0, .08, f.y))*.4*(1. - lod); lit = step(.45, rnd)*step(.25, fl); wc = mix(vec3(1., .64, .36), vec3(1., .86, .66), h2(c + 4.));
    } else if (id < 7.5) { // glass curtain wall: mullions, spandrels, open-plan office floors (one room spans four bays)
      float mul = max(1. - smoothstep(.0, .08, f.x), smoothstep(.92, 1., f.x)), spd = 1. - smoothstep(.0, .18, f.y);
      rc = vec2(floor(qq.x*.25), c.y); rf = vec2(fract(qq.x*.25), f.y); rs = vec2(cs.x*4., cs.y);
      float mech = step(15.5, mod(c.y + mechOff, 16.)); spd = max(spd, mech); alb *= 1. - mech*(.45 - .3*step(.5, fract(f.y*7.)))*(1. - lod); /* mechanical floor: louvres, no glass */
      win = (1. - mul)*(1. - spd); lit = step(.6, fl)*step(.4, h2(rc)); wc = mix(vec3(1., .88, .7), vec3(.84, .9, 1.), step(.65, h2(rc + 2.)))*.6; /* tinted glass: warm and neutral office light */ rough = mix(.5, .25, win*(1. - lod*.6)); metal = mix(.55, 0., win); // panes are dielectric glass: sky reflections, no blinding sun glints
    } else if (id < 8.5) { // brutalist concrete: deep window slots, board-formed texture
      win = smoothstep(.36, .4, f.x)*smoothstep(.64, .6, f.x)*smoothstep(.15, .2, f.y)*smoothstep(.85, .8, f.y);
      alb *= .82 + .3*fbmL(vec3(q.x*.5, q.y*4., 0.), px*4., .3); lit = step(.7, rnd)*step(.4, fl); rough = .92; metal = 0.;
    } else { // industrial cladding: corrugated ribs, rust streaks, a few small lit windows
      float rib = mix(.5 + .5*sin(q.x*10.47), .5, smoothstep(.2, .5, fwidth(q.x)*1.67));
      alb *= (.8 + .25*rib)*(.8 + .35*fbmL(vec3(q.x*.05, q.y*.3, 1.), length(fwidth(q))*.3, .3)); metal = .55; rough = .62;
      win = smoothstep(.45, .47, f.x)*smoothstep(.55, .53, f.x)*smoothstep(.6, .62, f.y)*smoothstep(.72, .7, f.y); lit = step(.6, rnd); wc = vec3(1., .62, .3);
    }
    float blind = step(.6, h2(rc + 31.))*(.25 + .55*h2(rc + 37.)); wc *= mix(1., .3, step(1. - blind, f.y)*(1. - lod)*step(id, 7.5)); /* blinds part-way down */
    if (id < 8.5 && lod < .99 && lit*win > 0.) wc *= mix(room(rf, normalize(vW - uCam), n, tU, rs, h2(rc + 9.)), 1., lod);
    win *= wall; float e2 = mix(lit*win, id < 6.5 ? .13 : id < 7.5 ? .06 : .05, lod)*wall;
    n = normalize(n + (vec3(h2(c + 11.), h2(c + 17.), h2(c + 23.)) - .5)*.07*(1. - lod)*win); rough = max(rough, .3 + .35*lod); /* per-pane glints near, broad dim lobe far: no tower-wide sun glare */
    alb = mix(alb, alb*.35, win*(1. - lod)); alb = mix(alb, wc*(.5 + .6*h2(rc + 3.)), e2); emi = max(emi, e2);
  }
#endif
#ifdef M_CAPITAL
  if (det > 14.5 && det < 15.5) { // capital-ship plating in object space: big plates, panel seams that fade with distance, grime, rows of lit windows
    vec3 q = vL, n0 = normalize(vLN); float fq = length(fwidth(q));
    float s1 = seams(q, n0, vec3(26., 9., 32.)), s2 = seams(q + vec3(3.1, 1.7, 4.3), n0, vec3(6.5, 3., 8.));
    vec3 pc = floor(q/vec3(26., 9., 32.)); float pv = h2(pc.xz + pc.y*7.13), gg = fbmL(q*.02, fq*.02, .2), gr = fbmL(q*.35, fq*.35, .3);
    vec3 sq = vec3(q.x*.09, q.y*.5, q.z*.012); float streak = fbmL(sq, length(fwidth(sq)), .3);
    float h = (1. - s1)*.7 + (1. - s2)*.25 + gr*.12; n = bump(vW/vO.w, n, h, .35);
    alb *= (.92 + .14*pv)*(.86 + .22*gg)*(1. - s1*.3 - s2*.12)*(1. - smoothstep(.55, .78, streak)*.3);
    rough = clamp(rough + (gg - .5)*.25 + s1*.1, .2, 1.); ao = .78 + .22*(1. - s1);
    vec2 wq = abs(n0.x) > abs(n0.z) ? vec2(q.z, q.y) : vec2(q.x, q.y), wg = wq/vec2(4.2, 3.1), wc = floor(wg), wf = fract(wg);
    float side = step(abs(n0.y), .45), row = step(.72, h2(vec2(wc.y*1.7, floor(wc.x/24.) + 3.)))*side, wl = max(fwidth(wg.x), fwidth(wg.y));
    float win = row*step(.35, h2(wc + 5.))*smoothstep(.25, .32, wf.x)*smoothstep(.75, .68, wf.x)*smoothstep(.3, .37, wf.y)*smoothstep(.7, .63, wf.y);
    float e2 = mix(win, row*.08, smoothstep(.12, .45, wl)); alb = mix(alb, vec3(1., .78, .52)*.9, e2); emi = max(emi, e2*1.2);
  }
  if (det > 15.5 && det < 16.5) { // V6 cargo containers: corrugated walls, faded and patched paint, rust gathering at the edges and in streaks
    vec3 q = vL, an = abs(vLN); float fq = length(fwidth(q)), u = an.x > an.y && an.x > an.z ? q.z : an.z > an.y ? q.x : q.x + q.z;
    float cor = sin(u*2.6)*(1. - smoothstep(.25, .7, fq*2.6)); n = bump(vW/vO.w, n, cor*.5, .3);
    vec4 R = texture(uNoise, q*.021 + .17), Rs = texture(uNoise, vec3(q.x*.05, q.y*.012, q.z*.05) + .53);
    alb = mix(alb, vec3(dot(alb, vec3(.3, .59, .11))), .3)*(.82 + .3*R.g); alb = mix(alb, vec3(.26, .13, .07), max(smoothstep(.6, .78, R.r), smoothstep(.62, .8, Rs.r)*.7)*.65);
    rough = .72 + .2*R.b; metal = .25; ao = .85 + .15*abs(cor);
  }
#endif
#ifdef M_HULL
  if (uDecalOn > .5 && det > .5 && det < 1.5 && vM.z > .5) { vec2 uv = (vec2(-sign(vL.x)*(vL.z - uDecalBox.x), vL.y - uDecalBox.y)/uDecalBox.zw)*.5 + .5;
    if (abs(vLN.x) > .45 && abs(vL.x) < uDecalX && uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) { vec4 d = texture(uDecal, uv); alb = mix(alb, pow(d.rgb, vec3(2.2)), d.a); } }
#endif
  float nv = max(dot(n, v), 1e-3); vec3 f0 = mix(vec3(.04), alb, metal); float a = max(rough*rough, .002);
  vec3 col = vec3(0.);
  vec3 L = uSunDir; vec3 h = normalize(L + v); float nl = max(dot(n, L), 0.), nh = max(dot(n, h), 0.), vh = max(dot(v, h), 0.);
  vec3 F = f0 + (1. - f0)*pow(1. - vh, 5.); float k = (rough + 1.)*(rough + 1.)/8.; float G = nv/(nv*(1. - k) + k)*nl/(nl*(1. - k) + k);
  vec3 spec = min(D_GGX(nh, a)*G*F/max(4.*nv*nl, 1e-3), vec3(30.))*smoothstep(0., .12, nv); vec3 kd = (1. - F)*(1. - metal); /* no runaway sun glare off surfaces seen edge-on */
  float sh = nl > 0. ? shadowAt(vW, n, so)*occ : 0.;
  col += (kd*alb/3.14159 + spec)*uSunCol*nl*sh*3.14159;
  for (int i = 0; i < 4; i++) { if (i >= uNPL) break; vec3 Lp = uPL[i].xyz - vW; float d = length(Lp); Lp /= d; float att = clamp(1. - d/uPL[i].w, 0., 1.); att *= att;
    vec3 hp = normalize(Lp + v); float nlp = max(dot(n, Lp), 0.); col += (kd*alb + f0*D_GGX(max(dot(n, hp), 0.), max(a, .05))*.25)*uPLc[i]*nlp*att; }
  vec3 Fr = f0 + (max(vec3(1. - rough), f0) - f0)*pow(1. - nv, 5.); vec2 ab = envBRDF(rough, nv);
  vec3 R = reflect(-v, n); vec3 pre = min(textureLod(uEnv, R, rough*5.).rgb, vec3(6.)); vec3 irr = textureLod(uEnv, n, 5.).rgb;
  col += ((1. - Fr)*(1. - metal)*alb*irr + pre*(f0*ab.x + ab.y))*uEnvInt*ao*(.1 + .9*occ*occ);
  if (clear > 0.) { float fc = .04 + .96*pow(1. - nv, 5.); col += min(textureLod(uEnv, R, .6).rgb, vec3(6.))*fc*clear*uEnvInt*.6 + uSunCol*D_GGX(nh, .03)*fc*nl*sh*clear*.04; }
  if (trans > 0.) col += alb*uSunCol*trans*(.05*max(dot(n, L)*.5 + .5, 0.) + .4*pow(max(dot(-v, L), 0.), 4.)*pow(1. - nv, 2.));
  col += uRim*pow(1. - nv, 3.)*.6;
  col += alb*emi*vM.z;
  float fog = 1. - exp(-uFog*uFog*dist*dist);
  if (uFogH.y > 0.) { float hc = (uCam.y - uFogH.x)/uFogH.y, hp = (vW.y - uFogH.x)/uFogH.y, dh = hp - hc, od = abs(dh) > 1e-3 ? (exp(-hc) - exp(-hp))/dh : exp(-hc); /* height fog: mean density along the ray, dense in the depths, thin up high */
    fog = 1. - exp(-uFog*uFog*dist*dist*clamp(od, 0., 1.)*2.4); }
  vec3 fogC = uFogCol + uSunCol*.045*pow(max(dot(-v, uSunDir), 0.), 6.); col = mix(col, fogC, fog*(1. - min(emi, 1.)*.6));
  o = vec4(col*uOpacity, uOpacity);
}`;

const FS_TRI = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv; void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform mat4 uInvVP; uniform vec3 uCam, uSunDir, uSunCol, uNebA, uNebB, uNebC, uBase; uniform float uSeed, uNeb, uStars, uStudio; uniform vec3 uZen, uHor; uniform float uAtmoSky, uEnvPass, uNebBake, uUseCube;
uniform highp sampler3D uNoise; uniform samplerCube uNebCube;
out vec4 o;
${NOISE}
// V6: the sky's six fbm fields come from the tiling noise volume (one fetch each instead of five noise octaves)
float tf(vec3 x){ return texture(uNoise, x*.25).r; }
void main(){
  vec4 p = uInvVP*vec4(vUv*2.-1., 1., 1.); vec3 d = normalize(p.xyz/p.w - uCam);
  vec3 bn = normalize(vec3(.35, .82, .45)); float bd = dot(d, bn), band = exp(-bd*bd/.035), lane; vec3 col;
  if (uUseCube > .5) { vec4 nb = texture(uNebCube, d); col = nb.rgb; lane = nb.a; } /* V6: the static nebula, dust and galactic band are baked once per course into a cube map */
  else { vec3 dn = normalize(d*40000. - uCam); float n = tf(dn*2.1 + uSeed); float m = tf(dn*4.3 + n*1.6 + uSeed*1.7); float far = tf(d*1.1 + uSeed*.3);
    float neb = smoothstep(.42, .95, n*.62 + m*.58)*uNeb; float back = smoothstep(.35, .9, far)*uNeb*.5;
    col = uBase + uNebB*back*.35 + mix(uNebA, uNebB, smoothstep(.3,.8,m))*neb*1.2 + uNebC*pow(neb, 3.)*1.6;
    col = mix(vec3(dot(col, vec3(.3, .59, .11))), col, .7); // keep nebulae from saturating the whole sky
    float dust = smoothstep(.55, .85, tf(d*7. + uSeed)); col *= 1. - dust*.45*uNeb;
    lane = smoothstep(.45, .7, tf(d*9. + uSeed*.7)); col += vec3(.55, .5, .45)*band*(.03 + .05*tf(d*22. + uSeed))*(1. - lane*.8)*max(uStars, uNebBake);
    if (uNebBake > .5) { o = vec4(col, lane); return; } }
  for (int l = 0; l < 2; l++) { float k = l == 0 ? 90. : 230.; vec3 q = d*k; vec3 c = floor(q);
    float h = hash(c + float(l)*17.); vec3 sp = c + .5 + (vec3(hash(c+1.), hash(c+2.), hash(c+3.)) - .5)*.7;
    float s = smoothstep(.09 + .05*float(l), 0., length(q - sp))*step(.82 + .1*float(l), h);
    col += s*mix(vec3(.7,.8,1.), vec3(1.,.85,.7), hash(c+5.))*(3. - float(l)*1.2)*uStars; }
  // galactic band (in col above): a soft river of unresolved stars with dark dust lanes, plus a fine star layer concentrated in it
  { vec3 q = d*520.; vec3 c = floor(q); float h = hash(c + 31.); vec3 sp = c + .5 + (vec3(hash(c+7.), hash(c+8.), hash(c+9.)) - .5)*.6;
    col += smoothstep(.07, 0., length(q - sp))*step(.93 - band*.2, h)*(1. - lane*.7)*vec3(.8, .85, 1.)*.9*uStars; }
  float sd = max(dot(d, uSunDir), 0.); col += uSunCol*((pow(sd, 1800.)*60. + pow(sd, 200.)*2.)*(1. - uEnvPass) + pow(sd, 18.)*.25 + pow(sd, 3.)*.04); /* the lighting cubemap leaves out the disc: the sun is lit analytically, never twice */
  if (uAtmoSky > .5) { // planet-side sky: horizon glow under a dark zenith, sun halo, faint stars overhead
    vec3 c2 = mix(uHor, uZen, smoothstep(-.02, .5, d.y)); c2 *= smoothstep(-.35, -.02, d.y)*.75 + .25;
    c2 += uSunCol*(pow(sd, 5.)*.035 + (pow(sd, 60.)*.1 + pow(sd, 1800.)*12.)*(1. - uEnvPass)); /* a halo that does not burn out the gaps between towers */ c2 += col*smoothstep(.15, .7, d.y)*.18; col = c2; }
  if (uStudio > .5) { vec3 c2 = mix(vec3(.004, .005, .007), vec3(.025, .027, .033), smoothstep(-.2, .8, d.y));
    if (d.y > .2) { float sx = d.x/d.y; c2 += vec3(1., .96, .9)*smoothstep(.1, .065, abs(abs(sx) - .42))*smoothstep(.2, .45, d.y)*7.; }
    c2 += vec3(.5, .68, 1.)*smoothstep(.72, .9, -d.z)*smoothstep(-.1, .25, d.y)*smoothstep(.65, .3, abs(d.x))*3.5;
    c2 += vec3(1., .78, .55)*smoothstep(.8, .95, d.x)*smoothstep(-.3, .15, d.y)*smoothstep(.55, .2, abs(d.z))*1.6;
    c2 += uSunCol*pow(sd, 300.)*14.; col = c2; }
  o = vec4(col, 1.);
}`;

const PREFILTER_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform mat4 uInvVP; uniform samplerCube uCube; uniform float uRough; out vec4 o;
void main(){ vec4 p = uInvVP*vec4(vUv*2.-1., 1., 1.); vec3 N = normalize(p.xyz/p.w);
  vec3 up = abs(N.y) < .99 ? vec3(0,1,0) : vec3(1,0,0); vec3 T = normalize(cross(up, N)), B = cross(N, T);
  vec3 acc = vec3(0.); float tot = 0.; float a = uRough*uRough;
  for (int i = 0; i < 64; i++) { vec2 xi = vec2(fract(float(i)*.618034), (float(i) + .5)/64.);
    float ph = 6.28318*xi.x, ct = sqrt((1. - xi.y)/(1. + (a*a - 1.)*xi.y)), st = sqrt(1. - ct*ct);
    vec3 H = normalize(T*cos(ph)*st + B*sin(ph)*st + N*ct); vec3 L = normalize(2.*dot(N, H)*H - N); float nl = dot(N, L);
    if (nl > 0.) { acc += min(textureLod(uCube, L, uRough*5.).rgb, vec3(40.))*nl; tot += nl; } }
  o = vec4(acc/max(tot, 1e-4), 1.); }`;

// V6 planets. The surface patterns are procedural (the shared noise volume plus analytic lineae and storms) but they are
// baked once per course into cube maps in the planet's own frame (albedo and relief; clouds and hot spots in a second
// map), so a planet costs one or a few cube fetches per pixel however much of the sky it fills; time turns the lookup
// (gas giants shear band by band, haze decks and weather drift). The body and a thin back-face shell share one
// atmosphere model: optical depth along the actual view ray through an exponential atmosphere (scale height uAtm.x,
// vertical depth uAtm.y), lit where the ray meets sunlight, so the limb is brightest at the surface and fades with
// altitude instead of drawing an outline. Ring systems shade the planet through the ring's own radial profile.
const PLANET_COMMON = `
float hs(float n){ return fract(sin(n*12.9898 + 4.1)*43758.5453); }
vec4 N3(vec3 p){ return texture(uNoise, p); }
vec3 h33(vec3 c){ uvec3 v = uvec3(ivec3(c) + 4096)*1664525u + 1013904223u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; v ^= v >> 16u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; return vec3(v)*(1./4294967295.); }
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z); }
vec3 rotA(vec3 p, vec3 k, float a){ float c = cos(a), s = sin(a); return p*c + cross(k, p)*s + k*dot(k, p)*(1. - c); }
vec3 SO;
float cloudD(vec3 q, bool det){ // rocky-world weather (in the cloud layer's own drifting frame): decks, three mid-latitude cyclones, wet and dry belts
  for (int i = 0; i < 3; i++) { float f = float(i)*2.17 + uSeed*.13, lo = hs(f)*6.2832, la = (.5 + .3*hs(f + .5))*(i == 1 ? -1. : 1.);
    vec3 c = vec3(cos(la)*cos(lo), sin(la), cos(la)*sin(lo)); q = rotA(q, c, 2.6*sign(la)*exp(-(1. - dot(q, c))*42.)); }
  vec4 W = N3(q*.33 + SO.zxy), C = N3(vec3(q.x, q.y*1.8, q.z)*1.05 + (W.rgb - .5)*.45 + SO.yxz);
  float la = abs(q.y), cov = .07*exp(-q.y*q.y/.005) + .1*exp(-pow((la - .74)/.13, 2.)) - .1*exp(-pow((la - .42)/.12, 2.));
  float d = C.r*.6 + W.r*.4 - .54 + cov;
  if (det) { vec4 D = N3(vec3(q.x, q.y*1.5, q.z)*3.6 + SO); d += (D.g - .5)*.17 + (D.a - .2)*.05; }
  return d; }
// the surface pattern at direction p of the planet's frame: albedo (sRGB), relief and a glow mask
void surf(vec3 p, float PX, out vec3 alb, out float hgt, out float em){ alb = vec3(.5); hgt = 0.; em = 0.;
  if (uType < .5) { // rocky: continents and highlands with ridged ranges
    vec4 A = N3(p*.42 + SO), B = N3(p*1.75 + (A.rgb - .5)*.3 + SO.yzx);
    hgt = A.r*.68 + B.r*.32 + (B.a - .2)*.1*smoothstep(.48, .62, A.r);
    alb = mix(uColB, uColA, smoothstep(.33, .47, hgt)); alb = mix(alb, uColC, smoothstep(.5, .66, hgt)*.85); alb *= .86 + .28*B.g;
  }
  else if (uType < 1.5) { // gas giant: sheared zonal bands, turbulent filaments, ovals, and a great storm the turbulence wraps round
    vec3 q = p;
    float slo = hs(uSeed*.71)*6.2832, sla = -.34; vec3 sc = vec3(cos(sla)*cos(slo), sin(sla), cos(sla)*sin(slo)), e1 = normalize(cross(vec3(0., 1., 0.), sc)), e2 = cross(sc, e1);
    vec2 sp = vec2(dot(q, e1)/.17, dot(q, e2)/.075); float se = dot(sp, sp) + step(dot(q, sc), 0.)*99.;
    q = rotA(q, sc, -2.4*exp(-se*.8));
    vec4 T1 = N3(vec3(q.x*.5, q.y*2.5, q.z*.5) + SO), T2 = N3(vec3(q.x*1.55, q.y*6.2, q.z*1.55) + (T1.rgb - .5)*.4 + SO.yzx);
    float la = p.y + (T1.r - .5)*.06 + (T2.g - .5)*.02;
    float zone = smoothstep(.32, .68, (sin(la*uBands)*.5 + .5)*.72 + (sin(la*uBands*2.37 + 1.9)*.5 + .5)*.28);
    alb = mix(uColB, uColA, zone); alb = mix(alb, uColC, smoothstep(.6, .8, T2.r)*(.3 + .45*zone)); alb *= 1. - (1. - zone)*smoothstep(.52, .72, T2.a)*.32;
    vec4 T3 = N3(vec3(q.x*5.2, q.y*19., q.z*5.2) + (T2.rgb - .5)*.25 + SO.zxy); alb *= 1. + (T3.r - .5)*.3; /* fine filaments */
    float obd = exp(-pow((abs(p.y) - .56)/.035, 2.)) + exp(-pow((p.y - .2)/.03, 2.)); vec4 S = N3(vec3(q.x*1.25, q.y*3.1, q.z*1.25) + SO.zxy);
    float ov = smoothstep(.24, .1, S.b)*obd;
    alb = mix(alb, uColC*1.04, ov*.75);
    vec3 red = mix(uColB, vec3(.72, .32, .2), .5);
    alb = mix(alb, mix(red, uColC, smoothstep(0., .5, se)*.4 + (T2.r - .5)*.6), smoothstep(1.15, .7, se)); alb = mix(alb, uColC, exp(-pow((se - 1.35)/.22, 2.))*.45);
    hgt = T2.r*.55 + T1.r*.25 + zone*.2 + ov*.3 + T3.r*.2; }
  else if (uType < 2.5) { // icy moon: bright ice, dust-stained provinces, chaos terrain, a dense web of ridged plains, lineae from hairlines to broad bands
    vec4 A = N3(p*.45 + SO), B = N3(p*2.3 + (A.rgb - .5)*.2 + SO.yzx), C = N3(p*4.2 + SO.zxy);
    vec3 brown = mix(uColB, vec3(.56, .37, .27), .72), tan = mix(uColA, brown, .35);
    alb = mix(uColA, uColC, smoothstep(.4, .66, A.r)); alb = mix(alb, tan, smoothstep(.5, .72, A.g + (B.g - .5)*.2)*.6);
    // ridged plains: sets of fine parallel ridges whose direction turns from region to region
    vec3 rp = rotA(p, normalize(A.rgb - .5 + .001), A.a*4.); vec4 Rg = N3(vec3(rp.x*3., rp.y*12., rp.z*3.) + SO.zxy);
    float rid = smoothstep(.45, .9, Rg.a)*clamp(PX*12.*100., 0., 1.)*(1. - smoothstep(.006, .02, PX)); alb *= 1. - rid*.07; /* albedo only: as relief, ridges this fine would sparkle at low sun */
    vec3 pw = normalize(p + (A.rgb - .5)*.05 + (B.rgb - .5)*.012);
    // chaos terrain: plates of the older ridged plains broken apart, shifted and turned in a darker, hummocky matrix.
    // The plates are the cells of a Voronoi field (exact F1/F2 over 27 neighbours: this runs once, in the bake): at the
    // region's margins they stay packed with thin cracks between them, toward its centre they drift apart or melt away.
    float chaos = smoothstep(.27, .12, A.b + (B.r - .5)*.5 + (C.g - .5)*.24)*.92;
    if (chaos > .001) {
      vec3 x = pw*27. + SO*4., ci = floor(x), cf = x - ci, id = ci; float F1 = 9., F2 = 9.;
      for (int k = 0; k < 27; k++) { vec3 o3 = vec3(float(k % 3), float((k/3) % 3), float(k/9)) - 1., r = o3 + h33(ci + o3)*.86 + .07 - cf; float d = dot(r, r);
        if (d < F1) { F2 = F1; F1 = d; id = ci + o3; } else if (d < F2) F2 = d; }
      vec3 hp = h33(id + 17.); float e = sqrt(F2) - sqrt(F1);
      float gap = mix(.04, .34, chaos*chaos*(.3 + .7*hp.x)), plate = smoothstep(gap, gap + .06, e)*step(chaos*.28, hp.y);
      vec3 pr = rotA(p, normalize(hp - .5 + .001), hp.z*6.28); vec4 Pr = N3(vec3(pr.x*3., pr.y*12., pr.z*3.) + SO.zxy), M = N3(p*13. + SO.yzx);
      vec3 plateC = mix(alb, uColA, .35)*(1. - smoothstep(.45, .9, Pr.a)*.1)*(.94 + .1*hp.x), matC = mix(brown*.85, tan, .25 + M.r*.55)*(.86 + .26*M.g);
      alb = mix(alb, mix(matC, plateC, plate), chaos); hgt += chaos*(plate*(.035 + .02*hp.z) + (1. - plate)*(M.r - .5)*.04); }
    for (int i = 0; i < 64; i++) { float f = float(i)*1.618 + uSeed*.37, fine = step(27.5, float(i)); /* 28 lineae, then 36 finer, shorter fractures */
      vec3 n = normalize(vec3(hs(f), hs(f + .31), hs(f + .73)) - .5), u = normalize(cross(n, abs(n.y) < .9 ? vec3(0., 1., 0.) : vec3(1., 0., 0.))), v = cross(n, u);
      float al = atan(dot(pw, v), dot(pw, u)), r1 = hs(f + .11), r2 = hs(f + .57), r3 = hs(f + .93), wide = step(.78, r1);
      float s = dot(pw, n) - (r1 - .5)*.5 + .018*r3*abs(sin(al*(4. + floor(r2*5.))))*step(.75, r2)*(1. - wide); /* small circles; some narrow ones scalloped like cycloidal ridges */
      wide *= 1. - fine;
      float on = smoothstep(0., .35, sin(al*(1. + floor(r2*2.5) + fine*(2. + floor(r1*3.))) + r3*6.28) + .2 + r1*.5 - fine*.75);   /* each linea runs along parts of its circle only */
      float w = mix(.0014 + .004*r2, .006 + .009*r3, wide)*mix(1., .55, fine)*(.55 + .45*sin(al*(3. + r3*4.) + f))*on, br = (1. - on)*on*.02;   /* swells and pinches; splays at its tips */
      float d = min(abs(s - br), abs(s + br)), fw = fwidth(s) + 1e-6;
      float line = (1. - smoothstep(w*.3, w + fw, d))*min(1., w/(fw*1.5)), core = (1. - smoothstep(0., w*.3 + fw*.5, d))*wide;
      alb = mix(alb, brown*(.75 + .35*r3), line*(.6 + .35*r2)*(1. - fine*.45)); alb = mix(alb, mix(uColA, tan, .4), core*.55);   /* younger lineae cross over older ones; broad bands have paler centres */
      hgt += exp(-d*d/(w*w*4. + fw*fw*9.))*(r2 > .45 ? .5 : -.4)*w*13.; }
  }
  else { // a volcanic world under sulphur haze: zonal decks, convective cells, hot spots glowing through on the night side
    vec3 q = p;
    vec4 A = N3(vec3(q.x*.5, q.y*1.7, q.z*.5) + SO), B = N3(vec3(q.x*1.7, q.y*4.2, q.z*1.7) + (A.rgb - .5)*.45 + SO.yzx), Hh = N3(q*1.3 + SO.zxy);
    float deck = A.r*.58 + B.r*.42;
    alb = mix(uColB, uColA, smoothstep(.36, .6, deck)); alb = mix(alb, uColC, smoothstep(.56, .74, deck + (B.a - .25)*.18)*.55);
    hgt = deck + B.a*.1; em = smoothstep(.22, .08, Hh.b)*smoothstep(.45, .6, Hh.r); }
}`;
const PLANET_BAKE_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform mat4 uInvVP; uniform float uType, uSeed, uBands, uMode; uniform vec3 uColA, uColB, uColC; uniform vec4 uHS; uniform highp sampler3D uNoise; out vec4 o;
${PLANET_COMMON}
void main(){ vec4 pp = uInvVP*vec4(vUv*2. - 1., 1., 1.); vec3 q = normalize(pp.xyz/pp.w); SO = fract(vec3(.1372, .2713, .4191)*uSeed)*8.; float PX = length(fwidth(q));
  vec3 alb; float hgt, em; surf(q, PX, alb, hgt, em);
  if (uMode > .5) { o = vec4(uType < .5 ? clamp(cloudD(q, true)*1.6 + .5, 0., 1.) : 0., em, 0., 1.); return; } /* second map: cloud density (rocky), hot spots (haze world) */
  o = vec4(clamp(alb, 0., 1.), clamp(hgt*uHS.x + uHS.y, 0., 1.)); } /* relief scaled per world to use the 8 bits it has (quantised relief would speckle at low sun) */`;
const PLANET_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec3 vL; in vec4 vM;
uniform vec3 uSunDir, uCam, uAtmo, uPC, uAx, uAy, uAz, uRingN; uniform vec4 uAtm, uRingP;
uniform float uType, uShell, uBands, uTime, uBright, uPR, uTexD; uniform vec4 uHS;
uniform sampler2D uRingT; uniform samplerCube uSkyEnv, uSurf, uAux; uniform float uSkyAdd;
out vec4 o;
vec3 toL(vec3 w){ return vec3(dot(w, uAx), dot(w, uAy), dot(w, uAz)); }
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z); }
vec3 bumpN(vec3 P, vec3 N, float h, float k){ vec3 dx = dFdx(P), dy = dFdy(P); float hx = dFdx(h)*k, hy = dFdy(h)*k;
  vec3 r1 = cross(dy, N), r2 = cross(N, dx); float det = dot(dx, r1); if (abs(det) < 1e-14) return N; return normalize(abs(det)*N - sign(det)*(hx*r1 + hy*r2)); }
vec3 skyCol(float mus){ return mix(uAtmo*vec3(1.2, .62, .4), uAtmo, smoothstep(-.05, .32, mus)); }
float phase(float c){ float c2 = max(c, 0.)*max(c, 0.), c4 = c2*c2; return .75*(1. + c*c) + 1.3*c4*c4; }
void main(){
  vec3 sl = toL(uSunDir), vl = toL(normalize(uCam - vW)); float Hs = uAtm.x, kk = uAtm.y;
  if (uShell > .5) { // the halo beyond the limb: grazing optical depth at the ray's closest approach, lit if that point sees the sun
    vec3 oc = toL(uCam - uPC)/uPR, rd = -vl; float tc = -dot(oc, rd); vec3 pt = oc + rd*tc; float b = length(pt);
    if (b < 1. || tc < 0.) { o = vec4(0.); return; }
    float tau = kk*sqrt(6.2832/Hs)*exp(-(b - 1.)/Hs), mus = dot(pt/b, sl);
    vec3 I = (1. - exp(-tau))*smoothstep(-.16, .22, mus)*phase(dot(rd, sl))*skyCol(mus)*uAtm.z*smoothstep(uAtm.w, mix(1., uAtm.w, .55), b);
    o = vec4(I*uBright, 1.); return; }
  vec3 p = normalize(vL); float mu = max(dot(p, vl), 0.), ndl = dot(p, sl), PX = length(fwidth(p));
  // where the baked pattern has drifted to: gas giants shear band by band, haze decks drift, rock and ice stay put
  vec3 q = p; if (uType > .5 && uType < 1.5) q = rotY(p, uTime*(.0012 + .0035*sin(p.y*uBands*.5 + 1.3))); else if (uType > 2.5) q = rotY(p, uTime*.0012);
  vec4 Sf = texture(uSurf, q); vec3 alb = Sf.rgb; float hgt = (Sf.a - uHS.y)/uHS.x, ca = 0., csh = 1., cd = 0., lim = 1.; vec3 cc = vec3(0.), em = vec3(0.);
  float kb = (uType < .5 ? .09 : uType < 1.5 ? .045 : uType < 2.5 ? .03 : .07)*clamp(PX*uTexD, 0., 1.); /* relief fades where the baked texels are magnified */
  if (uType < .5) { // weather floats above the ground (parallax toward the limb) and shades it (shadows offset away from the sun)
    float hc = .011, sv = -mu + sqrt(mu*mu + 2.*hc + hc*hc), ms = max(ndl, 0.), ss = -ms + sqrt(ms*ms + 2.*hc + hc*hc), dr = uTime*.0025;
    cd = (texture(uAux, rotY(normalize(p + vl*sv), dr)).r - .5)/1.6; float ds = (texture(uAux, rotY(normalize(p + sl*ss), dr)).r - .5)/1.6;
    ca = smoothstep(0., .16, cd); csh = 1. - .55*smoothstep(0., .16, ds); cc = vec3(.6, .62, .66)*(.72 + .28*smoothstep(0., .4, cd)); }
  else if (uType < 1.5) lim = mix(.62, 1., sqrt(mu));
  else if (uType > 2.5) { lim = mix(.6, 1., sqrt(mu)); em = vec3(1., .3, .08)*texture(uAux, q).g*.03; }
  float rsh = 1.; // ring shadow across the planet
  if (uRingP.w > .5) { float dn = dot(sl, uRingN); if (abs(dn) > 1e-3) { float t = -dot(p, uRingN)/dn; if (t > 0.) { float u = (length(p + sl*t) - uRingP.x)/(uRingP.y - uRingP.x);
    if (u > 0. && u < 1.) rsh = 1. - texture(uRingT, vec2(u, .5)).a*.92; } } }
  float airless = step(1.5, uType)*step(uType, 2.5), soft = mix(.1, .02, airless);
  vec3 nb = bumpN(p, p, hgt, kb); float Ls = max(max(dot(nb, sl), ndl*.45), 0.)*smoothstep(-soft, soft, ndl); /* relief only a pixel or two wide never shades blacker than half the smooth sphere: no speckle along the terminator */ Ls = pow(Ls, mix(.8, .7, airless))*1.12; /* a little flatter than Lambert: rough, porous surfaces back-scatter */
  alb = alb*alb*(.75 + .25*alb)*mix(vec3(1.), mix(vec3(1., .58, .4), vec3(1.), smoothstep(0., .3, ndl)), min(1., kk*5.)); /* ~ pow(alb, 2.2), without three pow() per pixel */
  vec3 col = alb*(Ls*csh*rsh*lim*1.25 + .004) + em;
  if (uType < .5) { vec3 nc = bumpN(p, p, cd, .05); float Lc = max(dot(nc, sl)*.8 + .2, 0.)*smoothstep(-.06, .12, ndl);
    col = mix(col, cc*(Lc*rsh*1.3 + .006)*mix(vec3(1., .62, .45), vec3(1.), smoothstep(0., .3, ndl)), ca); }
  float tau = kk/(mu + sqrt(2.*Hs/3.1416)); // atmosphere between the surface and the eye
  col = col*exp(-tau) + (1. - exp(-tau))*smoothstep(-.15, .3, ndl)*phase(dot(-vl, sl))*skyCol(ndl)*uAtm.z;
  col *= uBright; if (uSkyAdd > .5) col += textureLod(uSkyEnv, normalize(vW - uCam), 1.).rgb*(1. - smoothstep(5000., 8000., length(uCam))); /* seen from under an atmosphere: the sky's own light lies in front of the body */
  o = vec4(col, 1.);
}`;

// Rings: the radial profile (opacity and colour of every ringlet and gap) is a 1-D texture built once from the course
// seed, so the shader is one filtered fetch; mip-mapping keeps fine ringlets from shimmering at grazing angles.
// Seen from the unlit face, only the thin parts glow with light that passes through them; looking sunward through
// thin dust brightens it (forward scattering); a slanted line of sight crosses more particles.
const RING_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec3 vL; in vec4 vM;
uniform vec3 uSunDir, uPlanet, uCam; uniform float uInner, uPR, uSkyAdd; uniform sampler2D uRingT; uniform samplerCube uSkyEnv;
out vec4 o;
void main(){ float u = (length(vL.xz) - uInner)/(1. - uInner); vec4 t = texture(uRingT, vec2(clamp(u, 0., 1.), .5));
  vec3 n = normalize(vN), v = normalize(uCam - vW); float ls = dot(n, uSunDir), lv = dot(n, v);
  float a = (1. - pow(1. - min(t.a, .995), 1./max(abs(lv), .3)))*step(0., u)*step(u, 1.);
  vec3 tp = vW - uPlanet; float al = dot(tp, -uSunDir), sh = al > 0. ? .1 + .9*smoothstep(uPR*.985, uPR*1.015, length(tp + uSunDir*al)) : 1.;
  float lit = ls*lv >= 0. ? 1. : (1. - t.a)*1.5 + .05, fwd = pow(max(dot(-v, uSunDir), 0.), 6.)*(1. - t.a)*2.5;
  vec3 c = t.rgb*sh*(1.3*lit + fwd); if (uSkyAdd > .5) c += textureLod(uSkyEnv, -v, 1.).rgb*(1. - smoothstep(5000., 8000., length(uCam))); o = vec4(c*a, a); }`;

const UNLIT_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec3 vL; in vec4 vM;
uniform float uOpacity, uInt, uTime, uTexOn, uMode; uniform sampler2D uTex; uniform vec3 uCam;
out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float hexd(vec2 p){ p = abs(p); return max(p.x, dot(p, vec2(.5, .866))); }
float hexEdge(vec2 p){ vec2 r = vec2(1., 1.732), hr = r*.5; vec2 a = mod(p, r) - hr, b = mod(p - hr, r) - hr; vec2 g = dot(a, a) < dot(b, b) ? a : b; return smoothstep(.40, .5, hexd(g)); }
void main(){ vec3 c = pow(vC.rgb, vec3(2.2))*uInt; float a = uOpacity; vec3 v = normalize(uCam - vW); vec3 n = normalize(vN); float fr = abs(dot(n, v));
  if (uTexOn > .5) { vec4 t = texture(uTex, vL.xy + .5); c *= t.rgb*1.2; a *= t.a; }
  if (uMode > .5 && uMode < 1.5) { a *= .78 + .22*sin(vW.y*4. - uTime*12.); a *= .88 + .12*step(.5, h2(vec2(floor(uTime*24.), 1.))); }
  else if (uMode > 1.5 && uMode < 2.5) { float z = clamp(-vL.z, 0., 1.); float sd = .62 + .38*sin(z*30. - uTime*55.); float core = pow(fr, 1.5);
    a *= (1. - smoothstep(.25, 1., z))*core*sd; c = mix(c, vec3(3.2, 2.9, 2.6)*uInt*.4, (1. - z)*core*.6*clamp(uInt - .8, 0., 1.)); }
  else if (uMode > 2.5 && uMode < 3.5) { float f = sin(vW.x*.13 + uTime*1.3)*sin(vW.z*.11 - uTime*.9) + sin((vW.x + vW.z)*.37 + uTime*2.)*.4; c *= .5 + .5*f*f; }
  else if (uMode > 3.5 && uMode < 4.5) { vec3 d = normalize(vL); vec2 p = vec2(atan(d.z, d.x)*2.6, d.y*4.2)*1.5 + vec2(uTime*.1, 0.); float e = hexEdge(p);
    float rim = pow(1. - fr, 2.2); a *= rim*.85 + e*(.25 + rim*.6) + .03; }
  else if (uMode > 4.5 && uMode < 5.5) { float z = clamp(-vL.z, 0., 1.); a *= (1. - z)*(1. - z)*pow(fr, 1.2)*.6; }
  else if (uMode > 5.5 && uMode < 6.5) { float sw = sin(atan(vL.y, vL.x)*3. + uTime*6. + vL.z*4.); a *= .55 + .45*sw; c *= 1. + .5*pow(fr, 4.); }
  o = vec4(c*a, a); }`;

const HEX_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec3 vL; in vec4 vM;
uniform vec3 uShip, uTint, uCam; uniform vec4 uHits[4]; uniform float uTime, uOpacity;
out vec4 o;
float hexd(vec2 p){ p = abs(p); return max(p.x, dot(p, vec2(.5, .866))); }
void main(){ vec2 p = vC.xy*12.; vec2 r = vec2(1., 1.732), hr = r*.5;
  vec2 a = mod(p, r) - hr, b = mod(p - hr, r) - hr; vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 fw = fwidth(p); float aa = max(fw.x, fw.y);
  float e = smoothstep(.43 - aa, .5, hexd(g))*(1. - smoothstep(.12, .45, aa));
  float d = length(vW - uShip); float near = smoothstep(32., 3., d);
  float rip = 0.; for (int i = 0; i < 4; i++) { float age = uTime - uHits[i].w; if (age < 0. || age > 1.2) continue;
    float dd = length(vW - uHits[i].xyz); rip += smoothstep(3., 0., abs(dd - age*34.))*(1. - age/1.2)*1.6 + smoothstep(12., 0., dd)*(1. - age/1.2)*.8; }
  float a2 = (e*(.02 + near*.75) + near*near*.05 + rip*(.35 + e))*uOpacity;
  o = vec4(pow(uTint, vec3(2.2))*a2*1.5, a2); }`;

const BB_VS = `#version 300 es
layout(location=0) in vec2 aCorner; layout(location=1) in vec4 aCS; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aDir;
uniform mat4 uVP, uView; uniform vec3 uCam, uRight, uUp; uniform float uTanHalf, uCap;
out vec2 vUv; out vec4 vCol; out float vS; out float vDepth;
void main(){ vec3 c = aCS.xyz; float depth = -(uView*vec4(c, 1.)).z; float s = min(aCS.w, max(depth, .1)*uTanHalf*uCap); vec3 p;
  if (aDir.w > 0.) { vec3 d = normalize(aDir.xyz + 1e-6); vec3 side = normalize(cross(d, normalize(c - uCam)) + 1e-5); p = c + d*aCorner.y*min(aDir.w, max(depth, .1)*uTanHalf*1.2)*.5 + side*aCorner.x*s; vS = 1.; }
  else { p = c + (uRight*aCorner.x + uUp*aCorner.y)*s; vS = aDir.w < -.5 ? 2. : 0.; }
  vUv = aCorner; vCol = aCol; vDepth = -(uView*vec4(p, 1.)).z; gl_Position = uVP*vec4(p, 1.); }`;
const BB_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in float vS; in float vDepth; uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft; out vec4 o;
void main(){ float r = vS > .5 && vS < 1.5 ? abs(vUv.x) : length(vUv); float a;
  if (vS > 1.5) a = smoothstep(.7, .9, r)*smoothstep(1., .9, r); else { a = smoothstep(1., 0., r); a *= a; }
  if (vS > .5 && vS < 1.5) a *= smoothstep(1., .5, abs(vUv.y));
  a *= smoothstep(.25, 2.2, vDepth);
  if (uSoft > .5) { float z = texture(uDepth, gl_FragCoord.xy/uRes).r*2. - 1.; float sd = 2.*uNear*uFar/(uFar + uNear - z*(uFar - uNear)); a *= clamp((sd - vDepth)*.5, 0., 1.); }
  a *= vCol.a; o = vec4(vCol.rgb*a, a); }`;

const DEPTH_FS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.); }`;
const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uTh; out vec4 o;
void main(){ vec3 c = (texture(uTex, vUv + uTexel*vec2(-1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(-1,1)).rgb + texture(uTex, vUv + uTexel*vec2(1,1)).rgb)*.25;
  c = min(c, vec3(16.)); float l = max(c.r, max(c.g, c.b)); float knee = uTh*.5; float sk = clamp(l - uTh + knee, 0., 2.*knee); sk = sk*sk/(4.*knee + 1e-4);
  o = vec4(c*max(sk, l - uTh)/max(l, 1e-4), 1.); }`;
const DOWN_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb*.5; c += (texture(uTex, vUv + uTexel*vec2(-1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(-1,1)).rgb + texture(uTex, vUv + uTexel*vec2(1,1)).rgb)*.125; o = vec4(c, 1.); }`;
const UP_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uK; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb*4.; c += (texture(uTex, vUv + uTexel*vec2(-1,0)).rgb + texture(uTex, vUv + uTexel*vec2(1,0)).rgb + texture(uTex, vUv + uTexel*vec2(0,-1)).rgb + texture(uTex, vUv + uTexel*vec2(0,1)).rgb)*2.;
  c += texture(uTex, vUv + uTexel*vec2(-1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(1,-1)).rgb + texture(uTex, vUv + uTexel*vec2(-1,1)).rgb + texture(uTex, vUv + uTexel*vec2(1,1)).rgb; o = vec4(c/16.*uK, 1.); }`;
const SHAFT_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uScene, uDepth; uniform vec2 uSun; uniform float uK; out vec4 o;
void main(){ vec2 d = (uSun - vUv)/40.; vec2 p = vUv; vec3 acc = vec3(0.); float w = 1.;
  for (int i = 0; i < 40; i++) { float sky = step(.99999, texture(uDepth, p).r); vec3 c = texture(uScene, p).rgb; acc += min(c, vec3(6.))*sky*w; w *= .965; p += d; }
  o = vec4(acc/40.*uK, 1.); }`;
const AO_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uDepth; uniform mat4 uInvP, uP; uniform vec2 uTexel; out vec4 o;
vec3 vp(vec2 uv){ float z = texture(uDepth, uv).r*2. - 1.; vec4 p = uInvP*vec4(uv*2. - 1., z, 1.); return p.xyz/p.w; }
void main(){ vec3 p = vp(vUv); if (-p.z > 400.) { o = vec4(1.); return; } vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  float occ = 0., ang = fract(sin(dot(vUv, vec2(12.9898, 78.233)))*43758.5)*6.283; float rad = 2.2;
  for (int i = 0; i < 12; i++) { float fi = float(i); float a = ang + fi*2.39996; float rr = (fi + 1.)/12.;
    vec3 s = p + (vec3(cos(a), sin(a), 0.)*rr + n*.6)*rad; vec4 q = uP*vec4(s, 1.); vec2 uv = q.xy/q.w*.5 + .5;
    float sz = vp(uv).z; float range = smoothstep(0., 1., rad/abs(p.z - sz)); occ += step(s.z + .15, sz)*range; }
  o = vec4(vec3(1. - occ/12.*.85), 1.); }`;
const BLUR_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb*.227; c += (texture(uTex, vUv + uDir*1.385).rgb + texture(uTex, vUv - uDir*1.385).rgb)*.316;
  c += (texture(uTex, vUv + uDir*3.231).rgb + texture(uTex, vUv - uDir*3.231).rgb)*.07; o = vec4(c, 1.); }`;
const COMP_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uScene, uBloom, uShaft, uAO, uDepthC, uStreak, uDirt; uniform float uStreakK, uDirtK, uBars; uniform vec4 uHeat[2]; uniform vec4 uFlare; uniform vec3 uFlareCol; uniform float uAspect;
uniform float uBloomK, uRadial, uVig, uFlash, uExpo, uGrain, uCA, uTime, uSat, uContrast, uAOOn, uShaftOn; uniform vec3 uFlashCol, uLift, uGain;
out vec4 o;
const mat3 AIN = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
const mat3 AOUT = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
vec3 aces(vec3 c){ c = AIN*c; vec3 a = c*(c + .0245786) - .000090537; vec3 b = c*(.983729*c + .4329510) + .238081; return clamp(AOUT*(a/b), 0., 1.); }
void main(){ vec2 d = vUv - .5; float dl = length(d); vec2 uv = vUv;
  for (int i = 0; i < 2; i++) { vec4 h = uHeat[i]; if (h.w <= 0.) continue; vec2 q = (vUv - h.xy)/h.z; float k = smoothstep(1., 0., length(q))*h.w;
    uv += vec2(sin(vUv.y*170. + uTime*42.), cos(vUv.x*150. - uTime*37.))*.004*k; }
  vec3 c;
  if (uCA > .001) { vec2 off = d*uCA*.012; c = vec3(texture(uScene, uv - off).r, texture(uScene, uv).g, texture(uScene, uv + off).b); } else c = texture(uScene, uv).rgb;
  if (uRadial > .001) { vec3 acc = c; for (int i = 1; i < 8; i++) acc += texture(uScene, uv - d*uRadial*float(i)*.0065).rgb; c = mix(c, acc/8., smoothstep(.1, .5, dl)); }
  if (uAOOn > .5) c *= texture(uAO, vUv).r;
  vec3 bl = texture(uBloom, vUv).rgb*uBloomK; c += bl*(1. + texture(uDirt, vUv).r*uDirtK) + texture(uStreak, vUv).rgb*uStreakK*vec3(.45, .68, 1.);
  if (uShaftOn > .5) c += texture(uShaft, vUv).rgb;
  if (uFlare.z > .001) { float vis = 0.; for (int i = 0; i < 5; i++) { vec2 o = vec2(float(i % 3) - 1., float(i / 3) - .5)*.006; vis += step(.99999, texture(uDepthC, uFlare.xy + o).r); } vis /= 5.;
    vec2 sv = uFlare.xy, ax = vec2(.5) - sv; vec3 fl = vec3(0.);
    for (int i = 0; i < 5; i++) { float t = float(i)*.42 + .3; vec2 p = sv + ax*t*2.; float r = .02 + .035*fract(float(i)*.37); vec2 dd = (vUv - p)*vec2(uAspect, 1.);
      fl += mix(uFlareCol, vec3(.4, .7, 1.), fract(float(i)*.61))*smoothstep(r, r*.4, length(dd))*.12; }
    vec2 ds = (vUv - sv)*vec2(uAspect, 1.); fl += uFlareCol*exp(-abs(ds.y)*160.)*exp(-abs(ds.x)*3.)*.5 + uFlareCol*exp(-length(ds)*22.)*.25;
    c += fl*vis*uFlare.z; }
  c *= uExpo; c = aces(c);
  float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, uSat); c = (c - .5)*uContrast + .5; c = c*uGain + uLift*(1. - c);
  float lt = dot(c, vec3(.2126, .7152, .0722)); c *= mix(vec3(.95, 1., 1.06), vec3(1.05, 1., .95), smoothstep(.08, .75, lt)); // teal shadows, warm highlights
  c *= mix(1., smoothstep(1., .25, dl*1.15), uVig);
  c += uFlash*uFlashCol;
  c = pow(clamp(c, 0., 1.), vec3(1./2.2));
  c += (fract(sin(dot(vUv + fract(uTime), vec2(12.9898, 78.233)))*43758.5453) - .5)*uGrain;
  c *= step(abs(vUv.y - .5), .5 - uBars);
  o = vec4(c, 1.); }`;

// V6: tiling 3D noise volume, rendered once slice by slice. Every octave repeats over the tile, so it tiles seamlessly;
// r: fbm (4 cells per tile), g: finer fbm (8), b: cellular distance to the nearest feature point (5), a: ridged fbm (6)
const NOISE3_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform float uZ; out vec4 o;
float hp(vec3 i, float P){ i = mod(i, P); return fract(sin(dot(i, vec3(127.1, 311.7, 74.7)))*43758.5453); }
float pn(vec3 x, float P){ vec3 i = floor(x), f = fract(x); f = f*f*(3. - 2.*f);
  return mix(mix(mix(hp(i, P), hp(i + vec3(1,0,0), P), f.x), mix(hp(i + vec3(0,1,0), P), hp(i + vec3(1,1,0), P), f.x), f.y),
             mix(mix(hp(i + vec3(0,0,1), P), hp(i + vec3(1,0,1), P), f.x), mix(hp(i + vec3(0,1,1), P), hp(i + vec3(1,1,1), P), f.x), f.y), f.z); }
float pfbm(vec3 u, float P, int oct){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a*pn(u*P, P); n += a; P *= 2.; a *= .5; } return s/n; }
float worley(vec3 u, float P){ vec3 x = u*P, i = floor(x), f = fract(x); float d = 9.;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) { vec3 g = vec3(a, b, c), q = mod(i + g, P);
    vec3 r = vec3(fract(sin(dot(q, vec3(12.9, 78.2, 37.7)))*43758.5), fract(sin(dot(q, vec3(39.3, 11.1, 83.1)))*24634.6), fract(sin(dot(q, vec3(73.2, 52.9, 19.4)))*35121.7));
    d = min(d, length(g + r - f)); }
  return d; }
void main(){ vec3 u = vec3(vUv, uZ); float rid = 1. - abs(2.*pfbm(u + .71, 6., 4) - 1.);
  o = vec4(pfbm(u, 4., 5), pfbm(u + .37, 8., 4), clamp(worley(u, 5.), 0., 1.), rid*rid); }`;
// V6 haze: big soft dust clouds, drawn into a quarter-resolution target (a sixteenth of the pixels, no multisampling) and
// composited once. Each cloud is a rotated quad whose shape is eaten out of its own region of the noise volume, so no
// two clouds repeat; it fades when the camera is inside or right next to it and softly where it meets geometry.
const HAZE_VS = `#version 300 es
layout(location=0) in vec2 aCorner; layout(location=1) in vec4 aCS; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aDir;
uniform mat4 uVP, uView; uniform vec3 uRight, uUp;
out vec2 vUv; out vec4 vCol; out float vDepth; out vec3 vSeed; out float vSize;
void main(){ vec3 c = aCS.xyz; float s = aCS.w, ca = cos(aDir.x), sa = sin(aDir.x); vec2 q = vec2(ca*aCorner.x - sa*aCorner.y, sa*aCorner.x + ca*aCorner.y);
  vec3 p = c + (uRight*q.x + uUp*q.y)*s; vUv = aCorner; vCol = aCol; vSeed = aDir.yzw; vSize = s;
  vDepth = -(uView*vec4(p, 1.)).z; gl_Position = uVP*vec4(p, 1.); }`;
const HAZE_FS = `#version 300 es
precision highp float; uniform highp sampler3D uNoise; uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft;
in vec2 vUv; in vec4 vCol; in float vDepth; in vec3 vSeed; in float vSize; out vec4 o;
void main(){ float r = length(vUv); if (r > 1.) discard;
  vec4 N = texture(uNoise, vec3(vUv*.3, 0.) + vSeed); /* one fetch: r billows, g finer billows, a wisps */
  float d = N.r*.62 + N.g*.42 + N.a*.12 - r*r*.62 - .21, a = smoothstep(0., .26, d)*smoothstep(1., .6, r);
  a *= smoothstep(vSize*.6, vSize*1.3, vDepth); /* fade out as the camera closes in (nearer clouds are not even drawn) */
  if (uSoft > .5) { float z = texture(uDepth, gl_FragCoord.xy/uRes).r*2. - 1.; float sd = 2.*uNear*uFar/(uFar + uNear - z*(uFar - uNear)); a *= clamp((sd - vDepth)/(vSize*.3), 0., 1.); }
  a *= vCol.a; if (a < .002) discard; o = vec4(vCol.rgb*a*(.75 + .5*N.g), a); }`;
const HAZEC_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; out vec4 o;
void main(){ vec4 c = texture(uTex, vUv); if (c.a < .002) discard; o = c; }`;

const ZERO12 = new Float32Array(12);
export const PRESETS = {
  // V6: lod scales every level-of-detail switch (buildings, rocks, capital ships: >1 switches nearer); hazeDist and
  // hazeCap bound the dust-cloud pass (reach as a fraction of the course's own, and the most clouds drawn at once)
  low: { scale: 0.75, msaa: 0, shadow: 0, ao: false, shafts: false, bloom: true, soft: false, dpr: 1, lod: 1.7, hazeDist: 0.6, hazeCap: 45 },
  medium: { scale: 1, msaa: 2, shadow: 1024, ao: false, shafts: true, bloom: true, soft: true, dpr: 1, lod: 1.25, hazeDist: 0.85, hazeCap: 90 },
  high: { scale: 1, msaa: 4, shadow: 2048, ao: true, shafts: true, bloom: true, soft: true, dpr: 1.25, lod: 1, hazeDist: 1, hazeCap: 120 },
  ultra: { scale: 1, msaa: 4, shadow: 4096, ao: true, shafts: true, bloom: true, soft: true, dpr: 1.75, lod: 0.85, hazeDist: 1.1, hazeCap: 160 },
};

export class GFX {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    this.cf = this.hdr ? gl.RGBA16F : gl.RGBA8; this.ct = this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const P = (fs, vs = VS) => this.prog(vs, fs);
    const V = defs => PBR_FS.replace('precision highp float;', defs.split(' ').map(d => '#define ' + d).join('\n') + '\nprecision highp float;');
    this.P = { pbr: P(V('M_HULL M_ROCK M_STRUCT M_FACADE M_CAPITAL')), pbrFade: P(V('FADE M_CAPITAL M_STRUCT')), pbrCity: P(V('M_STRUCT M_FACADE')), pbrRock: P(V('M_ROCK M_STRUCT')), pbrStruct: P(V('M_STRUCT')), pbrShip: P(V('M_HULL M_STRUCT M_CUSTOM')), planet: P(PLANET_FS), planetBake: P(PLANET_BAKE_FS, FS_TRI), ring: P(RING_FS), unlit: P(UNLIT_FS), hex: P(HEX_FS), depth: P(DEPTH_FS),
      sky: P(SKY_FS, FS_TRI), prefilter: P(PREFILTER_FS, FS_TRI), bb: P(BB_FS, BB_VS), bright: P(BRIGHT_FS, FS_TRI), down: P(DOWN_FS, FS_TRI), up: P(UP_FS, FS_TRI),
      shaft: P(SHAFT_FS, FS_TRI), ao: P(AO_FS, FS_TRI), blur: P(BLUR_FS, FS_TRI), comp: P(COMP_FS, FS_TRI), noise3: P(NOISE3_FS, FS_TRI), haze: P(HAZE_FS, HAZE_VS), hazec: P(HAZEC_FS, FS_TRI) };
    gl.vertexAttrib4f(3, 1, 0, 0, 0); gl.vertexAttrib4f(4, 0, 1, 0, 0); gl.vertexAttrib4f(5, 0, 0, 1, 0); gl.vertexAttrib4f(6, 0, 0, 0, 1); gl.vertexAttrib4f(7, 1, 1, 1, 1); gl.vertexAttrib4f(8, 0, 0.6, 1, 0);
    this.tri = gl.createVertexArray(); gl.bindVertexArray(this.tri);
    const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.view = mat4.create(); this.proj = mat4.create(); this.vp = mat4.create(); this.ivp = mat4.create(); this.m = mat4.create(); this.iproj = mat4.create();
    this.svp = mat4.create(); this.sv = mat4.create(); this.sp = mat4.create();
    this.cfg = { ...PRESETS.high }; this.res = 1; this.w = 0; this.h = 0; this.time = 0;
    this.post = { radial: 0, vig: 0.6, flash: 0, flashCol: [1, 1, 1], bloom: 0.55, th: 1.4, expo: 1, grain: 0.035, ca: 0, sat: 1.05, contrast: 1.04, lift: [0, 0, 0], gain: [1, 1, 1], shafts: 1, flare: 1, streak: 0.45, dirt: 0.55, bars: 0 };
    this.white = this.texture(null); this.noise3 = this.makeNoise3D(64);
    { // procedural lens dirt: soft smudges that light up only where bloom is strong
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 144);
      let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 90; k++) { const x = rnd() * 256, y = rnd() * 144, r = 2 + rnd() * rnd() * 24, a = 0.05 + rnd() * 0.25, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      this.dirt = this.texture(cv); }
    this.lodBias = 1; /* >1 pushes every LOD switch nearer (test hook: 0 = always full detail) */ this.envTex = null; this.stats = { draws: 0, culled: 0, shadowDraws: 0, tris: 0 }; this.pl = new Float32Array(24);
  }
  // frustum planes from the view-projection matrix
  planes() { const m = this.vp, p = this.pl;
    const set = (k, a, b, c, d) => { const l = Math.hypot(a, b, c); p[k] = a / l; p[k + 1] = b / l; p[k + 2] = c / l; p[k + 3] = d / l; };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]); }
  sphereOf(it) { if (it.bs) return it.bs; if (it.pos && it.br) { const s = it.scale ?? Math.max(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1); TMPS.x = it.pos.x; TMPS.y = it.pos.y; TMPS.z = it.pos.z; TMPS.r = it.br * s; return TMPS; } return null; }
  inView(it) { const s = this.sphereOf(it); if (!s) return true; const p = this.pl;
    for (let k = 0; k < 24; k += 4) if (p[k] * s.x + p[k + 1] * s.y + p[k + 2] * s.z + p[k + 3] < -s.r) return false;
    if (it.maxDist && this.camRef) { const d = Math.hypot(s.x - this.camRef.pos.x, s.y - this.camRef.pos.y, s.z - this.camRef.pos.z); if (d - s.r > it.maxDist) return false; }
    return true; }
  nearSphere(it, c, R) { const s = this.sphereOf(it); if (!s) return true; return Math.hypot(s.x - c.x, s.y - c.y, s.z - c.z) < R + s.r; }

  prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join(' '));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
    u.PL = [0, 1, 2, 3].map(i => gl.getUniformLocation(p, `uPL[${i}]`)); u.PLc = [0, 1, 2, 3].map(i => gl.getUniformLocation(p, `uPLc[${i}]`));
    u.Hits = [0, 1, 2, 3].map(i => gl.getUniformLocation(p, `uHits[${i}]`)); u.Heat = [0, 1].map(i => gl.getUniformLocation(p, `uHeat[${i}]`));
    return { p, u };
  }

  texture(canvas, repeat = false) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (canvas) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); }
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    const af = gl.getExtension('EXT_texture_filter_anisotropic'); if (af) gl.texParameterf(gl.TEXTURE_2D, af.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return { tex: t };
  }

  makeNoise3D(N) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT], [gl.TEXTURE_WRAP_R, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    const fb = gl.createFramebuffer(), P = this.P.noise3; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.viewport(0, 0, N, N); gl.bindVertexArray(this.tri);
    for (let z = 0; z < N; z++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, z); gl.uniform1f(P.u.uZ, (z + 0.5) / N); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.bindTexture(gl.TEXTURE_3D, t); gl.generateMipmap(gl.TEXTURE_3D); return t;
  }
  bakeCube(prog, size, uniforms) { // V6: renders a mip-mapped RGBA8 cube map with a full-screen program, one pass per face (planet surface bakes)
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const dirs = [[1, 0, 0, 0, -1, 0], [-1, 0, 0, 0, -1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, -1, 0], [0, 0, -1, 0, -1, 0]];
    const fb = gl.createFramebuffer(), proj = mat4.perspective(mat4.create(), Math.PI / 2, 1, 0.1, 10), v = mat4.create(), vp = mat4.create(), ivp = mat4.create(), O = new Vec3(), u = prog.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.bindVertexArray(this.tri); gl.useProgram(prog.p);
    for (const k in uniforms) { const x = uniforms[k]; if (!u[k]) continue; typeof x === 'number' ? gl.uniform1f(u[k], x) : x.length === 3 ? gl.uniform3fv(u[k], x) : gl.uniform4fv(u[k], x); }
    if (u.uNoise) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, this.noise3); gl.uniform1i(u.uNoise, 7); }
    for (let f = 0; f < 6; f++) { const d = dirs[f]; mat4.view(v, O, new Vec3(d[0], d[1], d[2]), new Vec3(d[3], d[4], d[5])); mat4.multiply(vp, proj, v); mat4.invert(ivp, vp);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, t, 0); gl.viewport(0, 0, size, size);
      gl.uniformMatrix4fv(u.uInvVP, false, ivp); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t); gl.generateMipmap(gl.TEXTURE_CUBE_MAP); this.cur = null;
    return { tex: t, size };
  }
  get dummyCube() { if (!this._dc) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t); const px = new Uint8Array([128, 128, 128, 255]);
    for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); this._dc = { tex: t }; } return this._dc; }
  dataTexture(w, h, data) { // raw RGBA8 (no canvas round trip, so low-alpha texels keep their colour)
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data); gl.generateMipmap(gl.TEXTURE_2D);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return { tex: t };
  }
  updateTexture(t, canvas) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.generateMipmap(gl.TEXTURE_2D); }
  mesh(geo, instances = 0) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const bufs = [], buf = (data, loc, size) => { const b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    buf(geo.pos, 0, 3); buf(geo.nor, 1, 3); buf(geo.col, 2, 4); if (geo.mat) buf(geo.mat, 8, 4);
    const ib = gl.createBuffer(); bufs.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    const m = { vao, bufs, count: geo.idx.length, inst: null, n: 0, tris: geo.idx.length / 3 };
    if (instances) {
      m.inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.inst); gl.bufferData(gl.ARRAY_BUFFER, instances * 80, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 5; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, 80, k * 16); gl.vertexAttribDivisor(3 + k, 1); }
      m.data = new Float32Array(instances * 20); m.cap = instances;
    }
    gl.bindVertexArray(null);
    return m;
  }
  freeMesh(m) { const gl = this.gl; for (const b of m.bufs || []) gl.deleteBuffer(b); if (m.inst) gl.deleteBuffer(m.inst); gl.deleteVertexArray(m.vao); m.count = 0; m.n = 0; }
  setInstance(m, k, mat, r = 1, g = 1, b = 1, a = 1) { m.data.set(mat, k * 20); m.data[k * 20 + 16] = r; m.data[k * 20 + 17] = g; m.data[k * 20 + 18] = b; m.data[k * 20 + 19] = a; }
  uploadInstances(m, n) { const gl = this.gl; m.n = n; gl.bindBuffer(gl.ARRAY_BUFFER, m.inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, n * 20); }

  billboards(cap) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, cap * 48, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(1 + k); gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 48, k * 16); gl.vertexAttribDivisor(1 + k, 1); }
    gl.bindVertexArray(null);
    const data = new Float32Array(cap * 12);
    return { vao, ib, data, cap, n: 0,
      add(x, y, z, s, r, g, b, a, dx = 0, dy = 0, dz = 0, len = 0) {
        if (this.n >= cap) return; const o = this.n++ * 12;
        data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = s; data[o + 4] = r; data[o + 5] = g; data[o + 6] = b; data[o + 7] = a;
        data[o + 8] = dx; data[o + 9] = dy; data[o + 10] = dz; data[o + 11] = len;
      } };
  }

  target(w, h, fmt, depthTex) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt || this.cf, w, h, 0, gl.RGBA, fmt === gl.RGBA8 ? gl.UNSIGNED_BYTE : this.ct, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    let d = null;
    if (depthTex) { d = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, d); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, d, 0); }
    return { t, f, w, h, d };
  }

  configure(cfg) { this.cfg = { ...this.cfg, ...cfg }; this.w = 0; }
  setRes(r) { r = Math.round(Math.max(0.5, Math.min(1, r)) * 20) / 20; if (r !== this.res) { this.res = r; this.w = 0; } }

  resize(cssW, cssH) {
    const gl = this.gl, c = this.cfg, dpr = Math.min(window.devicePixelRatio || 1, c.dpr);
    const s = c.scale * this.res, w = Math.max(16, Math.floor(cssW * dpr * s)), h = Math.max(16, Math.floor(cssH * dpr * s));
    if (w === this.w && h === this.h && this.fb) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    const scene = this.target(w, h, null, true);
    const mkRB = samples => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      for (const [fmt, att] of [[this.cf, gl.COLOR_ATTACHMENT0], [gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT]]) {
        const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, att, gl.RENDERBUFFER, rb); }
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? f : null; };
    const samples = Math.min(c.msaa, gl.getParameter(gl.MAX_SAMPLES));
    const ms = (samples > 1 && mkRB(samples)) || mkRB(0);
    this.samples = samples;
    const chain = []; let cw = w >> 1, ch = h >> 1;
    for (let k = 0; k < 5 && cw > 4 && ch > 4; k++) { chain.push(this.target(cw, ch)); cw >>= 1; ch >>= 1; }
    const ldr = gl.RGBA8;
    this.fb = { scene, ms, chain, shaft: this.target(w >> 2, h >> 2), st1: this.target(w >> 2, h >> 3), st2: this.target(w >> 2, h >> 3), ao: this.target(w >> 1, h >> 1, ldr), aob: this.target(w >> 1, h >> 1, ldr), haze: this.target(w >> 2, h >> 2) };
    if (c.shadow && (!this.sfb || this.sfb.size !== c.shadow)) {
      const d = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, d); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, c.shadow, c.shadow, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, d, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      this.sfb = { f, d, size: c.shadow };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Render the procedural sky into a cubemap and prefilter it into roughness mips (image-based lighting)
  buildEnv(env, size = 128) {
    const gl = this.gl, mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
      for (let f = 0; f < 6; f++) for (let m = 0, s = size; m < 6; m++, s >>= 1) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, m, this.cf, Math.max(1, s), Math.max(1, s), 0, gl.RGBA, this.ct, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, 5); return t; };
    if (env._ibl) { this.envTex = env._ibl.pre; return; }
    const base = mk(), pre = mk(); env._ibl = { base, pre }; this.envTex = pre;
    const dirs = [[1, 0, 0, 0, -1, 0], [-1, 0, 0, 0, -1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, -1, 0], [0, 0, -1, 0, -1, 0]];
    const fb = gl.createFramebuffer(), proj = mat4.perspective(mat4.create(), Math.PI / 2, 1, 0.1, 10), v = mat4.create(), vp = mat4.create(), ivp = mat4.create(), O = new Vec3();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(this.tri);
    const face = (f, prog, tex, mip, s) => {
      const d = dirs[f]; mat4.view(v, O, new Vec3(d[0], d[1], d[2]), new Vec3(d[3], d[4], d[5])); mat4.multiply(vp, proj, v); mat4.invert(ivp, vp);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, tex, mip); gl.viewport(0, 0, s, s);
      gl.uniformMatrix4fv(prog.u.uInvVP, false, ivp); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    let P = this.P.sky; gl.useProgram(P.p); this.skyUniforms(P, env, O, 0.6); gl.uniform1f(P.u.uUseCube, 0); gl.uniform1f(P.u.uNebBake, 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.dummyCube.tex); gl.uniform1i(P.u.uNebCube, 3); gl.activeTexture(gl.TEXTURE0);
    for (let f = 0; f < 6; f++) face(f, P, base, 0, size);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, base); gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    P = this.P.prefilter; gl.useProgram(P.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, base); gl.uniform1i(P.u.uCube, 0);
    for (let m = 0, s = size; m < 6; m++, s >>= 1) { gl.uniform1f(P.u.uRough, m / 5); for (let f = 0; f < 6; f++) face(f, P, pre, m, Math.max(1, s)); }
    // V6: the visible sky's static nebula, dust and galactic band, baked once (512 per face, half float) so the sky pass reads one cube texel instead of six noise fetches
    if (!env.studio && this.hdr) { const N = 512, neb = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, neb);
      for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, this.cf, N, N, 0, gl.RGBA, this.ct, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      P = this.P.sky; gl.useProgram(P.p); this.skyUniforms(P, env, O, 1); gl.uniform1f(P.u.uUseCube, 0); gl.uniform1f(P.u.uNebBake, 1);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.dummyCube.tex); gl.uniform1i(P.u.uNebCube, 3); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, null); /* never sample the cube being drawn */
      for (let f = 0; f < 6; f++) face(f, P, neb, 0, N);
      gl.uniform1f(P.u.uNebBake, 0); env._ibl.neb = neb; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
  }
  skyUniforms(P, env, cam, stars = 1) {
    const gl = this.gl; gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z); if (P.u.uNoise) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, this.noise3); gl.uniform1i(P.u.uNoise, 7); } this.u3(P.u.uSunDir, env.sunDir); gl.uniform3fv(P.u.uSunCol, env.sunCol); gl.uniform1f(P.u.uStudio, stars === 0.6 && env.studio ? 1 : 0);
    gl.uniform1f(P.u.uAtmoSky, env.sky === 'atmo' ? 1 : 0); gl.uniform1f(P.u.uEnvPass, stars === 0.6 ? 1 : 0); gl.uniform3fv(P.u.uZen, env.zen || [0, 0, 0]); gl.uniform3fv(P.u.uHor, env.hor || [0, 0, 0]); gl.uniform3fv(P.u.uNebA, env.nebA); gl.uniform3fv(P.u.uNebB, env.nebB); gl.uniform3fv(P.u.uNebC, env.nebC); gl.uniform3fv(P.u.uBase, env.base);
    gl.uniform1f(P.u.uSeed, env.seed); gl.uniform1f(P.u.uNeb, env.neb); gl.uniform1f(P.u.uStars, stars);
  }

  // scene: { items, overlay, bbAdd, bbNorm, env, lights, shadowCenter }, cam: { pos, fwd, up, fov, near, far }
  render(scene, cam, dt = 0) {
    const gl = this.gl, env = scene.env, c = this.cfg; this.time += dt;
    if (!this.fb) return;
    const near = cam.near || 0.5, far = cam.far || 60000, fb = this.fb;
    mat4.perspective(this.proj, cam.fov * Math.PI / 180, this.w / this.h, near, far); mat4.invert(this.iproj, this.proj);
    mat4.view(this.view, cam.pos, cam.fwd, cam.up); mat4.multiply(this.vp, this.proj, this.view); mat4.invert(this.ivp, this.vp); this.camRef = cam;
    // shadow map fitted around the focus point
    this.stats.shadowDraws = 0;
    const shadowOn = c.shadow && this.sfb && scene.shadowCenter && env.shadows !== false;
    if (shadowOn) {
      const sc = scene.shadowCenter, r = c.shadowR || 150, L = env.sunDir, eye = new Vec3().copy(sc).addScaled(L, 1000);
      mat4.view(this.sv, eye, new Vec3().copy(L).scale(-1), Math.abs(L.y) > 0.95 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0));
      const o = this.sp; o.fill(0); o[0] = 1 / r; o[5] = 1 / r; o[10] = -2 / 2000; o[14] = -1; o[15] = 1;
      mat4.multiply(this.svp, this.sp, this.sv);
      const half = c.shadow / 2; this.svp[12] = Math.round(this.svp[12] * half) / half; this.svp[13] = Math.round(this.svp[13] * half) / half;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sfb.f); gl.viewport(0, 0, c.shadow, c.shadow); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      const P = this.P.depth; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, this.svp); gl.uniform4f(P.u.uColor, 1, 1, 1, 1);
      for (const it of scene.items) { if (!it.visible || !it.cast) continue; if (!this.nearSphere(it, sc, r * 1.5)) continue; this.drawMesh(it, P.u); this.stats.shadowDraws++; }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms); gl.viewport(0, 0, this.w, this.h);
    gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); if (env._ibl) this.envTex = env._ibl.pre;
    let P = this.P.sky; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uInvVP, false, this.ivp); this.skyUniforms(P, env, cam.pos);
    { const nb = env._ibl && env._ibl.neb; gl.uniform1f(P.u.uNebBake, 0); gl.uniform1f(P.u.uUseCube, nb ? 1 : 0); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, nb || this.dummyCube.tex); gl.uniform1i(P.u.uNebCube, 3); }
    gl.bindVertexArray(this.tri); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const opaque = [], trans = [];
    this.planes(); this.stats.draws = 0; this.stats.culled = 0; this.stats.tris = 0;
    for (const it of scene.items) { if (!it.visible) continue; if (!this.inView(it)) { this.stats.culled++; continue; } (it.blend ? trans : opaque).push(it); }
    for (const it of trans) it._d = it.pos ? -cam.pos.distSq(it.pos) : 0;
    trans.sort((a, b) => (a.layer || 0) - (b.layer || 0) || a._d - b._d);
    this.cur = null; this.scene = scene; this.shadowOn = shadowOn;
    gl.disable(gl.BLEND);
    for (const it of opaque) this.draw(it);
    // resolve depth for soft particles, AO and shafts
    const needDepth = c.soft || c.ao || c.shafts || this.post.flare > 0;
    if (needDepth) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.scene.f); gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms); }
    this.depthReady = needDepth;
    // sky layers (planet atmosphere, rings) go down before the dust haze so that nearby clouds veil them
    let nf = 0; gl.enable(gl.BLEND); gl.depthMask(false);
    while (nf < trans.length && (trans[nf].layer || 0) < 0) { const it = trans[nf++]; gl.blendFunc(gl.ONE, it.blend === 'normal' || it.blend === 'ring' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); this.draw(it); }
    gl.disable(gl.BLEND); gl.depthMask(true);
    const hz = scene.bbHaze;
    const direct = this.hazeDirect === true; // V6: the clouds go into a quarter-resolution target that is composited once (measured faster than drawing them at full resolution); true is a test hook
    if (hz && hz.n) { // V6: big soft clouds, one noise fetch per pixel
      if (direct) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, fb.haze.f); gl.viewport(0, 0, fb.haze.w, fb.haze.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.clearColor(0, 0, 0, 1); gl.disable(gl.DEPTH_TEST); }
      gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      const H = this.P.haze, hu = H.u; gl.useProgram(H.p); gl.uniformMatrix4fv(hu.uVP, false, this.vp); gl.uniformMatrix4fv(hu.uView, false, this.view);
      gl.uniform3f(hu.uRight, this.view[0], this.view[4], this.view[8]); gl.uniform3f(hu.uUp, this.view[1], this.view[5], this.view[9]);
      gl.uniform1f(hu.uSoft, needDepth ? 1 : 0); gl.uniform2f(hu.uRes, direct ? this.w : fb.haze.w, direct ? this.h : fb.haze.h); gl.uniform1f(hu.uNear, near); gl.uniform1f(hu.uFar, far);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, needDepth ? fb.scene.d : this.white.tex); gl.uniform1i(hu.uDepth, 0);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, this.noise3); gl.uniform1i(hu.uNoise, 7);
      gl.bindBuffer(gl.ARRAY_BUFFER, hz.ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, hz.data, 0, hz.n * 12); gl.bindVertexArray(hz.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, hz.n);
      if (!direct) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms); gl.viewport(0, 0, this.w, this.h);
        const C = this.P.hazec; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fb.haze.t); gl.uniform1i(C.u.uTex, 0); gl.bindVertexArray(this.tri); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      gl.enable(gl.DEPTH_TEST); this.cur = null; this.stats.haze = hz.n;
    } else this.stats.haze = 0;
    gl.enable(gl.BLEND); gl.depthMask(false);
    for (let i = nf; i < trans.length; i++) { const it = trans[i]; gl.blendFunc(gl.ONE, it.blend === 'normal' ? gl.ONE_MINUS_SRC_ALPHA : it.blend === 'ring' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); this.draw(it); }
    // billboards (soft when the depth copy is a separate texture)
    gl.disable(gl.CULL_FACE); P = this.P.bb; gl.useProgram(P.p); this.cur = null;
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp); gl.uniformMatrix4fv(P.u.uView, false, this.view); gl.uniform3f(P.u.uCam, cam.pos.x, cam.pos.y, cam.pos.z);
    gl.uniform3f(P.u.uRight, this.view[0], this.view[4], this.view[8]); gl.uniform3f(P.u.uUp, this.view[1], this.view[5], this.view[9]);
    gl.uniform1f(P.u.uTanHalf, Math.tan(cam.fov * Math.PI / 360)); gl.uniform1f(P.u.uCap, 0.35);
    const soft = !!c.soft; gl.uniform1f(P.u.uSoft, soft ? 1 : 0); gl.uniform2f(P.u.uRes, this.w, this.h); gl.uniform1f(P.u.uNear, near); gl.uniform1f(P.u.uFar, far);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, soft ? fb.scene.d : this.white.tex); gl.uniform1i(P.u.uDepth, 0);
    for (const [bb, add] of [[scene.bbNorm, false], [scene.bbAdd, true]]) {
      if (!bb || !bb.n) continue;
      gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, bb.ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, bb.data, 0, bb.n * 12);
      gl.bindVertexArray(bb.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, bb.n);
    }
    // overlay (cockpit) after a depth clear
    if (scene.overlay && scene.overlay.length) {
      const saveVP = this.vp.slice(); mat4.perspective(this.proj, cam.fov * Math.PI / 180, this.w / this.h, 0.02, 60); mat4.multiply(this.vp, this.proj, this.view);
      gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); this.cur = null;
      for (const it of scene.overlay) if (it.visible && !it.blend) this.draw(it);
      gl.enable(gl.BLEND); gl.depthMask(false); for (const it of scene.overlay) if (it.visible && it.blend) { gl.blendFunc(gl.ONE, it.blend === 'normal' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); this.draw(it); }
      this.vp.set(saveVP); mat4.perspective(this.proj, cam.fov * Math.PI / 180, this.w / this.h, near, far);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.scene.f); gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    this.postProcess(cam, env, near, far);
  }

  postProcess(cam, env, near, far) {
    const gl = this.gl, fb = this.fb, c = this.cfg, po = this.post;
    gl.bindVertexArray(this.tri);
    const pass = (prog, target, setup, blend) => { gl.useProgram(prog.p); gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
      if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND); setup(prog.u); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const bind = (unit, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); };
    const ch = fb.chain, bloomOn = c.bloom && po.bloom > 0 && ch.length > 2;
    if (bloomOn) {
      pass(this.P.bright, ch[0], u => { bind(0, fb.scene.t, u.uTex); gl.uniform2f(u.uTexel, 1 / this.w, 1 / this.h); gl.uniform1f(u.uTh, po.th); });
      for (let k = 1; k < ch.length; k++) pass(this.P.down, ch[k], u => { bind(0, ch[k - 1].t, u.uTex); gl.uniform2f(u.uTexel, 1 / ch[k - 1].w, 1 / ch[k - 1].h); });
      this.streakT = null;
      if (po.streak > 0) { // anamorphic streaks: the quarter-res bright pass smeared sideways in widening steps
        let src = fb.st1, dst = fb.st2; pass(this.P.blur, src, u => { bind(0, ch[1].t, u.uTex); gl.uniform2f(u.uDir, 1 / src.w, 0); });
        for (const k of [3, 9, 27]) { pass(this.P.blur, dst, u => { bind(0, src.t, u.uTex); gl.uniform2f(u.uDir, k / dst.w, 0); }); const tt = src; src = dst; dst = tt; }
        this.streakT = src.t; }
      for (let k = ch.length - 1; k > 0; k--) pass(this.P.up, ch[k - 1], u => { bind(0, ch[k].t, u.uTex); gl.uniform2f(u.uTexel, 1 / ch[k].w, 1 / ch[k].h); gl.uniform1f(u.uK, 0.8); }, true);
    }
    let shaftOn = false; this.flarePos = null;
    { const s = new Vec3().copy(cam.pos).addScaled(env.sunDir, 1000), x = this.vp, w = x[3] * s.x + x[7] * s.y + x[11] * s.z + x[15];
      if (w > 0) { const sx = ((x[0] * s.x + x[4] * s.y + x[8] * s.z + x[12]) / w) * 0.5 + 0.5, sy = ((x[1] * s.x + x[5] * s.y + x[9] * s.z + x[13]) / w) * 0.5 + 0.5;
        if (sx > -0.1 && sx < 1.1 && sy > -0.1 && sy < 1.1 && !env.studio) this.flarePos = [sx, sy, Math.max(0, 1 - Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) * 1.6)]; } }
    if (c.shafts && po.shafts > 0 && fb.scene.d) {
      const s = new Vec3().copy(cam.pos).addScaled(env.sunDir, 1000), x = this.vp, w = x[3] * s.x + x[7] * s.y + x[11] * s.z + x[15];
      if (w > 0) { const sx = ((x[0] * s.x + x[4] * s.y + x[8] * s.z + x[12]) / w) * 0.5 + 0.5, sy = ((x[1] * s.x + x[5] * s.y + x[9] * s.z + x[13]) / w) * 0.5 + 0.5;
        const k = Math.max(0, 1 - Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) * 1.2) * po.shafts * (env.shafts ?? 0.35);
        if (k > 0.01) { shaftOn = true; pass(this.P.shaft, fb.shaft, u => { bind(0, fb.scene.t, u.uScene); bind(1, fb.scene.d, u.uDepth); gl.uniform2f(u.uSun, sx, sy); gl.uniform1f(u.uK, k); }); } }
    }
    const aoOn = c.ao && fb.scene.d;
    if (aoOn) {
      pass(this.P.ao, fb.ao, u => { bind(0, fb.scene.d, u.uDepth); gl.uniformMatrix4fv(u.uInvP, false, this.iproj); gl.uniformMatrix4fv(u.uP, false, this.proj); gl.uniform2f(u.uTexel, 1 / this.w, 1 / this.h); });
      pass(this.P.blur, fb.aob, u => { bind(0, fb.ao.t, u.uTex); gl.uniform2f(u.uDir, 1.5 / fb.ao.w, 0); });
      pass(this.P.blur, fb.ao, u => { bind(0, fb.aob.t, u.uTex); gl.uniform2f(u.uDir, 0, 1.5 / fb.ao.h); });
    }
    pass(this.P.comp, null, u => {
      bind(0, fb.scene.t, u.uScene); bind(1, bloomOn ? ch[0].t : this.white.tex, u.uBloom); bind(2, fb.shaft.t, u.uShaft); bind(3, fb.ao.t, u.uAO);
      gl.uniform1f(u.uBloomK, bloomOn ? po.bloom : 0); const stOn = bloomOn && this.streakT; bind(5, stOn ? this.streakT : this.white.tex, u.uStreak); gl.uniform1f(u.uStreakK, stOn ? po.streak * (env.streak ?? 1) : 0);
      bind(6, this.dirt.tex, u.uDirt); gl.uniform1f(u.uDirtK, po.dirt * (env.dirt ?? 1)); gl.uniform1f(u.uBars, po.bars || 0); bind(4, this.depthReady ? fb.scene.d : this.white.tex, u.uDepthC); gl.uniform1f(u.uAspect, this.w / this.h);
      const fp = this.flarePos; gl.uniform4f(u.uFlare, fp ? fp[0] : 0, fp ? fp[1] : 0, fp && po.flare ? fp[2] * po.flare * (env.flare ?? 1) : 0, 0); gl.uniform3fv(u.uFlareCol, env.sunCol.map(c => c / 3)); gl.uniform1f(u.uShaftOn, shaftOn ? 1 : 0); gl.uniform1f(u.uAOOn, aoOn ? 1 : 0);
      gl.uniform1f(u.uRadial, po.radial); gl.uniform1f(u.uVig, po.vig); gl.uniform1f(u.uFlash, Math.min(0.5, po.flash)); gl.uniform3fv(u.uFlashCol, po.flashCol);
      gl.uniform1f(u.uExpo, po.expo * (env.expo || 1)); gl.uniform1f(u.uGrain, po.grain); gl.uniform1f(u.uCA, po.ca); gl.uniform1f(u.uTime, this.time);
      gl.uniform1f(u.uSat, po.sat * (env.sat || 1));
      for (let i = 0; i < 2; i++) { const h = po.heat && po.heat[i]; gl.uniform4f(u.Heat[i], h ? h[0] : 0, h ? h[1] : 0, h ? h[2] : 1, h ? h[3] : 0); } gl.uniform1f(u.uContrast, po.contrast); gl.uniform3fv(u.uLift, env.lift || po.lift); gl.uniform3fv(u.uGain, env.gain || po.gain);
    });
  }

  draw(it) {
    const gl = this.gl, prog = this.P[it.prog || 'pbr'];
    if (prog !== this.cur) { this.cur = prog; this.useScene(prog); }
    const u = prog.u;
    if (!it.cull) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(it.cullFront ? gl.FRONT : gl.BACK); }
    if (u.uOpacity) gl.uniform1f(u.uOpacity, it.opacity ?? 1);
    if (u.uFade) gl.uniform2f(u.uFade, it.fade ?? 1, it.fadeInv ? 1 : 0);
    if (u.uRim) gl.uniform3fv(u.uRim, it.rim || ZERO3);
    if (u.uDamage) gl.uniform1f(u.uDamage, it.damage || 0);
    if (u.uDS) gl.uniform1f(u.uDS, it.ds || 1);
    if (u.uEng0) { const e = it.eng || ZERO12; gl.uniform4f(u.uEng0, e[0], e[1], e[2], e[3]); gl.uniform4f(u.uEng1, e[4], e[5], e[6], e[7]); gl.uniform4f(u.uEng2, e[8], e[9], e[10], e[11]); gl.uniform1f(u.uFaction, it.faction || 0); gl.uniform1f(u.uSeedS, it.seedS || 0); }
    if (u.uStripe) gl.uniform4fv(u.uStripe, it.stripe || ZERO4);
    if (u.uCu0) { const c = it.cust; if (c) { gl.uniform4f(u.uCu0, 1, c.pattern, c.finish, c.paint); gl.uniform3fv(u.uCuC, c.data); } else gl.uniform4f(u.uCu0, 0, 0, 0, 0); } // V7 paint job, reset for every other ship
    if (u.uInt) gl.uniform1f(u.uInt, it.intensity ?? 1);
    if (u.uMode) gl.uniform1f(u.uMode, it.mode || 0);
    if (u.uDecalOn) { const d = it.decal; gl.uniform1f(u.uDecalOn, d ? 1 : 0); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, d ? d.tex.tex : this.white.tex); gl.uniform1i(u.uDecal, 3);
      if (d) { gl.uniform4fv(u.uDecalBox, d.box); if (u.uDecalX) gl.uniform1f(u.uDecalX, d.maxX || 9); } }
    if (u.uSurf) { const T = it.planetTex || {}; gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_CUBE_MAP, (T.surf || this.dummyCube).tex); gl.uniform1i(u.uSurf, 5);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_CUBE_MAP, (T.aux || this.dummyCube).tex); gl.uniform1i(u.uAux, 6); }
    if (u.uRingT) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, (it.ringTex || this.white).tex); gl.uniform1i(u.uRingT, 4); }
    if (u.uTexOn) { gl.uniform1f(u.uTexOn, it.tex ? 1 : 0); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, it.tex ? it.tex.tex : this.white.tex); gl.uniform1i(u.uTex, 3); }
    if (it.uniforms) for (const k in it.uniforms) { const v = it.uniforms[k]; if (!u[k]) continue; typeof v === 'number' ? gl.uniform1f(u[k], v) : v.length === 3 ? gl.uniform3fv(u[k], v) : gl.uniform4fv(u[k], v); }
    this.drawMesh(it, u);
  }
  drawMesh(it, u) {
    const gl = this.gl; this.stats.draws++;
    if (it.pos) mat4.compose(this.m, it.pos, it.quat, it.sx ?? it.scale ?? 1, it.sy ?? it.scale ?? 1, it.sz ?? it.scale ?? 1);
    gl.uniformMatrix4fv(u.uModel, false, it.pos ? this.m : IDENT);
    const c = it.color || WHITE; gl.uniform4f(u.uColor, c[0], c[1], c[2], c[3] ?? 1);
    gl.bindVertexArray(it.mesh.vao);
    if (it.mesh.inst) { if (it.mesh.n) { gl.drawElementsInstanced(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0, it.mesh.n); this.stats.tris += it.mesh.count / 3 * it.mesh.n; } }
    else { gl.drawElements(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0); this.stats.tris += it.mesh.count / 3; }
  }
  u3(loc, v) { this.gl.uniform3f(loc, v.x, v.y, v.z); }
  useScene(prog) {
    const gl = this.gl, u = prog.u, env = this.scene.env, cam = this.camRef; gl.useProgram(prog.p);
    gl.uniformMatrix4fv(u.uVP, false, this.vp); if (u.uCam) gl.uniform3f(u.uCam, cam.pos.x, cam.pos.y, cam.pos.z);
    if (u.uSunDir) this.u3(u.uSunDir, env.sunDir);
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
    if (u.uNoise) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, this.noise3); gl.uniform1i(u.uNoise, 7); }
    if (u.uSkyEnv) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envTex); gl.uniform1i(u.uSkyEnv, 1); }
    if (u.uSunCol) {
      gl.uniform3fv(u.uSunCol, env.sunCol); if (u.uFogCol) { gl.uniform3fv(u.uFogCol, env.fogCol); gl.uniform1f(u.uFog, env.fog); if (u.uFogH) gl.uniform2fv(u.uFogH, env.fogH || ZERO2); }
      if (u.uEnvInt) { gl.uniform1f(u.uEnvInt, env.envInt ?? 1); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envTex); gl.uniform1i(u.uEnv, 1);
        gl.uniform1f(u.uShadowOn, this.shadowOn ? 1 : 0); gl.uniformMatrix4fv(u.uShadowVP, false, this.svp);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.sfb ? this.sfb.d : null); gl.uniform1i(u.uShadow, 2); }
      const L = this.scene.lights || [], n = Math.min(4, L.length); if (u.uNPL) { gl.uniform1i(u.uNPL, n); for (let i = 0; i < n; i++) { gl.uniform4f(u.PL[i], L[i].pos.x, L[i].pos.y, L[i].pos.z, L[i].range); gl.uniform3fv(u.PLc[i], L[i].col); } }
    }
    if (u.uShip && this.scene.hex) { const h = this.scene.hex; this.u3(u.uShip, h.ship); for (let i = 0; i < 4; i++) { const k = h.hits[i]; gl.uniform4f(u.Hits[i], k ? k.x : 0, k ? k.y : 0, k ? k.z : 0, k ? k.t : -9); } gl.uniform3fv(u.uTint, h.tint); }
  }
}
const IDENT = mat4.create(), WHITE = [1, 1, 1, 1], ZERO2 = [0, 0], ZERO3 = [0, 0, 0], ZERO4 = [0, 0, 0, 0], TMPS = { x: 0, y: 0, z: 0, r: 0 };
export { Vec3 };
