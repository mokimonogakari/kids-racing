import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../js/race.js';
test('five collected stars grant one boost, without farming an already collected item', () => {
  const rewards = [];
  const r = new Race({course:'meadow', vehicle:'car', seed:1, hooks:{starReward:n=>rewards.push(n)}});
  const s = r.course.segments[2];
  s.items = Array.from({length:5}, () => ({kind:'star', id:'star', x:0, taken:false}));
  s.obstacles = []; s.boost = null;
  r.checkTrack(400, 400);
  assert.equal(r.stars, 5); assert.deepEqual(rewards, [5]); assert.equal(r.player.boost, 2.2);
  r.checkTrack(400, 400);
  assert.equal(r.stars, 5); assert.deepEqual(rewards, [5]);
});
