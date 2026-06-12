// scripts/dev-server.js
// Zero-dependency static server for MOCK-MODE widget development only —
// serves the repo root so http://localhost:3999/src/widget/ works without
// netlify-cli. For live mode (real functions) use `netlify dev` instead.
//
// Usage: node scripts/dev-server.js [port]

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2]) || 3999;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.toml': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    // Resolve inside the repo only — no traversal, no dotfiles (.env!).
    const safe = normalize(path).replace(/^([.\\/])+/, '');
    if (safe.split(/[\\/]/).some((seg) => seg.startsWith('.'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const data = await readFile(join(ROOT, safe));
    res.writeHead(200, { 'Content-Type': MIME[extname(safe).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`VISTA mock-mode server → http://localhost:${PORT}/src/widget/`);
});
