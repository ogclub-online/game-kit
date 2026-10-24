// RUN PEPE RUN: a team dodging run. The rules, shared by the server (which runs the match and says who's hit) and
// the browser (which draws it).
//
// A track runs right round the Swarm Watcher: from the start corner, along the top, down the right, back along the
// bottom and up the left to the finish, which sits just past a stream from the start (so the only way there is the
// whole lap). The four stretches crawl with the swarm's cast, wandering about; the corners are safe. Touch one and
// you're down where you stand, in a glowing circle: any teammate who runs through it brings you back. One of you
// reaching the finish clears the level for everyone (the downed come back too); everyone down at once ends the run.
//
// The swarm's wandering is worked out from the level's seed, step by step, the same way here and in the browser
// (only sums, products and a small integer random number generator, no trigonometry, so every browser gets the
// same numbers): the browser can show every creep exactly where it is without the server sending them.

/** Field size (the town's), fixed steps (seconds), levels. */
export const WORLD = 64;
export const STEP = 0.05;
export const LEVELS = 12;
export const ROUND = Object.freeze({ MAX_PLAYERS: 8, LATE_JOIN_LEVEL: 3, SPEED: 3.4, RADIUS: 0.22, BODY: 0.25, REVIVE: 1.0, SAFE_STEPS: 30, BREAK_STEPS: 70, END_STEPS: 25 });
/** $SWARM: for each level cleared (even if the run ends), 80 more for all twelve, 2 a teammate brought back (up to 20). */
export const REWARD = Object.freeze({ LEVEL: 12, WIN: 80, SAVE: 2, MAX_SAVES: 20 });
export const runReward = ({ cleared, won, saves }) => Math.max(0, Math.min(LEVELS, cleared | 0)) * REWARD.LEVEL + (won ? REWARD.WIN : 0) + Math.min(REWARD.MAX_SAVES, Math.max(0, saves | 0)) * REWARD.SAVE;

// ---------------------------------------------------------------- the track
/** Rectangles [x0, y0, x1, y1) in world tiles. */
export const START = Object.freeze([6, 6, 13, 13]);
export const FINISH = Object.freeze([6, 15, 13, 22]);
/** The stream between the start and the finish (no crossing). */
export const STREAM = Object.freeze([6, 13, 13, 15]);
export const SAFE = Object.freeze([START, [51, 6, 58, 13], [51, 51, 58, 58], [6, 51, 13, 58]].map((r) => Object.freeze(r)));
/** The four stretches the swarm wanders, in running order: top, right, bottom, left. */
export const STRETCHES = Object.freeze([[13, 6, 51, 13], [51, 13, 58, 51], [13, 51, 51, 58], [6, 22, 13, 51]].map((r) => Object.freeze(r)));
export const STRETCH_NAMES = Object.freeze(['THE TOP', 'THE RIGHT', 'THE BOTTOM', 'THE LEFT']);
const inRect = ([x0, y0, x1, y1], x, y) => x >= x0 && y >= y0 && x < x1 && y < y1;
export const inStart = (x, y) => inRect(START, x, y);
export const inFinish = (x, y) => inRect(FINISH, x, y);
export const inSafe = (x, y) => SAFE.some((r) => inRect(r, x, y)) || inFinish(x, y);
const WALK = new Uint8Array(WORLD * WORLD);
for (let y = 0; y < WORLD; y++) for (let x = 0; x < WORLD; x++) {
  const c = x + 0.5, d = y + 0.5;
  WALK[y * WORLD + x] = inFinish(c, d) || SAFE.some((r) => inRect(r, c, d)) || STRETCHES.some((r) => inRect(r, c, d)) ? 1 : 0;
}
/** Can a Pepe stand on this tile? */
export const walkable = (tx, ty) => tx >= 0 && ty >= 0 && tx < WORLD && ty < WORLD && !!WALK[ty * WORLD + tx];
/** Does a body fit here (all four corners on the track)? */
export function freeAt(x, y, r = ROUND.RADIUS) {
  return walkable(Math.floor(x - r), Math.floor(y - r)) && walkable(Math.floor(x + r), Math.floor(y - r))
    && walkable(Math.floor(x - r), Math.floor(y + r)) && walkable(Math.floor(x + r), Math.floor(y + r));
}
/** Where player i stands at the start of a level. */
export function startSpot(i) { return [START[0] + 1.5 + (i % 4) * 1.3, START[1] + 1.5 + Math.floor(i / 4) % 4 * 1.3]; }

// ---------------------------------------------------------------- the swarm
/** Sixteen directions as plain numbers (so every browser walks them the same). */
const A = 0.9238795325112867, B = 0.3826834323650898, C = 0.7071067811865476;
export const DIRS16 = Object.freeze([[1, 0], [A, B], [C, C], [B, A], [0, 1], [-B, A], [-C, C], [-A, B], [-1, 0], [-A, -B], [-C, -C], [-B, -A], [0, -1], [B, -A], [C, -C], [A, -B]]);
/** A small random number generator (whole numbers, the same everywhere). */
export function rng32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
}
/** The three kinds: [name, look, radius, speed (× the level's)]. */
export const KINDS = Object.freeze([['FUD BOT', 'fud', 0.4, 1], ['RUG PULLER', 'rug', 0.32, 1.55], ['EXTRACTOR', 'extractor', 0.85, 0.6]]);
/** How many of each kind on a full-length stretch at level L, and the level's base speed (tiles a second). */
export function levelMix(L) {
  return { counts: [4 + 2 * L, L >= 3 ? L - 1 : 0, L >= 5 ? Math.floor((L - 2) / 2) : 0], speed: 1.3 + 0.15 * L };
}
/** The same generator with its state kept on the swarm (so a swarm can be copied and replayed). */
function nextRand(sw) {
  sw.r = (sw.r + 0x6d2b79f5) >>> 0; let t = sw.r;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
/**
 * The swarm at the start of level L: every creep's place, heading and when it next turns. `fx` are the skills
 * that hit it (roots, frost, shoves, traps), by the step they land on, so the browser can replay them too.
 */
export function createSwarm(seed, L) {
  const sw = { r: (seed ^ Math.imul(L, 0x9e3779b1)) >>> 0, creeps: [], step: 0, fx: new Map(), traps: [] }, { counts, speed } = levelMix(L);
  STRETCHES.forEach(([x0, y0, x1, y1], si) => {
    const len = Math.max(x1 - x0, y1 - y0), share = len / 38;
    counts.forEach((n0, kind) => {
      const [, , r, mul] = KINDS[kind], n = Math.round(n0 * share), s = speed * mul;
      for (let i = 0; i < n; i++) {
        const lo = [x0 + r + 0.1, y0 + r + 0.1], hi = [x1 - r - 0.1, y1 - r - 0.1];
        const x = lo[0] + ((nextRand(sw) % 10000) / 10000) * (hi[0] - lo[0]), y = lo[1] + ((nextRand(sw) % 10000) / 10000) * (hi[1] - lo[1]);
        const [dx, dy] = DIRS16[nextRand(sw) % 16];
        sw.creeps.push({ kind, si, r, s, x, y, vx: dx * s, vy: dy * s, turn: 10 + (nextRand(sw) % 50), lo, hi, rootUntil: 0, slowUntil: 0 });
      }
    });
  });
  return sw;
}
/** A copy of the swarm's state (to go back to; the effects list is shared). */
export function copySwarm(sw) {
  return { r: sw.r, step: sw.step, fx: sw.fx, traps: sw.traps.map((t) => ({ ...t })), creeps: sw.creeps.map((c) => ({ ...c })) };
}
/**
 * A skill hitting the swarm, landing as it goes from step `at` to the next: [at, kind, x, y, a, b].
 * root: the creep nearest (x, y) within a tiles stops for b steps. frost: all within a are half speed for b steps.
 * shove: all within a are pushed b tiles straight away from (x, y). trap: a snare at (x, y) for a steps; the first
 * creep onto it is held for b steps.
 */
export function addEffect(sw, e) { const l = sw.fx.get(e[0]) ?? []; l.push(e); sw.fx.set(e[0], l); }
function applyEffect(sw, [, kind, x, y, a, b]) {
  const near = (c, r) => (c.x - x) ** 2 + (c.y - y) ** 2 <= (r + c.r) * (r + c.r);
  if (kind === 'root') {
    let best = null, bd = Infinity;
    for (const c of sw.creeps) { const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd && near(c, a)) { bd = d; best = c; } }
    if (best) best.rootUntil = sw.step + b;
  } else if (kind === 'frost') { for (const c of sw.creeps) if (near(c, a)) c.slowUntil = sw.step + b; }
  else if (kind === 'shove') {
    for (const c of sw.creeps) {
      if (!near(c, a)) continue;
      const dx = c.x - x, dy = c.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      c.x = Math.min(c.hi[0], Math.max(c.lo[0], c.x + (dx / d) * b)); c.y = Math.min(c.hi[1], Math.max(c.lo[1], c.y + (dy / d) * b));
    }
  } else if (kind === 'trap') sw.traps.push({ x, y, until: sw.step + a, hold: b });
}
/** One step of the swarm: skills landing now, then each creep wanders (unless held), now and then turns, and bounces off its stretch's sides. */
export function stepSwarm(sw) {
  for (const e of sw.fx.get(sw.step) ?? []) applyEffect(sw, e);
  sw.traps = sw.traps.filter((t) => t.until > sw.step);
  for (const c of sw.creeps) {
    if (--c.turn <= 0) { const [dx, dy] = DIRS16[nextRand(sw) % 16]; c.vx = dx * c.s; c.vy = dy * c.s; c.turn = 20 + (nextRand(sw) % 40); }
    if (c.rootUntil > sw.step) continue;
    const f = c.slowUntil > sw.step ? 0.5 : 1;
    c.x += c.vx * STEP * f; c.y += c.vy * STEP * f;
    if (c.x < c.lo[0]) { c.x = 2 * c.lo[0] - c.x; c.vx = -c.vx; } else if (c.x > c.hi[0]) { c.x = 2 * c.hi[0] - c.x; c.vx = -c.vx; }
    if (c.y < c.lo[1]) { c.y = 2 * c.lo[1] - c.y; c.vy = -c.vy; } else if (c.y > c.hi[1]) { c.y = 2 * c.hi[1] - c.y; c.vy = -c.vy; }
    for (const t of sw.traps) if (t.until > sw.step && (c.x - t.x) ** 2 + (c.y - t.y) ** 2 < (0.5 + c.r) ** 2) { c.rootUntil = sw.step + t.hold; t.until = 0; break; }
  }
  sw.step++;
}
/** Is a Pepe at (x, y) touching any of the swarm? */
export function touching(sw, x, y) {
  for (const c of sw.creeps) { const d = c.r + ROUND.BODY - 0.03; if ((c.x - x) ** 2 + (c.y - y) ** 2 < d * d) return true; }
  return false;
}

// ---------------------------------------------------------------- Pepe levels, skills and items
/**
 * XP (for the run): the tome on the finish square (whoever's first there), clearing a level (everyone), tomes lying
 * on the track, and bringing teammates back. Every Pepe level is a skill point: learn up to four of the eight skills,
 * each up to rank 3.
 */
export const XP = Object.freeze({ FINISH: 60, CLEAR: 60, TOME: 40, SAVE: 25 });
/** XP from one level to the next (level 1 to 2 takes 60, one cleared level; then 40 more each time). */
export const xpToNext = (lvl) => 60 + 40 * (lvl - 1);
export const MAX_SKILLS = 4, MAX_RANK = 3;
/**
 * Seconds by rank. Actives have a cooldown; passives (no cd) just are. Four hold the swarm off (they're played back in
 * every browser from the step they land on); four are for you and your team.
 */
export const SKILLS = Object.freeze({
  root: { name: 'ROOT', cd: [10, 9, 8], range: 3, hold: [1.5, 2, 2.5], about: 'THE NEAREST OF THE SWARM (WITHIN 3 TILES) CAN\'T MOVE FOR A MOMENT' },
  frost: { name: 'FROST NOVA', cd: [16, 14, 12], r: 2.5, dur: [2, 2.5, 3], about: 'THE SWARM AROUND YOU MOVES AT HALF SPEED' },
  shove: { name: 'SHOVE', cd: [14, 12, 10], r: [2, 2.5, 3], push: 2, about: 'KNOCKS THE SWARM AROUND YOU 2 TILES AWAY' },
  trap: { name: 'SNARE', cd: [15, 13, 11], hold: [2, 3, 4], life: 20, about: 'A SNARE AT YOUR FEET: THE FIRST OF THE SWARM ONTO IT IS HELD' },
  blink: { name: 'BLINK', cd: [12, 10, 8], dist: [3, 3.5, 4], about: 'BLINK 3 TO 4 TILES THE WAY YOU\'RE GOING' },
  sprint: { name: 'SPRINT', cd: [15, 13, 11], mult: [1.35, 1.45, 1.55], dur: 2, about: 'FASTER FOR 2 SECONDS' },
  feet: { name: 'QUICK FEET', mult: [1.04, 1.08, 1.12], about: 'ALWAYS A LITTLE FASTER' },
  lifeline: { name: 'LIFELINE', reach: [1.4, 1.8, 2.2], about: 'BRING TEAMMATES BACK FROM A LITTLE FURTHER AWAY' },
});
export const SKILL_KEYS = Object.freeze(Object.keys(SKILLS));
export const isActive = (k) => !!SKILLS[k]?.cd;
/** Things lying on the track: the XP tome (picked up at once) and the inventory items (six slots). `w` is how often each turns up. */
export const ITEMS = Object.freeze({
  sneakers: { name: 'SWIFT SNEAKERS', w: 3, about: '8% FASTER' },
  feather: { name: 'BLINK FEATHER', w: 3, use: true, charges: 2, about: 'USE: BLINK 3 TILES AHEAD · 2 CHARGES' },
  wand: { name: 'ROOT WAND', w: 3, use: true, charges: 3, about: 'USE: ROOT THE NEAREST OF THE SWARM FOR 2 SECONDS · 3 CHARGES' },
  orb: { name: 'FROST ORB', w: 2, use: true, about: 'USE: THE SWARM AROUND YOU AT HALF SPEED FOR 3 SECONDS' },
  magnet: { name: 'MAGNET', w: 2, about: 'PICK THINGS UP FROM 2.5 TILES AWAY' },
  clover: { name: 'LUCKY CLOVER', w: 2, about: '25% MORE XP' },
  charm: { name: 'SHIELD CHARM', w: 1, about: 'TAKES ONE HIT FOR YOU, THEN BREAKS' },
  flare: { name: 'RESCUE FLARE', w: 1, use: true, about: 'USE: BRINGS BACK DOWNED TEAMMATES WITHIN 4 TILES' },
});
export const ITEM_KINDS = Object.freeze(Object.keys(ITEMS));
export const SLOTS = 6;
const has = (p, kind) => p.inv.reduce((n, it) => n + (it && it[0] === kind ? 1 : 0), 0);
/** A Pepe's speed (tiles a second) right now: quick feet, sneakers, a sprint. */
export function speedOf(p, step) {
  const feet = p.skills.feet ? SKILLS.feet.mult[p.skills.feet - 1] : 1, sprint = p.sprintUntil > step && p.skills.sprint ? SKILLS.sprint.mult[p.skills.sprint - 1] : 1;
  return ROUND.SPEED * Math.min(1.8, feet * Math.pow(1.08, has(p, 'sneakers')) * sprint);
}
/** Can the swarm touch this Pepe right now (not just back on their feet)? */
const touchable = (g, p) => p.safeUntil <= g.step;

// ---------------------------------------------------------------- the match
/**
 * @typedef {{ id: number, x: number, y: number, alive: boolean, dir: number[] | null, goal: number[] | null, facing: number, moving: boolean,
 *   safeUntil: number, saves: number, downs: number, xp: number, lvl: number, points: number, skills: Record<string, number>, order: string[],
 *   ready: Record<string, number>, inv: ([string, number] | null)[], sprintUntil: number, lastV: number[], me: boolean }} RPlayer
 */
export function createGame(seed = 1) {
  return {
    seed, step: 0, started: false, level: 0, levelAt: 0, /** Steps of the break before the next level (or the end). */ pause: 0,
    swarm: null, /** @type {Map<number, RPlayer>} */ players: new Map(), cleared: 0, over: false, won: false, events: [], peak: 1, slot: 0,
    /** Things lying on the track: [id, kind ('tome' or an item), x, y]. */ items: [], nextItem: 1,
    /** This level's skills on the swarm, as sent (for anyone who joins or comes back mid-level). */ fx: [],
  };
}
export function addPlayer(g, id) {
  if (g.players.has(id)) return g.players.get(id);
  const [x, y] = startSpot(g.slot++);
  const p = {
    id, x, y, alive: true, dir: null, goal: null, facing: 1, moving: false, safeUntil: g.step + ROUND.SAFE_STEPS, saves: 0, downs: 0,
    xp: 0, lvl: 1, points: 0, skills: {}, order: [], ready: {}, inv: Array(SLOTS).fill(null), sprintUntil: 0, lastV: [1, 0], me: true,
  };
  g.players.set(id, p);
  g.peak = Math.max(g.peak, g.players.size);
  return p;
}
export function removePlayer(g, id) { g.players.delete(id); }
/** Things for the track this level: tomes and items in the stretches (where it's dangerous to fetch them). */
function scatter(g, L) {
  const rand = rng32((g.seed ^ Math.imul(L + 101, 0x85ebca6b)) >>> 0), total = ITEM_KINDS.reduce((n, k) => n + ITEMS[k].w, 0);
  g.items = [];
  const put = (kind) => {
    const [x0, y0, x1, y1] = STRETCHES[rand() % 4];
    g.items.push([g.nextItem++, kind, x0 + 1 + ((rand() % 1000) / 1000) * (x1 - x0 - 2), y0 + 1 + ((rand() % 1000) / 1000) * (y1 - y0 - 2)]);
  };
  for (let i = 0; i < 3; i++) put('tome');
  for (let i = 0; i < 2 + (L % 2); i++) { let r = rand() % total, k = 0; while (r >= ITEMS[ITEM_KINDS[k]].w) r -= ITEMS[ITEM_KINDS[k++]].w; put(ITEM_KINDS[k]); }
  g.events.push(['items']);
}
/** A level begins: everyone back on their feet at the start, a new swarm, new things on the track. */
export function beginLevel(g, L) {
  g.level = L; g.levelAt = g.step; g.pause = 0; g.started = true; g.fx = [];
  g.swarm = createSwarm(g.seed, L);
  let i = 0;
  for (const p of g.players.values()) { [p.x, p.y] = startSpot(i++); p.alive = true; p.dir = null; p.goal = null; p.safeUntil = g.step + ROUND.SAFE_STEPS; p.sprintUntil = 0; p.me = true; }
  scatter(g, L);
  g.events.push(['level', L]);
}
/** XP in (a clover adds a quarter); every level up is a skill point. */
export function giveXp(g, p, n) {
  const got = Math.round(n * (has(p, 'clover') ? 1.25 : 1));
  p.xp += got;
  g.events.push(['xp', p.id, got]);
  while (p.xp >= xpToNext(p.lvl)) { p.xp -= xpToNext(p.lvl); p.lvl++; p.points++; g.events.push(['lvl', p.id, p.lvl]); }
  p.me = true;
}
/** Spend a skill point: learn a new skill (up to four) or rank one up (to 3). */
export function learn(g, pid, k) {
  const p = g.players.get(pid);
  if (!p || !SKILLS[k] || p.points <= 0) return 'NOT_NOW';
  const r = p.skills[k] ?? 0;
  if (r >= MAX_RANK) return 'MAX_RANK';
  if (!r && p.order.length >= MAX_SKILLS) return 'FOUR_SKILLS';
  p.skills[k] = r + 1; p.points--;
  if (!r) { p.order.push(k); p.ready[k] = 0; }
  p.me = true;
  return true;
}
/** Which way you're going (or were last going). */
function heading(p) {
  let vx = p.lastV[0], vy = p.lastV[1];
  if (p.dir) { const l = Math.hypot(p.dir[0], p.dir[1]); vx = p.dir[0] / l; vy = p.dir[1] / l; }
  else if (p.goal) { const dx = p.goal[0] - p.x, dy = p.goal[1] - p.y, l = Math.hypot(dx, dy); if (l > 0.05) { vx = dx / l; vy = dy / l; } }
  return [vx, vy];
}
/** Blink d tiles the way you're going, stopping at the track's edge. Where you land goes to everyone. */
function blink(g, p, d) {
  const [vx, vy] = heading(p);
  let x = p.x, y = p.y;
  for (let i = 0; i < 24; i++) { const nx = x + (vx * d) / 24, ny = y + (vy * d) / 24; if (freeAt(nx, y)) x = nx; if (freeAt(x, ny)) y = ny; }
  g.events.push(['tp', p.id, Math.round(p.x * 10), Math.round(p.y * 10), Math.round(x * 10), Math.round(y * 10)]);
  p.x = x; p.y = y; p.goal = null;
}
/** A skill on the swarm, landing on the swarm's next step: kept, and sent to everyone to play back. */
function onSwarm(g, kind, p, a, b) {
  const e = [g.swarm.step, kind, p.x, p.y, a, b];
  addEffect(g.swarm, e); g.fx.push(e);
  g.events.push(['sfx', ...e]);
}
const steps = (secs) => Math.round(secs / STEP);
function revive(g, by, q) {
  q.alive = true; q.safeUntil = g.step + ROUND.SAFE_STEPS; by.saves++;
  giveXp(g, by, XP.SAVE);
  g.events.push(['save', by.id, q.id]);
}
/** Use a learned skill (slot 0-3, in the order learned). */
export function cast(g, pid, i) {
  const p = g.players.get(pid), k = p?.order[i];
  if (!p || !k || !p.alive || !g.started || g.pause || g.over) return 'NOT_NOW';
  const s = SKILLS[k], r = p.skills[k] - 1;
  if (!s.cd) return 'PASSIVE';
  if ((p.ready[k] ?? 0) > g.step) return 'COOLDOWN';
  if (k === 'root') onSwarm(g, 'root', p, s.range, steps(s.hold[r]));
  else if (k === 'frost') onSwarm(g, 'frost', p, s.r, steps(s.dur[r]));
  else if (k === 'shove') onSwarm(g, 'shove', p, s.r[r], s.push);
  else if (k === 'trap') onSwarm(g, 'trap', p, steps(s.life), steps(s.hold[r]));
  else if (k === 'blink') blink(g, p, s.dist[r]);
  else if (k === 'sprint') p.sprintUntil = g.step + steps(s.dur);
  p.ready[k] = g.step + steps(s.cd[r]);
  g.events.push(['cast', p.id, k]);
  p.me = true;
  return true;
}
/** Use what's in an inventory slot (0-5). */
export function useItem(g, pid, i) {
  const p = g.players.get(pid), it = p?.inv[i];
  if (!p || !it || !p.alive || !g.started || g.pause || g.over) return 'NOT_NOW';
  if (!ITEMS[it[0]].use) return 'PASSIVE';
  if (it[0] === 'feather') blink(g, p, 3);
  else if (it[0] === 'wand') onSwarm(g, 'root', p, 3, steps(2));
  else if (it[0] === 'orb') onSwarm(g, 'frost', p, 2.5, steps(3));
  else if (it[0] === 'flare') { for (const q of g.players.values()) if (!q.alive && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= 16) revive(g, p, q); }
  g.events.push(['use', p.id, it[0]]);
  if (--it[1] <= 0) p.inv[i] = null;
  p.me = true;
  return true;
}
/** Keys held, in screen terms (W up the screen), turned into the iso world as everywhere else. */
export function steer(g, pid, sx, sy) {
  const p = g.players.get(pid); if (!p) return;
  sx = Math.sign(sx) || 0; sy = Math.sign(sy) || 0;
  const dx = sx + sy, dy = -sx + sy;
  p.goal = null; p.dir = dx || dy ? [dx, dy] : null;
}
/** Head for a spot (a click): straight there, sliding along the track's edges. */
export function walkTo(g, pid, x, y) { const p = g.players.get(pid); if (!p) return; p.dir = null; p.goal = [x + 0.5, y + 0.5]; }
function move(g, p) {
  p.moving = false;
  if (!p.alive) return;
  let vx = 0, vy = 0;
  const speed = speedOf(p, g.step);
  if (p.dir) { const l = Math.hypot(p.dir[0], p.dir[1]); vx = p.dir[0] / l; vy = p.dir[1] / l; }
  else if (p.goal) {
    const dx = p.goal[0] - p.x, dy = p.goal[1] - p.y, d = Math.hypot(dx, dy);
    if (d < 0.05) { p.goal = null; return; }
    const f = Math.min(1, d / (speed * STEP)); vx = (dx / d) * f; vy = (dy / d) * f;
  } else return;
  const step = speed * STEP, ox = p.x, oy = p.y;
  if (freeAt(p.x + vx * step, p.y)) p.x += vx * step;
  if (freeAt(p.x, p.y + vy * step)) p.y += vy * step;
  if (p.goal && p.x === ox && p.y === oy) p.goal = null; // stuck on an edge
  p.moving = p.x !== ox || p.y !== oy;
  if (p.moving) { const l = Math.hypot(vx, vy); p.lastV = [vx / l, vy / l]; }
  const sdx = vx - vy; if (Math.abs(sdx) > 0.01) p.facing = sdx < 0 ? -1 : 1;
}
/** Walking over things on the track picks them up (a magnet from further): tomes at once, items into a free slot. */
function pickUp(g, p) {
  const reach = has(p, 'magnet') ? 2.5 : 0.8;
  for (const it of [...g.items]) {
    const [id, kind, x, y] = it;
    if ((x - p.x) ** 2 + (y - p.y) ** 2 > reach * reach) continue;
    if (kind === 'tome') giveXp(g, p, XP.TOME);
    else {
      const slot = p.inv.indexOf(null); if (slot < 0) continue;
      p.inv[slot] = [kind, ITEMS[kind].charges ?? 1];
    }
    g.items = g.items.filter((x2) => x2 !== it);
    g.events.push(['pick', p.id, id, kind]);
    p.me = true;
  }
}
/** Touched: a shield charm takes the hit if there is one (and breaks); otherwise down. */
function hit(g, p) {
  const c = p.inv.findIndex((it) => it && it[0] === 'charm');
  if (c >= 0) { p.inv[c] = null; p.safeUntil = g.step + 20; g.events.push(['block', p.id]); p.me = true; return; }
  p.alive = false; p.downs++; p.dir = null; p.goal = null; p.sprintUntil = 0;
  g.events.push(['down', p.id, Math.round(p.x * 10), Math.round(p.y * 10)]);
}
/** One step: everyone moves, the swarm wanders, who's touched goes down, runs through a circle bring them back, the finish clears the level. */
export function stepGame(g) {
  if (g.over) return;
  g.step++;
  if (!g.started) { for (const p of g.players.values()) move(g, p); return; }
  if (g.pause > 0) {
    // The break between levels (or before the end): the swarm still wanders, nobody's touched.
    stepSwarm(g.swarm);
    if (--g.pause === 0) { if (g.won || !alive(g).length) { g.over = true; g.events.push([g.won ? 'won' : 'lost']); } else beginLevel(g, g.level + 1); }
    return;
  }
  for (const p of g.players.values()) {
    move(g, p);
    if (p.alive) pickUp(g, p);
    if (p.sprintUntil === g.step) p.me = true;
  }
  stepSwarm(g.swarm);
  for (const p of alive(g)) if (touchable(g, p) && !inSafe(p.x, p.y) && touching(g.swarm, p.x, p.y)) hit(g, p);
  for (const p of alive(g)) {
    const reach = p.skills.lifeline ? SKILLS.lifeline.reach[p.skills.lifeline - 1] : ROUND.REVIVE;
    for (const q of g.players.values()) if (!q.alive && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= reach * reach) revive(g, p, q);
  }
  if (g.players.size && !alive(g).length) { g.pause = ROUND.END_STEPS; g.events.push(['wipe', g.level]); return; }
  const first = alive(g).find((p) => inFinish(p.x, p.y));
  if (first) {
    g.cleared = g.level;
    g.events.push(['clear', g.level, first.id]);
    // The tome on the finish square is the first one's; everyone gets a little for the level.
    giveXp(g, first, XP.FINISH);
    for (const p of g.players.values()) giveXp(g, p, XP.CLEAR);
    if (g.level >= LEVELS) g.won = true;
    for (const p of g.players.values()) { if (!p.alive) { p.alive = true; } p.safeUntil = g.step + ROUND.BREAK_STEPS + 1; p.dir = null; p.goal = null; }
    g.pause = g.won ? ROUND.END_STEPS : ROUND.BREAK_STEPS;
  }
}
export const alive = (g) => [...g.players.values()].filter((p) => p.alive);
/** What a player's own panel shows: XP, level, points, skills (rank, steps till ready), inventory, speed (%), sprint left, at server step s. */
export function mine(g, p) {
  return {
    xp: p.xp, need: xpToNext(p.lvl), lvl: p.lvl, pts: p.points, sk: p.order.map((k) => [k, p.skills[k], Math.max(0, (p.ready[k] ?? 0) - g.step)]),
    inv: p.inv, spd: Math.round((speedOf(p, g.step) / ROUND.SPEED) * 100), sprint: Math.max(0, p.sprintUntil - g.step), s: g.step,
  };
}
