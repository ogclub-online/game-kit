// `npm run build`: the playtest page as a static site in dist/, for hosting anywhere (any static host, IPFS).
// Every game runs entirely in the browser there (engine/local.js plays the server's part), so a static copy is
// the whole playtest: dist/index.html lists the games, each opens engine/play.html?game=<id>. All paths are
// relative, so it works from a sub-folder or an IPFS gateway path too. No dependencies.
// Games in the inbox (dist/games/<id>/ with no games/<id>/, see scripts/games.js) are kept as they are and listed
// too, marked as in review: everything else in dist/ is rebuilt from scratch, the same every time.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allGames, inboxGames } from './games.js';

const OUT = join(ROOT, 'dist');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Clear dist/ except the inbox games, then copy the kit in.
const keep = new Set(inboxGames());
await mkdir(OUT, { recursive: true });
for (const e of await readdir(OUT)) if (e !== 'games') await rm(join(OUT, e), { recursive: true, force: true });
await mkdir(join(OUT, 'games'), { recursive: true });
for (const e of await readdir(join(OUT, 'games'))) if (!keep.has(e)) await rm(join(OUT, 'games', e), { recursive: true, force: true });
const skip = (src) => !/[\\/](test|node_modules)([\\/]|$)/.test(src);
for (const dir of ['engine', 'docs']) await cp(join(ROOT, dir), join(OUT, dir), { recursive: true, filter: skip });
for (const e of await readdir(join(ROOT, 'games'))) await cp(join(ROOT, 'games', e), join(OUT, 'games', e), { recursive: true, filter: skip });

const games = [];
for (const { dir, inbox } of allGames()) {
  try { games.push({ ...JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')), ...(inbox ? { inbox: true } : {}) }); } catch { /* not a game */ }
}
await writeFile(join(OUT, 'games.json'), JSON.stringify(games));
// Each game's files, for `npm run import` (static hosts don't list folders).
const filesIn = (dir, pre = '') => readdirSync(dir).sort().flatMap((e) => (statSync(join(dir, e)).isDirectory() ? filesIn(join(dir, e), `${pre}${e}/`) : e === 'files.json' ? [] : [`${pre}${e}`]));
for (const g of games) await writeFile(join(OUT, 'games', g.id, 'files.json'), JSON.stringify(filesIn(join(OUT, 'games', g.id))));

const card = (g) => `<a class="g" href="engine/play.html?game=${encodeURIComponent(g.id)}"><b>${esc(g.name)}${g.inbox ? ' <i>NEW · IN REVIEW</i>' : ''}</b><small>${esc(g.tagline ?? '')}</small><span>${esc(g.players?.[0] ?? 1)}-${esc(g.players?.[1] ?? 1)} PLAYERS · ${esc((g.modes ?? []).join(' / ').toUpperCase())}</span></a>`;
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
.g i { font-style: normal; font-size: 10px; color: #0b1220; background: #ffd25e; padding: 1px 5px; margin-left: 6px; letter-spacing: .04em; }
</style></head>
<body><main>
<h1>OG CLUB WORLD · GAME KIT</h1>
<p>Games made with the kit, playable here against bots. Everything runs in your browser; nothing is sent anywhere.</p>
<div class="grid">${games.map(card).join('')}</div>
</main></body></html>
`);
console.log(`dist/ is ready: ${games.length} game${games.length === 1 ? '' : 's'}${keep.size ? ` (in the inbox: ${[...keep].join(', ')})` : ''} (open dist/index.html through any static web server)`);
