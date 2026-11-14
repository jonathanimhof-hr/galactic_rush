"""V10: where a frame of a course goes in software rendering: the frame time from a fixed chase camera with groups of
scene items switched off one at a time (the preset resolution pinned, the race frozen, the median of 9 frames, the
baseline measured again after each group). usage: python3 tests/v10-costsplit.py BUILD.html COURSE 0.25,0.75 [preset]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); trk = sys.argv[2]; smps = [float(x) for x in sys.argv[3].split(',')]; q = sys.argv[4] if len(sys.argv) > 4 else 'medium'
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TIME = """(n) => new Promise(res => { const ts = []; let k = 0; const f = (t) => { ts.push(t); if (++k > n) { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })"""
CAM = "(f) => { const g = __game, t = g.scene.race.track, I = Math.round(t.N * f), P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, n = t.nrm[I]; g.shotCam = { pos: P(I - 3, 0, 4), at: P(I + 5, 0, 1.2), up: [n.x, n.y, n.z], fov: 70 }; return I; }"
GROUPS = {'ground (floor, canopy carpet, mountains)': "it => it.prog === 'v10ground'", 'bark, not instanced (colossi, wood, roots, lianas)': "it => it.prog === 'v10bark' && !it.mesh.inst",
          'bark, instanced (forest trunks)': "it => it.prog === 'v10bark' && it.mesh.inst", 'foliage, instanced (crowns, thickets, ferns)': "it => it.prog === 'v10leaf' && it.mesh.inst",
          'foliage, not instanced (colossi crowns, leaves, flowers)': "it => it.prog === 'v10leaf' && !it.mesh.inst", 'light shafts, water': "it => it.prog === 'v10shaft' || it.prog === 'v10water'",
          'course kit (hex walls, gates, guides, pickups)': "it => it.prog === 'hex' || it.prog === 'unlit' || it.prog === 'pbr'"}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000)
    pg.goto(build + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality={q}&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
    pg.evaluate("() => { const g = __game; g.timeScale = 0; g.settings.dynRes = 'off'; g.res = 1; g.gfx.setRes(+g.settings.resScale); const c = g.scene.course; c._cull0 = c.cull || (() => {}); c._hid = []; c.cull = (cam, raw) => { c._cull0(cam, raw); for (const it of c._hid) it.visible = false; }; }")
    for f in smps:
        I = pg.evaluate(CAM, f); pg.evaluate(TIME, 3); base = pg.evaluate(TIME, 9); print(f'#{I} baseline {base:.0f} ms', flush=True)
        for name, sel in GROUPS.items():
            n = pg.evaluate("(src) => { const c = __game.scene.course; c._hid = c.items.filter(eval(src)); return c._hid.length; }", sel)
            pg.evaluate(TIME, 2); ms = pg.evaluate(TIME, 9); pg.evaluate("() => { const c = __game.scene.course; for (const it of c._hid) it.visible = true; c._hid = []; }")
            pg.evaluate(TIME, 2); b2 = pg.evaluate(TIME, 9); print(f'#{I} without {name:<58} {ms:6.0f} ms (baseline then {b2:6.0f}; {n} items)', flush=True)
        haze = pg.evaluate("() => { const c = __game.gfx.cfg; c._hc = c.hazeCap; c.hazeCap = 0; }"); pg.evaluate(TIME, 2); ms = pg.evaluate(TIME, 9); pg.evaluate("() => { const c = __game.gfx.cfg; c.hazeCap = c._hc; }")
        print(f'#{I} without mist sprites {ms:6.0f} ms', flush=True)
    b.close()
