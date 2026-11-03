// GALACTIC RUSH V8 — styles for the online screens and the in-race online bar. Added to the page at run time by the
// online mode, so the game's own stylesheet (index.html) is unchanged; built from its colour and type variables.
export const MP_CSS = `
.mpcol { width: min(640px, 100%); }
.mpcol > * { flex-shrink: 0; } /* a screen taller than the window scrolls; tables never squeeze to nothing */
.mpform { display: grid; gap: 4px; }
.mpform h3 { margin: 0; }
.mpcol .setting > span > small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--dim); }
.mpconn { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font: 600 11px var(--f-num); letter-spacing: .16em; text-transform: uppercase; }
.mpconn .conn::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; background: currentColor; }
.conn.on { color: var(--good); } .conn.off { color: var(--dim); } .conn.wait { color: var(--signal); }
.mpconn .srv { color: var(--dim); letter-spacing: .04em; text-transform: none; font-weight: 500; }
.mptext { background: rgba(0,0,0,.35); color: var(--ink); border: 1px solid var(--line-2); font: 15px var(--f-num); padding: 7px 10px; width: 210px; user-select: text; text-transform: uppercase; }
.mptext.code { width: 130px; letter-spacing: .3em; }
.mptext:focus { outline: 2px solid var(--signal); outline-offset: 1px; }
.mpcodebox { display: grid; grid-template-columns: auto auto auto; gap: 6px 16px; align-items: center; justify-content: start; padding: 12px 16px; border: 1px solid var(--signal); background: rgba(255,181,71,.07); }
.mpcodebox > span { font: 600 11px var(--f-num); letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
.mpcode { font: 400 34px var(--f-display); letter-spacing: .22em; color: var(--signal); user-select: all; }
.mpcodebox small { grid-column: 1 / -1; color: var(--dim); font-size: 12.5px; }
.mpnote p { margin: 6px 0 0; }
.mplist td { vertical-align: middle; }
.mpship .shipnav { gap: 14px; }
.btn.armed-ok { border-color: var(--good); color: var(--good); }
.btn.danger { border-color: var(--alert); }
@media (max-width: 560px) { .mpcodebox { grid-template-columns: 1fr auto; } .mpcode { font-size: 28px; } .mptext { width: 100%; } }
#mpbar { position: absolute; top: calc(max(14px, env(safe-area-inset-top)) + 84px * var(--hud, 1)); left: 50%; transform: translateX(-50%) scale(var(--hud, 1)); transform-origin: top center;
  z-index: 12; display: flex; gap: 10px; align-items: center; padding: 5px 12px; max-width: calc(100vw - 32px); background: var(--plate); border: 1px solid var(--line);
  font: 600 11px var(--f-num); letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; overflow: hidden; pointer-events: none; }
#mpbar[hidden] { display: none; }
#mpbar .stg { color: var(--dim); }
#mpbar b { color: var(--signal); font-weight: 600; }
#mpbar .good { color: var(--good); }
#mpbar .warn { color: var(--alert); }
#mpbar .key { color: var(--dim); font-weight: 500; }
#mpbar button { pointer-events: auto; background: rgba(0,0,0,.3); border: 1px solid var(--line-2); color: var(--ink); padding: 1px 8px; cursor: pointer; font: inherit; letter-spacing: .1em; }
#mpbar button:hover, #mpbar button:focus-visible { border-color: var(--signal); }
`;
export function injectStyle(doc = document) {
  if (doc.getElementById('mp-style')) return;
  const s = doc.createElement('style'); s.id = 'mp-style'; s.textContent = MP_CSS; doc.head.appendChild(s);
}
