// RUN PEPE RUN: one team dodging run, run here (rules.js has the rules). Up to eight Pepes run laps of the
// track round the Watcher; the server moves everyone, steps the swarm (the browser steps the same swarm from the
// level's seed, so it's never sent), and says who's down, who's back and when a level's cleared.
//
// Solo starts after a few seconds; co-op waits for friends (whoever started it can go sooner) and takes late joiners
// until level 3. Someone who drops out stays where they are until they're back.
import { createGame, addPlayer, removePlayer, beginLevel, stepGame, steer, walkTo, runReward, learn, cast, useItem, mine, ROUND, LEVELS, STEP, WORLD, SKILLS } from './rules.js';
import { COOP_COUNTDOWN, sendAll } from '../../engine/world.js';

/** A player's run for the record: levels cleared, teammates brought back, times down. */
export const RUN_SOLO_COUNTDOWN = 3;
export const RUN_RESULTS = 12;
/** Everyone's position goes out this often (ticks of 50 ms). */
const STATE_EVERY = 2;

export class Round {
  game = 'runpepe';
  mode;
  id;
  hostPepe;
  host;
  hooks;
  g;
  state = 'countdown';
  startsAt;
  endedAt = 0;
  t = 0;
  now = 0;
  ticks = 0;
  acc = 0;
  seats = new Map();
  pend = [];

  constructor(id, mode, host, hooks, now, seed = (Math.random() * 2 ** 31) | 0) {
    this.id = id; this.mode = mode === 'coop' ? 'coop' : 'solo'; this.hooks = hooks; this.hostPepe = host.pepeId; this.host = host.id;
    this.g = createGame(seed);
    this.now = now;
    this.startsAt = now + (this.mode === 'solo' ? RUN_SOLO_COUNTDOWN : COOP_COUNTDOWN) * 1000;
    this.add(host);
  }

  // ---------------------------------------------------------------- players
  get players() { return [...this.seats.values()].map((s) => s.p); }
  get size() { return this.seats.size; }
  has(p) { return this.seats.has(p.id); }
  canJoin() {
    if (this.mode !== 'coop' || this.size >= ROUND.MAX_PLAYERS || this.state === 'ended' || this.g.over) return false;
    return this.state === 'countdown' || this.g.level < ROUND.LATE_JOIN_LEVEL;
  }
  listing(now) {
    return [this.id, this.mode, this.size, this.state, this.state === 'countdown' ? Math.max(0, this.startsAt - now) : this.g.level, this.hostPepe, this.canJoin() ? 1 : 0, this.game];
  }
  add(p, _skin = '') {
    this.seats.set(p.id, { p, offline: false });
    addPlayer(this.g, p.id);
    p.arena = this;
    p.path = []; p.dir = [0, 0]; p.task = null; p.gather = null;
    p.conn.send(this.welcome(p));
    this.broadcast(this.roster(), p);
    this.hooks.changed(this);
  }
  remove(p) {
    const seat = this.seats.get(p.id); if (!seat) return;
    // Leaving part way still pays for the levels cleared.
    if (this.state === 'running' && this.g.cleared > 0) this.hooks.record([this.result(seat)]);
    this.seats.delete(p.id);
    if ((p.arena) === this) p.arena = null;
    removePlayer(this.g, p.id);
    if (this.host === p.id && this.seats.size) this.host = [...this.seats.keys()][0];
    this.broadcast(this.roster());
    this.hooks.changed(this);
  }
  goOffline(p) { const s = this.seats.get(p.id); if (!s) return; s.offline = true; const pl = this.g.players.get(p.id); if (pl) { pl.dir = null; pl.goal = null; } this.broadcast(this.roster()); this.hooks.changed(this); }
  rejoin(p, now) {
    const s = this.seats.get(p.id); if (!s) return false;
    s.offline = false; this.now = now;
    p.conn.send({ ...this.welcome(p), rejoined: 1 });
    this.broadcast(this.roster(), p);
    return true;
  }
  swarmNuke(_name) { /* the track is its own world */ }
  /** Test and admin levers: end it, skip the results, jump to a level. */
  poke(what, v = 0) {
    if (what === 'end') { this.g.over = true; this.g.won = false; }
    else if (what === 'over') this.endedAt = 1;
    else if (what === 't' && this.g.started) beginLevel(this.g, Math.max(1, Math.min(LEVELS, v)));
  }
  /** [player id, character, offline]. */
  roster() { return { t: 'rproster', r: [...this.seats.values()].map((s) => [s.p.id, s.p.pepeId, s.offline ? 1 : 0]), host: this.host }; }
  broadcast(msg, except) { sendAll(this.players, msg, except); }

  // ---------------------------------------------------------------- what everyone sees
  /** Everyone: [id, x, y (tenths), flags (1 up, 2 moving, 4 can't be touched yet, 8 sprinting), facing, saves, downs, Pepe level]. */
  people() {
    const g = this.g;
    return [...g.players.values()].flatMap((p) => [p.id, Math.round(p.x * 10), Math.round(p.y * 10), (p.alive ? 1 : 0) | (p.moving ? 2 : 0) | (p.safeUntil > g.step ? 4 : 0) | (p.sprintUntil > g.step ? 8 : 0), p.facing, p.saves, p.downs, p.lvl]);
  }
  /** Each player's own XP, skills, cooldowns and inventory, whenever they change. */
  sendMine() {
    for (const s of this.seats.values()) {
      const pl = this.g.players.get(s.p.id);
      if (pl?.me) { pl.me = false; s.p.conn.send({ t: 'rpme', ...mine(this.g, pl) }); }
    }
  }
  welcome(p) {
    const g = this.g;
    return {
      t: 'rpw', id: this.id, you: p.id, host: this.host, mode: this.mode, st: this.state, startsIn: Math.max(0, this.startsAt - this.now),
      world: WORLD, levels: LEVELS, seed: g.seed, level: g.level, at: g.levelAt, s: g.step, pause: g.pause, cleared: g.cleared, r: this.roster().r, p: this.people(),
      items: g.items, fx: g.fx, me: g.players.has(p.id) ? mine(g, g.players.get(p.id) ) : null,
    };
  }

  // ---------------------------------------------------------------- what players do
  handle(p, msg, now) {
    if (!this.seats.has(p.id)) return;
    if (msg.t === 'arenaGo') { if (p.id === this.host && this.state === 'countdown') this.startsAt = Math.min(this.startsAt, now + 1000); return; }
    if (msg.t === 'ping') { p.conn.send({ t: 'pong', now, s: this.g.step }); return; }
    if (this.state === 'ended' || this.g.over) return;
    const x = msg.x, y = msg.y;
    if (msg.t === 'walk') { if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WORLD && y < WORLD) walkTo(this.g, p.id, x, y); return; }
    if (msg.t === 'dir') { steer(this.g, p.id, Number(msg.dx), Number(msg.dy)); return; }
    if (this.state !== 'running') return;
    let r = true;
    if (msg.t === 'rplearn') r = typeof msg.k === 'string' && Object.hasOwn(SKILLS, msg.k) ? learn(this.g, p.id, msg.k) : 'NOT_NOW';
    else if (msg.t === 'rpcast') r = cast(this.g, p.id, msg.i);
    else if (msg.t === 'rpuse') r = useItem(this.g, p.id, msg.i);
    else return;
    if (r !== true) p.conn.send({ t: 'err', code: `RUN_${r}` });
    this.sendMine();
  }

  // ---------------------------------------------------------------- the loop
  tick(dt, now) {
    this.now = now; this.ticks++;
    if (this.state === 'ended') return;
    const g = this.g;
    if (this.state === 'countdown' && now >= this.startsAt) {
      this.state = 'running';
      beginLevel(g, 1);
      this.hooks.changed(this);
    }
    if (this.state === 'running') this.t += dt;
    this.acc = Math.min(this.acc + dt, STEP * 10);
    const level = g.level;
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      stepGame(g);
      // A level begins: everyone gets its seed and its first step, so their browsers can walk the same swarm.
      for (const e of g.events) if (e[0] === 'level') this.broadcast({ t: 'rplevel', level: g.level, at: g.levelAt, s: g.step, p: this.people(), items: g.items });
      this.pend.push(...g.events.filter((e) => e[0] !== 'level' && e[0] !== 'items'));
      g.events.length = 0;
      if (g.over) break;
    }
    if (g.level !== level) this.hooks.changed(this);
    this.sendMine();
    if (this.ticks % STATE_EVERY === 0 || this.pend.length) {
      this.broadcast({ t: 'rps', s: g.step, pause: g.pause, cleared: g.cleared, p: this.people(), e: this.pend });
      this.pend = [];
    }
    if (g.over) this.end();
  }

  end() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.endedAt = this.now;
    const g = this.g;
    const results = [...this.seats.values()].map((s) => this.result(s));
    if (this.t > 0 && results.length) this.hooks.record(results);
    this.broadcast({
      t: 'rpend', won: g.won ? 1 : 0, cleared: g.cleared, level: g.level, back: RUN_RESULTS,
      r: [...this.seats.values()].map((s) => { const pl = g.players.get(s.p.id); return [s.p.id, s.p.pepeId, pl?.saves ?? 0, pl?.downs ?? 0, runReward({ cleared: g.cleared, won: g.won, saves: pl?.saves ?? 0 })]; }),
    });
    this.hooks.changed(this);
  }
  result(s) {
    const g = this.g, pl = g.players.get(s.p.id);
    return { address: s.p.address, pepeId: s.p.pepeId, level: g.cleared, won: g.won, saves: pl?.saves ?? 0, downs: pl?.downs ?? 0, players: g.peak, seconds: Math.floor(this.t), solo: this.mode === 'solo' };
  }
  over(now) { return this.state === 'ended' && now - this.endedAt > RUN_RESULTS * 1000; }
}
