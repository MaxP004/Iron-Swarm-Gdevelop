import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../export');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run npm run export:gdevelop first');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
}).listen(5178, '127.0.0.1', () => console.log('Iron Swarm / GDevelop: http://127.0.0.1:5178/\nCtrl+C — остановить сервер.'));
