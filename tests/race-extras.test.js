import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../js/race.js';
import { makePlayer, stepPlayer, SPEED_PRESETS } from '../js/physics.js';

const DT = 1 / 30;

function startRace(opts = {}, hooks = {}) {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 300, seed: 3, rivals: 'normal', hooks, ...opts });
  while (r.state === 'countdown') r.update(DT, { steer: 0 });
  return r;
}

/** Park every rival far away so none of them interferes, then place the chosen ones. */
function parkRivals(race) {
  for (const rv of race.rivals) {
    rv.z = -50000;
    rv.x = 1.5;
    rv.speed = 0;
    rv.skill = 0;
    rv.reaction = 1e9; // never starts driving
  }
}

test('slipstream: sitting right behind a rival in the same lane gives a pull and fires the hook', () => {
  let fired = 0;
  const race = startRace({}, { slipstream: () => fired++ });
  parkRivals(race);
  const p = race.player;
  const lead = race.rivals[0];
  lead.reaction = 1e9;
  for (let t = 0; t < 1.2; t += DT) {
    // keep the rival glued 200 ahead, same x
    lead.z = p.z + 200;
    lead.x = p.x;
    race.update(DT, { steer: 0 });
  }
  assert.ok(p.slip > 0, 'slip timer is running');
  assert.equal(fired, 1, 'hook fired once');
  // the pull is real: target speed is above the normal top speed
  const q = makePlayer();
  q.speed = SPEED_PRESETS.slow.maxSpeed;
  q.slip = 1.2;
  for (let i = 0; i < 30; i++) stepPlayer(q, { steer: 0 }, DT, { preset: SPEED_PRESETS.slow });
  assert.ok(q.speed > SPEED_PRESETS.slow.maxSpeed * 1.05, 'about 8% faster');
  // and it fades on its own
  for (let i = 0; i < 90; i++) stepPlayer(q, { steer: 0 }, DT, { preset: SPEED_PRESETS.slow });
  assert.equal(q.slip, 0);
  assert.ok(q.speed <= SPEED_PRESETS.slow.maxSpeed * 1.001);
});

test('slipstream does not trigger when not tucked in, and respects the 3 s gap', () => {
  let fired = 0;
  const race = startRace({}, { slipstream: () => fired++ });
  parkRivals(race);
  const p = race.player;
  const lead = race.rivals[0];
  for (let t = 0; t < 1.5; t += DT) {
    lead.z = p.z + 200;
    lead.x = p.x + 1.4; // other side of the road: no draft
    race.update(DT, { steer: 0 });
  }
  assert.equal(fired, 0);
  assert.equal(p.slip, 0);
  for (let t = 0; t < 3.5; t += DT) {
    lead.z = p.z + 200;
    lead.x = p.x;
    race.update(DT, { steer: 0 });
  }
  assert.equal(fired, 1, 'only once within the gap');
  for (let t = 0; t < 2; t += DT) {
    lead.z = p.z + 200;
    lead.x = p.x;
    race.update(DT, { steer: 0 });
  }
  assert.equal(fired, 2, 'fires again after the gap');
});

test('rankStable fires once when a position holds, not on a brief swap', () => {
  const stable = [];
  const race = startRace({}, { rankStable: (n) => stable.push(n) });
  parkRivals(race);
  const p = race.player;
  const a = race.rivals[0];
  // one rival far ahead: rank 2, hold it for a second
  for (let t = 0; t < 1; t += DT) {
    a.z = p.z + 5000;
    a.x = 1.5;
    race.update(DT, { steer: 0 });
  }
  assert.deepEqual(stable, [2]);
  // a brief swap (0.3 s at rank 1) then back to rank 2: no new announcement
  for (let t = 0; t < 0.3; t += DT) {
    a.z = p.z - 5000;
    race.update(DT, { steer: 0 });
  }
  assert.equal(race.rank, 1);
  for (let t = 0; t < 1; t += DT) {
    a.z = p.z + 5000;
    race.update(DT, { steer: 0 });
  }
  assert.deepEqual(stable, [2], 'the flicker was not announced, and rank 2 is not repeated');
  // a real pass that holds: announced once
  for (let t = 0; t < 1; t += DT) {
    a.z = p.z - 5000;
    race.update(DT, { steer: 0 });
  }
  assert.deepEqual(stable, [2, 1]);
});

test('result().positions is consistent with order and rank', () => {
  let result = null;
  const race = new Race({ course: 'sea', vehicle: 'bus', length: 200, seed: 11, rivals: 'easy', hooks: { goal: (res) => (result = res) } });
  for (let t = 0; t < 300 && race.state !== 'goal'; t += DT) race.update(DT, { steer: 0 });
  assert.equal(race.state, 'goal');
  assert.ok(result);
  const pos = result.positions;
  assert.equal(pos.length, 6);
  assert.deepEqual(pos.map((e) => e.rank), [1, 2, 3, 4, 5, 6], 'ranks are 1..6 without duplicates');
  assert.deepEqual(pos.map((e) => e.id), result.order.map((e) => e.id), 'same order as result.order');
  const me = pos.find((e) => e.id === 'player');
  assert.ok(me, 'player is included');
  assert.equal(me.rank, result.rank, 'player rank matches result.rank');
  assert.equal(race.finalRank, result.rank);
  // rivals keep driving and may pass the stopped player after the goal; the result is frozen
  for (let t = 0; t < 30; t += DT) race.update(DT, { steer: 0 });
  assert.equal(race.result().rank, result.rank);
  assert.ok(race.rivals.every((r) => r.finished), 'everyone eventually crosses the line');
});
