import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../rules.js';
import { simulate } from '../sim.js';

test('five rounds, creeping edge, lava, ghost and capped reward', () => {
  const g = L.createGame(2); L.addPlayer(g, 1); L.begin(g);
  assert.equal(g.fighters.size, 4);
  assert.equal(L.radius(g), L.C.RADIUS);
  g.elapsed = 15; assert.equal(L.radius(g), L.C.RADIUS - L.C.CREEP);
  const p = g.fighters.get(1); p.x = 44; p.y = 32; p.hp = 1;
  L.stepGame(g, 0.1);
  assert.equal(p.alive, false);
  assert.equal(p.hp, 0);
  assert.equal(L.lavaReward({ roundsWon: 999, knockouts: 999 }), 120);
});

test('the Watcher stops a fireball between fighters', () => {
  const g = L.createGame(7); L.addPlayer(g, 1); L.addPlayer(g, 2); L.begin(g);
  for (const id of [...g.fighters.keys()]) if (id < 0) g.fighters.delete(id);
  const a = g.fighters.get(1), b = g.fighters.get(2);
  a.x = 28; a.y = 32; b.x = 36; b.y = 32;
  assert.equal(L.cast(g, 1, 0, b.x, b.y), true);
  for (let i = 0; i < 20; i++) L.stepGame(g, 0.05);
  assert.equal(b.hp, 100);
  assert.equal(g.projectiles.length, 0);
});

test('RUG YANK follows the aim and pulls only a target in its path', () => {
  const g = L.createGame(8); L.addPlayer(g, 1); L.addPlayer(g, 2); L.begin(g);
  for (const id of [...g.fighters.keys()]) if (id < 0) g.fighters.delete(id);
  const a = g.fighters.get(1), b = g.fighters.get(2);
  a.x = 26; a.y = 29; b.x = 30; b.y = 29;
  a.slots[0] = 0; a.ranks[0] = 1;
  assert.equal(L.cast(g, 1, 1, 20, 29), true);
  assert.equal(b.hp, 100);
  a.cd[1] = 0;
  assert.equal(L.cast(g, 1, 1, 30, 29), true);
  assert.ok(b.hp < 100);
  assert.ok(b.vx < 0);
});

test('shop limits slots and ranks; watcher blocks blink landing', () => {
  const g = L.createGame(4); L.addPlayer(g, 1); L.begin(g);
  const p = g.fighters.get(1); g.phase = 'shop'; p.gold = 1000;
  assert.equal(L.buy(g, 1, 0), true);
  assert.equal(L.buy(g, 1, 1), true);
  assert.equal(L.buy(g, 1, 2), true);
  assert.equal(L.buy(g, 1, 3), false);
  assert.equal(L.buy(g, 1, 0), true); assert.equal(L.buy(g, 1, 0), true);
  assert.equal(L.buy(g, 1, 0), false);
  assert.deepEqual(p.slots, [0, 1, 2]);
  assert.equal(L.watcher(32, 32), true);
});

test('idle never wins, trying makes progress', () => {
  for (const players of [1, 2, 4]) {
    const idle = simulate({ players, skill: 0, seed: 2 });
    const trying = simulate({ players, skill: 1, seed: 2 });
    assert.equal(idle.won, false);
    assert.ok(trying.progress > 0, `${players} players made no progress`);
    assert.ok(trying.seconds >= 60 && trying.seconds <= 500);
  }
});
