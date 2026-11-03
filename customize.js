// GALACTIC RUSH V7 — paint jobs: colour helpers and the translation of a saved customisation into what the renderer needs
// (shader uniforms for the hull, exhaust and contrail colours, the livery stripe and race-number band).
import { SHIPS } from '../config.js';
import { ITEM, PATTERN_IDS, PAINT_TYPES, SLOT_DEFAULT, defaultCustom } from './catalog.js';

export const hexToRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
export const rgbToHex = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
// accepts '#rrggbb', 'rrggbb', '#rgb' or 'rgb'; returns '#rrggbb' (lower case) or null
export function normHex(s) {
  const t = String(s || '').trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(t)) return '#' + t;
  if (/^[0-9a-f]{3}$/.test(t)) return '#' + t.split('').map(c => c + c).join('');
  return null;
}
export function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
export function hslToRgb([h, s, l]) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
// hue slider: keep the colour's saturation and lightness (greys get a usable saturation so the slider does something)
export function withHue(hex, hue) { const [, s, l] = rgbToHsl(hexToRgb(hex) || [0.5, 0.5, 0.5]); return rgbToHex(hslToRgb([((+hue % 360) + 360) % 360, s < 0.08 ? 0.6 : s, l < 0.06 ? 0.45 : l > 0.94 ? 0.6 : l])); }
export function withLight(hex, light) { const [h, s] = rgbToHsl(hexToRgb(hex) || [0.5, 0.5, 0.5]); return rgbToHex(hslToRgb([h, s, Math.min(0.97, Math.max(0.03, +light))])); }
export const hueOf = hex => Math.round(rgbToHsl(hexToRgb(hex) || [0, 0, 0])[0]);
export const lightOf = hex => +rgbToHsl(hexToRgb(hex) || [0, 0, 0])[2].toFixed(3);

export const isDefaultCustom = (shipId, c) => { const d = defaultCustom(shipId); return Object.keys(d).every(k => d[k] === c[k]); };
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// Render parameters for a ship's paint job. `custom` is validated data (profile or a garage draft).
// Factory settings give exactly the V6 player livery with custom = null, so a stock ship renders as it always did.
// The hull mesh always keeps the factory colours (paint, modelAccent); custom colours are shader uniforms, so changing
// a colour never builds a new mesh.
export function resolveLivery(shipId, custom) {
  const def = SHIPS.find(s => s.id === shipId) || SHIPS[0], c = { ...defaultCustom(def.id), ...(custom || {}) };
  if (isDefaultCustom(def.id, c)) return { paint: def.color, modelAccent: def.accent, accent: def.accent, stripe: [...mix(def.accent, [1, 1, 1], 0.25), 0.11], number: 1, callsign: '', band: mix(def.accent, [0, 0, 0], 0.15), custom: null, trail: null, factory: true, key: 'factory:' + def.id };
  const prim = hexToRgb(c.primary) || def.color, acc = hexToRgb(c.accent) || def.accent, secRef = hexToRgb(defaultCustom(def.id).secondary), sec = hexToRgb(c.secondary) || secRef;
  const paint = c.paint && ITEM[c.paint] && ITEM[c.paint].slot === 'paint' ? ITEM[c.paint].render : null;
  const pattern = (ITEM[c.pattern] || ITEM[SLOT_DEFAULT.pattern]).render.id, finish = (ITEM[c.finish] || ITEM[SLOT_DEFAULT.finish]).render.id;
  const exItem = ITEM[c.exhaust], trItem = ITEM[c.trail];
  const exhaust = exItem && exItem.render.color ? hexToRgb(exItem.render.color) : null;
  const trail = trItem && trItem.render.color === 'prism' ? 'prism' : trItem && trItem.render.color && trItem.id !== SLOT_DEFAULT.trail ? hexToRgb(trItem.render.color) : null;
  const stripe = pattern === PATTERN_IDS.factory ? [...mix(acc, [1, 1, 1], 0.25), 0.11] : null; // the factory livery's centre line follows the accent
  const p0 = paint ? hexToRgb(paint.c0) : prim, p1 = paint ? hexToRgb(paint.c1) : prim, data = new Float32Array(24);
  [p0, sec, acc, secRef, p1, exhaust || acc, [0, -2.3, 2.3], [0, 0, 0]].forEach((v, i) => data.set(v, i * 3)); // primary, secondary, accent, secondary reference, paint 2nd colour, engine glow, pattern frame and part offset (set per model and part)
  return { paint: def.color, modelAccent: def.accent, accent: exhaust || acc, stripe, number: 1, callsign: '', band: mix(acc, [0, 0, 0], 0.15), decalSlot: 'player:' + def.id,
    custom: { on: 1, pattern, finish, paint: paint ? PAINT_TYPES[paint.type] || 0 : 0, data }, trail, factory: false, key: JSON.stringify(c) };
}
