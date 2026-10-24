// RUN PEPE RUN: a lap of the track, the swarm wandering the same way everywhere, downs, saves, levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rules.js';

test('the track: start, a stream, the finish just past it; only a whole lap gets there', () => {
  assert.ok(R.freeAt(9.5, 9.5)); assert.ok(R.freeAt(9.5, 18.5)); assert.ok(!R.freeAt(9.5, 13.9), 'the stream');
  assert.ok(!R.freeAt(31, 31), 'the middle is off the track');
  assert.ok(R.inSafe(54, 9) && R.inSafe(9, 9) && R.inFinish(9, 18) && !R.inSafe(30, 9));
  // A walk round the lap's corners stays on the track.
  for (const [a, b] of [[[9.5, 9.5], [54.5, 9.5]], [[54.5, 9.5], [54.5, 54.5]], [[54.5, 54.5], [9.5, 54.5]], [[9.5, 54.5], [9.5, 18.5]]]) {
    for (let k = 0; k <= 100; k++) assert.ok(R.freeAt(a[0] + (b[0] - a[0]) * k / 100, a[1] + (b[1] - a[1]) * k / 100));
  }
});

test('the swarm wanders the same way from the same seed, stays on its stretch and grows with the levels', () => {
  const a = R.createSwarm(42, 5), b = R.createSwarm(42, 5);
  for (let i = 0; i < 2000; i++) { R.stepSwarm(a); R.stepSwarm(b); }
  assert.deepEqual(a.creeps.map((c) => [c.x, c.y]), b.creeps.map((c) => [c.x, c.y]));
  for (const c of a.creeps) { const [x0, y0, x1, y1] = R.STRETCHES[c.si]; assert.ok(c.x - c.r >= x0 && c.x + c.r <= x1 && c.y - c.r >= y0 && c.y + c.r <= y1); assert.ok(!R.inSafe(c.x, c.y)); }
  assert.ok(R.createSwarm(1, 12).creeps.length > R.createSwarm(1, 1).creeps.length * 2);
});

function game(n) { const g = R.createGame(3); for (let i = 1; i <= n; i++) R.addPlayer(g, i); R.beginLevel(g, 1); return g; }
const steps = (g, n) => { for (let i = 0; i < n && !g.over; i++) R.stepGame(g); };

test('touched: down in a circle; a teammate running through it brings you back; everyone down ends the run', () => {
  const g = game(2);
  const a = g.players.get(1) , b = g.players.get(2) ;
  steps(g, 40);
  // Put A right on a creep, out of the safe corner.
  const c = g.swarm .creeps.find((k) => k.si === 0) ;
  a.x = c.x; a.y = c.y; a.safeUntil = 0;
  steps(g, 1);
  assert.equal(a.alive, false); assert.equal(a.downs, 1);
  assert.ok(g.events.some((e) => e[0] === 'down' && e[1] === 1));
  // B can't be touched for a moment (fresh back) and runs into A's circle.
  b.x = a.x + 0.5; b.y = a.y; b.safeUntil = g.step + 100;
  steps(g, 1);
  assert.equal(a.alive, true); assert.equal(b.saves, 1);
  // Both down: the run ends after a moment.
  a.alive = false; b.alive = false;
  steps(g, R.ROUND.END_STEPS + 3);
  assert.equal(g.over, true); assert.equal(g.won, false);
});

test('reaching the finish clears the level for everyone (the downed too); clearing twelve wins', () => {
  const g = game(2);
  g.players.get(2) .alive = false;
  const a = g.players.get(1) ; a.x = 9.5; a.y = 18.5;
  steps(g, 1);
  assert.equal(g.cleared, 1); assert.equal(g.players.get(2) .alive, true);
  steps(g, R.ROUND.BREAK_STEPS + 1);
  assert.equal(g.level, 2);
  assert.ok(R.inStart(a.x, a.y), 'back at the start');
  R.beginLevel(g, R.LEVELS); a.x = 9.5; a.y = 18.5;
  steps(g, R.ROUND.END_STEPS + 3);
  assert.equal(g.won, true); assert.equal(g.over, true);
  assert.equal(R.runReward({ cleared: 12, won: true, saves: 50 }), 12 * 12 + 80 + 40);
});

test('skills on the swarm replay exactly: a browser that ran ahead goes back and plays them in', () => {
  const srv = R.createSwarm(9, 6);
  for (let i = 0; i < 100; i++) R.stepSwarm(srv);
  // The browser is 15 steps ahead, keeping a copy every 10.
  const cli = R.createSwarm(9, 6), copies = new Map();
  for (let i = 0; i < 115; i++) { if (cli.step % 10 === 0) copies.set(cli.step, R.copySwarm(cli)); R.stepSwarm(cli); }
  const c0 = srv.creeps[0];
  const fx = [[srv.step, 'root', c0.x, c0.y, 3, 40], [srv.step, 'shove', c0.x + 1, c0.y, 2.5, 2], [srv.step, 'trap', c0.x, c0.y + 1, 400, 60], [srv.step, 'frost', c0.x, c0.y, 2.5, 60]];
  for (const e of fx) R.addEffect(srv, e);
  for (let i = 0; i < 300; i++) R.stepSwarm(srv);
  // The browser hears of them: back to the copy before, the effects in, forward again.
  for (const e of fx) R.addEffect(cli, e);
  const back = Math.floor(fx[0][0] / 10) * 10, again = copies.get(back) ;
  again.fx = cli.fx;
  while (again.step < srv.step) R.stepSwarm(again);
  assert.deepEqual(again.creeps.map((k) => [k.x, k.y]), srv.creeps.map((k) => [k.x, k.y]));
  const plain = R.createSwarm(9, 6); while (plain.step < srv.step) R.stepSwarm(plain);
  assert.notDeepEqual(plain.creeps.map((k) => [k.x, k.y]), srv.creeps.map((k) => [k.x, k.y]), 'the skills did something');
});

test('XP: first to the finish takes the tome; level ups are skill points; four skills, rank three; items in six slots', () => {
  const g = game(2);
  const a = g.players.get(1) , b = g.players.get(2) ;
  a.x = 9.5; a.y = 18.5;
  steps(g, 1);
  assert.equal(a.lvl, 2, 'the tome and the level'); assert.equal(a.points, 1); assert.equal(b.lvl, 2, 'a cleared level is a level up for everyone at first');
  assert.ok(g.events.some((e) => e[0] === 'xp' && e[1] === 2));
  assert.equal(R.learn(g, 1, 'root'), true); assert.equal(R.learn(g, 1, 'root'), 'NOT_NOW', 'no points left');
  a.points = 20;
  for (const k of ['frost', 'shove', 'blink']) assert.equal(R.learn(g, 1, k), true);
  assert.equal(R.learn(g, 1, 'sprint'), 'FOUR_SKILLS');
  assert.equal(R.learn(g, 1, 'root'), true); assert.equal(R.learn(g, 1, 'root'), true); assert.equal(R.learn(g, 1, 'root'), 'MAX_RANK');
  steps(g, R.ROUND.BREAK_STEPS + 1);
  // Root: lands on the swarm's next step, and has a cooldown.
  const fx = g.fx.length;
  assert.equal(R.cast(g, 1, 0), true); assert.equal(R.cast(g, 1, 0), 'COOLDOWN');
  assert.equal(g.fx.length, fx + 1); assert.equal(g.fx.at(-1) [1], 'root');
  // Blink moves you along the track, not off it.
  a.x = 20; a.y = 9.5; a.lastV = [1, 0];
  assert.equal(R.cast(g, 1, 3), true); assert.ok(a.x > 22 && R.freeAt(a.x, a.y));
  // Items: walk over one, it goes in a slot; a shield charm takes a hit.
  g.items = [[99, 'charm', a.x, a.y]];
  steps(g, 1);
  assert.deepEqual(a.inv[0], ['charm', 1]);
  const c = g.swarm .creeps.find((k) => k.si === 0) ; a.x = c.x; a.y = c.y; a.safeUntil = 0;
  steps(g, 1);
  assert.equal(a.alive, true); assert.equal(a.inv[0], null, 'the charm broke');
});
