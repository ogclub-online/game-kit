// SWARM SIEGE's balance check: bots that build a serpentine down their lane (centre out), turn the blocks nearest
// the way into towers, and upgrade later. skill 0: nobody builds. Returns how far they held.
import * as S from './rules.js';

const rot = ([x, y], k) => { for (let i = 0; i < k; i++) [x, y] = [41 - y, x]; return [x, y]; };
function plan(lane) {
  const out = [];
  [3, 6, 9, 12].forEach((y, r) => {
    const row = [];
    for (let x = 15; x <= 26; x++) { if ((r % 2 === 0 && x >= 25) || (r % 2 === 1 && x <= 16)) continue; row.push([x, y]); }
    row.sort((a, b) => Math.abs(a[0] - 20.5) - Math.abs(b[0] - 20.5));
    out.push(...row.map((c) => rot(c, lane)));
  });
  return out;
}
const MIX = []; for (let a = 16; a <= 25; a++) for (const b of [16, 25]) MIX.push([a, b], [b, a]);
const ORDER = ['laser', 'drop', 'laser', 'gas', 'oracle', 'cold', 'laser', 'drop', 'valid', 'gas', 'laser', 'drop'];

export function simulate({ players = 1, seed = 5, skill = 1 } = {}) {
  const g = S.createGame(seed);
  for (let i = 1; i <= players; i++) S.addPlayer(g, i);
  S.begin(g);
  let last = 0;
  while (!g.over && g.t < 3000) {
    S.stepGame(g, 0.05); g.events.length = 0;
    if (!skill || g.t - last < 1) continue;
    last = g.t;
    for (let rep = 0; rep < 3; rep++) for (const p of g.players.values()) {
      const path = S.trace(g.flows[p.lane], g.cells, p.lane) ?? [];
      const near = (c) => Math.min(...path.map((q) => Math.hypot(q % 42 - c % 42, Math.floor(q / 42) - Math.floor(c / 42))));
      const mine = [...g.towers.entries()].filter(([, t]) => t.owner === p.id);
      const walls = mine.filter(([, t]) => t.kind === 'wall').sort((a, b) => near(a[0]) - near(b[0]));
      if (walls.length && mine.length - walls.length < mine.length * 0.5) {
        const hasOracle = mine.some(([, t]) => t.kind.startsWith('oracle'));
        const want = g.wave >= 6 && !hasOracle ? 'oracle' : ORDER[(p.n ?? 0) % ORDER.length], kind = p.gold >= S.TOWERS[want].cost ? want : 'laser';
        if (p.gold >= S.TOWERS[kind].cost && S.upgrade(g, p.id, walls[0][0], kind) === true) p.n = (p.n ?? 0) + 1;
      } else for (const [x, y] of [...plan(p.lane), ...MIX]) { if (p.gold < 5) break; if (!g.cells[S.idx(x, y)] && S.buildWall(g, p.id, x, y) === true) break; }
      if (g.wave > 5) for (const [c, t] of mine) { const up = S.upgradesOf(t.kind)[0]; if (t.kind !== 'wall' && up && p.gold >= S.TOWERS[up].cost + 20) S.upgrade(g, p.id, c, up); }
    }
  }
  return { won: g.won, progress: g.won ? g.wave : Math.max(0, g.wave - 1), of: S.WAVES_TOTAL, unit: 'waves held', seconds: Math.round(g.t) };
}
