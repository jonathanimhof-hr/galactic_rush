// GALACTIC RUSH V12 — Verdant Canopy's drawn wood against its collision (tests/v12-canopy-audit.mjs on this source):
// no tree of the background forest stands in the corridor (they have no collision, so V12 keeps them out of it), and
// every other piece of wood that reaches into the corridor is solid there, except the vines and the bridges' cords,
// which are passable by design. On V11's source the same audit finds 49 forest trees in the corridor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Verdant Canopy: no forest tree reaches the corridor, all other wood there collides (vines and bridge cords excepted)', () => {
  const tool = fileURLToPath(new URL('./v12-canopy-audit.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tool], { encoding: 'utf8', timeout: 300000 });
  assert.equal(r.status, 0, `audit failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /forest trees reaching the corridor: 0\n/);
  assert.match(r.stdout, /solid-looking wood in the corridor without collision: 0 segments/);
  assert.match(r.stdout, /wood: the obstacles as wood .*reach the corridor/, 'the course\'s solid wood was found and checked');
});
