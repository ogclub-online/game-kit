// COIN DASH's round, run the way the world runs it (engine/local.js): every message goes through JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalServer } from '../../../engine/local.js';
import { Round } from '../round.js';

test('solo: counts down, runs, sends the state ten times a second, ends and records', () => {
  const s = new LocalServer(Round, { mode: 'solo', seed: 2 });
  const a = s.open(11);
  assert.ok(s.last(a.id, 'cdw'));
  s.run(4);
  assert.equal(s.round.state, 'running');
  const before = s.round.g.players.get(a.id).x;
  s.message(a.id, { t: 'dir', dx: 1, dy: 1 });
  s.run(1);
  assert.ok(s.round.g.players.get(a.id).x > before, 'D+S walks +x');
  assert.ok(s.all(a.id, 'cds').length >= 15);
  s.message(a.id, { t: 'walk', x: 999, y: 'no' }); // junk is ignored
  s.round.poke('end'); s.run(0.1);
  assert.ok(s.last(a.id, 'cdend'));
  assert.equal(s.records.length, 1);
  s.run(13);
  assert.equal(s.round, null, 'the results screen ended');
});

test('co-op: friends join during the countdown, not after', () => {
  const s = new LocalServer(Round, { mode: 'coop' });
  const a = s.open(11);
  assert.ok(s.join(12));
  s.message(a.id, { t: 'arenaGo' }); s.run(2);
  assert.equal(s.join(13), null);
});

test('a reload during the results screen gets the welcome and the end card again', () => {
  const s = new LocalServer(Round, { mode: 'solo', seed: 3 });
  const a = s.open(11);
  s.run(4); s.round.poke('end'); s.run(0.1);
  const p = s.people.get(a.id), before = s.all(a.id, 'cdend').length;
  s.round.goOffline(p);
  assert.ok(s.round.rejoin(p, s.now));
  assert.equal(s.all(a.id, 'cdend').length, before + 1);
  assert.equal(s.last(a.id, 'cdw').st, 'ended');
});
