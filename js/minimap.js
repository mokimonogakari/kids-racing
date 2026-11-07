// Mini map: a 2D sketch of the course with everyone's position on it.
// buildTrackPath() is pure (used by tests); drawMinimap() draws into the HUD.
import { SEGMENT_LENGTH } from './physics.js';
import { ANIMAL_COLORS, rrect } from './art.js';

const PANEL = 106;
const PAD = 11;

/**
 * Turn the segment curves into a 2D polyline, one point per segment, scaled to fit a 0..1 box
 * (aspect kept). Only the raced part (up to the goal) is used for the fit; the run-out after the
 * goal is clamped into the box so positions past the line never leave the map.
 * @returns {{ pts: Array<{x:number,y:number}>, goalIndex: number }}
 */
export function buildTrackPath(course) {
  const segs = course.segments || [];
  const goalIndex = Math.min(course.goalIndex ?? segs.length - 1, Math.max(0, segs.length - 1));
  const raw = [];
  let heading = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs.length; i++) {
    raw.push({ x, y });
    heading += (segs[i].curve || 0) * 0.02;
    x += Math.sin(heading);
    y -= Math.cos(heading);
  }
  if (!raw.length) return { pts: [], goalIndex: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= goalIndex; i++) {
    const p = raw[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = 1 / Math.max(w, h, 1e-6);
  const ox = (1 - w * scale) / 2;
  const oy = (1 - h * scale) / 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const pts = raw.map((p) => ({
    x: clamp01((p.x - minX) * scale + ox),
    y: clamp01((p.y - minY) * scale + oy),
  }));
  return { pts, goalIndex };
}

function pathFor(race) {
  const course = race.course;
  if (!course._path || course._path.pts.length !== course.segments.length) course._path = buildTrackPath(course);
  return course._path;
}

/** Map a world z onto the polyline (interpolated inside the segment). */
export function pointAt(path, z) {
  const pts = path.pts;
  const n = pts.length;
  if (!n) return { x: 0.5, y: 0.5 };
  const f = z / SEGMENT_LENGTH;
  const i = Math.max(0, Math.min(n - 1, Math.floor(f)));
  const a = pts[i];
  const b = pts[Math.min(n - 1, i + 1)];
  const k = Math.max(0, Math.min(1, f - i));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Draws the mini map panel on the right side of the screen. */
export function drawMinimap(r, race, t) {
  const c = r.c;
  if (!c || !race || !race.course) return;
  const path = pathFor(race);
  if (!path.pts.length) return;
  const small = r.H <= 430;
  // Landscape: both side columns are taken (pause + speedometer on the right, star pill + horn on
  // the left), so the map sits right of the rank badge, above the road, clear of the player's car.
  const px = small ? Math.round(r.W / 2) + 140 : r.W - (r.safe?.right || 0) - 118;
  const py = (r.safe?.top || 0) + (small ? 44 : 175);
  const inner = PANEL - PAD * 2;
  const toX = (p) => px + PAD + p.x * inner;
  const toY = (p) => py + PAD + p.y * inner;

  c.save();
  c.globalAlpha = race.state === 'countdown' ? 0.75 : 0.92;
  rrect(c, px, py, PANEL, PANEL, 18);
  c.fillStyle = 'rgba(255,255,255,0.82)';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#3d2c3e';
  c.stroke();

  // the course: dark edge, then a lighter road on top
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i <= path.goalIndex; i++) {
    const p = path.pts[i];
    if (i === 0) c.moveTo(toX(p), toY(p));
    else c.lineTo(toX(p), toY(p));
  }
  c.lineWidth = 8;
  c.strokeStyle = '#3d2c3e';
  c.stroke();
  c.lineWidth = 5;
  c.strokeStyle = '#ffffff';
  c.stroke();
  c.lineWidth = 2.2;
  c.strokeStyle = '#b9bcca';
  c.stroke();

  // goal: a small checkered flag square
  const g = path.pts[path.goalIndex];
  const gx = toX(g);
  const gy = toY(g);
  const cell = 3.5;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      c.fillStyle = (i + j) % 2 ? '#3d2c3e' : '#ffffff';
      c.fillRect(gx - cell + i * cell, gy - cell + j * cell, cell, cell);
    }
  }
  c.lineWidth = 1;
  c.strokeStyle = '#3d2c3e';
  c.strokeRect(gx - cell, gy - cell, cell * 2, cell * 2);

  // ghost of the best run: a faint white dot under everyone
  let ghost = null;
  try {
    ghost = typeof race.ghostPos === 'function' ? race.ghostPos() : null;
  } catch (e) {
    ghost = null;
  }
  if (ghost && Number.isFinite(ghost.z)) {
    const gp = pointAt(path, ghost.z);
    c.save();
    c.globalAlpha = 0.8;
    c.beginPath();
    c.arc(toX(gp), toY(gp), 4.5, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
    c.setLineDash([2, 2]);
    c.lineWidth = 1.5;
    c.strokeStyle = '#8a7fa3';
    c.stroke();
    c.restore();
  }

  // rivals
  const colors = ANIMAL_COLORS || {};
  for (const rv of race.rivals || []) {
    const p = pointAt(path, rv.z);
    const col = colors[rv.animal] || { fur: '#c08a55', kart: '#4aa8ff' };
    c.beginPath();
    c.arc(toX(p), toY(p), 4, 0, Math.PI * 2);
    c.fillStyle = col.fur;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#3d2c3e';
    c.stroke();
  }
  // the player, always on top and a little bigger
  const pp = pointAt(path, race.player.z);
  const pulse = 1 + Math.sin(t * 6) * 0.08;
  c.beginPath();
  c.arc(toX(pp), toY(pp), 5.5 * pulse, 0, Math.PI * 2);
  c.fillStyle = '#ff5252';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = '#ffffff';
  c.stroke();
  c.lineWidth = 1.2;
  c.strokeStyle = '#3d2c3e';
  c.stroke();
  c.restore();
}
