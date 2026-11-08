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

const S = 5; // samples per profile span
const SPANS = 8;
const HALF = SPANS * S + 1; // points from bottom centre to roof centre
const RING = HALF * 2 - 2;
const I_SHOULDER = 4 * S;
const I_ROOFEDGE = 6 * S;

/** Right half of the cross-section (x >= 0), bottom centre -> roof centre. */
function sectionHalf(v) {
  const [, w, yb, yBelt, wBelt, yRoofRaw, wRoofRaw] = v;
  const yRoof = Math.max(yRoofRaw, yBelt + 0.012);
  const wRoof = Math.min(wRoofRaw, wBelt - 0.01);
  const cab = yRoof - yBelt;
  const yWide = yb + (yBelt - yb) * 0.42;
  const ctrl = [
    [0, yb],
    [w * 0.86, yb],
    [w * 0.985, yb + (yWide - yb) * 0.45],
    [w, yWide],
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
  const N = 150;
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

/** Body paint texture: base colour with racing stripes over the top centre line. */
function paintTexture(color, stripe, existing, seams) {
  const cv = existing?.image || canvas2d(1024, 512);
  if (!cv) return null;
  const c = cv.getContext('2d');
  c.fillStyle = `#${color.getHexString()}`;
  c.fillRect(0, 0, cv.width, cv.height);
  if (stripe) {
    const light = luminance(color) > 0.35;
    const sc = light ? '#1c1e22' : '#f4f5f7';
    // v = ring index / RING; top centre is at v = 0.5 (canvas y is flipped: flipY default)
    const H = cv.height;
    const mid = H * 0.5;
    const w = H * 0.026;
    const gap = H * 0.012;
    c.fillStyle = sc;
    c.fillRect(0, mid - gap - w, cv.width, w);
    c.fillRect(0, mid + gap, cv.width, w);
    // thin pinstripe along the shoulders
    c.globalAlpha = 0.85;
    const sh = (I_SHOULDER - 1.2) / RING;
    c.fillRect(0, H * sh - 2, cv.width, 3);
    c.fillRect(0, H * (1 - sh) - 1, cv.width, 3);
    c.globalAlpha = 1;
  }
  if (seams) {
    const H = cv.height;
    const vTop = (I_SHOULDER - 0.6) / RING;
    const vBot = (S * 0.9) / RING;
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 2;
    for (const u of seams) {
      const x = u * cv.width;
      for (const [a, b] of [[vBot, vTop], [1 - vTop, 1 - vBot]]) {
        c.beginPath();
        c.moveTo(x, H * (1 - a));
        c.lineTo(x, H * (1 - b));
        c.stroke();
      }
    }
  }
  if (existing) {
    existing.needsUpdate = true;
    return existing;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
const matTyreSide = () => sharedMat('tyreSide', () => new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.85, metalness: 0 }));
const matHead = () => sharedMat('head', () => new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xfff4dc, emissiveIntensity: 1.6, roughness: 0.2 }));
const matLensClear = () => sharedMat('lens', () => new THREE.MeshPhysicalMaterial({ color: 0xc7d3e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, clearcoat: 1 }));
const matGlass = () => sharedMat('glass', () => new THREE.MeshPhysicalMaterial({
  color: 0x0a0d12, roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.9, envMapIntensity: 1.4,
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

function makeWheel(model, side, quality) {
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
  hub.userData.spin = spin;
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
  const paintTex = paintTexture(paintColor, stripe, null, seams);
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintTex ? 0xffffff : paintColor,
    map: paintTex,
    metalness: 0.5,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.15,
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
  for (const az of [0, model.wheelbase]) {
    for (const side of [1, -1]) {
      const w = makeWheel(model, side, quality);
      w.position.set(side * model.track, model.tyreR, az);
      group.add(w);
      wheels.push(w.userData.spin);
      if (az > 0) frontWheels.push(w);
    }
  }

  // Lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x6e0710, emissive: 0xff1a22, emissiveIntensity: 0.9, roughness: 0.25 });
  const tailY = keys[0][3] - 0.08 + (model.id === 'hatch' ? 0.02 : 0);
  const hlY = model.id === 'proto' ? 0.36 : (keys[keys.length - 2][3] + keys[keys.length - 2][2]) / 2 + 0.06;
  for (const side of [1, -1]) {
    // headlight
    const hx = model.id === 'hatch' ? 0.56 : model.id === 'proto' ? 0.62 : 0.58;
    const hz = surfaceZ(body, hx, hlY, 1);
    const head = lightPod(model.id === 'proto' ? 0.36 : 0.3, 0.09, 0.08, matHead());
    head.position.set(side * hx, hlY, hz - 0.03);
    head.rotation.y = side * (model.id === 'hatch' ? 0.25 : 0.42);
    group.add(head);
    const cover = lightPod(model.id === 'proto' ? 0.4 : 0.34, 0.12, 0.1, matLensClear());
    cover.position.copy(head.position);
    cover.position.z += 0.012;
    cover.rotation.copy(head.rotation);
    group.add(cover);
    // tail light
    const tx = model.id === 'hatch' ? 0.66 : 0.62;
    const tz = surfaceZ(body, tx, tailY, -1);
    const tail = lightPod(model.id === 'gt' ? 0.42 : 0.3, 0.075, 0.06, tailMat);
    tail.position.set(side * tx, tailY, tz + 0.012);
    tail.rotation.y = -side * 0.35;
    group.add(tail);
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
  const split = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.32), matCarbon());
  split.position.set(0, 0.12, zF - 0.3);
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

  // ---- API ----
  let spinAngle = 0;
  group.userData.model = model.id;
  group.userData.wheels = wheels;
  group.userData.frontWheels = frontWheels;
  group.userData.paint = paint;
  group.userData.setBrake = (on) => {
    tailMat.emissiveIntensity = on ? 3.2 : 0.9;
  };
  group.userData.setSteer = (a) => {
    const ang = Math.max(-0.5, Math.min(0.5, a || 0));
    for (const w of frontWheels) w.rotation.y = ang;
  };
  group.userData.spin = (dist) => {
    spinAngle = (spinAngle + (dist || 0) / model.tyreR) % (Math.PI * 2);
    for (const s of wheels) s.rotation.x = spinAngle;
  };
  group.userData.setColor = (c) => {
    paintColor = toColor(c);
    if (paint.map) paintTexture(paintColor, stripe, paint.map, seams);
    else paint.color.copy(paintColor);
  };
  group.userData.dispose = () => {
    group.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    paint.map?.dispose();
    paint.dispose();
    tailMat.dispose();
  };
  return group;
}
