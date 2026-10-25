// COIN DASH's round: what runs on the server for one game (the world runs many at once, in worker threads).
// This is the shape every game's round has; the world (and engine/local.js here) only ever calls these methods.
//
//   new Round(id, mode, host, hooks, now, seed?)   mode 'solo' or 'coop'; host is the player who started it
//   add(p) / remove(p) / goOffline(p) / rejoin(p, now)    players coming and going (p.conn.send(msg) reaches them)
//   handle(p, msg, now)    a message from a player (only ones whose t starts with the game's prefix, plus walk,
//                          dir and arenaGo; the world handles leaving, chat and pings itself)
//   tick(dt, now)          20 times a second
//   listing(now), canJoin(), over(now), end(won), poke(what, v), swarmNuke(), broadcast(msg, except)
//   hooks.changed(round)   say so when players, the state or joinability change (the town list updates)
//   hooks.record(results)  at the end (and when someone leaves part way): one result per player, which the
//                          world saves and pays $SWARM for (with the reward function in rules.js)
//
// Never trust a message: check every field (the world checks the shape too, from the game's manifest).
import { createGame, addPlayer, removePlayer, begin, stepGame, steer, walkTo, coinReward, ROUND } from './rules.js';
import { COOP_COUNTDOWN, SOLO_COUNTDOWN, RESULTS_SECONDS, N, sendAll } from '../../engine/world.js';

export class Round {
  game = 'template';
  constructor(id, mode, host, hooks, now, seed = (Math.random() * 2 ** 31) | 0) {
    this.id = id; this.mode = mode === 'coop' ? 'coop' : 'solo'; this.hooks = hooks; this.hostPepe = host.pepeId; this.host = host.id;
    this.g = createGame(seed); this.state = 'countdown'; this.t = 0; this.now = now; this.ticks = 0; this.endedAt = 0;
    this.startsAt = now + (this.mode === 'solo' ? SOLO_COUNTDOWN : COOP_COUNTDOWN) * 1000;
    this.seats = new Map();
    this.add(host);
  }
  get players() { return [...this.seats.values()].map((s) => s.p); }
  get size() { return this.seats.size; }
  has(p) { return this.seats.has(p.id); }
  /** Friends can join a co-op game while it's counting down. */
  canJoin() { return this.mode === 'coop' && this.state === 'countdown' && this.size < ROUND.MAX_PLAYERS; }
  /** For the town's list: [id, mode, players, state, ms to start or seconds in, host's character, can join, game]. */
  listing(now) { return [this.id, this.mode, this.size, this.state, this.state === 'countdown' ? Math.max(0, this.startsAt - now) : Math.floor(this.t), this.hostPepe, this.canJoin() ? 1 : 0, this.game]; }

  add(p) {
    this.seats.set(p.id, { p, offline: false });
    addPlayer(this.g, p.id);
    p.arena = this;
    p.conn.send({ t: 'cdw', you: p.id, host: this.host, mode: this.mode, st: this.state, startsIn: Math.max(0, this.startsAt - this.now), r: this.roster(), s: this.snapshot() });
    this.broadcast({ t: 'cdroster', r: this.roster(), host: this.host }, p);
    this.hooks.changed(this);
  }
  remove(p) {
    const seat = this.seats.get(p.id); if (!seat) return;
    if (this.state === 'running') this.hooks.record([this.result(p)]); // leaving part way still pays for what you grabbed
    this.seats.delete(p.id); removePlayer(this.g, p.id);
    if (p.arena === this) p.arena = null;
    if (this.host === p.id && this.size) this.host = [...this.seats.keys()][0];
    this.broadcast({ t: 'cdroster', r: this.roster(), host: this.host });
    this.hooks.changed(this);
  }
  goOffline(p) { const s = this.seats.get(p.id); if (s) s.offline = true; }
  rejoin(p, now) {
    const s = this.seats.get(p.id); if (!s) return false; s.offline = false; this.now = now;
    p.conn.send({ t: 'cdw', you: p.id, host: this.host, mode: this.mode, st: this.state, startsIn: 0, r: this.roster(), s: this.snapshot(), rejoined: 1 });
    if (this.endMsg) p.conn.send(this.endMsg); // back during the results: show them the end card again
    return true;
  }
  roster() { return [...this.seats.values()].map((s) => [s.p.id, s.p.pepeId]); }
  broadcast(msg, except) { sendAll(this.players, msg, except); }
  swarmNuke() {}
  /** Test levers: end it now, skip the results. */
  poke(what) { if (what === 'end') { this.g.over = true; this.g.won = false; } else if (what === 'over') this.endedAt = 1; }

  handle(p, msg, now) {
    if (!this.seats.has(p.id)) return;
    if (msg.t === 'arenaGo') { if (p.id === this.host && this.state === 'countdown') this.startsAt = Math.min(this.startsAt, now + 1000); return; }
    if (this.state === 'ended') return;
    if (msg.t === 'dir') return steer(this.g, p.id, Number(msg.dx), Number(msg.dy));
    if (msg.t === 'walk' && Number.isInteger(msg.x) && Number.isInteger(msg.y) && msg.x >= 0 && msg.y >= 0 && msg.x < N && msg.y < N) walkTo(this.g, p.id, msg.x, msg.y);
  }

  /** Everyone's place (tenths of a tile), the coins, the bots, the score and the clock. */
  snapshot() {
    const g = this.g, r = (v) => Math.round(v * 10);
    return {
      p: [...g.players.values()].map((p) => [p.id, r(p.x), r(p.y), p.moving ? 1 : 0, p.facing, p.dizzy > 0 ? 1 : 0, p.coins]),
      c: g.coins.map((c) => [c.id, r(c.x), r(c.y)]), b: g.bots.map((b) => [b.id, r(b.x), r(b.y)]),
      score: g.score, goal: g.goal, left: Math.ceil(g.left),
    };
  }
  tick(dt, now) {
    this.now = now; this.ticks++;
    if (this.state === 'ended') return;
    if (this.state === 'countdown' && now >= this.startsAt) { this.state = 'running'; begin(this.g); this.broadcast({ t: 'cdgo' }); this.hooks.changed(this); }
    if (this.state === 'running') { this.t += dt; stepGame(this.g, dt); }
    // Ten times a second: the state, with what happened since.
    if (this.ticks % 2 === 0) this.broadcast({ t: 'cds', st: this.state, ...this.snapshot(), e: this.g.events.splice(0) });
    if (this.g.over) this.end(this.g.won);
  }
  end(won) {
    if (this.state === 'ended') return;
    this.state = 'ended'; this.endedAt = this.now;
    const results = this.players.map((p) => this.result(p));
    if (results.length) this.hooks.record(results);
    this.endMsg = { t: 'cdend', won: won ? 1 : 0, score: this.g.score, goal: this.g.goal, r: this.players.map((p) => { const pl = this.g.players.get(p.id); return [p.id, p.pepeId, pl?.coins ?? 0, coinReward({ coins: pl?.coins ?? 0, won })]; }) };
    this.broadcast(this.endMsg);
    this.hooks.changed(this);
  }
  /** What the world records for a player: their character, how they did, and what it pays. */
  result(p) {
    const pl = this.g.players.get(p.id), coins = pl?.coins ?? 0;
    return { address: p.address, pepeId: p.pepeId, coins, score: this.g.score, won: this.g.won, players: this.size, seconds: Math.floor(this.t), solo: this.mode === 'solo', pay: coinReward({ coins, won: this.g.won }) };
  }
  over(now) { return this.state === 'ended' && now - this.endedAt > RESULTS_SECONDS * 1000; }
}
