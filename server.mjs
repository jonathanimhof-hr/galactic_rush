// Zero-dependency static server for local development: node server.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('.', import.meta.url).pathname, port = +(process.argv[2] || process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(port, () => console.log(`GALACTIC RUSH dev server: http://localhost:${port}/`));
