// In-race HUD: animated readouts, standings, world-space rival markers, ion lock reticle,
// incoming-bolt warning, damage-direction arcs and the minimap.
import { fmt } from './ui.js';
import { Vec3 } from './math.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tmp = new Vec3();

export class HUD {
  constructor() {
    this.el = $('hud'); this.cache = {}; this.spd = 0; this.mkEl = $('markers'); this.mk = new Map();
    this.ret = $('reticle'); this.bolt = $('warnBolt'); this.dmgEls = [...document.querySelectorAll('#dmg i')]; this.dmgT = this.dmgEls.map(() => 0);
    this.dmgEls.forEach((e, k) => { e.style.transform = `rotate(${k * 45}deg) translateY(-118px)`; });
    this.mm = $('minimap').getContext('2d'); this.lastPlace = 0;
  }
  show(on) { this.el.hidden = !on; this.mkEl.hidden = !on; if (!on) { this.ret.hidden = true; for (const e of this.mk.values()) e.hidden = true; } }
  set(id, prop, val) {
    const k = id + prop; if (this.cache[k] === val) return; this.cache[k] = val; const el = $(id); if (!el) return;
    if (prop === 'text') el.textContent = val; else if (prop === 'w') el.style.width = val; else if (prop === 'cls') el.className = val; else if (prop === 'html') el.innerHTML = val; else if (prop === 'hidden') el.hidden = val;
  }
  update(dt, race, r, ghostDelta) {
    const s = r.ship, d = s.def, n = race.racers.length, sp = s.vel.len() * 3.6;
    this.spd += (sp - this.spd) * Math.min(1, dt * 14);
    this.set('hSpd', 'text', String(Math.round(this.spd)));
    this.set('hPos', 'text', String(r.place)); this.set('hPosOf', 'text', '/' + n);
    if (this.lastPlace && r.place !== this.lastPlace) { const el = $('hPos'); el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(r.place < this.lastPlace ? 'up' : 'down'); }
    this.lastPlace = r.place;
    this.set('hLap', 'text', `${Math.max(1, Math.min(race.laps, r.lap))}/${race.laps}`);
    this.set('hTime', 'text', race.time > 0 ? fmt(race.time) : '0:00.00');
    this.set('hCur', 'text', r.lap > 0 && !r.finished ? fmt(race.time - r.lapStart) : '--:--.--');
    this.set('hBest', 'text', fmt(r.bestLap));
    this.set('hThr', 'w', Math.round(s.throttle * 100) + '%');
    this.set('hBoost', 'w', Math.round((s.boost / d.boostCap) * 100) + '%'); this.set('hBoostBar', 'cls', 'boost' + (s.boosting || s.padTimer > 0 ? ' on' : ''));
    const hp = Math.max(0, s.hull / d.hull); this.set('hHull', 'w', Math.round(hp * 100) + '%'); this.set('hHullBar', 'cls', 'hull' + (hp < 0.3 ? ' low' : ''));
    this.set('hAmmo', 'text', String(r.ammo)); this.set('hShield', 'text', s.shield > 0 ? 'ON' : String(r.shieldCharges));
    this.set('hGhostRow', 'hidden', ghostDelta == null); if (ghostDelta != null) this.set('hGhost', 'text', (ghostDelta > 0 ? '+' : '−') + Math.abs(ghostDelta).toFixed(2));
    if (n > 1) {
      const lead = race.order[0];
      this.set('hStand', 'html', race.order.map(o => `<li class="${o.isPlayer ? 'me' : ''}"><b>${o.place}</b>${esc(o.name)}<em>${o === lead ? (o.finished ? 'FIN' : 'L' + Math.max(1, o.lap)) : o.finished ? '+' + (o.finishTime - lead.finishTime).toFixed(1) : '+' + Math.max(0, (lead.prog - o.prog) / Math.max(60, lead.ship.vel.len())).toFixed(1)}</em></li>`).join(''));
    } else this.set('hStand', 'html', '');
    for (let k = 0; k < this.dmgT.length; k++) if (this.dmgT[k] > 0) { this.dmgT[k] -= dt; if (this.dmgT[k] <= 0) this.dmgEls[k].style.opacity = 0; }
  }
  // world-space markers above rivals; project: (Vec3) => {x, y, behind}
  markers(race, me, project, ghost) {
    const seen = new Set(), boxes = [];
    const place = (key, pos, html, cls) => {
      let el = this.mk.get(key); if (!el) { el = document.createElement('div'); el.className = 'mk'; this.mkEl.appendChild(el); this.mk.set(key, el); }
      const p = project(tmp.copy(pos)); seen.add(key);
      if (!p || p.behind || p.x < -40 || p.y < -40 || p.x > innerWidth + 40 || p.y > innerHeight + 40) { el.hidden = true; return; }
      // nearer rivals keep their spot; a label that would overlap one already placed stacks above it
      let y = p.y; for (let k = 0; k < 5; k++) { const hit = boxes.find(b => Math.abs(b.x - p.x) < 96 && Math.abs(b.y - y) < 38); if (!hit) break; y = hit.y - 38; }
      boxes.push({ x: p.x, y });
      el.hidden = false; if (el._h !== html) { el.innerHTML = html; el._h = html; } if (el._c !== cls) { el.className = 'mk ' + cls; el._c = cls; }
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    };
    const near = [];
    for (const r of race.racers) { if (r === me || r.wrecked) continue; const d = r.ship.pos.dist(me.ship.pos); if (d <= 650 && d >= 6) near.push({ r, d }); }
    near.sort((a, b) => a.d - b.d);
    for (const { r } of near) {
      const gap = (me.prog - r.prog) / Math.max(60, me.ship.vel.len());
      place(r.id, r.ship.pos.clone().add(new Vec3(0, 3.2, 0)), `${esc(r.name)}<em>${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)}s</em>`, '');
    }
    if (ghost) place('ghost', ghost.clone().add(new Vec3(0, 3, 0)), 'GHOST', 'ghost');
    for (const [k, el] of this.mk) if (!seen.has(k)) el.hidden = true;
  }
  reticle(p, locked) {
    if (!p || p.behind) { this.ret.hidden = true; return; }
    this.ret.hidden = false; this.ret.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; this.ret.classList.toggle('locked', !!locked);
  }
  warnBolt(on) { if (this.bolt.hidden === !on) return; this.bolt.hidden = !on; }
  // angle: radians clockwise from screen-up
  damage(angle) { let k = Math.round(((angle * 180 / Math.PI) % 360 + 360) % 360 / 45) % 8; this.dmgEls[k].style.transition = 'none'; this.dmgEls[k].style.opacity = 1; void this.dmgEls[k].offsetWidth; this.dmgEls[k].style.transition = ''; this.dmgT[k] = 0.7; }

  setupMinimap(track) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of track.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const W = 240, pad = 22, sc = (W - 2 * pad) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + ((W - 2 * pad) - (maxX - minX) * sc) / 2 - minX * sc, oz = pad + ((W - 2 * pad) - (maxZ - minZ) * sc) / 2 - minZ * sc;
    const P = p => [W - (p.x * sc + ox), W - (p.z * sc + oz)]; this.mmP = P;
    const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
    g.fillStyle = 'rgba(7,11,19,0.62)'; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(160,210,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.stroke();
    g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = 'rgba(160,210,255,0.16)'; g.beginPath();
    track.pos.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(232,241,250,0.8)'; g.stroke();
    track.cpIdx.forEach((i, k) => { const [x, y] = P(track.pos[i]); g.fillStyle = k ? 'rgba(111,216,255,0.8)' : '#fff'; g.fillRect(x - (k ? 2 : 4), y - (k ? 2 : 4), k ? 4 : 8, k ? 4 : 8); });
    this.mmBase = c;
  }
  drawMinimap(race, ghostPos) {
    const g = this.mm; if (!this.mmBase) return;
    g.clearRect(0, 0, 240, 240); g.drawImage(this.mmBase, 0, 0);
    const dot = (p, col, r) => { const [x, y] = this.mmP(p); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    if (ghostPos) dot(ghostPos, 'rgba(111,216,255,0.75)', 4);
    for (const r of race.racers) if (!r.isPlayer) dot(r.ship.pos, r.paintCss || '#ccc', 4);
    if (race.player) { dot(race.player.ship.pos, '#000', 7); dot(race.player.ship.pos, '#ffb547', 5); }
  }
}
