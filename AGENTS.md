# For AI agents working in this repository

This repository is the OG Club World game kit: you build games in `games/<id>/` that plug into OG Club World.

- Read [BUILDING_A_GAME.md](BUILDING_A_GAME.md) first. It has the contract (what each file exports), the rules a
  game must keep (no network, wallets, storage, HTML strings or outside code; imports only from its folder and four
  engine files), and the checklist.
- Start new games with `npm run new <id> <prefix>`; learn from `games/template` (small, every file commented),
  then `games/siege` and `games/runpepe`.
- Don't change `engine/` or `scripts/` in a game's pull request. If the engine needs something, say so in the pull
  request description.
- Before you finish: `npm test`, `npm run check` and `npm run sim` pass, and you've looked at the game running in
  `npm run play` (screenshot it).
- Node 22, no dependencies to install.
- The step-by-step route is the `ogclub-game` skill: [plugins/ogclub-game/skills/ogclub-game/SKILL.md](plugins/ogclub-game/skills/ogclub-game/SKILL.md)
  (Claude Code loads it from `.claude/skills/`). Its `scripts/shot.mjs <id>` screenshots a game solo, co-op and at
  phone width.
