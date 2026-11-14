#!/usr/bin/env node
// GALACTIC RUSH V8 multiplayer server — entry point: an HTTP server with a health check and the WebSocket endpoint
// /ws that games connect to. Run from the repository root: `node server/index.mjs` (after `npm install` in server/).
// Configuration: environment variables, see server/config.mjs and the README.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.mjs';
import { createLog } from './log.mjs';
import { createIdentity } from './identity.mjs';
import { Hub } from './hub.mjs';
import { MP, PROTOCOL } from '../src/mp/protocol.js';
// V12: player accounts (Firebase sign-in, Firestore data) on the same server, under /v12/
import { createTokenVerifier, createServiceAuth, parseServiceAccount } from './account/google.mjs';
import { FirestoreDb, MemoryDb } from './account/firestore.mjs';
import { PlayerService } from './account/players.mjs';
import { createAccountApi } from './account/http.mjs';
import { readFile } from 'node:fs/promises';

export const VERSION = '12.0.0'; // V12: player accounts; Pelagos and Orbital Nexus obstacles (protocol 4)

// V12: the account services from the configuration (opts.accounts lets tests supply their own stand-ins)
function createAccounts(cfg, log, o = {}) {
  if (o.players && o.verify) return o;
  if (!cfg.firebaseProject) return null;
  const projectId = cfg.firebaseProject, verify = o.verify || createTokenVerifier({ projectId, emulator: !!cfg.authEmulator, ...(o.certsUrl ? { certsUrl: o.certsUrl } : {}), ...(o.fetch ? { fetch: o.fetch } : {}) });
  let db = o.db;
  if (!db && cfg.accountsDb === 'memory') db = new MemoryDb();
  if (!db && cfg.firestoreEmulator) db = new FirestoreDb({ projectId, emulator: cfg.firestoreEmulator });
  if (!db) {
    const credentials = parseServiceAccount(cfg.serviceAccount);
    if (!credentials) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set: accounts need it to reach the database');
    if (credentials.projectId !== projectId) log.warn('the service account belongs to another project than FIREBASE_PROJECT_ID', { project: projectId });
    db = new FirestoreDb({ projectId, accessToken: createServiceAuth({ credentials, ...(o.oauthUrl ? { tokenUrl: o.oauthUrl } : {}), ...(o.fetch ? { fetch: o.fetch } : {}) }), ...(o.firestoreUrl ? { baseUrl: o.firestoreUrl } : {}), ...(o.fetch ? { fetch: o.fetch } : {}) });
  }
  return { verify, players: new PlayerService({ db, log }), db: cfg.accountsDb === 'memory' ? 'memory' : cfg.firestoreEmulator ? 'emulator' : 'firestore' };
}

export function startServer(env = process.env, opts = {}) {
  const { cfg, warnings } = loadConfig(env);
  const log = opts.log || createLog(cfg.logLevel);
  for (const w of warnings) log.warn(w);
  const accounts = createAccounts(cfg, log, opts.accounts);
  const hub = new Hub({ cfg, identity: createIdentity(cfg.tokenSecret), log, accounts, ...(opts.hub || {}) });
  const accountApi = createAccountApi({ cfg, verify: accounts && accounts.verify, players: accounts && accounts.players, log });
  const started = Date.now();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, name: 'galactic-rush-multiplayer', version: VERSION, protocol: PROTOCOL, uptimeS: Math.round((Date.now() - started) / 1000), ...hub.status(), timeScale: cfg.timeScale, accounts: accounts ? accounts.db || 'on' : 'off' }));
      return;
    }
    if (url.pathname.startsWith('/v12/')) { accountApi(req, res, url).catch(e => { log.error('account api', { err: String(e && e.message) }); try { res.writeHead(500); res.end(); } catch (e2) { /* sent */ } }); return; }
    // V12: a test deployment may serve the game itself (GR_SERVE_SITE=1: dist/site, built with GR_MP_SERVER=same-origin)
    if (cfg.serveSite && req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/config.js')) {
      const f = url.pathname === '/config.js' ? 'config.js' : 'index.html';
      readFile(new URL(`../dist/site/${f}`, import.meta.url)).then(b => { res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' }); res.end(b); },
        () => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('site not built (node build.mjs)\n'); });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Galactic Rush multiplayer server. Games connect to /ws; status at /health.\n'); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found\n');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MP.MAX_MSG_BYTES, perMessageDeflate: false });
  const reject = (socket, code, text) => { try { socket.write(`HTTP/1.1 ${code} ${text}\r\nconnection: close\r\n\r\n`); } catch (e) { /* gone */ } socket.destroy(); };
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost'), origin = req.headers.origin || '';
    if (url.pathname !== '/ws') return reject(socket, 404, 'Not Found');
    if (cfg.allowedOrigins.length && !cfg.allowedOrigins.includes(origin)) { log.warn('origin refused', { origin }); return reject(socket, 403, 'Forbidden'); }
    if (hub.conns.size >= cfg.maxConnections) return reject(socket, 503, 'Service Unavailable');
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    const sock = {
      send(text, droppable) { if (ws.readyState !== 1) return; if (droppable && ws.bufferedAmount > 256 * 1024) return; hub.stats.bytesOut += text.length; ws.send(text); }, // a slow link skips ship states rather than queueing them
      close(code, reason) { try { ws.close(code, reason); } catch (e) { ws.terminate(); } },
    };
    const h = hub.connect(sock, { ip: req.socket.remoteAddress });
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; if (ws.pingAt) { h.rtt(Date.now() - ws.pingAt); ws.pingAt = 0; } });
    ws.on('message', (data, isBinary) => { if (isBinary) { ws.close(1003, 'text only'); return; } hub.stats.bytesIn += data.length; h.message(data.toString('utf8')); });
    ws.on('close', () => h.close());
    ws.on('error', e => log.debug('socket error', { err: String(e && e.message) }));
  });
  const timers = [
    setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; } }, 15000), // a socket that answered no ping for 15 s is dead
    setInterval(() => { const t = Date.now(); for (const ws of wss.clients) { ws.pingAt = t; try { ws.ping(); } catch (e) { /* closed */ } } }, 2000), // round trips for finish timing
    setInterval(() => { try { hub.tick(); } catch (e) { log.error('tick failed', { err: String(e && e.stack || e) }); } }, 1000 / MP.SNAP_HZ),
    setInterval(() => { try { hub.housekeeping(); } catch (e) { log.error('housekeeping failed', { err: String(e && e.stack || e) }); } }, 1000),
  ];
  const ready = new Promise((resolve, rejectP) => { server.once('error', rejectP); server.listen(cfg.port, cfg.host, () => { const a = server.address(); log.info('listening', { port: a.port, host: cfg.host, origins: cfg.allowedOrigins.length ? cfg.allowedOrigins : 'any', tracks: cfg.eligibleTracks }); resolve(a.port); }); });
  const close = (reason = 'server restarting') => new Promise(resolve => {
    for (const t of timers) clearInterval(t);
    hub.shutdown(reason);
    for (const ws of wss.clients) ws.terminate();
    wss.close(); server.close(() => resolve()); setTimeout(resolve, 1000).unref();
  });
  return { server, wss, hub, cfg, ready, close, accounts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let srv;
  try { srv = startServer(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
  srv.ready.catch(e => { console.error('cannot listen:', String(e.message || e)); process.exit(1); });
  const stop = sig => { srv.close('server restarting').then(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); void sig; };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
}
