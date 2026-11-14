import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_LEVELS, AI_LEVEL_IDS, LANES, GRID, gridSlots, playerGridPos, makeRival, stepRival, separateRivals, rankOf, finishOrder,
} from '../js/ai.js';
import { generateCourse } from '../js/course.js';
import { makeRng } from '../js/rng.js';
import { SPEED_PRESETS, SEGMENT_LENGTH, makePlayer } from '../js/physics.js';
import { Race } from '../js/race.js';

const preset = SPEED_PRESETS.slow;

function ctxFor(course, player, rivals, level = AI_LEVELS.normal, extra = {}) {
  return {
    segments: course.segments,
    goalZ: course.goalZ,
    player,
    rivals,
    preset,
    level,
    time: 0,
    rng: makeRng(5),
    racing: true,
    ...extra,
  };
}

function rivalAt(z, x, level = AI_LEVELS.normal, seed = 3) {
  const r = makeRival('bear', { z, x }, level, makeRng(seed));
  r.reaction = 0;
  return r;
}

test('grid: five slots around the player, all behind the start line', () => {
  const slots = gridSlots();
  assert.equal(slots.length, 5);
  const p = playerGridPos();
  assert.ok(GRID.rows.includes(p.z));
  assert.ok(GRID.cols.includes(p.x));
  for (const s of slots) {
    assert.ok(GRID.rows.includes(s.z));
    assert.ok(GRID.cols.includes(s.x));
    assert.ok(!(s.z === p.z && s.x === p.x), 'no rival on the player slot');
    assert.ok(s.z < 9 * SEGMENT_LENGTH, 'grid is before the start line');
  }
});

test('rankOf counts the rivals ahead of the player', () => {
  const rivals = [{ z: 100 }, { z: 300 }, { z: 900 }];
  assert.equal(rankOf(0, rivals), 4);
  assert.equal(rankOf(200, rivals), 3);
  assert.equal(rankOf(1000, rivals), 1);
  assert.equal(rankOf(300, rivals), 2, 'a tie does not count as ahead');
});

test('finishOrder: finished racers first by time, then the rest by distance, player included', () => {
  const rivals = [
    { animal: 'bear', finished: true, finishTime: 50, z: 99999 },
    { animal: 'cat', finished: false, finishTime: 0, z: 5000 },
    { animal: 'pig', finished: true, finishTime: 40, z: 99999 },
    { animal: 'frog', finished: false, finishTime: 0, z: 8000 },
    { animal: 'rabbit', finished: false, finishTime: 0, z: 1000 },
  ];
  const player = { z: 6000 };
  const order = finishOrder(player, rivals, 10000, 0);
  assert.equal(order.length, 6);
  assert.deepEqual(order.map((o) => o.id), ['pig', 'bear', 'frog', 'player', 'cat', 'rabbit']);
  assert.deepEqual(order.map((o) => o.finished), [true, true, false, false, false, false]);
  // once the player has crossed the line, their finish time orders them among the finishers
  const done = finishOrder({ z: 10000 }, rivals, 10000, 45);
  assert.deepEqual(done.slice(0, 3).map((o) => o.id), ['pig', 'player', 'bear']);
});

test('rubber band: the same rival drives faster when the player is far ahead than when far behind', () => {
  const course = generateCourse('meadow', { length: 600, seed: 21 });
  const run = (playerZ) => {
    const r = rivalAt(20 * SEGMENT_LENGTH, 0.21);
    r.laneTimer = 99; // keep the lane fixed
    const player = makePlayer();
    player.z = playerZ;
    player.x = -1.6; // out of the way, so traffic logic does not kick in
    player.speed = preset.maxSpeed;
    const ctx = ctxFor(course, player, [r]);
    for (let t = 0; t < 6; t += 1 / 60) {
      ctx.time = t;
      stepRival(r, ctx, 1 / 60);
      player.z += preset.maxSpeed / 60; // the player keeps its lead/deficit roughly constant
    }
    return r.speed;
  };
  const chasing = run(20 * SEGMENT_LENGTH + 3000);
  const leading = run(20 * SEGMENT_LENGTH - 3000);
  assert.ok(chasing > leading * 1.1, `chasing ${chasing.toFixed(0)} should be clearly faster than leading ${leading.toFixed(0)}`);
  assert.ok(chasing <= preset.maxSpeed * 1.45, 'never absurdly fast');
  assert.ok(leading > preset.maxSpeed * 0.4, 'never crawls');
});

test('difficulty levels: easy < normal < hard in rival skill', () => {
  assert.deepEqual(AI_LEVEL_IDS, ['easy', 'normal', 'hard']);
  const mid = (lv) => (lv.skill[0] + lv.skill[1]) / 2;
  assert.ok(mid(AI_LEVELS.easy) < mid(AI_LEVELS.normal));
  assert.ok(mid(AI_LEVELS.normal) < mid(AI_LEVELS.hard));
  assert.ok(AI_LEVELS.easy.hold <= AI_LEVELS.hard.hold || AI_LEVELS.easy.floor >= AI_LEVELS.hard.floor, 'leaders are reeled in');
  assert.ok(AI_LEVELS.hard.skill[0] > 1, 'hard rivals can out-run the player on pace alone');
  assert.ok(AI_LEVELS.easy.skill[1] < 1, 'easy rivals cannot');
  for (const id of AI_LEVEL_IDS) {
    const r = makeRival('cat', { z: 800, x: 0.5 }, AI_LEVELS[id], makeRng(9));
    assert.ok(r.skill >= AI_LEVELS[id].skill[0] && r.skill <= AI_LEVELS[id].skill[1]);
    assert.ok(r.reaction >= 0);
  }
});

test('rivals steer away from an obstacle sitting in their lane', () => {
  const course = generateCourse('meadow', { length: 400, seed: 2 });
  for (const s of course.segments) s.obstacles.length = 0;
  const z = 30 * SEGMENT_LENGTH;
  const r = rivalAt(z, 0.21);
  r.laneTarget = 0.21;
  r.laneTimer = 99;
  course.segments[32].obstacles.push({ id: 'hay', x: 0.21, w: 0.55, hop: 0 });
  const player = makePlayer();
  player.z = 0;
  player.x = -1.6;
  const ctx = ctxFor(course, player, [r]);
  stepRival(r, ctx, 1 / 60);
  assert.ok(Math.abs(r.laneTarget - 0.21) > 0.5, `lane target moved away from the hay (now ${r.laneTarget})`);
  for (let t = 0; t < 1.5; t += 1 / 60) stepRival(r, ctx, 1 / 60);
  assert.ok(Math.abs(r.x - 0.21) > 0.35, 'the kart actually drives around it');
  assert.ok(Math.abs(r.x) <= 1.6);
});

test('separateRivals pushes overlapping karts apart', () => {
  const a = { z: 1000, x: 0.1, vx: 0, laneTarget: 0.21 };
  const b = { z: 1050, x: 0.15, vx: 0, laneTarget: 0.21 };
  separateRivals([a, b], 1 / 60);
  assert.ok(a.x < 0.1 && b.x > 0.15, 'pushed in opposite directions');
  assert.notEqual(a.laneTarget, b.laneTarget, 'the kart behind picks another lane');
  const c = { z: 1000, x: 0.1, vx: 0, laneTarget: 0.21 };
  const d = { z: 3000, x: 0.1, vx: 0, laneTarget: 0.21 };
  separateRivals([c, d], 1 / 60);
  assert.equal(c.x, 0.1);
  assert.equal(d.x, 0.1);
});

test('lane targets always stay on the road', () => {
  for (const x of LANES) assert.ok(Math.abs(x) < 1);
  const course = generateCourse('snow', { length: 500, seed: 4 });
  const r = rivalAt(800, -0.5);
  const player = makePlayer();
  player.z = 1100;
  player.x = 0.5;
  const ctx = ctxFor(course, player, [r]);
  for (let t = 0; t < 40; t += 1 / 60) {
    ctx.time = t;
    stepRival(r, ctx, 1 / 60);
    player.z += preset.maxSpeed * 0.9 / 60;
    assert.ok(Math.abs(r.laneTarget) <= 0.71, `lane target ${r.laneTarget}`);
    assert.ok(Math.abs(r.x) <= 1.6);
  }
});

test('every rival finishes the race, even after the player has crossed the line', () => {
  const race = new Race({ course: 'sea', vehicle: 'car', length: 300, seed: 12, rivals: 'normal' });
  let t = 0;
  while (race.state !== 'goal' && t < 200) {
    race.update(1 / 30, { steer: 0 });
    t += 1 / 30;
  }
  assert.equal(race.state, 'goal');
  const tGoal = t;
  while (race.rivals.some((r) => !r.finished) && t < tGoal + 60) {
    race.update(1 / 30, { steer: 0 });
    t += 1 / 30;
  }
  assert.ok(race.rivals.every((r) => r.finished), 'all rivals crossed the goal within a minute');
  for (const r of race.rivals) assert.ok(r.finishTime > 0);
  const order = race.order;
  assert.equal(order.length, 6);
  assert.ok(order.every((o) => o.finished));
  assert.equal(order.filter((o) => o.id === 'player').length, 1);
  for (let k = 0; k < 150; k++) race.update(1 / 30, { steer: 0 });
  assert.equal(race.player.speed, 0, 'the player rolls to a stop after the goal');
});

test('races with the same seed and inputs are deterministic', () => {
  const mk = () => new Race({ course: 'meadow', vehicle: 'dino', length: 250, seed: 77, rivals: 'hard' });
  const a = mk();
  const b = mk();
  for (let t = 0; t < 40; t += 1 / 30) {
    const steer = Math.sin(t * 1.7) > 0 ? 1 : -1;
    a.update(1 / 30, { steer });
    b.update(1 / 30, { steer });
  }
  assert.deepEqual(a.rivals.map((r) => [r.animal, r.z, r.x, r.speed]), b.rivals.map((r) => [r.animal, r.z, r.x, r.speed]));
  assert.equal(a.rank, b.rank);
  assert.equal(a.player.z, b.player.z);
});
