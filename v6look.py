"""Stock ships must look exactly as they did in V6. Renders all five ships in the hangar with both builds under identical
conditions (seeded Math.random, frozen hangar clock, frozen turntable, fixed camera, particles off, menus hidden) and
compares the pixels of the ship area. Two V6 renders give the noise floor.
usage: python3 tests/v6look.py V6.html V7.html OUTDIR [--quality=medium]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
v6, v7, out = pathlib.Path(args[0]).resolve(), pathlib.Path(args[1]).resolve(), pathlib.Path(args[2]); out.mkdir(parents=True, exist_ok=True); Q = opt.get('quality', 'medium')
SEED = "(() => { let s = 12345; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
FREEZE = """() => { const g = __game, H = g.hangar, u = H.update.bind(H), r = g.gfx.render.bind(g.gfx);
  H.update = (dt, t, fx, cam) => u(0, 10, fx, cam); g.gfx.render = (s, c, dt) => r(s, c, 0); H.freezeSpin = 0.95; g.fx.max = 0;
  g.shotCam = { pos: [3.0, 4.6, 3.4], at: [0, 1.75, -0.1], fov: 42 }; document.getElementById('ui').style.visibility = 'hidden'; }"""
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
BOX = (250, 90, 750, 470); SHIPS = ['kestrel', 'wisp', 'lancer', 'halberd', 'corsair']
def shots(b, build, tag):
    ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED); pg = ctx.new_page(); pg.set_default_timeout(900000); files = []
    pg.goto(build.as_uri() + f'?view=hangar&quality={Q}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000); pg.evaluate(FREEZE)
    for k, s in enumerate(SHIPS):
        info = pg.evaluate("i => { const g = __game; g.opts.ship = i; if (g.garage) g.garage.draft = g.garage.saved; g.setShowcase(); const sv = g.hangar.show[0]; return { ship: sv.def.id, cust: sv.hull.cust || null }; }", k)
        pg.evaluate(FRAMES, 4); f = out / f'{tag}-{s}.png'; pg.screenshot(path=str(f), timeout=900000); files.append((f, info))
    ctx.close(); return files
def diff(a, b):
    A, B = Image.open(a).convert('RGB').crop(BOX), Image.open(b).convert('RGB').crop(BOX); d = ImageChops.difference(A, B); st = ImageStat.Stat(d)
    return round(sum(st.mean) / 3, 3), max(m for _, m in d.getextrema()), sum(1 for p in d.getdata() if max(p) > 8)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    A, B, C = shots(b, v6, 'v6a'), shots(b, v6, 'v6b'), shots(b, v7, 'v7'); b.close()
fails = []
for (fa, _), (fb, _), (fc, info), s in zip(A, B, C, SHIPS):
    noise, d = diff(fa, fb), diff(fa, fc); ok = info['cust'] is None and d[0] <= noise[0] + 0.05 and d[2] <= noise[2] + 40
    print(json.dumps({'ship': s, 'v6_vs_v6': {'mean': noise[0], 'max': noise[1], 'px>8': noise[2]}, 'v6_vs_v7': {'mean': d[0], 'max': d[1], 'px>8': d[2]}, 'factoryPath': info['cust'] is None, 'ok': ok}))
    if not ok: fails.append(s)
print(f"{len(SHIPS) - len(fails)} of {len(SHIPS)} stock ships render as in V6" + (f"; differ: {fails}" if fails else ''))
sys.exit(1 if fails else 0)
