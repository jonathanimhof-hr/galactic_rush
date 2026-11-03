// Minimal structured logging: one JSON line per event on stdout (errors on stderr).
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
export function createLog(level = 'info') {
  const max = LEVELS[level] ?? 2;
  const out = (lv, msg, data) => {
    if (LEVELS[lv] > max) return;
    const line = JSON.stringify({ t: new Date().toISOString(), lv, msg, ...(data || {}) });
    (lv === 'error' ? process.stderr : process.stdout).write(line + '\n');
  };
  return { error: (m, d) => out('error', m, d), warn: (m, d) => out('warn', m, d), info: (m, d) => out('info', m, d), debug: (m, d) => out('debug', m, d) };
}
export const silentLog = { error() {}, warn() {}, info() {}, debug() {} };
