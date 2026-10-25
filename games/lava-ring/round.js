import { createGame, addPlayer, removePlayer, begin, stepGame, steer, cast, buy, lavaReward, radius, C } from './rules.js';
import { COOP_COUNTDOWN, SOLO_COUNTDOWN, RESULTS_SECONDS, N, sendAll } from '../../engine/world.js';

const coordinate = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < N;
const axis = (n) => typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= 1;

export class Round {
  game = 'lava-ring';
  constructor(id, mode, host, hooks, now, seed = (Math.random() * 2 ** 31) | 0) {
    this.id = id; this.mode = mode === 'coop' ? 'coop' : 'solo'; this.hooks = hooks; this.host = host.id; this.hostPepe = host.pepeId;
    this.g = createGame(seed); this.state = 'countdown'; this.t = 0; this.now = now; this.ticks = 0; this.endedAt = 0;
    this.startsAt = now + (this.mode === 'solo' ? SOLO_COUNTDOWN : COOP_COUNTDOWN) * 1000;
    this.seats = new Map(); this.add(host);
  }
  get players() { return [...this.seats.values()].map((s) => s.p); }
  get size() { return this.seats.size; }
  has(p) { return this.seats.has(p.id); }
  canJoin() { return this.mode === 'coop' && this.state === 'countdown' && this.size < C.MAX_PLAYERS; }
  listing(now) { return [this.id, this.mode, this.size, this.state, this.state === 'countdown' ? Math.max(0, this.startsAt - now) : Math.floor(this.t), this.hostPepe, this.canJoin() ? 1 : 0, this.game]; }
  roster() { return this.players.map((p) => [p.id, p.pepeId]); }
  broadcast(msg, except) { sendAll(this.players, msg, except); }
  welcome(p, startsIn) { p.conn.send({ t: 'lrw', you: p.id, host: this.host, mode: this.mode, st: this.state, startsIn, r: this.roster(), s: this.snapshot() }); if (this.endMsg) p.conn.send(this.endMsg); }
  add(p) { this.seats.set(p.id, { p, offline: false }); addPlayer(this.g, p.id); p.arena = this; this.welcome(p, Math.max(0, this.startsAt - this.now)); this.broadcast({ t: 'lrroster', r: this.roster(), host: this.host }, p); this.hooks.changed(this); }
  remove(p) {
    if (!this.seats.has(p.id)) return;
    if (this.state === 'running') this.hooks.record([this.result(p)]);
    this.seats.delete(p.id); removePlayer(this.g, p.id); if (p.arena === this) p.arena = null;
    if (this.host === p.id && this.size) this.host = this.players[0].id;
    this.broadcast({ t: 'lrroster', r: this.roster(), host: this.host }); this.hooks.changed(this);
    if (!this.size && this.state === 'running') this.end(false);
  }
  goOffline(p) { const s = this.seats.get(p.id); if (s) s.offline = true; }
  rejoin(p, now) { const s = this.seats.get(p.id); if (!s) return false; s.offline = false; this.now = now; this.welcome(p, Math.max(0, this.startsAt - now)); return true; }
  swarmNuke() {}
  poke(what) { if (what === 'end') { this.g.over = true; this.g.phase = 'done'; } else if (what === 'over') this.endedAt = 1; }
  handle(p, msg, now) {
    if (!this.seats.has(p.id) || !msg || typeof msg !== 'object') return;
    if (msg.t === 'arenaGo') { if (p.id === this.host && this.state === 'countdown') this.startsAt = Math.min(this.startsAt, now + 1000); return; }
    if (this.state !== 'running') return;
    if (msg.t === 'dir' && axis(msg.dx) && axis(msg.dy)) steer(this.g, p.id, msg.dx, msg.dy);
    else if (msg.t === 'lrcast' && Number.isInteger(msg.slot) && msg.slot >= 0 && msg.slot <= 3 && coordinate(msg.x) && coordinate(msg.y)) cast(this.g, p.id, msg.slot, msg.x, msg.y);
    else if (msg.t === 'lrbuy' && Number.isInteger(msg.spell) && msg.spell >= 0 && msg.spell < 6) buy(this.g, p.id, msg.spell);
  }
  snapshot() {
    const g = this.g, r = (v) => Math.round(v * 10);
    const fighters = [...g.fighters.values()];
    return { p: fighters.filter((p) => !p.bot).map((p) => [p.id, r(p.x), r(p.y), +p.moving, p.facing, +!p.alive, Math.ceil(p.hp), p.gold, p.wins, p.knockouts, p.slots, p.ranks, p.cd.map((v) => Math.ceil(v * 10))]),
      b: fighters.filter((p) => p.bot).map((p) => [p.id, r(p.x), r(p.y), +p.alive, Math.ceil(p.hp), p.wins]),
      s: g.projectiles.map((p) => [r(p.x), r(p.y), p.kind]), c: g.clouds.map((c) => [r(c.x), r(c.y), c.rank]),
      phase: g.phase, round: g.round, left: Math.ceil(g.left), rad: r(radius(g)), winner: g.winner,
    };
  }
  tick(dt, now) {
    this.now = now; this.ticks++;
    if (this.state === 'ended') return;
    if (this.state === 'countdown' && now >= this.startsAt) { this.state = 'running'; begin(this.g); this.broadcast({ t: 'lrgo' }); this.hooks.changed(this); }
    if (this.state === 'running') { this.t += dt; stepGame(this.g, dt); }
    if (this.ticks % 2 === 0) this.broadcast({ t: 'lrs', st: this.state, ...this.snapshot(), e: this.g.events.splice(0) });
    if (this.g.over) this.end(this.g.champion !== null);
  }
  result(p) {
    const pl = this.g.fighters.get(p.id); const roundsWon = pl?.wins ?? 0, knockouts = pl?.knockouts ?? 0;
    const won = this.state === 'ended' && this.g.champion === p.id && (pl?.activity ?? 0) > 0;
    return { address: p.address, pepeId: p.pepeId, won, players: this.size, seconds: Math.floor(this.t), solo: this.mode === 'solo', roundsWon, knockouts, pay: lavaReward({ roundsWon, knockouts }) };
  }
  end() {
    if (this.state === 'ended') return;
    this.state = 'ended'; this.endedAt = this.now;
    const results = this.players.map((p) => this.result(p));
    if (results.length) this.hooks.record(results);
    this.endMsg = { t: 'lrend', champion: this.g.champion, r: this.players.map((p) => { const pl = this.g.fighters.get(p.id); return [p.id, p.pepeId, pl?.wins ?? 0, pl?.knockouts ?? 0, lavaReward({ roundsWon: pl?.wins ?? 0, knockouts: pl?.knockouts ?? 0 })]; }), b: [...this.g.fighters.values()].filter((p) => p.bot).map((p) => [p.id, p.wins, p.knockouts]) };
    this.broadcast(this.endMsg); this.hooks.changed(this);
  }
  over(now) { return this.state === 'ended' && now - this.endedAt > RESULTS_SECONDS * 1000; }
}
