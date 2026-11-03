// Menus, banners and messages (DOM). The in-race HUD lives in hud.js.
import { SHIPS, STAT_BARS, DIFFICULTY, CHAMPIONSHIP } from './config.js';
import { TRACK_DEFS } from './sim/tracks.js';
import { walletHTML, rewardHTML, ladderHTML, DIFF_LABEL } from './ui-garage.js';

const $ = s => document.querySelector(s);
export const fmt = t => (!isFinite(t) || t <= 0) ? '--:--.--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const seg = (act, opts, cur, id) => `<div class="seg" role="group"${id ? ` id="${id}"` : ''}>${opts.map(([v, l]) => `<button data-act="${act}" data-arg="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
const statVal = { SPEED: s => `${Math.round(s.maxSpeed * 3.6)}`, ACCEL: s => `${s.accel}`, HANDLING: s => s.yawRate.toFixed(2), BOOST: s => `${s.boostCap}`, ARMOUR: s => `${s.hull}` };

export const CONTROLS = [
  ['Pitch (nose up / down)', 'W S or ↑ ↓', 'Left stick'], ['Yaw (turn)', 'A D or ← →', 'Left stick'], ['Roll', 'Q E', 'Right stick'], ['Boost', 'Space', 'A or RT'],
  ['Drift / air-brake', 'Shift', 'LB'], ['Brake', 'X', 'LT'], ['Throttle up / down', 'R F', 'D-pad ↑ ↓'], ['Fire ion bolt', 'J or click', 'X or RB'],
  ['Shield', 'K', 'Y'], ['Camera view', 'C', 'D-pad →'], ['Look back', 'B', 'R3'], ['Reset to course', 'T', 'D-pad ←'], ['Pause', 'P or Esc', 'Start'],
];

export class UI {
  constructor(game) {
    this.g = game; this.root = $('#ui'); this.msgEl = $('#msg'); this.countEl = $('#count'); this.bannerEl = $('#banner'); this.tab = 'graphics';
    this.root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) { game.audio.ui('click'); game.action(b.dataset.act, b.dataset.arg, b); } });
    this.root.addEventListener('input', e => { const el = e.target; if (el.dataset.set) game.action('set', `${el.dataset.set}:${el.value}`); else if (el.dataset.gin) game.garage.input(el); });
    this.root.addEventListener('change', e => { const el = e.target; if (el.dataset.gin === 'hex') game.action('g', 'hex'); }); // V7: Enter or leaving the hex field applies it
    this.root.addEventListener('focusin', e => { if (e.target.closest('[data-act]')) game.audio.ui('move'); const c = e.target.closest('.card[data-arg]'); if (c && c.dataset.act === 'track') game.action('hoverTrack', c.dataset.arg); });
    this.root.addEventListener('mouseover', e => { const c = e.target.closest('.card[data-arg]'); if (c && c.dataset.act === 'track') game.action('hoverTrack', c.dataset.arg); });
    addEventListener('resize', () => { this.fitLogo(); this.fitBar(); });
    this.root.addEventListener('toggle', () => this.fitBar(), true); // <details> opening or closing changes the height
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.fitLogo(); this.fitBar(); });
  }
  // V7: a screen taller than the window keeps its action row (.actbar) pinned to the bottom edge
  fitBar() { const sc = this.root.querySelector('.screen'); if (sc && sc.querySelector('.actbar')) sc.classList.toggle('scrolls', sc.scrollHeight > sc.clientHeight + 2); }
  show(html, cls = 'scrim', focus = true, keep = false) {
    // V7: keep = re-render of the same screen (garage): no slide-in, same scroll position, focus stays on the same control
    let fk = null, top = 0; const a = document.activeElement, sc = this.root.querySelector('.screen');
    if (keep && sc) { top = sc.scrollTop; if (a && this.root.contains(a)) fk = a.dataset.gin ? `[data-gin="${a.dataset.gin}"]` : a.dataset.act ? `[data-act="${a.dataset.act}"]${a.dataset.arg != null ? `[data-arg="${CSS.escape(a.dataset.arg)}"]` : ''}` : null; }
    this.root.innerHTML = `<section class="screen ${cls}${keep ? ' still' : ''}">${html}</section>`; this.fitLogo(); this.fitBar();
    if (keep) { const s2 = this.root.querySelector('.screen'); s2.scrollTop = top; const f = fk && this.root.querySelector(fk); if (f) f.focus({ preventScroll: true }); else if (focus) { const t = this.root.querySelector('.tabs [aria-selected="true"]'); if (t) t.focus({ preventScroll: true }); } return; }
    if (focus) { const f = this.root.querySelector('.btn.primary, .card[aria-pressed="true"], .btn'); if (f) f.focus({ preventScroll: true }); }
  }
  hide() { this.root.innerHTML = ''; }
  // Fit the logo to its column whatever font actually loaded (bug fix: fallback fonts used to clip off-screen)
  fitLogo() {
    const l = this.root.querySelector('.logo'); if (!l) return;
    const box = l.parentElement.clientWidth || 400; l.style.fontSize = '72px';
    const w = Math.max(l.querySelector('.a').scrollWidth, l.querySelector('.b').scrollWidth);
    l.style.fontSize = Math.max(22, Math.min(96, 72 * (box / Math.max(1, w)) * 0.98)) + 'px';
  }
  // focus navigation with arrow keys / d-pad
  nav(dir) {
    const els = [...this.root.querySelectorAll('button, input[type=range], textarea')].filter(e => e.offsetParent !== null);
    if (!els.length) return; let i = els.indexOf(document.activeElement);
    i = i < 0 ? 0 : (i + dir + els.length) % els.length; els[i].focus({ preventScroll: false });
  }
  activate() { const a = document.activeElement; if (a && a.matches && a.matches('button')) a.click(); }

  title(touch) {
    const P = this.g.progress, run = P && P.activeRun();
    this.show(`<div class="col">
      <div class="row between"><div class="kicker">Starlane Grand Prix · Season 5</div>${P ? walletHTML(P.wallet()) : ''}</div>
      <h1 class="logo"><span class="a">Galactic</span><span class="b">Rush</span></h1>
      <p class="lede">Thread an orbital foundry trench, a drifting asteroid belt, a neon megacity and the ring plane of a gas giant at six hundred kilometres an hour.</p>
      ${touch ? '<p class="touchnote">Needs a keyboard or a gamepad to fly.</p>' : ''}
      <div class="menu">
        ${run ? `<button class="btn primary" data-act="champContinue">Continue championship<small>${DIFF_LABEL[run.diff]} · round ${run.round + 1} of ${CHAMPIONSHIP.length}</small></button>` : ''}
        <button class="btn${run ? '' : ' primary'}" data-act="mode" data-arg="quick">Quick race<small>One course, five rivals · earn credits every race</small></button>
        <button class="btn" data-act="mode" data-arg="champ">Championship<small>${run ? 'A run is in progress' : 'Four rounds · Rookie → Pro → Ace'}</small></button>
        <button class="btn" data-act="mode" data-arg="trial">Time trial<small>Race your ghost for the course record</small></button>
        <button class="btn" data-act="mp" data-arg="open">Online multiplayer<small>Tournament against real pilots · qualifier and final</small></button>
        <button class="btn" data-act="garage">Garage<small>Upgrades, paint shop, inventory and cosmetic shop</small></button>
        <button class="btn" data-act="career">Career<small>Your record, championships and earnings</small></button>
        <button class="btn" data-act="settings" data-arg="title">Settings</button>
        <button class="btn" data-act="controls" data-arg="title">Controls</button>
      </div>
      <div class="foot">All ships, circuits, pilots, brands and music are original. Arrow keys or d-pad to move, Enter or A to select.</div>
    </div>`);
  }

  shipSelect(idx) {
    const s = SHIPS[idx];
    this.show(`<div class="col">
      <h3>Hangar · ship ${idx + 1} of ${SHIPS.length}</h3>
      <div class="shipnav"><button class="arrow" data-act="ship" data-arg="-1" aria-label="Previous ship">‹</button>
        <div><h2>${s.name}</h2><div class="row" style="margin-top:8px"><span class="chip">${s.cls}</span><span class="chip amber">Original design</span></div></div>
        <button class="arrow" data-act="ship" data-arg="1" aria-label="Next ship">›</button></div>
      <p class="lede">${s.desc}</p>
      <div class="panel stats">${STAT_BARS.map(([l, f]) => `<span>${l}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, f(s))) * 100)}%"></b></i><em>${statVal[l](s)}</em>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="shipOk">Fly the ${s.name}</button><button class="btn" data-act="back">Back</button></div>
      <div class="foot">← → to browse ships · Enter to choose</div>
    </div>`, 'scrim');
  }

  trackSelect(o, save, maps) {
    const champ = o.mode === 'champ', trial = o.mode === 'trial';
    const list = champ ? CHAMPIONSHIP.map(id => TRACK_DEFS.find(d => d.id === id)) : TRACK_DEFS;
    this.show(`<div class="col center" style="width:min(1000px,100%)">
      <h3>${champ ? 'Championship calendar' : trial ? 'Time trial · choose a course' : 'Quick race · choose a course'}</h3>
      <h2>${champ ? 'Four rounds' : 'Select course'}</h2>
      <div class="cards">${list.map((d, k) => { const b = save.best[this.recKey ? this.recKey(d.id) : d.id];
        return `<button class="card" data-act="${champ ? 'noop' : 'track'}" data-arg="${d.id}" aria-pressed="${!champ && o.track === d.id}"><canvas data-map="${d.id}" width="320" height="200"></canvas>
          <span class="chip">${champ ? 'Round ' + (k + 1) : d.short}</span><span class="t">${d.name}</span><span class="d">${d.tagline}</span>
          <span class="m"><span>LENGTH <b>${(this.g.trackLen(d.id) / 1000).toFixed(1)} KM</b></span><span>BEST <b>${b ? fmt(b.lap) : '--'}</b></span></span></button>`; }).join('')}</div>
      <div class="row" style="gap:22px"><div class="row"><h3>Laps</h3>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], o.laps)}</div>
        ${trial || champ ? '' : `<div class="row"><h3>Rivals</h3>${seg('diff', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), o.diff)}</div>`}</div>
      ${champ ? `<div class="panel"><h3>Championship difficulty · Rookie → Pro → Ace</h3>${ladderHTML(this.g.progress.profile.championships, o.diff, o.laps)}</div>` : ''}
      <div class="actbar"><div class="row"><button class="btn primary" data-act="start"${champ && !this.g.progress.champUnlocked(o.diff) ? ' disabled' : ''}>${champ ? `Start ${DIFF_LABEL[o.diff] || ''} championship` : 'Launch'}</button><button class="btn" data-act="back">Back</button></div></div>
    </div>`, 'scrim', false);
    this.root.querySelectorAll('canvas[data-map]').forEach(c => { const m = maps(c.dataset.map); if (m) c.getContext('2d').drawImage(m, 0, 0); });
    const f = this.root.querySelector('.card[aria-pressed="true"]') || this.root.querySelector('.btn.primary'); if (f) f.focus({ preventScroll: true });
  }

  preRace(name, sub) {
    this.root.innerHTML = `<div class="courseinfo"><span class="kicker">${esc(sub)}</span><b>${esc(name)}</b></div><button class="skip" data-act="skip">Skip ›</button>`;
  }

  champHub(ch) {
    const st = ch.c.standings(), done = ch.round >= CHAMPIONSHIP.length;
    this.show(`<div class="col center">
      <h3>Championship · after round ${ch.round} of ${CHAMPIONSHIP.length}</h3>
      <h2>${done ? (st[0].name === 'YOU' ? 'You are champion' : esc(st[0].name) + ' takes the title') : 'Standings'}</h2>
      <div class="tablewrap panel"><table class="res"><tr><th>POS</th><th>PILOT</th><th>WINS</th><th>POINTS</th></tr>
      ${st.map((e, k) => `<tr class="${e.name === 'YOU' ? 'me' : ''}"><td class="p">${k + 1}</td><td>${esc(e.name)}</td><td class="n">${e.wins}</td><td class="n"><b>${e.points}</b></td></tr>`).join('')}</table></div>
      <div class="row">${done ? '<button class="btn primary" data-act="menu">Main menu</button>'
        : `<button class="btn primary" data-act="nextRound">Round ${ch.round + 1}: ${TRACK_DEFS.find(d => d.id === CHAMPIONSHIP[ch.round]).name}</button><button class="btn" data-act="menu">Retire to menu</button>`}</div>
    </div>`, 'full');
  }

  results(race, extra) {
    const P = this.g.progress;
    const pl = race.player, win = race.order[0];
    const head = race.mode === 'trial' ? 'Run complete' : pl.place === 1 ? 'Victory' : `Finished P${pl.place}`;
    const rows = race.order.map(r => {
      const gap = r === win ? fmt(r.finishTime) : r.finished ? '+' + (r.finishTime - win.finishTime).toFixed(2) : 'DNF';
      return `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${r.place}</td><td>${esc(r.name)}</td><td>${r.ship.def.name}</td><td class="n">${gap}</td><td class="n">${fmt(r.bestLap)}</td>${extra.points ? `<td class="n"><b>+${extra.points[r.name] || 0}</b></td>` : ''}</tr>`;
    }).join('');
    const laps = race.mode === 'trial' ? `<div class="panel"><h3>Lap times</h3><div class="row num" style="margin-top:8px;gap:18px">${pl.lapTimes.map((t, k) => `<span>L${k + 1} <b style="color:${t === pl.bestLap ? 'var(--good)' : 'inherit'}">${fmt(t)}</b></span>`).join('')}</div></div>` : '';
    this.show(`<div class="col" style="width:min(640px,100%)">
      <h3>${esc(race.track.name)} · ${race.laps} lap${race.laps > 1 ? 's' : ''}</h3>
      <h2>${head}</h2>
      ${extra.record ? `<div><span class="chip" style="color:var(--good);border-color:var(--good)">New course record ${fmt(extra.record)}</span></div>` : ''}
      ${laps}
      ${extra.reward ? rewardHTML(extra.reward, P.wallet()) : ''}
      ${extra.reward && extra.reward.ok && extra.reward.champ ? `<p class="lede small">Championship run so far: ${extra.reward.champ.round} of ${extra.reward.champ.rounds} rounds, ${extra.reward.champ.runCredits.toLocaleString('en-US')} CR from races.</p>` : ''}
      <div class="tablewrap panel"><table class="res"><tr><th>POS</th><th>PILOT</th><th>SHIP</th><th>TIME</th><th>BEST LAP</th>${extra.points ? '<th>PTS</th>' : ''}</tr>${rows}</table></div>
      <div class="actbar"><div class="row">${extra.champ ? `<button class="btn primary" data-act="champHub">${extra.reward && extra.reward.completion && extra.reward.completion.ok ? 'Championship results' : 'Championship standings'}</button>`
        : '<button class="btn primary" data-act="restart">Race again</button><button class="btn" data-act="mode" data-arg="' + race.mode + '">Change course</button>'}
        <button class="btn" data-act="menu">Main menu</button></div></div>
    </div>`, 'scrim');
  }

  pause() {
    this.show(`<div class="col center" style="width:min(420px,100%)"><h3>Paused</h3><h2>Holding pattern</h2><div class="menu">
      <button class="btn primary" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart race</button>
      <button class="btn" data-act="settings" data-arg="pause">Settings</button><button class="btn" data-act="controls" data-arg="pause">Controls</button>
      <button class="btn" data-act="menu">Quit to menu</button></div></div>`, 'full');
  }

  settings(s, from) {
    const range = (k, min, max, step, label) => `<label class="setting"><span>${label}</span><input type="range" id="set-${k}" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></label>`;
    const opt = (k, label, opts) => `<div class="setting"><span>${label}</span>${seg('opt', opts.map(([v, l]) => [k + ':' + v, l]), k + ':' + s[k])}</div>`;
    const onoff = (k, label) => opt(k, label, [['on', 'On'], ['off', 'Off']]);
    const tabs = [['graphics', 'Graphics'], ['display', 'Display'], ['audio', 'Audio'], ['controls', 'Controls'], ['data', 'Save data']];
    let body = '';
    if (this.tab === 'graphics') body = opt('preset', 'Quality preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]) + onoff('shadows', 'Shadows') + onoff('ao', 'Ambient occlusion') + onoff('volumetrics', 'Light shafts')
      + onoff('motionBlur', 'Speed blur') + onoff('grain', 'Film grain') + onoff('ca', 'Chromatic aberration') + onoff('flare', 'Lens flare') + range('resScale', 0.5, 1, 0.05, 'Resolution scale') + onoff('dynRes', 'Dynamic resolution');
    else if (this.tab === 'display') body = range('fov', 60, 90, 1, 'Field of view') + range('shake', 0, 1.5, 0.05, 'Camera shake') + range('hudScale', 0.8, 1.3, 0.05, 'HUD scale')
      + onoff('reducedMotion', 'Reduced motion (no shake, blur or flashes)') + opt('cam', 'Default camera', [['chase', 'Chase'], ['far', 'Far'], ['cockpit', 'Cockpit']]) + onoff('fpsCounter', 'FPS counter');
    else if (this.tab === 'audio') body = opt('sound', 'Sound', [['on', 'On'], ['off', 'Off']]) + range('master', 0, 1, 0.05, 'Master volume') + range('music', 0, 1, 0.05, 'Music volume') + range('sfx', 0, 1, 0.05, 'Effects volume');
    else if (this.tab === 'controls') body = range('sens', 0.6, 1.4, 0.05, 'Steering sensitivity') + range('padSens', 0.6, 1.6, 0.05, 'Gamepad sensitivity') + opt('invert', 'Pitch', [['false', 'Normal'], ['true', 'Inverted']])
      + opt('handling', 'Handling', [['relaxed', 'Relaxed'], ['classic', 'Classic (V1)']]) + opt('assist', 'Steering assist', [['0', 'Off'], ['0.3', 'Low'], ['0.6', 'High']]) + opt('rumble', 'Gamepad rumble', [['on', 'On'], ['off', 'Off']]);
    else body = `<p class="lede" style="margin:6px 0 10px">Best laps and ghosts are stored in this browser. Copy them out, or paste a save from Galactic Rush V1 or another browser. Pasting keeps whichever lap is faster.
      Your career (credits, Style Tokens, upgrades, cosmetics and championships) is also saved in this browser, separately, and is not part of this copy: there is no cloud sync.</p>
      <textarea class="save" id="saveText" placeholder="Paste a save here"></textarea>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="saveExport">Copy my save</button><button class="btn" data-act="saveImport">Import pasted save</button></div><p class="lede" id="saveMsg" style="margin-top:6px"></p>`;
    this.show(`<div class="col center" style="width:min(680px,100%)"><h3>Settings</h3><h2>Tune the cockpit</h2>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="tab" data-arg="${k}" aria-selected="${this.tab === k}">${l}</button>`).join('')}</div>
      <div class="panel">${body}</div><div class="row"><button class="btn primary" data-act="back" data-arg="${from}">Done</button></div></div>`, 'full', false);
    const f = this.root.querySelector('.tabs [aria-selected="true"]'); if (f) f.focus({ preventScroll: true });
  }

  controls(from) {
    this.show(`<div class="col center" style="width:min(820px,100%)"><h3>Flight manual</h3><h2>Controls</h2>
      <div class="panel keys">${CONTROLS.map(([a, k, p]) => `<div><span>${a}</span><span>${k.split(' or ').map(x => `<kbd>${x}</kbd>`).join(' ')} <kbd style="color:var(--cyan)">${p}</kbd></span></div>`).join('')}</div>
      <p class="lede">Hold Shift through a corner to slide; release after half a second for a drift boost. Fly through amber rings for a speed surge, collect cyan cells to refill boost; magenta cells add an ion bolt. Ion bolts home in on the rival ahead and stun them.</p>
      <div class="row"><button class="btn primary" data-act="back" data-arg="${from}">Done</button></div></div>`, 'full');
  }

  message(text, cls = '', dur = 1.6) {
    const d = document.createElement('div'); d.textContent = text; d.className = cls; this.msgEl.appendChild(d);
    while (this.msgEl.children.length > 3) this.msgEl.firstChild.remove();
    setTimeout(() => d.remove(), dur * 1000);
  }
  banner(text, cls = 'amber', dur = 2) {
    this.bannerEl.innerHTML = ''; const d = document.createElement('div'); d.className = 'bn ' + cls; d.textContent = text; this.bannerEl.appendChild(d);
    clearTimeout(this.bnT); this.bnT = setTimeout(() => { if (d.parentNode) d.remove(); }, dur * 1000);
  }
  clearMessages() { this.msgEl.innerHTML = ''; this.countEl.textContent = ''; this.bannerEl.innerHTML = ''; }
  count(t) { this.countEl.textContent = t; this.countEl.className = t === 'GO' ? 'go' : ''; }
}
