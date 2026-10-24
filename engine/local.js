// A game round run locally, the way the OG Club World server runs it: players join, their messages go to the
// round, the round ticks 20 times a second, and whatever it sends each player comes back to them. Everything
// crosses as JSON (as over the network), so a round that sends something that doesn't survive JSON fails here
// first. Works in Node (the tests, the simulators: tick it yourself) and in the browser (play.html: start() ticks
// it for you, with optional lag).
//
// The world does more around a round (accounts, the town list, paying $SWARM, the boards); here `onRecord` just
// collects what the round asks to record, and `onOver` says when its results screen is done.

/** Messages the world handles itself, before anything reaches a round. */
const WORLD_MESSAGES = new Set(['arenaLeave', 'ping', 'chat']);

export class LocalServer {
  /**
   * @param {any} Round the game's round class (games/<name>/round.js)
   * @param {{ mode?: string, lag?: number, onSend?: (id: number, msg: any) => void, onRecord?: (results: any[]) => void, onOver?: () => void, seed?: number }} opts
   */
  constructor(Round, opts = {}) {
    this.Round = Round; this.mode = opts.mode ?? 'solo'; this.lag = opts.lag ?? 0; this.seed = opts.seed;
    this.onSend = opts.onSend ?? (() => {}); this.onRecord = opts.onRecord ?? (() => {}); this.onOver = opts.onOver ?? (() => {});
    this.people = new Map(); this.round = null; this.records = []; this.timer = null; this.now = Date.now(); this.nextId = 1;
    /** Everything sent to each player (the tests read it). */
    this.inbox = new Map();
  }
  /** A stand-in for a player: what a round reads and moves. pepeId is their character. */
  person(pepeId = 1000 + this.nextId) {
    const id = this.nextId++;
    const p = {
      id, address: `0x${id.toString(16).padStart(40, '0')}`, pepeId, guest: false, arena: null, path: [], dir: [0, 0], task: null, gather: null,
      conn: { send: (m) => this.deliver(p, JSON.stringify(m)), sendRaw: (raw) => this.deliver(p, raw) },
    };
    this.people.set(id, p); this.inbox.set(id, []);
    return p;
  }
  deliver(p, raw) {
    const msg = JSON.parse(raw);
    this.inbox.get(p.id)?.push(msg);
    if (this.lag > 0 && typeof setTimeout === 'function') setTimeout(() => this.onSend(p.id, msg), this.lag);
    else this.onSend(p.id, msg);
  }
  /** Start a round with this player as its host. */
  open(pepeId) {
    const p = this.person(pepeId);
    const hooks = { changed: () => {}, record: (results) => { this.records.push(...results); this.onRecord(results); } };
    this.round = new this.Round(1, this.mode, p, hooks, this.now, this.seed);
    return p;
  }
  /** Another player joins (co-op), if the round takes them. */
  join(pepeId) {
    if (!this.round?.canJoin()) return null;
    const p = this.person(pepeId);
    this.round.add(p, '');
    return p;
  }
  /** A message from a player, as JSON text or an object. */
  message(id, msg) {
    const p = this.people.get(id); if (!p || !this.round) return;
    const m = typeof msg === 'string' ? JSON.parse(msg) : JSON.parse(JSON.stringify(msg));
    const run = () => {
      if (m.t === 'ping') return p.conn.send({ t: 'pong', now: this.now });
      if (m.t === 'arenaLeave') { this.round.remove(p); return; }
      if (WORLD_MESSAGES.has(m.t)) return;
      this.round.handle(p, m, this.now);
    };
    if (this.lag > 0 && typeof setTimeout === 'function') setTimeout(run, this.lag); else run();
  }
  /** One tick (50 ms of game time, or dt seconds). */
  tick(dt = 0.05) {
    if (!this.round) return;
    this.now += Math.round(dt * 1000);
    this.round.tick(dt, this.now);
    if (this.round.over(this.now)) { this.round = null; this.stop(); this.onOver(); }
  }
  /** Run ticks for this many seconds (tests and simulators). */
  run(seconds) { for (let i = 0; i < Math.round(seconds / 0.05) && this.round; i++) this.tick(0.05); }
  /** In the browser: tick in real time. */
  start() { this.stop(); let last = Date.now(); this.timer = setInterval(() => { const t = Date.now(); this.now = t - 50; this.tick(Math.min(0.25, (t - last) / 1000)); last = t; }, 50); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  /** The last message of a type a player got (tests). */
  last(id, type) { const box = this.inbox.get(id) ?? []; for (let i = box.length - 1; i >= 0; i--) if (box[i].t === type) return box[i]; return null; }
  all(id, type) { return (this.inbox.get(id) ?? []).filter((m) => m.t === type); }
}
