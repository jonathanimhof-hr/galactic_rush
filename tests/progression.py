"""V7 career, garage and shop, end to end in the built game (headless Chromium, software WebGL). Races are flown by the
autopilot and fast-forwarded with the game's own simulation (__game.ff); everything else goes through the real menus and
buttons. Checks rewards across Rookie, Pro and Ace, repeat rewards, reopening results, reload persistence, the Rookie ->
Pro -> Ace championship ladder with completion bonuses and a replay, upgrades reaching the race physics, shop purchases in
both currencies, paint jobs on the 3D ship (pixels) and in races, premium placeholders, keyboard control, and that the page
makes no network requests besides the font stylesheet.
usage: python3 tests/progression.py BUILD.html [OUTDIR] [--phases=A,B] [--seed=SEED.json]
  phase A: menus, rewards, championships, upgrades; phase B: shop, premium, paint, keyboard, career. Phase B alone starts
  from a career made by tests/seedprofile.mjs (--seed)."""
import sys, json, time, pathlib, math
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
build = pathlib.Path(args[0]).resolve().as_uri(); out = pathlib.Path(args[1] if len(args) > 1 else '/tmp/gr-progress'); out.mkdir(parents=True, exist_ok=True)
PH = opt.get('phases', 'A,B').split(','); SEED = pathlib.Path(opt['seed']).read_text() if 'seed' in opt else None
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
errors, checks, hosts = [], [], set()
def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)
SINGLE = {'base': 150, 'diff': {'rookie': 1.0, 'pro': 1.3, 'ace': 1.6}, 'laps': {1: 0.45, 2: 0.75, 3: 1.0, 5: 1.5}, 'place': [1.25, 1.15, 1.08, 1.0, 0.95, 0.9]}
def single(diff, laps, place): return round(SINGLE['base'] * SINGLE['diff'][diff] * SINGLE['laps'][laps] * SINGLE['place'][place - 1])

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    if SEED and 'A' not in PH: ctx.add_init_script(f"try {{ if (!localStorage.getItem('galactic-rush.profile')) localStorage.setItem('galactic-rush.profile', {json.dumps(SEED)}); }} catch (e) {{}}")
    ctx.on('request', lambda r: hosts.add(urlparse(r.url).scheme + '://' + (urlparse(r.url).hostname or '')))
    pg = ctx.new_page(); pg.set_default_timeout(600000)
    pg.on('pageerror', lambda e: errors.append('pageerror ' + str(e)[:300]))
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text[:300]}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    W = lambda cond, t=600000: pg.wait_for_function(cond, timeout=t)
    def go(q): pg.goto(build + q); W('() => window.__game && window.__game.ready', 300000)
    wallet = lambda: pg.evaluate('() => __game.progress.wallet()')
    def click(sel):  # centre the target first so the sticky action bar of a long screen never covers it (bar buttons are always in view)
        pg.wait_for_selector(sel, state='attached', timeout=60000)
        pg.eval_on_selector(sel, "e => { if (!e.closest('.actbar')) e.scrollIntoView({ block: 'center', inline: 'nearest' }); }")
        pg.click(sel, force=True, timeout=60000)
    def finish_race():  # fast-forward the simulation until the race is over, then wait for the results screen
        pg.evaluate("""() => { const g = __game, live = () => g.scene.kind === 'course' && g.scene.race && !g.scene.attract && g.state !== 'results'; if (g.state === 'intro') g.endIntro();
          for (let k = 0; k < 80 && live() && !g.scene.race.player.finished; k++) g.ff(5); if (live()) g.ff(4); }""")
        W("() => __game.state === 'results' || __game.state === 'champ'")
    def confirm(sel, cond):  # two-press buttons disarm after 6 s and software frames are slow: arm if needed, then confirm at once
        arg = sel.split('data-arg="')[1].split('"')[0]
        for _ in range(4):
            if not pg.evaluate(f"() => __game.garage.armed === {json.dumps(arg)}"): click(sel)
            click(sel)
            try: W(cond, 20000); return True
            except Exception: pass
        return False
    def reward(): return pg.evaluate('() => { const r = __game.result.extra.reward; return r ? { ok: r.ok, code: r.code, credits: r.credits, tokens: r.tokens, place: __game.result.race.player.place, laps: __game.result.race.laps, mode: r.mode, champ: r.champ, completion: r.completion ? { ok: r.completion.ok, newly: r.completion.newlyUnlocked, highest: r.completion.isHighest, total: r.completion.run && r.completion.run.credits.total, standing: r.completion.standing } : null } : null; }')

    if 'A' in PH:
      # ---------- fresh career, title and menus ----------
      go('?quality=low'); W("() => __game.state === 'title'")
      t = pg.inner_text('#ui'); check('fresh career starts at 0 CR / 0 ST and the title shows both balances', wallet() == {'CR': 0, 'ST': 0} and '0 CR' in t.replace('\n', ' ') and 'ST' in t, t[:120].replace('\n', ' '))
      check('title menu has Garage and Career next to the existing modes', all(pg.query_selector(f'#ui [data-act="{a}"]') for a in ['garage', 'career', 'settings', 'controls']) and len(pg.query_selector_all('#ui [data-act="mode"]')) == 3)
      pg.screenshot(path=str(out / 'title.png'))

      # ---------- single race through the menus (Rookie, 1 lap) ----------
      click('#ui [data-act="mode"][data-arg="quick"]'); W("() => __game.state === 'ship'"); check('Quick race opens the garage', True)
      click('#ui [data-act="shipOk"]'); W("() => __game.state === 'track'")
      click('[data-act=track][data-arg=foundry]'); click('[data-act=laps][data-arg="1"]'); click('[data-act=diff][data-arg=rookie]'); W("() => __game.opts.laps === 1 && __game.opts.diff === 'rookie'")
      click('[data-act=start]'); W("() => __game.state === 'intro' || __game.state === 'race'"); pg.keyboard.press('Space'); W("() => __game.state === 'race'")
      check('no storage writes while racing', pg.evaluate("() => { const s = __game.progress.store, w = s.writes; __game.ff(10); return s.writes === w; }"))
      finish_race(); r = reward(); w1 = wallet()
      check('a completed Rookie race pays base x 1.0 x 1 lap x placement', r and r['ok'] and r['credits'] == single('rookie', 1, r['place']) and w1['CR'] == r['credits'], json.dumps(r))
      txt = pg.inner_text('#ui').lower(); check('results screen shows the reward, its formula and the new balance', f"+{r['credits']} cr" in txt.replace(',', '') and 'rookie' in txt and 'balance' in txt, txt[txt.find('reward'):][:160].replace('\n', ' '))
      pg.screenshot(path=str(out / 'results-single.png'))
      pg.evaluate("() => __game.action('back', 'results')"); time.sleep(1); pg.evaluate("() => __game.showResults()"); time.sleep(1)
      check('reopening the results screen pays nothing more', wallet() == w1, json.dumps(wallet()))
      click('[data-act=restart]'); W("() => __game.state === 'intro' || __game.state === 'race'"); pg.evaluate("() => { if (__game.state === 'intro') __game.endIntro(); }"); finish_race(); r2 = reward(); w2 = wallet()
      ids = pg.evaluate("() => __game.progress.profile.history.map(h => h.id)")
      check('racing the same course again pays again, as a new event', r2['ok'] and w2['CR'] == w1['CR'] + r2['credits'] and len(set(ids)) == len(ids) == 2, f"{w1['CR']} + {r2['credits']} = {w2['CR']}, ids {ids}")
      # ---------- Pro and Ace (autopilot races) ----------
      tot = w2['CR']
      for diff, trk in [('pro', 'belt'), ('ace', 'spire')]:
          go(f'?skipmenu=1&autotest=1&mode=quick&diff={diff}&laps=1&track={trk}&quality=low&nointro=1'); finish_race(); r = reward(); w = wallet()
          check(f'{diff.title()} race pays base x {SINGLE["diff"][diff]} x 1 lap x placement', r['ok'] and r['credits'] == single(diff, 1, r['place']) and w['CR'] == tot + r['credits'], json.dumps(r)); tot = w['CR']
      go('?quality=low'); W("() => __game.state === 'title'")
      check('credits survive a reload', wallet()['CR'] == tot, json.dumps(wallet()))

      # ---------- championships: Rookie -> Pro -> Ace ----------
      check('only the Rookie championship is open at first', pg.evaluate("() => __game.progress.profile.championships.unlocked.join()") == 'rookie')
      def run_champ(diff):
          go(f'?skipmenu=1&autotest=1&mode=champ&diff={diff}&laps=1&quality=low&nointro=1'); last = None
          for rnd in range(4):
              finish_race(); last = reward()
              if rnd < 3:
                  click('[data-act=champHub]'); W("() => !!document.querySelector('[data-act=nextRound]')")
                  if rnd == 0: pg.screenshot(path=str(out / f'champ-hub-{diff}.png'))
                  click('[data-act=nextRound]'); W("() => __game.state === 'race' || __game.state === 'intro'"); pg.evaluate("() => { if (__game.state === 'intro') __game.endIntro(); }")
          before = wallet(); click('[data-act=champHub]'); W("() => __game.state === 'champ'"); time.sleep(1); pg.screenshot(path=str(out / f'champ-final-{diff}.png'))
          txt = pg.inner_text('#ui').lower()
          pg.evaluate("() => { __game.showChampHub(); __game.showChampHub(); __game.progress.completeRun(__game.champ.runId); }")
          same = wallet() == before
          return last, txt, same
      pg_diff = {}
      for diff, unlock in [('rookie', 'pro'), ('pro', 'ace'), ('ace', None)]:
          last, txt, same = run_champ(diff); c = last['completion'] or {}
          check(f'{diff.title()} championship: four rounds, completion bonus paid once', last['ok'] and c.get('ok') and same, json.dumps(c))
          if unlock: check(f'completing {diff.title()} unlocks {unlock.title()} and the results say so', c.get('newly') == unlock and f'{unlock} championship unlocked' in txt.lower(), txt[:160].replace('\n', ' '))
          else: check('Ace is the highest championship difficulty', c.get('newly') is None and c.get('highest') and 'highest' in txt.lower())
          check(f'{diff.title()} results show standing, per-race credits, bonus, total and balance', all(k in txt for k in ['final standing', 'completion bonus', 'final-standing bonus', 'total from this championship', 'balance now', 'career (all runs)', 'race rewards']))
          pg_diff[diff] = c.get('total')
      check('higher championship difficulty pays more', pg_diff['rookie'] < pg_diff['pro'] < pg_diff['ace'], json.dumps(pg_diff))
      w = wallet(); last, txt, same = run_champ('rookie'); c = last['completion']
      check('a replayed Rookie championship is a new run and pays its full reward again', c['ok'] and wallet()['CR'] >= w['CR'] + c['total'] - 1, f"{w['CR']} -> {wallet()['CR']} (run total {c['total']})")
      go('?quality=low'); W("() => __game.state === 'title'")
      check('championship progress survives a reload', pg.evaluate("() => __game.progress.profile.championships.unlocked.join()") == 'rookie,pro,ace' and pg.evaluate("() => __game.progress.profile.championships.completed.rookie") == 2)

      # ---------- garage: upgrades through the UI, then in a race ----------
      click('#ui [data-act="garage"]'); W("() => __game.state === 'ship'"); click('[data-act=g][data-arg="tab:upgrades"]'); W("() => !!document.querySelector('.upg')")
      cr0 = wallet()['CR']; click('[data-act=g][data-arg="up:engine:0"]'); check('first press arms the upgrade (nothing bought yet)', wallet()['CR'] == cr0 and 'confirm' in pg.inner_text('.upg').lower())
      click('[data-act=g][data-arg="up:engine:0"]'); W("() => __game.progress.upgrades('kestrel').engine === 1")
      pg.evaluate("() => __game.action('g', 'up:engine:0')"); pg.evaluate("() => __game.action('g', 'up:engine:0')")  # a stale double press
      check('second press buys level 1 for 500 CR; a stale double press buys nothing', wallet()['CR'] == cr0 - 500 and pg.evaluate("() => __game.progress.upgrades('kestrel').engine") == 1, f'{cr0} -> {wallet()["CR"]}')
      check('the upgrades tab shows level, effect and balance after', 'lv 1/5' in pg.inner_text('#ui').lower() and 'leaves' in pg.inner_text('#ui').lower())
      pg.screenshot(path=str(out / 'garage-upgrades.png'))
      exp = pg.evaluate("() => __game.progress.effectiveDef('kestrel').maxSpeed * 0.74")
      go('?skipmenu=1&autotest=1&mode=quick&diff=rookie&laps=1&track=ring&quality=low&nointro=1&ship=0')
      v1 = pg.evaluate('() => __game.scene.race.player.ship.def.maxSpeed'); pg.evaluate("() => __game.action('restart')"); W("() => __game.state === 'race' || __game.state === 'intro'")
      v2 = pg.evaluate('() => __game.scene.race.player.ship.def.maxSpeed'); ai = pg.evaluate("() => __game.scene.race.racers.filter(r => !r.isPlayer).map(r => ({ id: r.ship.def.id, v: r.ship.def.maxSpeed }))")
      check('the upgrade reaches the race physics once, and a restart does not stack it', abs(v1 - exp) < 1e-9 and abs(v2 - exp) < 1e-9, f'{v1} {v2} expected {exp}')
      BASE = {'lancer': 186, 'wisp': 163, 'halberd': 174, 'corsair': 176, 'kestrel': 170}
      check('AI ships are not affected by the player\'s upgrades', len(ai) == 5 and all(abs(a['v'] - BASE[a['id']] * 0.74) < 1e-6 for a in ai), json.dumps(ai))

    if 'B' in PH:
      # ---------- shop: Credits and Style Tokens ----------
      go('?view=hangar&quality=low'); W("() => __game.state === 'ship'")
      click('[data-act=g][data-arg="tab:shop"]'); click('[data-act=g][data-arg="scat:patterns"]'); click('[data-act=g][data-arg="sel:pattern.double"]')
      w0 = wallet(); click('[data-act=g][data-arg="buy:pattern.double"]'); check('first press on Unlock asks for confirmation', wallet() == w0 and 'confirm' in pg.inner_text('.detail').lower())
      pg.screenshot(path=str(out / 'shop-confirm.png'))
      check('confirming unlocks the item', confirm('[data-act=g][data-arg="buy:pattern.double"]', "() => __game.progress.isUnlocked('pattern.double')"))
      w1 = wallet(); check('unlocking a Credits item deducts its price in Credits only', w1['CR'] == w0['CR'] - 600 and w1['ST'] == w0['ST'], f'{w0} -> {w1}')
      check('an owned item cannot be bought again', pg.query_selector('[data-arg="buy:pattern.double"]') is None and pg.evaluate("() => __game.progress.buyItem('pattern.double').code") == 'owned' and wallet() == w1)
      st_item = pg.evaluate("() => { const w = __game.progress.wallet(); const it = __game.progress.catalog('kestrel').find(s => s.currency === 'ST' && s.status === 'buy' && s.price <= w.ST); return it ? it.id : null; }")
      if st_item:
          click('[data-act=g][data-arg="scat:' + pg.evaluate(f"() => __game.progress.catalog('kestrel').find(s => s.id === '{st_item}').category") + '"]')
          click(f'[data-act=g][data-arg="sel:{st_item}"]'); confirm(f'[data-act=g][data-arg="buy:{st_item}"]', f"() => __game.progress.isUnlocked('{st_item}')")
          w2 = wallet(); price = pg.evaluate(f"() => __game.progress.catalog('kestrel').find(s => s.id === '{st_item}').price")
          check(f'unlocking a Style Token item ({st_item}) deducts Style Tokens only', w2['ST'] == w1['ST'] - price and w2['CR'] == w1['CR'], f'{w1} -> {w2}')
      else: check('a Style Token item was affordable for the ST purchase test', False, json.dumps(wallet()))
      poor = pg.evaluate("() => { const it = __game.progress.catalog('kestrel').find(s => s.status === 'buy' && !s.canBuy); return it ? it.id : null; }")
      if poor:
          cat = pg.evaluate(f"() => __game.progress.catalog('kestrel').find(s => s.id === '{poor}').category"); click(f'[data-act=g][data-arg="scat:{cat}"]'); click(f'[data-act=g][data-arg="sel:{poor}"]')
          check('an unaffordable item has a disabled button and says how much is missing', pg.eval_on_selector(f'[data-arg="buy:{poor}"]', 'e => e.disabled') and 'more' in pg.inner_text('.detail'))
      # premium placeholders
      click('[data-act=g][data-arg="scat:premium"]'); cards = pg.query_selector_all('.icard.prem'); wp = wallet()
      for pid in ['premium.neon-skin', 'premium.carbon-skin', 'premium.plasma-pattern', 'premium.champ-finish']: click(f'[data-act=g][data-arg="sel:{pid}"]')
      det = pg.inner_text('.detail')
      check('four premium placeholders are visible as "Premium Cosmetic — Coming Soon" and offer no purchase', len(cards) == 4 and 'Premium Cosmetic — Coming Soon' in det and pg.query_selector('[data-arg^="buy:premium"]') is None and wallet() == wp, det[:120].replace('\n', ' '))
      check('premium items stay locked and cannot be bought with either currency', pg.evaluate("() => ['premium.neon-skin','premium.carbon-skin','premium.plasma-pattern','premium.champ-finish'].every(id => !__game.progress.isUnlocked(id) && __game.progress.buyItem(id).code === 'premium')") and wallet() == wp)
      pg.screenshot(path=str(out / 'shop-premium.png'))
      check('no payment form anywhere', pg.evaluate("() => !document.querySelector('input[autocomplete^=cc], input[name*=card], form[action]') && !/checkout|credit card|payment/i.test(document.body.innerText)"))

      # ---------- paint shop: preview, apply, the 3D ship, persistence, races ----------
      click('[data-act=g][data-arg="tab:paint"]'); W("() => !!document.querySelector('.swatches')")
      pg.evaluate("() => { __game.hangar.freezeSpin = 0.95; __game.shotCam = { pos: [3.0, 4.6, 3.4], at: [0, 1.75, -0.1], fov: 42 }; document.getElementById('ui').style.visibility = 'hidden'; }")
      FR = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
      pg.evaluate(FR, 3); pg.screenshot(path=str(out / 'paint-before.png')); pg.evaluate("() => { document.getElementById('ui').style.visibility = ''; }")
      click('[data-act=g][data-arg="sw:#2d5bd6"]'); click('[data-act=g][data-arg="psec:pattern"]'); click('[data-act=g][data-arg="pick:pattern.double"]')
      check('the preview is a draft until applied', pg.evaluate("() => __game.garage.dirty && __game.progress.custom('kestrel').primary !== '#2d5bd6'"))
      pg.evaluate("() => { document.getElementById('ui').style.visibility = 'hidden'; }"); pg.evaluate(FR, 3); pg.screenshot(path=str(out / 'paint-preview.png')); pg.evaluate("() => { document.getElementById('ui').style.visibility = ''; }")
      click('[data-act=g][data-arg="pick:pattern.camo"]'); locked = pg.evaluate("() => document.querySelector('[data-arg=apply]').disabled") and 'locked items in the preview' in pg.inner_text('.pstate').lower()
      check('a locked pattern can be previewed but not applied', locked and pg.evaluate("() => __game.progress.custom('kestrel').pattern") != 'pattern.camo')
      click('[data-act=g][data-arg="pick:pattern.double"]'); click('[data-act=g][data-arg="apply"]'); W("() => !__game.garage.dirty")
      c = pg.evaluate("() => __game.progress.custom('kestrel')"); cu = pg.evaluate("() => { const c = __game.showSV.hull.cust; return c && { pattern: c.pattern, prim: Array.from(c.data.slice(0, 3)).map(v => Math.round(v * 255)) }; }")
      check('Apply saves the paint job and the 3D ship carries it', c['primary'] == '#2d5bd6' and c['pattern'] == 'pattern.double' and cu and cu['pattern'] == 3 and cu['prim'] == [0x2d, 0x5b, 0xd6], json.dumps(cu))
      a, p = Image.open(out / 'paint-before.png').convert('RGB'), Image.open(out / 'paint-preview.png').convert('RGB'); box = (380, 120, 1000, 600)
      d = sum(ImageStat.Stat(ImageChops.difference(a.crop(box), p.crop(box))).mean) / 3
      check('the new paint is visible on the rendered 3D ship', d > 2, f'mean pixel change {d:.2f} in the ship area')
      go('?skipmenu=1&autotest=1&mode=quick&diff=rookie&laps=1&track=foundry&quality=low&nointro=1&ship=0')
      rc = pg.evaluate("() => { const g = __game, v = g.scene.view.byRacer.get(g.scene.race.player).sv.hull.cust; return v && v.pattern; }")
      check('the paint job (saved before the reload) is on the player\'s ship in the race; rivals keep theirs', rc == 3 and pg.evaluate("() => __game.scene.view.rv.filter(v => !v.r.isPlayer).every(v => !v.sv.hull.cust)"))
      pg.evaluate("() => { const g = __game; g.camMode = 'chase'; g.timeScale = 0; }"); pg.evaluate(FR, 3); pg.screenshot(path=str(out / 'race-custom-paint.png'))

      # ---------- keyboard / controller-style navigation in the garage ----------
      go('?view=hangar&quality=low'); W("() => __game.state === 'ship'")
      pg.evaluate("() => document.activeElement && document.activeElement.blur()"); t0 = pg.evaluate('() => __game.garage.tab'); pg.keyboard.press('KeyE')
      try: W(f"() => __game.garage.tab !== '{t0}'", 120000)
      except Exception: pass
      t1 = pg.evaluate('() => __game.garage.tab'); pg.evaluate("() => document.activeElement && document.activeElement.blur()")
      s0 = pg.evaluate('() => __game.opts.ship'); pg.keyboard.press('ArrowRight')
      try: W(f"() => __game.opts.ship !== {s0}", 120000)
      except Exception: pass
      s1 = pg.evaluate('() => __game.opts.ship')
      check('keyboard: E switches garage tab, Right switches ship', t0 != t1 and s1 == (s0 + 1) % 5, f'{t0}->{t1}, ship {s0}->{s1}')
      click('#ui [data-act="back"]'); W("() => __game.state === 'title'"); click('#ui [data-act="career"]'); W("() => __game.state === 'career'"); time.sleep(1)
      ct = pg.inner_text('#ui').lower(); check('career screen shows lifetime stats, per-mode and per-course tables and championship runs', all(k in ct for k in ['pilot record', 'by mode', 'by course', 'recent races', 'championship runs']))
      pg.screenshot(path=str(out / 'career.png'))
    b.close()
other = sorted(h for h in hosts if h not in ('file://', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'))
check('no network requests other than the font stylesheet', not other, json.dumps(sorted(hosts)))
check('no page errors or console errors', not errors, json.dumps(errors[:5]))
print(f"\n{sum(1 for c in checks if c[1])} of {len(checks)} checks pass")
sys.exit(0 if all(c[1] for c in checks) else 1)
