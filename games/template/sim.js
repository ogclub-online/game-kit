// COIN DASH's balance check: headless bots play the rules (no browser, no round) and say how it went. `npm run sim`
// runs every game's simulate() for 1, 2 and 4 players, idle (skill 0) and trying (skill 1). An idle team should
// never win; a trying team should make real progress. Tune the numbers in rules.js until both hold.
import { createGame, addPlayer, begin, stepGame, steer, ROUND } from './rules.js';

export function simulate({ players = 1, seed = 1, skill = 1 } = {}) {
  const g = createGame(seed);
  for (let i = 1; i <= players; i++) addPlayer(g, i);
  begin(g);
  while (!g.over) {
    if (skill > 0) for (const p of g.players.values()) {
      // Stuck on the Watcher's corner? Sidestep for a moment.
      if (p.side > 0) { p.side--; continue; }
      if (p.moving === false && p.dizzy <= 0 && p.dir) { p.side = 10; steer(g, p.id, g.rand() < 0.5 ? 1 : -1, g.rand() < 0.5 ? 1 : -1); continue; }
      // Head for the nearest coin (in screen keys: turn the map direction back into W/A/S/D), and step aside from bots.
      const c = g.coins.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a), g.coins[0]);
      if (!c) continue;
      let wx = c.x - p.x, wy = c.y - p.y;
      for (const b of g.bots) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < 1.6) { wx -= (b.x - p.x) / d * 2; wy -= (b.y - p.y) / d * 2; } }
      // world (wx, wy) = (sx + sy, -sx + sy)  =>  sx = (wx - wy) / 2, sy = (wx + wy) / 2
      const sx = (wx - wy) / 2, sy = (wx + wy) / 2;
      steer(g, p.id, Math.abs(sx) > 0.3 * Math.abs(sy) ? Math.sign(sx) : 0, Math.abs(sy) > 0.3 * Math.abs(sx) ? Math.sign(sy) : 0);
    }
    stepGame(g, ROUND.STEP);
  }
  return { won: g.won, progress: g.score, of: g.goal, unit: 'coins', seconds: Math.round(g.t) };
}
