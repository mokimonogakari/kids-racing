// Race HUD pieces drawn on the main canvas: rank badge, speedometer, position dots,
// pop-up text ("ぬいた！") and the F1-style start lights. Pure drawing, no DOM.
// Every function takes the Renderer instance `r` (see render.js) and restores the context.
import * as art from './art.js';
import { rrect } from './art.js';

const INK = '#3d2c3e';
const FONT = '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", system-ui, sans-serif';
// Fallback while art.js does not export ANIMAL_COLORS yet (same values as its ANIMALS table).
const DEFAULT_COLORS = {
  bear: { fur: '#c08a55', kart: '#4aa8ff' },
  rabbit: { fur: '#ffffff', kart: '#ff7eb6' },
  frog: { fur: '#7ed957', kart: '#ffd23f' },
  pig: { fur: '#ffb8cb', kart: '#5cd6a0' },
  cat: { fur: '#ffb347', kart: '#a77bff' },
};
const RANK_COLORS = {
  1: ['#fff1a8', '#ffd23f', '#e8a400'],
  2: ['#ffffff', '#dfe5ee', '#aab4c3'],
  3: ['#ffd9b3', '#e8a26a', '#b8692e'],
  other: ['#ffffff', '#f4f2f8', '#d9d3e3'],
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function colorsFor(animal) {
  const table = art.ANIMAL_COLORS || DEFAULT_COLORS;
  return table[animal] || DEFAULT_COLORS[animal] || { fur: '#ffd23f', kart: '#4aa8ff' };
}
function dtOf(r) {
  return r.dt > 0 ? r.dt : 1 / 60;
}
/** Outlined text (white, then colour) in the rounded font. */
function labelText(c, text, x, y, size, fill, stroke = '#ffffff', strokeW = size * 0.22) {
  c.font = `900 ${Math.round(size)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (strokeW > 0) {
    c.lineWidth = strokeW;
    c.strokeStyle = stroke;
    c.strokeText(text, x, y);
  }
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

/** Centre of the rank badge: top centre, aligned with the pause / star-count row. */
export function rankBadgePos(r) {
  const L = r.hudLayout();
  const radius = L.icon * 0.95;
  const x = r.W / 2;
  const y = Math.max(r.safe.top + 138, L.countY + L.icon * 0.62 + 10 + radius);
  return { x, y, radius };
}

/**
 * Big round badge showing the current position ("3" + small "い").
 * Gold / silver / bronze for the podium places, white otherwise.
 * `r.rankPulse` (0..1) makes it pop when the rank just changed; it decays here.
 */
export function drawRankBadge(r, race, t) {
  const c = r.c;
  const rank = clamp(Math.round(race.rank || 1), 1, 9);
  const { x, y, radius } = rankBadgePos(r);
  const pulse = clamp(r.rankPulse || 0, 0, 1);
  const cols = RANK_COLORS[rank] || RANK_COLORS.other;
  const scale = 1 + pulse * 0.25 + Math.sin(t * 3) * 0.015;
  c.save();
  if (race.state === 'countdown') c.globalAlpha = 0.55;
  c.translate(x, y);
  c.scale(scale, scale);
  // glow when the rank just changed
  if (pulse > 0) {
    c.beginPath();
    c.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    c.fillStyle = `rgba(255, 240, 140, ${(pulse * 0.6).toFixed(3)})`;
    c.fill();
  }
  // soft shadow
  c.beginPath();
  c.arc(0, radius * 0.1, radius, 0, Math.PI * 2);
  c.fillStyle = 'rgba(61,44,62,0.25)';
  c.fill();
  // disc
  const g = c.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.55, cols[1]);
  g.addColorStop(1, cols[2]);
  c.beginPath();
  c.arc(0, 0, radius, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(3, radius * 0.11);
  c.strokeStyle = INK;
  c.stroke();
  // inner ring
  c.beginPath();
  c.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
  c.lineWidth = Math.max(1.5, radius * 0.05);
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.stroke();
  // crown for the leader
  if (rank === 1) {
    const cw = radius * 0.62;
    const cy = -radius * 1.08;
    c.beginPath();
    c.moveTo(-cw, cy);
    c.lineTo(-cw * 1.05, cy - cw * 0.9);
    c.lineTo(-cw * 0.5, cy - cw * 0.45);
    c.lineTo(0, cy - cw * 1.1);
    c.lineTo(cw * 0.5, cy - cw * 0.45);
    c.lineTo(cw * 1.05, cy - cw * 0.9);
    c.lineTo(cw, cy);
    c.closePath();
    c.fillStyle = '#ffd23f';
    c.fill();
    c.lineWidth = Math.max(2, radius * 0.07);
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.stroke();
    for (const [px, py] of [[-cw * 0.95, cy - cw * 0.9], [0, cy - cw * 1.1], [cw * 0.95, cy - cw * 0.9]]) {
      c.beginPath();
      c.arc(px, py, radius * 0.07, 0, Math.PI * 2);
      c.fillStyle = '#ff5a8a';
      c.fill();
    }
  }
  // number + "い"
  labelText(c, String(rank), -radius * 0.08, radius * 0.04, radius * 1.25, INK, '#ffffff', radius * 0.2);
  labelText(c, 'い', radius * 0.55, radius * 0.5, radius * 0.5, INK, '#ffffff', radius * 0.12);
  c.restore();
  r.rankPulse = Math.max(0, (r.rankPulse || 0) - dtOf(r) * 2);
}

/** Half-dial speedometer above the right steering pad. Needle follows race.kmh (0..160). */
export function drawSpeedo(r, race, t) {
  const c = r.c;
  const low = r.H <= 430;
  const R = clamp(Math.min(r.W, r.H) * 0.16, 44, 64);
  const cx = r.W - r.safe.right - 72;
  const cy = r.H - r.safe.bottom - (low ? 125 : 150);
  const boost = race.player && race.player.boost > 0;
  const kmh = Math.max(0, race.kmh || 0);
  const target = clamp(kmh / 160, 0, 1);
  const dt = dtOf(r);
  const k = 1 - Math.pow(0.0003, dt); // smooth needle (~fast but not twitchy)
  r.speedoFrac = (r.speedoFrac ?? 0) + (target - (r.speedoFrac ?? 0)) * k;
  let frac = clamp(r.speedoFrac, 0, 1);
  if (boost) frac = clamp(frac + (Math.random() - 0.5) * 0.03, 0, 1.03);
  c.save();
  c.translate(cx, cy);
  // dial body (upper half disc) with a flat base plate
  c.beginPath();
  c.arc(0, 0, R, Math.PI, 0);
  c.closePath();
  c.fillStyle = 'rgba(255,255,255,0.93)';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  // red zone (last quarter of the upper half: angles run from π on the left to 2π on the right)
  c.beginPath();
  c.arc(0, 0, R * 0.86, Math.PI * 1.75, Math.PI * 2);
  c.lineWidth = R * 0.14;
  c.strokeStyle = '#ff5a5a';
  c.lineCap = 'butt';
  c.stroke();
  // boost glow
  if (boost) {
    c.beginPath();
    c.arc(0, 0, R + 4, Math.PI, 0);
    c.lineWidth = 7;
    c.strokeStyle = `rgba(255, ${Math.round(120 + Math.sin(t * 18) * 60)}, 60, ${(0.6 + Math.sin(t * 12) * 0.3).toFixed(3)})`;
    c.stroke();
  }
  // ticks every 20 km/h
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const big = i % 2 === 0;
    const r0 = R * (big ? 0.68 : 0.76);
    const r1 = R * 0.9;
    c.beginPath();
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    c.lineWidth = big ? 3 : 2;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.stroke();
  }
  // needle
  const a = Math.PI + frac * Math.PI;
  c.beginPath();
  c.moveTo(Math.cos(a + Math.PI / 2) * R * 0.06, Math.sin(a + Math.PI / 2) * R * 0.06);
  c.lineTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82);
  c.lineTo(Math.cos(a - Math.PI / 2) * R * 0.06, Math.sin(a - Math.PI / 2) * R * 0.06);
  c.closePath();
  c.fillStyle = boost ? '#ff3b3b' : '#ff5a8a';
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = INK;
  c.stroke();
  // hub
  c.beginPath();
  c.arc(0, 0, R * 0.11, 0, Math.PI * 2);
  c.fillStyle = INK;
  c.fill();
  c.beginPath();
  c.arc(-R * 0.03, -R * 0.03, R * 0.04, 0, Math.PI * 2);
  c.fillStyle = '#ffffff';
  c.fill();
  // km/h readout under the dial
  const lw = R * 1.1;
  const lh = R * 0.42;
  rrect(c, -lw / 2, R * 0.08, lw, lh, lh / 2);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.stroke();
  c.font = `900 ${Math.round(lh * 0.62)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = boost ? '#ff3b3b' : INK;
  c.fillText(`${Math.round(kmh)}`, -lw * 0.12, R * 0.08 + lh / 2 + 1);
  c.font = `700 ${Math.round(lh * 0.36)}px ${FONT}`;
  c.fillStyle = '#6b5a6d';
  c.fillText('km/h', lw * 0.26, R * 0.08 + lh / 2 + 2);
  c.restore();
}

/** Rival dots on the progress bar (x0..x1 at height y). The player's icon is drawn by render.js. */
export function drawPositionBar(r, race, t, x0, x1, y) {
  const c = r.c;
  const goalZ = race.course && race.course.goalZ > 0 ? race.course.goalZ : 1;
  const rivals = (race.rivals || []).slice().sort((a, b) => a.z - b.z); // leader drawn last (on top)
  c.save();
  c.lineJoin = 'round';
  for (const rv of rivals) {
    const f = clamp(rv.z / goalZ, 0, 1);
    const x = x0 + (x1 - x0) * f;
    const bob = rv.boost > 0 ? Math.sin(t * 20) * 1.5 : 0;
    const col = colorsFor(rv.animal);
    c.beginPath();
    c.arc(x, y + bob, 7, 0, Math.PI * 2);
    c.fillStyle = col.fur;
    c.fill();
    c.lineWidth = 4.5;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = 2.5;
    c.strokeStyle = '#ffffff';
    c.stroke();
    // tiny kart-colour centre so white rabbit stays visible on the white bar
    c.beginPath();
    c.arc(x, y + bob, 2.4, 0, Math.PI * 2);
    c.fillStyle = col.kart;
    c.fill();
  }
  c.restore();
}

/** Pop-up text set by renderer.flash(text): `r.flashInfo = { text, t0 }` (t0 in seconds). */
export function drawFlash(r, t) {
  const f = r.flashInfo;
  if (!f || typeof f.t0 !== 'number') return;
  const age = t - f.t0;
  if (age < 0 || age > 1.3) {
    r.flashInfo = null;
    return;
  }
  const c = r.c;
  const scale = age < 0.15 ? 0.3 + 0.85 * (age / 0.15) : age < 0.3 ? 1.15 - 0.15 * ((age - 0.15) / 0.15) : 1;
  const alpha = age > 1.0 ? Math.max(0, 1 - (age - 1.0) / 0.3) : 1;
  const size = Math.max(28, Math.min(r.W, r.H) * 0.12);
  const x = r.W / 2;
  const y = r.HZ + (r.H - r.HZ) * (r.portrait ? 0.22 : 0.33); // over the road, above the car
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(Math.sin(t * 6) * 0.04);
  c.scale(scale, scale);
  c.font = `900 ${Math.round(size)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = size * 0.3;
  c.strokeStyle = '#ffffff';
  c.strokeText(f.text, 0, 0);
  c.lineWidth = size * 0.12;
  c.strokeStyle = '#ff5a8a';
  c.strokeText(f.text, 0, 0);
  c.fillStyle = '#ffd23f';
  c.fillText(f.text, 0, 0);
  c.restore();
}

/**
 * F1-style start lights: five lamps on a black gantry. `st` = seconds since the countdown began.
 * Red lamps light one by one every 0.6 s, all turn green at 3 s, then the gantry fades by 3.8 s.
 */
export function drawStartLights(r, st, t) {
  const c = r.c;
  const fade = st > 3 ? Math.max(0, 1 - (st - 3) / 0.8) : 1;
  if (fade <= 0) return;
  const R = Math.max(9, Math.min(r.W, r.H) * 0.042);
  const gap = R * 2.3;
  const w = gap * 5 + R * 1.4;
  const h = R * 2.9;
  const x = r.W / 2 - w / 2;
  const y = r.HZ - h * (r.portrait ? 1.5 : 1.7);
  const lit = st >= 3 ? 5 : Math.min(5, Math.floor(st / 0.6) + 1);
  const green = st >= 3;
  c.save();
  c.globalAlpha = fade;
  // hanging bar
  c.fillStyle = '#2a2533';
  c.fillRect(r.W / 2 - w * 0.6, y - R * 0.5, w * 1.2, R * 0.35);
  // gantry box
  rrect(c, x, y, w, h, h / 2.6);
  c.fillStyle = '#2a2533';
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = '#ffffff';
  c.stroke();
  for (let i = 0; i < 5; i++) {
    const lx = x + R * 0.7 + gap * (i + 0.5);
    const ly = y + h / 2;
    const on = green || i < lit;
    if (on) {
      const glow = c.createRadialGradient(lx, ly, R * 0.3, lx, ly, R * 1.9);
      glow.addColorStop(0, green ? 'rgba(92,219,106,0.75)' : 'rgba(255,90,90,0.75)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      c.beginPath();
      c.arc(lx, ly, R * 1.9, 0, Math.PI * 2);
      c.fillStyle = glow;
      c.fill();
    }
    c.beginPath();
    c.arc(lx, ly, R, 0, Math.PI * 2);
    c.fillStyle = on ? (green ? '#5cdb6a' : '#ff4b4b') : '#171320';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#0d0b12';
    c.stroke();
    if (on) {
      c.beginPath();
      c.arc(lx - R * 0.3, ly - R * 0.32, R * 0.26, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill();
    }
  }
  c.restore();
}
