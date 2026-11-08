// Circuit-mode HUD in the style of a serious driving simulator (original design):
// POS / LAP panel, lap timer with delta, tachometer with gear + rev lights,
// a small one-lap track map, and lap banners.
// Usage: drawSimHud(r, race, t) — r is the Renderer (r.c, r.W, r.H, r.safe, r.dt).
import { rrect } from './art.js';
import { drawRankBadge, rankBadgePos } from './render-hud.js';

const FONT = '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", system-ui, sans-serif';
const MONO = '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
const PANEL = 'rgba(14,18,28,0.78)';
const EDGE = 'rgba(255,255,255,0.16)';
const ACCENT = '#ff3b5c';
const BEST = '#c070ff'; // purple = best lap
const GOOD = '#36d17a';
const BAD = '#ff5a5a';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** 'm:ss.mmm' */
export function formatLap(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return '-:--.---';
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** '+0.412' / '-1.205' */
export function formatDelta(d) {
  if (!Number.isFinite(d)) return '';
  return `${d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(3)}`;
}

function small(r) {
  return r.H <= 430;
}

function panel(c, x, y, w, h, rad = 10) {
  c.fillStyle = PANEL;
  rrect(c, x, y, w, h, rad);
  c.fill();
  c.strokeStyle = EDGE;
  c.lineWidth = 1.5;
  c.stroke();
}

function text(c, s, x, y, size, color, align = 'left', font = FONT, weight = 800) {
  c.font = `${weight} ${size}px ${font}`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(s, x, y);
}

// ---------------------------------------------------------------- POS / LAP
function drawPosLap(r, race) {
  const c = r.c;
  const sm = small(r);
  const x = r.safe.left + 12;
  const y = r.safe.top + (sm ? 64 : 92);
  const w = sm ? 150 : 168;
  const h = sm ? 50 : 58;
  const racers = (race.rivals ? race.rivals.length : 5) + 1;
  const laps = num(race.course && race.course.laps, 3);
  const lap = clamp(num(race.lap, 1), 1, laps);
  panel(c, x, y, w, h);
  // accent bar
  c.fillStyle = ACCENT;
  rrect(c, x, y, 5, h, 3);
  c.fill();
  const half = w / 2;
  const lab = sm ? 10 : 11;
  const big = sm ? 22 : 26;
  text(c, 'POS', x + 14, y + 13, lab, 'rgba(255,255,255,0.6)', 'left', MONO, 700);
  text(c, 'LAP', x + half + 6, y + 13, lab, 'rgba(255,255,255,0.6)', 'left', MONO, 700);
  const rank = clamp(num(race.rank, 1), 1, racers);
  c.font = `900 ${big}px ${MONO}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.fillStyle = '#fff';
  const ry = y + h - 10;
  c.fillText(String(rank), x + 14, ry);
  let rw = c.measureText(String(rank)).width;
  c.font = `700 ${big * 0.55}px ${MONO}`;
  c.fillStyle = 'rgba(255,255,255,0.65)';
  c.fillText(`/${racers}`, x + 16 + rw, ry);
  c.font = `900 ${big}px ${MONO}`;
  c.fillStyle = race.lap >= laps ? '#ffd23f' : '#fff';
  c.fillText(String(lap), x + half + 6, ry);
  rw = c.measureText(String(lap)).width;
  c.font = `700 ${big * 0.55}px ${MONO}`;
  c.fillStyle = 'rgba(255,255,255,0.65)';
  c.fillText(`/${laps}`, x + half + 8 + rw, ry);
  // divider
  c.fillStyle = EDGE;
  c.fillRect(x + half - 3, y + 10, 1.5, h - 20);
  return { x, y, w, h };
}

// ---------------------------------------------------------------- lap timer
function drawLapTimer(r, race, box) {
  const c = r.c;
  const sm = small(r);
  const x = box.x;
  const y = box.y + box.h + 6;
  const w = box.w;
  const h = sm ? 46 : 54;
  const now = num(race.time, 0);
  const start = num(race.lapStart, 3);
  const racing = race.state === 'race';
  const cur = racing ? Math.max(0, now - start) : race.state === 'goal' ? 0 : 0;
  const times = Array.isArray(race.lapTimes) ? race.lapTimes : [];
  const best = num(race.bestLap, 0);
  panel(c, x, y, w, h);
  const lab = sm ? 9 : 10;
  const f1 = sm ? 15 : 17;
  text(c, 'TIME', x + 10, y + 12, lab, 'rgba(255,255,255,0.55)', 'left', MONO, 700);
  text(c, racing ? formatLap(cur) : times.length ? formatLap(times[times.length - 1]) : formatLap(0), x + w - 10, y + 13, f1, '#fff', 'right', MONO, 800);
  text(c, 'BEST', x + 10, y + h - 13, lab, 'rgba(255,255,255,0.55)', 'left', MONO, 700);
  text(c, formatLap(best), x + w - 10, y + h - 12, f1 - 2, best > 0 ? BEST : 'rgba(255,255,255,0.5)', 'right', MONO, 800);
  // delta vs best, shown for 3 s after each lap
  const lastAt = num(race.lapStart, -99);
  if (times.length && best > 0 && now - lastAt < 3) {
    const last = times[times.length - 1];
    const d = last - best;
    const isBest = Math.abs(d) < 1e-6 && times.length > 0;
    const label = isBest ? 'BEST' : formatDelta(d);
    const col = isBest ? BEST : d <= 0 ? GOOD : BAD;
    const bx = x + w + 6;
    const bw = sm ? 62 : 70;
    c.fillStyle = col;
    rrect(c, bx, y + h / 2 - 12, bw, 24, 6);
    c.fill();
    text(c, label, bx + bw / 2, y + h / 2, sm ? 12 : 13, '#fff', 'center', MONO, 800);
  }
  return { x, y, w, h };
}

// ---------------------------------------------------------------- tachometer
function gearOf(race) {
  const g = race.player && race.player.gear;
  if (Number.isFinite(g)) return g;
  const pct = clamp(num(race.speedPct, 0), 0, 1.5);
  return pct < 0.02 ? 1 : Math.min(6, 1 + Math.floor(pct * 5.99));
}

function rpmOf(race) {
  const v = race.player && race.player.rpm;
  if (Number.isFinite(v)) return clamp(v, 0, 1);
  const pct = clamp(num(race.speedPct, 0), 0, 1);
  const g = gearOf(race);
  return clamp(pct * 6 - (g - 1), 0, 1);
}

export function tachoLayout(r) {
  const sm = small(r);
  const R = sm ? 54 : 66;
  const cx = r.W - r.safe.right - R - 18;
  const cy = r.H - r.safe.bottom - (sm ? 118 : 168);
  return { cx, cy, R };
}

function drawTacho(r, race, t) {
  const c = r.c;
  const { cx, cy, R } = tachoLayout(r);
  const target = rpmOf(race);
  r._simRpm = num(r._simRpm, target);
  r._simRpm += (target - r._simRpm) * Math.min(1, num(r.dt, 1 / 60) * 14);
  const rpm = clamp(r._simRpm, 0, 1);
  const A0 = Math.PI * 0.75; // start (lower-left)
  const SW = Math.PI * 1.5; // sweep 270°
  const MAXK = 9; // ×1000 rpm
  const red = 7.5 / MAXK;

  c.save();
  // body
  c.fillStyle = 'rgba(10,13,22,0.86)';
  c.beginPath();
  c.arc(cx, cy, R + 6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.lineWidth = 2;
  c.stroke();
  // red zone
  c.strokeStyle = 'rgba(255,59,92,0.85)';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(cx, cy, R - 4, A0 + SW * red, A0 + SW);
  c.stroke();
  // active arc (white up to the red line, then bright red)
  c.globalAlpha = 0.9;
  c.lineWidth = 4;
  c.strokeStyle = '#ffffff';
  c.beginPath();
  c.arc(cx, cy, R - 4, A0, A0 + SW * Math.min(rpm, red));
  c.stroke();
  if (rpm > red) {
    c.strokeStyle = '#ff9aac';
    c.beginPath();
    c.arc(cx, cy, R - 4, A0 + SW * red, A0 + SW * rpm);
    c.stroke();
  }
  c.globalAlpha = 1;
  // ticks
  for (let k = 0; k <= MAXK * 2; k++) {
    const f = k / (MAXK * 2);
    const a = A0 + SW * f;
    const major = k % 2 === 0;
    const r1 = R - (major ? 15 : 11);
    const r2 = R - 7;
    c.strokeStyle = f >= red ? ACCENT : 'rgba(255,255,255,0.8)';
    c.lineWidth = major ? 2.2 : 1.2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    c.stroke();
    if (major) {
      const rt = R - 24;
      text(c, String(k / 2), cx + Math.cos(a) * rt, cy + Math.sin(a) * rt, R * 0.15, f >= red ? ACCENT : 'rgba(255,255,255,0.75)', 'center', MONO, 700);
    }
  }
  // needle
  const na = A0 + SW * rpm + (rpm > 0.97 ? Math.sin(t * 60) * 0.015 : 0);
  c.strokeStyle = ACCENT;
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - Math.cos(na) * 8, cy - Math.sin(na) * 8);
  c.lineTo(cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10));
  c.stroke();
  c.fillStyle = '#20242f';
  c.beginPath();
  c.arc(cx, cy, 7, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = ACCENT;
  c.lineWidth = 2;
  c.stroke();
  // gear
  const g = gearOf(race);
  text(c, String(g), cx + R * 0.02, cy + R * 0.42, R * 0.5, '#fff', 'center', MONO, 900);
  // speed (big digital) under the dial
  const kmh = Math.round(num(race.kmh, 0));
  const sw = R * 1.5;
  const sy = cy + R + 12;
  c.fillStyle = 'rgba(10,13,22,0.86)';
  rrect(c, cx - sw / 2, sy - 2, sw, R * 0.44, 7);
  c.fill();
  c.strokeStyle = EDGE;
  c.lineWidth = 1.5;
  c.stroke();
  text(c, String(kmh), cx + 6, sy + R * 0.2, R * 0.32, '#fff', 'right', MONO, 900);
  text(c, 'km/h', cx + 10, sy + R * 0.23, R * 0.16, 'rgba(255,255,255,0.6)', 'left', MONO, 700);
  // boost glow
  if (race.player && race.player.boost > 0) {
    c.strokeStyle = `rgba(80,190,255,${0.5 + 0.3 * Math.sin(t * 20)})`;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cy, R + 9, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
  drawRevLights(r, rpm, cx, cy - R - 20, t);
}

function drawRevLights(r, rpm, cx, y, t) {
  const c = r.c;
  const n = 10;
  const size = small(r) ? 8 : 9;
  const gap = 3;
  const w = n * size + (n - 1) * gap;
  const x0 = cx - w / 2;
  const lit = clamp((rpm - 0.55) / 0.4, 0, 1) * n;
  const flash = rpm > 0.96 && Math.floor(t * 12) % 2 === 0;
  c.save();
  c.fillStyle = 'rgba(10,13,22,0.8)';
  rrect(c, x0 - 6, y - size / 2 - 5, w + 12, size + 10, 6);
  c.fill();
  for (let i = 0; i < n; i++) {
    const col = i < 4 ? GOOD : i < 7 ? '#ffd23f' : i < 9 ? ACCENT : '#5aa8ff';
    const on = flash || i < lit;
    c.globalAlpha = on ? 1 : 0.18;
    c.fillStyle = flash ? '#5aa8ff' : col;
    c.beginPath();
    c.arc(x0 + i * (size + gap) + size / 2, y, size / 2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ---------------------------------------------------------------- mini map
/** One-lap path (0..1 box) from course.segments[0..lapLength), cached on the course. */
export function lapPath(course) {
  if (!course) return null;
  if (course._lapPath) return course._lapPath;
  const segs = course.segments || [];
  const n = Math.max(2, Math.min(segs.length, num(course.lapLength, segs.length)));
  const raw = [];
  let x = 0;
  let y = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    h += num(segs[i] && segs[i].curve, 0) * 0.02;
    x += Math.sin(h);
    y -= Math.cos(h);
    raw.push(x, y);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < raw.length; i += 2) {
    minX = Math.min(minX, raw[i]); maxX = Math.max(maxX, raw[i]);
    minY = Math.min(minY, raw[i + 1]); maxY = Math.max(maxY, raw[i + 1]);
  }
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  const ox = (s - (maxX - minX)) / 2;
  const oy = (s - (maxY - minY)) / 2;
  const pts = [];
  for (let i = 0; i < raw.length; i += 2) pts.push({ x: (raw[i] - minX + ox) / s, y: (raw[i + 1] - minY + oy) / s });
  course._lapPath = { pts, n };
  return course._lapPath;
}

function lapPoint(path, z) {
  const segLen = 200;
  const lapZ = path.n * segLen;
  let zz = num(z, 0) % lapZ;
  if (zz < 0) zz += lapZ;
  const f = zz / segLen;
  const i = Math.floor(f);
  const a = path.pts[i % path.n];
  const b = path.pts[(i + 1) % path.n];
  const k = f - i;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

const DOT = { bear: '#b07a4f', rabbit: '#f4f0f6', frog: '#6cc56a', pig: '#ffaec0', cat: '#ffb347' };

function drawLapMap(r, race) {
  const path = lapPath(race.course);
  if (!path) return;
  const c = r.c;
  const sm = small(r);
  const S = sm ? 78 : 96;
  const x = sm ? r.W / 2 + 120 : r.W - r.safe.right - S - 14;
  const y = sm ? r.safe.top + 8 : r.safe.top + 175;
  if (x + S > r.W - r.safe.right - 2) return;
  panel(c, x, y, S, S, 10);
  const pad = 9;
  const P = (p) => [x + pad + p.x * (S - pad * 2), y + pad + p.y * (S - pad * 2)];
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const [col, lw] of [['rgba(0,0,0,0.6)', 6], ['#e8ecf2', 3.2]]) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    path.pts.forEach((p, i) => {
      const [px, py] = P(p);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    });
    c.stroke();
  }
  // start/finish
  const [sx, sy] = P(path.pts[0]);
  c.fillStyle = '#fff';
  c.fillRect(sx - 4, sy - 1.5, 8, 3);
  c.fillStyle = '#111';
  c.fillRect(sx - 4, sy - 1.5, 2, 1.5);
  c.fillRect(sx, sy - 1.5, 2, 1.5);
  c.fillRect(sx - 2, sy, 2, 1.5);
  c.fillRect(sx + 2, sy, 2, 1.5);
  // cars
  for (const rv of race.rivals || []) {
    const [px, py] = P(lapPoint(path, rv.z));
    c.fillStyle = (rv.car && rv.car.color) || DOT[rv.animal] || '#9aa4b5';
    c.strokeStyle = '#111';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(px, py, 3.4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  if (race.player) {
    const [px, py] = P(lapPoint(path, race.player.z));
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(px, py, 5.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ACCENT;
    c.beginPath();
    c.arc(px, py, 4, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ---------------------------------------------------------------- banners
/** Horizontal band ("ファイナルラップ", "ベストラップ！"), slides in/out over 2.2 s. */
export function drawLapBanner(r, label, t0, t) {
  const age = num(t, 0) - num(t0, 0);
  if (!label || age < 0 || age > 2.2) return false;
  const c = r.c;
  const inK = clamp(age / 0.25, 0, 1);
  const outK = clamp((2.2 - age) / 0.3, 0, 1);
  const k = Math.min(inK, outK);
  const ease = 1 - Math.pow(1 - k, 3);
  const h = small(r) ? 44 : 56;
  const y = r.H * (small(r) ? 0.62 : 0.44);
  const best = /ベスト|BEST/.test(label);
  c.save();
  c.globalAlpha = ease;
  const w = r.W * ease;
  const x = (r.W - w) / 2;
  c.fillStyle = 'rgba(10,13,22,0.82)';
  c.fillRect(x, y - h / 2, w, h);
  c.fillStyle = best ? BEST : ACCENT;
  c.fillRect(x, y - h / 2, w, 3);
  c.fillRect(x, y + h / 2 - 3, w, 3);
  // moving stripe
  c.fillStyle = 'rgba(255,255,255,0.08)';
  const sx = ((age * 600) % (r.W + 200)) - 100;
  c.beginPath();
  c.moveTo(sx, y - h / 2);
  c.lineTo(sx + 60, y - h / 2);
  c.lineTo(sx + 20, y + h / 2);
  c.lineTo(sx - 40, y + h / 2);
  c.fill();
  text(c, label, r.W / 2, y + 1, h * 0.5, best ? '#f0d4ff' : '#fff', 'center', FONT, 900);
  c.restore();
  return true;
}

// ---------------------------------------------------------------- entry
export function drawSimHud(r, race, t) {
  if (!r || !r.c || !race) return;
  const c = r.c;
  c.save();
  try {
    const box = drawPosLap(r, race);
    const tbox = drawLapTimer(r, race, box);
    drawLapMap(r, race);
    drawTacho(r, race, t);
    // Big friendly rank badge for small children (top centre).
    // In portrait the centre badge would sit on the POS panel, so move it under the timer.
    try {
      if (!small(r)) {
        const pos = rankBadgePos(r);
        const tx = tbox.x + pos.radius + 4;
        const ty = tbox.y + tbox.h + pos.radius + 14;
        c.save();
        c.translate(tx - pos.x, ty - pos.y);
        drawRankBadge(r, race, t);
        c.restore();
      } else {
        drawRankBadge(r, race, t);
      }
    } catch (e) {
      /* optional */
    }
    if (r.lapBanner) {
      if (!drawLapBanner(r, r.lapBanner.text, r.lapBanner.t0, t)) r.lapBanner = null;
    }
  } finally {
    c.restore();
  }
}
