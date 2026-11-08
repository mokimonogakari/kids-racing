import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, frameAt, TRACK_IDS, TRACK_LAYOUTS, curvatureBetween } from '../js/track3d.js';
import { generateCircuit } from '../js/circuit.js';
import { START_LINE } from '../js/course.js';
import { SEGMENT_LENGTH } from '../js/physics.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('closed loops of the target length, sampled every metre', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(id);
    assert.ok(Math.abs(t.length - TRACK_LAYOUTS[id].length) < 5, `${id} length ${t.length}`);
    assert.ok(t.length >= 2600 && t.length <= 3600);
    assert.equal(t.width, 14);
    assert.ok(Math.abs(t.step - 1) < 0.01);
    const S = t.samples;
    // consecutive samples ~1 m apart, including across the seam (closed loop)
    for (let i = 0; i < S.length; i++) {
      const d = dist(S[i].pos, S[(i + 1) % S.length].pos);
      assert.ok(d > 0.9 && d < 1.1, `${id} gap ${d} at ${i}`);
    }
    // the turning adds up to one full turn
    const turn = S.reduce((a, s) => a + s.curv * t.step, 0);
    assert.ok(Math.abs(Math.abs(turn) - 2 * Math.PI) < 0.05, `${id} turn ${turn}`);
    assert.equal(buildTrack(id), t, 'cached');
  }
});

test('drivable: no corner tighter than 30 m, no self-crossing, start on a flat straight', () => {
  for (const id of TRACK_IDS) {
    const t = buildTrack(id);
    const S = t.samples;
    for (const s of S) assert.ok(Math.abs(s.curv) < 1 / 30, `${id} radius ${1 / Math.abs(s.curv)} at ${s.s}`);
    for (let i = 0; i < S.length; i += 5) {
      for (let j = i + 100; j < S.length; j += 5) {
        if (S.length - (j - i) < 100) continue;
        const a = S[i].pos;
        const b = S[j].pos;
        assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 40, `${id} parts too close at ${i}/${j}`);
      }
    }
    assert.ok(Math.abs(curvatureBetween(t, -60, 60)) < 0.002, 'straight around the line');
    assert.ok(Math.abs(S[0].pos[1]) < 0.01, 'line at height 0');
  }
  const elev = buildTrack('mountain').samples.map((s) => s.pos[1]);
  assert.ok(Math.max(...elev) - Math.min(...elev) > 25, 'the mountain climbs');
});

test('frameAt: orthonormal frame, x spans the road, wraps around', () => {
  const t = buildTrack('coast');
  for (const s of [0, 123.4, 1600, t.length - 0.5]) {
    const c = frameAt(t, s, 0);
    const r = frameAt(t, s, 1);
    const l = frameAt(t, s, -1);
    assert.ok(Math.abs(dist(r.pos, l.pos) - t.width) < 0.01);
    assert.ok(Math.abs(dist(c.pos, r.pos) - t.width / 2) < 0.01);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const v of [c.tan, c.nor, c.up]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
    assert.ok(Math.abs(dot(c.tan, c.nor)) < 1e-3);
    assert.ok(Math.abs(dot(c.tan, c.up)) < 1e-3);
    assert.ok(c.up[1] > 0.9, 'up is up');
  }
  const a = frameAt(t, 50, 0.3).pos;
  const b = frameAt(t, 50 + t.length * 2, 0.3).pos;
  assert.ok(dist(a, b) < 1e-6);
  // right-hand side: at the line the car heads along +X, so its right is -Z... check via cross product
  const f = frameAt(t, 0, 0);
  const cross = [f.tan[1] * f.up[2] - f.tan[2] * f.up[1], f.tan[2] * f.up[0] - f.tan[0] * f.up[2], f.tan[0] * f.up[1] - f.tan[1] * f.up[0]];
  assert.ok(dist(cross, f.nor) < 1e-3, 'nor = tan × up (right-hand side)');
});

test('right-handers have positive curvature and match the segment curve sign', () => {
  const t = buildTrack('coast');
  // find the tightest sample and check the lateral acceleration direction against nor
  let k = 0;
  for (let i = 0; i < t.samples.length; i++) if (Math.abs(t.samples[i].curv) > Math.abs(t.samples[k].curv)) k = i;
  const a = t.samples[k];
  const b = t.samples[(k + 3) % t.samples.length];
  const turn = [b.tan[0] - a.tan[0], 0, b.tan[2] - a.tan[2]];
  const side = turn[0] * a.nor[0] + turn[2] * a.nor[2];
  assert.equal(Math.sign(side), Math.sign(a.curv));
  const c = generateCircuit('coast', { laps: 1, seed: 1 });
  const seg = c.segments.find((s) => Math.abs(s.curve) > 2);
  const tc = c.toTrack(seg.index * SEGMENT_LENGTH + 100);
  assert.equal(Math.sign(curvatureBetween(t, tc.s - 2, tc.s + 2)), Math.sign(seg.curve));
});

test('circuit course maps race coordinates onto the 3D loop', () => {
  for (const id of TRACK_IDS) {
    const c = generateCircuit(id, { laps: 3, seed: 1 });
    assert.equal(c.track, buildTrack(id));
    assert.ok(Math.abs(c.metersPerSegment - 5) < 0.01);
    assert.ok(Math.abs(c.lapLength * c.metersPerSegment - c.track.length) < 1e-6);
    const line = START_LINE * SEGMENT_LENGTH;
    assert.equal(c.toTrack(line, 0.5).s, 0);
    assert.equal(c.toTrack(line, 0.5).x, 0.5);
    assert.ok(Math.abs(c.toTrack(line + c.lapZ).s) < 1e-6 || Math.abs(c.toTrack(line + c.lapZ).s - c.track.length) < 1e-6);
    assert.ok(c.toTrack(line - SEGMENT_LENGTH).s > c.track.length - 6, 'grid is behind the line');
    // segment heights follow the track elevation
    const seg = c.segments[START_LINE + 100];
    const elev = c.frameAt(seg.index * SEGMENT_LENGTH + SEGMENT_LENGTH).pos[1];
    assert.ok(Math.abs(seg.y2 - elev * (SEGMENT_LENGTH / c.metersPerSegment)) < 1e-6);
  }
});
