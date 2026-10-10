// All pictures are drawn here with Canvas 2D (no image files).
// Every drawing works in its own small "box" coordinate space.

export const OUT = '#3d2c3e';
const TAU = Math.PI * 2;

// ---------- primitives ----------
export function rrect(c, x, y, w, h, r) {
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
export function eye(c, x, y, r, o = {}) {
  circ(c, x, y, r);
  fs(c, '#fff', Math.max(1.5, r * 0.22));
  circ(c, x + (o.lx || 0) * r * 0.25, y + r * 0.12 + (o.ly || 0) * r * 0.2, r * 0.58);
  c.fillStyle = o.pupil || '#2b1f33';
  c.fill();
  circ(c, x - r * 0.18 + (o.lx || 0) * r * 0.25, y - r * 0.12, r * 0.22);
  c.fillStyle = '#fff';
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
function happyEye(c, x, y, r, lw = 2.5) {
  c.beginPath();
  c.arc(x, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85);
  c.lineWidth = lw;
  c.strokeStyle = '#2b1f33';
  c.lineCap = 'round';
  c.stroke();
}
export function smile(c, x, y, w, open = true, lw = 2.5) {
  c.beginPath();
  if (open) {
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x, y + w * 0.9, x + w / 2, y);
    c.closePath();
    c.fillStyle = '#c4364f';
    c.fill();
    c.save();
    c.clip();
    ell(c, x, y + w * 0.45, w * 0.28, w * 0.18);
    c.fillStyle = '#ff8fa3';
    c.fill();
    c.restore();
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x, y + w * 0.9, x + w / 2, y);
    c.closePath();
    c.lineWidth = lw;
    c.strokeStyle = OUT;
    c.lineJoin = 'round';
    c.stroke();
  } else {
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x, y + w * 0.6, x + w / 2, y);
    c.lineWidth = lw;
    c.strokeStyle = '#2b1f33';
    c.lineCap = 'round';
    c.stroke();
  }
}
function cheek(c, x, y, r) {
  ell(c, x, y, r, r * 0.7);
  c.fillStyle = 'rgba(255,110,150,0.55)';
  c.fill();
}
function shine(c, x, y, w, h) {
  rrect(c, x, y, w, h, h / 2);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fill();
}
function star(c, x, y, r, inner = 0.5, points = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

// ---------- vehicles ----------
export const VEHICLES = [
  { id: 'car', label: 'あかいくるま', color: '#ff5252' },
  { id: 'fire', label: 'しょうぼうしゃ', color: '#f03a32' },
  { id: 'bus', label: 'バス', color: '#ffc531' },
  { id: 'police', label: 'パトカー', color: '#3a4a6b' },
  { id: 'ambulance', label: 'きゅうきゅうしゃ', color: '#ff6b78' },
  { id: 'dino', label: 'きょうりゅうカー', color: '#59c95a' },
];

function wheelsFront(c, y = 72) {
  rrect(c, 11, y, 21, 24, 7);
  fs(c, '#3a3440');
  rrect(c, 68, y, 21, 24, 7);
  fs(c, '#3a3440');
}
function faceFront(c, ey = 62, er = 11.5, mouthY = 73, dark = false, t = 0) {
  eye(c, 27, ey, er, { lx: Math.sin(t) * 0.6 });
  eye(c, 73, ey, er, { lx: Math.sin(t) * 0.6 });
  cheek(c, 12, ey + 10, 5);
  cheek(c, 88, ey + 10, 5);
  smile(c, 50, mouthY, 20, true, dark ? 2.5 : 2.5);
}
function bumperFront(c, y = 82) {
  rrect(c, 7, y, 86, 9, 4.5);
  fs(c, '#e4e4ee', 2.5);
}

/** Front view with a big smiling face. Box 100x100. */
export function drawVehicleFront(c, id, t = 0) {
  shadow(c, 50, 95, 46, 5);
  switch (id) {
    case 'fire': {
      wheelsFront(c);
      rrect(c, 12, 10, 76, 46, 12);
      fs(c, '#f03a32');
      // ladder on the roof
      rrect(c, 28, 2, 44, 9, 3);
      fs(c, '#d5dbe6', 2.5);
      for (let x = 34; x < 70; x += 7) line(c, [x, 3, x, 10], 2, '#8a93a6');
      // beacons
      rrect(c, 12, 2, 13, 9, 4);
      fs(c, '#ff2d55', 2.5);
      rrect(c, 75, 2, 13, 9, 4);
      fs(c, '#ff2d55', 2.5);
      rrect(c, 20, 17, 60, 26, 8);
      fs(c, '#bfe9ff');
      line(c, [28, 37, 38, 22], 3, 'rgba(255,255,255,0.9)');
      rrect(c, 4, 46, 92, 40, 14);
      fs(c, '#f03a32');
      rrect(c, 6, 75, 88, 4, 2);
      c.fillStyle = '#fff3a8';
      c.fill();
      shine(c, 14, 49, 30, 5);
      faceFront(c, 61, 11.5, 70, false, t);
      bumperFront(c);
      break;
    }
    case 'bus': {
      wheelsFront(c);
      // mirrors
      line(c, [8, 30, 1, 22, 1, 40], 3);
      line(c, [92, 30, 99, 22, 99, 40], 3);
      rrect(c, 6, 8, 88, 80, 14);
      fs(c, '#ffc531');
      rrect(c, 20, 13, 60, 10, 4);
      fs(c, '#4a4458', 2.5);
      for (let x = 26; x < 76; x += 8) {
        rrect(c, x, 16, 5, 4, 2);
        c.fillStyle = '#ffb347';
        c.fill();
      }
      rrect(c, 13, 27, 74, 25, 8);
      fs(c, '#bfe9ff');
      line(c, [22, 46, 32, 31], 3, 'rgba(255,255,255,0.9)');
      line(c, [50, 27, 50, 52], 2.5);
      rrect(c, 6, 55, 88, 4, 2);
      c.fillStyle = '#fff';
      c.fill();
      faceFront(c, 66, 11, 76, false, t);
      bumperFront(c, 84);
      break;
    }
    case 'police': {
      wheelsFront(c);
      rrect(c, 34, 6, 32, 10, 4);
      fs(c, '#ff2d55', 2.5);
      shine(c, 38, 8, 10, 3);
      rrect(c, 18, 14, 64, 40, 16);
      fs(c, '#ffffff');
      rrect(c, 25, 20, 50, 24, 9);
      fs(c, '#bfe9ff');
      line(c, [32, 40, 42, 24], 3, 'rgba(255,255,255,0.9)');
      c.save();
      rrect(c, 4, 46, 92, 40, 16);
      c.clip();
      c.fillStyle = '#ffffff';
      c.fillRect(0, 40, 100, 30);
      c.fillStyle = '#2f3447';
      c.fillRect(0, 70, 100, 30);
      c.restore();
      rrect(c, 4, 46, 92, 40, 16);
      fs(c, null);
      star(c, 50, 54, 5, 0.5);
      fs(c, '#ffcc33', 1.5);
      eye(c, 27, 60, 11, { lx: Math.sin(t) * 0.6 });
      eye(c, 73, 60, 11, { lx: Math.sin(t) * 0.6 });
      cheek(c, 12, 68, 5);
      cheek(c, 88, 68, 5);
      c.save();
      smile(c, 50, 73, 20, true);
      c.restore();
      bumperFront(c);
      break;
    }
    case 'ambulance': {
      wheelsFront(c);
      rrect(c, 39, 2, 22, 9, 4);
      fs(c, '#ff2d55', 2.5);
      rrect(c, 6, 9, 88, 79, 14);
      fs(c, '#fbfbff');
      rrect(c, 15, 22, 70, 26, 8);
      fs(c, '#bfe9ff');
      line(c, [24, 42, 34, 26], 3, 'rgba(255,255,255,0.9)');
      rrect(c, 6, 51, 88, 6, 2);
      c.fillStyle = '#ff4b5c';
      c.fill();
      // little heart on the top panel
      heart(c, 50, 15, 5, '#ff4b5c');
      faceFront(c, 66, 11, 76, false, t);
      bumperFront(c, 84);
      break;
    }
    case 'dino': {
      wheelsFront(c);
      // tail peeking out on the right
      c.beginPath();
      c.moveTo(86, 66);
      c.quadraticCurveTo(104, 60, 99, 40);
      c.quadraticCurveTo(96, 56, 84, 56);
      fs(c, '#59c95a');
      // spikes
      for (const [x, y, s] of [[32, 14, 8], [50, 9, 10], [68, 14, 8]]) {
        c.beginPath();
        c.moveTo(x - s, y + 8);
        c.lineTo(x, y - s * 0.6);
        c.lineTo(x + s, y + 8);
        fs(c, '#ffb13b');
      }
      rrect(c, 16, 12, 68, 44, 22);
      fs(c, '#59c95a');
      // horns
      for (const x of [24, 76]) {
        c.beginPath();
        c.moveTo(x - 4, 16);
        c.lineTo(x + (x < 50 ? -5 : 5), 4);
        c.lineTo(x + 4, 15);
        fs(c, '#fff2c4', 2.5);
      }
      rrect(c, 25, 21, 50, 22, 10);
      fs(c, '#d6f5c9');
      line(c, [32, 37, 40, 25], 3, 'rgba(255,255,255,0.9)');
      rrect(c, 4, 46, 92, 40, 16);
      fs(c, '#59c95a');
      for (const [x, y, r] of [[12, 54, 3], [88, 52, 3.5], [20, 82, 2.5], [82, 80, 2.5]]) {
        circ(c, x, y, r);
        c.fillStyle = '#3fa64a';
        c.fill();
      }
      eye(c, 27, 61, 12.5, { lx: Math.sin(t) * 0.6 });
      eye(c, 73, 61, 12.5, { lx: Math.sin(t) * 0.6 });
      cheek(c, 12, 71, 5);
      cheek(c, 88, 71, 5);
      smile(c, 50, 72, 24, true);
      // fangs
      for (const x of [43, 57]) {
        c.beginPath();
        c.moveTo(x - 2.5, 72.5);
        c.lineTo(x, 77);
        c.lineTo(x + 2.5, 72.5);
        fs(c, '#fff', 1.2);
      }
      bumperFront(c);
      break;
    }
    default: {
      wheelsFront(c);
      rrect(c, 18, 14, 64, 42, 17);
      fs(c, '#ff5252');
      rrect(c, 25, 20, 50, 24, 9);
      fs(c, '#bfe9ff');
      line(c, [32, 40, 42, 24], 3, 'rgba(255,255,255,0.9)');
      rrect(c, 4, 46, 92, 40, 16);
      fs(c, '#ff5252');
      shine(c, 14, 49, 30, 5);
      faceFront(c, 62, 11.5, 72, false, t);
      bumperFront(c);
    }
  }
}

function heart(c, x, y, s, color) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function wheelsRear(c) {
  rrect(c, 4, 64, 24, 30, 8);
  fs(c, '#3a3440');
  rrect(c, 72, 64, 24, 30, 8);
  fs(c, '#3a3440');
}
function tailLights(c, y = 52) {
  for (const x of [11, 73]) {
    rrect(c, x, y, 16, 10, 5);
    fs(c, '#ff4747', 2.5);
    circ(c, x + 5, y + 3.5, 2);
    c.fillStyle = '#fff';
    c.fill();
  }
}
function plate(c, y = 64) {
  rrect(c, 38, y, 24, 12, 3);
  fs(c, '#fff8dc', 2);
  heart(c, 50, y + 6, 3.5, '#ff6b9d');
}
function driver(c, x, y) {
  // back of a happy little driver's head with a cap
  circ(c, x, y + 6, 11);
  fs(c, '#7a4b2a', 2.5);
  c.beginPath();
  c.arc(x, y + 3, 11, Math.PI, 0);
  fs(c, '#ffd23f', 2.5);
}

/** Rear view for the player's vehicle in the race. Box 100x100. f = animation frame (0..3). */
export function drawVehicleRear(c, id, f = 0) {
  shadow(c, 50, 95, 48, 6);
  const tailSwing = [-1, 0, 1, 0][f % 4];
  switch (id) {
    case 'bus':
    case 'ambulance': {
      wheelsRear(c);
      const col = id === 'bus' ? '#ffc531' : '#fbfbff';
      if (id === 'ambulance') {
        rrect(c, 39, 0, 22, 9, 4);
        fs(c, '#ff2d55', 2.5);
      }
      rrect(c, 7, 6, 86, 78, 13);
      fs(c, col);
      if (id === 'bus') {
        rrect(c, 16, 13, 68, 24, 7);
        fs(c, '#a8dcf5');
        c.save();
        rrect(c, 16, 13, 68, 24, 7);
        c.clip();
        driver(c, 50, 22);
        c.restore();
        rrect(c, 16, 13, 68, 24, 7);
        fs(c, null);
        for (let y = 42; y < 52; y += 4) line(c, [28, y, 72, y], 2.5, '#b3862a');
        rrect(c, 7, 39, 86, 3, 1);
      } else {
        rrect(c, 15, 13, 31, 22, 6);
        fs(c, '#a8dcf5');
        rrect(c, 54, 13, 31, 22, 6);
        fs(c, '#a8dcf5');
        line(c, [50, 8, 50, 82], 2.5);
        rrect(c, 7, 40, 86, 6, 2);
        c.fillStyle = '#ff4b5c';
        c.fill();
        heart(c, 30, 60, 5, '#ff4b5c');
        heart(c, 70, 60, 5, '#ff4b5c');
      }
      tailLights(c, 58);
      plate(c, 68);
      rrect(c, 9, 80, 82, 8, 4);
      fs(c, '#e4e4ee', 2.5);
      break;
    }
    default: {
      const col = { car: '#ff5252', fire: '#f03a32', police: '#ffffff', dino: '#59c95a' }[id] || '#ff5252';
      if (id === 'dino') {
        // wagging tail
        c.save();
        c.translate(50, 86);
        c.rotate(tailSwing * 0.35);
        c.beginPath();
        c.moveTo(-9, -4);
        c.quadraticCurveTo(-4, 14, 0, 16);
        c.quadraticCurveTo(4, 14, 9, -4);
        fs(c, '#59c95a', 2.5);
        c.restore();
      }
      wheelsRear(c);
      if (id === 'fire') {
        rrect(c, 12, 4, 76, 46, 10);
        fs(c, col);
      } else {
        rrect(c, 18, 12, 64, 40, 16);
        fs(c, col);
      }
      if (id === 'dino') {
        for (const [x, y, s] of [[34, 12, 7], [50, 7, 9], [66, 12, 7]]) {
          c.beginPath();
          c.moveTo(x - s, y + 6);
          c.lineTo(x, y - s * 0.7);
          c.lineTo(x + s, y + 6);
          fs(c, '#ffb13b');
        }
        rrect(c, 18, 12, 64, 40, 16);
        fs(c, col);
      }
      const wy = id === 'fire' ? 12 : 18;
      rrect(c, 25, wy, 50, 22, 8);
      fs(c, '#a8dcf5');
      c.save();
      rrect(c, 25, wy, 50, 22, 8);
      c.clip();
      driver(c, 50, wy + 10);
      c.restore();
      rrect(c, 25, wy, 50, 22, 8);
      fs(c, null);
      if (id === 'fire') {
        // ladder going back over the roof
        rrect(c, 30, -2, 40, 12, 3);
        fs(c, '#d5dbe6', 2.5);
        for (let y = 1; y < 10; y += 3) line(c, [32, y, 68, y], 1.8, '#8a93a6');
        rrect(c, 10, 0, 12, 9, 4);
        fs(c, '#ff2d55', 2.5);
        rrect(c, 78, 0, 12, 9, 4);
        fs(c, '#ff2d55', 2.5);
      }
      if (id === 'police') {
        rrect(c, 32, 4, 36, 10, 4);
        fs(c, '#ff2d55', 2.5);
        shine(c, 36, 6, 10, 3);
      }
      rrect(c, 6, 42, 88, 40, 15);
      fs(c, col);
      if (id === 'police') {
        c.save();
        rrect(c, 6, 42, 88, 40, 15);
        c.clip();
        c.fillStyle = '#2f3447';
        c.fillRect(0, 64, 100, 30);
        c.restore();
        rrect(c, 6, 42, 88, 40, 15);
        fs(c, null);
      }
      if (id === 'fire') {
        rrect(c, 6, 72, 88, 4, 2);
        c.fillStyle = '#fff3a8';
        c.fill();
      }
      if (id === 'dino') {
        for (const [x, y, r] of [[20, 70, 3], [80, 68, 3.5], [58, 48, 2.5]]) {
          circ(c, x, y, r);
          c.fillStyle = '#3fa64a';
          c.fill();
        }
      }
      shine(c, 14, 45, 26, 5);
      tailLights(c, 50);
      plate(c, 62);
      rrect(c, 8, 77, 84, 9, 4.5);
      fs(c, '#e4e4ee', 2.5);
    }
  }
}

// ---------- animal friends (rivals) ----------
const ANIMALS = {
  bear: { fur: '#c08a55', kart: '#4aa8ff' },
  rabbit: { fur: '#ffffff', kart: '#ff7eb6' },
  frog: { fur: '#7ed957', kart: '#ffd23f' },
  pig: { fur: '#ffb8cb', kart: '#5cd6a0' },
  cat: { fur: '#ffb347', kart: '#a77bff' },
};
export const ANIMAL_IDS = Object.keys(ANIMALS);

/** Animal in a little kart, looking back and smiling. Box 100x110. frame 1 = cheering. */
export function drawAnimalKart(c, animal, frame = 0) {
  const a = ANIMALS[animal] || ANIMALS.bear;
  const cheer = frame === 1;
  shadow(c, 50, 104, 46, 6);
  // arms
  if (cheer) {
    line(c, [30, 64, 16, 34], 7, OUT);
    line(c, [30, 64, 16, 34], 4.5, a.fur);
    line(c, [70, 64, 84, 34], 7, OUT);
    line(c, [70, 64, 84, 34], 4.5, a.fur);
    circ(c, 16, 32, 6);
    fs(c, a.fur, 2.5);
    circ(c, 84, 32, 6);
    fs(c, a.fur, 2.5);
  }
  // head + ears
  const hx = 50;
  const hy = 44;
  if (animal === 'rabbit') {
    for (const s of [-1, 1]) {
      ell(c, hx + s * 10, hy - 30, 7, 20, s * 0.15);
      fs(c, a.fur);
      ell(c, hx + s * 10, hy - 29, 3.5, 14, s * 0.15);
      c.fillStyle = '#ffb3c7';
      c.fill();
    }
  } else if (animal === 'bear') {
    for (const s of [-1, 1]) {
      circ(c, hx + s * 18, hy - 18, 8);
      fs(c, a.fur);
      circ(c, hx + s * 18, hy - 18, 4);
      c.fillStyle = '#e8b98a';
      c.fill();
    }
  } else if (animal === 'cat' || animal === 'pig') {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(hx + s * 8, hy - 20);
      c.lineTo(hx + s * 22, hy - 30);
      c.lineTo(hx + s * 22, hy - 10);
      fs(c, a.fur);
    }
  } else if (animal === 'frog') {
    for (const s of [-1, 1]) {
      circ(c, hx + s * 12, hy - 18, 10);
      fs(c, a.fur);
    }
  }
  circ(c, hx, hy, 24);
  fs(c, a.fur);
  if (animal === 'cat') {
    line(c, [hx - 4, hy - 23, hx - 4, hy - 15], 2.5, '#e08a2e');
    line(c, [hx + 4, hy - 23, hx + 4, hy - 15], 2.5, '#e08a2e');
  }
  if (animal === 'bear') {
    ell(c, hx, hy + 9, 10, 7);
    c.fillStyle = '#efd0a8';
    c.fill();
  }
  // face
  if (animal === 'frog') {
    eye(c, hx - 12, hy - 18, 6.5);
    eye(c, hx + 12, hy - 18, 6.5);
  } else if (cheer) {
    happyEye(c, hx - 9, hy - 2, 5);
    happyEye(c, hx + 9, hy - 2, 5);
  } else {
    dotEye(c, hx - 9, hy - 2, 4);
    dotEye(c, hx + 9, hy - 2, 4);
  }
  cheek(c, hx - 16, hy + 7, 4.5);
  cheek(c, hx + 16, hy + 7, 4.5);
  if (animal === 'pig') {
    ell(c, hx, hy + 7, 8, 6);
    fs(c, '#ff9bb5', 2.2);
    circ(c, hx - 3, hy + 7, 1.6);
    circ(c, hx + 3, hy + 7, 1.6);
    c.fillStyle = OUT;
    c.beginPath();
    c.arc(hx - 3, hy + 7, 1.6, 0, TAU);
    c.arc(hx + 3, hy + 7, 1.6, 0, TAU);
    c.fill();
    smile(c, hx, hy + 14, 10, cheer, 2);
  } else if (animal === 'bear') {
    ell(c, hx, hy + 5, 3, 2.2);
    c.fillStyle = OUT;
    c.fill();
    smile(c, hx, hy + 9, 10, cheer, 2);
  } else if (animal === 'cat') {
    ell(c, hx, hy + 5, 2.5, 2);
    c.fillStyle = '#ff6b8a';
    c.fill();
    smile(c, hx, hy + 8, 10, cheer, 2);
    line(c, [hx - 22, hy + 4, hx - 12, hy + 6], 1.5);
    line(c, [hx + 22, hy + 4, hx + 12, hy + 6], 1.5);
  } else {
    smile(c, hx, hy + 6, animal === 'frog' ? 20 : 12, cheer || animal === 'frog', 2);
  }
  // kart
  rrect(c, 2, 70, 22, 30, 8);
  fs(c, '#3a3440');
  rrect(c, 76, 70, 22, 30, 8);
  fs(c, '#3a3440');
  rrect(c, 14, 62, 72, 32, 13);
  fs(c, a.kart);
  shine(c, 22, 66, 22, 4);
  rrect(c, 20, 78, 12, 7, 3.5);
  fs(c, '#ff4747', 2);
  rrect(c, 68, 78, 12, 7, 3.5);
  fs(c, '#ff4747', 2);
  circ(c, 50, 80, 7);
  fs(c, '#fff', 2);
  star(c, 50, 80, 4.5, 0.5);
  c.fillStyle = '#ffcc33';
  c.fill();
}

// ---------- items ----------
export function drawStarItem(c) {
  star(c, 50, 54, 42, 0.52);
  c.fillStyle = 'rgba(255,240,140,0.55)';
  c.fill();
  star(c, 50, 54, 36, 0.52);
  fs(c, '#ffd23f', 4);
  star(c, 46, 48, 20, 0.52);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fill();
  dotEye(c, 41, 52, 4);
  dotEye(c, 59, 52, 4);
  smile(c, 50, 60, 10, false, 2.5);
  cheek(c, 34, 62, 4);
  cheek(c, 66, 62, 4);
}

function drawFruit(c, id) {
  switch (id) {
    case 'apple':
      circ(c, 36, 58, 30);
      circ(c, 64, 58, 30);
      c.beginPath();
      c.arc(36, 58, 30, 0, TAU);
      c.arc(64, 58, 30, 0, TAU);
      fs(c, '#ff4d4d', 0);
      c.beginPath();
      c.moveTo(50, 34);
      c.bezierCurveTo(10, 14, 0, 70, 30, 88);
      c.quadraticCurveTo(50, 98, 70, 88);
      c.bezierCurveTo(100, 70, 90, 14, 50, 34);
      fs(c, '#ff4d4d', 4);
      line(c, [50, 34, 54, 16], 4, '#7a4b2a');
      ell(c, 66, 20, 11, 6, -0.4);
      fs(c, '#5cc75c', 3);
      shine(c, 24, 46, 8, 18);
      break;
    case 'strawberry':
      c.beginPath();
      c.moveTo(50, 94);
      c.bezierCurveTo(14, 70, 10, 30, 50, 30);
      c.bezierCurveTo(90, 30, 86, 70, 50, 94);
      fs(c, '#ff3f5e', 4);
      for (const [x, y] of [[36, 46], [50, 48], [64, 46], [42, 60], [58, 60], [50, 74], [32, 58], [68, 58]]) {
        ell(c, x, y, 2, 3);
        c.fillStyle = '#ffe680';
        c.fill();
      }
      star(c, 50, 30, 18, 0.45, 5, Math.PI / 2);
      fs(c, '#5cc75c', 3);
      break;
    case 'watermelon':
      c.beginPath();
      c.moveTo(8, 34);
      c.arc(50, 34, 42, 0, Math.PI);
      c.closePath();
      fs(c, '#4caf50', 4);
      c.beginPath();
      c.moveTo(15, 34);
      c.arc(50, 34, 35, 0, Math.PI);
      c.closePath();
      c.fillStyle = '#ff5a6e';
      c.fill();
      for (const [x, y] of [[34, 46], [50, 52], [66, 46], [42, 60], [58, 60]]) {
        ell(c, x, y, 2.4, 3.6);
        c.fillStyle = '#3d2c3e';
        c.fill();
      }
      break;
    case 'pineapple':
      for (const [a, l] of [[-0.5, 26], [0, 32], [0.5, 26]]) {
        c.save();
        c.translate(50, 40);
        c.rotate(a);
        c.beginPath();
        c.moveTo(-6, 0);
        c.lineTo(0, -l);
        c.lineTo(6, 0);
        fs(c, '#4caf50', 3);
        c.restore();
      }
      ell(c, 50, 66, 26, 30);
      fs(c, '#ffc531', 4);
      c.save();
      ell(c, 50, 66, 26, 30);
      c.clip();
      for (let k = -60; k < 60; k += 12) {
        line(c, [50 + k - 30, 36, 50 + k + 30, 96], 2, '#d99a1a');
        line(c, [50 + k + 30, 36, 50 + k - 30, 96], 2, '#d99a1a');
      }
      c.restore();
      break;
    case 'mikan':
      circ(c, 50, 58, 34);
      fs(c, '#ff9f1c', 4);
      ell(c, 56, 24, 10, 5, -0.3);
      fs(c, '#5cc75c', 3);
      circ(c, 50, 26, 3);
      c.fillStyle = '#4caf50';
      c.fill();
      shine(c, 28, 44, 8, 16);
      break;
    case 'grape': {
      const pts = [[38, 40], [62, 40], [50, 38], [30, 56], [50, 56], [70, 56], [40, 72], [60, 72], [50, 88]];
      for (const [x, y] of pts) {
        circ(c, x, y, 12);
        fs(c, '#9b5de5', 3);
        circ(c, x - 4, y - 4, 3);
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fill();
      }
      line(c, [50, 30, 52, 14], 4, '#7a4b2a');
      ell(c, 64, 20, 11, 6, -0.3);
      fs(c, '#5cc75c', 3);
      break;
    }
  }
}

// ---------- scenery ----------
const SCENERY = {
  tree: {
    box: [100, 130], world: 1.4,
    draw(c) {
      shadow(c, 50, 126, 36, 5);
      rrect(c, 42, 80, 16, 46, 6);
      fs(c, '#a8693a');
      for (const [x, y, r] of [[28, 68, 24], [72, 68, 24], [50, 44, 34], [50, 72, 26]]) {
        circ(c, x, y, r);
        fs(c, '#5cc75c');
      }
      for (const [x, y, r] of [[28, 68, 24], [72, 68, 24], [50, 44, 34], [50, 72, 26]]) {
        circ(c, x, y, r - 2);
        c.fillStyle = '#5cc75c';
        c.fill();
      }
      for (const [x, y, r] of [[40, 32, 9], [24, 60, 6], [62, 52, 7]]) {
        circ(c, x, y, r);
        c.fillStyle = '#86dd73';
        c.fill();
      }
      for (const [x, y] of [[34, 50], [64, 40], [70, 74], [44, 76]]) {
        circ(c, x, y, 5);
        fs(c, '#ff5a5a', 2);
      }
    },
  },
  pine: {
    box: [100, 150], world: 1.3,
    draw(c) {
      shadow(c, 50, 146, 34, 5);
      rrect(c, 42, 112, 16, 34, 5);
      fs(c, '#8d5a34');
      for (const [y, w] of [[118, 46], [86, 38], [54, 28]]) {
        c.beginPath();
        c.moveTo(50 - w, y);
        c.quadraticCurveTo(50, y + 8, 50 + w, y);
        c.lineTo(50, y - 52);
        c.closePath();
        fs(c, '#2f9e6a');
        c.beginPath();
        c.moveTo(50 - w * 0.45, y - 30);
        c.quadraticCurveTo(40, y - 22, 46, y - 26);
        c.quadraticCurveTo(52, y - 20, 56, y - 26);
        c.quadraticCurveTo(62, y - 22, 50 + w * 0.45, y - 30);
        c.lineTo(50, y - 52);
        c.closePath();
        fs(c, '#ffffff', 2.5);
      }
    },
  },
  tulips: {
    box: [100, 80], world: 0.75,
    draw(c) {
      const cols = ['#ff4d6d', '#ffd23f', '#ff8fd1'];
      [[25, 30], [50, 18], [75, 30]].forEach(([x, y], i) => {
        line(c, [x, y, x, 78], 4, '#3fa64a');
        ell(c, x + (i - 1) * 8, 62, 6, 13, (i - 1) * 0.5);
        c.fillStyle = '#5cc75c';
        c.fill();
        c.beginPath();
        c.moveTo(x - 12, y - 8);
        c.lineTo(x - 6, y - 2);
        c.lineTo(x, y - 12);
        c.lineTo(x + 6, y - 2);
        c.lineTo(x + 12, y - 8);
        c.quadraticCurveTo(x + 12, y + 14, x, y + 14);
        c.quadraticCurveTo(x - 12, y + 14, x - 12, y - 8);
        fs(c, cols[i], 2.5);
      });
    },
  },
  sunflower: {
    box: [70, 150], world: 0.6,
    draw(c) {
      line(c, [35, 50, 35, 148], 5, '#3fa64a');
      ell(c, 22, 104, 13, 6, 0.4);
      fs(c, '#5cc75c', 2.5);
      ell(c, 48, 118, 13, 6, -0.4);
      fs(c, '#5cc75c', 2.5);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ell(c, 35 + Math.cos(a) * 20, 40 + Math.sin(a) * 20, 10, 5.5, a);
        fs(c, '#ffd23f', 2);
      }
      circ(c, 35, 40, 16);
      fs(c, '#8d5a34', 2.5);
      dotEye(c, 29, 37, 2.6);
      dotEye(c, 41, 37, 2.6);
      smile(c, 35, 44, 9, false, 2);
    },
  },
  bush: {
    box: [100, 60], world: 1.0,
    draw(c) {
      shadow(c, 50, 57, 46, 4);
      for (const [x, y, r] of [[22, 38, 18], [50, 28, 24], [78, 38, 18]]) {
        circ(c, x, y, r);
        fs(c, '#4cbb5c');
      }
      rrect(c, 6, 36, 88, 20, 10);
      fs(c, '#4cbb5c');
      c.fillStyle = '#4cbb5c';
      c.fillRect(8, 30, 84, 10);
      for (const [x, y, col] of [[28, 30, '#ff8fd1'], [52, 18, '#fff'], [70, 34, '#ffd23f'], [40, 44, '#ff4d6d']]) {
        star(c, x, y, 5, 0.5);
        c.fillStyle = col;
        c.fill();
      }
    },
  },
  flowers: {
    box: [100, 40], world: 0.9,
    draw(c) {
      [[14, 22, '#ff4d6d'], [34, 12, '#ffd23f'], [52, 26, '#ff8fd1'], [70, 14, '#7ec8ff'], [88, 24, '#fff']].forEach(([x, y, col]) => {
        line(c, [x, y, x, 40], 3, '#3fa64a');
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          circ(c, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4);
          c.fillStyle = col;
          c.fill();
        }
        circ(c, x, y, 3);
        c.fillStyle = '#ffb13b';
        c.fill();
      });
    },
  },
  sheep: {
    box: [100, 80], world: 0.85, animal: true,
    draw(c) {
      shadow(c, 50, 77, 34, 4);
      for (const x of [32, 44, 60, 70]) {
        rrect(c, x - 3, 52, 7, 24, 3);
        fs(c, '#4a4458', 2);
      }
      for (const [x, y, r] of [[30, 40, 15], [46, 32, 16], [62, 34, 15], [70, 46, 13], [48, 50, 15], [30, 52, 12]]) {
        circ(c, x, y, r);
        fs(c, '#fff');
      }
      for (const [x, y, r] of [[30, 40, 13], [46, 32, 14], [62, 34, 13], [70, 46, 11], [48, 50, 13], [30, 52, 10]]) {
        circ(c, x, y, r);
        c.fillStyle = '#fff';
        c.fill();
      }
      ell(c, 20, 40, 12, 14);
      fs(c, '#4a4458');
      ell(c, 9, 34, 6, 3.5, 0.5);
      fs(c, '#4a4458', 2);
      dotEye(c, 16, 38, 2.5);
      c.fillStyle = '#fff';
      dotEye(c, 25, 38, 2.5);
      cheek(c, 14, 46, 3);
      smile(c, 20, 47, 6, false, 1.8);
    },
  },
  rabbit: {
    box: [70, 90], world: 0.5, animal: true,
    draw(c) {
      shadow(c, 35, 87, 22, 3);
      for (const s of [-1, 1]) {
        ell(c, 35 + s * 8, 18, 6, 17, s * 0.15);
        fs(c, '#fff');
        ell(c, 35 + s * 8, 19, 3, 11, s * 0.15);
        c.fillStyle = '#ffb3c7';
        c.fill();
      }
      ell(c, 35, 68, 20, 18);
      fs(c, '#fff');
      circ(c, 35, 44, 16);
      fs(c, '#fff');
      dotEye(c, 29, 42, 2.8);
      dotEye(c, 41, 42, 2.8);
      cheek(c, 25, 50, 3.5);
      cheek(c, 45, 50, 3.5);
      smile(c, 35, 50, 6, false, 1.8);
    },
  },
  house: {
    box: [120, 110], world: 1.7,
    draw(c) {
      shadow(c, 60, 106, 52, 5);
      rrect(c, 84, 14, 12, 26, 2);
      fs(c, '#c45a4a');
      rrect(c, 18, 50, 84, 56, 6);
      fs(c, '#fff3d6');
      c.beginPath();
      c.moveTo(6, 56);
      c.lineTo(60, 12);
      c.lineTo(114, 56);
      c.closePath();
      fs(c, '#ff6b5a');
      rrect(c, 50, 70, 20, 36, 8);
      fs(c, '#a8693a');
      circ(c, 65, 88, 2);
      c.fillStyle = '#ffd23f';
      c.fill();
      rrect(c, 26, 64, 18, 16, 4);
      fs(c, '#a8dcf5');
      rrect(c, 76, 64, 18, 16, 4);
      fs(c, '#a8dcf5');
      heart(c, 60, 40, 6, '#fff');
    },
  },
  cow: {
    box: [130, 100], world: 1.25, animal: true, frames: 2,
    draw(c, f) {
      shadow(c, 62, 96, 50, 5);
      const step = f ? 4 : -4;
      for (const [x, d] of [[34, step], [48, -step], [86, step], [100, -step]]) {
        rrect(c, x - 5 + d * 0.4, 62, 10, 32, 4);
        fs(c, '#fff');
        rrect(c, x - 5 + d * 0.4, 86, 10, 8, 3);
        c.fillStyle = '#4a4458';
        c.fill();
      }
      rrect(c, 24, 28, 90, 46, 22);
      fs(c, '#fff');
      for (const [x, y, rx, ry] of [[50, 42, 12, 9], [86, 52, 14, 10], [70, 34, 8, 6]]) {
        ell(c, x, y, rx, ry);
        c.fillStyle = '#4a4458';
        c.fill();
      }
      line(c, [114, 40, 124, 60], 3);
      circ(c, 124, 62, 4);
      c.fillStyle = OUT;
      c.fill();
      // head facing us
      for (const s of [-1, 1]) {
        ell(c, 22 + s * 18, 22, 8, 4.5, s * 0.4);
        fs(c, '#fff', 2.5);
      }
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(22 + s * 8, 10);
        c.quadraticCurveTo(22 + s * 14, 2, 22 + s * 12, 0);
        c.lineWidth = 4;
        c.strokeStyle = '#ffe9a8';
        c.stroke();
      }
      ell(c, 22, 28, 18, 20);
      fs(c, '#fff');
      ell(c, 22, 40, 15, 10);
      fs(c, '#ffb3c7', 2.5);
      circ(c, 16, 40, 2.2);
      circ(c, 28, 40, 2.2);
      c.fillStyle = OUT;
      c.beginPath();
      c.arc(16, 40, 2.2, 0, TAU);
      c.arc(28, 40, 2.2, 0, TAU);
      c.fill();
      dotEye(c, 15, 24, 3);
      dotEye(c, 29, 24, 3);
      ell(c, 30, 16, 5, 4);
      c.fillStyle = '#4a4458';
      c.fill();
      circ(c, 22, 52, 5);
      fs(c, '#ffd23f', 2);
    },
  },
  palm: {
    box: [110, 170], world: 1.5,
    draw(c) {
      shadow(c, 56, 166, 30, 4);
      for (let i = 0; i < 7; i++) {
        const y = 160 - i * 18;
        const x = 56 + Math.sin(i * 0.35) * 8 - i * 1.5;
        ell(c, x, y, 9 - i * 0.4, 10);
        fs(c, '#c98a4b', 2.5);
      }
      const top = [48, 40];
      for (const [a, l] of [[-2.6, 44], [-2.0, 48], [-1.2, 44], [-0.5, 48], [0.1, 44], [-3.1, 38]]) {
        c.save();
        c.translate(top[0], top[1]);
        c.rotate(a);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(l * 0.5, -14, l, 6);
        c.quadraticCurveTo(l * 0.5, 4, 0, 0);
        fs(c, '#3fbf6a', 2.5);
        c.restore();
      }
      for (const [x, y] of [[44, 46], [54, 48], [49, 54]]) {
        circ(c, x, y, 6);
        fs(c, '#8d5a34', 2);
      }
    },
  },
  umbrella: {
    box: [100, 110], world: 1.0,
    draw(c) {
      ell(c, 50, 104, 40, 6);
      c.fillStyle = '#f5d17e';
      c.fill();
      line(c, [50, 34, 54, 104], 4, '#8d5a34');
      c.beginPath();
      c.moveTo(4, 44);
      c.quadraticCurveTo(50, -10, 96, 44);
      c.closePath();
      fs(c, '#fff');
      c.save();
      c.clip();
      for (let i = 0; i < 5; i += 2) {
        c.beginPath();
        c.moveTo(50, 8);
        c.lineTo(4 + i * 18.4, 48);
        c.lineTo(4 + (i + 1) * 18.4, 48);
        c.closePath();
        c.fillStyle = '#ff5a6e';
        c.fill();
      }
      c.restore();
      c.beginPath();
      c.moveTo(4, 44);
      c.quadraticCurveTo(50, -10, 96, 44);
      c.closePath();
      fs(c, null);
    },
  },
  crab: {
    box: [100, 70], world: 0.6, animal: true,
    draw(c) {
      shadow(c, 50, 66, 32, 4);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) line(c, [50 + s * 18, 50 + k * 4, 50 + s * (32 + k * 3), 58 + k * 4], 3.5, '#e8432f');
        line(c, [50 + s * 22, 40, 50 + s * 36, 26], 4, '#e8432f');
        c.beginPath();
        c.arc(50 + s * 38, 20, 9, s > 0 ? 2.2 : 0.3, s > 0 ? 2.2 + 4.6 : 0.3 + 4.6, s < 0);
        c.lineTo(50 + s * 38, 20);
        c.closePath();
        fs(c, '#ff5a3c', 2.5);
      }
      line(c, [42, 34, 40, 18], 3);
      line(c, [58, 34, 60, 18], 3);
      eye(c, 40, 16, 6);
      eye(c, 60, 16, 6);
      ell(c, 50, 46, 26, 16);
      fs(c, '#ff5a3c');
      cheek(c, 34, 50, 4);
      cheek(c, 66, 50, 4);
      smile(c, 50, 46, 12, true, 2);
    },
  },
  sandcastle: {
    box: [100, 100], world: 0.9,
    draw(c) {
      shadow(c, 50, 97, 46, 4);
      rrect(c, 10, 56, 80, 40, 4);
      fs(c, '#f5c96e');
      for (const x of [10, 64]) {
        rrect(c, x, 34, 26, 30, 3);
        fs(c, '#f5c96e');
        for (let k = 0; k < 3; k++) {
          rrect(c, x + k * 9, 28, 7, 8, 2);
          fs(c, '#f5c96e', 2);
        }
      }
      rrect(c, 36, 24, 28, 40, 3);
      fs(c, '#f5c96e');
      line(c, [50, 24, 50, 2], 2.5);
      c.beginPath();
      c.moveTo(50, 2);
      c.lineTo(66, 7);
      c.lineTo(50, 12);
      fs(c, '#ff5a6e', 2);
      rrect(c, 42, 72, 16, 24, 8);
      fs(c, '#c98a4b', 2.5);
      star(c, 24, 76, 6, 0.5);
      fs(c, '#ff9f68', 1.5);
    },
  },
  shellpile: {
    box: [80, 40], world: 0.45,
    draw(c) {
      star(c, 22, 24, 14, 0.45);
      fs(c, '#ff9f68', 2.5);
      dotEye(c, 18, 22, 2);
      dotEye(c, 26, 22, 2);
      c.beginPath();
      c.moveTo(48, 36);
      c.arc(58, 30, 13, Math.PI, 0);
      c.closePath();
      fs(c, '#ffd1dc', 2.5);
      for (let k = -2; k <= 2; k++) line(c, [58, 32, 58 + k * 5, 19], 1.5, '#e58fa5');
    },
  },
  lighthouse: {
    box: [70, 180], world: 1.1,
    draw(c) {
      shadow(c, 35, 176, 30, 4);
      c.beginPath();
      c.moveTo(16, 176);
      c.lineTo(24, 46);
      c.lineTo(46, 46);
      c.lineTo(54, 176);
      c.closePath();
      fs(c, '#fff');
      c.save();
      c.clip();
      for (let y = 70; y < 176; y += 44) {
        c.fillStyle = '#ff5a5a';
        c.fillRect(0, y, 70, 22);
      }
      c.restore();
      c.beginPath();
      c.moveTo(16, 176);
      c.lineTo(24, 46);
      c.lineTo(46, 46);
      c.lineTo(54, 176);
      c.closePath();
      fs(c, null);
      rrect(c, 22, 26, 26, 22, 4);
      fs(c, '#fff4a8');
      c.beginPath();
      c.moveTo(18, 28);
      c.lineTo(35, 8);
      c.lineTo(52, 28);
      c.closePath();
      fs(c, '#ff5a5a');
      rrect(c, 30, 120, 10, 18, 5);
      fs(c, '#a8dcf5', 2);
    },
  },
  boat: {
    box: [120, 100], world: 1.4,
    draw(c) {
      line(c, [60, 10, 60, 74], 3);
      c.beginPath();
      c.moveTo(62, 12);
      c.lineTo(100, 66);
      c.lineTo(62, 66);
      c.closePath();
      fs(c, '#fff');
      c.beginPath();
      c.moveTo(58, 22);
      c.lineTo(30, 66);
      c.lineTo(58, 66);
      c.closePath();
      fs(c, '#ffd23f');
      c.beginPath();
      c.moveTo(12, 72);
      c.lineTo(108, 72);
      c.lineTo(94, 92);
      c.lineTo(26, 92);
      c.closePath();
      fs(c, '#ff5a6e');
      circ(c, 44, 81, 4);
      fs(c, '#a8dcf5', 2);
      circ(c, 76, 81, 4);
      fs(c, '#a8dcf5', 2);
      c.beginPath();
      c.moveTo(0, 96);
      for (let x = 0; x <= 120; x += 20) c.quadraticCurveTo(x + 10, 88, x + 20, 96);
      c.lineWidth = 4;
      c.strokeStyle = '#fff';
      c.stroke();
    },
  },
  buoy: {
    box: [50, 60], world: 0.45,
    draw(c) {
      ell(c, 25, 40, 20, 14);
      fs(c, '#ff5a5a');
      c.save();
      ell(c, 25, 40, 20, 14);
      c.clip();
      c.fillStyle = '#fff';
      c.fillRect(0, 34, 50, 8);
      c.restore();
      ell(c, 25, 40, 20, 14);
      fs(c, null);
      line(c, [25, 26, 25, 6], 3);
      circ(c, 25, 6, 4);
      fs(c, '#ffd23f', 2);
    },
  },
  dolphin: {
    box: [110, 80], world: 1.0, animal: true,
    draw(c) {
      c.beginPath();
      c.moveTo(14, 60);
      c.quadraticCurveTo(30, 6, 80, 18);
      c.quadraticCurveTo(102, 24, 104, 34);
      c.quadraticCurveTo(90, 34, 82, 38);
      c.quadraticCurveTo(50, 36, 30, 66);
      c.closePath();
      fs(c, '#6fb8ff');
      c.beginPath();
      c.moveTo(54, 20);
      c.lineTo(46, 4);
      c.lineTo(66, 18);
      fs(c, '#6fb8ff');
      c.beginPath();
      c.moveTo(18, 58);
      c.lineTo(4, 54);
      c.lineTo(12, 70);
      c.lineTo(24, 66);
      fs(c, '#6fb8ff');
      dotEye(c, 82, 26, 3);
      cheek(c, 88, 32, 3);
      c.beginPath();
      c.moveTo(0, 74);
      for (let x = 0; x <= 110; x += 22) c.quadraticCurveTo(x + 11, 64, x + 22, 74);
      c.lineWidth = 5;
      c.strokeStyle = '#fff';
      c.stroke();
    },
  },
  whale: {
    box: [220, 130], world: 2.8, animal: true, frames: 2,
    draw(c, f) {
      // water spout when frame 1
      if (f) {
        for (const [x, y, r] of [[96, 22, 10], [80, 14, 8], [112, 14, 8], [70, 30, 6], [122, 30, 6], [96, 6, 7]]) {
          circ(c, x, y, r);
          fs(c, '#d9f3ff', 2.5, '#5aa8d6');
        }
        line(c, [96, 30, 96, 48], 7, '#d9f3ff');
      }
      c.beginPath();
      c.moveTo(20, 98);
      c.quadraticCurveTo(10, 46, 90, 46);
      c.quadraticCurveTo(160, 46, 172, 88);
      c.quadraticCurveTo(188, 70, 206, 62);
      c.quadraticCurveTo(200, 84, 214, 102);
      c.quadraticCurveTo(190, 98, 176, 104);
      c.quadraticCurveTo(100, 122, 20, 98);
      fs(c, '#4a8fe7', 3.5);
      c.beginPath();
      c.moveTo(26, 96);
      c.quadraticCurveTo(80, 116, 150, 102);
      c.quadraticCurveTo(100, 96, 26, 96);
      c.fillStyle = '#cfe6ff';
      c.fill();
      eye(c, 58, 72, 8);
      cheek(c, 46, 86, 6);
      smile(c, 50, 90, 20, true, 2.5);
      // waves in front
      c.beginPath();
      c.moveTo(0, 116);
      for (let x = 0; x <= 220; x += 27.5) c.quadraticCurveTo(x + 14, 102, x + 27.5, 116);
      c.lineTo(220, 130);
      c.lineTo(0, 130);
      c.closePath();
      fs(c, '#7fd3f7', 3, '#ffffff');
    },
  },
  snowmanSmall: {
    box: [70, 100], world: 0.65,
    draw(c) {
      shadow(c, 35, 96, 26, 4);
      circ(c, 35, 72, 24);
      fs(c, '#fff');
      circ(c, 35, 34, 18);
      fs(c, '#fff');
      dotEye(c, 29, 30, 2.6);
      dotEye(c, 41, 30, 2.6);
      c.beginPath();
      c.moveTo(35, 36);
      c.lineTo(46, 39);
      c.lineTo(35, 40);
      fs(c, '#ff9f1c', 1.5);
      cheek(c, 25, 38, 3.5);
      cheek(c, 45, 38, 3.5);
      rrect(c, 22, 12, 26, 8, 3);
      fs(c, '#ff5a6e', 2.5);
    },
  },
  snowmanBig: {
    box: [140, 180], world: 1.6, frames: 2, animal: true,
    draw(c, f) {
      shadow(c, 70, 176, 50, 5);
      // arms
      line(c, [36, 98, 10, 82], 4, '#8d5a34');
      if (f) line(c, [104, 98, 132, 60], 4, '#8d5a34');
      else line(c, [104, 98, 134, 92], 4, '#8d5a34');
      const hx = f ? 134 : 136;
      const hy = f ? 56 : 88;
      circ(c, hx, hy, 8);
      fs(c, '#ff5a6e', 2.5);
      circ(c, 70, 132, 44);
      fs(c, '#fff');
      circ(c, 70, 64, 34);
      fs(c, '#fff');
      for (const y of [114, 134]) {
        circ(c, 70, y, 4.5);
        c.fillStyle = '#4a4458';
        c.fill();
      }
      rrect(c, 34, 88, 72, 14, 7);
      fs(c, '#ff5a6e');
      rrect(c, 78, 92, 14, 32, 6);
      fs(c, '#ff5a6e');
      dotEye(c, 58, 58, 4.5);
      dotEye(c, 82, 58, 4.5);
      c.beginPath();
      c.moveTo(70, 66);
      c.lineTo(92, 72);
      c.lineTo(70, 74);
      fs(c, '#ff9f1c', 2);
      cheek(c, 50, 72, 6);
      cheek(c, 90, 72, 6);
      smile(c, 70, 80, 14, true, 2.2);
      rrect(c, 44, 30, 52, 8, 3);
      fs(c, '#4a7bd8');
      rrect(c, 52, 4, 36, 30, 5);
      fs(c, '#4a7bd8');
      circ(c, 70, 2, 6);
      fs(c, '#fff', 2.5);
    },
  },
  penguin: {
    box: [70, 90], world: 0.55, animal: true,
    draw(c) {
      shadow(c, 35, 87, 22, 3);
      ell(c, 35, 52, 24, 32);
      fs(c, '#3a4a6b');
      ell(c, 35, 58, 16, 24);
      c.fillStyle = '#fff';
      c.fill();
      ell(c, 12, 56, 5, 14, 0.4);
      fs(c, '#3a4a6b', 2.5);
      ell(c, 58, 56, 5, 14, -0.4);
      fs(c, '#3a4a6b', 2.5);
      dotEye(c, 28, 38, 3);
      dotEye(c, 42, 38, 3);
      c.beginPath();
      c.moveTo(30, 44);
      c.lineTo(35, 50);
      c.lineTo(40, 44);
      c.closePath();
      fs(c, '#ffb13b', 2);
      cheek(c, 23, 46, 3.5);
      cheek(c, 47, 46, 3.5);
      ell(c, 26, 85, 8, 4);
      fs(c, '#ffb13b', 2);
      ell(c, 44, 85, 8, 4);
      fs(c, '#ffb13b', 2);
    },
  },
  igloo: {
    box: [130, 80], world: 1.4,
    draw(c) {
      shadow(c, 65, 77, 60, 4);
      c.beginPath();
      c.moveTo(6, 76);
      c.arc(65, 76, 59, Math.PI, 0);
      c.closePath();
      fs(c, '#f4f9ff');
      for (const y of [56, 36]) line(c, [65 - Math.sqrt(59 * 59 - (76 - y) ** 2), y, 65 + Math.sqrt(59 * 59 - (76 - y) ** 2), y], 2, '#a9c4e0');
      c.beginPath();
      c.moveTo(48, 76);
      c.arc(65, 76, 17, Math.PI, 0);
      c.closePath();
      fs(c, '#5b6b8c', 2.5);
    },
  },
  snowbush: {
    box: [100, 60], world: 1.0,
    draw(c) {
      shadow(c, 50, 57, 46, 4);
      for (const [x, y, r] of [[22, 40, 17], [50, 30, 23], [78, 40, 17]]) {
        circ(c, x, y, r);
        fs(c, '#3fae78');
      }
      for (const [x, y, r] of [[22, 30, 12], [50, 16, 15], [78, 30, 12]]) {
        ell(c, x, y, r, r * 0.55);
        c.fillStyle = '#fff';
        c.fill();
      }
    },
  },
  hay: {
    box: [100, 80], world: 0.66, animal: true,
    draw(c) {
      shadow(c, 50, 77, 44, 4);
      rrect(c, 6, 10, 88, 66, 30);
      fs(c, '#ffd36b');
      for (let k = 0; k < 4; k++) line(c, [16, 22 + k * 14, 84, 22 + k * 14], 2, '#e0a83a');
      rrect(c, 6, 10, 88, 66, 30);
      fs(c, null);
      dotEye(c, 38, 38, 4);
      dotEye(c, 62, 38, 4);
      cheek(c, 28, 48, 5);
      cheek(c, 72, 48, 5);
      smile(c, 50, 48, 14, true, 2.5);
    },
  },
  beachball: {
    box: [100, 100], world: 0.62, animal: true,
    draw(c) {
      shadow(c, 50, 96, 36, 4);
      circ(c, 50, 52, 42);
      fs(c, '#fff');
      c.save();
      circ(c, 50, 52, 42);
      c.clip();
      const cols = ['#ff5a6e', '#ffd23f', '#4aa8ff'];
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(50, 52, 14, 46, (i * Math.PI) / 3, 0, TAU);
        c.fillStyle = cols[i];
        c.fill();
      }
      c.restore();
      circ(c, 50, 52, 42);
      fs(c, null, 3.5);
      circ(c, 50, 52, 10);
      fs(c, '#fff', 2);
      dotEye(c, 36, 44, 4);
      dotEye(c, 64, 44, 4);
      smile(c, 50, 58, 14, true, 2.5);
    },
  },
  snowball: {
    box: [100, 80], world: 0.66, animal: true,
    draw(c) {
      shadow(c, 50, 77, 44, 4);
      for (const [x, y, r] of [[30, 54, 22], [70, 54, 22], [50, 40, 30]]) {
        circ(c, x, y, r);
        fs(c, '#fff', 3, '#8fb3d9');
      }
      for (const [x, y, r] of [[30, 54, 20], [70, 54, 20], [50, 40, 28]]) {
        circ(c, x, y, r);
        c.fillStyle = '#fff';
        c.fill();
      }
      dotEye(c, 40, 40, 4);
      dotEye(c, 60, 40, 4);
      cheek(c, 32, 50, 5);
      cheek(c, 68, 50, 5);
      smile(c, 50, 50, 12, true, 2.5);
    },
  },
  balloons: {
    box: [80, 160], world: 0.8,
    draw(c) {
      const b = [[22, 34, '#ff5a6e'], [56, 26, '#ffd23f'], [40, 54, '#4aa8ff']];
      for (const [x, y] of b) line(c, [x, y + 20, 40, 158], 2, '#8a7a90');
      for (const [x, y, col] of b) {
        ell(c, x, y, 17, 21);
        fs(c, col);
        ell(c, x - 6, y - 7, 4, 6);
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fill();
      }
    },
  },
  startgate: {
    box: [400, 200], world: 3.3,
    draw(c) {
      for (const x of [16, 384]) {
        rrect(c, x - 8, 40, 16, 160, 6);
        fs(c, '#fff');
      }
      rrect(c, 4, 26, 392, 46, 14);
      fs(c, '#fff');
      c.save();
      rrect(c, 4, 26, 392, 46, 14);
      c.clip();
      for (let x = 0; x < 400; x += 23) {
        for (let y = 0; y < 3; y++) {
          if ((x / 23 + y) % 2 === 0) {
            c.fillStyle = '#3d2c3e';
            c.fillRect(4 + x, 26 + y * 15.4, 23, 15.4);
          }
        }
      }
      c.restore();
      rrect(c, 4, 26, 392, 46, 14);
      fs(c, null);
    },
  },
  goalgate: {
    box: [400, 260], world: 3.5,
    draw(c) {
      const cols = ['#ff5a6e', '#ff9f1c', '#ffd23f', '#5cc75c', '#4aa8ff', '#7b6cff', '#c77dff'];
      for (let i = 0; i < cols.length; i++) {
        c.beginPath();
        c.arc(200, 260, 196 - i * 15, Math.PI, 0);
        c.arc(200, 260, 181 - i * 15, 0, Math.PI, true);
        c.closePath();
        c.fillStyle = cols[i];
        c.fill();
      }
      c.beginPath();
      c.arc(200, 260, 196, Math.PI, 0);
      c.lineWidth = 4;
      c.strokeStyle = '#fff';
      c.stroke();
      // banner
      rrect(c, 110, 40, 180, 56, 16);
      fs(c, '#fff', 5);
      c.save();
      rrect(c, 110, 40, 180, 56, 16);
      c.clip();
      for (let x = 0; x < 180; x += 14) {
        if ((x / 14) % 2 === 0) {
          c.fillStyle = '#3d2c3e';
          c.fillRect(110 + x, 40, 14, 9);
          c.fillRect(110 + x + 14, 87, 14, 9);
        } else {
          c.fillStyle = '#3d2c3e';
        }
      }
      c.restore();
      c.font = '900 36px "Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 6;
      c.strokeStyle = '#3d2c3e';
      c.strokeText('GOAL', 200, 70);
      c.fillStyle = '#ffd23f';
      c.fillText('GOAL', 200, 70);
      for (const [x, y] of [[40, 160], [360, 160], [120, 60], [280, 60]]) {
        star(c, x, y, 13, 0.5);
        fs(c, '#fff6a8', 3);
      }
    },
  },
};

// Items registered as sprites too.
SCENERY.star = { box: [100, 100], world: 0.52, draw: drawStarItem };
for (const f of ['apple', 'strawberry', 'watermelon', 'pineapple', 'mikan', 'grape']) {
  SCENERY[f] = { box: [100, 100], world: 0.55, draw: (c) => drawFruit(c, f) };
}
for (const v of VEHICLES) {
  for (let f = 0; f < 4; f++) {
    SCENERY['rear-' + v.id + (f ? '-' + f : '')] = { box: [100, 100], world: 0.78, draw: (c) => drawVehicleRear(c, v.id, f) };
  }
  SCENERY['front-' + v.id] = { box: [100, 100], world: 0.78, draw: (c) => drawVehicleFront(c, v.id, 0) };
}
for (const a of ANIMAL_IDS) {
  SCENERY['kart-' + a] = { box: [100, 110], world: 0.72, draw: (c) => drawAnimalKart(c, a, 0) };
  SCENERY['kart-' + a + '-cheer'] = { box: [100, 110], world: 0.72, draw: (c) => drawAnimalKart(c, a, 1) };
}

export const SPRITES = SCENERY;

const cache = new Map();
/**
 * Pre-render a sprite to an offscreen canvas. `px` is the larger side in device pixels.
 */
export function spriteImage(id, px = 256, frame = 0) {
  const key = id + '|' + px + '|' + frame;
  let cv = cache.get(key);
  if (cv) return cv;
  const def = SCENERY[id];
  if (!def) return null;
  const [bw, bh] = def.box;
  const k = px / Math.max(bw, bh);
  cv = document.createElement('canvas');
  cv.width = Math.ceil(bw * k) + 4;
  cv.height = Math.ceil(bh * k) + 4;
  const c = cv.getContext('2d');
  c.translate(2, 2);
  c.scale(k, k);
  def.draw(c, frame);
  cache.set(key, cv);
  return cv;
}

/** Draws a sticker (round badge) for the sticker book. */
export function drawSticker(c, id, size, owned = true) {
  const r = size / 2;
  c.save();
  c.translate(r, r);
  circ(c, 0, 2, r * 0.94);
  c.fillStyle = 'rgba(60,40,80,0.18)';
  c.fill();
  circ(c, 0, 0, r * 0.94);
  c.fillStyle = owned ? '#ffffff' : '#ece7f2';
  c.fill();
  circ(c, 0, 0, r * 0.82);
  c.fillStyle = owned ? stickerBg(id) : '#ddd6e6';
  c.fill();
  const spriteId = id.startsWith('v-') ? 'front-' + id.slice(2) : id === 'snowman' ? 'snowmanBig' : id;
  const def = SCENERY[spriteId];
  if (def) {
    const [bw, bh] = def.box;
    const k = (r * 1.25) / Math.max(bw, bh);
    c.save();
    c.translate(-bw * k / 2, -bh * k / 2);
    c.scale(k, k);
    if (!owned) c.globalAlpha = 0.22;
    def.draw(c, spriteId === 'whale' ? 1 : 0);
    c.restore();
  }
  if (!owned) {
    c.font = `900 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#b5a9c4';
    c.fillText('?', 0, 2);
  }
  c.restore();
}

function stickerBg(id) {
  if (id.startsWith('v-')) return '#fff1b8';
  return { star: '#fff6c9', cow: '#d8f5c4', whale: '#cdeeff', snowman: '#e3efff', apple: '#ffe1e1', strawberry: '#ffe1ea', watermelon: '#e2f7da', pineapple: '#fff3c4', mikan: '#ffe9cc', grape: '#efe0ff' }[id] || '#fff';
}

/** Draws a tile scene for the course select screen. */
export function drawCourseTile(c, id, w, h) {
  const sky = c.createLinearGradient(0, 0, 0, h);
  const pal = {
    meadow: ['#7fd3ff', '#d4f3ff', '#8ee06a', '#6fcf55'],
    sea: ['#5cc8ff', '#c9f0ff', '#ffe6a6', '#4cc4f0'],
    snow: ['#9ec9ff', '#e8f2ff', '#f4f9ff', '#d6e6f8'],
  }[id];
  sky.addColorStop(0, pal[0]);
  sky.addColorStop(1, pal[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const hy = h * 0.5;
  // distant shapes
  if (id === 'snow') {
    c.fillStyle = '#c7dbf3';
    c.beginPath();
    c.moveTo(0, hy);
    c.lineTo(w * 0.2, hy - h * 0.25);
    c.lineTo(w * 0.42, hy);
    c.lineTo(w * 0.62, hy - h * 0.32);
    c.lineTo(w * 0.86, hy);
    c.closePath();
    c.fill();
  } else if (id === 'meadow') {
    c.fillStyle = '#a6e88c';
    ell(c, w * 0.2, hy + 4, w * 0.35, h * 0.14);
    c.fill();
    ell(c, w * 0.8, hy + 4, w * 0.35, h * 0.18);
    c.fill();
  }
  // sun
  circ(c, w * 0.84, h * 0.17, h * 0.09);
  c.fillStyle = '#ffe066';
  c.fill();
  c.fillStyle = pal[2];
  c.fillRect(0, hy, w, h - hy);
  if (id === 'sea') {
    c.fillStyle = pal[3];
    c.beginPath();
    c.moveTo(w * 0.62, hy);
    c.lineTo(w, hy);
    c.lineTo(w, h);
    c.lineTo(w * 0.85, h);
    c.closePath();
    c.fill();
    c.fillRect(0, hy - 2, w, 6);
  }
  // road
  c.fillStyle = id === 'snow' ? '#9fb0c8' : '#9aa0b0';
  c.beginPath();
  c.moveTo(w * 0.47, hy);
  c.lineTo(w * 0.53, hy);
  c.lineTo(w * 0.8, h);
  c.lineTo(w * 0.2, h);
  c.closePath();
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(2, w * 0.012);
  c.setLineDash([h * 0.06, h * 0.05]);
  c.beginPath();
  c.moveTo(w * 0.5, hy);
  c.lineTo(w * 0.5, h);
  c.stroke();
  c.setLineDash([]);
  const put = (sid, x, y, size, frame = 0) => {
    const img = spriteImage(sid, 256, frame);
    const def = SCENERY[sid];
    const s = size / Math.max(def.box[0], def.box[1]);
    const dw = def.box[0] * s;
    const dh = def.box[1] * s;
    c.drawImage(img, x - dw / 2, y - dh, dw, dh);
  };
  const S = Math.min(w, h * 1.3);
  if (id === 'meadow') {
    put('tree', w * 0.1, hy + h * 0.12, S * 0.3);
    put('tulips', w * 0.12, h * 0.95, S * 0.25);
    put('cow', w * 0.84, h * 0.9, S * 0.38);
    put('sunflower', w * 0.92, hy + h * 0.15, S * 0.22);
  } else if (id === 'sea') {
    put('palm', w * 0.12, h * 0.82, S * 0.42);
    put('whale', w * 0.86, hy + h * 0.2, S * 0.32, 1);
    put('crab', w * 0.15, h * 0.97, S * 0.18);
  } else {
    put('pine', w * 0.1, hy + h * 0.2, S * 0.32);
    put('snowmanBig', w * 0.86, h * 0.95, S * 0.4, 1);
    put('penguin', w * 0.14, h * 0.97, S * 0.2);
  }
}
