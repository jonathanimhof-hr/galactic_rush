"""V10: frame time of every course from fixed chase cameras (software WebGL), for comparing courses in one build:
the race is frozen, the camera sits behind the player's line at 25 %, 50 % and 75 % of the lap, and each view is drawn
9 times after 3 warm-up frames; the median frame time of each view and of the course are reported, with draw calls and
triangles. One browser, one course after the other, the same preset for all.
usage: python3 tests/v10-fixedcost.py BUILD.html [courses] [preset] [OUT.json]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); courses = (sys.argv[2] if len(sys.argv) > 2 else 'foundry,belt,spire,ring,pelagos,ignara,canopy,nexus').split(',')
preset = sys.argv[3] if len(sys.argv) > 3 else 'medium'; out = sys.argv[4] if len(sys.argv) > 4 else None
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TIME = """(n) => new Promise(res => { const ts = []; let k = 0; const f = (t) => { ts.push(t); if (++k > n) { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })"""
CAM = "(f) => { const g = __game, t = g.scene.race.track, I = Math.round(t.N * f), P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, n = t.nrm[I]; g.shotCam = { pos: P(I - 3, 0, 4), at: P(I + 5, 0, 1.2), up: [n.x, n.y, n.z], fov: 70 }; return I; }"
res = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for trk in courses:
        pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000)
        pg.goto(build + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality={preset}&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
        pg.evaluate("() => { const g = __game; g.timeScale = 0; g.settings.dynRes = 'off'; g.res = 1; g.gfx.setRes(+g.settings.resScale); }")  # the preset's resolution, not the dynamic one
        views = []
        for f in (0.25, 0.5, 0.75):
            I = pg.evaluate(CAM, f); pg.evaluate(TIME, 3); ms = pg.evaluate(TIME, 9); s = pg.evaluate("() => ({ draws: __game.gfx.stats.draws, tris: __game.gfx.stats.tris })")
            s['res'] = pg.evaluate('() => [__game.gfx.w, __game.gfx.h]'); views.append({'i': I, 'ms': round(ms, 1), **s}); print(trk, f, I, round(ms), 'ms', s, flush=True)
        med = sorted(v['ms'] for v in views)[1]; res.append({'track': trk, 'preset': preset, 'medianMs': med, 'views': views}); print(trk, 'median of the three views', med, 'ms', flush=True)
        pg.close()
    b.close()
if out: pathlib.Path(out).write_text(json.dumps(res, indent=1))
