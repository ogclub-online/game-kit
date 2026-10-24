// SWARM SIEGE's round, run the way the world runs it (engine/local.js): join, build, upgrade, the waves, results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalServer } from '../../../engine/local.js';
import { Round } from '../round.js';
import { idx, siegeReward } from '../rules.js';

test('co-op: a friend joins, each builds in their own lane, a wave comes, the run is recorded', () => {
  const s = new LocalServer(Round, { mode: 'coop', seed: 7 });
  const a = s.open(11), b = s.join(12);
  assert.equal(s.last(a.id, 'sgw').grid, 42);
  assert.equal(s.last(a.id, 'sgroster').r.length, 2);
  s.message(a.id, { t: 'arenaGo' });
  s.run(2);
  assert.equal(s.round.state, 'running');
  s.message(a.id, { t: 'sgbuild', x: 18, y: 4 });
  s.message(b.id, { t: 'sgbuild', x: 18, y: 3 });
  assert.equal(s.last(b.id, 'err').code, 'SIEGE_NOT_YOUR_LANE');
  s.run(5);
  assert.deepEqual(s.last(a.id, 'sgf').tw.map((t) => [t[0], t[1]]), [[idx(18, 4), 'wall']]);
  s.message(a.id, { t: 'sgup', x: 18, y: 4, k: 'laser' });
  s.run(0.1);
  assert.equal(s.last(a.id, 'sgf').tw[0][1], 'laser');
  s.message(a.id, { t: 'sgnext' });
  s.run(3);
  assert.equal(s.last(a.id, 'sgwave').wave, 1);
  assert.ok(s.all(b.id, 'sgs').some((m) => m.c.length > 0), 'creeps on the way');
  s.round.poke('end');
  s.run(0.1);
  const end = s.last(a.id, 'sgend');
  assert.equal(end.pay, siegeReward({ reached: 1, won: false }));
  assert.equal(s.records.length, 2, 'both players recorded');
});
