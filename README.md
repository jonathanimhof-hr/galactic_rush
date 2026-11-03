# GALACTIC RUSH V8

An arcade space racer: five ships, four courses, five rivals, quick race, a four-round championship and time trials with ghosts. **V8 adds online multiplayer**: a two-stage tournament against real pilots on their own devices (a five-lap qualifier for everyone, then a five-lap final for the top two), run by a multiplayer server that is included but **not deployed** (see *V8* below). V7 added a career: Credits and Style Tokens earned in every race, a Rookie → Pro → Ace championship ladder with completion bonuses, real ship upgrades, a paint shop that works on the 3D ships, an inventory and an in-game cosmetic shop (see *V7* below; there are no real-money payments). V6 was a visual-quality and performance pass over V5: the two views that V5 made slower are fixed at their measured causes, asteroids get fractured silhouettes and geological materials, Neon Spire's curved towers get real facades, the fleet gains two original ship classes with baked hangar lighting and moving turrets, and planets get atmospheres, clouds, storms and lineae (see *V6* below). V5 rebuilt the environments and the rendering around them: capital ships, asteroids, planets, lighting and atmosphere, Neon Spire's facades, and level of detail with occlusion culling. V4 rebuilt Neon Spire's architecture and all five spacecraft, V3 the world's materials and V2 the renderer. Every ship, course, pilot, brand, script, logo, piece of music and sound is original; there are no external images, models or audio.

## Play

- **In the browser:** open the published artifact "Galactic Rush V8" ([claude.ai/artifact/TeaovDquAktfARnqu7vBjL](https://claude.ai/artifact/TeaovDquAktfARnqu7vBjL)). Everything single-player works there; its *Online multiplayer* screen says that this copy cannot play online and why: online play needs a running multiplayer server and a copy of the game published with its address, and the artifact viewer blocks network connections. V1–V7 stay published, unchanged, as separate artifacts: [V1](https://claude.ai/artifact/DrkkCSQsuqkWNL3QpqKD7i), [V2](https://claude.ai/artifact/L3i3sv8a5X2EEKwyPJ2ZTT), [V3](https://claude.ai/artifact/RWUgUM8ZDrCD1tvfwGaeWQ), [V4](https://claude.ai/artifact/E8sLQj6zv5PoijosDcDm39), [V5](https://claude.ai/artifact/RGwxf89DtxdqaL5dV9JLYh), [V6](https://claude.ai/artifact/FYRnybXaqYS5eBs2DnrUC4), [V7](https://claude.ai/artifact/WJzNY8vqbZjr8SLqgtXF6b). Each artifact keeps its own browser storage, so a V8 career starts fresh.
- **Online multiplayer:** deploy the server and publish the game to GitHub Pages (or any HTTPS host) as described in *V8*, or run both locally.
- **Offline:** open `dist/galactic-rush-v8.html` in Chrome, Edge, Firefox or Safari. It is one self-contained file with no external code; only its three typefaces come from Google Fonts, and the layout falls back cleanly without them.

Needs WebGL2 and a keyboard or a standard gamepad. Sound starts after your first click, key or button press.

### Develop

Node 18+. The game has zero npm dependencies; the V8 multiplayer server has one (`ws`, installed with `npm install --prefix server`).

```
npm start          # dev server with live ES modules: http://localhost:5173/
npm run build      # bundles src/ into dist/galactic-rush-v8.html (+ an artifact variant and dist/site/ for GitHub Pages); GR_MP_SERVER=wss://… sets the server
npm test           # simulation, geometry, V7 progression, upgrade-physics and V8 multiplayer-rule tests (node:test)
npm run server     # V8: the multiplayer server on ws://localhost:8787 (after npm install --prefix server)
npm run test:mp    # V8: the real server with several real WebSocket clients: lobbies, tournaments, reconnection, cheating
python3 tests/mp/e2e.py dist/galactic-rush-v8.html OUT/   # V8: three browser games play two tournaments against a local server (Python Playwright + Chromium)
node tests/economy.mjs                                  # V7: real race lengths -> credits per minute and upgrade pacing
python3 tests/progression.py dist/galactic-rush-v8.html OUT/   # V7 end to end: rewards, championships, garage, shop, paint, premium
python3 tests/paintsheet.py dist/galactic-rush-v8.html OUT/    # V7 paint jobs on the 3D ships (sheets + pixel checks)
python3 tests/v6look.py V6.html dist/galactic-rush-v8.html OUT/   # V7: stock ships render exactly as in V6
python3 tests/shipbench.py OUT.json V6.html dist/galactic-rush-v8.html   # V7: frame times with stock and custom paint jobs
python3 tests/playtest.py races|flow|ghost|champ|bench|moments   # browser playtests (Python Playwright + Chromium)
python3 tests/compare.py OLD.html dist/galactic-rush-v8.html tests/specs/matched-v6.json OUT.png   # the same views in two builds, side by side
python3 tests/views.py dist/galactic-rush-v8.html tests/specs/capital-v6.json OUT.png   # labelled sheets (capital, asteroids, planets, city, ships, courses)
python3 tests/vis.py dist/galactic-rush-v8.html   # occlusion, LOD hysteresis, LOD bias and capital cross-fade checks
python3 tests/settings.py dist/galactic-rush-v8.html   # every preset and graphics toggle switched at runtime
python3 tests/fixedbench.py OUT.json OLD.html dist/galactic-rush-v8.html   # synchronised fixed-camera benchmark; tests/perftable.py OUT.json OLD.html NEW.html makes the table
python3 tests/perfprobe.py dist/galactic-rush-v8.html --views=ring-plane   # synchronised timing of single views
python3 tests/bench.py spire OLD.html NEW.html    # every preset on one course, for comparing builds
python3 tests/handsoff.py                         # Relaxed vs Classic handling with no input
python3 tests/shots.py OUT.png "track=belt&quality=high&ff=9"   # screenshot any race moment
```

URL parameters (developer and test use; the artifact viewer ignores query strings): `mp=ws://host:port` (V8: multiplayer server, local and LAN pages only), `quality=low|medium|high|ultra`, `track=foundry|belt|spire|ring`, `laps`, `ship=0..4`, `diff=rookie|pro|ace`, `skipmenu=1&mode=quick|trial|champ`, `autotest=1` (AI flies your ship), `nointro=1`, `ts=` (time scale), `view=hangar`, `gallery=1` (Neon Spire archetype lineup, Cinder Belt asteroid lineup), and `bench` / `bench=short` (see below).

### Benchmark

In the published artifact, open its link with `#bench` (or `#bench-short`) appended; the offline file also accepts `?bench`.

Open the game with `?bench` (a full autopilot lap of Foundry Trench per preset) or `?bench=short` (12 seconds per preset). It runs Low, Medium, High and Ultra in turn and shows average FPS, 1%-low FPS, median and 95th-percentile frame time, draw calls and triangles for each, plus your GPU name; `window.__bench` also holds the instance counts (considered, drawn, frustum-, occlusion- and size-culled). Limit presets with `&presets=medium,high`. Results are also logged to the console and kept in `window.__bench`.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Pitch / yaw | W S A D or arrows | Left stick |
| Roll | Q E | Right stick |
| Boost | Space | A or RT |
| Drift / air-brake | Shift | LB |
| Brake | X | LT |
| Throttle lever | R F | D-pad up/down |
| Fire ion bolt | J or left click | X or RB |
| Shield | K | Y |
| Camera (chase, far, cockpit) | C | D-pad right |
| Look back | B | R3 |
| Reset to course | T | D-pad left |
| Pause | P or Esc | Start |

Menus: arrow keys or d-pad move, Enter or A selects, Esc or B goes back. Garage: ← → or d-pad switch ship, Q / E (Page Up / Down) or LB / RB switch tab, [ ] or the right stick turn the ship, drag it with the mouse and zoom with the wheel; the d-pad also moves a focused slider.

## V8: online multiplayer tournament

V7 is the baseline and is unchanged. V8 adds one new main-menu mode, **Online multiplayer**: real pilots on their own devices race a two-stage elimination tournament through a multiplayer server. There are no AI or simulated opponents online: every ship in an online race belongs to a person connected to the server.

> **Deployment status: the multiplayer server is NOT deployed, and no GitHub repository was set up from this session.** Online play works when you deploy the server (`server/`, see *Deploy the server*) and publish the game with that server's address (see *Deploy the game to GitHub Pages*). Pushing to GitHub publishes the game only; the server is a separate deployment. The claude.ai artifact cannot play online at all, because the artifact viewer blocks network connections: its Online multiplayer screen says so instead of pretending to connect. Everything below was tested with a server and several clients running on one machine (results in *Tests*).

### The mode
- **Lobby.** Enter a pilot name, then *Create lobby* (private: join by code only; or public: also listed on the online screen) or *Join with code*. The lobby shows the room code with a *Copy code* button, every pilot with their ship and ready state, the host, your ship (‹ › to change it; the hangar shows it in your saved paint job), and, for the host, the handling (Relaxed or Classic, the same for everyone) and visibility. Two to six pilots. *Leave lobby* asks for a second press.
- **Start.** When every connected pilot is ready, the host starts the tournament. Only the host has a start button; the server refuses a start from anyone else, or before everyone is ready.
- **Stage 1, qualifier.** Every pilot in the lobby races five laps on a course the server picks at random. The two best-placed pilots qualify; everyone else is eliminated (and can watch the final).
- **Stage 2, final.** The two qualifiers race five laps on a second course picked at random, never the qualifier's course while another is left. The first across the line wins the tournament.
- **Results.** After the qualifier: positions, names, ships, times (or why a pilot did not finish), *Qualified* / *Eliminated*, and a countdown to the final. After the final: the winner and second with their times, the final's course and five-lap table, the qualifier table, how the tournament ended, and your reward with your new balance. Then *Start another tournament* (host), *Back to lobby* or *Leave multiplayer*.
- **In a race** the game's own HUD, cameras, effects and sounds run as in single-player, with the other pilots' names over their ships and in the standings. A bar under the lap counter shows the stage and course, *Waiting for pilots · 2/3 on the grid*, the start, *Race closes in N s* after the first finish, connection trouble, and who you are watching. **Esc / P / Start opens the online menu instead of pausing** (an online race cannot be paused): *Keep racing* or *Leave the tournament* (two presses). Out of the race, eliminated or past the finish line you watch the others: ← → (or LB / RB, or the ‹ › buttons on the bar) switch pilot, C changes camera.

### Run it locally
Node 18 or newer (tested with Node 22). The server's only dependency is [`ws`](https://www.npmjs.com/package/ws).
```
npm install --prefix server     # once: installs ws for the server
npm run server                  # multiplayer server on ws://localhost:8787 (status: http://localhost:8787/health)
npm run build                   # dist/galactic-rush-v8.html, the artifact variant and dist/site/ (GitHub Pages)
npm start                       # dev server for the game: http://localhost:5173/
```
Open `http://localhost:5173/?mp=ws://localhost:8787` (or `dist/galactic-rush-v8.html?mp=ws://localhost:8787`) in two browser windows; each tab is its own pilot. Tabs of one browser share that browser's saved career, so use a second browser (or a private window) to keep two pilots' rewards apart. The automated multi-client tests are `npm run test:mp` and `tests/mp/e2e.py` (see *Tests*). `?mp=` is honoured only on pages served from this computer or the local network, never on a public site, so a link cannot point someone's game at another server.

**From another device on your network:** run both commands above on one computer (say it is `192.168.1.20`), then on the other device open `http://192.168.1.20:5173/?mp=ws://192.168.1.20:8787`. Allow ports 5173 and 8787 through that computer's firewall.

**Create a lobby:** title screen → *Online multiplayer* → pilot name → *Create lobby*. **Join from another device:** *Online multiplayer* → type the room code → *Join with code* (letters and digits only, no I, L, O, 0 or 1; case and dashes do not matter). **Start a tournament:** everyone presses *Ready*, then the host presses *Start tournament*.

### Deploy the server
The server is a small Node program (`server/index.mjs`) that needs to stay running and be reachable over **HTTPS/WSS** (GitHub Pages is served over https, and browsers only allow secure WebSockets from it). Lobbies live in memory: run exactly one instance.

**Render (free tier is enough to try it):** push this repository to GitHub → render.com → *New* → *Blueprint* → pick the repository. `render.yaml` creates the web service, runs `npm install --prefix server`, starts `node server/index.mjs`, checks `/health`, sets `NODE_ENV=production` and generates `TOKEN_SECRET`. When asked, set `ALLOWED_ORIGINS` to your Pages origin, e.g. `https://yourname.github.io` (scheme and host only, no path). The server's address is then `wss://<service-name>.onrender.com`. Free instances sleep when idle and take about a minute to wake; if the first connection fails, press *Connect* again.

**Any container host (Fly.io, Railway, a VPS):** `docker build -t galactic-rush-mp .` from the repository root (the server reuses the game's rules in `src/`), run it with `TOKEN_SECRET` and `ALLOWED_ORIGINS` set, and put it behind HTTPS (the host's TLS, or a proxy such as Caddy). Without Docker: `npm install --prefix server --omit=dev` then `NODE_ENV=production TOKEN_SECRET=… ALLOWED_ORIGINS=… node server/index.mjs`.

Check it: `https://<your-server>/health` returns `{"ok":true,…}` with the number of lobbies, sessions and connections.

| Variable | Meaning |
|---|---|
| `PORT` | port to listen on (default 8787; Render and Fly set it) |
| `HOST` | interface (default `0.0.0.0`) |
| `TOKEN_SECRET` | **required in production**, 32+ random characters; signs session tokens. Never put it in the game or the repository. |
| `ALLOWED_ORIGINS` | **required in production**: comma-separated website origins allowed to connect, e.g. `https://yourname.github.io`. Connections from other pages (and from non-browser clients without that origin) are refused. |
| `ELIGIBLE_TRACKS` | courses the server may pick (default `foundry,belt,spire,ring`) |
| `MAX_LOBBIES`, `MAX_CONNECTIONS` | limits (default 200 and 1000) |
| `LOG_LEVEL` | `error`, `warn`, `info` (default) or `debug`; one JSON line per event |
| `GR_TIME_SCALE` | automated tests only: runs race clocks faster. Refused when `NODE_ENV=production`. |

### Deploy the game to GitHub Pages
The project had no GitHub workflow before V8 (V1–V7 were published as claude.ai artifacts and as the single-file build), so V8 adds one: `.github/workflows/pages.yml`. It has not been run on GitHub from here, because no GitHub repository is connected to this session; the same steps (`npm test`, then `node build.mjs` with `GR_MP_SERVER` set) were run locally and produce the site folder it publishes.

1. Push this repository to GitHub (the workflow publishes from `main`).
2. *Settings → Pages → Build and deployment → Source: GitHub Actions.*
3. *Settings → Secrets and variables → Actions → Variables → New repository variable:* `GR_MP_SERVER` = your server's address, e.g. `wss://galactic-rush-mp.onrender.com`. It is public (anyone can see it in the page), not a secret; no secret goes into the game.
4. Push (or run the workflow by hand). `.github/workflows/pages.yml` runs `npm test`, builds with `GR_MP_SERVER` and publishes `dist/site/` (the game as `index.html` plus `config.js`).

The address can also be changed later without rebuilding: edit `config.js` on the site (`window.GALACTIC_RUSH_CONFIG = { multiplayerServer: 'wss://…' }`). Order of precedence in the game: `config.js`, then the address built in from `GR_MP_SERVER`, then (local pages only) `?mp=`. Without any of them the online screen says that no server is set. Remember that GitHub alone does not run the server: deploy it as above.

### How it works
```
 browser game (src/, src/mp/)                              multiplayer server (server/)
 +-------------------------------------+                   +----------------------------------------+
 | online screens   mp/ui.js           |                   | hub.mjs         sessions, checks, rate |
 | mode flow        mp/controller.js   |   WebSocket /ws   |                 limits, 20 Hz relay    |
 | connection       mp/net.js          |  <---- JSON ----> | lobby.mjs       codes, host, ready     |
 |   clock sync, reconnection          |                   | tournament.mjs  qualifier -> final     |
 | online race      mp/netrace.js      |  own state 20 Hz  |                 -> results -> rewards  |
 |   the game's own Race and RaceView; |  -------------->  | race.mjs        start, checks states,  |
 |   own ship simulated here,          |  everyone 20 Hz   |                 finishes, ranking      |
 |   other ships interpolated          |  <--------------  | maps, identity, rewards, config        |
 +-------------------------------------+                   +----------------------------------------+
   shared: src/mp/protocol.js (messages, checks), src/mp/rewards.js, the game's course and ship data
```
- **The server decides** lobby membership, host, the tournament's progress and stage transitions, both courses, the grid, when a race starts and ends, which finishes count, the official times and places, who qualifies, who wins, and every reward. Games only show what it says.
- **Each game flies its own ship** with the unchanged single-player physics and sends its state 20 times a second (position, rotation, velocity, boost, lap, checkpoint, progress and a few visual flags; 19 numbers, about 200 bytes). The server checks each state and relays everyone's latest states 20 times a second.
- **What the server checks:** the race clock may not run ahead of the server's; time and checkpoints may not go backwards; progress between two states and in total must be possible for that ship (its top speed with boost and a boost pad, plus a margin); checkpoints must be passed in order, none skipped. Twelve rejected states within ten seconds take a pilot out of the race. A finish counts only after the server has seen every checkpoint of all five laps, at the line, at a plausible time, and not faster than the ship can fly five laps; the official time is the game's own finish time unless it is more than half a second earlier than the server's clock allows (the server measures each connection's round trip itself, so a game cannot claim extra latency), in which case the server's time is used (marked \*). A client's claim to have finished or won is never taken on trust.
- **Remote ships** are drawn a little in the past (about 0.1–0.2 s on a steady connection; the delay adapts to the connection's jitter, up to 0.4 s), between the two states around that moment (position by a curve through both positions and velocities, rotation by slerp), with an adaptive delay for the connection's jitter. A late state lets a ship carry on along its velocity for at most 0.25 s, then it holds; ships never jump back.
- **Clock and start:** each game estimates the server clock from its quickest round trips. The race starts when every pilot has loaded the course (or after 30 s without the missing ones); the server announces a start time 5 s ahead and every game's own 3-2-1-GO lands on it.
- **Bumps** between ships use the game's own collision code. Each game moves only its own ship, so you bounce off the others where your game shows them.
- **Messages** are size-limited (4 KB), parsed and checked field by field with the shared protocol before anything happens; unknown types, wrong types and bad values are refused; each connection is rate-limited (bursts of 60, then 45 a second) and closed if it floods. Lobby state changes only through checked transitions (only the host starts, only when everyone is ready, nothing changes while a tournament runs).

### Policies
- **Disconnection during a race:** the race goes on. A pilot whose connection returns within **20 s** carries on where their game is (the game keeps flying while it reconnects, and an unanswered finish is sent again). After 20 s they are out of that race. Connected but sending nothing for 45 s: out. Reloading the page during a race: out of that race (the race lives in the page), but still in the lobby and the tournament, so they can watch; the session is kept for the tab, so reopening *Online multiplayer* rejoins the lobby.
- **Reconnection:** automatic, after 0.5, 1, 2, 3 and then every 5 s, for 30 s; the game then offers *Try again*. A pilot's session (server-issued id and signed token) is valid for 24 h; one connection per pilot, a newer one replaces the older.
- **Lobby:** a pilot disconnected from an open lobby for 60 s is removed; a host disconnected for 10 s hands over to the longest-standing connected pilot; an empty lobby closes; a lobby with nobody connected closes after 10 minutes. Nobody can join while a tournament runs. After a tournament the host can start another with the connected pilots for 2 minutes without new ready checks; after that everyone presses *Ready* again.
- **Qualification:** the top two by result who raced and are still connected when the qualifier ends. Finishers rank by time; pilots still racing when it ends rank by distance; pilots who left, were disconnected, inactive, removed or never loaded come last.
- **Race end:** when everyone has finished or dropped out, 45 race-seconds after the first finish (or a quarter of the winner's time, if longer: about 70 s in a five-lap race), or at 15 minutes.
- **Before the final:** a qualifier who is gone when the final is set up (12 s after the qualifier) is replaced by the next eligible pilot from the qualifier. With one finalist left: win by walkover. None: no result.
- **During the final:** a finalist who drops out before finishing (left, disconnected past the grace period, inactive or removed) forfeits; the other finalist wins at once. If nobody finishes before the race ends, the pilot who got further wins.

### Balance
- **Factory stats online.** Upgrades bought in the V7 garage stay in single-player: online, every ship flies with its factory stats, so the five ships remain distinct but nobody can buy speed. The ship choice is free.
- **Paint jobs come along.** Each pilot's saved paint job for the chosen ship is sent with the ship, cleaned on both sides by the career's own validator (known colours, items for the right slots, never premium items) and drawn on that pilot's ship for everyone. It is cosmetic only.
- **Ion bolts are off online** (hits between games would need the server to referee them); magenta cells still refill boost. Each pilot's two shields work as in single-player and protect their own ship.
- **Handling** (Relaxed or Classic) is the lobby's, the same for everyone. Steering assist and sensitivity are each player's own settings, as in single-player.
- **Pickups are per pilot:** everyone sees every boost pad and energy cell; taking one does not remove it for the others.

### Rewards
Paid in the game's existing currencies (no new currency) through the V7 career transaction system, once per tournament: the tournament id is the transaction's event id (`mp:<id>`), so a result delivered twice (after a reconnect, say) pays once. A race pays only if you finished it: round(150 × 1.3 × 1.5 × placement) Credits, with V7's placement table (366, 336, 316, 293, 278, 263 CR for P1–P6). The winner gets 500 CR and 3 Style Tokens on top, the runner-up 1 Style Token. A winner who finished both races gets 1,232 CR and 3 ST. The server works the reward out from its own results and sends each pilot only their own; the game recomputes it from the published results and refuses to pay anything that does not match. Nothing is paid for an unfinished race, a tournament you left, or a tournament without a result. Online rewards count in the career's lifetime Credits and Style Tokens; the career's race tables (by mode, by course, recent races) stay single-player. **Security limit:** the server decides every reward, but the career that receives it is stored in the player's browser, exactly like V7's single-player rewards, so someone who edits their own browser storage can change their own balances. Balances are never shared with or shown to other players, and nothing a game reports can change another pilot's reward or the tournament result. Tamper-proof balances would need careers stored on a server with accounts, which this version does not have. Other limits: the V7 career limits apply (balances up to 999,999,999; 400 remembered event ids, so a very old tournament id could in theory be paid again only after 400 newer rewards).

### Identity
Pilot names are 2–16 letters, digits, spaces and `. _ ' -`, shown in capitals and unique within a lobby (a second ACE becomes ACE 2). The server issues each pilot's id and a session token signed with `TOKEN_SECRET` (HMAC-SHA256, 24 h); the game never chooses an id, so nobody can act as another pilot without their token. The name is a label. There are no accounts or passwords: a pilot is this browser tab's session, and rewards go into this browser's career like every V7 reward.

### Changes to the existing game
The existing game is treated as frozen. Apart from the new files (`src/mp/`, `server/`, the tests and the deployment files) and `tests/playtest.py` now opening the V8 build, these are the only changes, each needed for the mode to exist:

| File | Change | Why it is needed |
|---|---|---|
| `src/ui.js` | one button in the title menu: *Online multiplayer* | the mode has to be selectable from the main menu |
| `src/main.js` | import and create the online controller (2 lines) | the mode needs the game's renderer, scenes, HUD, audio and career |
| `src/main.js` | `case 'mp'` in the menu action switch | routes the online screens' buttons to the online controller |
| `src/main.js` | `back` with `mp`: one condition | Back / Esc on the online screens must also close the server connection |
| `src/main.js` | one line at the top of `handleInput` for online race scenes | an online race cannot be paused: Esc / P / Start open the online menu instead, and ← → switch the watched pilot |
| `build.mjs` | writes `galactic-rush-v8*.html` and `dist/site/` (V7's files are never written), page title V8, the server address from `GR_MP_SERVER` | publishing V8 without touching V7, and configuring the server address |
| `package.json` | scripts `server`, `test:mp` | running the server and the multiplayer tests |

Nothing in physics, handling, collisions, ships, courses, maps, scenery, rendering, effects, audio, cameras, controls, menus, the career or the single-player modes was modified: `diff -r` against V7 shows only the lines above in existing files (`index.html` and all other modules are byte-identical), and V7's tests pass unchanged on the V8 build. The online race reuses the game's `Race` and `RaceView` by wrapping their `step` and `update` methods on the race's own instances at run time; their source files are untouched. The online screens' styles are added by the online code at run time, so the game's stylesheet is unchanged.

### Tests
Everything below was actually run, on this build, on one 2-core Linux machine: Node 22 for the server and the Node tests, headless Chromium with software WebGL (SwiftShader) for the browser tests. **The multiplayer server ran locally for all of them; it is not deployed anywhere, and no test used a public network.** Raw logs, the browser test's report and its screenshots are in the package's `validation/` folder.

| Suite | What it covers | Result |
|---|---|---|
| `npm test` | V7's 59 tests (simulation, geometry, career, upgrade physics, and the scan that finds no payment code, `fetch`, XHR or beacons in `src/`: the online mode's only network use is its WebSocket to the configured server) plus 23 new multiplayer tests: protocol and message checks, server address rules, identity tokens, course selection, rewards, paint validation, interpolation, the race referee (start, every kind of invalid state, strikes, disconnection, inactivity, finish window, late finishes, result order) and the tournament on a fake clock (qualify → final → winner, forfeit, promotion, walkover, no result, never loaded, win on distance), lobbies | **82/82 pass** |
| `npm run test:mp` | the real server on a local port with several real WebSocket clients at once, each flying the game's own race simulation through the game's own connection code: health check; lobbies (create, join by code, wrong codes, unique names, ship and paint changes and ready flags reaching everyone, host-only start, leaving, host hand-over, removal of a lost pilot); seven pilots joining at once never make more than six; a full tournament with three clients (same race and start time for all, every ship reaching every client, the laps and checkpoints others receive for each pilot matching that pilot's own race, traffic measured, results ordered by time, top two qualify, final on another course, eliminated pilot can watch, winner, per-pilot rewards matching the results) and a rematch with a new tournament id; a pilot back within the grace period finishes, one gone longer is out but stays in the lobby and can watch the final; a server restart (same pilot ids, lobby gone, carry on in a new lobby); malformed, unknown, oversized, binary, flooding and silent connections, and a round trip claimed by a client being ignored; cheating clients (early finish claim refused, teleporting removed, never loading left out); two lobbies racing at once without seeing each other; origin check and one connection per pilot | **11/11 pass** in 2.7 min |
| `python3 tests/mp/e2e.py` | three browser games, each in its own browser process, against the real server: the title menu keeps every existing mode and adds Online multiplayer; Online multiplayer connects to the server (signed in with a server-issued pilot id); an invalid pilot name is refused with a message; joining an unknown room code shows the server's answer; creating a lobby shows its room code and the hangar with your ship; two other pilots join with the code (typed in lower case with a dash) and everyone sees all three; a ship change in the lobby reaches the other pilots; only the host has a start button, and it waits until everyone is ready; everyone loads the same race: same course and grid, five laps, the two others as remote ships; the start is synchronised: the three games agree on the server's start time and each says GO on its first frame at that moment; remote ships stream in during the race (states buffered, progress advancing); remote ships are drawn on the other pilots' real paths, a fraction of a second behind (interpolation delay); stage 1 result: positions, names, ships and times; the top two qualify, the third is eliminated; the results screen says who qualified and who is eliminated; the final: a second course, the two qualifiers on the grid; the eliminated pilot watches the final; tournament result: winner and second, both times, the final's course, five laps; the tournament screen names the winner and offers lobby / another tournament / leave; rewards: each career is paid exactly its own tournament reward once, through the career ledger; the winner gets the winner's bonus (500 CR and 3 Style Tokens on top of race rewards); the same tournament result delivered again pays nothing more; the host starts another tournament (new tournament id); a dropped connection reconnects by itself and the pilot races on; Esc opens the online menu and the race keeps running (an online race cannot be paused); leaving from the in-race menu returns to the online screen; the others see that pilot out; the reconnected pilot finished their races; the second tournament pays again, under its own id; Leave multiplayer returns to the main menu and closes the connection; no page errors in any of the three games | **29/29 checks pass** |
| V7 suites on the V8 build | progression phase A (menus, Quick race rewards on every difficulty, championships Rookie → Pro → Ace, upgrades reaching the physics); progression phase B (shop, premium placeholders, paint jobs on the 3D ships, keyboard control, career); playtest flow (title → garage → course → race → results, audio); playtest ghost (time trial and its ghost); playtest champ (championship rounds and points); playtest races (autopilot races on all four courses); settings (every preset and graphics toggle switched at run time) | 31/31<br>17/17<br>pass<br>pass<br>pass<br>pass<br>23/23 |

Details from the browser test:
- the start is synchronised: the three games agree on the server's start time and each says GO on its first frame at that moment: pass. Start estimates within 1 ms of each other; GO times spread 4272 ms. Per game, relative to its start estimate: ALICE: GO +4249 ms (its previous frame -2577 ms), start message received 2985 ms before the start, longest gap between its frames 6826 ms; BOB: GO -22 ms (its previous frame -39 ms), start message received 2487 ms before the start, longest gap between its frames 660 ms; CAROL: GO -7 ms (its previous frame -23 ms), start message received 2926 ms before the start, longest gap between its frames 216 ms.
- remote ships are drawn on the other pilots' real paths, a fraction of a second behind (interpolation delay): pass. Where each game drew the others, against where they really were: ALICE saw BOB 124 ms behind (90% within 140 ms), 0.05 m from the real path (90% within 0.41 m); ALICE saw CAROL 127 ms behind (90% within 147 ms), 0.07 m from the real path (90% within 0.45 m); BOB saw ALICE 125 ms behind (90% within 144 ms), 0.09 m from the real path (90% within 0.48 m); BOB saw CAROL 125 ms behind (90% within 142 ms), 0.07 m from the real path (90% within 0.47 m); CAROL saw ALICE 128 ms behind (90% within 153 ms), 0.08 m from the real path (90% within 0.45 m); CAROL saw BOB 125 ms behind (90% within 144 ms), 0.06 m from the real path (90% within 0.35 m).
- stage 1 result: positions, names, ships and times; the top two qualify, the third is eliminated: pass. CAROL P1 in 3:28.20, BOB P2 in 3:35.25, ALICE did not finish; the first two qualified.
- tournament result: winner and second, both times, the final's course, five laps: pass. BOB won in 3:26.32, CAROL second in 3:32.74.
- rewards: each career is paid exactly its own tournament reward once, through the career ledger: pass. ALICE nothing (no race finished), BOB 1,202 CR and 3 ST, CAROL 702 CR and 1 ST; each paid once through the career ledger.
- the same tournament result delivered again pays nothing more: pass. BOB's result delivered a second time was refused as a duplicate; balance unchanged at 1,202 CR and 3 ST.
- a dropped connection reconnects by itself and the pilot races on: pass. BOB's connection was cut mid-race: reconnecting → reconnecting → online; still in the race, race clock still running.

- Network traffic while racing, measured by the server with three pilots: 2.4 KB/s up and 8.2 KB/s down per pilot (message text; WebSocket framing adds a few bytes per message).
- Integration run: two complete tournaments with three clients in 64 s at 16x race clock (first tournament: qualifier on foundry, final on belt, won by ALPHA).
- Browser test frame rates 6 s into the first qualifier (draw and HUD off, timer-driven frames): ALICE 2.6, BOB 59.8, CAROL 56.9. ALICE's game (the host) had drawn the lobby screenshot in software just before the start and stayed slow during this qualifier on the 2-core machine; the exact cause inside the browser was not pinned down. A slow game says GO late, on its first frame after the start (see the start check above); the server timed and ranked it by its own clock, and the other games' races and the results were not disturbed.

**How the browser test runs the games.** Software WebGL on a 2-core machine cannot draw three games at once: their frames would arrive seconds apart and stall the race clocks (one game alone runs at about 0.5 frames per second with its HUD on). So while racing, the test drives each game's animation frames from a timer and switches off the WebGL draw call and the HUD overlay, from the test, without changing the game; the game's frame loop, race simulation, network code, online bar and screens all run, and the draw and HUD are switched back on for every screenshot. The test timestamps every game frame and the moment each game receives the server's race messages, so the start check can tell a late GO caused by the game's logic (a frame after the start time without GO: fail) from one caused by a game that got no CPU time around the start (it says GO on its next frame; the frame gap is reported). The race clock runs four times faster on the test server (`GR_TIME_SCALE=4`, refused in production) so two tournaments fit in a reasonable time, and the test server's waits are set for the test (3 s start countdown, 45 s between the qualifier result and the final so the result screens can be captured, 60 s inactivity limit while a game draws a screenshot in software). The Node integration tests run the race clock 16 times faster with shortened waits (1.5 s countdown, 4 s reconnection grace, 2.5 s between stages); everything else is the production rule set. What was **not** tested: real devices on separate networks, mobile browsers, a hosted server, and long sessions with many lobbies.


Previous versions: `dist/galactic-rush-v7.html` still has V7's checksum (`e4e925c888aba9abad74b55ba0f7d374`), V5–V7's files in `dist/` were not written by the V8 build, and the published V1–V7 artifacts were not touched (V8 is a new artifact).

### Files
- `src/mp/` — the game side: `protocol.js` (shared messages and validation), `net.js` (connection, clock sync, reconnection), `netrace.js` (online race on the game's own engine), `interp.js` (remote ship interpolation), `sync.js` (state packing), `controller.js` (mode flow), `ui.js` and `style.js` (screens), `config.js` (server address), `identity.js` (name and session), `paint.js` (paint validation), `rewards.js` (shared reward rules).
- `server/` — `index.mjs` (HTTP + WebSocket entry, health check), `hub.mjs`, `lobby.mjs`, `tournament.mjs`, `race.mjs`, `maps.mjs`, `identity.mjs`, `rewards.mjs`, `config.mjs`, `log.mjs`, `package.json`.
- `tests/multiplayer.test.js`, `tests/mp/server.test.mjs`, `tests/mp/bot.mjs` (test client), `tests/mp/serve.mjs` (test server), `tests/mp/e2e.py` (browser end-to-end).
- `.github/workflows/pages.yml` (GitHub Pages), `render.yaml` (Render blueprint for the server), `Dockerfile` and `.dockerignore` (server container), `.gitignore`.

### Limitations
- **Not deployed** (see the status note at the top of this section). The claude.ai artifact cannot connect to any server.
- **One server instance, state in memory.** A server restart ends running lobbies and tournaments; games reconnect as the same pilots, are told their lobby is gone, and keep any reward already paid.
- **Movement is simulated by each player's game** and checked by the server for plausibility; it is not re-simulated on the server. A modified game could still fly with help (an autopilot, say) within what the ship can physically do; the server cannot tell. The official build only allows the test autopilot on local pages. Full authority would need the physics to run on the server.
- **Bumps are one-sided under latency:** you collide with other ships where your game shows them (about 0.1–0.2 s in the past) and only your own ship is pushed.
- **No ion bolts online; pickups are per pilot** (see *Balance*).
- **A page reload takes you out of the current race** (you can still watch and stay in the tournament).
- **Start synchronisation** depends on clock estimation (in the browser test the three games agreed on the start time within 1 ms, on one machine; over the internet expect a few hundredths of a second on a stable connection, worse on a very jittery one) and on the game running: a game that is frozen at the start (a very busy device, say) says GO on its next frame and loses that time, and the server times it by its own clock.
- No accounts, chat, friends list or matchmaking beyond the public lobby list; two to six pilots per lobby.
- Free hosting tiers may sleep when idle (first connection about a minute).
- **Tested on one machine.** The multi-client tests ran real clients (separate browser processes, and Node clients using the game's own code) against a real server, all on one computer. Play between separate devices over the internet, mobile browsers and long sessions with many lobbies were not tested.

## V7: progression, upgrades and customisation

V6 is the baseline. V7 adds a career on top of the existing game: **race → earn Credits → upgrade the ship → unlock cosmetics → paint it → race again.** Courses, collision spheres, handling modes, AI, difficulty settings, the championship format, cameras, controls, graphics settings and every rendering optimisation are unchanged (checked by tests against V6 data, below). There are **no real-money payments of any kind**: no checkout, no payment provider, no card fields, no in-app purchases, no premium-currency sales and no network calls; both currencies are earned only by playing.

### What is new
- **Career profile** saved in the browser: balances, lifetime earnings, races, wins and podiums (overall, per mode, per course, per difficulty), the last 30 races, championship runs and records, unlocked and selected ships, every ship's upgrades and paint job, unlocked cosmetics, milestones.
- **Two currencies.** Credits (CR) for upgrades and some cosmetics; Style Tokens (ST) for cosmetics only. Balances show on the title screen, in the garage (on every tab, including upgrades and the shop), on race results and on championship results, and update the moment a transaction succeeds.
- **Rewards for every completed race**, every time: Quick race (single race), Time trial and each championship round, plus a championship completion bonus.
- **Championship ladder Rookie → Pro → Ace** using the existing difficulty settings, with saved, resumable runs.
- **Upgrades**: Engine, Acceleration, Handling, Boost and Stability, levels 0–5, separately for each of the five ships, applied to the real flight model.
- **Paint shop** on the actual 3D ships: primary, secondary and accent colours (palette, hue, shade, hex), ten patterns, five finishes, special paints, engine-exhaust and contrail effects, with a live preview you can turn, tilt, zoom and compare before applying.
- **Inventory and cosmetic shop**: 35 items with rarity, classification and unlock method; Credits and Style Tokens only; four premium placeholders, permanently locked.
- **Garage** (the hangar) is now the hub: Ship · Upgrades · Paint · Inventory · Shop. **Career** screen with lifetime records.

### Currencies
| | Credits (CR) | Style Tokens (ST) |
|---|---|---|
| Earned from | every completed race and championship | race wins (+1), new course records (+1), championship completion (+2/+3/+5 for Rookie/Pro/Ace) and titles (+1/+2/+3), one-time milestones (first race +2, 10/25/50/100 races +3/+4/+6/+10, first win +2, 10/25 wins +4/+6, 10 podiums +3) |
| Spent on | upgrades; some cosmetics | cosmetics only |
| Bought with money | never | never |

Style Tokens hook into systems the game already had (race results, course records, championships) through one list of reward sources (`TOKEN_SOURCES` and `MILESTONES` in `src/progress/economy.js`); a new source is one entry there.

### Single race reward
**Credits = round(Base × Difficulty × Laps × Placement)**, all values in `src/progress/economy.js`:
- Base 150 CR · Difficulty Rookie 1.0, Pro 1.3, Ace 1.6 · Placement P1 1.25, P2 1.15, P3 1.08, P4 1.0, P5 0.95, P6 0.9 (every finisher is paid).
- Laps (the counts the game offers): 1 lap 0.45, 2 laps 0.75, 3 laps 1.0, 5 laps 1.5. These keep credits per minute nearly flat: longer races pay more in total, short races are not a faster way to farm.
- Time trial (no rivals): 60 CR × laps factor.
- Paid for every completed race, including the same course, difficulty and lap count again: no one-time rewards, no daily caps, no replay reductions. Each started race gets a new random race id; the completion event `race:<id>` is paid once, so reopening results, reloading or re-triggering the event cannot pay twice, and a new race is never confused with an old one. Unfinished races pay nothing.

Examples (3 laps): Rookie P1 188, P6 135 · Pro P3 211 · Ace P1 300.

### Championship reward
Four rounds (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti), the existing points table.
- **Each round:** round(140 × Difficulty × Laps × Placement), the same factors as above (separate table, so the two economies balance independently). A championship round is paid only from this table, never also as a single race.
- **Completion bonus, once per run:** round(Rookie 500 / Pro 800 / Ace 1,200 × Laps).
- **Final-standing bonus:** P1 +40%, P2 +25%, P3 +10% of the completion bonus.
- **Style Tokens:** completion +2/+3/+5, title +1/+2/+3.
- Example, Pro, 3 laps, P3 in every round and P3 overall: 4 × 197 + 800 + 80 = 1,668 CR, against 4 × 211 = 844 CR for four single races.
- **Ladder:** Rookie is open from the start; completing a Rookie championship (all four rounds, any standing) unlocks Pro; completing Pro unlocks Ace, the highest. Quick race and Time trial keep all three difficulties, as before. Locked difficulties show what unlocks them.
- **Runs:** each championship gets a new run id (`champ-…`) and stores difficulty, lap count, ship, round, every round's finishing order, result and credits, and the credits and tokens granted. The completion event `champdone:<run id>` is paid once, so reopening the results, reloading, pressing Continue twice or re-triggering completion cannot pay again; a new run pays in full again. Runs are saved after every round: *Save and exit* on the standings screen, then *Continue championship* on the title screen (also after a reload). A run can be abandoned (no bonus). A run interrupted between its last round and its bonus is finished on the next start, once.
- **Existing saves:** V6 kept no championship results, so there is nothing to migrate; best laps, ghosts and settings are untouched, and the ladder starts at Rookie.

### Economy, calibrated on real race lengths
`node tests/economy.mjs` flies 3-lap races on every course at every difficulty with the autopilot in the actual simulation (relaxed handling): laps take 37–63 s (46 s on average); about 25 s per race go to countdown, finish and menus.

| Difficulty | Laps | Race length (min, incl. overhead) | Single race, P3 (CR) | CR per minute | Championship total, P3 every round and overall (CR) | CR per minute | Championship vs single races |
|---|---|---|---|---|---|---|---|
| Rookie | 1 | 1.2 | 73 | 61 | 520 | 99 | 1.61× |
| Rookie | 2 | 2.0 | 122 | 62 | 865 | 104 | 1.67× |
| Rookie | 3 | 2.7 | 162 | 59 | 1,154 | 101 | 1.70× |
| Rookie | 5 | 4.3 | 243 | 57 | 1,733 | 98 | 1.73× |
| Pro | 1 | 1.2 | 95 | 80 | 748 | 142 | 1.78× |
| Pro | 2 | 2.0 | 158 | 81 | 1,248 | 150 | 1.86× |
| Pro | 3 | 2.7 | 211 | 77 | 1,668 | 146 | 1.89× |
| Pro | 5 | 4.3 | 316 | 74 | 2,500 | 142 | 1.92× |
| Ace | 1 | 1.2 | 117 | 98 | 1,030 | 196 | 1.99× |
| Ace | 2 | 2.0 | 194 | 99 | 1,714 | 206 | 2.08× |
| Ace | 3 | 2.7 | 259 | 95 | 2,288 | 200 | 2.11× |
| Ace | 5 | 4.3 | 389 | 91 | 3,432 | 195 | 2.14× |

At Pro with an average finish the first upgrade (500 CR) takes about 6 minutes of single races (4 with championships mixed in), one category to level 5 (8,900 CR) about two hours (80 minutes mixed), and a whole ship (44,500 CR) 6–10 hours. Upgrades are an advantage, not a requirement: every course and difficulty can be raced stock.

### Upgrades
Levels 0–5 per category, separately for every ship. Cost per level: **500 / 900 / 1,500 / 2,400 / 3,600 CR** (8,900 CR per category, 44,500 per ship). Level k gives 25 / 48 / 68 / 85 / 100% of the category's full effect (later levels give a little less). Effects are a share of each ship's own stats:

| Category | Full effect at level 5 | Measured at level 5 (`tests/upgrades-physics.test.js`, real flight model) |
|---|---|---|
| Engine | top speed +5% | Kestrel top speed 170.0 → 178.5 m/s (+5.0%); level 1 already +1.25% |
| Acceleration | thrust +15% | Halberd 0–150 m/s in 2.78 → 2.42 s (−13%) |
| Handling | pitch, yaw and roll rates +8%, lateral grip +8% | Lancer heading change in 0.6 s of full yaw 0.67 → 0.72 rad (+8%); sideways speed left after 0.25 s 4.06 → 3.46 m/s (−15%) |
| Boost | boost tank +15%, recharge +20%, boost power +0.04 (×1.42 → ×1.46) | Kestrel boost duration from full 3.32 → 3.82 s (+15%); energy recharged in 3 s 24.0 → 28.8 (+20%); speed after 2.5 s of boost 241.4 → 248.2 m/s (+2.8%) |
| Stability | hull +15%, mass +10% (less damage and knock-back) | Wisp hull lost to one 90 m/s wall hit 40% → 33%; speed change in a head-on bump with a Halberd 56.0 → 54.2 m/s (−3%) |

Pipeline: **base stats** (`src/config.js`, never modified) **+ saved levels → effective stats** (`effectiveDef` in `src/progress/upgrades.js`, rebuilt from the base every time) **→ the existing physics** (the player's ship definition in `Race`; the relaxed-handling scaling is applied on top, as for everyone). Upgrades apply once, never accumulate over restarts, are deterministic, and leave AI pilots, difficulty and the collision sphere alone. Ships keep their character: a maxed Corsair is still slower than a stock Lancer, a maxed Kestrel still turns and accelerates less than a stock Wisp, a maxed Lancer still carries less boost than a stock Halberd.

The Upgrades tab shows each category's level (pips), the effect of the next level (e.g. *Top speed 612 → 620 km/h*), its cost, the balance you would have left, the levels remaining, and a factory-against-current table of every stat. Buying takes two presses (the first arms the button). The button is disabled with a reason when credits are short, at level 5, or if the ship data is invalid.

### Customisation
Each ship has its own paint job, applied by the hull shader on the real 3D model (`M_CUSTOM` in `src/render/gfx.js`):
- **Primary** colour: the main hull paint; patterns are drawn on it.
- **Secondary** colour: engine housings, canopy frames, ventral plates, booms and greebles (and the Wisp's ceramic ring and the Corsair's olive hull), tinted relative to their factory colour so their light and dark parts stay distinct; also the second colour of every pattern.
- **Accent** colour: fins, wing strakes and control surfaces, the race-number band, the engine glow, and pattern pinstripes. It never recolours the whole ship.
- **Patterns** (in the ship's own coordinates, centred on each ship's own spine, anti-aliased and fading to their average with distance): Factory Livery (the V6 centre line), Solid, Racing Stripes, Double Stripes, Chevron, Split Color, Geometric, Hexagonal, Digital Camouflage, Industrial Hazard.
- **Finishes:** Glossy (the factory clear-coated paint), Matte, Metallic (with close-up flake), Brushed Metal, Worn Paint (more chips, grime and patched panels). Reflections are capped by the existing material model, so ships stay readable at speed.
- **Special paints** (replace the primary colour): colour-shift flips, pearls, and self-lit neon paints.
- **Effects:** exhaust colours (engine flames, glow and nozzle light) and contrail colours (including a cycling prism trail), all visible in races.
- **Preview:** the Paint tab edits a draft shown live on the ship in the hangar: drag the ship (or [ and ], or the right stick) to turn and tilt it, wheel or slider to zoom, Front / Side / Rear / Top / 3/4 views, auto-spin, and *Compare with saved*. Locked items can be previewed but not applied. *Apply* saves; leaving the garage or switching ship with unapplied changes asks inline (apply, discard, keep editing).
- The colour pickers are free; patterns, finishes, special paints and effects come from the inventory. Paint never changes gameplay values (tested).

Rendering cost: the stock paint job takes exactly V6's shader path (so stock ships render as before, tested pixel by pixel); a custom paint job adds a few dozen arithmetic operations per ship pixel and no textures, materials, meshes or draw calls. Changing a colour updates uniforms only; the race-number band is redrawn into one texture per ship.

### Inventory and shop
Every item is defined once in `src/progress/catalog.js`: id, name, category, slot, description, rarity (Common, Uncommon, Rare, Epic, Legendary — cosmetic only), classification (Earnable, Special, Event, Premium), unlock method (owned from the start, Credits, Style Tokens, championship, milestone, achievement; events and premium are reserved), cost and currency, and render values. Unlock and equipped status live in the profile.

| Category | Item | Rarity | Class | How to get it |
|---|---|---|---|---|
| Colors | Glacier Pearl | Uncommon | Earnable | 900 CR |
| Colors | Aurora Flip | Rare | Earnable | 1,400 CR |
| Colors | Solar Flip | Rare | Earnable | 1,400 CR |
| Colors | Nebula Pearl | Epic | Earnable | 6 ST |
| Colors | Neon Ion | Epic | Earnable | 8 ST |
| Colors | Neon Ember | Epic | Special | Win a race on every course |
| Colors | Starlane Champion | Legendary | Special | Win the Ace Championship title |
| Patterns | Factory Livery | Common | Earnable | owned from the start |
| Patterns | Solid | Common | Earnable | owned from the start |
| Patterns | Racing Stripes | Common | Earnable | owned from the start |
| Patterns | Double Stripes | Uncommon | Earnable | 600 CR |
| Patterns | Chevron | Uncommon | Earnable | 900 CR |
| Patterns | Split Color | Uncommon | Earnable | 900 CR |
| Patterns | Geometric | Rare | Earnable | 1,800 CR |
| Patterns | Hexagonal | Rare | Earnable | 4 ST |
| Patterns | Digital Camouflage | Epic | Earnable | 7 ST |
| Patterns | Industrial Hazard | Epic | Special | Complete the Rookie Championship |
| Finishes | Glossy | Common | Earnable | owned from the start |
| Finishes | Matte | Common | Earnable | 400 CR |
| Finishes | Metallic | Uncommon | Earnable | 1,200 CR |
| Finishes | Brushed Metal | Rare | Earnable | 5 ST |
| Finishes | Worn Paint | Rare | Special | Complete 25 races |
| Special Effects | Standard Exhaust | Common | Earnable | owned from the start |
| Special Effects | Blue Plasma | Uncommon | Earnable | 700 CR |
| Special Effects | Solar Flare | Rare | Earnable | 3 ST |
| Special Effects | Violet Ion | Epic | Special | Complete the Pro Championship |
| Special Effects | Champion Gold | Legendary | Special | Complete the Ace Championship |
| Special Effects | Standard Contrails | Common | Earnable | owned from the start |
| Special Effects | Neon Contrails | Uncommon | Earnable | 500 CR |
| Special Effects | Ember Contrails | Rare | Earnable | 4 ST |
| Special Effects | Prism Contrails | Legendary | Special | Win 5 races on Ace |
| Premium Cosmetics | Premium Neon Skin | Legendary | Premium | not available (Premium Cosmetic — Coming Soon) |
| Premium Cosmetics | Premium Carbon Skin | Epic | Premium | not available (Premium Cosmetic — Coming Soon) |
| Premium Cosmetics | Premium Plasma Pattern | Epic | Premium | not available (Premium Cosmetic — Coming Soon) |
| Premium Cosmetics | Premium Championship Finish | Legendary | Premium | not available (Premium Cosmetic — Coming Soon) |

- **Inventory tab:** filters by category, rarity and status (unlocked, locked, equipped); each item shows its state, cost or unlock condition, *Preview*, and *Equip* / *Unequip* for the current ship (saved at once).
- **Shop tab:** Colors, Patterns, Finishes, Special Effects and *Premium Cosmetics — Coming Soon*. Select an item to see its cost, its currency, your balance in that currency and what you would have left; *Unlock* then *Confirm* (two presses); the transaction is validated, the currency deducted, the item unlocked, the inventory and balance updated and the profile saved in one step. Owned items cannot be bought again; with too little currency nothing happens and the button says how much is missing.
- **Premium placeholders:** Premium Neon Skin, Premium Carbon Skin, Premium Plasma Pattern, Premium Championship Finish. They are shown locked as *Premium Cosmetic — Coming Soon*, have no price, cannot be bought with Credits or Style Tokens, cannot be equipped or previewed, are never unlocked by progress, carry no gameplay values, and a tampered save cannot grant them (the loader drops them). Clicking one only shows that text. The `premium` and `event` classes exist so a future version could add premium skins, an edition or server-authorised unlocks as a separate extension; none of that is implemented.

### Saves
The career lives in the browser's `localStorage` under `galactic-rush.profile`, next to the existing `galactic-rush.v1` save (settings, best laps, ghosts), which is unchanged. Separate keys mean a damaged career can never take records and ghosts with it, and the other way round.
- **Versioned** (`version: 1`) with a migration chain (a v0, unversioned profile such as the brief's example shape migrates to v1).
- **Validated on load**: balances are whole numbers within limits, upgrade levels 0–5, known ships and items only, equipped items must be unlocked and of the right slot, premium and event items cannot be unlocked, championship unlocks must agree with completion records, run data must be consistent with its finishing orders, statistics consistent (wins ≤ podiums ≤ races). Problems are repaired and listed in the console.
- **Recovery:** the last good profile is copied to `galactic-rush.profile.bak` at start-up; unreadable data is kept in `galactic-rush.profile.damaged` and the backup restored. A profile written by a newer version is left untouched and that session is not saved.
- **Saving:** after every transaction (a reward, purchase, upgrade, paint job, championship step) and shortly after selecting a ship; never per frame (tested: twenty seconds of racing write nothing). If the browser refuses storage the game carries on in memory and says so on the results screen and in the garage.
- No cloud sync. The Settings → Save data copy/paste still covers best laps and ghosts only.

### Transactions
All currency changes go through one function (`transact` in `src/progress/index.js`). It checks the event id (rejecting duplicates), validates currency and amount, checks the balance, applies the reward, upgrade or unlock to a copy of the profile, checks that no balance is negative or out of range, then commits and saves in one step and returns success or a reason. A failure changes nothing. Committed state is frozen, so the UI can read it but cannot write to it. Upgrade buttons send the level they showed and shop purchases refuse owned items, so a double press cannot buy twice.

### New and changed screens
- **Title:** balances, *Continue championship* when a run is saved, *Garage* and *Career*.
- **Garage:** ship switch, five tabs (Ship, Upgrades, Paint, Inventory, Shop), balances, a status line for every action, and the 3D ship. Keyboard: ← → ships, Q / E (or Page Up / Down) tabs, [ ] turn the ship; gamepad: d-pad ships (or a focused slider), LB / RB tabs, right stick turns and tilts; A selects, B goes back. Mouse: drag the ship, wheel to zoom.
- **Results:** reward panel with the formula, Style Token lines, unlocks and the new balance.
- **Championship:** course-select shows the Rookie → Pro → Ace ladder with locks, bonuses and records; standings after each round show this run's results and credits; the final screen shows difficulty, completion status, final standing and points, per-round results and credits, completion and standing bonuses, tokens, the run total, the new balance, the newly unlocked difficulty, and separate career totals.
- **Career:** races, wins, podiums, lifetime earnings, upgrade and cosmetic progress, championship ladder, tables by mode and by course, recent races and championship runs.
- **Long screens** (garage, results, course select, championship, career) keep their action row pinned to the bottom edge when they are taller than the window: *Fly* / *Done* and *Back*, *Apply paint job*, the garage's status line and its unapplied-changes prompt, *Race again*, *Next round* and so on never scroll out of reach.
- **Keyboard flow kept from V6:** choosing a ship for a race opens the garage with *Fly the …* focused, so Title → Enter → Enter → course select works as before (← → still switch ships); the Garage menu opens with its tabs focused.

### Architecture
```
src/progress/economy.js    every reward, multiplier, bonus, token source, milestone, upgrade cost and effect
src/progress/catalog.js    cosmetic items, rarities, classifications, slots, swatches, factory paint per ship
src/progress/profile.js    versioned profile model, migrations, validation and repair
src/progress/store.js      localStorage persistence: load, save, backup, recovery
src/progress/rewards.js    reward calculators (pure functions)
src/progress/upgrades.js   base + levels -> effective stats
src/progress/customize.js  colour helpers; paint job -> hull shader uniforms
src/progress/index.js      the Progression service: transactions, races, championship runs, upgrades, shop, inventory
src/garage.js, src/ui-garage.js   garage, career, reward and championship screens
```
Integration points in existing code: `main.js` (effective stats and paint job into each race, race ids, rewards after the simulation confirms a finish, championship runs), `sim/race.js` (a racer may bring its own effective ship definition; 2 lines), `render/models.js` and `geo.js` (paint-region tags; meshes unchanged), `render/gfx.js` (`M_CUSTOM` in the ship shader only), `render/shipvis.js` (paint job, exhaust and contrail colours), `render/hangar.js` (preview turn, tilt and zoom), `ui.js` (title, results, course select and the pinned action row), `index.html` (styles).

### V7 tests (run on this build)
Everything below ran on the final build (`dist/galactic-rush-v7.html`) in headless Chromium with software rendering (SwiftShader) on a 2-core machine, plus Node for the simulation tests. The raw output of every run is in `validation/logs/` in the package.

- **`npm test`: 59 of 59 pass.**
  - 36 progression tests (`tests/progression.test.js`), following §16 of the brief:
    - *single races:* the formula and its central config; difficulty, laps and placement each raise the reward; last place is paid; the same race replayed pays every time; the same completion event re-processed, reopened or reloaded pays once; race ids are unique and not derived from course, difficulty or laps; no reward without a confirmed finish; time trials.
    - *Style Tokens:* the sources and the milestones.
    - *championships:* the Rookie → Pro → Ace ladder; the round reward table; bonuses scaling with difficulty; a championship worth more than the same races singly, at every difficulty and length; a round paid once and never also as a single race; the bonus paid once per run and again for a new run; progress (and a run in progress) surviving a reload; an interrupted run completed once; abandoning a run; single races staying open.
    - *upgrades:* costs, the level 5 cap and insufficient credits; a double press; effective stats rebuilt from unchanged base stats; upgrades reaching the race once however often it is restarted; persistence and independent ships.
    - *paint jobs:* colours per ship reaching the shader uniforms; patterns and finishes; stock paint being exactly V6's livery; cosmetics never changing gameplay values; locked items being preview-only.
    - *shop:* the right currency; insufficient funds; duplicates; double execution; persistence; no currency mix-ups; special unlocks.
    - *premium and payments:* premium placeholders, and a scan of the whole game for payment code.
    - *saves:* versioning and migration; validation and repair; backup recovery; newer-version and storage-failure handling; no writes while racing; read-only committed state.
    - *regression:* tracks, handling modes, ships, difficulty, championship and AI roster equal V6, and ship meshes equal V6 apart from the paint-region tags (both checked against fixtures taken from V6).
  - 6 upgrade-physics tests (`tests/upgrades-physics.test.js`, measured values in the upgrades table above).
  - V6's 17 simulation, geometry and visibility tests, unchanged.
- **`tests/progression.py` (end to end in the built game): phase A 31 of 31, phase B 17 of 17 pass.** Races are flown by the autopilot and fast-forwarded by the game's own simulation; everything else goes through the real menus and buttons.
  - *Phase A, from an empty career:*
    - a fresh career at 0 CR / 0 ST, with balances on the title and Garage and Career in the menu; Quick race opens the garage.
    - no storage writes while racing.
    - Rookie, Pro and Ace races paying base × difficulty × laps × placement; the results screen showing the reward, its formula and the balance; reopening the results paying nothing; the same course raced again paying again as a new event; credits surviving a reload.
    - only Rookie open at first; Rookie, Pro and Ace championships of four rounds each with their bonus paid once; each completion unlocking the next difficulty and saying so; Ace reported as the highest; the results showing standing, per-race credits, bonus, total and balance; higher difficulty paying more (477 / 684 / 929 CR for these runs); a replayed Rookie championship paying in full again; championship progress surviving a reload.
    - an upgrade armed by the first press and bought by the second for 500 CR, with a stale double press buying nothing; the upgrade reaching the race physics once, with no stacking on restart; AI ships unaffected.
    - no network requests besides the font stylesheet; no console errors.
  - *Phase B, from a mid-game career built by `tests/seedprofile.mjs`:*
    - shop purchases in Credits (Double Stripes, 600 CR) and in Style Tokens (Nebula Pearl, 6 ST), each deducting only its own currency, with a confirmation step and no repeat purchase.
    - the four premium placeholders shown as "Premium Cosmetic — Coming Soon", with no purchase, unlock or currency change, and no payment form anywhere.
    - the paint preview being a draft; a locked pattern being preview-only; Apply saving the job onto the 3D ship (mean pixel change 13.5 in the ship area); the saved job on the player's ship in a race after a reload, with rivals keeping theirs.
    - E switching garage tab and → switching ship.
    - the career screen.
    - no network requests besides the fonts; no console errors.
- **`tests/v6look.py`: 5 of 5.** Each stock ship was rendered in V6 and V7 in the same frozen scene. Kestrel, Wisp, Lancer and Halberd are pixel-identical; the Corsair differs by at most 3/255, with no pixel more than 8 levels apart.
- **`tests/paintsheet.py` (Medium preset): 28 of 28 checks pass.** Each of the nine patterns changes the ship by 3.7–7.8 (mean pixel difference in the ship area, 0–255) against Solid, and each finish by 3.5–8.5 against Glossy. On every ship, the primary, secondary and accent colours each change the ship (2.4–15.8). For scale, two shots of the same stock ship at the start of the run differ by 2.2. Sheets: `validation/sheet-*.jpg`.
- **`tests/screens.py`:** 16 screenshots of the new screens from the seeded career (`validation/screens/`), with no console errors.
- **`tests/playtest.py`:**
  - *menu flow:* one Enter on the title opens the garage for a quick race; → switches ship; Enter flies it to course select; launch works; Space skips the flyover; Esc pauses and freezes the simulation; settings open; resume restarts the simulation; C cycles the camera; audio keeps running; no console errors.
  - *championship:* two rounds with points carried over; no console errors.
  - *V1 ghost:* a lap recorded in V1 (36.9 s) loads in V7 (737 frames) and is drawn in a Classic-handling time trial; no console errors.
  - *AI races:* autopilot races on all four courses (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti) reach the results screen, with no console errors (Low preset).
- **`tests/settings.py`: 23 of 23 steps pass.** These steps were all switched during a race: Medium, High, Ultra, Low and High again; then shadows, ambient occlusion, light shafts, speed blur, film grain, chromatic aberration and lens flare off and on; resolution scale 0.5 and 1; field of view 95 and 72. The renderer follows every change, with no WebGL or page errors. Level-of-detail scale and dust-cloud cap are Low 1.7× and 45, Medium 1.25× and 90, High 1× and 120, Ultra 0.85× and 160. Hero facade relief shows on 4 buildings at Medium, 14 at High and Ultra, and none at Low. All of this matches V6.
- **`tests/vis.py`: 5 of 5 pass, with V6's figures.**
  - *Occlusion:* all 2,435 buildings that occlusion hid over 14 Neon Spire views were confirmed hidden by 65,745 independent ray casts.
  - *LOD hysteresis:* a 348 m tower switches out at 1.15× its threshold distance and back at 0.85×.
  - *LOD bias:* 0 and 100 put all 953 drawn buildings on the detailed and on the lite level.
  - *Capital ships:* the three-level cross-fade follows projected size.
  - *Culling:* of 3,732 building, highway, pillar and plaza instances, 1,322 are drawn on average (702–2,046), as in V6.
- **`tests/handsoff.py`** (no input for 40 s of race time on each course): Relaxed handling keeps 62–77% hull and Classic 0–56%, as in V6.
- **`node tests/economy.mjs`:** 3-lap autopilot races on every course at every difficulty in the real simulation. The average lap is 46.3 s (37.4–62.9 s by course). The economy table and the upgrade pacing above come from this run. At Pro with an average finish, the first upgrade takes 6 min of single races or 4 min mixed; one category takes 115 or 77 min; a whole ship takes 9.6 or 6.4 h.
- **`tests/compare.py`, V6 against V7:** the 18 matched course views of V6's comparison set were rendered in both builds from the same camera, on the High preset. They cover all four courses, the capital ships, the planets and the skies. Four of them were also rendered twice in V6 as a baseline.
  - *The differences are frame-to-frame noise.* V6 against V7 differs by a mean of 2.1–3.5 (0–255) per view, the same as V6 against itself (2.1–3.6). The difference comes from film grain, and from animated traffic, lasers and sparks caught at slightly different moments.
  - *Cinder Belt asteroids:* the obstacle rocks also sit at different angles. They keep turning in real time while the harness freezes the race, so their pose depends on how long the first frames took. At load, all 198 Cinder Belt objects have identical positions and orientations in V6 and V7.
  - Sheets: `validation/compare-v6-v7.jpg` and `validation/noise-v6-v6.jpg`.
- **Not run for V7:** the course-view benchmark `tests/fixedbench.py` (see the performance section).

### V7 performance (software rendering; V6 against V7 on the same machine)
The garage, shop and career screens are page elements over the hangar scene the game already had. During a race, the only new work is the player's paint job in the ship shader. Career data is saved after transactions and never per frame (tested).

`tests/shipbench.py` times the one case that changed. The scene is Foundry Trench with the race frozen on the grid, seen two ways: the chase camera, and a close-up where the player's Kestrel fills the screen. Three builds are compared: V6, V7 with a stock ship, and V7 with the heaviest paint job (Hexagonal pattern, Metallic finish, Aurora Flip colour-shift paint, plasma exhaust, neon contrails). The run used headless Chromium with SwiftShader on a 2-core machine at 960×540 (Low renders at 720×405). Each view got 3 settling frames and 10 timed frames, each frame ending with a 1-pixel `readPixels`. Raw rows: `validation/logs/shipbench.json`.

| Preset, view | V6 median (ms) | V7 stock (ms) | V7 custom paint job (ms) | Draw calls, all three |
|---|---|---|---|---|
| High, chase camera | 2,840 | 2,588 (0.91×) | 2,565 (0.90×) | 117 |
| High, close-up | 2,807 | 2,837 (1.01×) | 2,758 (0.98×) | 105 |
| Low, chase camera | 1,010 | 975 (0.97×) | 991 (0.98×) | 117 |
| Low, close-up | 1,110 | 1,156 (1.04×) | 1,222 (1.10×) | 106 |

- **Draw calls are the same in all three builds.** A paint job adds no meshes, materials, textures or draw calls.
- **The differences are within this machine's run-to-run variation** of about ±5–10% per view. The 0.90–0.91× at High is that variation, not a speed-up: V7 does not change course rendering. The largest increase is the custom paint job at Low with the ship filling the screen (+10% against V6, +6% against V7 stock), where every ship pixel runs the paint-job code.
- **The course-view benchmark (`tests/fixedbench.py`) was not re-run.** Course and world rendering are V6's. Outside the ship shader, the shared hull-material code takes V6's values as constants when no paint job is compiled in, and each draw call checks once for paint uniforms, which the course shaders do not have. The 18 matched course views render as in V6 (see the tests above). Culling, occlusion, level of detail and every graphics setting were re-checked on this build with `tests/vis.py` and `tests/settings.py`. Nothing was measured on a graphics card.

### Known limitations (V7)
- **Career data stays in one browser.** It lives in that browser's storage, and each published artifact has its own storage, so a V7 career does not follow you to another browser, device or artifact. There is no cloud sync, and Settings → Save data still copies best laps and ghosts only.
- **The economy is calibrated on autopilot laps** (skill 0.8, relaxed handling). Real players will be faster or slower, so the per-minute figures above are estimates for an average finish.
- **Upgrades are an edge over an unchanged AI field.** Difficulty settings were deliberately not rebalanced, so a well-upgraded ship makes Rookie and Pro noticeably easier; Ace remains the strongest field.
- **Records do not know about upgrades.** A time-trial course record or ghost set with an upgraded ship stands as the course record; records and ghosts are only comparable between stock ships.
- **Patterns are procedural, drawn in each ship's own coordinates.** Geometric, Hexagonal, Digital Camouflage and the hazard bands switch projection plane where a surface turns past about 45°, which can show a seam; stripes sit on upward- and downward-facing panels and end where the hull turns vertical. Patterns cover the primary paint only (not trims, accent fins or the canopy), so on the Wisp and Corsair, whose primary paint is the main pod or hull, they cover less of the ship.
- **Secondary colour is a tint.** It recolours trims relative to their factory colour to keep their light and dark parts distinct, so a white secondary turns the darkest trims mid-grey rather than white. With any custom paint job the Lancer and Halberd drop their navy grey cast, and the independents' grey patch panels appear only with Worn Paint.
- **Fixed race number.** The player's number (1) and sponsor mark are not customisable; only the band behind them follows the accent colour.
- **Premium placeholders have no visuals** and cannot be previewed; the Event classification is reserved, with no event items in this version.
- **A championship run keeps the ship it started with.** To race a run with another ship, abandon it and start a new one.
- **The developer switch `autotest=1`** (the autopilot flies your ship; used by the automated tests) pays rewards like any race. The published artifact ignores query strings, so it is not reachable there.
- **Preview layout.** The 3D preview shares the screen with the garage panel; on narrow or portrait screens the ship sits behind the panel and the drag area is off (the view buttons, [ ] and the right stick still turn it).
- **Software rendering only.** All rendering checks and timings here ran in headless Chromium with SwiftShader on a 2-core machine; nothing was measured on a graphics card. In that harness a garage click takes a second or two to redraw, because every frame is drawn on the CPU.

## What changed from V1

**Renderer.** A rebuilt WebGL2 renderer: half-float HDR targets with ACES tone mapping and per-course exposure and grade; metal/roughness PBR with image-based lighting prefiltered from each course's own sky; a sun shadow map fitted around the player with texel snapping; MSAA; HDR bloom that only catches emissives and the star; screen-space ambient occlusion; light shafts; speed blur, chromatic aberration, heat haze, film grain and vignette in the final pass; soft depth-faded particles with a screen-size cap; frustum and distance culling; instancing with level of detail for rocks and towers.

**Ships.** Five new hard-surface models (5.4k–8.6k triangles) that keep V1's silhouettes and colours: bevelled hulls, intakes, greebles, antennae, layered engine nozzles, glass canopies. Each now fits inside its 2.2 m collision sphere (+5%), so hits look fair. Procedural panel seams, rivets, grime, edge wear and clearcoat; per-pilot liveries with race numbers and callsigns; blinking nav lights; animated control surfaces; afterburner cones with shock diamonds and heat haze; wingtip vapour when drifting; a hex-pattern shield bubble; ion-stun arcs; scorch, smoke, sparks and a stuttering engine when damaged.

**Courses** (same geometry, new art):
- *Foundry Trench*: machinery walls flush with the collision planes, grated floor over molten slag that lights the ship from below, rim decks, catwalks, sparks raining off hazard-striped girders, armoured laser emitters with warning strobes, kilometre-scale smelter stacks and cooling towers venting smoke, haulers and a carrier overhead.
- *Cinder Belt*: smooth rocks with crater and strata shading that never exceed their collision radius, a 2,600-rock background field with level of detail, dust and ice halos, mining rigs with shuttling haulers, a carrier and a distant skirmish.
- *Neon Spire*: setback towers with window facades that fade cleanly with distance, ledges, rooftop beacons, holo boards in an invented script, skyway traffic streams, haze, hover-pod traffic sized to its collision sphere, tunnels with a travelling light pulse, an orbital ring.
- *Halo of Vashti*: an animated banded gas giant with atmospheric scattering and a shadowed ring system, a ring-particle slab around the racing line, tumbling wreckage, a fleet at anchor with lit hangar bays, burning hulks and a distant fleet skirmish.
- Physical checkpoint gates with holo numerals, a start gantry with countdown lamps, and a hex energy field on every open corridor wall that appears as you approach and ripples where you hit.

**Effects and camera.** Fireballs, rolling smoke, burning debris with smoke trails, shockwave rings and light flashes on explosions; sparks on impacts; ion bolts with a white-hot core, magenta glow and real light; pickup bursts; speed streaks and a boost tunnel. Spring-arm chase camera with lag, look-ahead and bank roll; FOV kick on boost; trauma-based shake with a punch on big hits; slow-motion finish with an orbit camera; a modelled cockpit with live instruments; gamepad with deadzones and rumble.

**HUD and front end.** A holographic HUD on translucent backplates (readable over any scene): animated readouts, standings, world-space rival markers with gaps, an ion lock-on reticle, incoming-bolt warnings, damage-direction arcs, animated final-lap and wrong-way banners, minimap. A loading screen with real progress and shader warm-up; a broadcast-style attract race behind the title; a dedicated hangar with turntable, reflective floor, haze and three-point lighting; course select with live previews and maps; a skippable course flyover before the grid; podium results.

**Audio.** Layered engine (sub rumble, speed-tied turbine whine, afterburner roar with crackle), Doppler flybys, generated reverbs for the trench, tunnels, city and hangar, sub-bass impacts, music ducking, and an original adaptive score that builds from menu to race to final lap to finish.

**Settings.** Presets Low/Medium/High/Ultra (auto-picked on first run) with toggles for shadows, ambient occlusion, light shafts, speed blur, film grain and chromatic aberration; resolution scale and dynamic resolution; field of view; camera shake; HUD scale; reduced motion; FPS counter; gamepad sensitivity and rumble; all V1 settings; save export/import.

**V1 bugs fixed.** Enter on the title no longer skips ship select; the hangar has controlled lighting; HDR tone mapping and screen-size caps prevent white-outs; facades no longer shimmer; HUD text sits on backplates; the logo scales to fit with any font.

## V6: visual quality and performance

V5 is the baseline. The racecourses, collision shapes and sizes, flight model, handling, stats and the five spacecraft's silhouettes are unchanged; everything below is rendering and world detail, built in code like the rest of the game.

### The two V5 slowdowns, measured properly (and a correction to V5)
V5 was slower than V4 in two benchmark views: Halo of Vashti's ring plane and the Cinder Belt field overview. V5's README blamed the ring plane on the soft dust sheets ("more than half of the frame"). That was wrong. V5's benchmark timed frames with unsynchronised `requestAnimationFrame` deltas, which in software rendering can charge one frame's GPU work to the next one. V6 ends every timed frame with a 1-pixel `readPixels`, so each sample covers its own frame (`tests/fixedbench.py`, `tests/perfprobe.py`). Measured that way, switching V5's dust sheets off saved about 0.17 s of a 3.6–3.8 s frame. The real costs in that view were the planetary ring (about 0.4 s: three value-noise evaluations per pixel over much of the screen), the sky and planet shaders (dozens of hashed noise octaves per pixel) and the ring rocks. In the Cinder Belt overview it was the V5 rock material, about a dozen noise octaves per pixel on rocks that fill the screen.

What V6 did about it:
- **Shared noise volume.** A 64³ tiling noise texture (two fBm scales, cellular distance and ridged noise in its four channels) is rendered on the GPU at start-up and mip-mapped. Rocks, sky, planets and dust clouds read it with a few filtered fetches where V5 evaluated hashed octaves per pixel, and mip-mapping band-limits it for free. On rocks the fetches form an octave chain (each about four times finer than the last): a fetch's relief fades out once its texels are magnified past about 2.5 pixels, where trilinear filtering would shade as facets, while the next finer fetch fades in as its own texels reach a pixel, so some fetch near one to two pixels per texel always carries the surface. The two finest fetches are taken only close up.
- **Dust clouds, kept and made cheap.** The ring-plane dust is now about a hundred large soft clouds, each eaten out of its own region of the noise volume (no two alike), drawn with one fetch per pixel into a quarter-resolution target and composited once (drawing them at full resolution against the depth buffer measured slower in the ring-plane view). Clouds fade out when the camera is inside or right next to them and softly where they meet geometry. Cinder Belt's dust halos use the same pass. The Low and Medium presets shorten the dust reach and cap the cloud count.
- **Planetary rings in one fetch.** Each ring's radial profile (opacity and colour of every ringlet and gap) is a 2,048-texel texture built once from the course seed; the ring shader is one mip-mapped fetch, which also stops fine ringlets from shimmering edge-on.
- **Rocks:** two volume fetches replace V5's octave stacks; see *Asteroids*.
- **Planet surfaces baked once.** Each world's surface (colour and relief, plus a second map with clouds or night-side glow) is computed once at load into cube maps (512–1,024 texels per face) by the same shader functions that used to run per pixel every frame. At run time the planet shader reads them with a rotated lookup: the gas giant's bands still shear at their own speeds by latitude and clouds and haze still drift, but each planet pixel costs one or two cube-map fetches where V5 evaluated stacks of hashed noise octaves. Detail finer than the cube holds comes from one extra noise fetch that fades out with magnification.
- **Sky.** The nebulae, dust and galactic band (static per course) are baked once into a 512-per-face half-float cube map; the sky pass reads one texel and adds the stars and the sun on top.

### Asteroids (`src/render/geo.js` polytope builder, `courses/belt.js`, rock shader in `gfx.js`)
- **Silhouettes from fracture, not from noise.** Rocks are now built as convex polytopes: the intersection of 15–26 half-spaces with family-specific spread, plus fresh fracture planes. Each face is tessellated by level of detail, then eroded radially (rounded corners and edges, a slight bulge), cratered (craters carved into the mesh with raised rims) and, for layered rock, given strata ledges. Normals are merged below a per-family crease angle, so faces stay crisp where they meet and soft where they wear. Fresh fracture faces are flagged per vertex and shaded as newly broken rock.
- **Five families keep their character.** Ancient cratered (many faces, low crease angle, worn), fractured (more and sharper planes, fresh faces), icy (smooth planes, clean fracture faces), metallic (few large sheared faces, high crease angle), layered (strata ledges along one axis).
- **Shading.** Two fetches of the noise volume per pixel carry the geology: crater fields that gather in regions instead of one per noise cell, metal deposits and veins, ice bands and fractures, strata. Veins and ice fractures are thin lines along contours of the smooth noise fields, widened by their own screen-space derivative so they stay anti-aliased and fade where they would be thinner than a pixel (thresholding the ridged channel near its peaks, as an earlier V6 build did, drew its texels as small squares). Close up, finer fetches add grain and relief, and the ancient family's craters come from an analytic crater field (two sizes, bowls about a fifth as deep as they are wide, soft raised rims), so a rock that fills the screen is still detailed instead of blurred or faceted. Metallic rock shows dull, hammered metal in deposits and veins rather than chrome.
- **Unchanged for gameplay.** Every gameplay rock stays within 0.93–1.05 of its collision radius at every level of detail (`npm test` checks it); the corridor and collision spheres are untouched. The seven Cinder Belt landmarks keep their places, pieces and proportions. Levels of detail: five subdivision levels selected by projected size; the lower levels are coarser tessellations of the same polytope, so the outline holds across a switch.

### Neon Spire: curved and industrial facades (`courses/citygen.js`, facade shader in `gfx.js`)
- **Curved facades are real facades now.** Needles, cooling towers, domed halls and arcologies are lathed shapes; in V5 they carried the box-facade pattern projected flat. Their facade variants map windows around the circumference: the column count is rounded so whole bays wrap the tower, floor bands follow the profile as it tapers or steps, and each instance's own radius sets the bay width.
- **Curved relief on hero buildings:** needle towers get ring ledges every few floors with mullion fins between them and deeper mechanical-floor bands; arcology tiers get ring ledges; domed halls get piers and a cornice round the drum; cooling towers get 48 vertical ribs, a cornice and base bracing (and no windows). Factories and power plants gained industrial relief (cladding seams, ledges, fins). The hero selection now includes these buildings when they stand near the course.
- **Better windows everywhere:** a mechanical floor (louvres, no windows) every sixteenth floor, offset per building; blinds at varied heights in some lit offices; curtain walls light whole open-plan bays.
- **All 26 archetypes reviewed:** the four lathed types (needle, cooling, dome, arcology) gained curved facades and curved relief; factory and power gained industrial relief; every windowed type gained mechanical floors and blinds; lite levels still keep every full level's silhouette box (`npm test`).

### Capital ships (`src/render/capital.js`, `props.js`)
- **Bastion** (the V5 carrier) keeps its design: stepped plate hull, terraced spine and command deck, sponsons with recessed hangar bays, clustered engines.
- **Warden** (new, escort cruiser): a long hexagonal hull with a forked bow and a slot between the prongs, a command ring carried on four pylons round the hull, a stacked citadel, keel blades, a six-nozzle engine block with two outboard pods, layered armour and dark seams.
- **Atlas** (new, fleet tender): an open lattice spine with five racks of corrugated cargo containers, a tank cluster, a habitat bow with a bridge band, two cargo cranes and an engine block on cross-braced pylons with radiator fins.
- **Hangar lighting without dynamic lights.** Each Bastion bay is lit by its own fixtures (ceiling strips, door and gallery lights, lip emitters). Their light is baked per vertex when the ship is built: distance falloff, each fixture's facing and beam, and shadow rays against the parked craft, cargo and gantry. A second bake measures how much of its sky each interior point sees through the bay mouth, and the shader scales sun and sky light by it, so the interior reads as shadowed and lit by its own fixtures instead of glowing. The deck carries painted taxi lines and pad outlines, the back wall ribs, the ceiling beams. Cost per frame: none beyond the vertices; no dynamic lights were added.
- **Turrets and cranes move.** Turret heads (14 on the Bastion, 14 on the Warden including four on its ring) are one instanced draw per ship; they sweep slowly within their arcs and lift their barrels in bursts. The Atlas's cranes swing. Animation runs only while the full level is shown.
- **Three levels per class** (full, lite, far), cross-faded with complementary dither by projected size (the 87,000-triangle full Bastion is drawn only while it spans several hundred pixels; at a typical field of view the 14,000-triangle lite level takes over beyond about a kilometre); `npm test` checks that every level keeps the full level's silhouette box and is lighter than the one before. The fleet at Halo of Vashti is one Bastion, one Warden and one Atlas; the Bastion also crosses Foundry Trench, the Warden Neon Spire and the Atlas Cinder Belt.

### Planets (`PLANET_FS`, `RING_FS` in `gfx.js`, `planetItems` in `courses/common.js`)
- **Atmospheres that are brightest at the surface.** One model for the body and the halo: optical depth along the actual view ray through an exponential atmosphere (per-world scale height and density), lit where the ray meets sunlight, with a phase function that brightens toward the sun and reddens at low sun. The halo beyond the limb is brightest at the surface and fades within a few scale heights; it never glows on the night side and has no outer edge. V5's shell was brightest at its outer edge, which read as a glowing outline.
- **Clouds (Cinder Belt's rocky world):** a weather layer that floats above the ground (it shifts against the surface toward the limb), with three mid-latitude cyclones whose spirals the cloud field is wound round, wet and dry latitude belts, fine edge detail, cloud tops lit by their own relief and shadows cast on the ground along the sun direction (long near the terminator).
- **Gas giant (Halo of Vashti):** bands that shear at their own speeds, turbulent edges and filaments, small white ovals in two belts and a great storm with a pale collar that the surrounding turbulence wraps round, limb darkening, a thin warm limb haze, and the ring's shadow across the disc.
- **Icy moon (Neon Spire):** bright ice with dust-stained provinces, ridged plains (sets of fine parallel ridges whose direction turns from region to region) and patches of chaos terrain (plates of the older ridged plains, broken apart, shifted and turned in a darker hummocky matrix: packed with thin cracks at a patch's margins, drifted apart or melted away toward its centre), crossed by 28 reddish-brown lineae and 36 finer, shorter fractures that run along parts of great and small circles, from hairlines to broad bands, swelling and pinching along their length, splaying into branches at their tips, some scalloped like cycloidal ridges; broad bands have paler centres; younger lineae cut older ones; ridges and troughs are lit by the sun. Lines thinner than a pixel fade instead of drawing uniform hairlines. The relief is stored at four times the precision of the other worlds' (eight bits were too coarse for it), and relief a pixel or two wide never shades darker than half the smooth sphere, so the terminator does not speckle.
- **Volcanic haze world (Foundry Trench):** zonal haze decks with convective cells, dense limb haze, hot spots glowing through on the night side.
- **Rings** take the planet's shadow (with a soft edge), shadow the planet in turn, look darker and show only their thin parts glowing when seen from the unlit side, brighten with forward scattering when backlit, and grow more opaque at grazing angles.
- **Seen from inside an atmosphere** (Neon Spire's moon in the dusk sky), the sky's own light is added in front of the moon and its ring, so the moon's night side takes the sky colour instead of cutting a black disc out of it.
- **Draw order:** planet halos and rings now go down before the dust-cloud pass, so nearby clouds veil them.

### Spacecraft materials (`M_HULL` in `gfx.js`)
The five ships keep their geometry, collision fit, stats and handling. Their hull material gained inset access hatches with corner fasteners in some panels, small stencilled marks on upper surfaces (independent pilots), and grime swept back along the hull from seams and edges (lighter on the clean navy ships). Canopies gained a coated look (warm at grazing angles), a centre spine and frame ribs, and faint instrument lights inside.

### Lighting and materials review
- **Kept from V5:** inverse-transpose normals for stretched instances (the glare fix), the analytic-only sun (no sun disc in the lighting cubemap), facade pane-by-pane specular, the neutral Neon Spire palette, height fog and the per-course grades.
- **Fixed (present in V5):** relief (bump mapping) on rocks, ship hulls, capital-ship plating and cargo containers was computed from object-space positions against a world-space normal, so on any rotated object (every spinning rock, every ship not flying along a world axis) it tilted the wrong way and, on rocks, broke up into dark blocks; it now uses world-oriented positions at object scale. Panel seams, hatches and window rows on hulls and capital ships likewise chose their projection plane from the world normal and were stretched on rotated ships; they now use the object-space normal. Rock relief is also slope-limited and features only a pixel or two wide keep their colour but drop their relief, so small and distant rocks no longer shade as blocks of 2×2 pixels.
- **Changed:** hangar interiors take sun and sky light only as far as their baked openness lets it in; planets and rings seen through Neon Spire's air take the sky's light in front of them; rings are darker from their unlit side; metallic rock is dull, hammered metal instead of chrome; the Atlas's containers are corrugated, faded and rusted instead of flat colour; planet halos and rings sit behind the dust clouds instead of on top of them.

### Presets
Every preset now also sets the level-of-detail scale and the dust pass: Low switches levels 1.7× nearer, reaches dust clouds at 60% of the course's range and draws at most 45; Medium 1.25×, 85%, 90; High 1×, 100%, 120; Ultra 0.85×, 110%, 160. As before, Low also renders at 75% resolution without MSAA, shadows, ambient occlusion or light shafts. Presets and toggles still switch during a race (`tests/settings.py`).

### Tests and tools added in V6
- `npm test` adds a capital-ship check (17 tests): each class keeps its full silhouette box at all three levels, and each level is lighter than the one before.
- `tests/vis.py` checks the three-level capital cross-fade (full, full+lite, lite, lite+far, far by projected size).
- `tests/compare.py A.html B.html SPEC.json OUT.png`: the same views rendered in two builds, side by side. Specs: `matched-v6.json`, `asteroids-v6.json`, `capital-v6.json`, `planets-v6.json`, `city-v6.json`, `ships-v6.json`.
- `tests/perfprobe.py`: synchronised timing of single views, for finding where frame time goes.
- `tests/fixedbench.py` now synchronises every timed frame, times 8 frames per view, writes rows as they finish (resumable) and covers the two V5 outlier views first, on High and Low.

### V6 tests (run on this build in headless Chromium with software rendering)
- `npm test`: **17 of 17 pass**: the 11 simulation tests (flight model, steering and drift, checkpoints and laps, wall and obstacle collisions, AI races of three laps on all four courses, reset and determinism, championship points), the 5 V5 geometry and visibility tests (gameplay rocks inside 0.93–1.05 of their collision radius at every level of detail, lite building levels and the lite carrier keeping the full silhouette, hero relief staying on its facades, software occlusion) and the V6 capital test (each class keeps its silhouette box at all three levels, each level lighter than the one before).
- `tests/vis.py`: **5 of 5 pass**. Occlusion re-check over 14 views along Neon Spire: all 2,435 buildings the system hid were confirmed hidden by 65,745 independent ray casts. LOD hysteresis: a 348 m tower switches out at 1.15× and back at 0.85× its threshold distance. LOD bias 0 and 100 put all 953 drawn buildings on the detailed and on the lite level. Capital three-level cross-fade by projected size: full only at 600 px, full and lite at 375 px, lite only at 180 px, lite and far at 77 px, far only at 25 px.
- Culling on those 14 views: of 3,732 building, highway, pillar and plaza instances, 1,322 are drawn on average (702–2,046); the frustum removes 60%, and occlusion removes on average 12% of what is left in the frustum (1–30%) — unchanged from V5.
- Autopilot races on all four courses (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti) reach the results screen with **no console errors** (`tests/playtest.py races`, Low preset).
- Menu flow passes: one Enter on the title opens ship select, ships can be browsed, track select and launch work, Space skips the flyover, Esc pauses and freezes the simulation, the settings screen opens, resume restarts the simulation, C cycles the camera, and the audio keeps running; no console errors.
- Time trial with a V1 ghost: a lap recorded in V1 (37.1 s) loads in V6 (742 frames) and the ghost is drawn in a Classic-handling time trial on Cinder Belt; no console errors.
- Championship: two rounds with points carried over between them; no console errors.
- `tests/handsoff.py` (Relaxed and Classic handling with no input for 40 s on each course): Relaxed keeps 62–77% hull, Classic 0–56%, the same as V4 and V5.
- `tests/settings.py`: **23 of 23 steps pass**. Medium, High, Ultra, Low and High again, then shadows, ambient occlusion, light shafts, speed blur, film grain, chromatic aberration and lens flare off and on, resolution scale 0.5 and 1, and field of view 95 and 72, all switched during a race. The renderer follows every change (including the V6 level-of-detail scale and dust-cloud cap: Low 1.7× and 45, Medium 1.25× and 90, High 1× and 120, Ultra 0.85× and 160) with no WebGL or page errors and no blank frame; hero facade relief shows on 4 nearby buildings at Medium, 14 at High and Ultra and none at Low.
- `tests/fixedbench.py`: see the performance section below.
- Comparison sheets in `validation/` were rendered from this build against the V5 build with identical cameras and frozen race states: 18 matched views, 21 asteroid views, 23 capital-ship views, 16 planet views, 19 Neon Spire views and 10 spacecraft views, plus a V6 spacecraft silhouette sheet.

### V6 performance (software rendering; V5 against V6 on the same machine)
`tests/fixedbench.py` on the final builds: headless Chromium with SwiftShader (software rendering) on a 2-core machine, 960×540 viewport (Low renders at 75%, 720×405), fixed preset, race frozen on the grid, identical track-relative cameras in both builds, 3 settling frames and then 8 timed frames per view, each ending with a 1-pixel `readPixels` so that it covers its own frame's work. With eight frames, the 95th percentile is the slowest frame. These numbers compare the builds on this machine only; nothing was measured on a graphics card. Raw rows: `validation/logs/fixedbench.json`.

| Course, preset, view (camera position) | Render size | V5 avg / median / p95 (ms) | V6 avg / median / p95 (ms) | V6 / V5 | V5 → V6 fps | V5 → V6 draw calls | V5 → V6 triangles | V6 dust clouds |
|---|---|---|---|---|---|---|---|---|
| Halo of Vashti, High, ring plane **(V5 outlier: dust clouds)** (-1211, 167, 1835) | 960×540 | 2,430 / 2,369 / 2,699 | 1,763 / 1,751 / 1,953 | 0.73× | 0.41 → 0.57 | 56 → 57 | 185 k → 153 k | 21 |
| Halo of Vashti, High, along the course, high (-187, 191, 1825) | 960×540 | 2,568 / 2,570 / 2,678 | 1,946 / 1,935 / 2,067 | 0.76× | 0.39 → 0.51 | 75 → 72 | 153 k → 172 k | 23 |
| Cinder Belt, High, field overview **(V5 outlier: asteroid shading)** (-923, 194, 259) | 960×540 | 4,574 / 4,538 / 4,874 | 3,861 / 3,863 / 4,131 | 0.84× | 0.22 → 0.26 | 91 → 91 | 220 k → 253 k | 83 |
| Cinder Belt, High, racing line (-743, 105, 1352) | 960×540 | 8,806 / 8,977 / 9,550 | 6,907 / 6,904 / 7,053 | 0.78× | 0.11 → 0.14 | 188 → 188 | 424 k → 515 k | 120 |
| Neon Spire, High, start skyline (-2, 46, 214) | 960×540 | 11,004 / 11,140 / 11,325 | 11,086 / 11,136 / 12,024 | 1.01× | 0.09 → 0.09 | 337 → 337 | 400 k → 417 k | 0 |
| Neon Spire, High, mid-course (-632, -122, 675) | 960×540 | 13,027 / 13,017 / 13,753 | 13,915 / 14,020 / 14,670 | 1.07× | 0.08 → 0.07 | 357 → 357 | 477 k → 476 k | 0 |
| Neon Spire, High, aerial (-163, 427, 802) | 960×540 | 12,310 / 12,252 / 13,450 | 12,501 / 12,426 / 13,347 | 1.02× | 0.08 → 0.08 | 353 → 354 | 467 k → 503 k | 0 |
| Foundry Trench, High, in the trench (-1050, -4, 1140) | 960×540 | 4,576 / 4,592 / 4,699 | 4,207 / 4,194 / 4,506 | 0.92× | 0.22 → 0.24 | 149 → 149 | 433 k → 433 k | 0 |
| Foundry Trench, High, over the rim (-400, 39, 821) | 960×540 | 4,246 / 4,261 / 4,426 | 4,163 / 4,138 / 4,358 | 0.98× | 0.24 → 0.24 | 107 → 107 | 351 k → 351 k | 0 |
| Halo of Vashti, Low, ring plane **(V5 outlier: dust clouds)** (-1211, 167, 1835) | 720×405 | 953 / 959 / 1,031 | 576 / 583 / 628 | 0.60× | 1.05 → 1.74 | 55 → 55 | 124 k → 137 k | 21 |
| Cinder Belt, Low, field overview **(V5 outlier: asteroid shading)** (-923, 194, 259) | 720×405 | 1,596 / 1,607 / 1,713 | 1,134 / 1,108 / 1,334 | 0.71× | 0.63 → 0.88 | 89 → 88 | 206 k → 203 k | 45 |
| Neon Spire, Low, start skyline (-2, 46, 214) | 720×405 | 3,361 / 3,374 / 3,512 | 3,283 / 3,299 / 3,629 | 0.98× | 0.30 → 0.30 | 326 → 325 | 326 k → 323 k | 0 |
| Neon Spire, Low, mid-course (-632, -122, 675) | 720×405 | 4,140 / 4,132 / 4,491 | 3,981 / 3,960 / 4,101 | 0.96× | 0.24 → 0.25 | 349 → 347 | 385 k → 358 k | 0 |

- **Average frame time is lower in V6 in 10 of the 13 views** (geometric mean V6/V5 = 0.86×).
- **The two V5 outliers, by name.** *Halo of Vashti, ring plane (dust clouds):* 2,430 → 1,763 ms at High (0.73×) and 953 → 576 ms at Low (0.60×). *Cinder Belt, field overview (asteroid shading):* 4,574 → 3,861 ms at High (0.84×) and 1,596 → 1,134 ms at Low (0.71×).
- **Against V4** (where these two views were faster than in V5), measured in the same run:

| Course, preset, view | V4 avg / median / p95 (ms) | V5 avg / median / p95 (ms) | V6 avg / median / p95 (ms) | V6 / V5 | V6 / V4 |
|---|---|---|---|---|---|
| Halo of Vashti, High, ring plane (V5 outlier: dust clouds) | 2,262 / 2,237 / 2,428 | 2,430 / 2,369 / 2,699 | 1,763 / 1,751 / 1,953 | 0.73× | 0.78× |
| Halo of Vashti, High, along the course, high | 2,396 / 2,407 / 2,515 | 2,568 / 2,570 / 2,678 | 1,946 / 1,935 / 2,067 | 0.76× | 0.81× |
| Cinder Belt, High, field overview (V5 outlier: asteroid shading) | 3,448 / 3,394 / 3,704 | 4,574 / 4,538 / 4,874 | 3,861 / 3,863 / 4,131 | 0.84× | 1.12× |
| Cinder Belt, High, racing line | 6,495 / 6,522 / 6,818 | 8,806 / 8,977 / 9,550 | 6,907 / 6,904 / 7,053 | 0.78× | 1.06× |
| Halo of Vashti, Low, ring plane (V5 outlier: dust clouds) | 846 / 842 / 885 | 953 / 959 / 1,031 | 576 / 583 / 628 | 0.60× | 0.68× |
| Cinder Belt, Low, field overview (V5 outlier: asteroid shading) | 1,682 / 1,636 / 2,140 | 1,596 / 1,607 / 1,713 | 1,134 / 1,108 / 1,334 | 0.71× | 0.67× |

  The ring plane is now faster than in V4 and V5 at both presets. The Cinder Belt field overview is faster than V5 at both presets and faster than V4 at Low, but at High it is still about 12% slower than V4 in this run (a second, separate measurement of the same view gave V4 3.63 s, V5 4.64 s and V6 3.70 s): V6's rock materials do more per pixel than V4's single rock material.
- **What the time went into**, from `tests/perfprobe.py` and from skipping one kind of item at a time in the same frozen views: with every scene item skipped (sky and post-processing only) a Halo of Vashti frame costs 0.42–0.46 s in V6 against 0.69–0.73 s in V5 (the baked sky); in the along-the-course view, skipping the planet saves 0.74 s in V5 and 0.26–0.32 s in V6 (baked surfaces); the dust clouds are drawn at a sixteenth of the pixels; rocks read two volume fetches (one on small rocks) where V5 evaluated octave stacks. During V6 development the same probes found that the Bastion's lite level drew about 1,200 stray triangles (a hangar panel grid with a fractional cell count indexed past its rows) and cost about 0.95 s on its own in the ring-plane view; that is fixed in this build.
- **Slower in V6:** Neon Spire at High by 1–7% (start skyline 1.01×, mid-course 1.07×, aerial 1.02×): curved facades, mechanical floors and blinds add work to every facade pixel, and the hero selection now includes curved towers near the course. At Low, Neon Spire is 2–4% faster than V5.
- Run-to-run variation on this machine is about ±5–10% per view.

### Known limitations (V6)
- All performance figures come from software rendering (SwiftShader) in a headless browser on a 2-core machine. They compare builds on that machine only; nothing here was measured on a graphics card.
- Performance: the Cinder Belt field overview at High is faster than in V5 but, in the final benchmark, still about 12% slower than V4 (V6's rock materials do more per pixel than V4's single rock material); at Low it is faster than both. Neon Spire at High is 1–7% slower than V5 (the facade work); at Low it is 2–4% faster.
- Bevelled boxes in the older models (the five ships, the Bastion's full level, city and trench props) interpolate normals taken inside their bevels across whole faces, so large flat panels shade softly rounded. Changing it would change the look of every ship, so it was left as in V5.
- The Atlas rides just under Halo of Vashti's ring plane; the ring is nearly opaque edge-on, so from above the ring it is hidden (the capital sheet views it from under the ring).
- Gameplay rocks must stay within 0.93–1.05 of their collision spheres (collision behaviour is unchanged), so close up they remain rounded bodies with fractured faces; strongly irregular silhouettes are limited to the landmarks and the background field. Compound collision shapes would allow irregular gameplay rocks but would change collision behaviour, so they were not implemented.
- Instanced rocks and buildings still switch levels without a cross-fade (with hysteresis, at sizes where the change is under a pixel); capital ships and hero facade relief cross-fade.
- Close-up rock detail comes from the 64³ noise volume (four octaves of it); with the camera practically touching a rock the finest fetch is magnified too and the surface turns soft, and only the ancient family has analytic craters.
- Hangar light is baked when the ship is built: the parked craft are fixed, passing traffic neither receives nor casts hangar light, and the openness bake treats each bay as a box with one opening. Only the Bastion has hangars.
- Turrets sweep on a schedule and do not track anything (no combat system was added).
- Planet clouds are one parallax layer, not volumes; the atmosphere is a single-scattering approximation (a Chapman-style fit, no multiple scattering); the icy moon's lineae are drawn analytically, not simulated. The sky-in-front term for Neon Spire's moon assumes a viewer inside the city's air and fades out for cameras far from the course.
- Curved facade relief is built only for hero buildings near the course; other curved towers have the curved shader facades only. Interior mapping still applies to lit windows only.
- It does not reach the asset quality of AAA productions such as Star Wars Battlefront II: geometry, materials and lighting are procedural and built in code, with no authored textures or scanned assets.

## V5: environment, rendering and world detail

V4 is the baseline. The five V4 spacecraft keep their silhouettes, collision fit (2.3 m sphere, 2.2 m collision radius), stats and handling; the 26 V4 building archetypes and five districts stay. Everything below is original.

### Capital ships (`src/render/props.js`)
The "Bastion" carrier is rebuilt in three tiers on the V3/V4 layout (stepped plate hull, keel, terraced spine with command deck, sponsons on pylons, radiator wings, clustered engines):
- **Primary:** the same stepped hull, spine and sponsons, now with flank armour plates and a capital-hull material: big plates, panel seams that fade with distance, grime streaks running aft, and rows of small lit windows that give the kilometre scale away.
- **Hangar bays with real depth:** each sponson is built as a core plus an outer layer with four 30 m recesses, so the bays are cut into the hull, not painted or bolted on. Each bay has a stepped frame, a deck plate with a lit guide line and edge markers, rows of ceiling lights, a back wall with lit doors and a control-gallery window, blue lip emitters at the mouth, cargo stacks, a gantry and parked shuttles. The bay walls, ceiling and deck glow softly in place of interior lights, so from kilometres away the bays still read as lit hangars (as V4's flat light panels did), and up close they show their depth.
- **Engines:** nine nozzles, each a housing, a collar ring, a flared bell with an exit lip, a dark liner narrowing to a glowing throat, a white-hot core and an inner glow ring, on four struts. Every nozzle also carries an exhaust glow billboard.
- **Secondary and tertiary:** a dorsal armour ridge along the bow with deck fittings and sensor masts, conduits along the flanks, fourteen turrets, deck ribs, 90 superstructure blocks on the dorsal and shoulder decks, sensor dishes, masts with beacons, landing pads with edge lights, running and navigation lights, a prow marking. About 58,000 triangles at full detail and 14,700 in the lite hull.
- **LOD:** a lite hull (same silhouette and lights, plain boxes, no small parts) cross-fades in with a dithered, complementary pattern when the ship is smaller than 260 px on screen and takes over below 170 px. The same carrier and LOD now fly over all four courses.

### Asteroids (`src/render/courses/belt.js`, `src/render/geo.js`, rock shader in `gfx.js`)
Five geological families, each with its own geometry recipe and shading:
- **Ancient cratered:** many craters with raised rims; dark space-weathered regolith peppered with small craters and brighter fresh ejecta.
- **Metallic:** smoother melted forms with sheared faces; dark nickel-iron with a dull, hammered sheen, pits, bright metal veins and rust in the hollows.
- **Icy:** smooth bodies with clean fracture planes; frost over clear ice, dust streaks, deep blue fractures that run straight for a while and then stop (two sets of warped planes rather than noise contours, which drew closed loops), and light that wraps through thin edges.
- **Fractured:** several planar fractures whose faces are flat-shaded with hard edges and coloured as freshly broken, finer-grained rock.
- **Layered formations:** sedimentary bands with ledges.
The rock builder gained explicit fracture planes and flat "fresh" faces. Every gameplay rock still stays inside 0.93–1.05 of its collision radius, at both of its levels of detail (the lower level is a vertex subset of the higher, so the switch keeps the shape). The seven Cinder Belt landmarks keep their places, pieces and proportions (the same random draws as V4) and are rebuilt as two spire clusters with boulder fields, two natural arches, two sundered moonlets (fragments with fresh fracture faces and dust) and an ice-spire group with glitter. The 2,600-rock background field is now four families at three levels of detail.

### Planets (`PLANET_FS` in `gfx.js`)
Four surface types, one per course: rocky (Cinder Belt: continents with relief shaded from the sun's side, cloud decks that cast shadows), banded gas giant (Halo of Vashti, as V4), icy (Neon Spire's ringed moon: fracture lines, polar caps, clouds) and atmospheric (Foundry Trench: a volcanic world under flowing haze decks, with light carried past the terminator and stronger limb scattering). All gain limb darkening, a warm terminator, a fully dark night side and an atmosphere shell that glows only on the lit limb.

### Lighting and atmosphere
- **Sun glare in the skyline: found and fixed at the source.** The white column next to the low sun (visible in V4's matched skyline shot) was a 713 m glass needle tower lit as if it faced the sky. Instanced buildings are stretched non-uniformly (about 30 m wide, 700 m tall), and the vertex shader transformed normals with the model matrix instead of its inverse transpose, so the slight slope of every curved tower's profile was multiplied by the height and its normals tipped up toward the sky and sun. Normals now use the inverse transpose; curved towers, cooling towers, domes, tanks and pillars shade correctly, and the backlit needle is a dark silhouette. Isolated by rendering the same frozen view with each light source switched off, then picking the instance under the bright pixels.
- **No double-counted sun.** The lighting cubemap no longer contains the sun's disc and tight halo; the sun is lit analytically only, so glossy surfaces stop reflecting it twice.
- **Facade specular.** Panes sit a degree or two off true, so near facades glint pane by pane instead of in one smooth sheet, and far facades use a broader, dimmer lobe that stands for many panes. The planet-side sky's sun disc is less hot (30 → 12) and the bloom input is clamped at 16 instead of 40, so the sun no longer floods the gaps between towers.
- **Neon Spire palette.** The purple-pink haze is gone. Fog, haze billboards, ground and tunnels are neutral grey; the sun is warm, the sky a dusk gradient from a warm horizon to a deep blue zenith, shadows lift slightly cool and highlights warm.
- **Atmospheric perspective without uniform fog:** height fog in Neon Spire integrates density along each view ray, so the street canyons are hazy while the tops of towers stay clear and distant towers dissolve from the base up.
- **Per-course grade:** Neon Spire neutral dusk; Halo of Vashti gold light with teal shadows (distinct from the city); Cinder Belt cool; Foundry Trench warm.

### Neon Spire city (`src/render/courses/citygen.js`, `city.js`)
- **Hybrid facade depth.** Near the camera, hero buildings (the five landmarks and towers beside the course) grow real facade relief aligned to the facade shader's window grid: office spandrel ledges and mullion fins, curtain-wall aluminium fins, residential balcony slabs with parapets, brutalist piers and bands with the windows in deep slots. The relief is built on demand for the nearest 14 heroes, faded in with dither and casts shadows. At mid distance, every lit window shows a room behind it (interior mapping: side walls, floor, a ceiling with a light panel and a back wall with parallax), and at a distance the facades fall back to the V4 pattern averaged by pixel size. Glass curtain walls light whole runs of open-plan office (one room spans four mullion bays, 6.4 m wide and up to 11 m deep) in warm and neutral white, instead of scattered single panes in cold grey.
- **Every archetype has a lite level** (same silhouette; balcony slabs, bracing, beams, light strips and fine segments removed) and the far skyline varies its height along a slow profile around the horizon with every other tower mirrored, so the ring of silhouettes does not read as one repeated shape.
- **Visibility:** every building, highway, pillar and plaza is an instance in a set that is frustum-culled, occlusion-culled, size-culled and LOD-bucketed each frame with the frame's final camera (see LOD below).
- **Holo boards read correctly.** Earlier versions turned the boards on tower faces away from the course, so racers saw the brand names mirrored; they now face the course.

### Foundry Trench and Halo of Vashti
- Foundry Trench: sodium floodlights on alternating rims angle down into the slot with faint light cones in the dust; welding sparks shower off the wall machinery ahead of the player; the passing carrier is the V5 carrier with LOD and exhaust glow.
- Halo of Vashti: the ring slab is now 7,200 chunks of water ice, dusty rock and fractured rock at three levels of detail, culled per frame, with soft dust sheets for depth; gold light and teal shadows set it apart from Neon Spire; the fleet uses the V5 carrier.

### Spacecraft materials
The five ships keep their geometry. Each engine bell gains a heat-tempered band, an inner glow ring and a white-hot core inside the existing nozzle.

### LOD, occlusion and other optimisations (`src/render/lod.js`)
- **Screen-size LOD everywhere:** every switch compares the object's projected size in pixels (from the render height and field of view) against its thresholds, with a 12% hysteresis band. Levels: near (hero facade relief, carrier full hull, rocks at subdivision 3), mid (full building archetypes, rocks at 2), far (lite archetypes, carrier lite hull, background and ring rocks at 1 or 0), very far (skyline lite meshes; anything under 0.75 px is not drawn).
- **Smooth transitions:** the carrier cross-fades between levels with complementary dither patterns; hero relief fades in with dither over distance and time; instanced levels switch at sizes where the removed parts are under a pixel.
- **Occlusion culling (Neon Spire):** each frame up to 48 of the nearest large solid building cores are rasterised in software into a 128×72 depth grid at their farthest depth, covering only cells wholly inside their silhouettes; a max-depth pyramid then hides any instance whose bounding sphere lies behind occluders in every cell it could touch. The test is conservative by construction, and `tests/vis.py` re-checks it independently with ray casts.
- **Instancing:** one draw per archetype and level; instance buffers are compacted every frame so hidden instances cost nothing on the GPU.
- **Shader variants:** the lit shader was one program carrying every material (ship hull, glass, rock families, structure, five facade types, capital plating). It is now compiled into variants that carry only what each kind of geometry uses: city (structure and facades), rock (rock families and structure), structure (Foundry Trench), ship (hull and structure), and capital ships with the LOD cross-fade. The full program remains for everything else. Smaller programs shade faster (see *V5 performance*). Band-limited noise also skips octaves that are already averaged out instead of evaluating and discarding them.
- `gfx.lodBias` (0 = always full detail, 100 = always lite) is a test hook; the benchmark now also reports instances considered, drawn and culled (frustum, occlusion, size).

### Presets
Low: no hero relief, half skyline, fewer traffic lanes. Medium: hero relief fades in from 340 m. High and Ultra: from 440 m. Culling and LOD run on every preset.

### Testing and benchmarking
- `tests/views.py BUILD SPEC.json OUT.png`: labelled sheets from JSON specs in `tests/specs/` (capital ships, asteroids, planets, city, V4 city, Foundry Trench and Halo of Vashti).
- `tests/geometry.test.js` (part of `npm test`): gameplay-rock silhouettes against their collision radius at both levels of detail, lite building and carrier levels keeping the full silhouette box, hero relief staying on its facades, and the occlusion test on a constructed scene.
- `tests/vis.py BUILD`: occlusion conservativeness, LOD hysteresis, LOD bias hook, carrier cross-fade, culling counters.
- `tests/matched.py`: the ten fixed viewpoints, used for V4 against V5.
- `tests/fixedbench.py OUT.json OLD.html NEW.html`: frozen race, identical track-relative cameras in every build, six timed frames per view; average, median and 95th-percentile frame time, fps, draws, triangles and instance counts.
- `tests/settings.py BUILD`: switches every preset and every graphics toggle at runtime through the game's own settings action, during a Neon Spire race next to a hero tower, and checks the renderer configuration, WebGL errors, page errors, blank frames and that hero facade relief follows the preset.
- Test hook `__game.shotShadow = true` centres the sun's shadow map on a test view's target, so sheet close-ups show contact shadows.

### V5 tests (run on this build in headless Chromium with software rendering)
- `npm test`: 16 of 16 pass: the 11 simulation tests (flight model, checkpoints and laps, wall and obstacle collisions, AI races on all four courses, determinism, championship points) and the 5 V5 geometry and visibility tests (gameplay rocks inside 0.93–1.05 of their collision radius at both levels of detail, lite levels keeping the full silhouette, hero relief staying on its facades, software occlusion).
- `tests/vis.py`: 5 of 5 pass. Occlusion re-check over 14 views along Neon Spire: all 2,435 buildings the system hid were confirmed hidden by 65,745 independent ray casts (points outside the view are skipped; the first run of this check caught a real bug, an undersized screen bound for spheres far off-axis, which is fixed). LOD hysteresis: a 348 m tower switches out at 1.15× and back at 0.85× its threshold distance. LOD bias 0 and 100 put all 953 drawn buildings on the detailed and the lite level. Carrier cross-fade: full hull only at 1.2 km, both levels at 2.6 km (fade 0.21), lite only from 3.2 km.
- Culling on those 14 views: of 3,732 building, highway, pillar and plaza instances, 1,322 are drawn on average (702–2,046); the frustum removes 60%, and occlusion removes on average 12% of what is left in the frustum (1–31%).
- Autopilot races on all four courses reach the results screen with no console errors (`tests/playtest.py races`, Low preset).
- Menu flow passes: one Enter on the title opens ship select, ships can be browsed, track select and launch work, Space skips the flyover, Esc pauses and freezes the simulation, the settings screen opens, resume restarts the simulation, C cycles the camera, and the audio keeps running.
- Time trial with a V1 ghost: a lap recorded in V1 (36.1 s) loads in V5 (723 frames) and the ghost is drawn in a Classic-handling time trial on Cinder Belt.
- Championship: two rounds with points carried over, no console errors.
- `tests/handsoff.py` matches V4: Relaxed keeps 62–77% hull with no input, Classic 0–56%.
- `tests/settings.py`: 23 of 23 steps pass. Medium, High, Ultra, Low and High again, then shadows, ambient occlusion, light shafts, speed blur, film grain, chromatic aberration and lens flare off and on, resolution scale 0.5 and 1, and field of view 95 and 72, all switched at runtime. The renderer configuration follows every change with no WebGL or page errors and no blank frame; hero facade relief shows on 4 nearby buildings at Medium, 14 at High and Ultra and none at Low.
- The view sheets in `validation/` (ten matched V4/V5 viewpoints, Neon Spire, capital ship, asteroids, planets, Foundry Trench and Halo of Vashti, ships) were rendered from this build.

### V5 performance (software rendering; V4 against V5 on the same machine)
`tests/fixedbench.py` on the final builds: headless Chromium with SwiftShader on a 2-core machine, 960×540 viewport, fixed preset (no dynamic resolution), race frozen on the grid, identical track-relative cameras in both builds, 3 settling frames and then 6 timed frames per view. With six frames, the slowest frame stands in for the 95th percentile. These are software-rendering numbers: they compare the two builds on this machine and say nothing about frame rates on a graphics card, which were not measured.

| Course, preset, view | V4 frame avg / median / slowest (ms) | V5 frame avg / median / slowest (ms) | V4 → V5 fps | V4 → V5 draw calls | V4 → V5 triangles | V5 instances drawn of considered |
|---|---|---|---|---|---|---|
| Neon Spire, High, start skyline | 6,674 / 7,034 / 12,964 | 2,765 / 1,529 / 6,838 | 0.15 → 0.36 | 315 → 335 | 935 k → 387 k | 1,124 of 3,732 |
| Neon Spire, High, mid-course | 10,258 / 10,012 / 11,734 | 6,551 / 6,500 / 6,990 | 0.10 → 0.15 | 331 → 355 | 953 k → 462 k | 1,441 of 3,732 |
| Neon Spire, High, aerial | 11,389 / 11,703 / 11,894 | 7,992 / 7,988 / 8,031 | 0.09 → 0.13 | 328 → 348 | 927 k → 432 k | 1,338 of 3,732 |
| Neon Spire, Low, start skyline | 2,447 / 2,278 / 5,596 | 1,385 / 1,074 / 3,127 | 0.41 → 0.72 | 315 → 326 | 865 k → 328 k | 1,034 of 3,472 |
| Neon Spire, Low, mid-course | 2,837 / 3,098 / 3,588 | 2,188 / 2,183 / 2,223 | 0.35 → 0.46 | 331 → 349 | 890 k → 387 k | 1,347 of 3,472 |
| Neon Spire, Low, aerial | 3,974 / 3,998 / 7,800 | 2,710 / 2,722 / 2,764 | 0.25 → 0.37 | 328 → 341 | 859 k → 355 k | 1,337 of 3,472 |
| Cinder Belt, High, racing line | 3,336 / 2,617 / 10,877 | 1,738 / 435 / 5,658 | 0.30 → 0.58 | 150 → 188 | 531 k → 420 k | 1,199 of 2,600 |
| Cinder Belt, High, field overview | 3,804 / 3,791 / 3,873 | 5,283 / 5,269 / 5,401 | 0.26 → 0.19 | 95 → 90 | 500 k → 213 k | 433 of 2,600 |
| Foundry Trench, High, in the trench | 3,891 / 3,174 / 12,662 | 2,463 / 2,374 / 3,915 | 0.26 → 0.41 | 139 → 149 | 430 k → 433 k | – |
| Foundry Trench, High, over the rim | 3,608 / 3,620 / 3,705 | 2,500 / 2,496 / 2,620 | 0.28 → 0.40 | 95 → 107 | 340 k → 351 k | – |
| Halo of Vashti, High, ring plane | 2,903 / 360 / 12,474 | 2,043 / 2,204 / 3,723 | 0.34 → 0.49 | 53 → 56 | 457 k → 185 k | 608 of 7,200 |
| Halo of Vashti, High, along the course | 1,312 / 1,309 / 1,350 | 1,426 / 1,414 / 1,478 | 0.76 → 0.70 | 69 → 75 | 474 k → 153 k | 833 of 7,200 |

- Average frame time is lower in V5 in 10 of the 12 views (V5 takes 0.70× V4's time, geometric mean over all 12). Neon Spire draws 52–62% fewer triangles than V4 for a few more draw calls; culling leaves 1,030–1,440 of its 3,470–3,730 instances to draw.
- Two views are slower. In the Halo of Vashti ring plane, V4's median frame is 0.36 s and V5's 2.2 s: switching off V5's soft dust sheets in that view cut its frames from about 3.0 s to 1.4 s, so the overlapping sheets cost more than half of the frame; the rock chunks' level of detail made no difference. *(Corrected in V6: these frame times were unsynchronised `requestAnimationFrame` deltas. Timed with a GPU sync per frame, the dust sheets cost about 0.17 s of a 3.6–3.8 s frame; the planetary ring and the noise-heavy sky and planet shaders cost more. See* V6 *above.)* The Cinder Belt field overview (3.8 s → 5.3 s) is filled with large rocks, and the V5 rock families cost more per pixel than V4's single rock material.
- V5's slowest frames in the start views include building hero facade relief for towers that have just come near (one building per frame).
- During development, the frozen Neon Spire start view (Low preset, 720×405) took 7.9 s per frame with the single lit program and 3.7 s with the shader variants.

### Known limitations
- All performance figures come from software rendering (SwiftShader) in a headless browser on a 2-core machine. They show relative cost between builds only; nothing here was measured on a graphics card.
- Occlusion culling runs only in Neon Spire, where large solid buildings exist; the other courses use frustum, size and LOD culling.
- In software rendering, V5 is slower than V4 in two of the twelve benchmark views: Halo of Vashti's ring plane and the Cinder Belt field overview, where the rock families cost more per pixel when large rocks fill the screen (see *V5 performance*; V6 corrects the ring-plane diagnosis).
- Hero facade relief covers box-shaped facade volumes of the 14 nearest hero buildings, within the altitude band the course passes through there. Curved towers (needles, cooling towers, arcologies) have no relief, and buildings away from the course keep shader windows plus interior mapping.
- Interior mapping applies to lit windows only; unlit windows are still flat reflective panes.
- Instanced buildings and rocks switch levels instantly (with hysteresis, at sizes where the removed parts are under a pixel); only the carriers and the hero relief cross-fade.
- There is one capital-ship class. Hangar interiors are lit by emissive surfaces and self-lit walls, not by real local lights, and the turrets do not move.
- Planets are shaded spheres with a rim shell: clouds are noise decks, not volumes, and the atmosphere is not a scattering simulation.
- Asteroid collision is unchanged: spheres sized to the rocks. Every gameplay rock must stay within 0.93–1.05 of its sphere, so up close the gameplay rocks read as rounded bodies with craters and flat fracture faces; strongly irregular shapes are limited to the landmarks and the background field, which stay clear of the racing corridor.
- It does not reach the asset quality of AAA productions such as Star Wars Battlefront II: geometry, materials and lighting are procedural and built in code, with no authored textures or scanned assets.

## V4: architecture and spacecraft overhaul

### Neon Spire: an architectural library instead of one box
`src/render/courses/citygen.js` now holds 26 original building archetypes. Each is real multi-part geometry built once in unit space and instanced, so the variety costs one draw call per archetype:

- **Corporate:** slender glass tower with exposed corner columns; stepped tower with mechanical floors; tower split by a recessed core; sky-garden tower with open garden floors on columns; asymmetric-crown tower with an offset spire; tower in a braced exoskeleton; twin towers on skybridges; needle; tower with a cantilevered top carried on diagonal braces.
- **Residential:** balcony slab; irregularly stacked blocks; podium with three towers and roof gardens; terraced block; courtyard ring.
- **Industrial:** sawtooth factory hall with chimneys; cooling tower; tank farm; power plant with three stacks; open steel-frame tower.
- **Civic and transport:** domed hall; vaulted terminal on columns; tapered monolith with corner fins; transit hub with ring platforms; tower with braced landing pads; low city blocks; arcology.

Five districts (industrial, residential, transport, financial, civic) each draw only from their own archetypes and carry their own palette. Heights follow a hierarchy: low blocks and plazas, mid-rise districts, a financial skyline, five landmark sites with oversized monoliths, needles, twins and exoskeleton towers, a far skyline ring built from the same recognisable silhouettes, and arcologies in the haze. Buildings stay inside their blocks, so 8 m streets and 24 m highway corridors stay clear.

**Infrastructure.** Every fifth street carries an elevated highway on two levels (150 m and 210 m above the ground) with concrete piers, barriers, lit edges and lane lines. Segments that would meet the course are left out. Gaps between blocks become raised plazas.

**Traffic.** There are 44 air lanes at eight altitudes, kept clear of the highway decks, plus two-way traffic on every highway segment. Four vehicle types: cars, delivery vans, transit buses and cargo haulers, with heavy cargo on the top lanes. Nearby vehicles are meshes (up to 40 per type); distant ones are light pairs. Vehicles still hide wherever they would pass through a building or the course.

### Five new spacecraft
Every ship still fits its 2.2 m collision sphere and keeps its stats and handling. Each now reads from behind by its silhouette and engine pattern:
- **Kestrel (elite):** slender blended body, long crescent gull wing, two engines integrated at the wing roots, V-tail. From behind: a wide gull "M" with two engines.
- **Wisp (experimental):** asymmetric. The cockpit pod sits on the left, a ceramic ring wing on the right, and the main engine on an outrigger below the ring. From behind: an off-centre ring.
- **Lancer (interceptor):** needle fuselage with two forward mandible prongs, cropped delta wings, cruciform tail and a single engine. From behind: a thin cross.
- **Halberd (heavy):** broad armoured deck between two heavy side pods with sloped glacis plates, a radiator bank and four engines in a row. From behind: a wide slab with four engines.
- **Corsair (independent):** a round hull and a boxy olive cargo hull with mismatched engines (one large, two small), joined by an exposed truss. It has a bolted-on cockpit pod, patch panels, an external pipe and a rust plate. From behind: one big engine and two small ones.

### Tools
- `tests/shipsheet.py`: every ship from the front, side and rear under studio light, plus the chase camera and a view from 45 m behind.
- `tests/citysheet.py`: the `?gallery` lineup of every archetype, plus aerial, street-level and highway views.
- `tests/matched.py`: the ten fixed viewpoints, now used for V3 against V4.
- The benchmark now reports average, median and 95th-percentile frame time, draw calls, triangles, JS heap (when the browser exposes it), renderer name, course and camera position. In the offline file, add `&track=spire` to benchmark another course.

### V4 tests (run on this build in headless Chromium with software rendering)
- `npm test`: 11 of 11 pass.
- Autopilot races on all four courses reach the results screen with no console errors.
- Menu flow passes: pause freezes the race, resume restarts it (the check waits for the race to move again, because the city renders slowly in software), settings, camera cycle and audio.
- A V1 ghost loads in a Classic-handling time trial.
- Championship: two rounds with points carried over.
- `tests/handsoff.py` gives the same results as V3: Relaxed keeps 62–77% hull with no input, Classic 0–56%.

### V4 performance
All numbers come from software rendering (SwiftShader) at 960×540, so they show only relative cost, not what a graphics card will do. Frame-time percentiles exist for V4 only, because V3's benchmark did not record them.

| Course | Build | FPS Low / Medium / High / Ultra | V4 median frame (Low) | Draw calls | Triangles per frame |
|---|---|---|---|---|---|
| Neon Spire | V3 | 0.2 / 0.2 / 0.1 / 0.1 | – | – | – |
| Neon Spire | V4 | 0.3 / 0.2 / 0.0 / 0.1 | 5.5 s | 298 | about 850 k |
| Foundry Trench | V3 | 0.4 / 0.6 / 0.2 / 0.3 | – | – | – |
| Foundry Trench | V4 | 0.5 / 0.5 / 0.3 / 0.2 | 1.3 s | 111 | about 347 k |

Each run covers one to nine frames, so differences of 0.1 fps are noise. The city now draws about 850 k triangles in roughly 300 draw calls; that is ordinary for a desktop GPU but has not been measured on one. Hardware numbers come from `#bench` on the artifact (or `?bench=short&track=spire` on the offline file).

### Not done in V4
- Capital ships, asteroids, planets, Foundry Trench and Halo of Vashti are unchanged from V3.
- There is no per-instance LOD switching or occlusion culling. Distance is handled by giving the far skyline simpler archetypes, and the Low preset halves it and thins the traffic.
- Windows are still shader patterns on the facades. The new geometry carries silhouettes, setbacks, columns, balconies and crowns, not individual window recesses.
- The archetype lineup is lit by the course's dusk sky, so it reads mostly as silhouettes.

## V3: world and asset overhaul

### The ten biggest visual weaknesses found in V2, by priority
1. Neon Spire was one extruded box repeated thousands of times with one window pattern: no building families, silhouettes or districts.
2. The city had no depth: a flat ground plane with isolated towers, nothing on the horizon, and a purple space sky over what is meant to be a planet.
3. Nothing in the city moved like traffic: straight strings of lights that passed through buildings.
4. Asteroids were smooth, near-identical brown lumps, with no landmarks to read the course by.
5. Capital ships were stacked boxes.
6. Ship surfaces had the same grime everywhere, no heat or soot, and long uniform exhaust cones.
7. Surfaces seen edge-on against the sun blew out into white columns; glass threw blinding glints.
8. Nebulae tinted the whole sky; the starfield was a single uniform layer.
9. Planets wore a glowing outline on their night side and had no clouds.
10. The trench read as a decorated corridor with nothing overhead.

### What changed
- **City** (`src/render/courses/citygen.js`). Districts with their own families: commercial cores (glass curtain walls or office grids, corner ribs, mechanical floors, setbacks, crowns with masts), needle skyscrapers, residential slab clusters on podiums, industrial megablocks with stacks, tanks and truss frames, and brutalist blocks with cantilevered upper storeys. Roof machinery, landing pads, skybridges between neighbours and under-city decks at two levels. Four new facade materials (residential bands, glass curtain wall, board-formed concrete with slot windows, corrugated cladding) that fade to their average with distance. A ring of 520 skyline towers and seven arcologies 3–6 km out, a planet-side sky with a horizon glow, 44 traffic lanes at eight altitudes with their own speeds and directions (real car meshes within 650 m, light pairs beyond; cars hide wherever they would pass through a building or the course), three heavy transports above the skyline, and steam from the stacks. Everything under the racing line stays below the corridor floor. All of it is instanced: 17 draw calls for the buildings.
- **Space.** Asteroids now have impact craters and planar fractures (gameplay rocks still stay within 0.93–1.05 of their collision radius) plus metallic and icy variants; seven towering rock formations stand outside the Cinder Belt corridor as landmarks. A new original dreadnought replaces the box carrier: stepped plate hull, terraced spine, sponsons with lit hangar mouths, radiator wings and clustered engine banks. The sky has a galactic band with dust lanes and a fine star layer, and nebulae are desaturated. Planets get a thin atmosphere only on their lit side, cloud decks on rocky worlds and a warm terminator.
- **Ships.** Heat tempering around every nozzle, soot rings beyond it, wear concentrated on leading edges and panel seams, and two finishes: navy (Lancer, Halberd: clean, glossy, near-monochrome) and independent (patched, mismatched panels, different for every pilot). Exhaust is shorter and hotter.
- **Lighting.** Specular from surfaces seen edge-on is clamped, glass panes are dielectric, and reflected sun is capped, which removed the white glare columns.
- **Foundry Trench.** Armoured spans bridge the open top every 400 m, with lit undersides.

### Tests run on this build (headless Chromium, software rendering)
- `npm test`: 11 of 11 pass.
- Autopilot races on all four courses reach the results screen with no console errors.
- Menu flow: Enter on the title opens ship select, ships browse, launch, the flyover skips, pause freezes the race and resume restarts it, settings open, the camera cycles, audio runs. Pass.
- A V1 ghost loads and races in a Classic-handling time trial. Pass.
- Championship: two rounds in a row with points carried over. Pass.
- `tests/matched.py` captures ten fixed viewpoints for before/after comparison.

### Performance
Measured with `tests/bench.py` in software rendering at 960×540: average fps (1% low). These numbers only show relative cost between builds, not what a real graphics card will do.

| Course | Build | Low | Medium | High | Ultra |
|---|---|---|---|---|---|
| Neon Spire | V2 | 0.4 (0.2) | 0.2 (0.1) | 0.2 (0.1) | 0.0 (0.0) |
| Neon Spire | V3 | 0.3 (0.1) | 0.1 (0.1) | 0.1 (0.1) | 0.1 (0.1) |
| Foundry Trench | V2 | 0.5 (0.2) | 0.6 (0.2) | 0.3 (0.1) | 0.2 (0.1) |
| Foundry Trench | V3 | 0.4 (0.1) | 0.5 (0.2) | 0.2 (0.1) | 0.2 (0.1) |

Each run covers only one to eight frames, so the table is noisy. The new city costs noticeably more per frame; the Low preset thins the far skyline and traffic. Run `#bench` on the target machine for real numbers.

### Assets and licences
No external images, models or audio: every mesh, texture and sound is generated in code. The display fonts (Michroma, Saira Semi Condensed, IBM Plex Mono) load from Google Fonts under the SIL Open Font License, and the game falls back to system fonts without them.

### Known limitations of V3
- Ship silhouettes are unchanged; the five models still fit their collision spheres. The new materials show up close (hangar, chase camera) more than at race distance.
- The ships do not imitate Star Wars craft; every design stays original.
- Halo of Vashti changed only through the planet, sky, rocks and capital ships; the rings cast no shadow on the planet.
- The trench gained overhead spans but no new distant factory skyline.
- Frame rates on real graphics hardware are unmeasured, and Neon Spire is now the heaviest course.
- This is still far from Battlefront II: buildings are boxes, lathes and shader detail rather than modelled and textured assets, and there is no global illumination or volumetric cloud.

## Update: easier handling, visible route, cinematic look

- **Handling.** Settings → Controls → Handling. *Relaxed* (the new default) runs the whole field about 26% slower, turns the nose along the course whenever you are not steering, eases you back from the walls in the outer quarter of the corridor, and softens wall hits to about a third of the damage. *Classic (V1)* is V1's flight model, unchanged. Records and ghosts are kept separately for each, and V1 ghosts load under Classic. In a hands-off test (no input for 40 s), Relaxed got further on three of four courses and kept 62–77% hull, against 0–56% under Classic.
- **Route and boundary.** Lamp pylons on the corridor corners, joined by guide beams in each course's colours, with a pulse running ahead in the racing direction. Amber chevron boards stand outside every real turn and point into it. All of it sits on or outside the collision boundary. The trench marks only its open top edge; Neon Spire's tunnels keep their own light rings.
- **Look.** Anamorphic streaks on bright lights, lens dirt that shows only in strong bloom, a teal-and-warm split-tone grade, sun-lit haze in the distance, slightly weathered paint, a gentle handheld drift on the cameras, and letterbox bars for the flyover, the finish and the title.

## Known issues

- The renderer is hand-written WebGL2 rather than three.js: the build machine could not reach npm or any CDN, so the game ships with no external code at all.
- Frame rates have not been measured on real graphics hardware; the test machine renders in software. Run `?bench` on the target laptop; the auto-picked preset and dynamic resolution are the safety net.
- Gamepad support and rumble follow the standard Gamepad API but were not tried with a physical pad, and some embedded viewers block gamepad access.
- Audio was exercised for errors in a headless browser, not judged by ear.
- Each published artifact has its own storage, and V1 has no export button, so V1 records only carry over when both builds run from the same origin (for example the two offline files).
- Ships look smaller than in V1 because every model now fits inside its 2.2 m collision sphere.
- All five ships share one cockpit interior.
- Rivals drive as in V1 (only slower under Relaxed); the steering help and soft walls apply to you alone.
- Relaxed lap times are not comparable with V1's, so V1 records and ghosts appear only under Classic handling.

## Saves and V1 ghosts

V7 keeps the career (credits, tokens, upgrades, cosmetics, championships, statistics) under its own key, `galactic-rush.profile` (see *V7 → Saves*); the key below is unchanged. V2 uses the same storage key and format as V1 (`galactic-rush.v1`), so best laps and ghosts recorded by V1 replay in V2 time trials whenever both builds run from the same origin (tested: a V1 belt ghost loads and races in a V2 time trial). Each published artifact has its own browser storage, so Settings → Save data can copy a save and import a pasted one to move records between browsers or copies.

## Code layout

```
src/math.js, src/config.js, src/sim/*     simulation (unchanged from V1)
src/render/gfx.js        WebGL2 HDR renderer, shaders, post stack, shared noise volume and dust-cloud pass (V6)
src/render/geo.js        geometry builder with per-vertex PBR materials; polytope rock builder (V6)
src/render/lod.js        screen-size LOD, frustum/size culling, instance sets, software occlusion (V5)
src/render/models.js     racer models and cockpit
src/render/props.js      Bastion carrier (with baked hangar light), hauler, patrol craft, traffic pod, wreckage, mining rig, crystal
src/render/capital.js    capital-ship classes (Bastion, Warden, Atlas), three levels of detail, turrets and cranes (V6)
src/render/shipvis.js    per-racer visuals (livery, flaps, engines, shield, damage)
src/render/raceview.js   race-to-visuals binding, ghost hologram
src/render/hangar.js     hangar and podium scene
src/render/effects.js    particles
src/render/textures.js   procedural canvas textures
src/render/courses/*     course kit and the four courses (citygen.js: Neon Spire archetypes, lite levels, hero facade relief)
tests/specs/*.json       viewpoint lists for tests/views.py sheets and tests/compare.py comparisons
src/camera.js            camera rigs and broadcast director
src/racefx.js            race events to effects, audio, HUD
src/audio.js             synthesised audio and adaptive score
src/hud.js, src/ui.js    HUD and menus
src/input.js             keyboard, gamepad, saves
src/main.js              game flow, presets, dynamic resolution, benchmark
src/progress/*           V7 career: economy, catalog, profile, store, rewards, upgrades, customize, Progression service
src/garage.js            V7 garage controller (ship, upgrades, paint, inventory, shop)
src/ui-garage.js         V7 garage, career, reward and championship screens
```
