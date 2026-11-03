// GALACTIC RUSH V8 — online tournament rewards, shared by the server (which works them out from its own results) and
// the game (which checks what it is sent against the published results before paying it). Values follow the V7
// economy (src/progress/economy.js): a race pays round(150 x field x laps x placement), with the field factor of a Pro
// race (human rivals), the 5-lap factor 1.5 and V7's placement table. Only races a pilot actually finished pay; the
// winner gets a bonus. The game pays a reward through the career's transaction system under the event id mp:<tid>,
// which it refuses to pay twice. Credits and Style Tokens are the game's existing currencies: there is no separate one.
export const MP_REWARDS = Object.freeze({
  base: 150, field: 1.3, laps: 1.5,
  place: Object.freeze([1.25, 1.15, 1.08, 1.0, 0.95, 0.9]),
  winner: Object.freeze({ CR: 500, ST: 3 }),
  runnerUp: Object.freeze({ CR: 0, ST: 1 }),
});
export const raceCredits = place => Math.round(MP_REWARDS.base * MP_REWARDS.field * MP_REWARDS.laps * (MP_REWARDS.place[place - 1] ?? MP_REWARDS.place[MP_REWARDS.place.length - 1]));
export const TID = /^t[0-9a-f]{10}$/; // the server's tournament ids (also valid in the career's event ledger as mp:<tid>)

// stages: [{ stage, rows }], rows as in the results; winner/runnerUp: pids or null
// returns { pid: { CR, ST, lines: [{ name, CR, ST }] } } for every pilot who earned something
export function tournamentRewards({ stages, winner, runnerUp }) {
  const out = {};
  const add = (pid, name, CR = 0, ST = 0) => { if (!CR && !ST) return; const o = out[pid] || (out[pid] = { CR: 0, ST: 0, lines: [] }); o.CR += CR; o.ST += ST; o.lines.push({ name, CR, ST }); };
  for (const s of stages || []) {
    const label = s.stage === 1 ? 'Qualifier' : 'Final';
    for (const r of s.rows || []) if (r.status === 'finished') add(r.pid, `${label}: P${r.place}`, raceCredits(r.place));
  }
  if (winner) add(winner, 'Tournament winner', MP_REWARDS.winner.CR, MP_REWARDS.winner.ST);
  if (runnerUp) add(runnerUp, 'Runner-up', MP_REWARDS.runnerUp.CR, MP_REWARDS.runnerUp.ST);
  return out;
}

// The game's check before paying: the reward must be exactly what the published results give this pilot.
// complete: the server's tournament summary; reward: { tid, CR, ST, lines }
export function checkReward(complete, pid, reward) {
  if (!complete || !reward || typeof complete.tid !== 'string' || !TID.test(complete.tid) || reward.tid !== complete.tid) return { ok: false, why: 'tournament id' };
  if (!Array.isArray(complete.stages) || !complete.stages.length || complete.stages.length > 2) return { ok: false, why: 'stages' };
  const want = tournamentRewards(complete)[pid];
  if (!want) return { ok: false, why: 'nothing earned in these results' };
  const lines = Array.isArray(reward.lines) ? reward.lines : [];
  const same = want.CR === reward.CR && want.ST === reward.ST && lines.length === want.lines.length
    && want.lines.every((l, k) => lines[k] && lines[k].name === l.name && lines[k].CR === l.CR && lines[k].ST === l.ST);
  return same ? { ok: true, reward: want } : { ok: false, why: 'amounts differ from the results' };
}
