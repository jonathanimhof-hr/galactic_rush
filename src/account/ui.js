// GALACTIC RUSH V12 — the account screens: log in, register, reset the password, verify the email address, choose
// which career the account keeps, and the signed-in account's status. Text fields use the browser's own password
// manager hints (autocomplete); the game never pre-fills or keeps a password.
import { PASSWORD_RULE } from './firebase.js';
import { ACCOUNT_CSS } from './style.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n0 = x => Number(x || 0).toLocaleString('en-US');
const when = t => { if (!t) return '—'; const d = new Date(t); return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; };
const btn = (arg, label, cls = '', small = '') => `<button class="btn${cls ? ' ' + cls : ''}" data-act="acct" data-arg="${arg}">${label}${small ? `<small>${small}</small>` : ''}</button>`;

function summaryHTML(s, title) {
  if (!s) return '';
  return `<div class="acct-sum"><h4>${esc(title)}</h4><dl>
    <dt>Credits</dt><dd>${n0(s.CR)} CR</dd><dt>Style tokens</dt><dd>${n0(s.ST)} ST</dd><dt>Races</dt><dd>${n0(s.races)} (${n0(s.wins)} wins)</dd>
    <dt>Upgrades</dt><dd>${n0(s.upgrades)} levels</dd><dt>Items</dt><dd>${n0(s.items)}</dd><dt>Championships won</dt><dd>${n0(s.champs)}</dd><dt>Course records</dt><dd>${n0(s.records)}</dd>
    <dt>Last change</dt><dd>${when(s.updatedAt)}</dd></dl></div>`;
}

export class AccountUI {
  constructor(account) { this.a = account; this.open = false; this.tab = 'login'; this.confirmLogout = false; this.confirmReplace = false; this.styled = false; this.from = 'title'; }
  style() { if (this.styled || typeof document === 'undefined') return; const s = document.createElement('style'); s.textContent = ACCOUNT_CSS; document.head.appendChild(s); this.styled = true; }
  show(from) { this.style(); this.open = true; if (from) this.from = from; this.render(false); }
  close() { this.open = false; this.confirmLogout = false; this.confirmReplace = false; }
  refresh() { if (this.open && this.a.g.state === 'account') this.render(true); }
  render(keep) {
    const g = this.a.g; if (!g.ui) return;
    // a re-render keeps what the player has typed
    const typed = {}; if (keep) for (const el of document.querySelectorAll('#ui .acct input')) typed[el.id] = el.value;
    g.ui.show(`<div class="col acct" style="width:min(760px,100%)"><h3>Pilot account</h3><h2>Account</h2>${this.body()}</div>`, 'full', !keep, keep);
    for (const [id, v] of Object.entries(typed)) { const el = document.getElementById(id); if (el) el.value = v; }
  }
  note() { const n = this.a.notice; return n ? `<p class="acct-note ${n.kind === 'bad' ? 'bad' : 'good'}" role="${n.kind === 'bad' ? 'alert' : 'status'}">${esc(n.text)}</p>` : ''; }
  body() {
    const a = this.a, busy = a.busy ? ' disabled aria-busy="true"' : '';
    const back = `<div class="actbar"><div class="row"><button class="btn" data-act="back" data-arg="title">Back</button></div></div>`;
    if (a.state === 'off') return `<div class="panel"><p class="lede">Accounts are not available in this copy of the game. Your career, records and settings are saved in this browser, as before.</p></div>${back}`;
    if (a.state === 'guest') {
      const tabs = [['login', 'Log in'], ['register', 'Register'], ['reset', 'Forgot password']].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${this.tab === k}" data-act="acct" data-arg="tab:${k}">${l}</button>`).join('');
      const email = (id, ac) => `<label class="acct-field"><span>Email address</span><input id="${id}" type="email" autocomplete="${ac}" spellcheck="false" maxlength="254" required></label>`;
      let form;
      if (this.tab === 'register') form = `<form class="acct-form" data-acct-form="register" novalidate>${email('acct-email', 'email')}
        <label class="acct-field"><span>Password<small>${PASSWORD_RULE.min}+ characters with letters and a digit</small></span><input id="acct-pw" type="password" autocomplete="new-password" maxlength="${PASSWORD_RULE.max}" required></label>
        <label class="acct-field"><span>Repeat password</span><input id="acct-pw2" type="password" autocomplete="new-password" maxlength="${PASSWORD_RULE.max}" required></label>
        <div class="row"><button class="btn primary" type="submit" data-act="acct" data-arg="register"${busy}>${a.busy ? 'Creating…' : 'Create account'}</button></div></form>
        <p class="lede small">We send a link to confirm the address. Your password goes only to the sign-in service (Google Firebase), which keeps only a secure hash of it; the game never stores it.</p>`;
      else if (this.tab === 'reset') form = `<form class="acct-form" data-acct-form="reset" novalidate>${email('acct-email', 'username')}
        <div class="row"><button class="btn primary" type="submit" data-act="acct" data-arg="reset"${busy}>${a.busy ? 'Sending…' : 'Send a reset link'}</button></div></form>
        <p class="lede small">The email contains a link to set a new password. It works once and expires after a while.</p>`;
      else form = `<form class="acct-form" data-acct-form="login" novalidate>${email('acct-email', 'username')}
        <label class="acct-field"><span>Password</span><input id="acct-pw" type="password" autocomplete="current-password" maxlength="${PASSWORD_RULE.max}" required></label>
        <div class="row"><button class="btn primary" type="submit" data-act="acct" data-arg="login"${busy}>${a.busy ? 'Logging in…' : 'Log in'}</button></div></form>`;
      return `<div class="tabs" role="tablist">${tabs}</div>${this.note()}<div class="panel">${form}</div>
        <p class="lede small">With an account your career, upgrades, cosmetics, records, ghosts and gameplay settings are kept on the server and follow you to any device. Without one, everything stays in this browser. Signing in never changes this device's career: you choose what the account keeps.</p>${back}`;
    }
    if (a.state === 'working') return `${this.note()}<div class="panel"><p class="lede">Connecting to your account${a.email ? ` (${esc(a.email)})` : ''}…</p></div><div class="actbar"><div class="row">${btn('logout', 'Log out')}<button class="btn" data-act="back" data-arg="title">Back</button></div></div>`;
    if (a.state === 'unverified') return `${this.note()}<div class="panel"><p class="lede">Confirm your email address: open the link we sent to <b>${esc(a.email)}</b>. Until then your account cannot hold a career, and the game keeps saving this device's career here.</p>
      <div class="row">${btn('verified', a.busy ? 'Checking…' : 'I have verified my email', 'primary')}${btn('resend', 'Send the email again')}</div></div>
      <div class="actbar"><div class="row">${btn('logout', 'Log out')}<button class="btn" data-act="back" data-arg="title">Back</button></div></div>`;
    if (a.state === 'deciding') {
      const c = a.choice || {};
      if (this.confirmReplace) return `${this.note()}<div class="panel warnbox"><p class="lede"><b>Replace the account's career?</b> The account's career below is replaced by this device's career. The server keeps a backup of the replaced career, but the game cannot bring it back.</p>
        <div class="acct-two">${summaryHTML(c.account, 'Your account (replaced)')}${summaryHTML(c.local, 'This device (kept)')}</div>
        <div class="row">${btn('choose:replace-confirmed', 'Yes, replace it', 'danger')}${btn('choose:cancel', 'Cancel', 'primary')}</div></div>`;
      if (c.invalid) return `${this.note()}<div class="panel"><p class="lede">This device's career cannot be added to an account because its records do not add up (it may have been edited):</p><ul class="acct-list">${c.invalid.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="row">${btn('choose:fresh', 'Start a new career on the account', 'primary')}${btn('logout', 'Log out')}</div></div>`;
      if (c.kind === 'new-account') return `${this.note()}<div class="panel"><p class="lede">Your account has no career yet. This device has one:</p>${summaryHTML(c.local, 'This device')}
        <div class="row">${btn('choose:import', a.busy ? 'Saving to your account…' : 'Bring this career to my account', 'primary', 'Checked, saved and verified on the server')}${btn('choose:fresh', 'Start a new career on the account', '', 'This device\'s career stays here')}</div></div>
        <div class="actbar"><div class="row">${btn('logout', 'Log out')}</div></div>`;
      return `${this.note()}<div class="panel"><p class="lede">Your account already has a career, and this device has a different one. Careers are never merged (that could pay rewards twice): your account keeps one of them. The other is not deleted.</p>
        <div class="acct-two">${summaryHTML(c.account, 'Your account')}${summaryHTML(c.local, 'This device')}</div>
        <div class="row">${btn('choose:account', 'Play the account\'s career', 'primary', 'This device\'s career stays here as the guest career')}${btn('choose:replace', 'Replace the account\'s career with this device\'s', '', 'The server keeps a backup')}</div></div>
        <div class="actbar"><div class="row">${btn('logout', 'Log out')}</div></div>`;
    }
    // ready
    const st = a.status(), P = a.g.progress, s = P && P.profile, pending = a.queue.length + a.finishes.length;
    const logout = this.confirmLogout
      ? `<div class="panel warnbox"><p class="lede">${pending} change${pending === 1 ? ' has' : 's have'} not reached the account server yet. They stay on this device and are sent the next time you log in here. Log out anyway?</p><div class="row">${btn('logout:force', 'Log out anyway', 'danger')}${btn('logout:cancel', 'Stay signed in', 'primary')}</div></div>`
      : '';
    return `${this.note()}<div class="panel acct-status ${a.sync}"><div class="acct-who"><span class="dot" aria-hidden="true"></span><div><b>${esc(a.email)}</b><small>${esc(st.line.replace(`${a.email} · `, ''))}${a.lastSync ? ` · last saved ${when(a.lastSync)}` : ''}</small></div></div>
      ${pending ? `<p class="lede small">${pending} change${pending === 1 ? '' : 's'} waiting to be saved${a.sync === 'offline' ? ' (sent when the connection is back)' : ''}.</p>` : ''}
      ${a.sync === 'offline' ? `<p class="lede small">The account server cannot be reached. You can race, but races are not credited and purchases are paused until it is back. Nothing you have is lost.</p><div class="row">${btn('retry', 'Try again now')}</div>` : ''}</div>
      ${s ? summaryHTML({ CR: s.wallet.CR, ST: s.wallet.ST, races: s.stats.races, wins: s.stats.wins, upgrades: Object.values(s.ships).reduce((n, x) => n + Object.values(x.upgrades).reduce((m, v) => m + v, 0), 0), items: s.inventory.unlocked.length, champs: Object.values(s.championships.completed).reduce((n, v) => n + v, 0), records: Object.keys(a.g.save.best || {}).length, updatedAt: s.updatedAt }, 'Your account\'s career') : ''}
      <p class="lede small">Saved to your account: career, credits and tokens, upgrades, cosmetics, championships, statistics, course records, ghosts and gameplay settings. Graphics settings stay with each device.</p>
      ${logout}<div class="actbar"><div class="row">${this.confirmLogout ? '' : btn('logout', 'Log out')}<button class="btn primary" data-act="back" data-arg="title">Back</button></div></div>`;
  }
  // data-act="acct"
  act(arg = '', el) {
    const a = this.a, [k, v] = String(arg).split(':'), val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
    switch (k) {
      case 'open': this.show(v); return;
      case 'tab': this.tab = v; a.notice = null; this.render(true); return;
      case 'login': { const pw = val('acct-pw'); a.login(val('acct-email'), pw).then(() => this.clearPw()); return; }
      case 'register': { a.register(val('acct-email'), val('acct-pw'), val('acct-pw2')).then(() => this.clearPw()); return; }
      case 'reset': a.resetPassword(val('acct-email')); return;
      case 'verified': a.checkVerified(); return;
      case 'resend': a.resendVerification(); return;
      case 'retry': a.refresh(); return;
      case 'choose': if (v === 'cancel') { this.confirmReplace = false; this.render(true); } else a.choose(v); return;
      case 'logout': if (v === 'cancel') { this.confirmLogout = false; this.render(true); } else a.logout(v === 'force'); return;
    }
  }
  clearPw() { if (this.a.state !== 'guest') for (const id of ['acct-pw', 'acct-pw2']) { const e = document.getElementById(id); if (e) e.value = ''; } }
}
