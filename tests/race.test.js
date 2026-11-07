import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../js/race.js';
import { makeRng } from '../js/rng.js';

function drive(race, steerFn, maxSecs = 400) {
  for (let t = 0; t < maxSecs && race.state !== 'goal'; t += 1 / 30) {
    race.update(1 / 30, { steer: steerFn(race, t) });
  }
}

/** A small child: holds a button for a random while, lets go, sometimes steers back to the road. */
function kidDriver(seed) {
  const rng = makeRng(seed);
  let until = 0;
  let steer = 0;
  return (race, t) => {
    if (t >= until) {
      until = t + 0.4 + rng.next() * 2.2;
      const r = rng.next();
      steer = r < 0.3 ? 0 : r < 0.65 ? -1 : 1;
      if (Math.abs(race.player.x) > 0.9 && rng.next() < 0.5) steer = -Math.sign(race.player.x);
    }
    return steer;
  };
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
    const r = new Race({ course: 'sea', vehicle: 'bus', speed, length, seed: 9, rivals: 'normal' });
    let t = 0;
    while (r.state !== 'goal' && t < 300) {
      r.update(1 / 30, { steer: 0 });
      t += 1 / 30;
    }
    const raceSecs = t - 3; // minus countdown
    assert.ok(raceSecs > 55 && raceSecs < 95, `${speed}: ${raceSecs.toFixed(1)}s`);
  }
});

test('everyone starts together on the grid and the countdown fires', () => {
  const seen = { count: 0, go: 0 };
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 3, hooks: { count: () => seen.count++, go: () => seen.go++ } });
  assert.equal(r.state, 'countdown');
  assert.equal(r.rivals.length, 5);
  const startZ = r.rivals.map((x) => x.z);
  for (let t = 0; t < 2.9; t += 1 / 30) r.update(1 / 30, { steer: 0 });
  assert.deepEqual(r.rivals.map((x) => x.z), startZ, 'rivals wait on the grid during the countdown');
  assert.equal(r.player.speed, 0);
  for (let t = 0; t < 3; t += 1 / 30) r.update(1 / 30, { steer: 0 });
  assert.equal(seen.count, 3, 'beeps on 3, 2, 1');
  assert.equal(seen.go, 1);
  assert.equal(r.state, 'race');
  assert.ok(r.rivals.every((x) => x.speed > 0), 'all rivals are racing after the start');
  assert.ok(r.rank >= 1 && r.rank <= 6);
});

test('collecting items and the course event fire hooks', () => {
  const seen = { collect: 0, event: 0 };
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
  assert.ok(seen.collect > 5);
  assert.equal(seen.event, 1);
  const res = r.result();
  assert.ok(res.stars > 0);
  assert.equal(res.event, 'snowman');
});

test('positions change hands: overtake / overtaken / rank hooks fire during a race', () => {
  let overtake = 0;
  let overtaken = 0;
  let rankChanges = 0;
  const ranks = new Set();
  for (const seed of [11, 12, 13]) {
    const r = new Race({
      course: 'meadow', vehicle: 'car', length: 600, seed, rivals: 'normal',
      hooks: {
        overtake: (animal) => { overtake++; assert.equal(typeof animal, 'string'); },
        overtaken: (animal) => { overtaken++; assert.equal(typeof animal, 'string'); },
        rank: (now, prev) => { rankChanges++; ranks.add(now); assert.notEqual(now, prev); },
      },
    });
    drive(r, kidDriver(seed));
    assert.equal(r.state, 'goal');
  }
  assert.ok(overtake + overtaken > 0, 'at least one position change happened');
  assert.ok(rankChanges > 0);
  for (const k of ranks) assert.ok(k >= 1 && k <= 6);
});

test('result carries the finishing position and the full order', () => {
  const r = new Race({ course: 'sea', vehicle: 'police', length: 300, seed: 5, rivals: 'easy' });
  drive(r, () => 0);
  const res = r.result();
  assert.ok(Number.isInteger(res.rank) && res.rank >= 1 && res.rank <= 6, `rank ${res.rank}`);
  assert.equal(res.racers, 6);
  assert.equal(res.order.length, 6);
  assert.equal(res.order.filter((o) => o.id === 'player').length, 1);
  assert.equal(res.order.findIndex((o) => o.id === 'player') + 1, res.rank, 'rank matches the order');
  assert.equal(res.level, 'easy');
  assert.ok(res.raceTime > 0 && res.raceTime < res.time);
  assert.ok(Number.isInteger(res.overtakes) && res.overtakes >= 0);
  assert.equal(r.finalRank, res.rank);
  assert.equal(r.rank, res.rank, 'rank is frozen once the player has finished');
});

test('bumping into a rival is soft: both keep moving', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 300, seed: 6 });
  const bumps = [];
  r.hooks.bump = (what, animal) => bumps.push([what, animal]);
  for (let t = 0; t < 4; t += 1 / 30) r.update(1 / 30, { steer: 0 });
  // put a rival right on top of the player
  const rival = r.rivals[0];
  rival.z = r.player.z + 50;
  rival.x = r.player.x;
  rival.speed = r.player.speed;
  r.update(1 / 30, { steer: 0 });
  assert.ok(bumps.some(([what]) => what === 'rival'), 'rival bump fires');
  assert.ok(r.player.speed > 0 && rival.speed > 0);
  assert.ok(r.player.vx !== 0 || rival.vx !== 0, 'someone got nudged sideways');
});

test('a throwing hook never breaks the race', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 1, hooks: { go: () => { throw new Error('x'); }, rank: () => { throw new Error('y'); } } });
  drive(r, () => 0);
  assert.equal(r.state, 'goal');
});

test('honk makes everyone cheer', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 1 });
  r.honk();
  assert.ok(r.jump > 0);
  assert.ok(r.rivals.every((x) => x.cheer > 0));
});

test('unknown competition level falls back to normal', () => {
  const r = new Race({ course: 'meadow', vehicle: 'car', length: 200, seed: 1, rivals: 'turbo' });
  assert.equal(r.levelId, 'normal');
});
