// GALACTIC RUSH V8 — paint jobs in online races. A pilot's saved paint job (V7 garage) is sent with their ship and
// checked on both sides with the career's own validator: known colours and items for the right slots only, never a
// premium item. Paint is cosmetic; it never changes a ship's handling.
import { ITEMS } from '../progress/catalog.js';
import { sanitizeCustom } from '../progress/profile.js';
import { validShip } from './protocol.js';

const USABLE = new Set(ITEMS.filter(i => i.class !== 'premium' && i.class !== 'event').map(i => i.id));

// Returns the cleaned paint job for that ship (factory values where something was invalid) and the list of problems.
export function cleanPaint(raw, shipId) {
  const issues = [];
  if (!validShip(shipId)) return { paint: null, issues: ['unknown ship'] };
  const paint = sanitizeCustom(raw == null ? undefined : raw, shipId, USABLE, issues);
  return { paint, issues };
}
