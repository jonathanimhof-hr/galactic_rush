// GALACTIC RUSH V12 — accounts end to end in the built game, in a real browser (Chromium via Playwright): separate
// browser profiles are separate devices. The game page is served over HTTP with its config.js; the V12 server runs
// with the account API; Google's services are the local stand-in (fakegoogle.mjs, the same paths as Firebase's
// emulators). Through the game's own account screens: registration, the verification email, bringing a device's
// career to the account (checked and verified on the server), purchases and a race paid by the server, the same
// account on a second device, a third device with a different career (the conflict choice), offline behaviour,
// wrong passwords, password reset (old sessions end), log-out, and that no password or ID token is ever kept in the
// browser's storage. Screenshots go to OUTDIR for review.
// usage: node tests/account/e2e.mjs [OUTDIR]        (after node build.mjs)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { startFakeGoogle, testServiceAccount } from './fakegoogle.mjs';
import { createTokenVerifier, createServiceAuth, parseServiceAccount } from '../../server/account/google.mjs';
import { FirestoreDb } from '../../server/account/firestore.mjs';
import { PlayerService } from '../../server/account/players.mjs';
import { startServer } from '../../server/index.mjs';
import { Progression } from '../../src/progress/index.js';
import { MemoryStorage } from '../../src/progress/store.js';
import { progressDigest } from '../../src/account/rules.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || '/tmp/gr-account-e2e', ROOT = new URL('../../', import.meta.url);
const PROJECT = 'gr-e2e', SA = testServiceAccount(PROJECT), PW = 'E2e-only-' + Math.random().toString(36).slice(2, 9) + '7', PW2 = 'E2e-new-' + Math.random().toString(36).slice(2, 9) + '3';
const EMAIL = `pilot.${Date.now().toString(36)}@example.test`;
const checks = []; let failed = 0;
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const silent = { debug() {}, info() {}, warn() {}, error: (...a) => console.error('server:', ...a) };

// a career as the game makes it (races through the game's own Progression)
function career(races, upgrade) {
  let t = 1_750_000_000_000; const P = new Progression(new MemoryStorage(), { now: () => (t += 90e3) });
  for (let k = 0; k < races; k++) P.completeRace({ finished: true, raceId: P.newRaceId(), mode: 'quick', track: k % 2 ? 'belt' : 'spire', diff: 'pro', laps: 3, ship: 'kestrel', place: 1 + (k % 4), field: 6, time: 130, record: false });
  if (upgrade) P.buyUpgrade('kestrel', 'boost', 0);
  return JSON.parse(JSON.stringify(P.profile));
}

await mkdir(OUT, { recursive: true });
const G = await startFakeGoogle({ projectId: PROJECT, serviceAccounts: [SA] });
const db = new FirestoreDb({ projectId: PROJECT, accessToken: createServiceAuth({ credentials: parseServiceAccount(JSON.stringify(SA)), tokenUrl: G.oauthUrl }), baseUrl: G.firestoreUrl });
const players = new PlayerService({ db, log: silent });
// the game page and its config.js
const html = await readFile(new URL('dist/site/index.html', ROOT), 'utf8');
let pagePort = 0, srvPort = 0;
const pages = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(`window.GALACTIC_RUSH_CONFIG = ${JSON.stringify({ multiplayerServer: `ws://127.0.0.1:${srvPort}`, firebase: { apiKey: G.apiKey, projectId: PROJECT, authEmulator: G.base } })};`); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
await new Promise(r => pages.listen(0, '127.0.0.1', r)); pagePort = pages.address().port;
const ORIGIN = `http://127.0.0.1:${pagePort}`;
const srv = startServer({ PORT: '0', HOST: '127.0.0.1', TOKEN_SECRET: 'e2e-secret-0123456789abcdef0123456789', ALLOWED_ORIGINS: ORIGIN }, { log: silent, accounts: { verify: createTokenVerifier({ projectId: PROJECT, certsUrl: G.certsUrl }), players } });
srvPort = await srv.ready;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function device(name, seed = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (seed) await ctx.addInitScript(([p, save]) => { if (!localStorage.getItem('galactic-rush.profile.v12')) { localStorage.setItem('galactic-rush.profile.v12', JSON.stringify(p)); localStorage.setItem('galactic-rush.v12', JSON.stringify(save)); } }, seed);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.goto(`${ORIGIN}/?nointro&quality=low`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 120000 });
  // software WebGL is slow and the 3D scene does not matter here: the game runs, the GPU draw is switched off
  await page.evaluate(() => { const g = __game.gfx; g._render = g.render; g.render = () => {}; });
  return { name, ctx, page, ev: (fn, arg) => page.evaluate(fn, arg) };
}
const acct = d => d.ev(() => { const a = __game.account; return { state: a.state, sync: a.sync, online: a.online, queue: a.queue.length + a.finishes.length, notice: a.notice && a.notice.text, CR: __game.progress.wallet().CR, cloud: !!__game.progress.cloud }; });
const waitAcct = (d, pred, ms = 30000) => d.page.waitForFunction(p => { const a = __game.account; return new Function('a', 'P', 'return ' + p)(a, __game.progress); }, pred, { timeout: ms });
// the screens slide in with a CSS animation; a busy headless page can hand the screenshot the animation's first frame
// (an empty menu) although the screen is there, so the screenshot finishes running animations first
const shot = async (d, f) => { await d.page.bringToFront(); await sleep(800); await d.page.screenshot({ path: `${OUT}/${f}.png`, timeout: 180000, animations: 'disabled' }); };
const openAccount = async d => { await d.ev(() => __game.action('acct', 'open:title')); await d.page.waitForSelector('#ui .acct'); };
async function form(d, tab, fields, submit) {
  await openAccount(d); if (tab) await d.page.click(`[data-act="acct"][data-arg="tab:${tab}"]`);
  for (const [sel, v] of Object.entries(fields)) await d.page.fill(sel, v);
  await d.page.click(`[data-act="acct"][data-arg="${submit}"]`);
}
const storageLeak = d => d.ev(([pw1, pw2]) => { const all = Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\n') + Object.keys(sessionStorage).map(k => k + '=' + sessionStorage.getItem(k)).join('\n');
  return { password: all.includes(pw1) || all.includes(pw2), idToken: /eyJhbGciOiJSUzI1Ni/.test(all), refresh: all.includes('refreshToken') }; }, [PW, PW2]);

try {
  // ---------- device A: a career played as a guest, then an account ----------
  const seedA = career(6, true), ghostF = Array.from({ length: 700 }, (_, k) => [k * 0.5, 1, 2, 0, 0, 0, 1]);
  const A = await device('A', [seedA, { settings: {}, best: { 'spire~relaxed': { lap: 34.5, ship: 'kestrel' } }, ghosts: { 'spire~relaxed': { lap: 34.5, ship: 'kestrel', f: ghostF } } }]);
  check('device A starts as a guest with its own career', (await acct(A)).state === 'guest' && (await acct(A)).CR === seedA.wallet.CR);
  await shot(A, '01-title-guest');
  await form(A, 'register', { '#acct-email': EMAIL, '#acct-pw': 'short', '#acct-pw2': 'short' }, 'register');
  check('a weak password is refused before anything is sent', /at least 8/.test((await acct(A)).notice || ''));
  await A.page.fill('#acct-pw', PW); await A.page.fill('#acct-pw2', PW + 'x'); await A.page.click('[data-act="acct"][data-arg="register"]');
  check('mismatched passwords are refused', /do not match/.test((await acct(A)).notice || ''));
  await A.page.fill('#acct-pw2', PW); await shot(A, '02-register'); await A.page.click('[data-act="acct"][data-arg="register"]');
  await waitAcct(A, "a.state === 'unverified'");
  check('registration: account created, verification email sent', G.outbox.some(m => m.email === EMAIL && m.type === 'VERIFY_EMAIL'));
  await shot(A, '03-unverified');
  await A.page.click('[data-act="acct"][data-arg="verified"]'); await A.page.waitForFunction(() => !__game.account.busy);
  check('before the link is opened the account stays unverified', (await acct(A)).state === 'unverified');
  await G.click(G.outbox.find(m => m.email === EMAIL && m.type === 'VERIFY_EMAIL').oobCode);
  await A.page.click('[data-act="acct"][data-arg="verified"]'); await waitAcct(A, "a.state === 'deciding'");
  check('verified: the game asks what the new account keeps', (await A.ev(() => __game.account.choice.kind)) === 'new-account');
  await shot(A, '04-new-account-choice');
  await A.page.click('[data-act="acct"][data-arg="choose:import"]'); await waitAcct(A, "a.state === 'ready' && a.sync === 'synced'");
  const uid = await A.ev(() => __game.account.uid), stored = await players.load(uid);
  check('import: the server holds exactly the device\'s career (digest)', stored.exists && progressDigest(stored.view.profile, stored.view.records) === progressDigest(seedA, { 'spire~relaxed': { lap: 34.5 } }), stored.exists && stored.view.profile.wallet.CR);
  check('import: the guest career on the device is untouched', (await A.ev(() => JSON.parse(localStorage.getItem('galactic-rush.profile.v12')).wallet.CR)) === seedA.wallet.CR);
  await sleep(1500); check('import: the record\'s ghost reached the account', (await players.listGhosts(uid)).ghosts.some(g => g.key === 'spire~relaxed'));
  await shot(A, '05-ready');
  // a purchase through the game's career (the garage's call) is applied by the server
  const before = (await players.load(uid)).view.profile;
  const buy = await A.ev(() => { const P = __game.progress, lv = P.profile.ships.lancer.upgrades.engine; return P.buyUpgrade('lancer', 'engine', lv); });
  await waitAcct(A, "a.queue.length === 0 && a.sync === 'synced'");
  const afterBuy = (await players.load(uid)).view.profile;
  check('purchase: applied once on the server with the game\'s price', buy.ok && afterBuy.ships.lancer.upgrades.engine === before.ships.lancer.upgrades.engine + 1 && afterBuy.wallet.CR === before.wallet.CR - buy.cost);
  check('purchase: the device shows the server\'s balance', (await acct(A)).CR === afterBuy.wallet.CR);
  // a race: ticket at the start, paid by the server at the finish (1 lap of Spire: at least its minimum time must pass)
  const rid = await A.ev(() => { const id = __game.progress.newRaceId(); __game.raceId = id; __game.account.raceStarting(id, { mode: 'quick', track: 'spire', diff: 'pro', laps: 1, ship: 'kestrel', field: 6, handling: 'relaxed' }); return id; });
  await waitAcct(A, `a.tickets.get('${rid}') && a.tickets.get('${rid}').status === 'ok'`);
  await sleep(19000);
  await A.ev(f => { __game.save.ghosts['spire~relaxed'] = { lap: 31.5, ship: 'kestrel', f }; }, ghostF.slice(0, 640)); // the race's best lap left a ghost, as a time trial does
  const fin = await A.ev(id => __game.progress.completeRace({ finished: true, raceId: id, mode: 'quick', track: 'spire', diff: 'pro', laps: 1, ship: 'kestrel', place: 1, field: 6, time: 31.5, record: false, bestLap: 31.5, order: [] }), rid);
  await waitAcct(A, 'a.finishes.length === 0 && a.sync === "synced"');
  const afterRace = (await players.load(uid)).view;
  check('race: paid by the server once, best lap filed', fin.ok && fin.pending && afterRace.profile.wallet.CR === afterBuy.wallet.CR + fin.credits && afterRace.records['spire~relaxed'].lap === 31.5, `${afterRace.profile.wallet.CR} vs ${afterBuy.wallet.CR} + ${fin.credits}`);
  const noTicket = await A.ev(() => __game.progress.completeRace({ finished: true, raceId: 'zzzz-zzzz-zz', mode: 'quick', track: 'spire', diff: 'pro', laps: 1, ship: 'kestrel', place: 1, field: 6, time: 31, bestLap: 31, order: [] }));
  check('a race without a ticket is not credited (and says so)', !noTicket.ok && /not credited/.test(noTicket.message));
  const leak1 = await storageLeak(A); check('device A\'s storage holds no password and no ID token', !leak1.password && !leak1.idToken, JSON.stringify(leak1));

  // ---------- device B: the same account, no career of its own ----------
  const B = await device('B');
  await form(B, 'login', { '#acct-email': EMAIL, '#acct-pw': PW + 'wrong' }, 'login');
  await B.page.waitForFunction(() => !__game.account.busy);
  check('a wrong password gets one general message', (await acct(B)).notice === 'Email address or password is not correct.');
  await B.page.click('[data-act="acct"][data-arg="login"]'); await B.page.waitForFunction(() => !__game.account.busy);
  check('a second try right away is slowed down', /Wait \d+ s/.test((await acct(B)).notice || ''));
  await sleep(3200); await B.page.fill('#acct-pw', PW); await B.page.click('[data-act="acct"][data-arg="login"]');
  await waitAcct(B, "a.state === 'ready' && a.sync === 'synced'");
  const bView = await B.ev(() => ({ CR: __game.progress.wallet().CR, eng: __game.progress.profile.ships.lancer.upgrades.engine, rec: __game.save.best['spire~relaxed'] }));
  check('device B: the account\'s career, upgrade and record (cross-device)', bView.CR === afterRace.profile.wallet.CR && bView.eng === afterRace.profile.ships.lancer.upgrades.engine && bView.rec && bView.rec.lap === 31.5);
  await B.page.waitForFunction(() => __game.save.ghosts['spire~relaxed'], null, { timeout: 15000 }).catch(() => {});
  check('device B: the record lap\'s ghost came from the account', await B.ev(() => { const g = __game.save.ghosts['spire~relaxed']; return !!g && g.lap === 31.5 && g.f.length === 640; }));
  // editing this browser's copy of the account's career changes nothing: the copy is replaced by the server's answer
  await B.ev(u => { const k = `galactic-rush.v12.acct.${u}.career`, p = JSON.parse(localStorage.getItem(k)); p.wallet.CR += 999999; p.earned.CR += 999999; p.ships.wisp.upgrades.engine = 5; localStorage.setItem(k, JSON.stringify(p)); }, uid);
  await B.page.reload(); await B.page.waitForFunction(() => window.__game && __game.state === 'title', null, { timeout: 120000 }); await B.ev(() => { const g = __game.gfx; g.render = () => {}; });
  await waitAcct(B, "a.state === 'ready' && a.sync === 'synced' && a.view");
  const srvNow = (await players.load(uid)).view.profile;
  check('an edited copy of the career in the browser is replaced by the account\'s', (await acct(B)).CR === srvNow.wallet.CR && (await B.ev(() => __game.progress.profile.ships.wisp.upgrades.engine)) === srvNow.ships.wisp.upgrades.engine);
  // two devices spend the same credits: the second purchase is refused by the server and undone on screen
  assert.ok((await players.creditTournament(uid, 't00e2e00001', { lines: [{ name: 'Online tournament win', CR: 3000 }] })).ok); // as the multiplayer server pays a tournament
  for (const d of [A, B]) { await d.ev(() => __game.account.refresh()); await waitAcct(d, "a.sync === 'synced' && a.queue.length === 0"); }
  const base = (await players.load(uid)).view.profile.wallet.CR;
  const a1 = await A.ev(() => __game.progress.buyUpgrade('kestrel', 'handling', __game.progress.profile.ships.kestrel.upgrades.handling));
  const b1 = await B.ev(() => __game.progress.buyUpgrade('kestrel', 'handling', __game.progress.profile.ships.kestrel.upgrades.handling)); // B's copy does not know about A's purchase yet
  await waitAcct(A, "a.queue.length === 0 && a.sync === 'synced'"); await waitAcct(B, "a.queue.length === 0 && a.sync === 'synced'");
  const both = (await players.load(uid)).view.profile, bNow = await B.ev(() => ({ CR: __game.progress.wallet().CR, lv: __game.progress.profile.ships.kestrel.upgrades.handling }));
  check('the same purchase from two devices at once is applied once', a1.ok && b1.ok && both.ships.kestrel.upgrades.handling === 1 && both.wallet.CR === base - a1.cost, JSON.stringify({ a1: a1.ok, b1: b1.ok, lv: both.ships.kestrel.upgrades.handling, cr: both.wallet.CR, before: base, cost: a1.cost }));
  check('the refused copy shows the server\'s career afterwards', bNow.CR === both.wallet.CR && bNow.lv === 1);
  // B changes something, A sees it after refreshing
  const item = await B.ev(() => { const row = __game.progress.catalog('kestrel').filter(r => r.canBuy).sort((x, y) => x.price - y.price)[0]; return row ? row.id : null; });
  let bought = null;
  if (item) { bought = await B.ev(id => __game.progress.buyItem(id), item); await waitAcct(B, "a.queue.length === 0 && a.sync === 'synced'"); }
  await B.ev(() => __game.applySettings && (__game.settings.handling = 'classic', __game.applySettings(true))); await sleep(2500);
  await A.ev(() => __game.account.refresh()); await sleep(1500);
  const aNow = await A.ev(() => ({ CR: __game.progress.wallet().CR, items: __game.progress.profile.inventory.unlocked }));
  check('device A sees device B\'s purchase', !item || (bought && bought.ok && aNow.items.includes(item) && aNow.CR === (await players.load(uid)).view.profile.wallet.CR), item || 'no affordable item in the catalogue (skipped)');
  check('settings that follow the player reached the account', (await players.load(uid)).view.settings.handling === 'classic');
  // ---------- offline ----------
  await A.page.route(`http://127.0.0.1:${srvPort}/**`, r => r.abort());
  await A.ev(() => __game.account.refresh()); await waitAcct(A, "a.sync === 'offline'");
  const off = await A.ev(() => __game.progress.buyUpgrade('wisp', 'engine', __game.progress.profile.ships.wisp.upgrades.engine));
  check('offline: purchases are refused with an explanation, nothing changes', !off.ok && off.code === 'offline');
  await A.ev(() => __game.action('back', 'title'));
  const offTitle = await A.ev(() => { const acct = document.querySelector('#ui [data-act="acct"]'); return { title: __game.state === 'title' && !!document.querySelector('#ui .logo'), chip: (document.querySelector('#ui .acct-chip') || {}).textContent || '', line: acct ? acct.textContent : '' }; });
  check('offline: the main menu says so (status chip and Account entry)', offTitle.title && /Offline/.test(offTitle.chip) && /Offline/.test(offTitle.line), JSON.stringify(offTitle));
  await shot(A, '06-title-offline');
  await A.page.unroute(`http://127.0.0.1:${srvPort}/**`); await A.ev(() => __game.account.refresh()); await waitAcct(A, "a.sync === 'synced' && a.online");
  check('back online: synced again', (await acct(A)).online);
  // ---------- device C: a different career, the same account ----------
  const seedC = career(3, false), C = await device('C', [seedC, { settings: {}, best: {}, ghosts: {} }]);
  await form(C, 'login', { '#acct-email': EMAIL, '#acct-pw': PW }, 'login');
  await waitAcct(C, "a.state === 'deciding'");
  check('device C: careers are compared, never merged', (await C.ev(() => __game.account.choice.kind)) === 'both');
  await shot(C, '07-conflict');
  await C.page.click('[data-act="acct"][data-arg="choose:replace"]'); await shot(C, '08-replace-confirm');
  await C.page.click('[data-act="acct"][data-arg="choose:cancel"]');
  await C.page.click('[data-act="acct"][data-arg="choose:account"]'); await waitAcct(C, "a.state === 'ready'");
  check('device C plays the account\'s career; its own stays as the guest career', (await acct(C)).CR === (await players.load(uid)).view.profile.wallet.CR && (await C.ev(() => JSON.parse(localStorage.getItem('galactic-rush.profile.v12')).wallet.CR)) === seedC.wallet.CR);
  // ---------- log-out ----------
  await A.ev(() => __game.account.logout()); await waitAcct(A, "a.state === 'guest'");
  const aGuest = await acct(A);
  check('log-out: device A is back on its untouched guest career', !aGuest.cloud && aGuest.CR === seedA.wallet.CR);
  check('log-out: the session is gone from the browser', await A.ev(() => !localStorage.getItem('galactic-rush.v12.session')));
  // ---------- password reset ends the other sessions ----------
  await form(A, 'reset', { '#acct-email': EMAIL }, 'reset'); await A.page.waitForFunction(() => !__game.account.busy);
  await form(A, 'reset', { '#acct-email': 'nobody.' + EMAIL }, 'reset'); await A.page.waitForFunction(() => !__game.account.busy);
  check('reset: same answer whether or not the address has an account', /If an account exists/.test((await acct(A)).notice || ''));
  const resetMail = G.outbox.find(m => m.email === EMAIL && m.type === 'PASSWORD_RESET'); check('reset: email sent for the real account only', resetMail && !G.outbox.some(m => m.email === 'nobody.' + EMAIL));
  await sleep(1100); await G.click(resetMail.oobCode, PW2);
  await B.ev(() => { __game.account.tok = null; return __game.account.refresh(); }); await waitAcct(B, "a.state === 'guest'");
  check('reset: device B\'s old session ended and it says so', /session ended|Log in again/i.test((await acct(B)).notice || ''));
  await form(B, 'login', { '#acct-email': EMAIL, '#acct-pw': PW }, 'login'); await B.page.waitForFunction(() => !__game.account.busy);
  check('reset: the old password no longer works', (await acct(B)).state === 'guest');
  await sleep(4200); await B.page.fill('#acct-pw', PW2); await B.page.click('[data-act="acct"][data-arg="login"]'); await waitAcct(B, "a.state === 'ready'");
  check('reset: the new password works and the career is all there', (await acct(B)).CR === (await players.load(uid)).view.profile.wallet.CR);
  for (const d of [A, B, C]) { const l = await storageLeak(d); check(`device ${d.name}: no password or ID token in storage`, !l.password && !l.idToken, JSON.stringify(l)); }
  await openAccount(B); await shot(B, '09-account-ready');
} catch (e) { check('the test ran to the end', false, e.stack || e.message); }
finally {
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  await browser.close(); await srv.close(); pages.close(); await G.close();
  process.exit(failed ? 1 : 0);
}
