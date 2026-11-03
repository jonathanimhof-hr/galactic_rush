// GALACTIC RUSH V8 — the Online Multiplayer mode: its screens, the connection to the multiplayer server, lobbies, the
// two-stage tournament as the server runs it, and the rewards. Everything authoritative happens on the server (lobby
// membership, tournament progress, course choice, start, finish, qualification, winner, rewards); this module shows
// what the server says, sends what the player does, and runs the local pilot's ship through the game's own race code
// (netrace.js). It plugs into the game through a handful of calls from main.js (see README, "Changes to the game").
import { SHIPS, shipById } from '../config.js';
import { ShipVisual } from '../render/shipvis.js';
import { esc } from '../ui-garage.js';
import { C, S, MP, ERRORS, normalizeName, normalizeCode, fmtTime } from './protocol.js';
import { Connection } from './net.js';
import { mpServer } from './config.js';
import { loadName, saveName, loadShip, saveShip, suggestName, loadSession, saveSession, clearSession } from './identity.js';
import { NetRace, mpLivery } from './netrace.js';
import { homeHTML, lobbyHTML, stageResultsHTML, finalHTML, errorHTML, raceMenuHTML, STAGE_LABEL, reasonText } from './ui.js';
import { checkReward } from './rewards.js';
import { injectStyle } from './style.js';

const shipDef = id => shipById(id) || SHIPS[0];

export class Multiplayer {
  constructor(g) {
    this.g = g; this.server = mpServer(); this.conn = null; this.view = null; // view: null (not in the online mode), home, lobby, race, stage, final, error
    this.name = loadName() || suggestName(); this.code = ''; this.visibility = 'private';
    this.ship = loadShip() || shipDef(g.progress.profile.selectedShip).id;
    this.pid = null; this.serverName = null; this.serverTimeScale = 1; this.everOnline = false;
    this.lobby = null; this.list = null; this.error = null; this.notice = null; this.flash = null; this.busy = false; this.copied = false;
    this.netrace = null; this.results = null; this.complete = null; this.reward = null; this.paid = null; this.payNote = '';
    this.armed = null; this.menuOpen = false; this.entrants = new Map(); this.timer = null; this.exiting = false; this.shown = null; this.barEl = null;
    try { const j = normalizeCode(new URLSearchParams(location.search).get('join') || ''); if (j) this.code = j; } catch (e) { /* no query string */ }
    injectStyle();
    const root = g.ui.root;
    root.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.mpin) this.typed(el); });
    root.addEventListener('keydown', e => { const el = e.target; if (el.dataset && el.dataset.mpin && e.key === 'Enter') { e.preventDefault(); if (el.dataset.mpin === 'code') this.act('join'); else el.blur(); } });
  }

  // ---------- entering and leaving the mode ----------
  enter() {
    const g = this.g;
    if (this.view == null) { this.prevMode = g.opts.mode; this.baseTimeScale = g.timeScale; }
    this.view = 'home'; this.error = null; this.notice = null; this.exiting = false;
    this.toAttract(); this.render();
    if (this.server.url && !this.server.insecure) this.connect();
  }
  exit() {
    const g = this.g;
    this.teardownRace(); this.stopTimer(); this.hideBar(); this.dropConn();
    this.view = null; this.lobby = null; this.list = null; this.results = null; this.complete = null; this.shown = null;
    g.opts.mode = this.prevMode || 'quick'; if (this.baseTimeScale != null) g.timeScale = this.baseTimeScale;
    g.toMenu();
  }

  // ---------- connection ----------
  connect() {
    if (!this.server.url || this.server.insecure) return;
    if (this.conn && ['connecting', 'online', 'reconnecting'].includes(this.conn.state)) return;
    this.dropConn();
    const url = this.server.url;
    const conn = this.conn = new Connection({ url, hello: () => { const s = loadSession(url); return { name: this.helloName(), token: s ? s.token : undefined, rid: this.netrace && !this.netrace.over ? this.netrace.rid : undefined }; } });
    const on = (type, fn) => conn.on(type, m => { if (this.conn === conn) fn.call(this, m); });
    on('conn', this.onConn); on(S.WELCOME, this.onWelcome); on(S.ERROR, this.onError); on(S.LOBBY, this.onLobby); on(S.LOBBIES, this.onLobbies); on(S.LEFT, this.onLeft);
    on(S.PREPARE, this.onPrepare); on(S.START, m => { if (this.netrace) this.netrace.onStart(m); }); on(S.SNAP, m => { if (this.netrace) this.netrace.onSnap(m); });
    on(S.FINISHED, m => { if (this.netrace) this.netrace.onFin(m); }); on(S.STATUS, m => { if (this.netrace) this.netrace.onStatus(m); });
    on(S.RESULTS, this.onResults); on(S.COMPLETE, this.onComplete); on(S.NOTICE, this.onNotice);
    conn.connect();
  }
  dropConn() { const c = this.conn; this.conn = null; if (c) c.close(); }
  helloName() { return normalizeName(this.name) || this.serverName || suggestName(); }
  online() { return !!this.conn && this.conn.online; }
  send(type, payload = {}) { return this.conn ? this.conn.send(type, payload) : false; }
  serverNow() { return this.conn ? this.conn.serverNow() : Date.now(); }
  connLabel() {
    const c = this.conn; if (!c) return null;
    if ((c.state === 'reconnecting' || c.state === 'connecting') && !this.everOnline) return 'Connecting…';
    if (c.state === 'failed') return c.reason === 'replaced' ? 'Signed in somewhere else' : 'Not connected';
    return null;
  }
  retry() {
    if (this.view === 'error') {
      if (this.lobby) { this.errorView = { title: 'Reconnecting…', text: 'Trying to reach the multiplayer server again.', retry: false }; this.render(); }
      else { this.view = 'home'; this.toAttract(); this.render(); }
    }
    this.dropConn(); this.error = null; this.connect(); this.refresh();
  }

  // ---------- server messages ----------
  onConn(e) {
    if (e.state !== 'online') this.busy = false;
    if (e.state === 'online' && this.netrace) { // back online mid-race: anything the server may have missed goes again
      const nr = this.netrace; nr.resendFinish();
      if (nr.participant && !nr.out && !nr.startLocal) this.send(C.LOADED, { rid: nr.rid, ok: true });
    }
    if (e.state === 'failed') {
      if (e.reason === 'replaced') return this.fail('Signed in somewhere else', 'This pilot connected to the server from another tab or window, so this one was disconnected. Close the other one, then try again here.');
      if (e.reason === 'policy' || e.reason === 'unsupported') return this.fail('The server closed the connection', 'The multiplayer server refused this connection. Reload the page; if it keeps happening the server may not accept this website.');
      if (this.view === 'home') this.error = this.everOnline ? 'The connection to the server was lost.' : 'Could not reach the multiplayer server. It may be offline, or this network may block it.';
      else if (this.view === 'final') this.notice = 'Disconnected from the multiplayer server. This result and your reward are kept.'; // the tournament is over: keep its result on screen
      else if (this.view) return this.fail('Connection lost', 'The connection to the multiplayer server was lost and did not come back within 30 seconds. Try again to rejoin your lobby.');
    }
    this.refresh();
  }
  onWelcome(m) {
    this.pid = m.pid; this.serverName = m.name; this.everOnline = true;
    this.serverTimeScale = Number.isFinite(m.timeScale) && m.timeScale > 0 ? m.timeScale : 1;
    if (typeof m.token === 'string') saveSession(this.server.url, m.token);
    if (!m.resumed && this.lobby) { // the server no longer has this pilot's lobby (it restarted, or the pilot was away too long)
      this.teardownRace(); this.stopTimer(); this.lobby = null; this.results = null; this.complete = null;
      this.view = 'home'; this.error = 'Your lobby is no longer on the server: it restarted, or you were away too long.'; this.toAttract(); this.render();
    } else if (this.view === 'error' && !this.lobby) { this.view = 'home'; this.toAttract(); this.render(); }
    if (this.view === 'home') this.send(C.LIST);
    this.refresh();
  }
  onError(m) {
    this.busy = false;
    if (m.code === 'rate') return;
    if (m.code === 'finish-rejected') { if (this.netrace) { this.netrace.rejected = m.reason || 'rejected'; this.bar(); } return; }
    if (m.code === 'version') return this.fail('Update needed', m.text, false);
    this.error = m.text || 'Something went wrong.';
    if (this.view === 'race') { this.flash = { text: this.error, until: performance.now() + 5000 }; this.bar(); return; }
    this.render(true);
  }
  onLobby(m) {
    const L = m.lobby; if (!L || !Array.isArray(L.members)) return;
    this.lobby = L; this.busy = false;
    for (const e of L.members) this.entrants.set(e.pid, { pid: e.pid, name: e.name, ship: e.ship, paint: e.paint });
    if (this.view === 'home' || this.view === 'error') { this.view = 'lobby'; this.error = null; this.notice = null; this.showcase(); this.render(); return; }
    if (this.view === 'lobby' || this.view === 'final') { this.render(true); return; }
    if (this.view === 'race') this.bar();
  }
  onLobbies(m) { this.list = Array.isArray(m.list) ? m.list : []; if (this.view === 'home') this.render(true); }
  onLeft() {
    clearTimeout(this.leaveT);
    this.lobby = null; this.teardownRace(); this.stopTimer(); this.results = null; this.complete = null; this.notice = null; this.error = null;
    if (this.exiting) { this.exiting = false; this.exit(); return; }
    if (this.view == null) return;
    this.view = 'home'; this.toAttract(); this.render(); this.send(C.LIST);
  }
  onPrepare(m) {
    if (!this.lobby || !m || !Array.isArray(m.grid) || typeof m.rid !== 'string') return;
    if (this.netrace && this.netrace.rid === m.rid) { // a resend after reconnecting: same race; confirm it is loaded in case that was lost
      const nr = this.netrace; nr.onStatus({ rid: m.rid, statuses: m.status || {} });
      if (nr.participant && !nr.startLocal) this.send(C.LOADED, { rid: m.rid, ok: true });
      return;
    }
    this.teardownRace(); this.stopTimer();
    for (const e of m.grid) this.entrants.set(e.pid, { pid: e.pid, name: e.name, ship: e.ship, paint: e.paint });
    this.view = 'race'; this.shown = null; this.error = null; this.notice = null; this.armed = null;
    this.g.timeScale = this.serverTimeScale; // 1 on a real server; a test server may run the race clock faster
    try { this.netrace = new NetRace(this, m); }
    catch (e) {
      console.error('online race could not be set up', e); this.netrace = null; this.send(C.LOADED, { rid: m.rid, ok: false });
      return this.fail('Could not load the race', 'This game could not set up the course for the race, so it is out of this race. You can stay in the lobby for the rest of the tournament.', false);
    }
    this.showBar(); this.startTimer();
  }
  onResults(m) {
    if (!m || !Array.isArray(m.rows)) return;
    this.teardownRace(); this.results = m;
    this.podium(m.rows.slice(0, m.stage === 1 ? 3 : 2).map(r => r.pid));
    if (m.stage === 1) { this.view = 'stage'; this.armed = null; this.render(); this.startTimer(); }
    // the final's result arrives together with the tournament's completion (onComplete)
  }
  onComplete(m) {
    if (!m || !Array.isArray(m.stages)) return;
    this.teardownRace(); this.stopTimer(); this.complete = m; this.view = 'final'; this.armed = null;
    this.credit(m);
    this.podium([m.winner, m.runnerUp].filter(Boolean));
    this.render();
  }
  onNotice(m) {
    const nm = pid => (this.entrants.get(pid) || {}).name || 'A pilot';
    if (m.kind === 'shutdown') { this.notice = 'The multiplayer server is restarting.'; this.flash = { text: this.notice, until: performance.now() + 8000 }; this.refresh(); }
    else if (m.kind === 'finalists') {
      const parts = [];
      if (Array.isArray(m.dropped) && m.dropped.length) parts.push(`${m.dropped.map(nm).join(', ')} left before the final`);
      if (Array.isArray(m.promoted) && m.promoted.length) parts.push(`${m.promoted.map(nm).join(', ')} moves up to race it`);
      if (parts.length) { this.notice = parts.join(' · '); this.flash = { text: this.notice, until: performance.now() + 8000 }; this.refresh(); }
    } else if (m.kind === 'state-rejected') console.warn('multiplayer: the server did not accept a ship state:', m.reason);
  }

  // ---------- rewards ----------
  // Paid once per tournament through the career's transaction system (event id mp:<tid>), and only if the reward is
  // exactly what the published results give this pilot.
  credit(m) {
    this.reward = m.reward || null; this.paid = null; this.payNote = '';
    if (!this.reward) return;
    const chk = checkReward(m, this.pid, this.reward);
    if (!chk.ok) { this.paid = false; this.payNote = 'This reward did not match the published results, so it was not added.'; console.warn('multiplayer: reward refused:', chk.why); return; }
    const rw = chk.reward;
    const res = this.g.progress.transact('mp', `online tournament ${m.tid}`, (d, T) => { for (const l of rw.lines) { if (l.CR) T.credit('CR', l.CR, l.name); if (l.ST) T.credit('ST', l.ST, l.name); } }, { events: ['mp:' + m.tid] });
    this.paid = res.ok ? true : res.duplicate ? 'dup' : false;
    if (!res.ok && !res.duplicate) this.payNote = res.message || 'The reward could not be added.';
    else if (res.ok && res.saved === false) this.payNote = 'Added, but this browser could not save your career.';
  }

  // ---------- player actions (data-act="mp") ----------
  act(arg = '') {
    const [k, v] = String(arg).split(':');
    if (!(k === 'leave' || k === 'quit' || (k === 'menu' && v === 'leave'))) this.disarm();
    switch (k) {
      case 'open': this.enter(); return;
      case 'back': this.exit(); return;
      case 'connect': case 'retry': this.retry(); return;
      case 'vis': this.visibility = v === 'public' ? 'public' : 'private'; this.render(true); return;
      case 'list': this.send(C.LIST); return;
      case 'create': this.create(); return;
      case 'join': this.join(v || this.code); return;
      case 'copy': this.copyCode(); return;
      case 'ship': this.cycleShip(+v || 1); return;
      case 'ready': { const me = this.me(); if (me) this.send(C.READY, { ready: !me.ready }); return; }
      case 'handling': if (v === 'relaxed' || v === 'classic') this.send(C.SETTINGS, { handling: v }); return;
      case 'visibility': if (v === 'private' || v === 'public') this.send(C.SETTINGS, { visibility: v }); return;
      case 'start': this.error = null; this.send(C.START, {}); return;
      case 'rematch': this.error = null; this.send(C.START, { rematch: true }); return;
      case 'leave': if (this.arm('leave')) this.leaveLobby('home'); return;
      case 'quit': if (this.arm('quit')) this.leaveLobby('home'); return;
      case 'exit': this.leaveLobby('title'); return;
      case 'lobby': if (this.lobby) { this.view = 'lobby'; this.error = null; this.notice = null; this.showcase(); this.render(); } return;
      case 'menu': if (v === 'close') this.closeMenu(); else if (v === 'leave' && this.arm('menu')) { this.closeMenu(); this.leaveLobby('home'); } return;
      case 'openmenu': this.openMenu(); return;
      case 'watch': if (this.netrace && this.netrace.canWatch && this.netrace.spectate(+v || 1) && this.g.state === 'finishing') { this.g.state = 'race'; this.g.hud.show(true); } return;
    }
  }
  // two presses for leaving: the first arms the button for four seconds
  arm(which) {
    if (this.armed === which) { this.disarm(); return true; }
    this.armed = which; clearTimeout(this.armT);
    this.armT = setTimeout(() => { if (this.armed === which) { this.armed = null; this.rerender(); } }, 4000);
    this.rerender(); return false;
  }
  disarm() { if (this.armed) { this.armed = null; clearTimeout(this.armT); } }
  rerender() { if (this.view === 'race') { if (this.menuOpen) this.renderMenu(); } else this.render(true); }
  typed(el) { if (el.dataset.mpin === 'name') this.name = el.value; else if (el.dataset.mpin === 'code') this.code = el.value; }
  me() { return this.lobby ? this.lobby.members.find(m => m.pid === this.pid) || null : null; }
  paint() { return this.g.progress.custom(this.ship) || null; }
  create() {
    const name = normalizeName(this.name);
    if (!name) { this.error = ERRORS['bad-name']; this.render(true); return; }
    if (!this.online()) return;
    saveName(name); this.error = null; this.busy = true;
    this.send(C.CREATE, { name, ship: this.ship, paint: this.paint(), visibility: this.visibility, handling: this.g.settings.handling === 'classic' ? 'classic' : 'relaxed' });
    this.render(true);
  }
  join(raw) {
    const name = normalizeName(this.name), code = normalizeCode(raw || '');
    if (!name) { this.error = ERRORS['bad-name']; this.render(true); return; }
    if (!code) { this.error = ERRORS['bad-code']; this.render(true); return; }
    if (!this.online()) return;
    saveName(name); this.code = code; this.error = null; this.busy = true;
    this.send(C.JOIN, { name, code, ship: this.ship, paint: this.paint() });
    this.render(true);
  }
  copyCode() {
    const code = this.lobby && this.lobby.code; if (!code) return;
    const done = ok => {
      this.copied = ok; this.notice = ok ? null : 'Copy the code by hand: select it and press Ctrl+C (Cmd+C on a Mac).'; this.render(true);
      if (ok) setTimeout(() => { this.copied = false; if (this.view === 'lobby') this.render(true); }, 2000);
    };
    try { navigator.clipboard.writeText(code).then(() => done(true), () => done(false)); } catch (e) { done(false); }
  }
  cycleShip(d) {
    if (this.lobby && this.lobby.phase !== 'open') return;
    const i = Math.max(0, SHIPS.findIndex(s => s.id === this.ship)), n = SHIPS.length;
    this.ship = SHIPS[(i + d + n) % n].id; saveShip(this.ship);
    if (this.lobby) this.send(C.SHIP, { ship: this.ship, paint: this.paint() });
    if (this.view === 'lobby') { this.showcase(); this.render(true); }
  }
  // leave the lobby (and the tournament, if one is running); after: 'home' (online screen) or 'title' (main menu)
  leaveLobby(after) {
    this.exiting = after === 'title'; this.disarm();
    if (this.lobby && this.online()) { this.send(C.LEAVE, {}); clearTimeout(this.leaveT); this.leaveT = setTimeout(() => this.onLeft(), 3000); return; }
    if (this.lobby) { clearSession(); this.dropConn(); } // offline: start a new pilot session next time, so this one is not put back in the lobby
    this.onLeft();
    if (!this.exiting && this.view === 'home' && !this.conn) this.connect();
  }

  // ---------- scenes behind the screens ----------
  toAttract() { const g = this.g; if (!(g.scene && g.scene.kind === 'course' && g.scene.attract)) g.startAttract(); this.calm(); g.audio.music('menu'); }
  // the lobby: the hangar with the ship this pilot will race, in their paint job
  showcase() {
    const g = this.g, def = shipDef(this.ship), sv = new ShipVisual(g.gfx, def, mpLivery({ ship: def.id, paint: this.paint(), name: (this.me() || {}).name || this.myName() }, 1));
    g.hangar.setShow([sv], 'showcase'); g.scene = { kind: 'hangar', mode: 'showcase' }; g.fx.clear(); g.audio.setEnv('hangar'); this.calm(); g.audio.music('menu');
  }
  // results: the game's podium with the top pilots' ships and paint jobs
  podium(pids) {
    const g = this.g, list = [];
    pids.forEach((pid, k) => { const e = this.entrants.get(pid); if (e) list.push(new ShipVisual(g.gfx, shipDef(e.ship), mpLivery(e, k + 1))); });
    g.hangar.setShow(list, 'podium'); g.scene = { kind: 'hangar', mode: 'podium' }; g.fx.clear(); g.audio.setEnv('hangar'); this.calm(); g.audio.music('finish');
  }
  calm() { const g = this.g; g.state = 'mp'; g.input.capture = false; g.hud.show(false); g.audio.engine(0, 0, false, false); g.ui.clearMessages(); }
  myName() { return normalizeName(this.name) || this.serverName || 'PILOT'; }
  teardownRace() {
    const nr = this.netrace; if (!nr) return;
    nr.destroy(); this.netrace = null; this.closeMenu(); this.hideBar();
    const g = this.g; if (this.baseTimeScale != null) g.timeScale = this.baseTimeScale; g.slowmo = 0; this.calm();
  }
  fail(title, text, retry = true) {
    this.teardownRace(); this.stopTimer();
    this.view = 'error'; this.errorView = { title, text, retry };
    this.toAttract(); this.render();
  }

  // ---------- screens ----------
  canRematch() { const L = this.lobby; return this.online() && !!L && L.host === this.pid && L.phase === 'open' && !!L.rematch && L.members.filter(m => m.conn === 'ok').length >= MP.MIN_PLAYERS; }
  render(keep = false) {
    const g = this.g, v = this.view; if (!v || v === 'race') return;
    const conn = { state: this.conn ? this.conn.state : 'idle', label: this.connLabel() };
    let html, cls = 'scrim';
    if (v === 'home') html = homeHTML({ server: this.server, conn, name: this.name, visibility: this.visibility, code: this.code, list: this.list, error: this.error, busy: this.busy, wallet: g.progress.wallet() });
    else if (v === 'lobby') { if (!this.lobby) return; html = lobbyHTML({ lobby: this.lobby, wallet: g.progress.wallet(), error: this.error, notice: this.notice, copied: this.copied, armedLeave: this.armed === 'leave', conn }); }
    else if (v === 'stage') { if (!this.results) return; html = stageResultsHTML({ results: this.results, me: this.pid, nextIn: this.results.nextAt ? (this.results.nextAt - this.serverNow()) / 1000 : 0, armedQuit: this.armed === 'quit', notice: this.notice }); }
    else if (v === 'final') { if (!this.complete) return; html = finalHTML({ complete: this.complete, me: this.pid, reward: this.reward, paid: this.paid, payNote: this.payNote, wallet: g.progress.wallet(), isHost: !!this.lobby && this.lobby.host === this.pid, canRematch: this.canRematch(), inLobby: !!this.lobby, notice: this.error || this.notice }); }
    else if (v === 'error') { html = errorHTML(this.errorView || { title: 'Online multiplayer', text: '', retry: true }); cls = 'full'; }
    if (!html) return;
    // a redraw while typing keeps the text field focused with the caret where it was
    const a = document.activeElement, key = a && a.dataset && a.dataset.mpin, sel = key ? [a.selectionStart, a.selectionEnd] : null;
    g.ui.show(html, cls, !key, keep && this.shown === v && !!g.ui.root.querySelector('.screen'));
    this.shown = v;
    if (key) { const el = g.ui.root.querySelector(`[data-mpin="${key}"]`); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } }
  }
  refresh() { if (this.view === 'race') { if (this.menuOpen) this.renderMenu(); this.bar(); } else if (this.view) this.render(true); }

  // ---------- in the race ----------
  // keys during an online race (main.js hands them over): Esc / P / Start opens the online menu (an online race cannot
  // be paused), C changes the camera, and when not flying (out, finished or eliminated) ← → or LB / RB switch pilot
  raceKeys(I, padStart) {
    const g = this.g, nr = this.netrace; if (!nr) return;
    if (this.menuOpen) {
      if (I.hit('Escape') || I.hit('KeyP') || padStart || I.padHit(1)) { this.closeMenu(); return; }
      if (I.hit('ArrowDown') || I.padHit(13)) g.ui.nav(1);
      if (I.hit('ArrowUp') || I.padHit(12)) g.ui.nav(-1);
      if (I.padHit(0)) g.ui.activate();
      return;
    }
    if (I.hit('Escape') || I.hit('KeyP') || padStart) { this.openMenu(); return; }
    if (I.hit('KeyC') || I.padHit(15)) { const m = nr.spectating ? ['chase', 'far'] : ['chase', 'far', 'cockpit']; g.camMode = m[(m.indexOf(g.camMode) + 1) % m.length]; g.rig.snap = true; }
    if (nr.canWatch) {
      const l = I.hit('ArrowLeft') || I.hit('KeyA') || I.padHit(4) || I.padHit(14), r = I.hit('ArrowRight') || I.hit('KeyD') || I.padHit(5);
      if ((l || r) && nr.spectate(l ? -1 : 1) && g.state === 'finishing') { g.state = 'race'; g.hud.show(true); }
    }
  }
  openMenu() { if (!this.netrace || this.menuOpen) return; this.menuOpen = true; this.armed = null; this.g.input.capture = false; this.renderMenu(true); }
  renderMenu(first = false) { const nr = this.netrace; if (!nr) return; this.g.ui.show(raceMenuHTML({ label: `${STAGE_LABEL[nr.stage] || 'Online race'} · ${nr.m.trackName}`, armed: this.armed === 'menu' }), 'scrim', true, !first); }
  closeMenu() { if (!this.menuOpen) return; this.menuOpen = false; this.disarm(); this.g.ui.hide(); if (this.netrace) this.g.input.capture = true; }
  showBar() {
    if (!this.barEl) {
      const el = this.barEl = document.createElement('div'); el.id = 'mpbar'; el.setAttribute('role', 'status');
      (document.getElementById('app') || document.body).appendChild(el);
      el.addEventListener('click', e => { const b = e.target.closest('[data-mpbar]'); if (b) { this.g.audio.ui('click'); this.act(b.dataset.mpbar); } });
    }
    this.barEl.hidden = false; this.barHTML = ''; this.bar();
  }
  hideBar() { if (this.barEl) this.barEl.hidden = true; }
  // the online bar under the lap counter: stage, what is happening, who is being watched, connection trouble
  bar() {
    const nr = this.netrace, el = this.barEl; if (!nr || !el || el.hidden) return;
    const t = performance.now(), c = this.conn, out = [`<span class="stg">${esc(STAGE_LABEL[nr.stage] || 'Online race')} · ${esc(nr.m.trackName)}</span>`];
    let st = '';
    if (!nr.startLocal) {
      const T = this.lobby && this.lobby.tournament, ps = T && T.rid === nr.rid ? T.parts : null;
      st = ps ? `Waiting for pilots · <b>${ps.filter(p => p.status !== 'loading').length}/${ps.length}</b> on the grid` : 'Waiting for pilots';
    } else if (t < nr.startLocal - 3000) st = `Start in <b>${Math.ceil((nr.startLocal - t) / 1000)}</b>`;
    else if (nr.out) st = `<span class="warn">Out of the race · ${esc(reasonText(nr.out))}</span>`;
    else if (nr.me && nr.me.finished) st = nr.official != null ? `<span class="good">Finished · ${fmtTime(nr.official)}${nr.adjusted ? ' · timed by the server' : ''}</span>`
      : nr.rejected ? `<span class="warn">Finish not accepted by the server (${esc(nr.rejected)})</span>` : `Finished · ${fmtTime(nr.provisional ? nr.provisional.time : null)} · confirming…`;
    else if (!nr.participant) st = nr.stage === 2 ? 'Watching the final' : 'Watching';
    if (st) out.push(`<span>${st}</span>`);
    if (nr.closeAt) { const left = Math.ceil((nr.closeAt - this.serverNow()) / 1000); if (left > 0) out.push(`<span>Race closes in <b>${left}</b> s</span>`); }
    if (nr.spectating) out.push(`<button data-mpbar="watch:-1" aria-label="Previous pilot">‹</button><span>Watching <b>${esc(nr.follow.remote.base)}</b></span><button data-mpbar="watch:1" aria-label="Next pilot">›</button>`);
    else if (nr.canWatch && nr.watchable().length) out.push(`<button data-mpbar="watch:1">Watch others ›</button>`);
    if (c && c.state !== 'online') out.push(`<span class="warn">${c.state === 'reconnecting' ? 'Connection lost · reconnecting…' : 'Not connected'}</span>`);
    if (this.flash && t < this.flash.until) out.push(`<span>${esc(this.flash.text)}</span>`);
    out.push('<button data-mpbar="openmenu">Menu · Esc</button>');
    const html = out.join('');
    if (html !== this.barHTML) { this.barHTML = html; el.innerHTML = html; }
  }
  startTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), 250); }
  stopTimer() { clearInterval(this.timer); this.timer = null; }
  tick() {
    if (this.view === 'race') this.bar();
    else if (this.view === 'stage') { const el = this.g.ui.root.querySelector('[data-next]'); if (el && this.results) el.textContent = String(Math.max(0, Math.ceil((this.results.nextAt - this.serverNow()) / 1000))); }
    else this.stopTimer();
  }
}
