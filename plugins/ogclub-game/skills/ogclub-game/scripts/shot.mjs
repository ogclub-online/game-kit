// Screenshots of a kit game, the way a player sees it: solo, co-op with bots and lag, and at phone width.
// Run from the kit's root:  node <skill folder>/scripts/shot.mjs <game id> [--end <seconds>] [--out <dir>]
// (inside the kit: node plugins/ogclub-game/skills/ogclub-game/scripts/shot.mjs <game id>)
// Starts the playtest server (npm run play) unless one is already running, writes PNGs to shots/ (or --out), and
// prints every browser error. --end <seconds> also plays a solo run that long and shoots the end card (give it the
// countdown + the run's length + a few seconds). Exits 1 if the page threw or logged an error, so you notice.
// Finds Playwright in the kit, then in NODE_PATH, then in the global npm folder.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2), opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const id = args[0], out = resolve(opt('--out') ?? 'shots'), endAfter = Number(opt('--end')) || 0;
const PORT = Number(process.env.PORT) || 5173, BASE = `http://localhost:${PORT}`;
if (!id || id.startsWith('-')) { console.error('usage: node shot.mjs <game id> [--end <seconds>] [--out <dir>]   (run it from the kit root)'); process.exit(2); }
if (!existsSync('engine/serve.js') || !existsSync(join('games', id, 'game.json'))) {
  console.error(`run this from the kit's root folder, with games/${id}/game.json in it`); process.exit(2);
}

let chromium;
const globalRoot = () => { try { return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8' }).trim(); } catch { return null; } };
for (const base of [process.cwd(), ...(process.env.NODE_PATH ?? '').split(/[:;]/).filter(Boolean), globalRoot()].filter(Boolean)) {
  try { ({ chromium } = createRequire(join(base, 'noop.js'))('playwright')); break; } catch { /* next place */ }
  try { ({ chromium } = createRequire(join(base, 'playwright', 'noop.js'))('playwright')); break; } catch { /* next place */ }
}
if (!chromium) {
  console.error("Playwright is missing. Install it without touching package.json:  npm i --no-save playwright && npx playwright install chromium");
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
if (endAfter) {
  console.log(`playing a solo run for ${endAfter} s to reach the end card…`);
  await shoot('end', 'mode=solo', { width: 1280, height: 800 }, async (page) => {
    // Keep moving now and then so the run plays out, then wait for the results.
    const until = Date.now() + endAfter * 1000;
    while (Date.now() < until) { const k = 'wasd'[Math.floor(Math.random() * 4)]; await page.keyboard.down(k); await wait(page, 700); await page.keyboard.up(k); await wait(page, Math.min(5000, Math.max(0, until - Date.now()))); }
  });
}
await browser.close();
server?.kill();
console.log(`screenshots in ${out}: ${id}-{solo,coop,phone${endAfter ? ',end' : ''}}-{start,playing}.png${endAfter ? ` (the end card is ${id}-end-playing.png)` : ''}${errors ? `\n${errors} browser error(s) above: fix them` : '\nno browser errors'}`);
process.exit(errors ? 1 : 0);
