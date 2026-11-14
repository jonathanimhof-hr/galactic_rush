// GALACTIC RUSH V7 — save management for the career profile. Same mechanism as the existing save (browser localStorage,
// JSON, every access guarded), under its own key next to 'galactic-rush.v1' so a damaged profile can never take best
// laps and ghosts with it, and the other way round. Versioned, migrated and validated on load; a backup copy is kept
// from the last good load; storage failures never stop the game. Data stays in this browser: there is no cloud sync.
import { PROFILE_VERSION, createProfile, sanitize, migrate } from './profile.js';

// V12 keeps its career under keys of its own, so the earlier version that may share this browser keeps its own career,
// untouched and working: on V12's first start the V7-V11 career (LEGACY) is copied over once (and migrated); after
// that the two never read or write each other's data.
export const KEYS = { main: 'galactic-rush.profile.v12', backup: 'galactic-rush.profile.v12.bak', damaged: 'galactic-rush.profile.v12.damaged' };
export const LEGACY = { main: 'galactic-rush.profile', backup: 'galactic-rush.profile.bak' };

export function browserStorage() { try { return window.localStorage; } catch (e) { return null; } }
// an in-memory stand-in with the localStorage interface (tests, or when the browser blocks storage)
export class MemoryStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); this.writes = 0; this.fail = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.fail) throw new Error('QuotaExceededError (simulated)'); this.writes++; this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

export class ProfileStore {
  constructor(storage, now = () => Date.now()) { this.s = storage; this.now = now; this.status = 'new'; this.issues = []; this.readOnly = false; this.lastError = null; this.writes = 0; }
  read(k) { try { return this.s ? this.s.getItem(k) : null; } catch (e) { this.lastError = String(e && e.message || e); return null; } }
  write(k, v) { if (!this.s) { this.lastError = 'storage unavailable'; return false; } try { this.s.setItem(k, v); this.writes++; return true; } catch (e) { this.lastError = String(e && e.message || e); return false; } }
  parse(text) {
    if (text == null) return { missing: true };
    let raw; try { raw = JSON.parse(text); } catch (e) { return { error: 'not valid JSON' }; }
    const m = migrate(raw);
    if (m.future) return { future: true, version: raw.version };
    if (!m.data) return { error: `unsupported profile version ${raw && raw.version}` };
    const { profile, issues } = sanitize(m.data, this.now());
    return { profile, issues, migratedFrom: m.from !== PROFILE_VERSION ? m.from : null };
  }
  // -> { profile, status: new | loaded | recovered | reset | readonly, issues }
  load() {
    let main = this.read(KEYS.main), imported = null;
    if (main == null) { // V12's first start in this browser: the earlier career, if there is a readable one, is copied over
      for (const k of [LEGACY.main, LEGACY.backup]) { const text = this.read(k); if (text != null && this.parse(text).profile) { main = text; imported = k; break; } }
    }
    const a = this.parse(main);
    if (a.future) { // written by a newer version of the game: leave it untouched and do not save over it
      this.readOnly = true; this.status = 'readonly'; this.issues = [`career data was saved by a newer version (v${a.version}); it is left untouched and this session is not saved`];
      return { profile: createProfile(this.now()), status: this.status, issues: this.issues };
    }
    if (a.profile) {
      this.status = a.migratedFrom != null ? 'migrated' : 'loaded'; this.issues = a.issues; if (a.migratedFrom != null) this.issues.unshift(`migrated career data from v${a.migratedFrom} to v${PROFILE_VERSION}`);
      if (imported) { this.status = 'imported'; this.issues.unshift(`copied the career saved by the earlier version (${imported}); that copy is left as it was`); }
      if (main && !imported) this.write(KEYS.backup, main); // last good copy, refreshed once per session
      if (imported || a.migratedFrom != null || a.issues.length) this.save(a.profile);
      return { profile: a.profile, status: this.status, issues: this.issues };
    }
    const b = this.parse(this.read(KEYS.backup));
    if (!a.missing) this.write(KEYS.damaged, main); // keep the unreadable text for manual recovery
    if (b.profile) { this.status = 'recovered'; this.issues = [`career data was unreadable (${a.error}); restored the backup copy`, ...b.issues]; this.save(b.profile); return { profile: b.profile, status: this.status, issues: this.issues }; }
    this.status = a.missing ? 'new' : 'reset'; this.issues = a.missing ? [] : [`career data was unreadable (${a.error}) and no backup was usable; started a new career`];
    const p = createProfile(this.now()); this.save(p);
    return { profile: p, status: this.status, issues: this.issues };
  }
  save(profile) {
    if (this.readOnly) return false;
    let text; try { text = JSON.stringify(profile); } catch (e) { this.lastError = 'could not serialise'; return false; }
    return this.write(KEYS.main, text);
  }
}
