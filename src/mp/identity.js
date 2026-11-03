// GALACTIC RUSH V8 — the pilot's online identity on this device: the display name and online ship (kept in this
// browser) and the server's session token (kept for this tab only, so a reload can rejoin the same lobby). The server
// assigns the pilot id and signs the token; the game never invents either. Storage may be unavailable: everything
// still works, it is just not remembered.
import { normalizeName, validShip } from './protocol.js';

const PREFS_KEY = 'galactic-rush.mp', SESSION_KEY = 'galactic-rush.mp.session';
function prefs() { try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
function savePrefs(patch) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs(), ...patch })); } catch (e) { /* storage unavailable */ } }
export const loadName = () => normalizeName(prefs().name) || '';
export const saveName = name => savePrefs({ name });
export const loadShip = () => (validShip(prefs().ship) ? prefs().ship : null);
export const saveShip = ship => savePrefs({ ship });
export function suggestName() { return 'PILOT ' + (100 + Math.floor(Math.random() * 900)); }
export function loadSession(url) {
  try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return v && v.url === url && typeof v.token === 'string' && v.token.length < 200 ? v : null; } catch (e) { return null; }
}
export function saveSession(url, token) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ url, token })); } catch (e) { /* storage unavailable */ } }
export function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ } }
