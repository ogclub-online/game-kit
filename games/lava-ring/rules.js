import { rng, WATCHER } from '../../engine/world.js';

// Arena dimensions and the five-round clock, in map tiles and seconds.
export const C = Object.freeze({ CX: 32, CY: 32, RADIUS: 10.8, MIN_RADIUS: 6.8, CREEP: 0.8, CREEP_EVERY: 15, ROUND_SECONDS: 80, SHOP_SECONDS: 15, ROUNDS: 5, SPEED: 3.6, LAVA_DPS: 12, MAX_PLAYERS: 8 });
// The six optional purchases have three ranks each. Values are explained in the shop.
export const SPELLS = Object.freeze([
  { name: 'RUG YANK', cost: [20, 26, 32], cd: [9, 8, 7], detail: ['PULL A FOE 5 TILES', 'PULL A FOE 6 TILES', 'PULL A FOE 7 TILES'] },
  { name: 'BLINK', cost: [20, 26, 32], cd: [9, 8, 7], detail: ['TELEPORT 3 TILES', 'TELEPORT 3.8 TILES', 'TELEPORT 4.6 TILES'] },
  { name: 'HODL', cost: [20, 26, 32], cd: [10, 9, 8], detail: ['REFLECT FOR 1S', 'REFLECT FOR 1.2S', 'REFLECT FOR 1.4S'] },
  { name: 'HOMING SHILL', cost: [22, 28, 34], cd: [10, 9, 8], detail: ['MISSILE: 10 DAMAGE', 'MISSILE: 13 DAMAGE', 'MISSILE: 16 DAMAGE'] },
  { name: 'PUMP', cost: [20, 26, 32], cd: [9, 8, 7], detail: ['DASH ABOUT 2 TILES + SHOVE', 'DASH ABOUT 2.5 TILES + SHOVE', 'DASH ABOUT 3 TILES + SHOVE'] },
  { name: 'GAS CLOUD', cost: [18, 24, 30], cd: [10, 9, 8], detail: ['SLOW FOES 40% FOR 3S', 'SLOW FOES 50% FOR 4S', 'SLOW FOES 60% FOR 5S'] },
]);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
export const radius = (g) => Math.max(C.MIN_RADIUS, C.RADIUS - Math.floor(g.elapsed / C.CREEP_EVERY) * C.CREEP);
export const watcher = (x, y) => x > WATCHER.x - 0.35 && x < WATCHER.x + 2.35 && y > WATCHER.y - 0.35 && y < WATCHER.y + 2.35;
export const predictFree = (x, y) => Math.hypot(x - C.CX, y - C.CY) < C.RADIUS + 1.5 && !watcher(x, y);
export const lavaReward = ({ roundsWon = 0, knockouts = 0 }) => clamp(10 * Math.max(0, roundsWon) + 3 * Math.max(0, knockouts), 0, 120);

export function createGame(seed = 1) { return { rand: rng(seed), fighters: new Map(), round: 0, elapsed: 0, phase: 'ready', left: C.ROUND_SECONDS, projectiles: [], clouds: [], events: [], over: false, champion: null, winner: null, next: -1, roundWins: new Map() }; }
export function addPlayer(g, id, bot = false) {
  if (g.fighters.has(id)) return;
  g.fighters.set(id, { id, bot, x: 32, y: 25, vx: 0, vy: 0, dx: 0, dy: 0, aimX: 32, aimY: 32, hp: 100, alive: true, moving: false, facing: 1, shield: 0, pump: 0, pumpHit: [], cd: [0, 0, 0, 0], slots: [-1, -1, -1], ranks: [0, 0, 0, 0, 0, 0], gold: 0, damage: 0, roundDamage: 0, knockouts: 0, wins: 0, activity: 0, survived: 0, lastHit: null, lastHitAt: 0, ai: 0 });
}
export function removePlayer(g, id) { g.fighters.delete(id); }
export function begin(g) {
  while (g.fighters.size < 4) addPlayer(g, g.next--, true);
  nextRound(g);
}
function nextRound(g) {
  g.round++; g.phase = 'fight'; g.elapsed = 0; g.left = C.ROUND_SECONDS; g.winner = null; g.projectiles = []; g.clouds = [];
  const n = g.fighters.size;
  let i = 0;
  for (const p of g.fighters.values()) {
    const a = -Math.PI / 2 + i++ * Math.PI * 2 / n;
    p.x = C.CX + Math.cos(a) * 7.3; p.y = C.CY + Math.sin(a) * 7.3;
    p.vx = p.vy = p.dx = p.dy = 0; p.hp = 100; p.alive = true; p.moving = false; p.shield = p.pump = 0; p.pumpHit = []; p.cd = [0, 0, 0, 0]; p.survived = 0; p.roundDamage = 0; p.lastHit = null; p.lastHitAt = 0; p.ai = 0;
  }
  g.events.push(['round', g.round]);
}
export function steer(g, id, sx, sy) {
  const p = g.fighters.get(id); if (!p || p.bot) return;
  const [dx, dy] = unit(sx + sy, sy - sx);
  p.dx = sx || sy ? dx : 0; p.dy = sx || sy ? dy : 0;
  if (g.phase === 'fight' && p.alive && (sx || sy)) p.activity++;
}
export function aim(g, id, x, y) { const p = g.fighters.get(id); if (p && !p.bot) { p.aimX = x; p.aimY = y; } }
export function buy(g, id, spell) {
  const p = g.fighters.get(id);
  if (!p || g.phase !== 'shop' || !Number.isInteger(spell) || spell < 0 || spell >= SPELLS.length) return false;
  const rank = p.ranks[spell];
  if (rank >= 3 || (rank === 0 && p.slots.every((s) => s >= 0)) || p.gold < SPELLS[spell].cost[rank]) return false;
  p.gold -= SPELLS[spell].cost[rank]; p.ranks[spell]++;
  if (rank === 0) p.slots[p.slots.indexOf(-1)] = spell;
  return true;
}
function nearest(g, p, range = Infinity) {
  let target = null, best = range;
  for (const q of g.fighters.values()) if (q.id !== p.id && q.alive) { const d = distance(p, q); if (d < best) { target = q; best = d; } }
  return target;
}
function hit(g, target, from, damage, force, ux, uy) {
  if (!target?.alive || target.shield > 0) return false;
  target.hp = Math.max(0, target.hp - damage);
  const k = force * (1 + (100 - target.hp) / 100 * 0.9);
  target.vx += ux * k; target.vy += uy * k;
  const source = g.fighters.get(from);
  if (source && source !== target) { source.damage += damage; source.roundDamage += damage; source.activity++; target.lastHit = from; target.lastHitAt = g.elapsed; }
  if (target.hp <= 0) eliminate(g, target);
  else g.events.push(['hit', target.id]);
  return true;
}
function eliminate(g, p) {
  if (!p.alive) return;
  p.alive = false; p.hp = 0; p.dx = p.dy = 0;
  const killer = g.fighters.get(p.lastHit);
  if (killer && killer.id !== p.id && g.elapsed - p.lastHitAt <= 8) { killer.knockouts++; killer.gold += 15; g.events.push(['ko', killer.id, p.id]); }
  else g.events.push(['out', p.id]);
}
export function cast(g, id, slot, ax, ay) {
  const p = g.fighters.get(id);
  if (!p?.alive || g.phase !== 'fight' || !Number.isInteger(slot) || slot < 0 || slot > 3 || p.cd[slot] > 0) return false;
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return false;
  const [ux, uy] = unit(ax - p.x, ay - p.y), spell = slot === 0 ? -1 : p.slots[slot - 1];
  if (slot > 0 && spell < 0) return false;
  const rank = spell < 0 ? 1 : p.ranks[spell];
  p.aimX = ax; p.aimY = ay; p.activity++;
  p.cd[slot] = spell < 0 ? 3.8 : SPELLS[spell].cd[rank - 1];
  if (spell === -1 || spell === 3) g.projectiles.push({ x: p.x, y: p.y, vx: ux * (spell === -1 ? 11 : 5), vy: uy * (spell === -1 ? 11 : 5), owner: id, kind: spell, rank, life: spell === -1 ? 1.3 : 3, reflected: false });
  else if (spell === 0) {
    let target = null, closest = 4 + rank;
    for (const q of g.fighters.values()) if (q.id !== id && q.alive) {
      const rx = q.x - p.x, ry = q.y - p.y, along = rx * ux + ry * uy, sideways = Math.abs(rx * uy - ry * ux);
      if (along <= 0 || along > closest || sideways > 0.9) continue;
      let blocked = false;
      for (let t = 0.5; t < along; t += 0.5) if (watcher(p.x + ux * t, p.y + uy * t)) { blocked = true; break; }
      if (!blocked) { target = q; closest = along; }
    }
    if (target) { const [hx, hy] = unit(p.x - target.x, p.y - target.y); hit(g, target, id, 5 + rank * 2, 5 + rank, hx, hy); }
  } else if (spell === 1) {
    const destX = p.x + ux * (2.2 + rank * 0.8), destY = p.y + uy * (2.2 + rank * 0.8);
    if (Math.hypot(destX - C.CX, destY - C.CY) < radius(g) - 0.3 && !watcher(destX, destY)) { p.x = destX; p.y = destY; }
  } else if (spell === 2) p.shield = 0.8 + rank * 0.2;
  else if (spell === 4) { p.pump = 0.35 + rank * 0.1; p.vx = ux * (8 + rank); p.vy = uy * (8 + rank); p.pumpHit = []; }
  else if (spell === 5) { const d = Math.min(5, Math.hypot(ax - p.x, ay - p.y)); const x = p.x + ux * d, y = p.y + uy * d; if (!watcher(x, y)) g.clouds.push({ x, y, owner: id, rank, life: 2 + rank }); }
  g.events.push(['cast', id, spell]);
  return true;
}
function botThink(g, p, dt) {
  if (!p.alive) return;
  const target = nearest(g, p); if (!target) return;
  const edge = Math.hypot(p.x - C.CX, p.y - C.CY), danger = radius(g) - edge;
  let mx = target.x - p.x, my = target.y - p.y;
  const d = Math.hypot(mx, my) || 1;
  if (d < 4) { mx = -mx; my = -my; }
  if (danger < 2.6) { mx += (C.CX - p.x) * 4; my += (C.CY - p.y) * 4; }
  for (const shot of g.projectiles) if (shot.owner !== p.id && Math.hypot(shot.x - p.x, shot.y - p.y) < 2.5) { mx += (p.y - shot.y) * 2; my -= (p.x - shot.x) * 2; }
  const [dx, dy] = unit(mx, my); p.dx = dx; p.dy = dy;
  p.ai -= dt;
  if (p.ai <= 0) {
    p.ai = Math.max(0.28, 0.9 - g.round * 0.11) + g.rand() * 0.4;
    const lead = g.round * 0.07;
    const ax = target.x + target.dx * lead, ay = target.y + target.dy * lead;
    cast(g, p.id, 0, ax, ay);
    const ready = p.slots.map((s, i) => s >= 0 && p.cd[i + 1] <= 0 ? i + 1 : -1).filter((s) => s > 0);
    if (ready.length) cast(g, p.id, ready[Math.floor(g.rand() * ready.length)], ax, ay);
  }
}
function finishRound(g) {
  const contenders = [...g.fighters.values()].filter((p) => p.alive && p.activity > 0);
  contenders.sort((a, b) => b.hp - a.hp || b.knockouts - a.knockouts);
  const winner = contenders[0] ?? null;
  g.winner = winner?.id ?? null;
  if (winner) { winner.wins++; winner.gold += 20; g.events.push(['win', winner.id]); }
  for (const p of g.fighters.values()) p.gold += 15 + Math.floor(p.survived / 3) + Math.floor(p.roundDamage / 5);
  if (g.round >= C.ROUNDS) {
    g.phase = 'done'; g.over = true;
    const ranked = [...g.fighters.values()].filter((p) => p.activity > 0).sort((a, b) => b.wins - a.wins || b.knockouts - a.knockouts || b.damage - a.damage);
    g.champion = ranked[0]?.id ?? null;
  } else { g.phase = 'shop'; g.left = C.SHOP_SECONDS; }
}
export function stepGame(g, dt) {
  if (g.over || g.phase === 'ready') return;
  dt = clamp(dt, 0, 0.25);
  if (g.phase === 'shop') {
    g.left -= dt;
    if (g.left <= 0) { for (const p of g.fighters.values()) if (p.bot) { const options = SPELLS.map((s, i) => i).filter((i) => p.ranks[i] < 3 && (p.ranks[i] > 0 || p.slots.includes(-1)) && p.gold >= SPELLS[i].cost[p.ranks[i]]); if (options.length) buy(g, p.id, options[(g.round + Math.abs(p.id)) % options.length]); } nextRound(g); }
    return;
  }
  g.elapsed += dt; g.left = Math.max(0, C.ROUND_SECONDS - g.elapsed);
  const rad = radius(g);
  for (const p of g.fighters.values()) {
    if (!p.alive) continue;
    p.survived += dt; p.shield = Math.max(0, p.shield - dt); p.pump = Math.max(0, p.pump - dt);
    for (let s = 0; s < 4; s++) p.cd[s] = Math.max(0, p.cd[s] - dt);
    if (p.bot) botThink(g, p, dt);
    let slow = 1;
    for (const c of g.clouds) if (c.owner !== p.id && Math.hypot(c.x - p.x, c.y - p.y) < 1.8) slow = Math.min(slow, 0.7 - c.rank * 0.1);
    const mx = p.dx * C.SPEED * slow * dt + p.vx * dt, my = p.dy * C.SPEED * slow * dt + p.vy * dt;
    if (!watcher(p.x + mx, p.y)) p.x += mx; else p.vx *= -0.25;
    if (!watcher(p.x, p.y + my)) p.y += my; else p.vy *= -0.25;
    p.x = clamp(p.x, 19, 45); p.y = clamp(p.y, 19, 45);
    p.moving = Math.abs(mx) + Math.abs(my) > 0.02; if (p.moving) p.facing = mx - my < 0 ? -1 : 1;
    p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt);
    if (p.pump > 0) for (const q of g.fighters.values()) if (q !== p && q.alive && !p.pumpHit.includes(q.id) && distance(p, q) < 1.2) { const [ux, uy] = unit(q.x - p.x, q.y - p.y); hit(g, q, p.id, 9, 6, ux, uy); p.pumpHit.push(q.id); }
    if (Math.hypot(p.x - C.CX, p.y - C.CY) > rad) { p.hp = Math.max(0, p.hp - C.LAVA_DPS * dt); if (p.hp <= 0) eliminate(g, p); }
  }
  for (const shot of g.projectiles) {
    if (shot.kind === 3) { const owner = g.fighters.get(shot.owner); const target = owner && nearest(g, owner); if (target) { const [ux, uy] = unit(target.x - shot.x, target.y - shot.y); shot.vx = shot.vx * 0.86 + ux * 5 * 0.14; shot.vy = shot.vy * 0.86 + uy * 5 * 0.14; } }
    shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
    if (watcher(shot.x, shot.y) || Math.hypot(shot.x - C.CX, shot.y - C.CY) > C.RADIUS + 2) { shot.life = 0; continue; }
    for (const p of g.fighters.values()) if (p.id !== shot.owner && p.alive && Math.hypot(shot.x - p.x, shot.y - p.y) < 0.7) {
      if (p.shield > 0 && !shot.reflected) { shot.owner = p.id; shot.vx *= -1; shot.vy *= -1; shot.reflected = true; g.events.push(['reflect', p.id]); break; }
      const [ux, uy] = unit(shot.vx, shot.vy);
      hit(g, p, shot.owner, shot.kind === -1 ? 5 : 7 + shot.rank * 3, shot.kind === -1 ? 3.2 : 3.8, ux, uy);
      shot.life = 0; break;
    }
  }
  g.projectiles = g.projectiles.filter((s) => s.life > 0);
  for (const c of g.clouds) c.life -= dt;
  g.clouds = g.clouds.filter((c) => c.life > 0);
  const alive = [...g.fighters.values()].filter((p) => p.alive);
  if (g.left <= 0 || alive.length <= 1) finishRound(g);
}
