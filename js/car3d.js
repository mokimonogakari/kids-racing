// Procedural 3D race cars (Three.js). No external models or images.
// Origin: rear-axle centre on the ground, +Z forward, +Y up, +X = car's left? No: +X is the car's
// right-hand side when looking forward along +Z with +Y up in a right-handed frame is -X... we keep
// it simple and symmetric: the car is mirror-symmetric in X, so handedness does not matter.
//
// The body is a loft: a cross-section profile (bottom, widest side, shoulder, window band, roof) is
// evaluated at many stations along the car. Each profile value is a smooth function of z defined by
// keyframes per model. Wheel arches are cut by lifting the section bottom around each axle.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// Model definitions
// Keyframe columns: z, w (half width at the widest point), yb (bottom), yBelt (shoulder line),
// wBelt (half width at the shoulder), yRoof (roof centre), wRoof (half width at the roof edge).
// ---------------------------------------------------------------------------------------------
const MODELS = {
  gt: {
    id: 'gt',
    name: 'クーペ',
    wheelbase: 2.62,
    track: 0.8, // wheel centre x
    tyreR: 0.345,
    tyreW: 0.27,
    archR: 0.43,
    stripe: true,
    keys: [
      [-0.98, 0.62, 0.36, 0.74, 0.55, 0.76, 0.42],
      [-0.95, 0.84, 0.26, 0.88, 0.78, 0.91, 0.6],
      [-0.82, 0.92, 0.22, 0.94, 0.84, 0.97, 0.64],
      [-0.45, 0.95, 0.2, 0.94, 0.85, 0.98, 0.62],
      [-0.12, 0.96, 0.19, 0.93, 0.84, 1.02, 0.56],
      [0.32, 0.95, 0.19, 0.91, 0.8, 1.22, 0.54],
      [0.85, 0.93, 0.19, 0.89, 0.77, 1.29, 0.56],
      [1.25, 0.92, 0.19, 0.87, 0.77, 1.27, 0.57],
      [1.82, 0.92, 0.2, 0.85, 0.78, 0.89, 0.62],
      [2.35, 0.93, 0.21, 0.82, 0.8, 0.84, 0.64],
      [2.95, 0.92, 0.21, 0.76, 0.79, 0.77, 0.64],
      [3.32, 0.86, 0.22, 0.67, 0.72, 0.68, 0.58],
      [3.5, 0.74, 0.25, 0.58, 0.6, 0.59, 0.48],
      [3.56, 0.52, 0.3, 0.52, 0.42, 0.53, 0.32],
    ],
  },
  proto: {
    id: 'proto',
    name: 'レーシングカー',
    wheelbase: 2.78,
    track: 0.82,
    tyreR: 0.35,
    tyreW: 0.32,
    archR: 0.44,
    stripe: true,
    keys: [
      [-1.24, 0.7, 0.34, 0.66, 0.66, 0.67, 0.56],
      [-1.18, 0.96, 0.24, 0.8, 0.92, 0.81, 0.78],
      [-0.6, 0.99, 0.16, 0.82, 0.95, 0.84, 0.78],
      [-0.05, 0.99, 0.15, 0.84, 0.95, 0.86, 0.74],
      [0.45, 0.97, 0.14, 0.76, 0.88, 0.86, 0.4],
      [0.7, 0.96, 0.14, 0.72, 0.85, 1.08, 0.33],
      [1.25, 0.96, 0.14, 0.7, 0.85, 1.13, 0.35],
      [1.72, 0.96, 0.14, 0.69, 0.85, 1.0, 0.36],
      [2.12, 0.97, 0.15, 0.7, 0.88, 0.74, 0.5],
      [2.7, 0.99, 0.16, 0.76, 0.94, 0.78, 0.74],
      [3.2, 0.97, 0.14, 0.6, 0.9, 0.62, 0.72],
      [3.52, 0.9, 0.13, 0.42, 0.84, 0.43, 0.62],
      [3.64, 0.66, 0.15, 0.3, 0.58, 0.31, 0.42],
    ],
  },
  hatch: {
    id: 'hatch',
    name: 'ホットハッチ',
    wheelbase: 2.52,
    track: 0.79,
    tyreR: 0.32,
    tyreW: 0.24,
    archR: 0.4,
    stripe: true,
    keys: [
      [-0.66, 0.66, 0.38, 0.8, 0.6, 0.86, 0.5],
      [-0.62, 0.87, 0.27, 0.95, 0.83, 1.22, 0.62],
      [-0.5, 0.91, 0.23, 0.97, 0.85, 1.36, 0.66],
      [-0.2, 0.92, 0.21, 0.96, 0.85, 1.44, 0.66],
      [0.6, 0.92, 0.21, 0.94, 0.83, 1.46, 0.66],
      [1.45, 0.91, 0.21, 0.92, 0.83, 1.42, 0.67],
      [2.12, 0.91, 0.21, 0.9, 0.83, 0.98, 0.71],
      [2.6, 0.9, 0.22, 0.86, 0.83, 0.89, 0.71],
      [3.02, 0.88, 0.24, 0.8, 0.8, 0.81, 0.66],
      [3.27, 0.8, 0.28, 0.71, 0.72, 0.72, 0.58],
      [3.35, 0.62, 0.32, 0.64, 0.54, 0.65, 0.44],
    ],
  },
};

export const CAR3D_MODELS = Object.values(MODELS).map((m) => ({
  id: m.id,
  name: m.name,
  length: +(m.keys[m.keys.length - 1][0] - m.keys[0][0]).toFixed(2),
  width: +(Math.max(...m.keys.map((k) => k[1])) * 2).toFixed(2),
  height: +Math.max(...m.keys.map((k) => k[5])).toFixed(2),
  wheelbase: m.wheelbase,
}));

const NAMED_COLORS = {
  red: '#d3172b', blue: '#1f5fd1', white: '#eef1f4', black: '#24262b',
  yellow: '#f2bf10', green: '#1d8a4e', orange: '#f0661b', silver: '#a9b0b9',
};

function toColor(c) {
  if (c instanceof THREE.Color) return c.clone();
  if (typeof c === 'number') return new THREE.Color(c);
  if (typeof c === 'string') return new THREE.Color(NAMED_COLORS[c] || c);
  if (c && typeof c === 'object') return toColor(c.hex || c.color || '#d3172b');
  return new THREE.Color('#d3172b');
}

// ---------------------------------------------------------------------------------------------
// Smooth keyframe interpolation (monotone cubic per column)
// ---------------------------------------------------------------------------------------------
function makeInterp(keys) {
  const n = keys.length;
  const cols = keys[0].length;
  const z = keys.map((k) => k[0]);
  const slopes = [];
  for (let c = 1; c < cols; c++) {
    const y = keys.map((k) => k[c]);
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (z[i + 1] - z[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    slopes[c] = m;
  }
  return (zz) => {
    const q = Math.min(z[n - 1], Math.max(z[0], zz));
    let i = 0;
    while (i < n - 2 && q > z[i + 1]) i++;
    const h = z[i + 1] - z[i];
    const t = (q - z[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const out = [q];
    for (let c = 1; c < cols; c++) {
      const y0 = keys[i][c];
      const y1 = keys[i + 1][c];
      const m0 = slopes[c][i] * h;
      const m1 = slopes[c][i + 1] * h;
      out.push((2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1);
    }
    return out;
  };
}

// Catmull-Rom through 2D points, S samples per span, endpoints included.
function catmull(pts, S) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < S; s++) {
      const t = s / S;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

const S = 6; // samples per profile span
const SPANS = 9;
const HALF = SPANS * S + 1; // points from bottom centre to roof centre
const RING = HALF * 2 - 2;
const I_SHOULDER = 5 * S;
const I_ROOFEDGE = 7 * S;

/** Right half of the cross-section (x >= 0), bottom centre -> roof centre. */
function sectionHalf(v) {
  const [, w, yb, yBelt, wBelt, yRoofRaw, wRoofRaw] = v;
  const yRoof = Math.max(yRoofRaw, yBelt + 0.012);
  const wRoof = Math.min(wRoofRaw, wBelt - 0.01);
  const cab = yRoof - yBelt;
  const yWide = yb + (yBelt - yb) * 0.42;
  // A crisp shoulder line: the side bulges out slightly just under the belt, then tucks in.
  const yLine = yWide + (yBelt - yWide) * 0.72;
  const ctrl = [
    [0, yb],
    [w * 0.86, yb],
    [w * 0.985, yb + (yWide - yb) * 0.45],
    [w, yWide],
    [Math.max(wBelt, w - 0.035) + 0.012, yLine],
    [wBelt, yBelt],
    [wBelt - (wBelt - wRoof) * 0.45, yBelt + cab * 0.55],
    [wRoof, yRoof - Math.min(0.05, cab * 0.25)],
    [wRoof * 0.55, yRoof],
    [0, yRoof + Math.min(0.012, cab * 0.05)],
  ];
  return catmull(ctrl, S);
}

function profileAt(model, interp, z) {
  const v = interp(z);
  // Fender flares over each axle (wheels sit inside the body), slight coke-bottle waist between.
  const need = model.track + model.tyreW * 0.5 + 0.025;
  let flare = 0;
  for (const az of [0, model.wheelbase]) {
    const dz = (z - az) / (model.archR * 1.35);
    flare = Math.max(flare, Math.exp(-dz * dz * dz * dz));
  }
  const mid = (z - model.wheelbase / 2) / (model.wheelbase * 0.32);
  const waist = model.id === 'proto' ? 0 : 0.018 * Math.exp(-mid * mid);
  const grow = Math.max(0, need - v[1]) * flare + 0.022 * flare;
  v[1] = v[1] + grow - waist;
  v[4] = v[4] + grow * 0.55 - waist * 0.6;
  // Wheel arches: lift the bottom of the section around each axle.
  for (const az of [0, model.wheelbase]) {
    const dz = z - az;
    if (Math.abs(dz) < model.archR) {
      const lift = model.tyreR + Math.sqrt(model.archR * model.archR - dz * dz) + 0.02;
      v[2] = Math.max(v[2], Math.min(lift, v[3] - 0.08));
    }
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Body geometry
// ---------------------------------------------------------------------------------------------
function buildBody(model) {
  const interp = makeInterp(model.keys);
  const z0 = model.keys[0][0];
  const z1 = model.keys[model.keys.length - 1][0];
  // Station spacing: denser near the ends so the nose and tail are round.
  const stations = [];
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * t); // cosine spacing
    stations.push(z0 + (z1 - z0) * (0.25 * t + 0.75 * e));
  }
  const pos = [];
  const uv = [];
  const sec = [];
  for (const z of stations) {
    const v = profileAt(model, interp, z);
    const half = sectionHalf(v);
    sec.push({ z, v, half });
    const ring = [];
    for (let i = 0; i < HALF; i++) ring.push(half[i]);
    for (let i = HALF - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1]]);
    for (let k = 0; k < RING; k++) {
      pos.push(ring[k][0], ring[k][1], z);
      uv.push((z - z0) / (z1 - z0), k / RING);
    }
  }
  const NS = stations.length;
  // Classify faces into paint / glass.
  const paintIdx = [];
  const glassIdx = [];
  const slopeAt = (j) => {
    const a = sec[Math.max(0, j - 1)];
    const b = sec[Math.min(NS - 1, j + 1)];
    return (b.v[5] - a.v[5]) / Math.max(1e-6, b.z - a.z);
  };
  for (let j = 0; j < NS - 1; j++) {
    const cab = Math.min(sec[j].v[5] - sec[j].v[3], sec[j + 1].v[5] - sec[j + 1].v[3]);
    const slope = Math.abs((slopeAt(j) + slopeAt(j + 1)) / 2);
    const steep = slope > 0.32 && cab > 0.1;
    const side = cab > 0.16 && !steep;
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      const a = j * RING + k;
      const b = j * RING + k2;
      const c = (j + 1) * RING + k;
      const d = (j + 1) * RING + k2;
      const hk = Math.min(k, RING - k); // distance from bottom centre along the ring
      const hk2 = Math.min(k2, RING - k2);
      const hMid = (hk + hk2) / 2;
      let glass = false;
      if (steep && hMid >= I_SHOULDER + 0.5) glass = true;
      else if (side && hMid >= I_SHOULDER + 0.5 && hMid <= I_ROOFEDGE - 0.5) glass = true;
      const list = glass ? glassIdx : paintIdx;
      list.push(a, b, c, b, d, c);
    }
  }
  // End caps (fans to the section centroid).
  const capFan = (j, flip) => {
    const ring0 = j * RING;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < RING; k++) {
      cx += pos[(ring0 + k) * 3];
      cy += pos[(ring0 + k) * 3 + 1];
    }
    const ci = pos.length / 3;
    pos.push(cx / RING, cy / RING, stations[j] + (flip ? -0.004 : 0.004));
    uv.push(j === 0 ? 0 : 1, 0.5);
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      if (flip) paintIdx.push(ci, ring0 + k2, ring0 + k);
      else paintIdx.push(ci, ring0 + k, ring0 + k2);
    }
  };
  capFan(0, true);
  capFan(NS - 1, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...paintIdx, ...glassIdx]);
  g.addGroup(0, paintIdx.length, 0);
  g.addGroup(paintIdx.length, glassIdx.length, 1);
  g.computeVertexNormals();
  return { geometry: g, interp, sec, z0, z1 };
}

/** Half-width of the body surface at height y (0 if the section does not reach y). */
function widthAt(body, z, y) {
  const model = body.model;
  const v = profileAt(model, body.interp, z);
  const half = sectionHalf(v);
  let best = 0;
  for (let i = 0; i < HALF - 1; i++) {
    const [x1, y1] = half[i];
    const [x2, y2] = half[i + 1];
    if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) {
      const t = (y - y1) / (y2 - y1);
      best = Math.max(best, x1 + (x2 - x1) * t);
    }
  }
  return best;
}

/** z of the body surface at (x, y), searching inward from the front (dir=1) or rear (dir=-1). */
function surfaceZ(body, x, y, dir) {
  const step = 0.004;
  let z = dir > 0 ? body.z1 : body.z0;
  for (let n = 0; n < 600; n++) {
    if (widthAt(body, z, y) >= x) return z;
    z -= dir * step;
  }
  return z;
}

// ---------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------
function canvas2d(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function luminance(col) {
  return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
}

/**
 * Body paint texture (u = along the car, v = around the section; v=0.5 is the roof centre,
 * v<0.5 the car's +X side). Liveries are drawn with colours derived from the paint so any colour works.
 *  0: twin centre stripes + shoulder pinstripe   1: side blade + bonnet stripe   2: contrast roof + accent line
 */
function paintTexture(color, stripe, existing, seams, livery = 0, marks = {}) {
  const cv = existing?.image || canvas2d(1024, 512);
  if (!cv) return null;
  const c = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const yv = (v) => H * (1 - v); // canvas y of texture v (flipY)
  const light = luminance(color) > 0.35;
  const base = `#${color.getHexString()}`;
  const contrast = light ? '#1c1e22' : '#f4f5f7';
  const hsl = {};
  color.getHSL(hsl);
  const accent = hsl.s > 0.3 && hsl.h > 0.1 && hsl.h < 0.2 ? '#d3172b' : '#f2b705';
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  const vSh = (I_SHOULDER - 1.2) / RING;
  const vRoof = (I_ROOFEDGE + 0.4) / RING;
  if (stripe) {
    if (livery === 1) {
      // Side blade: a swept band from the front fender to the rear, both sides.
      c.fillStyle = contrast;
      for (const flip of [false, true]) {
        const v0 = S * 2.2 / RING;
        const v1 = (I_SHOULDER - S * 0.7) / RING;
        const p = (v) => yv(flip ? 1 - v : v);
        c.beginPath();
        c.moveTo(W * 0.86, p(v1));
        c.lineTo(W * 0.62, p(v1));
        c.lineTo(W * 0.12, p(v0 + 0.012));
        c.lineTo(W * 0.04, p(v0 + 0.012));
        c.lineTo(W * 0.04, p(v0));
        c.lineTo(W * 0.5, p(v0));
        c.closePath();
        c.fill();
      }
      // Single wide bonnet-to-tail stripe with thin accent edges.
      const w = H * 0.055;
      c.fillStyle = contrast;
      c.fillRect(0, H * 0.5 - w / 2, W, w);
      c.fillStyle = accent;
      c.fillRect(0, H * 0.5 - w / 2 - 5, W, 3);
      c.fillRect(0, H * 0.5 + w / 2 + 2, W, 3);
    } else if (livery === 2) {
      // Contrast roof and pillars, accent pinstripe along the shoulders.
      c.fillStyle = light ? '#18191d' : '#d7dbe0';
      const [u0, u1] = marks.cabin || [0, 1];
      c.fillRect(u0 * W, yv(1 - vRoof) + 1, (u1 - u0) * W, yv(vRoof) - yv(1 - vRoof) - 2);
      c.fillStyle = accent;
      c.fillRect(0, yv(vSh) - 3, W, 4);
      c.fillRect(0, yv(1 - vSh) - 1, W, 4);
    } else {
      const mid = H * 0.5;
      const w = H * 0.026;
      const gap = H * 0.012;
      c.fillStyle = contrast;
      c.fillRect(0, mid - gap - w, W, w);
      c.fillRect(0, mid + gap, W, w);
      c.globalAlpha = 0.85;
      c.fillRect(0, yv(vSh) - 2, W, 3);
      c.fillRect(0, yv(1 - vSh) - 1, W, 3);
      c.globalAlpha = 1;
    }
  }
  // Lower body darkening (baked occlusion near the sills) – reads as weight and grounding.
  const vLow = S * 2.6 / RING;
  for (const flip of [false, true]) {
    const y0 = yv(flip ? 1 : 0);
    const y1 = yv(flip ? 1 - vLow : vLow);
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }
  // Panel gaps: door cut lines on the sides, bonnet / boot shut lines across the top.
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = 2;
  const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  if (seams) {
    const vTop = (I_SHOULDER - 0.6) / RING;
    const vBot = (S * 0.9) / RING;
    for (const u of seams) {
      const x = u * W;
      line(x, yv(vBot), x, yv(vTop));
      line(x, yv(1 - vTop), x, yv(1 - vBot));
    }
    if (seams.length === 2) {
      // door bottom & top edges
      for (const [a, b] of [[vBot, vBot], [vTop, vTop], [1 - vBot, 1 - vBot], [1 - vTop, 1 - vTop]]) line(seams[0] * W, yv(a), seams[1] * W, yv(b));
    }
  }
  for (const u of [marks.hood, marks.boot]) {
    if (u == null) continue;
    line(u * W, yv(vSh + 0.01), u * W, yv(1 - vSh - 0.01));
  }
  if (marks.hood != null) {
    // bonnet side shut lines running forward from the cowl
    for (const v of [vSh + 0.012, 1 - vSh - 0.012]) line(marks.hood * W, yv(v), W * 0.985, yv(v));
  }
  // Fuel filler flap on the rear quarter (right side)
  if (marks.fuel != null) {
    c.beginPath();
    c.arc(marks.fuel * W, yv(I_SHOULDER * 0.82 / RING), 9, 0, Math.PI * 2);
    c.stroke();
  }
  if (existing) {
    existing.needsUpdate = true;
    return existing;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundel(number, opts = {}) {
  const cv = canvas2d(256, 256);
  if (!cv) return null;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 256, 256);
  c.fillStyle = opts.bg || '#f6f7f9';
  if (opts.plate) {
    c.beginPath();
    c.roundRect ? c.roundRect(8, 60, 240, 136, 18) : c.rect(8, 60, 240, 136);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#222';
    c.stroke();
  } else {
    c.beginPath();
    c.arc(128, 128, 118, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = '#1b1c20';
    c.stroke();
  }
  c.fillStyle = '#16171b';
  c.font = `900 ${String(number).length > 1 ? 128 : 150}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(number), 128, 136);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function treadTexture() {
  const cv = canvas2d(64, 256);
  if (!cv) return null;
  const c = cv.getContext('2d');
  c.fillStyle = '#1a1a1c';
  c.fillRect(0, 0, 64, 256);
  c.fillStyle = '#0d0d0e';
  for (let y = 0; y < 256; y += 16) {
    c.fillRect(10, y, 10, 9);
    c.fillRect(44, y + 8, 10, 9);
  }
  c.fillRect(29, 0, 6, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sidewallTexture() {
  const cv = canvas2d(256, 256);
  if (!cv) return null;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 60, 128, 128, 128);
  // RingGeometry UVs are planar: radius 0.5 in uv = outer edge of the ring's bounding square.
  g.addColorStop(0, '#0e0e10');
  g.addColorStop(0.62, '#0e0e10');
  g.addColorStop(0.7, '#2a2b2e'); // rim protector ridge
  g.addColorStop(0.75, '#141416');
  g.addColorStop(0.86, '#1d1e21'); // sidewall bulge catches light
  g.addColorStop(0.95, '#121214');
  g.addColorStop(1, '#0b0b0c');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  // fine moulding texture
  c.globalAlpha = 0.18;
  for (let i = 0; i < 360; i += 2) {
    const a = (i / 180) * Math.PI;
    c.strokeStyle = i % 4 ? '#000' : '#333';
    c.beginPath();
    c.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
    c.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    c.stroke();
  }
  c.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Radially smeared wheel face shown when the wheel turns too fast to see the spokes. */
function blurTexture(dark) {
  const cv = canvas2d(256, 256);
  if (!cv) return null;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 256, 256);
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 126);
  const rim = dark ? ['#3a3d43', '#2b2e33', '#45484e'] : ['#d9dde3', '#9aa0a8', '#c3c8cf'];
  g.addColorStop(0, '#f1f3f6');
  g.addColorStop(0.16, '#e4e7ec');
  g.addColorStop(0.2, rim[1]);
  g.addColorStop(0.55, rim[0]);
  g.addColorStop(0.82, rim[2]);
  g.addColorStop(0.9, rim[1]);
  g.addColorStop(0.97, '#e8ebef');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(128, 128, 126, 0, Math.PI * 2);
  c.fill();
  // faint circular streaks
  c.globalAlpha = 0.12;
  c.strokeStyle = '#000';
  for (let r = 30; r < 120; r += 7) {
    c.beginPath();
    c.arc(128, 128, r, 0, Math.PI * 2);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft contact shadow under the car (ambient occlusion), white = no shadow -> alpha map. */
function aoTexture() {
  const cv = canvas2d(128, 256);
  if (!cv) return null;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 128, 256);
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const inset = 4 + t * 34;
    c.fillStyle = `rgba(255,255,255,${0.09 + 0.05 * t})`;
    const x = inset;
    const y = inset * 1.2;
    const w = 128 - inset * 2;
    const h = 256 - inset * 2.4;
    const r = Math.min(w, h) * 0.35;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Shared materials (per car, so colours can differ)
// ---------------------------------------------------------------------------------------------
const shared = {};
function sharedMat(name, make) {
  if (!shared[name]) shared[name] = make();
  return shared[name];
}
const matTrim = () => sharedMat('trim', () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 0.2 }));
const matCarbon = () => sharedMat('carbon', () => new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, roughness: 0.35, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
const matChrome = () => sharedMat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe4e7ec, roughness: 0.12, metalness: 1 }));
const matRim = () => sharedMat('rim', () => new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.22, metalness: 1 }));
const matRimDark = () => sharedMat('rimDark', () => new THREE.MeshStandardMaterial({ color: 0x2d3036, roughness: 0.3, metalness: 0.9 }));
const matDisc = () => sharedMat('disc', () => new THREE.MeshStandardMaterial({ color: 0x5b5e63, roughness: 0.4, metalness: 0.9 }));
const matCaliper = () => sharedMat('caliper', () => new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.35, metalness: 0.3 }));
const matTyre = () => sharedMat('tyre', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: treadTexture(), roughness: 0.92, metalness: 0 }));
const matTyreSide = () => sharedMat('tyreSide', () => { const t = sidewallTexture(); return new THREE.MeshStandardMaterial({ color: t ? 0xffffff : 0x18181a, map: t, roughness: 0.82, metalness: 0 }); });
const matHousing = () => sharedMat('housing', () => new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.45, metalness: 0.3 }));
const matProjector = () => sharedMat('projector', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 2.4, roughness: 0.05 }));
const matDrl = () => sharedMat('drl', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.0, roughness: 0.2 }));
const matSuit = () => sharedMat('suit', () => new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.8 }));
const matVisor = () => sharedMat('visor', () => new THREE.MeshPhysicalMaterial({ color: 0x141a24, roughness: 0.05, metalness: 0.6, clearcoat: 1 }));
const matHelmetWhite = () => sharedMat('helmetW', () => new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
const matHead = () => sharedMat('head', () => new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xfff4dc, emissiveIntensity: 1.6, roughness: 0.2 }));
const matLensClear = () => sharedMat('lens', () => new THREE.MeshPhysicalMaterial({ color: 0xc7d3e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, clearcoat: 1 }));
const matGlass = () => sharedMat('glass', () => new THREE.MeshPhysicalMaterial({
  color: 0x0b1016, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.9, envMapIntensity: 1.5,
  transparent: true, opacity: 0.72, depthWrite: false,
}));
const matInterior = () => sharedMat('interior', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.9, metalness: 0, side: THREE.BackSide }));

// ---------------------------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------------------------
function tyreGeometry(R, W) {
  const r0 = R * 0.66;
  const pts = [];
  const hw = W / 2;
  // Profile in (radius, axial) – lathe around Y, later rotated to the X axis.
  const prof = [
    [r0, -hw * 0.92], [R * 0.93, -hw], [R * 0.985, -hw * 0.9], [R, -hw * 0.62], [R, hw * 0.62],
    [R * 0.985, hw * 0.9], [R * 0.93, hw], [r0, hw * 0.92],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(Math.PI / 2);
  return g;
}

function makeWheel(model, side, quality, blurMat) {
  const R = model.tyreR;
  const W = model.tyreW;
  const hub = new THREE.Group(); // positioned at the wheel centre; steering rotates this around Y
  const spin = new THREE.Group(); // rotates around X
  hub.add(spin);
  const tyre = new THREE.Mesh(tyreGeometry(R, W), [matTyre()]);
  tyre.geometry.clearGroups();
  tyre.geometry.addGroup(0, Infinity, 0);
  spin.add(tyre);
  const segs = quality >= 2 ? 32 : 24;
  // Sidewall discs (inner dark ring)
  const wallGeo = new THREE.RingGeometry(R * 0.66, R * 0.93, segs);
  wallGeo.rotateY(Math.PI / 2);
  const wallOut = new THREE.Mesh(wallGeo, matTyreSide());
  wallOut.position.x = side * W * 0.46;
  if (side < 0) wallOut.rotation.y = Math.PI;
  spin.add(wallOut);
  // Rim barrel
  const rimR = R * 0.66;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, W * 0.86, segs, 1, true), matRimDark());
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);
  // Rim lip + spokes on the outer face
  const face = new THREE.Group();
  face.position.x = side * W * 0.4;
  spin.add(face);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.97, 0.012, 8, segs), matRim());
  lip.rotation.y = Math.PI / 2;
  face.add(lip);
  const spokeMat = model.id === 'proto' ? matRimDark() : matRim();
  const spokeGeo = new THREE.BoxGeometry(0.03, rimR * 0.92, 0.055);
  spokeGeo.translate(0, rimR * 0.46, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (const off of [-0.11, 0.11]) {
      const s = new THREE.Mesh(spokeGeo, spokeMat);
      s.rotation.x = a + off;
      s.position.x = -side * 0.01;
      face.add(s);
    }
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 16), matChrome());
  cap.rotation.z = Math.PI / 2;
  face.add(cap);
  // Brake disc + caliper (do not spin)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, segs), matDisc());
  disc.rotation.z = Math.PI / 2;
  disc.position.x = side * W * 0.12;
  hub.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.12), matCaliper());
  caliper.position.set(side * W * 0.22, rimR * 0.58, -0.06);
  caliper.rotation.x = -0.35;
  hub.add(caliper);
  // Motion-blur disc in front of the spokes (shown at speed)
  if (blurMat) {
    const bd = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.99, segs), blurMat);
    bd.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    bd.position.x = side * (W * 0.4 + 0.012);
    bd.castShadow = false;
    bd.renderOrder = 2;
    hub.add(bd);
  }
  hub.userData.spin = spin;
  hub.userData.face = face;
  return hub;
}

// ---------------------------------------------------------------------------------------------
// Detail helpers
// ---------------------------------------------------------------------------------------------
function lightPod(w, h, d, mat) {
  const g = new THREE.CapsuleGeometry(h / 2, w - h, 4, 12);
  g.rotateZ(Math.PI / 2);
  g.scale(1, 1, d / h);
  return new THREE.Mesh(g, mat);
}

function airfoilGeometry(span, chord, thick) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(chord * 0.15, thick * 1.1, chord * 0.55, thick * 0.9, chord, thick * 0.15);
  sh.lineTo(chord, 0);
  sh.bezierCurveTo(chord * 0.6, -thick * 0.25, chord * 0.2, -thick * 0.3, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -span / 2);
  g.rotateY(-Math.PI / 2); // span along X, chord along -Z (leading edge forward)
  return g;
}

function decalPlane(tex, size) {
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
}

// ---------------------------------------------------------------------------------------------
// Public: createCar
// ---------------------------------------------------------------------------------------------
/**
 * @param {'gt'|'proto'|'hatch'} modelId
 * @param {string|number|THREE.Color} color
 * @param {number|string} number race number
 * @param {{stripe?:boolean, quality?:number, garage?:boolean}} opts
 */
export function createCar(modelId = 'gt', color = '#d3172b', number = 7, opts = {}) {
  const model = MODELS[modelId] || MODELS.gt;
  const quality = opts.quality ?? 2;
  const stripe = opts.stripe ?? model.stripe;
  const group = new THREE.Group();
  group.name = `car-${model.id}`;
  const body = buildBody(model);
  body.model = model;

  let paintColor = toColor(color);
  const zLen = model.keys[model.keys.length - 1][0] - model.keys[0][0];
  const uOf = (z) => (z - model.keys[0][0]) / zLen;
  const seams = model.id === 'proto' ? [] : [uOf(model.archR + 0.12), uOf(model.wheelbase * (model.id === 'hatch' ? 0.62 : 0.66))];
  const livery = Number.isFinite(+opts.livery) ? ((Math.floor(+opts.livery) % 3) + 3) % 3 : (Math.abs(parseInt(number, 10) || 0) % 3);
  const marks = model.id === 'proto'
    ? { hood: uOf(model.wheelbase + 0.05) }
    : { hood: uOf(model.wheelbase - (model.id === 'hatch' ? 0.05 : 0.15)), boot: model.id === 'gt' ? uOf(-0.55) : null, fuel: uOf(-0.12) };
  {
    let c0 = null;
    let c1 = null;
    for (let z = model.keys[0][0]; z <= model.keys[model.keys.length - 1][0]; z += 0.02) {
      const v = profileAt(model, body.interp, z);
      if (v[5] - v[3] > 0.12) {
        if (c0 === null) c0 = z;
        c1 = z;
      }
    }
    if (c0 !== null) marks.cabin = [uOf(c0 - 0.04), uOf(c1 + 0.04)];
  }
  const paintTex = paintTexture(paintColor, stripe, null, seams, livery, marks);
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintTex ? 0xffffff : paintColor,
    map: paintTex,
    metalness: 0.28,
    roughness: 0.36,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.2,
  });
  const bodyMesh = new THREE.Mesh(body.geometry, [paint, matGlass()]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  const keys = model.keys;
  const zR = keys[0][0];
  const zF = keys[keys.length - 1][0];

  // Dark chassis/tub filling the inside (visible through the wheel arches).
  const tubW = (model.track - model.tyreW * 0.55) * 2;
  const tub = new THREE.Mesh(new THREE.BoxGeometry(tubW, 0.42, zF - zR - 0.35), matTrim());
  tub.position.set(0, 0.36, (zF + zR) / 2);
  group.add(tub);
  // Cabin interior + driver in a helmet (seen through the tinted glass)
  {
    let zc0 = null;
    let zc1 = null;
    for (let z = zR; z <= zF; z += 0.04) {
      const v = profileAt(model, body.interp, z);
      if (v[5] - v[3] > 0.15) {
        if (zc0 === null) zc0 = z;
        zc1 = z;
      }
    }
    if (zc0 !== null) {
      const mz = (zc0 + zc1) / 2;
      const cv = profileAt(model, body.interp, mz);
      const belt = cv[3];
      const roof = cv[5];
      const inW = cv[4] * 1.7;
      const tubTop = new THREE.Mesh(new THREE.BoxGeometry(inW, Math.max(0.05, belt - 0.5), zc1 - zc0), matInterior());
      tubTop.material = matTrim();
      tubTop.position.set(0, (belt + 0.5) / 2, mz);
      group.add(tubTop);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(inW * 0.95, 0.12, 0.3), matTrim());
      dash.position.set(0, belt + 0.02, zc1 - 0.2);
      group.add(dash);
      const dx = model.id === 'proto' ? 0.28 : 0.32;
      const seatZ = zc0 + (zc1 - zc0) * (model.id === 'hatch' ? 0.42 : 0.36);
      const headR = 0.125;
      const headY = Math.min(roof - headR - 0.05, belt + 0.33);
      const driver = new THREE.Group();
      driver.position.set(dx, 0, seatZ);
      group.add(driver);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.1), matCarbon());
      seat.position.set(0, headY - 0.22, -0.18);
      seat.rotation.x = -0.12;
      driver.add(seat);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.12, 4, 10), matSuit());
      torso.scale.set(1.25, 1, 0.7);
      torso.position.set(0, headY - 0.3, -0.08);
      driver.add(torso);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 16), matHelmetWhite());
      helmet.scale.set(1, 1.05, 1.12);
      helmet.position.set(0, headY, 0);
      driver.add(helmet);
      const stripeH = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.99, 0.012, 6, 24, Math.PI), paint);
      stripeH.rotation.set(0, Math.PI / 2, 0);
      stripeH.position.set(0, headY, 0);
      driver.add(stripeH);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 20, 10, Math.PI / 2 - 0.9, 1.8, 1.15, 0.55), matVisor());
      visor.rotation.y = 0;
      visor.position.set(0, headY, 0.008);
      visor.scale.set(1, 1.05, 1.12);
      driver.add(visor);
      const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 24), matTrim());
      wheelRim.position.set(0, headY - 0.24, 0.32);
      wheelRim.rotation.x = -0.35;
      driver.add(wheelRim);
    }
  }
  // Side skirts (carbon) between the arches
  const skL = model.wheelbase - model.archR * 2 - 0.08;
  const skZ = model.wheelbase / 2;
  const skV = profileAt(model, body.interp, skZ);
  for (const side of [1, -1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, skL), matCarbon());
    sk.position.set(side * (skV[1] * 0.86 + 0.01), skV[2] + 0.02, skZ);
    group.add(sk);
  }

  // Wheels
  const wheels = [];
  const frontWheels = [];
  const faces = [];
  const blurTex = blurTexture(model.id === 'proto');
  const blurMat = blurTex ? new THREE.MeshStandardMaterial({
    map: blurTex, transparent: true, opacity: 0, depthWrite: false, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.1,
  }) : null;
  for (const az of [0, model.wheelbase]) {
    for (const side of [1, -1]) {
      const w = makeWheel(model, side, quality, blurMat);
      faces.push(w.userData.face);
      w.position.set(side * model.track, model.tyreR, az);
      group.add(w);
      wheels.push(w.userData.spin);
      if (az > 0) frontWheels.push(w);
    }
  }

  // Lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x6e0710, emissive: 0xff1a22, emissiveIntensity: 0.9, roughness: 0.25 });
  const tailLens = new THREE.MeshPhysicalMaterial({
    color: 0xa0000c, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.78, emissive: 0x5a0006, emissiveIntensity: 0.6, depthWrite: false,
  });
  const tailY = keys[0][3] - 0.08 + (model.id === 'hatch' ? 0.02 : 0);
  const hlY = model.id === 'proto' ? 0.36 : (keys[keys.length - 2][3] + keys[keys.length - 2][2]) / 2 + 0.06;
  for (const side of [1, -1]) {
    // headlight: dark housing, chrome reflector bowl, glowing projector, LED daytime strip, clear cover
    const hx = model.id === 'hatch' ? 0.56 : model.id === 'proto' ? 0.62 : 0.58;
    const hz = surfaceZ(body, hx, hlY, 1);
    const hw = model.id === 'proto' ? 0.38 : 0.34;
    const yaw = side * (model.id === 'hatch' ? 0.25 : 0.42);
    const lamp = new THREE.Group();
    lamp.position.set(side * hx, hlY, hz - 0.035);
    lamp.rotation.y = yaw;
    group.add(lamp);
    const housing = lightPod(hw + 0.02, 0.11, 0.08, matHousing());
    lamp.add(housing);
    for (const k of [-1, 1]) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), matChrome());
      bowl.rotation.x = -Math.PI / 2;
      bowl.position.set(k * hw * 0.24, -0.004, 0.0);
      lamp.add(bowl);
      const proj = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), matProjector());
      proj.position.set(k * hw * 0.24, -0.004, 0.026);
      lamp.add(proj);
    }
    const drl = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.86, 0.01, 0.012), matDrl());
    drl.position.set(0, 0.038, 0.03);
    lamp.add(drl);
    const cover = lightPod(hw + 0.04, 0.12, 0.1, matLensClear());
    cover.position.z = 0.016;
    lamp.add(cover);
    // tail light: dark housing, glowing LED bars, red lens over them (gives depth)
    const tx = model.id === 'hatch' ? 0.66 : 0.62;
    const tz = surfaceZ(body, tx, tailY, -1);
    const tw = model.id === 'gt' ? 0.46 : model.id === 'hatch' ? 0.26 : 0.34;
    const tl = new THREE.Group();
    tl.position.set(side * tx, tailY, tz + 0.004);
    tl.rotation.y = -side * 0.35;
    group.add(tl);
    const tH = model.id === 'hatch' ? 0.16 : 0.12;
    const th = lightPod(tw + 0.02, tH, 0.07, matHousing());
    tl.add(th);
    const nb = model.id === 'hatch' ? 4 : 3;
    for (let i = 0; i < nb; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(tw * (0.92 - i * 0.12), 0.016, 0.012), tailMat);
      bar.position.set(-side * tw * i * 0.05, tH * 0.32 - i * (tH * 0.64 / (nb - 1)), -0.03);
      tl.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 18), tailMat);
    ring.position.set(side * tw * 0.3, 0, -0.03);
    tl.add(ring);
    const lens = lightPod(tw + 0.03, tH * 0.95, 0.065, tailLens);
    lens.position.z = -0.022;
    tl.add(lens);
  }
  // Dark garnish panel between the tail lights (gt/proto) – breaks up the plain tail
  if (model.id !== 'hatch') {
    const gz = surfaceZ(body, 0.15, tailY - 0.02, -1);
    const garnish = new THREE.Mesh(new THREE.BoxGeometry(model.id === 'gt' ? 0.82 : 1.0, 0.1, 0.03), matHousing());
    garnish.position.set(0, tailY - 0.02, gz - 0.006);
    group.add(garnish);
  }
  // Light bar across the tail (proto/gt)
  if (model.id !== 'hatch') {
    const barZ = surfaceZ(body, 0.1, tailY, -1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(model.id === 'proto' ? 1.5 : 0.9, 0.022, 0.02), tailMat);
    bar.position.set(0, tailY + (model.id === 'proto' ? 0 : 0.0), barZ - 0.004);
    group.add(bar);
  }

  // Grille / intake (dark) on the nose
  const nv = profileAt(model, body.interp, zF - 0.1);
  const intakeY = model.id === 'proto' ? nv[2] + 0.05 : nv[2] + (nv[3] - nv[2]) * 0.38;
  const intakeH = model.id === 'proto' ? 0.05 : Math.min(0.11, (nv[3] - nv[2]) * 0.4);
  const intakeZ = surfaceZ(body, 0.45, intakeY, 1);
  const intake = new THREE.Mesh(new THREE.BoxGeometry(model.id === 'hatch' ? 1.0 : 0.95, intakeH, 0.08), matCarbon());
  intake.position.set(0, intakeY, intakeZ - 0.035);
  if (model.id !== 'proto') group.add(intake);
  // Front splitter
  // Splitter tucked under the nose (follows the bumper width, only peeks out a few cm)
  const sv = profileAt(model, body.interp, zF - 0.28);
  const split = new THREE.Mesh(new THREE.BoxGeometry(sv[1] * 1.7, 0.022, 0.3), matCarbon());
  split.position.set(0, Math.max(0.09, sv[2] - 0.03), Math.min(zF - 0.2, surfaceZ(body, 0.3, sv[2] + 0.04, 1) - 0.1));
  group.add(split);

  // Diffuser + exhausts
  const diff = new THREE.Group();
  const diffBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.42), matCarbon());
  diffBase.rotation.x = -0.18;
  diffBase.position.set(0, 0.18, zR + 0.18);
  diff.add(diffBase);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.12, 0.4), matCarbon());
    fin.position.set(i * 0.26, 0.21, zR + 0.18);
    fin.rotation.x = -0.18;
    diff.add(fin);
  }
  group.add(diff);
  const exGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.16, 16, 1, true);
  exGeo.rotateX(Math.PI / 2);
  const exInner = new THREE.CircleGeometry(0.04, 16);
  const exPositions = model.id === 'hatch' ? [0.4] : model.id === 'proto' ? [-0.18, 0.18] : [-0.42, -0.3, 0.3, 0.42];
  for (const x of exPositions) {
    const pipe = new THREE.Mesh(exGeo, matChrome());
    pipe.position.set(x, 0.24, zR + 0.02);
    group.add(pipe);
    const hole = new THREE.Mesh(exInner, matInterior());
    hole.material = matTrim();
    hole.rotation.y = Math.PI;
    hole.position.set(x, 0.24, zR - 0.055);
    group.add(hole);
  }

  // Side mirrors
  const cabFront = model.keys.find((k, i) => i > 0 && k[5] - k[3] < 0.1 && k[0] > model.wheelbase * 0.4);
  const mz = cabFront ? cabFront[0] - 0.12 : model.wheelbase * 0.62;
  const mv = profileAt(model, body.interp, mz);
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.05), matCarbon());
    arm.position.set(side * (mv[4] + 0.04), mv[3] + 0.08, mz);
    group.add(arm);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), paint);
    head.scale.set(1, 0.65, 1.3);
    head.position.set(side * (mv[4] + 0.12), mv[3] + 0.1, mz - 0.02);
    group.add(head);
  }

  // Wings / spoilers
  if (model.id === 'proto') {
    const span = 1.86;
    const wing = new THREE.Mesh(airfoilGeometry(span, 0.42, 0.06), matCarbon());
    wing.position.set(0, 1.06, zR + 0.48);
    wing.rotation.x = -0.12;
    group.add(wing);
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.58), paint);
      plate.position.set(side * span / 2, 0.98, zR + 0.32);
      group.add(plate);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.12), matCarbon());
      strut.position.set(side * 0.38, 0.92, zR + 0.32);
      group.add(strut);
    }
    // shark fin
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(1.2, 0);
    fin.lineTo(0.05, 0.28);
    fin.lineTo(0, 0.28);
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.015, bevelEnabled: false });
    fg.rotateY(Math.PI / 2);
    fg.translate(0.0075, 0, 0);
    const sf = new THREE.Mesh(fg, paint);
    sf.rotation.y = Math.PI; // shape grows toward +Z after rotation
    sf.position.set(0, 0.86, zR + 0.15);
    group.add(sf);
  } else if (model.id === 'gt') {
    const lip = new THREE.Mesh(airfoilGeometry(1.5, 0.16, 0.02), matCarbon());
    lip.position.set(0, keys[1][5] + 0.035, zR + 0.06);
    group.add(lip);
  } else {
    const roofSp = new THREE.Mesh(airfoilGeometry(1.2, 0.26, 0.035), paint);
    roofSp.position.set(0, keys[2][5] - 0.02, zR + 0.2);
    roofSp.rotation.x = 0.1;
    group.add(roofSp);
    // rear window on the near-vertical hatch
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36), matGlass());
    rw.position.set(0, keys[1][5] - 0.16, zR + 0.07);
    rw.rotation.y = Math.PI;
    rw.rotation.x = -0.42;
    group.add(rw);
  }

  // Race numbers: doors + rear plate
  const num = String(number ?? '');
  if (num) {
    const tex = roundel(num);
    if (tex) {
      const dz = model.wheelbase * 0.45;
      const dv = profileAt(model, body.interp, dz);
      const dy = dv[2] + (dv[3] - dv[2]) * 0.6;
      let dx = 0;
      for (let k = -4; k <= 4; k++) dx = Math.max(dx, widthAt(body, dz + k * 0.04, dy + k * 0.04), widthAt(body, dz, dy + k * 0.045));
      for (const side of [1, -1]) {
        const d = decalPlane(tex, 0.38);
        d.position.set(side * (dx + 0.006), dy, dz);
        d.rotation.y = side * Math.PI / 2;
        group.add(d);
      }
      const hoodZ = model.wheelbase + 0.35;
      const hv = profileAt(model, body.interp, hoodZ);
      if (model.id !== 'hatch') {
        const hd = decalPlane(tex, 0.36);
        hd.position.set(0, hv[5] + 0.016, hoodZ);
        // Lie flat on the bonnet, readable from the driver's seat / chase camera:
        // text top towards the nose (+Z), text reading left-to-right as seen from behind.
        hd.rotation.set(-Math.PI / 2 - 0.1, Math.PI, 0, 'YXZ');
        group.add(hd);
      }
    }
    const pt = roundel(num, { plate: true, bg: '#f2f2ee' });
    if (pt) {
      const py = model.id === 'hatch' ? 0.62 : 0.42;
      const pz = surfaceZ(body, 0.2, py, -1);
      const plate = decalPlane(pt, 0.34);
      plate.position.set(0, py, pz - 0.006);
      plate.rotation.y = Math.PI;
      group.add(plate);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Contact shadow (ambient occlusion) under the body – does not cast or receive shadows itself.
  const aoTex = aoTexture();
  if (aoTex) {
    const bw = Math.max(...model.keys.map((k) => k[1])) * 2 + 0.5;
    const ao = new THREE.Mesh(
      new THREE.PlaneGeometry(bw, zF - zR + 0.6),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: 0.78, depthWrite: false }),
    );
    ao.rotation.x = -Math.PI / 2;
    ao.position.set(0, 0.012, (zF + zR) / 2);
    ao.renderOrder = -1;
    ao.castShadow = false;
    ao.receiveShadow = false;
    group.add(ao);
    group.userData.ao = ao;
  }
  if (blurMat) group.traverse((o) => { if (o.material === blurMat) o.castShadow = false; });

  // ---- API ----
  let spinAngle = 0;
  let blurLevel = 0;
  group.userData.model = model.id;
  group.userData.livery = livery;
  group.userData.wheels = wheels;
  group.userData.frontWheels = frontWheels;
  group.userData.paint = paint;
  group.userData.setBrake = (on) => {
    tailMat.emissiveIntensity = on ? 3.4 : 0.9;
    tailLens.emissiveIntensity = on ? 2.2 : 0.6;
  };
  group.userData.setSteer = (a) => {
    const ang = Math.max(-0.5, Math.min(0.5, a || 0));
    for (const w of frontWheels) w.rotation.y = ang;
  };
  group.userData.spin = (dist) => {
    const step = (dist || 0) / model.tyreR; // radians this call (usually one frame)
    spinAngle = (spinAngle + step) % (Math.PI * 2);
    for (const s of wheels) s.rotation.x = spinAngle;
    // Above ~0.25 rad/frame the eye can no longer follow spokes: fade to a smeared disc.
    const target = Math.max(0, Math.min(1, (Math.abs(step) - 0.22) / 0.3));
    blurLevel += (target - blurLevel) * 0.35;
    if (blurMat) {
      blurMat.opacity = blurLevel * 0.96;
      blurMat.visible = blurLevel > 0.02;
    }
    for (const f of faces) f.visible = blurLevel < 0.8;
  };
  group.userData.blur = () => blurLevel;
  group.userData.setColor = (c) => {
    paintColor = toColor(c);
    if (paint.map) paintTexture(paintColor, stripe, paint.map, seams, livery, marks);
    else paint.color.copy(paintColor);
  };
  group.userData.dispose = () => {
    group.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    paint.map?.dispose();
    paint.dispose();
    tailMat.dispose();
    tailLens.dispose();
    blurMat?.map?.dispose();
    blurMat?.dispose();
    aoTex?.dispose();
  };
  return group;
}
