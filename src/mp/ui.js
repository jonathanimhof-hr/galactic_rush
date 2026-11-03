// GALACTIC RUSH V8 — markup for the online screens: home (name, create, join, public lobbies), the lobby waiting room,
// stage results, the tournament result, connection problems and the in-race menu. Built from the game's existing
// classes (panels, buttons, segmented controls, result tables, wallet), so it looks like the rest of Galactic Rush.
import { SHIPS } from '../config.js';
import { esc, walletHTML } from '../ui-garage.js';
import { MP, fmtTime } from './protocol.js';

const mp = (arg, label, o = {}) => `<button class="${o.cls || 'btn'}" data-act="${o.act || 'mp'}" data-arg="${esc(arg)}"${o.disabled ? ' disabled' : ''}${o.pressed != null ? ` aria-pressed="${o.pressed}"` : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${label}</button>`;
const seg = (opts, cur) => `<div class="seg" role="group">${opts.map(([arg, l, v]) => `<button data-act="mp" data-arg="${esc(arg)}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
const shipName = id => (SHIPS.find(s => s.id === id) || { name: id }).name;
const css = c => `rgb(${c.map(v => Math.round(Math.min(1, v) * 255)).join(',')})`;
const swatch = (paint, ship) => `<i class="swatch" style="background:${paint && paint.primary ? esc(paint.primary) : css((SHIPS.find(s => s.id === ship) || SHIPS[0]).color)}"></i>`;
export const STAGE_LABEL = { 1: 'Stage 1 · Qualifier', 2: 'Stage 2 · Final' };
const REASON = { notloaded: 'Did not load', disconnected: 'Disconnected', left: 'Left', inactive: 'Inactive', invalid: 'Removed (invalid data)', unfinished: 'Did not finish' };
export const reasonText = r => REASON[r] || 'Did not finish';
const CONN = { connecting: 'Connecting…', online: 'Connected', reconnecting: 'Connection lost · reconnecting…', offline: 'Not connected', failed: 'Not connected', idle: 'Not connected' };

function connLine(c, server) {
  if (!server.url) return '<span class="conn off">No multiplayer server is set for this copy of the game</span>';
  return `<span class="conn ${c.state === 'online' ? 'on' : c.state === 'failed' || c.state === 'offline' || c.state === 'idle' ? 'off' : 'wait'}">${esc(c.label || CONN[c.state] || c.state)}</span><span class="srv">${esc(server.url.replace(/^wss?:\/\//, '').replace(/\/ws$/, ''))}</span>`;
}

// ---------- home ----------
export function homeHTML(v) {
  const s = v.server, ok = !!s.url && !s.insecure, online = v.conn.state === 'online';
  const list = v.list == null ? '' : v.list.length
    ? `<div class="tablewrap"><table class="res"><tr><th>CODE</th><th>HOST</th><th>PILOTS</th><th>HANDLING</th><th></th></tr>${v.list.map(l => `<tr><td class="n"><b>${esc(l.code)}</b></td><td>${esc(l.host)}</td><td class="n">${l.players}/${l.max}</td><td>${l.handling === 'classic' ? 'Classic' : 'Relaxed'}</td><td>${mp('join:' + l.code, 'Join', { cls: 'btn sm buy' })}</td></tr>`).join('')}</table></div>`
    : '<p class="lede small">No public lobbies are open right now. Create one, or join a friend with their code.</p>';
  const body = !s.url ? `<div class="panel mpnote"><b>Online play needs the multiplayer server.</b><p>This copy of Galactic Rush has no server address, so it cannot play online. Online races need a running Galactic Rush multiplayer server and a copy of the game published with that server’s address, such as the GitHub Pages version once it is set up. Inside the claude.ai preview the game cannot open network connections at all. The README explains how to run the server and point the game at it.</p></div>`
    : s.insecure ? `<div class="panel mpnote"><b>The server address is not secure.</b><p>This page is served over https, so it can only reach a wss:// server. Set the server address to its wss:// form.</p></div>`
    : `<div class="panel mpform">
        <label class="setting"><span>Pilot name<small>${MP.NAME_MIN}–${MP.NAME_MAX} letters or numbers, shown to other pilots</small></span><input class="mptext" data-mpin="name" maxlength="${MP.NAME_MAX}" value="${esc(v.name)}" spellcheck="false" autocomplete="off" aria-label="Pilot name"></label>
        <div class="setting"><span>New lobby<small>Private: only pilots with the code can join. Public: listed below for anyone.</small></span>${seg([['vis:private', 'Private', 'private'], ['vis:public', 'Public', 'public']], v.visibility)}</div>
        <div class="row">${mp('create', 'Create lobby', { cls: 'btn primary', disabled: !online || v.busy })}</div>
      </div>
      <div class="panel mpform"><h3>Join a lobby</h3>
        <div class="row" style="margin-top:8px"><input class="mptext code" data-mpin="code" maxlength="7" value="${esc(v.code || '')}" placeholder="CODE" spellcheck="false" autocomplete="off" aria-label="Room code">${mp('join', 'Join with code', { cls: 'btn sm buy', disabled: !online || v.busy })}</div>
      </div>
      <div class="panel"><div class="row between"><h3>Public lobbies</h3>${mp('list', 'Refresh', { cls: 'btn sm', disabled: !online })}</div>${list}</div>`;
  return `<div class="col mpcol">
    <div class="row between"><div class="kicker">Online multiplayer</div>${walletHTML(v.wallet)}</div>
    <h2>Tournament</h2>
    <p class="lede">Race real pilots over the internet. Everyone in the lobby races a <b>five-lap qualifier</b>; the top two meet in a <b>five-lap final</b>. The server picks both courses.</p>
    ${ok ? `<div class="mpconn">${connLine(v.conn, s)}</div>` : ''}
    ${v.error ? `<p class="reason" role="alert">${esc(v.error)}</p>` : ''}
    ${body}
    <div class="actbar"><div class="row">${ok && !online && v.conn.state !== 'connecting' && v.conn.state !== 'reconnecting' ? mp('connect', 'Connect', { cls: 'btn primary' }) : ''}<button class="btn" data-act="back" data-arg="mp">Back</button></div></div>
    <div class="foot">Online races use every ship's factory stats (garage upgrades stay in single-player); your saved paint job comes along. Ion bolts are off online.</div>
  </div>`;
}

// ---------- lobby ----------
export function lobbyHTML(v) {
  const L = v.lobby, me = L.you, host = L.host === me, mine = L.members.find(m => m.pid === me) || {};
  const on = L.members.filter(m => m.conn === 'ok'), waiting = on.filter(m => !m.ready).length, running = L.phase !== 'open';
  const startable = host && !running && on.length >= MP.MIN_PLAYERS && waiting === 0;
  const why = running ? 'A tournament is running.' : on.length < MP.MIN_PLAYERS ? `Waiting for pilots: at least ${MP.MIN_PLAYERS} are needed.` : waiting ? `Waiting for ${waiting} pilot${waiting > 1 ? 's' : ''} to be ready.` : host ? 'Everyone is ready.' : 'Everyone is ready. Waiting for the host to start.';
  const rows = L.members.map(m => `<tr class="${m.pid === me ? 'me' : ''}"><td>${m.pid === L.host ? '<span class="badge own">Host</span>' : ''}</td><td><b>${esc(m.name)}</b>${m.pid === me ? ' <small class="dim">(you)</small>' : ''}</td>
    <td>${swatch(m.paint, m.ship)}${esc(shipName(m.ship))}</td><td>${m.conn === 'ok' ? (m.ready ? '<span class="badge eq">Ready</span>' : '<span class="badge">Not ready</span>') : '<span class="badge lock">Reconnecting…</span>'}</td></tr>`).join('');
  const si = SHIPS.findIndex(s => s.id === mine.ship), ship = SHIPS[si] || SHIPS[0];
  return `<div class="col mpcol">
    <div class="row between"><div class="kicker">Online multiplayer · lobby</div>${walletHTML(v.wallet)}</div>
    <div class="mpcodebox"><span>Room code</span><b class="mpcode" data-code="${esc(L.code)}">${esc(L.code)}</b>${mp('copy', v.copied ? 'Copied' : 'Copy code', { cls: 'btn sm' })}<small>Share it with friends: they choose Online multiplayer → Join with code.</small></div>
    ${v.error ? `<p class="reason" role="alert">${esc(v.error)}</p>` : ''}
    ${v.conn && v.conn.state !== 'online' ? `<p class="reason" role="status">${esc(v.conn.label || CONN[v.conn.state] || 'Not connected')}</p>` : ''}
    <div class="panel tablewrap"><h3>Pilots ${L.members.length}/${L.max}</h3><table class="res mplist"><tr><th></th><th>PILOT</th><th>SHIP</th><th>STATUS</th></tr>${rows}</table></div>
    <div class="panel mpship"><h3>Your ship</h3>
      <div class="shipnav">${mp('ship:-1', '‹', { cls: 'arrow', disabled: running })}<div><b class="mpshipname">${esc(ship.name)}</b><div class="dim small">${esc(ship.cls)} · factory stats online</div></div>${mp('ship:1', '›', { cls: 'arrow', disabled: running })}</div>
      <p class="lede small">Your saved paint job for this ship comes along (Garage → Paint).</p></div>
    <div class="panel"><div class="setting"><span>Handling<small>${host ? 'The same for every pilot in the tournament.' : 'Set by the host.'}</small></span>${host && !running ? seg([['handling:relaxed', 'Relaxed', 'relaxed'], ['handling:classic', 'Classic', 'classic']], L.handling) : `<b>${L.handling === 'classic' ? 'Classic' : 'Relaxed'}</b>`}</div>
      <div class="setting"><span>Lobby<small>${L.visibility === 'public' ? 'Listed for everyone.' : 'Only pilots with the code can join.'}</small></span>${host && !running ? seg([['visibility:private', 'Private', 'private'], ['visibility:public', 'Public', 'public']], L.visibility) : `<b>${L.visibility === 'public' ? 'Public' : 'Private'}</b>`}</div></div>
    <p class="notice ${startable ? 'good' : ''}" role="status">${esc(v.notice || why)}</p>
    <div class="actbar"><div class="row">${mp('ready', mine.ready ? 'Ready ✓' : 'Ready', { cls: 'btn' + (mine.ready ? ' armed-ok' : ''), pressed: !!mine.ready, disabled: running })}
      ${host ? mp('start', 'Start tournament', { cls: 'btn primary', disabled: !startable, title: startable ? '' : why }) : ''}
      ${mp('leave', v.armedLeave ? 'Confirm: leave lobby' : 'Leave lobby', { cls: 'btn' + (v.armedLeave ? ' danger' : '') })}</div></div>
    <div class="foot">Five laps per stage · top ${MP.QUALIFIERS} of the qualifier race the final · ${MP.MIN_PLAYERS}–${MP.MAX_PLAYERS} pilots</div>
  </div>`;
}

// ---------- results ----------
function rowsTable(rows, me, extra) {
  return `<div class="tablewrap panel"><table class="res"><tr><th>POS</th><th>PILOT</th><th>SHIP</th><th>TIME</th>${extra ? '<th></th>' : ''}</tr>${rows.map(r => `<tr class="${r.pid === me ? 'me' : ''}">
    <td class="p">${r.status === 'finished' ? r.place : r.place}</td><td>${esc(r.name)}</td><td>${esc(shipName(r.ship))}</td>
    <td class="n">${r.status === 'finished' ? fmtTime(r.time) + (r.adjusted ? ' *' : '') : `<span class="dim">${reasonText(r.reason)} · lap ${Math.max(0, r.lap)}</span>`}</td>${extra ? `<td>${extra(r)}</td>` : ''}</tr>`).join('')}</table></div>`;
}
export function stageResultsHTML(v) {
  const R = v.results, me = v.me, q = R.qualified || [], iq = q.includes(me), inRace = R.rows.some(r => r.pid === me);
  const head = q.length >= MP.QUALIFIERS ? (iq ? 'You qualified for the final' : inRace ? 'Eliminated' : 'Qualifier result') : 'Qualifier over';
  const badge = r => q.includes(r.pid) ? '<span class="badge eq">Qualified</span>' : '<span class="badge lock">Eliminated</span>';
  const next = R.nextAt ? `<p class="lede">The final starts in <b class="mpcount" data-next="${R.nextAt}">${Math.max(0, Math.ceil(v.nextIn))}</b> s. ${iq ? 'Get ready.' : 'You can watch it.'}</p>` : '';
  return `<div class="col mpcol" style="width:min(700px,100%)">
    <div class="kicker">${STAGE_LABEL[1]} · ${esc(R.trackName)} · ${R.laps} laps</div>
    <h2>${head}</h2>
    ${rowsTable(R.rows, me, badge)}
    ${R.rows.some(r => r.adjusted) ? '<p class="lede small">* Timed by the server: that pilot’s game ran behind real time.</p>' : ''}
    ${next}
    ${v.notice ? `<p class="notice" role="status">${esc(v.notice)}</p>` : ''}
    <div class="actbar"><div class="row">${mp('quit', v.armedQuit ? 'Confirm: leave tournament' : 'Leave tournament', { cls: 'btn' + (v.armedQuit ? ' danger' : '') })}</div></div>
  </div>`;
}
const OUTCOME = { raced: '', forfeit: 'The other finalist left the final: the win is by forfeit.', walkover: 'Only one finalist was left: the win is by walkover.', distance: 'Neither finalist finished in time: the pilot who got further wins.', 'no-result': 'No finalist was left, so this tournament has no winner.' };
export function finalHTML(v) {
  const C = v.complete, me = v.me, fin = C.stages.find(s => s.stage === 2), q = C.stages.find(s => s.stage === 1);
  const won = C.winner === me, head = C.winner ? (won ? 'You win the tournament' : `${esc(C.winnerName)} wins the tournament`) : 'Tournament over';
  const rw = v.reward, paid = v.paid;
  const reward = rw ? `<div class="panel rewards"><div class="rw-top"><span>Your tournament reward</span><b class="cr">+${rw.CR.toLocaleString('en-US')} CR${rw.ST ? ` · +${rw.ST} ST` : ''}</b></div>
      ${rw.lines.map(l => `<div class="rw-line"><span>${esc(l.name)}</span><b class="${l.CR ? 'cr' : 'st'}">${l.CR ? '+' + l.CR.toLocaleString('en-US') + ' CR' : ''}${l.CR && l.ST ? ' · ' : ''}${l.ST ? '+' + l.ST + ' ST' : ''}</b></div>`).join('')}
      <div class="rw-bal"><span>${paid === false ? 'Not added' : paid === 'dup' ? 'Already added' : 'Balance'}</span>${walletHTML(v.wallet)}</div>${v.payNote ? `<p class="reason">${esc(v.payNote)}</p>` : ''}</div>`
    : `<div class="panel"><p class="lede small" style="margin:0">${C.stages.length ? 'No reward this time: rewards are paid for races you finish.' : ''}</p></div>`;
  return `<div class="col mpcol center" style="width:min(980px,100%)">
    <div class="row between"><div class="kicker">Online tournament · complete</div>${walletHTML(v.wallet)}</div>
    <h2>${head}</h2>
    ${C.winner ? `<div class="unlockbar ace"><b>Winner: ${esc(C.winnerName)}</b>${C.runnerUpName ? `<span>Second: ${esc(C.runnerUpName)}</span>` : ''}${fin ? `<span>Final on ${esc(fin.trackName)} · 5 laps</span>` : ''}</div>` : ''}
    ${OUTCOME[C.outcome] ? `<p class="lede">${OUTCOME[C.outcome]}</p>` : ''}
    <div class="split2">
      ${fin ? `<div><h3>Stage 2 · Final · ${esc(fin.trackName)}</h3>${rowsTable(fin.rows, me)}</div>` : ''}
      ${q ? `<div><h3>Stage 1 · Qualifier · ${esc(q.trackName)}</h3>${rowsTable(q.rows, me, r => (C.qualified || []).includes(r.pid) ? '<span class="badge eq">Q</span>' : '')}</div>` : ''}
    </div>
    ${reward}
    ${v.notice ? `<p class="notice" role="status">${esc(v.notice)}</p>` : ''}
    <div class="actbar"><div class="row">${v.isHost ? mp('rematch', 'Start another tournament', { cls: 'btn primary', disabled: !v.canRematch, title: v.canRematch ? '' : 'Needs at least two connected pilots in the lobby' }) : ''}${mp('lobby', 'Back to lobby', { cls: v.isHost ? 'btn' : 'btn primary', disabled: !v.inLobby })}${mp('exit', 'Leave multiplayer')}</div></div>
  </div>`;
}

// ---------- problems ----------
export function errorHTML(v) {
  return `<div class="col mpcol center" style="width:min(560px,100%)"><div class="kicker">Online multiplayer</div><h2>${esc(v.title)}</h2>
    <p class="lede">${esc(v.text)}</p>
    <div class="actbar"><div class="row">${v.retry ? mp('retry', 'Try again', { cls: 'btn primary' }) : ''}<button class="btn" data-act="back" data-arg="mp">Back</button></div></div></div>`;
}
// in-race menu: the race keeps running (an online race cannot be paused)
export function raceMenuHTML(v) {
  return `<div class="col center" style="width:min(460px,100%)"><h3>${esc(v.label)}</h3><h2>Online race</h2>
    <p class="lede">The race keeps going while this menu is open.</p>
    <div class="menu">${mp('menu:close', 'Keep racing', { cls: 'btn primary' })}${mp('menu:leave', v.armed ? 'Confirm: leave the tournament' : 'Leave the tournament', { cls: 'btn' + (v.armed ? ' danger' : '') })}</div></div>`;
}
