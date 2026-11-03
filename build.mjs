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
const html = (await readFile(join(root, 'index.html'), 'utf8')).replace(/<title>Galactic Rush V7<\/title>/, '<title>Galactic Rush V8</title>');
// V8: the multiplayer server's public address (wss://…) comes from GR_MP_SERVER at build time; it is not a secret.
// Without it the online screens explain that no server is set. The claude.ai artifact never gets it (the viewer
// blocks network connections), and earlier versions' files in dist/ are never written.
const MP_SERVER = (process.env.GR_MP_SERVER || '').trim();
if (MP_SERVER && !/^(wss|https):\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(MP_SERVER) && !/^(ws|http):\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(MP_SERVER)) {
  console.error(`GR_MP_SERVER must be the server's public wss:// (or https://) address, got: ${MP_SERVER}`); process.exit(1);
}
const page = (extraHead = '') => html.replace(/(<meta name="viewport"[^>]*>)/i, (m) => m + extraHead).replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, () => `<script>\n${bundle}\n</script>`);
const meta = MP_SERVER ? `\n<meta name="galactic-rush:mp-server" content="${MP_SERVER}">` : '';
const full = page(meta);
await mkdir(join(root, 'dist/site'), { recursive: true });
await writeFile(join(root, 'dist/galactic-rush-v8.html'), full);
// Artifact variant: page content only (the host supplies doctype/head/body)
const art = page().replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
await writeFile(join(root, 'dist/galactic-rush-v8-artifact.html'), art);
// GitHub Pages site: the same page plus config.js, which the Pages workflow writes from the repository variable
// GR_MP_SERVER (and which can be edited on the site without rebuilding the game)
await writeFile(join(root, 'dist/site/index.html'), page(meta + '\n<script src="config.js"></script>'));
await writeFile(join(root, 'dist/site/config.js'), `// Galactic Rush V8 site settings (public). multiplayerServer: the multiplayer server's wss:// address.\nwindow.GALACTIC_RUSH_CONFIG = { multiplayerServer: ${JSON.stringify(MP_SERVER)} };\n`);
console.log(`built dist/galactic-rush-v8.html (${(full.length / 1024).toFixed(0)} KB), ${order.length} modules, multiplayer server: ${MP_SERVER || 'not set'}`);
