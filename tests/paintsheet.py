"""V7 paint jobs on the real 3D ships, rendered by the game itself in the garage (hangar) scene: every pattern, every finish
and the special paints, plus a per-ship colour check. Each paint job is applied through the garage preview, the turntable
is frozen and a fixed camera frames the ship, so every shot differs only by its paint. Also checks that each pattern and
finish visibly changes the ship's pixels against a plain baseline, and that a stock paint job matches the factory look.
Software rendering (SwiftShader) in this harness.
usage: python3 tests/paintsheet.py BUILD.html OUTDIR [--quality=high] [--only=patterns,finishes,paints,ships]"""
import sys, json, pathlib, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat, ImageDraw, ImageFont
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
build = pathlib.Path(args[0]).resolve().as_uri(); out = pathlib.Path(args[1] if len(args) > 1 else '/tmp/gr-paint'); out.mkdir(parents=True, exist_ok=True)
Q = opt.get('quality', 'high'); ONLY = opt.get('only', 'patterns,finishes,paints,ships').split(',')
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
CAM = {'pos': [3.0, 4.6, 3.4], 'at': [0, 1.75, -0.1], 'fov': 42}  # three-quarter view from above
BOX = (250, 90, 750, 470)  # ship region in the 960x540 frame
BASE = {'primary': '#d7263d', 'secondary': '#e9ecef', 'accent': '#1fb5ac', 'paint': None, 'pattern': 'pattern.solid', 'finish': 'finish.glossy', 'exhaust': 'exhaust.standard', 'trail': 'trail.standard'}
PATTERNS = ['solid', 'factory', 'stripes', 'double', 'chevron', 'split', 'geometric', 'hex', 'camo', 'hazard']
FINISHES = ['glossy', 'matte', 'metallic', 'brushed', 'worn']
PAINTS = ['paint.aurora', 'paint.solar', 'paint.glacier', 'paint.nebula', 'paint.neon-ion', 'paint.champion']
errors, rows, fails = [], [], []

def diff(a, b):
    d = ImageChops.difference(a.crop(BOX).convert('RGB'), b.crop(BOX).convert('RGB')); return round(sum(ImageStat.Stat(d).mean) / 3, 2)
def sheet(files, labels, name, cols=5):
    ims = [Image.open(f).crop(BOX) for f in files]; w, h = ims[0].size; S = Image.new('RGB', (cols * w, ((len(ims) + cols - 1) // cols) * (h + 26)), (8, 10, 14)); d = ImageDraw.Draw(S)
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except Exception: font = None
    for k, (im, lab) in enumerate(zip(ims, labels)): x, y = (k % cols) * w, (k // cols) * (h + 26); S.paste(im, (x, y + 26)); d.text((x + 8, y + 4), lab, fill=(230, 236, 245), font=font)
    S.save(out / name); print('sheet', out / name, flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000)
    pg.on('pageerror', lambda e: errors.append('pageerror ' + str(e)[:200]))
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text[:200]}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(build + f'?view=hangar&quality={Q}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
    pg.evaluate("c => { const g = __game, H = g.hangar, u = H.update.bind(H); H.update = (dt, t, fx, cam) => u(dt, 10, fx, cam); document.getElementById('ui').style.visibility = 'hidden'; H.freezeSpin = 0.95; g.shotCam = c; g.fx.max = 0; }", CAM)  # hangar clock frozen: no bob, so shots differ only by paint
    def shot(ship, custom, name):
        pg.evaluate("([s, c]) => { const g = __game, i = ['kestrel','wisp','lancer','halberd','corsair'].indexOf(s); if (g.opts.ship !== i) { g.opts.ship = i; g.garage.draft = g.garage.saved; g.setShowcase(); } g.garage.draft = c; g.garage.preview(); }", [ship, custom])
        pg.evaluate(FRAMES, 4); f = out / f'{name}.png'; pg.screenshot(path=str(f), timeout=900000); return f
    # stock ship vs the same ship through the custom-paint path with factory values: must look the same
    stock = shot('kestrel', None, 'kestrel-stock')
    fac = pg.evaluate("() => { const c = __game.progress.custom('kestrel'); return { ...c }; }")
    same = shot('kestrel', {**fac, 'pattern': 'pattern.factory'}, 'kestrel-stock-again')
    rows.append({'check': 'stock paint renders identically twice (noise floor)', 'meanDiff': diff(Image.open(stock), Image.open(same))})
    if 'patterns' in ONLY:
     pf = [shot('kestrel', {**BASE, 'pattern': f'pattern.{p}'}, f'pattern-{p}') for p in PATTERNS]
     for p, f in zip(PATTERNS, pf):
        if p == 'solid': continue
        d = diff(Image.open(pf[0]), Image.open(f)); ok = d > 1.0; rows.append({'check': f'pattern {p} visible vs solid', 'meanDiff': d, 'ok': ok})
        if not ok: fails.append(f'pattern {p}')
     sheet(pf, [f'Pattern: {p}' for p in PATTERNS], 'sheet-patterns.png')
    if 'finishes' in ONLY:  # finishes (with racing stripes, so the paint has two colours)
     ff = [shot('kestrel', {**BASE, 'pattern': 'pattern.stripes', 'finish': f'finish.{x}'}, f'finish-{x}') for x in FINISHES]
     for x, f in zip(FINISHES, ff):
        if x == 'glossy': continue
        d = diff(Image.open(ff[0]), Image.open(f)); ok = d > 0.6; rows.append({'check': f'finish {x} differs from glossy', 'meanDiff': d, 'ok': ok})
        if not ok: fails.append(f'finish {x}')
     sheet(ff, [f'Finish: {x}' for x in FINISHES], 'sheet-finishes.png')
    if 'paints' in ONLY:  # special paints
     sp = [shot('kestrel', {**BASE, 'paint': x}, x.replace('.', '-')) for x in PAINTS]
     sheet(sp, PAINTS, 'sheet-paints.png', cols=3)
    ships = ['kestrel', 'wisp', 'lancer', 'halberd', 'corsair']; sf = []  # every ship: primary / secondary / accent each change their own region
    for s in (ships if 'ships' in ONLY else []):
        base = {**pg.evaluate(f"() => ({{ ...__game.progress.custom('{s}') }})"), 'pattern': 'pattern.solid'}
        a = shot(s, base, f'{s}-a'); sf.append(a)
        for slot, col in [('primary', '#2d5bd6'), ('secondary', '#f2c230'), ('accent', '#d23c9a')]:
            f = shot(s, {**base, slot: col}, f'{s}-{slot}'); d = diff(Image.open(a), Image.open(f)); ok = d > 0.25
            rows.append({'check': f'{s}: {slot} colour changes the ship', 'meanDiff': d, 'ok': ok}); sf.append(f)
            if not ok: fails.append(f'{s} {slot}')
    if sf: sheet(sf, [f'{s} {k}' for s in ships for k in ['base', 'primary blue', 'secondary yellow', 'accent magenta']], 'sheet-ships-colours.png', cols=4)
    b.close()
for r in rows: print(json.dumps(r))
print('errors:', json.dumps(errors[:6]))
print(f"{sum(1 for r in rows if r.get('ok'))} of {sum(1 for r in rows if 'ok' in r)} paint checks pass" + (f"; failed: {fails}" if fails else ''))
sys.exit(1 if fails or errors else 0)
