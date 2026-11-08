import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayPlayer, sampleReplay, REPLAY_CAMERAS, CAMERA_SECS } from '../js/replay.js';

function fakeRace(n = 31) {
  const frames = [];
  for (let i = 0; i < n; i++) frames.push({ p: [i * 0.01, i * 100, i % 2 ? 1 : -1], r: [[0.5, i * 90], [-0.5, i * 110]] });
  return { replay: { dt: 1 / 30, frames }, player: { x: 0, z: 0, steer: 0 }, rivals: [{ x: 0, z: 0 }, { x: 0, z: 0 }] };
}

test('interpolates between frames', () => {
  const race = fakeRace();
  const s = sampleReplay(race.replay, 1.5 / 30);
  assert.ok(Math.abs(s.p[1] - 150) < 1e-6);
  assert.ok(Math.abs(s.r[0][1] - 135) < 1e-6);
  assert.ok(Math.abs(s.r[1][1] - 165) < 1e-6);
});

test('clamps at the ends and applies to the race', () => {
  const race = fakeRace();
  const rp = createReplayPlayer(race);
  assert.ok(Math.abs(rp.duration - 1) < 1e-9);
  rp.step(5);
  assert.equal(rp.t, rp.duration);
  assert.equal(rp.done, true);
  assert.equal(rp.apply(), true);
  assert.equal(race.player.z, 3000);
  assert.equal(race.rivals[1].z, 3300);
  assert.equal(sampleReplay(race.replay, -3).p[1], 0);
});

test('cameras switch automatically and manually', () => {
  const frames = fakeRace(30 * 40).replay;
  const rp = createReplayPlayer({ replay: frames });
  assert.equal(rp.camera, REPLAY_CAMERAS[0]);
  for (let i = 0; i < CAMERA_SECS * 30 + 2; i++) rp.step(1 / 30);
  assert.equal(rp.camera, REPLAY_CAMERAS[1]);
  rp.nextCamera();
  assert.equal(rp.camera, REPLAY_CAMERAS[2]);
  rp.restart();
  assert.equal(rp.t, 0);
  assert.equal(rp.camera, REPLAY_CAMERAS[0]);
});

test('empty or missing recordings are safe', () => {
  const rp = createReplayPlayer({});
  assert.equal(rp.duration, 0);
  assert.equal(rp.done, true);
  assert.equal(rp.apply(), false);
  rp.step(1);
  assert.equal(sampleReplay(null, 0), null);
});
