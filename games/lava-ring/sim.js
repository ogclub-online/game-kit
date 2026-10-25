import { createGame, addPlayer, begin, stepGame, steer, cast, buy, SPELLS, C } from './rules.js';

export function simulate({ players = 1, seed = 1, skill = 1 } = {}) {
  const g = createGame(seed);
  for (let i = 1; i <= players; i++) addPlayer(g, i);
  begin(g);
  let lastRound = g.round, steps = 0;
  while (!g.over && steps++ < 12000) {
    if (skill > 0 && g.phase === 'fight') for (let id = 1; id <= players; id++) {
      const p = g.fighters.get(id); if (!p?.alive) continue;
      const foes = [...g.fighters.values()].filter((f) => f.id !== id && f.alive);
      foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const target = foes[0]; if (!target) continue;
      const edge = Math.hypot(p.x - C.CX, p.y - C.CY), danger = Math.max(C.MIN_RADIUS, C.RADIUS - Math.floor(g.elapsed / C.CREEP_EVERY) * C.CREEP) - edge;
      let mx = target.x - p.x, my = target.y - p.y;
      if (Math.hypot(mx, my) < 4) { mx = -mx; my = -my; }
      if (danger < 3.2) { mx += (C.CX - p.x) * 5; my += (C.CY - p.y) * 5; }
      for (const shot of g.projectiles) if (shot.owner !== id && Math.hypot(shot.x - p.x, shot.y - p.y) < 3) { mx += (p.y - shot.y) * 3; my -= (p.x - shot.x) * 3; }
      steer(g, id, (mx - my) / 2, (mx + my) / 2);
      if (p.cd[0] <= 0) cast(g, id, 0, target.x + target.dx * 0.1, target.y + target.dy * 0.1);
      for (let slot = 1; slot <= 3; slot++) if (p.slots[slot - 1] >= 0 && p.cd[slot] <= 0) cast(g, id, slot, target.x, target.y);
    }
    if (skill > 0 && g.phase === 'shop') for (let id = 1; id <= players; id++) {
      const p = g.fighters.get(id); if (!p) continue;
      const options = SPELLS.map((_, i) => i).filter((i) => p.ranks[i] < 3 && (p.ranks[i] || p.slots.includes(-1)) && p.gold >= SPELLS[i].cost[p.ranks[i]]);
      if (options.length) buy(g, id, options[(g.round + id) % options.length]);
    }
    stepGame(g, 0.05);
    if (lastRound !== g.round) lastRound = g.round;
  }
  const humans = [...g.fighters.values()].filter((p) => !p.bot);
  const progress = humans.reduce((sum, p) => sum + p.wins, 0);
  return { won: skill > 0 && humans.some((p) => p.id === g.champion), progress, of: C.ROUNDS, unit: 'rounds', seconds: Math.round(steps * 0.05) };
}
