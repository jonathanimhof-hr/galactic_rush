// GALACTIC RUSH V8 — where the multiplayer server is. The website sets it in config.js
// (window.GALACTIC_RUSH_CONFIG = { multiplayerServer: 'wss://…' }) or the build writes it into a <meta> tag from the
// GR_MP_SERVER environment variable. On a local page (localhost or a file) a developer may also pass ?mp=ws://….
// No secrets live here: the address is public by nature.
export function toWsUrl(raw) {
  if (typeof raw !== 'string') return '';
  let u = raw.trim(); if (!u) return '';
  if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
  if (!/^wss?:\/\//i.test(u)) return '';
  try { const p = new URL(u); if (p.pathname === '/' || p.pathname === '') p.pathname = '/ws'; return p.toString(); } catch (e) { return ''; }
}
// a page served from this computer or the local network (development, LAN play and automated tests), never a public site
export const devPage = (loc = typeof location !== 'undefined' ? location : null) => !!loc && (loc.protocol === 'file:' || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local|)$/i.test(loc.hostname));
export function mpServer(loc = typeof location !== 'undefined' ? location : null, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : {}) {
  let url = '', source = 'none';
  const cfg = win.GALACTIC_RUSH_CONFIG;
  if (cfg && typeof cfg.multiplayerServer === 'string' && cfg.multiplayerServer.trim()) { url = toWsUrl(cfg.multiplayerServer); source = 'config'; }
  if (!url && doc) { const m = doc.querySelector('meta[name="galactic-rush:mp-server"]'); if (m && m.content.trim()) { url = toWsUrl(m.content); source = 'build'; } }
  if (devPage(loc)) { const p = new URLSearchParams(loc.search).get('mp'); if (p) { url = toWsUrl(p); source = 'dev'; } }
  const insecure = !!(url && loc && loc.protocol === 'https:' && url.startsWith('ws://'));
  return { url, source, insecure };
}
