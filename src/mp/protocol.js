// GALACTIC RUSH V8 — online multiplayer protocol, shared by the game (src/mp) and the server (server/).
// Every message is a JSON object { t: type, ...fields }. Ship states travel as compact arrays (packState / unpackState).
// This file has no browser or Node dependencies so both sides validate messages with the same rules.

export const PROTOCOL = 1;
export const MP = Object.freeze({
  MAX_PLAYERS: 6,          // the starting grid has six slots
  MIN_PLAYERS: 2,
  LAPS: 5,                 // both stages are five-lap races
  QUALIFIERS: 2,           // the top two of the qualifier race the final
  NAME_MIN: 2, NAME_MAX: 16,
  CODE_LEN: 5, CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // no I, L, O, 0 or 1
  MAX_MSG_BYTES: 4096,
  STATE_HZ: 20,            // each racer sends its ship state 20 times a second
  SNAP_HZ: 20,             // the server relays everyone's latest state 20 times a second
  FINISH_WINDOW_S: 45,     // after the first pilot finishes, the others have this many race seconds to finish,
  FINISH_WINDOW_FRAC: 0.25, // or a quarter of the winner's time if that is longer
});
export const SHIP_IDS = Object.freeze(['kestrel', 'wisp', 'lancer', 'halberd', 'corsair']);
export const HANDLINGS = Object.freeze(['relaxed', 'classic']);
export const VISIBILITY = Object.freeze(['private', 'public']);
export const FLAG = Object.freeze({ BOOST: 1, PAD: 2, DRIFT: 4, SHIELD: 8, STUN: 16, WRECK: 32, INVULN: 64, FINISHED: 128 });

// client -> server
export const C = Object.freeze({
  HELLO: 'hello', CREATE: 'create', JOIN: 'join', LEAVE: 'leave', LIST: 'list', SHIP: 'ship', PAINT: 'paint', READY: 'ready',
  SETTINGS: 'settings', START: 'start', LOADED: 'loaded', STATE: 'st', FINISH: 'finish', PING: 'ping', SPECTATE: 'spectate',
});
// server -> client
export const S = Object.freeze({
  WELCOME: 'welcome', ERROR: 'error', LOBBY: 'lobby', LOBBIES: 'lobbies', LEFT: 'left', PREPARE: 'prepare', START: 'start',
  SNAP: 'snap', FINISHED: 'fin', STATUS: 'pstat', RESULTS: 'results', COMPLETE: 'complete', PONG: 'pong', NOTICE: 'notice',
});

// error codes the server sends, with the text the game shows
export const ERRORS = Object.freeze({
  'bad-msg': 'The server could not read a message from this game. Reload the page.',
  'version': 'The server runs a different version of Galactic Rush. Reload the page to update.',
  'hello-first': 'Not signed in to the server yet.',
  'bad-name': `Choose a pilot name of ${MP.NAME_MIN}–${MP.NAME_MAX} letters or numbers.`,
  'bad-code': `Room codes are ${MP.CODE_LEN} letters and numbers, for example K7QX2.`,
  'no-room': 'There is no lobby with that code. Check the code with your host.',
  'full': `That lobby is full (${MP.MAX_PLAYERS} pilots).`,
  'in-progress': 'That lobby is racing a tournament right now. Try again when it is over.',
  'in-lobby': 'You are already in a lobby. Leave it first.',
  'not-in-lobby': 'You are not in a lobby.',
  'not-host': 'Only the host can do that.',
  'too-few': `A tournament needs at least ${MP.MIN_PLAYERS} connected pilots.`,
  'not-ready': 'Every pilot has to be ready before the host can start.',
  'running': 'A tournament is already running in this lobby.',
  'bad-ship': 'Unknown ship.',
  'bad-paint': 'That paint job could not be used.',
  'bad-setting': 'Unknown lobby setting.',
  'server-full': 'The server is full right now. Try again in a few minutes.',
  'rate': 'Too many messages; slow down.',
  'not-racing': 'That race is not running.',
  'session': 'Your session expired. Join the lobby again.',
});

const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Pilot names: letters, numbers, spaces and . _ ' -, shown in capitals like the game's own pilots.
export function normalizeName(s) {
  if (typeof s !== 'string' || s.length > 64) return null;
  const n = s.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
  if (n.length < MP.NAME_MIN || n.length > MP.NAME_MAX) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(n)) return null;
  return n;
}
// Room codes: case and spaces/dashes are ignored when typed.
export function normalizeCode(s) {
  if (typeof s !== 'string' || s.length > 16) return null;
  const c = s.toUpperCase().replace(/[\s-]/g, '');
  return c.length === MP.CODE_LEN && [...c].every(ch => MP.CODE_ALPHABET.includes(ch)) ? c : null;
}
export const validShip = s => SHIP_IDS.includes(s);

// ---------- ship state ----------
// [t, px, py, pz, qx, qy, qz, qw, vx, vy, vz, boost 0..1, flags, lap, cp (next checkpoint), prog (m), yaw rate, hull 0..1, throttle 0..1]
export const STATE_LEN = 19;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 10000) / 10000;
export function packState(o) {
  return [r3(o.t), r2(o.p[0]), r2(o.p[1]), r2(o.p[2]), r4(o.q[0]), r4(o.q[1]), r4(o.q[2]), r4(o.q[3]), r1(o.v[0]), r1(o.v[1]), r1(o.v[2]),
    r2(clamp(o.b, 0, 1)), o.f | 0, o.lap | 0, o.cp | 0, r1(o.prog), r2(o.ay), r2(clamp(o.hull, 0, 1)), r2(clamp(o.thr, 0, 1))];
}
// Returns a clean state object, or null when anything is missing, not a finite number or out of range.
export function unpackState(a) {
  if (!Array.isArray(a) || a.length !== STATE_LEN || !a.every(finite)) return null;
  const [t, px, py, pz, qx, qy, qz, qw, vx, vy, vz, b, f, lap, cp, prog, ay, hull, thr] = a;
  if (t < 0 || t > 7200 || Math.abs(px) > 1e5 || Math.abs(py) > 1e5 || Math.abs(pz) > 1e5) return null;
  const qn = Math.hypot(qx, qy, qz, qw); if (qn < 0.95 || qn > 1.05) return null;
  if (Math.hypot(vx, vy, vz) > 2000 || b < 0 || b > 1 || f < 0 || f > 255 || !Number.isInteger(f)) return null;
  if (!Number.isInteger(lap) || lap < 0 || lap > 99 || !Number.isInteger(cp) || cp < 0 || cp > 10000) return null;
  if (Math.abs(prog) > 1e6 || Math.abs(ay) > 50 || hull < 0 || hull > 1 || thr < 0 || thr > 1) return null;
  return { t, p: [px, py, pz], q: [qx / qn, qy / qn, qz / qn, qw / qn], v: [vx, vy, vz], b, f, lap, cp, prog, ay, hull, thr };
}

// ---------- message shapes (both directions are checked with these) ----------
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 64) => typeof v === 'string' && v.length <= max;
// Parses one incoming text frame: returns { msg } or { error: code }.
export function parseMessage(text) {
  if (typeof text !== 'string' || text.length > MP.MAX_MSG_BYTES) return { error: 'bad-msg' };
  let m; try { m = JSON.parse(text); } catch (e) { return { error: 'bad-msg' }; }
  if (!isObj(m) || !str(m.t, 16)) return { error: 'bad-msg' };
  return { msg: m };
}
// Field checks for client messages; the server rejects anything that does not match.
export function checkClientMessage(m) {
  switch (m.t) {
    case C.HELLO: return m.v === PROTOCOL && (m.token == null || str(m.token, 200)) && (m.rid == null || str(m.rid, 40)) && str(m.name, 64);
    case C.CREATE: return (m.visibility == null || VISIBILITY.includes(m.visibility)) && (m.handling == null || HANDLINGS.includes(m.handling)) && validShip(m.ship) && (m.paint == null || isObj(m.paint)) && (m.name == null || str(m.name, 64));
    case C.JOIN: return str(m.code, 16) && validShip(m.ship) && (m.paint == null || isObj(m.paint)) && (m.name == null || str(m.name, 64));
    case C.LEAVE: case C.LIST: return true;
    case C.SHIP: return validShip(m.ship) && (m.paint == null || isObj(m.paint));
    case C.PAINT: return isObj(m.paint);
    case C.READY: return typeof m.ready === 'boolean';
    case C.SETTINGS: return (m.handling == null || HANDLINGS.includes(m.handling)) && (m.visibility == null || VISIBILITY.includes(m.visibility));
    case C.START: return m.rematch == null || typeof m.rematch === 'boolean';
    case C.LOADED: case C.SPECTATE: return str(m.rid, 40) && (m.ok == null || typeof m.ok === 'boolean');
    case C.STATE: return str(m.rid, 40) && Array.isArray(m.s) && m.s.length === STATE_LEN;
    case C.FINISH: return str(m.rid, 40) && finite(m.time) && (m.laps == null || (Array.isArray(m.laps) && m.laps.length <= 20 && m.laps.every(finite)));
    case C.PING: return finite(m.c) && (m.rtt == null || finite(m.rtt));
    default: return false;
  }
}

// Formatting shared by screens and server logs: 1:23.45
export function fmtTime(t) {
  if (t == null || !Number.isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
