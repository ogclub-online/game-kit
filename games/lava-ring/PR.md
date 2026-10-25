# LAVA RING (inbox game)

LAVA RING is a free-for-all knockback arena around the Watcher. Each Pepe has 100 HP, fires FUD BLAST, and tries to push the others into lava as the stone edge moves inward every 15 seconds. The last active Pepe standing takes a round. Solo fills to four fighters with influencer and kol caster bots; a co-op lobby can hold up to eight players, who fight each other. Bots fill empty seats up to four. Eliminated Pepes watch the rest of the round as ghosts.

A run is five rounds of at most 80 seconds with a 15-second shop after the first four rounds. The full clock is at most 7 minutes 40 seconds of combat and shopping, plus the lobby countdown and results. Knockouts usually shorten it; the balance simulation reports roughly 6–7 minutes. Survival, damage, knockouts and round wins award gold. The shop offers three slots for six spells with three ranks each; it shows every rank's effect and the next cost. Q fires FUD BLAST, E/R/F cast the bought spells, and 1–6 buy in the shop. A thumb stick plus arena taps supports phones. A run winner has the most round wins, with knockouts breaking ties. $SWARM pays 10 per round won and 3 per knockout, capped at 120.

`npm run sim` printed for LAVA RING:

```
1 player   trying: 3.3 of 5 rounds (won 2/3, ~7 min)  idle: 0
2 players  trying: 3.0 of 5 rounds (won 2/3, ~6 min)  idle: 0
4 players  trying: 5.0 of 5 rounds (won 3/3, ~6 min)  idle: 0
```

Choices made: a round times out at 80 seconds and awards its win to the active survivor with the most HP; if nobody was active, there is no winner. Rank purchases cost 18–34 gold, and owned spells can be upgraded within the three-slot limit. FUD BLAST has a 3.8-second cooldown, and the other spells have 7–10-second cooldowns. The Watcher blocks projectiles and movement. Bots improve their aiming and reaction timing by round. The full run remains free-for-all in co-op. No engine changes are needed.

This is an **inbox game** in `dist/games/lava-ring/` because this task permits only built-site changes. A reviewer can move the folder to `games/lava-ring/` after review.
