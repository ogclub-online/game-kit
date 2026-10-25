# LAVA RING

A five-round free-for-all in the Watcher's arena for one to eight players. Solo fills seats with bots. The last fighter standing wins a round; the most round wins takes the run. Players knocked out become spectators until the next round.

## Feel and combat

The stone plays like ice: movement keys accelerate the Pepe, releasing them leaves momentum, and reversing takes time. FUD BLAST and RUG YANK now carry substantial knockback; getting hit briefly weakens steering. Damage adds extra force, so a hurt fighter near the edge can be sent into lava. The lava burns 28 HP per second. The arena contracts every 15 seconds, and an outer boundary keeps the entire fight within the visible lava band.

Projectiles now have a brighter core, dark outline and trails. Hits have flashes, impact rays, damage numbers and sound; entering lava triggers a splash and a clear HUD warning. The stone and magma use layered color and fractures. The phone spell bar is compact so the arena stays visible.

## Run and rewards

Five rounds, each at most 80 seconds, with a 15-second shop between rounds. Three spell slots; six spells with three ranks each. Q casts FUD BLAST, E/R/F cast purchased spells. On a phone, drag the stick and tap the arena to aim. The reward remains 10 $SWARM per round won and 3 per knockout, capped at 120 per run, subject to World integration.

## Verification

The kit checks pass. The actual Node test suite passes 39/39 tests, including slippery movement, hard blast and lava assertions. The balance simulation has zero idle wins and finishes five rounds for the four-player trying scenario. Desktop solo, 80 ms lag co-op and phone screenshots were reviewed and used to fix an arena-edge and phone-layout problem.
