import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_STATS, STAT_KEYS, statsOf, vehiclePreset, statBars, statLevel } from '../js/vehicle-stats.js';
import { SPEED_PRESETS } from '../js/physics.js';
import { VEHICLES } from '../js/art.js';

test('every vehicle has the three stats within 0.9..1.1', () => {
  for (const v of VEHICLES) {
    const s = VEHICLE_STATS[v.id];
    assert.ok(s, `stats for ${v.id}`);
    for (const k of STAT_KEYS) {
      assert.ok(typeof s[k] === 'number' && s[k] >= 0.9 && s[k] <= 1.1, `${v.id}.${k} = ${s[k]}`);
    }
  }
  assert.deepEqual(VEHICLE_STATS.car, { speed: 1, accel: 1, grip: 1 }, 'the red car is the neutral reference');
});

test('vehiclePreset scales the base preset without mutating it', () => {
  const base = SPEED_PRESETS.slow;
  const before = { ...base };
  const bus = vehiclePreset(base, 'bus');
  assert.equal(bus.maxSpeed, base.maxSpeed * 0.94);
  assert.equal(bus.accel, base.accel * 0.9);
  assert.equal(bus.steer, base.steer * 1.1);
  assert.equal(bus.assist, base.assist, 'other fields are carried over');
  assert.equal(bus.magnet, base.magnet);
  assert.deepEqual(base, before, 'base preset untouched');
  const police = vehiclePreset(base, 'police');
  assert.ok(police.maxSpeed > base.maxSpeed && police.steer < base.steer);
  const car = vehiclePreset(base, 'car');
  assert.deepEqual(car, base);
});

test('unknown vehicles fall back to the plain car', () => {
  assert.deepEqual(statsOf('rocket'), VEHICLE_STATS.car);
  assert.deepEqual(statsOf(undefined), VEHICLE_STATS.car);
  assert.deepEqual(vehiclePreset(SPEED_PRESETS.normal, 'nope'), SPEED_PRESETS.normal);
  assert.deepEqual(statBars('nope'), { speed: 3, accel: 3, grip: 3 });
});

test('statBars gives 1..5 levels that follow the multipliers', () => {
  assert.deepEqual(statBars('car'), { speed: 3, accel: 3, grip: 3 });
  assert.deepEqual(statBars('bus'), { speed: 2, accel: 1, grip: 5 });
  assert.deepEqual(statBars('police'), { speed: 4, accel: 3, grip: 2 });
  assert.deepEqual(statBars('dino'), { speed: 3, accel: 5, grip: 2 });
  assert.deepEqual(statBars('fire'), { speed: 2, accel: 2, grip: 4 });
  assert.deepEqual(statBars('ambulance'), { speed: 3, accel: 4, grip: 3 });
  for (const v of VEHICLES) {
    const b = statBars(v.id);
    for (const k of STAT_KEYS) assert.ok(Number.isInteger(b[k]) && b[k] >= 1 && b[k] <= 5, `${v.id}.${k}`);
  }
  assert.equal(statLevel(0.5), 1, 'clamped low');
  assert.equal(statLevel(2), 5, 'clamped high');
  assert.equal(statLevel(NaN), 3, 'garbage is neutral');
});
