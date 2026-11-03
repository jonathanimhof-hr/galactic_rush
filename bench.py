"""Benchmark one or more builds on a course: every preset in turn, average and 1%-low fps from the game's own ?bench mode.
Software rendering here makes absolute numbers meaningless; compare builds against each other on the same machine.
usage: python3 tests/bench.py TRACK BUILD.html [BUILD2.html ...]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
track, builds = sys.argv[1], sys.argv[2:]
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for f in builds:
        pg = b.new_page(viewport={'width': 960, 'height': 540}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
        pg.set_default_navigation_timeout(180000)
        pg.goto(pathlib.Path(f).resolve().as_uri() + f'?bench=short&presets=low,medium,high,ultra&track={track}')
        pg.wait_for_function('() => window.__bench', timeout=2400000)
        print(pathlib.Path(f).name, track, json.dumps(pg.evaluate('() => window.__bench')), errs[:2]); pg.close()
    b.close()
