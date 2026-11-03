"""Matched screenshots from fixed viewpoints, for before/after comparisons between builds.
The race is frozen on the starting grid (time scale 0) and the camera is placed from track coordinates,
so two builds with the same simulation produce the same framing. HUD hidden.
usage: python3 tests/matched.py BUILD.html OUTDIR [view-name-filter]"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
only = sys.argv[3] if len(sys.argv) > 3 else ''
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TR = ("const g = __game, t = g.scene.race.track, N = t.N, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; };"
      "let cx = 0, cz = 0; for (const q of t.pos) { cx += q.x; cz += q.z; } cx /= N; cz /= N;")
RACE = 'skipmenu=1&autotest=1&laps=1&quality=high&track='
VIEWS = [
    ('01-spire-skyline', RACE + 'spire', TR + "g.shotCam = { pos: P(-30, 0, 6), at: P(70, 0, 70), fov: 72 };"),
    ('02-spire-close-pass', RACE + 'spire', TR + "g.shotCam = { pos: P(N * 0.62, 22, -10), at: P(N * 0.62 + 30, 10, -25), fov: 70 };"),
    ('03-player-ship', RACE + 'ring', TR + "const r = g.scene.race.player, s = r.ship.pos, i = r.ti, b = t.bin[i], n = t.nrm[i], f = t.tan[i], o = (k, a, c, d) => s[k] + b[k] * a + n[k] * c + f[k] * d;"
     "g.shotCam = { pos: ['x', 'y', 'z'].map(k => o(k, 5, 1.6, 7)), at: [s.x, s.y, s.z], fov: 50 };"),
    ('04-rival-group', RACE + 'ring', TR + "const r = g.scene.race.player, s = r.ship.pos, i = r.ti, b = t.bin[i], n = t.nrm[i], f = t.tan[i], o = (k, a, c, d) => s[k] + b[k] * a + n[k] * c + f[k] * d;"
     "g.shotCam = { pos: ['x', 'y', 'z'].map(k => o(k, 9, 5, 34)), at: ['x', 'y', 'z'].map(k => o(k, 0, 0, 6)), fov: 55 };"),
    ('05-asteroid-formation', RACE + 'belt', TR + "g.shotCam = { pos: P(N * 0.3, 0, 10), at: P(N * 0.3 + 60, 0, 0), fov: 70 };"),
    ('06-gas-giant-ring', RACE + 'ring', TR + "const p = P(N * 0.5, 0, 20), d = [-0.55, 0.12, 0.83]; g.shotCam = { pos: p, at: p.map((v, k) => v + d[k] * 1000), fov: 70 };"),
    ('07-capital-ship', RACE + 'ring', TR + "const c = [cx - 3200, 380, cz + 1800]; g.shotCam = { pos: [c[0] + 1700, c[1] + 350, c[2] - 1500], at: c, fov: 45 };"),
    ('08-trench', RACE + 'foundry', TR + "g.shotCam = { pos: P(N * 0.42, 0, -3), at: P(N * 0.42 + 25, 0, -5), fov: 72 };"),
    ('09-hangar', 'menu=1&view=hangar&quality=high&ship=0', ''),
    ('10-flyover', 'skipmenu=1&laps=1&quality=high&track=ring', ''),
]
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for name, q, js in VIEWS:
        if only and only not in name: continue
        pg = b.new_page(viewport={'width': 960, 'height': 540}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.set_default_navigation_timeout(180000)
        pg.goto(build + '?' + q); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=180000)
        if js:
            pg.evaluate('() => { __game.timeScale = 0; }'); time.sleep(1); pg.evaluate('() => {' + js + '}')
            pg.evaluate("() => { for (const id of ['hud', 'markers']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }")
        time.sleep(6 if js else 5)
        pg.screenshot(path=str(out / f'{name}.png'), timeout=240000); print(name, 'ok', errs[:2]); pg.close()
    b.close()
