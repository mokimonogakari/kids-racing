import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCourse, COURSE_IDS, COURSES, START_LINE } from '../js/course.js';
import { SEGMENT_LENGTH } from '../js/physics.js';

test('every course generates with a goal and run-out after it', () => {
  for (const id of COURSE_IDS) {
    const c = generateCourse(id, { length: 1000, seed: 42 });
    assert.equal(c.id, id);
    assert.equal(c.goalIndex, 1000);
    assert.equal(c.goalZ, 1000 * SEGMENT_LENGTH);
    assert.ok(c.segments.length > c.goalIndex + 150, 'road continues past the goal');
    assert.ok(c.segments[c.goalIndex].deco.some((d) => d.id === 'goalgate'));
  }
});

test('generation is deterministic for the same seed', () => {
  const a = generateCourse('sea', { length: 600, seed: 7 });
  const b = generateCourse('sea', { length: 600, seed: 7 });
  assert.deepEqual(
    a.segments.map((s) => [s.curve, s.y1, s.items.length, s.obstacles.length]),
    b.segments.map((s) => [s.curve, s.y1, s.items.length, s.obstacles.length]),
  );
  const c = generateCourse('sea', { length: 600, seed: 8 });
  assert.notDeepEqual(a.segments.map((s) => s.curve), c.segments.map((s) => s.curve));
});

test('segments are continuous and hills are gentle', () => {
  const c = generateCourse('meadow', { length: 1200, seed: 3 });
  for (let i = 1; i < c.segments.length; i++) {
    assert.equal(c.segments[i].y1, c.segments[i - 1].y2);
    assert.ok(Math.abs(c.segments[i].y2 - c.segments[i].y1) < 120, 'no sudden drops');
    assert.ok(Math.abs(c.segments[i].curve) <= 4, 'curves stay gentle');
  }
  // start and finishing straight are flat & straight
  for (let i = 0; i < 20; i++) assert.equal(c.segments[i].curve, 0);
  assert.ok(Math.abs(c.segments[c.goalIndex].y1) < 1, 'goal is back at ground level');
});

test('stars, fruits, boost pads and rivals are placed on the road', () => {
  const c = generateCourse('snow', { length: 1000, seed: 11 });
  assert.ok(c.counts.star >= 20, 'plenty of stars');
  assert.ok(c.counts.fruit >= 3, 'some fruit');
  assert.ok(c.counts.boost >= 2, 'at least the two rainbow carpets');
  assert.equal(c.rivals.length, 5);
  for (const s of c.segments) {
    for (const it of s.items) {
      assert.ok(Math.abs(it.x) <= 0.6, 'items are reachable on the road');
      if (it.kind === 'fruit') assert.ok(COURSES.snow.fruits.includes(it.id));
    }
    for (const o of s.obstacles) assert.ok(Math.abs(o.x) < 1);
    for (const d of s.deco) {
      if (['startgate', 'goalgate'].includes(d.id) || d.event) continue;
      if (d.id === 'cone') assert.ok(Math.abs(d.x) > 1.3 && Math.abs(d.x) < 1.6, 'cones sit on the kerb, not on the lanes');
      else assert.ok(Math.abs(d.x) >= 2, `scenery stays off the road (${d.id} at ${d.x})`);
    }
  }
});

test('rivals start together on the grid behind the start line', () => {
  const seen = new Set();
  for (const seed of [11, 12, 13]) {
    const c = generateCourse('meadow', { length: 1000, seed });
    assert.equal(c.rivals.length, 5);
    for (const r of c.rivals) {
      assert.ok([800, 1100, 1400].includes(r.z), `grid row z=${r.z}`);
      assert.ok(Math.abs(r.x) === 0.5, `grid column x=${r.x}`);
      assert.ok(r.z < START_LINE * SEGMENT_LENGTH, 'behind the start line');
      assert.equal('speedFactor' in r, false, 'rivals no longer wait ahead with a slow speed factor');
      assert.equal(typeof r.animal, 'string');
    }
    assert.equal(new Set(c.rivals.map((r) => r.animal)).size, 5, 'five different animals');
    assert.equal(new Set(c.rivals.map((r) => `${r.z}/${r.x}`)).size, 5, 'one kart per slot');
    assert.ok(!c.rivals.some((r) => r.z === 1100 && r.x === 0.5), 'the middle-right slot is the player');
    seen.add(c.rivals.map((r) => r.animal).join(','));
  }
  assert.ok(seen.size > 1, 'grid order is shuffled between seeds');
});

test('track dressing: curve boards, grandstands and cones are placed', () => {
  const c = generateCourse('meadow', { length: 1000, seed: 11 });
  assert.ok(c.counts.sign >= 1, 'at least one curve warning board');
  assert.ok(Array.isArray(c.curves) && c.curves.length >= 1);
  const ids = new Set();
  for (const s of c.segments) for (const d of s.deco) ids.add(d.id);
  assert.ok(ids.has('signL') || ids.has('signR'), 'chevron boards exist');
  assert.ok(ids.has('grandstand'), 'grandstands exist');
  assert.ok(ids.has('cone'), 'cones exist');
  // boards sit on the outside of the bend, before it starts
  for (const cv of c.curves) {
    const s = c.segments[Math.max(0, cv.index - 4)];
    const board = s.deco.find((d) => d.id === 'signL' || d.id === 'signR');
    if (!board) continue;
    assert.equal(board.id, cv.dir > 0 ? 'signR' : 'signL');
    assert.equal(Math.sign(board.x), -cv.dir, 'board on the outside of the curve');
  }
});

test('event spot is clear of obstacles and short courses still work', () => {
  for (const id of COURSE_IDS) {
    const c = generateCourse(id, { length: 170, seed: 5 });
    assert.ok(c.goalIndex >= 80);
    for (let k = c.eventIndex - 12; k < c.eventIndex + 12; k++) assert.equal(c.segments[k].obstacles.length, 0);
    assert.equal(c.events[0].type, COURSES[id].event);
  }
});
