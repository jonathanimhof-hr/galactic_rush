// Neon Spire V4 city. A library of 26 original building archetypes, each a real multi-part structure (cores,
// corner columns, setbacks, sky gardens, exoskeleton bracing, braced cantilevers, balconies, sawtooth halls,
// cooling towers, tank farms, domes, vaulted terminals, transit hubs, landing-pad towers...). Every archetype is
// assembled once in unit space (footprint -0.5..0.5, height 0..1) and instanced, so variety costs one draw call
// per archetype. Districts pick from their own archetypes and palettes, heights follow a hierarchy (low city,
// mid blocks, skyline, landmarks), elevated highways run over reserved, widened streets, and anything under the
// racing line is capped below the corridor floor so nothing intrudes on the course.
import { Vec3, Quat, mat4 } from '../../math.js';
import { InstanceSet } from '../lod.js';
import { Geo, QX, QY, QZ, DET } from '../geo.js';

const v3 = (x, y, z) => new Vec3(x, y, z), F5 = DET.facade;
const C = { glass: [0.09, 0.11, 0.14], office: [0.17, 0.18, 0.22], resi: [0.27, 0.24, 0.22], conc: [0.46, 0.45, 0.42], stone: [0.5, 0.46, 0.4],
  cer: [0.62, 0.6, 0.56], steel: [0.2, 0.2, 0.22], ind: [0.22, 0.2, 0.18], dark: [0.11, 0.115, 0.13] };
const LW = [1, 0.78, 0.5, 1], LC = [0.7, 0.85, 1, 1], LG = [0.45, 0.95, 0.55, 1], LR = [1, 0.2, 0.15, 1];
const col4 = c => c.length === 4 ? c : [...c, 0];
// B: an axis-aligned part. While g.rec is set, every facade-shaded part is recorded so hero buildings can grow real
// facade relief (fins, ledges, piers, balconies) on exactly those volumes.
const B = (g, x0, x1, y0, y1, z0, z1, c, q) => { if (g.rec && !q && g.M[3] >= 5 && g.M[3] <= 9) g.rec.push([x0, x1, y0, y1, z0, z1, g.M[3]]); return g.at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, q || null).box(x1 - x0, y1 - y0, z1 - z0, col4(c)); };
// REV (V6): a surface of revolution about the archetype's vertical axis (unit profile [[r, y], ...]). While g.rev is set it
// is recorded, so hero buildings can grow relief that follows the curvature; a facade on it uses the curved window
// mapping (detail id + 15: window columns around the axis instead of a flat projection that ignores the curve).
const REV = (g, prof, seg, col, kind = '') => { if (g.rev) g.rev.push({ prof, det: g.M[3], kind }); const M = g.M.slice(); if (M[3] >= 5 && M[3] <= 9) g.M = [M[0], M[1], M[2], M[3] + 15];
  g.at(0, 0, 0, QX(-90)).lathe(prof, seg, col4(col)); g.M = M; return g; };
const fac = (g, det) => g.mat(det === 7 ? 0.5 : 0.25, 0.45, 1, det), str = g => g.mat(0.6, 0.45, 1, DET.struct), lit = (g, k = 3) => g.mat(0, 0.4, k, 0);
const CORN = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const cols = (g, r, w, y0, y1, c) => { for (const [x, z] of CORN) B(g, x * r - w / 2, x * r + w / 2, y0, y1, z * r - w / 2, z * r + w / 2, c); };

// s: [w0, w1, d0, d1, h0, h1] in metres; big: needs a 2x2 block; ox: overhang factor for footprint bookkeeping.
// b(g, L): builds the archetype in unit space; L = the lite level (same silhouette, no thin or small parts).
// core: a box that is certainly solid (unit space), used as an occluder.
export const ARCH = {
  glassSlender: { core: [-.42, .42, 0, .97, -.42, .42], s: [26, 36, 26, 36, 420, 820], b: (g, L) => { fac(g, 7); B(g, -.42, .42, 0, .97, -.42, .42, C.glass); str(g); cols(g, .44, .12, 0, 1, C.dark); B(g, -.3, .3, .97, 1, -.3, .3, C.dark); } },
  stepped: { core: [-.5, .5, 0, .55, -.5, .5], s: [50, 58, 50, 58, 300, 620], b: (g, L) => { fac(g, F5); B(g, -.5, .5, 0, .55, -.5, .5, C.office); B(g, -.38, .38, .55, .8, -.38, .38, C.office); B(g, -.25, .25, .8, .95, -.25, .25, C.office);
    str(g); B(g, -.51, .51, .53, .56, -.51, .51, C.dark); B(g, -.39, .39, .78, .81, -.39, .39, C.dark); B(g, -.02, .02, .95, 1.06, -.02, .02, C.dark); lit(g); B(g, -.515, .515, .545, .55, -.515, .515, LW); } },
  recessed: { core: [-.5, .5, 0, .93, -.32, .32], s: [40, 56, 30, 40, 380, 700], b: (g, L) => { fac(g, 7); B(g, -.5, -.1, 0, 1, -.5, .5, C.glass); B(g, .1, .5, 0, .93, -.5, .5, C.glass); str(g); B(g, -.1, .1, 0, .97, -.32, .32, C.dark);
    if (!L) { lit(g, 0.7); B(g, -.02, .02, .05, .95, .32, .325, LC); B(g, -.02, .02, .05, .95, -.325, -.32, LC); } } },
  skyGarden: { core: [-.45, .45, 0, .32, -.45, .45], s: [34, 44, 34, 44, 450, 760], b: (g, L) => { fac(g, F5); for (const [a, c] of [[0, .32], [.36, .64], [.68, 1]]) B(g, -.45, .45, a, c, -.45, .45, C.office);
    str(g); if (!L) cols(g, .41, .08, 0, 1, C.dark); B(g, -.12, .12, 0, 1, -.12, .12, C.dark);
    for (const y of [.32, .64]) { str(g); B(g, -.46, .46, y - .005, y + .004, -.46, .46, C.conc); lit(g, 1.4); B(g, -.38, .38, y + .004, y + .012, -.38, .38, LG); } } },
  asymCrown: { core: [-.45, .45, 0, .86, -.45, .45], s: [32, 44, 32, 44, 420, 760], b: (g, L) => { fac(g, 7); B(g, -.45, .45, 0, .86, -.45, .45, C.glass); str(g); g.at(0, .9, 0, QZ(22)).box(.85, .1, .9, col4(C.dark));
    B(g, .26, .32, .86, 1.12, -.03, .03, C.dark); if (!L) cols(g, .45, .05, 0, .86, C.dark); lit(g, 4); B(g, .27, .31, 1.12, 1.135, -.02, .02, LR); } },
  exo: { core: [-.42, .42, 0, 1, -.42, .42], s: [36, 46, 36, 46, 450, 800], b: (g, L) => { fac(g, 7); B(g, -.42, .42, 0, 1, -.42, .42, C.glass); str(g); cols(g, .46, .07, 0, 1.01, C.steel);
    if (!L) for (let k = 0; k < 4; k++) for (const sz of [-1, 1]) for (const sd of [-1, 1]) { const y = (k + .5) / 4;
      g.at(0, y, sz * .475, QZ(sd * 48)).box(.035, .37, .03, col4(C.steel)); g.at(sz * .475, y, 0, QX(sd * 48)).box(.03, .37, .035, col4(C.steel)); }
    lit(g, 2); for (const [x, z] of CORN) B(g, x * .49 - .005, x * .49 + .005, 0, 1, z * .49 - .005, z * .49 + .005, LC); } },
  twin: { core: [-.5, -.14, 0, 1, -.5, .5], s: [60, 80, 26, 34, 420, 720], b: (g, L) => { fac(g, 7); B(g, -.5, -.14, 0, 1, -.5, .5, C.glass); B(g, .14, .5, 0, .82, -.5, .5, C.glass); fac(g, 6);
    for (const y of [.42, .66]) B(g, -.14, .14, y, y + .03, -.25, .25, C.office); str(g); B(g, -.42, -.22, 1, 1.05, -.3, .3, C.dark); B(g, .22, .42, .82, .86, -.3, .3, C.dark); } },
  needle: { core: [-.31, .31, 0, .35, -.31, .31], s: [26, 40, 26, 40, 700, 1150], b: (g, L) => { fac(g, 7); REV(g, [[.5, 0], [.46, .35], [.35, .36], [.34, .7], [.22, .71], [.2, .9], [.02, .99], [.005, 1.08]], L ? 14 : 28, C.glass); } },
  balcony: { core: [-.5, .5, 0, 1, -.3, .3], s: [50, 56, 18, 26, 160, 380], b: (g, L) => { fac(g, 6); B(g, -.5, .5, 0, 1, -.3, .3, C.resi); str(g);
    for (let k = L ? 2 : 1; k < 24; k += L ? 4 : 1) { const y = k / 24; B(g, -.48, .48, y - .004, y + .004, .3, .4, C.conc); B(g, -.48, .48, y - .004, y + .004, -.4, -.3, C.conc); } /* lite: every fourth slab, so the depth stays */ B(g, -.5, .5, 1, 1.03, -.3, .3, C.dark); } },
  stacked: { core: [-.5, .1, 0, .3, -.5, .2], s: [40, 56, 40, 56, 120, 260], b: (g, L) => { fac(g, 6); for (const p of [[-.5, .1, 0, .3, -.5, .2], [-.2, .5, 0, .45, -.1, .5], [-.45, .2, .3, .6, -.3, .3], [-.1, .45, .45, .78, -.45, .1], [-.35, .15, .6, .9, -.05, .45], [0, .35, .78, 1, -.3, .1]]) B(g, ...p, C.resi); } },
  podium: { big: 1, core: [-.5, .5, 0, .12, -.5, .5], s: [96, 116, 96, 116, 240, 420], b: (g, L) => { fac(g, F5); B(g, -.5, .5, 0, .12, -.5, .5, C.office); fac(g, 6);
    for (const [x, z, h] of [[-.28, -.24, .9], [.26, -.2, .72], [.02, .28, 1]]) B(g, x - .11, x + .11, .12, h, z - .11, z + .11, C.resi); lit(g, 1.3); B(g, -.46, -.1, .12, .126, .1, .44, LG); B(g, .1, .44, .12, .126, .1, .3, LG); } },
  terraced: { core: [-.5, .5, 0, .4, -.5, .31], s: [50, 58, 50, 58, 110, 220], b: (g, L) => { fac(g, 6); for (let k = 0; k < 5; k++) B(g, -.5, .5, k * .2, (k + 1) * .2, -.5, .5 - k * .19, C.resi);
    if (!L) { lit(g, 1.2); for (let k = 1; k < 5; k++) B(g, -.46, .46, k * .2, k * .2 + .006, .5 - k * .19, .5 - (k - 1) * .19 - .03, LG); } } },
  courtyard: { big: 1, s: [100, 116, 100, 116, 70, 140], b: (g, L) => { fac(g, 6); B(g, -.5, .5, 0, 1, -.5, -.3, C.resi); B(g, -.5, .5, 0, 1, .3, .5, C.resi); B(g, -.5, -.3, 0, 1, -.3, .3, C.resi); B(g, .3, .5, 0, .8, -.3, .3, C.resi); str(g); B(g, -.3, .3, 0, .04, -.3, .3, C.conc); } },
  factory: { big: 1, core: [-.5, .5, 0, .45, -.5, .5], s: [96, 116, 60, 80, 70, 140], b: (g, L) => { fac(g, 9); B(g, -.5, .5, 0, .45, -.5, .5, C.ind); str(g); for (let k = 0; k < 6; k++) g.at(-.5 + (k + .5) / 6, .5, 0, QZ(28)).box(.17, .02, .98, col4(C.steel));
    fac(g, 9); for (const x of [.3, .42]) g.at(x, .5, -.38, QX(-90)).cyl(.045, .04, 1, L ? 6 : 12, col4(C.ind)); } },
  cooling: { s: [50, 58, 50, 58, 120, 210], b: (g, L) => { g.mat(0, 0.9, 1, DET.struct); REV(g, [[.5, 0], [.46, .15], [.42, .3], [.37, .5], [.33, .68], [.335, .78], [.34, .85], [.38, 1]], L ? 14 : 28, C.conc, 'rib'); } }, /* V6: a plain concrete shell (no windows), ribbed in hero relief */
  tanks: { s: [50, 58, 50, 58, 40, 70], b: (g, L) => { str(g); B(g, -.5, .5, 0, .06, -.5, .5, C.conc); g.mat(.7, .35, 1, 0);
    for (const [x, z] of [[-.25, -.25], [.25, -.25], [-.25, .25]]) g.at(x, .45, z).sphere(.22, L ? 8 : 14, L ? 6 : 10, [.33, .32, .31, 0]);
    for (const [x, z] of [[.25, .25], [.38, .05], [.08, .38]]) g.at(x, .5, z, QX(-90)).cyl(.1, .1, .9, L ? 8 : 12, [.3, .3, .32, 0]); if (!L) B(g, -.48, .48, .3, .33, -.02, .02, C.steel); } },
  power: { core: [-.5, .5, 0, .32, -.5, .5], s: [50, 58, 50, 58, 200, 320], b: (g, L) => { fac(g, 9); B(g, -.5, .5, 0, .32, -.5, .5, C.ind); for (const x of [-.25, 0, .25]) g.at(x, .5, .3, QX(-90)).cyl(.06, .05, 1, L ? 8 : 12, col4(C.conc));
    lit(g, 3); for (const x of [-.25, 0, .25]) B(g, x - .055, x + .055, .97, .975, .245, .355, LR); str(g); B(g, -.45, .1, .32, .4, -.45, -.1, C.steel); } },
  frame: { core: [-.36, .36, .1, .42, -.36, .36], s: [30, 40, 30, 40, 200, 380], b: (g, L) => { g.mat(.7, .5, 1, 0); cols(g, .47, .06, 0, 1, C.steel);
    for (let k = L ? 2 : 1; k <= 10; k += L ? 2 : 1) { const y = k / 10; B(g, -.5, .5, y - .006, y + .006, .45, .5, C.steel); B(g, -.5, .5, y - .006, y + .006, -.5, -.45, C.steel); B(g, .45, .5, y - .006, y + .006, -.5, .5, C.steel); B(g, -.5, -.45, y - .006, y + .006, -.5, .5, C.steel); }
    fac(g, 9); B(g, -.36, .36, .1, .42, -.36, .36, C.ind); B(g, -.3, .3, .62, .9, -.3, .3, C.ind); } },
  dome: { big: 1, core: [-.34, .34, 0, .4, -.34, .34], s: [100, 116, 100, 116, 80, 120], b: (g, L) => { fac(g, 8); REV(g, [[.5, 0], [.5, .4]], L ? 16 : 40, C.stone, 'drum'); g.mat(.4, .35, 1, 0).at(0, .4, 0).sphere(.46, L ? 16 : 32, L ? 8 : 16, col4(C.cer));
    lit(g, 2); g.at(0, .41, 0, QX(90)).torus(.5, .006, L ? 16 : 32, 4, LW); } },
  terminal: { big: 1, core: [-.5, .5, 0, .18, -.5, .5], s: [104, 116, 56, 58, 40, 64], b: (g, L) => { str(g); B(g, -.5, .5, 0, .18, -.5, .5, C.conc); fac(g, 7); g.at(0, .18, 0, QY(90)).cyl(.42, .42, 1, L ? 12 : 24, col4(C.glass));
    if (!L) { str(g); for (let k = 0; k < 7; k++) { const x = -.45 + k * .15; B(g, x - .012, x + .012, .18, .5, .44, .48, C.dark); B(g, x - .012, x + .012, .18, .5, -.48, -.44, C.dark); } } lit(g, 3); B(g, -.5, .5, .595, .6, -.01, .01, LW); } },
  monolith: { core: [-.3, .3, 0, .666, -.3, .3], s: [50, 58, 50, 58, 700, 1150], b: (g, L) => { fac(g, 8); for (let k = 0; k < 6; k++) { const a = .44 - k * .045; B(g, -a, a, k / 6, (k + 1) / 6, -a, a, C.stone); }
    str(g); for (const [x, z] of CORN) g.at(x * .4, .47, z * .4, QY(x * z > 0 ? 45 : -45)).box(.04, .94, .2, col4(C.dark)); lit(g, 3); B(g, -.2, .2, .995, 1.003, -.2, .2, LW); } },
  cantilever: { ox: 1.5, core: [-.38, .38, 0, .8, -.38, .38], s: [32, 40, 32, 40, 380, 640], b: (g, L) => { fac(g, F5); B(g, -.38, .38, 0, .8, -.38, .38, C.office); fac(g, 7); B(g, -.38, .78, .8, 1, -.42, .42, C.glass);
    str(g); for (const z of [-.3, .3]) g.at(.55, .7, z, QZ(-38)).box(.05, .32, .06, col4(C.steel)); B(g, .38, .42, 0, .8, -.05, .05, C.dark); } },
  padTower: { ox: 1.9, core: [-.32, .32, 0, 1, -.32, .32], s: [28, 32, 28, 32, 350, 600], b: (g, L) => { fac(g, 7); B(g, -.32, .32, 0, 1, -.32, .32, C.glass); str(g); if (!L) cols(g, .32, .05, 0, 1, C.dark);
    for (const [y, sx] of [[.38, 1], [.56, -1], [.74, 1]]) { str(g); g.at(sx * .62, y, 0, QX(-90)).cyl(.3, .3, .012, L ? 10 : 20, col4(C.steel)); g.at(sx * .38, y - .03, 0, QZ(sx * 35)).box(.04, .08, .05, col4(C.dark));
      lit(g, 3); g.at(sx * .62, y + .007, 0, QX(90)).torus(.29, .006, L ? 10 : 20, 4, LW); } } },
  hub: { s: [50, 58, 50, 58, 150, 260], b: (g, L) => { str(g); g.at(0, .5, 0, QX(-90)).cyl(.16, .16, 1, L ? 8 : 16, col4(C.steel));
    for (const y of [.3, .55, .8]) { str(g); g.at(0, y, 0, QX(-90)).cyl(.5, .48, .04, L ? 14 : 28, col4(C.conc)); lit(g, 3); g.at(0, y + .022, 0, QX(90)).torus(.49, .004, L ? 14 : 28, 4, LC); }
    fac(g, 7); for (const [x, z] of [[.3, 0], [-.3, 0], [0, .3]]) B(g, x - .05, x + .05, 0, .82, z - .05, z + .05, C.glass); } },
  arco: { core: [-.26, .26, 0, .45, -.26, .26], s: [380, 760, 380, 760, 900, 2400], b: (g, L) => { fac(g, F5); REV(g, [[.5, 0], [.475, .18], [.39, .2], [.37, .45], [.275, .47], [.25, .72], [.16, .74], [.13, .93], [.03, 1]], L ? 12 : 24, C.office); } },
  low: { core: [-.5, .2, 0, .7, -.5, .5], s: [40, 56, 40, 56, 24, 80], b: (g, L) => { fac(g, F5); B(g, -.5, .2, 0, .7, -.5, .5, C.office); fac(g, 6); B(g, .2, .5, 0, 1, -.5, .1, C.resi); str(g); B(g, -.3, 0, .7, .8, -.2, .2, C.dark); B(g, .25, .45, 1, 1.08, -.4, -.1, C.dark); } },
};
const POOL = { ind: ['factory', 'cooling', 'tanks', 'power', 'frame', 'low', 'low'], res: ['balcony', 'stacked', 'podium', 'terraced', 'courtyard', 'skyGarden', 'low', 'balcony'],
  trn: ['terminal', 'hub', 'padTower', 'low', 'stacked', 'hub'], fin: ['glassSlender', 'stepped', 'recessed', 'skyGarden', 'asymCrown', 'exo', 'twin', 'needle', 'cantilever', 'padTower'],
  civ: ['dome', 'monolith', 'stepped', 'recessed', 'low', 'cantilever', 'dome'] };
const TINT = { ind: [0.92, 0.88, 0.82], res: [1.06, 0.98, 0.9], trn: [0.95, 0.98, 1.03], fin: [0.94, 1, 1.08], civ: [1.06, 1.02, 0.94] };
const SKY = ['glassSlender', 'stepped', 'recessed', 'monolith', 'twin', 'needle', 'exo', 'asymCrown', 'padTower', 'balcony', 'cooling', 'skyGarden'];

// Near-detail facade relief for hero buildings, aligned to the facade shader's window grid (cells anchored at world
// multiples of the cell size) so the real geometry frames the painted windows: office spandrel ledges and mullion
// fins, curtain-wall aluminium fins, residential balcony slabs with parapets, brutalist piers and bands with the
// windows sitting in deep slots. Built per building on demand, only for the few heroes near the camera.
const RELIEF = {
  5: { cs: [3.2, 4.2], led: [-0.62, 0.78, 0.5], fin: [0.24, 0.42], every: 1, col: [0.2, 0.2, 0.22], m: [0.6, 0.4] },
  6: { cs: [6, 3.4], led: [-0.14, 0.22, 1.5], par: 1.05, col: [0.5, 0.48, 0.45], m: [0, 0.85] },
  7: { cs: [1.6, 4], led: [-0.04, 0.7, 0.34], fin: [0.14, 0.62], every: 2, col: [0.11, 0.12, 0.14], m: [0.85, 0.32] },
  8: { cs: [5, 3.6], led: [-0.54, 0.54, 0.8], fin: [3.3, 0.8], every: 1, col: [0.46, 0.45, 0.42], m: [0, 0.92] },
  9: { cs: [9, 7], led: [-0.18, 0.18, 0.32], fin: [0.5, 0.55], every: 1, col: [0.2, 0.2, 0.22], m: [0.6, 0.5] } }; // V6: industrial cladding gets girts and columns
export function heroRelief(hero) {
  const g = new Geo(), T = hero.tint;
  for (const [X0, X1, B0, B1, Z0, Z1, det] of hero.boxes) { const R = RELIEF[det], Y0 = Math.max(B0, hero.band[0]), Y1 = Math.min(B1, hero.band[1]); if (!R || Y1 - Y0 < 8) continue; const col = [R.col[0] * T[0], R.col[1] * T[1], R.col[2] * T[2], 0];
    g.mat(R.m[0], R.m[1], 1, 0);
    for (const [ax, sg] of [[0, -1], [0, 1], [2, -1], [2, 1]]) { // faces: x = X0 / X1 (along z), z = Z0 / Z1 (along x)
      const P = ax === 0 ? (sg < 0 ? X0 : X1) : (sg < 0 ? Z0 : Z1), a0 = ax === 0 ? Z0 : X0, a1 = ax === 0 ? Z1 : X1, dp = R.led[2];
      const bx = (u0, u1, y0, y1, d0, d1) => { const c = (u0 + u1) / 2, n0 = P + sg * d0, n1 = P + sg * d1, nc = (n0 + n1) / 2, nw = Math.abs(n1 - n0);
        if (ax === 0) g.at(nc, (y0 + y1) / 2, c).box(nw, y1 - y0, u1 - u0, col); else g.at(c, (y0 + y1) / 2, nc).box(u1 - u0, y1 - y0, nw, col); };
      for (let k = Math.ceil((Y0 + 1.5) / R.cs[1]); k * R.cs[1] < Y1 - 1.5; k++) { const y = k * R.cs[1];
        bx(a0 - dp, a1 + dp, y + R.led[0], y + R.led[1], 0, dp);
        if (R.par) bx(a0 - dp, a1 + dp, y + R.led[1], y + R.led[1] + R.par, dp - 0.12, dp); }
      if (R.fin) for (let j = Math.ceil((a0 + 0.8) / R.cs[0]); j * R.cs[0] < a1 - 0.8; j++) { if (j % R.every) continue; const u = j * R.cs[0];
        bx(u - R.fin[0] / 2, u + R.fin[0] / 2, Y0, Y1, 0, R.fin[1]); }
    } }
  for (const rv of hero.revs || []) revRelief(g, hero, rv);
  return g;
}
// V6 curved relief: spandrel rings and mullion fins that follow a surface of revolution (glass towers), piers and a
// cornice on a drum, meridian ribs, a cornice and the diagonal base columns on a cooling tower. Columns use the same
// count per tier as the facade shader's curved window mapping, so fins frame the painted windows. Built only within
// 130 m of the course's altitude there, like the box relief, and only on the tiers that exist at that height.
const REVR = { 7: { cs: [1.6, 4], ring: [-0.04, 0.7, 0.34], fin: [0.14, 0.62], every: 4, mech: 16, col: [0.11, 0.12, 0.14], m: [0.85, 0.32] },
  5: { cs: [3.2, 4.2], ring: [-0.62, 0.78, 0.5], fin: [0.24, 0.42], every: 2, mech: 16, col: [0.2, 0.2, 0.22], m: [0.6, 0.4] },
  drum: { cs: [5, 3.6], fin: [1.3, 0.8], every: 1, cornice: [2.4, 1.4], col: [0.48, 0.46, 0.42], m: [0, 0.9] },
  rib: { ribs: 48, fin: [0.9, 0.55], cornice: [3, 1.6], base: 0.07, col: [0.44, 0.43, 0.4], m: [0, 0.9] } };
const QV = new Quat(), TV = new Vec3(), PV = [new Vec3(), new Vec3(), new Vec3(), new Vec3()], NV = new Vec3(), UPV = new Vec3(0, 1, 0), DNV = new Vec3(0, -1, 0);
function revRelief(g, hero, rv) {
  const X = hero.xf, R = REVR[rv.kind === 'rib' ? 'rib' : rv.kind === 'drum' ? 'drum' : rv.det]; if (!R || !X) return;
  QV.setAxisAngle(0, 1, 0, X.yaw); const P = rv.prof, wA = Math.abs(X.w), T = hero.tint, col = [R.col[0] * T[0], R.col[1] * T[1], R.col[2] * T[2], 0];
  const rAt = yu => { for (let i = 0; i < P.length - 1; i++) { const [r0, y0] = P[i], [r1, y1] = P[i + 1]; if (yu >= y0 - 1e-6 && yu <= y1 + 1e-6) return y1 - y0 < 0.012 ? -1 : r0 + (r1 - r0) * (yu - y0) / (y1 - y0); } return -1; };
  // a point on the surface at world height yw and unit angle th, pushed out by dep along the horizontal radial direction
  const at = (yw, th, dep, out) => { const yu = (yw - X.y) / X.h, r = rAt(yu); if (r < 0) return false; out.set(r * Math.sin(th) * X.w, yw - X.y, r * Math.cos(th) * X.d).applyQuat(QV);
    NV.set(out.x, 0, out.z).normalize(); out.x += X.x + NV.x * dep; out.y += X.y; out.z += X.z + NV.z * dep; return true; };
  const quad = (a, b, c, d, nx, ny, nz) => { NV.set(nx, ny, nz); const i = [a, b, c, d].map(p => g.raw(p, NV, col)); g.quad(i[0], i[1], i[2], i[3]); };
  const radial = th => { TV.set(Math.sin(th) * X.w, 0, Math.cos(th) * X.d).applyQuat(QV).normalize(); return TV; };
  const lo = Math.max(X.y + P[0][1] * X.h, hero.band[0] + 190), hi = Math.min(X.y + P[P.length - 1][1] * X.h, hero.band[1] - 150); if (hi - lo < 8) return;
  g.mat(R.m[0], R.m[1], 1, 0);
  const ring = (yb, yt, dep, c0) => { const r = rAt((yb - X.y) / X.h); if (r < 0 || rAt((yt - X.y) / X.h) < 0) return; const S = Math.max(16, Math.min(72, Math.round(6.283 * r * wA / 2.6)));
    for (let k = 0; k < S; k++) { const t0 = k / S * 6.2832, t1 = (k + 1) / S * 6.2832, [a, b, c, d] = PV, tm = (t0 + t1) / 2, rd = radial(tm), nx = rd.x, nz = rd.z;
      at(yb, t0, dep, a); at(yt, t0, dep, b); at(yt, t1, dep, c); at(yb, t1, dep, d); quad(a, b, c, d, nx, 0, nz);   // outer face
      const e = new Vec3(), f = new Vec3(); at(yt, t0, 0, e); at(yt, t1, 0, f); at(yt, t0, dep, b); at(yt, t1, dep, c); quad(e, f, c, b, 0, 1, 0);   // top
      at(yb, t0, 0, e); at(yb, t1, 0, f); at(yb, t0, dep, a); at(yb, t1, dep, d); quad(a, d, f, e, 0, -1, 0); } };   // underside
  const fin = (th, ya, yb, wid, dep) => { const ru = rAt((ya + yb) / 2 / 1 - X.y > 0 ? ((ya + yb) / 2 - X.y) / X.h : 0); if (ru <= 0) return; const dth = wid / 2 / Math.max(1, ru * wA), [a, b, c, d] = PV;
    for (const s of [-1, 1]) { at(ya, th + s * dth, 0, a); at(ya, th + s * dth, dep, b); at(yb, th + s * dth, dep, c); at(yb, th + s * dth, 0, d); const rd = radial(th), tx = rd.z * s, tz = -rd.x * s; s > 0 ? quad(a, b, c, d, tx, 0, tz) : quad(a, d, c, b, tx, 0, tz); }
    at(ya, th - dth, dep, a); at(ya, th + dth, dep, b); at(yb, th + dth, dep, c); at(yb, th - dth, dep, d); const rd = radial(th); quad(a, b, c, d, rd.x, 0, rd.z); };
  if (R.ribs) { // cooling tower: meridian ribs up the shell, a cornice at the lip, diagonal columns round the base
    const top = X.y + P[P.length - 1][1] * X.h, steps = 10;
    for (let j = 0; j < R.ribs; j++) { const th = j / R.ribs * 6.2832; for (let k = 0; k < steps; k++) { const ya = lo + (hi - lo) * k / steps, yb = lo + (hi - lo) * (k + 1) / steps; fin(th, ya, yb, R.fin[0], R.fin[1]); } }
    if (top <= hero.band[1] - 150 + 400) ring(top - R.cornice[0], top - 0.2, R.cornice[1]);
    const by = X.y + R.base * X.h; if (by > lo - 400) for (let j = 0; j < R.ribs; j++) { const th = j / R.ribs * 6.2832, th2 = (j + 1) / R.ribs * 6.2832, [a, b, c, d] = PV;
      at(X.y + 0.5, th, 0.6, a); at(by, th2, 0.6, b); at(by, th2, 1.6, c); at(X.y + 0.5, th, 1.6, d); const rd = radial((th + th2) / 2); quad(a, b, c, d, rd.x, 0, rd.z); }
    return; }
  if (R.cornice) { const top = X.y + P[P.length - 1][1] * X.h; ring(top - R.cornice[0], top, R.cornice[1]); }
  const fl = R.cs[1];
  for (let y = Math.ceil(lo / fl) * fl; y < hi - 1; y += fl) { // one floor: spandrel ring (or louvre band on mechanical floors), then fins round the tier
    const yu = (y + fl / 2 - X.y) / X.h, r = rAt(yu); if (r < 0) continue;
    const mech = R.mech && Math.round(y / fl) % R.mech === 0;
    if (R.ring) ring(y + R.ring[0] - (mech ? 0.5 : 0), y + R.ring[1] + (mech ? 0.6 : 0), R.ring[2] + (mech ? 0.25 : 0));
    const nc = Math.max(4, 4 * Math.round(6.2832 * r * wA / (4 * R.cs[0])));
    for (let j = 0; j < nc; j += R.every) fin((j / nc - 0.5) * 6.2832, y, y + fl, R.fin[0], R.fin[1]);
  }
}

export function buildCityBlocks(gfx, t, rng, GROUND) {
  const N = t.N, items = [], m = mat4.create(), qr = new Quat(), L = [], lowQ = gfx.cfg && gfx.cfg.msaa === 0;
  const put = (k, x, y, z, w, h, d, yaw = 0, tint = [1, 1, 1], f = 0) => L.push([k, x, y, z, w, h, d, yaw, tint, f]); // f: 0 city, 1 hero, 2 skyline, 3 gallery
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of t.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, pick = a => a[Math.floor(rng() * a.length)], lerp = (a, b) => a + (b - a) * rng();
  const nearest = (x, z) => { let d = 1e9, di = 0; for (let i = 0; i < N; i += 2) { const p = t.pos[i], dd = Math.hypot(p.x - x, p.z - z); if (dd < d) { d = dd; di = i; } } return [d, di]; };
  const floorAt = di => { let f = 1e9; for (let k = -12; k <= 12; k += 3) { const j = t.wrapIdx(di + k); f = Math.min(f, t.pos[j].y - t.h[j]); } return f - 40; };
  const district = (x, z) => { const v = (Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) + Math.cos(z * 0.0019 - Math.sin(x * 0.0011) * 1.7)) * 0.25 + 0.5;
    return v < 0.24 ? 'ind' : v < 0.44 ? 'res' : v < 0.56 ? 'trn' : v < 0.84 ? 'fin' : 'civ'; };
  // the racing corridor's footprint in 100 m cells with its altitude band, so highways and traffic stay clear of it
  const occ = new Map();
  for (let i = 0; i < N; i += 2) for (let s = -1; s <= 1; s += 0.5) { const p = t.pointAt(i, s * t.w[i], 0), k = Math.floor(p.x / 100) + ',' + Math.floor(p.z / 100), o = occ.get(k), lo = p.y - t.h[i] - 30, hi = p.y + t.h[i] + 30;
    if (o) { o[0] = Math.min(o[0], lo); o[1] = Math.max(o[1], hi); } else occ.set(k, [lo, hi]); }
  const inCorridor = (x, y, z, pad = 0) => { const o = occ.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); return !!o && y > o[0] - pad && y < o[1] + pad; };
  const signSpots = [], stacks = [], beacons = [], fp = new Map(), used = new Set(), HW = 5;
  const reg = (x, z, hw, hd, top) => { const k = Math.floor(x / 66) + ',' + Math.floor(z / 66); if (!fp.has(k)) fp.set(k, []); fp.get(k).push({ x, z, hw, hd, top }); };
  const x0 = minX - 900, z0 = minZ - 900, NX = Math.ceil((maxX - minX + 1800) / 66), NZ = Math.ceil((maxZ - minZ + 1800) / 66);
  // landmarks: a few exceptionally large towers on well-separated sites
  const marks = []; for (let k = 0; k < 40 && marks.length < 5; k++) { const i = 2 + Math.floor(rng() * (NX - 4)), j = 2 + Math.floor(rng() * (NZ - 4));
    if (marks.every(([a, b]) => Math.hypot(a - i, b - j) > 9)) marks.push([i, j, pick(['monolith', 'needle', 'twin', 'exo'])]); }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (used.has(i + ',' + j)) continue; used.add(i + ',' + j);
    const mk = marks.find(([a, b]) => a === i && b === j);
    if (!mk && rng() < 0.1) { const py = GROUND + 40 + rng() * 60; if (!inCorridor(x0 + i * 66 + 33, py, z0 + j * 66 + 33, 20)) put('deck', x0 + i * 66 + 33, py, z0 + j * 66 + 33, 56, 3, 56); continue; } // raised plazas in the gaps
    const cx0 = x0 + i * 66, cz0 = z0 + j * 66, dk = district(cx0 + 33, cz0 + 33);
    let name = mk ? mk[2] : pick(POOL[dk]), A = ARCH[name];
    const free2 = (i + 1) % HW && (j + 1) % HW && i + 1 < NX && j + 1 < NZ && !used.has((i + 1) + ',' + j) && !used.has(i + ',' + (j + 1));
    if (A.big && !free2) { name = dk === 'ind' ? 'tanks' : 'low'; A = ARCH[name]; }
    if (A.big) { used.add((i + 1) + ',' + j); used.add(i + ',' + (j + 1)); used.add((i + 1) + ',' + (j + 1)); }
    // building zone inside its block: 4 m from streets, 12 m from reserved highway lines
    const span = A.big ? 2 : 1, ax0 = cx0 + (i % HW ? 4 : 12), ax1 = cx0 + span * 66 - ((i + span) % HW ? 4 : 12), az0 = cz0 + (j % HW ? 4 : 12), az1 = cz0 + span * 66 - ((j + span) % HW ? 4 : 12);
    const px = (ax0 + ax1) / 2, pz = (az0 + az1) / 2, yaw = (A.big || name === 'twin' || name === 'balcony') && rng() < 0.5 ? Math.PI / 2 : 0, ox = A.ox || 1;
    let w = lerp(A.s[0], A.s[1]), dd = lerp(A.s[2], A.s[3]); const lim = Math.min(ax1 - ax0, az1 - az0) / ox; w = Math.min(w, lim); dd = Math.min(dd, lim);
    const [d, di] = nearest(px, pz), near = d < 340, half = Math.max(w, dd) * 0.75 * ox, under = d < t.w[di] + 26 + half, cap = under ? floorAt(di) : 1e9;
    let h = lerp(A.s[4], A.s[5]) * (mk ? 1.55 : 1) * (d > 700 && dk !== 'fin' ? 0.75 : 1);
    if (mk && !under) { w *= 1.3; dd *= 1.3; w = Math.min(w, lim); dd = Math.min(dd, lim); }
    if (GROUND + h > cap) { h = cap - GROUND; if (h < 40) continue; if (h < A.s[4] * 0.5) { name = 'low'; } }
    const tn = TINT[dk], tv = 0.9 + rng() * 0.2, tint = [tn[0] * tv, tn[1] * tv, tn[2] * tv], sw = yaw ? dd : w, sd = yaw ? w : dd;
    put(name, px, GROUND, pz, w, h, dd, yaw, tint, mk || (d < 230 && (h > 120 || name === 'dome' || name === 'cooling' || name === 'factory' || name === 'power')) ? 1 : 0); reg(px, pz, sw / 2 * ox + 3, sd / 2 * ox + 3, GROUND + h * 1.1 + 30);
    if (h > 480) beacons.push(v3(px, GROUND + h * (name === 'needle' ? 1.08 : 1.02) + 6, pz));
    if (near && d < 240 && (dk === 'fin' || dk === 'civ') && h > 200) signSpots.push({ px, pz, sx: sw, sz: sd, top: GROUND + h, di });
    if (name === 'factory' || name === 'power') stacks.push(v3(px + (name === 'factory' ? 0.3 : 0) * sw, GROUND + h, pz + (name === 'factory' ? -0.38 : 0.3) * sd));
  }
  // elevated highways on every fifth street, two levels, on pillars; segments that would meet the course are left out
  const hwys = [];
  for (let i = 0; i <= NX; i += HW) hwys.push({ ax: 1, line: x0 + i * 66, y: GROUND + 150 });
  for (let j = 0; j <= NZ; j += HW) hwys.push({ ax: 0, line: z0 + j * 66, y: GROUND + 210 });
  for (const hw of hwys) { const n = hw.ax ? NZ : NX, o = hw.ax ? z0 : x0; hw.segs = [];
    for (let k = 0; k < n; k++) { const a = o + k * 66 + 33, x = hw.ax ? hw.line : a, z = hw.ax ? a : hw.line;
      if (inCorridor(x, hw.y, z, 25)) continue; hw.segs.push([a - 33, a + 33]);
      put('hwy', x, hw.y, z, 18, 3, 66, hw.ax ? 0 : Math.PI / 2); if (k % 2 === 0 && !inCorridor(x, hw.y - 80, z, 10)) put('pillar', x, GROUND, z, 7, hw.y - GROUND - 1.5, 7); } }
  // far skyline: big recognisable silhouettes out to the haze, then arcologies
  const R0 = Math.max(maxX - minX, maxZ - minZ) / 2 + 1100;
  // V5: heights follow a slow profile around the horizon (downtown peaks and low gaps) and every other tower is
  // mirrored, so the ring of silhouettes never reads as one repeated shape
  const prof = a => 0.62 + 0.5 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3)) * (0.65 + 0.35 * Math.cos(a * 5 - 0.4));
  for (let k = 0; k < (lowQ ? 260 : 520); k++) { const a = rng() * 6.283, r = R0 + rng() * 2600, nm = pick(SKY), A = ARCH[nm], s = 1.3 + rng() * 0.4;
    put(nm, cx + Math.cos(a) * r, GROUND, cz + Math.sin(a) * r, lerp(A.s[0], A.s[1]) * s * (k % 2 ? -1 : 1), lerp(A.s[4], A.s[5]) * (0.9 + rng() * 0.6) * prof(a), lerp(A.s[2], A.s[3]) * s, rng() * 3, [0.85, 0.9, 1], 2); }
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + rng(), r = R0 + 3200 + rng() * 2400, s = 380 + rng() * 380; put('arco', cx + Math.cos(a) * r, GROUND, cz + Math.sin(a) * r, s, s * (2.2 + rng() * 1.6), s, rng() * 3, [1, 1, 1], 2); }
  // archetype gallery for the architecture sheet (?gallery): one of each, in a row south of the city
  let gallery = null;
  if (typeof location !== 'undefined' && /[?&]gallery/.test(location.search)) { const names = Object.keys(ARCH).filter(n => n !== 'arco'), gz = cz - R0 - 6500; // beyond the skyline and arcologies, so the sheet shows only the buildings
    names.forEach((nm, k) => { const A = ARCH[nm]; put(nm, x0 + k * 150, GROUND, gz, (A.s[0] + A.s[1]) / 2, (A.s[4] + A.s[5]) / 2, (A.s[2] + A.s[3]) / 2, 0, [1, 1, 1], 3); }); gallery = { x0, z: gz, n: names.length, step: 150 }; }
  // build each module once at two levels of detail; every placement becomes an instance in a culled, LOD-bucketed set
  const MOD = { ...Object.fromEntries(Object.entries(ARCH).map(([k, a]) => [k, L => { const g = new Geo(); if (!L) { g.rec = []; g.rev = []; } a.b(g, L); return g; }])),
    deck: () => new Geo().mat(0.5, 0.6, 1, DET.struct).at(0, 0, 0).box(1, 1, 1, [0.13, 0.13, 0.15, 0]).mat(0, 0.4, 3, 0).at(0, 0.52, 0.497).box(1, 0.06, 0.012, [1, 0.7, 0.35, 1]).at(0, 0.52, -0.497).box(1, 0.06, 0.012, [1, 0.7, 0.35, 1]),
    hwy: () => new Geo().mat(0.4, 0.7, 1, DET.struct).at(0, 0, 0).box(1, 1, 1, [0.16, 0.16, 0.17, 0]).mat(0.6, 0.5, 1, 0).at(0.47, 0.9, 0).box(0.04, 0.8, 1, [0.25, 0.25, 0.27, 0]).at(-0.47, 0.9, 0).box(0.04, 0.8, 1, [0.25, 0.25, 0.27, 0])
      .mat(0, 0.4, 2.5, 0).at(0, 0.505, 0).box(0.02, 0.01, 0.6, [1, 0.85, 0.5, 1]).at(0.44, 1.32, 0).box(0.02, 0.02, 1, [1, 0.55, 0.25, 1]).at(-0.44, 1.32, 0).box(0.02, 0.02, 1, [1, 0.55, 0.25, 1]),
    pillar: () => new Geo().mat(0.3, 0.7, 1, DET.struct).at(0, 0.5, 0, QX(-90)).cyl(0.5, 0.5, 1, 10, [0.3, 0.29, 0.28, 0]).at(0, 0.985, 0).box(2.2, 0.03, 1.4, [0.25, 0.25, 0.26, 0]) };
  const byK = new Map(); for (const e of L) { if (!byK.has(e[0])) byK.set(e[0], []); byK.get(e[0]).push(e); }
  const sets = [], occl = [], heroes = [], facades = {}, revs = {}, cw = new Vec3(), RIM = [0.04, 0.045, 0.05];
  for (const [k, list] of byK) {
    const gF = MOD[k](false), bb = gF.bounds(), A = ARCH[k]; facades[k] = (gF.rec || []).filter(b => b[1] - b[0] > 0.2 && b[3] - b[2] > 0.08 && b[5] - b[4] > 0.2); revs[k] = gF.rev || [];
    const levels = [{ mesh: gfx.mesh(gF.build(), list.length), px: A ? 90 : 0 }]; if (A) levels.push({ mesh: gfx.mesh(MOD[k](true).build(), list.length), px: 0 });
    const S = new InstanceSet(gfx, levels, list.length, { rim: RIM, prog: 'pbrCity' }); S.key = k; sets.push(S); // facade + structure shader variant
    for (const [, x, y, z, w, h, d, yaw, tint, f] of list) {
      qr.setAxisAngle(0, 1, 0, yaw); mat4.compose(m, v3(x, y, z), qr, w, h, d);
      const W = (ux, uy, uz) => cw.set(ux * w, uy * h, uz * d).applyQuat(qr).add(v3(x, y, z)); // unit space -> world
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let c = 0; c < 8; c++) { const p = W(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z); lo = [Math.min(lo[0], p.x), Math.min(lo[1], p.y), Math.min(lo[2], p.z)]; hi = [Math.max(hi[0], p.x), Math.max(hi[1], p.y), Math.max(hi[2], p.z)]; }
      S.add(m, (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, tint[0], tint[1], tint[2], 1);
      if (A && A.core && f !== 3) { const c = A.core, cr = new Float32Array(24); // solid core as an occluder
        for (let q = 0; q < 8; q++) { const p = W(c[q & 1 ? 1 : 0], c[q & 2 ? 3 : 2], c[q & 4 ? 5 : 4]); cr[q * 3] = p.x; cr[q * 3 + 1] = p.y; cr[q * 3 + 2] = p.z; }
        const oc = W((c[0] + c[1]) / 2, (c[2] + c[3]) / 2, (c[4] + c[5]) / 2).clone(); // the core also as an oriented box (centre, yaw, half sizes) for the tests' ray casts
        occl.push({ c: cr, x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, z: (lo[2] + hi[2]) / 2, a: Math.abs((c[1] - c[0]) * w * (c[3] - c[2]) * h) + Math.abs((c[5] - c[4]) * d * (c[3] - c[2]) * h), obb: [oc.x, oc.y, oc.z, yaw, Math.abs((c[1] - c[0]) * w) / 2, (c[3] - c[2]) * h / 2, Math.abs((c[5] - c[4]) * d) / 2] }); }
      if (f === 1 && (facades[k].length || revs[k].length)) { // hero: facade volumes in world space for the near-detail layer, plus curved surfaces (V6)
        const boxes = facades[k].map(([a0, a1, b0, b1, c0, c1, det]) => { const p = W(a0, b0, c0).clone(), q = W(a1, b1, c1).clone(); return [Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.y, q.y), Math.max(p.y, q.y), Math.min(p.z, q.z), Math.max(p.z, q.z), det]; })
          .filter(b => b[1] - b[0] > 12 && b[5] - b[4] > 12 && b[3] - b[2] > 20);
        const ty = t.pos[nearest(x, z)[1]].y; // relief only in the altitude band the course passes through here
        if (boxes.length || revs[k].length) heroes.push({ k, boxes, revs: revs[k], xf: { x, y, z, w, h, d, yaw }, tint, band: [ty - 320, ty + 280], lo, hi, c: v3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2), r: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 });
      }
    }
    items.push(...S.items);
  }
  const foot = (x, y, z) => { const ix = Math.floor(x / 66), iz = Math.floor(z / 66);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = fp.get((ix + a) + ',' + (iz + b)); if (l) for (const f of l) if (y < f.top && Math.abs(x - f.x) < f.hw && Math.abs(z - f.z) < f.hd) return true; }
    return false; };
  return { items, sets, occl, heroes, signSpots, stacks, beacons, foot, hwys, gallery, grid: { x0, z0 }, archetypes: Object.keys(ARCH).length, bounds: { minX, maxX, minZ, maxZ, cx, cz } };
}
