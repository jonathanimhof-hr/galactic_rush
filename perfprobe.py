"""GPU-synchronised frame timing for a few frozen views, for diagnosing where frame time goes (V6).
Each timed frame ends with a 1-pixel readPixels, so the time covers the whole frame on the GPU (software rendering
here: compare builds, never hardware). usage: python3 tests/perfprobe.py BUILD.html [BUILD2.html ...] [--views=a,b]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
TR = "const g = __game, t = g.scene.race.track, N = t.N, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; };"
VIEWS = {  # name: (course, preset, camera js) - the two V5 outliers first, then the course views of tests/fixedbench.py
    'ring-plane': ('ring', 'high', "return { pos: P(N * 0.3, 40, 12), at: P(N * 0.3 + 60, -40, 0), fov: 70 };"),
    'belt-overview': ('belt', 'high', "return { pos: P(N * 0.6, 200, 300), at: P(N * 0.7, 0, 0), fov: 70 };"),
    'belt-race': ('belt', 'high', "return { pos: P(N * 0.3, 0, 10), at: P(N * 0.3 + 60, 0, 0), fov: 70 };"),
    'ring-high': ('ring', 'high', "return { pos: P(N * 0.15, 0, 30), at: P(N * 0.15 + 40, 0, 30), fov: 60 };"),
    'spire-start': ('spire', 'high', "return { pos: P(-30, 0, 6), at: P(70, 0, 70), fov: 72 };"),
    'spire-mid': ('spire', 'high', "return { pos: P(N * 0.45, 0, 8), at: P(N * 0.45 + 40, 0, 4), fov: 72 };"),
}
names = opt.get('views', 'ring-plane,belt-overview').split(',')
TIME = """async (n) => { const gl = __game.gfx.gl, px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), raf = () => new Promise(r => requestAnimationFrame(r));
  await raf(); sync(); const ts = []; for (let k = 0; k < n; k++) { const t0 = performance.now(); await raf(); sync(); ts.push(Math.round(performance.now() - t0)); }
  const s = __game.gfx.stats; return { avg: Math.round(ts.reduce((a, b) => a + b) / n), ms: ts, draws: s.draws, tris: Math.round(s.tris), haze: s.haze || 0 }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for name in names:
        course, preset, cam = VIEWS[name]
        for f in args:
            pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000); pg.set_default_navigation_timeout(240000)
            pg.goto(pathlib.Path(f).resolve().as_uri() + f'?skipmenu=1&autotest=1&laps=1&quality={preset}&track={course}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
            pg.evaluate('() => { __game.timeScale = 0; }'); pg.evaluate('() => { ' + TR + ' g.shotCam = (() => { ' + cam + ' })(); }'); pg.evaluate(TIME, 3)
            r = pg.evaluate(TIME, int(opt.get('n', 4))); print(json.dumps({'view': name, 'build': pathlib.Path(f).name, 'preset': preset, **r}), flush=True); pg.close()
    b.close()
