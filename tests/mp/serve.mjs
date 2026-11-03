// Starts the real multiplayer server for automated browser tests: the race clock runs `scale` times faster
// (GR_TIME_SCALE) and the waits are shorter, so whole tournaments fit in a few minutes. Not for real use.
// usage: node tests/mp/serve.mjs [port=0] [scale=4]   (prints {"port": N} once listening)
import { startServer } from '../../server/index.mjs';
import { RACE_RULES } from '../../server/race.mjs';
import { LOBBY_RULES } from '../../server/lobby.mjs';

const [port = '0', scale = '4'] = process.argv.slice(2);
const srv = startServer({ ...process.env, PORT: port, GR_TIME_SCALE: scale, TOKEN_SECRET: process.env.TOKEN_SECRET || 'browser-test-secret-0123456789abcdef', LOG_LEVEL: process.env.LOG_LEVEL || 'info' }, { hub: {
  raceRules: { ...RACE_RULES, countdownMs: 3000, loadTimeoutMs: 30000, graceMs: 8000, inactiveMs: 60000 }, // a game drawing a screenshot in software can go quiet for a while
  tournamentRules: { transitionMs: 45000 }, // long enough for the browser test's screenshot of the qualifier result
  lobbyRules: { ...LOBBY_RULES, rematchMs: 300000 }, // the browser test takes its time before pressing Start another tournament
} });
srv.ready.then(p => console.log(JSON.stringify({ port: p })), e => { console.error(String(e)); process.exit(1); });
const stop = () => srv.close().then(() => process.exit(0));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
