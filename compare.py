"""V5-vs-V6 comparison sheets (V6): renders every view of a views.py spec in two builds from the identical camera and
lays them out as labelled pairs (left: first build, right: second build). Full-size frames are kept next to the sheet.
usage: python3 tests/compare.py BUILD_A.html BUILD_B.html SPEC.json OUT.png [label-substring] [--names=V5,V6] [--builds=0,1]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
builds = [pathlib.Path(args[0]).resolve().as_uri(), pathlib.Path(args[1]).resolve().as_uri()]; spec = json.loads(pathlib.Path(args[2]).read_text()); out = pathlib.Path(args[3])
only = args[4] if len(args) > 4 else None; names = opt.get('names', 'V5,V6').split(',')
views = [v for v in spec['views'] if not only or only in v['label']]
frames = out.with_suffix(''); frames.mkdir(parents=True, exist_ok=True)
HIDE = "() => { for (const id of ['ui', 'hud', 'markers', 'reticle']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }"
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for bi, build in enumerate(builds):
        if 'builds' in opt and str(bi) not in opt['builds'].split(','): continue  # e.g. --builds=1 renders only the second build
        pg = None; cur = None
        for i, v in enumerate(views):
            f = frames / f'{i + 1:02d}-{names[bi]}.png'
            if f.exists(): continue  # restartable
            if v['query'] != cur:
                if pg: pg.close()
                pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_navigation_timeout(240000); pg.set_default_timeout(900000)
                pg.on('pageerror', lambda e: print('pageerror', e, flush=True))
                pg.goto(build + '?' + v['query']); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000); cur = v['query']
                pg.evaluate(FRAMES, 3); pg.evaluate('() => { if (__game.scene && __game.scene.race) __game.timeScale = 0; }'); pg.evaluate(HIDE)
            if v.get('pre'): pg.evaluate(v['pre'])
            cam = v.get('cam') or (pg.evaluate(v['js']) if v.get('js') else None)
            if cam: pg.evaluate('(s) => { __game.shotCam = s; }', cam)
            pg.evaluate(FRAMES, int(v.get('frames', 5))); pg.evaluate(HIDE)
            pg.screenshot(path=str(f), timeout=900000); print('view', i + 1, '/', len(views), names[bi], v['label'], flush=True)
        if pg: pg.close()
    b.close()
if any(not (frames / f'{i + 1:02d}-{names[bi]}.png').exists() for i in range(len(views)) for bi in range(2)): print('frames rendered; sheet needs both builds'); sys.exit(0)
W, H, LH = 480, 270, 18
sheet = Image.new('RGB', (W * 2 + 12, 34 + len(views) * (H + LH + 6)), (14, 16, 20)); d = ImageDraw.Draw(sheet)
d.text((8, 6), spec.get('title', ''), fill=(255, 205, 110)); d.text((8, 20), f'left: {names[0]}    right: {names[1]}    (same camera, same frozen moment)', fill=(170, 176, 190))
for i, v in enumerate(views):
    y = 34 + i * (H + LH + 6); d.text((8, y + 3), f"{i + 1}. {v['label']}", fill=(235, 238, 245))
    for bi in range(2):
        im = Image.open(frames / f'{i + 1:02d}-{names[bi]}.png').convert('RGB').resize((W, H), Image.LANCZOS); sheet.paste(im, (bi * (W + 12), y + LH))
        d.rectangle([bi * (W + 12), y + LH, bi * (W + 12) + 26, y + LH + 14], fill=(0, 0, 0)); d.text((bi * (W + 12) + 4, y + LH + 2), names[bi], fill=(255, 205, 110))
sheet.save(out); print('saved', out, flush=True)
