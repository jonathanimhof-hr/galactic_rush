"""Neon Spire architecture sheet: the archetype gallery (?gallery, one of each building family in a row south of the
city) plus aerial, street-level and highway views of the generated city. Race frozen on the grid, HUD hidden.
usage: python3 tests/citysheet.py BUILD.html OUT.png"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); out = sys.argv[2]
HIDE = "() => { for (const id of ['ui', 'hud', 'markers']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }"
W, H = 960, 540; shots = []
def snap(pg, label): f = f'/tmp/_cs{len(shots)}.png'; pg.screenshot(path=f, timeout=900000); shots.append((Image.open(f).convert('RGB'), label))
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H}); pg.set_default_navigation_timeout(240000)
    pg.goto(build + '?skipmenu=1&autotest=1&laps=1&quality=high&track=spire&gallery=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=240000)
    pg.evaluate('() => { __game.timeScale = 0; }'); pg.evaluate(HIDE)
    names = pg.evaluate("() => Object.keys(__game.scene.course.blocks.gallery ? {} : {})")
    fog0 = pg.evaluate('() => { const e = __game.scene.course.env, f = e.fog; e.fog = 0.00025; return f; }')  # thin haze for the lineup only
    gal = pg.evaluate('() => __game.scene.course.blocks.gallery'); n = gal['n']; per = 9
    for k in range(0, n, per):
        mid = gal['x0'] + (k + (min(per, n - k) - 1) / 2) * gal['step']
        pg.evaluate('(a) => { __game.shotCam = { pos: [a[0], -460 + 380, a[1] + 1050], at: [a[0], -460 + 360, a[1]], fov: 56 }; }', [mid, gal['z']])
        time.sleep(6); snap(pg, f'archetypes {k + 1}-{min(n, k + per)} of {n}')
    pg.evaluate('(f) => { __game.scene.course.env.fog = f; }', fog0)
    for label, js in [('aerial over the city', "const t = __game.scene.race.track, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, N = t.N; __game.shotCam = { pos: P(N * 0.1, 0, 420), at: P(N * 0.5, 0, -250), fov: 62 };"),
                      ('below the course, among the towers', "const t = __game.scene.race.track, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, N = t.N; __game.shotCam = { pos: P(N * 0.62, 50, -260), at: P(N * 0.62 + 50, 60, -230), fov: 70 };"),
                      ('elevated highway', "const h = __game.scene.course.blocks.hwys.find(q => q.segs.length > 6), s = h.segs[Math.floor(h.segs.length / 2)], a = (s[0] + s[1]) / 2, P = (al, off, y) => h.ax ? [h.line + off, y, al] : [al, y, h.line + off]; __game.shotCam = { pos: P(a - 120, 30, h.y + 25), at: P(a + 60, 0, h.y), fov: 66 };")]:
        pg.evaluate('() => {' + js + '}'); time.sleep(6); snap(pg, label)
    b.close()
sheet = Image.new('RGB', (W * 2 + 30, ((len(shots) + 1) // 2) * (H // 1 + 40) + 10), (14, 16, 22)); d = ImageDraw.Draw(sheet)
for k, (im, label) in enumerate(shots):
    x, y = 10 + (k % 2) * (W + 10), 10 + (k // 2) * (H + 40); sheet.paste(im, (x, y + 30)); d.text((x + 4, y + 8), label, fill=(255, 200, 90))
sheet.save(out); print('saved', out, len(shots), 'panels')
