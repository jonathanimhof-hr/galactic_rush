"""Planet views for V5-vs-V6 comparison (V6): for every course, the sky body framed whole, its lit limb, and a
detail view of its surface (cloud decks, bands, lineae), from the same camera in every build.
usage: python3 tests/planetsheet.py OUTDIR BUILD1.html [BUILD2.html ...] [--courses=belt,ring,spire,foundry]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
out = pathlib.Path(args[0]); out.mkdir(parents=True, exist_ok=True); builds = args[1:]
courses = opt.get('courses', 'belt,ring,spire,foundry').split(',')
LIFT = {'belt': 0, 'ring': 0, 'spire': 1300, 'foundry': 900}
CAMS = r"""(lift) => { const g = __game, t = g.scene.race.track, pl = g.scene.course.env.planet, sun = g.scene.course.env.sunDir;
  const s = t.pointAt(0, 0, 20), cam = [s.x, s.y + lift, s.z], d = Math.hypot(pl.dir.x, pl.dir.y, pl.dir.z), C = [pl.dir.x / d * pl.dist, pl.dir.y / d * pl.dist, pl.dir.z / d * pl.dist];
  const v = [C[0] - cam[0], C[1] - cam[1], C[2] - cam[2]], D = Math.hypot(...v); v[0] /= D; v[1] /= D; v[2] /= D;
  const sd = sun.x * v[0] + sun.y * v[1] + sun.z * v[2]; let sp = [sun.x - v[0] * sd, sun.y - v[1] * sd, sun.z - v[2] * sd]; const sl = Math.hypot(...sp) || 1; sp = sp.map(x => x / sl);
  const ang = Math.asin(Math.min(0.999, pl.r / D)) * 180 / Math.PI, at = f => [C[0] + sp[0] * pl.r * f, C[1] + sp[1] * pl.r * f, C[2] + sp[2] * pl.r * f];
  return [{ name: 'full', pos: cam, at: C, fov: Math.min(100, ang * 2.5) }, { name: 'limb', pos: cam, at: at(0.97), fov: ang * 0.42 }, { name: 'detail', pos: cam, at: at(0.4), fov: ang * 0.55 }]; }"""
HIDE = "() => { for (const id of ['ui', 'hud', 'markers', 'reticle']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }"
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for course in courses:
        for bi, f in enumerate(builds):
            pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000); pg.set_default_navigation_timeout(240000)
            pg.on('pageerror', lambda e: print('pageerror', e, flush=True))
            pg.goto(pathlib.Path(f).resolve().as_uri() + f'?skipmenu=1&autotest=1&laps=1&quality=high&track={course}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
            pg.evaluate(FRAMES, 2); pg.evaluate('() => { __game.timeScale = 0; }'); pg.evaluate(HIDE)
            for c in pg.evaluate(CAMS, LIFT[course]):
                pg.evaluate('(s) => { __game.shotCam = s; }', c); pg.evaluate(FRAMES, 6); pg.evaluate(HIDE)
                pg.screenshot(path=str(out / f"{course}-{c['name']}-b{bi}.png"), timeout=900000); print('shot', course, c['name'], bi, flush=True)
            pg.close()
    b.close()
