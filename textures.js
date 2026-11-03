// Procedural canvas textures: race-number liveries, holographic signs in an invented script, gate numerals,
// cockpit instruments. Everything is drawn at load time; nothing is fetched.
import { makeRng } from '../math.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const css = c => `rgb(${c.map(v => Math.round(Math.min(1, v) * 255)).join(',')})`;

// Livery decal for both hull sides: slanted band, race number, callsign and a small invented sponsor mark
export function liveryDecal(num, callsign, band, ink = [1, 1, 1]) {
  const c = mk(512, 192), g = c.getContext('2d');
  g.fillStyle = css(band); g.beginPath(); g.moveTo(40, 30); g.lineTo(512, 30); g.lineTo(472, 162); g.lineTo(0, 162); g.closePath(); g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 150, 512, 6);
  g.font = `italic 900 118px ${FONT}`; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(10,10,14,0.9)'; g.fillStyle = css(ink);
  const t = String(num).padStart(2, '0'); g.strokeText(t, 26, 98); g.fillText(t, 26, 98);
  g.font = `italic 800 34px ${FONT}`; g.lineWidth = 6; g.strokeText(callsign, 200, 76); g.fillText(callsign, 200, 76);
  // sponsor mark: three chevrons + invented brand
  g.fillStyle = 'rgba(10,10,14,0.85)'; for (let k = 0; k < 3; k++) { const x = 204 + k * 18; g.beginPath(); g.moveTo(x, 106); g.lineTo(x + 12, 118); g.lineTo(x, 130); g.lineTo(x + 6, 130); g.lineTo(x + 18, 118); g.lineTo(x + 6, 106); g.fill(); }
  g.font = `italic 700 24px ${FONT}`; g.fillText('ORVANE DYNAMICS', 266, 120);
  return c;
}

// Invented script: glyphs built from an arc, a stem and a dot hanging from a shared top line
function glyph(g, x, y, s, rng) {
  const k = Math.floor(rng() * 6), w = s * (0.55 + rng() * 0.35);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke();
  g.beginPath();
  if (k === 0) { g.arc(x + w / 2, y + s * 0.45, w * 0.42, Math.PI, 0, true); }
  else if (k === 1) { g.moveTo(x + w * 0.2, y); g.quadraticCurveTo(x + w, y + s * 0.5, x + w * 0.2, y + s * 0.9); }
  else if (k === 2) { g.moveTo(x + w * 0.5, y); g.lineTo(x + w * 0.5, y + s * 0.7); g.arc(x + w * 0.75, y + s * 0.7, w * 0.25, Math.PI, Math.PI * 1.9, true); }
  else if (k === 3) { g.arc(x + w * 0.5, y + s * 0.35, w * 0.35, 0, Math.PI * 2); }
  else if (k === 4) { g.moveTo(x, y + s * 0.2); g.bezierCurveTo(x + w, y + s * 0.2, x, y + s * 0.85, x + w, y + s * 0.85); }
  else { g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.15, y + s * 0.8); g.moveTo(x + w * 0.15, y + s * 0.4); g.lineTo(x + w * 0.85, y + s * 0.6); }
  g.stroke();
  if (rng() < 0.55) { g.beginPath(); g.arc(x + w * (0.3 + rng() * 0.4), y + s * 1.05, s * 0.07, 0, Math.PI * 2); g.fill(); }
  return w + s * 0.18;
}
export const BRANDS = ['VOLTRA', 'KESSIK', 'ORBIQ', 'NAMURE', 'TALVEN', 'ZEPHOS', 'QUORRA', 'HELIX 9', 'ARDENT', 'SOLANE', 'MIRAKO', 'VESPER'];
export function holoSign(seed, color, opts = {}) {
  const vertical = !!opts.vertical, rng = makeRng(seed), c = vertical ? mk(128, 512) : mk(512, 256), g = c.getContext('2d');
  g.strokeStyle = css(color); g.fillStyle = css(color); g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = css(color); g.shadowBlur = 14;
  if (vertical) {
    g.lineWidth = 8; for (let k = 0; k < 5; k++) glyph(g, 30, 26 + k * 96, 66, rng);
    g.lineWidth = 4; g.strokeRect(8, 8, 112, 496);
  } else {
    g.lineWidth = 7; let x = 24; const n = 4 + Math.floor(rng() * 3); for (let k = 0; k < n && x < 470; k++) x += glyph(g, x, 34, 58, rng);
    g.shadowBlur = 10; g.font = `italic 900 70px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText(opts.brand || BRANDS[Math.floor(rng() * BRANDS.length)], 24, 214);
    g.lineWidth = 4; g.strokeRect(10, 12, 492, 232);
  }
  return c;
}
// Gate numeral: big outlined numerals with a scan-line fill
export function gateNumber(text, color) {
  const c = mk(256, 256), g = c.getContext('2d');
  g.font = `italic 900 190px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = css(color); g.shadowBlur = 18; g.lineWidth = 8; g.strokeStyle = css(color); g.strokeText(text, 128, 136);
  g.globalAlpha = 0.55; g.fillStyle = css(color); g.fillText(text, 128, 136); g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out'; for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 256, 2);
  return c;
}
// Start gantry banner and sector boards
export function textPanel(text, color, w = 1024, h = 128) {
  const c = mk(w, h), g = c.getContext('2d');
  g.font = `italic 900 ${Math.round(h * 0.62)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = css(color); g.shadowBlur = 16; g.fillStyle = css(color); g.fillText(text, w / 2, h / 2 + 4);
  return c;
}
// Cockpit instruments, redrawn every frame into the same canvas
export function makeInstruments() {
  const c = mk(512, 192), g = c.getContext('2d');
  return { canvas: c, draw(speed, boost, hull, place, lap, laps, warn) {
    g.clearRect(0, 0, 512, 192); g.fillStyle = 'rgba(4,10,16,0.92)'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = 'rgba(120,220,255,0.35)'; g.lineWidth = 2; g.strokeRect(6, 6, 500, 180);
    g.fillStyle = '#9fe8ff'; g.font = `700 64px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText(String(Math.round(speed)).padStart(3, ' '), 22, 86);
    g.font = `700 18px ${FONT}`; g.fillStyle = 'rgba(160,230,255,0.7)'; g.fillText('KM/H', 30, 112); g.fillText(`POS ${place}`, 380, 46); g.fillText(`LAP ${lap}/${laps}`, 380, 76);
    const bar = (y, v, col, label) => { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(22, y, 330, 16); g.fillStyle = col; g.fillRect(22, y, 330 * Math.max(0, Math.min(1, v)), 16); g.fillStyle = 'rgba(200,240,255,0.75)'; g.fillText(label, 362, y + 15); };
    bar(132, boost, '#3fd0ff', 'BOOST'); bar(158, hull, hull < 0.3 ? '#ff4a3d' : '#5df59a', 'HULL');
    if (warn) { g.fillStyle = '#ff5544'; g.font = `800 26px ${FONT}`; g.fillText(warn, 300, 112); }
  } };
}
// Course map thumbnail (top-down)
export function courseMap(track, w = 320, h = 200, color = '#e9eef7') {
  const c = mk(w, h), g = c.getContext('2d');
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of track.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = Math.min((w - 30) / (maxX - minX), (h - 30) / (maxZ - minZ)), ox = (w - (maxX - minX) * sc) / 2, oz = (h - (maxZ - minZ) * sc) / 2;
  const P = p => [w - (ox + (p.x - minX) * sc), h - (oz + (p.z - minZ) * sc)];
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(130,165,220,0.25)'; g.lineWidth = 8; g.beginPath(); track.pos.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
  g.strokeStyle = color; g.lineWidth = 2.5; g.stroke();
  const [sx, sy] = P(track.pos[0]); g.fillStyle = '#ffb43f'; g.fillRect(sx - 5, sy - 5, 10, 10);
  return c;
}
