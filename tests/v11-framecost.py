"""V11: frame cost of courses from fixed chase cameras in software WebGL, for comparing two builds under the same
conditions. The race is frozen, the preset's resolution is pinned (no dynamic resolution), the camera sits behind the
racing line at 25 %, 50 % and 75 % of the lap. Every frame is forced to finish before the clock is read (a one-pixel
readPixels on the drawing buffer): plain requestAnimationFrame deltas, as V10's tool used, run several frames behind
what is drawn in software rendering and blur one view into the next. Each view: 2 warm-up frames, then 7 timed
frames; the median and the fastest are reported with draw calls and triangles. With more views (a sweep round the
lap: fractions 0.04,0.12,...) fewer frames per view will do: [frames] sets the timed frames (under 5: one warm-up frame).
usage: python3 tests/v11-framecost.py BUILD.html [courses] [preset] [OUT.json|-] [fractions] [frames]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); courses = (sys.argv[2] if len(sys.argv) > 2 else 'foundry,belt,spire,ring,pelagos,ignara,canopy,nexus').split(',')
preset = sys.argv[3] if len(sys.argv) > 3 else 'medium'; out = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != '-' else None
fracs = [float(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else [0.25, 0.5, 0.75]; frames = int(sys.argv[6]) if len(sys.argv) > 6 else 7
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SYNC = """(n) => new Promise(res => { const gl = __game.gfx.gl, px = new Uint8Array(4), ts = []; let k = 0; const f = () => { const fb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); ts.push(performance.now()); if (++k > n) res(ts.slice(1).map((v, i) => v - ts[i])); else requestAnimationFrame(f); }; requestAnimationFrame(f); })"""
CAM = "(f) => { const g = __game, t = g.scene.race.track, I = Math.round(t.N * f), P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, n = t.nrm[I]; g.shotCam = { pos: P(I - 3, 0, 4), at: P(I + 5, 0, 1.2), up: [n.x, n.y, n.z], fov: 70 }; return I; }"
res = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for trk in courses:
        pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.goto(build + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality={preset}&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
        pg.evaluate("() => { const g = __game; g.timeScale = 0; g.settings.dynRes = 'off'; g.res = 1; g.gfx.setRes(+g.settings.resScale); }")  # the preset's resolution, not the dynamic one
        views = []
        for f in fracs:
            I = pg.evaluate(CAM, f); pg.evaluate(SYNC, 2 if frames >= 5 else 1); d = sorted(pg.evaluate(SYNC, frames)); ms = d[len(d) >> 1]
            s = pg.evaluate("() => ({ draws: __game.gfx.stats.draws, tris: __game.gfx.stats.tris, res: [__game.gfx.w, __game.gfx.h] })")
            views.append({'i': I, 'ms': round(ms, 1), 'min': round(d[0], 1), 'max': round(d[-1], 1), **s}); print(f'{trk} {preset} #{I}: {ms:.0f} ms (fastest {d[0]:.0f}, slowest {d[-1]:.0f}) {s}', flush=True)
        med = sorted(v['ms'] for v in views)[len(views) >> 1]; res.append({'track': trk, 'preset': preset, 'medianMs': med, 'views': views, 'pageErrors': errs}); print(f'{trk} {preset}: median of the views {med:.0f} ms; page errors {len(errs)}', flush=True)
        pg.close()
    b.close()
if out: pathlib.Path(out).write_text(json.dumps(res, indent=1))
