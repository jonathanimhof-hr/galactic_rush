// GALACTIC RUSH V7 — reward calculation (pure functions, no state): single races, time trials, championship rounds and
// completion. Results carry their own breakdown so the results screens can show exactly how a number was made.
import { SINGLE_RACE, TIME_TRIAL, CHAMPIONSHIP_REWARDS as CR_, DIFF_ORDER, lapMult, TOKEN_SOURCES, MILESTONES } from './economy.js';

const pick = (arr, place) => arr[Math.min(arr.length - 1, Math.max(0, place - 1))];
const DLAB = { rookie: 'Rookie', pro: 'Pro', ace: 'Ace' };

// Base x Difficulty x Laps x Placement, rounded to whole credits
export function singleRaceReward({ diff, laps, place }) {
  const d = SINGLE_RACE.difficulty[diff], l = lapMult(laps), p = pick(SINGLE_RACE.placement, place);
  if (!d || !l || !p) return null;
  return { credits: Math.round(SINGLE_RACE.base * d * l * p), parts: [['Base', SINGLE_RACE.base], [DLAB[diff], d], [`${laps} lap${laps > 1 ? 's' : ''}`, l], [`P${place}`, p]] };
}
export function trialReward({ laps }) {
  const l = lapMult(laps); if (!l) return null;
  return { credits: Math.round(TIME_TRIAL.base * l), parts: [['Time trial base', TIME_TRIAL.base], [`${laps} lap${laps > 1 ? 's' : ''}`, l]] };
}
export function champRaceReward({ diff, laps, place }) {
  const R = CR_.race, d = R.difficulty[diff], l = lapMult(laps), p = pick(R.placement, place);
  if (!d || !l || !p) return null;
  return { credits: Math.round(R.base * d * l * p), parts: [['Round base', R.base], [DLAB[diff], d], [`${laps} lap${laps > 1 ? 's' : ''}`, l], [`P${place}`, p]] };
}
// completion bonus (once per run) and final-standing bonus, both x lap multiplier; Style Tokens for completion and the title
export function champCompletionReward({ diff, laps, standing }) {
  const base = CR_.completion[diff], l = lapMult(laps); if (!base || !l) return null;
  const completion = Math.round(base * l), share = pick(CR_.standing, standing) || 0, standingBonus = Math.round(completion * share);
  const tokens = (CR_.tokens.completion[diff] || 0) + (standing === 1 ? CR_.tokens.title[diff] || 0 : 0);
  return { completion, standing: standingBonus, tokens, share, parts: [[`${DLAB[diff]} completion`, CR_.completion[diff]], [`${laps} lap${laps > 1 ? 's' : ''}`, l]] };
}
export const nextDifficulty = diff => DIFF_ORDER[DIFF_ORDER.indexOf(diff) + 1] || null;

// Style Token sources for one completed race (wins, records); milestones are checked against the updated stats
export function tokenLines(ctx) { return TOKEN_SOURCES.filter(s => s.when(ctx)).map(s => ({ id: s.id, name: s.name, ST: s.ST })); }
export function milestonesReached(stats, claimed) { return MILESTONES.filter(m => !claimed.includes(m.id) && (stats[m.stat] || 0) >= m.at); }

// Economy table for documentation and tests: credits for an average finish (P3) per race type
export function economyTable() {
  const rows = [];
  for (const diff of DIFF_ORDER) for (const laps of [1, 3, 5]) {
    const s = singleRaceReward({ diff, laps, place: 3 }).credits, c = champRaceReward({ diff, laps, place: 3 }).credits, b = champCompletionReward({ diff, laps, standing: 3 });
    rows.push({ diff, laps, single: s, champRound: c, champTotalP3: c * 4 + b.completion + b.standing, fourSingles: s * 4 });
  }
  return rows;
}
