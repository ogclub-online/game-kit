// `npm run build`: the playtest page as a static site in dist/, for hosting anywhere (any static host, IPFS).
// Every game runs entirely in the browser there (engine/local.js plays the server's part), so a static copy is
// the whole playtest: dist/index.html lists the games, each opens engine/play.html?game=<id>. All paths are
// relative, so it works from a sub-folder or an IPFS gateway path too. No dependencies.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..'), OUT = join(ROOT, 'dist');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const dir of ['engine', 'games', 'docs']) await cp(join(ROOT, dir), join(OUT, dir), { recursive: true, filter: (src) => !/[\\/](test|node_modules)([\\/]|$)/.test(src) });

const games = [];
for (const d of (await readdir(join(ROOT, 'games'))).sort()) {
  try { games.push(JSON.parse(await readFile(join(ROOT, 'games', d, 'game.json'), 'utf8'))); } catch { /* not a game */ }
}
await writeFile(join(OUT, 'games.json'), JSON.stringify(games));

const card = (g) => `<a class="g" href="engine/play.html?game=${encodeURIComponent(g.id)}"><b>${esc(g.name)}</b><small>${esc(g.tagline ?? '')}</small><span>${esc(g.players?.[0] ?? 1)}-${esc(g.players?.[1] ?? 1)} PLAYERS · ${esc((g.modes ?? []).join(' / ').toUpperCase())}</span></a>`;
await writeFile(join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>OG Club World game kit · playtest</title>
<style>
body { margin: 0; background: #0b1220; color: #e8eadf; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px; }
h1 { color: #c9db4c; font-size: 20px; letter-spacing: .08em; margin: 0 0 4px; }
p { color: #9aa3b5; margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.g { display: grid; gap: 6px; padding: 14px; border: 1px solid #2a3240; background: #0e1727; color: inherit; text-decoration: none; }
.g:hover, .g:focus { border-color: #c9db4c; outline: none; }
.g b { color: #c9db4c; letter-spacing: .06em; }
.g small, .g span { color: #9aa3b5; font-size: 12px; }
</style></head>
<body><main>
<h1>OG CLUB WORLD · GAME KIT</h1>
<p>Games made with the kit, playable here against bots. Everything runs in your browser; nothing is sent anywhere.</p>
<div class="grid">${games.map(card).join('')}</div>
</main></body></html>
`);
console.log(`dist/ is ready: ${games.length} game${games.length === 1 ? '' : 's'} (open dist/index.html through any static web server)`);
