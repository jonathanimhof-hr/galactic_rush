"""Galactic Rush V2 browser playtests (headless Chromium, software WebGL). Frame rates here mean nothing.
usage: python3 tests/playtest.py races|flow|ghost|champ|bench|moments [outdir]"""
import sys, json, time, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
V2 = pathlib.Path(os.environ.get('GR_BUILD') or ROOT / 'dist' / 'galactic-rush-v8.html').resolve().as_uri()  # the build under test (GR_BUILD overrides)
V1 = (ROOT.parent / 'galactic-rush' / 'dist' / 'galactic-rush.html').as_uri()
scenario = sys.argv[1] if len(sys.argv) > 1 else 'races'
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/gr2'); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
errors = []
def watch(page, tag):
    page.on('console', lambda m: errors.append(f'{tag}: [{m.type}] {m.text}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'{tag}: [pageerror] {e}'))
def ready(page): page.wait_for_function('() => window.__game && window.__game.ready', timeout=180000)
def st(page): return page.evaluate("() => { const g = __game, r = g.scene && g.scene.race; return { state: g.state, scene: g.scene && g.scene.kind, t: r ? +r.time.toFixed(1) : null, track: g.scene && g.scene.id, me: r && r.player ? { lap: r.player.lap, place: r.player.place, fin: r.player.finished } : null }; }")
def shot(page, name): page.screenshot(path=str(out / f'{name}.png'), timeout=240000); print('shot', name, json.dumps(st(page)))
def tap(page, sel):  # V7: centre the target first so a sticky action bar never covers it
    page.wait_for_selector(sel, state='attached', timeout=60000)
    page.eval_on_selector(sel, "e => { if (!e.closest('.actbar')) e.scrollIntoView({ block: 'center', inline: 'nearest' }); }")
    page.click(sel, force=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 960, 'height': 540})
    if scenario == 'races':
        import os; CAP = int(os.environ.get('RACE_CAP', '900'))  # wall-clock seconds per race; software rendering is slow
        for trk in os.environ.get('TRACKS', 'foundry,belt,spire,ring').split(','):
            page = ctx.new_page(); watch(page, trk)
            page.goto(V2 + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality=low&ts=4'); ready(page)
            t0 = time.time()
            while time.time() - t0 < CAP:
                time.sleep(3); s = st(page)
                if s['state'] == 'results': break
            res = page.evaluate("() => { const r = __game.result && __game.result.race; return r ? r.order.map(o => o.name + ':' + (o.finished ? o.finishTime.toFixed(1) : 'DNF')) : null; }")
            print(trk, 'state', st(page)['state'], 'order', res, 'in', round(time.time() - t0), 's')
            page.close()
    elif scenario == 'flow':
        W = lambda cond, t=240000: page.wait_for_function(cond, timeout=t)
        page = ctx.new_page(); watch(page, 'flow'); page.goto(V2 + '?quality=low'); ready(page); W("() => __game.state === 'title'")
        print('title:', st(page)['state']); page.keyboard.press('Enter'); time.sleep(3)
        print('after one Enter on title ->', st(page)['state'], '(must be ship, not track)')
        page.keyboard.press('ArrowRight'); W('() => __game.opts.ship === 1'); print('ArrowRight -> ship index', page.evaluate('() => __game.opts.ship'))
        page.keyboard.press('Enter'); W("() => __game.state === 'track'"); print('Enter in hangar ->', st(page)['state'])
        tap(page, '[data-act=track][data-arg=spire]'); W("() => __game.opts.track === 'spire'"); tap(page, '[data-act=laps][data-arg=\"1\"]'); W('() => __game.opts.laps === 1')
        tap(page, '[data-act=start]'); W("() => __game.state === 'intro'"); print('Launch ->', st(page)['state']); shot(page, 'flow-intro')
        page.keyboard.press('Space'); W("() => __game.state === 'race'"); print('Space skips the flyover ->', st(page)['state'])
        page.keyboard.press('Escape'); W("() => __game.state === 'paused'"); print('Esc ->', st(page)['state'])
        CLK = '() => { const r = __game.scene.race; return r.time - r.countdown; }'  # advances through the countdown too
        t0 = page.evaluate(CLK); time.sleep(4); print('paused sim frozen:', t0 == page.evaluate(CLK))
        tap(page, '[data-act=settings]'); W("() => !!document.querySelector('.tabs')"); tap(page, '[data-act=tab][data-arg=graphics]'); time.sleep(2); shot(page, 'flow-settings')
        tap(page, '[data-act=back]'); W("() => !!document.querySelector('[data-act=resume]')"); tap(page, '[data-act=resume]'); W("() => __game.state === 'race'"); print('Resume ->', st(page)['state'])
        c1 = page.evaluate(CLK)  # software frames on the city course can take several seconds each, so wait for progress instead of a fixed time
        page.wait_for_function(f'() => ({CLK})() > {c1}', timeout=180000); print('sim runs again after resume:', page.evaluate(CLK) > c1)
        page.keyboard.press('KeyC'); W("() => __game.camMode === 'far'"); page.keyboard.press('KeyC'); W("() => __game.camMode === 'cockpit'"); print('C cycles camera ->', page.evaluate('() => __game.camMode'))
        page.evaluate('() => { __game.audio.init(); __game.audio.configure(__game.settings); }'); time.sleep(1)
        print('audio context:', page.evaluate('() => __game.audio.ctx && __game.audio.ctx.state'))
        page.keyboard.down('Space'); time.sleep(3); page.keyboard.up('Space'); page.keyboard.press('KeyJ'); page.keyboard.press('KeyK'); time.sleep(4)
        for n in ['hit', 'explode', 'pad', 'cell', 'fire', 'ionHit', 'shield', 'checkpoint', 'lap', 'finalLap', 'finish', 'warn', 'count', 'go', 'boost', 'scrape']: page.evaluate(f"() => __game.audio.play('{n}', 1)")
        page.evaluate("() => { __game.audio.music('final'); __game.audio.setEnv('tunnel'); __game.audio.ui('click'); }"); time.sleep(3)
        print('audio still running:', page.evaluate('() => __game.audio.ctx.state'), 'race time', page.evaluate('() => __game.scene.race.time.toFixed(1)'))
    elif scenario == 'ghost':
        p1 = ctx.new_page(); watch(p1, 'v1'); p1.goto(V1 + '?skipmenu=1&autotest=1&mode=trial&track=belt&laps=2&quality=low&ts=4')
        t0 = time.time()
        while time.time() - t0 < 600:
            time.sleep(3)
            g = p1.evaluate("() => { try { const s = JSON.parse(localStorage.getItem('galactic-rush.v1') || '{}'); return s.ghosts && s.ghosts.belt ? s.ghosts.belt.lap : null; } catch (e) { return 'err ' + e; } }")
            if g: break
        v1save = p1.evaluate("() => localStorage.getItem('galactic-rush.v1')"); print('V1 recorded ghost lap', g); p1.close()
        p2 = ctx.new_page(); watch(p2, 'v2'); p2.goto(V2 + '?quality=low'); ready(p2)
        shared = p2.evaluate("() => { try { const s = JSON.parse(localStorage.getItem('galactic-rush.v1') || '{}'); return !!(s.ghosts && s.ghosts.belt); } catch (e) { return false; } }")
        print('V1 storage visible to V2 on this origin:', shared)
        if not shared:
            p2.evaluate("t => localStorage.setItem('galactic-rush.v1', t)", v1save)
        # V1 ghosts live under Classic handling (V1's physics); Relaxed keeps its own records
        p2.evaluate("() => { const s = JSON.parse(localStorage.getItem('galactic-rush.v1') || '{}'); s.settings = Object.assign(s.settings || {}, { handling: 'classic' }); localStorage.setItem('galactic-rush.v1', JSON.stringify(s)); }")
        p2.goto(V2 + '?skipmenu=1&autotest=1&mode=trial&track=belt&laps=2&quality=low&ts=2&nointro=1'); ready(p2)
        print('ghost loaded:', p2.evaluate("() => !!__game.ghost && __game.ghost.f.length"))
        p2.evaluate('() => __game.ff(6)'); time.sleep(4)
        print('ghost visible:', p2.evaluate('() => __game.scene.view.ghost.visible'), 'delta', p2.evaluate('() => __game.racefx.ghostDelta'))
        shot(p2, 'ghost')
    elif scenario == 'champ':
        page = ctx.new_page(); watch(page, 'champ'); page.goto(V2 + '?skipmenu=1&autotest=1&mode=champ&laps=1&quality=low&ts=4'); ready(page)
        for rnd in range(2):
            page.wait_for_function("() => __game.state === 'results'", timeout=900000); time.sleep(2)
            print('round', rnd + 1, 'on', st(page)['track'], '-> championship round counter', page.evaluate('() => __game.champ.round'), 'points', page.evaluate('() => JSON.stringify(__game.champ.c.points)'))
            if rnd == 0:
                tap(page, '[data-act=champHub]'); page.wait_for_function("() => !!document.querySelector('[data-act=nextRound]')", timeout=60000); shot(page, 'champ-hub')
                tap(page, '[data-act=nextRound]'); page.wait_for_function("() => __game.state === 'race'", timeout=240000); print('next round started on', st(page)['track'])
    elif scenario == 'bench':
        page = ctx.new_page(); watch(page, 'bench'); page.goto(V2 + '?bench=short&presets=low,medium,high,ultra'); ready(page)
        page.wait_for_function('() => window.__bench', timeout=1200000); print('bench', page.evaluate('() => JSON.stringify(window.__bench)')); shot(page, 'bench')
    elif scenario == 'moments':
        def fresh(url):  # a new page per step: navigating away from a busy software-WebGL page can stall the old one's unload
            pg = ctx.new_page(); pg.set_default_navigation_timeout(180000); watch(pg, 'moments'); pg.goto(url); ready(pg); return pg
        page = fresh(V2 + '?quality=medium'); time.sleep(4); shot(page, 'title'); page.close()
        page = fresh(V2 + '?skipmenu=1&quality=medium&track=foundry&laps=1'); time.sleep(3); shot(page, 'intro'); page.close()
        page = fresh(V2 + '?skipmenu=1&autotest=1&quality=medium&track=belt&laps=1&nointro=1'); page.evaluate('() => __game.ff(8)')
        page.evaluate("() => { const p = __game.scene.race.player; p.ship.hull = -1; }"); time.sleep(1.2); shot(page, 'wreck')
        page.evaluate('() => __game.ff(26)')  # then creep up on the line so the shot lands in the slow-motion finish
        print('crossed the line:', page.evaluate("() => { const r = __game.scene.race; for (let k = 0; k < 120 && !r.player.finished; k++) __game.ff(0.25); return r.player.finished; }"))
        page.evaluate('() => { __game.slowmo = 40; }'); time.sleep(3); shot(page, 'finish'); page.evaluate('() => { __game.slowmo = 0; }')  # software frames take ~2 s, so hold the 2.5 s slow-mo open for the shot
        page.wait_for_function("() => __game.state === 'results'", timeout=600000); time.sleep(4); shot(page, 'results')
    b.close()
print('\n'.join(errors[:30]) if errors else 'no console errors')
