import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makePlayer, stepPlayer, bounce, overlap, progress, steerFromPointer, steerFromTilt, SPEED_PRESETS, ROAD_LIMIT, segmentsBetween,
} from '../js/physics.js';

const preset = SPEED_PRESETS.slow;
const run = (p, steer, secs, extra = {}) => {
  for (let t = 0; t < secs; t += 1 / 60) stepPlayer(p, { steer }, 1 / 60, { preset, ...extra });
};

test('the car accelerates by itself and never stops', () => {
  const p = makePlayer();
  run(p, 0, 3);
  assert.ok(p.speed > preset.maxSpeed * 0.95);
  assert.ok(p.z > 0);
});

test('off-road slows a little but keeps moving', () => {
  const p = makePlayer();
  run(p, 0, 3);
  p.x = 1.6;
  run(p, 0.0001, 0.5); // tiny steer keeps it off-road (no assist)
  p.x = 1.6;
  for (let i = 0; i < 120; i++) {
    p.x = 1.6;
    stepPlayer(p, { steer: 0.001 }, 1 / 60, { preset });
  }
  assert.ok(p.offroad);
  assert.ok(p.speed < preset.maxSpeed * 0.8);
  assert.ok(p.speed >= preset.maxSpeed * 0.55, 'still moving nicely');
});

test('steering moves the car and a soft fence keeps it near the road', () => {
  const p = makePlayer();
  run(p, 1, 0.5);
  assert.ok(p.x > 0.3);
  run(p, 1, 5);
  assert.ok(p.x <= ROAD_LIMIT + 1e-9);
  const q = makePlayer();
  run(q, -1, 6);
  assert.ok(q.x >= -ROAD_LIMIT - 1e-9);
});

test('assist gently brings the car back toward the road when not steering', () => {
  const p = makePlayer();
  run(p, 0, 2);
  p.x = 1.5;
  run(p, 0, 2);
  assert.ok(p.x < 1.5);
});

test('bounce pushes away softly and keeps some speed', () => {
  const p = makePlayer();
  p.speed = 3000;
  p.x = 0.2;
  const dir = bounce(p, 0.5);
  assert.equal(dir, -1);
  assert.ok(p.vx < 0);
  assert.ok(p.speed >= 600 && p.speed < 3000);
  assert.ok(p.bump > 0);
  const q = makePlayer();
  q.speed = 100;
  bounce(q, 0);
  assert.equal(q.speed, 600, 'never slower than a gentle roll');
});

test('boost makes the car faster than normal for a while', () => {
  const p = makePlayer();
  run(p, 0, 3);
  p.boost = 1.6;
  run(p, 0, 1);
  assert.ok(p.speed > preset.maxSpeed * 1.2);
  run(p, 0, 3);
  assert.ok(p.speed <= preset.maxSpeed * 1.01);
});

test('finished cars roll to a stop', () => {
  const p = makePlayer();
  run(p, 0, 3);
  run(p, 0, 4, { finished: true });
  assert.equal(p.speed, 0);
});

test('overlap / progress / helpers', () => {
  assert.equal(overlap(0, 0.6, 0.5, 0.6), true);
  assert.equal(overlap(0, 0.6, 0.7, 0.6), false);
  assert.equal(progress(0, 1000), 0);
  assert.equal(progress(500, 1000), 0.5);
  assert.equal(progress(5000, 1000), 1);
  assert.equal(progress(10, 0), 0);
  assert.deepEqual(segmentsBetween(150, 650, 200), [0, 1, 2, 3]);
});

test('pointer and tilt steering', () => {
  assert.equal(steerFromPointer(200, 400), 0);
  assert.ok(steerFromPointer(10, 400) < -0.9);
  assert.ok(steerFromPointer(390, 400) > 0.9);
  assert.ok(steerFromPointer(260, 400) > 0.5, 'even a light touch steers');
  assert.equal(steerFromTilt(2), 0);
  assert.equal(steerFromTilt(40), 1);
  assert.equal(steerFromTilt(-40), -1);
  assert.equal(steerFromTilt(undefined), 0);
});
