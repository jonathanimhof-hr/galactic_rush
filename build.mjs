// Bundles the ES modules into one self-contained HTML file (no dependencies, works offline).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
const root = dirname(new URL(import.meta.url).pathname), mods = new Map(), order = [], exportsOf = new Map(), importsOf = [];
const id = p => '__m_' + p.replace(root, '').replace(/[^a-zA-Z0-9]/g, '_');
async function visit(file) {
  if (mods.has(file)) return; mods.set(file, null);
  let src = await readFile(file, 'utf8');
  const imports = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, from) => {
    const dep = resolve(dirname(file), from); imports.push(dep); importsOf.push({ file, dep, names: names.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) });
    return `const { ${names.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': ')).join(', ')} } = ${id(dep)};`;
  });
  src = src.replace(/^import\s*'([^']+)';?\s*$/gm, (_, from) => { imports.push(resolve(dirname(file), from)); return ''; });
  // V12: an import line this bundler did not take apart (e.g. one with a trailing comment) would end up in the bundle as a
  // module statement and stop the whole page from loading, so the build stops instead
  { const left = src.match(/^\s*(import|export)\s.*\bfrom\s*'[^']+'.*$/m); if (left) throw new Error(`${file.replace(root + '/', '')}: cannot bundle this line (one import per line, no comment after it): ${left[0].trim()}`); }
  const exp = new Set();
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => { names.split(',').map(s => s.trim()).filter(Boolean).forEach(n => exp.add(n)); return ''; });
  src = src.replace(/^export\s+(class|function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => { exp.add(name); return `${kw} ${name}`; });
  src = src.replace(/^export\s+const\s+\{/gm, 'const {');
  exportsOf.set(file, exp);
  for (const d of imports) await visit(d);
  mods.set(file, `const ${id(file)} = (() => {\n${src}\nreturn { ${[...exp].join(', ')} };\n})();`);
  order.push(file);
}
await visit(join(root, 'src/main.js'));
// V7: every imported name must be exported by this bundler's rules (one declaration per export statement), or the bundle breaks at runtime
const missing = importsOf.flatMap(({ file, dep, names }) => names.filter(n => !exportsOf.get(dep).has(n)).map(n => `${n} (imported by ${file.replace(root + '/', '')} from ${dep.replace(root + '/', '')})`));
if (missing.length) { console.error('bundle error, not exported: ' + missing.join('; ')); process.exit(1); }
const bundle = '"use strict";\n' + order.map(f => mods.get(f)).join('\n').replace(/<\/script/gi, '<\\/script');
const html = (await readFile(join(root, 'index.html'), 'utf8')).replace(/<title>Galactic Rush V7<\/title>/, '<title>Galactic Rush V12</title>');
// V8: the multiplayer server's public address (wss://…) is not a secret. It comes from GR_MP_SERVER at build time or,
// when that is not set, from the multiplayerServer entry of the config.js committed in the repository root, so editing
// that file on GitHub is enough. Without either, the online screens explain that no server is set. The claude.ai
// artifact never gets it (the viewer blocks network connections), and earlier versions' files in dist/ are never written.
// (The fallback to the root config.js is the change made to build.mjs in the GitHub repository on 4 Nov 2026, kept.)
let MP_SERVER = (process.env.GR_MP_SERVER || '').trim(), MP_FROM = MP_SERVER ? 'GR_MP_SERVER' : '';
if (!MP_SERVER) {
  const m = /multiplayerServer\s*:\s*(["'])(.*?)\1/.exec(await readFile(join(root, 'config.js'), 'utf8').catch(() => ''));
  if (m && m[2].trim()) { MP_SERVER = m[2].trim(); MP_FROM = 'config.js'; }
}
if (MP_SERVER && MP_SERVER !== 'same-origin' && !/^(wss|https):\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(MP_SERVER) && !/^(ws|http):\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(MP_SERVER)) {
  console.error(`The multiplayer server address (from ${MP_FROM}) must be the server's public wss:// (or https://) address, got: ${MP_SERVER}`); process.exit(1);
}
// V12: the Firebase project the accounts use: its Web API key and project id are public identifiers (Firebase sends them
// to every browser; access is controlled by Firebase Authentication and the account server, not by keeping them
// secret). From GR_FIREBASE_API_KEY / GR_FIREBASE_PROJECT_ID (the Pages workflow passes repository variables of those
// names) or the firebase entry of the root config.js. Without them the game has no accounts (guest careers, as before).
// GR_FIREBASE_AUTH_EMULATOR (tests only) points sign-in at a local Firebase Auth emulator; pages honour it only on localhost.
const rootCfg = await readFile(join(root, 'config.js'), 'utf8').catch(() => '');
const fromRoot = k => { const m = new RegExp(`${k}\\s*:\\s*(["'])(.*?)\\1`).exec(rootCfg); return m ? m[2].trim() : ''; };
const FIREBASE = { apiKey: (process.env.GR_FIREBASE_API_KEY || fromRoot('apiKey')).trim(), projectId: (process.env.GR_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || fromRoot('projectId')).trim(), authEmulator: (process.env.GR_FIREBASE_AUTH_EMULATOR || '').trim() };
if (FIREBASE.apiKey && !/^[A-Za-z0-9_-]{20,80}$/.test(FIREBASE.apiKey)) { console.error('GR_FIREBASE_API_KEY does not look like a Firebase Web API key'); process.exit(1); }
if (FIREBASE.projectId && !/^[a-z0-9][a-z0-9-]{3,38}[a-z0-9]$/.test(FIREBASE.projectId)) { console.error('GR_FIREBASE_PROJECT_ID does not look like a Firebase project id'); process.exit(1); }
if (FIREBASE.authEmulator && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(FIREBASE.authEmulator)) { console.error('GR_FIREBASE_AUTH_EMULATOR must be http://127.0.0.1:<port> (local tests only)'); process.exit(1); }
// --require-online (the Pages workflow): the site build stops unless both the server and the Firebase project are set,
// so a live site is never published without them (the site stays as it was)
if (process.argv.includes('--require-online') && (!MP_SERVER || MP_SERVER === 'same-origin' || !FIREBASE.apiKey || !FIREBASE.projectId)) {
  console.error('Not published: set the V12 server address (GR_MP_SERVER or config.js multiplayerServer) and the Firebase project (GR_FIREBASE_API_KEY and GR_FIREBASE_PROJECT_ID, or config.js firebase) first.'); process.exit(1);
}
const siteConfig = { multiplayerServer: MP_SERVER, ...(FIREBASE.apiKey && FIREBASE.projectId ? { firebase: { apiKey: FIREBASE.apiKey, projectId: FIREBASE.projectId, ...(FIREBASE.authEmulator ? { authEmulator: FIREBASE.authEmulator } : {}) } } : {}) };
const page = (extraHead = '') => html.replace(/(<meta name="viewport"[^>]*>)/i, (m) => m + extraHead).replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, () => `<script>\n${bundle}\n</script>`);
const meta = MP_SERVER && MP_SERVER !== 'same-origin' ? `\n<meta name="galactic-rush:mp-server" content="${MP_SERVER}">` : '';
const full = page(meta);
await mkdir(join(root, 'dist/site'), { recursive: true });
await writeFile(join(root, 'dist/galactic-rush-v12.html'), full); // V12: six difficulty levels, accounts, Verdant Canopy's trees, new obstacles on Pelagos and Orbital Nexus; the V5-V11 files in dist/ are never rewritten (V11's site page is kept in dist/site-v11)
// Artifact variant: page content only (the host supplies doctype/head/body)
const art = page().replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
await writeFile(join(root, 'dist/galactic-rush-v12-artifact.html'), art);
// GitHub Pages site: the same page plus config.js, which the build writes from GR_MP_SERVER (the Pages workflow passes the
// repository variable of that name) or, when that is empty, from the config.js in the repository root
await writeFile(join(root, 'dist/site/index.html'), page(meta + '\n<script src="config.js"></script>'));
await writeFile(join(root, 'dist/site/config.js'), `// Galactic Rush V12 site settings (public, no secrets). multiplayerServer: the multiplayer and account server's wss://\n// address (same-origin: the server that serves this page). firebase: the Firebase project's public Web API key and id.\nwindow.GALACTIC_RUSH_CONFIG = ${JSON.stringify(siteConfig)};\n`);
console.log(`built dist/galactic-rush-v12.html (${(full.length / 1024).toFixed(0)} KB), ${order.length} modules, multiplayer server: ${MP_SERVER ? `${MP_SERVER} (from ${MP_FROM})` : 'not set'}, accounts: ${siteConfig.firebase ? `Firebase project ${FIREBASE.projectId}` : 'off (no Firebase project set)'}`);
