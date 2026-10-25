// `npm run new <id> [PREFIX]`: start a new game from the template (games/template, COIN DASH): copies it to
// games/<id>, gives it its id, a name and its own message prefix, and it plays straight away
// (npm run play, then open http://localhost:5173/?game=<id>). Then make it yours.
// `npm run new <id> <prefix> -- --inbox` makes it in the inbox, dist/games/<id>/, instead (for builders that may
// only write the built site; see scripts/games.js). It runs `npm run build` first if dist/ isn't there yet.
import { cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const inbox = process.argv.includes('--inbox'), args = process.argv.slice(2).filter((a) => a !== '--inbox');
const id = args[0], prefix = args[1] ?? id?.replace(/[^a-z]/g, '').slice(0, 2);
if (!id || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) { console.error('usage: npm run new <id> [prefix]   (id: 2-24 lowercase letters, digits, dashes)'); process.exit(1); }
if (!/^[a-z]{2,3}$/.test(prefix ?? '')) { console.error('the prefix must be 2-3 lowercase letters: npm run new <id> <prefix>'); process.exit(1); }
const to = join(ROOT, inbox ? 'dist' : '', 'games', id), shown = `${inbox ? 'dist/' : ''}games/${id}`;
if (await stat(join(ROOT, 'games', id)).catch(() => null) || (inbox && await stat(to).catch(() => null))) { console.error(`${shown} already exists`); process.exit(1); }
if (inbox && !(await stat(join(ROOT, 'dist', 'engine', 'world.js')).catch(() => null))) execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-site.js')], { stdio: 'inherit' });
await cp(join(ROOT, 'games', 'template'), to, { recursive: true });
const name = id.replace(/-/g, ' ').toUpperCase();
for (const f of await readdir(to, { recursive: true })) {
  const file = join(to, f);
  if (!(await stat(file)).isFile()) continue;
  let s = await readFile(file, 'utf8');
  // The template's message names and element ids all start with "cd".
  s = s.replace(/(?<![a-z])cd(?=-|w'|roster'|go'|s'|end'|"|' |'\)|'\]|'$)/gm, prefix).replace(/"prefix": "cd"/, `"prefix": "${prefix}"`);
  if (f === 'game.json') { const m = JSON.parse(s); m.id = id; m.name = name; s = JSON.stringify(m, null, 2) + '\n'; }
  s = s.replace(/game = 'template'/, `game = '${id}'`).replace(/COIN DASH/g, name);
  await writeFile(file, s);
}
console.log(`${shown} is ready (prefix "${prefix}"). Play it: npm run play, then http://localhost:5173/?game=${id}`);
