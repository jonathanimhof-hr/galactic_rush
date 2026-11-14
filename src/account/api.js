// GALACTIC RUSH V12 — the game's side of the account server (/v12/... on the multiplayer server's host, HTTPS), and
// the sign-in session this browser keeps. The session record holds the account's uid, its email address, Firebase's
// refresh token and whether this device already uses the account's career; never a password, never an ID token
// (those live in memory and are renewed from the refresh token). Logging out removes the record.
const timeoutSignal = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined); // older browsers: no timeout rather than no request
const SESSION_KEY = 'galactic-rush.v12.session';
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
export function loadSession(ls = store()) {
  try { const s = JSON.parse(ls.getItem(SESSION_KEY) || 'null'); return s && typeof s.uid === 'string' && typeof s.refreshToken === 'string' ? s : null; } catch (e) { return null; }
}
export function saveSession(s, ls = store()) { try { ls.setItem(SESSION_KEY, JSON.stringify({ uid: s.uid, email: s.email || null, refreshToken: s.refreshToken, linked: !!s.linked, at: Date.now() })); return true; } catch (e) { return false; } }
export function clearSession(ls = store()) { try { ls.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ } }

// the account server's address: the multiplayer server's host over HTTPS (ws -> http, wss -> https)
export function accountServer(mpUrl) {
  if (typeof mpUrl !== 'string' || !/^wss?:\/\//i.test(mpUrl)) return '';
  try { const u = new URL(mpUrl.replace(/^ws/i, 'http')); return u.origin; } catch (e) { return ''; }
}

export class ApiFail extends Error { constructor(code, message, { network = false, status = 0 } = {}) { super(message); this.code = code; this.network = network; this.status = status; } }

export class AccountApi {
  // token(force) -> a valid Firebase ID token (renewed when force is set or it is about to expire)
  constructor({ base, token, fetch = (...a) => globalThis.fetch(...a), timeoutMs = 20000 }) { this.base = base; this.token = token; this.fetch = fetch; this.timeoutMs = timeoutMs; }
  async req(method, path, body, again = true, timeoutMs = this.timeoutMs) {
    const tok = await this.token(false);
    let res, j = null;
    try {
      res = await this.fetch(this.base + path, { method, headers: { authorization: 'Bearer ' + tok, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: timeoutSignal(timeoutMs) });
      j = await res.json().catch(() => null);
    } catch (e) { throw new ApiFail('network', 'The account server cannot be reached.', { network: true }); }
    if (res.status === 401 && again) { await this.token(true); return this.req(method, path, body, false, timeoutMs); }
    if (res.status === 401) throw new ApiFail('auth', (j && j.message) || 'Not signed in.', { status: 401 });
    if (!j) throw new ApiFail('bad-response', `The account server answered with an error (HTTP ${res.status}).`, { network: res.status >= 500, status: res.status });
    if (res.status >= 500 || res.status === 429) throw new ApiFail(j.code || 'unavailable', j.message || 'The account server is busy. Try again shortly.', { network: true, status: res.status });
    return { status: res.status, ...j };
  }
  account() { return this.req('GET', '/v12/account'); }
  start() { return this.req('POST', '/v12/account/start', {}); }
  importCareer(o) { return this.req('POST', '/v12/account/import', o); }
  op(o) { return this.req('POST', '/v12/account/op', o); }
  settings(settings) { return this.req('PUT', '/v12/account/settings', { settings }); }
  name(name) { return this.req('PUT', '/v12/account/name', { name }); }
  raceStart(o) { return this.req('POST', '/v12/race/start', o, true, 70000); } // a sleeping free server takes up to a minute to wake
  raceFinish(o) { return this.req('POST', '/v12/race/finish', o); }
  ghosts() { return this.req('GET', '/v12/ghosts'); }
  ghost(key) { return this.req('GET', '/v12/ghost/' + encodeURIComponent(key)); }
  putGhost(key, g) { return this.req('PUT', '/v12/ghost/' + encodeURIComponent(key), g); }
  async health() { try { const r = await this.fetch(this.base + '/health', { signal: timeoutSignal(this.timeoutMs) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
}
