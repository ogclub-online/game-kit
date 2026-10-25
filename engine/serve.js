// A tiny local web server for playtesting: `npm run play` then open http://localhost:5173/?game=<id>.
// Serves this folder (nothing else) and lists the games at /games.json, including any in the inbox (dist/games/,
// see scripts/games.js), which it serves as if they were in games/. No dependencies.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allGames } from '../scripts/games.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { location: `/engine/play.html${url.search}` }); return res.end(); }
    if (url.pathname === '/games.json') {
      const games = [];
      for (const g of allGames()) { try { games.push({ ...JSON.parse(await readFile(join(g.dir, 'game.json'), 'utf8')), ...(g.inbox ? { inbox: true } : {}) }); } catch { /* not a game */ } }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(games));
    }
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + sep)) throw new Error('no');
    // An inbox game: games/<id>/... is served from dist/games/<id>/... when games/<id> doesn't exist.
    if (!(await stat(file).catch(() => null))?.isFile() && url.pathname.startsWith('/games/')) file = normalize(join(ROOT, 'dist', decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + sep) || !(await stat(file)).isFile()) throw new Error('no');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`game kit: http://localhost:${PORT}/?game=template`));
