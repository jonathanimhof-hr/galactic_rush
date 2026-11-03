// GALACTIC RUSH — game controller: loading, settings and presets, scenes, flow, camera, bench.
// V7 adds the career: race rewards, championship runs, upgrades and paint jobs (src/progress, src/garage.js).
import { Vec3, Quat, clamp, wrapDelta, makeRng } from './math.js';
import { SHIPS, AI_ROSTER, DIFFICULTY, CHAMPIONSHIP, SIM_DT, shipById } from './config.js';
import { getTrack, TRACK_DEFS } from './sim/tracks.js';
import { Race } from './sim/race.js';
import { Championship } from './sim/championship.js';
import { GFX, PRESETS } from './render/gfx.js';
import { Effects } from './render/effects.js';
import { buildCourse } from './render/courses/index.js';
import { VIS } from './render/lod.js';
import './render/courses/all.js';
import { buildHangar } from './render/hangar.js';
import { ShipVisual, shipModel } from './render/shipvis.js';
import { RaceView, liveryFor } from './render/raceview.js';
import { buildCockpit } from './render/models.js';
import { makeInstruments, courseMap } from './render/textures.js';
import { CameraRig } from './camera.js';
import { Audio } from './audio.js';
import { Input, loadSave, storeSave, mergeSave } from './input.js';
import { UI, fmt } from './ui.js';
import { HUD } from './hud.js';
import { RaceFX } from './racefx.js';
import { Progression, standingsOf } from './progress/index.js';
import { CHAMPIONSHIP_REWARDS, DIFF_ORDER, lapMult } from './progress/economy.js';
import { Garage } from './garage.js';
import { champHubHTML, careerHTML } from './ui-garage.js';
// V8: online multiplayer tournament mode (src/mp)
import { Multiplayer } from './mp/controller.js';

const $ = s => document.querySelector(s);
const DEFAULTS = { handling: 'relaxed', sound: 'on', master: 0.8, music: 0.55, sfx: 0.9, sens: 1, padSens: 1, invert: 'false', assist: '0.3', cam: 'chase', preset: '',
  shadows: 'on', ao: 'on', volumetrics: 'on', motionBlur: 'on', grain: 'on', ca: 'on', flare: 'on', resScale: 1, dynRes: 'on', fov: 72, shake: 1, hudScale: 1,
  reducedMotion: 'off', fpsCounter: 'off', rumble: 'on' };
const PRESET_TOGGLES = { low: { shadows: 'off', ao: 'off', volumetrics: 'off', motionBlur: 'on', grain: 'off', ca: 'off' }, medium: { shadows: 'on', ao: 'off', volumetrics: 'on', motionBlur: 'on', grain: 'on', ca: 'off' },
  high: { shadows: 'on', ao: 'on', volumetrics: 'on', motionBlur: 'on', grain: 'on', ca: 'on' }, ultra: { shadows: 'on', ao: 'on', volumetrics: 'on', motionBlur: 'on', grain: 'on', ca: 'on' } };
const css = c => `rgb(${c.map(v => Math.round(Math.min(1, v) * 255)).join(',')})`;
const params = new URLSearchParams(location.search);
// the artifact viewer drops query strings but passes a plain #anchor, so #bench / #bench-short also start the benchmark
if (/^#bench(-short)?$/.test(location.hash)) params.set('bench', location.hash === '#bench-short' ? 'short' : '1');
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const tmp = new Vec3(), loc = {};

class Game {
  constructor() { window.__game = this; this.vis = VIS; this.ready = false; this.boot().catch(e => this.fatal(e)); }
  fatal(e) { console.error(e); const el = $('#err'); el.hidden = false; el.innerHTML = `<div><h2>Can't start the engines</h2><p class="lede" style="margin:12px auto">${String(e.message || e).replace(/</g, '&lt;').slice(0, 400)}</p><p class="lede">Galactic Rush needs WebGL2. Try a current Chrome, Edge, Firefox or Safari with hardware acceleration on.</p></div>`; $('#loading').classList.add('done'); }

  async boot() {
    this.canvas = $('#gl');
    this.gfx = new GFX(this.canvas);
    this.save = loadSave(); this.settings = { ...DEFAULTS, ...this.save.settings };
    this.progress = new Progression(); if (this.progress.loadIssues.length) console.warn('Galactic Rush career data:', this.progress.loadIssues.join('; '));
    if (!this.settings.preset) { this.settings.preset = (this.save.settings.quality && PRESETS[this.save.settings.quality]) ? this.save.settings.quality : this.autoPreset(); Object.assign(this.settings, PRESET_TOGGLES[this.settings.preset]); this.firstRun = true; }
    if (params.get('quality') && PRESETS[params.get('quality')]) { this.settings.preset = params.get('quality'); Object.assign(this.settings, PRESET_TOGGLES[this.settings.preset]); this.settings.dynRes = 'off'; }
    this.audio = new Audio(); this.input = new Input(); this.ui = new UI(this); this.ui.recKey = id => this.recKey(id); this.hud = new HUD(); this.fx = new Effects(this.gfx); this.rig = new CameraRig();
    this.garage = new Garage(this); this.benchMode = params.has('bench');
    this.racefx = new RaceFX(this);
    this.mp = new Multiplayer(this); // V8
    this.opts = { mode: params.get('mode') || 'quick', track: params.get('track') || 'foundry', laps: +(params.get('laps') || 3), diff: params.get('diff') || 'pro', ship: params.has('ship') ? +params.get('ship') : Math.max(0, SHIPS.findIndex(s => s.id === this.progress.profile.selectedShip)) };
    this.timeScale = +(params.get('ts') || 1); this.autotest = params.has('autotest'); this.camMode = this.settings.cam;
    this.state = 'loading'; this.acc = 0; this.t = 0; this.fps = 60; this.frames = 0; this.fpsT = 0; this.res = 1; this.ftAcc = 0; this.ftN = 0; this.slowmo = 0;
    this.courses = new Map(); this.maps = new Map();
    this.applySettings(false);
    addEventListener('resize', () => this.gfx.resize(innerWidth, innerHeight));
    const unlock = () => { this.audio.init(); this.audio.configure(this.settings); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    // loading with real progress
    const steps = [['Generating liveries and textures', () => { for (const a of AI_ROSTER) new ShipVisual(this.gfx, shipById(a.ship), liveryFor({ name: a.name, paint: a.paint, id: 0, ship: { def: shipById(a.ship) } })); for (const d of SHIPS) new ShipVisual(this.gfx, d, liveryFor({ isPlayer: true, ship: { def: d } })); }],
      ...TRACK_DEFS.map(d => [`Building ${d.name}`, () => this.prepCourse(d.id)]),
      ['Lighting the hangar', () => { this.hangar = buildHangar(this.gfx); this.gfx.buildEnv(this.hangar.env); }],
      ['Building ships', () => { for (const s of SHIPS) shipModel(this.gfx, s); for (const a of AI_ROSTER) shipModel(this.gfx, shipById(a.ship), a.paint); this.cockpit = this.makeCockpit(); }],
      ['Warming up shaders', () => this.warmup()]];
    for (let k = 0; k < steps.length; k++) { this.loadProgress(k / steps.length, steps[k][0]); await nextFrame(); await nextFrame(); steps[k][1](); }
    this.loadProgress(1, 'Ready'); $('#loading').classList.add('done'); this.ready = true;
    this.ff = secs => { const n = Math.round(secs / SIM_DT), sc = this.scene; if (this.state === 'intro') this.endIntro(); for (let k = 0; k < n; k++) { sc.race.step(SIM_DT, null); if (k % 60 === 0) this.racefx.events(sc.race, true); } this.racefx.events(sc.race, true); this.rig.snap = true; return sc.race.time; };
    if (params.has('bench')) this.runBench();
    else if (params.has('skipmenu')) { this.opts.mode = params.get('mode') || 'quick'; this.startRace(); }
    else if (params.get('view') === 'hangar') { this.toShipSelect(); }
    else { this.startAttract(); this.state = 'title'; this.ui.title(this.touch); }
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }
  loadProgress(f, text) { $('#ldBar').style.width = Math.round(f * 100) + '%'; $('#ldPct').textContent = Math.round(f * 100) + '%'; $('#ldStep').textContent = text; }
  autoPreset() {
    const gl = this.gfx.gl; let ren = '';
    try { const d = gl.getExtension('WEBGL_debug_renderer_info'); ren = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { /* hidden */ }
    if (/swiftshader|llvmpipe|software|basic render/i.test(ren)) return 'low';
    if (/intel|iris|uhd|hd graphics|mali|adreno|powervr|vega 8|radeon\(tm\) graphics/i.test(ren)) return 'medium';
    if (/apple m[0-9]|apple gpu/i.test(ren)) return 'high';
    if (/rtx|radeon rx|geforce|quadro|arc a/i.test(ren)) return 'high';
    return 'medium';
  }
  applySettings(persist = true) {
    const s = this.settings, base = PRESETS[s.preset] || PRESETS.high, on = k => s[k] === 'on';
    const cfg = { ...base, shadow: on('shadows') ? (base.shadow || 1024) : 0, ao: on('ao'), shafts: on('volumetrics') };
    this.gfx.configure(cfg); this.gfx.lodBias = cfg.lod ?? 1; this.res = 1; this.gfx.setRes(+s.resScale); this.gfx.resize(innerWidth, innerHeight);
    const rm = on('reducedMotion'); this.gfx.post.grain = on('grain') ? 0.03 : 0; this.gfx.post.flare = on('flare') ? 1 : 0; this.reduced = rm;
    document.documentElement.style.setProperty('--hud', String(s.hudScale));
    $('#fps').hidden = !on('fpsCounter');
    this.audio.configure(s);
    this.fx.max = s.preset === 'low' ? 2500 : 5000; this.fx.scale = s.preset === 'low' ? 0.6 : 1;
    if (persist) { this.save.settings = s; storeSave(this.save); }
  }
  trackLen(id) { return getTrack(id).length; }
  prepCourse(id) {
    const track = getTrack(id), course = buildCourse(this.gfx, track); this.gfx.buildEnv(course.env);
    this.courses.set(id, course); this.maps.set(id, courseMap(track));
  }
  makeCockpit() {
    const c = buildCockpit(), g = this.gfx, inst = makeInstruments(), tex = g.texture(inst.canvas);
    const mk = (geo, o) => ({ mesh: g.mesh(geo), pos: new Vec3(), quat: new Quat(), scale: 1, visible: true, ds: 2, ...o });
    return { inst, tex, items: [mk(c.body, {}), mk(c.screen, { prog: 'unlit', tex, intensity: 1.4 }), mk(c.glass, { blend: 'add', opacity: 0.22 })] };
  }
  warmup() {
    const cam = { pos: new Vec3(), fwd: new Vec3(0, 0, 1), up: new Vec3(0, 1, 0), fov: 70, near: 0.3, far: 60000 };
    for (const [id, course] of this.courses) {
      const t = getTrack(id); t.pointAt(10, 0, 0, cam.pos).addScaled(t.nrm[10], 4); cam.fwd.copy(t.tan[10]);
      this.fx.begin(); const p = t.pointAt(20, 0, 0); this.fx.bbAdd.add(p.x, p.y, p.z, 1, 1, 1, 1, 0.01); this.fx.bbAdd.add(p.x, p.y, p.z, 1, 1, 1, 1, 0.01, 1, 0, 0, 2); this.fx.bbAdd.add(p.x, p.y, p.z, 1, 1, 1, 1, 0.01, 0, 0, 0, -1); this.fx.bbNorm.add(p.x, p.y, p.z, 1, 0, 0, 0, 0.01);
      this.gfx.render({ items: course.items, env: course.env, bbAdd: this.fx.bbAdd, bbNorm: this.fx.bbNorm, bbHaze: this.fx.bbHaze, lights: [], shadowCenter: cam.pos, overlay: this.cockpit.items }, cam, 0);
    }
    const hc = this.hangar.camera(0); cam.pos.copy(hc.pos); cam.fwd.subVectors(hc.at, hc.pos).normalize();
    this.gfx.render({ items: this.hangar.items, env: this.hangar.env, lights: this.hangar.lights, shadowCenter: new Vec3(0, 1, 0) }, cam, 0);
    this.fx.begin(); this.gfx.gl.finish();
  }

  // ---------- scenes ----------
  makeRacers(mode) {
    const diff = DIFFICULTY[this.opts.diff] || DIFFICULTY.pro, rng = makeRng((Math.random() * 1e9) | 0);
    const ai = mode === 'trial' ? [] : AI_ROSTER.map(a => ({ name: a.name, shipId: a.ship, paint: a.paint, skill: clamp(diff.skill[0] + (diff.skill[1] - diff.skill[0]) * a.bias + rng.range(-0.03, 0.03), 0.3, 1) }));
    ai.sort((a, b) => a.skill - b.skill);
    if (mode === 'attract') return ai.concat([{ name: 'RIO KADE', shipId: SHIPS[this.opts.ship].id, skill: 0.9, paint: [0.85, 0.85, 0.88] }]);
    const id = SHIPS[this.opts.ship].id; // V7: upgrades (effective stats rebuilt from base stats) and the saved paint job
    return [...ai, { name: 'YOU', shipId: id, isPlayer: true, def: this.progress.effectiveDef(id), livery: this.progress.livery(id) }];
  }
  courseScene(id, race, attract) {
    const course = this.courses.get(id), view = new RaceView(this.gfx, race);
    race.racers.forEach(r => { r.paintCss = css(r.paint || r.ship.def.color); });
    this.fx.clear(); this.racefx.reset(course, race);
    if (course.reset) course.reset();
    this.scene = { kind: 'course', id, course, race, view, attract, track: getTrack(id) };
    this.acc = 0; this.rig.snap = true;
    this.audio.setEnv(course.env.reverb || 'open');
  }
  startAttract(id) {
    id = id || TRACK_DEFS[Math.floor(Math.random() * TRACK_DEFS.length)].id;
    const diff = this.opts.diff; this.opts.diff = 'ace';
    const race = new Race({ track: getTrack(id), laps: 99, racers: this.makeRacers('attract'), seed: (Math.random() * 1e6) | 0, countdown: 0 });
    this.opts.diff = diff;
    for (let k = 0; k < 120 * 5; k++) race.step(SIM_DT, null);
    race.events.length = 0;
    this.courseScene(id, race, true); this.rig.shot = null;
    this.hud.show(false); this.audio.music('menu');
  }
  toShipSelect() { this.garage.open(true); } // V7: the hangar is now the garage
  setShowcase() {
    const d = SHIPS[this.opts.ship], sv = this.showSV = new ShipVisual(this.gfx, d, this.garage.liveryFor(d.id));
    this.hangar.setShow([sv], 'showcase');
  }
  // V7 championship runs live in the career profile; the in-race standings table is rebuilt from the saved finishing orders
  champFromRun(run) { return { round: run.round, c: standingsOf(run.orders), runId: run.runId, diff: run.diff, laps: run.laps, ship: run.ship }; }
  topDiff() { const u = this.progress.profile.championships.unlocked; return DIFF_ORDER.filter(d => u.includes(d)).pop() || 'rookie'; }
  showChampHub(armed = false) {
    const P = this.progress, c = this.champDone;
    this.state = 'champ'; this.input.capture = false; this.hud.show(false);
    if (c && c.ok) { this.ui.show(champHubHTML({ final: true, completion: c, standings: c.standings, wallet: P.wallet(), champs: P.profile.championships, earned: P.profile.earned }), 'full'); return; }
    const run = P.activeRun(); if (!run) { this.toMenu(); return; }
    this.ui.show(champHubHTML({ final: false, run, standings: standingsOf(run.orders).standings(), wallet: P.wallet(), next: CHAMPIONSHIP[run.round], bonus: Math.round(CHAMPIONSHIP_REWARDS.completion[run.diff] * lapMult(run.laps)), armedAbandon: armed }), 'full');
  }
  resumeChamp() {
    const run = this.progress.activeRun(); if (!run) return false;
    this.opts.mode = 'champ'; this.champ = this.champFromRun(run); this.champDone = null; this.opts.diff = run.diff; this.opts.laps = run.laps; this.opts.ship = Math.max(0, SHIPS.findIndex(s => s.id === run.ship));
    this.showChampHub(); return true;
  }
  startRace() {
    const o = this.opts;
    if (o.mode === 'champ' && !this.champ) { // V7: start (or pick up) a championship run; locked difficulties fall back to the highest unlocked one
      let run = this.progress.activeRun();
      if (!run) { if (!this.progress.champUnlocked(o.diff)) o.diff = this.topDiff(); const r = this.progress.startRun({ diff: o.diff, laps: o.laps, ship: SHIPS[o.ship].id }); if (!r.ok) { console.warn(r.message); this.toMenu(); return; } run = r.run; }
      this.champ = this.champFromRun(run); this.champDone = null;
    }
    if (o.mode === 'champ') { o.diff = this.champ.diff; o.laps = this.champ.laps; o.ship = Math.max(0, SHIPS.findIndex(s => s.id === this.champ.ship)); }
    this.raceId = this.progress.newRaceId(); // every started race is a new reward event, even on the same course and settings
    const id = o.mode === 'champ' ? CHAMPIONSHIP[this.champ.round] : o.track, track = getTrack(id);
    const race = new Race({ track, laps: o.laps, racers: this.makeRacers(o.mode), mode: o.mode, seed: (Math.random() * 1e6) | 0, handling: this.settings.handling, assist: +this.settings.assist, sens: +this.settings.sens, autopilot: this.autotest });
    this.courseScene(id, race, false);
    this.ghost = o.mode === 'trial' ? this.save.ghosts[this.recKey(id)] || null : null; this.rec = []; this.recT = 0; this.ghostTi = 0; this.bestSplits = []; this.curSplits = [];
    if (this.ghost) this.scene.view.setGhostShip(shipById(this.ghost.ship));
    else if (o.mode === 'trial') this.scene.view.setGhostShip(SHIPS[o.ship]);
    this.result = null; this.slowmo = 0; this.hud.setupMinimap(track); this.ui.clearMessages();
    this.camMode = this.settings.cam; this.input.capture = true; this.audio.music('race');
    if (this.autotest || params.has('nointro')) this.endIntro();
    else { this.state = 'intro'; this.introT = 0; this.hud.show(false); this.ui.preRace(track.name, o.mode === 'champ' ? `Championship · round ${this.champ.round + 1} of ${CHAMPIONSHIP.length}` : o.mode === 'trial' ? 'Time trial' : 'Quick race'); }
  }
  endIntro() { this.state = 'race'; this.ui.hide(); this.hud.show(true); this.rig.snap = this.autotest; }
  toMenu() { this.champ = null; this.champDone = null; this.state = 'title'; this.input.capture = false; this.ui.clearMessages(); this.startAttract(); this.ui.title(this.touch); }

  // ---------- menu actions ----------
  action(act, arg) {
    const o = this.opts;
    switch (act) {
      case 'mode': o.mode = arg; this.champ = null; this.champDone = null;
        if (arg === 'champ' && this.progress.activeRun()) { this.resumeChamp(); break; } // a saved run continues instead of a new one
        if (arg === 'champ' && !this.progress.champUnlocked(o.diff)) o.diff = this.topDiff();
        this.toShipSelect(); break;
      case 'ship': this.garage.switchShip(+arg); break;
      case 'shipOk': this.garage.leave(() => { this.state = 'track'; this.startAttract(o.mode === 'champ' ? CHAMPIONSHIP[0] : o.track); this.ui.trackSelect(o, this.save, id => this.maps.get(id)); this.audio.music('menu'); }); break;
      case 'g': this.garage.act(arg); break;
      case 'garage': this.champ = null; this.champDone = null; this.garage.open(false); break;
      case 'career': this.state = 'career'; this.ui.show(careerHTML(this.progress.career()), 'full'); break;
      case 'champContinue': this.resumeChamp(); break;
      case 'champAbandon': if (arg === 'confirm') { const run = this.progress.activeRun(); if (run) this.progress.abandonRun(run.runId); this.toMenu(); } else this.showChampHub(true); break;
      case 'track': o.track = arg; this.ui.trackSelect(o, this.save, id => this.maps.get(id)); this.previewCourse(arg, true); break;
      case 'hoverTrack': this.previewCourse(arg); break;
      case 'laps': o.laps = +arg; this.ui.trackSelect(o, this.save, id => this.maps.get(id)); break;
      case 'diff': if (o.mode === 'champ' && !this.progress.champUnlocked(arg)) break; o.diff = arg; this.ui.trackSelect(o, this.save, id => this.maps.get(id)); break;
      case 'start': if (o.mode === 'champ' && !this.progress.champUnlocked(o.diff)) break; this.startRace(); break;
      case 'skip': if (this.state === 'intro') this.endIntro(); break;
      case 'mp': this.mp.act(arg); break; // V8: online screens
      case 'back':
        if (arg === 'mp') this.mp.act('back'); // V8: leaving the online screens closes the server connection
        else if (arg === 'pause') { this.ui.pause(); this.state = 'paused'; }
        else if (arg === 'results') this.showResults();
        else if (this.state === 'ship') this.garage.leave(() => { this.state = 'title'; this.startAttract(); this.ui.title(this.touch); });
        else if (arg === 'title') { this.state = 'title'; if (this.scene.kind !== 'course') this.startAttract(); this.ui.title(this.touch); }
        else if (this.state === 'track') this.toShipSelect();
        else { this.state = 'title'; this.ui.title(this.touch); }
        break;
      case 'settings': this.settingsFrom = arg; this.ui.settings(this.settings, arg); break;
      case 'tab': this.ui.tab = arg; this.ui.settings(this.settings, this.settingsFrom); break;
      case 'controls': this.ui.controls(arg); break;
      case 'opt': { const [k, v] = arg.split(':'); this.settings[k] = v; if (k === 'preset') Object.assign(this.settings, PRESET_TOGGLES[v]); if (k === 'cam') this.camMode = v; this.applySettings(); this.ui.settings(this.settings, this.settingsFrom); break; }
      case 'set': { const [k, v] = arg.split(':'); this.settings[k] = +v; this.applySettings(); if (this.scene && this.scene.race && k === 'sens') this.scene.race.opts.sens = +v; break; }
      case 'saveExport': { const txt = JSON.stringify({ best: this.save.best, ghosts: this.save.ghosts }), ta = $('#saveText'); ta.value = txt; ta.select();
        const done = () => { $('#saveMsg').textContent = 'Copied. Paste it into another copy of the game to bring your laps along.'; };
        try { navigator.clipboard.writeText(txt).then(done, () => { $('#saveMsg').textContent = 'Selected. Press Ctrl+C (or Cmd+C) to copy.'; }); } catch (e) { $('#saveMsg').textContent = 'Selected. Press Ctrl+C (or Cmd+C) to copy.'; } break; }
      case 'saveImport': { try { const n = mergeSave(this.save, $('#saveText').value); storeSave(this.save); $('#saveMsg').textContent = n ? `Imported ${n} record${n > 1 ? 's' : ''}.` : 'Nothing faster than your current records in that save.'; }
        catch (e) { $('#saveMsg').textContent = 'That text is not a Galactic Rush save. Copy the whole save and paste it again.'; } break; }
      case 'resume': this.state = 'race'; this.ui.hide(); this.input.capture = true; this.hud.show(true); break;
      case 'restart': if (o.mode === 'champ' && this.result) break; this.startRace(); break; // V7: a finished championship round is recorded and paid; it is not re-run
      case 'menu': this.toMenu(); break;
      case 'champHub': this.showChampHub(); break;
      case 'nextRound': this.startRace(); break;
    }
    if (this.scene && this.scene.race && act === 'opt' && arg.startsWith('assist')) this.scene.race.opts.assist = +this.settings.assist;
  }
  previewCourse(id, now) { if (this.state !== 'track' || (this.scene.kind === 'course' && this.scene.id === id)) return; clearTimeout(this.pvT); this.pvT = setTimeout(() => { if (this.state === 'track') this.startAttract(id); }, now ? 0 : 280); }
  undoChampPoints() { const last = this.champ.c.rounds.pop(); if (last) { for (const a of last) this.champ.c.points[a.name] -= a.pts; this.champ.c.wins[last[0].name]--; } }

  // records and ghosts are kept per handling profile; Classic uses V1's plain keys so V1 ghosts still load
  recKey(id) { return this.settings.handling === 'classic' ? id : id + '~relaxed'; }
  // ---------- race end ----------
  endRace() {
    const sc = this.scene, race = sc.race, me = race.player; if (!me || this.result) return;
    race.simulateToEnd(SIM_DT); race.events.length = 0;
    const tid = this.recKey(sc.id), prev = this.save.best[tid]; let record = null;
    if (isFinite(me.bestLap) && (!prev || me.bestLap < prev.lap)) { this.save.best[tid] = { lap: me.bestLap, ship: SHIPS[this.opts.ship].id }; record = me.bestLap; storeSave(this.save); }
    const extra = { record };
    if (this.opts.mode === 'champ') { const aw = this.champ.c.addResult(race.order.map(r => r.name)); this.champ.round++; extra.points = Object.fromEntries(aw.map(a => [a.name, a.pts])); extra.champ = true; }
    // V7: the race simulation confirmed the finish; pay for it once (the race id is new for every started race)
    if (!this.benchMode && me.finished) {
      extra.reward = this.progress.completeRace({ finished: true, raceId: this.raceId, mode: this.opts.mode, track: sc.id, diff: this.opts.diff, laps: race.laps, ship: SHIPS[this.opts.ship].id, place: me.place,
        field: race.racers.length, time: me.finishTime, record: record != null, runId: this.champ ? this.champ.runId : null, order: race.order.map(r => r.name) });
      if (extra.reward.completion) this.champDone = extra.reward.completion;
    }
    this.result = { race, extra }; this.showResults();
  }
  showResults() {
    const { race, extra } = this.result;
    this.state = 'results'; this.input.capture = false; this.hud.show(false); this.audio.engine(0, 0, false, false); this.audio.music('finish');
    const top = race.order.slice(0, 3).map(r => new ShipVisual(this.gfx, r.ship.def, liveryFor(r)));
    this.hangar.setShow(top, 'podium'); this.scene = { kind: 'hangar', mode: 'podium' }; this.fx.clear(); this.audio.setEnv('hangar');
    this.ui.results(race, extra);
  }

  // ---------- main loop ----------
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const realDt = Math.max(0, (now - this.last) / 1000); this.last = now;
    const raw = Math.min(0.1, realDt); this.t += raw;
    this.frames++; this.fpsT += realDt; if (this.fpsT > 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; if (this.settings.fpsCounter === 'on') $('#fps').textContent = `${this.fps.toFixed(0)} FPS · ${this.gfx.w}×${this.gfx.h}`; }
    if (this.bench) this.benchFrame(realDt); else this.dynamicRes(realDt);
    this.input.pollPad(); this.handleInput();
    this.fx.begin();
    let items, lights = [], overlay = null, env, shadowCenter, hex = null, r = null;
    if (this.scene.kind === 'course') r = this.updateCourse(raw);
    if (r) ({ items, lights, overlay, env, shadowCenter, hex } = r);
    else { const H = this.hangar, hc = H.camera(this.t); this.rig.set(hc.pos, hc.at, null, hc.fov); items = H.items.concat(H.update(raw, this.t, this.fx, this.rig.cam)); lights = H.lights; env = H.env; shadowCenter = new Vec3(0, 1.8, 0); this.gfx.post.radial = 0; this.gfx.post.ca = 0; }
    { const po = this.gfx.post, want = this.state === 'intro' || this.state === 'finishing' || this.state === 'title' ? 0.105 : 0; po.bars += (want - po.bars) * Math.min(1, raw * 2.5); } // cinematic letterbox
    this.fx.update(this.state === 'paused' ? 0 : raw);
    this.gfx.post.flash = Math.max(0, this.gfx.post.flash - raw * 3);
    if (this.shotCam) { const c = this.rig.cam, s = this.shotCam; c.pos.set(...s.pos); c.fwd.set(s.at[0] - s.pos[0], s.at[1] - s.pos[1], s.at[2] - s.pos[2]).normalize(); c.up.set(0, 1, 0); c.fov = s.fov || 60; } // test hook: matched screenshots
    this.gfx.resize(innerWidth, innerHeight);
    VIS.reset(); if (r && this.scene.course.cull) this.scene.course.cull(this.rig.cam, raw); // culling and LOD with the frame's final camera
    if (this.shotCam && this.shotShadow) shadowCenter = new Vec3(...this.shotCam.at); // test hook: sun shadows around what a test view looks at
    this.gfx.render({ items, overlay, bbAdd: this.fx.bbAdd, bbNorm: this.fx.bbNorm, bbHaze: this.fx.bbHaze, env, lights, shadowCenter, hex }, this.rig.cam, raw);
    if (this.scene.kind === 'course' && !this.scene.attract && (this.state === 'race' || this.state === 'finishing')) this.racefx.hud(raw);
    this.input.endFrame();
  }
  updateCourse(raw) {
    const sc = this.scene, race = sc.race, playing = this.state === 'race' || this.state === 'finishing', me = race.player;
    if (sc.attract || playing) {
      if (this.slowmo > 0) this.slowmo -= raw;
      const ts = (this.slowmo > 0 ? 0.3 : 1) * this.timeScale;
      const pc = playing && me && !me.finished ? this.input.controls(raw, this.settings) : null;
      if (pc && pc.reset == null) pc.reset = false;
      this.acc += raw * ts; let n = 0;
      while (this.acc >= SIM_DT && n < 240) {
        race.step(SIM_DT, pc); this.acc -= SIM_DT; n++;
        if (pc) { pc.fire = false; pc.shield = false; pc.reset = false; }
        if (this.opts.mode === 'trial' && !sc.attract) this.recordGhost();
      }
      this.racefx.events(race);
      if (this.scene !== sc) return null;
      if (sc.attract && race.time > 600) { this.startAttract(sc.id); return null; }
    }
    const alpha = clamp(this.acc / SIM_DT, 0, 1), cockpit = this.camMode === 'cockpit' && this.state === 'race' && !sc.attract && me && !me.finished;
    sc.view.update(raw, this.t, alpha, this.rig.cam.pos, this.fx, cockpit, this.settings.preset === 'low' ? 0.5 : 1);
    if (sc.course.update) sc.course.update(raw, this.t, race, this.fx, this.rig.cam, me);
    this.racefx.frame(raw);
    // camera
    const lookBack = this.input.key('KeyB') || this.input.btn(11) > 0.5;
    if (sc.attract) this.rig.broadcast(raw, race, sc.track, r => sc.view.visOf(r));
    else if (this.state === 'intro') { this.introT += raw; const pv = sc.view.visOf(me); this.rig.flyover(Math.min(1, this.introT / 5), sc.track, me, pv); if (this.introT >= 5) this.endIntro(); }
    else if (me) { const v = sc.view.visOf(me), mode = me.finished ? 'orbit' : this.camMode;
      this.rig.follow(raw, v, mode, { settings: this.settings, lookBack, track: sc.track, ti: me.ti, maxSpeed: me.ship.def.maxSpeed }); }
    // post: speed blur and aberration scale with speed (off in reduced motion)
    const pm = this.gfx.post, fr = me && !sc.attract ? me.ship.vel.len() / me.ship.def.maxSpeed : 0.6, boost = me && (me.ship.boosting || me.ship.padTimer > 0);
    pm.radial = this.reduced || this.settings.motionBlur !== 'on' ? 0 : clamp((fr - 0.75) * 1.0, 0, 0.45) + (boost ? 0.25 : 0);
    pm.ca = this.reduced || this.settings.ca !== 'on' ? 0 : clamp((fr - 0.6) * 1.5, 0, 0.8) + (boost ? 0.4 : 0);
    pm.heat = null;
    if (me && !sc.attract && boost && !this.reduced && !cockpit && this.state === 'race') {
      const v = sc.view.byRacer.get(me), m = this.gfx.vp;
      pm.heat = v.sv.enginesW.slice(0, 2).map(w => { const x = m[0] * w.x + m[4] * w.y + m[8] * w.z + m[12], y = m[1] * w.x + m[5] * w.y + m[9] * w.z + m[13], ww = m[3] * w.x + m[7] * w.y + m[11] * w.z + m[15];
        return ww > 0.5 ? [x / ww * 0.5 + 0.5, y / ww * 0.5 + 0.5, Math.min(0.2, 1.2 / ww), 1] : null; }).filter(Boolean);
    }
    const overlay = cockpit ? this.cockpitItems(sc, me) : null;
    const items = sc.course.items.concat(sc.view.items(), this.racefx.items());
    return { items, lights: this.racefx.lights(me), overlay, env: sc.course.env, shadowCenter: me && !sc.attract ? sc.view.visOf(me).p : this.rig.cam.pos.clone().addScaled(this.rig.cam.fwd, 40), hex: sc.course.hexState ? sc.course.hexState(me) : null };
  }
  cockpitItems(sc, me) {
    const v = sc.view.visOf(me), c = this.cockpit, s = me.ship;
    for (const it of c.items) { it.pos.copy(this.rig.cam.pos); it.quat.copy(v.q); }
    if ((this.ckT = (this.ckT || 0) + 1) % 3 === 0) {
      c.inst.draw(s.vel.len() * 3.6, s.boost / s.def.boostCap, Math.max(0, s.hull / s.def.hull), me.place, Math.max(1, me.lap), sc.race.laps, s.hull < s.def.hull * 0.3 ? 'HULL' : s.stun > 0 ? 'ION' : '');
      this.gfx.updateTexture(c.tex, c.inst.canvas);
    }
    return c.items;
  }
  recordGhost() {
    const r = this.scene.race.player; if (!r || r.lap < 1 || r.finished || this.scene.race.state !== 'racing') return;
    const lt = this.scene.race.time - r.lapStart;
    if (lt >= this.recT) { const p = r.ship.pos, q = r.ship.quat; this.rec.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)]); this.recT += 0.05; }
  }

  handleInput() {
    const I = this.input, st = this.state, padBack = I.padHit(1), padA = I.padHit(0), padStart = I.padHit(9);
    if ((st === 'race' || st === 'finishing') && this.scene.mp) { this.mp.raceKeys(I, padStart); return; } // V8: an online race cannot be paused
    if (st === 'race') {
      if (I.hit('Escape') || I.hit('KeyP') || padStart) { this.state = 'paused'; this.ui.pause(); this.input.capture = false; this.audio.engine(0, 0, false, false); this.audio.duck(0.5, 0.2); }
      if (I.hit('KeyC') || I.padHit(15)) { const m = ['chase', 'far', 'cockpit']; this.camMode = m[(m.indexOf(this.camMode) + 1) % 3]; this.rig.snap = true; }
      return;
    }
    if (st === 'intro') { if (I.hit('Space') || I.hit('Enter') || I.hit('Escape') || I.hit('Mouse0') || padA || padStart) this.endIntro(); return; }
    if (st === 'paused' && (I.hit('KeyP') || padStart)) { this.action('resume'); return; }
    if (st === 'loading') return;
    // menus: arrows / d-pad move focus, A clicks, B goes back
    if (st === 'ship') { // V7 garage: ships, tabs, turning the preview (keyboard, gamepad); arrows stay with a focused slider or text field
      const ae = document.activeElement, field = ae && ae.tagName === 'INPUT', p = I.pad;
      if (!field) { if (I.hit('ArrowLeft') || I.padHit(14)) this.action('ship', '-1'); if (I.hit('ArrowRight') || I.padHit(15)) this.action('ship', '1');
        if (I.hit('KeyQ') || I.hit('PageUp')) this.garage.tabStep(-1); if (I.hit('KeyE') || I.hit('PageDown')) this.garage.tabStep(1);
        if (I.key('BracketLeft')) this.garage.rotate(-0.035); if (I.key('BracketRight')) this.garage.rotate(0.035); }
      else if (ae.type === 'range') { const L = I.padHit(14), R = I.padHit(15); if (L || R) { if (R) ae.stepUp(3); else ae.stepDown(3); ae.dispatchEvent(new Event('input', { bubbles: true })); } } // d-pad moves a focused slider
      if (I.padHit(4)) this.garage.tabStep(-1); if (I.padHit(5)) this.garage.tabStep(1);
      if (p && p.axes && (Math.abs(p.axes[2] || 0) > 0.25 || Math.abs(p.axes[3] || 0) > 0.25)) this.garage.rotate((p.axes[2] || 0) * 0.05, (p.axes[3] || 0) * 0.02);
    }
    if (I.hit('ArrowDown') || I.padHit(13) || (st !== 'ship' && I.padHit(15))) this.ui.nav(1);
    if (I.hit('ArrowUp') || I.padHit(12) || (st !== 'ship' && I.padHit(14))) this.ui.nav(-1);
    if (padA) this.ui.activate();
    if ((I.hit('Escape') || padBack) && st !== 'title') { const b = document.querySelector('#ui [data-act="back"], #ui [data-act="resume"]'); if (b) b.click(); }
  }

  dynamicRes(dt) {
    if (this.settings.dynRes !== 'on' || this.state === 'loading') return;
    this.ftAcc += dt; this.ftN++;
    if (this.ftAcc > 0.75) { const ft = this.ftAcc / this.ftN; this.ftAcc = 0; this.ftN = 0;
      if (ft > 1 / 52 && this.res > 0.6) this.res -= 0.05; else if (ft < 1 / 68 && this.res < 1) this.res += 0.05;
      this.gfx.setRes(this.res * +this.settings.resScale); }
  }
  // ---------- benchmark: fixed autopilot lap per preset ----------
  runBench() {
    const short = params.get('bench') === 'short', list = (params.get('presets') || 'low,medium,high,ultra').split(',');
    this.bench = { list, k: -1, dur: short ? 12 : 0, times: [], results: [] }; this.autotest = true; this.settings.dynRes = 'off';
    $('#fps').hidden = false; this.benchNext();
  }
  benchNext() {
    const b = this.bench; b.k++; b.times = []; b.t = 0;
    if (b.k >= b.list.length) { this.benchReport(); return; }
    this.settings.preset = b.list[b.k]; Object.assign(this.settings, PRESET_TOGGLES[b.list[b.k]]); this.applySettings(false);
    this.opts.track = params.get('track') || 'foundry'; this.opts.laps = 1; this.opts.mode = 'quick'; this.startRace();
  }
  benchFrame(dt) {
    const b = this.bench; if (!b || b.k >= b.list.length || this.state === 'loading') return;
    b.t += dt; if (b.t > 2) { b.times.push(dt); b.draws = (b.draws || 0) + this.gfx.stats.draws; b.tris = (b.tris || 0) + this.gfx.stats.tris; const v = b.vis = b.vis || { inst: 0, drawn: 0, frustum: 0, occluded: 0, small: 0 }; for (const k in v) v[k] += VIS[k]; }
    $('#fps').textContent = `BENCH ${b.list[b.k].toUpperCase()} · ${this.fps.toFixed(0)} FPS`;
    const done = b.dur ? b.t > b.dur + 2 : (this.scene.kind !== 'course' || (this.scene.race.player && this.scene.race.player.finished)) || b.t > 90;
    if (done) { const ts = b.times.slice().sort((x, y) => y - x), avg = ts.length / ts.reduce((a, x) => a + x, 0), low = 1 / (ts[Math.floor(ts.length * 0.01)] || ts[0]);
      const ms = b.times.map(x => x * 1000).sort((x, y) => x - y), q = f => ms[Math.min(ms.length - 1, Math.floor(ms.length * f))], n = Math.max(1, ts.length), cp = this.rig.cam.pos, mem = performance.memory;
      b.results.push({ preset: b.list[b.k], avg: +avg.toFixed(1), low1: +low.toFixed(1), frames: ts.length, res: `${this.gfx.w}x${this.gfx.h}`, track: this.opts.track,
        msAvg: +(ms.reduce((a, x) => a + x, 0) / n).toFixed(1), msMedian: +(q(0.5) || 0).toFixed(1), msP95: +(q(0.95) || 0).toFixed(1), draws: Math.round((b.draws || 0) / n), tris: Math.round((b.tris || 0) / n),
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, cam: [cp.x, cp.y, cp.z].map(v => Math.round(v)), renderer: this.gpuName(),
        instances: b.vis ? Object.fromEntries(Object.entries(b.vis).map(([k, v]) => [k, Math.round(v / n)])) : null });
      b.draws = 0; b.tris = 0; b.vis = null; this.benchNext(); }
  }
  gpuName() { const g = this.gfx.gl, d = g.getExtension('WEBGL_debug_renderer_info'); return d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown'; }
  benchReport() {
    const r = this.bench.results; window.__bench = r; console.log('BENCH', JSON.stringify(r)); this.bench = null; this.state = 'bench';
    const g = this.gfx.gl, d = g.getExtension('WEBGL_debug_renderer_info'), gpu = d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown GPU';
    this.ui.show(`<div class="col center" style="width:min(640px,100%)"><h3>Benchmark · ${({ foundry: 'Foundry Trench', belt: 'Cinder Belt', spire: 'Neon Spire', ring: 'Halo of Vashti' })[this.opts.track] || this.opts.track} autopilot</h3><h2>Results</h2>
      <div class="tablewrap panel"><table class="res"><tr><th>PRESET</th><th>AVG FPS</th><th>1% LOW</th><th>MEDIAN MS</th><th>P95 MS</th><th>DRAWS</th><th>TRIANGLES</th><th>RES</th></tr>
      ${r.map(x => `<tr><td>${x.preset.toUpperCase()}</td><td class="n"><b>${x.avg}</b></td><td class="n">${x.low1}</td><td class="n">${x.msMedian}</td><td class="n">${x.msP95}</td><td class="n">${x.draws}</td><td class="n">${(x.tris / 1000).toFixed(0)}k</td><td class="n">${x.res}</td></tr>`).join('')}</table></div>
      <p class="lede">${String(gpu).replace(/</g, '&lt;')}</p><div class="row"><button class="btn primary" data-act="menu">Main menu</button></div></div>`, 'full');
  }
}
new Game();
