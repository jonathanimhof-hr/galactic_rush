// GALACTIC RUSH V12 — the career of a signed-in player. The account server holds the career; the game keeps a copy
// of it in this browser (to show it at once and while offline) and changes it only by asking the server: every
// purchase, upgrade, paint job, ship choice and championship start or abandon is applied to the copy at once (so the
// garage answers instantly), sent to the server as an operation, and the copy is then replaced by the server's answer.
// A refusal by the server undoes the change on screen. While the server cannot be reached nothing is bought or
// changed. Race rewards are paid by the server against the ticket it issued when the race started.
import { Progression } from '../progress/index.js';
import { KEYS, LEGACY } from '../progress/store.js';

// the browser storage the copy lives in: the career keys mapped to this account's own keys; the V11 career is never
// copied into an account's copy (only an explicit import brings a device's career to an account)
export function accountStorage(uid, base) {
  const map = { [KEYS.main]: `galactic-rush.v12.acct.${uid}.career`, [KEYS.backup]: `galactic-rush.v12.acct.${uid}.career.bak`, [KEYS.damaged]: `galactic-rush.v12.acct.${uid}.career.damaged` };
  const legacy = new Set(Object.values(LEGACY));
  return {
    getItem: k => (legacy.has(k) ? null : base.getItem(map[k] || k)),
    setItem: (k, v) => { if (!legacy.has(k)) base.setItem(map[k] || k, v); },
    removeItem: k => { if (!legacy.has(k)) base.removeItem(map[k] || k); },
  };
}

export class CloudProgression extends Progression {
  constructor(account, storage, opts) { super(storage, opts); this.account = account; this.cloud = true; }
  guard() { return this.account.canChange(); } // null, or the refusal to show (offline, not signed in)
  buyUpgrade(shipId, cat, expectLevel) { const no = this.guard(); if (no) return no; const r = super.buyUpgrade(shipId, cat, expectLevel); if (r.ok) this.account.send('buyUpgrade', { ship: shipId, cat, expectLevel: r.level - 1 }); return r; }
  buyItem(id) { const no = this.guard(); if (no) return no; const r = super.buyItem(id); if (r.ok) this.account.send('buyItem', { id }); return r; }
  // equip, unequip and resetCustom all end here
  setCustom(shipId, custom) { const no = this.guard(); if (no) return no; const r = super.setCustom(shipId, custom); if (r.ok) this.account.send('setCustom', { ship: shipId, custom: r.custom || this.custom(shipId) }); return r; }
  // the chosen ship is a preference: kept on screen even offline, sent when the server can be reached
  selectShip(id) { const before = this.profile.selectedShip, changed = super.selectShip(id); if (before !== this.profile.selectedShip) this.account.send('selectShip', { ship: id }, { light: true }); return changed; }
  startRun(o) { const no = this.guard(); if (no) return no; const runId = o.runId || this.newRunId(), r = super.startRun({ ...o, runId }); if (r.ok) this.account.send('startRun', { diff: o.diff, laps: o.laps, ship: o.ship, ...(o.tracks ? { tracks: o.tracks } : {}), runId }); return r; }
  abandonRun(runId) { const no = this.guard(); if (no) return no; const r = super.abandonRun(runId); if (r.ok) this.account.send('abandonRun', { runId }); return r; }
  // a race is paid by the server against its ticket; the copy shows the same reward at once, the server's answer replaces it
  completeRace(o) {
    const tk = this.account.ticketFor(o.raceId);
    if (!tk) return { ok: false, code: 'not-credited', message: 'This race was not credited: the account server could not be reached when it started.' };
    const r = super.completeRace(o);
    if (r.ok) this.account.raceFinished(o.raceId, { place: o.place, time: o.time, bestLap: Number.isFinite(o.bestLap) ? o.bestLap : null, order: o.order });
    return r.ok ? { ...r, pending: true } : r;
  }
  // online tournament rewards are paid into the account by the multiplayer server, never by the game
  transact(kind, reason, mutate, opts) { if (kind === 'mp') return { ok: false, code: 'account', message: 'Online rewards are paid into your account by the server.' }; return super.transact(kind, reason, mutate, opts); }
}
