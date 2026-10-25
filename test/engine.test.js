// Every game in games/ runs the way the world will run it: solo and co-op rounds through engine/local.js (all
// messages through JSON), a bot pressing keys and clicking about, no crashes, messages only with the game's prefix,
// and a proper record at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalServer } from '../engine/local.js';
import { allGames } from '../scripts/games.js';

// The kit's games and any in the inbox (dist/games/).
for (const { id, dir } of allGames()) {
  const m = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
  for (const mode of m.modes) {
    test(`${m.name} (${mode}): plays 40 seconds of random keys and clicks, then ends and records`, async () => {
      const { Round } = await import(pathToFileURL(join(dir, 'round.js')).href);
      const s = new LocalServer(Round, { mode, seed: 9 });
      const a = s.open(11), mates = mode === 'coop' ? [s.join(12)].filter(Boolean) : [];
      s.message(a.id, { t: 'arenaGo' });
      let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 40 * 20 && s.round; i++) {
        if (i % 7 === 0) for (const p of [a, ...mates]) s.message(p.id, rnd() < 0.5 ? { t: 'dir', dx: Math.floor(rnd() * 3) - 1, dy: Math.floor(rnd() * 3) - 1 } : { t: 'walk', x: Math.floor(rnd() * 64), y: Math.floor(rnd() * 64) });
        s.tick(0.05);
      }
      for (const p of [a, ...mates]) for (const msg of s.inbox.get(p.id)) assert.ok(msg.t.startsWith(m.prefix) || ['err', 'pong'].includes(msg.t), `${id} sent "${msg.t}" without its prefix "${m.prefix}"`);
      if (s.round) { s.round.poke('end'); s.tick(0.05); }
      assert.ok(s.records.length >= 1, 'the round asks the world to record the run');
      for (const r of s.records) { assert.ok(r.address && Number.isInteger(r.pepeId), 'each result names the player (address, character)'); assert.equal(typeof r.won, 'boolean'); }
      // Leaving works, and the results screen ends.
      for (let i = 0; i < 20 * 15 && s.round; i++) s.tick(0.05);
      assert.equal(s.round, null);
    });
  }
}
