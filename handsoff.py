"""Hands-off handling check: the player gives no input at all for 40 s of race time; compare progress, wall hits and
hull between the Relaxed and Classic handling profiles. usage: python3 tests/handsoff.py"""
import time, json, pathlib
from playwright.sync_api import sync_playwright
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'galactic-rush-v7.html').as_uri()
JS = """h => { const g = __game; g.settings.handling = h; g.action('restart'); g.endIntro && g.state === 'intro' && g.endIntro();
  const r = g.scene.race, me = r.player; let hits = 0, wrecks = 0; r.events.length = 0;
  for (let k = 0; k < 160; k++) { g.ff(0.25); for (const e of r.events) { if (e.r === me && (e.type === 'damage' || e.type === 'hit')) hits++; if (e.r === me && e.type === 'explode') wrecks++; } r.events.length = 0; }
  return { handling: h, km: +(me.prog / 1000).toFixed(2), lap: me.lap, hull: Math.round(me.ship.hull), wrecks, place: me.place, topKmh: Math.round(me.ship.def.maxSpeed * 3.6) }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for trk in ['foundry', 'belt', 'spire', 'ring']:
        pg = b.new_page(viewport={'width': 480, 'height': 270}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL + f'?skipmenu=1&track={trk}&laps=3&quality=low&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=180000); time.sleep(2)
        for h in ['relaxed', 'classic']: print(trk, json.dumps(pg.evaluate(JS, h)))
        if errs: print('errors', errs[:2])
        pg.close()
    b.close()
