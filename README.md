# GALACTIC RUSH V12

An arcade space racer: five ships, eight courses, five rivals, quick race, a six-round championship whose courses you pick, time trials with ghosts and online tournaments. **V12 adds six difficulty levels** (Rookie, Pro, Ace, Elite, Master, Legend), **player accounts** that keep the career on a server and take it to any device, **fixes Verdant Canopy's trees** that stood in the corridor without collision and **adds obstacles built into Pelagos and Orbital Nexus**; V11 stays available unchanged (see *V12* below). V11 was a visual pass over four of the eight courses — Pelagos, Ignara, Verdant Canopy and Orbital Nexus — that brings them to the level of the four original courses and changes nothing else: how the game plays, every layout, every mode and the multiplayer server are V10's (see *V11* below). V10 added two worlds: **Verdant Canopy**, a jungle of trees taller than mountains, raced through roots, branches, the canopy, floating platforms and a spiral round the Elder Tree, and **Orbital Nexus**, an orbital megastation whose gravity plating turns the deck to the walls and the ceiling; in a championship you pick its six courses from all eight (see *V10* below). V9 added two worlds: **Pelagos**, an ocean world under a storm sky whose course flies two full 360° vertical loops above the waves, and **Ignara**, a volcanic world of lava rivers, lava falls, a rock tunnel and an erupting volcano (see *V9* below). V8 added online multiplayer: a two-stage tournament against real pilots on their own devices (a five-lap qualifier for everyone, then a five-lap final for the top two), run by a multiplayer server that is included but **not deployed** (see *V8* below). V7 added a career: Credits and Style Tokens earned in every race, a Rookie → Pro → Ace championship ladder with completion bonuses, real ship upgrades, a paint shop that works on the 3D ships, an inventory and an in-game cosmetic shop (see *V7* below; there are no real-money payments). V6 was a visual-quality and performance pass over V5: the two views that V5 made slower are fixed at their measured causes, asteroids get fractured silhouettes and geological materials, Neon Spire's curved towers get real facades, the fleet gains two original ship classes with baked hangar lighting and moving turrets, and planets get atmospheres, clouds, storms and lineae (see *V6* below). V5 rebuilt the environments and the rendering around them: capital ships, asteroids, planets, lighting and atmosphere, Neon Spire's facades, and level of detail with occlusion culling. V4 rebuilt Neon Spire's architecture and all five spacecraft, V3 the world's materials and V2 the renderer. Every ship, course, pilot, brand, script, logo, piece of music and sound is original; there are no external images, models or audio.

## Play

- **In the browser:** open the published artifact "Galactic Rush V12" ([claude.ai/artifact/7QLGPs4dRyidQRDro4CLWa](https://claude.ai/artifact/7QLGPs4dRyidQRDro4CLWa); V11's artifact stays as it was). Everything single-player works there, on all eight courses and at all six difficulty levels, as a guest (careers saved in the browser): the artifact viewer blocks network connections, so accounts and online play need the website.
- **Accounts and online multiplayer:** the game on GitHub Pages (or any HTTPS host) with the V12 server running and a Firebase project set up; see *Deployment* in *V12*. Until then the V11 site and server stay as they are.
- **Offline:** open `dist/galactic-rush-v12.html` in Chrome, Edge, Firefox or Safari. It is one self-contained file with no external code; only its three typefaces come from Google Fonts, and the layout falls back cleanly without them.
- **V11:** `dist/galactic-rush-v11.html` (byte for byte the published file), and on the website at `/v11/` once V12 is published.

Needs WebGL2 and a keyboard or a standard gamepad. Sound starts after your first click, key or button press.

### Develop

Node 18+. The game has zero npm dependencies; the V8 multiplayer server has one (`ws`, installed with `npm install --prefix server`).

```
npm start          # dev server with live ES modules: http://localhost:5173/
npm run build      # bundles src/ into dist/galactic-rush-v12.html (+ an artifact variant and dist/site/ for GitHub Pages; V11's site files are kept in dist/site-v11/); GR_MP_SERVER=wss://… sets the server, GR_FIREBASE_API_KEY and GR_FIREBASE_PROJECT_ID the accounts
npm test           # simulation, geometry, V7 progression, upgrade-physics, V8 multiplayer-rule, V9 and V10 course and V10 championship tests (node:test)
npm run server     # V8: the multiplayer server on ws://localhost:8787 (after npm install --prefix server)
npm run test:mp    # V8: the real server with several real WebSocket clients: lobbies, tournaments, reconnection, cheating
npm run test:accounts   # V12: the account server, its API and online play with accounts, against a local stand-in for Google's services (in CI also against the Firebase emulators: .github/workflows/v12-checks.yml)
node tests/account/e2e.mjs OUT/   # V12: accounts end to end in Chromium (after node build.mjs): three devices, registration to password reset, offline, conflicts
node tests/v12-difficulty.mjs [courses] [seeds] [laps] [handling]   # V12: lap times, winners' times and respawns of the six difficulty levels
node tests/v11-frozen.mjs V11_SOURCE_ROOT   # V12: the six courses V12 did not change must be identical to V11's (course data and whole race replays)
python3 tests/mp/e2e.py dist/galactic-rush-v11.html OUT/   # V8: three browser games play two tournaments against a local server (Python Playwright + Chromium); ELIGIBLE_TRACKS=canopy,nexus for the V10 courses
python3 tests/v11-framecost.py BUILD.html [courses] [preset] [OUT.json] [fractions] [frames]   # V11: frame cost of courses from fixed chase cameras, every frame finished before the clock is read (for comparing two builds)
python3 tests/v11-costsplit.py BUILD.html COURSE 0.25,0.75 [preset] [WxH]; python3 tests/v11-shaderprobe.py BUILD.html COURSE 0.5 medium SPEC.json [WxH]   # V11: where a course's frame goes by shader program; what a part of a shader costs
node tests/v11-frozen.mjs V10_SOURCE_ROOT   # V11: this source against a V10 source tree: every course's complete course data and whole race replays must be identical
GR_BUILD=dist/galactic-rush-v11.html python3 tests/v10-playtest.py …   # the playtests below run the build of their own version unless GR_BUILD names another
python3 tests/v9-playtest.py menus|champ6|loops|trial|settings|bench OUT/   # V9: the new courses in the built game (menus, six-round championship, in-game loop frames, time trial ghosts, every graphics setting, benchmark)
python3 tests/v10-playtest.py menus|champ|canopy|nexus|trial|settings|bench OUT/   # V10: the new courses in the built game (menus, the championship picker and a whole run on a picked calendar, in-game frames and announcements through every section and gravity change, time trial ghosts, every graphics setting, benchmark)
node tests/v10-wrecks.mjs; node tests/v10-notices.mjs   # V10: AI wrecks and lap times on the new courses; the courses' own announcements over two laps
python3 tests/v10-fixedcost.py BUILD.html [courses] [preset] [OUT.json]; python3 tests/v10-costsplit.py BUILD.html canopy 0.25,0.75   # V10: every course from the same fixed chase cameras; where a course's frame goes
node tests/v9-loops-matrix.mjs; node tests/v9-wrecks.mjs   # V9: every ship through the loops; AI wrecks per course
python3 tests/framecost.py BUILD.html foundry,pelagos; python3 tests/buildcost.py BUILD.html foundry,pelagos   # V9: CPU per frame without drawing; course build times
node tests/economy.mjs                                  # V7: real race lengths -> credits per minute and upgrade pacing
python3 tests/progression.py dist/galactic-rush-v11.html OUT/   # V7 end to end: rewards, championships, garage, shop, paint, premium
python3 tests/paintsheet.py dist/galactic-rush-v11.html OUT/    # V7 paint jobs on the 3D ships (sheets + pixel checks)
python3 tests/v6look.py V6.html dist/galactic-rush-v11.html OUT/   # V7: stock ships render exactly as in V6
python3 tests/shipbench.py OUT.json V6.html dist/galactic-rush-v11.html   # V7: frame times with stock and custom paint jobs
python3 tests/playtest.py races|flow|ghost|champ|bench|moments   # browser playtests (Python Playwright + Chromium)
python3 tests/compare.py OLD.html dist/galactic-rush-v10.html tests/specs/matched-v6.json OUT.png   # the same views in two builds, side by side
python3 tests/views.py dist/galactic-rush-v10.html tests/specs/capital-v6.json OUT.png   # labelled sheets (capital, asteroids, planets, city, ships, courses)
python3 tests/vis.py dist/galactic-rush-v10.html   # occlusion, LOD hysteresis, LOD bias and capital cross-fade checks
python3 tests/settings.py dist/galactic-rush-v10.html   # every preset and graphics toggle switched at runtime
python3 tests/fixedbench.py OUT.json OLD.html dist/galactic-rush-v10.html   # synchronised fixed-camera benchmark; tests/perftable.py OUT.json OLD.html NEW.html makes the table
python3 tests/perfprobe.py dist/galactic-rush-v10.html --views=ring-plane   # synchronised timing of single views
python3 tests/bench.py spire OLD.html NEW.html    # every preset on one course, for comparing builds
python3 tests/handsoff.py                         # Relaxed vs Classic handling with no input
python3 tests/shots.py OUT.png "track=belt&quality=high&ff=9"   # screenshot any race moment
```

URL parameters (developer and test use; the artifact viewer ignores query strings): `mp=ws://host:port` (V8: multiplayer server, local and LAN pages only), `quality=low|medium|high|ultra`, `track=foundry|belt|spire|ring|pelagos|ignara|canopy|nexus`, `laps`, `ship=0..4`, `diff=rookie|pro|ace`, `skipmenu=1&mode=quick|trial|champ` (a championship started this way runs on V9's calendar), `autotest=1` (AI flies your ship), `nointro=1`, `ts=` (time scale), `view=hangar`, `gallery=1` (Neon Spire archetype lineup, Cinder Belt asteroid lineup), and `bench` / `bench=short` (see below).

### Benchmark

In the published artifact, open its link with `#bench` (or `#bench-short`) appended; the offline file also accepts `?bench`.

Open the game with `?bench` (a full autopilot lap of Foundry Trench per preset) or `?bench=short` (12 seconds per preset); `&track=pelagos` (any course id) benchmarks another course. It runs Low, Medium, High and Ultra in turn and shows average FPS, 1%-low FPS, median and 95th-percentile frame time, draw calls and triangles for each, plus your GPU name; `window.__bench` also holds the instance counts (considered, drawn, frustum-, occlusion- and size-culled). Limit presets with `&presets=medium,high`. Results are also logged to the console and kept in `window.__bench`.

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

## V12: six difficulty levels, player accounts, Verdant Canopy's trees, new obstacles on Pelagos and Orbital Nexus

V12 is a new, independent version. V11 stays available unchanged: its file `dist/galactic-rush-v11.html` is byte for byte the published one, its site (`dist/site-v11/`, byte for byte the page and `config.js` your site serves today) moves to `/v11/` when V12 goes live, it keeps talking to its own server (the V11 service on Render, which stays as it is), and it keeps its own saves in the browser (V12 uses new keys; on its first start it copies the V11 career, records and settings once and never writes to V11's keys).

### Six difficulty levels

Rookie, Pro and Ace are exactly V11's rivals (same code path, same parameters; whole races replay bit for bit as in V11 on the six courses V12 did not change, `tests/v11-frozen.mjs`). Three new levels drive with a separate, more precise driving profile (`src/sim/ai.js` `update12`, parameters in `src/config.js` `DIFFICULTY`):

| Level | What makes it faster |
|---|---|
| Elite | later braking, a cleaner line (steering gain and damping, less wobble), boost used in full bursts where the straight is long enough, more clearance from walls and obstacles |
| Master | Elite's driving tightened further; the rivals' ships carry one level of every upgrade |
| Legend | the most precise profile (no wobble, the hardest steering), three levels of every upgrade |

There is no rubber-banding and no cheating: a level's parameters are fixed before the start and never react to the player's position; every rival flies with the same flight model, collisions and boost rules as the player; the upgrades of Master and Legend are the ones a player can buy in the garage (`effectiveDef`). Each level has a one-line description on the course screen.

Measured with `node tests/v12-difficulty.mjs` (AI-only quick races through the real race simulation, the rivals built exactly as the game builds them; 3 laps, five seeds per cell):

**Relaxed handling** (the default): mean lap of all five rivals / the winner's race time / respawns per race, in seconds

| course | Rookie | Pro | Ace | Elite | Master | Legend |
|---|---|---|---|---|---|---|
| Foundry Trench | 43.8 / 123.7 / 10.2 | 42.2 / 121.7 / 10.0 | 41.5 / 119.5 / 11.6 | 39.2 / 115.6 / 9.6 | 38.4 / 111.9 / 6.2 | 36.6 / 106.4 / 5.8 |
| Cinder Belt | 44.2 / 127.1 / 3.6 | 42.7 / 123.6 / 3.4 | 42.0 / 123.1 / 2.6 | 39.0 / 114.3 / 4.0 | 37.9 / 111.4 / 2.0 | 37.3 / 108.2 / 3.4 |
| Neon Spire | 39.0 / 112.5 / 5.2 | 37.4 / 104.9 / 3.4 | 36.9 / 106.0 / 5.6 | 34.0 / 96.0 / 4.0 | 32.7 / 94.7 / 4.6 | 29.9 / 84.0 / 0.2 |
| Halo of Vashti | 63.4 / 179.5 / 0.6 | 61.3 / 170.5 / 0.2 | 60.0 / 167.5 / 0.2 | 54.7 / 156.4 / 0.6 | 53.6 / 153.1 / 0.0 | 52.0 / 148.1 / 0.0 |
| Pelagos | 60.9 / 171.2 / 0.0 | 58.6 / 164.8 / 0.0 | 57.4 / 161.4 / 0.2 | 53.2 / 152.9 / 0.2 | 51.5 / 147.6 / 0.0 | 48.3 / 137.0 / 0.0 |
| Ignara | 45.4 / 130.8 / 1.2 | 44.1 / 126.8 / 1.0 | 43.2 / 121.8 / 0.8 | 39.7 / 116.5 / 1.2 | 38.8 / 113.2 / 1.0 | 36.5 / 102.7 / 0.4 |
| Verdant Canopy | 66.1 / 189.0 / 2.2 | 63.3 / 178.1 / 1.2 | 62.4 / 178.0 / 1.8 | 57.7 / 169.0 / 4.2 | 56.9 / 166.5 / 4.4 | 54.7 / 157.1 / 3.0 |
| Orbital Nexus | 50.1 / 141.2 / 2.2 | 48.0 / 139.9 / 0.8 | 47.3 / 136.0 / 1.6 | 43.9 / 125.2 / 0.2 | 42.5 / 121.2 / 0.2 | 40.6 / 116.5 / 0.2 |

**Classic handling** (V1): mean lap of all five rivals / the winner's race time / respawns per race, in seconds

| course | Rookie | Pro | Ace | Elite | Master | Legend |
|---|---|---|---|---|---|---|
| Foundry Trench | 35.7 / 103.9 / 14.6 | 34.4 / 98.9 / 12.4 | 34.2 / 98.9 / 14.6 | 32.6 / 93.1 / 13.2 | 31.8 / 92.0 / 12.0 | 30.0 / 87.3 / 12.2 |
| Cinder Belt | 38.1 / 106.9 / 24.8 | 36.8 / 104.8 / 25.0 | 36.8 / 99.5 / 26.4 | 35.1 / 95.5 / 25.2 | 33.8 / 94.3 / 22.0 | 33.4 / 92.9 / 25.2 |
| Neon Spire | 29.6 / 83.0 / 9.4 | 28.8 / 81.0 / 11.0 | 27.9 / 79.6 / 8.6 | 26.8 / 77.6 / 7.2 | 26.7 / 77.5 / 10.0 | 23.3 / 67.6 / 2.0 |
| Halo of Vashti | 48.6 / 141.5 / 6.8 | 48.0 / 140.1 / 8.8 | 46.7 / 135.4 / 8.0 | 43.6 / 127.3 / 9.6 | 41.3 / 120.4 / 3.2 | 40.4 / 115.8 / 3.6 |
| Pelagos | 46.4 / 135.4 / 4.4 | 44.9 / 132.4 / 5.4 | 44.0 / 129.5 / 6.2 | 41.3 / 119.8 / 5.6 | 39.8 / 117.5 / 4.2 | 36.8 / 106.0 / 1.8 |
| Ignara | 35.6 / 103.4 / 6.2 | 34.4 / 97.4 / 6.4 | 34.3 / 97.6 / 7.6 | 31.5 / 91.1 / 7.6 | 30.3 / 87.4 / 6.0 | 27.7 / 79.4 / 1.4 |
| Verdant Canopy | 52.2 / 154.6 / 13.8 | 50.4 / 147.6 / 13.2 | 49.5 / 145.8 / 14.0 | 47.0 / 137.7 / 15.2 | 46.0 / 136.1 / 14.4 | 43.6 / 126.7 / 14.2 |
| Orbital Nexus | 39.1 / 114.6 / 3.6 | 38.1 / 110.1 / 5.0 | 37.7 / 109.1 / 7.0 | 35.7 / 104.8 / 4.0 | 33.8 / 98.2 / 2.4 | 32.2 / 92.3 / 1.8 |

What the tables show:
- **Elite, Master and Legend** are each faster than the level below on every course in Relaxed handling (the default), in the rivals' mean lap and in the winner's time: Elite's rivals lap 5–9 % faster than Ace's, Master's another 1–4 %, Legend's another 2–9 %; Legend's rivals lap 11–19 % faster than Ace's and its winners finish 11–21 % sooner. In Classic handling, too, each of the three is faster than the level below on every course, in both numbers; the smallest step is Master over Elite on Neon Spire (0.4 % in the mean lap, 0.1 % in the winner's time: Master's upgraded ships crash more there).
- **Rookie, Pro and Ace** are V11's levels, unchanged on purpose (the original three keep their relative difficulty): their spacing is V11's, and small between Pro and Ace: in Classic handling on Cinder Belt and Ignara their mean laps are within 0.1 s, and a winner's time is not always shorter at Ace than at Pro (one race per seed decides it).
- **Crashes** are the rivals' own: they hit walls and obstacles under the same rules as the player. Classic handling is the V1 flight model; every level crashes more in it, as in V11.
- **Legend can be beaten:** a pilot flying exactly Legend's driving profile alone on the course in a fully upgraded ship laps faster than Legend's winners (`node tests/v12-solo.mjs`: in the best ship for each course, upgrades at level 5, Relaxed handling, its average lap over three laps is 3.5–6.7 % shorter than the average lap of Legend's winners in the table), so a player who drives that well, with the garage's upgrades and good boost use, wins.

Rewards: the Rookie–Ace rewards, prices and costs are V11's, unchanged. The three new levels need reward values of their own; they continue V11's progression (race factors 1.9 / 2.2 / 2.5, championship completion 1,600 / 2,000 / 2,400 CR, 7 / 9 / 11 ST), and the championship ladder unlocks them in order after Ace.

### Player accounts

**For the player.** *Account* in the main menu: register with an email address and a password (8+ characters, letters and a digit), confirm the address through the link Firebase emails, log in, reset a forgotten password by email, log out. A chip next to the wallet always says where the career is saved: *Guest* (this browser only), *Synced*, *Saving…*, *Offline* or *Verify email*. Signed in, the career (credits, Style Tokens, upgrades, cosmetics, paint jobs, championships and their unlocks, statistics, milestones), course records, ghosts, gameplay and control settings and the pilot name are the account's and follow the player to any device; graphics settings stay with each device.

**The first sign-in on a device** never changes that device's career without asking:
- the account has no career and the device has none: the account starts a new one;
- the account has no career and the device has one: *Bring this career to my account* (checked, stored, then verified: the server's copy must equal what was sent, by digest, before the device switches) or *Start a new career on the account*;
- the account has a career and the device has a different one: both are shown side by side (credits, tokens, races, upgrades, items, championships, records, last change). *Play the account's career* (the default) or *Replace the account's career with this device's* (asked twice; the server keeps the replaced career as a backup). Careers are never merged, because merging could pay rewards twice.
The device's own career is never deleted: it stays as the guest career, and a copy of what was sent is kept in the browser. Repeating an import (a lost connection, a second click) changes nothing: every import has an id.

**How it works.**
- *Sign-in* is Firebase Authentication (email and password), called from the browser through Firebase's REST API: registration, the verification email, log-in, password-reset emails (single use, time-limited links handled by Firebase), session tokens. Passwords go only to Firebase, which stores them hashed; the game never stores, logs or forwards them. The browser keeps Firebase's refresh token (so a reload stays signed in) and holds the one-hour ID token in memory; log-out deletes both. The Firebase Web API key and project id in `config.js` are public identifiers, not secrets (Firebase sends them to every browser).
- *The account server* is the V12 server (`server/`), the same service that runs online multiplayer. Every account request carries the player's ID token, which the server verifies itself (RS256 against Google's published certificates, audience, issuer, expiry, sign-in time, subject: Firebase's documented procedure, Node's own crypto). Only accounts with a verified email hold a career. The server reaches Cloud Firestore with a service account (Google's OAuth flow for servers); the key exists only as a Render environment variable.
- *The server is authoritative.* It runs the game's own career code (`src/progress`, the same transactions, prices, upgrade costs, reward formulas, unlock rules and one-time payout ledger) on the account's copy. The game never sends balances: it asks for operations (buy this upgrade at this level, buy this item, set this paint job, select this ship, start or abandon a championship) and shows the server's answer. On screen a purchase happens at once and is confirmed (or undone, with a message) by the server; while the server cannot be reached nothing can be bought.
- *Races* are paid against tickets: when a race starts, the server issues a ticket that fixes what decides the reward (mode, course, difficulty, laps, ship, field, championship round). The result is paid once per ticket, only if it is physically possible (no lap faster than the course length at 450 m/s, no race reported sooner than it can be flown, places within the field, championship rounds in order), and the server decides whether a lap is a record. Online tournaments are paid into the account by the multiplayer server itself, from its own results, once per tournament.
- *Data* in Firestore: `players/{uid}` (career, records, settings, pilot name, revision), with `tickets/`, `ghosts/` and `backups/` below it. No email address, password or token is stored by the game. Every change is a read-check-write with the document's version as the write condition, so two devices (or two server processes) changing one account at once never overwrite each other. Firestore's security rules (`firestore.rules`) let no browser read or write anything; only the server does.
- *Rate limits:* the account API limits requests per IP address and per account (and imports, race starts and ghost uploads separately); Firebase Authentication applies its own abuse limits to sign-up, log-in and email sending; the game waits 3, 6, 12 … 60 s after failed log-ins and 60 s between emails to the same address. Log-in and password-reset messages never say whether an address has an account.
- *Online:* a signed-in pilot's hello carries the ID token; the server ties the session to the account (other pilots never see it). Guests play exactly as before. Multiplayer protocol 4: V12 games play only with V12 servers.

### Verdant Canopy's trees

The V11 forest placement checked trunks against the corridor only roughly, so 49 trees stood partly inside the corridor with no collision: ships flew through their trunks. V12 checks each trunk densely before placing it (every 4 m along its full height, with its real radius, flare and buttress fins, and 1.5 m to spare). 54 trees change: 3 now stand upright instead of leaning toward the corridor, and 51 are left out (the 49 that reached into it and a few that came within 1.5 m); the other 7,141 are unchanged (the random draws are kept, so the forest is the same everywhere else). These are trees of the background forest, which never had collision, not obstacles of the course: the course's solid trees are its colossal trees, whose trunks, buttresses, limbs and roots collide where they are drawn (V10's collision spheres, unchanged). Giving the 49 collision would have added unplanned obstacles to the course and changed its simulation for every client and the server, so V12 keeps the forest out of the corridor instead.

`node tests/v12-canopy-audit.mjs` checks all of Canopy's wood against the simulation's solids: every forest trunk and limb, the colossal trees with their buttresses, limbs and roots, the decks and bridges, sampled every metre. On V12 it finds no forest tree reaching into the corridor and no solid-looking wood there without collision (on V11's source: 49 forest trees, with 1,908 one-metre samples of trunk in the corridor and no collision); `npm test` runs it (`tests/v12-canopy.test.js`). Two kinds of thin, vine-coloured wood stay passable, as in V10 and V11: the curtains of vines in the corridor (soft vegetation that bursts as ships pass) and the cords along the three short plank bridges (0.5 m thick, 1.8 m above the floor). Collision exists only in the simulation, which has no levels of detail and does not depend on the camera or the graphics settings, so every client and the server collide with the same solids at every distance and setting. The simulation is unchanged: Canopy's course data and race replays are identical to V11's, and the tunnelling test (`tests/v12-collision.test.js`) flies ships at every one of its solids.

### New obstacles on Pelagos and Orbital Nexus

**Pelagos** (the extraction-rig ocean): a production riser under the skim deck, standing in the corridor at the deck's front edge (its twin stands beside the corridor); a crane barge in the island lagoon whose subsea load swings across the upper corridor on its cable; two spar buoys in the swell that bob with the waves; a pipe rack across the return leg (a low pipe to fly over or under) with a support leg. They are drawn in the rigs' own marine steel with hazard bands where a ship can hit them, lamps, clamps and splash collars.

**Orbital Nexus** (the megastation): a servicing arm swinging from a roof gantry in the hangar (always clear below it); blast-door leaves closing in from both walls at the bulkhead; a coolant conduit across the energy core; the airlock's service main running from the wall into the deck; the Spindle's sweeper, an arm turning on a ring round the shaft through a slot in its wall; a docking arm and a radiator truss on the exterior run. Drawn in the station's plating with hazard stripes and warning lights; the moving parts turn with the race clock.

Every one is solid exactly where it is drawn, is checked against tunnelling at 150–420 m/s from five angles (`tests/v12-collision.test.js`: no ship passes through any obstacle on any course), reaches into the corridor, leaves a free passage of a ship plus margin at every moment of its motion, stands clear of checkpoints, and moves as a function of the race clock alone (identical on every client and the server). Placement was tuned with AI fields at all six levels in both handling modes so the obstacles force line choices without walling off the course; nothing outside these additions changed on either course.

### Deployment (needs your accounts: nothing here is live yet)

V12 is on the review branch `v12-dev` with a pull request; nothing is merged and nothing is deployed. Production (your Pages site and the V11 server) is untouched. To try V12 and then publish it:

1. **Firebase project** (console.firebase.google.com): create a project; *Authentication → Sign-in method*: enable *Email/Password*; *Authentication → Settings*: keep *Email enumeration protection* on, set the *password policy* to at least 8 characters, add `jonathanimhof-hr.github.io` and `galactic-rush-v12.onrender.com` to *Authorized domains*; *Firestore Database*: create it (production mode) and replace its rules with `firestore.rules`; *Project settings → General*: note the *Web API key* and the *project id*; *Project settings → Service accounts → Generate new private key*: a JSON file. That file is a secret: it goes only into Render (step 2), never into GitHub or a chat.
2. **Render, a new service for V12** (the V11 service stays as it is): *New → Blueprint* → this repository, Blueprint file `render-v12.yaml` (or a Web Service by hand with the same settings). Enter `FIREBASE_PROJECT_ID`, `GR_FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (paste the whole JSON file) and `ALLOWED_ORIGINS=https://galactic-rush-v12.onrender.com`. It builds from `v12-dev` and also serves the V12 game at `https://galactic-rush-v12.onrender.com/` for testing (Render shows the service's address on its page; if it gave the service a different one, use that address wherever these steps say `galactic-rush-v12.onrender.com`); `/health` must show `"version":"12.0.0"`, `"protocol":4`, `"accounts":"firestore"`.
3. **Test** on that address: register, verify, log in on two devices, buy something, race, log out.
4. **Publish, after your approval:** first switch the *V11* Render service's branch from `main` to `v11-release` (so it keeps V11's server when main changes); set the repository variables `GR_MP_SERVER_V12=wss://galactic-rush-v12.onrender.com`, `GR_FIREBASE_API_KEY` and `GR_FIREBASE_PROJECT_ID`; in *Settings → Pages* set *Source: GitHub Actions* (so only the workflow publishes: today every push to `main` is also published straight from the branch, the *pages build and deployment* runs, which after the merge would serve V12's source files without the server and Firebase settings); add `https://jonathanimhof-hr.github.io` to the V12 service's `ALLOWED_ORIGINS`; switch the V12 service's branch to `main`; then merge the pull request. The workflow tests, builds and publishes V12 at the site root and V11 at `/v11/`; without the variables it stops and the site stays as it was.

To go back: revert the merge on main (the workflow republishes V11), and point the V11 service back to `main` if you like; no player data is touched either way (accounts live in Firestore, guest careers in each browser).

### What changed in files
New: `src/account/` (sign-in client `firebase.js`, account server client and session `api.js`, the signed-in career `cloud.js`, the account controller `controller.js`, screens `ui.js` and `style.js`, shared rules `rules.js`); `server/account/` (`google.mjs` token and service-account checks, `firestore.mjs` database, `players.mjs` the authoritative careers, `http.mjs` the API); `src/sim/solids.js` (obstacle parts and moving arms); `firestore.rules`, `firebase.json`, `render-v12.yaml`, `config.js` (V12 placeholders), `.github/workflows/v12-checks.yml`; tests `tests/account/*`, `tests/v12-collision.test.js`, `tests/v12-obstacles.test.js`, `tests/v12-canopy.test.js`, and the measuring tools `tests/v12-difficulty.mjs`, `tests/v12-solo.mjs`, `tests/v12-canopy-audit.mjs`; `dist/site-v11/` (V11's site files).

| File | Change | Why |
|---|---|---|
| `src/config.js`, `src/sim/ai.js`, `src/sim/race.js`, `src/main.js` | three new levels with their driving profile and upgrades | difficulty |
| `src/ui.js`, `src/ui-garage.js`, `index.html` | the six-level selector with a line on each level, the six-level championship ladder and career line | difficulty |
| `src/progress/economy.js`, `profile.js`, `rewards.js`, `index.js`, `store.js` | rewards and the ladder for the new levels (Rookie–Ace unchanged); profile version 2; V12's own career keys with a one-time copy of V11's; a run id from the caller; `adopt` (the server's copy) | difficulty, accounts, V11 independence |
| `src/sim/track.js`, `tracks-v9.js`, `tracks-v10.js` | rotating parts; the Pelagos and Nexus obstacles appended after the V11 ones | obstacles |
| `src/render/courses/pelagos.js`, `nexus.js`, `canopy.js` | the obstacles' visuals; the dense trunk check | obstacles, Canopy fix |
| `src/input.js` | V12's own save key (records, ghosts, settings) with a one-time copy of V11's; an account's own slot | V11 independence, accounts |
| `src/ui.js`, `src/ui-garage.js`, `src/mp/*`, `src/main.js` | the account menu entry and status chip, the save-data text, reward status; online pilots linked to accounts, rewards paid by the server | accounts |
| `server/index.mjs`, `config.mjs`, `hub.mjs` | the account API and its configuration; version 12.0.0, protocol 4; tournament rewards paid into accounts | accounts |
| `build.mjs` | V12 names; the Firebase settings in `config.js`; `same-origin`; `--require-online`; the build stops on an import line it cannot bundle | accounts, deployment |
| `.github/workflows/pages.yml` | V12 at the root, V11 at `/v11/`; account and server tests before publishing | deployment |
| `tests/progression.test.js`, `tests/v9-maps.test.js`, `tests/v10-maps.test.js`, `tests/mp/*` | six levels; network requests allowed in the two account modules only; V9's hazard rules applied to V9's hazards (V12's have their own test); Pelagos's V9 replays no longer apply (its course data without V12's obstacles still equals V9's) | the new features |

### Tests (everything below was actually run, on this build)
- `npm test`: 150/150 tests pass. Besides the earlier versions' tests (simulation, geometry, career and economy, upgrade physics, multiplayer rules, the V9/V10 courses, the V10 championship): the six levels in the career and rewards (Rookie–Ace exactly as before); **collisions** (`v12-collision.test.js`: a ship flown at every solid obstacle of every course, Verdant Canopy's included, at 150, 250, 350 and 420 m/s, head-on and at four angles, through the game's own collision code: no ship passes through any obstacle); **the new obstacles** (`v12-obstacles.test.js`: every one reaches into the corridor, a ship plus margin always has a free passage at every moment of the moving ones' cycles, no obstacle within two samples of a checkpoint, motion a function of the race clock only and equal in a second, fresh build of the course, and full Rookie and Legend fields finish two laps on both courses in both handling modes); **Verdant Canopy** (`v12-canopy.test.js`: the wood audit below on this source); network requests only in the two account modules, no payment code anywhere.
- `npm run test:mp`: 13 tests pass (the real server, version 12.0.0, protocol 4, with real WebSocket clients flying the game's own simulation: the health check, lobbies, whole tournaments (also on Pelagos and Ignara, and on Verdant Canopy and Orbital Nexus, with V12's obstacles), reconnection and a server restart, hostile and cheating clients, two lobbies at once, the origin check; older games are turned away).
- `npm run test:accounts`: 10 tests pass, 1 skipped. The skipped one runs against Firebase's own emulators (Authentication and Firestore), which need the Firebase CLI and the emulator programs it downloads; this machine cannot install or download them (no network for that), so it runs in CI (below). The ten: Firebase ID tokens (genuine ones pass; expired, another project's, tampered, unsigned, unknown key, malformed: refused; Google's certificates cached); the service account's sign-in and Firestore's REST API (conditional writes, conflicts, lists, value types); careers (operations applied once, unknown operations refused, a purchase from an outdated screen refused); imports (stored career verified by digest, repeated imports change nothing, never merged, replacing keeps a backup, four kinds of edited careers refused and nothing stored); races (too soon, too fast, out-of-range place, unknown or expired ticket: refused; paid once; records filed; ghosts only for the record lap; championship rounds in order); settings, pilot name, a tournament reward paid once, an unreadable stored career never replaced; two devices and two server processes changing one account at once (no change lost); the HTTP API (sign-in required, verified email for careers, CORS for the game's site only, size and content-type limits, rate limiting); the server refuses to start in production without a service account or with test-only settings; online play (a signed-in pilot linked, a guest unchanged, a forged token refused, the tournament reward paid into the account once by the server).
- `node tests/account/e2e.mjs` (after `node build.mjs`): **39/39 checks pass**. The built game in Chromium (Playwright), separate browser profiles as separate devices, through the game's own screens, against the V12 server with the account API and a local stand-in for Google's services (the paths of Firebase's emulators; generated test passwords, `example.test` addresses): weak and mismatched passwords refused before anything is sent; registration and the verification email; the account unverified until the link is opened; bringing the device's career to the account (the server's copy equals it by digest, the guest career untouched, the record's ghost uploaded); a purchase applied once at the game's price; a race paid by the server once with its best lap filed; a race without a ticket not credited, and the game says so; a wrong password gets one general message and a second try is slowed down; a second device gets the career, upgrade, record and ghost; a career edited in the browser's storage is replaced by the account's on reload; the same purchase from two devices at the same moment is applied once; settings follow the player; offline, purchases are refused with an explanation and nothing changes, the main menu says Offline (status chip and Account entry), and the game syncs again when back online; a third device with a different career is shown both careers and plays the account's while its own stays its guest career; log-out returns to the untouched guest career and removes the session; password reset answers the same whether or not the address has an account, ends the other device's session, the old password stops working and the new one works; no password and no ID token in any device's storage; no page errors.
- CI (`.github/workflows/v12-checks.yml`) on the review branch: runs on every push to the review branch (`npm test`, `test:mp`, `test:accounts`, the Firebase-emulator test, the build); its result is shown on the pull request.
- `node tests/v11-frozen.mjs` against V11's source: Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti, Ignara and Verdant Canopy are identical to V11 (complete course data, and whole races replayed in both handling modes with the player and five Rookie–Ace-path rivals); Pelagos and Orbital Nexus differ, as intended.
- `node tests/v12-difficulty.mjs`: the tables above (480 races; measured again on the final code: identical to the last digit). `node tests/v12-solo.mjs legend` (upgrades at level 5): the lone-pilot laps quoted above.
- `node tests/v12-canopy-audit.mjs`: on V12, no forest tree in the corridor and no solid-looking wood there without collision (PASS); on V11's source, 49 forest trees in the corridor (FAIL, as expected).
- In the built game: the course screen offers all six levels with their descriptions, the championship and career screens show the six-level ladder (Elite, Master and Legend unlock in order after Ace); no page errors.
- Looked at (rendered in headless Chromium with software WebGL): every new obstacle on Pelagos (8 views) and Orbital Nexus (9 views, 3 of them again after changes), Verdant Canopy at four places where V11 had trunks in the corridor (V11 and V12 side by side: the trunks are gone, the rest of the view is the same), and every account screen.
- V11 is untouched: `dist/galactic-rush-v11.html` and `-artifact.html` are byte for byte the files on `main`; `dist/site-v11/` is byte for byte the `index.html` and `config.js` your site serves.
- Scene size (each course built in Node with a counting stand-in for the renderer, V11's source against V12's; whole course, every level of detail, not what one frame draws): the new obstacles add 8 meshes and 41,256 triangles to Pelagos (+6.8 %) and 5 meshes and 22,636 triangles to Orbital Nexus (+5.7 %); Verdant Canopy has the same meshes and triangles and 791 fewer tree instances. No shader or graphics system was added or changed.

**Not performed** (so not claimed):
- Anything against your Firebase project or the V12 Render service, which do not exist yet (*Deployment*, steps 1–3): Firebase's real verification and reset emails, the deployed server, online play between deployed V12 games.
- The Firebase-emulator test on this machine (no network here to install the Firebase CLI and its emulators); CI runs it (above).
- Frame-time measurements of V12 (the scene sizes above are the only performance figures).
- A person playing V12: every race in these tests was flown by the game's autopilot and AI pilots.

### Limitations
- **Single-player results are reported by the game.** The server fixes everything that decides a reward when a race starts, pays each race once and refuses results that are physically impossible or reported too soon, but it cannot prove that a modified game really won the race it reports. The most a modified game can get is what winning every race at full speed would pay, at the pace races can be flown. Online tournaments are not affected (the server pays them from its own results).
- **A career brought from a browser cannot be verified.** It was made offline, so the server checks it with the game's own load checks and the bookkeeping every real career keeps (balances equal earnings minus spending, the credits spent cover the upgrades owned, the race statistics add up) and refuses edited ones that break it; a carefully forged, internally consistent career would pass. Each account accepts it only by an explicit choice, never merged.
- **Registration reveals whether an address is taken** (Firebase answers sign-up for an existing address with an error, and the game says it cannot use that address). Log-in and password reset never reveal it.
- **Firebase enforces its own password rules on its side.** The game asks for 8+ characters with letters and a digit; set the same in Firebase's password policy (step 1), or Firebase's default (6 characters) applies to requests made outside the game.
- **The account system has been tested against a local stand-in for Google's services and, in CI, against Firebase's own emulators (see Tests), not yet against your Firebase project and Render service** (they do not exist yet). That last test needs the setup above (step 3).
- **Offline, races are not credited.** A race whose ticket the account server cannot issue pays nothing, and the game says so at once, during the race; purchases wait until the server is back. A race that had its ticket and finished while the connection dropped is kept on the device and sent when the connection is back.
- **The free Render plan sleeps** after 15 idle minutes; the first request then takes about a minute (the game keeps the server awake while a player is signed in, and a race ticket waits up to 70 s for it).
- **Accounts do not work in the claude.ai artifact** (the viewer blocks network requests); there the game plays as a guest, as before.
- **No account deletion in the game yet.** Accounts can be deleted in the Firebase console (Authentication) together with the `players/{uid}` document.

## V11: a visual pass over Pelagos, Ignara, Verdant Canopy and Orbital Nexus

V10 is the baseline and is treated as frozen. V11 changes **how four courses look** — the two V9 worlds and the two V10 worlds — to bring them to the level of the four original courses (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti), and it changes nothing else. No layout, racing line, corridor, checkpoint, start grid, boost ring, obstacle, collision shape, respawn point, ship, handling mode, physics or gravity rule, camera, mode, reward, menu, sound, multiplayer rule or line of the renderer was touched: the simulation (`src/sim/`), the multiplayer client and server, the renderer (`src/render/gfx.js` and every shared renderer module), the menus and the four original course builders are byte-identical to V10 (*What changed in files* lists every changed file; *Tests* shows that all eight courses carry V10's course data, value for value, that whole races on them replay bit for bit as in V10, and that the four original courses hand the renderer exactly what they did in V10). The server is V10's (version 10.0.0, protocol 3): a V11 game plays online with V10 games on the V10 server, and **only the game page needs updating** (*Deploying V11*).

### What the original courses have that these four lacked
Before changing anything, the four original courses were studied from the same chase cameras as the four newer ones (sheets in `validation/sheets/`). What makes them read as finished:
- **Surfaces are broken up at three scales.** Foundry Trench's walls are parts, then panels with seams and their own tones, then grain and wear; a Cinder Belt asteroid is a silhouette, then fracture faces and strata, then regolith. The newer worlds mostly had two: a shape and one tone of steel, rock, bark or water over it.
- **Materials vary across a surface.** Panels differ in tone, edges are worn, soot and rust collect where they would; the capital ships have plating, hazard markings and lit ports. Pelagos' platforms and Ignara's works were one grey; Orbital Nexus' halls were plain walls.
- **Structure explains itself.** Supports, bracing, pipes, antennas, ladders and railings say how a thing stands and what it is for. The newer worlds had the big forms without them.
- **Light has sources.** Lamps have glow and something they light; neon signs colour the walls beside them. Ignara's lava glowed evenly; the forest was lit evenly from above.
- **The air has depth.** Haze in layers, dust, smoke and distant silhouettes. Pelagos had one cloud deck and an even sea; Verdant Canopy's crowns were single lumps.

### Pelagos — the ocean world
- **The sea:** wind slicks and streaks that break the surface into rough and smooth water, the shadows of the cloud deck and patches where the sun gets through, rain pitting the water near the camera, foam and wakes round every leg, column and tower that stands in the sea (the foam follows the real waves), aerated water behind them, sharper glitter on the slicks, and a sky reflection that softens with distance.
- **The sky and the weather:** a lower layer of torn scud under the cloud deck (both layers drift at their own speed), curtains of rain on the horizon, rain falling round the camera that thickens and thins with the storm cells, spray torn off the wave crests, sea mist, and lightning with a branching channel, sheet lightning inside the clouds and a glow where it strikes.
- **Platforms and structures:** weathered, painted steel (plates with their own tones, weld seams, rust that runs down from edges, a splash zone with weed, a wet band and foam where the swell slaps the legs, everything wet in the rain with puddles on decks). Every installation has jacket legs with bracing, risers, a boat landing with fenders and a ladder, a cellar deck, railings with toe boards, stairs, floodlights whose beams show in the rain, lit and dark windows, roof plant, containers and lifeboats; the drilling rig a lattice derrick with crown block, pipe rack, flare boom and crane; the station dome ribs, a helideck with markings and net, a lattice mast with dishes; the plant domed tanks with rings and ladders, pipe racks and stacks. The skim deck and the narrows deck get bracing, girders, railings and lamps; the loops keel webs, lacing, gussets and walkways, their towers ladders and platforms.
- **Islands and shipping:** the islands have rock strata, grass above the spray line, lichen, a wet band and a surf line from the real waves; the lighthouse a gallery, glazing bars, a lantern roof and a keeper's house; the buoys floats, cages and radar reflectors; the freighters bridge wings, funnels, cranes and lit windows.

### Ignara — the volcanic world
- **Lava:** no longer one orange. A flow has crusted stretches (dark plates with glowing cracks), broken stretches and open runs of melt, a hot channel down the middle of a river, streaks of brightness drawn out along the flow, crust rafts that break up where the flow opens, and banks that crust over; the colour runs from crust barely glowing through deep red and orange to yellow and white-hot. The falls are six columns of bulging melt (were two flat ones).
- **Rock:** ash settled on the flatter ground, fields of oxidised red scoria, glassy obsidian, sulphur crusts round the hot fissures, cliffs built of stacked flows with a ledge at each and cut into basalt columns, the rock's detail wavering in the hot air near the lava and the lava's light flickering on it. About 2,200 basalt boulders lie on the ground (four shapes, three levels of detail; the near ones cast shadows).
- **The erupting volcano** has its own, finer cone with gullies that its lava follows.
- **The works:** weathered steel with soot toward the stack tops, rust, and steel that glows where it stands in the heat of the lava. The smelters have roof monitors with louvres, buttress columns, annexes, glowing furnace mouths, chimney rings, ladders, beacons, pipes, railings, stairs and an ore conveyor with its heap; the cooling towers sooty lips and V-legs; the rigs a working floor, drill string, winch house, guy lines and a floodlight; the tanks domed roofs, rings, stairs and a manifold; the bridge decks plate girders, a cable tray and a pipe underneath; the pipelines flanges and saddles.
- **The air:** a second, lower layer of ash scud lit from below, orange haze over the lava and grey smoke elsewhere, lamp beams in the smoke.

### Verdant Canopy — the jungle world
- **Light through the foliage:** sunlight is broken by the canopy above into drifting patches on bark, leaves and the floor; foliage is lit from behind as well as from the front (wrap lighting, warm translucency, cool dark interiors, a wet sheen).
- **Trees:** crowns are clusters of leaf masses instead of single lumps (18, 10 or 5 masses on the colossal trees by distance; 12, 9 or 5 on the forest's trees); limbs carry the lower crowns out from their trunks and reach up into the top crowns; the nearer trunks stand on buttress fins; bark has furrows and dark wet runs.
- **Growth:** vines spiral up the colossal trunks with leaves, moss hangs from their limbs and sways, the giant flowers have an inner ring of petals and stamens with glowing tips, 46 clusters of glowing mushrooms and 36 mossy fallen trunks lie on the floor.
- **Colour:** the forest is no longer one green — yellow-greens and blue-greens, with gold, rust and violet crowns among them, autumn tones in the far canopy and drifts of leaf litter on the floor.
- **The course:** the platforms are decks of planks (seams, each plank its own shade).

### Orbital Nexus — the orbital megastation
- **Plating:** the station's steel is bare metal plated at three scales — big panels of clearly different tone and finish (some dull, some polished enough to carry the lamps), the plates inside them, sub-panels with their bolts — with grime in broad patches and every seam pressed into the surface so that its edges catch the light; hazard stripes on the crane bridges, pillars and floor edges; solar cells on the wings.
- **Halls and hangars:** pilasters, roof girders, conduits along the walls, catwalks with railings and brackets, painted bay lines, roof floodlights whose beams show in the dust, bands of amber beacons, hazard-framed bay doors, docking clamps, fuel lines and a gantry.
- **Tunnels:** pipe runs, cable trays and brackets along the walls.
- **The reactor:** a containment field (a hexagonal lattice with waves of energy passing over it), eight magnetic coils with lit inner rings, sixteen capacitor columns with glowing rings, and energy arcs.
- **The hull and the distance:** pipe runs, lattice antennas with beacons, dishes and rows of lit ports on the hull; a shipyard frame with a hull on its slip and a second ring station in the distance.
- **Glass corridors:** grime streaks, fine scratches that catch the sun, lit pane edges.
- **Gravity cues (the mechanics are V10's, untouched):** chase lights run round the shell at each turn of the deck, in the direction of the turn; dust motes fall to the deck inside a gravity field and drift in zero-g.

### How it is built
- `src/render/courses/v11kit.js` (new): a **weathered-steel shader** shared by three worlds and compiled once per use with only the parts that use needs (the splash zone for steel that reaches the sea; rain and puddles; station plating, hazard stripes and solar cells; corrugated containers), a **coast** shader, **rain curtains**, **light beams**, the **containment field**, geometry helpers (bars, pipes, railings, stairs, ladders, lattices, light cones), and the level-of-detail helpers described under *Performance*.
- `src/render/courses/v9kit.js`: the ocean, the cloud deck (second layer), the lava and the volcanic ground shaders.
- `src/render/courses/v10kit.js`: dappled light in the forest's lighting, the foliage, bark, forest-floor and glass shaders, the crown clusters.
- The four builders (`pelagos.js`, `ignara.js`, `canopy.js`, `nexus.js`) place the new geometry and, once their meshes are made, empty the vertex lists they built them from (`release` in `v11kit.js`; *Performance*). Everything is procedural, as before: no images, models or other assets were added.
- All new programs are registered under new names next to the engine's own; the renderer looks programs up by name, so nothing in `gfx.js` changed. The four original course builders (`trench.js`, `belt.js`, `city.js` with `citygen.js`, `ring.js`) do not import any of the three kits.

### Performance
A visual pass of this size costs frame time; the work below was done so that it costs no more than it must. Nothing in this list takes anything out of the picture.
- **Shaders compiled per use.** A software renderer evaluates both sides of every branch, so a switch inside a shader saves nothing there (and little on a weak GPU). The steel shader therefore exists in four compiled variants (splash zone and rain for steel that reaches the sea; rain only for everything above it on Pelagos; plain for Ignara; station plating for Orbital Nexus), the forest's lighting carries the dappled light only in the forest's own programs, and the instanced trunks and limbs use a bark variant without the plank and fungus parts they never show. Before this, every pixel of steel on Ignara and Orbital Nexus paid for the ocean's swell: about 9 % of an Orbital Nexus frame.
- **Detail by what a pixel can show.** Railings, ladders, lacing, rings, pipes and the like live in layers of their own (`DetailLOD` in `v11kit.js`) that are drawn while a feature of their size still covers most of a pixel at the current resolution and LOD bias; a truss keeps its four chords at any distance and loses only its lacing. Looking across Ignara's works from 500 m, this takes about 200,000 triangles thinner than a pixel out of the frame.
- **Cells with bounds.** Orbital Nexus' structure — one mesh of the whole station in V10 — is cut into 350 m cells (`CellGeo`), each installation on Pelagos is an item of its own, and the light beams are cut into cells that are not drawn beyond the range at which a beam has faded to nothing. What lies outside the view, or beyond the shadow map's reach, is not drawn.
- **Instancing and levels of detail.** Boulders, crown clusters and limbs are instanced with three or four levels chosen by size on screen, dropped below a few pixels, and sorted nearest first within a level so that near trunks hide far ones before those are shaded. The sort is a radix sort on the bits of the distance (`NearFirst` in `canopy.js`): it orders the forest's roughly 9,000 visible instances without comparing pairs, in the same order as a comparison sort (`tests/v11-nearfirst.mjs` checks this on 2,400 frames of random populations, 53,000 ties among them).
- **Memory.** A builder's helper functions live as long as the course (its per-frame update belongs to the same scope), and through them the lists of vertices the meshes were built from stayed in memory after they had been handed to the graphics card. The four builders now empty those lists at their end. Measured in Node with a renderer that, like the game's, keeps no geometry once it is on the graphics card, the eight built courses keep 46 MB in memory where V10's kept 107 MB (V10's builders of these four courses kept their lists as well; the first V11 build, b11, kept 198 MB). Pelagos now keeps 2.7 MB, Ignara 3.6 MB, Verdant Canopy 18.1 MB (11 MB of it the instance buffers the culling fills each frame) and Orbital Nexus 2.4 MB; the original courses keep what they kept in V10 (`validation/logs/node-memory-and-cull.txt`). In the game, the JavaScript heap after a forced collection, all eight courses built, is 57 MB in V11 against 113 MB in V10 (b11: 199 MB; `heap-*.log`).
- **Shadows from less geometry.** Only the two nearest levels of an instanced set cast shadows, and each colossal tree casts the shadow of its lighter version whatever level is drawn (the full one put tens of thousands of triangles of leaves, vines and moss into the shadow map).
- **Per-pixel work removed elsewhere.** The cloud deck's second sample shares the first one's storm lookup; the ocean's foam loop stops at the number of foam sources in reach (none on the open sea) and the sea is drawn last, behind everything that hides it; the columns on Ignara's cliffs are a lattice of two hashes per pixel where a cellular field cost ten; the foliage shader looks its shadow up once instead of twice.
- **Tried and not built:** a depth pre-pass (the scene's depth drawn first with an empty shader, so that hidden surfaces are never shaded) cost more than it saved in the forest (8–13 % slower) and saved nothing on the station (9 % slower for the steel alone, 1 % faster with the station's other materials, within the noise), because little of what these courses shade is hidden.
- As before, no shader is compiled, no geometry built and no buffer is created on the graphics card during a race.

**How it was measured.** `tests/v11-framecost.py`, on the same 2-core Linux machine as every test here, headless Chromium with software WebGL (SwiftShader), with nothing else running: the race frozen, the preset's own resolution pinned (dynamic resolution off), chase cameras at fixed points of the racing line, the same in both builds. **Every frame is forced to finish before the clock is read** (a one-pixel read-back). Two kinds of run:
- *Round the lap:* twelve views per course at equal steps from 4 % to 92 % of the lap, at Medium; one warm-up frame, then the median of three. Measured twice: run 1 with V10's four courses and then V11's four, run 2 the next morning with V10 and V11 straight after each other for each course.
- *The presets:* the views at 25 %, 50 % and 75 % of the lap at Low, Medium and High, and the view at 50 % at Ultra; two warm-up frames, then the median of seven; V10 and V11 one after the other for each preset. The test browser's pixel ratio is 1, so High and Ultra draw at Medium's 960×540 here (with their own anti-aliasing, shadow maps and effects), and Low at 720×405; on a display with a higher pixel ratio High and Ultra draw more pixels than this.

V10's own table (under *V10* below) read the time between animation frames instead; while measuring V11 this turned out to run several frames behind what is drawn in software rendering (after a change of camera the old view's time was still being reported eight frames later), so the figures in V10's table are blurred from one view into the next and are not comparable with these. Both builds were therefore measured again with the tightened tool.

**How exact it is.** The same drawing work does not take the same time twice on this machine. Foundry Trench, which draws exactly the same calls and triangles in both builds, was measured six times and came out between 2759 and 3109 ms (table below); one view of one build, measured again the next day, came out up to 18 % apart. A ratio between V10 and V11 from a single pair of runs is therefore good to about ±10 %. The lap figures rest on twelve views measured twice, and the two runs agree to within 0.01 for Ignara, Verdant Canopy and Orbital Nexus and 0.07 for Pelagos. Frame times in software rendering compare builds on one machine; they are not what a graphics card will do.

**Round the lap** (Medium, 960×540, 12 views per course at equal steps of the lap from 4 % to 92 %, three timed frames each; the mean of the views is the time an average frame of a lap takes. Measured twice: run 1 with V10's four courses and then V11's four, run 2 the next morning with V10 and V11 straight after each other for each course):

| Course | V10: mean frame (ms), run 1 · run 2 | V11: mean frame (ms), run 1 · run 2 | V11 / V10, run 1 · run 2 | V11 / V10, both runs | The twelve views, both runs: lowest to highest V11 / V10 | Draw calls, mean, V10 → V11 | Triangles, mean, V10 → V11 |
|---|---|---|---|---|---|---|---|
| Pelagos | 1719 · 1747 | 1991 · 1912 | 1.16 · 1.09 | **1.13** | 1.01 – 1.28 | 75 → 98 | 272,406 → 243,733 |
| Ignara | 1933 · 1887 | 2633 · 2578 | 1.36 · 1.37 | **1.36** | 1.06 – 1.53 | 88 → 110 | 253,619 → 323,235 |
| Verdant Canopy | 6483 · 6375 | 7309 · 7148 | 1.13 · 1.12 | **1.12** | 1.04 – 1.29 | 147 → 170 | 382,207 → 634,544 |
| Orbital Nexus | 2481 · 2374 | 2873 · 2762 | 1.16 · 1.16 | **1.16** | 1.02 – 1.26 | 87 → 126 | 284,580 → 247,128 |

**The presets** (chase cameras at 25 %, 50 % and 75 % of the lap, seven timed frames each; Ultra, the slowest to draw, at 50 % only; mean of the views):

| Course | Preset (drawn at) | V10 frame (ms) | V11 frame (ms) | V11 / V10 | Draw calls V10 → V11 | Triangles V10 → V11 |
|---|---|---|---|---|---|---|
| Pelagos | Low (720×405) | 504 | 578 | 1.15 | 67 → 82 | 260,503 → 223,431 |
| Pelagos | Medium (960×540) | 1513 | 1577 | 1.04 | 67 → 82 | 260,503 → 223,431 |
| Pelagos | High (960×540) | 1470 | 1576 | 1.07 | 67 → 82 | 260,503 → 223,431 |
| Pelagos | Ultra (960×540) | 1678 | 1918 | 1.14 | 60 → 82 | 255,840 → 257,460 |
| Ignara | Low (720×405) | 716 | 859 | 1.20 | 54 → 73 | 209,597 → 282,321 |
| Ignara | Medium (960×540) | 1970 | 2247 | 1.14 | 54 → 79 | 209,597 → 284,802 |
| Ignara | High (960×540) | 1879 | 2356 | 1.25 | 54 → 79 | 209,597 → 285,185 |
| Ignara | Ultra (960×540) | 1931 | 2569 | 1.33 | 76 → 105 | 256,524 → 325,390 |
| Verdant Canopy | Low (720×405) | 2346 | 2536 | 1.08 | 144 → 172 | 359,733 → 559,508 |
| Verdant Canopy | Medium (960×540) | 7143 | 6883 | 0.96 | 149 → 177 | 414,037 → 703,113 |
| Verdant Canopy | High (960×540) | 6706 | 7175 | 1.07 | 151 → 180 | 441,006 → 760,051 |
| Verdant Canopy | Ultra (960×540) | 6871 | 7471 | 1.09 | 149 → 174 | 458,582 → 846,546 |
| Orbital Nexus | Low (720×405) | 821 | 1018 | 1.24 | 98 → 149 | 298,378 → 273,993 |
| Orbital Nexus | Medium (960×540) | 2327 | 2557 | 1.10 | 98 → 149 | 298,378 → 273,993 |
| Orbital Nexus | High (960×540) | 2431 | 2808 | 1.16 | 98 → 149 | 298,378 → 273,993 |
| Orbital Nexus | Ultra (960×540) | 3868 | 4735 | 1.22 | 172 → 258 | 372,500 → 432,408 |

**The four original courses** (Medium, the same three views, seven timed frames each; their builders and shaders are V10's, so they draw the same calls and triangles and must cost the same):

| Course | V10 frame (ms) | V11 frame (ms) | V11 / V10 | The views: lowest to highest V11 / V10 | Draw calls V10 → V11 | Triangles V10 → V11 |
|---|---|---|---|---|---|---|
| Foundry Trench | 3109 | 2840 | 0.91 | 0.90 – 0.92 | 107 → 107 | 347,727 → 347,727 |
| Cinder Belt | 2688 | 2689 | 1.00 | 0.98 – 1.04 | 91 → 91 | 218,621 → 218,621 |
| Neon Spire | 7883 | 7694 | 0.98 | 0.94 – 1.00 | 240 → 240 | 326,476 → 326,968 |
| Halo of Vashti | 1573 | 1615 | 1.03 | 0.99 – 1.07 | 104 → 104 | 229,591 → 229,591 |

**The same drawing work measured six times** (Foundry Trench, Medium, the same three views; draw calls and triangles are identical in all six runs: 88 / 98 / 134 calls, 339,768 / 345,396 / 358,016 triangles):

| When | Build | Frame, the three views (ms) | Mean (ms) | Relative to the fastest run |
|---|---|---|---|---|
| 12 Nov, afternoon: one pair, a quarter of an hour apart (seven timed frames per view) | V10 | 3879 / 2883 / 2564 | 3109 | 1.13 |
|  | V11 | 3570 / 2653 / 2298 | 2840 | 1.03 |
| 13 Nov, morning: four runs in ten minutes, the builds alternating (five timed frames per view) | V10 | 3440 / 2595 / 2243 | 2759 | 1.00 |
|  | V11 | 3459 / 2700 / 2365 | 2841 | 1.03 |
|  | V10 | 3650 / 2667 / 2343 | 2887 | 1.05 |
|  | V11 | 3828 / 2794 / 2317 | 2980 | 1.08 |

**Neon Spire draws a moving scene** (its air traffic follows the clock, so no two runs draw exactly the same; Medium, the same three views):

| Run | Draw calls, the three views | Triangles, the three views |
|---|---|---|
| V10, 12 Nov | 192 / 270 / 257 | 296,508 / 396,984 / 285,936 |
| V11, 12 Nov | 192 / 270 / 257 | 298,816 / 397,008 / 285,080 |
| V10 again, 13 Nov | 187 / 268 / 254 | 257,236 / 363,300 / 269,932 |
| V10 once more, 13 Nov | 188 / 268 / 255 | 260,940 / 363,328 / 272,436 |

**The delivered build, straight after V10** (13 Nov, evening; Medium, 960×540, chase cameras at 25 %, 50 % and 75 % of the lap, seven timed frames each; for each course V10 measured and then the delivered build straight after it; the tables above were measured on build b11, whose scenes are identical to the delivered build's, and this run checks them on the delivered build itself):

| Course | V10 frame, the three views (ms) | V11 frame, the three views (ms) | Mean V10 → V11 (ms) | V11 / V10 | The views: lowest to highest V11 / V10 | Draw calls V10 → V11 | Triangles V10 → V11 |
|---|---|---|---|---|---|---|---|
| Pelagos | 854 / 1686 / 1802 | 1060 / 1860 / 1971 | 1447 → 1630 | **1.13** | 1.09 – 1.24 | 67 → 82 | 260,503 → 223,431 |
| Ignara | 1655 / 1924 / 2138 | 1950 / 2531 / 2664 | 1906 → 2382 | **1.25** | 1.18 – 1.32 | 54 → 79 | 209,597 → 284,802 |
| Verdant Canopy | 6839 / 6006 / 7698 | 7264 / 6359 / 7472 | 6847 → 7032 | **1.03** | 0.97 – 1.06 | 149 → 177 | 414,037 → 701,492 |
| Orbital Nexus | 2036 / 3590 / 1311 | 2338 / 4261 / 1397 | 2312 → 2666 | **1.15** | 1.07 – 1.19 | 98 → 149 | 298,378 → 273,993 |
| Foundry Trench (control: V10's course in both builds) | 3532 / 2583 / 2307 | 3509 / 2672 / 2251 | 2807 → 2811 | **1.00** | 0.98 – 1.03 | 107 → 107 | 347,727 → 347,727 |

**Reading the numbers.**
- **Frame time.** Over a lap at Medium, a V11 frame takes **13 % longer than in V10 on Pelagos, 12 % on Verdant Canopy, 16 % on Orbital Nexus and 36 % on Ignara** (both lap runs together; the two runs agree to within 0.07). The preset runs, three views each, give ratios between 0.96 and 1.33 for the same four courses; with ±10 % per pair of runs they tell the same story, and no preset breaks it. Measured once more on the delivered build, with V10 straight before it on each course (*The delivered build, straight after V10*): 1.13 on Pelagos, 1.25 on Ignara, 1.03 on Verdant Canopy, 1.15 on Orbital Nexus, and 1.00 on Foundry Trench, which draws exactly the same in both builds.
- **Where the time goes.** In software rendering nearly all of a frame is the shading of pixels, and most of the visual pass is in the shading: plated and weathered steel where V10 had one plain steel, rock and lava with detail at three scales, bark and foliage lit through the canopy. Drawing one shader at a time as a flat colour (on intermediate builds; `validation/perf/analysis/`) showed where it goes: on Ignara the volcanic ground carries about a quarter of a frame and the works' steel about a sixth; on Orbital Nexus the station's steel carries more than a third; in the forest the bark of trunks and limbs carries about half and the foliage about a fifth. Ignara pays most because its works, a few plain blocks in V10, are now steel structures that fill the views past them (the views at 60–76 % of the lap draw about 440,000 triangles where V10 drew 210,000).
- **Next to the original courses.** On the same machine the four courses stay inside the range the original courses already span: an average Ignara frame (2.6 s here) costs what a Cinder Belt frame costs (2.7 s) and less than a Foundry Trench frame (2.8–3.1 s); Verdant Canopy (7.1–7.3 s), the most expensive of the four, stays below Neon Spire (7.7–7.9 s). (The original courses were measured from three views, the four from twelve; the comparison is a rough one.)
- **The original courses are unchanged.** They draw exactly the calls and triangles they drew in V10 (Neon Spire's air traffic moves with the clock, so its triangles differ by up to 0.8 % between the two builds and by up to 13 % between two runs of V10 itself), and their frame times came out between 9 % lower and 3 % higher: the spread of the machine, as the six runs of Foundry Trench show.
- **Processor and loading.** A frame's own work on the processor (simulation, culling, effects, HUD; no drawing) grows by at most half a millisecond at the median on Pelagos, Ignara and Orbital Nexus and by about one millisecond on Verdant Canopy (3.6–3.7 ms against 2.7 ms; 7.3–8.1 ms against 5.0–5.8 ms at the 95th percentile): a small part of the 16.7 ms a frame has at 60 frames per second. The single frames of several seconds that the CPU test turned up in both builds come from the queue of the software GPU process at the start of a measurement, not from the game (*Tests*). Loading takes about a second longer (29.5 s against 28.6 s here, one load each): the four builders make 1.4 s more geometry on the processor (4.0 s against 2.6 s in Node), and at the end of loading the game holds half the JavaScript heap it held in V10 (117 MB against 242 MB).
- **Not measured: a graphics card.** No real GPU, phone or tablet was available. On a graphics card a frame is spread differently between the processor, the vertex work and the shading, so the ratios above cannot be carried over; they compare the two builds under identical conditions, which is what the brief asks for, and nothing more.

### Deploying V11 to your GitHub Pages site
**Status (13 November 2026):** your repository (`jonathanimhof-hr/galactic_rush`) holds V11: the complete source, every earlier build in `dist/`, and the V11 page as the site's `index.html` with `config.js` next to it. Before this update it held V8's source and server with V9's page (V10 had not been uploaded), so the server Render built from it was V8's. V11 contains V10's server (`server/`: version 10.0.0, protocol 3), unchanged in V11; Render builds it from the repository, and V10 and V11 games can race each other on it. The steps below publish V11 from the package by hand, for example into another repository.
1. Unpack the package first (never drag files out of the zip itself). Open your repository in github.dev (press `.` on its GitHub page), drag everything inside the package's `upload-to-github/` folder onto the file tree, answer *Replace* whenever it asks, then *Source Control → Commit & Push*. The folder is the complete repository for V11: whole `src/`, `server/`, `tests/` and `dist/` folders (`dist/` keeps every earlier build, the V5–V10 files and the V8, V9 and V10 site pages in `dist/site-v8/`, `dist/site-v9/` and `dist/site-v10/`, so replacing it loses nothing), the V11 game page as `index.html` and `config.js` with your server address. The Pages workflow (`.github/workflows/pages.yml`) runs `npm test`, builds and publishes `dist/site/` as before.
2. Open the site (give GitHub Pages a minute, then reload with Ctrl+F5): the tab must read *Galactic Rush V11*.
3. Render redeploys the server from the new commit if *Auto-Deploy* is on (otherwise *Manual Deploy → Deploy latest commit* in the service); afterwards `https://galactic-rush.onrender.com/health` shows `"version":"10.0.0"` and `"protocol":3`. A free Render service sleeps when idle and takes about a minute to wake on the first request.
To go back to V10, put `dist/site-v10/index.html` and `dist/site-v10/config.js` in place of `index.html` and `config.js`.

### What changed in files
New: `src/render/courses/v11kit.js`; the measuring tools `tests/v11-framecost.py`, `tests/v11-costsplit.py` and `tests/v11-shaderprobe.py`; three checks: `tests/v11-frozen.mjs` (the course data and whole race replays of two source trees), `tests/v11-scenes.mjs` (what each course hands the renderer, in two source trees) and `tests/v11-nearfirst.mjs` (the forest's nearest-first order against a plain sort).

| File | Change | Why it is needed |
|---|---|---|
| `src/render/courses/pelagos.js` | the world's scenery rebuilt on V9's layout (same islands, platforms, decks, loops and skyline in the same places): the detail listed above, per-installation items with their own bounds and detail layers | the visual pass on Pelagos |
| `src/render/courses/ignara.js` | the works rebuilt in weathered steel in three layers of detail, the volcano's own cone, the falls, the boulders, the ash haze | the visual pass on Ignara |
| `src/render/courses/canopy.js` | crown clusters, limbs, buttress fins, vines, moss, flowers, mushrooms, fallen trunks, plank decks, the palette, dappled light on every set; the instanced trees drawn nearest first | the visual pass on Verdant Canopy |
| `src/render/courses/nexus.js` | plating, hall and tunnel detail, the reactor's field, coils and capacitors, hull detail, the shipyard and ring station, the gravity cues; the station's geometry cut into cells with their own bounds | the visual pass on Orbital Nexus |
| `src/render/courses/v9kit.js` | the ocean, cloud, lava and volcanic-ground shaders; four shader and geometry pieces exported for the new kit | Pelagos and Ignara (no other course draws with these shaders) |
| `src/render/courses/v10kit.js` | dappled light, the foliage, bark, floor and glass shaders, crown clusters, two shader variants and a shadow-only program | Verdant Canopy and Orbital Nexus (no other course draws with these shaders) |
| `tests/v10-playtest.py` | the page-title check of its `menus` scenario accepts *Galactic Rush V11* as well as *V10* | running V10's playtests on the V11 build |
| `build.mjs` | V11 file names and page title; V10's site page is kept in `dist/site-v10/` (the V5–V10 files are never written); keeps the change your repository's `build.mjs` got on 4 Nov 2026 (when `GR_MP_SERVER` is not set, the server address comes from the `config.js` in the repository root), which the V9 and V10 packages did not have | publishing V11 next to V10 |

Byte-identical to V10 (`validation/logs/source-diff.txt` is the complete comparison): everything in `src/sim/` (courses, flight, AI, gravity, race rules), `src/mp/` and `server/` (protocol 3, version 10.0.0), `src/render/gfx.js` and every other shared renderer module (`geo.js`, `lod.js`, `effects.js`, `models.js`, `shipvis.js`, `props.js`, `capital.js`, `textures.js`, `raceview.js`, `hangar.js`, `courses/common.js`, `courses/index.js`, `courses/all.js`), the four original course builders (`trench.js`, `belt.js`, `city.js` with `citygen.js`, `ring.js`), `src/main.js`, the camera, the HUD and menus, audio, the garage, the career, the shop, `index.html`, `package.json` and the deployment files. `dist/galactic-rush-v5…v10*.html` keep their checksums (`validation/logs/build-md5.txt`).

### Tests (everything below was actually run, on this build)
One 2-core Linux machine: Node 22 for the Node tests and the server, headless Chromium with software WebGL (SwiftShader) for the browser tests. Every browser test ran on the delivered build (`dist/galactic-rush-v11.html`; its checksum is in `validation/logs/build-md5.txt` and was written down again at the start of every test job). The multiplayer server ran locally for every test; nothing was tested against your Render server. Logs, reports and screenshots are in the package's `validation/` folder. V10's playtests take the build to test from `GR_BUILD`, so they are V10's own scenarios run on the V11 game.

**The frozen game**

| Check | What it covers | Result |
|---|---|---|
| Source comparison (`diff -rq` with the V10 source as delivered) | every file of the repository | Changed: the four builders, `v9kit.js`, `v10kit.js`, `build.mjs` and the title check in `tests/v10-playtest.py`; new: `v11kit.js` and six tools in `tests/`. **No changed file** in `src/sim/`, `src/mp/`, `src/progress/`, `src/ui/`, `server/` or among the modules in `src/` itself (main, camera, HUD, input, audio, garage); in `src/render/` only those seven course files, so `gfx.js`, the shared renderer modules and the four original builders are V10's (`validation/logs/source-diff.txt`). Inside the four changed builders, the statements that draw what a ship can touch or fly through — energy walls, gates, pickups, hazards and route guides, Pelagos' columns, Ignara's pipes, Verdant Canopy's wood, Orbital Nexus' struts, beams and masts — were compared line by line: they are V10's, with at most the material changed, so everything that collides is drawn where and as large as before |
| `node tests/v11-frozen.mjs` (new) | the V10 source and the V11 source loaded side by side: for each of the eight courses the **complete course data** (every value the course holds: geometry, frames, corridor, racing line, checkpoints, start grid, pads, cells, obstacles, wood, gravity strength and deck roll, section tags) and **whole races replayed** in both handling modes (a scripted player and the five AI pilots for 75 s; every ship's position, velocity, orientation, hull and progress every quarter second) | **identical in everything it compares**: the course list, the complete course data of all eight courses (29,137 to 71,123 values per course, 338,523 in all) and all 16 race replays (eight courses, Classic and Relaxed handling). As a control, the same tool run against a copy of the source with one number changed reports the difference: with the pull of Orbital Nexus' gravity plating changed from 32 to 32.01 it reports the two Orbital Nexus replays and nothing else; with Pelagos' seed changed from 71 to 72, Pelagos' course data and its two replays (`validation/logs/frozen.log`, `frozen-control.log`) |
| `node tests/v11-scenes.mjs` (new) | every course built in Node from the V10 source and from the V11 source with a recording renderer: every mesh in the order it is made (positions, normals, colours, material values, indices, byte for byte), every shader program, every scene item (program, flags, ranges, bounds, uniforms), the environment, and the instance buffers after culling from five cameras along the racing line | **the four original courses hand the renderer exactly what they handed it in V10** (Foundry Trench 205 meshes and 629,040 triangles, Cinder Belt 134 and 222,496, Neon Spire 200 and 148,112, Halo of Vashti 131 and 168,618; identical byte for byte, culled buffers included); the four courses of the visual pass differ, as they should. Run against build b11 as well (the build the frame times under *Performance* were measured on): all eight scenes identical (`scenes-v10.log`, `scenes-b11.log`) |
| Gravity statistics (Orbital Nexus) | two full fields over three laps in Node on the V10 source and on the V11 source, in Classic and in Relaxed handling: ride height above the deck, deck contacts and wall hits in every gravity section and at every roll of the deck | the two outputs are identical, byte for byte (`gravity-v10.txt`, `gravity-v11.txt`: 17 section/roll rows in Classic with mean ride heights of 2.52–7.65 m, 22 rows in Relaxed with 3.45–6.11 m) |
| `npm test` | V10's suites; no test was changed or added. Among them: the six V9 courses' course data equal the fingerprints taken from the V9 source and whole races on them replay bit for bit as on the V9 build; Verdant Canopy's collision spheres lie on its drawn wood; on Orbital Nexus every ship stays on the deck in every orientation in both handling modes; ships, upgrades, career, shop, championship calendars, multiplayer rules, respawns, the chase camera through the loops | **120/120 tests pass** (`npm-test.log`) |
| `npm run test:mp` | the real server with real WebSocket clients flying the game's own simulation (13 tests): health check, lobbies, a whole tournament, V9's tournament on Pelagos and Ignara, V10's tournament on Verdant Canopy and Orbital Nexus with its gravity-sync check, both version checks, reconnects, a server restart, hostile and cheating clients, two lobbies at once, the origin check | **13/13 pass** (`test-mp.log`) |

**The four courses of the visual pass in the built game**

| Suite | What it covers | Result |
|---|---|---|
| `python3 tests/playtest.py races` (`TRACKS=pelagos,ignara,canopy,nexus`) | the built game, autopilot, one lap: each of the four courses reaches the results screen with every racer finished | **pass**: each course reached the results screen with all six racers finished (one lap; finishing times Pelagos 54.0–62.0 s, Ignara 41.2–47.0 s, Verdant Canopy 62.6–69.0 s, Orbital Nexus 47.9–53.3 s); no console errors (`races.log`) |
| `node tests/v11-nearfirst.mjs` (new) | the forest's nearest-first order (`NearFirst` in `canopy.js`) against the same culling with a comparison sort: 60 random populations, 40 frames each with a wandering and jumping camera, a third of the populations on a grid so that many instances are exactly as far from the camera as others | **every level's instance buffer, count and level identical** in all 2,400 frames (1,445,271 instances drawn, 52,969 ties) (`nearfirst.log`) |
| `python3 tests/v10-playtest.py menus` | title → hangar → *Select course* lists the eight courses in order → the menu preview flies over Verdant Canopy and Orbital Nexus → both launched from the menus → flyover → the race clock runs after the countdown → pause → quit to menu; the championship picker (six of eight, rounds, taking a course out, *Clear*, *Random six*) | **17/17 checks pass**, no console errors |
| `python3 tests/v10-playtest.py champ` | a whole Rookie championship through the menus on a picked calendar (Verdant Canopy, Halo of Vashti, Orbital Nexus, Neon Spire, Pelagos, Cinder Belt; one lap per round, autopilot, fast-forwarded): rounds in the picked order, the hub names each next round, the run closes after round 6 and the bonus is paid once | **10/10 checks pass**: the six rounds raced in the picked order, the hub named each next round and showed the calendar, the run closed after round 6, the completion was recorded and paid once, the finished run keeps its calendar, 695 credits earned; no console errors (`champ.log`) |
| `python3 tests/v9-playtest.py champ6` | V9's championship test: a championship started without picking courses keeps V9's calendar (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti, Pelagos, Ignara), so **all four original courses are raced in the built V11 game** | **6/6 checks pass**: Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti, Pelagos and Ignara raced in calendar order, each with a full field of six; the hub offered Pelagos and Ignara as rounds 5 and 6; the run closed after round 6; the completion was recorded (completion bonus, final standing, championship tokens); 645 credits earned; no console errors (`champ6-v9cal.log`) |
| `python3 tests/v10-playtest.py nexus` | chase-camera frames through every district of Orbital Nexus; in every gravity section the camera's up must be within 60° of the deck's up and the ship must ride the deck (1.5–12 m above it); every district and every gravity change announced on the first lap | **13/13 checks pass**: 24 frames; in the 11 frames inside gravity sections (walls, ceiling, the spindle's half turn, the cargo deck) the camera's up was aligned with the deck's (dot product 0.96–1.00) and the ship rode 2.4–10.5 m above the plating; the HUD showed *Hangar District* while racing; the same ten announcements as in V10; no console errors. (A run on an earlier V11 build failed two of these checks by reading a ride height of 13 m and 14.9 m where the check allows 12 m: the autopilot was caught high above the deck at the moment of the frame. The gravity statistics above give ranges up to 18 m in the same sections, identical for V10 and V11.) |
| `python3 tests/v10-playtest.py canopy` | chase-camera frames through every part of Verdant Canopy and the course's announcements through the real frame loop and HUD | **2/2 checks pass**: 19 chase frames through every part of the forest (roots, branches, skylight, canopy, platforms, descent, spiral, slalom, the final stretch and the start; camera up within 0.97–1.00 of the course's, the ship 5.4–34 m above the racing line, never wrecked); the HUD showed *The Root Passage* while racing, and the five parts of the forest were announced on the first lap; no console errors (`canopy.log`) |
| `python3 tests/v9-playtest.py loops` | chase-camera frames at the entry, climb, top and descent of both Pelagos loops (the camera's up vector equals the course's: −1 at both tops) and along Ignara | the camera's up followed the course's through both loops (camera / course: entry 0.97 / 0.97 and 0.96 / 0.97, climb −0.26 / −0.18 and −0.28 / −0.20, **top −1 / −1 in both**, descent −0.03 / −0.09 and −0.01 / −0.08), nine chase frames along Ignara, race and HUD as usual in every frame; no console errors. The scenario records values and frames and has no pass/fail checks of its own (`v9-loops.log`, frames `test-v9-loops-*`) |
| `python3 tests/v10-playtest.py trial` and `python3 tests/v9-playtest.py trial` | a time trial on each of the four courses (autopilot) saves a record lap and its ghost; the next trial loads the ghost and shows it | **8/8 checks pass**: on each of the four courses a time trial saved a record lap and its ghost (Pelagos 59.1 s, Ignara 42.7 s, Verdant Canopy 61.5 s, Orbital Nexus 46.8 s), and the next trial loaded the ghost and showed it; no console errors (`trial.log`, `v9-trial.log`) |
| `python3 tests/v10-playtest.py settings` and `python3 tests/v9-playtest.py settings` | every preset (Low → Ultra) and every graphics toggle (shadows, ambient occlusion, volumetrics, motion blur, grain, chromatic aberration, flares, resolution scale, field of view) switched at run time on each of the four courses: the renderer follows each preset, no WebGL errors, no page errors, no blank frames | **92/92 checks pass** (23 changes on each course: five preset changes, seven toggles off and on, resolution scale and field of view): after every preset change the renderer's anti-aliasing, shadow map, level-of-detail bias and haze were the preset's and the frame was not blank, every toggle took effect, no WebGL error after any change; no console errors (`settings.log`, `v9-settings.log`) |

**The rest of the game on the V11 build**

| Suite | What it covers | Result |
|---|---|---|
| Regression: matched screenshots of the original courses | `tests/matched.py` (V8's ten fixed views of the four original courses, the race frozen) on the V10 build, the V11 build and the V10 build again; pixel differences V10 → V11 against V10 → V10 (what the frozen race leaves moving: clouds, haze, particles, lights, Neon Spire's air traffic) | **no difference beyond the noise floor**: in each of the ten views V10 → V11 differs as much as V10 → V10 (mean difference 1.55–5.91 of 255 against 2.09–5.67; pixels differing by more than 16 levels: 0.00–4.56 % against 0.00–4.05 %), and the differing pixels are the same things in both comparisons (Neon Spire's animated signs and air traffic, the rocks and lines of the moving flyover camera). The ten views side by side: `validation/sheets/regression-original-courses-v10-v11.jpg` (`matched-diff.md`) |
| Regression: the original courses' drawing work | `tests/v11-framecost.py` on the four original courses in both builds (*Performance*) | the same draw calls and triangles in every view of Foundry Trench, Cinder Belt and Halo of Vashti; Neon Spire the same draw calls and its triangles within 0.8 % (its air traffic moves with the clock: two runs of V10 itself differ by up to 13 % in triangles; *Performance*). Frame times −9 % to +3 %, inside the machine's spread |
| Regression: V7–V9 suites | `tests/progression.py` phase A (rewards on every difficulty, the Rookie → Pro → Ace championship ladder, six rounds each on V9's calendar, upgrades reaching the physics) and phase B (shop, premium placeholders, paint jobs on the 3D ships, keyboard control, career); `tests/settings.py` (every preset and toggle on Neon Spire) | **phase A 31/31, phase B 17/17 checks pass** (among them: Rookie, Pro and Ace championships of six rounds each on V9's calendar, so the four original courses again, bonuses paid once, upgrades reaching the physics once and not the AI, paint visible on the rendered 3D ship and in the race, no payment form, no network requests other than the font stylesheet, no page or console errors); `tests/settings.py` on Neon Spire: **23/23 settings steps pass** (every preset and toggle took effect, no WebGL error, no blank frame, no page errors) (`progression-A.log`, `progression-B.log`, `settings-spire.log`) |
| `python3 tests/mp/e2e.py` with `ELIGIBLE_TRACKS=pelagos,ignara,canopy,nexus` | V8's three-browser end-to-end test with the V11 page and the (unchanged) server limited to the four courses of the visual pass: three separate browser processes, the game's own screens, two complete tournaments, rewards, a dropped connection, leaving mid-race | Two runs. **Run 2 (race clocks ×2): 29/29 checks pass** — the title menu keeps every mode and adds Online multiplayer; sign-in with a server-issued pilot id; a lobby with its room code, joined in lower case with a dash, a ship change seen by the others, only the host can start; the first tournament: qualifier on Orbital Nexus (all three finished, 242.1–250.3 s), the start synchronised (start estimates within 0 ms, GO within 146 ms), remote ships drawn a median 129–136 ms behind and 0.01–0.02 m off the other pilots' real paths, the results screen with who qualified and who is out, the final on Ignara with the eliminated pilot watching (won in 222.3 s, second 223.3 s), rewards paid once each through the career ledger (1,202 CR and 3 ST to the winner; the same result delivered again pays nothing); the second tournament (qualifier on Ignara, final on Orbital Nexus): a dropped connection reconnected and that pilot finished both races, Esc opens the online menu while the race runs on, leaving from that menu returns to the online screen and the others see that pilot out, the second tournament pays again under its own id, *Leave multiplayer* returns to the main menu and closes the connection; no page errors in any of the three games (`e2e2.log`, `mp-e2e2-*`). **Run 1 (race clocks ×4): its first 24 checks passed, none failed** — the whole first tournament (qualifier on Orbital Nexus, 243.5–279.7 s; final on Verdant Canopy, won in 411.5 s; start estimates within 1 ms, GO within 31 ms; rewards once each) through the second tournament's reconnect and the in-race menu — and then it stopped where V10's first run stopped: the second qualifier, on Ignara, ended (the server closed it at 18:11:00 UTC, *finish-window*) before the test's pilot pressed *Leave* in the in-race menu, so the test waited for a menu that had already gone (`e2e.log`, `mp-e2e-*`). The server picks the courses; Pelagos came up in neither run (it is raced in the browser by the suites above, and online by the V9 tournament of `npm run test:mp`) |
| CPU per frame (`tests/framecost.py`) | one game frame without drawing (simulation, course update, culling, effects, HUD), median / 95th percentile over 300 frames in the built game, V10 and V11 | **median / 95th percentile, V10 → V11 (ms):** Pelagos 0.8 / 1.5 → 0.9 / 1.8, Ignara 0.9 / 1.6 → 1.3 / 3.1, Verdant Canopy 2.7 / 5.0 → 3.7 / 7.3, Orbital Nexus 0.8 / 1.3 → 0.8 / 1.4 (`cpu-v10.log`, `cpu-b12.log`); a second sample of 300 frames per course, measured the same way (`spikes-*.log`, *plain*): Pelagos 0.9 / 1.5 → 1.0 / 2.0, Ignara 0.8 / 1.6 → 1.3 / 2.3, Verdant Canopy 2.7 / 5.8 → 3.6 / 8.1. Verdant Canopy's extra millisecond is mostly the culling of the larger forest (one cull, twelve cameras, in Node: 0.75 ms in V10, 1.6 ms in V11); build b11, which put the instances in order with a comparison sort, needed 6.0 / 11.3 ms here, and the radix sort brought that down. **Single slow frames:** over all runs (V10 three, V11 four, build b11 included; `cpu-*.log`, `spikes-*.log`) the slowest frame was 2–8 ms on Pelagos and Orbital Nexus and 3–22 ms on Ignara, apart from one frame of 2.6 s on Ignara (V11); on Verdant Canopy single frames of 2.9–3.7 s turned up in one of the three V10 runs and in all four V11 runs. They are not the frame's own work: when the test starts measuring, the software GPU process is still about 20 s behind with work the game sent it earlier (`gl.finish()` before the first frame waited 19.0–20.2 s on Pelagos, Ignara and Verdant Canopy in both builds), and a frame that sends it anything while it is that far behind evidently has to wait. The long frames sit at the very start of the first measurement on a fresh page (V11 on Verdant Canopy, two pages: the second of the 300 frames took 2,945 ms, with one more of 1,749 ms, and 6,943 ms; the same 300 frames measured again straight after on the same page: at most 20–29 ms), and with the queue drained first there was none: on Verdant Canopy at most 12–17 ms in V11 (two pages) and 7–9 ms in V10, on Pelagos and Ignara at most 2–5 ms in both builds (`spikes-v10.log`, `spikes-b12.log`, `spikes2-b12.log`). They turn up more often on V11's forest, whose frames take longer to draw, but they come from the test switching from drawn frames to frames without drawing, not from a frame's own work; in a race every frame is drawn, and how long drawing takes is what the frame-time tables under *Performance* measure |
| Loading and course build | the game's loading time to the first race frame with all eight courses built (`tests/buildcost.py`; every course is built once while the game loads, none during a race), and each course's scene built on its own in Node, processor only (`validation/tools/buildnode.mjs` via `nodebuild.sh`: median of three, V10 and V11 alternating) | **loading: 29.5 s in V11 against 28.6 s in V10** (one load each; loads of V10 and of build b11 in the morning took 30.8 s and 34.2 s, so a load varies by a few seconds here); the JavaScript heap at that moment 117 MB against 242 MB. **Scene build per course, V10 → V11:** Pelagos 350 → 851 ms, Ignara 1128 → 1592 ms, Verdant Canopy 758 → 1122 ms, Orbital Nexus 362 → 473 ms (2.6 s → 4.0 s for the four); the original courses 0.96–1.09 of V10's time with the same triangles (Foundry Trench 849 / 812 ms, Cinder Belt 440 / 479, Neon Spire 272 / 282, Halo of Vashti 618 / 596); every course's track (racing line, corridor) takes the same 20–100 ms in both. The per-course times `buildcost.py` itself reports in the browser are not used: they include waits for the software GPU to finish earlier work and moved up to fourfold in either direction between the two runs (Verdant Canopy 1.6 s in V10 and 7.6 s in V11, Orbital Nexus 7.7 s in V10 and 2.7 s in V11) (`buildtime-*.log`, `nodebuild.log`) |

### Limitations
- **It costs more to draw.** In software rendering a frame over a lap takes 12–16 % longer than in V10 on Pelagos, Verdant Canopy and Orbital Nexus, and 36 % longer on Ignara (a further run on the delivered build: 3–15 % and 25 %; *Performance*); a frame's own work on the processor grows by about 1 ms on Verdant Canopy and less elsewhere, and loading takes about a second longer; the visual pass adds shader work to almost every pixel of them and geometry near the camera, and what could be saved without taking detail away again has been saved. On a graphics card the difference should be smaller in absolute terms, but it was not measured: no real GPU, phone or tablet was tested. Dynamic resolution and the presets work as before.
- **Heat shimmer is drawn in the shaders** (the rock's and the lava's detail wavers near the lava); it does not bend the image behind it, which would need a renderer pass that V11 was not allowed to add. For the same reason the sea, the wet steel and the glass reflect the sky and the cloud deck, not the scenery.
- **Detail layers switch on with distance.** Railings, ladders, lacing, pipes and the like are drawn only while they still cover most of a pixel at the current resolution; on a small or low-resolution screen they appear nearer to the camera than on a large one.
- **Shadows at low resolution:** only the two nearest levels of the forest's instanced trees and Ignara's boulders cast shadows (the others lie beyond the reach of the shadow map at normal resolutions); the colossal trees cast the shadow of their lighter version.
- **No person has looked at V11 on a real display:** every judgement of the look was made on frames rendered by headless Chromium with software WebGL at the Medium and High presets, mostly at 960×540.
- **Every test above ran on the test machine** with a local multiplayer server; none of them was run against the published site or the Render server.
- V10's limitations still apply (see *V10*).

## V10: two new worlds — Verdant Canopy and Orbital Nexus

V9 is the baseline and is treated as frozen. V10 adds exactly two new, fully playable courses, **Verdant Canopy** (a jungle of trees taller than mountains, raced through dense organic obstacles) and **Orbital Nexus** (a multi-level orbital megastation with gravity sections), and the few isolated lines that make them part of every mode: Quick race, Time trial, the Championship (where you now pick its six courses from all eight) and Online multiplayer. No existing course, ship, handling mode, physics or collision rule, AI rule, camera, renderer path, effect, reward rate, tournament rule or part of the multiplayer architecture was changed: *What changed in existing files* lists every changed line, and the tests below show that the six V9 courses carry exactly V9's course data and that races on them replay exactly as in V9.

### Verdant Canopy — the jungle world
**8.18 km a lap · 10 checkpoints · 10 boost rings · 24 energy cells.** An alien rainforest whose trees rise above the clouds: a misty forest floor far below the course with streams that fall into a gorge as waterfalls, an understory of broadleaf thickets and tree ferns (some in the forest's alien teal, violet and ochre), thousands of canopy trees, colossal trees with buttress roots, limbs and crowns of foliage hundreds of metres across, the Elder Tree at the heart of the course, hanging lianas, giant flowers, glowing shelf fungi, moss on the upper side of every limb, shafts of sunlight through the canopy, a ringed gas giant in the sky and forest-clad mountains on the horizon.

The lap, in five parts, each announced on the first lap:
- **The Root Passage**, low over the forest floor: gates of buttress roots arching over the corridor, an aerial root standing in it, a root across the floor and one reaching down from above.
- **The Branch Network**, climbing about 250 m through the trees: a branch across the corridor every 100 m or so, each leaving a different part of the corridor open (high, low, left, right, a fork reaching in from the right, a V hanging from above).
- **The Canopy Run**, up to 340 m above the start line: out of the leaf roof through the Skylight and over the top of the canopy, the widest part of the course (42 m), where the trunks of four emergent giants stand up through the canopy.
- **The Floating Platforms**: the course runs over a chain of platforms hung from the branches — decks where it is level, ramps where it steps down, bridges of living wood between them, one unbroken surface — with lianas hanging at the platform edges.
- **The Deep Forest Descent**: down a 440° spiral round the Elder Tree, its limbs growing into the inside of the curve, then a slalom between trunks to the finish.

**Collision.** Every branch, root and limb inside the corridor is a chain of sphere obstacles that follows the drawn wood exactly (24 pieces of wood, 882 spheres, about 0.6 radii apart, so the surface dips by less than 5 % of the radius between them); trunks, aerial roots and lianas that stand through the corridor are vertical beams. Only those collide. The soft vegetation inside the corridor (curtains of vines, the leaves of the canopy roof) never collides and bursts into leaves when a ship flies through it; every other plant, tree and flower is kept out of the corridor by the clearance test V9's courses use, so nothing decorative can be an invisible wall.

### Orbital Nexus — the orbital station
**6.39 km a lap · 10 checkpoints · 7 boost rings · 20 energy cells · 3.7 km of it under gravity plating.** A megastation in orbit over a blue, cloud-covered world and its pale moon: hangars with parked ships, cargo containers and cranes; an energy core with a plasma reactor, rotating rings and conduits; glass corridors with space and the planet beyond the panes; a rotating gravity spindle; docking spines with haulers, radiators and solar wings; a habitat ring turning in the distance; patrol craft circling the station and freighters arriving and leaving.

The lap: launch from **the Hangar District** (an S-bend between bays, a crane bridge over the launch straight) → through a bulkhead into **the Energy Core**, where the plating takes over and the deck turns to the wall: a 270° wall ride round the reactor (three conduit struts reach out of the wall) → out of the core the deck turns on to the ceiling → **the Transparent Corridors**, a 180° turn upside down in glass tubes → **the Gravity Spindle**, a 560 m tunnel in which the deck turns back upright → an airlock → **the Exterior**, out over the plated hull of the station, the widest part of the course (46 m by 30 m), past antenna masts → the aperture back inside → **the Cargo Levels**, a plated deck that holds the ships through tight chicanes (radius 70 m) with pillars and a lane of cargo pods crossing → **Return to the Station** up the ramp to the finish. The HUD announces each part on the first lap and every change of gravity on every lap ("Gravity · the deck turns to the wall", "… to the ceiling", "… upright", "Gravity field · hold the deck", "Gravity off · zero-g").

### The gravity system (Orbital Nexus only)
- **Where it lives.** `src/sim/gravity.js`, used by no other course. The course data of Orbital Nexus mark the plated segments (`grav`) and how far the deck turns over a segment (`roll`); V10's path builder (`src/sim/pathtrack10.js`, new, used only by the two new courses) builds the turning deck into the course's frames. The game's global physics is not modified: the race loop calls `gravityStep()` after a ship's collisions only when its course has a gravity field (`if (t.grav)`, one line in `race.js`), so on the eight-course list it runs on Orbital Nexus alone, and the six V9 courses replay exactly as in V9 (tested).
- **What it does.** Inside a plated section the deck pulls every ship toward itself at 32 m/s², and a hover cushion (a spring of 90 /s² with damping of 15 /s within 2.5 m) holds it 3.8 m above the plating. The pull is along the course's current "up", so it turns with the deck. The field fades in and out over 100 m at the ends of each plated stretch, so no transition is abrupt; outside the plating ships fly exactly as on every other course.
- **Turning the deck.** A turn to the wall or the ceiling is eased over a whole segment (300 m for a quarter turn, 560 m for the half turn in the spindle): at most 0.6° of roll per metre, about the ride line, so a ship riding the deck stays on it while it turns. The ship's own roll levelling (V2's flight model, unchanged) keeps it aligned with the deck; the chase camera follows the ship's up as it always has (at most 1.43° of turn per frame through the transitions), so the view turns smoothly with the deck instead of jumping.
- **Boost, steering, braking, collision, respawn.** All the game's own code, unchanged: in a plated section a ship steers, boosts, drifts and brakes as anywhere else, bounces off the corridor walls in the deck's frame, and after a wreck or a manual reset it reappears on the deck, oriented with it (tested at every orientation).
- **Online.** The field is a function of the course position alone, built from the same course data by every game and the server, so every pilot feels exactly the same gravity at the same place; ship states carry the full orientation, so other pilots' ships are drawn standing on the walls and ceilings (tested with real clients through the server).

### How the two courses differ
| | Verdant Canopy | Orbital Nexus |
|---|---|---|
| The skill it asks for | reading organic obstacles early and threading the part of the corridor each one leaves open | holding a line on a deck that turns to the wall and the ceiling, with gravity holding you to it |
| Obstacles | 24 pieces of wood (882 collision spheres), 11 trunks, roots and lianas; soft vegetation you fly through | 9 structural obstacles (crane, struts, masts, pillars) and a lane of cargo pods |
| Physics | the standard flight model throughout | gravity plating on 3.7 km of the lap (walls, ceiling, a held deck); standard flight elsewhere |
| Corridor | 26–42 m wide, 16–21 m high, open sky above the canopy | 20–46 m wide, 10–30 m high; tunnels (2 km) and the wide open exterior |
| Height (the course's centre line) | from −110 m (the roots) to +322 m (above the canopy) and back down a 440° spiral | levels between −70 and +110 m inside and outside the station |
| Shape | sweeping bends, two full turns of spiral (−720° in all) | tight hangar and cargo turns (radius 70–100 m), a 270° wall ride and a 180° ceiling turn |
| AI lap times, full fields over five laps (Classic / Relaxed) | 46.6–54.7 s (median 50.1) / 55.9–69.7 s (median 63.8) | 34.6–40.7 s (median 36.7) / 42.7–53.4 s (median 48.2) |
| Look | organic, green, sunlit, misty | metal, glass and light, black space |

### The championship: you pick six of the eight courses
A championship still has six rounds (your instruction). After choosing the ship, *Select course* becomes the calendar: all eight courses are offered, you click six of them, and **the order of your clicks is the order of the rounds** ("Round 1" … "Round 6" on the cards, "k of 6 rounds chosen"). Clicking a picked course again takes it out and the later rounds move up; a seventh course cannot be added; *Random six* fills the calendar with six different courses at random and *Clear* empties it. *Start* stays disabled ("Pick N more courses") until six are picked. The run keeps its calendar: the championship hub shows it ("Calendar: 1. ✓ …"), names the next round from it, and a saved run continues with it after a reload. Rewards do not depend on the courses: each round pays the same race reward as before and the completion and standing bonuses are unchanged (tested: the same places pay the same on any calendar). A run saved by V9 (which has no calendar of its own) continues on V9's fixed calendar; a damaged calendar is replaced by it; a calendar that is not six different known courses is refused.

### How the new courses fit into the rest of the game
- **Quick race and Time trial:** *Select course* lists eight courses, each with its own card and route map; records, ghosts and rewards work as on the other courses.
- **Online multiplayer:** the server's random picks for both stages of a tournament now come from all eight courses (`ELIGIBLE_TRACKS` can still limit them); every pilot gets the same course. The protocol number goes from 2 to 3, because a V9 game does not have the new courses: a V9 game connecting to a V10 server (or the other way round) gets the existing "version" answer and is not let in. The server reports version 10.0.0 on `/health`. Tournament format, player limits, qualification, rewards and the server architecture are unchanged.

### Performance: culling and level of detail
The new courses use the game's existing mechanisms (chunked scenery with bounding spheres and draw distances, instanced populations with per-instance frustum and size culling and screen-size LOD, haze sprites capped by the preset) and change nothing global. Verdant Canopy's forest is about 7,200 instanced trees (trunks with three levels of detail chosen by their width on screen, crowns with four), split into a population within 300 m of the course that casts shadows and one beyond it that does not; 3,500 thickets and 2,800 tree ferns on the floor near the course (three levels, size-culled); each of the 30 colossal trees is its own item with three levels of detail chosen by the size on screen of its nearest crown or trunk; small detail (moss, leaves, flowers, ferns, thin lianas, soft vegetation) is in its own chunks drawn to 1.6 km. Orbital Nexus is chunked like the V9 courses. Measured costs are in *Tests*.

### Deploying V10 to your GitHub Pages site and Render server
**Status: V10 is built and tested here; it is not deployed.** Your site (`https://jonathanimhof-hr.github.io/galactic_rush/`) and your server (`wss://galactic-rush.onrender.com`) keep running V9 until you update both, and they must be updated together: a V10 game only talks to a V10 server, and the other way round. Updating GitHub does not by itself update the server: Render rebuilds and restarts it from the new commit (automatically if *Auto-Deploy* is on for the service, otherwise with *Manual Deploy → Deploy latest commit*).
1. Unpack the package first (never drag files out of the zip itself). Open your repository in github.dev (press `.` on its GitHub page), drag everything inside the package's `upload-to-github/` folder onto the file tree, answer *Replace* whenever it asks, then *Source Control → Commit & Push*. The folder is the complete repository for V10: whole `src/`, `server/`, `tests/` and `dist/` folders (`dist/` keeps every earlier build, the V5–V9 files and V8's and V9's site pages in `dist/site-v8/` and `dist/site-v9/`, so replacing it loses nothing), the V10 game page as `index.html` and `config.js` with your server address. The Pages workflow (`.github/workflows/pages.yml`) runs `npm test`, builds and publishes `dist/site/` as before.
2. Wait for Render to finish the deploy, then open `https://galactic-rush.onrender.com/health`: it must show `"version":"10.0.0"` and `"protocol":3`.
3. Open the site (give GitHub Pages a minute, then reload with Ctrl+F5): the tab must read *Galactic Rush V10*, and *Select course* must list Verdant Canopy and Orbital Nexus.

### What changed in existing files
Everything else is new: `src/sim/pathtrack10.js` (the V10 path builder: smooth heights, banking and the turning deck), `src/sim/gravity.js` (the gravity plating), `src/sim/tracks-v10.js` (the two course definitions with their checkpoints, boost rings, energy cells, wood, obstacles and platforms), `src/render/courses/v10kit.js` (eight new shaders: bark, foliage, forest floor and canopy, water, light shafts, reactor plasma, gravity plating, glass; geometry helpers), `src/render/courses/canopy.js` and `nexus.js` (the two worlds), and the tests `tests/v10-maps.test.js`, `tests/v10-championship.test.js`, `tests/v10-playtest.py`, `tests/v10-wrecks.mjs`, `tests/v10-notices.mjs`, `tests/v10-fixedcost.py`, `tests/v10-costsplit.py` and `tests/specs/v9-courses-v10.json`.

| File | Change | Why it is needed |
|---|---|---|
| `src/sim/tracks.js` | 2 imports; the two course definitions appended to the course list; a course marked `build: 'path10'` is built by `pathtrack10.js` (5 lines) | registers the courses; the six V9 courses are still built exactly as in V9 |
| `src/sim/race.js` | 1 import, 1 line: `if (t.grav) gravityStep(t, r, dt)` after a ship's collisions | the gravity plating, isolated to the course that has a field |
| `src/render/courses/all.js` | 2 imports, 2 `registerCourse` lines | registers the two scenery builders |
| `src/racefx.js` | 1 line: if a course has a `notice()`, its message is shown on the HUD | the gravity and section announcements; no V9 course has one |
| `src/config.js` | `CHAMPIONSHIP_ROUNDS = 6` | the championship picker; `CHAMPIONSHIP` (V9's calendar) stays for runs saved by V9 |
| `src/progress/profile.js`, `src/progress/index.js` | a run carries its calendar (`tracks`): validated when the run starts, kept and repaired in saves, used to check each round and to count the rounds; runs without one use V9's calendar | the championship picker; rewards untouched |
| `src/main.js` | the picked calendar goes to the run and each round's course comes from it; three actions (`champPick`, `champRandom`, `champClear`); *Start* needs six picks; the screenshot test hook accepts an up vector; one import line moved below the new one | the championship picker; the test hook for views of the turning deck |
| `src/ui.js`, `src/ui-garage.js`, `index.html` | the championship course screen becomes the picker; the hub shows and follows the run's calendar; two CSS rules: one dims the courses you can no longer add, one gives a selected Verdant Canopy card a solid backing (its bright jungle preview would drown the text) | the championship picker; the new course's card |
| `src/mp/protocol.js` | `PROTOCOL = 3` | a V9 game must not join a server that can pick courses it does not have |
| `server/index.mjs`, `server/package.json`, `server/config.mjs` | version 10.0.0; a comment | `/health` shows which server runs |
| `build.mjs` | V10 file names and page title (the V5–V9 files are never written) | publishing V10 next to V9 |
| `tests/progression.test.js`, `tests/v9-maps.test.js`, `tests/multiplayer.test.js`, `tests/mp/server.test.mjs` | eight courses in the list (the six V9 courses still first, still checked), version 10.0.0, new V10 tests | the tests follow the integration |

Byte-identical to V9: `src/sim/track.js`, `pathtrack.js`, `tracks-v9.js`, `flight.js`, `ai.js`, `championship.js`, `src/camera.js`, `src/render/gfx.js` and every other renderer module, all six V9 course builders and `v9kit.js`, audio, the garage, the career's rewards and economy, the shop and all of `src/mp/` except the protocol number, and all of `server/` except the version number and one comment. `dist/galactic-rush-v5…v9*.html` keep their checksums; V9's GitHub Pages files are kept in `dist/site-v9/`.

### Tests (everything below was actually run, on this build)
One 2-core Linux machine: Node 22 for the Node tests and the server, headless Chromium with software WebGL (SwiftShader) for the browser tests. The multiplayer server ran locally for every test; nothing was tested against your Render server. Logs, reports and screenshots are in the package's `validation/` folder.

| Suite | What it covers | Result |
|---|---|---|
| `npm test` | V9's suites, whose course-wide tests now also run on the two new courses (a valid, closed, non-self-intersecting corridor; a full AI field over three laps), plus `tests/v10-maps.test.js` and `tests/v10-championship.test.js`. **V9 unchanged:** the six V9 courses' complete course data equal a fingerprint taken from the V9 source, and **whole races on them replay bit for bit as on the V9 build** (a scripted player and the five AI pilots for 75 s in both handling modes: every ship's position, velocity, orientation, hull and progress every quarter second, which covers the flight model, the AI, the collisions, the handling modes and the weapons); no course but Orbital Nexus has a gravity field or a roll. **New courses:** closed and continuous, frames turning at most 4.1° (Canopy) and 3.3° (Nexus) per sample, separate parts of the course at least 26 m / 20 m apart, checkpoints in order. **Verdant Canopy:** 882 collision spheres on 24 pieces of wood, each exactly on its drawn wood (worst misfit 0.0000 m); the smallest free opening past any obstacle has a radius of 8.6 m; obstacles at least 60 m apart; the platforms form one unbroken surface; soft vegetation never collides. **Orbital Nexus:** the deck turns to 0°, −90°, −180°, −270° and −360° at no more than 0.6° per metre; in full fields in both handling modes every ship stays on the deck in every orientation (median ride height above the plating, Classic / Relaxed: upright 4.6 / 3.6 m, wall 2.2 / 2.9 m, ceiling 3.5 / 3.6 m; upright with the deck 100 % of the time); **a respawn in every orientation** (after a wreck and after a manual reset) puts the ship back on the deck, oriented with it, and the lap goes on; every ship boosting, braking and steering hard through every transition stays on the deck; **the chase and far cameras** turn at most 1.43° per frame in the gravity sections, trail a rolling deck by at most 39° and sit within 8° of it between rolls. Full AI fields over **five laps** on both courses in both handlings; every ship, both handlings, every lap count, a lap on each new course; fresh builds equal the shared course data, and the server's lap and checkpoint data match them. **Championship:** six rounds picked from eight in any order; a round on any other course than the next one in the calendar is refused; the same places pay the same on any calendar (round rewards and bonus); only six different known courses are accepted; the calendar survives a reload; a run saved by V9 keeps V9's calendar; a damaged calendar is repaired. In `tests/multiplayer.test.js`: the server's race referee accepts a legitimate five-lap run on each new course (on Nexus through the walls, the ceiling and zero-g) and refuses a 1.5 km jump | **120/120 pass** in 62 s: V9's 96, V9's per-course AI race test once more for each new course, and 22 new |
| `npm run test:mp` | the real server with real WebSocket clients flying the game's own simulation (V9's suite, all unchanged rules), plus **a whole tournament on Verdant Canopy and Orbital Nexus** (`ELIGIBLE_TRACKS=canopy,nexus`): every pilot gets the same course, five laps, all three finish the qualifier, the final is on the other new course, results and rewards match, no valid state refused; **gravity in sync:** every ship state the server relayed to one pilot during the Nexus race is checked against the course: in the gravity sections the other pilots' ships stand on the deck; and **a V9 game (protocol 2) is turned away** with the version message | **13/13 pass** in 4.5 min: V9's 12 and the new one. Its tournament: qualifier on Orbital Nexus (all three finished, 229.0–254.3 s), final on Verdant Canopy (287.4 s and 303.3 s); 318 relayed states in the gravity sections, all 318 with the ship's up within 45° of the deck's (median alignment 1.00 upright (52 states), on the wall (137) and on the ceiling (129)); a V9 hello got the version message; V9's own V9-course tournament passed unchanged |
| `python3 tests/mp/e2e.py` with `ELIGIBLE_TRACKS=canopy,nexus` | V8's three-browser end-to-end test (three separate browser processes, the game's own screens, two complete tournaments, rewards, a dropped connection, leaving mid-race), with the server restricted to the two new courses | Two runs; every check passed in at least one of them, and each failure came from the test machine (three software-rendered games on two cores), not from the game or the server. **Run 1** (race clocks ×4): 24 checks passed — the first tournament from lobby to rewards: qualifier on Orbital Nexus (all three finished, 236.2–256.5 s), final on Verdant Canopy (won in 332.9 s, second 334.0 s), rewards paid once each (1,232 CR and 3 ST to the winner), the start synchronised (start estimates within 0 ms, GO within 3 ms), remote ships drawn a median 134–139 ms behind and 0.06–0.08 m off their real paths; the second tournament's dropped connection reconnected — then the run stopped: the pilot meant to leave mid-race left after the other two had already finished their five laps (the server logged the leave and closed the stage at once), so the race the test was watching had ended. **Run 2** (race clocks ×2, so that the race outlasts those steps): **28/29 checks pass**, including leaving mid-race (the others see that pilot out), the reconnected pilot finishing both races, the second tournament paying again under its own id, leaving multiplayer, no page errors; qualifier on Verdant Canopy (348.0–382.3 s), final on Orbital Nexus (238.1 s and 248.9 s); remote ships a median 149–158 ms behind and 0.02–0.03 m off. Its one failure is the start check on the Canopy qualifier: the three games agreed on the server's start time within 2 ms, but two of them drew no frame for 11 s and 31 s around that moment (the forest is the slowest course to draw in software), so their first frame after the start came that late |
| `python3 tests/playtest.py races` (V10 build) | the built game, autopilot, one lap: Verdant Canopy and Orbital Nexus reach the results screen with every racer finished | Verdant Canopy: all six finished (60.4–70.1 s); Orbital Nexus: all six finished (47.7–51.3 s); no console errors |
| `python3 tests/v10-playtest.py menus` | title → hangar → *Select course* lists the eight courses in order → the menu preview flies over each new course → Verdant Canopy and Orbital Nexus launched from the menus → flyover → the race clock runs after the countdown → pause → quit to menu; **the championship picker**: all eight courses offered, *Start* disabled before six are picked, picked courses show their round, a second click takes a course out and the later rounds move up, a seventh course cannot be added, *Start* enabled at six, *Clear* empties, *Random six* picks six different courses | **17/17 checks pass**, no console errors (an earlier run on the build before the final one, which differed only in one CSS rule, failed one check because it read the race clock during the countdown; the check now waits for the countdown) |
| `python3 tests/v10-playtest.py champ` | a whole Rookie championship through the menus on a picked calendar (Verdant Canopy, Halo of Vashti, Orbital Nexus, Neon Spire, Pelagos, Cinder Belt; one lap per round, autopilot, fast-forwarded): rounds raced in the picked order; after each round the hub names the next round from the calendar and shows the calendar; after round 6 the run closes, the completion bonus is paid once and the finished run keeps its calendar | **10/10 checks pass**: rounds raced in the picked order; the hub offered each next round (round 2: Halo of Vashti … round 6: Cinder Belt) with the calendar line; the run closed after round 6 with the completion recorded and paid; the finished run kept its calendar; 659 CR over the run; no console errors |
| `python3 tests/v10-playtest.py canopy` | in-game frames with the chase camera through every part of Verdant Canopy (two per long section), and the course's announcements: the first one through the real frame loop and HUD while racing, the rest from the course itself at every step of the lap | the HUD showed *The Root Passage* while racing (pass); 18 frames through the Root Passage, the Branch Network, the Skylight, the Canopy Run, the Floating Platforms, the descent, the spiral, the slalom and the final straight on lap 1 and the start on lap 2, no console errors. The run then hit its 40-minute limit (software rendering of the forest is slow) one frame before its announcement check, so the announcements were checked separately: the course's own `notice()` asked after every simulation step of an autopilot race in Node (`node tests/v10-notices.mjs`) announced *The Root Passage* (sample 75), *The Branch Network* (280), *The Canopy Run* (636), *The Floating Platforms* (1094) and *The Deep Forest Descent* (1384) on lap 1 and nothing on lap 2, as designed; the same check on Orbital Nexus gave the eleven announcements of the browser run and the gravity changes again on lap 2 |
| `python3 tests/v10-playtest.py nexus` | the same through Orbital Nexus; in every gravity section the camera's up must be within 60° of the deck's up and the ship must ride the deck (1.5–12 m above it); every district and every gravity change announced on the first lap | **13/13 checks pass**: 24 frames; in the 11 frames inside gravity sections (walls, ceiling, the spindle's half turn, the cargo deck) the camera's up was aligned with the deck's (dot product 0.94–1.00) and the ship rode 3.5–11.9 m above the plating; the HUD showed *Hangar District* while racing; the lap announced *Energy Core · the deck turns to the wall*, *Gravity · the deck turns to the ceiling*, *Transparent Corridors*, *Gravity Spindle · the deck turns upright*, *Gravity off · zero-g*, *Exterior*, *Return to the station*, *Cargo Levels · Gravity field · hold the deck*, *Gravity off · zero-g*; no console errors |
| `python3 tests/v10-playtest.py trial` | a time trial on each new course (autopilot) saves a record lap and its ghost; the next trial loads the ghost and shows it | **4/4 checks pass** (Verdant Canopy: a 61.7 s lap with 1,234 ghost frames; Orbital Nexus: 46.8 s, 936 frames), no console errors |
| `python3 tests/v10-playtest.py settings` | every preset (Low → Ultra) and every graphics toggle switched at run time on Verdant Canopy and on Orbital Nexus: the renderer follows each preset, no WebGL errors, no page errors, no blank frames | **46/46 steps pass** (23 per course), no console errors |
| Regression: matched screenshots | `tests/matched.py` (V8's ten fixed views of the original courses, the race frozen) on the V9 build and on the V10 build; pixel differences V9 → V10 | Ten views: mean difference 1.8–2.7 levels on the frozen views and 0.00–0.68 % of pixels off by more than 16 levels (the flyover, a moving camera: 4.1 levels, 2.2 %); V9 → V9 (the noise of animated clouds, particles and lights): 1.5–2.6 levels and 0.00–0.54 % (flyover 2.5 levels, 0.2 %), so on the frozen views V9 → V10 differs no more than V9 does from itself (the flyover depends on when its moving camera is caught); table `validation/logs/matched-diff.md`, sheet `validation/sheets/regression-v9-v10.jpg`. Side by side the frames are the same; the course data are identical by the fingerprint test, and the renderer code for these courses is byte-identical |
| Regression: Pelagos and Ignara | the same six views (wave skimming, loop 1, the narrows; the canyon, the tunnel, the ridge) rendered by the V9 and the V10 build (`tests/compare.py` with `tests/specs/v9-courses-v10.json`) | mean difference 2.3–3.9 levels and 0.1–3.3 % of pixels in five views; the Ignara canyon, whose lava flows and cracks with time, 8.4 levels and 11.4 %; side by side the same scene (sheet `validation/sheets/compare-v9-courses.jpg`) |
| Regression: V9's championship test on the V10 build | `tests/v9-playtest.py champ6` with the V10 build: a championship started without picking courses (`?skipmenu=1&mode=champ`, as V9's flow did) keeps V9's calendar; all six V9 courses raced in the built game | **6/6 checks pass**: rounds raced on V9's calendar (Foundry Trench, Cinder Belt, Neon Spire, Halo of Vashti, Pelagos, Ignara); the hub offered round 5: Pelagos and round 6: Ignara; the run closed after round 6 with the completion bonus (225 CR) paid once; 609 CR over the run; no console errors |
| Regression: V7–V9 suites on the V10 build | `tests/progression.py` phase A (rewards on every difficulty, the Rookie → Pro → Ace championship ladder, six rounds each, upgrades reaching the physics) and phase B (shop, premium placeholders, paint jobs on the 3D ships, keyboard control, career); `tests/settings.py` (Neon Spire) | progression phase A **31/31** (its three championships, started as in V9 without picking courses, run six rounds each on V9's calendar), phase B **17/17**; settings **23/23** — the same totals as on V9; no console errors |
| AI incidents (`node tests/v10-wrecks.mjs`) | wrecks, knocks and lap times in full-field five-lap races (three seeds per course and handling mode) on the new courses | Verdant Canopy 31.7 wrecks per race in Classic, 3.7 in Relaxed, no ship failing to finish (laps 46.6–54.7 s / 55.9–69.7 s); Orbital Nexus 5.7 / 2.0 (34.6–40.7 s / 42.7–53.4 s); V9 measured 10.0 / 0 (Pelagos), 11.0 / 2.0 (Ignara) and 17.3–55.0 / 0–24.0 (the original courses) |
| CPU per frame (`tests/framecost.py`) | one game frame without drawing (simulation, course update, effects, HUD), median / 95th percentile over 300 frames in the built game | Verdant Canopy 2.7 / 5.7 ms (its instance sets — about 24,700 trees, thickets and ferns — are culled and sorted into levels of detail every frame), Orbital Nexus 0.7 / 1.3 ms; Foundry Trench 0.9 / 1.6, Pelagos 0.8 / 1.3, Ignara 0.7 / 1.6 ms on the same run (V9 measured 0.8–2.3 / 1.7–4.8 ms on its courses). One frame in the Canopy run took 3.7 s (a single stall in 300 frames, not repeated) |
| Course build (`tests/buildcost.py`) | building a course's scene in the game (software WebGL; every course is built once while the game loads) | Verdant Canopy 3.5 s, Orbital Nexus 9.0 s; Foundry Trench 9.6 s, Pelagos 14.0 s, Ignara 1.0 s on the same run (these times swing by a factor of two to three from run to run in software rendering; V9 measured 3.0–18.3 s); all eight courses are built while the game loads |

**Benchmark.** The game's own benchmark (`?bench=short&track=<course>`: autopilot, 12 s per preset, Low → Ultra) on the V10 build for all eight courses and on the V9 build for its six, same machine, same presets. SwiftShader draws a frame every one to fifteen seconds here, so each row rests on 1 to 12 frames and the frame times are rough; draw calls and triangles are the telling numbers. Verdant Canopy draws 152–160 calls and 0.33–0.42 million triangles (the most of any course on High and Ultra), Orbital Nexus 184 calls and 0.37 million; the six V9 courses draw 110–320 calls and 0.21–0.37 million. *Instances* counts the instanced scenery: on Verdant Canopy about 6,070 trees, thickets and ferns drawn of 24,735 considered (frustum-, size- and LOD-culled every frame).

| Course | Preset | Median frame (ms) | 95th pct (ms) | Avg FPS | Draw calls | Triangles | Instances drawn / considered |
|---|---|---|---|---|---|---|---|
| Foundry Trench | low | 3299.9 | 6516.3 | 0.3 | 116 | 337,468 | 0 / 0 |
| Foundry Trench | medium | 1816.5 | 3799.8 | 0.6 | 118 | 365,024 | 0 / 0 |
| Foundry Trench | high | 2700 | 5199.8 | 0.3 | 117 | 362,232 | 0 / 0 |
| Foundry Trench | ultra | 2633.2 | 5166.4 | 0.4 | 117 | 362,232 | 0 / 0 |
| Cinder Belt | low | 4466.4 | 6966.3 | 0.2 | 118 | 237,744 | 517 / 2600 |
| Cinder Belt | medium | 2449.9 | 4483.1 | 0.5 | 119 | 269,738 | 518 / 2600 |
| Cinder Belt | high | 4349.8 | 7733 | 0.2 | 119 | 288,744 | 519 / 2600 |
| Cinder Belt | ultra | 4249.8 | 8299.6 | 0.3 | 119 | 302,374 | 519 / 2600 |
| Neon Spire | low | 4616.5 | 6866.3 | 0.2 | 307 | 301,908 | 992 / 3472 |
| Neon Spire | medium | 7433.1 | 7499.7 | 0.2 | 311 | 318,546 | 994 / 3472 |
| Neon Spire | high | 10399.5 | 10766.2 | 0.1 | 318 | 349,040 | 996 / 3472 |
| Neon Spire | ultra | 20365.8 | 20365.8 | 0 | 320 | 358,540 | 994 / 3472 |
| Halo of Vashti | low | 5966.5 | 8166.3 | 0.2 | 110 | 205,776 | 888 / 7200 |
| Halo of Vashti | medium | 1749.9 | 3066.6 | 0.7 | 111 | 216,020 | 1016 / 7200 |
| Halo of Vashti | high | 2383.3 | 4249.9 | 0.5 | 111 | 216,334 | 1016 / 7200 |
| Halo of Vashti | ultra | 2149.9 | 5866.3 | 0.4 | 111 | 221,147 | 1084 / 7200 |
| Pelagos | low | 5833.2 | 7549.7 | 0.2 | 141 | 346,048 | 0 / 0 |
| Pelagos | medium | 1066.7 | 4333.1 | 0.6 | 141 | 346,048 | 0 / 0 |
| Pelagos | high | 3133.2 | 6116.5 | 0.3 | 141 | 346,048 | 0 / 0 |
| Pelagos | ultra | 2999.9 | 5949.7 | 0.3 | 141 | 346,048 | 0 / 0 |
| Ignara | low | 6199.7 | 6383 | 0.2 | 133 | 310,126 | 0 / 0 |
| Ignara | medium | 1616.6 | 3699.8 | 0.6 | 133 | 310,126 | 0 / 0 |
| Ignara | high | 2733.2 | 5283.2 | 0.3 | 133 | 310,126 | 0 / 0 |
| Ignara | ultra | 2733.2 | 5349.7 | 0.4 | 133 | 310,126 | 0 / 0 |
| Verdant Canopy | low | 6733 | 7333.1 | 0.2 | 152 | 332,878 | 6063 / 24735 |
| Verdant Canopy | medium | 2799.9 | 5133.2 | 0.3 | 158 | 364,444 | 6070 / 24735 |
| Verdant Canopy | high | 7333 | 8682.9 | 0.2 | 160 | 399,057 | 6069 / 24735 |
| Verdant Canopy | ultra | 14966.1 | 14966.1 | 0.1 | 160 | 419,041 | 6068 / 24735 |
| Orbital Nexus | low | 6216.5 | 7649.7 | 0.2 | 184 | 374,520 | 0 / 0 |
| Orbital Nexus | medium | 1833.2 | 6266.4 | 0.4 | 184 | 374,520 | 0 / 0 |
| Orbital Nexus | high | 14532.8 | 14532.8 | 0.1 | 184 | 374,520 | 0 / 0 |
| Orbital Nexus | ultra | 4916.5 | 5133.2 | 0.2 | 184 | 374,520 | 0 / 0 |

V9 and V10 on the six V9 courses (same benchmark, same presets): the same draw calls and triangles (where a row differs slightly, the autopilot was elsewhere on the course when the frames were sampled) and, on Medium, High and Ultra, the same frame times within the noise. The **Low** rows of the V10 build are slower, on every course, because Low is the first preset each run measures and the first seconds after the game has loaded are slower while it settles, more so with two more courses loaded: run in the order Medium, Low, Medium on Foundry Trench, the V10 build drew its first Medium at 4.9 s per frame and then Low at 1.6 s and Medium at 1.8 s; the V9 build 2.6 s, 2.6 s and 1.9 s.

| Course | Preset | V9 median (ms) | V10 median (ms) | V9 draws | V10 draws | V9 triangles | V10 triangles |
|---|---|---|---|---|---|---|---|
| Foundry Trench | low | 1016.7 | 3299.9 | 117 | 116 | 348,422 | 337,468 |
| Foundry Trench | medium | 1749.9 | 1816.5 | 118 | 118 | 365,024 | 365,024 |
| Foundry Trench | high | 2749.8 | 2700 | 117 | 117 | 357,949 | 362,232 |
| Foundry Trench | ultra | 2733.2 | 2633.2 | 116 | 117 | 351,524 | 362,232 |
| Cinder Belt | low | 1433.3 | 4466.4 | 118 | 118 | 237,777 | 237,744 |
| Cinder Belt | medium | 1433.2 | 2449.9 | 119 | 119 | 272,184 | 269,738 |
| Cinder Belt | high | 4599.8 | 4349.8 | 119 | 119 | 291,132 | 288,744 |
| Cinder Belt | ultra | 100 (five frames of 0.1 to 12.4 s) | 4249.8 | 119 | 119 | 302,374 | 302,374 |
| Neon Spire | low | 3300 | 4616.5 | 307 | 307 | 301,868 | 301,908 |
| Neon Spire | medium | 7649.7 | 7433.1 | 309 | 311 | 314,689 | 318,546 |
| Neon Spire | high | 11216.1 | 10399.5 | 318 | 318 | 340,806 | 349,040 |
| Neon Spire | ultra | 20832.5 | 20365.8 | 320 | 320 | 358,180 | 358,540 |
| Halo of Vashti | low | 666.6 | 5966.5 | 110 | 110 | 205,919 | 205,776 |
| Halo of Vashti | medium | 1916.6 | 1749.9 | 111 | 111 | 216,039 | 216,020 |
| Halo of Vashti | high | 2083.3 | 2383.3 | 111 | 111 | 216,183 | 216,334 |
| Halo of Vashti | ultra | 2616.5 | 2149.9 | 111 | 111 | 221,164 | 221,147 |
| Pelagos | low | 916.7 | 5833.2 | 141 | 141 | 346,048 | 346,048 |
| Pelagos | medium | 1766.5 | 1066.7 | 141 | 141 | 346,048 | 346,048 |
| Pelagos | high | 5616.4 | 3133.2 | 141 | 141 | 345,570 | 346,048 |
| Pelagos | ultra | 3116.6 | 2999.9 | 140 | 141 | 343,656 | 346,048 |
| Ignara | low | 850 | 6199.7 | 133 | 133 | 307,738 | 310,126 |
| Ignara | medium | 1783.2 | 1616.6 | 133 | 133 | 310,126 | 310,126 |
| Ignara | high | 2833.3 | 2733.2 | 133 | 133 | 310,126 | 310,126 |
| Ignara | ultra | 2733.3 | 2733.2 | 133 | 133 | 310,126 | 310,126 |

**Every course from the same cameras** (`tests/v10-fixedcost.py`: the V10 build, Medium preset at 960×540, the race frozen, a chase camera at 25 %, 50 % and 75 % of the lap, nine frames per view after three warm-up frames, all courses one after the other in one browser), which is steadier than the benchmark above:

| Course | Median frame of the three views (ms) | The three views: frame (ms), draw calls, triangles |
|---|---|---|
| Foundry Trench | 3333 | 4400 ms, 88 calls, 339,768 tris · 3333 ms, 98 calls, 345,396 tris · 2983 ms, 134 calls, 358,016 tris |
| Cinder Belt | 2933 | 3650 ms, 132 calls, 316,834 tris · 2283 ms, 70 calls, 136,570 tris · 2933 ms, 70 calls, 202,460 tris |
| Neon Spire | 7616 | 7433 ms, 192 calls, 299,008 tris · 9983 ms, 270 calls, 396,072 tris · 7616 ms, 257 calls, 286,740 tris |
| Halo of Vashti | 1833 | 1833 ms, 106 calls, 254,706 tris · 1717 ms, 65 calls, 152,060 tris · 1850 ms, 140 calls, 282,008 tris |
| Pelagos | 1783 | 1083 ms, 37 calls, 224,112 tris · 1783 ms, 60 calls, 255,840 tris · 2133 ms, 104 calls, 301,556 tris |
| Ignara | 2183 | 2016 ms, 43 calls, 183,520 tris · 2183 ms, 77 calls, 256,968 tris · 2433 ms, 41 calls, 188,304 tris |
| Verdant Canopy | 8933 | 8933 ms, 128 calls, 382,916 tris · 7816 ms, 146 calls, 389,438 tris · 8933 ms, 172 calls, 469,756 tris |
| Orbital Nexus | 2433 | 2433 ms, 76 calls, 277,748 tris · 4150 ms, 172 calls, 372,500 tris · 1750 ms, 45 calls, 244,886 tris |

Orbital Nexus draws like the V9 courses. **Verdant Canopy is the slowest course to draw in software rendering**, about 1.2 times Neon Spire (until now the slowest) and three to five times the others: its draw calls are within the range of the other courses and its triangles at the top of it (up to 0.47 million in one of these views), and almost every pixel of a forest view is wood or foliage under a textured shader, layer behind layer, which a software renderer pays for pixel by pixel. Where its frame goes (the same fixed camera with one part of the scene switched off at a time: `tests/v10-costsplit.py`, log `validation/logs/perfsplit-canopy.log`): in the Branch Network (25 % of the lap), of 9.2 s, the instanced forest trunks take about 3.2 s and the instanced crowns, thickets and ferns about 3.0 s; the forest floor, the colossal trees, the wood across the corridor, the leaves, flowers, light shafts and water each less than 0.6 s. How it runs on a graphics card was not measured: none was available.

### Limitations
- **The energy core's wall ride in Classic handling:** the 270° turn round the reactor presses the ships toward the plating on top of the plating's own pull, so at full Classic speed they ride about 2.2 m above the plating there instead of 3.8 m (Relaxed: 2.9 m). They stay on the deck and upright with it; changing this would have meant changing the ships' handling, which the brief rules out.
- **AI incidents on Verdant Canopy in Classic handling:** a full field of AI pilots wrecks 31.7 times in a five-lap race (three seeds; within the range of the original courses, 17–55 in V9's measurement; Relaxed 3.7), most of them in the slalom between the trunks and at branches, and the roots and branches take the most knocks. The AI pilots are V9's, unchanged. Orbital Nexus: 5.7 and 2.0.
- **The forest from afar:** beyond a few hundred metres the canopy's trees are lumps of foliage with a leaf texture (the levels of detail that keep the course's triangles near those of the V9 courses), not individual leaves; the 30 colossal trees switch between three levels of detail at a fixed size on screen, which can be noticed as a slight change of a crown's outline.
- **The championship picker** keeps your picks until you reload the page; a run in progress keeps its own calendar in the save. Online tournaments still pick their courses at random on the server (unchanged).
- **Energy walls:** as on V9's open courses, all four faces of the corridor show the hex field near your ship; in Verdant Canopy's dense forest it stands out more than over open space.
- The **benchmark screen's title** names the new courses by their id (`canopy`, `nexus`), because the benchmark title uses a fixed table of the four original names in `src/main.js` (as in V9).
- **No person has flown the new courses:** the game's AI pilots and the automated tests flew them thousands of times (every ship, both handling modes, every lap count, full fields), but how the gravity sections and the branches feel with a keyboard or a gamepad was not tried by a human.
- **Verdant Canopy is the heaviest course to draw:** in software rendering it draws about 1.2 times slower than Neon Spire, until now the slowest, and three to five times slower than the other courses (*Tests*); its levels of detail keep the triangles within the range of the other courses, but a forest view is wood and foliage in every pixel. Its CPU time per frame is also the highest (2.7 ms median).
- **Software rendering only:** the frame times here are for comparing courses and builds on the same machine, not what a graphics card will do. No real GPU, phone or tablet was tested.
- **Online:** tested with real WebSocket clients and three browser games against a local server, not against the deployed Render server or between separate devices over the internet. A V9 game and a V10 server (or the other way round) cannot play together.

## V9: two new worlds — Pelagos and Ignara

V8 is the baseline and is treated as frozen. V9 adds exactly two new, fully playable courses, **Pelagos** (an ocean world with two full 360° vertical loops) and **Ignara** (a volcanic world), and the few isolated lines that make them part of every mode: Quick race, Time trial, the Championship and Online multiplayer. No existing course, ship, handling mode, physics or collision rule, AI rule, camera, renderer path, effect, reward rate, tournament rule or part of the multiplayer architecture was changed: *What changed in existing files* lists every changed line, and the tests below show that the four original courses carry exactly V8's course data and render as in V8.

### Pelagos — the ocean world
**7.77 km a lap · 9 checkpoints · 7 boost rings · two vertical loops.** A storm-tossed ocean to the horizon under a drifting cloud deck; lightning flickers through the storm cells and lights the clouds and the sea; offshore extraction rigs with gas flares, a research station on stilts, a processing plant with tanks and pipe racks, truss bridges between the installations, islands with a lighthouse, buoys, a floating arcology, a space elevator and wind turbines on the skyline, freighters ploughing the swell, and spray where ships skim the waves.

The lap: the start straight → a long right-hand descent to **skim the waves** about 16 m above the sea, under the deck of an extraction platform → a climb into **loop 1** (radius 150 m, 300 m tall), carried out of the sea by two giant towers → **the hook**, a 135° right-hander → **the narrows**, an S-bend between twin platforms, with two of their support columns standing in the corridor and a pipe bridge across it → the bridge straight → the island sweeper past the lighthouse → **loop 2** (radius 135 m) → the gas-flare turn → a second wave-skimming run → the return straights and the final turn.

### Ignara — the volcanic world
**5.77 km a lap · 9 checkpoints · 6 boost rings · one rock tunnel.** Ash clouds lit orange from below; rivers and lakes of lava whose dark crust plates drift with the flow and crack open to the glowing melt; lava falls pouring off the canyon rims; glowing fissures in the hot rock; smoke, ash and embers; three volcanoes on the horizon, one of them erupting (glowing bombs, a dark column and a flash every 9 to 21 s); smelters, cooling towers, drilling rigs, tanks, conveyors and pipelines of a mining operation.

The lap: the start straight over a lava river → the **descent into a basalt canyon** with the lava river below and lava falls pouring in → linked bends down the canyon → **the drop** beside the falls into the basin → **the hairpin** (radius 80 m) round a rock spire → across the basin lake past basalt columns → a 380 m **rock tunnel** climbing 65 m, with two rock ribs across the bore (one low, one high), lit by work lamps and glowing seams → out onto **the ridge**, with the erupting volcano straight ahead → the ridge descent → **the mine bridge** over a lava lake → **the mine chicane** under a conveyor gantry → **the natural arch** → the flats and the final sweep, with pipelines on stilts. Hazards: basalt columns rising out of the river and the basin (off the racing line), the tunnel ribs and the gantry.

### The loops
- **Real geometry, local to the new courses.** Pelagos and Ignara are built by a new course builder, `src/sim/pathtrack.js`: a plan of straights and arcs with smooth height changes and genuine vertical loops, closed exactly by solving one free arc and two free straights. In a loop the curvature eases in over a ramp, holds 1/R and eases out, so the course pitches through exactly 360°; the exit is shifted 56 m sideways, so the corridor never passes through itself. Every sample of the course carries an orthonormal frame, and in a loop its "up" turns with the loop: it points at the loop's centre all the way round, so the course is upside down at the top.
- **No change to the physics.** The flight model has no gravity (it is an arcade racer); the ship's roll levelling, the steering assist, the wall collisions, progress, checkpoints, respawns and the chase camera already work in the course's own frame. With correct frames they follow the course through the full 360° without a line of their code changed. The four original courses are still built by V8's `Track` class, byte for byte.
- **What the pilot does:** pitch up through the loop, as on any climb (the steering assist helps exactly as on the other courses). In **Relaxed** handling the ships hardly touch the loop walls (two light contacts in 20 single laps of the test matrix below). In **Classic** handling at full speed the faster ships cannot pitch quite as fast as the loops turn and brush their outer floor: in the single-ship test matrix that cost at most 7.7 % of a hull in one loop, and no ship was wrecked or reset in a loop. In full fields, where ships also bump each other and fire ion bolts, a wreck inside a loop is rare (2 of 30 wrecks in three Classic five-lap races on Pelagos), and the respawn puts the ship back into the loop, oriented with it.

### How the new courses fit into the game
- **Quick race and Time trial:** *Select course* lists six courses; the two new cards have their own name, description and route map (on a 960-pixel-wide window they form a second row below the first four, and the screen scrolls with its action bar pinned, as V7's longer screens do). Records, ghosts and rewards work as on the other courses.
- **Championship: six rounds** (your decision when the conflict came up: the calendar either grows or a course is replaced). Pelagos is round 5 and Ignara round 6. Each round pays the same race reward as before, and the completion and standing bonuses are unchanged, so a whole championship takes longer and pays more in total (Pro, 3 laps, finishing 3rd everywhere: 1,668 → 2,062 CR) and slightly less per minute than V8's four-round run (146 → 118 CR/min, still 1.4–1.75× single races; `node tests/economy.mjs`, which now uses the calendar's length). A championship run saved by V8 and not yet finished carries on in V9 with the two extra rounds (checked with V8's own code: a V8 save with two rounds raced loads in V9 without issues and completes after round 6, bonus paid once).
- **Online multiplayer:** the server's random course picks come from all six courses (`ELIGIBLE_TRACKS` can still limit them). Every game and the server build each course from the same code and data, so collision, checkpoint and lap data are identical everywhere (tested). The protocol number goes from 1 to 2, because a V8 game does not have the new courses: a V8 game connecting to a V9 server (or a V9 game to a V8 server) gets the existing "version" answer and is not let in, instead of being sent a course it cannot load. The server reports version 9.0.0 on `/health`.

### Performance: culling and level of detail
The new courses use the game's existing mechanisms and change nothing global: scenery near the course is cut into chunks of 96 samples (about 380 m) with bounding spheres, frustum-culled every frame and limited by draw distance; Ignara's terrain is 40×40-cell chunks near the course plus one coarse 26 km mesh for the far field; Pelagos' ocean is a ring grid that follows the camera (dense near it, out to 40 km), displaced by the swell only within 1.5 km; the four new shaders (ocean, cloud deck, lava, volcanic rock) fade their fine detail (small waves, foam, crust plates, fissures) to its average once it is smaller than a pixel or two, instead of shimmering; embers, smoke, spray and lightning spawn only near the camera. Measured costs are in *Tests*.

### Deploying V9 to your GitHub Pages site and Render server
**Status: V9 is built and tested here; it is not deployed.** Your V8 site (`https://jonathanimhof-hr.github.io/galactic_rush/`) and your V8 server (`wss://galactic-rush.onrender.com`, protocol 1) keep running V8 until you update both, and they must be updated together: a V9 game only talks to a V9 server, and the other way round. Updating GitHub does not by itself update the server: Render rebuilds and restarts it from the new commit (automatically if *Auto-Deploy* is on for the service, otherwise with *Manual Deploy → Deploy latest commit*).
1. Unpack the package first (never drag files out of the zip itself). Open your repository in github.dev (press `.` on its GitHub page), drag everything inside the package's `upload-to-github/` folder onto the file tree, answer *Replace* whenever it asks, then *Source Control → Commit & Push*. The folder is the complete repository for V9: whole `src/`, `server/`, `tests/` and `dist/` folders (so replacing a folder loses nothing), the V9 game page as `index.html` and `config.js` with your server address.
2. Wait for Render to finish the deploy, then open `https://galactic-rush.onrender.com/health`: it must show `"version":"9.0.0"` and `"protocol":2`.
3. Open the site (give GitHub Pages a minute, then reload with Ctrl+F5): the tab must read *Galactic Rush V9*, and *Select course* must list Pelagos and Ignara.

### What changed in existing files
Everything else is new: `src/sim/pathtrack.js` (path courses), `src/sim/tracks-v9.js` (the two course definitions with their checkpoints, boost rings, energy cells and hazards), `src/render/courses/v9kit.js` (the four new shaders, a corridor clearance test that keeps scenery out of the racing corridor, geometry helpers), `src/render/courses/pelagos.js` and `ignara.js` (the two worlds), and the tests and tools `tests/v9-maps.test.js`, `tests/v9-playtest.py`, `tests/v9-loops-matrix.mjs`, `tests/v9-wrecks.mjs`, `tests/framecost.py` and `tests/buildcost.py`.

| File | Change | Why it is needed |
|---|---|---|
| `src/sim/tracks.js` | 2 imports; the two course definitions appended to the course list; a course with a `path` is built by `pathtrack.js` (5 lines) | registers the courses; the original four are still built by `Track`, unchanged |
| `src/render/courses/all.js` | 2 imports, 2 `registerCourse` lines | registers the two scenery builders |
| `src/config.js` | the championship calendar gets `'pelagos', 'ignara'` | championship integration (six rounds) |
| `src/ui.js` | "Four rounds" (2 places) shows the calendar's length ("Six rounds") | the text would be wrong otherwise |
| `src/progress/rewards.js`, `economy.js` | the economy table (tests and documentation only) uses the calendar's length; a comment | the table assumed four rounds |
| `src/mp/protocol.js` | `PROTOCOL = 2` | a V8 game must not join a server that can pick courses it does not have |
| `server/index.mjs`, `server/package.json`, `server/config.mjs` | version 9.0.0; a comment | `/health` shows which server runs |
| `build.mjs` | V9 file names and page title (V5–V8 files are never written) | publishing V9 next to V8 |
| `tests/progression.test.js`, `tests/multiplayer.test.js`, `tests/mp/server.test.mjs`, `tests/progression.py`, `tests/seedprofile.mjs`, `tests/economy.mjs` | six championship rounds, six courses in the server's pool, version 9.0.0, new V9 tests | the tests follow the integration |
| `tests/mp/e2e.py` | waits until all three games run at a normal frame rate before its first check | loading six courses in software rendering takes longer than four |

Byte-identical to V8: `src/main.js`, `src/sim/track.js`, `race.js`, `flight.js`, `ai.js`, `championship.js`, `src/camera.js`, `src/render/gfx.js` and every other renderer module, the four original course builders, `index.html`, audio, the garage, the career, the shop and all of `src/mp/` except the protocol number. `dist/galactic-rush-v5…v8*.html` keep their checksums; V8's GitHub Pages files are kept in `dist/site-v8/`.

### Tests (everything below was actually run, on this build)
One 2-core Linux machine: Node 22 for the Node tests and the server, headless Chromium with software WebGL (SwiftShader) for the browser tests. The multiplayer server ran locally for every test; nothing was tested against your Render server. Logs, reports and screenshots are in the package's `validation/` folder.

| Suite | What it covers | Result |
|---|---|---|
| `npm test` | V8's suites, whose course-wide tests now also run on Pelagos and Ignara (valid, closed, non-self-intersecting corridor; a full AI field over three laps), plus the new `tests/v9-maps.test.js`: the course list and **the four original courses' complete course data compared with a fingerprint taken from the V8 source** (geometry, frames, corridor, checkpoints, boost rings, cells, hazards); closure, even spacing and frames turning at most 3.5° per sample everywhere (no flips), through the loops too; checkpoints in order and outside the loops; hazards inside the corridor and off the racing line; Ignara's tunnel continuous; both loops turning 360° about their axis, upside down at the top, 300 m and 270 m tall, radius ≥ 130 m with the corridor inside the curve, exit ≥ 92 m beside the entry; **every ship, standard and fully upgraded, at two skill levels, in both handling modes (40 laps): through both loops, upside down in both, no wreck, no reset, at most 7.7 % of a hull lost in one loop**; full AI fields over **five laps** on both courses in both handlings, every racer flying both loops on every lap, no teleporting; **respawns inside a loop** (after a wreck and after a manual reset, both loops, both handlings): back in the loop, oriented with it, moving on, lap completed; **the chase and far cameras through both loops**: at most 1.33° (up) and 2.22° (forward) of turn per frame away from wall impacts (an impact jolts the view on every course, as in V8), rolling with the ship (its up vector within 18° of the ship's), 6.6–7.8 m (chase) and 11.2–12.7 m (far) behind it; a fresh build of each course equals the shared data, and the server's lap and checkpoint data match it. In `tests/multiplayer.test.js`: the server's race referee accepts a legitimate five-lap run on Pelagos (through both loops) and on Ignara and refuses a 1.5 km jump; course picks cover all six courses evenly | **96/96 pass** in 21 s: V8's 82, V8's per-course AI race test once more for each new course, and 12 new |
| `npm run test:mp` | the real server with real WebSocket clients flying the game's own simulation (V8's suite, all unchanged rules), plus **a whole tournament on Pelagos and Ignara** (`ELIGIBLE_TRACKS=pelagos,ignara`): every pilot gets the same course, five laps, all three finish the qualifier, the final is on the other new course, results and rewards match, no valid state refused; and **a V8 game (protocol 1) is turned away** with the version message | **12/12 pass** in 3.5 min: V8's 11 and the new one. Its tournament: qualifier on Pelagos (all three finished, 268.4–313.6 s), final on Ignara; a V8 hello got the version message; V8's own tournament test happened to draw Neon Spire and Ignara |
| `python3 tests/mp/e2e.py` with `ELIGIBLE_TRACKS=pelagos,ignara` | V8's three-browser end-to-end test (three separate browser processes, the game's own screens, two complete tournaments, rewards, a dropped connection, leaving mid-race), with the server restricted to the two new courses | **29/29 checks pass**. First tournament: qualifier on Ignara (all three finished, 4:37.6 to 5:15.8), final on Pelagos (won in 5:38.8), rewards paid once each (1,232 CR and 3 ST to the winner); second tournament on Pelagos with a connection cut mid-race that reconnected. Start estimates within 12 ms, GO within 31 ms. The three software-rendered games were more starved for CPU than in V8's run (frame gaps up to 1 s), so the adaptive interpolation delay sat at its 0.4 s maximum: remote ships were drawn a median 0.46 s behind and 0.19 m off their real path (V8's run: 0.12 s, 0.07 m). Three earlier attempts stopped at a screenshot or an input field while the games were still busy after loading six courses (one of them while another job loaded the machine); the test now first waits until all three games run at a normal frame rate |
| `python3 tests/playtest.py races` (V9 build) | the built game, autopilot, one lap: Pelagos and Ignara reach the results screen with every racer finished | Pelagos: all six finished (55.4–63.0 s); Ignara: all six finished (39.7–47.9 s); no console errors |
| `python3 tests/v9-playtest.py menus` | title → hangar → *Select course* lists the six courses in order → Pelagos and Ignara selectable → Launch → the flyover → the race clock runs → pause → quit to menu; the championship calendar shows *Six rounds*, ending with Pelagos and Ignara | **5/5 checks pass**, no console errors |
| `python3 tests/v9-playtest.py champ6` | a whole Rookie championship in the built game (one lap per round, autopilot, fast-forwarded): rounds raced in calendar order (Foundry Trench … Halo of Vashti, Pelagos, Ignara); after round 4 the hub offers round 5: Pelagos, after round 5 round 6: Ignara; after round 6 the run closes, the completion and standing bonuses are paid once and Pro unlocks | **6/6 checks pass**: rounds in calendar order; the hub offered round 5: Pelagos and round 6: Ignara; the run closed after round 6 with the completion bonus (225 CR) and the standing bonus (P1, 90 CR) paid once; 757 CR over the run; no console errors |
| `python3 tests/v9-playtest.py loops` | in-game frames with the chase camera at the entry, climb, top and descent of both loops (the camera's up vector equals the course's: −1 at both tops), and along Ignara | 17 frames, no console errors (sheets in `validation/sheets/`) |
| `python3 tests/v9-playtest.py trial` | a time trial on each new course (autopilot) saves a record lap and its ghost; the next trial loads the ghost and shows it | **4/4 checks pass** (Pelagos: 59.1 s lap, 1,183 ghost frames; Ignara: 43.6 s, 872 frames), no console errors |
| `python3 tests/v9-playtest.py settings` | every preset (Low → Ultra) and every graphics toggle switched at run time on Pelagos and on Ignara: the renderer follows each preset, no WebGL errors, no page errors, no blank frames | **46/46 steps pass** (23 per course), no console errors |
| Regression: matched screenshots | `tests/matched.py` (V8's ten fixed views of the original courses, the race frozen) on the V8 build, the V9 build and the V8 build again; pixel differences V8 → V9 against V8 → V8 (the noise of animated clouds, particles and lights) | Ten views. V8 → V9: mean difference 2.0–8.2 levels, 0.06–17.4 % of pixels off by more than 16 levels; V8 → V8: 2.1–11.2 levels, 0.00–21.5 %. Seen side by side, the frames differ only in what the frozen race leaves moving (drifting haze and clouds, ion bolts, the moment a ship is caught); geometry, materials and lighting are the same (sheet `validation/sheets/regression-v8-v9-v8.jpg`). The course data are identical by the fingerprint test, and the renderer code for these courses is byte-identical |
| Regression: V8 suites on the V9 build | `tests/playtest.py races` on the four original courses; `tests/progression.py` phase A (rewards on every difficulty, the Rookie → Pro → Ace championship ladder, now six rounds each, upgrades reaching the physics) and phase B (shop, premium placeholders, paint jobs on the 3D ships, keyboard control, career); `tests/settings.py` (Neon Spire) | races: every racer finished on each of the four courses (Foundry Trench 41.1–47.1 s, Cinder Belt 42.0–45.4 s, Neon Spire 35.5–39.9 s, Halo of Vashti 57.0–64.4 s), no console errors; progression phase A **31/31** (its three championships now run six rounds each), phase B **17/17**; settings **23/23** — the same totals as on V8 |
| Saves | a V8 career save with a championship run in progress (two of four rounds raced), made with V8's own code, loaded by V9 | loads without issues, continues at round 3 and completes after round 6 (Pelagos, Ignara), bonus paid once |
| AI incidents (`node tests/v9-wrecks.mjs`) | wrecks in full-field five-lap races (three seeds per course and handling mode), all six courses | Pelagos 10.0 per race in Classic, 0 in Relaxed; Ignara 11.0 / 2.0; the original courses 17.3–55.0 / 0–24.0 |
| CPU per frame (`tests/framecost.py`) | one game frame without drawing (simulation, course update, effects, HUD), median / 95th percentile over 300 frames in the built game | Pelagos 0.8 / 1.8 ms, Ignara 0.8 / 1.8 ms; the original courses 0.8–2.3 / 1.7–4.8 ms |
| Course build (`tests/buildcost.py`) | building a course's scene in the game (software WebGL; every course is built once while the game loads) | Pelagos 5.7 s, Ignara 3.6 s; the original courses 3.0–18.3 s; the whole game ready 25.6 s after opening the page |

**Benchmark.** The game's own benchmark (`?bench=short&track=<course>`: autopilot, 12 s per preset, Low → Ultra), on the V9 build for all six courses and on the V8 build for its four, same machine, same presets. SwiftShader draws about one frame a second here, so each row rests on 1 to 9 frames and the frame times are rough (on the original courses, where V8 and V9 run the same drawing code, the same row differs by up to a factor of three between the two runs); draw calls and triangles are the telling numbers. The two new courses draw 133–141 calls and 0.31–0.35 million triangles, within the range of the original four (110–320 calls, 0.20–0.36 million). On the original courses V8 and V9 draw the same; where a row differs, the autopilot was elsewhere on the course when the frames were sampled. *Instances* counts V5's instanced scenery (asteroids, city blocks, fleets), which the trench and the new courses do not use.

| Course | Preset | Median frame (ms) | 95th pct (ms) | Avg FPS | Draw calls | Triangles | Instances drawn / considered |
|---|---|---|---|---|---|---|---|
| Foundry Trench | low | 1183.3 | 3749.8 | 0.5 | 117 | 347,505 | 0 / 0 |
| Foundry Trench | medium | 2199.8 | 4099.9 | 0.5 | 118 | 365,024 | 0 / 0 |
| Foundry Trench | high | 3516.5 | 5666.5 | 0.3 | 117 | 362,232 | 0 / 0 |
| Foundry Trench | ultra | 3516.5 | 5549.7 | 0.3 | 117 | 357,949 | 0 / 0 |
| Cinder Belt | low | 1683.3 | 4033.1 | 0.5 | 118 | 237,766 | 517 / 2600 |
| Cinder Belt | medium | 2899.9 | 5666.5 | 0.4 | 119 | 272,156 | 519 / 2600 |
| Cinder Belt | high | 6116.4 | 9632.9 | 0.2 | 119 | 291,132 | 519 / 2600 |
| Cinder Belt | ultra | 4916.5 | 9316.3 | 0.2 | 119 | 299,986 | 519 / 2600 |
| Neon Spire | low | 3249.9 | 4049.7 | 0.4 | 307 | 299,213 | 992 / 3472 |
| Neon Spire | medium | 9383 | 9383 | 0.1 | 309 | 311,774 | 995 / 3472 |
| Neon Spire | high | 4349.8 | 12599.5 | 0.2 | 317 | 338,181 | 996 / 3472 |
| Neon Spire | ultra | 21832.5 | 21832.5 | 0 | 320 | 358,180 | 993 / 3472 |
| Halo of Vashti | low | 833.3 | 4183.1 | 0.7 | 110 | 203,512 | 890 / 7200 |
| Halo of Vashti | medium | 1266.7 | 3866.6 | 0.6 | 111 | 216,056 | 1016 / 7200 |
| Halo of Vashti | high | 2533.3 | 4549.8 | 0.4 | 111 | 216,287 | 1016 / 7200 |
| Halo of Vashti | ultra | 2466.6 | 5583.2 | 0.5 | 111 | 221,043 | 1082 / 7200 |
| Pelagos | low | 1099.9 | 3683.2 | 0.6 | 141 | 346,048 | 0 / 0 |
| Pelagos | medium | 1266.6 | 4949.8 | 0.5 | 141 | 346,048 | 0 / 0 |
| Pelagos | high | 4233.2 | 6633.1 | 0.3 | 141 | 346,048 | 0 / 0 |
| Pelagos | ultra | 6266.5 | 6966.3 | 0.2 | 140 | 344,254 | 0 / 0 |
| Ignara | low | 916.6 | 4266.6 | 0.7 | 133 | 307,738 | 0 / 0 |
| Ignara | medium | 1233.3 | 4383.1 | 0.6 | 133 | 310,126 | 0 / 0 |
| Ignara | high | 3016.6 | 6183 | 0.3 | 133 | 310,126 | 0 / 0 |
| Ignara | ultra | 3516.5 | 6049.8 | 0.3 | 133 | 310,126 | 0 / 0 |

V8 and V9 on the original four courses (same benchmark, same presets):

| Course | Preset | V8 median (ms) | V9 median (ms) | V8 draws | V9 draws | V8 triangles | V9 triangles |
|---|---|---|---|---|---|---|---|
| Foundry Trench | low | 2383.2 | 1183.3 | 101 | 117 | 294,169 | 347,505 |
| Foundry Trench | medium | 1433.2 | 2199.8 | 118 | 118 | 362,636 | 365,024 |
| Foundry Trench | high | 6383.1 | 3516.5 | 117 | 117 | 362,232 | 362,232 |
| Foundry Trench | ultra | 3366.6 | 3516.5 | 117 | 117 | 362,232 | 357,949 |
| Cinder Belt | low | 2849.8 | 1683.3 | 118 | 118 | 235,356 | 237,766 |
| Cinder Belt | medium | 2366.5 | 2899.9 | 119 | 119 | 272,127 | 272,156 |
| Cinder Belt | high | 4933.1 | 6116.4 | 119 | 119 | 291,132 | 291,132 |
| Cinder Belt | ultra | 5699.7 | 4916.5 | 119 | 119 | 302,374 | 299,986 |
| Neon Spire | low | 3949.8 | 3249.9 | 307 | 307 | 301,651 | 299,213 |
| Neon Spire | medium | 8466.3 | 9383 | 309 | 309 | 314,971 | 311,774 |
| Neon Spire | high | 12782.8 | 4349.8 | 318 | 317 | 340,865 | 338,181 |
| Neon Spire | ultra | 23432.4 | 21832.5 | 320 | 320 | 358,180 | 358,180 |
| Halo of Vashti | low | 2333.2 | 833.3 | 96 | 110 | 177,754 | 203,512 |
| Halo of Vashti | medium | 2050 | 1266.7 | 111 | 111 | 216,021 | 216,056 |
| Halo of Vashti | high | 2483.3 | 2533.3 | 111 | 111 | 216,340 | 216,287 |
| Halo of Vashti | ultra | 2733.2 | 2466.6 | 111 | 111 | 221,147 | 221,043 |

### Limitations
- **Classic handling in the loops:** at full speed every ship except the nimble Wisp brushes the loops' outer floor now and then, because its pitch rate is below what the loop asks for at that speed: a few hull points per loop, as in a corner taken too fast. This is the unchanged V8 handling; making it disappear would have meant changing the ships' physics, which the brief rules out.
- **Heat distortion** is the shimmer of the lava's own surface pattern plus rising embers, smoke and ash. There is no screen-space refraction of the air above the lava: that would need a change to the shared post-processing in `gfx.js`, which stays frozen.
- **Energy walls:** as on the other open courses (Cinder Belt, Halo of Vashti), all four faces of Ignara's corridor show the hex field near your ship; in its narrow, glowing canyon it is more prominent than over Pelagos' dark sea.
- The **benchmark screen's title** names the new courses by their id (`pelagos`, `ignara`), because V8's benchmark title uses a fixed table of the four original names in `src/main.js`, which stays unchanged.
- **No person has flown the new courses:** the game's AI pilots and the automated tests flew them thousands of times (all ships, both handling modes, standard and fully upgraded), but how the loops feel with a keyboard or a gamepad, and with the steering assist turned off, was not tried by a human.
- **Software rendering only:** the frame times here are for comparing courses and builds on the same machine, not what a graphics card will do. No real GPU, phone or tablet was tested.
- **Online:** tested with real WebSocket clients and three browser games against a local server, not against the deployed Render server or between separate devices over the internet. A V8 game and a V9 server (or the other way round) cannot play together.
- **The three-browser multiplayer test is fragile on a 2-core machine:** it passed on its fourth attempt; the first three stopped waiting for a screenshot or an input field while the three software-rendered games were still busy (one of them while another job was loading the machine). Between the attempts only the test changed (it now waits until all three games run at a normal frame rate before its first check) and, for the fourth, Ignara's tunnel ribs gained their glowing seams; the multiplayer code was the same.
- The **route maps** (course cards and the HUD's minimap) are plan views, so the loops show only as short kinks where the course rises above itself.

## V8: online multiplayer tournament

*(Written for V8. For V9's changes to online play — six courses, protocol 2 — and for updating a deployed V8 site and server, see V9 above.)*

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
