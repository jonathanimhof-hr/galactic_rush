// GALACTIC RUSH V8 server — configuration from environment variables. Nothing secret is ever sent to the game.
//   PORT              port to listen on (default 8787; hosts like Render and Fly set it)
//   HOST              interface (default 0.0.0.0)
//   TOKEN_SECRET      secret for signing session tokens; required when NODE_ENV=production (32+ random characters)
//   ALLOWED_ORIGINS   comma-separated origins allowed to connect, e.g. https://you.github.io; required in production
//   ELIGIBLE_TRACKS   comma-separated course ids the server may pick (default: all four)
//   MAX_LOBBIES       default 200; MAX_CONNECTIONS default 1000
//   LOG_LEVEL         error | warn | info | debug (default info)
//   GR_TIME_SCALE     TESTING ONLY: lets automated test clients run races faster than real time (default 1)
import { randomBytes } from 'node:crypto';
import { ALL_TRACKS } from './maps.mjs';

const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production', warnings = [];
  const cfg = {
    production,
    port: int(env.PORT, 8787, 0, 65535), host: env.HOST || '0.0.0.0',
    tokenSecret: env.TOKEN_SECRET || '',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    eligibleTracks: list(env.ELIGIBLE_TRACKS).filter(id => ALL_TRACKS.includes(id)),
    maxLobbies: int(env.MAX_LOBBIES, 200, 1, 100000), maxConnections: int(env.MAX_CONNECTIONS, 1000, 1, 1000000),
    logLevel: ['error', 'warn', 'info', 'debug'].includes(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info',
    timeScale: Math.min(16, Math.max(1, Number(env.GR_TIME_SCALE) || 1)),
  };
  if (!cfg.eligibleTracks.length) cfg.eligibleTracks = ALL_TRACKS.slice();
  if (production) {
    if (cfg.tokenSecret.length < 32) throw new Error('TOKEN_SECRET must be set to at least 32 random characters in production');
    if (!cfg.allowedOrigins.length) throw new Error('ALLOWED_ORIGINS must list the website origin(s) in production, e.g. https://you.github.io');
    if (cfg.timeScale !== 1) throw new Error('GR_TIME_SCALE is for automated tests only and must not be set in production');
  } else {
    if (!cfg.tokenSecret) { cfg.tokenSecret = randomBytes(24).toString('hex'); warnings.push('TOKEN_SECRET not set: using a random one, so sessions do not survive a restart'); }
    if (!cfg.allowedOrigins.length) warnings.push('ALLOWED_ORIGINS not set: any website may connect (fine for local testing only)');
    if (cfg.timeScale !== 1) warnings.push(`GR_TIME_SCALE=${cfg.timeScale}: race clocks run ${cfg.timeScale}x for automated tests`);
  }
  return { cfg, warnings };
}
