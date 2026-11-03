// Keyboard and gamepad input, plus save data. Gamepad access is optional: some embedding frames block it.
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyX', 'KeyR', 'KeyF', 'KeyJ', 'KeyK', 'KeyC', 'KeyT', 'KeyP', 'Escape', 'KeyB', 'Tab']);
const dead = (v, d = 0.15) => Math.abs(v) < d ? 0 : Math.sign(v) * ((Math.abs(v) - d) / (1 - d));
const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.6);

export class Input {
  constructor() {
    this.down = new Set(); this.pressed = new Set(); this.ax = { pitch: 0, yaw: 0, roll: 0 }; this.capture = false;
    this.pad = null; this.padPrev = []; this.padPressed = new Set(); this.lastDevice = 'kb'; this.padOK = true;
    addEventListener('keydown', e => {
      this.lastDevice = 'kb';
      const onControl = e.target && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if (this.capture && GAME_KEYS.has(e.code)) e.preventDefault();
      // Enter/Space on a focused control is handled by the control itself (fixes Enter skipping a menu)
      if (!e.repeat && !(onControl && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter'))) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousedown', e => { if (this.capture && e.button === 0 && e.target.tagName === 'CANVAS') this.pressed.add('Mouse0'); });
    addEventListener('gamepadconnected', () => { this.lastDevice = 'pad'; });
  }
  key(...codes) { return codes.some(c => this.down.has(c)); }
  hit(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  padHit(b) { if (this.padPressed.has(b)) { this.padPressed.delete(b); return true; } return false; }
  endFrame() { this.pressed.clear(); this.padPressed.clear(); }
  pollPad() {
    if (!this.padOK) return null;
    let pads; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { this.padOK = false; return null; }
    const p = [...(pads || [])].find(g => g && g.connected && g.mapping === 'standard') || [...(pads || [])].find(g => g && g.connected) || null;
    this.pad = p;
    if (p) {
      p.buttons.forEach((b, i) => { const v = typeof b === 'object' ? b.pressed : b > 0.5; if (v && !this.padPrev[i]) { this.padPressed.add(i); this.lastDevice = 'pad'; } this.padPrev[i] = v; });
      if (p.axes.some(a => Math.abs(a) > 0.5)) this.lastDevice = 'pad';
    }
    return p;
  }
  btn(i) { const p = this.pad; if (!p || !p.buttons[i]) return 0; const b = p.buttons[i]; return typeof b === 'object' ? b.value || (b.pressed ? 1 : 0) : b; }
  rumble(strong, weak, ms) { try { const a = this.pad && this.pad.vibrationActuator; if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch (e) { /* not supported */ } }

  controls(dt, settings) {
    const ramp = (cur, target) => { const r = target === 0 ? 9 : (Math.sign(target) !== Math.sign(cur) && cur !== 0 ? 14 : 6); const d = target - cur, s = r * dt; return Math.abs(d) <= s ? target : cur + Math.sign(d) * s; };
    const inv = settings.invert === 'true' || settings.invert === true ? -1 : 1;
    const tp = ((this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0)) * inv;
    const ty = (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
    const tr = (this.key('KeyE') ? 1 : 0) - (this.key('KeyQ') ? 1 : 0);
    this.ax.pitch = ramp(this.ax.pitch, tp); this.ax.yaw = ramp(this.ax.yaw, ty); this.ax.roll = ramp(this.ax.roll, tr);
    const c = { pitch: this.ax.pitch, yaw: this.ax.yaw, roll: this.ax.roll,
      boost: this.key('Space'), drift: this.key('ShiftLeft', 'ShiftRight'), brake: this.key('KeyX'),
      throttleDelta: (this.key('KeyR') ? 0.8 : 0) - (this.key('KeyF') ? 0.8 : 0),
      fire: this.hit('KeyJ') || this.hit('Mouse0'), shield: this.hit('KeyK'), reset: this.hit('KeyT') };
    const p = this.pad;
    if (p) {
      const k = +(settings.padSens || 1), lx = curve(dead(p.axes[0] || 0)) * k, ly = curve(dead(p.axes[1] || 0)) * k, rx = curve(dead(p.axes[2] || 0));
      if (lx) c.yaw = Math.max(-1, Math.min(1, lx));
      if (ly) c.pitch = Math.max(-1, Math.min(1, -ly * inv));
      if (rx) c.roll = rx;
      c.boost = c.boost || this.btn(0) > 0.5 || this.btn(7) > 0.5; c.brake = c.brake || this.btn(6) > 0.4; c.drift = c.drift || this.btn(4) > 0.5;
      c.throttleDelta += (this.btn(12) ? 0.8 : 0) - (this.btn(13) ? 0.8 : 0);
      c.fire = c.fire || this.padHit(2) || this.padHit(5); c.shield = c.shield || this.padHit(3); c.reset = c.reset || this.padHit(14);
    }
    return c;
  }
}

const KEY = 'galactic-rush.v1';
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { settings: {}, best: {}, ghosts: {}, ...s }; }
  catch (e) { return { settings: {}, best: {}, ghosts: {} }; }
}
export function storeSave(save) { try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; } }
// Merge a pasted save (V1 or V2): keeps the better best lap and ghost per course
export function mergeSave(save, text) {
  const inc = JSON.parse(text); let n = 0;
  for (const [id, b] of Object.entries(inc.best || {})) if (b && isFinite(b.lap) && (!save.best[id] || b.lap < save.best[id].lap)) { save.best[id] = b; n++; }
  for (const [id, g] of Object.entries(inc.ghosts || {})) if (g && Array.isArray(g.f) && g.f.length > 10 && (!save.ghosts[id] || g.lap < save.ghosts[id].lap)) { save.ghosts[id] = g; n++; }
  return n;
}
