"""V8 online multiplayer, end to end in the built game: three browser clients (separate browser profiles, so three
separate pilots) against the real multiplayer server on this machine. Everything goes through the game's own screens
and buttons: Online multiplayer, pilot names, creating a lobby, joining with the room code, ship selection, ready,
start; then a full two-stage tournament flown by the game's autopilot (?autotest=1 works on local pages only), the
stage results, the final with the eliminated pilot watching, the tournament result and the rewards in each career;
then a second tournament with a dropped connection that reconnects mid-race and a pilot leaving through the in-race
menu. Checks synchronised starts, remote ships drawn from the other pilots' real positions, no page errors.
Each player runs in its own browser process (like separate devices). Software WebGL on a 2-core test machine cannot draw
three games at once: frames would arrive seconds apart and stall the race clocks. So the test drives animation frames
from a timer and switches off the WebGL draw call and the HUD overlay while racing (the game's frame loop, simulation,
network code, online bar and screens all run); both are switched back on for every screenshot. Nothing in the game is
changed for this: it is done from the test.
usage: python3 tests/mp/e2e.py BUILD.html [OUTDIR] [--scale=4]"""
import sys, json, time, pathlib, subprocess, math, os
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
build = pathlib.Path(args[0]).resolve().as_uri(); out = pathlib.Path(args[1] if len(args) > 1 else '/tmp/gr-mp-e2e'); out.mkdir(parents=True, exist_ok=True)
SCALE = opt.get('scale', '4'); ROOT = pathlib.Path(__file__).resolve().parents[2]
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
# animation frames from a timer while racing; the browser's own frames (with its back-pressure) while taking a screenshot
TIMER_FRAMES = 'window.__realRAF = window.requestAnimationFrame.bind(window); window.__rafMode = "timer"; window.requestAnimationFrame = cb => window.__rafMode === "real" ? window.__realRAF(cb) : setTimeout(() => cb(performance.now()), 16);'
checks, errors = [], []
def check(name, ok, detail=''):
    checks.append((name, bool(ok), str(detail)[:400])); print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

srvlog = open(out / 'server.log', 'w')
srv = subprocess.Popen(['node', str(ROOT / 'tests/mp/serve.mjs'), '0', SCALE], stdout=subprocess.PIPE, stderr=srvlog, text=True, cwd=ROOT)
port = None
while port is None:
    line = srv.stdout.readline()
    if not line: raise SystemExit('server did not start')
    srvlog.write(line); o = json.loads(line)
    if 'port' in o and 'msg' not in o: port = o['port']
import threading
srvlog.flush(); threading.Thread(target=lambda: [srvlog.write(l) or srvlog.flush() for l in iter(srv.stdout.readline, '')], daemon=True).start()
WS = f'ws://127.0.0.1:{port}/ws'; log('server on', WS, 'race clock x' + SCALE)

NAMES = ['ALICE', 'BOB', 'CAROL']
try:
  with sync_playwright() as pw:
    P, browsers = {}, []
    for name in NAMES:
        b = pw.chromium.launch(args=ARGS); browsers.append(b)
        ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(TIMER_FRAMES)
        pg = ctx.new_page(); pg.set_default_timeout(120000)
        pg.on('pageerror', lambda e, n=name: errors.append(f'{n} pageerror {str(e)[:400]}'))
        pg.on('console', lambda m, n=name: errors.append(f'{n} [{m.type}] {m.text[:300]}') if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text and 'ERR_TUNNEL' not in m.text and 'reward refused' not in m.text else None)
        pg.goto(build + f'?quality=low&autotest=1&mp={WS}')
        P[name] = pg
    A, B, Cc = P['ALICE'], P['BOB'], P['CAROL']
    for pg in P.values(): pg.wait_for_function('() => window.__game && window.__game.ready && __game.state === "title"', timeout=600000)
    ev = lambda pg, js: pg.evaluate(js)
    W = lambda pg, cond, t=120000: pg.wait_for_function(cond, timeout=t)
    def click(pg, sel): pg.wait_for_selector(sel, state='attached', timeout=60000); pg.click(sel, force=True, timeout=60000)
    def norender(pg): ev(pg, '() => { const g = __game.gfx; if (!g._render) g._render = g.render; g.render = () => {}; for (const id of ["hud", "markers"]) document.getElementById(id).style.visibility = "hidden"; }')
    def healthy():  # every game back at a normal frame rate (software rendering of a screenshot competes for the CPU)
        for p in P.values(): p.wait_for_function('() => __game.fps > 20', timeout=300000, polling=500)
    def shot(pg, name):  # drawn at 60% resolution: software WebGL is slow
        t0 = ev(pg, '() => { const g = __game; window.__rafMode = "real"; if (g.gfx._render) g.gfx.render = g.gfx._render; g.settings.dynRes = "off"; g.gfx.setRes(0.6); for (const id of ["hud", "markers"]) document.getElementById(id).style.visibility = ""; return g.t; }')
        pg.wait_for_function('t0 => __game.t > t0 + 0.2', arg=t0, timeout=600000, polling=500)
        pg.screenshot(path=str(out / f'{name}.png'), timeout=600000); ev(pg, '() => { window.__rafMode = "timer"; }'); norender(pg)
        ev(pg, '() => { __game.gfx.gl.finish(); }')  # let the software GPU work off the queued frames now
        healthy()
    wallet = lambda pg: ev(pg, '() => __game.progress.wallet()')
    # the time of every game frame (the game loop calls __game.frame on each animation frame), for the timing checks
    FRAMES = '() => { const g = __game, f = g.frame; window.__gf = []; g.frame = function (t) { const a = window.__gf; a.push(performance.now()); if (a.length > 8000) a.splice(0, 4000); return f.call(this, t); }; }'
    for pg in P.values(): norender(pg); ev(pg, FRAMES)
    log('three games loaded')

    # ---------- title and online home ----------
    t = A.inner_text('#ui')
    check('the title menu keeps every existing mode and adds Online multiplayer', all(A.query_selector(f'#ui [data-act="{a}"]') for a in ['garage', 'career', 'settings', 'controls']) and len(A.query_selector_all('#ui [data-act="mode"]')) == 3 and 'online multiplayer' in t.lower() and A.query_selector('#ui [data-act="mp"][data-arg="open"]') is not None, t[:200].replace('\n', ' | '))
    w0 = {n: wallet(pg) for n, pg in P.items()}
    for n, pg in P.items():
        click(pg, '#ui [data-act="mp"][data-arg="open"]'); W(pg, '() => __game.mp.view === "home" && __game.mp.conn && __game.mp.conn.state === "online"', 30000)
    check('Online multiplayer connects to the server (signed in with a server-issued pilot id)', all(ev(pg, '() => /^p[0-9a-f]{12}$/.test(__game.mp.pid)') for pg in P.values()), [ev(pg, '() => __game.mp.pid') for pg in P.values()])
    for pg in P.values():  # when each game receives the server's race messages (timing checks)
        ev(pg, '() => { const c = __game.mp.conn; window.__msgT = {}; for (const ty of ["prepare", "start"]) c.on(ty, () => { window.__msgT[ty] = performance.now(); }); }')
    shot(A, 'mp-home')
    A.fill('#ui [data-mpin="name"]', 'A'); click(A, '#ui [data-act="mp"][data-arg="create"]'); time.sleep(0.3)
    check('an invalid pilot name is refused with a message', 'pilot name' in A.inner_text('#ui').lower() and ev(A, '() => __game.mp.view') == 'home', A.inner_text('#ui [role=alert]') if A.query_selector('#ui [role=alert]') else '')
    for n, pg in P.items(): pg.fill('#ui [data-mpin="name"]', n.title())
    B.fill('#ui [data-mpin="code"]', 'ZZZZZ'); click(B, '#ui [data-act="mp"][data-arg="join"]'); W(B, '() => !!__game.mp.error', 10000)
    check('joining an unknown room code shows the server\'s answer', 'no lobby with that code' in B.inner_text('#ui').lower(), ev(B, '() => __game.mp.error'))

    # ---------- lobby ----------
    click(A, '#ui [data-act="mp"][data-arg="create"]'); W(A, '() => __game.mp.view === "lobby"', 30000)
    code = ev(A, '() => __game.mp.lobby.code'); log('room code', code)
    check('creating a lobby shows its room code and the hangar with your ship', code in A.inner_text('#ui') and ev(A, '() => __game.scene.kind === "hangar" && __game.scene.mode === "showcase"'), code)
    for pg in (B, Cc):
        pg.fill('#ui [data-mpin="code"]', code.lower()[:2] + '-' + code.lower()[2:]); click(pg, '#ui [data-act="mp"][data-arg="join"]'); W(pg, '() => __game.mp.view === "lobby"', 30000)
    W(A, '() => __game.mp.lobby.members.length === 3', 30000)
    names = ev(A, '() => __game.mp.lobby.members.map(m => m.name)')
    check('two other pilots join with the code (typed in lower case with a dash) and everyone sees all three', names == ['ALICE', 'BOB', 'CAROL'] and all(ev(pg, '() => __game.mp.lobby.members.length') == 3 for pg in P.values()), names)
    click(B, '#ui [data-act="mp"][data-arg="ship:1"]'); W(A, '() => __game.mp.lobby.members.find(m => m.name === "BOB").ship !== "kestrel"', 15000)
    bship = ev(A, '() => __game.mp.lobby.members.find(m => m.name === "BOB").ship')
    check('a ship change in the lobby reaches the other pilots', bship and bship.upper() in A.inner_text('#ui').upper(), bship)
    check('only the host has a start button, and it waits until everyone is ready', A.query_selector('#ui [data-arg="start"][disabled]') is not None and B.query_selector('#ui [data-arg="start"]') is None)
    for pg in P.values(): click(pg, '#ui [data-act="mp"][data-arg="ready"]')
    W(A, '() => __game.mp.lobby.members.every(m => m.ready) && !document.querySelector("#ui [data-arg=start]").disabled', 30000)
    shot(A, 'mp-lobby-host')
    time.sleep(2); healthy()
    click(A, '#ui [data-act="mp"][data-arg="start"]')

    # ---------- stage 1 ----------
    for pg in P.values(): W(pg, '() => __game.mp.view === "race" && __game.scene.mp && __game.state === "race"', 60000)
    info = [ev(pg, '() => { const nr = __game.mp.netrace; return { rid: nr.rid, track: nr.m.track, grid: nr.m.grid.map(g => g.pid), laps: nr.m.laps, me: !!nr.me, remotes: nr.remotes.length } }') for pg in P.values()]
    check('everyone loads the same race: same course and grid, five laps, the two others as remote ships', len({i['rid'] for i in info}) == 1 and len({i['track'] for i in info}) == 1 and all(i['laps'] == 5 and i['me'] and i['remotes'] == 2 for i in info), info[0])
    for pg in P.values():  # a trace of where every ship is in each game, stamped with the time of the game frame that put it there
        ev(pg, '''() => { window.__trace = []; let last = -1; const tick = () => { const m = __game.mp, nr = m.netrace; if (!nr) return; const r = nr.race, f = window.__gf, lf = f[f.length - 1];
          if (r.state === 'racing' && lf !== last && window.__trace.length < 4000) { last = lf; window.__trace.push([performance.timeOrigin + lf, nr.rid, Object.fromEntries(nr.all.map(x => [x.pid, [x.ship.pos.x, x.ship.pos.y, x.ship.pos.z, x === nr.me ? 1 : 0]]))]); } };
          window.__traceT = setInterval(tick, 20); }''')
    for pg in P.values(): W(pg, '() => __game.mp.netrace && __game.mp.netrace.goAt > 0', 60000)
    # each game's start estimate, its GO, the frames around them and when the race messages arrived (ms, relative to the start estimate)
    GO_JS = '''() => { const nr = __game.mp.netrace, sl = nr.startLocal, go = nr.goAt - performance.timeOrigin, m = window.__msgT || {}, f = window.__gf || [];
      const fb = f.filter(x => x >= (m.prepare || sl - 8000) - 1000 && x <= go + 0.01); let gap = 0;
      for (let i = 1; i < fb.length; i++) gap = Math.max(gap, fb[i] - fb[i - 1]);
      const r = x => x == null ? null : Math.round(x - sl);
      return { start: performance.timeOrigin + sl, go: r(go), goFrame: r(fb[fb.length - 1]), prevFrame: r(fb[fb.length - 2]), startMsg: r(m.start), prepareMsg: r(m.prepare), maxFrameGap: Math.round(gap), fps: Math.round(__game.fps) } }'''
    go = {n: ev(pg, GO_JS) for n, pg in P.items()}
    est = max(g['start'] for g in go.values()) - min(g['start'] for g in go.values())
    # pass: the games agree on the start moment (clock sync) and each says GO on its first frame at that moment, i.e. no frame
    # of that game came between the start (plus the 0.1 s correction margin) and its GO. A game starved of CPU says GO late,
    # on its next frame: that shows in maxFrameGap and is reported, not hidden.
    on_time = all(g['go'] >= -110 and g['prevFrame'] is not None and g['prevFrame'] <= 110 for g in go.values())
    spread = max(g['go'] + g['start'] for g in go.values()) - min(g['go'] + g['start'] for g in go.values())
    check('the start is synchronised: the three games agree on the server\'s start time and each says GO on its first frame at that moment', est < 50 and on_time, f'start estimates within {est:.0f} ms; GO spread {spread:.0f} ms; per game (ms from its start estimate): {go}')
    time.sleep(6)
    rem = ev(A, '() => __game.mp.netrace.remotes.map(r => ({ name: r.remote.base, states: r.remote.buf.a.length, prog: Math.round(r.prog), delay: Math.round(r.remote.buf.delay()) }))')
    fps = {n: round(ev(pg, '() => __game.fps'), 1) for n, pg in P.items()}; log('frame rates with the GPU draw off', fps)
    check('remote ships stream in during the race (states buffered, progress advancing)', all(r['states'] > 10 and r['prog'] > 50 for r in rem), rem)
    log('racing', rem)
    W(A, '() => __game.mp.view === "stage" || __game.mp.view === "final"', 400000)
    for pg in P.values(): W(pg, '() => __game.mp.view === "stage"', 60000)
    # sync: what ALICE drew for BOB / CAROL vs where they really were (their own traces), a little in the past
    traces = {n: ev(pg, '() => window.__trace') for n, pg in P.items()}; pids = {n: ev(pg, '() => __game.mp.pid') for n, pg in P.items()}
    def lag_stats(viewer, target):
        import bisect
        own = [(t, s[pids[target]]) for t, rid, s in traces[target] if pids[target] in s and s[pids[target]][3] == 1]; seen = [(t, s[pids[target]]) for t, rid, s in traces[viewer] if pids[target] in s]
        if len(own) < 50 or len(seen) < 50: return None
        own_t = [o[0] for o in own]; lags, errs = [], []
        for t, p in seen[len(seen) // 5: -len(seen) // 5: 5]:  # mid-race samples: nearest point on the pilot's own path around that time
            best = None
            for k in range(max(1, bisect.bisect_left(own_t, t - 2000)), min(len(own), bisect.bisect_right(own_t, t + 500))):
                (t0, a), (t1, b2) = own[k - 1], own[k]; d = [b2[i] - a[i] for i in range(3)]; L2 = sum(x * x for x in d)
                u = 0 if L2 < 1e-9 else max(0, min(1, sum((p[i] - a[i]) * d[i] for i in range(3)) / L2))
                dist = math.dist([a[i] + u * d[i] for i in range(3)], p[:3])
                if best is None or dist < best[0]: best = (dist, t - (t0 + u * (t1 - t0)))
            if best: errs.append(best[0]); lags.append(best[1])
        lags.sort(); errs.sort()
        return {'median_lag_ms': round(lags[len(lags) // 2]), 'p90_lag_ms': round(lags[int(len(lags) * 0.9)]), 'median_gap_m': round(errs[len(errs) // 2], 2), 'p90_gap_m': round(errs[int(len(errs) * 0.9)], 2), 'n': len(lags)}
    ls = {f'{v}->{t}': lag_stats(v, t) for v in NAMES for t in NAMES if v != t}
    good = [s for s in ls.values() if s]
    check('remote ships are drawn on the other pilots\' real paths, a fraction of a second behind (interpolation delay)', len(good) == 6 and all(0 <= s['median_lag_ms'] <= 600 and s['median_gap_m'] < 6 for s in good), json.dumps(ls))
    (out / 'sync.json').write_text(json.dumps(ls, indent=1))
    R1 = ev(A, '() => __game.mp.results')
    rows = [(r['name'], r['place'], r['status'], r['time'], r.get('reason')) for r in R1['rows']]
    q = R1['qualified']; elim = [r['name'] for r in R1['rows'] if r['pid'] not in q]
    check('stage 1 result: positions, names, ships and times; the top two qualify, the third is eliminated', len(rows) == 3 and [r[1] for r in rows] == [1, 2, 3] and len(q) == 2 and q == [r['pid'] for r in R1['rows'][:2]] and len(elim) == 1, rows)
    txt = {n: pg.inner_text('#ui') for n, pg in P.items()}
    en = elim[0]; qn = [n for n in NAMES if n != en]
    h2 = {n: pg.inner_text('#ui h2') for n, pg in P.items()}
    check('the results screen says who qualified and who is eliminated', all('QUALIFIED' in txt[n].upper() and 'ELIMINATED' in txt[n].upper() for n in NAMES) and h2[en].lower() == 'eliminated' and all(h2[n].lower() == 'you qualified for the final' for n in qn), h2)
    shot(P[en], 'mp-stage1-eliminated')

    # ---------- the final ----------
    for pg in P.values(): W(pg, '() => __game.mp.view === "race" && __game.mp.netrace && __game.mp.netrace.stage === 2', 120000)
    f = {n: ev(pg, '() => { const nr = __game.mp.netrace; return { track: nr.m.track, grid: nr.m.grid.map(g => g.name), participant: nr.participant, spectating: nr.spectating } }') for n, pg in P.items()}
    check('the final: a second course, the two qualifiers on the grid', f['ALICE']['track'] != info[0]['track'] and sorted(f['ALICE']['grid']) == sorted(qn), f['ALICE'])
    check('the eliminated pilot watches the final', not f[en]['participant'] and f[en]['spectating'] and all(f[n]['participant'] for n in qn), f[en])
    time.sleep(5); shot(P[en], 'mp-final-spectator'); log('final', f['ALICE'])
    for pg in P.values(): W(pg, '() => __game.mp.view === "final"', 400000)
    Cm = ev(A, '() => __game.mp.complete')
    fin = [s for s in Cm['stages'] if s['stage'] == 2][0]
    check('tournament result: winner and second, both times, the final\'s course, five laps', Cm['winner'] == fin['rows'][0]['pid'] and Cm['runnerUp'] == fin['rows'][1]['pid'] and fin['track'] == f['ALICE']['track'] and Cm['outcome'] in ('raced', 'distance', 'forfeit'), [(r['name'], r['place'], r['time']) for r in fin['rows']] + [Cm['outcome']])
    ft = A.inner_text('#ui')
    check('the tournament screen names the winner and offers lobby / another tournament / leave', Cm['winnerName'] in ft and A.query_selector('#ui [data-arg="rematch"]') and A.query_selector('#ui [data-arg="lobby"]') and A.query_selector('#ui [data-arg="exit"]') and not B.query_selector('#ui [data-arg="rematch"]'), ft[:200].replace('\n', ' | '))
    shot(A, 'mp-final-host')
    paid = {n: ev(pg, '() => ({ reward: __game.mp.reward, paid: __game.mp.paid, tx: __game.progress.profile.ledger.tx.filter(t => t.kind === "mp").length, seen: __game.progress.profile.ledger.seen.filter(e => e.startsWith("mp:")) })') for n, pg in P.items()}
    w1 = {n: wallet(pg) for n, pg in P.items()}
    ok = all((w1[n]['CR'] - w0[n]['CR'], w1[n]['ST'] - w0[n]['ST']) == ((paid[n]['reward'] or {}).get('CR', 0), (paid[n]['reward'] or {}).get('ST', 0)) for n in NAMES)
    check('rewards: each career is paid exactly its own tournament reward once, through the career ledger', ok and all((paid[n]['paid'] is True) == bool(paid[n]['reward']) for n in NAMES) and all(len(paid[n]['seen']) == (1 if paid[n]['reward'] else 0) for n in NAMES), {n: [w1[n], paid[n]['reward'] and paid[n]['reward']['CR'], paid[n]['paid']] for n in NAMES})
    wn = [n for n in NAMES if pids[n] == Cm['winner']][0]
    check('the winner gets the winner\'s bonus (500 CR and 3 Style Tokens on top of race rewards)', paid[wn]['reward'] and paid[wn]['reward']['ST'] >= 3 and any(l['name'] == 'Tournament winner' for l in paid[wn]['reward']['lines']), paid[wn]['reward'])
    W_ = P[wn]; ev(W_, '() => __game.mp.onComplete(__game.mp.complete)')  # the winner always has a reward to pay twice
    check('the same tournament result delivered again pays nothing more', wallet(W_) == w1[wn] and ev(W_, '() => __game.mp.paid') == 'dup', {'pilot': wn, 'paid': ev(W_, '() => __game.mp.paid'), 'wallet': wallet(W_)})

    # ---------- a second tournament: dropped connection, leaving from the in-race menu ----------
    click(A, '#ui [data-act="mp"][data-arg="rematch"]')
    for pg in P.values(): W(pg, '() => __game.mp.view === "race" && __game.mp.netrace && __game.mp.netrace.stage === 1 && __game.mp.netrace.rid !== ' + json.dumps(info[0]['rid']), 60000)
    tid2 = ev(A, '() => __game.mp.netrace.m.tid'); check('the host starts another tournament (new tournament id)', tid2 and tid2 != Cm['tid'], tid2)
    for pg in P.values(): W(pg, '() => __game.mp.netrace && __game.mp.netrace.race.state === "racing" && __game.mp.netrace.race.time > 20', 120000)
    t_before = ev(B, '() => __game.mp.netrace.race.time')
    ev(B, '() => { window.__states = []; __game.mp.conn.on("conn", e => window.__states.push(e.state)); __game.mp.conn.ws.close(); }')
    W(B, '() => window.__states.includes("online")', 30000)
    time.sleep(1)
    st = ev(B, '() => ({ states: window.__states, out: __game.mp.netrace.out, t: __game.mp.netrace.race.time, bar: document.getElementById("mpbar").innerText })')
    check('a dropped connection reconnects by itself and the pilot races on', 'reconnecting' in st['states'] and st['states'][-1] == 'online' and not st['out'] and st['t'] > t_before, st)
    W(A, '() => __game.mp.netrace && __game.mp.netrace.remotes.some(r => r.remote.base === "BOB" && !r.remote.lost)', 30000)
    Cc.keyboard.press('Escape'); W(Cc, '() => __game.mp.menuOpen', 10000)
    t0 = ev(Cc, '() => __game.mp.netrace.race.time'); time.sleep(2); t1 = ev(Cc, '() => __game.mp.netrace.race.time')
    check('Esc opens the online menu and the race keeps running (an online race cannot be paused)', t1 > t0 and 'keeps going' in Cc.inner_text('#ui'), f'{t0:.1f} -> {t1:.1f}')
    shot(Cc, 'mp-race-menu')
    click(Cc, '#ui [data-act="mp"][data-arg="menu:leave"]'); click(Cc, '#ui [data-act="mp"][data-arg="menu:leave"]')
    W(Cc, '() => __game.mp.view === "home"', 20000)
    W(A, '() => __game.mp.netrace && __game.mp.netrace.remotes.some(r => r.remote.base === "CAROL" && r.remote.out)', 20000)
    check('leaving from the in-race menu returns to the online screen; the others see that pilot out', ev(A, '() => __game.mp.lobby.members.length') == 2, ev(A, '() => __game.mp.lobby.members.map(m => m.name)'))
    shot(A, 'mp-race')
    W(A, '() => __game.mp.view === "final"', 600000); W(B, '() => __game.mp.view === "final"', 120000)
    C2 = ev(A, '() => __game.mp.complete')
    rb = [r for s in C2['stages'] for r in s['rows'] if r['name'] == 'BOB']
    check('the reconnected pilot finished their races', all(r['status'] == 'finished' for r in rb), [(r['status'], r.get('reason')) for r in rb])
    check('the second tournament pays again, under its own id', ev(A, '() => __game.progress.profile.ledger.seen.filter(e => e.startsWith("mp:")).length') == (1 if paid['ALICE']['reward'] else 0) + (1 if ev(A, '() => __game.mp.reward') else 0))
    click(A, '#ui [data-act="mp"][data-arg="exit"]'); W(A, '() => __game.state === "title" && __game.mp.view === null', 20000)
    check('Leave multiplayer returns to the main menu and closes the connection', ev(A, '() => __game.mp.conn === null && __game.opts.mode !== "online"'))
    for b in browsers: b.close()
finally:
    srv.terminate(); srv.wait(10)
check('no page errors in any of the three games', not errors, errors[:12])
fails = [c for c in checks if not c[1]]
(out / 'report.json').write_text(json.dumps({'checks': checks, 'errors': errors}, indent=1))
print(f'{len(checks) - len(fails)}/{len(checks)} checks passed'); sys.exit(1 if fails else 0)
