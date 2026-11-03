// GALACTIC RUSH V8 — the game's connection to the multiplayer server: one WebSocket carrying JSON messages, automatic
// reconnection with back-off after a dropped connection, and a clock synchronised with the server's (start times and
// remote ships are expressed in server time). Uses only the standard WebSocket API, so the same code runs in the
// browser and in the Node test clients.
import { PROTOCOL, S, C, ERRORS } from './protocol.js';

const BACKOFF = [500, 1000, 2000, 3000, 5000];
// close codes after which reconnecting would not help
const FINAL = { 1003: 'unsupported', 1008: 'policy', 4001: 'hello-timeout', 4002: 'replaced' };

export class Connection {
  // url: ws:// or wss:// address; hello(): { name, token, rid } sent on every (re)connect
  constructor({ url, hello, WebSocketImpl = globalThis.WebSocket, now = () => performance.now(), retryForMs = 30000 }) {
    this.url = url; this.helloFn = hello; this.WS = WebSocketImpl; this.now = now; this.retryForMs = retryForMs;
    this.ws = null; this.state = 'idle'; this.handlers = new Map(); this.closing = false; this.attempt = 0; this.lostAt = 0;
    this.offset = 0; this.rtt = 0; this.samples = []; this.pingT = null; this.retryT = null; this.welcome = null; this.reason = null;
  }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return () => this.handlers.get(type).delete(fn); }
  emit(type, data) { const h = this.handlers.get(type); if (h) for (const fn of [...h]) { try { fn(data); } catch (e) { console.error('multiplayer handler failed', type, e); } } }
  setState(st, reason) { if (this.state === st && this.reason === reason) return; this.state = st; this.reason = reason || null; this.emit('conn', { state: st, reason: this.reason, attempt: this.attempt }); }
  get online() { return this.state === 'online'; }
  // server time in ms, estimated from round trips
  serverNow() { return this.now() + this.offset; }
  toLocal(serverMs) { return serverMs - this.offset; }

  connect() { this.closing = false; this.attempt = 0; this.lostAt = 0; this.open(); }
  open() {
    clearTimeout(this.retryT); this.setState(this.attempt ? 'reconnecting' : 'connecting');
    let ws;
    try { ws = new this.WS(this.url); }
    catch (e) { this.setState('failed', 'blocked'); return; } // e.g. a page that may not open network connections
    this.ws = ws;
    ws.onopen = () => { if (this.ws !== ws) return; const h = this.helloFn ? this.helloFn() : {}; this.rawSend({ t: C.HELLO, v: PROTOCOL, ...h }); };
    ws.onmessage = e => { if (this.ws === ws) this.receive(e.data); };
    ws.onclose = e => { if (this.ws === ws) this.dropped(e.code, e.reason); };
    ws.onerror = () => { /* followed by close */ };
  }
  receive(text) {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === S.PONG) { this.pong(m); return; }
    if (m.t === S.WELCOME) {
      this.welcome = m; this.attempt = 0; this.lostAt = 0; this.samples = [];
      this.offset = m.now - this.now(); // rough until the first round trips
      this.setState('online'); this.startPings();
    }
    if (m.t === S.ERROR) m.text = ERRORS[m.code] || m.code;
    this.emit(m.t, m);
  }
  dropped(code, reason) {
    this.ws = null; clearInterval(this.pingT); this.pingT = null;
    if (this.closing) { this.setState('offline'); return; }
    if (FINAL[code]) { this.setState('failed', FINAL[code]); return; }
    const wasOnline = this.welcome != null;
    if (!this.lostAt) this.lostAt = this.now();
    if (!wasOnline && this.attempt === 0) { this.attempt = 1; } // first connection failed: still try a few times
    else this.attempt++;
    if (this.now() - this.lostAt > this.retryForMs) { this.setState('failed', wasOnline ? 'lost' : 'unreachable'); return; }
    this.setState('reconnecting', 'lost');
    this.retryT = setTimeout(() => this.open(), BACKOFF[Math.min(BACKOFF.length - 1, this.attempt - 1)]);
  }
  close(reason = 'leave') {
    this.closing = true; clearTimeout(this.retryT); clearInterval(this.pingT); this.pingT = null;
    const ws = this.ws; this.ws = null;
    if (ws) { try { ws.close(1000, reason); } catch (e) { /* closed */ } }
    this.setState('offline');
  }
  rawSend(m) { const ws = this.ws; if (!ws || ws.readyState !== 1) return false; try { ws.send(JSON.stringify(m)); return true; } catch (e) { return false; } }
  send(type, payload = {}) { return this.state === 'online' ? this.rawSend({ t: type, ...payload }) : false; }

  // ---------- clock ----------
  startPings() {
    clearInterval(this.pingT); let n = 0;
    const ping = () => this.rawSend({ t: C.PING, c: this.now(), rtt: Math.round(this.rtt) });
    ping(); this.pingT = setInterval(() => { n++; ping(); if (n === 5) { clearInterval(this.pingT); this.pingT = setInterval(ping, 2000); } }, 250);
  }
  pong(m) {
    const t1 = this.now(), rtt = t1 - m.c; if (!(rtt >= 0) || rtt > 10000) return;
    this.samples.push({ rtt, off: m.s - (m.c + rtt / 2) }); if (this.samples.length > 12) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3); // the quickest round trips give the best estimate
    this.offset = best.reduce((a, s) => a + s.off, 0) / best.length;
    this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
  }
}
