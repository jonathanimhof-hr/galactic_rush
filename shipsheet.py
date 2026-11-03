"""Ship silhouette sheet: every ship from the front, side and rear under the hangar's neutral studio light (turntable
frozen, menus hidden), then from the standard chase camera and from 45 m behind on a frozen starting grid.
usage: python3 tests/shipsheet.py BUILD.html OUT.png"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); out = sys.argv[2]
NAMES = ['KESTREL', 'WISP', 'LANCER', 'HALBERD', 'CORSAIR']; COLS = ['front', 'side', 'rear', 'chase camera', '45 m behind']
W, H = 320, 180; sheet = Image.new('RGB', (W * 5 + 90, H * 5 + 24), (16, 18, 24)); d = ImageDraw.Draw(sheet)
for c, n in enumerate(COLS): d.text((90 + c * W + 6, 6), n, fill=(255, 200, 90))
HIDE = "() => { for (const id of ['ui', 'hud', 'markers']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }"
def snap(pg): f = '/tmp/_ss.png'; pg.screenshot(path=f, timeout=240000); return Image.open(f).convert('RGB').resize((W, H))
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for k, name in enumerate(NAMES):
        d.text((6, 24 + k * H + H // 2), name, fill=(220, 225, 235))
        pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_navigation_timeout(180000)
        pg.goto(build + f'?menu=1&view=hangar&quality=high&ship={k}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=180000)
        pg.evaluate(HIDE); pg.evaluate('() => { __game.hangar.freezeSpin = 0; }')
        for c, (pos, at) in enumerate([([0, 2.3, 8.5], [0, 1.9, 0]), ([8.5, 2.3, 0], [0, 1.9, 0]), ([0, 2.6, -8.5], [0, 1.9, 0])]):
            pg.evaluate('(s) => { __game.shotCam = { pos: s[0], at: s[1], fov: 34 }; }', [pos, at]); time.sleep(4); sheet.paste(snap(pg), (90 + c * W, 24 + k * H))
        pg.close()
        pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_navigation_timeout(180000)
        pg.goto(build + f'?skipmenu=1&autotest=1&laps=1&quality=high&track=ring&ship={k}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=180000)
        pg.evaluate('() => { __game.timeScale = 0; }'); pg.evaluate(HIDE); time.sleep(5); sheet.paste(snap(pg), (90 + 3 * W, 24 + k * H))
        pg.evaluate("() => { const g = __game, r = g.scene.race.player, s = r.ship.pos, t = g.scene.race.track, i = r.ti, f = t.tan[i], n = t.nrm[i];"
                    "g.shotCam = { pos: [s.x - f.x * 45 + n.x * 6, s.y - f.y * 45 + n.y * 6, s.z - f.z * 45 + n.z * 6], at: [s.x, s.y, s.z], fov: 60 }; }")
        time.sleep(4); sheet.paste(snap(pg), (90 + 4 * W, 24 + k * H)); pg.close(); print(name, 'done')
    b.close()
sheet.save(out); print('saved', out)
