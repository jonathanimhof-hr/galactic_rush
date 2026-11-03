// GALACTIC RUSH V7 — cosmetic catalog: every item's definition in one place (id, name, category, slot, description,
// rarity, classification, unlock method, cost, currency, render parameters). Unlock and equipped status live in the
// player profile; this file never changes at runtime. Cosmetics carry no gameplay values of any kind.
import { SHIPS } from '../config.js';

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#a7b4c4' },
  { id: 'uncommon', name: 'Uncommon', color: '#73f7ae' },
  { id: 'rare', name: 'Rare', color: '#6fb8ff' },
  { id: 'epic', name: 'Epic', color: '#c88cff' },
  { id: 'legendary', name: 'Legendary', color: '#ffc66e' },
];
// earnable: bought with Credits or Style Tokens (or owned from the start); special: earned only by playing (championships,
// milestones, achievements); event: reserved for future events (none in this version); premium: a locked placeholder for a
// possible future premium catalog. Premium items cannot be bought, unlocked or equipped in this version.
export const CLASSES = {
  earnable: { name: 'Earnable' },
  special: { name: 'Special' },
  event: { name: 'Event' },
  premium: { name: 'Premium', label: 'Premium Cosmetic — Coming Soon' },
};
export const PREMIUM_LABEL = 'Premium Cosmetic — Coming Soon';
export const CATEGORIES = [
  { id: 'colors', name: 'Colors' }, { id: 'patterns', name: 'Patterns' }, { id: 'finishes', name: 'Finishes' },
  { id: 'effects', name: 'Special Effects' }, { id: 'premium', name: 'Premium Cosmetics — Coming Soon' },
];
// slots a ship's paint job has; 'paint' is an optional special paint that replaces the primary colour
export const SLOTS = ['paint', 'pattern', 'finish', 'exhaust', 'trail'];
export const SLOT_DEFAULT = { paint: null, pattern: 'pattern.factory', finish: 'finish.glossy', exhaust: 'exhaust.standard', trail: 'trail.standard' };

// shader ids (M_CUSTOM in render/gfx.js)
export const PATTERN_IDS = { factory: 0, solid: 1, stripes: 2, double: 3, chevron: 4, split: 5, geometric: 6, hex: 7, camo: 8, hazard: 9 };
export const FINISH_IDS = { glossy: 0, matte: 1, metallic: 2, brushed: 3, worn: 4 };
export const PAINT_TYPES = { flip: 1, pearl: 2, neon: 3 };

const I = (id, name, category, slot, rarity, cls, unlock, desc, render = {}) => {
  const price = unlock.type === 'credits' || unlock.type === 'tokens' ? unlock.price : null;
  return { id, name, category, slot, rarity, class: cls, unlock, price, currency: unlock.type === 'credits' ? 'CR' : unlock.type === 'tokens' ? 'ST' : null, desc, render };
};
const own = { type: 'default' }, cr = price => ({ type: 'credits', price }), st = price => ({ type: 'tokens', price });
const champ = (diff, title = false) => ({ type: 'championship', diff, title }), mile = (stat, at) => ({ type: 'milestone', stat, at });
const prem = { type: 'premium' };

export const ITEMS = [
  // Colors: special paints that replace the primary colour (plain colours are free in the paint shop)
  I('paint.glacier', 'Glacier Pearl', 'colors', 'paint', 'uncommon', 'earnable', cr(900), 'Ice-white paint with a cold blue pearl that blooms at grazing angles.', { type: 'pearl', c0: '#dfe9ef', c1: '#6fa7e8' }),
  I('paint.aurora', 'Aurora Flip', 'colors', 'paint', 'rare', 'earnable', cr(1400), 'Colour-shift paint: deep teal face-on, violet as the panels turn away.', { type: 'flip', c0: '#0f8f8a', c1: '#6a3fd1' }),
  I('paint.solar', 'Solar Flip', 'colors', 'paint', 'rare', 'earnable', cr(1400), 'Colour-shift paint that runs from molten gold to crimson across every curve.', { type: 'flip', c0: '#e0a526', c1: '#b3122f' }),
  I('paint.nebula', 'Nebula Pearl', 'colors', 'paint', 'epic', 'earnable', st(6), 'Rose-white base with a violet pearl, like dust lit by a young star.', { type: 'pearl', c0: '#eadbe3', c1: '#8c5ad8' }),
  I('paint.neon-ion', 'Neon Ion', 'colors', 'paint', 'epic', 'earnable', st(8), 'Self-lit cyan paint. Glows softly on night courses without hiding the hull detail.', { type: 'neon', c0: '#27d2f2', c1: '#27d2f2' }),
  I('paint.neon-ember', 'Neon Ember', 'colors', 'paint', 'epic', 'special', { type: 'achievement', stat: 'trackWins', at: 4 }, 'Self-lit ember-orange paint. Win a race on every course to earn it.', { type: 'neon', c0: '#ff7a2a', c1: '#ff7a2a' }),
  I('paint.champion', 'Starlane Champion', 'colors', 'paint', 'legendary', 'special', champ('ace', true), 'Gold-to-bronze flip paint for the Ace Championship title holder.', { type: 'flip', c0: '#f3c74a', c1: '#8a4b16' }),
  // Patterns (drawn on the hull in the ship's own coordinates by the hull shader)
  I('pattern.factory', 'Factory Livery', 'patterns', 'pattern', 'common', 'earnable', own, 'The team livery the ship leaves the factory with: a fine centre line in the accent colour.', { id: PATTERN_IDS.factory }),
  I('pattern.solid', 'Solid', 'patterns', 'pattern', 'common', 'earnable', own, 'One clean colour over the whole primary paint.', { id: PATTERN_IDS.solid }),
  I('pattern.stripes', 'Racing Stripes', 'patterns', 'pattern', 'common', 'earnable', own, 'A broad centre stripe in the secondary colour with accent pinstripes.', { id: PATTERN_IDS.stripes }),
  I('pattern.double', 'Double Stripes', 'patterns', 'pattern', 'uncommon', 'earnable', cr(600), 'Twin stripes in the secondary colour either side of the spine.', { id: PATTERN_IDS.double }),
  I('pattern.chevron', 'Chevron', 'patterns', 'pattern', 'uncommon', 'earnable', cr(900), 'Forward-pointing chevrons in the secondary colour, edged in the accent.', { id: PATTERN_IDS.chevron }),
  I('pattern.split', 'Split Color', 'patterns', 'pattern', 'uncommon', 'earnable', cr(900), 'Port side in the primary colour, starboard in the secondary, split by an accent line.', { id: PATTERN_IDS.split }),
  I('pattern.geometric', 'Geometric', 'patterns', 'pattern', 'rare', 'earnable', cr(1800), 'Large faceted triangles in three tones of the primary and secondary colours.', { id: PATTERN_IDS.geometric }),
  I('pattern.hex', 'Hexagonal', 'patterns', 'pattern', 'rare', 'earnable', st(4), 'A honeycomb of secondary-colour cell walls over the primary paint.', { id: PATTERN_IDS.hex }),
  I('pattern.camo', 'Digital Camouflage', 'patterns', 'pattern', 'epic', 'earnable', st(7), 'Pixel camouflage in the primary and secondary colours at two block sizes.', { id: PATTERN_IDS.camo }),
  I('pattern.hazard', 'Industrial Hazard', 'patterns', 'pattern', 'epic', 'special', champ('rookie'), 'Diagonal hazard bands across the tail and nose. Complete the Rookie Championship to earn it.', { id: PATTERN_IDS.hazard }),
  // Finishes (material parameters of the painted panels)
  I('finish.glossy', 'Glossy', 'finishes', 'finish', 'common', 'earnable', own, 'Clear-coated race paint with honest wear on the edges. The factory finish.', { id: FINISH_IDS.glossy }),
  I('finish.matte', 'Matte', 'finishes', 'finish', 'common', 'earnable', cr(400), 'Flat, non-reflective paint with no clear coat.', { id: FINISH_IDS.matte }),
  I('finish.metallic', 'Metallic', 'finishes', 'finish', 'uncommon', 'earnable', cr(1200), 'Metal-flake paint under a clear coat: the colour tints the reflections.', { id: FINISH_IDS.metallic }),
  I('finish.brushed', 'Brushed Metal', 'finishes', 'finish', 'rare', 'earnable', st(5), 'Bare anodised metal with fine brushing along the hull.', { id: FINISH_IDS.brushed }),
  I('finish.worn', 'Worn Paint', 'finishes', 'finish', 'rare', 'special', mile('races', 25), 'Chipped, sun-faded paint over bare metal, earned the long way: complete 25 races.', { id: FINISH_IDS.worn }),
  // Special effects: engine exhaust and wingtip contrail colours (visible in races)
  I('exhaust.standard', 'Standard Exhaust', 'effects', 'exhaust', 'common', 'earnable', own, 'Engine glow and exhaust follow the accent colour.', { color: null }),
  I('exhaust.plasma', 'Blue Plasma', 'effects', 'exhaust', 'uncommon', 'earnable', cr(700), 'A hot blue-white plasma exhaust.', { color: '#4d9dff' }),
  I('exhaust.solar', 'Solar Flare', 'effects', 'exhaust', 'rare', 'earnable', st(3), 'Amber exhaust with a white-hot core.', { color: '#ff9a2e' }),
  I('exhaust.violet', 'Violet Ion', 'effects', 'exhaust', 'epic', 'special', champ('pro'), 'Violet ion exhaust. Complete the Pro Championship to earn it.', { color: '#b45cff' }),
  I('exhaust.gold', 'Champion Gold', 'effects', 'exhaust', 'legendary', 'special', champ('ace'), 'Gold exhaust for pilots who complete the Ace Championship.', { color: '#ffcf5a' }),
  I('trail.standard', 'Standard Contrails', 'effects', 'trail', 'common', 'earnable', own, 'White wingtip vapour.', { color: '#e6eeff' }),
  I('trail.neon', 'Neon Contrails', 'effects', 'trail', 'uncommon', 'earnable', cr(500), 'Wingtip vapour tinted cyan.', { color: '#5fe3ff' }),
  I('trail.ember', 'Ember Contrails', 'effects', 'trail', 'rare', 'earnable', st(4), 'Wingtip vapour in glowing ember orange.', { color: '#ff8a3d' }),
  I('trail.prism', 'Prism Contrails', 'effects', 'trail', 'legendary', 'special', { type: 'achievement', stat: 'byDiff.ace.wins', at: 5 }, 'Contrails that cycle through the spectrum. Win 5 races on Ace to earn them.', { color: 'prism' }),
  // Premium placeholders: locked, not purchasable, never unlocked, no gameplay values
  I('premium.neon-skin', 'Premium Neon Skin', 'premium', 'skin', 'legendary', 'premium', prem, 'Placeholder for a possible future premium catalog.'),
  I('premium.carbon-skin', 'Premium Carbon Skin', 'premium', 'skin', 'epic', 'premium', prem, 'Placeholder for a possible future premium catalog.'),
  I('premium.plasma-pattern', 'Premium Plasma Pattern', 'premium', 'pattern', 'epic', 'premium', prem, 'Placeholder for a possible future premium catalog.'),
  I('premium.champ-finish', 'Premium Championship Finish', 'premium', 'finish', 'legendary', 'premium', prem, 'Placeholder for a possible future premium catalog.'),
];
export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const DEFAULT_ITEMS = ITEMS.filter(i => i.unlock.type === 'default').map(i => i.id);
export const isPremium = it => !!it && it.class === 'premium';
export const isPurchasable = it => !!it && it.class === 'earnable' && (it.unlock.type === 'credits' || it.unlock.type === 'tokens') && it.price > 0 && (it.currency === 'CR' || it.currency === 'ST');

// Free colours: a palette of named swatches; any colour can also be picked by hue or typed as hex.
export const SWATCHES = [
  ['Signal Orange', '#e8892b'], ['Racing Red', '#d7263d'], ['Crimson', '#8e1b2c'], ['Solar Yellow', '#f2c230'], ['Lime', '#8cd13f'], ['Emerald', '#1f9e6a'],
  ['Teal', '#1fb5ac'], ['Ion Cyan', '#39c6f0'], ['Cobalt', '#2d5bd6'], ['Violet', '#7a4bd8'], ['Magenta', '#d23c9a'], ['Pearl White', '#e9ecef'],
  ['Silver', '#9aa3ad'], ['Gunmetal', '#42454a'], ['Graphite', '#2a2e35'], ['Midnight', '#141a26'], ['Bronze', '#9c6b3c'], ['Olive Drab', '#545945'],
];

export const toHex = c => '#' + c.slice(0, 3).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
// each ship's secondary surfaces (engine housings, canopy frames, ventral plates, booms; Wisp's ceramic ring, Corsair's
// olive hull) are tinted relative to this factory colour, so the default secondary reproduces the stock ship exactly
export const SECONDARY_REF = { kestrel: [0.26, 0.27, 0.29], wisp: [0.82, 0.8, 0.76], lancer: [0.26, 0.27, 0.29], halberd: [0.26, 0.27, 0.29], corsair: [0.33, 0.35, 0.27] };
export function defaultCustom(shipId) {
  const s = SHIPS.find(x => x.id === shipId) || SHIPS[0];
  return { primary: toHex(s.color), secondary: toHex(SECONDARY_REF[s.id] || SECONDARY_REF.kestrel), accent: toHex(s.accent), ...SLOT_DEFAULT };
}
