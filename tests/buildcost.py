"""V9: build time of every course scene in the built game (software WebGL), and the time from opening the page to ready.
usage: python3 tests/buildcost.py BUILD.html foundry,belt,spire,ring,pelagos,ignara"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri()
JS = """(id) => { const g = __game, t0 = performance.now(); g.prepCourse(id); const ms = performance.now() - t0, c = g.courses.get(id);
  let verts = 0, idx = 0, inst = 0, items = 0; const seen = new Set();
  for (const it of c.items) { items++; const m = it.mesh; if (!m || seen.has(m)) continue; seen.add(m); verts += m.nv || m.vertexCount || (m.count || 0); idx += m.n || m.indexCount || 0; inst += it.inst ? it.inst.length || 0 : 0; }
  return { ms: Math.round(ms), items, meshes: seen.size, idx, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000)
    t = pg.evaluate('() => performance.now()'); pg.goto(build + '?quality=low'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
    print('boot to ready (s):', round(pg.evaluate('() => performance.now()') / 1000, 1))
    m0 = pg.evaluate('() => Object.keys(__game.courses ? Object.fromEntries(__game.courses) : {})'); print('courses built at boot:', m0)
    for trk in sys.argv[2].split(','): print(trk, json.dumps(pg.evaluate(JS, trk)), flush=True)
    b.close()
