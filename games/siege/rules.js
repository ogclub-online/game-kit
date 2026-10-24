// SWARM SIEGE: a co-op lane maze tower defence. The rules, shared by the server (which runs the match) and the
// browser (which draws it and previews builds).
//
// The field is a plus: four lanes, one per player, run in from the edges and meet in the Mixer, a shared square
// round the Swarm Watcher in the middle. Each wave the swarm comes down every open lane at once and makes for the
// Watcher, the shortest way through whatever's been built. You can't wall it in, but you can make it walk: every
// Firewall block bends the way, and blocks upgrade into towers. Building goes on while the waves walk, and the
// creeps re-route live round anything new. The team shares 20 lives.
//
// Gold: every creep from your lane pays you when it dies (whoever's tower kills it), every wave pays everyone a
// little, and gold left in the bank earns interest when a wave comes. You can tip teammates. Anyone can build in
// the Mixer; a lane whose player has left is anyone's.
import { armorMult } from '../../engine/world.js';

// ---------------------------------------------------------------- the field
export const GRID = 42;
/** The field sits in a WORLD-sized map at FO, so its middle two cells are the town's Watcher tiles. */
export const WORLD = 64, FO = 11, RING = 3;
/** The Watcher's cells (both ways), the Mixer's and the lanes' spans (inclusive). */
export const CORE = Object.freeze([20, 21]);
export const MIX = Object.freeze([13, 28]);
export const LANE = Object.freeze([15, 26]);
/** Where each lane's creeps come in: north, east, south, west. */
export const SPAWNS = Object.freeze([[20, 0], [41, 20], [21, 41], [0, 21]]);
export const LANE_NAMES = Object.freeze(['NORTH', 'EAST', 'SOUTH', 'WEST']);
/** The order lanes are handed out (two players face each other). */
export const LANE_ORDER = Object.freeze([0, 2, 1, 3]);
/** The middle of the Watcher (field units). */
export const HEART = Object.freeze([21, 21]);

export const ROUND = Object.freeze({
  STEP: 0.05, MAX_PLAYERS: 4, LIVES: 20, LANE_LIVES: 10, START_GOLD: 100,
  /** Seconds before the first wave, between waves, and once the field is clear. */
  FIRST_WAVE: 40, WAVE_GAP: 32, CLEAR_GAP: 6,
  SPAWN_GAP: 1, LATE_JOIN_WAVE: 3, INTEREST: 0.04, INTEREST_MAX: 40, SELL: 0.75,
  BOSS_LEAK: 5, FINAL_LEAK: 10, ORDERS: 8,
});
/** $SWARM: for every wave reached (even if the Watcher falls), and more for beating all 30. */
export const REWARD = Object.freeze({ WAVE: 6, WIN: 80 });

export const idx = (x, y) => y * GRID + x;
export const inField = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;
const inSpan = (v, [a, b]) => v >= a && v <= b;
/** Which part of the field a cell is: a lane 0-3, the Mixer 4, or -1 (the corners: walkways, no building, no creeps). */
function zoneOf(x, y) {
  if (!inField(x, y)) return -1;
  if (inSpan(x, MIX) && inSpan(y, MIX)) return 4;
  if (inSpan(x, LANE) && y < MIX[0]) return 0;
  if (inSpan(y, LANE) && x > MIX[1]) return 1;
  if (inSpan(x, LANE) && y > MIX[1]) return 2;
  if (inSpan(y, LANE) && x < MIX[0]) return 3;
  return -1;
}
export const ZONE = Int8Array.from({ length: GRID * GRID }, (_, c) => zoneOf(c % GRID, Math.floor(c / GRID)));
export const zone = (x, y) => (inField(x, y) ? ZONE[idx(x, y)] : -1);
export const isCore = (x, y) => inSpan(x, CORE) && inSpan(y, CORE);
const CORE_CELLS = [];
for (const y of CORE) for (const x of CORE) CORE_CELLS.push(idx(x, y));
/** Cells round the Watcher and each spawn stay open (nothing can be walled in at either end). */
const KEEP_CLEAR = new Uint8Array(GRID * GRID);
for (let y = CORE[0] - 1; y <= CORE[1] + 1; y++) for (let x = CORE[0] - 1; x <= CORE[1] + 1; x++) KEEP_CLEAR[idx(x, y)] = 1;
for (const [sx, sy] of SPAWNS) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inField(sx + dx, sy + dy)) KEEP_CLEAR[idx(sx + dx, sy + dy)] = 1;
export const keepClear = (x, y) => inField(x, y) && !!KEEP_CLEAR[idx(x, y)];
/** Turn a point a quarter round the middle, clockwise, k times (lane 0's things become lane k's). */
export function turn([x, y], k, span = GRID) { for (let i = 0; i < k; i++) [x, y] = [span - y, x]; return [x, y]; }

// ---------------------------------------------------------------- towers
/**
 * Firewall blocks are the maze; each upgrades into a tower, and each tower once more. dmg per hit, rate seconds a
 * hit, range in tiles. phys damage goes through armour, magic doesn't. air: false can't hit flyers; a number
 * multiplies damage on them. splash: tiles round the target; chain: [jumps, damage kept each jump]; slow: [share,
 * seconds]; aura: towers within r hit dmg harder and as faster; reveal: shows invisible creeps in its range.
 */
export const TOWERS = Object.freeze({
  wall: { name: 'FIREWALL', cost: 5, tier: 0, about: 'A BLOCK FOR THE MAZE · UPGRADES INTO A TOWER' },
  laser: { name: 'LASER NODE', from: 'wall', cost: 30, tier: 1, dmg: 16, rate: 0.75, range: 3.5, type: 'phys', air: 1, about: 'STEADY SINGLE SHOTS · GROUND AND AIR' },
  laser2: { name: 'HYPER NODE', from: 'laser', cost: 110, tier: 2, dmg: 58, rate: 0.55, range: 4, type: 'phys', air: 1, about: 'FAST, HEAVY SINGLE SHOTS · GROUND AND AIR' },
  cold: { name: 'COLD WALLET', from: 'wall', cost: 35, tier: 1, dmg: 6, rate: 1, range: 3, type: 'phys', air: 1, slow: [0.35, 2], about: 'FREEZES WHAT IT HITS: 35% SLOWER' },
  cold2: { name: 'COLD VAULT', from: 'cold', cost: 100, tier: 2, dmg: 20, rate: 0.9, range: 3.5, type: 'phys', air: 1, slow: [0.5, 2.5], slowSplash: 1.3, about: 'FREEZES EVERYTHING ROUND WHAT IT HITS: 50% SLOWER' },
  drop: { name: 'AIRDROP', from: 'wall', cost: 45, tier: 1, dmg: 20, rate: 1.5, range: 3.5, type: 'phys', air: false, splash: 1.2, about: 'CRATES THAT BURST ON A CROWD · GROUND ONLY' },
  drop2: { name: 'MEGADROP', from: 'drop', cost: 140, tier: 2, dmg: 64, rate: 1.4, range: 4, type: 'phys', air: false, splash: 1.6, about: 'BIG CRATES, BIG BURSTS · GROUND ONLY' },
  gas: { name: 'GAS SPIKE', from: 'wall', cost: 50, tier: 1, dmg: 15, rate: 1.2, range: 3.5, type: 'magic', air: 1, chain: [3, 0.8], about: 'LIGHTNING THAT JUMPS 3 TIMES · IGNORES ARMOUR' },
  gas2: { name: 'GAS STORM', from: 'gas', cost: 150, tier: 2, dmg: 40, rate: 1.1, range: 3.8, type: 'magic', air: 1, chain: [5, 0.85], about: 'LIGHTNING THAT JUMPS 5 TIMES · IGNORES ARMOUR' },
  oracle: { name: 'ORACLE', from: 'wall', cost: 40, tier: 1, dmg: 20, rate: 1, range: 4.5, type: 'magic', air: 2.5, reveal: true, about: 'SEES INVISIBLE CREEPS FOR EVERY TOWER · 2.5× ON FLYERS' },
  oracle2: { name: 'HIGH ORACLE', from: 'oracle', cost: 120, tier: 2, dmg: 64, rate: 0.9, range: 5.5, type: 'magic', air: 2.5, reveal: true, about: 'SEES FURTHER, HITS HARDER · 2.5× ON FLYERS' },
  valid: { name: 'VALIDATOR', from: 'wall', cost: 55, tier: 1, aura: { r: 2.5, dmg: 0.25, as: 0.15 }, about: 'TOWERS NEAR IT: +25% DAMAGE, +15% SPEED' },
  valid2: { name: 'VALIDATOR SET', from: 'valid', cost: 140, tier: 2, aura: { r: 3, dmg: 0.4, as: 0.25 }, about: 'TOWERS NEAR IT: +40% DAMAGE, +25% SPEED' },
});
export const TOWER_KINDS = Object.freeze(Object.keys(TOWERS));
/** What a tower can become next. */
export const upgradesOf = (kind) => TOWER_KINDS.filter((k) => TOWERS[k].from === kind);

// ---------------------------------------------------------------- the swarm
/**
 * The 30 waves, every lane getting its own: [name, look, how many a lane, hit points (× the wave's base), speed
 * (tiles a second), armour, traits]. Traits: F flies straight over the maze, I invisible (only an Oracle shows
 * it), A armoured, H heals those round it, S splits in two when it dies, Q quick, B boss (costs 5 lives; the last
 * one 10).
 */
export const WAVES = Object.freeze([
  ['CLONES', 'clone', 10, 1, 1.6, 0, ''],
  ['PAID SHILLERS', 'shiller', 10, 1.15, 1.6, 0, ''],
  ['FUD BOTS', 'fud', 12, 0.7, 2.4, 0, 'Q'],
  ['EXTRACTORS', 'extractor', 10, 1.2, 1.5, 4, 'A'],
  ['HYPE BALLOONS', 'mini', 10, 0.9, 1.4, 0, 'F'],
  ['CLONE ARMY', 'clone', 16, 0.9, 1.7, 0, ''],
  ['RUG PULLERS', 'rug', 10, 1.1, 1.6, 0, 'S'],
  ['FUD SWARM', 'fud', 14, 0.75, 2.5, 0, 'Q'],
  ['GHOST WALLETS', 'shiller', 10, 1, 1.6, 0, 'I'],
  ['THE INFLUENCER', 'influencer', 1, 20, 1.1, 4, 'B'],
  ['SHILL CHOIR', 'shiller', 12, 1.1, 1.6, 0, 'H'],
  ['IRON EXTRACTORS', 'extractor', 10, 1.3, 1.4, 10, 'A'],
  ['BOT FARM', 'mini', 14, 0.85, 1.5, 0, 'F'],
  ['RUG CASCADE', 'rug', 10, 1.2, 1.6, 0, 'S'],
  ['PHANTOM FUD', 'fud', 12, 0.8, 2.4, 0, 'IQ'],
  ['CLONE WALL', 'clone', 16, 1.1, 1.5, 8, 'A'],
  ['CHOIR OF RUGS', 'rug', 12, 1, 1.6, 0, 'SH'],
  ['NIGHT BALLOONS', 'mini', 12, 0.9, 1.5, 0, 'FI'],
  ['MEGA RUGS', 'rug', 10, 1.3, 1.5, 10, 'AS'],
  ['THE KOL', 'kol', 1, 24, 1.1, 10, 'B'],
  ['PUMP CREW', 'fud', 14, 0.9, 2.4, 0, 'QH'],
  ['VAULT CRACKERS', 'extractor', 12, 1.4, 1.4, 16, 'A'],
  ['SKY SHILLERS', 'mini', 14, 1, 1.6, 0, 'F'],
  ['GHOST ARMY', 'clone', 14, 1, 1.7, 0, 'I'],
  ['RUG STORM', 'rug', 14, 1, 2.2, 0, 'SQ'],
  ['IRON CHOIR', 'extractor', 16, 1.1, 1.5, 14, 'AH'],
  ['DARK BALLOONS', 'mini', 14, 1, 1.6, 0, 'FI'],
  ['TOTAL FUD', 'fud', 18, 0.9, 2.4, 0, 'QS'],
  ['THE LAST PUMP', 'shiller', 16, 1.2, 1.6, 12, 'AHI'],
  ['THE GRAND EXTRACTOR', 'extractor', 1, 36, 1.0, 16, 'B'],
]);
export const WAVES_TOTAL = WAVES.length;
/** What a splitter leaves: two of these, each with a share of its hit points. */
export const MINI = Object.freeze(['SPLINTER', 'mini', 0, 0.35, 1.15, 0, '']);
export const TRAITS = Object.freeze({ F: 'FLYING', I: 'INVISIBLE (NEEDS AN ORACLE)', A: 'ARMOURED', H: 'HEALS ITS FRIENDS', S: 'SPLITS IN TWO', Q: 'QUICK', B: 'BOSS' });
/** A creep's wave entry: waves are 1-30, 0 is a splinter. */
export const creepDef = (type) => (type ? WAVES[type - 1] : MINI);
/** Hit points of one ordinary creep on wave w. */
export const hpAt = (w) => Math.round(22 * Math.pow(1.16, w - 1) + 6 * w);
/** Gold for a kill, and for each wave (everyone). */
export const bounty = (w, type, boss) => (boss ? 25 + 3 * w : type ? 1 + Math.floor(w / 2) : 1);
export const waveIncome = (w) => 10 + 2 * w;
export const leakCost = (w, boss) => (boss ? (w >= WAVES_TOTAL ? ROUND.FINAL_LEAK : ROUND.BOSS_LEAK) : 1);
export const siegeReward = ({ reached, won }) => Math.max(0, Math.min(WAVES_TOTAL, Math.floor(reached) || 0)) * REWARD.WAVE + (won ? REWARD.WIN : 0);

// ---------------------------------------------------------------- the way through
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
/** Can a lane's creeps walk this cell (its lane or the Mixer, nothing built on it)? */
const open = (blocked, lane, x, y) => { if (!inField(x, y)) return false; const c = idx(x, y), z = ZONE[c]; return (z === lane || z === 4) && !blocked[c]; };
/**
 * How far every cell of a lane (and the Mixer) is from the Watcher, walking round what's built (8 ways, no cutting
 * a blocked corner): the creeps step to whichever neighbour is nearest. Infinity where there's no way.
 */
export function flowField(blocked, lane) {
  const N = GRID * GRID, dist = new Float64Array(N).fill(Infinity), done = new Uint8Array(N), heap = [];
  const push = (d, c) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= d) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= heap[i][0]) break; [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; } } return top; };
  for (const c of CORE_CELLS) { dist[c] = 0; push(0, c); }
  while (heap.length) {
    const [d, c] = pop();
    if (done[c]) continue;
    done[c] = 1;
    const cx = c % GRID, cy = (c - cx) / GRID;
    for (const [dx, dy, w] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!open(blocked, lane, nx, ny)) continue;
      if (dx && dy && (!open(blocked, lane, cx + dx, cy) || !open(blocked, lane, cx, cy + dy))) continue;
      const n = idx(nx, ny), nd = d + w;
      if (nd < dist[n] - 1e-9) { dist[n] = nd; push(nd, n); }
    }
  }
  return dist;
}
/** The best next cell from c on a lane's flow field (-1 at the Watcher or with no way on). */
export function nextCell(flow, blocked, lane, c) {
  if (flow[c] === 0) return -1;
  const cx = c % GRID, cy = (c - cx) / GRID;
  let best = -1, bd = Infinity;
  for (const [dx, dy, w] of DIRS) {
    const nx = cx + dx, ny = cy + dy;
    if (!open(blocked, lane, nx, ny)) continue;
    if (dx && dy && (!open(blocked, lane, cx + dx, cy) || !open(blocked, lane, cx, cy + dy))) continue;
    const n = idx(nx, ny), d = flow[n] + w;
    if (d < bd - 1e-9) { bd = d; best = n; }
  }
  return Number.isFinite(bd) ? best : -1;
}
/** A lane's way from its spawn to the Watcher as it is now (cells), or null if there's none. */
export function trace(flow, blocked, lane) {
  let c = idx(...SPAWNS[lane]);
  if (!Number.isFinite(flow[c])) return null;
  const out = [c];
  for (let i = 0; i < GRID * GRID && flow[c] > 0; i++) { c = nextCell(flow, blocked, lane, c); if (c < 0) break; out.push(c); }
  return out;
}
/** Which lanes have creeps coming down them (they had a player once the match started). */
export const openLanes = (lanes) => [0, 1, 2, 3].filter((i) => lanes[i] >= 0);
/** Would building on cell c leave every open lane a way through? Returns the new flow fields, or null. */
export function flowsWith(blocked, lanes, c = -1) {
  const b = c >= 0 ? blocked.slice() : blocked;
  if (c >= 0) b[c] = 1;
  const flows = [null, null, null, null];
  for (const i of openLanes(lanes)) {
    const f = flowField(b, i);
    if (!Number.isFinite(f[idx(...SPAWNS[i])])) return null;
    flows[i] = f;
  }
  return flows;
}
/** Can a block go here at all (in the field's building parts, not by the Watcher or a spawn, lane open)? */
export function buildSpot(lanes, x, y) {
  const z = zone(x, y);
  if (z < 0 || isCore(x, y) || keepClear(x, y)) return false;
  return z === 4 || lanes[z] >= 0;
}
/** May this player build (or change what's built) in this cell's lane: their own, the Mixer, or one nobody holds. */
export function mayBuild(lanes, pid, x, y) {
  const z = zone(x, y);
  return z === 4 || (z >= 0 && (lanes[z] === pid || lanes[z] === 0));
}

// ---------------------------------------------------------------- the match
/**
 * @typedef {{ kind: string, owner: number, kills: number, dmg: number, spent: number, cd: number, target: number, boost?: number, haste?: number }} Tower
 * @typedef {{ x: number, y: number, path: number[][] | null, orders: number[], dir: number[] | null, facing: number, moving: boolean }} Builder
 * @typedef {{ id: number, lane: number, gold: number, kills: number, dmg: number, spent: number, b: Builder }} SPlayer
 * @typedef {{ id: number, lane: number, type: number, wave: number, x: number, y: number, to: number, hp: number, max: number, ms: number,
 *   armor: number, flags: string, fly: boolean, boss: boolean, slow: number, slowUntil: number, healT: number, left: number }} Creep
 */
export function createGame(seed = 1) {
  return {
    seed, t: 0, started: false, wave: 0, next: ROUND.FIRST_WAVE, lives: ROUND.LIVES, maxLives: ROUND.LIVES,
    /** @type {Uint8Array} 1 where something's built. */ cells: new Uint8Array(GRID * GRID),
    /** @type {Map<number, Tower>} */ towers: new Map(),
    /** @type {Map<number, SPlayer>} */ players: new Map(),
    /** Each lane's player: -1 closed (nobody had it when the match began), 0 open with nobody holding it. */ lanes: [-1, -1, -1, -1],
    flows: [null, null, null, null], auras: true,
    /** @type {Creep[]} */ creeps: [], nextCreep: 1,
    /** Creeps still to come: [lane, wave, how many, seconds to the next]. */ spawning: [],
    events: [], over: false, won: false, kills: 0, leaks: 0, peak: 1,
  };
}
const reflow = (g) => { g.flows = flowsWith(g.cells, g.lanes) ?? g.flows; };
/** Where a lane's builder starts: in the middle of its lane. */
export function builderSpawn(lane) { const [x, y] = turn([20.5, 6.5], lane, GRID); return [x + FO, y + FO]; }
export function addPlayer(g, id) {
  if (g.players.has(id)) return g.players.get(id);
  const lane = LANE_ORDER.find((i) => g.lanes[i] === -1 || (g.lanes[i] === 0 && !g.started)) ?? LANE_ORDER.find((i) => g.lanes[i] === 0) ?? 0;
  const [bx, by] = builderSpawn(lane);
  // Joining late: as much gold as the team has on average, so a fresh lane can be built up.
  const others = [...g.players.values()], gold = g.started && others.length ? Math.round(others.reduce((s, p) => s + p.gold + p.spent, 0) / others.length) : ROUND.START_GOLD;
  const p = { id, lane, gold, kills: 0, dmg: 0, spent: 0, b: { x: bx, y: by, path: null, orders: [], dir: null, facing: 1, moving: false } };
  g.players.set(id, p);
  // A lane that opens after the start brings its creeps from the next wave, and the team gets its lives.
  if (g.started && g.lanes[lane] === -1) { g.lives += ROUND.LANE_LIVES; g.maxLives += ROUND.LANE_LIVES; }
  g.lanes[lane] = id;
  g.peak = Math.max(g.peak, g.players.size);
  reflow(g);
  return p;
}
/** Someone leaves: before the start their lane closes; after it, it stays open and becomes anyone's. */
export function removePlayer(g, id) {
  const p = g.players.get(id); if (!p) return;
  g.players.delete(id);
  if (g.lanes[p.lane] === id) g.lanes[p.lane] = g.started ? 0 : -1;
  for (const t of g.towers.values()) if (t.owner === id) t.owner = 0;
  reflow(g);
}
/** The match begins: lanes with nobody in them stay closed for good, and the team gets 10 more lives for each lane past the first. */
export function begin(g) {
  g.started = true;
  g.lives = g.maxLives = livesFor(openLanes(g.lanes).length);
  reflow(g);
}
export const livesFor = (lanes) => ROUND.LIVES + ROUND.LANE_LIVES * Math.max(0, lanes - 1);

const cellOf = (x, y) => idx(Math.floor(x), Math.floor(y));
const builderOn = (g, c) => [...g.players.values()].some((p) => cellOf(p.b.x - FO, p.b.y - FO) === c);
/** Is anything walking in (or into) this cell right now? */
const creepOn = (g, c) => g.creeps.some((k) => !k.fly && (cellOf(k.x, k.y) === c || k.to === c));
/** Why a block can't go at (x, y) now, or null if it can. */
export function whyNot(g, pid, x, y) {
  if (!buildSpot(g.lanes, x, y)) return 'NO_BUILD';
  if (!mayBuild(g.lanes, pid, x, y)) return 'NOT_YOUR_LANE';
  const c = idx(x, y);
  if (g.cells[c]) return 'TAKEN';
  if (builderOn(g, c) || creepOn(g, c)) return 'SOMEONE_THERE';
  const flows = flowsWith(g.cells, g.lanes, c);
  if (!flows) return 'BLOCKS';
  // Nobody already in the maze gets walled into a pocket.
  for (const k of g.creeps) if (!k.fly && k.hp > 0 && !Number.isFinite(flows[k.lane]?.[k.to >= 0 ? k.to : cellOf(k.x, k.y)] ?? Infinity)) return 'BLOCKS';
  return null;
}
/** Put a Firewall block down (the builder's there). True, or why not. */
export function buildWall(g, pid, x, y) {
  const p = g.players.get(pid); if (!p) return 'NOT_NOW';
  const why = whyNot(g, pid, x, y); if (why) return why;
  if (p.gold < TOWERS.wall.cost) return 'GOLD';
  const c = idx(x, y);
  p.gold -= TOWERS.wall.cost; p.spent += TOWERS.wall.cost;
  g.cells[c] = 1;
  g.towers.set(c, { kind: 'wall', owner: pid, kills: 0, dmg: 0, spent: TOWERS.wall.cost, cd: 0, target: 0 });
  reflow(g); g.auras = true;
  g.events.push(['build', c, pid]);
  return true;
}
/** May this player change the thing built on cell c (theirs, or one whose builder has left)? */
const mayChange = (g, pid, c) => { const t = g.towers.get(c); return !!t && (t.owner === pid || t.owner === 0 || !g.players.has(t.owner)); };
/** Turn a block or tower into the next kind (anywhere on the field: no walking). */
export function upgrade(g, pid, c, kind) {
  const p = g.players.get(pid), t = g.towers.get(c), def = TOWERS[kind];
  if (!p || !t || !def) return 'NOT_NOW';
  if (def.from !== t.kind) return 'NOT_NOW';
  if (!mayChange(g, pid, c)) return 'NOT_YOURS';
  if (p.gold < def.cost) return 'GOLD';
  p.gold -= def.cost; p.spent += def.cost; t.spent += def.cost;
  t.kind = kind; t.owner = pid; t.cd = 0;
  g.auras = true;
  g.events.push(['up', c, kind]);
  return true;
}
/** Sell what's on cell c for three quarters of what went into it. */
export function sell(g, pid, c) {
  const p = g.players.get(pid), t = g.towers.get(c);
  if (!p || !t) return 'NOT_NOW';
  if (!mayChange(g, pid, c)) return 'NOT_YOURS';
  const back = Math.floor(t.spent * ROUND.SELL);
  p.gold += back; p.spent = Math.max(0, p.spent - t.spent);
  g.towers.delete(c); g.cells[c] = 0;
  reflow(g); g.auras = true;
  g.events.push(['sold', c, back]);
  return true;
}
/** Hand some gold to a teammate. */
export function tip(g, pid, to, n) {
  const p = g.players.get(pid), q = g.players.get(to);
  if (!p || !q || p === q || !Number.isInteger(n) || n <= 0) return 'NOT_NOW';
  if (p.gold < n) return 'GOLD';
  p.gold -= n; q.gold += n;
  g.events.push(['tip', pid, to, n]);
  return true;
}
/** Bring the next wave now (once this one's all out). */
export function callWave(g) {
  if (!g.started || g.over || g.wave >= WAVES_TOTAL || g.spawning.length) return 'NOT_NOW';
  g.next = 0;
  return true;
}

/** The next wave comes: everyone's paid (and interest on their gold), and every open lane gets its creeps. */
export function startWave(g) {
  g.wave++;
  for (const p of g.players.values()) {
    const interest = Math.min(ROUND.INTEREST_MAX, Math.floor(p.gold * ROUND.INTEREST));
    p.gold += waveIncome(g.wave) + interest;
  }
  const [, , n] = WAVES[g.wave - 1];
  for (const lane of openLanes(g.lanes)) g.spawning.push([lane, g.wave, n, 0]);
  g.next = ROUND.WAVE_GAP;
  g.events.push(['wave', g.wave]);
}
function spawnCreep(g, lane, type, wave, x, y, hp) {
  const [, , , , ms, armor, flags] = creepDef(type);
  const boss = flags.includes('B');
  const c = {
    id: g.nextCreep++, lane, type, wave, x, y, to: -1, hp, max: hp, ms, armor: armor + (flags.includes('A') ? Math.floor(wave / 3) : 0),
    flags, fly: flags.includes('F'), boss, slow: 0, slowUntil: 0, healT: 1, left: 0,
  };
  g.creeps.push(c);
  return c;
}
function spawnFrom(g, lane, wave) {
  const [, , , hpMul] = WAVES[wave - 1], [sx, sy] = SPAWNS[lane];
  spawnCreep(g, lane, wave, wave, sx + 0.5, sy + 0.5, Math.round(hpAt(wave) * hpMul));
}

const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const center = (c) => [c % GRID + 0.5, Math.floor(c / GRID) + 0.5];
/** Validators' boosts, worked out whenever something's built, upgraded or sold. */
function workOutAuras(g) {
  const list = [...g.towers.entries()];
  const boosters = list.filter(([, t]) => TOWERS[t.kind].aura);
  for (const [c, t] of list) {
    let dmg = 0, as = 0;
    const [x, y] = center(c);
    for (const [bc, bt] of boosters) {
      if (bc === c) continue;
      const a = TOWERS[bt.kind].aura, [bx, by] = center(bc);
      if (dist2(x, y, bx, by) <= a.r * a.r) { dmg = Math.max(dmg, a.dmg); as = Math.max(as, a.as); }
    }
    t.boost = dmg; t.haste = as;
  }
  g.seers = list.filter(([, t]) => TOWERS[t.kind].reveal).map(([c, t]) => [...center(c), TOWERS[t.kind].range]);
  g.shooters = list.filter(([, t]) => TOWERS[t.kind].dmg).map(([c, t]) => [c, t, ...center(c)]);
  g.auras = false;
}
const seen = (g, k) => !k.flags.includes('I') || g.seers.some(([x, y, r]) => dist2(x, y, k.x, k.y) <= r * r);

/** One step of the match (seconds). */
export function stepGame(g, dt) {
  if (g.over) return;
  g.t += dt;
  if (!g.started) return;
  if (g.auras) workOutAuras(g);
  // The wave clock: it runs down faster once the field is clear.
  if (g.wave < WAVES_TOTAL) {
    if (g.wave > 0 && !g.spawning.length && !g.creeps.length) g.next = Math.min(g.next, ROUND.CLEAR_GAP);
    g.next -= dt;
    if (g.next <= 0) startWave(g);
  }
  // Spawning.
  for (const s of g.spawning) { s[3] -= dt; if (s[3] <= 0) { spawnFrom(g, s[0], s[1]); s[2]--; s[3] += ROUND.SPAWN_GAP; } }
  g.spawning = g.spawning.filter((s) => s[2] > 0);
  const T = g.t;
  // Healers.
  for (const k of g.creeps) {
    if (!k.flags.includes('H') || k.hp <= 0) continue;
    k.healT -= dt;
    if (k.healT > 0) continue;
    k.healT += 1;
    for (const o of g.creeps) if (o.hp > 0 && o.hp < o.max && dist2(o.x, o.y, k.x, k.y) <= 1.6 * 1.6) o.hp = Math.min(o.max, o.hp + o.max * 0.04);
    g.events.push(['heal', k.id]);
  }
  // Moving: flyers straight at the Watcher, walkers cell to cell down their lane's flow field.
  for (const k of g.creeps) {
    if (k.hp <= 0) continue;
    let step = k.ms * (k.slowUntil > T ? 1 - k.slow : 1) * dt;
    if (k.fly) {
      const dx = HEART[0] - k.x, dy = HEART[1] - k.y, d = Math.hypot(dx, dy);
      if (d <= step + 0.6) { leak(g, k); continue; }
      k.x += (dx / d) * step; k.y += (dy / d) * step; k.left = d;
      continue;
    }
    const flow = g.flows[k.lane]; if (!flow) continue;
    while (step > 0) {
      if (k.to < 0) {
        const here = cellOf(k.x, k.y);
        if (flow[here] === 0) { leak(g, k); break; }
        k.to = nextCell(flow, g.cells, k.lane, here);
        if (k.to < 0) break;
      }
      const [tx, ty] = center(k.to), d = Math.hypot(tx - k.x, ty - k.y);
      if (d <= step) { k.x = tx; k.y = ty; step -= d; k.to = -1; } else { k.x += ((tx - k.x) / d) * step; k.y += ((ty - k.y) / d) * step; step = 0; }
    }
    if (k.hp > 0) k.left = k.to >= 0 ? flow[k.to] + Math.hypot(center(k.to)[0] - k.x, center(k.to)[1] - k.y) : flow[cellOf(k.x, k.y)];
  }
  // Towers fire at the creep nearest the Watcher (keeping the one they had while it's still in reach).
  for (const [c, t, x, y] of g.shooters) {
    const s = TOWERS[t.kind];
    t.cd -= dt;
    if (t.cd > 0) continue;
    const r2 = s.range * s.range;
    let target = null;
    for (const k of g.creeps) {
      if (k.hp <= 0 || (k.fly && s.air === false) || dist2(x, y, k.x, k.y) > r2 || !seen(g, k)) continue;
      if (k.id === t.target) { target = k; break; }
      if (!target || k.left < target.left) target = k;
    }
    if (!target) { t.cd = 0.1; continue; }
    t.target = target.id;
    fire(g, c, t, s, target, T);
    t.cd = s.rate / (1 + (t.haste ?? 0));
  }
  g.creeps = g.creeps.filter((k) => k.hp > 0);
  if (g.lives <= 0) { g.over = true; g.won = false; g.events.push(['lost']); return; }
  if (g.wave >= WAVES_TOTAL && !g.spawning.length && !g.creeps.length) { g.over = true; g.won = true; g.events.push(['won']); }
}
function leak(g, k) {
  const loss = leakCost(k.wave, k.boss);
  k.hp = 0; g.leaks++;
  g.lives = Math.max(0, g.lives - loss);
  g.events.push(['leak', k.id, loss]);
}
function fire(g, c, t, s, k, T) {
  const dmg = s.dmg * (1 + (t.boost ?? 0));
  g.events.push(['hit', c, k.id]);
  if (s.chain) {
    // Lightning: from the target to the nearest it hasn't hit yet, weaker each jump.
    let from = k, d = dmg; const done = new Set();
    for (let j = 0; j <= s.chain[0]; j++) {
      done.add(from.id);
      hurt(g, from, d * (from.fly ? s.air : 1), s.type, t);
      let next = null, best = 2.4 * 2.4;
      for (const o of g.creeps) { if (o.hp <= 0 || done.has(o.id) || !seen(g, o)) continue; const dd = dist2(o.x, o.y, from.x, from.y); if (dd < best) { best = dd; next = o; } }
      if (!next) break;
      g.events.push(['zap', from.id, next.id]);
      from = next; d *= s.chain[1];
    }
    return;
  }
  if (s.splash) {
    g.events.push(['boom', Math.round(k.x * 10), Math.round(k.y * 10), Math.round(s.splash * 10)]);
    const r2 = s.splash * s.splash, kx = k.x, ky = k.y;
    for (const o of g.creeps) if (o.hp > 0 && !o.fly && dist2(o.x, o.y, kx, ky) <= r2) hurt(g, o, o === k ? dmg : dmg * 0.6, s.type, t);
    return;
  }
  if (s.slow) {
    const chill = (o) => { o.slow = Math.max(o.slowUntil > T ? o.slow : 0, s.slow[0]); o.slowUntil = T + s.slow[1]; };
    if (s.slowSplash) { const r2 = s.slowSplash ** 2; for (const o of g.creeps) if (o.hp > 0 && dist2(o.x, o.y, k.x, k.y) <= r2) chill(o); } else chill(k);
  }
  hurt(g, k, dmg * (k.fly ? s.air : 1), s.type, t);
}
/** Damage: physical through armour, magic straight in. A kill pays the creep's lane's player (or, with nobody there, the tower's). */
function hurt(g, k, dmg, type, t) {
  if (k.hp <= 0 || dmg <= 0) return;
  if (type === 'phys') dmg *= armorMult(k.armor);
  k.hp -= dmg;
  t.dmg += dmg;
  const owner = g.players.get(t.owner); if (owner) owner.dmg += dmg;
  if (k.hp > 0) return;
  g.kills++; t.kills++;
  if (owner) owner.kills++;
  const lane = g.lanes[k.lane], payee = (lane > 0 && g.players.get(lane)) || owner;
  const gold = bounty(k.wave, k.type, k.boss);
  if (payee) payee.gold += gold;
  g.events.push(['die', k.id, payee?.id ?? 0, gold]);
  // A splitter leaves two splinters where it fell.
  if (k.flags.includes('S')) for (let i = 0; i < 2; i++) {
    const m = spawnCreep(g, k.lane, 0, k.wave, k.x, k.y, Math.max(1, Math.round(k.max * MINI[3])));
    m.ms = k.ms * MINI[4]; m.to = k.to;
  }
}

// ---------------------------------------------------------------- builders
/**
 * Everyone's Pepe is a builder walking about the field (anywhere but through what's built, and never on the
 * Watcher), like SWARM GEMS. A block order sends it to the spot and the block goes down when it's there;
 * upgrades and sales happen from anywhere.
 */
export const BUILDER = Object.freeze({ SPEED: 3.4, RADIUS: 0.22, REACH: 1.6 });
export function walkable(g, wx, wy) {
  const fx = wx - FO, fy = wy - FO;
  if (fx < -RING || fy < -RING || fx >= GRID + RING || fy >= GRID + RING) return false;
  return !inField(fx, fy) || (!g.cells[idx(fx, fy)] && !isCore(fx, fy));
}
function freeAt(g, x, y, r = BUILDER.RADIUS) {
  return walkable(g, Math.floor(x - r), Math.floor(y - r)) && walkable(g, Math.floor(x + r), Math.floor(y - r))
    && walkable(g, Math.floor(x - r), Math.floor(y + r)) && walkable(g, Math.floor(x + r), Math.floor(y + r));
}
function walkTo(g, sx, sy, goal) {
  const W = WORLD, prev = new Int32Array(W * W).fill(-2), q = [sy * W + sx];
  prev[sy * W + sx] = -1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c - x) / W;
    if (goal(x, y)) { const out = []; for (let k = c; k !== -1; k = prev[k]) out.push([k % W, Math.floor(k / W)]); return out.reverse(); }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W || prev[ny * W + nx] !== -2 || !walkable(g, nx, ny)) continue;
      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;
      prev[ny * W + nx] = c; q.push(ny * W + nx);
    }
  }
  return null;
}
/** Queue a block at field cell (x, y) for this player's builder. True, or why not. */
export function orderBuild(g, pid, x, y) {
  const p = g.players.get(pid);
  if (!p || !g.started || g.over) return 'NOT_NOW';
  if (p.b.orders.length >= ROUND.ORDERS) return 'BUSY';
  const c = idx(x, y);
  const why = whyNot(g, pid, x, y); if (why) return why;
  for (const o of g.players.values()) if (o.b.orders.includes(c)) return 'TAKEN';
  const queued = p.b.orders.length * TOWERS.wall.cost;
  if (p.gold < queued + TOWERS.wall.cost) return 'GOLD';
  p.b.orders.push(c); p.b.dir = null;
  if (p.b.orders.length === 1) p.b.path = null;
  return true;
}
export function orderWalk(g, pid, wx, wy) {
  const p = g.players.get(pid); if (!p) return 'NOT_NOW';
  p.b.orders = []; p.b.dir = null;
  if (!walkable(g, wx, wy)) return 'BLOCKED';
  const path = walkTo(g, Math.floor(p.b.x), Math.floor(p.b.y), (x, y) => x === wx && y === wy);
  p.b.path = path ? path.slice(1) : null;
  return path ? true : 'BLOCKED';
}
export function steerBuilder(g, pid, sx, sy) {
  const p = g.players.get(pid); if (!p) return;
  sx = Math.sign(sx) || 0; sy = Math.sign(sy) || 0;
  const dx = sx + sy, dy = -sx + sy;
  p.b.orders = []; p.b.path = null; p.b.dir = dx || dy ? [dx, dy] : null;
}
export function stepBuilders(g, dt) {
  for (const p of g.players.values()) {
    const b = p.b; b.moving = false;
    if (b.orders.length) {
      const cell = b.orders[0], fx = cell % GRID, fy = Math.floor(cell / GRID), cx = fx + FO + 0.5, cy = fy + FO + 0.5;
      const onIt = Math.floor(b.x) === fx + FO && Math.floor(b.y) === fy + FO;
      if (!onIt && Math.hypot(b.x - cx, b.y - cy) <= BUILDER.REACH) {
        b.orders.shift(); b.path = null;
        const r = buildWall(g, p.id, fx, fy);
        if (r !== true) { g.events.push(['nobuild', p.id, cell, r]); if (r === 'GOLD') b.orders = []; }
        continue;
      }
      if (!b.path || !b.path.length) {
        const tx = fx + FO, ty = fy + FO;
        const path = walkTo(g, Math.floor(b.x), Math.floor(b.y), (x, y) => !(x === tx && y === ty) && Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= BUILDER.REACH);
        if (!path) { g.events.push(['nobuild', p.id, cell, 'NO_WAY']); b.orders.shift(); continue; }
        b.path = path.slice(1);
        if (!b.path.length) b.path = [[path[0][0], path[0][1]]];
      }
    }
    if (b.dir) {
      const l = Math.hypot(b.dir[0], b.dir[1]), vx = b.dir[0] / l, vy = b.dir[1] / l, step = BUILDER.SPEED * dt;
      if (freeAt(g, b.x + vx * step, b.y)) b.x += vx * step;
      if (freeAt(g, b.x, b.y + vy * step)) b.y += vy * step;
      b.moving = true;
      const sdx = vx - vy; if (Math.abs(sdx) > 0.01) b.facing = sdx < 0 ? -1 : 1;
      continue;
    }
    if (b.path && b.path.length) {
      let step = BUILDER.SPEED * dt;
      while (step > 0 && b.path.length) {
        const [tx, ty] = b.path[0];
        if (!walkable(g, tx, ty)) { b.path = null; break; }
        const gx = tx + 0.5, gy = ty + 0.5, d = Math.hypot(gx - b.x, gy - b.y);
        const sdx = (gx - b.x) - (gy - b.y); if (Math.abs(sdx) > 0.01) b.facing = sdx > 0 ? 1 : -1;
        if (d <= step) { b.x = gx; b.y = gy; b.path.shift(); step -= d; } else { b.x += ((gx - b.x) / d) * step; b.y += ((gy - b.y) / d) * step; step = 0; }
        b.moving = true;
      }
    }
  }
}
