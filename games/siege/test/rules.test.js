// SWARM SIEGE: four lanes into a shared Mixer, blocks that bend the way, towers, live re-routing, lane gold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../rules.js';

const { idx, SPAWNS } = G;
function game(players = 1) { const g = G.createGame(1); for (let i = 1; i <= players; i++) G.addPlayer(g, i); G.begin(g); return g; }
const pathLen = (g, lane) => g.flows[lane] [idx(...SPAWNS[lane])];
const run = (g, secs) => { for (let t = 0; t < secs && !g.over; t += G.ROUND.STEP) G.stepGame(g, G.ROUND.STEP); };
const tower = (g, x, y, kind, owner = 1) => {
  const p = g.players.get(owner) ; p.gold += 1000;
  assert.equal(G.buildWall(g, owner, x, y), true, `wall at ${x},${y}`);
  for (const k of chain(kind)) assert.equal(G.upgrade(g, owner, idx(x, y), k), true);
};
const chain = (kind)=> (kind === 'wall' ? [] : [...chain(G.TOWERS[kind                         ].from ), kind]);

test('the field: a plus of four lanes round the Mixer, the Watcher in the middle on the town\'s Watcher tiles', () => {
  assert.equal(G.zone(20, 0), 0); assert.equal(G.zone(41, 20), 1); assert.equal(G.zone(21, 41), 2); assert.equal(G.zone(0, 21), 3);
  assert.equal(G.zone(20, 20), 4); assert.equal(G.zone(2, 2), -1, 'corners are walkways');
  assert.deepEqual([G.CORE[0] + G.FO, G.CORE[0] + G.FO], [31, 31]);
  // Every lane is the same lane turned.
  for (let k = 0; k < 4; k++) for (let y = 0; y < G.GRID; y++) for (let x = 0; x < G.GRID; x++) {
    const z = G.zone(x, y), [tx, ty] = G.turn([x, y], 1, 41), tz = G.zone(tx, ty);
    assert.equal(tz, z < 0 || z === 4 ? z : (z + 1) % 4);
  }
  const g = game(4);
  assert.deepEqual(g.lanes, [1, 3, 2, 4], 'two players face each other');
  for (let i = 0; i < 4; i++) assert.equal(pathLen(g, i), 20);
});

test('blocks bend the way but can never wall it in; lanes are their player\'s, the Mixer is everyone\'s', () => {
  const g = game(2);
  const before = pathLen(g, 0);
  for (let x = 16; x <= 26; x++) assert.equal(G.buildWall(g, 1, x, 5), true);
  assert.ok(pathLen(g, 0) > before, 'longer round the row');
  assert.equal(G.whyNot(g, 1, 15, 5), 'BLOCKS', 'the last gap stays open');
  assert.equal(G.whyNot(g, 2, 20, 8), 'NOT_YOUR_LANE');
  assert.equal(G.whyNot(g, 2, 15, 15), null, 'anyone builds in the Mixer');
  assert.equal(G.whyNot(g, 1, 20, 1), 'NO_BUILD', 'not by a spawn');
  assert.equal(G.whyNot(g, 1, 22, 22), 'NO_BUILD', 'not by the Watcher');
  assert.equal(G.whyNot(g, 1, 38, 20), 'NO_BUILD', 'a closed lane');
  // The lane's player leaves: it's anyone's, and so is what they built.
  G.removePlayer(g, 1);
  assert.equal(g.lanes[0], 0);
  assert.equal(G.whyNot(g, 2, 20, 8), null);
  assert.equal(G.upgrade(g, 2, idx(16, 5), 'laser'), true);
});

test('creeps walk the maze and re-route live round a block built in front of them', () => {
  const g = game(1);
  g.next = 0; run(g, 3);
  const k = g.creeps[0];
  assert.ok(k && k.y > 1, 'on its way down the lane');
  const before = g.leaks;
  // A row across in front of it (one gap at the side).
  const row = Math.floor(k.y) + 3;
  for (let x = 16; x <= 26; x++) if (G.whyNot(g, 1, x, row) === null) { g.players.get(1) .gold += 5; G.buildWall(g, 1, x, row); }
  assert.ok(g.cells[idx(20, row)], 'built across its way');
  run(g, 40);
  assert.ok(g.leaks > before, 'it still found the way and got through');
  assert.equal(g.lives, G.ROUND.LIVES - g.leaks);
});

test('lane gold: every creep from your lane pays you, whoever kills it; waves pay everyone, with interest', () => {
  const g = game(2);
  // Player 2's tower in the Mixer kills player 1's creeps (lane 0, coming from the north).
  tower(g, 19, 16, 'laser2', 2); tower(g, 22, 16, 'laser2', 2);
  const g1 = g.players.get(1) , g2 = g.players.get(2) ;
  g1.gold = 500; g2.gold = 0;
  G.startWave(g);
  assert.equal(g1.gold, 500 + G.waveIncome(1) + Math.min(G.ROUND.INTEREST_MAX, Math.floor(500 * G.ROUND.INTEREST)));
  const after = g1.gold, g2After = g2.gold;
  run(g, 30);
  const killsFromNorth = g.kills - g.leaks * 0;
  assert.ok(killsFromNorth > 0);
  assert.ok(g1.gold > after, 'paid for the creeps from their lane');
  assert.ok(g2.kills > 0, 'player 2 made the kills');
  void g2After;
  // Tips.
  assert.equal(G.tip(g, 1, 2, 25), true);
  assert.equal(G.tip(g, 2, 1, 1e6), 'GOLD');
});

test('towers: invisible creeps need an Oracle, Airdrops can\'t hit flyers, splitters split, slows slow', () => {
  // Wave 9 is invisible.
  const g = game(1);
  tower(g, 19, 8, 'laser2'); tower(g, 22, 8, 'laser2');
  g.wave = 8; g.next = 0; run(g, 25);
  assert.equal(g.kills, 0, 'nothing sees them');
  const h = game(1);
  tower(h, 19, 8, 'laser2'); tower(h, 22, 8, 'oracle');
  h.wave = 8; h.next = 0; run(h, 25);
  assert.ok(h.kills > 0, 'the Oracle shows them to every tower');
  // Flyers (wave 5) and an Airdrop.
  const f = game(1);
  tower(f, 19, 10, 'drop2');
  f.wave = 4; f.next = 0; run(f, 30);
  assert.equal(f.kills, 0);
  // Splitters (wave 7): two splinters each.
  const s = game(1);
  tower(s, 19, 6, 'laser2'); tower(s, 22, 6, 'laser2');
  s.wave = 6; s.next = 0; run(s, 4);
  const killedSplitters = s.events.filter((e) => e[0] === 'die').length;
  assert.ok(killedSplitters > 0);
  assert.ok(s.creeps.some((k) => k.type === 0), 'splinters walking on');
  // Cold Wallet.
  const c = game(1);
  tower(c, 19, 6, 'cold');
  c.next = 0;
  let hitId = 0;
  for (let i = 0; i < 400 && !hitId; i++) { G.stepGame(c, G.ROUND.STEP); hitId = (c.events.find((e) => e[0] === 'hit')?.[2]) ?? 0; c.events.length = 0; }
  assert.ok(c.creeps.find((k) => k.id === hitId) .slowUntil > c.t, 'slowed');
});

test('a boss costs five lives, the last one ten; lives grow with lanes', () => {
  assert.equal(G.leakCost(10, true), 5); assert.equal(G.leakCost(30, true), 10); assert.equal(G.leakCost(12, false), 1);
  assert.equal(game(1).lives, 20); assert.equal(game(4).lives, 50);
  const late = game(1); late.wave = 2; G.addPlayer(late, 2);
  assert.deepEqual([late.lanes[2], late.lives], [2, 30], 'a late joiner opens a closed lane, with its lives');
  const early = G.createGame(1); G.addPlayer(early, 1); G.addPlayer(early, 2); G.removePlayer(early, 2);
  assert.equal(early.lanes[2], -1, 'leaving before the start closes the lane');
  assert.equal(G.siegeReward({ reached: 12, won: false }), 72); assert.equal(G.siegeReward({ reached: 30, won: true }), 260);
});

test('builders walk to the spot and build; orders need gold and can\'t stack on one cell', () => {
  const g = game(2);
  assert.equal(G.orderBuild(g, 1, 18, 4), true);
  assert.equal(G.orderBuild(g, 2, 18, 4), 'NOT_YOUR_LANE');
  assert.equal(G.orderBuild(g, 1, 18, 4), 'TAKEN');
  for (let i = 0; i < 100; i++) G.stepBuilders(g, 0.05);
  assert.equal(g.towers.get(idx(18, 4))?.kind, 'wall');
  g.players.get(1) .gold = 4;
  assert.equal(G.orderBuild(g, 1, 19, 4), 'GOLD');
});

// ---------------------------------------------------------------- the round on the server
