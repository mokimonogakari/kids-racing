import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../js/race.js';

function drive(race, steerFn, maxSecs = 400) {
  const events = [];
  for (let t = 0; t < maxSecs && race.state !== 'goal'; t += 1 / 30) {
    race.update(1 / 30, { steer: steerFn(race, t) });
  }
  return events;
}

test('a race always reaches the goal, even without touching anything', () => {
  for (const course of ['meadow', 'sea', 'snow']) {
    const log = [];
    const r = new Race({ course, vehicle: 'car', length: 300, seed: 1, hooks: { goal: (res) => log.push(res) } });
    drive(r, () => 0);
    assert.equal(r.state, 'goal');
    assert.equal(log.length, 1);
    assert.equal(log[0].course, course);
  }
});

test('a race reaches the goal even when steering wildly', () => {
  const r = new Race({ course: 'meadow', vehicle: 'dino', length: 300, seed: 2 });
  drive(r, (_, t) => (Math.sin(t * 2) > 0 ? 1 : -1));
  assert.equal(r.state, 'goal');
});

test('full-length race takes roughly 60-90 seconds', () => {
  for (const [speed, length] of [['slow', 1050], ['normal', 1250]]) {
    const r = new Race({ course: 'sea', vehicle: 'bus', speed, length, seed: 9 });
    let t = 0;
    while (r.state !== 'goal' && t < 300) {
      r.update(1 / 30, { steer: 0 });
      t += 1 / 30;
    }
    const raceSecs = t - 3; // minus countdown
    assert.ok(raceSecs > 55 && raceSecs < 95, `${speed}: ${raceSecs.toFixed(1)}s`);
  }
});

test('collecting items, events and passing rivals fire hooks', () => {
  const seen = { collect: 0, event: 0, pass: 0, count: 0, go: 0 };
  const hooks = {};
  for (const k of Object.keys(seen)) hooks[k] = () => seen[k]++;
  const r = new Race({ course: 'snow', vehicle: 'fire', length: 600, seed: 4, hooks });
  // steer toward the nearest item ahead
  drive(r, (race) => {
    const p = race.player;
    const i = Math.floor(p.z / 200);
    for (let k = i; k < i + 20; k++) {
      const it = race.course.segments[k]?.items.find((x) => !x.taken);
      if (it) return Math.abs(it.x - p.x) < 0.05 ? 0 : Math.sign(it.x - p.x);
    }
    return 0;
  });
  assert.equal(seen.count, 3, 'beeps on 3, 2, 1');
  assert.equal(seen.go, 1);
  assert.ok(seen.collect > 5);
  assert.equal(seen.event, 1);
  assert.equal(seen.pass, 5, 'the player passes every friendly rival');
  const res = r.result();
  assert.ok(res.stars > 0);
  assert.equal(res.event, 'snowman');
});

test('a throwing hook never breaks the race', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 1, hooks: { go: () => { throw new Error('x'); } } });
  drive(r, () => 0);
  assert.equal(r.state, 'goal');
});

test('honk makes everyone cheer', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 1 });
  r.honk();
  assert.ok(r.jump > 0);
  assert.ok(r.rivals.every((x) => x.cheer > 0));
});
