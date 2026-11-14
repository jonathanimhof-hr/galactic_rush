// GALACTIC RUSH V12 — player accounts in the game: sign-up, verification, log-in, password reset, log-out; bringing
// this device's career to an account (checked, verified, never merged); the signed-in career kept in step with the
// account server (cloud.js); race tickets and results; synced settings, best laps and ghosts; and what the player is
// told about all of it (saved on this device / saving / saved to the account / offline). Without a configured
// account server and Firebase project (for example in the stand-alone file) the game plays as before: a guest career
// saved in this browser.
import { FirebaseAuth, AuthFail, emailProblem, passwordProblem } from './firebase.js';
import { AccountApi, ApiFail, loadSession, saveSession, clearSession, accountServer } from './api.js';
import { CloudProgression, accountStorage } from './cloud.js';
import { careerSummary, progressDigest, checkCareer, cleanRecords, cleanSettings, SYNCED_SETTINGS, PILOT_NAME } from './rules.js';
import { Progression } from '../progress/index.js';
import { loadSave, storeSave, useSaveSlot } from '../input.js';
import { devPage } from '../mp/config.js';
import { AccountUI } from './ui.js';
import { getTrack } from '../sim/tracks.js';

const rid = () => (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)).slice(0, 36);
const lsGet = (ls, k, d) => { try { const v = JSON.parse(ls.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (ls, k, v) => { try { if (v == null) ls.removeItem(k); else ls.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

// the account settings of this copy of the game: the site's config.js (public values only)
export function accountConfig(win = typeof window !== 'undefined' ? window : {}, loc = typeof location !== 'undefined' ? location : null, mpUrl = '') {
  const c = (win.GALACTIC_RUSH_CONFIG && win.GALACTIC_RUSH_CONFIG.firebase) || {};
  const emulator = typeof c.authEmulator === 'string' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(c.authEmulator) && devPage(loc) ? c.authEmulator : '';
  return { apiKey: typeof c.apiKey === 'string' ? c.apiKey.trim() : '', projectId: typeof c.projectId === 'string' ? c.projectId.trim() : '', emulator, server: accountServer(mpUrl) };
}

export class Account {
  constructor(game, { config, ls = (() => { try { return window.localStorage; } catch (e) { return null; } })(), fetch } = {}) {
    this.g = game; this.ls = ls; this.cfg = config;
    this.auth = new FirebaseAuth({ apiKey: config.apiKey, emulator: config.emulator, ...(fetch ? { fetch } : {}) });
    this.api = config.server ? new AccountApi({ base: config.server, token: force => this.idToken(force), ...(fetch ? { fetch } : {}) }) : null;
    this.configured = !!(config.apiKey && config.projectId && this.api && ls);
    this.state = this.configured ? 'guest' : 'off'; // guest | working | unverified | deciding | ready | off
    this.session = this.configured ? loadSession(ls) : null;
    this.tok = null; this.view = null; this.online = false; this.sync = 'idle'; this.lastSync = 0;
    this.queue = []; this.finishes = []; this.tickets = new Map(); this.notice = null; this.choice = null; this.busy = false;
    this.fails = 0; this.waitUntil = 0; this.mailUntil = 0; this.resetUntil = new Map();
    this.ui = new AccountUI(this);
    if (this.configured) setInterval(() => this.keepAlive(), 9 * 60e3); // the free server sleeps after 15 idle minutes; also renews the session
  }
  get uid() { return this.session && this.session.uid; }
  get email() { return this.session && this.session.email; }
  get cloud() { return this.state === 'ready'; }
  pendingKey(kind) { return `galactic-rush.v12.acct.${this.uid}.${kind}`; }

  // ---------- start-up ----------
  async boot() {
    if (!this.configured || !this.session) return;
    if (this.session.linked) {
      this.enterCloud(null); // the account's career as this browser last saw it, at once
      this.queue = lsGet(this.ls, this.pendingKey('ops'), []); this.finishes = lsGet(this.ls, this.pendingKey('races'), []).filter(f => f.ticket);
    } else this.state = 'working';
    await this.refresh();
  }
  // the account's current state from the server (and anything this device still has to send)
  async refresh() {
    if (!this.session) return;
    try {
      const r = await this.api.account();
      this.online = true;
      if (!r.verified) { this.state = 'unverified'; this.changed(); return; }
      if (this.state !== 'ready') { await this.decide(r); return; }
      if (!r.exists) { this.notice = { kind: 'bad', text: 'This account has no career on the server any more. Your career on this device is kept; contact support.' }; this.changed(); return; }
      this.adopt(r.view); this.pump(); this.fetchGhosts();
    } catch (e) { this.failed(e); }
  }
  keepAlive() {
    if (!this.session || !this.api) return;
    this.api.health().then(h => { if (h && !this.online && this.state === 'ready') this.refresh(); });
    if (this.cloud && (!this.tok || this.tok.expiresAt - Date.now() < 15 * 60e3)) this.idToken(true).catch(() => {}); // a fresh token for online play's hello
  }

  // ---------- Firebase tokens ----------
  async idToken(force = false) {
    if (!this.session) throw new ApiFail('auth', 'Not signed in.');
    if (!force && this.tok && Date.now() < this.tok.expiresAt - 120e3) return this.tok.idToken;
    if (!this.refreshing) this.refreshing = (async () => {
      try { const s = await this.auth.refresh(this.session.refreshToken); this.tok = s; if (s.refreshToken && s.refreshToken !== this.session.refreshToken) { this.session.refreshToken = s.refreshToken; saveSession(this.session, this.ls); } return s.idToken; }
      catch (e) { if (e instanceof AuthFail && e.session) this.sessionEnded(e.message); throw e.network ? new ApiFail('network', e.message, { network: true }) : new ApiFail('auth', e.message); }
      finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  // the token the multiplayer server gets with the pilot's hello (it ties the pilot to the account)
  helloAuth() { return this.cloud && this.tok && Date.now() < this.tok.expiresAt - 120e3 ? this.tok.idToken : undefined; }
  sessionEnded(why) {
    this.leaveCloud(); clearSession(this.ls); this.session = null; this.tok = null; this.state = 'guest';
    this.notice = { kind: 'bad', text: why || 'Your session ended. Log in again.' }; this.changed();
  }

  // ---------- sign-up, log-in, verification, reset, log-out ----------
  throttle() { const w = Math.ceil((this.waitUntil - Date.now()) / 1000); return w > 0 ? `Wait ${w} s before trying again.` : null; }
  async register(email, pw, pw2) {
    const bad = emailProblem(email) || passwordProblem(pw, pw2) || this.throttle(); if (bad) return this.say('bad', bad);
    return this.work(async () => {
      const s = await this.auth.signUp(email, pw);
      this.signedIn(s);
      try { await this.auth.sendVerification(s.idToken, this.returnUrl()); this.mailUntil = Date.now() + 60e3; } catch (e) { /* the player can resend */ }
      this.state = 'unverified';
      this.say('good', `Account created. We sent a verification link to ${s.email}. Open it, then come back and choose "I have verified my email".`);
    });
  }
  async login(email, pw) {
    const bad = emailProblem(email) || (pw ? null : 'Enter your password.') || this.throttle(); if (bad) return this.say('bad', bad);
    return this.work(async () => { const s = await this.auth.signIn(email, pw); this.fails = 0; this.signedIn(s); this.state = 'working'; await this.refresh(); });
  }
  signedIn(s) { this.session = { uid: s.uid, email: s.email, refreshToken: s.refreshToken, linked: false }; this.tok = s; saveSession(this.session, this.ls); this.notice = null; }
  async checkVerified() { return this.work(async () => { await this.idToken(true); await this.refresh(); if (this.state === 'unverified') this.say('bad', 'Not verified yet. Open the link in the email, then try again.'); }); }
  async resendVerification() {
    const w = Math.ceil((this.mailUntil - Date.now()) / 1000); if (w > 0) return this.say('bad', `You can send another email in ${w} s.`);
    return this.work(async () => { await this.auth.sendVerification(await this.idToken(), this.returnUrl()); this.mailUntil = Date.now() + 60e3; this.say('good', `Sent again to ${this.email}. Check your spam folder too.`); });
  }
  async resetPassword(email) {
    const bad = emailProblem(email); if (bad) return this.say('bad', bad);
    const addr = email.trim().toLowerCase(), w = Math.ceil(((this.resetUntil.get(addr) || 0) - Date.now()) / 1000); if (w > 0) return this.say('bad', `You can send another email to this address in ${w} s.`);
    return this.work(async () => { await this.auth.sendReset(email, this.returnUrl()); this.resetUntil.set(addr, Date.now() + 60e3); this.say('good', 'If an account exists for this address, an email with a link to set a new password is on its way. The link expires after a while; request a new one if it has.'); });
  }
  logout(force = false) {
    if (!force && (this.queue.length || this.finishes.length)) { this.ui.confirmLogout = true; this.changed(); return; }
    this.leaveCloud(); clearSession(this.ls); this.session = null; this.tok = null; this.state = this.configured ? 'guest' : 'off'; this.choice = null; this.ui.confirmLogout = false;
    this.say('good', 'Logged out. This device now plays its guest career (saved in this browser only).');
  }
  returnUrl() { try { return location.origin + location.pathname; } catch (e) { return undefined; } }
  async work(fn) {
    if (this.busy) return; this.busy = true; this.notice = null; this.changed(); // a new attempt: the last message no longer applies
    try { await fn(); }
    catch (e) {
      if (e instanceof AuthFail && /INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD/.test(e.code)) { this.fails++; this.waitUntil = Date.now() + Math.min(60, 3 * 2 ** (this.fails - 1)) * 1000; } // 3, 6, 12 ... 60 s between failed log-ins
      this.say('bad', e.message || 'Something went wrong. Try again.');
    } finally { this.busy = false; this.changed(); }
  }
  say(kind, text) { this.notice = { kind, text }; if (!this.ui.open || this.g.state !== 'account') this.toast(text, kind); this.changed(); }
  toast(text, kind = 'good') {
    if (typeof document === 'undefined') return; this.ui.style();
    let box = document.getElementById('acct-toast'); if (!box) { box = document.createElement('div'); box.id = 'acct-toast'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const d = document.createElement('div'); d.className = kind; d.textContent = text; box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), kind === 'bad' ? 7000 : 4500);
  }

  // ---------- this device's career and the account's ----------
  guestCareer() { const P = new Progression(); return { profile: P.profile, records: loadGuestRecords() }; }
  async decide(r) {
    const local = this.guestCareer(); local.records = cleanRecords(local.records, id => getTrack(id).length); // as the server would keep them
    const mine = careerSummary(local.profile, local.records);
    if (!r.exists) {
      if (mine.empty) { const s = await this.api.start(); if (!s.ok) throw new ApiFail(s.code, s.message); this.link(s.view); return; }
      this.choice = { kind: 'new-account', local: mine }; this.state = 'deciding'; this.changed(); return;
    }
    const same = progressDigest(local.profile, local.records) === progressDigest(r.view.profile, r.view.records);
    if (mine.empty || same) { this.link(r.view); return; }
    this.choice = { kind: 'both', local: mine, account: careerSummary(r.view.profile, r.view.records), rev: r.view.rev }; this.state = 'deciding'; this.changed();
  }
  async choose(what) {
    if (!this.choice) return;
    if (what === 'fresh') return this.work(async () => { const s = await this.api.start(); if (!s.ok) throw new ApiFail(s.code, s.message); this.link(s.view); this.say('good', 'Your account has a new career. This device\'s career stays here as the guest career.'); });
    if (what === 'account') return this.work(async () => { const r = await this.api.account(); if (!r.exists) throw new ApiFail('gone', 'The account has no career any more.'); this.link(r.view); this.say('good', 'Playing your account\'s career. This device\'s career stays here as the guest career.'); });
    if (what === 'import') return this.work(() => this.importCareer(false));
    if (what === 'replace') { this.ui.confirmReplace = true; this.changed(); return; }
    if (what === 'replace-confirmed') { this.ui.confirmReplace = false; return this.work(() => this.importCareer(true)); }
  }
  // this device's career becomes the account's: checked here first, sent once (a retry reuses the import id), then
  // verified (the server's copy must be exactly what was sent) before the device switches to the account's career
  async importCareer(replace) {
    const local = this.guestCareer(), chk = checkCareer(local.profile);
    if (!chk.ok) { this.choice = { ...this.choice, invalid: chk.problems }; throw new ApiFail('career-invalid', 'This device\'s career cannot be added to an account: ' + chk.problems.join('; ') + '. You can start a new career on the account instead.'); }
    const records = cleanRecords(local.records, id => getTrack(id).length), importId = lsGet(this.ls, this.pendingKey('import'), null) || rid();
    lsSet(this.ls, this.pendingKey('import'), importId);
    lsSet(this.ls, 'galactic-rush.v12.import-backup', { at: Date.now(), uid: this.uid, profile: local.profile, records: local.records }); // a copy of what was sent, kept on this device
    const r = await this.api.importCareer({ importId, profile: local.profile, records: local.records, settings: cleanSettings(this.g.settings), name: mpName(), replace, ...(replace ? { expectRev: this.choice.rev } : {}) });
    if (r.code === 'account-has-career' || r.code === 'stale') { this.choice = { kind: 'both', local: careerSummary(local.profile, local.records), account: r.account, rev: r.rev }; this.state = 'deciding'; throw new ApiFail(r.code, r.code === 'stale' ? r.message : 'This account already has a career. Compare the two and choose.'); }
    if (!r.ok) throw new ApiFail(r.code || 'refused', r.message || 'The account server refused the career.');
    const expected = progressDigest(chk.profile, records);
    if (r.digest !== expected || progressDigest(r.view.profile, r.view.records) !== expected) throw new ApiFail('verify', 'The account server\'s copy did not match this device\'s career, so this device keeps playing its own career. Try again.');
    lsSet(this.ls, this.pendingKey('import'), null);
    this.link(r.view);
    this.uploadGhosts(r.view.records, loadGuestGhosts());
    this.say('good', replace ? 'This device\'s career replaced the account\'s (the server keeps a backup of the old one). Verified and synced.' : 'This device\'s career is now your account\'s career. Verified and synced.');
  }
  link(view) {
    this.session.linked = true; saveSession(this.session, this.ls); this.choice = null;
    this.enterCloud(view); this.online = true; this.setSync('synced'); this.fetchGhosts();
  }

  // ---------- switching the game between the guest career and the account's ----------
  enterCloud(view) {
    const g = this.g, P = new CloudProgression(this, accountStorage(this.uid, this.ls));
    useSaveSlot(this.pendingKey('save'));
    const fresh = !this.ls.getItem(this.pendingKey('save'));
    g.save = loadSave(); if (fresh) g.save.settings = { ...g.settings }; // a device's first sign-in: its graphics settings carry over
    g.progress = P; this.state = 'ready'; this.view = null;
    if (view) this.adopt(view, true);
    else storeSave(g.save);
    g.accountSwitched && g.accountSwitched();
  }
  leaveCloud() {
    const g = this.g; if (!g.progress || !g.progress.cloud) return;
    g.progress.flush(); useSaveSlot(null); g.save = loadSave(); g.progress = new Progression(); this.view = null; this.queue = []; this.finishes = []; this.tickets.clear(); this.online = false;
    g.accountSwitched && g.accountSwitched();
  }
  // the server's answer replaces the copy (once nothing sent from this device is still waiting for an answer)
  adopt(view, first = false) {
    if (!view || !view.profile || (this.view && view.rev < this.view.rev)) return;
    this.view = view;
    if (this.queue.length || this.finishes.some(f => f.ticket)) return;
    const g = this.g; g.progress.adopt(view.profile);
    g.save.best = Object.fromEntries(Object.entries(view.records || {}).map(([k, r]) => [k, { lap: r.lap, ship: r.ship }]));
    if (first && view.settings && Object.keys(view.settings).length) { g.settings = { ...g.settings, ...view.settings }; g.save.settings = g.settings; g.applySettings && g.applySettings(false); }
    storeSave(g.save); this.lastSync = Date.now(); this.changed('adopt');
  }

  // ---------- operations, race tickets, results ----------
  canChange() {
    if (this.state !== 'ready') return { ok: false, code: 'account', message: 'Not signed in.' };
    if (!this.online) return { ok: false, code: 'offline', message: this.sync === 'idle' ? 'Still connecting to your account (a sleeping server takes up to a minute to wake). Nothing was changed; try again in a moment.' : 'No connection to the account server: purchases and changes are paused until it is back. Nothing was changed.' };
    return null;
  }
  send(op, args, { light = false } = {}) {
    if (this.state !== 'ready' || (light && !this.online)) return;
    this.queue.push({ opId: rid(), op, args }); lsSet(this.ls, this.pendingKey('ops'), this.queue); this.pump();
  }
  raceStarting(raceId, params) {
    if (this.state !== 'ready') return;
    // asked for even while the server seems unreachable (it may be waking up): the race is paid if the ticket comes
    const t = { status: 'pending', params }; this.tickets.set(raceId, t);
    if (this.tickets.size > 20) this.tickets.delete(this.tickets.keys().next().value);
    const no = why => { t.status = 'failed'; t.why = why; this.toast(`This race will not be credited to your account: ${why}`, 'bad'); }; // said at once, not at the finish
    t.promise = this.api.raceStart(params).then(r => { if (r.ok) { t.status = 'ok'; t.id = r.ticket; } else no(r.message || 'the account server refused it.'); }, e => { no(e.network ? 'the account server cannot be reached.' : e.message); this.failed(e); });
  }
  ticketFor(raceId) { const t = this.tickets.get(raceId); return t && t.status !== 'failed' ? t : null; }
  raceFinished(raceId, result) {
    const t = this.tickets.get(raceId), item = { raceId, result, ticket: t.id || null };
    this.finishes.push(item);
    const go = () => {
      if (t.status === 'ok') { this.online = true; item.ticket = t.id; lsSet(this.ls, this.pendingKey('races'), this.finishes.filter(f => f.ticket)); this.pump(); }
      else { this.finishes = this.finishes.filter(f => f !== item); this.changed('race', { raceId, ok: false }); this.refresh(); }
    };
    if (t.promise && t.status === 'pending') t.promise.then(go); else go();
  }
  // send what is waiting, one at a time, in order; then show the server's state
  async pump() {
    if (this.pumping || this.state !== 'ready') return; this.pumping = true; this.setSync('saving');
    let last = null;
    try {
      while (this.state === 'ready') {
        const op = this.queue[0], fin = !op && this.finishes.find(f => f.ticket);
        if (!op && !fin) break;
        let r;
        try { r = op ? await this.api.op(op) : await this.api.raceFinish({ ticket: fin.ticket, ...fin.result }); }
        catch (e) { if (e.network) { this.failed(e); return; } r = { ok: false, code: e.code, message: e.message }; }
        if (op) { this.queue.shift(); lsSet(this.ls, this.pendingKey('ops'), this.queue); }
        else { this.finishes = this.finishes.filter(f => f !== fin); lsSet(this.ls, this.pendingKey('races'), this.finishes.filter(f => f.ticket)); }
        if (r.view) last = r.view;
        if (!r.ok && !r.repeated) this.toast(`${op ? 'Not saved' : 'Race not credited'}: ${r.message || 'the account server refused it'}${op ? ' Your account is unchanged.' : ''}`, 'bad');
        if (fin && r.ok && r.record) this.uploadGhosts({ [r.record.key]: { lap: r.record.lap } }, this.g.save.ghosts);
        if (fin) this.changed('race', { raceId: fin.raceId, ok: !!r.ok });
      }
      if (last) this.adopt(last);
      this.online = true; this.setSync('synced');
    } finally { this.pumping = false; }
  }
  failed(e) {
    if (e && e.network) { if (this.online || this.sync !== 'offline') { this.online = false; this.setSync('offline'); } clearTimeout(this.retryT); this.retryT = setTimeout(() => this.refresh(), 20e3); return; }
    if (e && e.code === 'auth' && !this.session) return; // the session ended: sessionEnded told the player
    this.say('bad', (e && e.message) || 'The account server reported a problem.');
  }
  setSync(s) { if (this.sync !== s) { this.sync = s; this.changed(); } }

  // ---------- settings, pilot name, ghosts ----------
  settingsChanged(s) {
    if (this.state !== 'ready') return;
    const clean = cleanSettings(s), key = JSON.stringify(clean); if (key === this.sentSettings) return;
    clearTimeout(this.setT); this.setT = setTimeout(() => { if (!this.online) return; this.sentSettings = key; this.api.settings(clean).then(r => { if (r.view) this.view = { ...this.view, rev: r.view.rev, settings: r.view.settings }; }, e => this.failed(e)); }, 1500);
  }
  nameChanged(name) { if (this.state === 'ready' && this.online && PILOT_NAME.test(name || '')) this.api.name(name).catch(e => this.failed(e)); }
  uploadGhosts(records, ghosts) {
    for (const [key, rec] of Object.entries(records || {})) { const gh = ghosts && ghosts[key]; if (gh && Array.isArray(gh.f) && Math.abs(gh.lap - rec.lap) < 0.002) this.api.putGhost(key, { lap: gh.lap, ship: gh.ship, f: gh.f }).catch(() => {}); }
  }
  async fetchGhosts() {
    if (this.state !== 'ready' || this.ghostsFetched) return; this.ghostsFetched = true;
    try {
      const r = await this.api.ghosts(); if (!r.ok) return;
      for (const gm of r.ghosts) { const have = this.g.save.ghosts[gm.key]; if (have && Math.abs(have.lap - gm.lap) < 0.002) continue;
        const one = await this.api.ghost(gm.key); if (one.ok && this.state === 'ready') { this.g.save.ghosts[gm.key] = one.ghost; storeSave(this.g.save); } }
    } catch (e) { this.ghostsFetched = false; }
  }

  // ---------- what the menus show ----------
  changed(kind, detail) { this.ui.refresh(); if (this.g.accountChanged) this.g.accountChanged(kind, detail); }
  status() {
    if (this.state === 'off') return { short: 'Guest', line: 'Career saved in this browser only' };
    if (this.state === 'guest') return { short: 'Guest', line: 'Saved in this browser only · log in to save to an account' };
    if (this.state === 'unverified') return { short: 'Verify email', line: 'Verify your email address to save to your account' };
    if (this.state === 'deciding') return { short: 'Finish setup', line: 'Choose which career your account keeps' };
    if (this.state === 'working') return { short: 'Signing in…', line: 'Connecting to your account' };
    const s = { synced: 'Saved to your account', saving: 'Saving to your account…', offline: 'Offline · purchases paused, nothing lost', idle: 'Connecting to your account…' }[this.sync] || 'Signed in';
    return { short: this.sync === 'offline' ? 'Offline' : this.sync === 'saving' ? 'Saving…' : 'Synced', line: `${this.email || 'Signed in'} · ${s}` };
  }
  act(arg, el) { return this.ui.act(arg, el); }
}

// this device's guest data (records and ghosts live in the guest save)
function guestSave() { const prev = useSaveSlot(null), s = loadSave(); useSaveSlot(prev); return s; }
const loadGuestRecords = () => guestSave().best || {};
const loadGuestGhosts = () => guestSave().ghosts || {};
function mpName() { try { const p = JSON.parse(localStorage.getItem('galactic-rush.mp') || '{}'); return typeof p.name === 'string' && PILOT_NAME.test(p.name) ? p.name : undefined; } catch (e) { return undefined; } }
export { SYNCED_SETTINGS };
