// Screenshots of a kit game, the way a player sees it: solo, co-op with bots and lag, and at phone width.
// Run from the kit's root:  node <skill folder>/scripts/shot.mjs <game id> [out dir]
// Starts the playtest server (npm run play) unless one is already running, writes PNGs to shots/ (or the out dir),
// and prints every browser error. Exits 1 if the page threw or logged an error, so you notice.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const id = process.argv[2], out = resolve(process.argv[3] ?? 'shots');
const PORT = Number(process.env.PORT) || 5173, BASE = `http://localhost:${PORT}`;
if (!id) { console.error('usage: node shot.mjs <game id> [out dir]   (run it from the kit root)'); process.exit(2); }
if (!existsSync('engine/serve.js') || !existsSync(join('games', id, 'game.json'))) {
  console.error(`run this from the kit's root folder, with games/${id}/game.json in it`); process.exit(2);
}

let chromium;
try { ({ chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright')); } catch {
  console.error('Playwright is missing. Install it for this run:  npm i -D playwright && npx playwright install chromium');
  console.error('(or check by hand: npm run play, then ' + `${BASE}/?game=${id}&mode=coop&bots=2&lag=80)`); process.exit(2);
}

const up = async () => { try { return (await fetch(`${BASE}/games.json`)).ok; } catch { return false; } };
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, ['engine/serve.js'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) { console.error('the playtest server did not start'); server.kill(); process.exit(2); }
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let errors = 0;
const wait = (p, ms) => p.waitForTimeout(ms);
async function shoot(name, query, viewport, play) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => { errors++; console.log(`[${name}] page error: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log(`[${name}] console error: ${m.text()}`); } });
  await page.goto(`${BASE}/?game=${id}&autostart=1&${query}`);
  await wait(page, 1500);
  await page.screenshot({ path: join(out, `${id}-${name}-start.png`) });
  await play(page);
  await page.screenshot({ path: join(out, `${id}-${name}-playing.png`) });
  await page.close();
}
// Walk about for a while (WASD), then let it run: enough to get past a countdown and into the game.
const walk = async (page) => {
  for (const k of ['d', 's', 'a', 'w', 'd']) { await page.keyboard.down(k); await wait(page, 900); await page.keyboard.up(k); }
  await wait(page, 4000);
};
await shoot('solo', 'mode=solo', { width: 1280, height: 800 }, walk);
await shoot('coop', 'mode=coop&bots=2&lag=80', { width: 1280, height: 800 }, async (page) => { await wait(page, 21000); await walk(page); });
await shoot('phone', 'mode=solo', { width: 390, height: 844 }, walk);
await browser.close();
server?.kill();
console.log(`screenshots in ${out}: ${id}-{solo,coop,phone}-{start,playing}.png${errors ? `\n${errors} browser error(s) above: fix them` : '\nno browser errors'}`);
process.exit(errors ? 1 : 0);
