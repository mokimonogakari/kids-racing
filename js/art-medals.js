// Medals, the finishing rosette and the trophy: Canvas 2D only, no image files.
// Standalone on purpose (no imports) so it can be used by art.js, main.js and tests.
// Each sprite works in its own small "box" coordinate space, like art.js.

const OUT = '#3d2c3e';
const TAU = Math.PI * 2;
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", "M PLUS Rounded 1c", "Kosugi Maru", "Arial Rounded MT Bold", system-ui, sans-serif';

// ---------- primitives (same shapes as art.js) ----------
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
function star(c, x, y, r, inner = 0.5, points = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}
function shadow(c, x, y, rx, ry) {
  ell(c, x, y, rx, ry);
  c.fillStyle = 'rgba(40,30,60,0.18)';
  c.fill();
}

// ---------- colours ----------
const METALS = {
  gold: { disc: '#ffd23f', rim: '#e0a500', deep: '#c98a00', light: '#fff3a8', ink: '#8a5a00', ribbon: '#ff5a8a', ribbon2: '#ffffff' },
  silver: { disc: '#e4ebf3', rim: '#9aa8b8', deep: '#7f8d9c', light: '#ffffff', ink: '#4a5664', ribbon: '#4aa8ff', ribbon2: '#ffffff' },
  bronze: { disc: '#e8a265', rim: '#a9622c', deep: '#8c4d1e', light: '#ffd4ae', ink: '#5a2e0e', ribbon: '#5cc75c', ribbon2: '#ffffff' },
};
const BLUE = { a: '#4aa8ff', b: '#2f7fe0', c: '#8fd0ff', ink: '#1f4f8f' };

export function medalBg(id) {
  return { gold: '#fff1b8', silver: '#eef2f7', bronze: '#ffe3cf', ribbon: '#dceeff' }[id] || '#fff';
}

export function metalFor(rank) {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'ribbon';
}

// ---------- parts ----------
/** Two ribbon bands hanging from the top down to the disc. Box width 100. */
function neckRibbon(c, cx, top, bottom, m, w = 20) {
  for (const s of [-1, 1]) {
    const x0 = cx + s * w; // where the band starts at the top
    c.beginPath();
    c.moveTo(x0 - 8, top);
    c.lineTo(x0 + 8, top);
    c.lineTo(cx + s * 5, bottom);
    c.lineTo(cx - s * 5, bottom);
    c.closePath();
    fs(c, m.ribbon, 2.5);
    // white stripe in the middle of the band
    c.beginPath();
    c.moveTo(x0 - 2.5, top);
    c.lineTo(x0 + 2.5, top);
    c.lineTo(cx + s * 1.5, bottom);
    c.lineTo(cx - s * 1.5, bottom);
    c.closePath();
    c.fillStyle = m.ribbon2;
    c.fill();
  }
}

/** The metal disc with rim, shine and a small star (or nothing in the middle). */
function disc(c, x, y, r, m, withStar = true) {
  circ(c, x, y, r);
  fs(c, m.rim, 3);
  circ(c, x, y, r * 0.82);
  fs(c, m.disc, 2, m.deep);
  // inner ring
  circ(c, x, y, r * 0.66);
  c.lineWidth = Math.max(1.5, r * 0.07);
  c.strokeStyle = m.light;
  c.stroke();
  // soft lower shade
  c.save();
  circ(c, x, y, r * 0.82);
  c.clip();
  ell(c, x, y + r * 0.55, r * 0.9, r * 0.4);
  c.fillStyle = 'rgba(0,0,0,0.07)';
  c.fill();
  c.restore();
  if (withStar) {
    star(c, x, y + r * 0.04, r * 0.42, 0.5);
    fs(c, m.light, 2, m.deep);
  }
  // shine
  ell(c, x - r * 0.38, y - r * 0.4, r * 0.22, r * 0.11, -0.7);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fill();
  circ(c, x + r * 0.42, y - r * 0.3, r * 0.06);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fill();
}

/** Blue rosette (pleated ribbon) with two tails. */
function rosette(c, x, y, r, withStar = true) {
  // tails
  for (const s of [-1, 1]) {
    c.save();
    c.translate(x + s * r * 0.3, y + r * 0.45);
    c.rotate(s * 0.22);
    c.beginPath();
    c.moveTo(-r * 0.2, 0);
    c.lineTo(r * 0.2, 0);
    c.lineTo(r * 0.2, r * 1.05);
    c.lineTo(0, r * 0.88);
    c.lineTo(-r * 0.2, r * 1.05);
    c.closePath();
    fs(c, s < 0 ? BLUE.a : BLUE.b, 2.5);
    c.restore();
  }
  // pleats
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const am = (a0 + a1) / 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a0) * r * 0.78, y + Math.sin(a0) * r * 0.78);
    c.lineTo(x + Math.cos(am) * r, y + Math.sin(am) * r);
    c.lineTo(x + Math.cos(a1) * r * 0.78, y + Math.sin(a1) * r * 0.78);
    c.closePath();
    fs(c, i % 2 ? BLUE.a : BLUE.b, 2);
  }
  circ(c, x, y, r * 0.6);
  fs(c, BLUE.c, 2.5);
  circ(c, x, y, r * 0.48);
  c.lineWidth = Math.max(1.5, r * 0.05);
  c.strokeStyle = '#ffffff';
  c.stroke();
  if (withStar) {
    star(c, x, y + r * 0.03, r * 0.3, 0.5);
    fs(c, '#ffffff', 2, BLUE.ink);
  }
  ell(c, x - r * 0.25, y - r * 0.3, r * 0.14, r * 0.07, -0.7);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.fill();
}

function medalSprite(c, id) {
  const m = METALS[id];
  shadow(c, 50, 116, 34, 4);
  neckRibbon(c, 50, 0, 52, m);
  disc(c, 50, 80, 36, m, true);
}

function ribbonSprite(c) {
  shadow(c, 50, 116, 30, 4);
  // little loop at the top so it reads as a prize ribbon
  rrect(c, 40, 2, 20, 12, 5);
  fs(c, BLUE.c, 2.5);
  rosette(c, 50, 52, 38, true);
}

/** Sticker sprites (same shape as art.js SCENERY entries). Box 100x120. */
export const MEDAL_SPRITES = {
  gold: { box: [100, 120], world: 0.6, draw: (c) => medalSprite(c, 'gold') },
  silver: { box: [100, 120], world: 0.6, draw: (c) => medalSprite(c, 'silver') },
  bronze: { box: [100, 120], world: 0.6, draw: (c) => medalSprite(c, 'bronze') },
  ribbon: { box: [100, 120], world: 0.6, draw: (c) => ribbonSprite(c) },
};

/** Sun rays behind a winner's medal. */
function rays(c, x, y, r, col) {
  c.save();
  c.translate(x, y);
  c.fillStyle = col;
  for (let i = 0; i < 12; i++) {
    c.rotate(TAU / 12);
    c.beginPath();
    c.moveTo(r * 0.9, -r * 0.16);
    c.lineTo(r * 1.55, 0);
    c.lineTo(r * 0.9, r * 0.16);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function bigNumber(c, text, x, y, px, ink) {
  c.font = `900 ${Math.round(px)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, px * 0.18);
  c.strokeStyle = '#ffffff';
  c.strokeText(text, x, y);
  c.lineWidth = Math.max(1.5, px * 0.05);
  c.strokeStyle = ink;
  c.strokeText(text, x, y);
  c.fillStyle = ink;
  c.fillText(text, x, y);
}

/**
 * The medal for the goal screen: a size x size square, medal centred,
 * big rank number in the middle. 1 = gold, 2 = silver, 3 = bronze, 4+ = blue rosette.
 */
export function drawMedal(c, rank, size) {
  const n = Math.max(1, Math.floor(Number(rank) || 1));
  const id = metalFor(n);
  c.save();
  c.translate(0, 0);
  const k = size / 120;
  c.scale(k, k);
  if (id === 'ribbon') {
    shadow(c, 60, 114, 36, 5);
    rrect(c, 48, 2, 24, 14, 6);
    fs(c, BLUE.c, 2.5);
    rosette(c, 60, 56, 44, false);
    bigNumber(c, String(n), 60, 58, 40, BLUE.ink);
  } else {
    const m = METALS[id];
    shadow(c, 60, 116, 40, 5);
    rays(c, 60, 72, 42, id === 'gold' ? 'rgba(255,226,120,0.6)' : id === 'silver' ? 'rgba(220,232,245,0.7)' : 'rgba(255,205,160,0.55)');
    neckRibbon(c, 60, 0, 42, m, 22);
    disc(c, 60, 72, 42, m, false);
    bigNumber(c, String(n), 60, 74, 48, m.ink);
    // sparkles
    for (const [sx, sy, sr] of [[18, 30, 5], [104, 38, 4], [100, 108, 4.5], [14, 100, 3.5]]) {
      star(c, sx, sy, sr, 0.4, 4, 0);
      c.fillStyle = '#ffffff';
      c.fill();
    }
  }
  c.restore();
}

/** A golden cup, size x size. */
export function drawTrophy(c, size) {
  const m = METALS.gold;
  c.save();
  const k = size / 100;
  c.scale(k, k);
  shadow(c, 50, 96, 30, 4);
  // base
  rrect(c, 24, 84, 52, 10, 4);
  fs(c, m.rim, 2.5);
  rrect(c, 32, 74, 36, 12, 4);
  fs(c, m.disc, 2.5);
  // stem
  rrect(c, 43, 58, 14, 18, 5);
  fs(c, m.disc, 2.5);
  // handles
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(50 + s * 34, 30, 12, s < 0 ? Math.PI * 0.5 : Math.PI * 1.5, s < 0 ? Math.PI * 1.5 : Math.PI * 2.5, s > 0);
    c.lineWidth = 9;
    c.strokeStyle = OUT;
    c.lineCap = 'round';
    c.stroke();
    c.lineWidth = 5;
    c.strokeStyle = m.disc;
    c.stroke();
  }
  // cup
  c.beginPath();
  c.moveTo(22, 10);
  c.lineTo(78, 10);
  c.quadraticCurveTo(80, 54, 50, 64);
  c.quadraticCurveTo(20, 54, 22, 10);
  c.closePath();
  fs(c, m.disc, 3);
  rrect(c, 18, 4, 64, 10, 5);
  fs(c, m.rim, 2.5);
  // shine + star
  c.beginPath();
  c.moveTo(29, 18);
  c.quadraticCurveTo(28, 40, 38, 52);
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineCap = 'round';
  c.stroke();
  star(c, 52, 36, 11, 0.5);
  fs(c, '#ffffff', 2, m.deep);
  c.restore();
}
