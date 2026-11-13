"""V11: what a shader costs in software rendering. Loads a course, fixes a chase camera (the preset's resolution pinned,
the race frozen), measures the frame time (every frame forced to finish before the clock is read), then for each experiment in a spec swaps one program for an edited copy of
itself (plain string replacements in its fragment source as the page compiled it), measures again and puts the
original back. The edits are throw-away variants (a shader without one lookup, with a constant result, ...): the
build is not changed. Timing in software rendering wanders by several per cent from one frame to the next, so each
experiment is bracketed by the unchanged shader (before and after) and every figure is the fastest of 4 frames after a
warm-up frame; a pair of brackets more than 5 % apart is marked "noisy".
usage: python3 tests/v11-shaderprobe.py BUILD.html COURSE FRACTION PRESET SPEC.json [WIDTHxHEIGHT]
SPEC.json: [{"name": "...", "prog": "v10bark", "edits": [["old", "new"], ...]}, ...]; "flat" instead of edits makes the
fragment shader return a constant colour at once (what is left is vertex work, rasterisation and the depth test);
"as": "pbrStruct" draws the program's items with another program instead (what the same surfaces cost with that shader)."""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri(); trk = sys.argv[2]; frac = float(sys.argv[3]); q = sys.argv[4]; spec = json.load(open(sys.argv[5])); vw, vh = (int(x) for x in sys.argv[6].split('x')) if len(sys.argv) > 6 else (960, 540)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TIME = """(n) => new Promise(res => { const gl = __game.gfx.gl, px = new Uint8Array(4), ts = []; let k = 0; const f = () => { const fb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); ts.push(performance.now()); if (++k > n) { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(d[0]); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })"""
CAM = "(f) => { const g = __game, t = g.scene.race.track, I = Math.round(t.N * f), P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; }, n = t.nrm[I]; g.shotCam = { pos: P(I - 3, 0, 4), at: P(I + 5, 0, 1.2), up: [n.x, n.y, n.z], fov: 70 }; return I; }"
SWAP = """(e) => { const g = __game.gfx, gl = g.gl, P0 = g.P[e.prog]; if (!P0) return 'no program ' + e.prog; if (e.as) { if (!g.P[e.as]) return 'no program ' + e.as; g._P0 = g._P0 || {}; g._P0[e.prog] = P0; g.P[e.prog] = g.P[e.as]; return 'ok'; } /* "as": draw this program's items with another program */
  const sh = gl.getAttachedShaders(P0.p); let vs = '', fs = '';
  for (const s of sh) { if (gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.VERTEX_SHADER) vs = gl.getShaderSource(s); else fs = gl.getShaderSource(s); }
  if (e.flat) fs = fs.replace(/void main\\(\\)\\s*\\{/, 'void main(){ o = vec4(.2, .2, .2, 1.); return; }\\nvoid main_(){');
  for (const [a, b] of (e.edits || [])) { if (!fs.includes(a)) return 'edit not found: ' + a.slice(0, 60); fs = fs.split(a).join(b); }
  try { const p = g.prog(vs, fs); g._P0 = g._P0 || {}; g._P0[e.prog] = P0; g.P[e.prog] = p; return 'ok'; } catch (err) { return 'compile: ' + String(err).slice(0, 400); } }"""
BACK = "(name) => { const g = __game.gfx; if (g._P0 && g._P0[name]) { g.P[name] = g._P0[name]; delete g._P0[name]; } }"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': vw, 'height': vh}); pg.set_default_timeout(900000)
    pg.goto(build + f'?skipmenu=1&autotest=1&track={trk}&laps=1&quality={q}&nointro=1'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=600000)
    pg.evaluate("() => { const g = __game; g.timeScale = 0; g.settings.dynRes = 'off'; g.res = 1; g.gfx.setRes(+g.settings.resScale); }")
    fast = lambda: (pg.evaluate(TIME, 1), pg.evaluate(TIME, 4))[1]  # one warm-up frame, then the fastest of 4
    I = pg.evaluate(CAM, frac); pg.evaluate(TIME, 2); base = fast(); print(f'{trk} #{I} {q} {vw}x{vh}: {base:.0f} ms', flush=True)
    for e in spec:
        r = pg.evaluate(SWAP, e)
        if r != 'ok': print(f'  {e["name"]:<46} FAILED {r}', flush=True); continue
        ms = fast(); pg.evaluate(BACK, e['prog']); b2 = fast(); ref = (base + b2) / 2
        print(f'  {e["name"]:<46} {ms:6.0f} ms  saves {ref - ms:6.0f} = {100 * (ref - ms) / ref:4.1f} %  (unchanged before {base:.0f}, after {b2:.0f}{", noisy" if abs(b2 - base) > 0.05 * ref else ""})', flush=True)
        base = b2
    b.close()
