// Best-run "ghost" storage: one trace per course, kept only when the time improves.
import { readJSON, writeJSON } from './storage.js';

export const GHOST_KEY = 'buubuu-race.ghost.v1';
export const MAX_POINTS = 1500;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Keep a valid [t, x, z] trace, thinned evenly to at most `max` points (first and last kept). */
export function thinTrace(trace, max = MAX_POINTS) {
  if (!Array.isArray(trace)) return [];
  const pts = trace.filter((p) => Array.isArray(p) && p.length >= 3 && num(p[0]) && num(p[1]) && num(p[2]))
    .map((p) => [p[0], p[1], p[2]]);
  if (pts.length <= max) return pts;
  const out = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

function clean(g) {
  if (!g || typeof g !== 'object') return null;
  if (!num(g.time) || g.time <= 0) return null;
  const trace = thinTrace(g.trace);
  if (trace.length < 2) return null;
  return { time: g.time, vehicle: typeof g.vehicle === 'string' ? g.vehicle : 'car', trace };
}

export function createGhostStore(storage, key = GHOST_KEY) {
  let data = readJSON(storage, key, {});
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const save = () => writeJSON(storage, key, data);
  return {
    get(course) {
      const g = clean(data[course]);
      return g ? { ...g, trace: g.trace.map((p) => p.slice()) } : null;
    },
    offer(course, run) {
      if (typeof course !== 'string' || !course) return false;
      const g = clean(run);
      if (!g) return false;
      const old = clean(data[course]);
      if (old && old.time <= g.time) return false;
      data[course] = g;
      save();
      return true;
    },
    reset() {
      data = {};
      save();
    },
  };
}
