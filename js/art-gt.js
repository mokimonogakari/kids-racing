// Circuit-mode art: original, realistic-leaning sports cars and circuit dressing.
// No imports on purpose. No real makes, models, logos or sponsors.
//
// drawSportsCar(c, model, view, color, number, opts) draws into a box of CAR_BOX[view]
// (origin top-left, ground at the bottom). Callers scale/cache as they like.

const TAU = Math.PI * 2;

export const CAR_MODELS = [
  { id: 'gt', label: 'クーペ', stats: { speed: 5, accel: 3, grip: 4 } },
  { id: 'proto', label: 'プロトタイプ', stats: { speed: 4, accel: 4, grip: 5 } },
  { id: 'hatch', label: 'ハッチバック', stats: { speed: 3, accel: 5, grip: 3 } },
];

export const CAR_COLORS = [
  { id: 'red', label: 'あか', hex: '#d3172b' },
  { id: 'blue', label: 'あお', hex: '#1f5fd1' },
  { id: 'white', label: 'しろ', hex: '#eef1f4' },
  { id: 'black', label: 'くろ', hex: '#24262b' },
  { id: 'yellow', label: 'きいろ', hex: '#f2bf10' },
  { id: 'green', label: 'みどり', hex: '#1d8a4e' },
  { id: 'orange', label: 'オレンジ', hex: '#f0661b' },
  { id: 'silver', label: 'ぎん', hex: '#a9b0b9' },
];

export const CAR_BOX = { rear: [200, 130], front34: [230, 130], side: [260, 100] };

// ---------------------------------------------------------------- color helpers
function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
/** amt < 0 darkens toward black, > 0 lightens toward white. */
export function shade(hex, amt) {
  const c = rgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return toHex(c.map((v) => v + (t - v) * k));
}
function lum(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function colorHex(color) {
  if (!color) return CAR_COLORS[0].hex;
  if (color[0] === '#') return color;
  const f = CAR_COLORS.find((x) => x.id === color);
  return f ? f.hex : CAR_COLORS[0].hex;
}

// ---------------------------------------------------------------- path helpers
function poly(c, pts) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}
/** Smooth closed path through points (quadratic midpoints). */
function smooth(c, pts) {
  const n = pts.length / 2;
  c.beginPath();
  const mx = (i) => (pts[(2 * i) % pts.length] + pts[(2 * (i + 1)) % pts.length]) / 2;
  const my = (i) => (pts[(2 * i + 1) % pts.length] + pts[(2 * (i + 1) + 1) % pts.length]) / 2;
  c.moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) c.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx(i), my(i));
  c.closePath();
}
function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function vgrad(c, y0, y1, stops) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function hgrad(c, x0, x1, stops) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

/** Car paint: deep base + sky reflection on top + horizon line + dark lower body. */
function paint(c, base, y0, y1) {
  const metallic = lum(base);
  return vgrad(c, y0, y1, [
    [0, shade(base, 0.45)],
    [0.18, shade(base, 0.12)],
    [0.42, base],
    [0.47, shade(base, metallic > 0.8 ? -0.25 : -0.35)], // horizon reflection line
    [0.52, shade(base, 0.05)],
    [0.8, shade(base, -0.28)],
    [1, shade(base, -0.55)],
  ]);
}
function glass(c, y0, y1) {
  return vgrad(c, y0, y1, [
    [0, '#9fb9cf'],
    [0.35, '#3f5a72'],
    [0.6, '#1a2633'],
    [1, '#0b1118'],
  ]);
}
function stripeColor(base) {
  return lum(base) > 0.62 ? '#1d2128' : '#f4f6f8';
}

/** Specular streak clipped to the current path. */
function streak(c, x0, y0, x1, y1, w, alpha = 0.35) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = '#ffffff';
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- wheels
function sideWheel(c, x, y, r, rimColor = '#c9ced6', caliper = '#d0142a') {
  // arch shadow
  c.beginPath();
  c.arc(x, y, r * 1.14, 0, TAU);
  c.fillStyle = '#0c0d10';
  c.fill();
  // tire
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = '#1b1c20';
  c.fill();
  c.beginPath();
  c.arc(x, y, r * 0.96, -2.4, -0.7);
  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = r * 0.08;
  c.stroke();
  // disc + caliper
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, TAU);
  c.fillStyle = '#4a4e55';
  c.fill();
  c.save();
  c.translate(x, y);
  c.rotate(-0.6);
  rrect(c, r * 0.32, -r * 0.18, r * 0.2, r * 0.36, r * 0.06);
  c.fillStyle = caliper;
  c.fill();
  c.restore();
  // rim
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 0.7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, rimColor);
  g.addColorStop(1, shade(rimColor, -0.45));
  c.lineWidth = r * 0.1;
  c.strokeStyle = g;
  c.beginPath();
  c.arc(x, y, r * 0.66, 0, TAU);
  c.stroke();
  c.lineWidth = r * 0.12;
  c.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.14, y + Math.sin(a) * r * 0.14);
    c.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
    c.stroke();
  }
  c.beginPath();
  c.arc(x, y, r * 0.15, 0, TAU);
  c.fillStyle = shade(rimColor, -0.3);
  c.fill();
  c.beginPath();
  c.arc(x - r * 0.04, y - r * 0.05, r * 0.06, 0, TAU);
  c.fillStyle = '#fff';
  c.fill();
}
/** Tire seen from behind/front: a rounded block with tread and sidewall sheen. */
function endTire(c, x, y, w, h) {
  rrect(c, x, y, w, h, w * 0.28);
  c.fillStyle = vgrad(c, y, y + h, [[0, '#2a2c31'], [0.5, '#16171a'], [1, '#0b0b0d']]);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.lineWidth = 1.2;
  for (let i = 1; i < 6; i++) {
    c.beginPath();
    c.moveTo(x + 3, y + (h * i) / 6);
    c.lineTo(x + w - 3, y + (h * i) / 6);
    c.stroke();
  }
  rrect(c, x + w * 0.12, y + 2, w * 0.18, h - 4, 3);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fill();
}
function groundShadow(c, cx, y, rx, ry) {
  const g = c.createRadialGradient(cx, y, 0, cx, y, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.translate(cx, y);
  c.scale(1, ry / rx);
  c.translate(-cx, -y);
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, y, rx, 0, TAU);
  c.fill();
  c.restore();
}

function numberPlate(c, x, y, w, h, number, dark = false) {
  rrect(c, x, y, w, h, h * 0.25);
  c.fillStyle = dark ? '#16181c' : '#f6f7f9';
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.stroke();
  c.fillStyle = dark ? '#f6f7f9' : '#111316';
  c.font = `900 ${Math.round(h * 0.82)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(number), x + w / 2, y + h / 2 + h * 0.05);
}

// ---------------------------------------------------------------- REAR VIEW (200x130)
const REAR = {
  gt: { body: [10, 190], top: 58, roof: 24, roofW: 74, baseW: 120, wing: 'duck', tire: 30 },
  proto: { body: [6, 194], top: 64, roof: 40, roofW: 52, baseW: 92, wing: 'big', tire: 32 },
  hatch: { body: [18, 182], top: 54, roof: 14, roofW: 108, baseW: 136, wing: 'roof', tire: 26 },
};

function drawRear(c, model, base, number, opts) {
  const m = REAR[model] || REAR.gt;
  const [L, R] = m.body;
  const cx = 100;
  const ground = 126;
  groundShadow(c, cx, ground - 2, 96, 9);
  // tires
  const tw = m.tire;
  endTire(c, L + 4, 92, tw, ground - 92);
  endTire(c, R - 4 - tw, 92, tw, ground - 92);

  // cabin (behind body)
  const rb = (m.baseW / 2);
  const rt = (m.roofW / 2);
  const cab = [cx - rb, m.top + 4, cx - rt, m.roof + 6, cx - rt + 6, m.roof, cx + rt - 6, m.roof, cx + rt, m.roof + 6, cx + rb, m.top + 4];
  smooth(c, cab);
  c.fillStyle = paint(c, base, m.roof, m.top + 8);
  c.fill();
  // rear window
  const gi = 7;
  const win = [cx - rb + gi + 4, m.top + 2, cx - rt + gi, m.roof + gi + 2, cx + rt - gi, m.roof + gi + 2, cx + rb - gi - 4, m.top + 2];
  smooth(c, win);
  c.fillStyle = glass(c, m.roof, m.top);
  c.fill();
  c.save();
  smooth(c, win);
  c.clip();
  streak(c, cx - rt, m.top, cx - rt + 26, m.roof, 7, 0.22);
  streak(c, cx - rt + 18, m.top, cx - rt + 40, m.roof, 3, 0.18);
  // driver helmet silhouette
  c.beginPath();
  c.arc(cx - 14, m.top - 6, 11, Math.PI, 0);
  c.fillStyle = 'rgba(10,12,16,0.55)';
  c.fill();
  c.restore();

  // lower body
  const bodyTop = m.top;
  const body = [L + 6, ground - 20, L, bodyTop + 22, L + 8, bodyTop + 4, cx, bodyTop - 3, R - 8, bodyTop + 4, R, bodyTop + 22, R - 6, ground - 20, cx, ground - 16];
  smooth(c, body);
  c.fillStyle = paint(c, base, bodyTop - 4, ground - 16);
  c.fill();
  c.save();
  smooth(c, body);
  c.clip();
  // racing stripes
  if (opts.stripe !== false) {
    c.fillStyle = stripeColor(base);
    c.globalAlpha = 0.9;
    c.fillRect(cx - 18, bodyTop - 10, 12, 80);
    c.fillRect(cx + 6, bodyTop - 10, 12, 80);
    c.globalAlpha = 1;
  }
  // top highlight
  streak(c, L + 20, bodyTop + 4, R - 20, bodyTop + 4, 3, 0.45);
  // side shading (curvature)
  c.fillStyle = hgrad(c, L, R, [[0, 'rgba(0,0,0,0.35)'], [0.12, 'rgba(0,0,0,0)'], [0.88, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
  c.fillRect(L, bodyTop - 10, R - L, 90);
  c.restore();
  // panel line
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(L + 16, bodyTop + 30);
  c.lineTo(R - 16, bodyTop + 30);
  c.stroke();

  // tail light bar
  const ty = bodyTop + 12;
  const lit = opts.brake ? 1 : 0;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? L + 10 : cx + 26;
    const w = cx - 26 - (L + 10);
    rrect(c, x0, ty, w, 9, 4);
    c.fillStyle = '#2a0508';
    c.fill();
    rrect(c, x0 + 2, ty + 2, w - 4, 5, 3);
    c.fillStyle = lit ? '#ff3b3b' : '#a3121b';
    c.fill();
    if (lit) {
      c.save();
      c.globalAlpha = 0.45;
      rrect(c, x0 - 4, ty - 4, w + 8, 17, 8);
      c.fillStyle = '#ff2a2a';
      c.fill();
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(x0 + 4, ty + 2, w - 8, 1);
  }
  // center brake light
  rrect(c, cx - 14, ty + 3, 28, 4, 2);
  c.fillStyle = lit ? '#ff5050' : '#5a0d12';
  c.fill();

  // diffuser
  const dy = ground - 30;
  rrect(c, L + 22, dy, R - L - 44, 16, 4);
  c.fillStyle = vgrad(c, dy, dy + 16, [[0, '#2b2e34'], [1, '#08090b']]);
  c.fill();
  c.strokeStyle = '#3f434a';
  c.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const x = L + 22 + ((R - L - 44) * i) / 6;
    c.beginPath();
    c.moveTo(x, dy + 2);
    c.lineTo(x, dy + 15);
    c.stroke();
  }
  // exhausts
  for (const ex of model === 'hatch' ? [cx + 44] : [cx - 30, cx + 30]) {
    c.beginPath();
    c.ellipse(ex, dy + 5, 7, 5, 0, 0, TAU);
    c.fillStyle = hgrad(c, ex - 7, ex + 7, [[0, '#7c8188'], [0.5, '#e4e7eb'], [1, '#6a6f76']]);
    c.fill();
    c.beginPath();
    c.ellipse(ex, dy + 5, 4.5, 3, 0, 0, TAU);
    c.fillStyle = '#050505';
    c.fill();
  }
  // number plate on bumper
  numberPlate(c, cx - 20, bodyTop + 30, 40, 13, number);

  // wings
  if (m.wing === 'big') {
    c.fillStyle = '#1a1c20';
    c.fillRect(cx - 40, m.roof - 6, 5, bodyTop - m.roof + 8);
    c.fillRect(cx + 35, m.roof - 6, 5, bodyTop - m.roof + 8);
    rrect(c, 4, m.roof - 18, 192, 12, 3);
    c.fillStyle = vgrad(c, m.roof - 18, m.roof - 6, [[0, shade(base, 0.3)], [1, shade(base, -0.4)]]);
    c.fill();
    rrect(c, 2, m.roof - 24, 8, 26, 2);
    rrect(c, 190, m.roof - 24, 8, 26, 2);
    c.fillStyle = '#16181c';
    c.fill();
    c.beginPath();
    rrect(c, 2, m.roof - 24, 8, 26, 2);
    c.fill();
    numberPlate(c, cx - 12, m.roof - 17, 24, 10, number, true);
  } else if (m.wing === 'duck') {
    c.beginPath();
    c.moveTo(L + 18, bodyTop + 1);
    c.quadraticCurveTo(cx, bodyTop - 10, R - 18, bodyTop + 1);
    c.lineTo(R - 18, bodyTop + 4);
    c.quadraticCurveTo(cx, bodyTop - 5, L + 18, bodyTop + 4);
    c.closePath();
    c.fillStyle = '#16181c';
    c.fill();
  } else if (m.wing === 'roof') {
    rrect(c, cx - rt - 4, m.roof - 6, m.roofW + 8, 8, 3);
    c.fillStyle = shade(base, -0.35);
    c.fill();
  }
  // outline
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  smooth(c, body);
  c.stroke();
}

// ---------------------------------------------------------------- SIDE VIEW (260x100)
const SIDE = {
  gt: {
    body: [8, 80, 10, 54, 40, 47, 92, 30, 142, 28, 178, 46, 236, 54, 254, 64, 252, 82, 214, 86, 46, 86],
    win: [64, 47, 96, 33, 140, 31, 168, 47],
    wheels: [[56, 76, 19], [206, 76, 19]],
    wing: 'duck',
  },
  proto: {
    body: [6, 78, 8, 52, 60, 46, 104, 30, 138, 30, 164, 48, 238, 58, 256, 70, 252, 84, 210, 88, 46, 88],
    win: [110, 34, 136, 34, 156, 48, 104, 46],
    wheels: [[54, 76, 20], [208, 76, 20]],
    wing: 'big',
  },
  hatch: {
    body: [14, 82, 12, 44, 22, 22, 132, 20, 172, 44, 226, 52, 248, 62, 246, 82, 210, 86, 50, 86],
    win: [30, 44, 34, 26, 128, 25, 162, 45],
    wheels: [[58, 76, 17], [206, 76, 17]],
    wing: 'roof',
  },
};

function drawSide(c, model, base, number, opts) {
  const m = SIDE[model] || SIDE.gt;
  groundShadow(c, 131, 96, 124, 5);
  // big wing behind body
  if (m.wing === 'big') {
    c.fillStyle = '#1a1c20';
    c.fillRect(22, 26, 5, 24);
    rrect(c, 2, 20, 40, 8, 3);
    c.fillStyle = shade(base, -0.3);
    c.fill();
  }
  smooth(c, m.body);
  c.fillStyle = paint(c, base, 20, 90);
  c.fill();
  c.save();
  smooth(c, m.body);
  c.clip();
  if (opts.stripe !== false) {
    c.fillStyle = stripeColor(base);
    c.globalAlpha = 0.9;
    c.fillRect(0, 62, 260, 5);
    c.globalAlpha = 1;
  }
  // rocker panel shadow & door line
  c.fillStyle = vgrad(c, 70, 90, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.55)']]);
  c.fillRect(0, 70, 260, 20);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(100, 48);
  c.lineTo(100, 82);
  c.moveTo(160, 50);
  c.lineTo(162, 82);
  c.stroke();
  // long specular line along the shoulder
  streak(c, 30, 52, 230, 57, 2.5, 0.55);
  c.restore();
  // window
  smooth(c, m.win);
  c.fillStyle = glass(c, 25, 48);
  c.fill();
  c.save();
  smooth(c, m.win);
  c.clip();
  streak(c, m.win[0] + 20, m.win[1], m.win[0] + 40, m.win[3], 6, 0.25);
  c.restore();
  // lights
  const nose = m.body[14] ?? 236;
  rrect(c, 240, 58, 12, 5, 2);
  c.fillStyle = '#f3f6ff';
  c.fill();
  rrect(c, 8, 56, 10, 6, 2);
  c.fillStyle = opts.brake ? '#ff3b3b' : '#b3141d';
  c.fill();
  void nose;
  // mirror
  rrect(c, model === 'hatch' ? 160 : 166, model === 'hatch' ? 42 : 44, 10, 6, 2);
  c.fillStyle = shade(base, -0.2);
  c.fill();
  // number roundel on the door
  c.beginPath();
  c.arc(130, 66, 11, 0, TAU);
  c.fillStyle = '#f6f7f9';
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.stroke();
  c.fillStyle = '#111316';
  c.font = '900 13px system-ui, Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (opts.mirrored) {
    c.save();
    c.translate(130, 67);
    c.scale(-1, 1);
    c.fillText(String(number), 0, 0);
    c.restore();
  } else c.fillText(String(number), 130, 67);
  // wheels
  for (const [x, y, r] of m.wheels) sideWheel(c, x, y, r);
  if (m.wing === 'duck') {
    poly(c, [8, 54, 4, 49, 26, 48, 30, 52]);
    c.fillStyle = '#16181c';
    c.fill();
  } else if (m.wing === 'roof') {
    poly(c, [16, 22, 12, 18, 40, 17, 42, 21]);
    c.fillStyle = shade(base, -0.35);
    c.fill();
  }
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  smooth(c, m.body);
  c.stroke();
}

// ---------------------------------------------------------------- FRONT 3/4 VIEW (230x130)
const FRONT = {
  gt: { top: 64, roof: 30, roofW: 62, baseW: 112, grille: 'wide' },
  proto: { top: 70, roof: 44, roofW: 44, baseW: 84, grille: 'low' },
  hatch: { top: 60, roof: 20, roofW: 100, baseW: 128, grille: 'hex' },
};

function drawFront34(c, model, base, number, opts) {
  const f = FRONT[model] || FRONT.gt;
  // side of the car receding to the right: mirrored side profile so the nose meets the front face
  c.save();
  c.translate(228, 31);
  c.scale(-0.6, 0.95);
  drawSide(c, model, base, number, { ...opts, mirrored: true });
  c.restore();
  // front face, slightly narrowed and tilted for a 3/4 look
  c.save();
  c.transform(0.5, -0.02, 0, 0.64, 26, 46);
  drawFrontFace(c, f, base, number, opts);
  c.restore();
}

function drawFrontFace(c, f, base, number, opts) {
  const cx = 70;
  const ground = 126;
  endTire(c, 12, 94, 24, ground - 94);
  endTire(c, 108, 96, 22, ground - 98);
  const rb = f.baseW / 2;
  const rt = f.roofW / 2;
  // windscreen seen at an angle (the roof itself comes from the side profile)
  const ws = [cx - rb + 18, f.top + 1, cx - rt + 4, f.top - 20, cx + rt + 22, f.top - 23, cx + rb + 10, f.top - 2];
  smooth(c, ws);
  c.fillStyle = shade(base, -0.45);
  c.fill();
  const wsi = [cx - rb + 24, f.top, cx - rt + 8, f.top - 16, cx + rt + 18, f.top - 19, cx + rb + 4, f.top - 3];
  smooth(c, wsi);
  c.fillStyle = glass(c, f.top - 20, f.top);
  c.fill();
  c.save();
  smooth(c, wsi);
  c.clip();
  streak(c, cx - 6, f.top, cx + 14, f.top - 22, 7, 0.3);
  c.restore();
  // hood + bumper (nose)
  const nose = [8, ground - 20, 6, f.top + 22, 22, f.top + 2, cx + rb + 14, f.top - 2, 138, f.top + 18, 134, ground - 22, cx, ground - 16];
  smooth(c, nose);
  c.fillStyle = paint(c, base, f.top - 4, ground - 16);
  c.fill();
  c.save();
  smooth(c, nose);
  c.clip();
  if (opts.stripe !== false) {
    c.fillStyle = stripeColor(base);
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(cx - 14, f.top - 4);
    c.lineTo(cx - 2, f.top - 4);
    c.lineTo(cx - 4, ground);
    c.lineTo(cx - 20, ground);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(cx + 4, f.top - 4);
    c.lineTo(cx + 16, f.top - 4);
    c.lineTo(cx + 18, ground);
    c.lineTo(cx + 2, ground);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
  }
  streak(c, 20, f.top + 6, 128, f.top + 2, 3, 0.5);
  c.fillStyle = hgrad(c, 0, 140, [[0, 'rgba(0,0,0,0.3)'], [0.15, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
  c.fillRect(0, f.top - 10, 140, 80);
  c.restore();
  // headlights
  for (const [x, w] of [[16, 30], [100, 28]]) {
    const y = f.top + 12;
    rrect(c, x, y, w, 9, 4);
    c.fillStyle = '#20252c';
    c.fill();
    rrect(c, x + 2, y + 2, w - 4, 5, 3);
    c.fillStyle = vgrad(c, y, y + 9, [[0, '#ffffff'], [1, '#c9dcf2']]);
    c.fill();
  }
  // grille / intake
  const gy = ground - 36;
  if (f.grille === 'hex') {
    rrect(c, 40, gy, 62, 16, 5);
  } else if (f.grille === 'low') {
    rrect(c, 24, gy + 6, 96, 12, 5);
  } else {
    rrect(c, 32, gy + 2, 78, 14, 6);
  }
  c.fillStyle = vgrad(c, gy, gy + 18, [[0, '#2a2d33'], [1, '#07080a']]);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.08)';
  c.lineWidth = 1;
  for (let x = 30; x < 118; x += 6) {
    c.beginPath();
    c.moveTo(x, gy + 3);
    c.lineTo(x + 3, gy + 17);
    c.stroke();
  }
  // splitter
  rrect(c, 10, ground - 20, 124, 4, 2);
  c.fillStyle = '#121418';
  c.fill();
  numberPlate(c, cx - 15, f.top + 26, 30, 11, number);
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  smooth(c, nose);
  c.stroke();
}

/**
 * Draw one sports car.
 * @param {CanvasRenderingContext2D} c
 * @param {'gt'|'proto'|'hatch'} model
 * @param {'rear'|'front34'|'side'} view
 * @param {string} color CAR_COLORS id or '#hex'
 * @param {number|string} number race number
 * @param {{brake?:boolean, stripe?:boolean}} [opts]
 */
export function drawSportsCar(c, model, view, color, number = 7, opts = {}) {
  const base = colorHex(color);
  c.save();
  c.lineJoin = 'round';
  try {
    if (view === 'side') drawSide(c, model, base, number, opts);
    else if (view === 'front34') drawFront34(c, model, base, number, opts);
    else drawRear(c, model, base, number, opts);
  } finally {
    c.restore();
  }
}

// ---------------------------------------------------------------- circuit dressing sprites
function drawPitwall(c) {
  // concrete wall with debris fence and white/blue band
  c.fillStyle = vgrad(c, 0, 90, [[0, '#cfd3d8'], [1, '#8f959c']]);
  c.fillRect(0, 50, 220, 40);
  c.fillStyle = '#1f5fd1';
  c.fillRect(0, 58, 220, 8);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 66, 220, 3);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 1;
  for (let x = 0; x <= 220; x += 44) {
    c.beginPath();
    c.moveTo(x, 50);
    c.lineTo(x, 90);
    c.stroke();
  }
  // fence
  c.strokeStyle = '#5f656c';
  c.lineWidth = 2;
  for (let x = 4; x <= 216; x += 36) {
    c.beginPath();
    c.moveTo(x, 50);
    c.lineTo(x, 4);
    c.stroke();
  }
  c.save();
  c.beginPath();
  c.rect(0, 4, 220, 46);
  c.clip();
  c.strokeStyle = 'rgba(80,86,94,0.55)';
  c.lineWidth = 0.8;
  for (let x = -40; x < 220; x += 8) {
    c.beginPath();
    c.moveTo(x, 50);
    c.lineTo(x + 46, 4);
    c.moveTo(x + 46, 50);
    c.lineTo(x, 4);
    c.stroke();
  }
  c.restore();
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(0, 86, 220, 4);
}
function drawGantry(c) {
  const W = 360;
  c.fillStyle = vgrad(c, 0, 200, [[0, '#d9dde2'], [1, '#9aa1a9']]);
  c.fillRect(8, 30, 18, 170);
  c.fillRect(W - 26, 30, 18, 170);
  rrect(c, 0, 18, W, 44, 6);
  c.fillStyle = vgrad(c, 18, 62, [[0, '#2b2f36'], [1, '#121418']]);
  c.fill();
  // start lights
  for (let i = 0; i < 5; i++) {
    const x = W / 2 - 100 + i * 50;
    rrect(c, x - 16, 24, 32, 32, 6);
    c.fillStyle = '#060708';
    c.fill();
    c.beginPath();
    c.arc(x, 40, 10, 0, TAU);
    c.fillStyle = '#3a0a0e';
    c.fill();
  }
  // checker band
  for (let i = 0; i < W / 10; i++) {
    c.fillStyle = i % 2 ? '#ffffff' : '#111111';
    c.fillRect(i * 10, 62, 10, 5);
    c.fillStyle = i % 2 ? '#111111' : '#ffffff';
    c.fillRect(i * 10, 67, 10, 5);
  }
}
function drawBoard(c, label) {
  c.fillStyle = '#5c636b';
  c.fillRect(30, 70, 6, 60);
  c.fillRect(64, 70, 6, 60);
  rrect(c, 8, 8, 84, 70, 4);
  c.fillStyle = '#f7f8fa';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#1b1d22';
  c.stroke();
  c.fillStyle = '#111316';
  c.font = `900 ${label.length > 2 ? 34 : 40}px system-ui, Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 50, 44);
}
function drawGravel(c) {
  c.beginPath();
  c.ellipse(120, 20, 118, 18, 0, 0, TAU);
  c.fillStyle = '#c9b48a';
  c.fill();
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) {
    const a = rnd() * TAU;
    const r = Math.sqrt(rnd());
    const x = 120 + Math.cos(a) * 112 * r;
    const y = 20 + Math.sin(a) * 16 * r;
    c.fillStyle = rnd() > 0.5 ? '#a8946c' : '#e3d3ae';
    c.fillRect(x, y, 2, 1.5);
  }
}
function drawMarshal(c, frame) {
  // orange-suited flag marshal on a small post
  c.fillStyle = '#6d737a';
  c.fillRect(10, 96, 60, 34);
  c.fillStyle = '#f07a1a';
  rrect(c, 28, 52, 24, 46, 8);
  c.fill();
  c.fillStyle = '#e8c6a6';
  c.beginPath();
  c.arc(40, 42, 10, 0, TAU);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(40, 38, 11, Math.PI, 0);
  c.fill();
  // flag (green / blue alternating)
  const ang = frame ? -0.5 : -1.1;
  c.save();
  c.translate(50, 58);
  c.rotate(ang);
  c.fillStyle = '#3d4248';
  c.fillRect(0, -2, 34, 3);
  c.fillStyle = frame ? '#1f5fd1' : '#1d9a4e';
  c.fillRect(20, 0, 22, 16);
  c.restore();
}
function drawBillboard(c, text) {
  c.fillStyle = '#5c636b';
  c.fillRect(30, 80, 8, 50);
  c.fillRect(242, 80, 8, 50);
  rrect(c, 0, 4, 280, 82, 4);
  c.fillStyle = vgrad(c, 4, 86, [[0, '#1b2f73'], [1, '#0d1840']]);
  c.fill();
  c.fillStyle = '#ffd21a';
  c.fillRect(0, 70, 280, 6);
  c.fillStyle = '#ffffff';
  c.font = 'italic 900 42px system-ui, Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 140, 40);
}

export const GT_SPRITES = {
  pitwall: { box: [220, 90], world: 2.4, draw: (c) => drawPitwall(c) },
  gantry: { box: [360, 200], world: 4.2, draw: (c) => drawGantry(c) },
  board100: { box: [100, 130], world: 0.8, draw: (c) => drawBoard(c, '100') },
  board50: { box: [100, 130], world: 0.8, draw: (c) => drawBoard(c, '50') },
  gravel: { box: [240, 40], world: 2.2, draw: (c) => drawGravel(c) },
  marshal: { box: [80, 130], world: 0.7, frames: 2, draw: (c, f) => drawMarshal(c, f ? 1 : 0) },
  billboard: { box: [280, 130], world: 3.0, draw: (c) => drawBillboard(c, 'BUUBUU') },
  billboard2: { box: [280, 130], world: 3.0, draw: (c) => drawBillboard(c, 'RACE') },
};
