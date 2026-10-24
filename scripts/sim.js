// `npm run sim [game]`: every game's balance bots, for 1, 2 and the most players, idle and trying. Fails if an idle
// team wins or a trying team gets nowhere (a game should be neither free nor impossible).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const only = process.argv[2];
let failed = false;
for (const id of await readdir(join(ROOT, 'games'))) {
  if (only && id !== only) continue;
  let m; try { m = JSON.parse(await readFile(join(ROOT, 'games', id, 'game.json'), 'utf8')); } catch { continue; }
  const { simulate } = await import(pathToFileURL(join(ROOT, 'games', id, 'sim.js')).href);
  const counts = [...new Set([m.players[0], Math.min(2, m.players[1]), Math.min(4, m.players[1])])];
  console.log(`\n${m.name}`);
  for (const players of counts) {
    const t0 = Date.now(), idle = simulate({ players, seed: 1, skill: 0 }), runs = [1, 2, 3].map((seed) => simulate({ players, seed, skill: 1 }));
    const avg = runs.reduce((s, r) => s + r.progress, 0) / runs.length, wins = runs.filter((r) => r.won).length;
    console.log(`  ${players} player${players > 1 ? 's' : ' '}  trying: ${avg.toFixed(1)} of ${runs[0].of} ${runs[0].unit} (won ${wins}/3, ~${Math.round(runs[0].seconds / 60)} min)  idle: ${idle.progress} ${idle.won ? 'WON ✗' : ''}  [${Date.now() - t0} ms]`);
    if (idle.won) { failed = true; console.error(`  ✗ an idle team wins ${m.name}`); }
    if (avg <= 0) { failed = true; console.error(`  ✗ a trying team gets nowhere in ${m.name}`); }
  }
}
if (failed) process.exit(1);
