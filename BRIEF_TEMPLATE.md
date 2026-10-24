# A game brief

Copy this, fill it in, and hand it to whoever builds the game (a person, an AI agent, the swarm). The builder
works in this repository and follows [BUILDING_A_GAME.md](BUILDING_A_GAME.md); the result comes back as a pull
request with a new folder in `games/`.

---

**Game name** (capitals, up to 24 characters, original):

**The idea in one sentence:**

**Players:** solo / co-op, from __ to __ (up to 8)

**How a run goes** (start, what you do, how it gets harder, how it ends; aim for 3-12 minutes):

**What you control** (keys, clicks; it must work with WASD/arrows and clicks, and on a phone with a thumb stick
and taps):

**The swarm's cast in it** (shiller, clone, mini, fud, rug, extractor, influencer, kol), and anything new to draw:

**Teamwork** (what makes it better with friends):

**Rewards** (what earns $SWARM, roughly; OG Club sets the final numbers, at most 300 a run):

**Must not** (anything to avoid):

**Like, but different from** (games it should feel a bit like; never copy their names, art or characters):

---

## For the builder

1. `npm run new <id> <prefix>` and build from the template; read `games/siege` and `games/runpepe` for bigger
   patterns (builders and mazes; levels, skills, items, a swarm stepped from a seed).
2. Keep the rules in `rules.js`, tested; the round thin; the browser module drawing only.
3. `npm test`, `npm run check`, `npm run sim` must pass. Play it in `npm run play` with bots and lag.
4. Open a pull request with: what the game is, how long a run lasts, what `npm run sim` says, and a screenshot.
