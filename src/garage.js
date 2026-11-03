// GALACTIC RUSH V7 — the garage: ship choice, upgrades, paint shop with a live 3D preview, inventory and the cosmetic
// shop, all on the existing hangar scene. This file holds UI state only; every purchase, upgrade and saved paint job
// goes through the progression service (src/progress), which validates and saves it.
import { SHIPS } from './config.js';
import { ITEM, CATEGORIES, SLOT_DEFAULT, defaultCustom } from './progress/catalog.js';
import { normHex, withHue, withLight, hueOf, lightOf } from './progress/customize.js';
import { CATEGORY } from './progress/upgrades.js';
import { fmtCR, fmtCur } from './progress/index.js';
import { garageHTML, tabShip, tabUpgrades, tabPaint, paintActions, tabInventory, tabShop } from './ui-garage.js';

const TABS = ['ship', 'upgrades', 'paint', 'inventory', 'shop'];
const SECTION_OF = { paint: 'colors', pattern: 'pattern', finish: 'finish', exhaust: 'effects', trail: 'effects' };
const KEYS = ['primary', 'secondary', 'accent', 'paint', 'pattern', 'finish', 'exhaust', 'trail'];
// preview angles relative to the camera's bearing: [turntable offset, tilt toward the camera]
const VIEWS = { front: [0, 0.12], side: [-Math.PI / 2, 0.06], rear: [Math.PI, 0.1], top: [-0.75, 1.0], '34': [-0.8, 0.12] };

export class Garage {
  constructor(game) {
    this.g = game; this.tab = 'ship'; this.section = 'colors'; this.slot = 'primary'; this.filters = { category: 'all', rarity: 'all', status: 'all' };
    this.shopCat = 'colors'; this.sel = null; this.armed = null; this.notice = null; this.draft = null; this.compare = false; this.view = 'auto'; this.zoom = 1; this.leaving = null; this.fly = false;
  }
  get P() { return this.g.progress; }
  get shipId() { return SHIPS[this.g.opts.ship].id; }
  get saved() { return this.P.custom(this.shipId); }
  get dirty() { const s = this.saved; return !!this.draft && KEYS.some(k => this.draft[k] !== s[k]); }
  changes() { const s = this.saved; return KEYS.filter(k => this.draft[k] !== s[k]).length; }
  lockedInDraft() { return ['paint', 'pattern', 'finish', 'exhaust', 'trail'].map(k => this.draft[k]).filter(id => id && !this.P.isUnlocked(id)).map(id => this.P.itemState(ITEM[id], this.shipId)); }
  // what the hangar shows: the draft while editing (or the saved paint when comparing)
  liveryFor(shipId) { return this.P.livery(shipId, shipId === this.shipId && this.draft && !this.compare ? this.draft : null); }

  open(fly, tab) {
    const g = this.g; this.fly = fly; this.tab = tab || (fly ? 'ship' : this.tab); // racing: start on the ship; the Garage menu returns to the last tab
    this.draft = this.saved; this.compare = false; this.leaving = null; this.armed = null; this.notice = null;
    g.state = 'ship'; g.input.capture = false; g.hud.show(false); g.scene = { kind: 'hangar', mode: 'showcase' }; g.fx.clear(); g.audio.setEnv('hangar');
    g.hangar.resetView(); this.view = 'auto'; this.zoom = 1; g.setShowcase();
    // keyboard and pad: choosing a ship for a race starts on "Fly the …" so Enter flies at once, as in V6; the Garage menu starts on its tabs
    this.render(false, fly ? '.gfoot .btn.primary' : '.tabs [aria-selected="true"]'); g.audio.music('menu');
  }
  close() { this.g.hangar.resetView(); this.view = 'auto'; this.zoom = 1; this.compare = false; this.leaving = null; this.armed = null; this.notice = null; this.P.flush(); }
  // leaving with unapplied paint asks first (inline, no modal)
  leave(next) { if (this.dirty) { this.leaving = next; this.render(); return; } this.close(); next(); }
  switchShip(dir) {
    this.leave(() => { const g = this.g; g.opts.ship = (g.opts.ship + dir + SHIPS.length) % SHIPS.length; this.P.selectShip(this.shipId); this.draft = this.saved; this.armed = null; g.setShowcase(); this.notice = null; this.render(); });
  }
  preview() { const sv = this.g.showSV; if (sv) sv.setLivery(this.liveryFor(this.shipId)); }
  say(text, cls = '') { this.notice = { text, cls }; }
  arm(key) { this.armed = key; clearTimeout(this.armT); this.armT = setTimeout(() => { if (this.armed === key && this.g.state === 'ship') { this.armed = null; this.render(); } }, 6000); }
  result(r, okText) { if (r.ok) { this.say(okText + (r.saved === false ? ' (Could not save in this browser: progress lasts until you close the page.)' : ''), 'good'); this.g.audio.play('checkpoint'); } else this.say(r.message || 'Not possible.', 'warn'); }
  setTab(t) { if (TABS.includes(t)) { this.tab = t; this.armed = null; } }
  tabStep(d) { this.setTab(TABS[(TABS.indexOf(this.tab) + d + TABS.length) % TABS.length]); this.render(); const f = document.querySelector('#ui .tabs [aria-selected="true"]'); if (f) f.focus({ preventScroll: true }); }
  setColour(hex) { const h = normHex(hex); if (!h) { this.say('That is not a colour. Use six hex digits, e.g. #e8892b.', 'warn'); return false; } this.draft = { ...this.draft, [this.slot]: h, ...(this.slot === 'primary' ? { paint: null } : {}) }; this.preview(); return true; }
  setView(v) {
    const H = this.g.hangar; this.view = v;
    if (v === 'auto') { H.setView({ auto: true, tYaw: null, tTilt: 0 }); return; }
    const c = H.camera(0), az = Math.atan2(c.pos.x, c.pos.z), [o, tilt] = VIEWS[v];
    H.setView({ auto: false, tYaw: az + o, tTilt: tilt });
  }
  rotate(dyaw, dtilt = 0) { const H = this.g.hangar, V = H.view; this.view = 'free'; H.setView({ auto: false, tYaw: (V.tYaw ?? H.spin) + dyaw, tTilt: Math.max(-0.5, Math.min(1.25, V.tTilt + dtilt)) }); }
  zoomBy(f) { const H = this.g.hangar; this.zoom = Math.max(0.55, Math.min(1.3, H.view.tZoom * f)); H.setView({ tZoom: this.zoom }); const z = document.querySelector('#ui [data-gin="zoom"]'); if (z) z.value = this.zoom; }
  applyDraft() {
    const r = this.P.setCustom(this.shipId, this.draft);
    if (r.ok) { this.draft = this.saved; this.compare = false; this.preview(); this.result(r, 'Paint job saved.'); return true; }
    this.result(r); return false;
  }

  act(arg) {
    const [verb, ...rest] = String(arg).split(':'), val = rest.join(':'), id = this.shipId;
    switch (verb) {
      case 'tab': this.setTab(val); break;
      case 'done': this.leave(() => { this.g.state = 'title'; this.g.startAttract(); this.g.ui.title(this.g.touch); }); return;
      case 'leave': { const next = this.leaving; if (val === 'stay') this.leaving = null;
        else if (val === 'apply') { if (this.applyDraft() && next) { this.leaving = null; this.close(); next(); return; } }
        else if (val === 'discard') { this.draft = this.saved; this.preview(); this.leaving = null; if (next) { this.close(); next(); return; } } break; }
      // upgrades: first press arms, second press buys (the expected level stops a double press from buying twice)
      case 'up': { if (this.armed !== arg) { this.arm(arg); break; } this.armed = null; const [cat, lv] = rest, r = this.P.buyUpgrade(id, cat, +lv);
        this.result(r, r.ok ? `${CATEGORY[cat].name} upgraded to level ${r.level} for ${fmtCR(r.cost)}. Balance ${fmtCR(r.balance.CR)}.` : ''); break; }
      // paint shop (draft only until Apply)
      case 'psec': this.section = val; break;
      case 'slot': this.slot = val; break;
      case 'sw': this.setColour(val); break;
      case 'hex': { const el = document.querySelector('#ui input.hex'); if (el) this.setColour(el.value); break; }
      case 'paint': this.draft = { ...this.draft, paint: val === 'none' ? null : val }; this.preview(); break;
      case 'pick': { const it = ITEM[val]; if (it && it.class !== 'premium') { this.draft = { ...this.draft, [it.slot]: val }; this.preview(); } break; }
      case 'view': this.setView(val); break;
      case 'cmp': this.compare = !this.compare && this.dirty; this.preview(); break;
      case 'apply': this.applyDraft(); break;
      case 'revert': this.draft = this.saved; this.compare = false; this.preview(); this.say('Preview reverted to your saved paint job.'); break;
      case 'factory': { const d = defaultCustom(id); this.draft = { ...this.draft, primary: d.primary, secondary: d.secondary, accent: d.accent, paint: null }; this.preview(); this.say('Factory colours in the preview. Apply to keep them.'); break; }
      // inventory
      case 'f': { const [k, v] = rest; this.filters[{ cat: 'category', rar: 'rarity', st: 'status' }[k]] = v; break; }
      case 'equip': { const it = ITEM[val], r = this.P.equip(id, val); if (r.ok) this.draft = { ...this.draft, [it.slot]: val }; this.result(r, `${it ? it.name : 'Item'} equipped on the ${SHIPS[this.g.opts.ship].name}.`); this.preview(); break; }
      case 'unequip': { const r = this.P.unequip(id, val); if (r.ok) this.draft = { ...this.draft, [val]: SLOT_DEFAULT[val] }; this.result(r, 'Unequipped; the default is back on.'); this.preview(); break; }
      case 'try': { const it = ITEM[val]; if (!it || it.class === 'premium') { this.say('Premium cosmetics cannot be previewed or used in this version.', 'warn'); break; }
        this.draft = { ...this.draft, [it.slot]: val }; this.preview(); this.tab = 'paint'; this.section = SECTION_OF[it.slot]; this.say(`Previewing ${it.name}.${this.P.isUnlocked(val) ? ' Apply to keep it.' : ' It is locked: unlock it to apply.'}`); break; }
      case 'goshop': { const it = ITEM[val]; if (it) { this.tab = 'shop'; this.shopCat = it.category; this.sel = val; } break; }
      // shop: select, then unlock in two presses
      case 'scat': this.shopCat = val; this.sel = null; this.armed = null; break;
      case 'sel': this.sel = val; this.armed = null; break;
      case 'cancel': this.armed = null; break;
      case 'buy': { if (this.armed !== arg) { this.arm(arg); break; } this.armed = null; const it = ITEM[val], r = this.P.buyItem(val);
        this.result(r, r.ok ? `${it.name} unlocked for ${fmtCur(r.currency, r.price)}. Balance ${fmtCur(r.currency, r.balance[r.currency])}.` : ''); break; }
    }
    this.render();
  }
  // live controls: sliders and the hex field update the preview without rebuilding the screen
  input(el) {
    const k = el.dataset.gin;
    if (k === 'zoom') { this.zoom = +el.value; this.g.hangar.setView({ tZoom: this.zoom }); return; }
    let hex = null;
    if (k === 'hue') hex = withHue(this.draft[this.slot], el.value);
    else if (k === 'light') hex = withLight(this.draft[this.slot], el.value);
    else if (k === 'hex') { hex = normHex(el.value); if (!hex || el.value.replace('#', '').length < 6) return; }
    if (!hex) return;
    this.draft = { ...this.draft, [this.slot]: hex, ...(this.slot === 'primary' ? { paint: null } : {}) }; this.preview();
    const R = document.getElementById('ui'), set = (sel, f) => { const e = R.querySelector(sel); if (e) f(e); };
    set('#curSw', e => { e.style.background = hex; }); set(`.slot[data-arg="slot:${this.slot}"] .swatch`, e => { e.style.background = hex; });
    if (k !== 'hex') set('input.hex', e => { e.value = hex; }); if (k !== 'hue') set('input.hue', e => { e.value = hueOf(hex); }); if (k !== 'light') set('input.shade', e => { e.value = lightOf(hex); });
    set('input.shade', e => e.style.setProperty('--c', hex));
    R.querySelectorAll('.sw[aria-pressed="true"]').forEach(e => e.setAttribute('aria-pressed', 'false'));
  }

  render(keep = true, focusSel = null) {
    const P = this.P, id = this.shipId, ship = SHIPS[this.g.opts.ship], eff = P.effectiveDef(id), wallet = P.wallet();
    if (!this.draft) this.draft = this.saved;
    let body = '', bar = '';
    if (this.tab === 'ship') body = tabShip({ ship, eff, custom: this.saved });
    else if (this.tab === 'upgrades') body = tabUpgrades({ ship, eff, rows: P.upgradeRows(id), armed: this.armed });
    else if (this.tab === 'paint') { const bySlot = s => P.catalog(id).filter(x => x.slot === s && x.class !== 'premium');
      body = tabPaint({ section: this.section, slot: this.slot, draft: this.draft, paints: bySlot('paint'), items: { pattern: bySlot('pattern'), finish: bySlot('finish'), exhaust: bySlot('exhaust'), trail: bySlot('trail') },
        view: this.view, zoom: this.zoom, compare: this.compare, dirty: this.dirty, changes: this.dirty ? this.changes() : 0, lockedInDraft: this.lockedInDraft() });
      bar = paintActions({ dirty: this.dirty, changes: this.dirty ? this.changes() : 0, locked: this.lockedInDraft().length }); }
    else if (this.tab === 'inventory') { const all = P.catalog(id), earn = all.filter(s => s.class !== 'premium' && s.class !== 'event');
      body = tabInventory({ filters: this.filters, list: P.catalog(id, this.filters), owned: earn.filter(s => s.unlocked).length, total: earn.length, ship, defaults: SLOT_DEFAULT }); }
    else { const list = P.catalog(id, { category: this.shopCat }); if (this.sel && !list.some(s => s.id === this.sel)) this.sel = null;
      body = tabShop({ cats: CATEGORIES, cat: this.shopCat, list, sel: this.sel, selItem: this.sel ? P.itemState(ITEM[this.sel], id) : null, wallet, armed: this.armed, ship }); }
    const dirty = this.dirty;
    this.g.ui.show(garageHTML({ ship, idx: this.g.opts.ship, tab: this.tab, wallet, upgrades: P.upgrades(id), body, bar, notice: this.notice, dirty, leaving: !!this.leaving, canApply: dirty && this.lockedInDraft().length === 0, fly: this.fly }), 'scrim garage', !keep && !focusSel, keep);
    if (focusSel) { const f = document.querySelector('#ui ' + focusSel); if (f) f.focus({ preventScroll: true }); }
    this.bindDrag();
  }
  // drag the ship to turn it, wheel to zoom (the drag zone covers the scene to the right of the menu)
  bindDrag() {
    const z = document.querySelector('#ui .dragzone'); if (!z) return; let last = null;
    z.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; z.setPointerCapture(e.pointerId); z.classList.add('drag'); });
    z.addEventListener('pointermove', e => { if (!last) return; const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; this.rotate(dx * 0.012, dy * 0.006); });
    const up = () => { last = null; z.classList.remove('drag'); }; z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
    z.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.06 : 1 / 1.06); }, { passive: false });
  }
}
