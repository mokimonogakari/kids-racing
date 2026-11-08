// Road surface renderer (V2): asphalt with tone and aggregate, bevelled curbs,
// painted lines, shoulders, mowing stripes and course-specific edges, with distance fog.
//
// drawRoadSegment(r, s, p1, p2, pal, courseId, fogK) draws the BASE of one segment
// (ground, shoulder, curbs, asphalt, paint). The caller still draws boost pads,
// the chequered start/goal lines and jump ramps on top, exactly like before.
import { START_LINE } from './course.js';

const OVER = 90; // matches render.js: painted beyond the canvas for the camera lean

// ---------- colour helpers (cached) ----------
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  if (hex.startsWith('rgb')) {
    v = hex.replace(/[^\d,.]/g, '').split(',').slice(0, 3).map(Number);
    rgbCache.set(hex, v);
    return v;
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}
const mixCache = new Map();
/** Mix hex colour a toward b by k (0..1), quantised to 1/16 so the cache stays small. */
export function mix(a, b, k) {
  const q = Math.max(0, Math.min(16, Math.round(k * 16)));
  if (q === 0) return a;
  const key = a + b + q;
  let v = mixCache.get(key);
  if (v) return v;
  const A = rgb(a);
  const B = rgb(b);
  const f = q / 16;
  v = `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
  mixCache.set(key, v);
  return v;
}
function shade(hex, k) {
  return k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#1a1630', -k);
}

/** Colour distant road and ground fade into (the haze near the horizon). */
export function roadFogColor(pal, night) {
  if (night) return '#2a2f5e';
  return (pal.sky && pal.sky[1]) || '#dfefff';
}

function quad(c, x1, y1, x2, y2, x3, y3, x4, y4, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.lineTo(x3, y3);
  c.lineTo(x4, y4);
  c.closePath();
  c.fill();
}
/** Strip between lateral offsets a..b (in road half-widths) of the segment. */
function band(c, p1, p2, a, b, col) {
  quad(c, p1.x + a * p1.w, p1.y + 1, p1.x + b * p1.w, p1.y + 1, p2.x + b * p2.w, p2.y, p2.x + a * p2.w, p2.y, col);
}
function bothSides(c, p1, p2, a, b, col) {
  band(c, p1, p2, a, b, col);
  band(c, p1, p2, -b, -a, col);
}

// Deterministic per-segment pseudo random.
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Draw one road segment.
 * @param r Renderer (uses r.c, r.W, r.quality, r.goalIndex)
 * @param s segment ({index, boost?, ramp?})
 * @param p1 near projected point {x,y,w}; p2 far point
 * @param pal palette from render.js PALETTES
 * @param courseId 'meadow'|'sea'|'city'|'snow'
 * @param fogK 0 (near) .. 1 (fully hazed)
 */
export function drawRoadSegment(r, s, p1, p2, pal, courseId, fogK = 0) {
  const c = r.c;
  const W = r.W;
  const q = r.quality ?? 2;
  const night = courseId === 'city';
  const fogC = roadFogColor(pal, night);
  const fk = Math.max(0, Math.min(1, fogK || 0)) * (night ? 0.55 : 0.8);
  const F = (col) => (fk > 0.03 ? mix(col, fogC, fk) : col);
  const alt = Math.floor(s.index / 3) % 2;
  const h = p1.y - p2.y;
  if (h <= 0) return;
  const near = p1.w > 140; // big enough for fine detail

  // ---- ground ----
  const g = pal.grass[alt];
  c.fillStyle = F(g);
  c.fillRect(-OVER, p2.y, W + OVER * 2, h + 1);
  if (courseId === 'meadow' && q >= 1) {
    // mowing stripes running along the road
    const light = F(shade(g, 0.1));
    for (const [a, b] of [[1.55, 2.35], [3.15, 3.95], [4.75, 5.55]]) bothSides(c, p1, p2, a, b, light);
  } else if (courseId === 'snow' && q >= 1) {
    const blue = F(shade('#cfe0f5', 0));
    for (const [a, b] of [[2.2, 2.32], [3.6, 3.7]]) bothSides(c, p1, p2, a, b, blue); // ski tracks
  }

  // ---- course specific edges ----
  if (courseId === 'sea') {
    // sand -> wet sand -> foam -> water, right side
    band(c, p1, p2, 1.55, 1.75, F('#e9cf8a'));
    const e1 = p1.x + p1.w * 1.75;
    const e2 = p2.x + p2.w * 1.75;
    quad(c, e1, p1.y + 1, W + OVER, p1.y + 1, W + OVER, p2.y, e2, p2.y, F(pal.water[alt]));
    band(c, p1, p2, 1.75, 1.75 + (alt ? 0.14 : 0.08), F('#ffffff'));
    if (q >= 1) band(c, p1, p2, 2.6, 2.75, F(shade(pal.water[alt], 0.18))); // swell highlight
  } else if (courseId === 'snow') {
    // raised snow banks with a soft blue shadow on the road side
    bothSides(c, p1, p2, 1.22, 1.6, F('#ffffff'));
    bothSides(c, p1, p2, 1.18, 1.26, F('#c6d8f0'));
  } else if (courseId === 'city') {
    // sidewalk slabs and a kerb
    bothSides(c, p1, p2, 1.2, 1.9, F(alt ? '#6a6f86' : '#646980'));
    bothSides(c, p1, p2, 1.2, 1.25, F('#8a8fa6'));
    if (s.index % 2 === 0) bothSides(c, p1, p2, 1.25, 1.9, F('#5c6178')); // slab joints (thin strips)
  }

  // ---- shoulder (gravel line between curb and ground) ----
  if (courseId !== 'city') bothSides(c, p1, p2, 1.14, 1.2, F(courseId === 'snow' ? '#b9c9df' : shade(g, -0.18)));

  // ---- curbs: top face + darker inner bevel ----
  const rc = pal.rumble[alt];
  bothSides(c, p1, p2, 1.0, 1.14, F(rc));
  if (near && q >= 1) {
    bothSides(c, p1, p2, 1.0, 1.025, F(shade(rc, -0.28))); // side face towards the road
    bothSides(c, p1, p2, 1.08, 1.1, F(shade(rc, 0.35))); // highlight on the top face
  }

  // ---- asphalt ----
  const road = pal.road[alt];
  band(c, p1, p2, -1, 1, F(road));
  if (q >= 1) {
    // darker worn tyre lines along each lane centre
    const worn = F(shade(road, -0.07));
    for (const m of [-0.66, 0, 0.66]) band(c, p1, p2, m - 0.12, m + 0.12, worn);
  }
  if (near && q >= 2) {
    // aggregate: a few deterministic specks
    const n = 10;
    for (let i = 0; i < n; i++) {
      const rx = hash(s.index * 31 + i) * 1.9 - 0.95;
      const ry = hash(s.index * 57 + i * 7);
      const y = p2.y + h * ry;
      const w = p2.w + (p1.w - p2.w) * ry;
      const x = p2.x + (p1.x - p2.x) * ry + rx * w;
      const sz = Math.max(1, w * 0.006);
      c.fillStyle = i % 3 ? 'rgba(255,255,255,0.10)' : 'rgba(30,25,50,0.10)';
      c.fillRect(x, y, sz * 2, sz);
    }
  }

  // ---- paint ----
  const special = s.boost || s.ramp || s.index === START_LINE || s.index === r.goalIndex;
  if (special) return;
  const lane = F(pal.lane);
  // solid edge lines
  bothSides(c, p1, p2, 0.9, 0.94, lane);
  if (alt) {
    for (const f of [-0.33, 0.33]) {
      if (near && q >= 1) {
        c.globalAlpha = 0.25; // soft paint bleed
        band(c, p1, p2, f - 0.05, f + 0.05, lane);
        c.globalAlpha = 1;
      }
      band(c, p1, p2, f - 0.035, f + 0.035, lane);
    }
  }
}
