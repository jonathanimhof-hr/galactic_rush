"""Fixed-camera benchmark for comparing builds: the race is frozen on the grid, the camera is placed at the same
track-relative positions in every build, and N real frames are timed. V6: every timed frame ends with a 1-pixel
readPixels, so each sample covers the whole frame's GPU work (V5's unsynchronised requestAnimationFrame deltas could
charge one frame's cost to the next). Reports average, median and 95th-percentile frame time, fps, draw calls,
triangles and instance culling counts per view. The first two views are the two that were slower in V5 than in V4.
Software rendering (SwiftShader) in this harness: compare builds with each other, never with a graphics card.
usage: python3 tests/fixedbench.py OUT.json BUILD.html [BUILD2.html ...] [--frames=8] [--only=ring,belt]"""
import sys, json, pathlib, statistics
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
out, builds = args[0], args[1:]; NF = int(opt.get('frames', 8)); ONLY = opt.get('only', '').split(',') if opt.get('only') else None
TR = "const g = __game, t = g.scene.race.track, N = t.N, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; };"
CONFIGS = [  # (course, preset, [(view name, camera js)])
    ('ring', 'high', [('ring plane (V5 outlier: dust clouds)', "return { pos: P(N * 0.3, 40, 12), at: P(N * 0.3 + 60, -40, 0), fov: 70 };"), ('along the course, high', "return { pos: P(N * 0.15, 0, 30), at: P(N * 0.15 + 40, 0, 30), fov: 60 };")]),
    ('belt', 'high', [('field overview (V5 outlier: asteroid shading)', "return { pos: P(N * 0.6, 200, 300), at: P(N * 0.7, 0, 0), fov: 70 };"), ('racing line', "return { pos: P(N * 0.3, 0, 10), at: P(N * 0.3 + 60, 0, 0), fov: 70 };")]),
    ('spire', 'high', [('start skyline', "return { pos: P(-30, 0, 6), at: P(70, 0, 70), fov: 72 };"), ('mid-course', "return { pos: P(N * 0.45, 0, 8), at: P(N * 0.45 + 40, 0, 4), fov: 72 };"), ('aerial', "return { pos: P(N * 0.1, 0, 420), at: P(N * 0.5, 0, -250), fov: 62 };")]),
    ('foundry', 'high', [('in the trench', "return { pos: P(N * 0.42, 0, -3), at: P(N * 0.42 + 25, 0, -5), fov: 72 };"), ('over the rim', "return { pos: P(N * 0.2, 0, 60), at: P(N * 0.2 + 120, 0, 10), fov: 66 };")]),
    ('ring', 'low', [('ring plane (V5 outlier: dust clouds)', "return { pos: P(N * 0.3, 40, 12), at: P(N * 0.3 + 60, -40, 0), fov: 70 };")]),
    ('belt', 'low', [('field overview (V5 outlier: asteroid shading)', "return { pos: P(N * 0.6, 200, 300), at: P(N * 0.7, 0, 0), fov: 70 };")]),
    ('spire', 'low', [('start skyline', "return { pos: P(-30, 0, 6), at: P(70, 0, 70), fov: 72 };"), ('mid-course', "return { pos: P(N * 0.45, 0, 8), at: P(N * 0.45 + 40, 0, 4), fov: 72 };")]),
]
TIME = """async (n) => { const gl = __game.gfx.gl, px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), raf = () => new Promise(r => requestAnimationFrame(r));
  await raf(); sync(); const ts = []; for (let k = 0; k < n; k++) { const t0 = performance.now(); await raf(); sync(); ts.push(performance.now() - t0); }
  const g = __game, s = g.gfx.stats, V = g.vis; return { ms: ts, draws: s.draws, tris: Math.round(s.tris || 0), haze: s.haze || 0, inst: V ? { inst: V.inst, drawn: V.drawn, frustum: V.frustum, occluded: V.occluded, small: V.small } : null, res: g.gfx.w + 'x' + g.gfx.h,
    cam: [g.rig.cam.pos.x, g.rig.cam.pos.y, g.rig.cam.pos.z].map(Math.round) }; }"""
res = []; part = pathlib.Path(out + 'l')  # rows are appended as they finish, so an interrupted run resumes where it stopped
if part.exists(): res = [json.loads(l) for l in part.read_text().splitlines() if l.strip()]
done = {(r['build'], r['course'], r['preset'], r['view']) for r in res}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for course, preset, views in CONFIGS:
        if ONLY and course not in ONLY: continue
        for f in builds:
            if all((pathlib.Path(f).name, course, preset, name) in done for name, _ in views): continue
            pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(1800000)
            pg.goto(pathlib.Path(f).resolve().as_uri() + f'?skipmenu=1&autotest=1&laps=1&quality={preset}&track={course}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
            pg.evaluate('() => { __game.timeScale = 0; }')
            for name, js in views:
                if (pathlib.Path(f).name, course, preset, name) in done: continue
                pg.evaluate('() => { ' + TR + ' g.shotCam = (() => { ' + js + ' })(); }'); pg.evaluate(TIME, 3)  # settle: camera, LOD, hero relief
                r = pg.evaluate(TIME, NF); ms = sorted(r['ms']); n = len(ms)
                row = {'build': pathlib.Path(f).name, 'course': course, 'preset': preset, 'view': name, 'frames': n, 'msAvg': round(sum(ms) / n, 1), 'msMedian': round(statistics.median(ms), 1),
                       'msP95': round(ms[min(n - 1, int(n * 0.95))], 1), 'fps': round(1000 * n / sum(ms), 2), 'draws': r['draws'], 'tris': r['tris'], 'haze': r['haze'], 'instances': r['inst'], 'res': r['res'], 'cam': r['cam']}
                res.append(row); print(json.dumps(row), flush=True)
                with part.open('a') as fh: fh.write(json.dumps(row) + '\n')
            pg.close()
    b.close()
pathlib.Path(out).write_text(json.dumps(res, indent=1)); print('saved', out)
