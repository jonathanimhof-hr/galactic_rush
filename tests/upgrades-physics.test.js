// V7: every upgrade category changes the real flight model by a measurable amount (measured here by flying the actual
// physics in src/sim/flight.js and race.js), the effect is deterministic, and upgraded ships keep their character.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShipState, stepFlight, shipAxes } from '../src/sim/flight.js';
import { Race } from '../src/sim/race.js';
import { getTrack } from '../src/sim/tracks.js';
import { SHIPS, SIM_DT } from '../src/config.js';
import { effectiveDef } from '../src/progress/upgrades.js';
import { Vec3 } from '../src/math.js';

const NO = { pitch: 0, yaw: 0, roll: 0 }, env = { up: new Vec3(0, 1, 0) };
const ship = id => SHIPS.find(s => s.id === id);
const maxed = (id, cats) => effectiveDef(ship(id), Object.fromEntries(cats.map(c => [c, 5])));
const fly = (def, ctrl, secs, setup) => { const s = createShipState(def); if (setup) setup(s); for (let k = 0; k < secs / SIM_DT; k++) stepFlight(s, ctrl, SIM_DT, env); return s; };
const timeTo = (def, v) => { const s = createShipState(def); let t = 0; while (s.vel.len() < v && t < 30) { stepFlight(s, NO, SIM_DT, env); t += SIM_DT; } return t; };
const results = [];
const report = (cat, what, base, up) => { results.push(`${cat.padEnd(10)} ${what.padEnd(38)} stock ${base.toFixed(2).padStart(8)}  level 5 ${up.toFixed(2).padStart(8)}  (${up > base ? '+' : ''}${((up / base - 1) * 100).toFixed(1)}%)`); };

test('Engine: higher top speed in flight', () => {
  const b = ship('kestrel'), u = maxed('kestrel', ['engine']);
  const vb = fly(b, NO, 8).vel.len(), vu = fly(u, NO, 8).vel.len(); report('engine', 'top speed reached, m/s', vb, vu);
  assert.ok(vu > vb * 1.045 && vu < vb * 1.055, `${vb} -> ${vu}`);
  const lv1 = fly(effectiveDef(b, { engine: 1 }), NO, 8).vel.len(); assert.ok(lv1 > vb * 1.01, 'level 1 is already measurable');
});
test('Acceleration: reaches speed sooner', () => {
  const b = ship('halberd'), u = maxed('halberd', ['accel']);
  const tb = timeTo(b, 150), tu = timeTo(u, 150); report('accel', 'time from 0 to 150 m/s, s', tb, tu); assert.ok(tu < tb * 0.9, `${tb} -> ${tu}`);
});
test('Handling: turns faster and grips harder', () => {
  const b = ship('lancer'), u = maxed('lancer', ['handling']), heading = d => { const s = fly(d, { ...NO, yaw: 1 }, 0.6, s => s.vel.set(0, 0, 150)); const f = new Vec3(), up = new Vec3(); shipAxes(s.quat, f, up); return Math.acos(Math.max(-1, Math.min(1, f.z))); };
  const hb = heading(b), hu = heading(u); report('handling', 'heading change in 0.6 s full yaw, rad', hb, hu); assert.ok(hu > hb * 1.05, `${hb} -> ${hu}`);
  const slide = d => { const s = createShipState(d); s.vel.set(30, 0, 150); for (let k = 0; k < 0.25 / SIM_DT; k++) stepFlight(s, NO, SIM_DT, env); return Math.abs(s.vel.x); }; // grip bleeds sideways speed
  const sb = slide(b), su = slide(u); report('handling', 'sideways speed left after 0.25 s, m/s', sb, su); assert.ok(su < sb * 0.97, `more grip: less slide (${sb} -> ${su})`);
});
test('Boost: longer boost, faster recharge, more boost speed', () => {
  const b = ship('kestrel'), u = maxed('kestrel', ['boost']);
  const dur = d => { const s = createShipState(d); s.vel.set(0, 0, d.maxSpeed); let t = 0; while (s.boost > 0.5 && t < 30) { stepFlight(s, { ...NO, boost: true }, SIM_DT, env); t += SIM_DT; } return t; };
  const db = dur(b), du = dur(u); report('boost', 'boost duration from full, s', db, du); assert.ok(du > db * 1.12, `${db} -> ${du}`);
  const regen = d => { const s = createShipState(d); s.boost = 0; s.boostCD = 0; for (let k = 0; k < 3 / SIM_DT; k++) stepFlight(s, NO, SIM_DT, env); return s.boost; };
  const rb = regen(b), ru = regen(u); report('boost', 'energy recharged in 3 s', rb, ru); assert.ok(ru > rb * 1.15);
  const top = d => fly(d, { ...NO, boost: true }, 2.5, s => s.vel.set(0, 0, d.maxSpeed)).vel.len(); const tb = top(b), tu = top(u); report('boost', 'speed after 2.5 s of boost, m/s', tb, tu); assert.ok(tu > tb);
});
test('Stability: more hull, less damage and less knock-back in collisions', () => {
  const b = ship('wisp'), u = maxed('wisp', ['stability']);
  const wall = d => { const r = new Race({ track: getTrack('foundry'), laps: 1, countdown: 0, racers: [{ name: 'P', shipId: 'wisp', isPlayer: true, def: d }] }), p = r.player, s = p.ship, B = r.track.bin[p.ti];
    s.vel.copy(B).scale(90); r.wallHit(p, B, 0.5, 1); return 1 - s.hull / s.def.hull; };
  const wb = wall(b), wu = wall(u); report('stability', 'hull fraction lost to one wall hit', wb, wu); assert.ok(wu < wb * 0.85, `${wb} -> ${wu}`);
  const bump = d => { const r = new Race({ track: getTrack('foundry'), laps: 1, countdown: 0, racers: [{ name: 'P', shipId: 'wisp', isPlayer: true, def: d }, { name: 'AI', shipId: 'halberd', skill: 0.8 }] });
    const a = r.racers[0].ship, o = r.racers[1].ship; a.pos.set(0, 0, 0); o.pos.set(4, 0, 0); a.vel.set(30, 0, 0); o.vel.set(-30, 0, 0); r.shipCollisions(); return Math.abs(a.vel.x - 30); };
  const kb = bump(b), ku = bump(u); report('stability', 'speed change in a head-on bump, m/s', kb, ku); assert.ok(ku < kb, `${kb} -> ${ku}`);
});
test('the same upgrades always give the same flight (deterministic), and upgraded ships keep their character', () => {
  const u = maxed('corsair', ['engine', 'accel', 'handling', 'boost', 'stability']);
  const a = fly(u, { ...NO, yaw: 0.6, pitch: 0.2, boost: true }, 5), c = fly(u, { ...NO, yaw: 0.6, pitch: 0.2, boost: true }, 5); assert.equal(a.pos.dist(c.pos), 0);
  const all = ['engine', 'accel', 'handling', 'boost', 'stability'];
  assert.ok(maxed('corsair', all).maxSpeed < ship('lancer').maxSpeed, 'a maxed Corsair is still slower than a stock Lancer');
  assert.ok(maxed('kestrel', all).accel < ship('wisp').accel, 'a maxed Kestrel still accelerates less than a stock Wisp');
  assert.ok(maxed('kestrel', all).yawRate < ship('wisp').yawRate, 'a maxed Kestrel still turns slower than a stock Wisp');
  assert.ok(maxed('lancer', all).boostCap < ship('halberd').boostCap, 'a maxed Lancer still carries less boost than a stock Halberd');
  assert.ok(maxed('corsair', all).hull < ship('halberd').hull, 'a maxed Corsair is still lighter-armoured than a stock Halberd');
  assert.ok(maxed('halberd', all).accel < ship('kestrel').accel && maxed('wisp', all).maxSpeed < ship('corsair').maxSpeed && maxed('wisp', all).hull < ship('kestrel').hull, 'weaknesses stay weaknesses');
  for (const s of SHIPS) assert.equal(maxed(s.id, all).radius, s.radius, `${s.id}: collision sphere unchanged`);
  console.log('  measured effect of level 5 (stock vs maxed category):\n  ' + results.join('\n  '));
});
