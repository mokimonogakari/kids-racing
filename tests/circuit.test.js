import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCircuit, CIRCUITS, CIRCUIT_IDS, brakeProfile, cornerSpeed, lapAt, CAR_MODEL_IDS } from '../js/circuit.js';
import { START_LINE } from '../js/course.js';
import { SEGMENT_LENGTH } from '../js/physics.js';

test('segments tile one lap `laps` times plus a run-out', () => {
  for (const id of CIRCUIT_IDS) {
    for (const laps of [1, 3]) {
      const c = generateCircuit(id, { laps, seed: 4 });
      assert.equal(c.lapLength, CIRCUITS[id].lapLength);
      assert.equal(c.goalIndex, START_LINE + laps * c.lapLength);
      assert.equal(c.goalZ, c.goalIndex * SEGMENT_LENGTH);
      assert.equal(c.lapZ, c.lapLength * SEGMENT_LENGTH);
      assert.ok(c.segments.length > c.goalIndex + 100, 'run-out after the line');
      assert.equal(c.circuit, true);
      assert.equal(c.def.circuit, true);
      // every lap is identical
      for (let p = 0; p < c.lapLength; p++) {
        const a = c.segments[START_LINE + p];
        const b = c.segments[START_LINE + (laps - 1) * c.lapLength + p];
        assert.equal(a.curve, b.curve);
        assert.equal(a.y2, b.y2);
      }
      for (const s of c.segments) {
        assert.ok(Number.isFinite(s.curve) && Number.isFinite(s.y1) && Number.isFinite(s.y2));
        assert.deepEqual(s.items, []);
        assert.deepEqual(s.obstacles, []);
        assert.equal(s.ramp, null);
        assert.equal(s.boost, null);
      }
    }
  }
});

test('the lap closes: height returns to 0 and the line sits on a straight', () => {
  for (const id of CIRCUIT_IDS) {
    const c = generateCircuit(id, { laps: 3, seed: 9 });
    for (const line of c.startLines) {
      const s = c.segments[line];
      assert.equal(s.lapPos, 0);
      assert.ok(Math.abs(s.curve) < 1e-9, 'straight at the line');
      assert.ok(Math.abs(c.segments[line - 1].y2) < 1e-6, 'height back to 0 before the line');
      assert.ok(s.deco.some((d) => d.id === 'gantry'), 'start gantry each lap');
    }
    assert.equal(c.startLines.length, 4);
    assert.equal(c.startLines[3], c.goalIndex);
    // heights never jump between neighbours
    for (let i = 1; i < c.segments.length; i++) assert.equal(c.segments[i].y1, c.segments[i - 1].y2);
  }
});

test('brake profile is 0..1 and drops before corners', () => {
  for (const id of CIRCUIT_IDS) {
    const c = generateCircuit(id, { laps: 3, seed: 2 });
    assert.equal(c.brake.length, c.segments.length);
    for (const v of c.brake) assert.ok(v >= 0 && v <= 1);
    assert.ok(c.corners.length >= 2, 'at least two corners per lap');
    let dropped = 0;
    for (const cn of c.corners.filter((k) => k.lap === 1)) {
      // recommended speed at the corner and just before it is lower than on the straight
      const before = c.brake[cn.index - 3];
      assert.ok(before < 1, 'slowing already before the corner');
      if (c.brake[cn.index] < c.brake[cn.index - 25]) dropped++;
      assert.ok(cn.severity > 0 && cn.severity <= 1);
      assert.ok(cn.dir === 1 || cn.dir === -1);
    }
    assert.ok(dropped >= 1);
    // straight at the line is fast (allow a corner within look-ahead)
    assert.ok(Math.max(...c.brake.slice(START_LINE, START_LINE + 15)) > 0.95);
  }
  assert.equal(cornerSpeed(0), 1);
  assert.ok(cornerSpeed(4) < cornerSpeed(2));
  assert.ok(cornerSpeed(99) >= 0.55);
  const p = brakeProfile([0, 0, 0, 0, 4, 4, 0], 7);
  assert.ok(p[0] > p[4]);
});

test('five rival sports cars on the grid with car info', () => {
  const c = generateCircuit('coast', { seed: 3 });
  assert.equal(c.rivals.length, 5);
  const numbers = new Set();
  for (const r of c.rivals) {
    assert.ok(typeof r.animal === 'string');
    assert.ok([800, 1100, 1400].includes(r.z));
    assert.ok(CAR_MODEL_IDS.includes(r.car.model));
    assert.match(r.car.color, /^#[0-9a-f]{6}$/i);
    assert.ok(Number.isInteger(r.car.number) && r.car.number >= 2 && r.car.number <= 99);
    numbers.add(r.car.number);
  }
  assert.equal(numbers.size, 5, 'race numbers are unique');
  assert.equal(new Set(c.rivals.map((r) => r.animal)).size, 5);
});

test('circuit furniture is placed', () => {
  const c = generateCircuit('mountain', { seed: 5 });
  const ids = new Set(c.segments.flatMap((s) => s.deco.map((d) => d.id)));
  for (const id of ['pitwall', 'gantry', 'board100', 'board50', 'gravel', 'tirewall', 'grandstand', 'marshal', 'billboard']) {
    assert.ok(ids.has(id), `has ${id}`);
  }
  assert.ok(c.counts.board > 0 && c.counts.gravel > 0);
  assert.deepEqual(c.events, []);
});

test('deterministic for the same seed, different for another seed', () => {
  const a = generateCircuit('coast', { laps: 3, seed: 11 });
  const b = generateCircuit('coast', { laps: 3, seed: 11 });
  assert.deepEqual(a.segments.map((s) => s.curve), b.segments.map((s) => s.curve));
  assert.deepEqual(a.rivals, b.rivals);
  assert.deepEqual(Array.from(a.brake), Array.from(b.brake));
  // The layout is a fixed 3D circuit; the seed only changes the grid (cars) and trackside dressing.
  const d = generateCircuit('coast', { laps: 3, seed: 12 });
  assert.deepEqual(a.segments.map((s) => s.curve), d.segments.map((s) => s.curve));
  assert.notDeepEqual(a.rivals, d.rivals);
  // unknown id falls back
  assert.equal(generateCircuit('nope', { seed: 1 }).id, 'coast');
});

test('lapAt', () => {
  const c = generateCircuit('coast', { laps: 3, seed: 1 });
  assert.equal(lapAt(c, 0), 0);
  assert.equal(lapAt(c, START_LINE * SEGMENT_LENGTH + 1), 1);
  assert.equal(lapAt(c, (START_LINE + c.lapLength + 1) * SEGMENT_LENGTH), 2);
  assert.equal(lapAt(c, c.goalZ + 5000), 3);
});
