# Building a game for OG Club World

This is the guide for whoever builds a game with this kit, person or AI agent. Read it all once; keep the
checklist at the end open while you work.

A game made here drops into [OG Club World](https://world.ogclub.online) unchanged: players start it from the
plaza's games list, play it with their own Pepe on the town's map, solo or with friends, and earn $SWARM.

## The shape of it

```
games/<id>/
  game.json        what the game is: name, players, modes, message prefix, reward, how to play
  rules.js         the rules: plain functions on a plain state object (no DOM, no network, no clock)
  round.js         export class Round: one game on the server, built on the rules
  client.js        export createClient(ctx) and createMap(T, N): what the player sees
  panel.html       the game's panel (plain markup, one root: <div class="gt" id="..." hidden>)
  style.css        (optional) the panel's own styles
  sim.js           export simulate({ players, seed, skill }): bots play the rules, for balance
  test/*.test.js   tests (node:test)
```

Start from the template: `npm run new my-game` copies `games/template` (COIN DASH, a small complete game, every
file commented) and gives it your id and prefix. Then `npm run play` and open
`http://localhost:5173/?game=my-game`. The other two games are full-size examples:
`games/siege` (a co-op lane maze tower defence with builders) and `games/runpepe` (a team dodging run with levels,
skills and items).

## How a game runs

The **server decides everything**; the browser only sends what the player pressed and draws what it's told.
That way nobody can cheat by changing their browser, and everyone sees the same game.

1. A player starts the game (solo or co-op). The world makes `new Round(id, mode, host, hooks, now)`.
2. Co-op rounds count down (20 s) while friends join; the host can start sooner (`arenaGo`).
3. The world calls `round.tick(dt, now)` 20 times a second (dt = 0.05) and hands it every message a player sends.
4. The round sends each player what they need (`p.conn.send(msg)` or `this.broadcast(msg)`).
5. At the end the round calls `hooks.record(results)`, shows a results screen, and `over(now)` turns true when
   it's done; everyone goes back to the plaza.

Rounds run in worker threads, many at once, so keep a tick cheap (well under a millisecond for a full game).

## game.json

(The comments are only here: the file itself is plain JSON.)

```jsonc
{
  "id": "coin-dash",                 // = the folder name: 2-24 lowercase letters, digits, dashes
  "name": "COIN DASH",               // capitals, up to 24 characters
  "tagline": "GRAB THE COINS · DODGE THE FUD · SOLO OR UP TO 4",
  "players": [1, 4],                 // fewest and most, up to 8
  "modes": ["solo", "coop"],
  "prefix": "cd",                    // 2-3 letters: every message of yours starts with it
  "watcher": true,                   // draw the Swarm Watcher in the middle of the map
  "panel": "panel.html",
  "style": "style.css",
  "reward": { "fn": "coinReward", "per": "coins grabbed", "max": 40 },
  "howto": ["ONE LINE PER RULE, IN CAPITALS, THE WAY THE GAMES PAGE SHOWS THEM"]
}
```

## rules.js

Everything that decides what happens: the field, the units, the numbers, a `step(g, dt)` that moves the game on.
Plain functions on a plain object, so the round, the tests and the simulator all use the same code.

- No timers, no clocks: time comes in as `dt`. No `Math.random()` in the rules either: use `rng(seed)` from
  `engine/world.js` and keep it on the state, so a game replays exactly from its seed (tests and sims rely on it).
- Keep the numbers at the top as named constants, with a comment saying what they mean. That's where balancing
  happens.
- Export the reward function named in `game.json`. It turns a player's result into $SWARM, and must stay at or
  under `reward.max` (at most 300) whatever happens. OG Club pays it; your game never touches tokens.
- Use the world's map: it's 64 by 64 tiles (`N`), and the Swarm Watcher stands on tiles (31, 31) to (32, 32)
  (`WATCHER`). Put your field round it or beside it.

## round.js

`export class Round` with exactly these (see `games/template/round.js`, which explains each one):

| Member | What it does |
|---|---|
| `constructor(id, mode, host, hooks, now, seed?)` | Set up, then `this.add(host)` |
| `game`, `mode`, `state` (`'countdown'`, `'running'`, `'ended'`), `startsAt`, `t` | Read by the world |
| `players`, `size`, `has(p)`, `canJoin()`, `listing(now)` | Who's in it; the town list |
| `add(p)`, `remove(p)`, `goOffline(p)`, `rejoin(p, now)` | Players coming and going (send the newcomer a welcome with everything) |
| `handle(p, msg, now)` | A message from a player |
| `tick(dt, now)` | 20 times a second |
| `end(won)`, `over(now)` | Finish; when the results screen is done |
| `poke(what, v)`, `swarmNuke()`, `broadcast(msg, except)` | Test levers; ignore; send to all |

`hooks.changed(round)` when players, the state or joinability change. `hooks.record(results)` with one result per
player at the end, and for anyone who leaves part way: `{ address, pepeId, won, players, seconds, solo, ... }` plus
whatever your reward function needs.

A player `p` is `{ id, address, pepeId, conn }`. `pepeId` is their character (show it with `label(pepeId)` in the
browser); never show addresses.

**Messages.** Every message is `{ t: '<type>', ... }`. Yours must start with your prefix (`cdw`, `cds`...). The
shared ones you may also use: from the browser `walk {x, y}` (a tile clicked), `dir {dx, dy}` (keys held, in
screen terms: W is `dy: -1`, turn it into the map with `dx' = dx + dy, dy' = dy - dx`), `arenaGo` (the host says
start now), `arenaLeave` (handled by the world); to the browser `err {code}` (start your codes with a word of your own in
capitals and an underscore, e.g. `CD_NOT_NOW`; the browser gets the part after it in `err(code)`).

- **Never trust a message.** Check every field's type and range before using it. The world also checks shapes.
- Send the state at most 10 times a second, and only what changed or what's needed to draw. Round positions to
  tenths of a tile. A full game should stay under about 2 KB a send.
- Everything goes through JSON: no Maps, Sets, functions or `undefined` in messages.

## client.js

`export function createClient(ctx)` returns `{ exit, isOpen, message, key, click, hover, ground, items, overlay }`,
plus optionally `og(gained)`, `err(code)`, `pong()`, `speed()`, `up()`. `export function createMap(T, N)` returns
`{ tiles: Uint8Array(N * N) of T kinds, nodes: Map("x,y" -> { kind: 'tree' | 'rock', x, y, v }) }`.

`ctx` is `{ $, el, send, snd, label, reduceMotion, guest, onClose, shake, world }`:

- `$(id)` your panel's elements (by your own ids, prefixed), `el(tag, class, text)` to make elements (set
  `textContent`, never HTML).
- `send(msg)` to the round. `snd.play(name)` a sound: `click pick gem levelup start win lose die hurt zap boss
  warn bonk whip boom thud revive down count` and more (see `engine/sound.js`).
- `world.enter({ players: [[id, pepeId]], you })` when your welcome arrives; `world.move([[id, x, y, moving,
  facing]])` with everyone's place (they glide between updates); `world.players(list)`, `world.where(id)`,
  `world.set(id, { ghost: true })` (see-through, e.g. knocked out), `world.shift(id, dx, dy)`, `world.exit()`.
- `onClose()` from your `exit()`; `exit()` returns the mode to play again in, or `false`.

**Drawing.** Each frame the host calls `ground(g, P, T)` (under everything), `items(list, g, P, T)` (push
`{ d, draw }` for each standing thing: `d = x + y` sorts them with the Pepes and trees), and `overlay(g, P, T)`
(on top). `g` is a 2D canvas context, `T` the time in seconds. `P(x, y, z)` turns a map point (tiles, `z` pixels
up) into canvas pixels: tile (x, y)'s top corner is `P(x, y)`, a tile is 32 by 16 pixels. It's pixel art: draw
whole pixels with `fillRect`, round coordinates, no smoothing.

- The swarm's cast is ready to use: `ENEMY_SPRITES` from `engine/sprites.js` has `shiller clone mini fud rug
  extractor influencer kol`, each with `walk[0..3].left/right` frames, `w`, `h`.
- `textArt(text, colour, big)` from `engine/text.js` draws pixel text (capitals, digits, `.,:!'·+-/%$#?<>()`).
- Use the panel classes from `engine/style.css` (`gt-side gt-top gt-castle gt-time gt-team gt-mate gt-tools btn
  ghost mg-card mg-sub mg-actions gt-banner`) so your panel looks like the world's.

**Feeling instant.** The server is a round trip away. Either let the host move your own Pepe at once (export
`predictFree(x, y)` and return `speed()` and `up()`: see `games/template`), or for things everyone must see
exactly alike, make them deterministic from a seed and step them in the browser too (see how `games/runpepe`
never sends its swarm at all).

## What a game may not do

`npm run check` enforces these; a pull request that breaks any is closed.

- **No network, no wallets, no storage.** No `fetch`, sockets, `localStorage`, cookies, `window.ethereum` or any
  wallet call. The world's page has players' wallets connected; games never go near them.
- **No HTML strings, nothing outside your panel.** Build elements with `el()` and `textContent`; reach only your
  own ids with `$()`. No `<script>`, no event attributes, no outside links or files: everything is in your folder.
- **No code from strings, no loading code later**, no workers, no messages to other windows.
- **Imports** only from your own folder and `engine/world.js`, `engine/sprites.js`, `engine/text.js`,
  `engine/motion.js`.
- **No clocks or timers in `rules.js`, `round.js` or `sim.js`**: time comes in through `tick` and `step`.
- **$SWARM only through your reward function**, capped by `reward.max` (300 at most).
- **Original names and art.** No real brands, people, other games' names or known characters. The swarm's cast,
  Pepes and the Watcher are yours to use.
- Show players by character (`label(pepeId)`), never by wallet.

## Testing it

- `npm test`: your tests, plus the kit's: every game plays 40 seconds of random input through
  `engine/local.js` (solo and co-op), keeps to its prefix, records properly, and ends.
- Test the rules directly (`test/rules.test.js`) and the round through `LocalServer`
  (`test/round.test.js`): `s.open(pepeId)`, `s.join(pepeId)`, `s.message(id, msg)`, `s.run(seconds)`,
  `s.last(id, type)`, `s.records`.
- `npm run sim`: your bots for 1, 2 and 4 players, idle and trying. An idle team must never win; a trying team
  must get somewhere. Tune `rules.js` until a decent player gets far but not everywhere, and a run lasts minutes.
- `npm run check`: the rules above.
- `npm run play`, then `http://localhost:5173/?game=<id>&mode=coop&bots=2&lag=80`: play it with bots and a slow
  connection. Add `&autostart=1` to skip the start screen. Agents can screenshot it with Playwright:

```js
const { chromium } = require('playwright');
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('ERROR', e.message));
await p.goto('http://localhost:5173/?game=my-game&autostart=1');
await p.waitForTimeout(5000); await p.keyboard.down('d'); await p.waitForTimeout(1500); await p.keyboard.up('d');
await p.screenshot({ path: 'my-game.png' });
```

## Checklist before a pull request

- [ ] `npm test`, `npm run check` and `npm run sim` all pass
- [ ] Played it in `play.html` solo and co-op with bots, with 80 ms lag, at phone width (390 px) too
- [ ] The panel says what to do at every moment, and the end card says what happened and what it paid
- [ ] A new player understands it from the `howto` lines alone
- [ ] Leaving mid-game works (the others carry on in co-op); a reload rejoins (`rejoin` sends everything)
- [ ] Names and art are original
- [ ] The pull request says what the game is, how long a run lasts, what the sims say, and has a screenshot

## How it gets into OG Club World

Pull requests run the checks above. OG Club reviews the game, plays it, and merges it; then it's wired into the
world (the games list, $SWARM payouts, leaderboards) and goes live with the next update. OG Club sets the final
reward numbers and may tune balance.
