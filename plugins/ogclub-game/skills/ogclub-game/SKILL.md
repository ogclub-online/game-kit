---
name: ogclub-game
description: Build, test and submit a game for OG Club World with the OG Club game kit. Use when asked to make, change, balance or fix a game, minigame or game mode for OG Club World, or to turn a game brief into a pull request.
---

# Making an OG Club World game

You build a game as one folder, `games/<id>/`, in the OG Club game kit. The server runs the rules, the browser
only draws, and the game drops into OG Club World unchanged: players start it from the Arcade, play it with their
own character on the town's map, solo or with friends, and earn $SWARM.

## 0. Get the kit

Work inside the kit repository. If the current folder has no `BUILDING_A_GAME.md`, get it first:

```sh
git clone https://github.com/ogclub-online/game-kit && cd game-kit
```

Node 22 or newer, nothing to install (`node --version`).

## 1. Read before you write

1. `BUILDING_A_GAME.md`, all of it: the contract (what each file exports), the rules a game must keep, testing,
   and the checklist. It's the source of truth; this skill is the route through it.
2. `games/template/` (COIN DASH): small, every file commented. Read every file.
3. For anything bigger, the matching parts of `games/siege/` (builders, mazes, waves, co-op lanes) and
   `games/runpepe/` (levels, skills, items, a swarm stepped from a seed in both server and browser).

If you were given a brief (the shape of `BRIEF_TEMPLATE.md`), note its players, run length, controls and
"must not" list before you start. If something essential is missing (how a run ends, what the player controls),
ask once; otherwise make a sensible choice and say which in the pull request.

## 2. Start from the template

```sh
npm run new <id> <prefix>     # id: 2-24 lowercase letters, digits, dashes; prefix: 2-3 lowercase letters
npm run play                  # then open http://localhost:5173/?game=<id>
```

The copy plays straight away. Change it in this order, keeping it playable at every step:

1. **`rules.js`**: the whole game as plain functions on a plain state object, with `step(g, dt)`. Numbers at the
   top as named constants with a comment each. Write `test/rules.test.js` as you go.
2. **`round.js`**: `export class Round`, a thin layer over the rules: players in and out, messages in, state out
   at most 10 times a second, `hooks.record(results)` at the end. Write `test/round.test.js` with `LocalServer`.
3. **`client.js`** + **`panel.html`** + **`style.css`**: draw what the round sends; the panel says what to do at
   every moment; the end card says what happened and what it paid.
4. **`sim.js`** + **`game.json`**: bots that play the rules; the name, players, modes, reward, how-to lines.

## 3. Rules that fail the checks (and how to avoid them)

`npm run check` enforces these; a pull request that breaks one is closed.

- **No clock and no `Math.random()` in `rules.js`, `round.js` or `sim.js`.** Time comes in as `dt`/`now`; use
  `rng(seed)` from `engine/world.js` and keep its state on the game object.
- **No network, storage, wallets, workers, `eval`/`new Function`, dynamic `import()`, URLs or HTML strings.**
  Build elements with `ctx.el()` and `textContent`; reach only your own ids with `ctx.$()`.
- **Imports only** from your own folder and `engine/world.js`, `engine/sprites.js`, `engine/text.js`,
  `engine/motion.js`. Never change `engine/` or `scripts/`; if the engine needs something, say so in the PR.
- **Every message type starts with your prefix** (`<prefix>w`, `<prefix>s`...). Error codes start with a capital
  word and an underscore (`CD_NOT_NOW`).
- **The reward function** named in `game.json` returns at most `reward.max` (300 at most) whatever happens.
- **Original names and art only**: no real brands, people, other games' names or known characters. The swarm's
  cast (`ENEMY_SPRITES`), the Pepes and the Watcher are yours to use.
- Show players with `ctx.label(pepeId)`, never by wallet address.

## 4. Things that trip agents up

- **Never trust a message**: check every field's type and range in `round.handle` before using it.
- **Everything crosses as JSON**: no `Map`, `Set`, `undefined`, functions or class instances in messages.
  `LocalServer` round-trips everything through JSON, so the tests catch it.
- **Send the newcomer everything** in a welcome when they join or rejoin (`add`, `rejoin`), or a reload shows a
  blank game. Route every message type your client handles in `message(m)` and return `true` for it.
- **Feeling instant**: let the host move your own Pepe at once (export `predictFree(x, y)` and return `speed()`
  and `up()`), or step deterministic things from a seed in the browser too (see `games/runpepe`).
- **Keep a tick cheap** (well under a millisecond for a full game) and a send under about 2 KB; round positions to
  tenths of a tile.
- **The map is 64 x 64 tiles** and the Watcher stands on (31, 31) to (32, 32) (`WATCHER`): build round it.
- **Pixel art**: whole pixels with `fillRect`, rounded coordinates; `items` pushes `{ d: x + y, draw }` so things
  sort with the Pepes.
- **Leaving mid-game** must work in co-op (the others carry on), and an idle team must never win.

## 5. Prove it works

Run all three until they pass, fixing the game (never the checks):

```sh
npm test          # your tests plus the kit's: every game plays 40 s of random input, solo and co-op
npm run check     # the rules above
npm run sim       # bots for 1, 2 and 4 players, idle and trying
```

Tune the constants in `rules.js` until an idle team never wins, a trying team gets somewhere, a decent player gets
far but not everywhere, and a run lasts minutes (3-12 is a good target).

Then **look at it**. Screenshot it solo and in co-op with bots and lag, at desktop and phone width, and look at
every picture:

```sh
node <this skill's folder>/scripts/shot.mjs <id>            # writes shots/<id>-*.png
```

The script starts `npm run play` itself and needs Playwright (`npm i -D playwright` then
`npx playwright install chromium`, if they aren't there). Without it, follow the Playwright snippet in
`BUILDING_A_GAME.md`, or open `http://localhost:5173/?game=<id>&mode=coop&bots=2&lag=80` and check by hand. Fix
anything unreadable, overlapping or off-screen, and any error in the browser console.

## 6. Submit

Go through the checklist at the end of `BUILDING_A_GAME.md`, then open a pull request to
`ogclub-online/game-kit` that adds only `games/<id>/`. Its description says: what the game is, how a run goes and
how long it lasts, what `npm run sim` printed, any engine need, any choice you made for a gap in the brief, and a
screenshot. Don't commit the `shots/` folder.
