// `node scripts/watch-swarm.js`: find games the imd.fun swarm built for this kit that aren't in it yet.
// Run daily by .github/workflows/watch-swarm.yml. Reads only: the wallet's paid orders on the imd.fun API, each
// order's jobs, the sites those jobs published, and each site's games.json. It runs no game code.
//
// Env: IMD_PAYER (the wallet that pays for jobs: keep it in a repository secret, never in the code),
// IMD_API (default https://api.imd.fun), IPFS_GATEWAY (default https://imd-ipfs.xyz), OUT (a file for the results).
// A game counts when its site's games.json marks it as an inbox game, or lists a game this kit doesn't have.
// Prints and writes [{ site, id, name }]: one per game, newest site first.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './games.js';

const PAYER = (process.env.IMD_PAYER ?? '').trim(), API = process.env.IMD_API ?? 'https://api.imd.fun';
const GATEWAY = (process.env.IPFS_GATEWAY ?? 'https://imd-ipfs.xyz').replace(/\/$/, '');
if (!/^0x[0-9a-fA-F]{40}$/.test(PAYER)) { console.error('set IMD_PAYER (a repository secret) to the wallet that pays for swarm jobs'); process.exit(1); }

const json = async (url) => {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } }); return r.ok ? await r.json() : null; } catch { return null; }
};
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };

const have = new Set(readdirSync(join(ROOT, 'games')));
const orders = (await json(`${API}/requests/paid-by/${PAYER}`))?.orders ?? [];
console.log(`${orders.length} paid order(s)`);

// Every job the orders lead to, then every site those jobs published (an IPFS CID or an ENS name).
const jobs = new Set();
for (const o of orders) for (const s of strings(o)) for (const m of s.matchAll(/\/jobs\/([0-9a-f-]{36})|^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/g)) jobs.add(m[1] ?? m[2]);
const sites = [];
for (const id of jobs) {
  const found = [await json(`${API}/jobs/${id}`), await json(`${API}/jobs/${id}/result`)].flatMap((x) => strings(x));
  for (const s of found) {
    for (const [cid] of s.matchAll(/\bbafy[a-z2-7]{50,}\b/g)) sites.push(`${GATEWAY}/ipfs/${cid}/`);
    for (const [ens] of s.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth\b/g)) sites.push(`https://${ens}.limo/`);
  }
}

// Each site that is a kit build: its games.json, and the games in it this kit doesn't have.
const seen = new Set(), found = [];
for (const site of [...new Set(sites)]) {
  const games = await json(new URL('games.json', site).href);
  if (!Array.isArray(games)) continue;
  for (const g of games) {
    if (!g || typeof g.id !== 'string' || !/^[a-z][a-z0-9-]{1,23}$/.test(g.id) || seen.has(g.id)) continue;
    if (g.inbox === true || !have.has(g.id)) { seen.add(g.id); found.push({ site: new URL(`games/${g.id}/`, site).href, id: g.id, name: String(g.name ?? g.id).slice(0, 40) }); }
  }
}
console.log(found.length ? found.map((f) => `${f.id}: ${f.site}`).join('\n') : 'no new games');
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(found));
