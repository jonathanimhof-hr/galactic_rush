"""Screenshot harness for the real build in headless Chromium (software WebGL).
usage: python3 tests/shots.py OUT.png [--size 960x540] SPEC [SPEC ...]
SPEC is a query string, e.g. "track=foundry&quality=high&ff=12&cam=chase" or "menu=title".
Extra keys: ff=<sim seconds to fast-forward>, cam=chase|far|cockpit|orbit, wait=<seconds>, js=<code to run before shot>."""
import sys, time, json, pathlib, urllib.parse
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = sorted((ROOT / 'dist').glob('*.html'), key=lambda p: ('artifact' in p.name, p.name))[0]
args = sys.argv[1:]; out = args.pop(0); size = (960, 540)
if args and args[0] == '--size': args.pop(0); w, h = args.pop(0).split('x'); size = (int(w), int(h))
errors, tiles = [], []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    for spec in args:
        q = dict(urllib.parse.parse_qsl(spec)); page = b.new_page(viewport={'width': size[0], 'height': size[1]})
        page.on('console', lambda m, sp=spec: errors.append(f'{sp}: [{m.type}] {m.text}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
        page.on('pageerror', lambda e, sp=spec: errors.append(f'{sp}: [pageerror] {e}'))
        url_q = {k: v for k, v in q.items() if k not in ('ff', 'cam', 'wait', 'js', 'menu')}
        if 'menu' not in q: url_q.update({'skipmenu': '1', 'autotest': '1'})
        page.goto(BUILD.as_uri() + '?' + urllib.parse.urlencode(url_q))
        page.wait_for_function('() => window.__game && (window.__game.ready !== false)', timeout=120000)
        time.sleep(1.5)
        if 'ff' in q: page.evaluate(f"() => __game.ff({float(q['ff'])})")
        if 'cam' in q: page.evaluate(f"() => {{ __game.camMode = '{q['cam']}'; __game.snapCamera = true; }}")
        if 'js' in q: page.evaluate(q['js'])
        time.sleep(float(q.get('wait', 3)))
        f = out.replace('.png', f'_{len(tiles)}.png'); page.screenshot(path=f, timeout=240000); tiles.append((spec, f))
        info = page.evaluate("() => { const g = __game, r = g.scene && g.scene.race; return r ? { t: +r.time.toFixed(1), st: g.state, draws: g.gfx.stats.draws, culled: g.gfx.stats.culled, sd: g.gfx.stats.shadowDraws, res: g.gfx.w + 'x' + g.gfx.h } : { st: g.state } }")
        print(spec, json.dumps(info)); page.close()
    b.close()
cols = 2 if len(tiles) > 1 else 1; rows = (len(tiles) + cols - 1) // cols; tw, th = size[0] // cols if cols > 1 else size[0], size[1] // cols if cols > 1 else size[1]
sheet = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
for k, (spec, f) in enumerate(tiles):
    im = Image.open(f).convert('RGB').resize((tw, th)); d = ImageDraw.Draw(im); d.rectangle((0, th - 16, tw, th), fill=(0, 0, 0)); d.text((4, th - 14), spec[:90], fill=(255, 255, 0))
    sheet.paste(im, ((k % cols) * tw, (k // cols) * th))
sheet.save(out); print('saved', out)
print('\n'.join(errors) if errors else 'no console errors')
