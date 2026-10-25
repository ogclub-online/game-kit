// `npm run import -- <site> <id> [--inbox] [--force]`: copy a game from a hosted kit site (any `npm run build` site:
// IPFS, eth.limo, any static host) into games/<id>/ (or the inbox, dist/games/<id>/, with --inbox).
// <site> is the site's address, or the game's folder on it (…/games/<id>/).
//
// It only downloads and writes files; it never runs them. Run the checks afterwards somewhere that holds nothing
// secret (GitHub Actions does it for you: .github/workflows/import-game.yml). Never run an imported game's tests on
// a server with keys or a database: tests are the game's own code.
//
// Which files: the site's games/<id>/files.json if it has one (builds list every game's files there), else the
// gateway's folder listing (IPFS gateways show one), else the files every game has. Only plain game files are
// accepted (.js .json .html .css .md .png), inside the game's folder, at most 512 KB each and 2 MB in all.
import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { join, dirname, normalize, sep } from 'node:path';
import { ROOT } from './games.js';

const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith('--'))), [siteArg, idArg] = args.filter((a) => !a.startsWith('--'));
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!siteArg) fail('usage: npm run import -- <site address> <game id> [--inbox] [--force]');

let site;
try { site = new URL(siteArg); } catch { fail(`not an address: ${siteArg}`); }
if (site.protocol !== 'https:' && site.protocol !== 'http:') fail('the address must start with https://');
// The game's folder: given straight, or <site>/games/<id>/.
const m = site.pathname.match(/^(.*\/)games\/([a-z][a-z0-9-]{1,23})\/?$/);
const id = idArg ?? m?.[2];
if (!id || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) fail('say which game: npm run import -- <site> <id>   (id: 2-24 lowercase letters, digits, dashes)');
if (m && m[2] !== id) fail(`the address is for games/${m[2]}/, not ${id}`);
const base = new URL(m ? site.pathname.replace(/\/?$/, '/') : site.pathname.replace(/\/?$/, '/') + `games/${id}/`, site);

const OK_EXT = /\.(js|json|html|css|md|png)$/, MAX_FILE = 512 * 1024, MAX_ALL = 2 * 1024 * 1024;
const safe = (rel) => typeof rel === 'string' && rel.length < 200 && !rel.startsWith('/') && !rel.includes('\\') && !rel.split('/').some((p) => p === '..' || p === '.' || p === '' || p.startsWith('.')) && OK_EXT.test(rel);

async function get(url, max = MAX_FILE) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) fail(`${url} is bigger than ${Math.round(max / 1024)} KB: refusing it`);
  return { buf, type: res.headers.get('content-type') ?? '' };
}

// 1. files.json, 2. the gateway's folder listing (recursing into sub-folders), 3. the usual files.
async function listFiles() {
  const j = await get(new URL('files.json', base)).catch(() => null);
  if (j) { try { const list = JSON.parse(j.buf.toString('utf8')); if (Array.isArray(list) && list.length) return { how: 'files.json', list }; } catch { /* not a list */ } }
  const found = new Set();
  async function walk(prefix, depth) {
    const page = await get(new URL(prefix, base)).catch(() => null);
    if (!page || !page.type.includes('html')) return;
    const html = page.buf.toString('utf8'), here = new URL(prefix, base).pathname;
    for (const [, href] of html.matchAll(/href="([^"#?]+)"/g)) {
      let path; try { path = decodeURIComponent(new URL(href, new URL(prefix, base)).pathname); } catch { continue; }
      if (!path.startsWith(here) || path === here) continue;
      const rel = prefix + path.slice(here.length);
      if (OK_EXT.test(rel)) found.add(rel);
      else if (depth < 2 && /^[a-z0-9_-]+\/?$/i.test(path.slice(here.length))) await walk(rel.replace(/\/?$/, '/'), depth + 1);
    }
  }
  await walk('', 0).catch(() => {});
  if (found.size) return { how: 'the folder listing', list: [...found] };
  const usual = ['game.json', 'rules.js', 'round.js', 'client.js', 'sim.js', 'panel.html', 'style.css', 'PR.md', 'test/rules.test.js', 'test/round.test.js'];
  return { how: 'the usual file names', list: usual };
}

const { how, list } = await listFiles();
const bad = list.filter((f) => !safe(f));
if (bad.length) fail(`refusing files outside the rules: ${bad.join(', ')}`);

const files = new Map();
let total = 0;
for (const rel of [...new Set(list)].sort()) {
  const got = await get(new URL(rel.split('/').map(encodeURIComponent).join('/'), base)).catch((e) => fail(`couldn't download ${rel}: ${e.message}`));
  if (!got) { if (how === 'the usual file names') continue; fail(`${rel} is listed but couldn't be downloaded`); }
  total += got.buf.length;
  if (total > MAX_ALL) fail('the game is bigger than 2 MB in all: refusing it');
  files.set(rel, got.buf);
}
if (!files.has('game.json')) fail(`no game at ${base.href} (no game.json)`);
let manifest;
try { manifest = JSON.parse(files.get('game.json').toString('utf8')); } catch { fail('its game.json is not JSON'); }
if (manifest.id !== id) fail(`its game.json says it's "${manifest.id}", not "${id}"`);
for (const need of ['rules.js', 'round.js', 'client.js', 'sim.js']) if (!files.has(need)) fail(`it has no ${need}`);

const inbox = flags.has('--inbox'), to = join(ROOT, inbox ? 'dist' : '', 'games', id), shown = `${inbox ? 'dist/' : ''}games/${id}`;
if (await stat(to).catch(() => null)) {
  if (!flags.has('--force')) fail(`${shown} already exists (add --force to replace it)`);
  await rm(to, { recursive: true, force: true });
}
for (const [rel, buf] of files) {
  const file = normalize(join(to, rel));
  if (!file.startsWith(to + sep)) fail(`refusing ${rel}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buf);
}
console.log(`imported ${manifest.name ?? id} into ${shown}: ${files.size} files, ${Math.round(total / 1024)} KB (found by ${how})`);
for (const rel of [...files.keys()]) console.log(`  ${rel}`);
console.log('\nNothing was run. Next, somewhere with nothing secret on it: npm run check, npm test, npm run sim, then npm run play.');
