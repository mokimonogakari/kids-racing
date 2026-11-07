import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, cleanTrace, tracePos, COUNTDOWN, PHOTO_SCALE } from '../js/race.js';
import { AIR_TIME, airLift, SEGMENT_LENGTH } from '../js/physics.js';
import { ANIMAL_TRAITS, makeRival, stepRival, AI_LEVELS } from '../js/ai.js';
import { SPEED_PRESETS } from '../js/physics.js';
import { makeRng } from '../js/rng.js';

const DT = 1 / 30;

function startedRace(extra = {}, hooks = {}) {
  const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 600, seed: 3, hooks, ...extra });
  for (let i = 0; i < Math.ceil(COUNTDOWN / DT) + 1; i++) race.update(DT, { steer: 0 });
  assert.equal(race.state, 'race');
  return race;
}

function clearTrack(race) {
  for (const s of race.course.segments) {
    s.obstacles = [];
    s.boost = null;
    s.ramp = null;
  }
}

test('airLift is 0 on the ground, peaks mid-flight and lands at 0', () => {
  assert.equal(airLift(0), 0);
  assert.equal(airLift(-1), 0);
  assert.ok(airLift(AIR_TIME) < 0.01);
  assert.ok(airLift(AIR_TIME / 2) > 0.99);
  assert.ok(airLift(0.0001) < 0.01);
});

test('the player jumps over a ramp, cannot hit obstacles in the air, and lands', () => {
  const ev = [];
  const race = startedRace({}, { jump: (w) => ev.push(['jump', w]), land: (w) => ev.push(['land', w]), bump: (w) => ev.push(['bump', w]) });
  clearTrack(race);
  for (const r of race.rivals) r.z = -99999; // out of the way
  const p = race.player;
  p.speed = race.playerPreset.maxSpeed;
  p.x = 0;
  const si = Math.floor(p.z / SEGMENT_LENGTH) + 2;
  race.course.segments[si].ramp = { x: 0, w: 2.4 };
  // an obstacle right after the ramp, where the car is airborne
  race.course.segments[si + 3].obstacles = [{ id: 'cone', x: 0, w: 0.5 }];
  let maxAir = 0;
  for (let i = 0; i < 60; i++) {
    race.update(DT, { steer: 0 });
    maxAir = Math.max(maxAir, p.air);
  }
  assert.ok(ev.some((e) => e[0] === 'jump' && e[1] === 'player'), 'jumped');
  assert.ok(ev.some((e) => e[0] === 'land' && e[1] === 'player'), 'landed');
  assert.ok(maxAir > 0.5);
  assert.ok(!ev.some((e) => e[0] === 'bump' && e[1] === 'cone'), 'flew over the cone');
  assert.equal(ev.filter((e) => e[0] === 'jump' && e[1] === 'player').length, 1, 'one jump per ramp');
});

test('a slow car does not take off', () => {
  const ev = [];
  const race = startedRace({}, { jump: (w) => ev.push(w) });
  clearTrack(race);
  const p = race.player;
  p.speed = 200;
  const si = Math.floor(p.z / SEGMENT_LENGTH);
  race.course.segments[si].ramp = { x: 0, w: 2.4 };
  race.course.segments[si + 1].ramp = { x: 0, w: 2.4 };
  p.x = 0;
  race.checkTrack(p.z, p.z + 10);
  assert.ok(!ev.includes('player'));
});

test('rivals jump ramps too', () => {
  const ev = [];
  const race = startedRace({}, { jump: (w) => ev.push(w), land: (w) => ev.push('land:' + w) });
  clearTrack(race);
  for (const s of race.course.segments) s.ramp = { x: 0, w: 4 };
  for (let i = 0; i < 300; i++) race.update(DT, { steer: 0 });
  const animals = ev.filter((e) => e !== 'player' && !e.startsWith('land:'));
  assert.ok(animals.length > 0, 'a rival jumped');
  assert.ok(ev.some((e) => e.startsWith('land:') && e !== 'land:player'), 'a rival landed');
});

test('the race records a trace of the player and returns it in result()', () => {
  const race = startedRace();
  for (let i = 0; i < 30; i++) race.update(DT, { steer: 0 });
  const tr = race.trace;
  assert.ok(tr.length >= 9 && tr.length <= 13, `about 10 samples per second (got ${tr.length})`);
  for (let i = 1; i < tr.length; i++) assert.ok(tr[i][0] > tr[i - 1][0]);
  assert.ok(tr[0][0] >= 0 && tr[0][0] < 0.05, 'first sample at the green light');
  assert.deepEqual(race.result().trace, tr);
});

test('cleanTrace / tracePos', () => {
  assert.equal(cleanTrace(null), null);
  assert.equal(cleanTrace('x'), null);
  assert.equal(cleanTrace([[0, 0, 1]]), null);
  const t = cleanTrace([[0, 0, 100], 'junk', [1, 1, 300], [0.5, 9, 9], [2, NaN, 4], [2, 0, 500]]);
  assert.deepEqual(t, [[0, 0, 100], [1, 1, 300], [2, 0, 500]]);
  assert.deepEqual(tracePos(t, -1), { x: 0, z: 100 });
  assert.deepEqual(tracePos(t, 0.5), { x: 0.5, z: 200 });
  assert.deepEqual(tracePos(t, 1.5), { x: 0.5, z: 400 });
  assert.equal(tracePos(t, 2.5), null);
});

test('ghostPos follows the ghost; passing a slow ghost fires ghostPass(true) once', () => {
  const ev = [];
  const ghost = [[0, 0, 1100], [200, 0, 1300]]; // a very slow ghost
  const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 600, seed: 3, ghost, hooks: { ghostPass: (a) => ev.push(a) } });
  assert.deepEqual(race.ghostPos(), { x: 0, z: 1100 }, 'on the grid during the countdown');
  for (let i = 0; i < 400; i++) race.update(DT, { steer: 0 });
  assert.deepEqual(ev, [true]);
  assert.equal(new Race({ course: 'meadow', vehicle: 'car', length: 600, seed: 3 }).ghostPos(), null);
});

test('a fast ghost that pulls away fires ghostPass(false)', () => {
  const ev = [];
  const ghost = [[0, 0.5, 1100], [3, 0.5, 30000]];
  const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 600, seed: 3, ghost, hooks: { ghostPass: (a) => ev.push(a) } });
  for (let i = 0; i < 200; i++) race.update(DT, { steer: 0 });
  assert.deepEqual(ev, [false]);
});

test('replaying our own trace as a ghost keeps it right with the player', () => {
  const run = (ghost) => {
    const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 600, seed: 9, ghost });
    let maxGap = 0;
    while (race.state !== 'goal' && race.time < 120) {
      race.update(DT, { steer: Math.sin(race.time) > 0.5 ? 1 : 0 });
      const g = race.ghostPos();
      if (g && race.raceClock > 0) maxGap = Math.max(maxGap, Math.abs(g.z - race.player.z));
    }
    return { race, maxGap };
  };
  const first = run(null);
  const second = run(first.race.result().trace);
  assert.ok(second.maxGap < 250, `ghost stays with an identical run (gap ${second.maxGap.toFixed(0)})`);
});

test('photo finish: slow motion once when arriving together', () => {
  const ev = [];
  const race = startedRace({}, { photoFinish: () => ev.push('photo') });
  clearTrack(race);
  const p = race.player;
  p.z = race.course.goalZ - 800;
  p.speed = race.playerPreset.maxSpeed;
  const r = race.rivals[0];
  r.z = p.z + 50;
  r.x = -0.7;
  p.x = 0.6;
  r.speed = p.speed;
  const t0 = race.time;
  race.update(DT, { steer: 0 });
  assert.deepEqual(ev, ['photo']);
  assert.equal(race.timeScale, PHOTO_SCALE);
  race.update(DT, { steer: 0 });
  assert.ok(Math.abs(race.time - t0 - DT - DT * PHOTO_SCALE) < 1e-9, 'the world clock runs slow');
  for (let i = 0; i < 60; i++) race.update(DT, { steer: 0 });
  assert.equal(race.timeScale, 1, 'back to normal after the moment');
  assert.deepEqual(ev, ['photo'], 'only once');
});

test('no photo finish when nobody is close', () => {
  const ev = [];
  const race = startedRace({}, { photoFinish: () => ev.push('photo') });
  for (const r of race.rivals) r.z = 0;
  race.player.z = race.course.goalZ - 500;
  race.update(DT, { steer: 0 });
  assert.deepEqual(ev, []);
  assert.equal(race.timeScale, 1);
});

test('animal traits: each animal has its own small twist', () => {
  assert.deepEqual(Object.keys(ANIMAL_TRAITS).sort(), ['bear', 'cat', 'frog', 'pig', 'rabbit']);
  for (const t of Object.values(ANIMAL_TRAITS)) {
    for (const k of ['top', 'corner', 'start', 'jump']) if (k in t) assert.ok(t[k] > 0.9 && t[k] < 1.7);
  }
});

test('the rabbit makes a rocket start (announced once) and out-accelerates a plain kart', () => {
  const level = AI_LEVELS.normal;
  const preset = SPEED_PRESETS.slow;
  const segs = Array.from({ length: 200 }, () => ({ curve: 0, obstacles: [], boost: null }));
  const mk = (animal) => {
    const r = makeRival(animal, { z: 1000, x: 0 }, level, makeRng(1));
    r.reaction = 0;
    r.skill = 0.9;
    return r;
  };
  const rabbit = mk('rabbit');
  const pig = mk('pig');
  pig.traits = {};
  const player = { z: 1000, x: 2, speed: preset.maxSpeed };
  const ctx = { segments: segs, goalZ: 1e9, player, rivals: [], preset, level, time: 10, rng: makeRng(2), racing: true };
  for (let i = 0; i < 30; i++) {
    stepRival(rabbit, ctx, DT);
    stepRival(pig, ctx, DT);
  }
  assert.ok(rabbit.rocket);
  assert.ok(rabbit.speed > pig.speed * 1.3, `${rabbit.speed} vs ${pig.speed}`);

  const ev = [];
  const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 600, seed: 3, hooks: { rivalRocket: (a) => ev.push(a) } });
  for (let i = 0; i < 300; i++) race.update(DT, { steer: 0 });
  assert.deepEqual(ev, ['rabbit']);
});

test('leader announcements: not in the first seconds, only on a change, never repeated', () => {
  let seen = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const ev = [];
    const race = new Race({ course: 'meadow', vehicle: 'car', speed: 'slow', length: 900, seed, hooks: { leader: (id) => ev.push([id, race.raceClock]) } });
    while (race.state !== 'goal' && race.time < 150) race.update(DT, { steer: Math.sin(race.time * 0.7) > 0.6 ? 1 : 0 });
    for (const [, t] of ev) assert.ok(t >= 3, 'not before 3 s');
    for (let i = 1; i < ev.length; i++) assert.notEqual(ev[i][0], ev[i - 1][0]);
    seen += ev.length;
  }
  assert.ok(seen > 0, 'leaders do change sometimes');
});
