"""V7 frame-time check for the paint-job shader path: the race frozen on the grid, the chase camera behind the player's ship,
and a close-up that fills the screen with the ship, timed with a 1-pixel readPixels after every frame (as fixedbench.py).
Compares V6 with V7 on a stock ship and V7 with the heaviest custom paint job (honeycomb pattern, metallic finish, colour-shift
paint). Software rendering (SwiftShader) in this harness: compare builds with each other, never with a graphics card.
usage: python3 tests/shipbench.py OUT.json V6.html V7.html [--frames=10] [--quality=high,low]"""
import sys, json, pathlib, statistics
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
out, v6, v7 = args[0], pathlib.Path(args[1]).resolve(), pathlib.Path(args[2]).resolve(); NF = int(opt.get('frames', 10)); QS = opt.get('quality', 'high,low').split(',')
TIME = """async (n) => { const gl = __game.gfx.gl, px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), raf = () => new Promise(r => requestAnimationFrame(r));
  await raf(); sync(); const ts = []; for (let k = 0; k < n; k++) { const t0 = performance.now(); await raf(); sync(); ts.push(performance.now() - t0); } return { ms: ts, draws: __game.gfx.stats.draws, res: __game.gfx.w + 'x' + __game.gfx.h }; }"""
CUSTOM = "() => { const g = __game, sv = g.scene.view.byRacer.get(g.scene.race.player).sv; sv.setLivery(g.progress.livery('kestrel', { primary: '#d7263d', secondary: '#e9ecef', accent: '#1fb5ac', paint: 'paint.aurora', pattern: 'pattern.hex', finish: 'finish.metallic', exhaust: 'exhaust.plasma', trail: 'trail.neon' })); return !!sv.hull.cust; }"
CLOSE = "() => { const g = __game, p = g.scene.race.player.ship, f = { x: 0, y: 0, z: 1 }; const q = p.quat, fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x), fz = 1 - 2 * (q.x * q.x + q.y * q.y); g.shotCam = { pos: [p.pos.x - fx * 5.5, p.pos.y - fy * 5.5 + 1.6, p.pos.z - fz * 5.5], at: [p.pos.x, p.pos.y + 0.2, p.pos.z], fov: 60 }; void f; }"
rows = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for q in QS:
        for name, build, custom in [('V6', v6, False), ('V7 stock', v7, False), ('V7 custom', v7, True)]:
            pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(1800000)
            pg.goto(build.as_uri() + f'?skipmenu=1&autotest=1&laps=1&quality={q}&track=foundry&nointro=1&ship=0'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=300000)
            pg.evaluate("() => { __game.timeScale = 0; __game.camMode = 'chase'; __game.settings.dynRes = 'off'; }")
            if custom: assert pg.evaluate(CUSTOM)
            for view in ['chase camera', 'close-up']:
                if view == 'close-up': pg.evaluate(CLOSE)
                pg.evaluate(TIME, 3); r = pg.evaluate(TIME, NF); ms = sorted(r['ms']); n = len(ms)
                row = {'quality': q, 'build': name, 'view': view, 'msAvg': round(sum(ms) / n, 1), 'msMedian': round(statistics.median(ms), 1), 'frames': n, 'draws': r['draws'], 'res': r['res']}
                rows.append(row); print(json.dumps(row), flush=True)
            pg.close()
    b.close()
pathlib.Path(out).write_text(json.dumps(rows, indent=1))
for q in QS:
    for view in ['chase camera', 'close-up']:
        base = next(r for r in rows if r['quality'] == q and r['view'] == view and r['build'] == 'V6')['msMedian']
        print(f"{q:5} {view:13} " + '  '.join(f"{r['build']}: {r['msMedian']} ms ({r['msMedian'] / base:.2f}x)" for r in rows if r['quality'] == q and r['view'] == view))
