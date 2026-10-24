// A tiny local web server for playtesting: `npm run play` then open http://localhost:5173/?game=<id>.
// Serves this folder (nothing else) and lists the games at /games.json. No dependencies.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { location: `/engine/play.html${url.search}` }); return res.end(); }
    if (url.pathname === '/games.json') {
      const games = [];
      for (const d of await readdir(join(ROOT, 'games'))) { try { games.push(JSON.parse(await readFile(join(ROOT, 'games', d, 'game.json'), 'utf8'))); } catch { /* not a game */ } }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(games));
    }
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + sep) || !(await stat(file)).isFile()) throw new Error('no');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`game kit: http://localhost:${PORT}/?game=template`));
