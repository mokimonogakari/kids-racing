// 3D circuit world for the "サーキット" mode: road, kerbs, run-off, barriers, pit, gantry,
// grandstands, boards, billboards, trees, terrain, sea/mountains, sky, sun, fog, environment.
// Everything is procedural (CanvasTexture + BufferGeometry) — no external assets.
//
// buildWorld(THREE, track, opts) → { group, sun, hemi, fog, exposure, update(camPos, t), setFlare(on), dispose() }
//   track: { length, width, samples: [{ s, pos:[x,y,z], tan, nor (right, horizontal), up, curv, bank }] } (1 m step, closed loop)
//   opts:  { id: 'coast'|'mountain', renderer?, scene?, quality?: 0..2, seed?, flare?: boolean }
//   If opts.scene is given the world sets scene.fog; if opts.renderer is given it also sets scene.environment
//   (PMREM of the sky). The Sky shader draws at the far plane, so any camera far value works.
import { Sky } from 'three/addons/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const ROAD_HALF = 7; // m (14 m wide)

const PRESETS = {
  coast: {
    sunElev: 38, sunAzim: 215, turbidity: 5.5, rayleigh: 1.4, mie: 0.004, mieG: 0.82,
    fog: 0xc8d9e8, fogNear: 260, fogFar: 4200, exposure: 0.62,
    grass: ['#4a7f2f', '#5f973d'], ground: '#557f37', trees: 'coast', sea: true,
  },
  mountain: {
    sunElev: 30, sunAzim: 140, turbidity: 7.5, rayleigh: 1.9, mie: 0.006, mieG: 0.8,
    fog: 0xbfcad6, fogNear: 220, fogFar: 3800, exposure: 0.6,
    grass: ['#436f2a', '#58893a'], ground: '#4b7232', trees: 'mountain', sea: false,
  },
};

// ---------------------------------------------------------------- utilities
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function makeTex(THREE, cv, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const tx = new THREE.CanvasTexture(cv);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  if (repeat) tx.repeat.set(repeat[0], repeat[1]);
  tx.anisotropy = aniso;
  tx.needsUpdate = true;
  return tx;
}

function speckle(g, w, h, n, colors, r, maxSize = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(r() * colors.length) | 0];
    const s = 0.5 + r() * maxSize;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

// ---------------------------------------------------------------- textures
function asphaltTexture(THREE, r, quality) {
  const W = 512;
  const H = 512;
  const cv = canvas(W, H);
  const g = cv.getContext('2d');
  // u: across the 14 m road, v: 16 m along it.
  g.fillStyle = '#434446';
  g.fillRect(0, 0, W, H);
  // Large blotches (patches / repairs)
  for (let i = 0; i < 26; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(20,22,26,0.10)' : 'rgba(110,112,118,0.07)';
    g.beginPath();
    g.ellipse(r() * W, r() * H, 20 + r() * 70, 10 + r() * 40, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Rubbered racing line (darker band, slightly off-centre)
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.3, 'rgba(10,10,12,0.22)');
  grd.addColorStop(0.5, 'rgba(10,10,12,0.30)');
  grd.addColorStop(0.7, 'rgba(10,10,12,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(W * 0.12, 0, W * 0.76, H);
  // Aggregate
  speckle(g, W, H, quality >= 1 ? 30000 : 14000, ['#4c4d50', '#38393c', '#535457', '#424346', '#3a3b3e'], r, 0.9);
  // Edge lines: 0.15..0.45 m in from each edge, slightly worn
  const px = (m) => (m / 14) * W;
  g.fillStyle = '#e9e9e4';
  g.fillRect(px(0.18), 0, px(0.3), H);
  g.fillRect(W - px(0.48), 0, px(0.3), H);
  g.fillStyle = 'rgba(60,62,66,0.35)';
  for (let i = 0; i < 300; i++) {
    const side = r() < 0.5 ? px(0.18) : W - px(0.48);
    g.fillRect(side + r() * px(0.3), r() * H, 2, 1 + r() * 3);
  }
  // Fine cracks
  g.strokeStyle = 'rgba(25,26,30,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = r() * W;
    let y = r() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 30;
      y += r() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return makeTex(THREE, cv);
}

function asphaltRough(THREE, r) {
  const cv = canvas(256, 256);
  const g = cv.getContext('2d');
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 256, 256);
  // racing line is smoother (polished by rubber)
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0.15, 'rgba(120,120,120,0)');
  grd.addColorStop(0.5, 'rgba(120,120,120,0.55)');
  grd.addColorStop(0.85, 'rgba(120,120,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 6000, ['#ffffff', '#b0b0b0', '#e8e8e8'], r, 1.2);
  return makeTex(THREE, cv, { srgb: false });
}

function kerbTexture(THREE) {
  // v: 5 m (one red + one white block of 2.5 m), u: across the kerb
  const cv = canvas(64, 256);
  const g = cv.getContext('2d');
  g.fillStyle = '#d62b2b';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 128, 64, 128);
  // ridged surface shading across u
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.18)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, y, 64, 2);
  }
  return makeTex(THREE, cv);
}

function grassTexture(THREE, r, colors) {
  // Mowing stripes across the track direction (v), 6 m each.
  const cv = canvas(256, 256);
  const g = cv.getContext('2d');
  g.fillStyle = colors[0];
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = colors[1];
  g.fillRect(0, 128, 256, 128);
  speckle(g, 256, 256, 9000, ['rgba(40,70,25,0.5)', 'rgba(140,180,90,0.35)', 'rgba(70,110,40,0.5)'], r, 1.5);
  return makeTex(THREE, cv);
}

function groundTexture(THREE, r, base) {
  const cv = canvas(256, 256);
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(30,60,20,0.18)' : 'rgba(150,170,80,0.12)';
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 10 + r() * 40, 8 + r() * 30, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 256, 256, 7000, ['rgba(30,60,20,0.4)', 'rgba(150,180,90,0.3)'], r, 1.5);
  return makeTex(THREE, cv);
}

function gravelTexture(THREE, r) {
  const cv = canvas(256, 256);
  const g = cv.getContext('2d');
  g.fillStyle = '#c9b48d';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 14000, ['#a8936c', '#ddd0b2', '#8f7c5a', '#efe6d0', '#b8a17a'], r, 2.2);
  return makeTex(THREE, cv);
}

function sandTexture(THREE, r) {
  const cv = canvas(256, 256);
  const g = cv.getContext('2d');
  g.fillStyle = '#e6d3a6';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 8000, ['#d8c291', '#f3e6c4', '#cdb683'], r, 1.4);
  return makeTex(THREE, cv);
}

function concreteTexture(THREE, r, stripes = false) {
  const cv = canvas(256, 128);
  const g = cv.getContext('2d');
  g.fillStyle = '#c9c9c4';
  g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 4000, ['#b4b4ae', '#dadad5', '#a6a6a0'], r, 1.5);
  g.fillStyle = 'rgba(70,70,70,0.35)';
  g.fillRect(0, 0, 2, 128); // panel joint
  if (stripes) {
    g.fillStyle = '#d23030';
    g.fillRect(0, 96, 256, 16);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 118, 256, 10);
  return makeTex(THREE, cv);
}

function tireWallTexture(THREE) {
  // stacked tyres seen from the side; u along, v height. One tyre ≈ 0.6 m.
  const cv = canvas(256, 128);
  const g = cv.getContext('2d');
  g.fillStyle = '#18191b';
  g.fillRect(0, 0, 256, 128);
  const rows = 3;
  const cols = 8;
  for (let rr = 0; rr < rows; rr++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5 + (rr % 2) * 0.5) * (256 / cols);
      const y = (rr + 0.5) * (128 / rows);
      g.fillStyle = '#26272a';
      g.beginPath();
      g.ellipse(x % 256, y, 15, 19, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0d0d0e';
      g.beginPath();
      g.ellipse(x % 256, y, 6, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the conveyor belt band with blue/white panels
  for (let c = 0; c < 4; c++) {
    g.fillStyle = c % 2 ? '#f0f0f0' : '#1f5fbf';
    g.fillRect(c * 64, 40, 64, 46);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 84, 256, 3);
  return makeTex(THREE, cv);
}

function fenceAlpha(THREE) {
  const cv = canvas(64, 64);
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = -64; i < 128; i += 16) {
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.moveTo(i + 64, 0);
    g.lineTo(i, 64);
  }
  g.stroke();
  g.fillRect(0, 0, 64, 3);
  const tx = makeTex(THREE, cv, { srgb: false });
  return tx;
}

function checkerTexture(THREE) {
  const cv = canvas(256, 64);
  const g = cv.getContext('2d');
  const n = 16;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f0';
      g.fillRect((x * 256) / n, y * 16, 256 / n, 16);
    }
  }
  return makeTex(THREE, cv);
}

function textPanel(THREE, text, { bg = '#1b3a8a', fg = '#ffffff', accent = '#ffd23f', w = 512, h = 128, italic = true } = {}) {
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, bg);
  grd.addColorStop(1, shadeHex(bg, -0.35));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, h - h * 0.12, w, h * 0.12);
  g.font = `${italic ? 'italic ' : ''}900 ${Math.round(h * 0.62)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillText(text, w / 2 + 4, h * 0.46 + 4);
  g.fillStyle = fg;
  g.fillText(text, w / 2, h * 0.46);
  return makeTex(THREE, cv);
}

function boardTexture(THREE, label) {
  const cv = canvas(128, 96);
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(5, 5, 118, 86);
  g.fillStyle = '#111';
  g.font = '900 54px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 52);
  return makeTex(THREE, cv);
}

function windowsTexture(THREE, r) {
  const cv = canvas(256, 128);
  const g = cv.getContext('2d');
  g.fillStyle = '#e8e8e3';
  g.fillRect(0, 0, 256, 128);
  // upper floor: dark glass strip, lower: garage doors
  const grd = g.createLinearGradient(0, 8, 0, 52);
  grd.addColorStop(0, '#7fa9c9');
  grd.addColorStop(1, '#2c4560');
  g.fillStyle = grd;
  g.fillRect(0, 10, 256, 40);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 10, 2, 40);
  g.fillStyle = '#3d4249';
  g.fillRect(16, 66, 224, 62);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let y = 70; y < 128; y += 6) g.fillRect(16, y, 224, 2);
  g.fillStyle = '#d23030';
  g.fillRect(0, 56, 256, 6);
  speckle(g, 256, 128, 600, ['rgba(0,0,0,0.06)'], r, 2);
  return makeTex(THREE, cv);
}

function gantryLightsTexture(THREE) {
  const cv = canvas(256, 64);
  const g = cv.getContext('2d');
  g.fillStyle = '#121316';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 5; i++) {
    const x = 28 + i * 50;
    const grd = g.createRadialGradient(x, 32, 2, x, 32, 20);
    grd.addColorStop(0, '#ffd5d5');
    grd.addColorStop(0.35, '#ff2a2a');
    grd.addColorStop(1, '#3a0505');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, 32, 18, 0, Math.PI * 2);
    g.fill();
  }
  return makeTex(THREE, cv);
}

function flareTexture(THREE, kind) {
  const S = 128;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === 'main') {
    grd.addColorStop(0, 'rgba(255,255,250,1)');
    grd.addColorStop(0.18, 'rgba(255,245,215,0.7)');
    grd.addColorStop(0.5, 'rgba(255,220,170,0.12)');
    grd.addColorStop(1, 'rgba(255,220,170,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(180,220,255,0.18)');
    grd.addColorStop(0.85, 'rgba(255,255,255,0.32)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let rr = (n >> 16) & 255;
  let gg = (n >> 8) & 255;
  let bb = n & 255;
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  rr = f(rr);
  gg = f(gg);
  bb = f(bb);
  return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1)}`;
}

// ---------------------------------------------------------------- track analysis
function analyse(track) {
  const S = track.samples;
  const N = S.length;
  const L = track.length || N;
  // Smoothed curvature over ±15 m
  const cs = new Float32Array(N);
  const win = 15;
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let k = -win; k <= win; k++) acc += S[(i + k + N) % N].curv || 0;
    cs[i] = acc / (2 * win + 1);
  }
  // Turn direction in the local frame: +1 = turning right (toward nor)
  const turn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = S[(i - 6 + N) % N].tan;
    const b = S[(i + 6) % N].tan;
    const n = S[i].nor;
    turn[i] = Math.sign((b[0] - a[0]) * n[0] + (b[1] - a[1]) * n[1] + (b[2] - a[2]) * n[2]);
  }
  // Corner ranges
  const TH = 1 / 300;
  const inC = new Uint8Array(N);
  for (let i = 0; i < N; i++) inC[i] = Math.abs(cs[i]) > TH ? 1 : 0;
  // find a start index that is not in a corner
  let start = 0;
  while (start < N && inC[start]) start++;
  if (start >= N) start = 0;
  const ranges = [];
  let cur = null;
  for (let k = 0; k < N; k++) {
    const i = (start + k) % N;
    if (inC[i]) {
      if (!cur) cur = { a: k, b: k };
      else cur.b = k;
    } else if (cur && k - cur.b > 30) {
      ranges.push(cur);
      cur = null;
    }
  }
  if (cur) ranges.push(cur);
  const corners = [];
  for (const rg of ranges) {
    if (rg.b - rg.a < 20) continue;
    let peak = 0;
    let peakI = 0;
    let dir = 0;
    for (let k = rg.a; k <= rg.b; k++) {
      const i = (start + k) % N;
      if (Math.abs(cs[i]) > peak) {
        peak = Math.abs(cs[i]);
        peakI = i;
      }
      dir += turn[i];
    }
    corners.push({
      a: (start + rg.a) % N,
      len: rg.b - rg.a,
      peak,
      peakI,
      dir: dir >= 0 ? 1 : -1, // +1: turns right → outside is left (−x)
    });
  }
  // Bounds
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of S) {
    minY = Math.min(minY, s.pos[1]);
    maxY = Math.max(maxY, s.pos[1]);
    minX = Math.min(minX, s.pos[0]);
    maxX = Math.max(maxX, s.pos[0]);
    minZ = Math.min(minZ, s.pos[2]);
    maxZ = Math.max(maxZ, s.pos[2]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  let rad = 0;
  for (const s of S) rad = Math.max(rad, Math.hypot(s.pos[0] - cx, s.pos[2] - cz));
  // Spatial hash for "distance to track" queries (sampled every 6 m)
  const cell = 40;
  const hash = new Map();
  for (let i = 0; i < N; i += 6) {
    const p = S[i].pos;
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[2] / cell)}`;
    let arr = hash.get(key);
    if (!arr) hash.set(key, (arr = []));
    arr.push(i);
  }
  const nearest = (x, z) => {
    const cxI = Math.floor(x / cell);
    const czI = Math.floor(z / cell);
    let best = Infinity;
    let bi = -1;
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const arr = hash.get(`${cxI + a},${czI + b}`);
        if (!arr) continue;
        for (const i of arr) {
          const p = S[i].pos;
          const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
      }
    }
    return { d: Math.sqrt(best), i: bi };
  };
  return { N, L, cs, turn, corners, minY, maxY, cx, cz, rad, nearest };
}

// ---------------------------------------------------------------- geometry builders
/**
 * Ribbon along the track. cols(i) → array of { x, h, y? } (lateral offset m, height along `up`,
 * or absolute world y when `y` is given). Rows every `step` metres over [s0, s1) (wrapping).
 */
function ribbon(THREE, track, { s0 = 0, s1 = null, step = 2, cols, u, vScale = 1, closed = null, onRow = null }) {
  const S = track.samples;
  const N = S.length;
  const total = s1 == null ? N : s1 - s0;
  const isClosed = closed == null ? s1 == null : closed;
  const rows = Math.max(2, Math.ceil(total / step) + (isClosed ? 1 : 1));
  const i0 = ((Math.round(s0) % N) + N) % N;
  const first = cols(i0, S[i0], s0);
  const C = first.length;
  const pos = new Float32Array(rows * C * 3);
  const uv = new Float32Array(rows * C * 2);
  const nrmUp = new Float32Array(rows * 3);
  for (let rI = 0; rI < rows; rI++) {
    const sRaw = Math.min(s0 + rI * step, s0 + total);
    const i = ((Math.round(sRaw) % N) + N) % N;
    const smp = S[i];
    const cs = cols(i, smp, sRaw);
    if (onRow) onRow(i, smp);
    for (let c = 0; c < C; c++) {
      const col = cs[c];
      const k = (rI * C + c) * 3;
      let px = smp.pos[0] + smp.nor[0] * col.x + smp.up[0] * (col.h || 0);
      let py = smp.pos[1] + smp.nor[1] * col.x + smp.up[1] * (col.h || 0);
      let pz = smp.pos[2] + smp.nor[2] * col.x + smp.up[2] * (col.h || 0);
      if (col.y != null) py = col.y;
      pos[k] = px;
      pos[k + 1] = py;
      pos[k + 2] = pz;
      const uu = u ? u(c, col) : c / (C - 1);
      uv[(rI * C + c) * 2] = uu;
      uv[(rI * C + c) * 2 + 1] = (sRaw - s0) * vScale;
    }
    nrmUp[rI * 3] = smp.up[0];
    nrmUp[rI * 3 + 1] = smp.up[1];
    nrmUp[rI * 3 + 2] = smp.up[2];
  }
  const idx = [];
  for (let rI = 0; rI < rows - 1; rI++) {
    for (let c = 0; c < C - 1; c++) {
      const a = rI * C + c;
      const b = a + 1;
      const cc = a + C;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Make the winding face "up" (independent of the track's handedness)
  if (idx.length) {
    const p = (j) => [pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]];
    const A = p(idx[0]);
    const B = p(idx[1]);
    const Cc = p(idx[2]);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const dot = nx * nrmUp[0] + ny * nrmUp[1] + nz * nrmUp[2];
    if (dot < 0) {
      for (let t = 0; t < idx.length; t += 3) {
        const tmp = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = tmp;
      }
    }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Vertical strip (wall/fence) along the track at lateral offset x, from h0 to h1 above the road plane. */
function wall(THREE, track, { s0, s1, x, h0, h1, step = 3, uLen = 4, yBase = null }) {
  const S = track.samples;
  const N = S.length;
  const total = s1 - s0;
  const rows = Math.max(2, Math.ceil(total / step) + 1);
  const pos = new Float32Array(rows * 2 * 3);
  const uv = new Float32Array(rows * 2 * 2);
  for (let rI = 0; rI < rows; rI++) {
    const sRaw = Math.min(s0 + rI * step, s1);
    const i = ((Math.round(sRaw) % N) + N) % N;
    const smp = S[i];
    const bx = smp.pos[0] + smp.nor[0] * x;
    const bz = smp.pos[2] + smp.nor[2] * x;
    const by = (yBase ? yBase(i, smp) : smp.pos[1] + smp.nor[1] * x);
    for (let c = 0; c < 2; c++) {
      const k = (rI * 2 + c) * 3;
      pos[k] = bx;
      pos[k + 1] = by + (c ? h1 : h0);
      pos[k + 2] = bz;
      uv[(rI * 2 + c) * 2] = (sRaw - s0) / uLen;
      uv[(rI * 2 + c) * 2 + 1] = c;
    }
  }
  const idx = [];
  for (let rI = 0; rI < rows - 1; rI++) {
    const a = rI * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Place an object at track position (s, x) facing along the track (or across it). */
function placeAt(obj, track, s, x, h = 0, { face = 'along', yaw = 0 } = {}) {
  const S = track.samples;
  const N = S.length;
  const smp = S[((Math.round(s) % N) + N) % N];
  obj.position.set(
    smp.pos[0] + smp.nor[0] * x + smp.up[0] * h,
    smp.pos[1] + smp.nor[1] * x + smp.up[1] * h,
    smp.pos[2] + smp.nor[2] * x + smp.up[2] * h,
  );
  // Object's local +Z points along the track tangent, +X to the right (nor) by default
  const ang = Math.atan2(smp.tan[0], smp.tan[2]);
  obj.rotation.set(0, ang + yaw + (face === 'across' ? Math.PI / 2 : 0), 0);
  return smp;
}

function mergeGeos(THREE, parts) {
  // Minimal merge for non-indexed or indexed geometries with position/normal/uv
  let vCount = 0;
  let iCount = 0;
  for (const g of parts) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo;
      io += a.length;
    } else {
      for (let k = 0; k < n; k++) idx[io + k] = vo + k;
      io += n;
    }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

function bakeGeo(THREE, geo, obj) {
  obj.updateMatrix();
  const g = geo.clone();
  g.applyMatrix4(obj.matrix);
  return g;
}

// Merge static meshes that share a material into one draw call each.
function staticBatch(THREE, group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSky || o.isLensflare || o.userData.noBatch) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || !g.attributes.uv || !g.attributes.normal) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex];
      if (!mat) continue;
      let sub = g;
      if (groups.length > 1 || gr.start !== 0) {
        sub = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) sub.setAttribute(k, g.attributes[k]);
        if (g.index) sub.setIndex(Array.from(g.index.array.slice(gr.start, gr.start + gr.count)));
      }
      const baked = sub.clone();
      baked.applyMatrix4(o.matrixWorld);
      const key = `${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, cast: o.castShadow, receive: o.receiveShadow, geos: [] }));
      b.geos.push(baked);
    }
    victims.push(o);
  });
  for (const o of victims) o.removeFromParent();
  const made = [];
  for (const b of buckets.values()) {
    const merged = mergeGeos(THREE, b.geos);
    b.geos.forEach((x) => x.dispose());
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.name = 'batched';
    group.add(m);
    made.push(merged);
  }
  // drop empty sub-groups
  for (const c of [...group.children]) if (c.isGroup && c.children.length === 0) c.removeFromParent();
  return made;
}

// ---------------------------------------------------------------- world
export function buildWorld(THREE, track, opts = {}) {
  const id = opts.id === 'mountain' ? 'mountain' : 'coast';
  const P = PRESETS[id];
  const quality = opts.quality ?? 2;
  const r = rng((opts.seed ?? 1234) + (id === 'mountain' ? 77 : 0));
  const group = new THREE.Group();
  group.name = 'world3d';
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const A = analyse(track);
  const S = track.samples;
  const N = A.N;
  const groundY = A.minY - 2.5;

  // ---------------- materials
  const asphaltMap = keep(asphaltTexture(THREE, r, quality));
  const roadMat = keep(new THREE.MeshStandardMaterial({
    map: asphaltMap,
    roughnessMap: keep(asphaltRough(THREE, r)),
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.35,
  }));
  const kerbMat = keep(new THREE.MeshStandardMaterial({ map: keep(kerbTexture(THREE)), roughness: 0.55 }));
  const grassMap = keep(grassTexture(THREE, r, P.grass));
  const grassMat = keep(new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1, envMapIntensity: 0.5 }));
  const groundMap = keep(groundTexture(THREE, r, P.ground));
  groundMap.repeat.set(70, 70);
  const groundMat = keep(new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, envMapIntensity: 0.5 }));
  const gravelMat = keep(new THREE.MeshStandardMaterial({
    map: keep(gravelTexture(THREE, r)), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const concreteMat = keep(new THREE.MeshStandardMaterial({ map: keep(concreteTexture(THREE, r, true)), roughness: 0.85 }));
  const plainConcrete = keep(new THREE.MeshStandardMaterial({ map: keep(concreteTexture(THREE, r, false)), roughness: 0.9 }));
  const steelMat = keep(new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.85, roughness: 0.32 }));
  const darkSteel = keep(new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.6, roughness: 0.45 }));
  const whitePaint = keep(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
  const tireMat = keep(new THREE.MeshStandardMaterial({ map: keep(tireWallTexture(THREE)), roughness: 0.9 }));
  const fenceMat = keep(new THREE.MeshStandardMaterial({
    color: 0x9aa1a8, metalness: 0.7, roughness: 0.4, alphaMap: keep(fenceAlpha(THREE)), transparent: false,
    alphaTest: 0.5, side: THREE.DoubleSide,
  }));
  fenceMat.alphaMap.repeat.set(1, 4);

  const addMesh = (geo, mat, { cast = false, receive = true, name = '' } = {}) => {
    keep(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.name = name;
    group.add(m);
    return m;
  };

  // ---------------- road
  addMesh(
    ribbon(THREE, track, {
      step: 2,
      cols: () => [{ x: -ROAD_HALF, h: 0 }, { x: 0, h: 0.015 }, { x: ROAD_HALF, h: 0 }],
      u: (c) => c / 2,
      vScale: 1 / 16,
    }),
    roadMat,
    { name: 'road' },
  );

  // ---------------- corner sets: kerbs, gravel, tyre walls
  const PIT_A = -190; // pit straight around s=0
  const PIT_B = 140;
  const inPit = (s) => {
    const d = ((s % N) + N) % N;
    return d < PIT_B || d > N + PIT_A;
  };
  const cornerParts = { kerb: [], gravel: [], tyre: [] };
  for (const c of A.corners) {
    const s0 = c.a - 18;
    const len = c.len + 36;
    for (const side of [-1, 1]) {
      // kerbs on both sides: inner kerb a bit shorter
      const inner = side === c.dir;
      const a0 = inner ? s0 + 10 : s0;
      const l0 = inner ? len - 20 : len;
      if (l0 < 10) continue;
      cornerParts.kerb.push(
        ribbon(THREE, track, {
          s0: a0, s1: a0 + l0, step: 1, closed: false,
          cols: () => {
            const x0 = side * ROAD_HALF;
            const x1 = side * (ROAD_HALF + 0.75);
            const x2 = side * (ROAD_HALF + 1.5);
            return [{ x: x0, h: 0.02 }, { x: x1, h: 0.11 }, { x: x2, h: 0.0 }];
          },
          u: (k) => k / 2,
          vScale: 1 / 5,
        }),
      );
    }
    // gravel trap + tyre wall on the outside of the bend
    const out = -c.dir;
    if (c.peak > 1 / 220) {
      const gs = c.a - 6;
      const gl = c.len + 40;
      cornerParts.gravel.push(
        ribbon(THREE, track, {
          s0: gs, s1: gs + gl, step: 2, closed: false,
          cols: (i, smp, sr) => {
            const k = clamp(Math.min(sr - gs, gs + gl - sr, 18) / 18, 0.15, 1); // taper ends
            const w = 4 + 10 * k;
            return [
              { x: out * (ROAD_HALF + 3.2), h: -0.03 },
              { x: out * (ROAD_HALF + 3.2 + w), h: -0.08 },
            ];
          },
          vScale: 1 / 8,
        }),
      );
      cornerParts.tyre.push(
        wall(THREE, track, { s0: gs, s1: gs + gl, x: out * (ROAD_HALF + 17.5), h0: -0.2, h1: 1.1, step: 2, uLen: 5 }),
      );
    }
  }
  if (cornerParts.kerb.length) addMesh(mergeGeos(THREE, cornerParts.kerb), kerbMat, { name: 'kerbs' });
  if (cornerParts.gravel.length) addMesh(mergeGeos(THREE, cornerParts.gravel), gravelMat, { name: 'gravel' });
  if (cornerParts.tyre.length) {
    const m = addMesh(mergeGeos(THREE, cornerParts.tyre), tireMat, { cast: true, name: 'tyrewalls' });
    m.material.side = THREE.DoubleSide;
  }

  // ---------------- run-off grass + embankment to the terrain (both sides)
  const terrainY = (i) => {
    // far terrain follows a heavily smoothed track height, pulled toward the base ground
    return lerp(S[i].pos[1], groundY, 0.75);
  };
  for (const side of [-1, 1]) {
    addMesh(
      ribbon(THREE, track, {
        step: 3,
        cols: (i, smp) => {
          const ty = terrainY(i);
          // On the inside of a bend the strip may not reach past the bend's centre
          const inside = A.turn[i] === side && Math.abs(A.cs[i]) > 1e-4;
          let lim = inside ? Math.max(ROAD_HALF + 21, 0.85 / Math.abs(A.cs[i])) : 1e9;
          // stop halfway to any other part of the circuit lying out this way
          for (let m = 30; m <= 120; m += 15) {
            const qx = smp.pos[0] + smp.nor[0] * side * m;
            const qz = smp.pos[2] + smp.nor[2] * side * m;
            const nr = A.nearest(qx, qz);
            if (nr.i < 0) continue;
            let di = Math.abs(nr.i - i);
            di = Math.min(di, N - di);
            if (di > 60 && nr.d < m) {
              lim = Math.min(lim, Math.max(ROAD_HALF + 21, (m + nr.d) * 0.5 - 2));
              break;
            }
          }
          const X = (m) => side * Math.min(m, lim);
          return [
            { x: side * ROAD_HALF, h: -0.02 },
            { x: side * (ROAD_HALF + 5), h: -0.06 },
            { x: side * (ROAD_HALF + 12), h: -0.14 },
            { x: side * (ROAD_HALF + 20), h: -0.22 },
            { x: X(ROAD_HALF + 40), y: lerp(smp.pos[1] - 0.4, ty, 0.55) },
            { x: X(ROAD_HALF + 70), y: ty },
          ];
        },
        u: (c, col) => Math.abs(col.x) / 14,
        vScale: 1 / 12,
      }),
      grassMat,
      { name: side < 0 ? 'grassL' : 'grassR' },
    );
  }

  // ---------------- base ground / coastline / sea
  const landR = A.rad + 260;
  if (P.sea) {
    const land = new THREE.Mesh(keep(new THREE.CircleGeometry(landR, 96)), groundMat);
    land.rotation.x = -Math.PI / 2;
    land.position.set(A.cx, groundY - 0.05, A.cz);
    land.receiveShadow = true;
    group.add(land);
    const sandMap = keep(sandTexture(THREE, r));
    sandMap.repeat.set(60, 4);
    const beach = new THREE.Mesh(
      keep(new THREE.RingGeometry(landR - 2, landR + 70, 96, 2)),
      keep(new THREE.MeshStandardMaterial({ map: sandMap, roughness: 1 })),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(A.cx, groundY - 0.9, A.cz);
    beach.receiveShadow = true;
    group.add(beach);
    const seaMat = keep(new THREE.MeshPhysicalMaterial({
      color: 0x1b6f92, roughness: 0.08, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12,
    }));
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(30000, 30000, 1, 1)), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(A.cx, groundY - 2.4, A.cz);
    sea.name = 'sea';
    group.add(sea);
    // shallow water band (turquoise) near the beach
    const shallow = new THREE.Mesh(
      keep(new THREE.RingGeometry(landR + 60, landR + 220, 96, 1)),
      keep(new THREE.MeshPhysicalMaterial({
        color: 0x3fb8b5, roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false,
      })),
    );
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.set(A.cx, groundY - 1.9, A.cz);
    group.add(shallow);
    // distant islands
    for (let k = 0; k < 5; k++) {
      const ang = r() * Math.PI * 2;
      const dist = landR + 900 + r() * 1600;
      const h = 60 + r() * 160;
      const w = 220 + r() * 420;
      const pts = [];
      for (let t = 0; t <= 12; t++) {
        const f = t / 12;
        pts.push(new THREE.Vector2(w * (1 - f) * (1 + 0.08 * Math.sin(t * 2.1)), h * Math.pow(f, 0.7)));
      }
      const geo = keep(new THREE.LatheGeometry(pts, 24));
      const isl = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: 0x47703d, roughness: 1, flatShading: true })));
      isl.scale.set(1, 1, 0.55 + r() * 0.5);
      isl.position.set(A.cx + Math.cos(ang) * dist, groundY - 3, A.cz + Math.sin(ang) * dist);
      group.add(isl);
    }
  } else {
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(9000, 9000, 1, 1)), groundMat);
    groundMap.repeat.set(220, 220);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(A.cx, groundY - 0.05, A.cz);
    ground.receiveShadow = true;
    group.add(ground);
  }

  // ---------------- distant mountain ring (both venues; bigger on mountain)
  {
    const seg = 220;
    const rings = 12;
    const R0 = Math.max(A.rad + (P.sea ? 2300 : 1300), 1600);
    const R1 = R0 + (P.sea ? 1700 : 2600);
    const hMax = P.sea ? 380 : 1050;
    const pos = [];
    const col = [];
    const idx = [];
    const cForest = new THREE.Color(P.sea ? 0x4f7a50 : 0x3f6e3c);
    const cMeadow = new THREE.Color(P.sea ? 0x5f8a50 : 0x4f7a3f);
    const cRock = new THREE.Color(0x8d8780);
    const cSnow = new THREE.Color(0xf2f5f8);
    const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    const noise = (a, fr) => {
      // layered ridges (deterministic, no texture)
      const n1 = Math.sin(a * 3 + ph[0] + fr * 2.0);
      const n2 = Math.sin(a * 7 + ph[1] - fr * 3.1) * 0.55;
      const n3 = Math.sin(a * 17 + ph[2] + fr * 5.3) * 0.25;
      const n4 = Math.sin(a * 41 + ph[3] - fr * 9.7) * 0.1;
      const v = (n1 + n2 + n3 + n4) / 1.9;
      return 1 - Math.abs(v); // ridged
    };
    const tmpC = new THREE.Color();
    const fogC = new THREE.Color(P.fog);
    for (let ri = 0; ri <= rings; ri++) {
      const fr = ri / rings;
      const R = lerp(R0, R1, fr);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, fr * 1.15)), 1.3);
        let hh = hMax * env * Math.pow(noise(a, fr), 1.6) * (0.75 + 0.25 * Math.sin(a * 2 + ph[0]));
        if (P.sea && Math.sin(a + 0.6) > 0.1) hh *= 0.12; // open sea on one side
        if (fr === 0) hh = 0;
        pos.push(A.cx + Math.cos(a) * R, groundY - 4 + hh, A.cz + Math.sin(a) * R);
        const hn = hh / hMax;
        if (!P.sea && hn > 0.62) tmpC.copy(cRock).lerp(cSnow, clamp((hn - 0.62) / 0.12, 0, 1));
        else if (hn > 0.34) tmpC.copy(cForest).lerp(cRock, clamp((hn - 0.34) / 0.28, 0, 1));
        else tmpC.copy(cMeadow).lerp(cForest, clamp(hn / 0.34, 0, 1));
        col.push(tmpC.r, tmpC.g, tmpC.b, fr);
      }
    }
    for (let ri = 0; ri < rings; ri++) {
      for (let k = 0; k < seg; k++) {
        const a = ri * (seg + 1) + k;
        const b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Bake light + aerial perspective into vertex colours (unlit material, ignores scene fog)
    const sd = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - P.sunElev), THREE.MathUtils.degToRad(P.sunAzim));
    const nrm = geo.attributes.normal;
    const out = new Float32Array(nrm.count * 3);
    for (let v = 0; v < nrm.count; v++) {
      const ndl = Math.max(0, nrm.getX(v) * sd.x + nrm.getY(v) * sd.y + nrm.getZ(v) * sd.z);
      const sky = 0.5 + 0.5 * nrm.getY(v);
      const lit = 0.42 + 0.38 * sky + 0.55 * ndl;
      tmpC.setRGB(col[v * 4] * lit, col[v * 4 + 1] * lit, col[v * 4 + 2] * lit);
      tmpC.lerp(fogC, lerp(0.22, 0.55, col[v * 4 + 3]));
      out[v * 3] = tmpC.r;
      out[v * 3 + 1] = tmpC.g;
      out[v * 3 + 2] = tmpC.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
    const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    m.name = 'mountains';
    group.add(m);
  }

  // ---------------- pit straight: pit wall + fence + pit lane + pit building
  {
    const s0 = PIT_A;
    const s1 = PIT_B;
    const pitSide = -1; // pits on the left
    const wallX = pitSide * (ROAD_HALF + 2.2);
    addMesh(wall(THREE, track, { s0, s1, x: wallX, h0: -0.1, h1: 1.15, step: 2, uLen: 4 }), concreteMat, { cast: true, name: 'pitwall' })
      .material.side = THREE.DoubleSide;
    const fm = addMesh(wall(THREE, track, { s0, s1, x: wallX, h0: 1.15, h1: 3.6, step: 2, uLen: 0.6 }), fenceMat, { cast: false, name: 'pitfence' });
    // wall cap
    addMesh(
      ribbon(THREE, track, {
        s0, s1, step: 2, closed: false,
        cols: () => [{ x: wallX - 0.25, h: 1.15 }, { x: wallX + 0.25, h: 1.15 }],
      }),
      plainConcrete,
    );
    // pit lane
    addMesh(
      ribbon(THREE, track, {
        s0: s0 + 10, s1: s1 - 10, step: 2, closed: false,
        cols: () => [{ x: pitSide * (ROAD_HALF + 2.5), h: 0.01 }, { x: pitSide * (ROAD_HALF + 16), h: 0.01 }],
        vScale: 1 / 16,
      }),
      roadMat,
    );
    // pit building: one long box per 14 m bay
    const winTex = keep(windowsTexture(THREE, r));
    const bayMat = keep(new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.6, metalness: 0.1 }));
    const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.7, metalness: 0.3 }));
    const bayGeo = keep(new THREE.BoxGeometry(14, 9, 12));
    const roofGeo = keep(new THREE.BoxGeometry(14.2, 0.6, 15));
    for (let s = s0 + 16; s < s1 - 16; s += 14) {
      const bay = new THREE.Mesh(bayGeo, [plainConcrete, plainConcrete, roofMat, plainConcrete, bayMat, bayMat]);
      const smp = placeAt(bay, track, s, pitSide * (ROAD_HALF + 23), 4.5 - 0.02, { yaw: Math.PI / 2 });
      bay.castShadow = true;
      bay.receiveShadow = true;
      // faces: +x/-x are sides (after yaw they face along the track); ±z faces face the track/outside
      group.add(bay);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.copy(bay.position);
      roof.position.y += 4.6;
      roof.rotation.copy(bay.rotation);
      roof.castShadow = true;
      group.add(roof);
      void smp;
    }
  }

  // ---------------- start/finish: checker line, grid boxes, gantry
  {
    const ck = keep(checkerTexture(THREE));
    const line = new THREE.Mesh(
      keep(ribbon(THREE, track, {
        s0: -1.5, s1: 1.5, step: 1.5, closed: false,
        cols: () => [{ x: -ROAD_HALF + 0.5, h: 0.03 }, { x: ROAD_HALF - 0.5, h: 0.03 }],
        vScale: 1 / 3,
      })),
      keep(new THREE.MeshStandardMaterial({ map: ck, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 })),
    );
    line.receiveShadow = true;
    group.add(line);
    // grid boxes (white "[" marks), staggered
    const boxParts = [];
    for (let k = 0; k < 8; k++) {
      const s = -10 - k * 9;
      const x = k % 2 ? 2.8 : -2.8;
      boxParts.push(ribbon(THREE, track, {
        s0: s, s1: s + 0.35, step: 0.35, closed: false,
        cols: () => [{ x: x - 1.4, h: 0.03 }, { x: x + 1.4, h: 0.03 }],
      }));
      for (const dx of [-1.4, 1.25]) {
        boxParts.push(ribbon(THREE, track, {
          s0: s - 2.2, s1: s, step: 2.2, closed: false,
          cols: () => [{ x: x + dx, h: 0.03 }, { x: x + dx + 0.15, h: 0.03 }],
        }));
      }
    }
    addMesh(mergeGeos(THREE, boxParts), keep(new THREE.MeshStandardMaterial({
      color: 0xf0f0ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4,
    })), { name: 'grid' });

    const gantry = new THREE.Group();
    const pillarGeo = keep(new THREE.BoxGeometry(0.6, 8.5, 0.6));
    for (const x of [-ROAD_HALF - 2.4, ROAD_HALF + 2.4]) {
      const p = new THREE.Mesh(pillarGeo, darkSteel);
      p.position.set(x, 4.25, 0);
      p.castShadow = true;
      gantry.add(p);
    }
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(2 * ROAD_HALF + 5.4, 1.6, 0.9)), [
      darkSteel, darkSteel, darkSteel, darkSteel,
      keep(new THREE.MeshStandardMaterial({ map: keep(textPanel(THREE, 'BUUBUU', { bg: '#c81e2d', accent: '#ffffff' })), roughness: 0.5 })),
      keep(new THREE.MeshStandardMaterial({ map: keep(textPanel(THREE, 'RACE', { bg: '#1b3a8a' })), roughness: 0.5 })),
    ]);
    beam.position.set(0, 7.6, 0);
    beam.castShadow = true;
    gantry.add(beam);
    const lights = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(4.4, 1.1)),
      keep(new THREE.MeshStandardMaterial({
        map: keep(gantryLightsTexture(THREE)), emissive: 0xffffff, emissiveMap: keep(gantryLightsTexture(THREE)),
        emissiveIntensity: 1.6, roughness: 0.4,
      })),
    );
    lights.position.set(0, 6.25, -0.5);
    lights.rotation.y = Math.PI; // face approaching cars (they come from −tan)
    gantry.add(lights);
    placeAt(gantry, track, 0, 0, 0);
    // rotate gantry so its local X spans across the track: placeAt aligns local +Z with tan
    group.add(gantry);
  }

  // ---------------- grandstands with crowd
  const crowdDummy = new THREE.Object3D();
  const crowdList = [];
  const standSpots = [];
  for (let s = 12; s < 130; s += 26) standSpots.push({ s, side: 1, x: ROAD_HALF + 24 });
  // biggest corner gets a stand on the outside
  const bigCorners = [...A.corners].sort((a, b) => b.peak - a.peak).slice(0, 2);
  for (const c of bigCorners) {
    for (let k = 0; k < 3; k++) standSpots.push({ s: c.peakI - 26 + k * 26, side: -c.dir, x: ROAD_HALF + 30 });
  }
  {
    const steps = 7;
    const standW = 24;
    const stepD = 1.6;
    const stepH = 0.9;
    const standMat = keep(new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.8 }));
    const seatMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c6fc4, roughness: 0.6 }));
    const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
    const stepGeo = keep(new THREE.BoxGeometry(standW, stepH, stepD));
    const seatGeo = keep(new THREE.BoxGeometry(standW - 0.4, 0.25, 0.5));
    const roofGeo = keep(new THREE.BoxGeometry(standW + 1, 0.3, steps * stepD + 3));
    const postGeo = keep(new THREE.CylinderGeometry(0.18, 0.18, steps * stepH + 4.5, 8));
    for (const sp of standSpots) {
      const st = new THREE.Group();
      for (let k = 0; k < steps; k++) {
        const b = new THREE.Mesh(stepGeo, standMat);
        // local: +x across track (outward), stand faces the track (−x)
        b.position.set(0, stepH * (k + 0.5), 0);
        b.scale.set(1, (k + 1), 1);
        b.position.y = (stepH * (k + 1)) / 2;
        b.position.z = 0;
        b.position.x = 0;
        b.rotation.set(0, 0, 0);
        b.position.set(0, (stepH * (k + 1)) / 2, k * stepD);
        b.castShadow = true;
        b.receiveShadow = true;
        st.add(b);
        const seat = new THREE.Mesh(seatGeo, seatMat);
        seat.position.set(0, stepH * (k + 1) + 0.12, k * stepD - 0.3);
        st.add(seat);
        for (let c = 0; c < 26; c++) {
          if (r() < 0.18) continue;
          crowdList.push({ st, lx: -standW / 2 + 0.6 + c * ((standW - 1.2) / 25), ly: stepH * (k + 1) + 0.55, lz: k * stepD - 0.1, ph: r() * 6.28 });
        }
      }
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, steps * stepH + 4.4, (steps * stepD) / 2 - 1);
      roof.rotation.x = -0.08;
      roof.castShadow = true;
      st.add(roof);
      for (const x of [-standW / 2 + 0.5, standW / 2 - 0.5]) {
        const p = new THREE.Mesh(postGeo, steelMat);
        p.position.set(x, (steps * stepH + 4.5) / 2, steps * stepD - 0.5);
        st.add(p);
      }
      // place: stand's local +z points away from the track (rows go back), local x along the track
      const smp = S[((Math.round(sp.s) % N) + N) % N];
      st.position.set(
        smp.pos[0] + smp.nor[0] * sp.side * sp.x,
        terrainAt(smp, sp.side * sp.x),
        smp.pos[2] + smp.nor[2] * sp.side * sp.x,
      );
      // local +z → outward (nor * side)
      st.rotation.y = Math.atan2(smp.nor[0] * sp.side, smp.nor[2] * sp.side);
      group.add(st);
    }
  }
  function terrainAt(smp, x) {
    const ax = Math.abs(x);
    if (ax <= ROAD_HALF + 20) return smp.pos[1] - 0.22;
    return smp.pos[1] - 0.4;
  }
  let crowdMesh = null;
  if (crowdList.length) {
    const g = keep(new THREE.BoxGeometry(0.45, 0.75, 0.35));
    const m = keep(new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    crowdMesh = new THREE.InstancedMesh(g, m, crowdList.length);
    const palette = [0xe63946, 0xf1faee, 0x1d3557, 0xffb703, 0x2a9d8f, 0xf4a261, 0x8338ec, 0xff006e, 0x3a86ff, 0xffffff];
    const col = new THREE.Color();
    group.updateMatrixWorld(true);
    crowdList.forEach((cr, k) => {
      crowdDummy.position.set(cr.lx, cr.ly, cr.lz);
      crowdDummy.updateMatrix();
      cr.mat = new THREE.Matrix4().multiplyMatrices(cr.st.matrixWorld, crowdDummy.matrix);
      crowdMesh.setMatrixAt(k, cr.mat);
      crowdMesh.setColorAt(k, col.setHex(palette[(r() * palette.length) | 0]));
    });
    crowdMesh.instanceMatrix.needsUpdate = true;
    crowdMesh.castShadow = false;
    crowdMesh.receiveShadow = true;
    crowdMesh.name = 'crowd';
    group.add(crowdMesh);
  }

  // ---------------- guard rails (outside the run-off, everywhere except the pit wall side)
  {
    const parts = [];
    const postParts = [];
    const railX = ROAD_HALF + 21;
    const postGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    for (const side of [-1, 1]) {
      // skip ranges: pit (left side) and stands
      let s = 0;
      while (s < N) {
        const sEnd = Math.min(N, s + 120);
        const skip = (side === -1 && inPit(s)) || (side === -1 && inPit(sEnd - 1));
        if (!skip) {
          parts.push(wall(THREE, track, {
            s0: s, s1: sEnd, x: side * railX, h0: 0.45, h1: 0.85, step: 3, uLen: 4,
            yBase: (i, smp) => smp.pos[1] - 0.22,
          }));
          for (let q = s; q < sEnd; q += 4) {
            const o = new THREE.Object3D();
            placeAt(o, track, q, side * railX, 0.3);
            o.position.y = S[((Math.round(q) % N) + N) % N].pos[1] - 0.22 + 0.5;
            postParts.push(bakeGeo(THREE, postGeo, o));
          }
        }
        s = sEnd;
      }
    }
    postGeo.dispose();
    const railMesh = addMesh(mergeGeos(THREE, parts), steelMat, { cast: true, name: 'rails' });
    railMesh.material = keep(steelMat.clone());
    railMesh.material.side = THREE.DoubleSide;
    if (postParts.length) addMesh(mergeGeos(THREE, postParts), darkSteel, { cast: false, name: 'railposts' });
  }

  // ---------------- brake boards + billboards
  {
    const boardMats = { 150: null, 100: null, 50: null };
    for (const k of Object.keys(boardMats)) {
      boardMats[k] = keep(new THREE.MeshStandardMaterial({ map: keep(boardTexture(THREE, k)), roughness: 0.6 }));
    }
    const boardGeo = keep(new THREE.BoxGeometry(1.6, 1.2, 0.08));
    const poleGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6));
    for (const c of A.corners) {
      if (c.peak < 1 / 260) continue;
      const out = -c.dir;
      const xB = out * (ROAD_HALF + 4.5);
      for (const d of [150, 100, 50]) {
        const s = c.a - d;
        const b = new THREE.Group();
        const panel = new THREE.Mesh(boardGeo, [whitePaint, whitePaint, whitePaint, whitePaint, boardMats[d], whitePaint]);
        panel.position.y = 1.9;
        panel.castShadow = true;
        b.add(panel);
        const pole = new THREE.Mesh(poleGeo, darkSteel);
        pole.position.y = 0.7;
        b.add(pole);
        placeAt(b, track, s, xB, -0.15, { yaw: Math.PI }); // face oncoming cars
        group.add(b);
      }
    }
    const texts = [
      { t: 'BUUBUU', bg: '#c81e2d', accent: '#ffffff' },
      { t: 'RACE', bg: '#1b3a8a', accent: '#ffd23f' },
      { t: 'GO!', bg: '#15803d', accent: '#ffffff' },
      { t: 'BUUBUU', bg: '#111318', accent: '#e8344a' },
      { t: 'SPEED', bg: '#f59e0b', accent: '#111318', fg: '#111318' },
    ];
    const bbMats = texts.map((x) => keep(new THREE.MeshStandardMaterial({
      map: keep(textPanel(THREE, x.t, { bg: x.bg, accent: x.accent, fg: x.fg || '#ffffff' })), roughness: 0.55,
    })));
    const bbGeo = keep(new THREE.BoxGeometry(12, 3, 0.25));
    const bbPole = keep(new THREE.BoxGeometry(0.3, 4.5, 0.3));
    let k = 0;
    // billboards on straights (low curvature), every ~230 m, alternating sides
    for (let s = 200; s < N - 150; s += 230) {
      if (Math.abs(A.cs[s]) > 1 / 500) continue;
      const side = k % 2 ? 1 : -1;
      if (side === -1 && inPit(s)) continue;
      const bb = new THREE.Group();
      const m = bbMats[k % bbMats.length];
      const panel = new THREE.Mesh(bbGeo, [darkSteel, darkSteel, darkSteel, darkSteel, m, darkSteel]);
      panel.position.y = 4.4;
      panel.castShadow = true;
      bb.add(panel);
      for (const x of [-4.5, 4.5]) {
        const p = new THREE.Mesh(bbPole, darkSteel);
        p.position.set(x, 2.25, -0.2);
        bb.add(p);
      }
      // place 24 m out, angled 35° toward oncoming traffic
      placeAt(bb, track, s, side * (ROAD_HALF + 23), -0.25, { yaw: Math.PI - side * 0.6 });
      group.add(bb);
      k++;
    }
  }

  // ---------------- trees (instanced)
  {
    const want = quality >= 2 ? 1400 : quality >= 1 ? 900 : 500;
    const area = P.sea ? landR - 30 : A.rad + 900;
    const spots = [];
    let tries = 0;
    while (spots.length < want && tries < want * 12) {
      tries++;
      const ang = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * area;
      const x = A.cx + Math.cos(ang) * dist;
      const z = A.cz + Math.sin(ang) * dist;
      const nr = A.nearest(x, z);
      if (nr.d < ROAD_HALF + 32) continue;
      // terrain height: on the embankment near the track, else base ground
      const near = S[nr.i];
      const y = nr.d < ROAD_HALF + 85 ? lerp(near.pos[1] - 0.4, lerp(near.pos[1], groundY, 0.75), clamp((nr.d - ROAD_HALF - 20) / 65, 0, 1)) : groundY;
      // clusters: thin out randomly
      if (r() < 0.25) continue;
      spots.push({ x, y, z, s: 0.75 + r() * 0.7, rot: r() * 6.28 });
    }
    const dummy = new THREE.Object3D();
    const kinds = P.trees === 'coast'
      ? [
        { type: 'round', share: 0.5 },
        { type: 'palm', share: 0.5 },
      ]
      : [
        { type: 'conifer', share: 0.65 },
        { type: 'round', share: 0.35 },
      ];
    const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }));
    const leafMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    const palmLeafMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }));
    let cursor = 0;
    const col = new THREE.Color();
    for (const kd of kinds) {
      const n = Math.floor(spots.length * kd.share);
      const list = spots.slice(cursor, cursor + n);
      cursor += n;
      if (!list.length) continue;
      let trunkGeo;
      let crownGeo;
      let crownMat = leafMat;
      let crownY;
      let trunkY;
      let greens;
      if (kd.type === 'round') {
        trunkGeo = keep(new THREE.CylinderGeometry(0.25, 0.4, 4, 6));
        trunkY = 2;
        crownGeo = keep(new THREE.IcosahedronGeometry(3.2, 1));
        // lumpy crown
        const pa = crownGeo.attributes.position;
        for (let v = 0; v < pa.count; v++) {
          const k = 1 + 0.18 * Math.sin(pa.getX(v) * 1.7 + pa.getZ(v) * 2.3) + 0.1 * Math.cos(pa.getY(v) * 3.1);
          pa.setXYZ(v, pa.getX(v) * k, pa.getY(v) * k * 0.92, pa.getZ(v) * k);
        }
        crownGeo.computeVertexNormals();
        crownY = 5.6;
        greens = [0x3f7d2c, 0x4d8f35, 0x5a9a3a, 0x366e27, 0x6aa443];
      } else if (kd.type === 'conifer') {
        trunkGeo = keep(new THREE.CylinderGeometry(0.2, 0.35, 3, 6));
        trunkY = 1.5;
        const parts = [];
        for (let k = 0; k < 3; k++) {
          const cg = new THREE.ConeGeometry(2.8 - k * 0.7, 4.2 - k * 0.6, 9);
          cg.translate(0, 2.2 + k * 2.4, 0);
          parts.push(cg);
        }
        crownGeo = keep(mergeGeos(THREE, parts));
        crownGeo.computeVertexNormals();
        parts.forEach((p) => p.dispose());
        crownY = 1.6;
        greens = [0x24502b, 0x2d5e33, 0x1f4626, 0x356a3a];
      } else {
        // palm: tall curved trunk + drooping fronds
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 3, 0), new THREE.Vector3(0.9, 6, 0), new THREE.Vector3(1.6, 8.6, 0),
        ]);
        trunkGeo = keep(new THREE.TubeGeometry(curve, 10, 0.22, 6, false));
        trunkY = 0;
        const fronds = [];
        for (let k = 0; k < 7; k++) {
          const fg = new THREE.PlaneGeometry(5.2, 1.1, 6, 1);
          const pa = fg.attributes.position;
          for (let v = 0; v < pa.count; v++) {
            const x = pa.getX(v) + 2.6;
            pa.setXYZ(v, x, -0.09 * x * x, pa.getY(v) * (1 - x / 6));
          }
          fg.rotateY((k / 7) * Math.PI * 2);
          fg.translate(1.6, 8.6, 0);
          fronds.push(fg);
        }
        crownGeo = keep(mergeGeos(THREE, fronds));
        crownGeo.computeVertexNormals();
        fronds.forEach((p) => p.dispose());
        crownMat = palmLeafMat;
        crownY = 0;
        greens = [0x3f8a35, 0x4a9a3c, 0x367a2e];
      }
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
      list.forEach((sp, k) => {
        dummy.position.set(sp.x, sp.y + trunkY * sp.s, sp.z);
        dummy.rotation.set(0, sp.rot, 0);
        dummy.scale.setScalar(sp.s);
        dummy.updateMatrix();
        trunks.setMatrixAt(k, dummy.matrix);
        dummy.position.set(sp.x, sp.y + crownY * sp.s, sp.z);
        dummy.updateMatrix();
        crowns.setMatrixAt(k, dummy.matrix);
        crowns.setColorAt(k, col.setHex(greens[(r() * greens.length) | 0]).multiplyScalar(0.85 + r() * 0.3));
      });
      trunks.castShadow = true;
      crowns.castShadow = true;
      trunks.receiveShadow = true;
      crowns.receiveShadow = true;
      trunks.name = `trees-${kd.type}-trunk`;
      crowns.name = `trees-${kd.type}`;
      group.add(trunks, crowns);
    }
  }

  // ---------------- sky, sun, fog, environment
  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.frustumCulled = false;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - P.sunElev),
    THREE.MathUtils.degToRad(P.sunAzim),
  );
  const U = sky.material.uniforms;
  U.turbidity.value = P.turbidity;
  U.rayleigh.value = P.rayleigh;
  U.mieCoefficient.value = P.mie;
  U.mieDirectionalG.value = P.mieG;
  U.sunPosition.value.copy(sunDir);
  sky.name = 'sky';
  group.add(sky);
  keep(sky.geometry);
  keep(sky.material);

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality >= 2 ? 2048 : 1024, quality >= 2 ? 2048 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -70;
  sc.right = 70;
  sc.top = 70;
  sc.bottom = -70;
  sc.near = 10;
  sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun);
  group.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.55);
  group.add(hemi);

  const fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);
  let envRT = null;
  if (opts.scene) opts.scene.fog = fog;
  if (opts.renderer && opts.scene) {
    try {
      const pm = new THREE.PMREMGenerator(opts.renderer);
      const envScene = new THREE.Scene();
      const sky2 = new Sky();
      sky2.scale.setScalar(10000);
      const U2 = sky2.material.uniforms;
      for (const k of Object.keys(U)) if (U2[k] && U[k].value !== undefined) {
        if (U[k].value && U[k].value.isVector3) U2[k].value.copy(U[k].value);
        else U2[k].value = U[k].value;
      }
      if (U2.showSunDisc) U2.showSunDisc.value = false;
      envScene.add(sky2);
      // a dim ground disc so reflections show a horizon
      const gd = new THREE.Mesh(new THREE.CircleGeometry(5000, 16), new THREE.MeshBasicMaterial({ color: 0x3d4a35 }));
      gd.rotation.x = -Math.PI / 2;
      gd.position.y = -5;
      envScene.add(gd);
      envRT = pm.fromScene(envScene, 0.02, 0.1, 20000);
      opts.scene.environment = envRT.texture;
      if ('environmentIntensity' in opts.scene) opts.scene.environmentIntensity = 0.85;
      sky2.geometry.dispose();
      sky2.material.dispose();
      gd.geometry.dispose();
      gd.material.dispose();
      pm.dispose();
    } catch (e) {
      envRT = null;
    }
  }

  // ---------------- lens flare (sun)
  let flareHolder = null;
  if (opts.flare !== false && quality >= 1) {
    try {
      const tMain = keep(flareTexture(THREE, 'main'));
      const tRing = keep(flareTexture(THREE, 'ring'));
      const lf = new Lensflare();
      lf.addElement(new LensflareElement(tMain, 380, 0, new THREE.Color(0xffffff)));
      lf.addElement(new LensflareElement(tRing, 70, 0.55, new THREE.Color(0x99ccff)));
      lf.addElement(new LensflareElement(tRing, 110, 0.75, new THREE.Color(0xffe0aa)));
      lf.addElement(new LensflareElement(tRing, 50, 0.95, new THREE.Color(0xaaffcc)));
      flareHolder = new THREE.Object3D();
      flareHolder.add(lf);
      flareHolder.name = 'sunflare';
      group.add(flareHolder);
      keep(lf);
    } catch (e) {
      flareHolder = null;
    }
  }

  // ---------------- per-frame update
  let frame = 0;
  const tmp = new THREE.Vector3();
  function update(camPos, t = 0) {
    frame++;
    if (camPos) {
      sky.position.copy(camPos);
      // shadow box follows the camera's ground position
      tmp.set(camPos.x, camPos.y, camPos.z);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(sunDir, 320);
      sun.target.updateMatrixWorld();
      if (flareHolder) flareHolder.position.copy(camPos).addScaledVector(sunDir, 5000);
    }
    // crowd cheering (bob) when close, throttled
    if (crowdMesh && camPos && frame % 2 === 0) {
      const bb = crowdMesh.geometry.boundingSphere;
      void bb;
      let any = false;
      const m = new THREE.Matrix4();
      for (let k = 0; k < crowdList.length; k++) {
        const cr = crowdList[k];
        const e = cr.mat.elements;
        const dx = e[12] - camPos.x;
        const dz = e[14] - camPos.z;
        if (dx * dx + dz * dz > 220 * 220) continue;
        const hop = Math.max(0, Math.sin(t * 7 + cr.ph)) * 0.18;
        m.copy(cr.mat);
        m.elements[13] += hop;
        crowdMesh.setMatrixAt(k, m);
        any = true;
      }
      if (any) crowdMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setFlare(on) {
    if (flareHolder) flareHolder.visible = !!on;
  }

  function dispose() {
    for (const d of disposables) {
      try {
        if (d && typeof d.dispose === 'function') d.dispose();
      } catch (e) {
        /* ignore */
      }
    }
    if (envRT) envRT.dispose();
    if (opts.scene) {
      if (opts.scene.fog === fog) opts.scene.fog = null;
      if (envRT && opts.scene.environment === envRT.texture) opts.scene.environment = null;
    }
    group.removeFromParent();
  }

  // Batch everything static (road, kerbs, stands, boards, buildings…) into one mesh per material.
  // Sky, sea/islands (no uv → skipped automatically), instanced trees/crowd and the lens flare stay as they are.
  for (const g of staticBatch(THREE, group)) disposables.push(g);
  group.updateMatrixWorld(true);
  return {
    group,
    sun,
    hemi,
    sky,
    fog,
    sunDir,
    exposure: P.exposure,
    corners: A.corners.map((c) => ({ s: c.peakI, dir: c.dir, severity: c.peak })),
    groundY,
    update,
    setFlare,
    dispose,
  };
}
