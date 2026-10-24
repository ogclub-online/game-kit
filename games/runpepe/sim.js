// RUN PEPE RUN's balance check: bots run the lap's centre line, dodging with a quarter second's look ahead (better
// than people: they see every heading), and bring downed teammates back when they're close. skill 0: they stand
// still at the start. No skills or items (the levels must be fair without them).
import * as R from './rules.js';

const WAY = [[9.5, 9.5], [54.5, 9.5], [54.5, 54.5], [9.5, 54.5], [9.5, 18.5]];
export function simulate({ players = 4, seed = 7, skill = 1 } = {}) {
  const g = R.createGame(seed);
  for (let i = 1; i <= players; i++) R.addPlayer(g, i);
  R.beginLevel(g, 1);
  const prog = new Map(); let level = 0;
  const dirs = [...R.DIRS16, [0, 0]];
  const danger = (x, y, look) => { let m = 99; for (const c of g.swarm.creeps) { const d = Math.hypot(c.x + c.vx * look - x, c.y + c.vy * look - y) - c.r; if (d < m) m = d; } return m; };
  while (!g.over && g.step < 20 * 60 * 40 && (skill || g.step < 20 * 120)) {
    if (g.level !== level) { level = g.level; for (const p of g.players.values()) prog.set(p.id, 0); }
    if (skill) for (const p of g.players.values()) {
      if (!p.alive || g.pause) { p.dir = null; continue; }
      let goal = WAY[prog.get(p.id)];
      const down = [...g.players.values()].filter((q) => !q.alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (down && Math.hypot(down.x - p.x, down.y - p.y) < 8) goal = [down.x, down.y];
      if (goal === WAY[prog.get(p.id)] && Math.hypot(goal[0] - p.x, goal[1] - p.y) < 2) prog.set(p.id, Math.min(WAY.length - 1, prog.get(p.id) + 1));
      const gx = goal[0] - p.x, gy = goal[1] - p.y, gl = Math.hypot(gx, gy) || 1;
      let best = null, bs = -1e9;
      for (const [dx, dy] of dirs) {
        const nx = p.x + dx * 0.85, ny = p.y + dy * 0.85;
        if (!R.freeAt(nx, ny)) continue;
        const safe = R.inSafe(nx, ny) ? 3 : Math.min(danger(nx, ny, 0.25), danger(p.x + dx * 0.34, p.y + dy * 0.34, 0.1));
        const score = (dx * gx + dy * gy) / gl + (safe < 0.5 ? -10 + safe * 10 : 0) + Math.min(safe, 1.5) * 0.5;
        if (score > bs) { bs = score; best = [dx, dy]; }
      }
      p.dir = best && (best[0] || best[1]) ? best : null;
    }
    R.stepGame(g); g.events.length = 0;
  }
  return { won: g.won, progress: g.cleared, of: R.LEVELS, unit: 'levels cleared', seconds: Math.round(g.step / 20) };
}
