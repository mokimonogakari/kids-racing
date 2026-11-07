import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGhostStore, thinTrace, MAX_POINTS, GHOST_KEY } from '../js/ghost.js';

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const trace = (n) => Array.from({ length: n }, (_, i) => [i / 10, 0, i * 100]);

test('thinTrace keeps at most MAX_POINTS with first and last', () => {
  const t = thinTrace(trace(5000));
  assert.equal(t.length, MAX_POINTS);
  assert.deepEqual(t[0], [0, 0, 0]);
  assert.deepEqual(t[t.length - 1], [499.9, 0, 499900]);
  assert.equal(thinTrace(trace(10)).length, 10);
  assert.deepEqual(thinTrace([[1, 2, 3], 'x', [NaN, 1, 2], [1, 2]]), [[1, 2, 3]]);
  assert.deepEqual(thinTrace(null), []);
});

test('offer saves only improvements and persists', () => {
  const s = mem();
  const g = createGhostStore(s);
  assert.equal(g.get('meadow'), null);
  assert.equal(g.offer('meadow', { time: 70, vehicle: 'bus', trace: trace(20) }), true);
  assert.equal(g.offer('meadow', { time: 75, vehicle: 'car', trace: trace(20) }), false);
  assert.equal(g.offer('meadow', { time: 70, vehicle: 'car', trace: trace(20) }), false);
  assert.equal(g.offer('meadow', { time: 65, vehicle: 'car', trace: trace(20) }), true);
  const again = createGhostStore(s).get('meadow');
  assert.equal(again.time, 65);
  assert.equal(again.vehicle, 'car');
  assert.equal(again.trace.length, 20);
  assert.equal(createGhostStore(s).get('sea'), null);
});

test('rejects invalid runs', () => {
  const g = createGhostStore(mem());
  assert.equal(g.offer('meadow', null), false);
  assert.equal(g.offer('meadow', { time: 0, trace: trace(5) }), false);
  assert.equal(g.offer('meadow', { time: 50, trace: [[0, 0, 0]] }), false);
  assert.equal(g.offer('', { time: 50, trace: trace(5) }), false);
});

test('broken stored data, null and throwing storage', () => {
  const s = mem();
  s.setItem(GHOST_KEY, '{oops');
  assert.equal(createGhostStore(s).get('meadow'), null);
  s.setItem(GHOST_KEY, JSON.stringify({ meadow: { time: 'x', trace: 5 } }));
  assert.equal(createGhostStore(s).get('meadow'), null);
  const n = createGhostStore(null);
  assert.equal(n.offer('sea', { time: 60, trace: trace(5) }), true);
  assert.equal(n.get('sea').time, 60);
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const b = createGhostStore(bad);
  assert.equal(b.offer('snow', { time: 60, trace: trace(5) }), true);
  assert.equal(b.get('snow').time, 60);
  b.reset();
  assert.equal(b.get('snow'), null);
});

test('get returns a copy', () => {
  const g = createGhostStore(mem());
  g.offer('meadow', { time: 60, trace: trace(5) });
  g.get('meadow').trace[0][2] = 999;
  assert.equal(g.get('meadow').trace[0][2], 0);
});
