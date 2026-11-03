// GALACTIC RUSH V7 — markup for the garage (ship, upgrades, paint shop, inventory, cosmetic shop), the career screen,
// reward panels and championship screens. Pure functions of the data they are given; garage.js owns the state.
import { SHIPS, STAT_BARS, CHAMPIONSHIP } from './config.js';
import { TRACK_DEFS } from './sim/tracks.js';
import { UPGRADES, DIFF_ORDER, CHAMPIONSHIP_REWARDS, lapMult } from './progress/economy.js';
import { RARITIES, CATEGORIES, SWATCHES, ITEM, PREMIUM_LABEL } from './progress/catalog.js';
import { STAT_ROWS } from './progress/upgrades.js';
import { hueOf, lightOf } from './progress/customize.js';
import { fmtCR, fmtST, fmtCur, unlockText } from './progress/index.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = n => Math.round(n).toLocaleString('en-US');
const num = v => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(Math.abs(v) < 10 ? 2 : 1) : typeof v === 'number' ? n0(v) : String(v)); // stat values keep their decimals
export const DIFF_LABEL = { rookie: 'Rookie', pro: 'Pro', ace: 'Ace' };
const RAR = Object.fromEntries(RARITIES.map(r => [r.id, r]));
const trackName = id => (TRACK_DEFS.find(d => d.id === id) || { name: id }).name;
const g = (arg, label, o = {}) => `<button class="${o.cls || 'btn sm'}" data-act="g" data-arg="${esc(arg)}"${o.pressed != null ? ` aria-pressed="${o.pressed}"` : ''}${o.disabled ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${label}</button>`;
const gseg = (opts, cur, cls = '') => `<div class="seg ${cls}" role="group">${opts.map(([arg, l, v]) => `<button data-act="g" data-arg="${esc(arg)}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;

export const walletHTML = w => `<div class="wallet" aria-label="Balance: ${n0(w.CR)} credits, ${n0(w.ST)} style tokens"><span class="cr"><b>${n0(w.CR)}</b> CR</span><span class="st"><b>${n0(w.ST)}</b> ST</span></div>`;
const price = it => it.currency ? `<span class="price ${it.currency === 'ST' ? 'st' : 'cr'}">${fmtCur(it.currency, it.price)}</span>` : '';
const rarity = it => `<span class="rar" style="--rc:${RAR[it.rarity].color}">${RAR[it.rarity].name}</span>`;
function badge(s) {
  if (s.status === 'premium') return `<span class="badge prem">${PREMIUM_LABEL}</span>`;
  if (s.status === 'equipped') return '<span class="badge eq">Equipped</span>';
  if (s.status === 'owned') return '<span class="badge own">Owned</span>';
  if (s.status === 'buy') return price(s);
  return `<span class="badge lock">Locked</span>`;
}

// ---------------- garage frame ----------------
export function garageHTML(v) {
  const s = v.ship, tabs = [['ship', 'Ship'], ['upgrades', 'Upgrades'], ['paint', 'Paint'], ['inventory', 'Inventory'], ['shop', 'Shop']];
  const lv = Object.values(v.upgrades).reduce((a, b) => a + b, 0);
  return `<div class="col gcol">
    <div class="ghead">
      <div class="row between"><h3>Garage · ship ${v.idx + 1} of ${SHIPS.length}</h3>${walletHTML(v.wallet)}</div>
      <div class="shipnav"><button class="arrow" data-act="ship" data-arg="-1" aria-label="Previous ship">‹</button>
        <div><h2>${esc(s.name)}</h2><div class="row" style="margin-top:8px"><span class="chip">${esc(s.cls)}</span><span class="chip amber">Upgrades ${lv}/${UPGRADES.categories.length * UPGRADES.maxLevel}</span></div></div>
        <button class="arrow" data-act="ship" data-arg="1" aria-label="Next ship">›</button></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="g" data-arg="tab:${k}" aria-selected="${v.tab === k}">${l}${k === 'paint' && v.dirty ? ' <i class="dot" title="Unapplied changes"></i>' : ''}</button>`).join('')}</div>
    </div>
    <div class="gbody">${v.body}</div>
    <div class="actbar">${v.bar || ''}
      <div class="notice ${v.notice ? v.notice.cls || '' : ''}" role="status" aria-live="polite">${v.notice ? esc(v.notice.text) : ''}</div>
      ${v.leaving ? `<div class="panel leavebar"><span>You have paint changes that are not applied.</span><div class="row">${g('leave:apply', 'Apply and continue', { cls: 'btn sm primary', disabled: !v.canApply })}${g('leave:discard', 'Discard changes')}${g('leave:stay', 'Keep editing')}</div>${v.canApply ? '' : '<p class="reason">The preview contains locked items, so it cannot be applied.</p>'}</div>` : ''}
      <div class="row gfoot">${v.fly ? `<button class="btn primary" data-act="shipOk">Fly the ${esc(s.name)}</button>` : '<button class="btn primary" data-act="g" data-arg="done">Done</button>'}<button class="btn" data-act="back">Back</button></div></div>
    <div class="foot">← → ship · Q / E or LB / RB tabs · drag the ship (or [ ]) to turn it</div>
  </div><div class="dragzone" data-drag aria-hidden="true"></div>`;
}

// ---------------- Ship ----------------
export function tabShip(v) {
  const s = v.ship, e = v.eff, cust = v.custom, vals = { SPEED: d => Math.round(d.maxSpeed * 3.6), ACCEL: d => +d.accel.toFixed(1), HANDLING: d => d.yawRate.toFixed(2), BOOST: d => Math.round(d.boostCap), ARMOUR: d => Math.round(d.hull) };
  const bars = STAT_BARS.map(([l, f]) => { const b = Math.max(0.08, Math.min(1, f(s))), x = Math.max(b, Math.min(1, f(e)));
    return `<span>${l}</span><i><b style="width:${Math.round(b * 100)}%"></b>${x > b + 0.002 ? `<u style="left:${(b * 100).toFixed(1)}%;width:${((x - b) * 100).toFixed(1)}%"></u>` : ''}</i><em>${vals[l](e)}${x > b + 0.002 ? '<small>▲</small>' : ''}</em>`; }).join('');
  const nm = id => ITEM[id] ? ITEM[id].name : '—';
  return `<p class="lede">${esc(s.desc)}</p>
    <div class="panel stats up">${bars}</div>
    <p class="lede small">Cyan is the factory spec; amber shows what your upgrades add. Upgrades change the real flight model; paint never does.</p>
    <div class="panel kv"><div><span>Paint</span><b>${cust.paint ? esc(nm(cust.paint)) : '<i class="swatch" style="background:' + cust.primary + '"></i>' + cust.primary}</b></div><div><span>Pattern</span><b>${esc(nm(cust.pattern))}</b></div>
      <div><span>Finish</span><b>${esc(nm(cust.finish))}</b></div><div><span>Exhaust · contrails</span><b>${esc(nm(cust.exhaust))} · ${esc(nm(cust.trail))}</b></div></div>
    <div class="row">${g('tab:upgrades', 'Upgrade this ship')}${g('tab:paint', 'Paint this ship')}</div>`;
}

// ---------------- Upgrades ----------------
export function tabUpgrades(v) {
  const rows = v.rows.map(r => {
    const c = r.cat, key = `up:${c.id}:${r.level}`, armed = v.armed === key, maxed = r.level >= r.max;
    const pips = Array.from({ length: r.max }, (_, k) => `<i class="${k < r.level ? 'on' : k === r.level ? 'next' : ''}"></i>`).join('');
    const eff = maxed ? `${r.label} ${num(r.now)} ${r.unit} · maximum` : `${r.label} ${num(r.now)} → <b>${num(r.next)}</b> ${r.unit}`;
    const btn = maxed ? '<span class="badge own">MAX</span>' : g(key, armed ? `Confirm · ${fmtCR(r.cost)}` : `Upgrade · ${fmtCR(r.cost)}`, { cls: `btn sm buy${armed ? ' armed' : ''}`, disabled: !r.ok, title: r.reason || `Leaves ${fmtCR(r.after)}` });
    return `<div class="upg"><div class="uh"><b>${esc(c.name)}</b><span class="pips" aria-label="Level ${r.level} of ${r.max}">${pips}</span><em>Lv ${r.level}/${r.max}</em></div>
      <div class="ud">${esc(c.desc)}</div><div class="ue"><span>${eff}</span>${btn}</div>
      <div class="ur">${maxed ? 'Fully upgraded.' : r.ok ? `${armed ? 'Press again to confirm. ' : ''}Leaves ${fmtCR(r.after)} · ${r.max - r.level} level${r.max - r.level > 1 ? 's' : ''} left` : `<span class="reason">${esc(r.reason)}</span>`}</div></div>`;
  }).join('');
  const table = `<table class="res stattab"><tr><th>STAT</th><th>FACTORY</th><th>NOW</th></tr>${STAT_ROWS.map(([l, f, u]) => { const a = f(v.ship), b = f(v.eff);
    return `<tr><td>${l}</td><td class="n">${a}${u ? ' ' + u : ''}</td><td class="n${String(a) !== String(b) ? ' upv' : ''}">${b}${u ? ' ' + u : ''}</td></tr>`; }).join('')}</table>`;
  return `<div class="row between"><p class="lede small">Costs ${UPGRADES.costs.map(c => n0(c)).join(' / ')} CR per level. Each ship keeps its own upgrades.</p></div>
    <div class="upgs">${rows}</div><details class="panel"><summary>Factory and current stats</summary><div class="tablewrap">${table}</div></details>`;
}

// ---------------- Paint ----------------
function colourSlot(v) {
  const slot = v.slot, hex = v.draft[slot], hue = hueOf(hex), light = lightOf(hex);
  const paints = v.paints.map(s => g(`paint:${s.id}`, `${esc(s.name)}${s.unlocked ? '' : ' 🔒'}`, { cls: 'chipbtn', pressed: v.draft.paint === s.id, title: s.unlocked ? s.desc : `${s.reason || 'Locked'} — preview only` })).join('');
  return `<div class="slots">${['primary', 'secondary', 'accent'].map(k => `<button class="slot" data-act="g" data-arg="slot:${k}" aria-pressed="${slot === k}"><i class="swatch" style="background:${v.draft[k]}"></i>${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <p class="lede small">${{ primary: 'Main hull paint. Patterns are drawn on it.', secondary: 'Engine housings, canopy frames, ventral plates and booms (and the Wisp ring and Corsair hull); also the second colour of every pattern.', accent: 'Fins, wing strakes and control surfaces, the race-number band, engine glow, and pattern pinstripes.' }[slot]}</p>
    ${slot === 'primary' ? `<div class="paints"><span class="lab">Special paint</span>${g('paint:none', 'None', { cls: 'chipbtn', pressed: !v.draft.paint })}${paints}</div>` : ''}
    <div class="swatches" role="group" aria-label="Colour palette">${SWATCHES.map(([n, h]) => `<button class="sw" data-act="g" data-arg="sw:${h}" style="--c:${h}" title="${n}" aria-label="${n}" aria-pressed="${h === hex}"></button>`).join('')}</div>
    <label class="setting"><span>Hue</span><input type="range" class="hue" data-gin="hue" min="0" max="359" step="1" value="${hue}" aria-label="Hue"></label>
    <label class="setting"><span>Shade</span><input type="range" class="shade" data-gin="light" min="0.04" max="0.96" step="0.01" value="${light}" style="--c:${hex}" aria-label="Shade"></label>
    <div class="setting"><span>Hex <i class="swatch" id="curSw" style="background:${hex}"></i></span><span class="row"><input type="text" class="hex" data-gin="hex" maxlength="7" value="${hex}" spellcheck="false" aria-label="Hex colour">${g('hex', 'Set')}</span></div>
    ${slot === 'primary' && v.draft.paint ? '<p class="reason">A special paint is fitted: it replaces the primary colour. Choose “None” to paint a plain colour.</p>' : ''}`;
}
const itemCard = (s, arg, sel) => `<button class="icard${s.unlocked ? '' : ' locked'}" data-act="g" data-arg="${arg}" aria-pressed="${sel}" title="${esc(s.unlocked ? s.desc : (s.reason || '') + ' — preview only')}">
  <span class="nm">${esc(s.name)}</span>${rarity(s)}<span class="st">${s.unlocked ? (sel ? 'Fitted' : 'Owned') : s.status === 'buy' ? price(s) : '🔒 Locked'}</span></button>`;
export function tabPaint(v) {
  const sec = v.section, secs = [['colors', 'Colours'], ['pattern', 'Pattern'], ['finish', 'Finish'], ['effects', 'Effects']];
  let body = '';
  if (sec === 'colors') body = colourSlot(v);
  else if (sec === 'pattern') body = `<div class="icards">${v.items.pattern.map(s => itemCard(s, `pick:${s.id}`, v.draft.pattern === s.id)).join('')}</div>`;
  else if (sec === 'finish') body = `<div class="icards">${v.items.finish.map(s => itemCard(s, `pick:${s.id}`, v.draft.finish === s.id)).join('')}</div>`;
  else body = `<h3>Exhaust</h3><div class="icards">${v.items.exhaust.map(s => itemCard(s, `pick:${s.id}`, v.draft.exhaust === s.id)).join('')}</div>
    <h3 style="margin-top:12px">Contrails</h3><div class="icards">${v.items.trail.map(s => itemCard(s, `pick:${s.id}`, v.draft.trail === s.id)).join('')}</div>`;
  const locked = v.lockedInDraft;
  return `${gseg(secs.map(([k, l]) => [`psec:${k}`, l, k]), sec, 'wide')}
    <div class="pbody">${body}</div>
    <div class="viewbar"><span class="lab">View</span>${gseg([['view:front', 'Front', 'front'], ['view:side', 'Side', 'side'], ['view:rear', 'Rear', 'rear'], ['view:top', 'Top', 'top'], ['view:34', '3/4', '34'], ['view:auto', 'Spin', 'auto']], v.view, 'sm')}
      <label class="zoom"><span class="lab">Zoom</span><input type="range" data-gin="zoom" min="0.55" max="1.3" step="0.01" value="${v.zoom}" aria-label="Zoom"></label>
      ${g('cmp', v.compare ? 'Showing saved · back to preview' : 'Compare with saved', { cls: 'btn sm', pressed: v.compare, disabled: !v.dirty })}</div>
    <div class="panel pstate">${v.dirty ? `<b>Preview</b> — ${v.changes} change${v.changes > 1 ? 's' : ''} not applied yet.` : '<b>Saved</b> — this is the paint job you race with.'}
      ${locked.length ? `<p class="reason">Locked items in the preview: ${locked.map(s => `${esc(s.name)} (${esc(s.reason || 'locked')})`).join('; ')}. Unlock them in the Shop to apply.</p>` : ''}</div>`;
}
// Apply / Revert / Factory colours sit in the garage's action bar, so they stay in view while the paint options scroll
export function paintActions(v) {
  return `<div class="row">${g('apply', v.dirty ? `Apply paint job · ${v.changes} change${v.changes > 1 ? 's' : ''}` : 'Apply paint job', { cls: 'btn sm primary', disabled: !v.dirty || v.locked > 0, title: v.locked ? 'Unlock the locked items in the preview first' : '' })}${g('revert', 'Revert', { disabled: !v.dirty })}${g('factory', 'Factory colours')}</div>`;
}

// ---------------- Inventory ----------------
export function tabInventory(v) {
  const f = v.filters, cats = [['all', 'All'], ...CATEGORIES.map(c => [c.id, c.id === 'premium' ? 'Premium' : c.name.replace('Special ', '')])];
  const rows = v.list.map(s => {
    const acts = [];
    if (s.status === 'premium') acts.push('<span class="reason">Not available in this version.</span>');
    else { if (s.unlocked) acts.push(s.equipped ? (s.id === v.defaults[s.slot] ? '' : g(`unequip:${s.slot}`, 'Unequip')) : g(`equip:${s.id}`, 'Equip'));
      if (!s.equipped) acts.push(g(`try:${s.id}`, 'Preview'));
      if (s.status === 'buy') acts.push(g(`goshop:${s.id}`, 'Shop'));
      if (s.status === 'locked') acts.push(`<span class="reason">${esc(s.reason)}</span>`); }
    return `<div class="irow${s.unlocked ? '' : ' locked'}"><div class="ii"><b>${esc(s.name)}</b> ${rarity(s)}<span class="cat">${esc((CATEGORIES.find(c => c.id === s.category) || {}).name || '')}</span><p>${esc(s.desc)}</p></div><div class="ia">${badge(s)}<div class="row">${acts.join('')}</div></div></div>`;
  }).join('') || '<p class="lede">Nothing matches these filters.</p>';
  return `<div class="filters">${gseg(cats.map(([k, l]) => [`f:cat:${k}`, l, k]), f.category, 'sm')}
    ${gseg([['f:rar:all', 'Any rarity', 'all'], ...RARITIES.map(r => [`f:rar:${r.id}`, r.name, r.id])], f.rarity, 'sm')}
    ${gseg([['f:st:all', 'All', 'all'], ['f:st:unlocked', 'Unlocked', 'unlocked'], ['f:st:locked', 'Locked', 'locked'], ['f:st:equipped', 'Equipped', 'equipped']], f.status, 'sm')}</div>
    <p class="lede small">${v.owned} of ${v.total} cosmetics unlocked. Equip applies to the ${esc(v.ship.name)} and is saved at once. Cosmetics never change performance.</p>
    <div class="ilist">${rows}</div>`;
}

// ---------------- Shop ----------------
export function tabShop(v) {
  const cards = v.list.map(s => `<button class="icard${s.unlocked ? '' : ' locked'}${s.status === 'premium' ? ' prem' : ''}" data-act="g" data-arg="sel:${s.id}" aria-pressed="${v.sel === s.id}">
    <span class="nm">${esc(s.name)}</span>${rarity(s)}<span class="st">${s.status === 'premium' ? 'Coming soon' : s.unlocked ? 'Owned' : s.status === 'buy' ? price(s) : '🔒 Earned in play'}</span></button>`).join('');
  let detail = '<p class="lede small">Select an item to see what it costs and what you will have left.</p>';
  const s = v.selItem;
  if (s) {
    let act = '';
    if (s.status === 'premium') act = `<p class="prem-note"><b>${PREMIUM_LABEL}</b><br>This is a placeholder for a possible future premium catalog. It cannot be bought, unlocked or equipped in this version, and nothing here involves real money.</p>`;
    else if (s.unlocked) act = `<div class="row"><span class="badge own">Owned</span>${s.equipped ? '<span class="badge eq">Equipped</span>' : g(`equip:${s.id}`, `Equip on ${esc(v.ship.name)}`, { cls: 'btn sm primary' })}</div>`;
    else if (s.status === 'buy') { const have = v.wallet[s.currency], key = `buy:${s.id}`, armed = v.armed === key;
      act = `<div class="buyline"><span>Cost ${price(s)}</span><span>You have <b class="${s.currency === 'ST' ? 'st' : 'cr'}">${fmtCur(s.currency, have)}</b></span>${s.canBuy ? `<span>After: <b>${fmtCur(s.currency, have - s.price)}</b></span>` : ''}</div>
        <div class="row">${g(key, armed ? `Confirm: spend ${fmtCur(s.currency, s.price)}` : `Unlock for ${fmtCur(s.currency, s.price)}`, { cls: `btn sm buy${armed ? ' armed' : ''}`, disabled: !s.canBuy })}${armed ? g('cancel', 'Cancel') : ''}${g(`try:${s.id}`, 'Preview on ship')}</div>
        ${s.canBuy ? (armed ? '<p class="lede small">Press confirm to spend the in-game currency shown.</p>' : '') : `<p class="reason">${esc(s.reason)}</p>`}`; }
    else act = `<p class="reason">Earned by playing: ${esc(s.reason)}</p><div class="row">${g(`try:${s.id}`, 'Preview on ship')}</div>`;
    detail = `<div class="dh"><b>${esc(s.name)}</b>${rarity(s)}<span class="cat">${esc(s.class === 'premium' ? 'Premium' : s.class === 'special' ? 'Special' : 'Earnable')}</span></div><p>${esc(s.desc)}</p>${act}`;
  }
  return `${gseg(v.cats.map(c => [`scat:${c.id}`, c.id === 'premium' ? 'Premium — Coming Soon' : c.name, c.id]), v.cat, 'sm wrap')}
    <div class="panel detail">${detail}</div><div class="icards">${cards}</div>
    <p class="lede small">Credits and Style Tokens are earned in races and cannot be bought. The shop has no real-money purchases.</p>`;
}

// ---------------- results: reward panel ----------------
export function rewardHTML(r, wallet) {
  if (!r) return '';
  if (!r.ok) return `<div class="panel rewards"><h3>Reward</h3><p class="reason">${esc(r.duplicate ? 'This race was already paid.' : r.message || 'No reward.')}</p></div>`;
  const cr = r.lines.filter(l => l.CR), st = r.lines.filter(l => l.ST);
  return `<div class="panel rewards"><div class="rw-top"><span>${esc(cr[0] ? cr[0].name : 'Reward')}</span><b class="cr">+${fmtCR(r.credits)}</b></div>
    <div class="rw-parts">${r.parts.map(([l, x], k) => `${k ? '<i>×</i>' : ''}<span>${esc(l)} <b>${typeof x === 'number' && x < 10 ? x.toFixed(2) : n0(x)}</b></span>`).join('')}</div>
    ${st.map(l => `<div class="rw-line"><span>${esc(l.name)}</span><b class="st">+${fmtST(l.ST)}</b></div>`).join('')}
    ${(r.unlocks || []).map(id => `<div class="rw-line"><span>Unlocked: ${esc(ITEM[id].name)}</span><b class="good">NEW</b></div>`).join('')}
    <div class="rw-bal"><span>Balance</span>${walletHTML(wallet)}</div>${r.saved === false ? '<p class="reason">This browser would not let the game save: your career lasts until the page is closed.</p>' : ''}</div>`;
}

// ---------------- championship ----------------
export function ladderHTML(champs, cur, laps) {
  return `<div class="ladder">${DIFF_ORDER.map((d, k) => { const open = champs.unlocked.includes(d), done = champs.completed[d] || 0, prev = DIFF_ORDER[k - 1];
    const bonus = Math.round(CHAMPIONSHIP_REWARDS.completion[d] * lapMult(laps));
    return `<button class="rung" data-act="diff" data-arg="${d}" aria-pressed="${cur === d}"${open ? '' : ' disabled'}><b>${DIFF_LABEL[d]}</b>
      <span>${open ? (done ? `Completed ×${done}${champs.titles[d] ? ` · titles ×${champs.titles[d]}` : ''}` : 'Unlocked') : `🔒 Complete ${DIFF_LABEL[prev]} first`}</span>
      <em>Completion bonus ${fmtCR(bonus)} · +${CHAMPIONSHIP_REWARDS.tokens.completion[d]} ST</em></button>`; }).join('')}</div>`;
}
export function runTable(results, total) {
  return `<table class="res"><tr><th>RND</th><th>COURSE</th><th>POS</th><th>PTS</th><th>CREDITS</th></tr>${results.map(r => `<tr><td class="p">${r.round + 1}</td><td>${esc(trackName(r.track))}</td><td class="n">P${r.place}</td><td class="n">${r.points}</td><td class="n">${fmtCR(r.credits)}</td></tr>`).join('')}
    ${total != null ? `<tr class="sum"><td></td><td>Race rewards</td><td></td><td></td><td class="n"><b>${fmtCR(total)}</b></td></tr>` : ''}</table>`;
}
export function champHubHTML(v) {
  const st = v.standings, done = v.final, run = v.run;
  const table = `<div class="tablewrap panel"><table class="res"><tr><th>POS</th><th>PILOT</th><th>WINS</th><th>POINTS</th></tr>
    ${st.map((e, k) => `<tr class="${e.name === 'YOU' ? 'me' : ''}"><td class="p">${k + 1}</td><td>${esc(e.name)}</td><td class="n">${e.wins}</td><td class="n"><b>${e.points}</b></td></tr>`).join('')}</table></div>`;
  if (!done) return `<div class="col center" style="width:min(900px,100%)"><div class="row between"><h3>${DIFF_LABEL[run.diff]} Championship · after round ${run.round} of ${CHAMPIONSHIP.length} · ${run.laps} lap${run.laps > 1 ? 's' : ''}</h3>${walletHTML(v.wallet)}</div>
    <h2>Standings</h2><div class="split2">${table}<div class="panel"><h3>This run so far</h3>${runTable(run.results, run.credits.races)}<p class="lede small">Finish all ${CHAMPIONSHIP.length} rounds for the completion bonus of ${fmtCR(v.bonus)} plus a final-standing bonus.</p></div></div>
    <div class="actbar"><div class="row">${v.next ? `<button class="btn primary" data-act="nextRound">Round ${run.round + 1}: ${esc(trackName(v.next))}</button>` : ''}<button class="btn" data-act="menu">Save and exit</button>
      ${v.armedAbandon ? '<button class="btn danger" data-act="champAbandon" data-arg="confirm">Confirm: abandon this run</button>' : '<button class="btn" data-act="champAbandon">Abandon run</button>'}</div></div>
    <p class="lede small">Your progress in this championship is saved after every round; you can leave and continue it later from the main menu.</p></div>`;
  const c = v.completion, s = c.run, credits = s.credits;
  const head = c.standing === 1 ? 'You are champion' : `${esc(st[0].name)} takes the title`;
  return `<div class="col center" style="width:min(980px,100%)"><div class="row between"><h3>${DIFF_LABEL[s.diff]} Championship · complete · ${s.laps} lap${s.laps > 1 ? 's' : ''} per round</h3>${walletHTML(v.wallet)}</div>
    <h2>${head}</h2>
    ${c.newlyUnlocked ? `<div class="unlockbar"><b>${DIFF_LABEL[c.newlyUnlocked]} Championship unlocked</b><span>${c.newlyUnlocked === 'ace' ? 'Ace is the highest difficulty.' : 'The next step on the ladder is open.'}</span></div>` : c.isHighest ? '<div class="unlockbar ace"><b>Ace completed</b><span>Ace is the highest championship difficulty. Replay any championship to earn its rewards again.</span></div>' : ''}
    <div class="split2">${table}
      <div class="panel"><h3>This run</h3><div class="kv"><div><span>Completion</span><b class="good">Completed</b></div><div><span>Final standing</span><b>P${c.standing} of ${st.length} · ${s.points} pts</b></div></div>
        ${runTable(s.results, credits.races)}
        <div class="rw-line"><span>Completion bonus (${DIFF_LABEL[s.diff]}, ${s.laps} lap${s.laps > 1 ? 's' : ''})</span><b class="cr">+${fmtCR(credits.completion)}</b></div>
        <div class="rw-line"><span>Final-standing bonus (P${c.standing}${c.standingShare ? `, ${Math.round(c.standingShare * 100)}%` : ''})</span><b class="cr">+${fmtCR(credits.standing)}</b></div>
        ${c.bonusTokens ? `<div class="rw-line"><span>Championship Style Tokens</span><b class="st">+${fmtST(c.bonusTokens)}</b></div>` : ''}
        ${(c.unlocks || []).map(id => `<div class="rw-line"><span>Unlocked: ${esc(ITEM[id].name)}</span><b class="good">NEW</b></div>`).join('')}
        <div class="rw-top"><span>Total from this championship</span><b class="cr">${fmtCR(credits.total)}</b></div>
        <div class="rw-bal"><span>Balance now</span>${walletHTML(v.wallet)}</div></div></div>
    <div class="panel career-line"><h3>Career (all runs)</h3><span>Rookie ×${v.champs.completed.rookie} · Pro ×${v.champs.completed.pro} · Ace ×${v.champs.completed.ace} completed</span><span>Titles: ${v.champs.titles.rookie + v.champs.titles.pro + v.champs.titles.ace}</span><span>Lifetime credits earned ${fmtCR(v.earned.CR)}</span></div>
    <div class="actbar"><div class="row"><button class="btn primary" data-act="menu">Main menu</button><button class="btn" data-act="garage">Garage</button></div></div></div>`;
}

// ---------------- career ----------------
export function careerHTML(c) {
  const S = c.stats, pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const modeRows = [['quick', 'Quick race'], ['champ', 'Championship races'], ['trial', 'Time trial']].map(([k, l]) => { const m = S.byMode[k]; return `<tr><td>${l}</td><td class="n">${m.races}</td><td class="n">${k === 'trial' ? '—' : m.wins}</td><td class="n">${k === 'trial' ? '—' : m.podiums}</td><td class="n">${fmtCR(m.credits)}</td></tr>`; }).join('');
  const trackRows = TRACK_DEFS.map(d => { const t = S.byTrack[d.id]; return `<tr><td>${esc(d.name)}</td><td class="n">${t.races}</td><td class="n">${t.wins}</td><td class="n">${t.podiums}</td><td class="n">${t.best ? 'P' + t.best : '—'}</td><td class="n">${fmtCR(t.credits)}</td></tr>`; }).join('');
  const ch = c.champs, hist = c.history.slice(-8).reverse().map(h => `<tr><td>${esc(trackName(h.track))}</td><td>${h.mode === 'trial' ? 'Trial' : h.mode === 'champ' ? 'Champ' : 'Quick'}${h.diff ? ' · ' + DIFF_LABEL[h.diff] : ''}</td><td class="n">${h.laps}</td><td class="n">${h.mode === 'trial' ? '—' : 'P' + h.place}</td><td class="n">+${n0(h.credits)}${h.tokens ? ` · +${h.tokens} ST` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No races yet.</td></tr>';
  const runs = ch.runs.slice(-6).reverse().map(r => `<tr><td>${DIFF_LABEL[r.diff]}</td><td>${r.status === 'completed' ? 'Completed' : 'Abandoned'}</td><td class="n">${r.standing ? 'P' + r.standing : '—'}</td><td class="n">${fmtCR(r.credits.total)}</td></tr>`).join('') || '<tr><td colspan="4">No championships finished yet.</td></tr>';
  return `<div class="col center" style="width:min(1000px,100%)"><div class="row between"><h3>Career</h3>${walletHTML(c.wallet)}</div><h2>Pilot record</h2>
    <div class="kpis"><div class="panel"><span>Races</span><b>${S.races}</b></div><div class="panel"><span>Wins</span><b>${S.wins}</b></div><div class="panel"><span>Podiums</span><b>${S.podiums}</b></div>
      <div class="panel"><span>Credits earned</span><b class="cr">${n0(c.earned.CR)}</b></div><div class="panel"><span>Style Tokens earned</span><b class="st">${n0(c.earned.ST)}</b></div>
      <div class="panel"><span>Upgrades</span><b>${c.upgrades[0]}/${c.upgrades[1]}</b><small>${pct(c.upgrades[0], c.upgrades[1])}%</small></div><div class="panel"><span>Cosmetics</span><b>${c.cosmetics[0]}/${c.cosmetics[1]}</b><small>${pct(c.cosmetics[0], c.cosmetics[1])}%</small></div></div>
    <div class="panel"><h3>Championships</h3>${ladderHTML(ch, null, 3).replace(/data-act="diff"/g, 'data-act="noop"')}</div>
    <div class="split2"><div class="panel tablewrap"><h3>By mode</h3><table class="res"><tr><th>MODE</th><th>RACES</th><th>WINS</th><th>PODIUMS</th><th>CREDITS</th></tr>${modeRows}</table></div>
      <div class="panel tablewrap"><h3>By course</h3><table class="res"><tr><th>COURSE</th><th>RACES</th><th>WINS</th><th>POD.</th><th>BEST</th><th>CREDITS</th></tr>${trackRows}</table></div></div>
    <div class="split2"><div class="panel tablewrap"><h3>Recent races</h3><table class="res"><tr><th>COURSE</th><th>MODE</th><th>LAPS</th><th>POS</th><th>EARNED</th></tr>${hist}</table></div>
      <div class="panel tablewrap"><h3>Championship runs</h3><table class="res"><tr><th>LEVEL</th><th>RESULT</th><th>STANDING</th><th>CREDITS</th></tr>${runs}</table></div></div>
    <p class="lede small">Career data is saved in this browser only (no cloud sync). Currencies are earned by playing; there are no real-money purchases.</p>
    <div class="actbar"><div class="row"><button class="btn primary" data-act="back" data-arg="title">Done</button></div></div></div>`;
}
