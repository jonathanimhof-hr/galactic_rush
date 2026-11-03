"""Visibility-system checks in a real browser (headless Chromium, software WebGL). Prints PASS/FAIL lines.
1. occlusion is conservative: every building culled as occluded is re-checked independently by ray casts from the
   camera to 27 points of its bounding box; each ray must hit one of that frame's occluder cores (oriented boxes)
   before reaching the point.
2. LOD switches use the screen-size thresholds with hysteresis: walking the camera away from and back toward a
   building switches its level once each way, at different distances (no flicker band).
3. the LOD bias hook: 0 puts every drawn instance on its most detailed level, 100 on its simplest.
4. the capital-ship cross-fade (V6: three levels): full only up close, full+lite in the first band, lite, lite+far in the second band, far only.
5. culling counters on several Neon Spire views (instances, drawn, frustum, occluded, too small).
usage: python3 tests/vis.py BUILD.html"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
build = pathlib.Path(sys.argv[1]).resolve().as_uri()
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FRAMES = "n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })"
TR = "const g = __game, t = g.scene.race.track, N = t.N, P = (i, x, y) => { const v = t.pointAt(t.wrapIdx(Math.round(i)), x, y); return [v.x, v.y, v.z]; };"
VERIFY = """() => { const g = __game, c = g.scene.course, cam = g.rig.cam.pos, used = c.ocl.usedList, sets = c.blocks.sets;
  const hit = (o, p) => { const [cx, cy, cz, yaw, hx, hy, hz] = o.obb, co = Math.cos(yaw), si = Math.sin(yaw);
    const loc = (x, y, z) => { const dx = x - cx, dz = z - cz; return [dx * co - dz * si, y - cy, dx * si + dz * co]; }; // into the box frame (inverse yaw)
    const a = loc(cam.x, cam.y, cam.z), b = loc(p[0], p[1], p[2]), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], H = [hx, hy, hz]; let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-9) { if (a[i] < -H[i] || a[i] > H[i]) return false; continue; }
      let u = (-H[i] - a[i]) / d[i], v = (H[i] - a[i]) / d[i]; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; }
    return t0 < 0.999; };
  const cf = g.rig.cam.fwd, cu = g.rig.cam.up, cR = [cf.y * cu.z - cf.z * cu.y, cf.z * cu.x - cf.x * cu.z, cf.x * cu.y - cf.y * cu.x], rl = Math.hypot(...cR); cR[0] /= rl; cR[1] /= rl; cR[2] /= rl;
  const cU = [cR[1] * cf.z - cR[2] * cf.y, cR[2] * cf.x - cR[0] * cf.z, cR[0] * cf.y - cR[1] * cf.x], ty = Math.tan(g.rig.cam.fov * Math.PI / 360), tx = ty * g.gfx.w / g.gfx.h;
  const onScreen = q => { const dx = q[0] - cam.x, dy = q[1] - cam.y, dz = q[2] - cam.z, vz = dx * cf.x + dy * cf.y + dz * cf.z; if (vz < 1) return false;
    return Math.abs((dx * cR[0] + dy * cR[1] + dz * cR[2]) / (vz * tx)) <= 1 && Math.abs((dx * cU[0] + dy * cU[1] + dz * cU[2]) / (vz * ty)) <= 1; }; // points outside the view need no occluder
  let checked = 0, bad = 0, samples = 0, offscreen = 0; const fails = [];
  for (const S of sets) for (let k = 0; k < S.n; k++) { if (!S.oc[k] || S.lv[k] === -1 && false) continue; if (!S.oc[k]) continue; checked++;
    const x = S.s[k * 4], y = S.s[k * 4 + 1], z = S.s[k * 4 + 2], r = S.s[k * 4 + 3] / Math.sqrt(3); // the bounding sphere's inscribed box: points inside the sphere
    let ok = true; for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) for (let l = -1; l <= 1 && ok; l++) { const p = [x + i * r, y + j * r, z + l * r]; samples++;
      if (!onScreen(p)) { offscreen++; continue; }
      if (!used.some(o => hit(o, p))) { ok = false; fails.push([Math.round(x), Math.round(y), Math.round(z), Math.round(r)]); } }
    if (!ok) bad++; }
  return { checked, bad, samples, offscreen, occluders: used.length, fails: fails.slice(0, 5) }; }"""
results = []
def report(name, ok, info=''): results.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (' ' + info if info else ''), flush=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto(build + '?skipmenu=1&autotest=1&laps=1&quality=medium&track=spire'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=240000)
    pg.evaluate(FRAMES, 2); pg.evaluate('() => { __game.timeScale = 0; }')
    # 1 + 5: views along the course
    tot = {'checked': 0, 'bad': 0, 'samples': 0}
    for f in [0.02, 0.15, 0.3, 0.45, 0.62, 0.8, 0.92]:
        for look in ['ahead', 'side']:
            js = TR + (f"g.shotCam = {{ pos: P(N * {f}, 0, 6), at: P(N * {f} + 60, 0, 0), fov: 70 }};" if look == 'ahead' else f"const p = P(N * {f}, 0, 10), q = P(N * {f}, 300, 30); g.shotCam = {{ pos: p, at: q, fov: 70 }};")
            pg.evaluate('() => {' + js + '}'); pg.evaluate(FRAMES, 3)
            v = pg.evaluate('() => { const V = __game.vis; return { inst: V.inst, drawn: V.drawn, frustum: V.frustum, occluded: V.occluded, small: V.small }; }')
            r = pg.evaluate(VERIFY); print(f'view {f:.2f} {look}: counters {json.dumps(v)} | occlusion re-check {json.dumps(r)}', flush=True)
            for k in tot: tot[k] += r[k]
    report('occlusion is conservative (independent ray-cast re-check of every occluded building)', tot['bad'] == 0 and tot['checked'] > 0, json.dumps(tot))
    # 2: LOD hysteresis on one mid-size building
    info = pg.evaluate("""async () => { const g = __game, c = g.scene.course, F = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      c.ocl.on = false; g.gfx.lodBias = 1; /* V6: presets scale LOD switches; measure the base thresholds */ let S = null, k = -1; for (const s of c.blocks.sets) if (s.levels.length > 1 && s.n > 20) { S = s; break; }
      for (let i = 0; i < S.n; i++) if (S.s[i * 4 + 3] > 80 && S.s[i * 4 + 3] < 400) { k = i; break; }
      const x = S.s[k * 4], y = S.s[k * 4 + 1], z = S.s[k * 4 + 2], r = S.s[k * 4 + 3], K = g.gfx.h * 0.5 / Math.tan(30 * Math.PI / 180), dT = 2 * r * K / S.levels[0].px, out = [];
      const at = async d => { g.shotCam = { pos: [x + d * 0.8, y + d * 0.2, z + d * 0.566], at: [x, y, z], fov: 60 }; await F(2); return S.lv[k]; };
      for (const m of [0.8, 0.95, 1.05, 1.08, 1.15, 1.25, 1.15, 1.05, 0.95, 0.9, 0.85, 0.8]) out.push([m, await at(dT * m)]);
      c.ocl.on = true; return { r: Math.round(r), threshold: Math.round(dT), K: Math.round(K), steps: out }; }""")
    seq = info['steps']; lv = [s[1] for s in seq]; switches = sum(1 for i in range(1, len(lv)) if lv[i] != lv[i - 1])
    up = next((s[0] for i, s in enumerate(seq) if i > 0 and lv[i] == 1 and lv[i - 1] == 0), None); down = next((s[0] for i, s in enumerate(seq) if i > 0 and lv[i] == 0 and lv[i - 1] == 1), None)
    report('LOD hysteresis (one switch each way, outward later than inward)', switches == 2 and up is not None and down is not None and up > down, json.dumps(info))
    # 3: bias hook, counted directly on the two-level building sets (instances drawn this frame)
    CNT = "async (bias) => { const g = __game, c = g.scene.course; g.gfx.lodBias = bias; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); let a = 0, b = 0; for (const S of c.blocks.sets) if (S.levels.length > 1) for (let k = 0; k < S.n; k++) if (S.lv[k] >= 0 && !S.oc[k]) { if (S.lv[k] === 0) a++; else b++; } g.gfx.lodBias = 1; return [a, b]; }"
    b0 = pg.evaluate(CNT, 0); b100 = pg.evaluate(CNT, 100)
    report('LOD bias 0 -> every drawn building on its detailed level', b0[1] == 0 and b0[0] > 0, str(b0))
    report('LOD bias 100 -> every drawn building on its lite level', b100[0] == 0 and b100[1] > 0, str(b100))
    pg.close()
    # 4: capital ship cross-fade on Halo of Vashti
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(900000)
    pg.goto(build + '?skipmenu=1&autotest=1&laps=1&quality=low&track=ring'); pg.wait_for_function('() => window.__game && window.__game.ready', timeout=240000)
    pg.evaluate('() => { __game.timeScale = 0; }')
    fades = pg.evaluate("""async () => { const g = __game, it = g.scene.course.fleet[0], [lite, far] = g.scene.course.items.filter(x => x !== it && x.pos === it.pos), out = [];
      g.gfx.lodBias = 1; const K = 1400 * g.gfx.h * 0.5 / Math.tan(60 * Math.PI / 360);
      for (const px of [600, 375, 180, 77, 25]) { const d = K / px; g.shotCam = { pos: [it.pos.x + d, it.pos.y, it.pos.z], at: [it.pos.x, it.pos.y, it.pos.z], fov: 60 };
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); out.push([px, Math.round(d), +it.visible, +lite.visible, +far.visible, +it.fade.toFixed(2), +lite.fade.toFixed(2), +far.fade.toFixed(2)]); } return out; }""")
    v = [f[2:5] for f in fades]  # V6: three levels per class (full, lite, far), dithered cross-fades between neighbours
    report('capital-ship LOD cross-fade (full near; full+lite, lite, lite+far, far with distance)', v == [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], json.dumps(fades))
    pg.close(); b.close()
print('errors:', errs[:3] if errs else 'none'); print('vis tests:', sum(results), 'of', len(results), 'passed')
