// SWARM SIEGE: one co-op lane maze run, run entirely here (rules.js has the rules). Up to four players each
// hold a lane into the Mixer round the Watcher; waves come down every open lane on a clock while everyone keeps
// building. Everyone's Pepe is a builder walking the field: a block order sends it to the spot, and the block goes
// down when it gets there. Upgrades, sales and tips happen from anywhere. Players only send where to walk or build
// and what to upgrade, sell or tip.
//
// Solo starts after a few seconds; co-op waits for friends (whoever started it can go sooner) and takes late
// joiners until wave 3 (they get a closed lane, or one somebody left). Someone who drops out keeps their lane and
// towers until they're back.
import {
  createGame, addPlayer, removePlayer, begin, stepGame, stepBuilders, orderBuild, orderWalk, steerBuilder, upgrade, sell, tip, callWave,
  siegeReward, ROUND, GRID, WORLD, FO, WAVES_TOTAL, TOWERS, idx,
} from './rules.js';
import { COOP_COUNTDOWN, sendAll } from '../../engine/world.js';

export const SIEGE_SOLO_COUNTDOWN = 3;
export const SIEGE_RESULTS = 12;
/** Creeps go out this often (ticks of 50 ms). */
const STATE_EVERY = 2;
const TIPS = new Set([10, 25, 50, 100]);

export class Round {
  game = 'siege';
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
  dirty = true;
  pend = [];

  constructor(id, mode, host, hooks, now, seed = (Math.random() * 2 ** 31) | 0) {
    this.id = id; this.mode = mode === 'coop' ? 'coop' : 'solo'; this.hooks = hooks; this.hostPepe = host.pepeId; this.host = host.id;
    this.g = createGame(seed);
    this.now = now;
    this.startsAt = now + (this.mode === 'solo' ? SIEGE_SOLO_COUNTDOWN : COOP_COUNTDOWN) * 1000;
    this.add(host);
  }

  // ---------------------------------------------------------------- players
  get players() { return [...this.seats.values()].map((s) => s.p); }
  get size() { return this.seats.size; }
  has(p) { return this.seats.has(p.id); }
  canJoin() {
    if (this.mode !== 'coop' || this.size >= ROUND.MAX_PLAYERS || this.state === 'ended' || this.g.over) return false;
    return this.state === 'countdown' || this.g.wave < ROUND.LATE_JOIN_WAVE;
  }
  listing(now) {
    return [this.id, this.mode, this.size, this.state, this.state === 'countdown' ? Math.max(0, this.startsAt - now) : this.g.wave, this.hostPepe, this.canJoin() ? 1 : 0, this.game];
  }
  add(p, _skin = '') {
    this.seats.set(p.id, { p, offline: false });
    addPlayer(this.g, p.id);
    p.arena = this;
    p.path = []; p.dir = [0, 0]; p.task = null; p.gather = null;
    p.conn.send(this.welcome(p));
    this.broadcast(this.roster(), p);
    this.dirty = true;
    this.hooks.changed(this);
  }
  remove(p) {
    const seat = this.seats.get(p.id); if (!seat) return;
    // Leaving part way still pays for the waves you reached.
    if (this.state === 'running' && this.g.wave > 0) this.hooks.record([this.result(seat, false)]);
    this.seats.delete(p.id);
    if ((p.arena) === this) p.arena = null;
    removePlayer(this.g, p.id);
    if (this.host === p.id && this.seats.size) this.host = [...this.seats.keys()][0];
    this.broadcast(this.roster());
    this.dirty = true;
    this.hooks.changed(this);
  }
  goOffline(p) { const s = this.seats.get(p.id); if (!s) return; s.offline = true; this.broadcast(this.roster()); this.hooks.changed(this); }
  rejoin(p, now) {
    const s = this.seats.get(p.id); if (!s) return false;
    s.offline = false; this.now = now;
    p.conn.send({ ...this.welcome(p), rejoined: 1 });
    this.broadcast(this.roster(), p);
    return true;
  }
  swarmNuke(_name) { /* the siege is its own world */ }
  /** Test and admin levers: end it, give everyone gold, skip the results, set the lives, set the wave clock. */
  poke(what, v = 0) {
    const g = this.g;
    if (what === 'end') { g.lives = 0; g.over = true; g.won = false; }
    else if (what === 'xp') for (const pl of g.players.values()) pl.gold += v;
    else if (what === 'over') this.endedAt = 1;
    else if (what === 'tower') { g.lives = v; g.maxLives = Math.max(g.maxLives, v); }
    else if (what === 't') g.next = v;
    this.dirty = true;
  }
  /** [player id, character, offline, lane]. */
  roster() { return { t: 'sgroster', r: [...this.seats.values()].map((s) => [s.p.id, s.p.pepeId, s.offline ? 1 : 0, this.g.players.get(s.p.id)?.lane ?? -1]), host: this.host }; }
  broadcast(msg, except) { sendAll(this.players, msg, except); }

  // ---------------------------------------------------------------- what everyone sees
  /** What's built [cell, kind, owner, kills], the lanes' holders, everyone's gold, lives and the wave clock. */
  field() {
    const g = this.g;
    return {
      t: 'sgf', st: this.state, wave: g.wave, next: Math.max(0, Math.ceil(g.next)), lives: g.lives, max: g.maxLives, lanes: g.lanes, out: g.spawning.length ? 1 : 0,
      tw: [...g.towers.entries()].map(([c, t]) => [c, t.kind, t.owner, t.kills]),
      pl: [...g.players.values()].map((p) => [p.id, p.lane, p.gold, p.kills]),
    };
  }
  welcome(p) {
    return {
      t: 'sgw', id: this.id, you: p.id, host: this.host, mode: this.mode, st: this.state, startsIn: Math.max(0, this.startsAt - this.now),
      grid: GRID, world: WORLD, fo: FO, waves: WAVES_TOTAL, r: this.roster().r, f: this.field(), ...this.builders(),
    };
  }

  // ---------------------------------------------------------------- what players do
  handle(p, msg, now) {
    const s = this.seats.get(p.id); if (!s) return;
    const g = this.g, err = (code) => p.conn.send({ t: 'err', code: `SIEGE_${code}` });
    if (msg.t === 'arenaGo') {
      if (p.id === this.host && this.state === 'countdown') this.startsAt = Math.min(this.startsAt, now + 1000);
      return;
    }
    if (this.state === 'ended' || g.over) return;
    const x = msg.x, y = msg.y;
    if (msg.t === 'walk') { if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WORLD && y < WORLD) orderWalk(g, p.id, x, y); return; }
    if (msg.t === 'dir') { steerBuilder(g, p.id, Number(msg.dx), Number(msg.dy)); return; }
    if (this.state !== 'running') return;
    let r = true;
    if (msg.t === 'sgbuild') r = orderBuild(g, p.id, x, y);
    else if (msg.t === 'sgup') r = typeof msg.k === 'string' && Object.hasOwn(TOWERS, msg.k) ? upgrade(g, p.id, idx(x, y), msg.k) : 'NOT_NOW';
    else if (msg.t === 'sgsell') r = sell(g, p.id, idx(x, y));
    else if (msg.t === 'sgtip') r = TIPS.has(msg.n) ? tip(g, p.id, msg.to, msg.n) : 'NOT_NOW';
    else if (msg.t === 'sgnext') { if (p.id !== this.host) return; r = callWave(g); }
    else return;
    if (r !== true) return err(r);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- the loop
  tick(dt, now) {
    this.now = now; this.ticks++;
    if (this.state === 'ended') return;
    const g = this.g;
    if (this.state === 'countdown' && now >= this.startsAt) {
      this.state = 'running';
      begin(g);
      this.dirty = true;
      this.hooks.changed(this);
    }
    const steps = Math.round(dt / ROUND.STEP);
    for (let i = 0; i < steps; i++) stepBuilders(g, ROUND.STEP);
    if (this.state === 'countdown') { this.sendBuilders(); return; }
    this.t += dt;
    this.acc = Math.min(this.acc + dt, ROUND.STEP * 10);
    const was = g.wave;
    while (this.acc >= ROUND.STEP - 1e-9) {
      this.acc -= ROUND.STEP;
      stepGame(g, ROUND.STEP);
      if (g.over) break;
    }
    if (g.wave !== was) { this.broadcast({ t: 'sgwave', wave: g.wave }); this.dirty = true; this.hooks.changed(this); }
    this.send();
    if (g.over) this.end(g.won);
  }
  /** What's built goes out as it changes (and each second for the clock); creeps and builders ten times a second. */
  send() {
    const g = this.g;
    const ev = g.events.splice(0);
    if (this.dirty || ev.some((e) => e[0] === 'build' || e[0] === 'up' || e[0] === 'sold' || e[0] === 'tip' || e[0] === 'wave')) { this.dirty = false; this.broadcast(this.field()); }
    this.pend.push(...ev.filter((e) => e[0] !== 'build' && e[0] !== 'up' && e[0] !== 'wave'));
    if (this.ticks % STATE_EVERY) return;
    // Creeps: [id, type (its wave, 0 a splinter), x and y (field tiles, tenths), hit points (thousandths), 1 if slowed].
    const T = g.t;
    const cr = g.creeps.flatMap((k) => [k.id, k.type, Math.round(k.x * 10), Math.round(k.y * 10), Math.max(0, Math.round((k.hp / k.max) * 1000)), k.slowUntil > T ? 1 : 0]);
    // Hits are many: [tower cell, creep] pairs, each once a send and up to three a tower; the rest as they are.
    const hits = new Map(), other = [];
    for (const e of this.pend) {
      if (e[0] !== 'hit') { other.push(e); continue; }
      const set = hits.get(e[1]) ?? new Set(); hits.set(e[1], set);
      if (set.size < 3) set.add(e[2]);
    }
    this.pend = [];
    this.broadcast({ t: 'sgs', c: cr, h: [...hits].flatMap(([cell, ids]) => [...ids].flatMap((id) => [cell, id])), e: other, lives: g.lives, next: Math.max(0, Math.ceil(g.next)), gold: [...g.players.values()].map((p) => [p.id, p.gold, p.kills]), ...this.builders() });
  }
  /** Builders: b [player id, x, y (world tiles, tenths), moving 1|0, facing 1|-1], and each one's block orders o [[player id, cells...]]. */
  builders() {
    const pl = [...this.g.players.values()];
    return { b: pl.flatMap((p) => [p.id, Math.round(p.b.x * 10), Math.round(p.b.y * 10), p.b.moving ? 1 : 0, p.b.facing]), o: pl.filter((p) => p.b.orders.length).map((p) => [p.id, ...p.b.orders]) };
  }
  sendBuilders() { if (this.ticks % STATE_EVERY === 0) this.broadcast({ t: 'sgs', c: [], h: [], e: [], lives: this.g.lives, next: Math.ceil(this.g.next), gold: [], ...this.builders() }); }

  end(won) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.endedAt = this.now;
    const g = this.g;
    const results = [...this.seats.values()].map((s) => this.result(s, won));
    if (this.t > 0 && results.length) this.hooks.record(results);
    this.broadcast({
      t: 'sgend', won: won ? 1 : 0, waves: this.cleared(won), wave: g.wave, pay: siegeReward({ reached: g.wave, won }), kills: g.kills, leaks: g.leaks, back: SIEGE_RESULTS,
      r: [...this.seats.values()].map((s) => { const pl = g.players.get(s.p.id); return [s.p.id, s.p.pepeId, pl?.kills ?? 0, Math.round(pl?.dmg ?? 0)]; }),
      best: [...g.towers.values()].filter((t) => t.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 3).map((t) => [t.kind, Math.round(t.dmg), t.kills]),
    });
    this.hooks.changed(this);
  }
  /** Waves the team has beaten: every wave that came, less the one that broke them (if any). */
  cleared(won) { const g = this.g; return won ? g.wave : g.over ? Math.max(0, g.wave - 1) : Math.max(0, g.wave - (g.spawning.length || g.creeps.length ? 1 : 0)); }
  result(s, won) {
    const g = this.g;
    return { address: s.p.address, pepeId: s.p.pepeId, wave: this.cleared(won), reached: g.wave, won, kills: g.players.get(s.p.id)?.kills ?? 0, players: g.peak, seconds: Math.floor(this.t), solo: this.mode === 'solo' };
  }
  over(now) { return this.state === 'ended' && now - this.endedAt > SIEGE_RESULTS * 1000; }
}
