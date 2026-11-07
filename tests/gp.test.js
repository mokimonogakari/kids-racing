import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrandPrix, formatGap, GP_POINTS, GP_COURSES } from '../js/gp.js';

const order = (...ids) => ({ order: ids.map((id) => ({ id, finished: true })) });

test('points follow the finishing order of each race', () => {
  const gp = createGrandPrix();
  assert.deepEqual(gp.courses, GP_COURSES);
  assert.deepEqual(GP_COURSES, ['meadow', 'sea', 'city', 'snow'], 'four-race cup with the night city');
  assert.equal(gp.round, 0);
  gp.addResult(order('player', 'bear', 'rabbit', 'frog', 'pig', 'cat'));
  assert.equal(gp.points.player, 10);
  assert.equal(gp.points.bear, 8);
  assert.equal(gp.points.cat, 1);
  assert.equal(gp.round, 1);
  assert.equal(gp.results.length, 1);
  gp.addResult(order('bear', 'player', 'cat', 'frog', 'pig', 'rabbit'));
  assert.equal(gp.points.player, 18);
  assert.equal(gp.points.bear, 18);
  assert.equal(gp.points.cat, 7);
  gp.addResult(order('rabbit', 'bear', 'player', 'cat', 'frog', 'pig'));
  assert.equal(gp.points.bear, 26);
  assert.equal(gp.points.player, 24);
  assert.equal(gp.points.rabbit, 6 + 1 + 10);
  const s = gp.standings();
  assert.deepEqual(s.map((r) => r.id).slice(0, 3), ['bear', 'player', 'rabbit']);
  assert.deepEqual(s.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
  assert.equal(s[0].points, 26);
  assert.equal(s[0].best, 1);
  assert.equal(gp.playerRank(), 2);
  assert.ok(GP_POINTS.every((p, i) => i === 0 || p < GP_POINTS[i - 1]), 'points decrease with place');
});

test('ties: better best finish wins, then the most recent race', () => {
  const gp = createGrandPrix();
  // player and bear both end on 18 points; the player has a win (best 1), bear's best is 2.
  gp.addResult(order('player', 'bear', 'rabbit', 'frog', 'pig', 'cat')); // player 10, bear 8
  gp.addResult(order('rabbit', 'bear', 'player', 'frog', 'pig', 'cat')); // player 16, bear 16, rabbit 16
  gp.addResult(order('frog', 'cat', 'player', 'pig', 'bear', 'rabbit')); // player 22, bear 18, rabbit 17
  // bear 18 vs ... make a direct tie by checking an intermediate table instead:
  const g2 = createGrandPrix();
  g2.addResult(order('player', 'bear', 'rabbit', 'frog', 'pig', 'cat')); // player 10, bear 8
  g2.addResult(order('rabbit', 'bear', 'player', 'frog', 'pig', 'cat')); // player 16, bear 16, rabbit 16
  const s = g2.standings();
  assert.equal(s[0].points, 16);
  assert.equal(s[1].points, 16);
  assert.equal(s[2].points, 16);
  // best finishes: player 1, rabbit 1, bear 2 -> bear is third of the three
  assert.equal(s[2].id, 'bear');
  // player and rabbit both have best=1 and 16 points: the latest race decides (rabbit won it)
  assert.equal(s[0].id, 'rabbit');
  assert.equal(s[1].id, 'player');
  assert.equal(g2.playerRank(), 2);
  // the three-race table from above still ranks by points first
  assert.equal(gp.standings()[0].id, 'player');
});

test('rounds, next course, finished and reset', () => {
  const gp = createGrandPrix({ courses: ['sea', 'snow'] });
  assert.equal(gp.nextCourse(), 'sea');
  assert.equal(gp.isFinished(), false);
  gp.addResult(order('cat', 'player'));
  assert.equal(gp.nextCourse(), 'snow');
  gp.addResult(order('player', 'cat'));
  assert.equal(gp.nextCourse(), null);
  assert.equal(gp.isFinished(), true);
  assert.equal(gp.points.player, 18);
  assert.equal(gp.points.cat, 18);
  assert.equal(gp.playerRank(), 1, 'tie on points and best: the player won the latest race');
  gp.reset();
  assert.equal(gp.round, 0);
  assert.deepEqual(gp.results, []);
  assert.deepEqual(gp.points, {});
  assert.equal(gp.playerRank(), 0);
  assert.deepEqual(gp.standings(), []);
  assert.equal(gp.nextCourse(), 'sea');
  // empty / odd course lists fall back to the default
  assert.deepEqual(createGrandPrix({ courses: [] }).courses, GP_COURSES);
  assert.deepEqual(createGrandPrix().courses, GP_COURSES);
});

test('results without order but with positions, and junk, do not break the table', () => {
  const gp = createGrandPrix();
  gp.addResult({ positions: [{ id: 'bear', rank: 2 }, { id: 'player', rank: 1 }] });
  assert.equal(gp.points.player, 10);
  assert.equal(gp.points.bear, 8);
  gp.addResult(null);
  gp.addResult({});
  assert.equal(gp.round, 3);
  assert.equal(gp.playerRank(), 1);
  // more racers than point slots: extra racers simply score 0
  const g2 = createGrandPrix();
  g2.addResult(order('a', 'b', 'c', 'd', 'e', 'f', 'g'));
  assert.equal(g2.points.g, 0);
  assert.equal(g2.standings().length, 7);
});

test('formatGap', () => {
  assert.equal(formatGap(1.23), '+1.2');
  assert.equal(formatGap(2.98), '+3.0');
  assert.equal(formatGap(0), '+0.0');
  assert.equal(formatGap(-2), '+0.0');
  assert.equal(formatGap('x'), '+0.0');
  assert.equal(formatGap(undefined), '+0.0');
  assert.equal(formatGap(65), '+65.0');
});
