"""Graphics settings at runtime: during a frozen Neon Spire race (camera next to a hero tower), switch every preset and
every graphics toggle through the game's own settings action, render frames after each change, and check the renderer
configuration, WebGL errors, page errors, that the frame is not blank, and that hero facade relief follows the preset
(none on Low). Software rendering (SwiftShader) in this harness.
usage: python3 tests/settings.py BUILD.html [OUTDIR]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/gr-settings'); out.mkdir(parents=True, exist_ok=True)
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
STATE = """() => { const g = __game, c = g.gfx.cfg, L = g.scene.course.live; let relief = 0; if (L) for (const h of L) if (h.it && h.it.visible) relief++;
  return { preset: g.settings.preset, msaa: c.msaa, shadow: c.shadow, ao: !!c.ao, shafts: !!c.shafts, grain: g.gfx.post.grain, flare: g.gfx.post.flare, res: g.gfx.w + 'x' + g.gfx.h, glError: g.gfx.gl.getError(), relief, lod: g.gfx.lodBias, hazeCap: c.hazeCap }; }"""
PRESETS = {'low': (0, 0, 1.7, 45), 'medium': (2, 1024, 1.25, 90), 'high': (4, 2048, 1, 120), 'ultra': (4, 4096, 0.85, 160)}  # msaa, shadow map size, V6: LOD scale, dust-cloud cap
STEPS = [('opt', 'preset', p) for p in ['medium', 'high', 'ultra', 'low', 'high']] + \
        [('opt', k, v) for k in ['shadows', 'ao', 'volumetrics', 'motionBlur', 'grain', 'ca', 'flare'] for v in ['off', 'on']] + \
        [('set', 'resScale', '0.5'), ('set', 'resScale', '1'), ('set', 'fov', '95'), ('set', 'fov', '72')]
errors, results, fails = [], [], []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000); pg.set_default_navigation_timeout(240000)
    pg.on('pageerror', lambda e: errors.append('pageerror ' + str(e)[:200]))
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text[:200]}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(build + '?skipmenu=1&autotest=1&laps=1&quality=low&track=spire&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
    pg.evaluate(FRAMES, 2); pg.evaluate("() => { __game.timeScale = 0; __game.shotCam = { pos: [51.5, 80.9, 1043.7], at: [77.3, 78.9, 1080.5], fov: 50 }; }")
    for kind, k, v in STEPS:
        n0 = len(errors)
        pg.evaluate('([a, b]) => __game.action(a, b)', [kind, f'{k}:{v}']); pg.evaluate(FRAMES, 3); s = pg.evaluate(STATE)
        ok, why = True, []
        if s['glError'] != 0: ok = False; why.append(f"WebGL error {s['glError']}")
        if len(errors) > n0: ok = False; why.append('page/console errors')
        if k == 'preset':
            ms, sh, lod, hc = PRESETS[v]
            if s['msaa'] != ms or s['shadow'] != sh: ok = False; why.append(f"cfg msaa {s['msaa']} shadow {s['shadow']}")
            if abs(s['lod'] - lod) > 1e-6 or s['hazeCap'] != hc: ok = False; why.append(f"LOD scale {s['lod']} / dust cap {s['hazeCap']} do not follow the preset")
            if v == 'low' and s['relief'] != 0: ok = False; why.append('hero relief visible on Low')
            if v in ('high', 'ultra') and s['relief'] == 0: ok = False; why.append('no hero relief on ' + v)
            f = out / f'settings-{v}.png'; pg.screenshot(path=str(f), timeout=900000); mean = sum(ImageStat.Stat(Image.open(f).convert('L')).mean)
            s['mean'] = round(mean, 1)
            if mean < 3: ok = False; why.append('blank frame')
        exp = {('shadows', 'off'): s['shadow'] == 0, ('ao', 'off'): not s['ao'], ('ao', 'on'): s['ao'], ('volumetrics', 'off'): not s['shafts'], ('volumetrics', 'on'): s['shafts'],
               ('grain', 'off'): s['grain'] == 0, ('grain', 'on'): s['grain'] > 0, ('flare', 'off'): s['flare'] == 0, ('flare', 'on'): s['flare'] > 0, ('shadows', 'on'): s['shadow'] > 0}.get((k, v), True)
        if not exp: ok = False; why.append('setting not applied')
        row = {'step': f'{kind} {k}:{v}', 'ok': ok, 'why': why, **s}; results.append(row); print(json.dumps(row), flush=True)
        if not ok: fails.append(row['step'])
    b.close()
print('errors:', json.dumps(errors[:6]))
print(f"{len(results) - len(fails)} of {len(results)} settings steps pass" + (f"; failed: {fails}" if fails else ''))
sys.exit(1 if fails else 0)
