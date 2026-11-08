// Closed-loop circuit layouts for the 3D "サーキット" mode (pure math, no three.js).
// Units are metres. World axes: X/Z horizontal, Y up (same as three.js).
// A car facing along the tangent `tan` has its right-hand side along `nor` = tan × up.

/**
 * Layouts are control points [x, z, elevation] of a closed centripetal Catmull-Rom loop.
 * The first point is the start/finish line and sits in the middle of the main straight.
 * Each layout is uniformly scaled so the lap length is about `length` metres.
 */
export const TRACK_LAYOUTS = {
  coast: {
    id: 'coast',
    length: 3200,
    width: 14,
    bank: 0.04, // max bank angle (rad) in the tightest corners
    // A fast seaside lap: long main straight along the shore, a hairpin, an S, sweepers back.
    points: [
      [0, 0, 0], [160, 0, 0], [320, 0, 0], [470, 0, 0], [590, 6, 0.5],
      [665, 40, 1], [690, 100, 1.5], [660, 155, 2], [590, 160, 2.5], [520, 135, 3],
      [455, 140, 3.5], [400, 185, 4], [330, 225, 5], [250, 215, 5.5], [180, 250, 6],
      [90, 300, 5], [-20, 300, 4], [-120, 265, 3], [-185, 195, 2], [-200, 115, 1],
      [-170, 45, 0.5], [-110, 8, 0], [-55, 0, 0],
    ],
  },
  mountain: {
    id: 'mountain',
    length: 2900,
    width: 14,
    bank: 0.06,
    // A climbing mountain lap with blind crests, a long uphill sweeper and a downhill hairpin.
    points: [
      [0, 0, 0], [140, 0, 0], [280, 0, 0], [390, 15, 2], [470, 65, 6],
      [510, 140, 11], [500, 220, 16], [445, 280, 20], [375, 290, 24], [320, 330, 27],
      [315, 400, 30], [270, 460, 28], [190, 475, 24], [120, 440, 19], [60, 390, 15],
      [-10, 400, 11], [-90, 380, 6], [-150, 320, 2], [-165, 240, -3], [-130, 175, -6],
      [-165, 110, -8], [-160, 50, -5], [-110, 10, -2], [-55, 0, 0],
    ],
  },
};
export const TRACK_IDS = Object.keys(TRACK_LAYOUTS);

const SUBDIV = 48; // spline points per control span before arc-length resampling
const CURV_WINDOW = 5; // metres either side used for the signed curvature

/** Centripetal Catmull-Rom between p1 and p2 (alpha 0.5), t in 0..1. */
function catmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-6, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - tt) / (t1 - t0)) * p0[k] + ((tt - t0) / (t1 - t0)) * p1[k];
    const a2 = ((t2 - tt) / (t2 - t1)) * p1[k] + ((tt - t1) / (t2 - t1)) * p2[k];
    const a3 = ((t3 - tt) / (t3 - t2)) * p2[k] + ((tt - t2) / (t3 - t2)) * p3[k];
    const b1 = ((t2 - tt) / (t2 - t0)) * a1 + ((tt - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - tt) / (t3 - t1)) * a2 + ((tt - t1) / (t3 - t1)) * a3;
    out[k] = ((t2 - tt) / (t2 - t1)) * b1 + ((tt - t1) / (t2 - t1)) * b2;
  }
  return out;
}

/** Dense closed polyline [x, y(elev), z] for a layout scaled by `scale` (horizontal only). */
function densePolyline(layout, scale) {
  // control points as [x, elevation, z] so the spline also smooths the height
  const P = layout.points.map(([x, z, e]) => [x * scale, e, z * scale]);
  const n = P.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    for (let k = 0; k < SUBDIV; k++) pts.push(catmull(p0, p1, p2, p3, k / SUBDIV));
  }
  return pts;
}

function polyLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return L;
}

/** Resample a closed polyline every `step` metres (arc length). Returns positions and exact length. */
function resample(pts, step) {
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const length = cum[n];
  const count = Math.round(length / step);
  const ds = length / count; // ≈ step, makes the loop close exactly
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = k * ds;
    while (j < n - 1 && cum[j + 1] < s) j++;
    const a = pts[j];
    const b = pts[(j + 1) % n];
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  return { pos: out, length, ds };
}

const cache = new Map();

/**
 * Build (and cache) a closed track.
 * @param {string} id key of TRACK_LAYOUTS (unknown ids fall back to 'coast')
 * @returns {{id:string, length:number, width:number, step:number,
 *   samples:Array<{s:number,pos:number[],tan:number[],nor:number[],up:number[],curv:number,bank:number}>}}
 */
export function buildTrack(id) {
  const layout = TRACK_LAYOUTS[id] || TRACK_LAYOUTS.coast;
  if (cache.has(layout.id)) return cache.get(layout.id);
  // Scale the horizontal shape so the lap is close to the target length.
  let scale = 1;
  for (let it = 0; it < 3; it++) scale *= layout.length / polyLength(densePolyline(layout, scale));
  const { pos, length, ds } = resample(densePolyline(layout, scale), 1);
  const N = pos.length;
  const at = (i) => pos[((i % N) + N) % N];
  // Horizontal heading per sample (unit tangent in the XZ plane).
  const heading = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = at(i - 1);
    const b = at(i + 1);
    heading[i] = Math.atan2(b[0] - a[0], b[2] - a[2]); // 0 = +Z
  }
  const w = Math.max(1, Math.round(CURV_WINDOW / ds));
  const samples = new Array(N);
  let maxCurv = 1e-6;
  const curvs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let dh = heading[(i + w) % N] - heading[(i - w + N) % N];
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    // heading = atan2(x, z); turning right (towards nor = (-tz, 0, tx)) makes it decrease,
    // so flip the sign: positive curvature = right-hander (same convention as segment.curve).
    curvs[i] = -dh / (2 * w * ds);
    maxCurv = Math.max(maxCurv, Math.abs(curvs[i]));
  }
  for (let i = 0; i < N; i++) {
    const a = at(i - 1);
    const b = at(i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const tan = [dx / L, dy / L, dz / L];
    const hl = Math.hypot(tan[0], tan[2]) || 1;
    const nor = [-tan[2] / hl, 0, tan[0] / hl];
    // up = nor × tan (perpendicular to the road surface, tilted by the slope)
    const up = [
      nor[1] * tan[2] - nor[2] * tan[1],
      nor[2] * tan[0] - nor[0] * tan[2],
      nor[0] * tan[1] - nor[1] * tan[0],
    ];
    const bank = layout.bank * (curvs[i] / maxCurv); // lean into the corner
    samples[i] = { s: i * ds, pos: at(i).slice(), tan, nor, up, curv: curvs[i], bank };
  }
  const track = { id: layout.id, length, width: layout.width, step: ds, samples };
  cache.set(layout.id, track);
  return track;
}

/**
 * World frame at distance `s` (metres, any value — wraps around the lap) and lateral `x`
 * (-1..1 spans the road from left edge to right edge).
 */
export function frameAt(track, s, x = 0) {
  const N = track.samples.length;
  const f = (((s % track.length) + track.length) % track.length) / track.step;
  const i = Math.floor(f) % N;
  const j = (i + 1) % N;
  const t = f - Math.floor(f);
  const A = track.samples[i];
  const B = track.samples[j];
  const lerp = (u, v) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const tan = norm(lerp(A.tan, B.tan));
  const nor = norm(lerp(A.nor, B.nor));
  const bank = A.bank + (B.bank - A.bank) * t;
  // Bank: rotate nor/up around tan; the outer edge rises.
  const up0 = norm([nor[1] * tan[2] - nor[2] * tan[1], nor[2] * tan[0] - nor[0] * tan[2], nor[0] * tan[1] - nor[1] * tan[0]]);
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const norB = norm([nor[0] * cb + up0[0] * sb, nor[1] * cb + up0[1] * sb, nor[2] * cb + up0[2] * sb]);
  const upB = norm([up0[0] * cb - nor[0] * sb, up0[1] * cb - nor[1] * sb, up0[2] * cb - nor[2] * sb]);
  const c = lerp(A.pos, B.pos);
  const half = track.width / 2;
  const pos = [c[0] + norB[0] * x * half, c[1] + norB[1] * x * half, c[2] + norB[2] * x * half];
  return { pos, tan, nor: norB, up: upB, curv: A.curv + (B.curv - A.curv) * t, bank };
}

/** Elevation (m) of the centre line at distance s. */
export function elevationAt(track, s) {
  return frameAt(track, s, 0).pos[1];
}

/** Signed curvature (1/m, positive = right-hander) averaged over [s0, s1]. */
export function curvatureBetween(track, s0, s1) {
  const n = Math.max(1, Math.round(Math.abs(s1 - s0) / track.step));
  let sum = 0;
  for (let k = 0; k <= n; k++) sum += frameAt(track, s0 + ((s1 - s0) * k) / n).curv;
  return sum / (n + 1);
}
