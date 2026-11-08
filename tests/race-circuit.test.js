import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race, gearFor, REPLAY_DT, COUNTDOWN } from '../js/race.js';
import { SEGMENT_LENGTH } from '../js/physics.js';

const DT = 1 / 30;

function runCircuit(opts = {}, steer = () => 0, maxSecs = 400) {
  const events = { lap: [], finalLap: 0, goal: null };
  const race = new Race({
    circuit: 'coast',
    vehicle: 'car',
    speed: 'normal',
    seed: 3,
    laps: 2,
    ...opts,
    hooks: {
      lap: (n, time, best) => events.lap.push({ n, time, best }),
      finalLap: () => events.finalLap++,
      goal: (r) => (events.goal = r),
    },
  });
  let t = 0;
  while (race.state !== 'goal' && t < maxSecs) {
    race.update(DT, { steer: steer(race, t) });
    t += DT;
  }
  return { race, events };
}

test('circuit race uses the circuit course and counts laps', () => {
  const { race, events } = runCircuit();
  assert.equal(race.isCircuit, true);
  assert.equal(race.course.circuit, true);
  assert.equal(race.state, 'goal', 'finishes');
  assert.equal(events.lap.length, 2, 'one lap event per completed lap');
  assert.deepEqual(events.lap.map((e) => e.n), [1, 2]);
  assert.equal(events.finalLap, 1);
  assert.equal(race.lapTimes.length, 2);
  for (const lt of race.lapTimes) assert.ok(lt > 3 && lt < 200, `lap time ${lt}`);
  assert.equal(race.bestLap, Math.min(...race.lapTimes));
  assert.ok(events.lap[0].best, 'the first lap is always a best lap');
  // Laps add up to the race time (start of lap 1 = green light).
  const sum = race.lapTimes.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - race.result().raceTime) < 0.1, `${sum} vs ${race.result().raceTime}`);
  const res = race.result();
  assert.deepEqual(res.lapTimes, race.lapTimes);
  assert.equal(res.bestLap, race.bestLap);
  assert.equal(res.laps, 2);
  assert.ok(res.rank >= 1 && res.rank <= 6);
  assert.equal(res.order.length, 6);
});

test('rivals carry their sports-car look', () => {
  const race = new Race({ circuit: 'mountain', vehicle: 'car', seed: 1 });
  assert.equal(race.rivals.length, 5);
  for (const r of race.rivals) {
    assert.ok(r.car && r.car.model && r.car.color, 'car info kept');
    assert.equal(typeof r.animal, 'string');
  }
  assert.equal(race.laps, 3);
});

test('auto-brake slows the player before corners without any input', () => {
  const race = new Race({ circuit: 'mountain', vehicle: 'car', speed: 'normal', seed: 5, laps: 1 });
  let braked = false;
  let minInBrake = Infinity;
  let t = 0;
  while (race.state !== 'goal' && t < 300) {
    race.update(DT, { steer: 0 });
    t += DT;
    if (race.state !== 'race') continue;
    const cap = race.course.brake[race.segIndex(race.player.z)];
    if (race.braking) braked = true;
    // Never noticeably above the recommended pace once settled (allow the braking ramp).
    if (cap < 0.99 && !race.braking) minInBrake = Math.min(minInBrake, cap);
    assert.ok(race.speedPct <= Math.max(cap, 0) + 0.25, `speed ${race.speedPct} vs cap ${cap}`);
  }
  assert.ok(braked, 'the car braked at least once');
  assert.ok(minInBrake < 1, 'there were braking zones');
});

test('rivals also respect the braking zones', () => {
  const race = new Race({ circuit: 'mountain', vehicle: 'car', speed: 'normal', seed: 5, laps: 1 });
  let rivalBraked = false;
  for (let i = 0; i < 30 * 60 && race.state !== 'goal'; i++) {
    race.update(DT, { steer: 0 });
    if (race.rivals.some((r) => r.braking)) rivalBraked = true;
  }
  assert.ok(rivalBraked);
});

test('gearbox: gears rise with speed, rpm stays in range', () => {
  let prev = 0;
  for (let v = 0; v <= 1.5; v += 0.01) {
    const { gear, rpm } = gearFor(v);
    assert.ok(gear >= 1 && gear <= 6);
    assert.ok(gear >= prev, 'monotonic');
    assert.ok(rpm >= 0 && rpm <= 1);
    prev = gear;
  }
  assert.equal(gearFor(0).gear, 1);
  assert.equal(gearFor(1.2).gear, 6);
  assert.equal(gearFor(NaN).gear, 1);
  const race = new Race({ circuit: 'coast', vehicle: 'car', seed: 2, laps: 1 });
  for (let i = 0; i < 30 * 12; i++) race.update(DT, {});
  assert.ok(race.player.gear >= 3, `gear ${race.player.gear}`);
  assert.ok(race.player.rpm >= 0 && race.player.rpm <= 1);
});

test('replay records every car at a fixed rate in the agreed format', () => {
  const { race } = runCircuit({ laps: 1 });
  // A few more seconds after the line are recorded too.
  for (let i = 0; i < 30 * 4; i++) race.update(DT, {});
  const rp = race.replay;
  assert.ok(rp && Math.abs(rp.dt - REPLAY_DT) < 1e-12);
  assert.ok(rp.frames.length > 30 * 10);
  const expect = Math.floor((race.time - COUNTDOWN) / REPLAY_DT);
  assert.ok(rp.frames.length <= expect + 2, 'no extra frames');
  for (const f of rp.frames) {
    assert.equal(f.p.length, 3);
    assert.equal(f.r.length, race.rivals.length);
    for (const v of [...f.p, ...f.r.flat()]) assert.ok(Number.isFinite(v));
  }
  // Positions move forward over time; recording stops ~3 s after the finish.
  assert.ok(rp.frames[rp.frames.length - 1].p[1] > rp.frames[0].p[1]);
  const endT = (rp.frames.length - 1) * REPLAY_DT;
  assert.ok(endT <= race.result().raceTime + 3.2, `${endT}`);
  assert.ok(rp.frames.at(-1).p[1] >= race.course.goalZ - SEGMENT_LENGTH);
});

test('normal races are unchanged: no replay, no laps, cosmetic gauge scale kept', () => {
  const race = new Race({ course: 'meadow', vehicle: 'car', seed: 4, length: 300 });
  assert.equal(race.isCircuit, false);
  assert.equal(race.replay, null);
  for (let i = 0; i < 30 * 8; i++) race.update(DT, {});
  assert.ok(race.kmh <= 175);
  assert.deepEqual(race.result().lapTimes, []);
});

test('circuit tuning only applies on circuits and keeps easy < normal < hard pace', async () => {
  const { AI_LEVELS, AI_LEVEL_IDS, effectiveLevel } = await import('../js/ai.js');
  for (const id of AI_LEVEL_IDS) {
    assert.equal(effectiveLevel({ level: AI_LEVELS[id] }), AI_LEVELS[id], 'normal courses use the plain level');
    const c = effectiveLevel({ level: AI_LEVELS[id], brake: new Float32Array(4) });
    assert.notEqual(c, AI_LEVELS[id]);
    assert.ok(c.skillMul > 0.5 && c.skillMul <= 1);
  }
  const pace = (id) => {
    const c = effectiveLevel({ level: AI_LEVELS[id], brake: [1] });
    return ((c.skill[0] + c.skill[1]) / 2) * c.skillMul;
  };
  assert.ok(pace('easy') < pace('normal') && pace('normal') < pace('hard'));
});
