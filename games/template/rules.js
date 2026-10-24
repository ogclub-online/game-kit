// COIN DASH: the kit's starter game. These are its rules, plain functions on a plain state object, used by the
// server (round.js runs them) and free to use in the browser too (client.js). No DOM, no network, no clock: the
// round passes the time in. Keep a game's rules like this and they're easy to test and simulate (test/, sim.js).
//
// The field is a square round the Swarm Watcher. Coins pop up; walking over one grabs it. FUD bots bounce about;
// touching one makes you dizzy (you can't move) for a moment. The team has 90 seconds to grab enough coins.
import { rng, WATCHER } from '../../engine/world.js';

/** The field: tiles [x0, y0] to [x1, y1) on the town-sized map. */
export const FIELD = Object.freeze([20, 20, 44, 44]);
export const ROUND = Object.freeze({ STEP: 0.05, SECONDS: 90, SPEED: 3.4, COINS: 6, DIZZY: 2, MAX_PLAYERS: 4 });
/** Coins the team needs: more with more players. */
export const goalFor = (players) => 20 + 10 * players;
/** $SWARM a player gets: 1 for every 2 coins they grabbed, 10 more if the team made it (the world pays it; most 40). */
export const coinReward = ({ coins, won }) => Math.min(30, Math.floor(coins / 2)) + (won ? 10 : 0);

/** Can someone stand here (inside the field, not on the Watcher)? */
export function free(x, y) {
  const [x0, y0, x1, y1] = FIELD;
  if (x < x0 + 0.3 || y < y0 + 0.3 || x > x1 - 0.3 || y > y1 - 0.3) return false;
  return !(x > WATCHER.x - 0.3 && y > WATCHER.y - 0.3 && x < WATCHER.x + 2.3 && y < WATCHER.y + 2.3);
}

export function createGame(seed = 1) {
  const rand = rng(seed);
  return { rand, t: 0, left: ROUND.SECONDS, players: new Map(), coins: [], bots: [], score: 0, goal: goalFor(1), over: false, won: false, events: [], nextId: 1 };
}
export function addPlayer(g, id) {
  const i = g.players.size;
  g.players.set(id, { id, x: 26 + i * 1.5, y: 24, dir: null, goal: null, facing: 1, moving: false, dizzy: 0, coins: 0 });
  g.goal = goalFor(g.players.size);
}
export function removePlayer(g, id) { g.players.delete(id); g.goal = goalFor(Math.max(1, g.players.size)); }
/** The round begins: FUD bots (two, and one more per player) and the first coins. */
export function begin(g) {
  const [x0, y0, x1, y1] = FIELD;
  for (let i = 0; i < 2 + g.players.size; i++) {
    const a = g.rand() * Math.PI * 2, s = 2 + g.rand() * 1.5;
    g.bots.push({ id: g.nextId++, x: x0 + 2 + g.rand() * (x1 - x0 - 4), y: y0 + 2 + g.rand() * (y1 - y0 - 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s });
  }
  while (g.coins.length < ROUND.COINS) spawnCoin(g);
}
function spawnCoin(g) {
  const [x0, y0, x1, y1] = FIELD;
  for (let tries = 0; tries < 50; tries++) {
    const x = x0 + 1 + g.rand() * (x1 - x0 - 2), y = y0 + 1 + g.rand() * (y1 - y0 - 2);
    if (free(x, y)) { g.coins.push({ id: g.nextId++, x, y }); return; }
  }
}
/** Keys held, in screen terms (W is up the screen), turned into the map's directions (the iso view). */
export function steer(g, pid, sx, sy) {
  const p = g.players.get(pid); if (!p) return;
  sx = Math.sign(sx) || 0; sy = Math.sign(sy) || 0;
  const dx = sx + sy, dy = -sx + sy;
  p.goal = null; p.dir = dx || dy ? [dx, dy] : null;
}
/** A click: walk straight to that tile. */
export function walkTo(g, pid, x, y) { const p = g.players.get(pid); if (p) { p.dir = null; p.goal = [x + 0.5, y + 0.5]; } }

/** One step (seconds): everyone moves, bots bounce, coins are grabbed, bots make you dizzy, the clock runs. */
export function stepGame(g, dt) {
  if (g.over) return;
  g.t += dt; g.left = Math.max(0, g.left - dt);
  for (const p of g.players.values()) {
    p.moving = false;
    if (p.dizzy > 0) { p.dizzy -= dt; continue; }
    let vx = 0, vy = 0;
    if (p.dir) { const l = Math.hypot(...p.dir); vx = p.dir[0] / l; vy = p.dir[1] / l; }
    else if (p.goal) { const dx = p.goal[0] - p.x, dy = p.goal[1] - p.y, d = Math.hypot(dx, dy); if (d < 0.1) p.goal = null; else { vx = dx / d; vy = dy / d; } }
    const step = ROUND.SPEED * dt;
    if (vx && free(p.x + vx * step, p.y)) { p.x += vx * step; p.moving = true; }
    if (vy && free(p.x, p.y + vy * step)) { p.y += vy * step; p.moving = true; }
    if (Math.abs(vx - vy) > 0.01) p.facing = vx - vy < 0 ? -1 : 1;
  }
  const [x0, y0, x1, y1] = FIELD;
  for (const b of g.bots) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < x0 + 0.5 || b.x > x1 - 0.5) b.vx = -b.vx;
    if (b.y < y0 + 0.5 || b.y > y1 - 0.5) b.vy = -b.vy;
  }
  for (const p of g.players.values()) {
    for (const c of [...g.coins]) if (Math.hypot(c.x - p.x, c.y - p.y) < 0.7) {
      g.coins = g.coins.filter((o) => o !== c); p.coins++; g.score++;
      g.events.push(['coin', p.id, c.id]);
    }
    if (p.dizzy <= 0) for (const b of g.bots) if (Math.hypot(b.x - p.x, b.y - p.y) < 0.6) { p.dizzy = ROUND.DIZZY; p.dir = null; p.goal = null; g.events.push(['dizzy', p.id]); break; }
  }
  while (g.coins.length < ROUND.COINS) spawnCoin(g);
  if (g.score >= g.goal) { g.over = true; g.won = true; }
  else if (g.left <= 0) { g.over = true; g.won = false; }
}
