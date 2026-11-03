"""Labelled screenshot sheets from a JSON spec: each view loads a page (pages are reused for consecutive views with the
same query), freezes the race, hides the HUD, places the test camera and waits a few real frames before capturing.
usage: python3 tests/views.py BUILD.html SPEC.json OUT.png [cols] [only-label-substring]
SPEC: { "title": "...", "views": [ { "label": "...", "query": "skipmenu=1&...", "cam": {"pos": [..], "at": [..], "fov": 40}
                                     or "js": "() => ({ pos, at, fov })", "pre": "() => {...}" (optional) } ] }"""
import sys, json, time, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); spec = json.loads(pathlib.Path(sys.argv[2]).read_text()); out = sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 3; only = sys.argv[5] if len(sys.argv) > 5 else None
views = [v for v in spec['views'] if not only or only in v['label']]
W, H = 480, 270; rows = (len(views) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows + 30), (14, 16, 20)); d = ImageDraw.Draw(sheet); d.text((8, 8), spec.get('title', ''), fill=(255, 205, 110))
HIDE = "() => { for (const id of ['ui', 'hud', 'markers', 'reticle']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }"
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = None; cur = None
    for i, v in enumerate(views):
        if v['query'] != cur:
            if pg: pg.close()
            pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_navigation_timeout(240000); pg.set_default_timeout(900000)
            pg.on('pageerror', lambda e: print('pageerror', e))
            pg.goto(build + '?' + v['query']); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=240000); cur = v['query']
            pg.evaluate(FRAMES, 3); pg.evaluate('() => { if (__game.scene && __game.scene.race) __game.timeScale = 0; }'); pg.evaluate(HIDE)
        if v.get('pre'): pg.evaluate(v['pre'])
        cam = v.get('cam') or pg.evaluate(v['js'])
        if cam: pg.evaluate('(s) => { __game.shotCam = s; }', cam)
        pg.evaluate(FRAMES, int(v.get('frames', 4))); pg.evaluate(HIDE)
        f = '/tmp/_views.png'; pg.screenshot(path=f, timeout=900000)
        im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS)
        x, y = (i % cols) * W, 30 + (i // cols) * H; sheet.paste(im, (x, y))
        d.rectangle([x, y, x + len(v['label']) * 6 + 10, y + 16], fill=(0, 0, 0)); d.text((x + 5, y + 3), v['label'], fill=(235, 238, 245))
        if v.get('save'): Image.open(f).save(pathlib.Path(out).with_name(v['save']))
        print('view', i + 1, '/', len(views), v['label'], flush=True)
    b.close()
sheet.save(out); print('saved', out)
