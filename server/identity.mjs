// GALACTIC RUSH V8 server — pilot identity. The server gives every pilot an id and a signed session token; a game
// presents the token to reconnect as the same pilot. Ids are never chosen by the game, and a token cannot be forged
// without the server's TOKEN_SECRET, so nobody can act as another pilot. Display names are only labels.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { MP } from '../src/mp/protocol.js';

const PID = /^p[0-9a-f]{12}$/;
export const newPid = () => 'p' + randomBytes(6).toString('hex');
export const newId = prefix => prefix + randomBytes(5).toString('hex'); // lowercase: also valid in the game's reward ledger
export function newCode(taken) {
  for (let k = 0; k < 1000; k++) {
    let c = ''; for (let i = 0; i < MP.CODE_LEN; i++) c += MP.CODE_ALPHABET[randomInt(MP.CODE_ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
  throw new Error('no free room code');
}

export function createIdentity(secret, { ttlMs = 24 * 3600 * 1000, now = () => Date.now() } = {}) {
  if (!secret || secret.length < 16) throw new Error('identity: secret must be at least 16 characters');
  const sign = body => createHmac('sha256', secret).update(body).digest('base64url');
  return {
    issue(pid) { const body = `${pid}.${now().toString(36)}`; return `${body}.${sign(body)}`; },
    // returns the pilot id of a valid, unexpired token, otherwise null
    verify(token) {
      if (typeof token !== 'string' || token.length > 200) return null;
      const i = token.lastIndexOf('.'); if (i < 0) return null;
      const body = token.slice(0, i), sig = Buffer.from(token.slice(i + 1)), want = Buffer.from(sign(body));
      if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
      const [pid, ts] = body.split('.'), t = parseInt(ts, 36);
      if (!PID.test(pid) || !Number.isFinite(t) || now() - t > ttlMs || t > now() + 60000) return null;
      return pid;
    },
  };
}
