// COIN DASH's rules, tested without a browser or a server: that's why the rules are plain functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../rules.js';
import { simulate } from '../sim.js';

test('walking over a coin grabs it; a bot makes you dizzy; the Watcher is solid', () => {
  const g = C.createGame(1); C.addPlayer(g, 1); C.begin(g);
  const p = g.players.get(1);
  g.bots.length = 0;
  g.coins = [{ id: 99, x: p.x + 0.3, y: p.y }];
  C.stepGame(g, 0.05);
  assert.equal(p.coins, 1); assert.equal(g.score, 1);
  assert.equal(g.coins.length, C.ROUND.COINS, 'a new one pops up');
  g.bots.push({ id: 1, x: p.x, y: p.y, vx: 0, vy: 0 });
  C.stepGame(g, 0.05);
  assert.ok(p.dizzy > 0);
  assert.equal(C.free(32, 32), false);
});

test('balance: an idle team never wins, a trying one gets there', () => {
  for (const players of [1, 2, 4]) {
    assert.equal(simulate({ players, skill: 0 }).won, false);
    const r = simulate({ players, skill: 1, seed: 3 });
    assert.ok(r.progress >= r.of * 0.6, `${players} players: ${r.progress} of ${r.of}`);
  }
});

test('the reward is capped', () => {
  assert.equal(C.coinReward({ coins: 1000, won: true }), 40);
  assert.equal(C.coinReward({ coins: 7, won: false }), 3);
});
