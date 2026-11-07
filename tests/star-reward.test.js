import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race, BOOST_STARS, BOOST_AUTO_SECS, BOOST_SECS, RANK_MARGIN } from '../js/race.js';
import { SPEED_PRESETS } from '../js/physics.js';

function fiveStars(race) {
  const s = race.course.segments[2];
  s.items = Array.from({ length: BOOST_STARS }, () => ({ kind: 'star', id: 'star', x: 0, taken: false }));
  s.obstacles = [];
  s.boost = null;
  race.player.x = 0;
}

test('five stars charge the boost button; pressing it fires a boost once', () => {
  const log = [];
  const r = new Race({ course: 'meadow', vehicle: 'car', seed: 1, hooks: { boostReady: () => log.push('ready'), boostUsed: (auto) => log.push(auto ? 'auto' : 'used') } });
  fiveStars(r);
  r.state = 'race';
  r.checkTrack(400, 400);
  assert.equal(r.stars, BOOST_STARS);
  assert.equal(r.boostCharge, BOOST_STARS);
  assert.equal(r.boostReady, true);
  assert.deepEqual(log, ['ready']);
  assert.equal(r.player.boost, 0, 'nothing fires by itself right away');
  // the same items cannot be farmed again
  r.checkTrack(400, 400);
  assert.equal(r.stars, BOOST_STARS);
  assert.equal(r.useBoost(), true);
  assert.equal(r.player.boost, BOOST_SECS);
  assert.equal(r.boostReady, false);
  assert.equal(r.boostCharge, 0);
  assert.deepEqual(log, ['ready', 'used']);
  assert.equal(r.useBoost(), false, 'an empty button does nothing');
});

test('a charged boost that nobody presses fires by itself after a while', () => {
  const log = [];
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 300, seed: 3, hooks: { boostUsed: (auto) => log.push(auto) } });
  // run through the countdown
  while (r.state === 'countdown') r.update(1 / 30, { steer: 0 });
  r.boostCharge = BOOST_STARS;
  r.boostReady = true;
  r.boostReadyAt = r.time;
  let t = 0;
  while (r.boostReady && t < BOOST_AUTO_SECS + 1) {
    r.update(1 / 30, { steer: 0 });
    t += 1 / 30;
  }
  assert.equal(r.boostReady, false);
  assert.deepEqual(log, [true], 'fired automatically');
  assert.ok(t >= BOOST_AUTO_SECS - 0.1 && t <= BOOST_AUTO_SECS + 0.5, `waited about ${BOOST_AUTO_SECS}s (${t.toFixed(2)})`);
});

test('the chosen vehicle shapes the player preset, not the rivals', () => {
  const bus = new Race({ course: 'sea', vehicle: 'bus', seed: 2 });
  const police = new Race({ course: 'sea', vehicle: 'police', seed: 2 });
  assert.ok(bus.playerPreset.maxSpeed < bus.preset.maxSpeed, 'the bus is a little slower');
  assert.ok(police.playerPreset.maxSpeed > police.preset.maxSpeed, 'the police car is a little faster');
  assert.equal(bus.preset.maxSpeed, SPEED_PRESETS.slow.maxSpeed, 'the base preset is untouched');
  assert.equal(police.preset.maxSpeed, SPEED_PRESETS.slow.maxSpeed);
  const unknown = new Race({ course: 'sea', vehicle: 'rocket', seed: 2 });
  assert.equal(unknown.playerPreset.maxSpeed, unknown.preset.maxSpeed, 'unknown vehicles drive like the red car');
});

test('rank only changes once a kart is clearly past (hysteresis)', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 300, seed: 5 });
  while (r.state === 'countdown') r.update(1 / 30, { steer: 0 });
  const p = r.player;
  // Put every rival far behind, then bring one alongside.
  for (const x of r.rivals) {
    x.z = p.z - 3000;
    x.ahead = false;
    x.reaction = 99; // frozen for the test
  }
  r.rank = r.rankFromFlags();
  assert.equal(r.rank, 1);
  const events = [];
  r.hooks = { overtaken: (a) => events.push('overtaken:' + a), overtake: (a) => events.push('overtake:' + a) };
  const rival = r.rivals[0];
  rival.x = p.x + 1.4; // other side of the road: no bumping
  rival.z = p.z + RANK_MARGIN / 2;
  r.update(1 / 60, { steer: 0 });
  assert.equal(r.rank, 1, 'slightly ahead is still a duel, not a place change');
  assert.deepEqual(events, []);
  rival.z = r.player.z + RANK_MARGIN + 50;
  r.update(1 / 60, { steer: 0 });
  assert.equal(r.rank, 2);
  assert.deepEqual(events, ['overtaken:' + rival.animal]);
  rival.z = r.player.z - RANK_MARGIN / 2;
  r.update(1 / 60, { steer: 0 });
  assert.equal(r.rank, 2, 'slightly behind: not counted as passed yet');
  rival.z = r.player.z - RANK_MARGIN - 50;
  r.update(1 / 60, { steer: 0 });
  assert.equal(r.rank, 1);
  assert.deepEqual(events, ['overtaken:' + rival.animal, 'overtake:' + rival.animal]);
  assert.equal(r.overtakes, 1);
});

test('result order carries finish times (real for finishers, estimated for the rest)', () => {
  const r = new Race({ course: 'snow', vehicle: 'car', length: 300, seed: 8 });
  let t = 0;
  while (r.state !== 'goal' && t < 200) {
    r.update(1 / 30, { steer: 0 });
    t += 1 / 30;
  }
  const res = r.result();
  assert.equal(res.order.length, 6);
  for (const e of res.order) assert.ok(Number.isFinite(e.time) && e.time > 0, `${e.id} has a time`);
  const me = res.order.find((e) => e.id === 'player');
  assert.equal(me.finished, true);
  assert.ok(Math.abs(me.time - r.finishExact) < 1e-9);
  for (let i = 1; i < res.order.length; i++) {
    const a = res.order[i - 1];
    const b = res.order[i];
    if (a.finished && b.finished) assert.ok(a.time <= b.time, 'finishers are ordered by time');
    if (a.finished && !b.finished) assert.ok(b.time >= a.time - 1e-9, 'estimates come after real finishes');
  }
  const near = r.nearestRival();
  assert.ok(near && near.rival && near.dist >= 0);
  assert.ok(r.rivals.every((x) => Math.abs(x.z - r.player.z) >= near.dist));
});
