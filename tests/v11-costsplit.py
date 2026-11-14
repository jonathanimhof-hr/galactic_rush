"""V11: where a frame of a course goes in software rendering, by shader program: the frame time from a fixed chase
camera with the items of one program switched off at a time (instanced and plain items apart), then the mist sprites
the preset resolution pinned, the race frozen; every frame is forced to finish before the clock is read (a one-pixel
readPixels); each group is bracketed by the full scene (before and after), every figure the fastest of 4 frames after
a warm-up frame, a pair of brackets more than 5 % apart marked "noisy".
usage: python3 tests/v11-costsplit.py BUILD.html COURSE 0.25,0.75 [preset] [WIDTHxHEIGHT]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); trk = sys.argv[2]; smps = [float(x) for x in sys.argv[3].split(',')]; q = sys.argv[4] if len(sys.argv) > 4 else 'medium'; vw, vh = (int(x) for x in sys.argv[5].split('x')) if len(sys.argv) > 5 else (960, 540)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TIME = """(n) => new Promise(res => { const gl = __game.gfx.gl, px = new Uint8Array(4), ts = []; let k = 0; const f = () => { const fb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); ts.push(performance.now()); if (++k > n) { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(d[0]); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })"""
CAM = "(f) => { const g = __game, t = g.scene.race.track, I = Math.round(t.N * f), P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, n = t.nrm[I]; g.shotCam = { pos: P(I - 3, 0, 4), at: P(I + 5, 0, 1.2), up: [n.x, n.y, n.z], fov: 70 }; return I; }"
KEY = "it => (it.prog || 'pbr') + (it.mesh && it.mesh.inst ? ' (instanced)' : '') + (it.tag ? ' ' + it.tag : '') + (it.blend ? ' blended' : '')"
STAT = "() => ({ draws: __game.gfx.stats.draws, tris: __game.gfx.stats.tris, shadow: __game.gfx.stats.shadowDraws || 0 })"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': vw, 'height': vh}); pg.set_default_timeout(900000)
    pg.goto(build + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality={q}&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
    pg.evaluate("() => { const g = __game; g.timeScale = 0; g.settings.dynRes = 'off'; g.res = 1; g.gfx.setRes(+g.settings.resScale); const c = g.scene.course; c._cull0 = c.cull || (() => {}); c._hid = []; c.cull = (cam, raw) => { c._cull0(cam, raw); for (const it of c._hid) it.visible = false; }; }")
    keys = pg.evaluate(f"() => {{ const k = {KEY}, m = {{}}; for (const it of __game.scene.course.items) {{ const s = k(it); m[s] = (m[s] || 0) + 1; }} return m; }}")
    print('groups', keys, flush=True)
    fast = lambda: (pg.evaluate(TIME, 1), pg.evaluate(TIME, 4))[1]  # one warm-up frame, then the fastest of 4
    SHOW = "() => { const c = __game.scene.course; for (const it of c._hid) it.visible = true; c._hid = []; }"
    for f in smps:
        I = pg.evaluate(CAM, f); pg.evaluate(TIME, 2); base = fast(); full = pg.evaluate(STAT); print(f'#{I} {q} {vw}x{vh}: {base:.0f} ms {full}', flush=True)
        def report(name, ms, n, st):
            global base
            b2 = fast(); ref = (base + b2) / 2
            print(f'#{I} without {name:<38} {ms:6.0f} ms  saves {ref - ms:6.0f} = {100 * (ref - ms) / ref:4.1f} %  ({n} items, {full["tris"] - st["tris"]} triangles in {full["draws"] - st["draws"]} draws, {full["shadow"] - st["shadow"]} shadow draws; full scene before {base:.0f}, after {b2:.0f}{", noisy" if abs(b2 - base) > 0.05 * ref else ""})', flush=True); base = b2
        for name in keys:
            n = pg.evaluate(f"(name) => {{ const k = {KEY}, c = __game.scene.course; c._hid = c.items.filter(it => k(it) === name); return c._hid.length; }}", name)
            ms = fast(); st = pg.evaluate(STAT); pg.evaluate(SHOW); report(name, ms, n, st)
        pg.evaluate("() => { const c = __game.gfx.cfg; c._hc = c.hazeCap; c.hazeCap = 0; }"); ms = fast(); st = pg.evaluate(STAT); pg.evaluate("() => { const c = __game.gfx.cfg; c.hazeCap = c._hc; }"); report('mist sprites', ms, 0, st)
    b.close()
