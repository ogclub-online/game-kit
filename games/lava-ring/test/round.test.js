import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalServer } from '../../../engine/local.js';
import { Round } from '../round.js';

test('solo starts, validates messages and records a result', () => {
  const s = new LocalServer(Round, { mode: 'solo', seed: 3 });
  const a = s.open(11);
  assert.ok(s.last(a.id, 'lrw'));
  s.run(4); assert.equal(s.round.state, 'running');
  s.message(a.id, { t: 'lrcast', slot: 0, x: 'bad', y: 33 });
  assert.equal(s.round.g.fighters.get(a.id).cd[0], 0);
  s.message(a.id, { t: 'lrcast', slot: 0, x: 32, y: 32 });
  assert.ok(s.round.g.fighters.get(a.id).cd[0] > 0);
  s.round.poke('end'); s.run(0.1);
  assert.ok(s.last(a.id, 'lrend'));
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0].won, false);
});

test('co-op joins and reload receives full state and end card', () => {
  const s = new LocalServer(Round, { mode: 'coop', seed: 3 });
  const a = s.open(11), b = s.join(12);
  assert.ok(b); assert.equal(s.last(b.id, 'lrw').r.length, 2);
  s.message(a.id, { t: 'arenaGo' }); s.run(2);
  assert.equal(s.join(13), null);
  s.round.poke('end'); s.run(0.1);
  const before = s.all(a.id, 'lrend').length;
  s.round.goOffline(a); assert.ok(s.round.rejoin(a, s.now));
  assert.equal(s.all(a.id, 'lrend').length, before + 1);
  assert.equal(s.last(a.id, 'lrw').st, 'ended');
});
