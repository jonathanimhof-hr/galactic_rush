"""V9: CPU cost of one game frame without drawing (simulation, course update, effects, HUD) per course, in the built game.
usage: python3 tests/framecost.py BUILD.html foundry,belt,spire,ring,pelagos,ignara"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); tracks = sys.argv[2].split(',')
MEASURE = """async (n) => { const g = __game; g.gfx.render = () => {}; for (const id of ['hud', 'markers']) document.getElementById(id).style.visibility = 'hidden';
  const f = g.frame.bind(g), ts = []; let last = performance.now(), parts = { fx: 0 };
  return await new Promise(res => { let k = 0; const step = () => { const t0 = performance.now(); f(t0); ts.push(performance.now() - t0); if (++k < n) setTimeout(step, 16); else { ts.sort((a, b) => a - b); res({ median: +ts[ts.length >> 1].toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), max: +ts[ts.length - 1].toFixed(2), particles: g.fx && g.fx.n !== undefined ? g.fx.n : (g.fx && g.fx.count) }); } }; setTimeout(step, 16); }); }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for trk in tracks:
        pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.goto(build + f'?skipmenu=1&autotest=1&laps=3&quality=low&nointro=1&track={trk}'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
        pg.evaluate('() => { __game.gfx.render = () => {}; }'); pg.evaluate('() => __game.ff(20)')
        r = pg.evaluate(MEASURE, 300); print(trk, json.dumps(r), flush=True); pg.close()
    b.close()
