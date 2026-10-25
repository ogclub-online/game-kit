// `npm run check`: is every game in games/ fit to go into OG Club World? CI runs it on every pull request.
//
// It checks each game's manifest, that its files are there and export what the world calls, that its panel is
// plain markup, that its messages keep to its own prefix, that its $SWARM reward is capped, and that its code
// stays inside the sandbox: no network, no wallets, no storage, no HTML strings, no outside URLs, no dynamic code,
// imports only from its own folder and the kit's engine. Anything here fails the pull request.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const GAMES = process.env.KIT_GAMES ?? join(ROOT, 'games');
/** Messages the world itself understands: a game's own messages must start with its prefix instead. */
const SHARED = new Set(['walk', 'dir', 'arenaGo', 'arenaLeave', 'ping']);
const FROM_WORLD = new Set(['err', 'pong', 'og']);
/** Prefixes already taken in OG Club World (its own games and systems). */
const TAKEN = new Set(['a', 'b', 'g', 'gt', 'sb', 'mg', 'sp', 'gw', 'gf', 'gs', 'merge', 'club', 'furni', 'raffle', 'ball', 'gem', 'frame', 'boat', 'sg', 'rp', 'cd']);
const ENGINE_OK = new Set(['world.js', 'sprites.js', 'text.js', 'motion.js']);
const MAX_REWARD = 300;
/** Code a game may not contain (its rules, round and browser module). */
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'network calls (fetch)'], [/XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection/, 'network access'],
  [/\beval\s*\(|new\s+Function\b|\bimport\s*\(/, 'running code from strings or loading code later'],
  [/\bethereum\b|eth_[a-zA-Z]+|personal_sign|signTypedData|wallet_[a-zA-Z]+/i, 'wallet access'],
  [/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./, 'browser storage'],
  [/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/, 'HTML from strings (use el() and textContent)'],
  [/\blocation\s*[.=]|window\.open|\bhistory\.|navigator\.(clipboard|share)/, 'leaving or changing the page'],
  [/\bpostMessage\b|new\s+(Shared)?Worker\b|importScripts/, 'workers or messaging other windows'],
  [/https?:\/\//, 'outside links (everything must be in the game\'s folder)'],
  [/\bprocess\.|\brequire\s*\(|node:/, 'Node internals'],
  [/\bdocument\.(body|head|documentElement)\b|\bdocument\.querySelector/, 'reaching outside your panel (use ctx.$ with your own ids)'],
];
/** In the rules and the round: no clocks or timers (time comes in through tick and step), so runs replay and sims are fair. */
const SERVER_ONLY = [[/\bsetTimeout|setInterval|requestAnimationFrame|performance\.now|Date\.now\s*\(/, 'timers or clocks (time comes in through tick(dt, now))'], [/\bdocument\b|\bwindow\b/, 'the browser']];

const problems = [];
const bad = (game, text) => problems.push(`games/${game}: ${text}`);
const exists = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

const games = (await readdir(GAMES)).filter((d) => !d.startsWith('.'));
const prefixes = new Map();
for (const id of games) {
  const dir = join(GAMES, id);
  if (!(await stat(dir)).isDirectory()) continue;
  // ---- the manifest
  let m;
  try { m = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')); } catch (e) { bad(id, `game.json is missing or not JSON (${e.message})`); continue; }
  if (m.id !== id) bad(id, `game.json "id" must be the folder's name ("${id}")`);
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(id)) bad(id, 'the folder name must be 2-24 lowercase letters, digits or dashes');
  if (typeof m.name !== 'string' || !m.name || m.name.length > 24 || m.name !== m.name.toUpperCase()) bad(id, '"name" must be 1-24 characters, in capitals');
  if (typeof m.tagline !== 'string' || m.tagline.length > 90) bad(id, '"tagline" must be text up to 90 characters');
  if (!Array.isArray(m.players) || m.players.length !== 2 || !(m.players[0] >= 1 && m.players[1] >= m.players[0] && m.players[1] <= 8)) bad(id, '"players" must be [fewest, most], 1 to 8');
  if (!Array.isArray(m.modes) || !m.modes.length || m.modes.some((x) => x !== 'solo' && x !== 'coop')) bad(id, '"modes" must list "solo" and/or "coop"');
  if (typeof m.prefix !== 'string' || !/^[a-z]{2,3}$/.test(m.prefix)) bad(id, '"prefix" must be 2-3 lowercase letters');
  else if (TAKEN.has(m.prefix) && !['siege', 'runpepe', 'template'].includes(id)) bad(id, `prefix "${m.prefix}" is taken in OG Club World`);
  else if (prefixes.has(m.prefix)) bad(id, `prefix "${m.prefix}" is also used by games/${prefixes.get(m.prefix)}`);
  else prefixes.set(m.prefix, id);
  if (!Array.isArray(m.howto) || !m.howto.length || m.howto.some((l) => typeof l !== 'string' || l.length > 400)) bad(id, '"howto" must be a list of lines (how to play), each up to 400 characters');
  if (!m.reward || typeof m.reward.fn !== 'string' || !(m.reward.max > 0 && m.reward.max <= MAX_REWARD)) bad(id, `"reward" must name the reward function in rules.js and its "max" (at most ${MAX_REWARD} $SWARM a run)`);
  // ---- the files
  for (const f of ['rules.js', 'round.js', 'client.js', 'sim.js', m.panel ?? 'panel.html']) if (!(await exists(join(dir, f)))) bad(id, `${f} is missing`);
  const tests = await readdir(join(dir, 'test')).catch(() => []);
  if (!tests.some((f) => f.endsWith('.test.js'))) bad(id, 'needs tests in test/*.test.js');
  // ---- the code
  for (const f of (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.js'))) {
    const src = await readFile(join(dir, f), 'utf8'), code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
    const isTest = f.startsWith('test');
    if (!isTest) for (const [re, what] of FORBIDDEN) if (re.test(code)) bad(id, `${f}: ${what} isn't allowed`);
    if (f === 'rules.js' || f === 'round.js' || f === 'sim.js') for (const [re, what] of SERVER_ONLY) if (re.test(code)) bad(id, `${f}: ${what} isn't allowed here`);
    for (const [, from] of code.matchAll(/\b(?:from|import)\s+['"]([^'"]+)['"]/g)) {
      if (isTest && (from.startsWith('node:') || from.startsWith('../') || from.startsWith('./'))) continue;
      const engine = from.match(/^\.\.\/\.\.\/engine\/([a-z]+\.js)$/);
      if (!(from.startsWith('./') && !from.includes('..')) && !(engine && ENGINE_OK.has(engine[1]))) bad(id, `${f}: may import only from its own folder (./) and ../../engine/{${[...ENGINE_OK].join(', ')}}, not "${from}"`);
    }
    // Messages: what the browser sends and what the round sends must be the game's own (or the shared few).
    if (!isTest && typeof m.prefix === 'string') {
      const sent = f === 'client.js' ? [...code.matchAll(/send\(\{\s*t:\s*'([a-zA-Z]+)'/g)].map((x) => x[1]) : f === 'round.js' ? [...code.matchAll(/\{\s*t:\s*'([a-zA-Z]+)'/g)].map((x) => x[1]) : [];
      for (const t of sent) if (!t.startsWith(m.prefix) && !SHARED.has(t) && !FROM_WORLD.has(t)) bad(id, `${f}: message "${t}" must start with the prefix "${m.prefix}"`);
    }
  }
  // ---- the panel: plain markup, one root with class "gt"
  const panel = await readFile(join(dir, m.panel ?? 'panel.html'), 'utf8').catch(() => '');
  if (/<script|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed|<link|<style|https?:\/\//i.test(panel)) bad(id, 'panel.html must be plain markup: no scripts, event attributes, frames, outside links or styles (put styles in style.css)');
  if (!/^\s*<div class="gt" id="[a-z-]+" hidden>/.test(panel)) bad(id, 'panel.html must start with <div class="gt" id="..." hidden> (one root, hidden until the game opens)');
  if (m.style) {
    const css = await readFile(join(dir, m.style), 'utf8').catch(() => null);
    if (css === null) bad(id, `${m.style} is missing`);
    else if (/@import|url\(|expression\(|https?:/i.test(css)) bad(id, `${m.style}: no @import, url() or outside links`);
  }
  // ---- what the world calls
  try {
    const rules = await import(pathToFileURL(join(dir, 'rules.js')).href);
    if (typeof rules[m.reward?.fn] !== 'function') bad(id, `rules.js must export the reward function "${m.reward?.fn}"`);
    const { Round } = await import(pathToFileURL(join(dir, 'round.js')).href);
    if (typeof Round !== 'function') bad(id, 'round.js must export class Round');
    else for (const k of ['add', 'remove', 'handle', 'tick', 'listing', 'canJoin', 'over', 'end', 'goOffline', 'rejoin', 'poke', 'broadcast']) if (typeof Round.prototype[k] !== 'function') bad(id, `Round needs a ${k}() method`);
    const sim = await import(pathToFileURL(join(dir, 'sim.js')).href);
    if (typeof sim.simulate !== 'function') bad(id, 'sim.js must export simulate({ players, seed, skill })');
    const client = await readFile(join(dir, 'client.js'), 'utf8');
    for (const name of ['createClient', 'createMap']) if (!new RegExp(`export (const|function) ${name}\\b`).test(client)) bad(id, `client.js must export ${name}`);
  } catch (e) { bad(id, `couldn't load: ${e.message}`); }
}
if (problems.length) { console.error(`✗ ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ` + problems.join('\n  ')); process.exit(1); }
console.log(`✓ ${games.length} games pass the checks`);
