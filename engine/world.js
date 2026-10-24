// The world a game round lives in: the town-sized map (N by N tiles), its tile kinds, where the Swarm Watcher
// stands, and the few helpers every round uses. The same values as the live OG Club World, so a game made here
// drops into it unchanged.

/** The map is N by N tiles; games draw their field somewhere on it. */
export const N = 64;
/** Tile kinds (what the ground looks like). */
export const T = Object.freeze({ GRASS: 0, PATH: 1, WATER: 2, PLOT: 3, SAND: 4, FOUNTAIN: 5, PLAZA: 6, WATCHER: 7, ASH: 8, CLUB: 9, VOID: 10, DOCK: 11 });
/** The Swarm Watcher's 2 by 2 tiles (top-left corner). */
export const WATCHER = Object.freeze({ x: 31, y: 31 });
/** Seconds a co-op round waits for friends before it starts (its host can start sooner). */
export const COOP_COUNTDOWN = 20;
/** Seconds a solo round waits. */
export const SOLO_COUNTDOWN = 3;
/** Seconds the results stay up before everyone goes back to town. */
export const RESULTS_SECONDS = 12;

/** A seeded random number generator, 0 to 1 (the same numbers everywhere for the same seed). */
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Send one message to many players (turned into JSON once). `except` is left out. */
export function sendAll(players, msg, except) {
  let raw = null;
  for (const p of players) {
    if (p === except) continue;
    if (p.conn.sendRaw) p.conn.sendRaw(raw ??= JSON.stringify(msg));
    else p.conn.send(msg);
  }
}

/** Armour: each point takes about 6% off physical damage (negative adds to it). */
export const armorMult = (a) => (a >= 0 ? 1 - (0.06 * a) / (1 + 0.06 * a) : 2 - Math.pow(0.94, -a));
