// Closed-circuit tracks for the "サーキット" mode: one lap is generated, then tiled `laps` times.
// The returned object is compatible with generateCourse() (segments, goalIndex, goalZ, def, rivals, ...).
import { makeRng } from './rng.js';
import { SEGMENT_LENGTH } from './physics.js';
import { gridSlots } from './ai.js';
import { START_LINE, RIVAL_ANIMALS, hashString } from './course.js';
import { buildTrack, frameAt, elevationAt, curvatureBetween } from './track3d.js';

export const CIRCUITS = {
  coast: {
    id: 'coast',
    label: 'うみぞい サーキット',
    circuit: true,
    night: false,
    base: 'sea', // fallback palette / scenery family
    music: 'sea',
    sharpness: [1.2, 6],
    deco: ['palm', 'palm', 'bush', 'lighthouse'],
  },
  mountain: {
    id: 'mountain',
    label: 'やまの サーキット',
    circuit: true,
    night: false,
    base: 'meadow',
    music: 'meadow',
    sharpness: [1.2, 6],
    deco: ['pine', 'tree', 'tree', 'bush'],
  },
};
export const CIRCUIT_IDS = Object.keys(CIRCUITS);
// Lap length in segments follows from the 3D layout.
for (const def of Object.values(CIRCUITS)) def.lapLength = Math.round(buildTrack(def.id).length / 5);

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

/** Curve value (the pseudo-3D scale used by physics/AI/rendering) per 1/m of curvature. */
export const CURVE_PER_CURVATURE = 175;
/** Curvature below this is treated as straight (keeps the main straight exactly straight). */
const STRAIGHT_CURVE = 0.12;
/** Metres of track per segment (nominal; the exact value is course.metersPerSegment). */
export const METERS_PER_SEGMENT = 5;

/**
 * Build one lap from the closed 3D layout: curve / height per lap position (0 = the start line).
 * Heights are in world units (SEGMENT_LENGTH per segment), i.e. metres * SEGMENT_LENGTH / mps.
 */
function buildLap(def) {
  const track = buildTrack(def.id);
  const L = Math.round(track.length / METERS_PER_SEGMENT);
  const mps = track.length / L;
  const unitsPerMetre = SEGMENT_LENGTH / mps;
  const curve = [];
  const y = [];
  for (let p = 0; p < L; p++) {
    let c = CURVE_PER_CURVATURE * curvatureBetween(track, p * mps, (p + 1) * mps);
    if (Math.abs(c) < STRAIGHT_CURVE) c = 0;
    curve.push(Math.max(-6, Math.min(6, c)));
    // y[p] is the height at the END of lap segment p
    y.push(elevationAt(track, (p + 1) * mps) * unitsPerMetre);
  }
  y[L - 1] = 0; // the lap closes exactly at the line
  return { curve, y, track, mps };
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
  const lap = buildLap(def);
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
    // 3D geometry (track3d.js): the race keeps z/x, the 3D view maps them onto this loop.
    track: lap.track,
    metersPerSegment: lap.mps,
  };
  /** Race coordinates → track coordinates: s in metres within the lap (0 = the line), x unchanged. */
  course.toTrack = (z, x = 0) => {
    const seg = z / SEGMENT_LENGTH - START_LINE;
    const len = lap.track.length;
    return { s: (((seg * lap.mps) % len) + len) % len, x };
  };
  /** World frame of race position (z, x) on the 3D loop (see track3d.frameAt). */
  course.frameAt = (z, x = 0) => {
    const t = course.toTrack(z, x);
    return frameAt(lap.track, t.s, t.x);
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
