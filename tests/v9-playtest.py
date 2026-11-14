"""Galactic Rush V9 browser playtests for the two new courses (headless Chromium, software WebGL: frame rates here mean
nothing). Runs the built game (dist/galactic-rush-v9.html, or GR_BUILD) through its own menus and race flow.
usage: python3 tests/v9-playtest.py menus|champ6|loops|trial|settings|bench [outdir]
  menus   title -> hangar -> course select (six courses) -> Pelagos via the menus -> flyover -> race -> results;
          then the championship calendar (six rounds)
  champ6  a whole six-round championship (1 lap, autopilot, fast-forwarded): rounds 5 and 6 are Pelagos and Ignara,
          the completion bonus is paid once and the run closes
  loops   in-game chase-camera frames inside both Pelagos loops and along Ignara
  trial   a time trial on each new course saves a record and a ghost lap; the next trial loads and shows the ghost
  settings  every preset and graphics toggle switched at run time on both new courses: renderer configuration, WebGL
          errors, page errors, blank frames (as tests/settings.py does on Neon Spire)
  bench   the game's own benchmark (?bench=short) on every course with the same presets (BENCH_PRESETS, BENCH_TRACKS)"""
import sys, json, time, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = pathlib.Path(os.environ.get('GR_BUILD') or ROOT / 'dist' / 'galactic-rush-v9.html').resolve().as_uri()
scenario = sys.argv[1] if len(sys.argv) > 1 else 'menus'
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/gr9'); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
errors, checks = [], []
def watch(page, tag):
    page.on('console', lambda m: errors.append(f'{tag}: [{m.type}] {m.text}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'{tag}: [pageerror] {e}'))
def ready(page): page.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
def st(page): return page.evaluate("() => { const g = __game, r = g.scene && g.scene.race; return { state: g.state, track: g.scene && g.scene.id, t: r ? +r.time.toFixed(1) : null, me: r && r.player ? { lap: r.player.lap, place: r.player.place, fin: r.player.finished, ti: r.player.ti } : null }; }")
def shot(page, name): page.screenshot(path=str(out / f'{name}.png'), timeout=300000); print('shot', name, json.dumps(st(page)), flush=True)
def check(ok, what): checks.append((bool(ok), what)); print(('PASS ' if ok else 'FAIL ') + what, flush=True)
def tap(page, sel):
    page.wait_for_selector(sel, state='attached', timeout=60000)
    page.eval_on_selector(sel, "e => { if (!e.closest('.actbar')) e.scrollIntoView({ block: 'center', inline: 'nearest' }); }")
    page.click(sel, force=True)
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 960, 'height': 540})
    if scenario == 'menus':
        page = ctx.new_page(); watch(page, 'menus'); page.set_default_timeout(300000); page.goto(BUILD + '?quality=low'); ready(page)
        W = lambda cond, t=300000: page.wait_for_function(cond, timeout=t)
        W("() => __game.state === 'title'"); page.keyboard.press('Enter'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'")
        ids = page.evaluate("() => [...document.querySelectorAll('[data-act=track]')].map(e => e.dataset.arg)")
        check(ids == ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara'], f'course select lists six courses in order: {ids}')
        SCROLL = "() => { const sc = document.querySelector('#ui .screen'); if (sc) sc.scrollTop = sc.scrollHeight; }"
        tap(page, '[data-act=track][data-arg=pelagos]'); W("() => __game.opts.track === 'pelagos'"); time.sleep(3); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, 'v9-menu-course-select-pelagos')
        tap(page, '[data-act=track][data-arg=ignara]'); W("() => __game.opts.track === 'ignara'"); time.sleep(3); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, 'v9-menu-course-select-ignara')
        tap(page, '[data-act=track][data-arg=pelagos]'); W("() => __game.opts.track === 'pelagos'"); tap(page, '[data-act=laps][data-arg=\"1\"]'); W('() => __game.opts.laps === 1')
        tap(page, '[data-act=start]'); W("() => __game.state === 'intro'"); page.evaluate(FRAMES, 4); shot(page, 'v9-pelagos-flyover')
        page.keyboard.press('Space'); W("() => __game.state === 'race'"); check(st(page)['track'] == 'pelagos', 'a Pelagos race starts from the menus')
        page.evaluate(FRAMES, 30); s1 = st(page); check(s1['t'] and s1['t'] > 0, f"the race clock runs ({s1['t']} s)"); shot(page, 'v9-pelagos-race-start')
        page.keyboard.press('Escape'); W("() => __game.state === 'paused'"); tap(page, '[data-act=menu]'); W("() => __game.state === 'title'"); check(True, 'quit to the menu from the pause menu')
        tap(page, '[data-act=mode][data-arg=champ]'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'")
        ids = page.evaluate("() => [...document.querySelectorAll('#ui .card[data-arg]')].map(e => e.dataset.arg)"); time.sleep(3); shot(page, 'v9-menu-championship-six-rounds'); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, 'v9-menu-championship-rounds-5-6')
        txt = page.evaluate("() => document.querySelector('#ui').innerText")
        check(ids == ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara'] and 'six rounds' in txt.lower(), f'the championship calendar has six rounds ending with Pelagos and Ignara: {ids}')
    elif scenario == 'champ6':
        page = ctx.new_page(); watch(page, 'champ6'); page.set_default_timeout(600000)
        page.goto(BUILD + '?skipmenu=1&autotest=1&mode=champ&laps=1&quality=low'); ready(page)
        P0 = page.evaluate("() => ({ cr: __game.progress.wallet().CR, done: (__game.progress.profile.championships.completed || []).length })")
        rounds = []
        for rnd in range(6):
            page.wait_for_function("() => __game.state === 'race' || __game.state === 'intro'", timeout=600000)
            trk = page.evaluate('() => __game.scene.race.track.id'); page.evaluate('() => __game.ff(130)')
            page.wait_for_function("() => __game.state === 'results'", timeout=600000); time.sleep(2)
            r = page.evaluate("() => { const rc = __game.result && __game.result.race; return { round: __game.champ.round, place: rc ? rc.player.place : null, field: rc ? rc.order.map(o => o.name + ':' + (o.finished ? o.finishTime.toFixed(1) : 'DNF')) : null, run: __game.progress.activeRun() ? __game.progress.activeRun().round : null }; }")
            rounds.append((trk, r)); print('round', rnd + 1, trk, json.dumps(r), flush=True)
            if rnd == 3: shot(page, 'v9-champ-results-round4')
            tap(page, '[data-act=champHub]'); page.wait_for_function("() => __game.state === 'champ'", timeout=120000); time.sleep(4); page.evaluate(FRAMES, 4)
            hub = page.evaluate("() => document.querySelector('#ui').textContent").lower()  # textContent: the words as written (the styles set capitals)
            if rnd == 3: shot(page, 'v9-champ-hub-after-round4'); check('round 5: pelagos' in hub and 'after round 4 of 6' in hub, 'after round 4 the hub offers round 5: Pelagos')
            if rnd == 4: shot(page, 'v9-champ-hub-after-round5'); check('round 6: ignara' in hub and 'after round 5 of 6' in hub, 'after round 5 the hub offers round 6: Ignara')
            if rnd < 5: tap(page, '[data-act=nextRound]')
            else: shot(page, 'v9-champ-final')
        check([t for t, _ in rounds] == ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara'], f'rounds raced in calendar order: {[t for t, _ in rounds]}')
        P1 = page.evaluate("() => ({ cr: __game.progress.wallet().CR, done: (__game.progress.profile.championships.completed || []).length, active: !!__game.progress.activeRun(), champDone: __game.champDone })")
        print('career before', json.dumps(P0), 'after', json.dumps({ k: v for k, v in P1.items() if k != 'champDone' }), flush=True)
        check(not P1['active'], 'the run is closed after round 6')
        check(P1['champDone'] and P1['champDone'].get('ok'), f"the completion was recorded: {json.dumps(P1['champDone'])[:300] if P1['champDone'] else None}")
        check(P1['cr'] > P0['cr'], f"credits earned over the championship: {P1['cr'] - P0['cr']}")
    elif scenario == 'loops':
        page = ctx.new_page(); watch(page, 'loops'); page.set_default_timeout(600000)
        page.goto(BUILD + '?skipmenu=1&autotest=1&track=pelagos&laps=1&quality=medium&nointro=1'); ready(page)
        page.evaluate('() => { __game.timeScale = 0; }')
        loops = page.evaluate("() => __game.scene.race.track.loops.map(L => ({ i0: L.i0, i1: L.i1 }))")
        k = 0
        for li, L in enumerate(loops):
            for f, name in [(0.08, 'entry'), (0.3, 'climb'), (0.5, 'top'), (0.72, 'descent')]:
                target = int(L['i0'] + (L['i1'] - L['i0']) * f)
                page.evaluate(f"""() => {{ const g = __game, r = g.scene.race; for (let n = 0; n < 120 * 120; n++) {{ const p = r.player; if (p.ti >= {target} && p.ti < {target} + 30) break; r.step(1 / 120, null); }} g.racefx.events(r, true); }}""")
                page.evaluate(FRAMES, 8); shot(page, f'v9-pelagos-loop{li + 1}-{k:02d}-{name}'); k += 1
                info = page.evaluate("() => { const r = __game.scene.race, p = r.player, t = r.track, c = __game.rig.cam; return { ti: p.ti, loop: t.loopId[p.ti], camUpY: +c.up.y.toFixed(2), courseUpY: +t.nrm[p.ti].y.toFixed(2) }; }")
                print('  ', json.dumps(info), flush=True)
        page.close()
        page = ctx.new_page(); watch(page, 'ignara'); page.set_default_timeout(600000)
        page.goto(BUILD + '?skipmenu=1&autotest=1&track=ignara&laps=1&quality=medium&nointro=1'); ready(page); page.evaluate('() => { __game.timeScale = 0; }')
        for k, f in enumerate([0.12, 0.25, 0.33, 0.4, 0.5, 0.6, 0.72, 0.8, 0.92]):
            page.evaluate(f"""() => {{ const g = __game, r = g.scene.race, N = r.track.N, target = Math.floor(N * {f}); for (let n = 0; n < 120 * 120; n++) {{ const p = r.player; if (p.ti >= target && p.ti < target + 30) break; r.step(1 / 120, null); }} g.racefx.events(r, true); }}""")
            page.evaluate(FRAMES, 8); shot(page, f'v9-ignara-chase-{k:02d}')
    elif scenario == 'trial':  # a time trial on each new course records a ghost lap; the next trial loads it and shows it
        for trk in ['pelagos', 'ignara']:
            page = ctx.new_page(); watch(page, 'trial-' + trk); page.set_default_timeout(1800000)
            page.goto(BUILD + f'?skipmenu=1&autotest=1&mode=trial&track={trk}&laps=1&quality=low&ts=4&nointro=1'); ready(page)
            page.wait_for_function("() => __game.state === 'results'", timeout=1800000)
            key = page.evaluate('(id) => __game.recKey(id)', trk); g = page.evaluate('(k) => { const s = __game.save, gh = s.ghosts && s.ghosts[k]; return { frames: gh ? (gh.f || gh.frames || []).length : 0, best: s.best[k] || null }; }', key)
            check(g['frames'] > 100 and g['best'], f'{trk}: the time trial saved a record lap and its ghost ({g})'); page.close()
            page = ctx.new_page(); watch(page, 'trial2-' + trk); page.set_default_timeout(1800000)
            page.goto(BUILD + f'?skipmenu=1&autotest=1&mode=trial&track={trk}&laps=2&quality=low&ts=2&nointro=1'); ready(page)
            n = page.evaluate('() => !!__game.ghost && (__game.ghost.f || []).length'); page.evaluate('() => __game.ff(8)'); page.evaluate(FRAMES, 4)
            vis = page.evaluate('() => !!(__game.scene.view.ghost && __game.scene.view.ghost.visible)')
            check(n and n > 100 and vis, f'{trk}: the next trial loads the ghost ({n} frames) and shows it'); shot(page, f'v9-trial-ghost-{trk}'); page.close()
    elif scenario == 'settings':  # every preset and graphics toggle switched at run time on both new courses (as tests/settings.py does on Neon Spire)
        PRESETS = {'low': (0, 0, 1.7, 45), 'medium': (2, 1024, 1.25, 90), 'high': (4, 2048, 1, 120), 'ultra': (4, 4096, 0.85, 160)}
        STEPS = [('opt', 'preset', p) for p in ['medium', 'high', 'ultra', 'low', 'high']] + [('opt', k, v) for k in ['shadows', 'ao', 'volumetrics', 'motionBlur', 'grain', 'ca', 'flare'] for v in ['off', 'on']] + [('set', 'resScale', '0.5'), ('set', 'resScale', '1'), ('set', 'fov', '95'), ('set', 'fov', '72')]
        STATE = "() => { const g = __game, c = g.gfx.cfg; return { preset: g.settings.preset, msaa: c.msaa, shadow: c.shadow, ao: !!c.ao, shafts: !!c.shafts, grain: g.gfx.post.grain, flare: g.gfx.post.flare, glError: g.gfx.gl.getError(), lod: g.gfx.lodBias, hazeCap: c.hazeCap }; }"
        CAMS = {'pelagos': "const t = __game.scene.race.track, L = t.loops[0], c = L.base; return { pos: [c.x + 330, c.y + 120, c.z + 120], at: [c.x - 20, c.y + 150, c.z + 60], fov: 60 };",
                'ignara': "const t = __game.scene.race.track, i = t.tags.get('canyon')[20], p = t.pos[i], f = t.tan[i]; return { pos: [p.x - f.x * 60, p.y + 40, p.z - f.z * 60], at: [p.x + f.x * 200, p.y - 10, p.z + f.z * 200], fov: 64 };"}
        from PIL import Image, ImageStat
        for trk in ['pelagos', 'ignara']:
            pg = ctx.new_page(); watch(pg, 'settings-' + trk); pg.set_default_timeout(900000); pg.set_default_navigation_timeout(300000)
            pg.goto(BUILD + f'?skipmenu=1&autotest=1&laps=1&quality=low&track={trk}&nointro=1'); ready(pg); pg.evaluate(FRAMES, 2)
            cam = pg.evaluate('() => {' + CAMS[trk] + '}'); pg.evaluate('(c) => { __game.timeScale = 0; __game.shotCam = c; }', cam)
            for kind, k, v in STEPS:
                n0 = len(errors); pg.evaluate('([a, b]) => __game.action(a, b)', [kind, f'{k}:{v}']); pg.evaluate(FRAMES, 3); s_ = pg.evaluate(STATE); why = []
                if s_['glError'] != 0: why.append(f"WebGL error {s_['glError']}")
                if len(errors) > n0: why.append('page/console errors')
                if k == 'preset':
                    ms, sh, lod, hc = PRESETS[v]
                    if s_['msaa'] != ms or s_['shadow'] != sh or abs(s_['lod'] - lod) > 1e-6 or s_['hazeCap'] != hc: why.append('renderer configuration does not follow the preset')
                    f = out / f'settings-{trk}-{v}.png'; pg.screenshot(path=str(f), timeout=900000); mean = sum(ImageStat.Stat(Image.open(f).convert('L')).mean)
                    if mean < 3: why.append('blank frame')
                exp = {('shadows', 'off'): s_['shadow'] == 0, ('shadows', 'on'): s_['shadow'] > 0, ('ao', 'off'): not s_['ao'], ('ao', 'on'): s_['ao'], ('volumetrics', 'off'): not s_['shafts'], ('volumetrics', 'on'): s_['shafts'],
                       ('grain', 'off'): s_['grain'] == 0, ('grain', 'on'): s_['grain'] > 0, ('flare', 'off'): s_['flare'] == 0, ('flare', 'on'): s_['flare'] > 0}.get((k, v), True)
                if not exp: why.append('setting not applied')
                check(not why, f'{trk}: {kind} {k}:{v}' + (f" — {'; '.join(why)}" if why else ''))
            pg.close()
    elif scenario == 'bench':
        presets = os.environ.get('BENCH_PRESETS', 'low,medium,high,ultra'); res = []
        for trk in os.environ.get('BENCH_TRACKS', 'foundry,belt,spire,ring,pelagos,ignara').split(','):
            page = ctx.new_page(); watch(page, 'bench-' + trk); page.set_default_timeout(1800000)
            page.goto(BUILD + f'?bench=short&presets={presets}&track={trk}'); ready(page)
            page.wait_for_function('() => window.__bench', timeout=3600000); r = page.evaluate('() => window.__bench')
            for row in r: print('bench', trk, json.dumps(row), flush=True)
            res += r; shot(page, f'bench-{trk}'); page.close()
        (out / 'bench.json').write_text(json.dumps(res, indent=1))
    b.close()
print('\n'.join(errors[:30]) if errors else 'no console errors')
fails = [w for ok, w in checks if not ok]
print(f'{len(checks) - len(fails)} of {len(checks)} checks passed' + (': FAILED ' + '; '.join(fails) if fails else ''))
sys.exit(1 if fails or errors else 0)
