// GALACTIC RUSH V12 — the account screens' styles, in the game's own palette and type (index.html's variables)
export const ACCOUNT_CSS = `
.acct { display: grid; gap: 14px; align-content: start; }
.acct .panel { display: grid; gap: 12px; }
.acct-form { display: grid; gap: 12px; }
.acct-field { display: grid; gap: 5px; }
.acct-field span { font: 600 12px var(--f-num); letter-spacing: .18em; text-transform: uppercase; color: var(--dim); }
.acct-field span small { margin-left: 10px; letter-spacing: .04em; text-transform: none; font: 500 12px var(--f-ui); }
.acct-field input { background: rgba(0,0,0,.35); color: var(--ink); border: 1px solid var(--line-2); font: 16px var(--f-num); padding: 9px 11px; width: 100%; max-width: 420px; box-sizing: border-box; user-select: text; }
.acct-field input:focus { outline: 2px solid var(--signal); outline-offset: 1px; }
.acct-note { margin: 0; padding: 9px 13px; border-left: 3px solid currentColor; background: var(--plate-2); font: 500 14.5px var(--f-ui); max-width: 70ch; }
.acct-note.good { color: var(--good); } .acct-note.bad { color: var(--alert); }
.acct-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.acct-sum { background: rgba(0,0,0,.22); border: 1px solid var(--line); padding: 10px 14px; min-width: 0; }
.acct-sum h4 { margin: 0 0 6px; font: 600 12px var(--f-num); letter-spacing: .22em; text-transform: uppercase; color: var(--cyan); }
.acct-sum dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; margin: 0; font: 500 14px var(--f-ui); }
.acct-sum dt { color: var(--dim); } .acct-sum dd { margin: 0; text-align: right; font-family: var(--f-num); font-size: 13.5px; }
.acct-list { margin: 0; padding-left: 20px; color: var(--alert); font: 500 14px var(--f-ui); }
.acct-who { display: flex; gap: 12px; align-items: center; }
.acct-who b { display: block; font: 600 16px var(--f-ui); letter-spacing: .04em; overflow-wrap: anywhere; }
.acct-who small { color: var(--dim); font: 500 13px var(--f-ui); }
.acct-who .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--good); flex: none; }
.acct-status.saving .dot, .acct-status.idle .dot { background: var(--signal); } .acct-status.offline .dot { background: var(--alert); }
.warnbox { border-color: rgba(255, 82, 72, .5); }
.acct-chip { font: 600 11px var(--f-num); letter-spacing: .14em; text-transform: uppercase; padding: 3px 9px; border: 1px solid var(--line-2); color: var(--dim); background: var(--plate); white-space: nowrap; }
.acct-chip.ready { color: var(--good); } .acct-chip.offline, .acct-chip.attention { color: var(--signal); }
.rw-acct { margin: 6px 0 0; font: 500 13px var(--f-ui); color: var(--dim); } .rw-acct.good { color: var(--good); } .rw-acct.bad { color: var(--alert); }
#acct-toast { position: fixed; left: 50%; bottom: max(18px, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 40; display: grid; gap: 6px; pointer-events: none; width: min(560px, calc(100% - 32px)); }
#acct-toast div { background: var(--plate-2); border-left: 3px solid currentColor; padding: 8px 14px; font: 500 14px var(--f-ui); color: var(--ink); }
#acct-toast div.bad { color: var(--alert); } #acct-toast div.good { color: var(--good); }
@media (max-width: 560px) { .acct-field input { max-width: none; } }
`;
