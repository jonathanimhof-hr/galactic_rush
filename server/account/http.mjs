// GALACTIC RUSH V12 server — the account API the game calls over HTTPS (JSON, under /v12/). Every request carries the
// player's Firebase ID token (Authorization: Bearer ...), which is verified on every call (google.mjs); the account it
// names is the only account the request can read or change. Only accounts whose email address is verified hold a
// career. Requests are rate-limited per address and per account; bodies are size-limited; errors never include
// tokens, keys or internal details.
//   GET  /v12/account               the account's state (and whether it has a career yet)
//   POST /v12/account/start         start a fresh career on the account
//   POST /v12/account/import        make this device's career the account's (validated; replacing needs confirmation)
//   POST /v12/account/op            a career operation (upgrade, purchase, paint job, ship choice, championship start/abandon)
//   PUT  /v12/account/settings      settings that follow the player
//   PUT  /v12/account/name          the pilot name shown online
//   POST /v12/race/start            a ticket for a race that is starting
//   POST /v12/race/finish           the result of a ticket's race
//   GET  /v12/ghosts                which courses have a ghost; GET/PUT /v12/ghost/<course key>
export function createRateLimiter(now = () => Date.now()) {
  const buckets = new Map();
  return {
    // true if allowed: at most `burst` at once, refilled at `perMin` a minute
    take(key, perMin, burst = perMin) {
      const t = now(); let b = buckets.get(key);
      if (!b) { b = { tokens: burst, at: t }; buckets.set(key, b); }
      b.tokens = Math.min(burst, b.tokens + (t - b.at) * perMin / 60000); b.at = t;
      if (buckets.size > 50000) for (const [k, v] of buckets) if (t - v.at > 600000) buckets.delete(k);
      if (b.tokens < 1) return false; b.tokens -= 1; return true;
    },
  };
}
const LIMIT = { ip: [240, 120], uid: [120, 60], import: [4, 3], start: [30, 10], ghost: [30, 20] };
const SMALL = 64 * 1024, LARGE = 1024 * 1024;

export function createAccountApi({ cfg, verify, players, log, now = () => Date.now() }) {
  const rl = createRateLimiter(now);
  const cors = (req, res) => {
    const origin = req.headers.origin || '';
    if (origin && (!cfg.allowedOrigins.length || cfg.allowedOrigins.includes(origin))) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin'); }
    return !origin || !cfg.allowedOrigins.length || cfg.allowedOrigins.includes(origin);
  };
  const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(body)); };
  const tooLarge = () => Object.assign(new Error('Request too large.'), { status: 413, code: 'too-large' });
  const body = (req, max) => new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('JSON expected.'), { status: 415, code: 'bad-request' }));
    if (Number(req.headers['content-length']) > max) { req.resume(); return reject(tooLarge()); }
    // an oversized body is read to its end and dropped (so the refusal reaches the game), up to a hard cap
    let n = 0, over = false; const parts = [];
    req.on('data', c => { n += c.length; if (over) { if (n > 8 * max) req.destroy(); return; } if (n > max) { over = true; parts.length = 0; reject(tooLarge()); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(Object.assign(new Error('invalid JSON'), { status: 400, code: 'bad-request' })); } });
    req.on('error', reject);
  });

  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/v12/')) return false;
    const allowed = cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403, { 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' }); res.end(); return true; }
    if (!allowed) { send(res, 403, { ok: false, code: 'origin', message: 'This website may not use the account server.' }); return true; }
    if (!players) { send(res, 503, { ok: false, code: 'accounts-off', message: 'Accounts are not set up on this server.' }); return true; }
    const ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?'; // the address the host's proxy saw (it appends it last)
    if (!rl.take('ip:' + ip, ...LIMIT.ip)) { send(res, 429, { ok: false, code: 'rate', message: 'Too many requests. Wait a moment and try again.' }, { 'retry-after': '20' }); return true; }
    // who is asking: the verified Firebase account
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    let who; try { if (!m) throw Object.assign(new Error('no token'), { code: 'missing' }); who = await verify(m[1]); }
    catch (e) { log.debug('account token refused', { why: e.code || 'error' }); send(res, e.code === 'certs-unavailable' ? 503 : 401, { ok: false, code: e.code === 'certs-unavailable' ? 'unavailable' : 'auth', message: e.code === 'expired' ? 'Your session expired. Log in again.' : 'Not signed in.' }); return true; }
    if (!rl.take('uid:' + who.uid, ...LIMIT.uid)) { send(res, 429, { ok: false, code: 'rate', message: 'Too many requests. Wait a moment and try again.' }, { 'retry-after': '20' }); return true; }
    const p = url.pathname, uid = who.uid;
    try {
      if (req.method === 'GET' && p === '/v12/account') {
        if (!who.emailVerified) return send(res, 200, { ok: true, verified: false, exists: false }), true;
        const r = await players.load(uid); send(res, 200, { ok: true, verified: true, ...r }); return true;
      }
      if (!who.emailVerified) { send(res, 403, { ok: false, code: 'verify-email', message: 'Verify your email address first: open the link in the email we sent you.' }); return true; }
      let r;
      if (req.method === 'POST' && p === '/v12/account/start') r = await players.start(uid);
      else if (req.method === 'POST' && p === '/v12/account/import') { if (!rl.take('import:' + uid, ...LIMIT.import)) r = { ok: false, code: 'rate', status: 429, message: 'Too many imports. Try again later.' }; else r = await players.importCareer(uid, await body(req, LARGE)); }
      else if (req.method === 'POST' && p === '/v12/account/op') r = await players.op(uid, await body(req, SMALL));
      else if (req.method === 'PUT' && p === '/v12/account/settings') r = await players.putSettings(uid, (await body(req, SMALL)).settings);
      else if (req.method === 'PUT' && p === '/v12/account/name') r = await players.putName(uid, (await body(req, SMALL)).name);
      else if (req.method === 'POST' && p === '/v12/race/start') { if (!rl.take('start:' + uid, ...LIMIT.start)) r = { ok: false, code: 'rate', status: 429, message: 'Too many races started. Wait a moment.' }; else r = await players.raceStart(uid, await body(req, SMALL)); }
      else if (req.method === 'POST' && p === '/v12/race/finish') r = await players.raceFinish(uid, await body(req, SMALL));
      else if (req.method === 'GET' && p === '/v12/ghosts') r = await players.listGhosts(uid);
      else if (p.startsWith('/v12/ghost/') && (req.method === 'GET' || req.method === 'PUT')) {
        const key = decodeURIComponent(p.slice('/v12/ghost/'.length));
        if (req.method === 'GET') r = await players.getGhost(uid, key);
        else if (!rl.take('ghost:' + uid, ...LIMIT.ghost)) r = { ok: false, code: 'rate', status: 429, message: 'Too many ghosts. Try again later.' };
        else r = await players.putGhost(uid, key, await body(req, LARGE));
      }
      else { send(res, 404, { ok: false, code: 'not-found', message: 'Unknown request.' }); return true; }
      const { status, ...out } = r; send(res, status || (r.ok ? 200 : 400), out); return true;
    } catch (e) {
      if (e.status) { send(res, e.status, { ok: false, code: e.code || 'bad-request', message: e.message }); return true; }
      const unavailable = e.code === 'db' || e.code === 'conflict' || /fetch failed|timeout|aborted/i.test(String(e.message));
      log.error('account request failed', { path: p, err: String(e.code || e.name || 'error'), msg: String(e.message).slice(0, 160) });
      send(res, unavailable ? 503 : 500, { ok: false, code: unavailable ? 'unavailable' : 'error', message: unavailable ? 'The account database is not reachable right now. Try again shortly.' : 'Something went wrong on the server.' });
      return true;
    }
  };
}
