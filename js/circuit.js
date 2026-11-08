// Closed-circuit tracks for the "サーキット" mode: one lap is generated, then tiled `laps` times.
// The returned object is compatible with generateCourse() (segments, goalIndex, goalZ, def, rivals, ...).
import { makeRng } from './rng.js';
import { SEGMENT_LENGTH, easeInOut } from './physics.js';
import { gridSlots } from './ai.js';
import { START_LINE, RIVAL_ANIMALS, hashString } from './course.js';

export const CIRCUITS = {
  coast: {
    id: 'coast',
    label: 'うみぞい サーキット',
    circuit: true,
    night: false,
    base: 'sea', // fallback palette / scenery family
    music: 'sea',
    lapLength: 330,
    sharpness: [2.2, 4.4],
    hills: 0.35,
    deco: ['palm', 'palm', 'bush', 'lighthouse'],
  },
  mountain: {
    id: 'mountain',
    label: 'やまの サーキット',
    circuit: true,
    night: false,
    base: 'meadow',
    music: 'meadow',
    lapLength: 360,
    sharpness: [2.6, 4.8],
    hills: 0.6,
    deco: ['pine', 'tree', 'tree', 'bush'],
  },
};
export const CIRCUIT_IDS = Object.keys(CIRCUITS);

export const CAR_MODEL_IDS = ['gt', 'proto', 'hatch'];
// Kept local so this module has no dependency on the drawing code.
const RIVAL_COLORS = ['#1f5fd1', '#f2b705', '#1e9e5a', '#ffffff', '#8a3fd1', '#ff7a1a', '#222831', '#9aa3ad'];

const RUN_OUT = 260; // segments after the final line so the road never ends on screen
const LOOK_AHEAD = 26; // segments the braking model looks ahead
const MIN_RATIO = 0.55;

/** Recommended speed ratio for a segment with this curve value (no look-ahead). */
export function cornerSpeed(curve) {
  return Math.max(MIN_RATIO, 1 - 0.095 * Math.abs(curve || 0));
}

/**
 * Per-segment recommended speed ratio (0..1). Drops before corners so cars
 * brake in a straight line and lifts again on the exit.
 */
export function brakeProfile(curves, lapLength) {
  const n = curves.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 1;
    for (let k = 0; k <= LOOK_AHEAD; k++) {
      // Wrap within the lap pattern so the profile before the line knows about lap 2's first corner.
      const j = i + k < n ? i + k : i + k - lapLength;
      if (j < 0 || j >= n) continue;
      v = Math.min(v, cornerSpeed(curves[j]) + k * 0.014);
    }
    out[i] = Math.max(0, Math.min(1, v));
  }
  return out;
}

/** Build one lap: returns arrays of curve / height per lap position (0 = the start line). */
function buildLap(def, rng) {
  const L = def.lapLength;
  const curve = [];
  const y = [];
  let lastY = 0;
  const add = (c, h) => {
    curve.push(c);
    y.push(h);
    lastY = h;
  };
  const addRoad = (enter, hold, leave, c, hill) => {
    const startY = lastY;
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) add(easeInOut(0, c, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) add(c, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) add(easeInOut(c, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  };
  // Main straight after the line.
  addRoad(4, 44, 4, 0, 0);
  const endStraight = 46; // the lap finishes on the main straight (before the line)
  let side = rng.chance(0.5) ? 1 : -1;
  while (curve.length < L - endStraight - 20) {
    const room = L - endStraight - curve.length;
    const len = Math.min(room, rng.int(28, 60));
    const enter = Math.floor(len * 0.3);
    const leave = Math.floor(len * 0.3);
    const hold = Math.max(0, len - enter - leave);
    let c = 0;
    if (rng.chance(0.7)) {
      c = side * rng.range(def.sharpness[0], def.sharpness[1]);
      // Mostly alternate, sometimes a double corner the same way.
      if (rng.chance(0.75)) side = -side;
    }
    const hill = rng.chance(def.hills) ? rng.range(-1, 1) * rng.range(1, 3) : 0;
    addRoad(enter, hold, leave, c, hill);
    // A short straight between corners gives room to brake.
    if (curve.length < L - endStraight - 12) addRoad(2, rng.int(4, 12), 2, 0, 0);
  }
  // Return to height 0 and pad the main straight up to exactly L.
  const rest = L - curve.length;
  const a = Math.floor(rest / 3);
  addRoad(a, rest - 2 * a, a, 0, -lastY / SEGMENT_LENGTH);
  while (curve.length > L) {
    curve.pop();
    y.pop();
  }
  y[L - 1] = 0;
  return { curve, y };
}

/**
 * Generate a circuit race.
 * @param {string} id key of CIRCUITS
 * @param {{laps?:number, seed?:number}} opts
 */
export function generateCircuit(id, opts = {}) {
  const def = CIRCUITS[id] || CIRCUITS.coast;
  const laps = Math.max(1, Math.floor(opts.laps ?? 3));
  const seed = opts.seed ?? hashString(def.id) + 7;
  const rng = makeRng(seed);
  const lap = buildLap(def, rng);
  const L = lap.curve.length;
  const goalIndex = START_LINE + laps * L;
  const total = goalIndex + RUN_OUT;

  const segments = [];
  const curves = [];
  for (let i = 0; i < total; i++) {
    const p = (((i - START_LINE) % L) + L) % L; // position within the lap
    const pPrev = (p - 1 + L) % L;
    segments.push({
      index: i,
      lapPos: p,
      curve: lap.curve[p],
      y1: lap.y[pPrev],
      y2: lap.y[p],
      deco: [],
      items: [],
      obstacles: [],
      boost: null,
      ramp: null,
      sea: false,
      clip: 0,
    });
    curves.push(lap.curve[p]);
  }
  // Flatten the first segment's start height (nothing before it).
  segments[0].y1 = segments[0].y2;

  // Corners of one lap (severity 0..1), then repeated for each lap so signs appear every lap.
  const lapCorners = [];
  for (let p = 1; p < L; p++) {
    const c = lap.curve[p];
    const prev = lap.curve[p - 1];
    if (Math.abs(c) > 1.2 && Math.abs(prev) <= 1.2) {
      let peak = 0;
      for (let q = p; q < L && Math.abs(lap.curve[q]) > 0.2; q++) peak = Math.max(peak, Math.abs(lap.curve[q]));
      lapCorners.push({ pos: p, dir: Math.sign(c), severity: Math.min(1, peak / def.sharpness[1]) });
    }
  }
  const corners = [];
  for (let k = 0; k < laps + 1; k++) {
    for (const lc of lapCorners) {
      const index = START_LINE + k * L + lc.pos;
      if (index < total) corners.push({ index, dir: lc.dir, severity: lc.severity, lap: k + 1 });
    }
  }

  const course = {
    id: def.id,
    def,
    circuit: true,
    laps,
    lapLength: L,
    lapZ: L * SEGMENT_LENGTH,
    segments,
    goalIndex,
    goalZ: goalIndex * SEGMENT_LENGTH,
    trackLength: total * SEGMENT_LENGTH,
    eventIndex: -1,
    events: [],
    rivals: [],
    curves: corners.map((c) => ({ index: c.index, dir: c.dir })),
    corners,
    brake: brakeProfile(curves, L),
    startLines: Array.from({ length: laps + 1 }, (_, k) => START_LINE + k * L),
    counts: { star: 0, fruit: 0, boost: 0, obstacle: 0, sign: 0, ramp: 0, board: 0, gravel: 0 },
  };

  dressCircuit(course, lapCorners, rng);
  placeCarRivals(course, rng);
  return course;
}

/** Trackside furniture: one lap's worth of dressing, copied to every lap. */
function dressCircuit(course, lapCorners, rng) {
  const { def, lapLength: L, segments } = course;
  const lapDeco = Array.from({ length: L }, () => []);
  const put = (p, d) => {
    const q = ((p % L) + L) % L;
    lapDeco[q].push(d);
  };
  // Start/finish: gantry on the line, pit wall and grandstands along the main straight.
  put(0, { id: 'gantry', x: 0, t: 0 });
  for (let p = -40; p < 40; p += 4) put(p, { id: 'pitwall', x: -1.7, t: 0 });
  for (let p = -30; p <= 30; p += 10) put(p, { id: 'grandstand', x: 3.9, t: rng.next() * 10 });
  put(-20, { id: 'billboard', x: -3.3, t: 0, text: 'BUUBUU' });
  put(20, { id: 'billboard', x: -3.3, t: 0, text: 'RACE' });
  // Corners: braking boards on the approach, gravel + tyre wall on the outside, a marshal.
  for (const c of lapCorners) {
    const out = -c.dir; // outside of the bend
    put(c.pos - 12, { id: 'board100', x: out * 1.75, t: 0 });
    put(c.pos - 6, { id: 'board50', x: out * 1.75, t: 0 });
    for (let k = 0; k < 18; k += 3) {
      put(c.pos + k, { id: 'gravel', x: out * 1.8, t: 0 });
      put(c.pos + k, { id: 'tirewall', x: out * 2.45, t: 0 });
    }
    put(c.pos + 4, { id: 'marshal', x: out * 2.9, t: rng.next() * 10 });
    if (c.severity > 0.7) put(c.pos + 8, { id: 'grandstand', x: out * 4.1, t: rng.next() * 10 });
  }
  // Scenery away from the track.
  for (let p = 0; p < L; p++) {
    if (p % 5 === 0 || rng.chance(0.08)) {
      const sideX = rng.chance(0.5) ? -1 : 1;
      put(p, { id: rng.pick(def.deco), x: sideX * rng.range(3.4, 5.2), t: rng.next() * 10 });
    }
    if (p % 37 === 18) put(p, { id: 'billboard', x: (p % 2 ? 1 : -1) * 3.2, t: 0, text: p % 3 ? 'GO!' : 'BUUBUU' });
  }
  for (const s of segments) {
    for (const d of lapDeco[s.lapPos]) {
      s.deco.push({ ...d });
      if (d.id === 'board100' || d.id === 'board50') course.counts.board++;
      if (d.id === 'gravel') course.counts.gravel++;
    }
  }
}

/** Five rival sports cars on the grid (same slots as the normal race). */
function placeCarRivals(course, rng) {
  const animals = RIVAL_ANIMALS.slice();
  for (let i = animals.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [animals[i], animals[j]] = [animals[j], animals[i]];
  }
  const colors = RIVAL_COLORS.slice();
  const numbers = new Set();
  gridSlots().forEach((slot, n) => {
    const ci = rng.int(0, colors.length - 1);
    const color = colors.splice(ci, 1)[0];
    let number = rng.int(2, 99);
    while (numbers.has(number)) number = (number % 98) + 2;
    numbers.add(number);
    course.rivals.push({
      // `animal` stays as the racer id so the existing race/rank logic works unchanged.
      animal: animals[n % animals.length],
      z: slot.z,
      x: slot.x,
      car: { model: CAR_MODEL_IDS[n % CAR_MODEL_IDS.length], color, number },
    });
  });
}

/** Which lap (1-based) a world z is on; 0 before the first line. */
export function lapAt(course, z) {
  const i = z / SEGMENT_LENGTH - START_LINE;
  if (i < 0) return 0;
  return Math.min(course.laps, Math.floor(i / course.lapLength) + 1);
}
