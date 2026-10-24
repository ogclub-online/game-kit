// RUN PEPE RUN's round, run the way the world runs it: keys move you, the level's seed goes out (your browser steps
// the same swarm), skills land on the swarm for everyone, clearing a level pays XP, the run is recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalServer } from '../../../engine/local.js';
import { Round } from '../round.js';
import { createSwarm, stepSwarm, addEffect } from '../rules.js';

test('a team run: the swarm the browser steps is the server\'s, keys run, XP and skills arrive live', () => {
  const s = new LocalServer(Round, { mode: 'coop', seed: 3 });
  const a = s.open(11), b = s.join(12);
  s.message(a.id, { t: 'arenaGo' });
  s.run(2);
  const lv = s.last(a.id, 'rplevel');
  assert.equal(lv.level, 1);
  // The browser's own swarm, from the seed in the welcome, matches the server's.
  const mine = createSwarm(s.last(a.id, 'rpw').seed, 1);
  while (mine.step < s.round.g.step - lv.at) stepSwarm(mine);
  assert.deepEqual(mine.creeps.map((k) => [k.x, k.y]), s.round.g.swarm.creeps.map((k) => [k.x, k.y]));
  // Keys run (D and S: along the top stretch, +x).
  const x0 = s.round.g.players.get(a.id).x;
  s.message(a.id, { t: 'dir', dx: 1, dy: 1 }); s.run(0.5); s.message(a.id, { t: 'dir', dx: 0, dy: 0 });
  assert.ok(s.round.g.players.get(a.id).x > x0);
  // A skill point, a skill, a cast: everyone hears where it landed, and their swarm takes it.
  s.round.g.players.get(a.id).points = 1;
  s.message(a.id, { t: 'rplearn', k: 'shove' });
  assert.deepEqual(s.last(a.id, 'rpme').sk.map((x) => x.slice(0, 2)), [['shove', 1]]);
  s.message(a.id, { t: 'rpcast', i: 0 });
  s.run(0.1);
  const sfx = s.all(b.id, 'rps').flatMap((m) => m.e).find((e) => e[0] === 'sfx');
  assert.ok(sfx);
  addEffect(mine, sfx.slice(1));
  while (mine.step < s.round.g.step - lv.at) stepSwarm(mine);
  assert.deepEqual(mine.creeps.map((k) => [k.x, k.y]), s.round.g.swarm.creeps.map((k) => [k.x, k.y]));
  // To the finish: the level's cleared, XP for everyone, and the run's recorded when it ends.
  const pa = s.round.g.players.get(a.id); pa.x = 9.5; pa.y = 18.5;
  s.run(0.2);
  assert.ok(s.all(b.id, 'rpme').some((m) => m.lvl === 2), 'everyone levels up on the first cleared level');
  s.round.poke('end'); s.run(0.1);
  assert.equal(s.last(a.id, 'rpend').cleared, 1);
  assert.equal(s.records.length, 2);
});
