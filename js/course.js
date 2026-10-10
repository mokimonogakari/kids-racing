// Course generation: pure data, no drawing. Used by the renderer and tests.
import { makeRng } from './rng.js';
import { SEGMENT_LENGTH, easeInOut } from './physics.js';

export const COURSES = {
  meadow: {
    id: 'meadow',
    label: 'はらっぱ',
    fruits: ['apple', 'strawberry'],
    obstacle: 'hay',
    event: 'cow',
    deco: ['tree', 'tree', 'tulips', 'sunflower', 'bush', 'sheep', 'rabbit', 'house', 'flowers'],
    animals: ['sheep', 'rabbit'],
    music: 'meadow',
  },
  sea: {
    id: 'sea',
    label: 'うみ',
    fruits: ['watermelon', 'pineapple'],
    obstacle: 'beachball',
    event: 'whale',
    deco: ['palm', 'palm', 'umbrella', 'crab', 'sandcastle', 'shellpile', 'lighthouse'],
    decoSea: ['boat', 'buoy', 'dolphin'],
    animals: ['crab', 'dolphin'],
    music: 'sea',
  },
  snow: {
    id: 'snow',
    label: 'ゆきやま',
    fruits: ['mikan', 'grape'],
    obstacle: 'snowball',
    event: 'snowman',
    deco: ['pine', 'pine', 'pine', 'penguin', 'igloo', 'snowbush', 'snowmanSmall'],
    animals: ['penguin'],
    music: 'snow',
  },
};

export const COURSE_IDS = Object.keys(COURSES);

export const START_LINE = 9;

export const RIVAL_ANIMALS = ['bear', 'rabbit', 'frog', 'pig', 'cat'];

/**
 * Build a course.
 * @param {string} id meadow | sea | snow
 * @param {{length?: number, seed?: number}} opts length = segments until goal
 */
export function generateCourse(id, opts = {}) {
  const def = COURSES[id] || COURSES.meadow;
  const goalIndex = Math.max(80, Math.floor(opts.length || 1000));
  const seed = opts.seed ?? hashString(def.id) + goalIndex;
  const rng = makeRng(seed);
  const segments = [];
  let lastY = 0;

  const addSegment = (curve, y) => {
    const i = segments.length;
    segments.push({
      index: i,
      curve,
      y1: lastY,
      y2: y,
      deco: [],
      items: [],
      obstacles: [],
      boost: null,
      sea: def.id === 'sea',
      clip: 0,
    });
    lastY = y;
  };
  const addRoad = (enter, hold, leave, curve, hill) => {
    const startY = lastY;
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeInOut(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  };

  // Start straight.
  addRoad(10, 20, 10, 0, 0);
  // Body of the course: gentle curves and soft hills, ends before the finishing straight.
  const finishStraight = 50;
  let side = rng.chance(0.5) ? 1 : -1;
  while (segments.length < goalIndex - finishStraight) {
    const room = goalIndex - finishStraight - segments.length;
    const len = Math.min(room, rng.int(30, 70));
    const enter = Math.floor(len * 0.3);
    const leave = Math.floor(len * 0.3);
    const hold = Math.max(0, len - enter - leave);
    const kind = rng.next();
    let curve = 0;
    if (kind < 0.62) {
      curve = side * rng.range(1.6, 3.6);
      side = -side;
    }
    const hill = rng.chance(0.45) ? rng.range(-1, 1) * rng.range(1.5, 3.5) : 0;
    addRoad(enter, hold, leave, curve, hill);
  }
  // Finishing straight + run-out past the goal so the road never ends on screen.
  const remaining = goalIndex - segments.length;
  addRoad(Math.floor(remaining / 3), remaining - 2 * Math.floor(remaining / 3), Math.floor(remaining / 3), 0, -lastY / SEGMENT_LENGTH);
  addRoad(20, 220, 20, 0, 0);

  const course = {
    id: def.id,
    def,
    segments,
    goalIndex,
    goalZ: goalIndex * SEGMENT_LENGTH,
    trackLength: segments.length * SEGMENT_LENGTH,
    eventIndex: Math.floor(goalIndex * 0.48),
    events: [],
    rivals: [],
    counts: { star: 0, fruit: 0, boost: 0, obstacle: 0 },
  };

  placeDecorations(course, rng);
  placeItems(course, rng);
  placeRivals(course, rng);
  course.events.push({ type: def.event, index: course.eventIndex, fired: false });
  return course;
}

function placeDecorations(course, rng) {
  const { segments, def, goalIndex } = course;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (i % 4 === 0 || rng.chance(0.12)) {
      const leftSide = rng.chance(0.5);
      const sea = def.id === 'sea';
      // On the sea course the right side is water: use sea decorations there.
      if (sea && !leftSide) {
        if (rng.chance(0.35)) s.deco.push({ id: rng.pick(def.decoSea), x: rng.range(2.6, 4.2), t: rng.next() * 10 });
      } else {
        const x = (leftSide ? -1 : 1) * rng.range(2.15, 3.6);
        s.deco.push({ id: rng.pick(def.deco), x, t: rng.next() * 10 });
      }
    }
    if (i % 9 === 0 && def.id !== 'sea') {
      s.deco.push({ id: def.id === 'snow' ? 'pine' : 'tree', x: rng.chance(0.5) ? -4.6 : 4.6, t: 0 });
    }
  }
  // Start banner and goal gate.
  segments[START_LINE].deco.push({ id: 'startgate', x: 0, t: 0 });
  segments[goalIndex].deco.push({ id: 'goalgate', x: 0, t: 0 });
  // Balloons & flags around the goal.
  for (let k = 1; k <= 6; k++) {
    const s = segments[goalIndex - k * 5];
    if (s) {
      s.deco.push({ id: 'balloons', x: -2.3, t: k });
      s.deco.push({ id: 'balloons', x: 2.3, t: k + 0.5 });
    }
  }
  // Event decoration spot (static part).
  const ev = segments[course.eventIndex];
  if (def.event === 'snowman') ev.deco.push({ id: 'snowmanBig', x: -2.5, t: 0, event: true });
  if (def.event === 'whale') ev.deco.push({ id: 'whale', x: 3.0, t: 0, event: true });
  if (def.event === 'cow') ev.deco.push({ id: 'cow', x: -2.6, t: 0, event: true, moving: true });
}

function placeItems(course, rng) {
  const { segments, def, goalIndex } = course;
  const lanes = [-0.55, 0, 0.55];
  let i = 50;
  let fruitToggle = 0;
  while (i < goalIndex - 30) {
    const r = rng.next();
    const lane = rng.pick(lanes);
    if (r < 0.55) {
      // A gentle line of stars along one lane (sometimes snaking).
      const snake = rng.chance(0.35);
      const n = rng.int(4, 7);
      for (let k = 0; k < n; k++) {
        const x = snake ? Math.sin(k / 2) * 0.55 : lane;
        segments[i + k * 3].items.push({ kind: 'star', id: 'star', x, taken: false });
        course.counts.star++;
      }
      i += n * 3 + rng.int(8, 16);
    } else if (r < 0.8) {
      const id = def.fruits[fruitToggle++ % def.fruits.length];
      segments[i].items.push({ kind: 'fruit', id, x: lane, taken: false });
      course.counts.fruit++;
      i += rng.int(10, 18);
    } else if (r < 0.9) {
      for (let k = 0; k < 3; k++) segments[i + k].boost = { x: lane, w: 0.75, part: k };
      // Reward stars just after the boost pad.
      for (let k = 1; k <= 3; k++) {
        segments[i + 6 + k * 3].items.push({ kind: 'star', id: 'star', x: lane, taken: false });
        course.counts.star++;
      }
      course.counts.boost++;
      i += rng.int(22, 30);
    } else {
      const x = rng.pick([-0.5, 0.5]);
      segments[i].obstacles.push({ id: def.obstacle, x, w: 0.55, hop: 0 });
      course.counts.obstacle++;
      i += rng.int(14, 22);
    }
  }
  // Two guaranteed full-width rainbow boost carpets, so everyone gets a "びゅーん".
  for (const f of [0.3, 0.72]) {
    const k = Math.floor(goalIndex * f);
    for (let j = 0; j < 3; j++) segments[k + j].boost = { x: 0, w: 2, part: j };
    course.counts.boost++;
  }
  // Keep the event spot clear of obstacles.
  for (let k = course.eventIndex - 12; k < course.eventIndex + 12; k++) segments[k].obstacles.length = 0;
}

function placeRivals(course, rng) {
  const animals = RIVAL_ANIMALS.slice();
  const spots = [0.06, 0.2, 0.38, 0.58, 0.78];
  spots.forEach((f, n) => {
    course.rivals.push({
      animal: animals[n % animals.length],
      z: Math.floor(course.goalIndex * f) * SEGMENT_LENGTH + 400,
      x: n % 2 ? 0.5 : -0.5,
      speedFactor: rng.range(0.42, 0.55),
      passed: false,
      cheer: 0,
      hop: 0,
    });
  });
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function findSegment(course, z) {
  const n = course.segments.length;
  const i = Math.max(0, Math.min(n - 1, Math.floor(z / SEGMENT_LENGTH)));
  return course.segments[i];
}
