"""Screenshots of the V7 screens for review: title, the five garage tabs, the championship ladder, results with rewards, a
championship round and its final summary, the career screen, and a race with a custom paint job. Starts from a career
built by tests/seedprofile.mjs (paid through the game's own progression service). Reduced motion is emulated so the menu
slide-in animation does not catch the capture (software frames are slow).
usage: python3 tests/screens.py BUILD.html SEED.json OUTDIR [--quality=medium]"""
import sys, json, time, pathlib
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
build, seed, out = pathlib.Path(args[0]).resolve().as_uri(), pathlib.Path(args[1]).read_text(), pathlib.Path(args[2]); out.mkdir(parents=True, exist_ok=True); Q = opt.get('quality', 'medium')
errors = []
FR = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}, reduced_motion='reduce')
    ctx.add_init_script(f"try {{ if (!localStorage.getItem('galactic-rush.profile')) localStorage.setItem('galactic-rush.profile', {json.dumps(seed)}); }} catch (e) {{}}")  # seed once; later loads keep progress
    pg = ctx.new_page(); pg.set_default_timeout(900000)
    pg.on('pageerror', lambda e: errors.append('pageerror ' + str(e)[:200]))
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text[:200]}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    W = lambda c, t=900000: pg.wait_for_function(c, timeout=t)
    def go(q): pg.goto(build + q); W('() => window.__game && window.__game.ready', 300000)
    def snap(name, n=3): pg.evaluate(FR, n); time.sleep(0.5); pg.screenshot(path=str(out / f'{name}.png'), timeout=900000); print('shot', name, flush=True)
    def act(a, arg=None): pg.evaluate('([a, b]) => __game.action(a, b)', [a, arg])
    go(f'?quality={Q}'); W("() => __game.state === 'title'"); snap('01-title')
    act('garage'); W("() => __game.state === 'ship'"); snap('02-garage-ship')
    act('g', 'tab:upgrades'); snap('03-garage-upgrades')
    act('g', 'tab:paint'); act('g', 'psec:pattern'); act('g', 'pick:pattern.hex'); act('g', 'view:34'); snap('04-garage-paint-preview', 6)
    act('g', 'psec:colors'); act('g', 'slot:secondary'); snap('05-garage-paint-colours', 3)
    act('g', 'revert'); act('g', 'tab:inventory'); snap('06-garage-inventory')
    # the confirm state normally disarms after 6 s; software frames are slower than that, so hold it for the capture
    pg.evaluate("() => { const G = __game.garage; G.arm = k => { G.armed = k; }; }")
    act('g', 'tab:shop'); act('g', 'scat:patterns'); act('g', 'sel:pattern.geometric'); act('g', 'buy:pattern.geometric'); snap('07-garage-shop-confirm')
    act('g', 'cancel'); act('g', 'scat:premium'); act('g', 'sel:premium.neon-skin'); snap('08-garage-shop-premium')
    act('back'); W("() => __game.state === 'title'"); snap('09-title-continue')
    act('career'); W("() => __game.state === 'career'"); snap('10-career')
    # a quick race with the custom paint job, then its results
    go(f'?skipmenu=1&autotest=1&mode=quick&diff=pro&laps=1&track=spire&quality={Q}&nointro=1&ship=0')
    pg.evaluate("() => { __game.ff(14); __game.camMode = 'chase'; }"); snap('11-race-custom-paint', 4)
    pg.evaluate("""() => { const g = __game; for (let k = 0; k < 80 && g.state !== 'results' && g.scene.race && !g.scene.race.player.finished; k++) g.ff(5); if (g.state !== 'results') g.ff(4); }"""); W("() => __game.state === 'results'"); snap('12-results-rewards', 4)
    # the saved Ace championship: hub, one round, then the track-select ladder for a new run
    go(f'?quality={Q}'); W("() => __game.state === 'title'"); act('champContinue'); W("() => __game.state === 'champ'"); snap('13-championship-hub')
    FIN = """() => { const g = __game; if (g.state === 'intro') g.endIntro(); for (let k = 0; k < 100 && g.state !== 'results' && g.scene.race && !g.scene.race.player.finished; k++) g.ff(5); if (g.state !== 'results') g.ff(4); }"""
    for rnd in range(3):
        act('nextRound'); W("() => __game.state === 'race' || __game.state === 'intro'"); pg.evaluate(FIN); W("() => __game.state === 'results'")
        if rnd == 0: snap('14-championship-round-results', 4)
        act('champHub'); W("() => __game.state === 'champ'")
    snap('15-championship-final', 4)
    act('menu'); W("() => __game.state === 'title'"); act('mode', 'champ'); W("() => __game.state === 'ship'"); act('shipOk'); W("() => __game.state === 'track'"); snap('16-championship-ladder', 4)
    b.close()
print('errors:', json.dumps(errors[:6]))
