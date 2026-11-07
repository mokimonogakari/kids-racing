// Race-track dressing sprites (curve boards, grandstands, cones, tyre walls, flag marshal).
// Same shape as the SCENERY entries in art.js: { box:[w,h], world, frames?, draw(c, frame) }.
// No imports on purpose (art.js merges these into its sprite table).

const OUT = '#3d2c3e';
const TAU = Math.PI * 2;

// ---------- small helpers (copied from art.js so this file stays import-free) ----------
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
function fs(c, fill, lw = 3, stroke = OUT) {
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (lw) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke();
  }
}
function circ(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}
function ell(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function line(c, pts, lw = 3, color = OUT) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}
function shadow(c, x, y, rx, ry) {
  ell(c, x, y, rx, ry);
  c.fillStyle = 'rgba(40,30,60,0.18)';
  c.fill();
}
function dotEye(c, x, y, r) {
  circ(c, x, y, r);
  c.fillStyle = '#2b1f33';
  c.fill();
  circ(c, x - r * 0.35, y - r * 0.35, r * 0.38);
  c.fillStyle = '#fff';
  c.fill();
}
function smileLine(c, x, y, w, lw = 2.5) {
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(x, y + w * 0.6, x + w / 2, y);
  c.lineWidth = lw;
  c.strokeStyle = '#2b1f33';
  c.lineCap = 'round';
  c.stroke();
}
function cheek(c, x, y, r) {
  ell(c, x, y, r, r * 0.7);
  c.fillStyle = 'rgba(255,110,150,0.55)';
  c.fill();
}

// Deterministic "random" for crowd colours / positions (no Math.random: sprites are cached).
function hashf(i, j = 0) {
  const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// ---------- curve warning boards ----------
function drawSign(c, dir) {
  // dir = -1: arrows point left, +1: arrows point right. Box 120x150.
  shadow(c, 60, 146, 40, 5);
  // posts
  for (const x of [26, 94]) {
    rrect(c, x - 6, 70, 12, 76, 4);
    fs(c, '#ffffff');
  }
  // board
  rrect(c, 6, 14, 108, 64, 10);
  fs(c, '#ffd23f', 3.5);
  // three black chevrons
  const cw = 24;
  const h = 22;
  const cy = 46;
  for (let k = 0; k < 3; k++) {
    const cx = 26 + k * 34;
    c.beginPath();
    if (dir > 0) {
      c.moveTo(cx - cw * 0.5, cy - h);
      c.lineTo(cx + cw * 0.5, cy);
      c.lineTo(cx - cw * 0.5, cy + h);
      c.lineTo(cx - cw * 0.5 + 9, cy + h);
      c.lineTo(cx + cw * 0.5 + 9, cy);
      c.lineTo(cx - cw * 0.5 + 9, cy - h);
    } else {
      c.moveTo(cx + cw * 0.5, cy - h);
      c.lineTo(cx - cw * 0.5, cy);
      c.lineTo(cx + cw * 0.5, cy + h);
      c.lineTo(cx + cw * 0.5 - 9, cy + h);
      c.lineTo(cx - cw * 0.5 - 9, cy);
      c.lineTo(cx + cw * 0.5 - 9, cy - h);
    }
    c.closePath();
    c.fillStyle = '#2b2430';
    c.fill();
  }
  // little shine on the board
  rrect(c, 12, 19, 30, 6, 3);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fill();
}

// ---------- grandstand ----------
function drawGrandstand(c, f) {
  // Box 320x170. Three tiers of seats with a colourful crowd and a roof.
  shadow(c, 160, 166, 150, 5);
  // back wall / structure
  rrect(c, 14, 46, 292, 118, 10);
  fs(c, '#dfe6f2');
  // tiers (back to front, each a step lower / closer)
  const tiers = [
    { y: 58, h: 30, col: '#8fb7ff' },
    { y: 90, h: 30, col: '#7ea9f5' },
    { y: 122, h: 34, col: '#6f9ceb' },
  ];
  tiers.forEach((tr, ti) => {
    rrect(c, 20, tr.y, 280, tr.h, 6);
    fs(c, tr.col, 2.5);
  });
  // crowd: heads + bodies on each tier
  const cols = ['#ff5a6e', '#ffd23f', '#5cc75c', '#4aa8ff', '#a77bff', '#ff9f1c', '#ff8fb1', '#5ce1e6'];
  const skins = ['#ffd9b3', '#f3c39a', '#e9b184', '#ffe2c6'];
  tiers.forEach((tr, ti) => {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x = 34 + i * 25 + (ti % 2 ? 12 : 0);
      if (x > 290) continue;
      const by = tr.y + tr.h - 2; // feet line
      const col = cols[Math.floor(hashf(i, ti) * cols.length)];
      const skin = skins[Math.floor(hashf(i + 7, ti) * skins.length)];
      const up = f && (i + ti) % 2 === 0; // half the crowd waves on frame 1
      // arms
      if (up) {
        line(c, [x - 7, by - 16, x - 15, by - 40], 5, OUT);
        line(c, [x - 7, by - 16, x - 15, by - 40], 2.6, col);
        line(c, [x + 7, by - 16, x + 15, by - 40], 5, OUT);
        line(c, [x + 7, by - 16, x + 15, by - 40], 2.6, col);
        circ(c, x - 15, by - 41, 3.4);
        fs(c, skin, 1.5);
        circ(c, x + 15, by - 41, 3.4);
        fs(c, skin, 1.5);
      }
      // body
      rrect(c, x - 8, by - 20, 16, 20, 6);
      fs(c, col, 2.2);
      // head
      circ(c, x, by - 26, 8);
      fs(c, skin, 2.2);
      dotEye(c, x - 3, by - 27, 1.3);
      dotEye(c, x + 3, by - 27, 1.3);
      smileLine(c, x, by - 23, 5, 1.4);
      // a few hats
      if (hashf(i + 3, ti + 5) > 0.7) {
        rrect(c, x - 8, by - 36, 16, 5, 2);
        fs(c, cols[(i + 3) % cols.length], 1.5);
      }
    }
  });
  // front rail
  rrect(c, 14, 154, 292, 10, 5);
  fs(c, '#ffffff', 2.5);
  // roof + posts
  for (const x of [26, 160, 294]) {
    rrect(c, x - 5, 30, 10, 36, 3);
    fs(c, '#ffffff', 2.5);
  }
  c.beginPath();
  c.moveTo(2, 36);
  c.lineTo(318, 36);
  c.lineTo(306, 10);
  c.lineTo(14, 10);
  c.closePath();
  fs(c, '#ff5a6e', 3.5);
  // roof stripes
  c.save();
  c.beginPath();
  c.moveTo(2, 36);
  c.lineTo(318, 36);
  c.lineTo(306, 10);
  c.lineTo(14, 10);
  c.closePath();
  c.clip();
  for (let x = 20; x < 320; x += 44) {
    c.fillStyle = '#ffffff';
    c.fillRect(x, 6, 20, 34);
  }
  c.restore();
  // little flags on the roof
  for (const [x, col] of [[60, '#ffd23f'], [160, '#4aa8ff'], [260, '#5cc75c']]) {
    line(c, [x, 10, x, -2], 2.5);
    c.beginPath();
    c.moveTo(x, -2);
    c.lineTo(x + 16, 3);
    c.lineTo(x, 8);
    c.closePath();
    fs(c, col, 2);
  }
}

// ---------- cone ----------
function drawCone(c) {
  // Box 50x70.
  shadow(c, 25, 67, 20, 3.5);
  // base
  rrect(c, 5, 56, 40, 10, 4);
  fs(c, '#ff5a3c', 2.5);
  // body
  c.beginPath();
  c.moveTo(17, 10);
  c.lineTo(33, 10);
  c.lineTo(42, 58);
  c.lineTo(8, 58);
  c.closePath();
  fs(c, '#ff5a3c', 2.5);
  // white stripes (clipped to the body)
  c.save();
  c.beginPath();
  c.moveTo(17, 10);
  c.lineTo(33, 10);
  c.lineTo(42, 58);
  c.lineTo(8, 58);
  c.closePath();
  c.clip();
  c.fillStyle = '#ffffff';
  c.fillRect(0, 22, 50, 9);
  c.fillRect(0, 40, 50, 9);
  c.restore();
  // top cap
  rrect(c, 16, 5, 18, 8, 3);
  fs(c, '#ff5a3c', 2.5);
  // shine
  rrect(c, 20, 12, 4, 40, 2);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fill();
}

// ---------- tyre wall ----------
function drawTirewall(c) {
  // Box 140x60: a row of blue / white tyres lying on their side, two layers.
  shadow(c, 70, 57, 64, 4);
  const draw = (x, y, col) => {
    ell(c, x, y, 17, 14);
    fs(c, col, 3);
    ell(c, x, y, 7, 5.5);
    fs(c, '#3a3440', 2);
    ell(c, x - 6, y - 6, 4, 2.4, -0.5);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fill();
  };
  // back row
  for (let i = 0; i < 4; i++) draw(22 + i * 32, 24, i % 2 ? '#ffffff' : '#4aa8ff');
  // front row (offset)
  for (let i = 0; i < 4; i++) draw(38 + i * 32 - 16, 42, i % 2 ? '#4aa8ff' : '#ffffff');
  draw(134, 42, '#4aa8ff');
}

// ---------- flag marshal ----------
function drawFlagman(c, f) {
  // Box 80x130. A smiling marshal waving a chequered flag; frame 1 swings the flag the other way.
  shadow(c, 40, 126, 26, 4);
  // legs
  for (const x of [32, 48]) {
    rrect(c, x - 5, 92, 10, 30, 4);
    fs(c, '#3a4a6b', 2.5);
    rrect(c, x - 7, 118, 14, 8, 4);
    fs(c, '#2b2430', 2);
  }
  // body
  rrect(c, 22, 60, 36, 38, 10);
  fs(c, '#ff9f1c', 2.5);
  rrect(c, 22, 76, 36, 6, 3);
  c.fillStyle = '#ffffff';
  c.fill();
  // left arm resting
  line(c, [26, 68, 12, 92], 7, OUT);
  line(c, [26, 68, 12, 92], 4.2, '#ff9f1c');
  circ(c, 11, 94, 4.5);
  fs(c, '#ffd9b3', 2);
  // right arm up holding the flag pole
  const hx = f ? 70 : 58;
  const hy = f ? 24 : 16;
  line(c, [54, 66, hx, hy + 10], 7, OUT);
  line(c, [54, 66, hx, hy + 10], 4.2, '#ff9f1c');
  // flag pole
  const px = f ? 72 : 60;
  line(c, [px, hy + 12, px, 2], 3, '#8a7a90');
  // chequered flag: waves right (frame 0) or flips left (frame 1)
  const fw = 30;
  const fh = 20;
  const fx = f ? px - fw : px;
  const fy = 2;
  const wave = f ? -1 : 1;
  c.save();
  c.beginPath();
  c.moveTo(fx, fy);
  c.quadraticCurveTo(fx + fw / 2, fy - 4 * wave, fx + fw, fy + 2);
  c.lineTo(fx + fw, fy + fh + 2);
  c.quadraticCurveTo(fx + fw / 2, fy + fh + 4 * wave, fx, fy + fh);
  c.closePath();
  c.fillStyle = '#ffffff';
  c.fill();
  c.clip();
  const cell = fw / 5;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2 === 0) {
        c.fillStyle = '#2b2430';
        c.fillRect(fx + i * cell, fy - 4 + j * (fh + 8) / 4, cell + 0.5, (fh + 8) / 4 + 0.5);
      }
    }
  }
  c.restore();
  c.beginPath();
  c.moveTo(fx, fy);
  c.quadraticCurveTo(fx + fw / 2, fy - 4 * wave, fx + fw, fy + 2);
  c.lineTo(fx + fw, fy + fh + 2);
  c.quadraticCurveTo(fx + fw / 2, fy + fh + 4 * wave, fx, fy + fh);
  c.closePath();
  fs(c, null, 2.5);
  circ(c, hx, hy + 10, 4.5);
  fs(c, '#ffd9b3', 2);
  // head
  circ(c, 40, 44, 15);
  fs(c, '#ffd9b3', 2.5);
  dotEye(c, 34, 43, 2.6);
  dotEye(c, 46, 43, 2.6);
  cheek(c, 29, 50, 3.2);
  cheek(c, 51, 50, 3.2);
  smileLine(c, 40, 50, 9, 2);
  // cap
  c.beginPath();
  c.arc(40, 34, 15, Math.PI, 0);
  c.closePath();
  fs(c, '#ff5a6e', 2.5);
  rrect(c, 22, 31, 36, 6, 3);
  fs(c, '#ff5a6e', 2.5);
  rrect(c, 40, 28, 22, 6, 3);
  fs(c, '#ff5a6e', 2.5);
}


// ---------- night city ----------
/** Street lamp: dark pole, warm lantern (render.js adds the glow at night). */
function drawLamp(c) {
  shadow(c, 40, 192, 18, 5);
  // pole
  rrect(c, 35, 40, 10, 152, 5);
  fs(c, '#5b6378');
  rrect(c, 26, 182, 28, 12, 5);
  fs(c, '#4a5166');
  // arm + lantern
  line(c, [40, 44, 40, 30, 58, 22], 7, OUT);
  line(c, [40, 44, 40, 30, 58, 22], 4, '#5b6378');
  rrect(c, 46, 22, 26, 10, 4);
  fs(c, '#4a5166', 2.5);
  ell(c, 59, 38, 13, 11);
  fs(c, '#ffe9a3', 2.5);
  ell(c, 56, 35, 5, 4);
  c.fillStyle = '#fffbe6';
  c.fill();
}

/** Building with a friendly face of lit windows. v (0..3) picks colours / height. */
function drawBuilding(c, v) {
  const cols = [['#6c79b8', '#5a66a3'], ['#8a6cb8', '#7559a3'], ['#5f9fb0', '#4f8a9a'], ['#b8768c', '#a3627a']][v];
  const h = [210, 250, 180, 230][v];
  const top = 270 - h;
  shadow(c, 90, 268, 70, 8);
  rrect(c, 20, top, 140, h, 10);
  fs(c, cols[0]);
  rrect(c, 20, top, 22, h, 8);
  c.fillStyle = cols[1];
  c.fill();
  // roof detail
  rrect(c, 60, top - 14, 50, 16, 4);
  fs(c, cols[1], 2.5);
  // windows: warm yellow, a few dark
  const rows = Math.floor((h - 50) / 34);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 3; k++) {
      const lit = hashf(r * 3 + k, v) > 0.25;
      rrect(c, 52 + k * 34, top + 18 + r * 34, 22, 22, 4);
      fs(c, lit ? '#ffe27a' : '#3b4266', 2);
      if (lit) {
        rrect(c, 55 + k * 34, top + 21 + r * 34, 7, 7, 2);
        c.fillStyle = '#fff6c9';
        c.fill();
      }
    }
  }
  // door
  rrect(c, 78, 238, 26, 32, 5);
  fs(c, '#ffd36b', 2.5);
}

/** Owl on a branch (the night course friend). frame 1 = wings up. */
function drawOwl(c, f) {
  shadow(c, 60, 136, 34, 6);
  // branch + post
  rrect(c, 54, 92, 12, 44, 5);
  fs(c, '#8a5a3c');
  rrect(c, 14, 84, 92, 12, 6);
  fs(c, '#9b6a48');
  // wings
  if (f) {
    ell(c, 26, 40, 14, 26, -0.6);
    fs(c, '#8f6a52');
    ell(c, 94, 40, 14, 26, 0.6);
    fs(c, '#8f6a52');
  } else {
    ell(c, 36, 60, 10, 22, 0.2);
    fs(c, '#8f6a52');
    ell(c, 84, 60, 10, 22, -0.2);
    fs(c, '#8f6a52');
  }
  // body
  ell(c, 60, 56, 30, 34);
  fs(c, '#a97f63');
  ell(c, 60, 66, 19, 20);
  c.fillStyle = '#f2dcc2';
  c.fill();
  // ear tufts
  c.beginPath();
  c.moveTo(38, 30); c.lineTo(36, 12); c.lineTo(50, 24); c.closePath();
  fs(c, '#a97f63', 2.5);
  c.beginPath();
  c.moveTo(82, 30); c.lineTo(84, 12); c.lineTo(70, 24); c.closePath();
  fs(c, '#a97f63', 2.5);
  // big eyes
  circ(c, 48, 42, 12);
  fs(c, '#fff', 2.5);
  circ(c, 72, 42, 12);
  fs(c, '#fff', 2.5);
  dotEye(c, 49, 43, 6);
  dotEye(c, 71, 43, 6);
  // beak
  c.beginPath();
  c.moveTo(55, 52); c.lineTo(65, 52); c.lineTo(60, 61); c.closePath();
  fs(c, '#ffb43d', 2);
  cheek(c, 38, 56, 5);
  cheek(c, 82, 56, 5);
  // feet
  circ(c, 50, 88, 5);
  fs(c, '#ffb43d', 2);
  circ(c, 70, 88, 5);
  fs(c, '#ffb43d', 2);
}

/** Small striped road barrier (city obstacle). */
function drawRoadblock(c) {
  shadow(c, 60, 76, 46, 7);
  rrect(c, 22, 50, 10, 26, 3);
  fs(c, '#5b6378', 2.5);
  rrect(c, 88, 50, 10, 26, 3);
  fs(c, '#5b6378', 2.5);
  rrect(c, 8, 22, 104, 32, 8);
  fs(c, '#ffffff');
  c.save();
  rrect(c, 8, 22, 104, 32, 8);
  c.clip();
  c.fillStyle = '#ff6b5a';
  for (let k = -2; k < 8; k++) {
    c.beginPath();
    c.moveTo(8 + k * 22, 54);
    c.lineTo(20 + k * 22, 22);
    c.lineTo(31 + k * 22, 22);
    c.lineTo(19 + k * 22, 54);
    c.closePath();
    c.fill();
  }
  c.restore();
  rrect(c, 8, 22, 104, 32, 8);
  fs(c, null, 3);
  // little blinking lamp
  circ(c, 60, 15, 7);
  fs(c, '#ffd23f', 2.5);
}

export const TRACK_SPRITES = {
  signL: { box: [120, 150], world: 1.1, draw: (c) => drawSign(c, -1) },
  signR: { box: [120, 150], world: 1.1, draw: (c) => drawSign(c, 1) },
  grandstand: { box: [320, 170], world: 3.2, frames: 2, draw: (c, f) => drawGrandstand(c, f ? 1 : 0) },
  cone: { box: [50, 70], world: 0.3, draw: (c) => drawCone(c) },
  tirewall: { box: [140, 60], world: 1.2, draw: (c) => drawTirewall(c) },
  flagman: { box: [80, 130], world: 0.7, frames: 2, draw: (c, f) => drawFlagman(c, f ? 1 : 0) },
  lamp: { box: [80, 200], world: 0.9, draw: (c) => drawLamp(c) },
  building: { box: [180, 280], world: 2.6, draw: (c) => drawBuilding(c, 0) },
  building2: { box: [180, 280], world: 2.6, draw: (c) => drawBuilding(c, 1) },
  building3: { box: [180, 280], world: 2.4, draw: (c) => drawBuilding(c, 2) },
  building4: { box: [180, 280], world: 2.6, draw: (c) => drawBuilding(c, 3) },
  owl: { box: [120, 140], world: 0.9, frames: 2, draw: (c, f) => drawOwl(c, f ? 1 : 0) },
  roadblock: { box: [120, 80], world: 0.6, draw: (c) => drawRoadblock(c) },
};
