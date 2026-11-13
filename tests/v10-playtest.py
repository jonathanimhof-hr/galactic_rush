"""Galactic Rush V10 browser playtests for the two new courses and the championship calendar (headless Chromium,
software WebGL: frame rates here mean nothing). Runs the built game (dist/galactic-rush-v10.html, or GR_BUILD) through
its own menus and race flow.
usage: python3 tests/v10-playtest.py menus|champ|canopy|nexus|trial|settings|bench [outdir]
  menus     title -> hangar -> course select (eight courses) -> Verdant Canopy via the menus -> flyover -> race; the same
            for Orbital Nexus; then the championship screen: pick six of the eight courses (Start stays disabled until
            six are picked, a second click takes a course out, Random fills six, Clear empties)
  champ     a whole championship through the menus with a picked calendar (both new courses in it, 1 lap, autopilot,
            fast-forwarded): rounds in the picked order, the hub names the next round and shows the calendar, the
            completion bonus is paid once and the run closes
  canopy    in-game chase-camera frames through every part of Verdant Canopy (and the course's own section notices)
  nexus     in-game chase-camera frames through every gravity section of Orbital Nexus: camera up against the deck's up,
            the gravity notices on the HUD, the ship riding the deck
  trial     a time trial on each new course saves a record and a ghost lap; the next trial loads and shows the ghost
  settings  every preset and graphics toggle switched at run time on both new courses (renderer configuration, WebGL
            errors, page errors, blank frames)
  bench     the game's own benchmark (?bench=short) on every course with the same presets (BENCH_PRESETS, BENCH_TRACKS)"""
import sys, json, time, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = pathlib.Path(os.environ.get('GR_BUILD') or ROOT / 'dist' / 'galactic-rush-v10.html').resolve().as_uri()
scenario = sys.argv[1] if len(sys.argv) > 1 else 'menus'
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/gr10'); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
ALL8 = ['foundry', 'belt', 'spire', 'ring', 'pelagos', 'ignara', 'canopy', 'nexus']
NAMES = {'foundry': 'foundry trench', 'belt': 'cinder belt', 'spire': 'neon spire', 'ring': 'halo of vashti', 'pelagos': 'pelagos', 'ignara': 'ignara', 'canopy': 'verdant canopy', 'nexus': 'orbital nexus'}
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
SCROLL = "() => { const sc = document.querySelector('#ui .screen'); if (sc) sc.scrollTop = sc.scrollHeight; }"
# drive the frozen race forward (sim only) until the player reaches sample `target`, then let the effects catch up;
# the course's own announcements are asked for after every step, as the HUD asks every frame, and returned
GOTO = """(target) => { const g = __game, r = g.scene.race, c = g.racefx.course, out = []; for (let n = 0; n < 120 * 200; n++) { const p = r.player; if (p.ti >= target && p.ti < target + 30) break; r.step(1 / 120, null); g.racefx.events(r, true); if (c.notice) { const m = c.notice(p, r); if (m) out.push(m.text); } } g.racefx.events(r, true); return out; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 960, 'height': 540})
    if scenario == 'menus':
        page = ctx.new_page(); watch(page, 'menus'); page.set_default_timeout(300000); page.goto(BUILD + '?quality=low'); ready(page)
        W = lambda cond, t=300000: page.wait_for_function(cond, timeout=t)
        W("() => __game.state === 'title'"); check('Galactic Rush V10' in page.title() or 'Galactic Rush V11' in page.title(), f'page title: {page.title()}')  # V11: the same flows on the V11 build (GR_BUILD)
        page.keyboard.press('Enter'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'")
        ids = page.evaluate("() => [...document.querySelectorAll('[data-act=track]')].map(e => e.dataset.arg)")
        check(ids == ALL8, f'course select lists eight courses in order: {ids}')
        for trk in ['canopy', 'nexus']:
            tap(page, f'[data-act=track][data-arg={trk}]'); W(f"() => __game.opts.track === '{trk}'"); time.sleep(3); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, f'v10-menu-course-select-{trk}')
            prev = page.evaluate("() => __game.scene && __game.scene.id"); check(prev == trk, f'the menu preview flies over {trk} ({prev})')
        tap(page, '[data-act=track][data-arg=canopy]'); W("() => __game.opts.track === 'canopy'"); tap(page, '[data-act=laps][data-arg=\"1\"]'); W('() => __game.opts.laps === 1')
        tap(page, '[data-act=start]'); W("() => __game.state === 'intro'"); page.evaluate(FRAMES, 4); shot(page, 'v10-canopy-flyover')
        page.keyboard.press('Space'); W("() => __game.state === 'race'"); check(st(page)['track'] == 'canopy', 'a Verdant Canopy race starts from the menus')
        W('() => __game.scene.race.time > 0', 180000); page.evaluate(FRAMES, 4); s1 = st(page); check(s1['t'] and s1['t'] > 0, f"the race clock runs after the countdown ({s1['t']} s)"); shot(page, 'v10-canopy-race-start')
        page.keyboard.press('Escape'); W("() => __game.state === 'paused'"); tap(page, '[data-act=menu]'); W("() => __game.state === 'title'"); check(True, 'quit to the menu from the pause menu')
        page.keyboard.press('Enter'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'")
        tap(page, '[data-act=track][data-arg=nexus]'); W("() => __game.opts.track === 'nexus'"); tap(page, '[data-act=start]'); W("() => __game.state === 'intro'"); page.keyboard.press('Space'); W("() => __game.state === 'race'")
        W('() => __game.scene.race.time > 0', 180000); page.evaluate(FRAMES, 4); s2 = st(page); check(s2['track'] == 'nexus' and s2['t'] and s2['t'] > 0, f"an Orbital Nexus race starts from the menus and its clock runs after the countdown ({s2['t']} s)"); shot(page, 'v10-nexus-race-start')
        page.keyboard.press('Escape'); W("() => __game.state === 'paused'"); tap(page, '[data-act=menu]'); W("() => __game.state === 'title'")
        # the championship: pick six of eight
        tap(page, '[data-act=mode][data-arg=champ]'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'"); time.sleep(2)
        cards = page.evaluate("() => [...document.querySelectorAll('#ui .card[data-act=champPick]')].map(e => e.dataset.arg)")
        check(cards == ALL8, f'the championship screen offers all eight courses: {cards}')
        dis = page.evaluate("() => document.querySelector('[data-act=start]').disabled"); check(dis, 'Start is disabled before six courses are picked')
        txt = page.evaluate("() => document.querySelector('#ui').textContent").lower(); check('pick six of the 8 courses' in txt and '0 of 6 rounds chosen' in txt, 'the screen asks for six of the eight courses')
        picks = ['nexus', 'canopy', 'pelagos', 'foundry', 'ignara', 'ring']
        for k, trk in enumerate(picks[:3]): tap(page, f'#ui .card[data-arg={trk}]'); W(f"() => (__game.opts.champTracks || []).length === {k + 1}")
        time.sleep(2); page.evaluate(FRAMES, 3); shot(page, 'v10-champ-pick-three')
        chips = page.evaluate("() => Object.fromEntries([...document.querySelectorAll('#ui .card[data-arg]')].map(e => [e.dataset.arg, e.querySelector('.chip').textContent]))")
        check(chips['nexus'] == 'Round 1' and chips['canopy'] == 'Round 2' and chips['pelagos'] == 'Round 3', f'picked courses show their rounds: {chips}')
        tap(page, '#ui .card[data-arg=canopy]'); W("() => __game.opts.champTracks.length === 2"); order = page.evaluate('() => __game.opts.champTracks')
        check(order == ['nexus', 'pelagos'], f'a second click takes a course out and the later rounds move up: {order}')
        for trk in ['canopy', 'foundry', 'ignara', 'ring']: tap(page, f'#ui .card[data-arg={trk}]'); time.sleep(0.5)
        W("() => __game.opts.champTracks.length === 6"); order = page.evaluate('() => __game.opts.champTracks')
        tap(page, '#ui .card[data-arg=belt]'); time.sleep(1); order2 = page.evaluate('() => __game.opts.champTracks')
        check(order2 == order and len(order) == 6, f'a seventh course cannot be added: {order2}')
        dis = page.evaluate("() => document.querySelector('[data-act=start]').disabled"); check(not dis, 'Start is enabled with six courses picked'); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, 'v10-champ-pick-six')
        tap(page, '[data-act=champClear]'); W("() => __game.opts.champTracks.length === 0"); check(page.evaluate("() => document.querySelector('[data-act=start]').disabled"), 'Clear empties the calendar and Start is disabled again')
        tap(page, '[data-act=champRandom]'); W("() => __game.opts.champTracks.length === 6"); rnd = page.evaluate('() => __game.opts.champTracks')
        check(len(set(rnd)) == 6 and all(x in ALL8 for x in rnd), f'Random picks six different courses: {rnd}'); time.sleep(2); page.evaluate(SCROLL); page.evaluate(FRAMES, 3); shot(page, 'v10-champ-random-six')
    elif scenario == 'champ':
        page = ctx.new_page(); watch(page, 'champ'); page.set_default_timeout(600000); page.goto(BUILD + '?quality=low&autotest=1&nointro=1'); ready(page)
        W = lambda cond, t=600000: page.wait_for_function(cond, timeout=t)
        W("() => __game.state === 'title'"); P0 = page.evaluate("() => ({ cr: __game.progress.wallet().CR })")
        tap(page, '[data-act=mode][data-arg=champ]'); W("() => __game.state === 'ship'"); page.keyboard.press('Enter'); W("() => __game.state === 'track'")
        picks = ['canopy', 'ring', 'nexus', 'spire', 'pelagos', 'belt']
        for trk in picks: tap(page, f'#ui .card[data-arg={trk}]'); time.sleep(0.4)
        W("() => (__game.opts.champTracks || []).length === 6"); tap(page, '[data-act=laps][data-arg=\"1\"]'); W('() => __game.opts.laps === 1')
        tap(page, '[data-act=start]')
        rounds = []
        for rnd in range(6):
            W("() => __game.state === 'race' || __game.state === 'intro'")
            if page.evaluate("() => __game.state") == 'intro': page.keyboard.press('Space')
            trk = page.evaluate('() => __game.scene.race.track.id'); page.evaluate('() => __game.ff(160)')
            W("() => __game.state === 'results'"); time.sleep(2)
            r = page.evaluate("() => { const rc = __game.result && __game.result.race; return { place: rc ? rc.player.place : null, run: __game.progress.activeRun() ? __game.progress.activeRun().round : null }; }")
            rounds.append(trk); print('round', rnd + 1, trk, json.dumps(r), flush=True)
            tap(page, '[data-act=champHub]'); W("() => __game.state === 'champ'"); time.sleep(3); page.evaluate(FRAMES, 4)
            hub = page.evaluate("() => document.querySelector('#ui').textContent").lower()
            if rnd < 5:
                nxt = NAMES[picks[rnd + 1]]
                check(f'round {rnd + 2}: {nxt}' in hub and f'after round {rnd + 1} of 6' in hub and 'calendar:' in hub, f'after round {rnd + 1} the hub offers round {rnd + 2}: {nxt} and shows the calendar')
                if rnd in (0, 2): shot(page, f'v10-champ-hub-after-round{rnd + 1}')
                tap(page, '[data-act=nextRound]')
            else: shot(page, 'v10-champ-final')
        check(rounds == picks, f'rounds raced in the picked order: {rounds}')
        P1 = page.evaluate("() => ({ cr: __game.progress.wallet().CR, active: !!__game.progress.activeRun(), champDone: __game.champDone, last: __game.progress.profile.championships.runs.at(-1) })")
        check(not P1['active'], 'the run is closed after round 6')
        check(P1['champDone'] and P1['champDone'].get('ok'), 'the completion was recorded and paid')
        check(P1['last'] and P1['last'].get('tracks') == picks and P1['last'].get('status') == 'completed', f"the finished run keeps its calendar: {P1['last'].get('tracks') if P1['last'] else None}")
        check(P1['cr'] > P0['cr'], f"credits earned over the championship: {P1['cr'] - P0['cr']}")
    elif scenario in ('canopy', 'nexus'):
        trk = scenario; page = ctx.new_page(); watch(page, trk); page.set_default_timeout(900000)
        page.goto(BUILD + f'?skipmenu=1&autotest=1&track={trk}&laps=2&quality=medium&nointro=1'); ready(page); page.evaluate('() => { __game.timeScale = 0; }')
        page.evaluate("() => { __game._msgs = []; const m = __game.ui.message.bind(__game.ui); __game.ui.message = (t, s, d) => { __game._msgs.push(t); return m(t, s, d); }; }")
        tags = page.evaluate("() => [...__game.scene.race.track.tags].map(([k, v]) => [k, v[0], v[v.length - 1]])")
        # the first announcement through the real frame loop and HUD: stop 12 samples short of it, then let the race run
        first = [a for name, a, z in tags if name in ('roots', 'hangar')][0]; sim = page.evaluate(GOTO, first - 12)
        page.evaluate('() => { __game.timeScale = 1; }'); n = 0
        while n < 60 and not page.evaluate('() => __game._msgs.length') and page.evaluate('() => __game.scene.race.player.ti') < first + 40: page.evaluate(FRAMES, 1); n += 1
        page.evaluate('() => { __game.timeScale = 0; }'); hud = page.evaluate('() => __game._msgs.slice()'); shot(page, f'v10-{trk}-hud-announcement')
        check(any(('Root Passage' if trk == 'canopy' else 'Hangar District') in m for m in hud), f'{trk}: the HUD shows the first announcement while racing ({hud}, {n} frames)')
        k = 0
        for name, a, z in [x for x in tags if x[0] != 'start'] + [x for x in tags if x[0] == 'start']:  # in lap order from here; the start straight last (on lap 2)
            for f in ([0.15, 0.6] if z - a > 60 else [0.5]):
                target = int(a + (z - a) * f); sim += page.evaluate(GOTO, target); page.evaluate(FRAMES, 8); shot(page, f'v10-{trk}-{k:02d}-{name}'); k += 1
                info = page.evaluate("() => { const r = __game.scene.race, p = r.player, t = r.track, c = __game.rig.cam; const U = [0, 1, 0]; return { ti: p.ti, grav: t.grav ? +t.grav[p.ti].toFixed(2) : 0, roll: t.roll ? Math.round(t.roll[p.ti] * 57.3) : 0, camUpDotDeck: +(c.up.x * t.nrm[p.ti].x + c.up.y * t.nrm[p.ti].y + c.up.z * t.nrm[p.ti].z).toFixed(2), ride: +(p.ly + t.h[p.ti]).toFixed(1), wrecked: p.wrecked }; }")
                print('  ', name, json.dumps(info), flush=True)
                if trk == 'nexus' and info['grav'] > 0.99: check(info['camUpDotDeck'] > 0.5 and 1.5 < info['ride'] < 12, f"{name}: the camera is upright on the deck (up . deck up {info['camUpDotDeck']}) and the ship rides it ({info['ride']} m)")
        msgs = hud + sim; print('announcements:', msgs, flush=True)
        if trk == 'nexus': check(all(any(w in m for m in msgs) for w in ['Hangar District', 'Energy Core', 'the deck turns to the wall', 'Transparent Corridors', 'the deck turns to the ceiling', 'Gravity Spindle', 'the deck turns upright', 'Exterior', 'Return to the station', 'Cargo Levels', 'Gravity field', 'Gravity off']), 'every district and every gravity change is announced on the first lap')
        else: check(all(any(w in m for m in msgs) for w in ['Root Passage', 'Branch Network', 'Canopy Run', 'Floating Platforms', 'Deep Forest Descent']), 'the five parts of the forest are announced on the first lap')
    elif scenario == 'trial':  # a time trial on each new course records a ghost lap; the next trial loads it and shows it
        for trk in ['canopy', 'nexus']:
            page = ctx.new_page(); watch(page, 'trial-' + trk); page.set_default_timeout(1800000)
            page.goto(BUILD + f'?skipmenu=1&autotest=1&mode=trial&track={trk}&laps=1&quality=low&ts=4&nointro=1'); ready(page)
            page.wait_for_function("() => __game.state === 'results'", timeout=1800000)
            key = page.evaluate('(id) => __game.recKey(id)', trk); g = page.evaluate('(k) => { const s = __game.save, gh = s.ghosts && s.ghosts[k]; return { frames: gh ? (gh.f || gh.frames || []).length : 0, best: s.best[k] || null }; }', key)
            check(g['frames'] > 100 and g['best'], f'{trk}: the time trial saved a record lap and its ghost ({g})'); page.close()
            page = ctx.new_page(); watch(page, 'trial2-' + trk); page.set_default_timeout(1800000)
            page.goto(BUILD + f'?skipmenu=1&autotest=1&mode=trial&track={trk}&laps=2&quality=low&ts=2&nointro=1'); ready(page)
            n = page.evaluate('() => !!__game.ghost && (__game.ghost.f || []).length'); page.evaluate('() => __game.ff(8)'); page.evaluate(FRAMES, 4)
            vis = page.evaluate('() => !!(__game.scene.view.ghost && __game.scene.view.ghost.visible)')
            check(n and n > 100 and vis, f'{trk}: the next trial loads the ghost ({n} frames) and shows it'); shot(page, f'v10-trial-ghost-{trk}'); page.close()
    elif scenario == 'settings':
        PRESETS = {'low': (0, 0, 1.7, 45), 'medium': (2, 1024, 1.25, 90), 'high': (4, 2048, 1, 120), 'ultra': (4, 4096, 0.85, 160)}
        STEPS = [('opt', 'preset', p) for p in ['medium', 'high', 'ultra', 'low', 'high']] + [('opt', k, v) for k in ['shadows', 'ao', 'volumetrics', 'motionBlur', 'grain', 'ca', 'flare'] for v in ['off', 'on']] + [('set', 'resScale', '0.5'), ('set', 'resScale', '1'), ('set', 'fov', '95'), ('set', 'fov', '72')]
        STATE = "() => { const g = __game, c = g.gfx.cfg; return { preset: g.settings.preset, msaa: c.msaa, shadow: c.shadow, ao: !!c.ao, shafts: !!c.shafts, grain: g.gfx.post.grain, flare: g.gfx.post.flare, glError: g.gfx.gl.getError(), lod: g.gfx.lodBias, hazeCap: c.hazeCap }; }"
        CAMS = {'canopy': "const t = __game.scene.race.track, i = t.tags.get('branches')[60], p = t.pos[i], f = t.tan[i]; return { pos: [p.x - f.x * 40, p.y + 6, p.z - f.z * 40], at: [p.x + f.x * 160, p.y, p.z + f.z * 160], fov: 66 };",
                'nexus': "const t = __game.scene.race.track, i = t.tags.get('core')[60], p = t.pointAt(i, 0, -6), q = t.pointAt(i + 30, 0, -4), n = t.nrm[i]; return { pos: [p.x + n.x * 3, p.y + n.y * 3, p.z + n.z * 3], at: [q.x, q.y, q.z], up: [n.x, n.y, n.z], fov: 70 };"}
        from PIL import Image, ImageStat
        for trk in ['canopy', 'nexus']:
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
        for trk in os.environ.get('BENCH_TRACKS', ','.join(ALL8)).split(','):
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
