// Per-course best records (rank, time, stars) with safe persistence.
import { readJSON, writeJSON } from './storage.js';

export const RECORDS_KEY = 'buubuu-race.records.v1';

function emptyRecord() {
  return { bestRank: 0, bestTime: 0, bestStars: 0, plays: 0, wins: 0 };
}

function num(v, lo = 0) {
  return Number.isFinite(v) && v >= lo ? v : null;
}

function sanitizeRecord(raw) {
  const r = emptyRecord();
  if (!raw || typeof raw !== 'object') return r;
  const rank = num(raw.bestRank);
  if (rank !== null) r.bestRank = Math.floor(rank);
  const time = num(raw.bestTime);
  if (time !== null) r.bestTime = time;
  const stars = num(raw.bestStars);
  if (stars !== null) r.bestStars = Math.floor(stars);
  const plays = num(raw.plays);
  if (plays !== null) r.plays = Math.floor(plays);
  const wins = num(raw.wins);
  if (wins !== null) r.wins = Math.floor(wins);
  return r;
}

function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [course, rec] of Object.entries(raw)) {
    if (typeof course !== 'string' || !course) continue;
    if (!rec || typeof rec !== 'object') continue;
    out[course] = sanitizeRecord(rec);
  }
  return out;
}

/**
 * Best records per course.
 * @param {Storage|null} storage
 * @param {string} key
 */
export function createRecords(storage, key = RECORDS_KEY) {
  let data = sanitize(readJSON(storage, key, null));
  const save = () => writeJSON(storage, key, data);
  return {
    /** Record for one course (a copy; never null). */
    get(course) {
      return { ...(data[course] || emptyRecord()) };
    },
    /** All records (a copy). */
    all() {
      const out = {};
      for (const k of Object.keys(data)) out[k] = { ...data[k] };
      return out;
    },
    /**
     * Fold a finished race into the course record.
     * @param {string} course
     * @param {{rank?:number, raceTime?:number, stars?:number}} result
     * @returns {{newBestTime:boolean, newBestRank:boolean, firstWin:boolean}}
     */
    update(course, result) {
      const res = { newBestTime: false, newBestRank: false, firstWin: false };
      if (typeof course !== 'string' || !course || !result || typeof result !== 'object') return res;
      const rec = data[course] || emptyRecord();
      const rank = num(result.rank, 1);
      const time = num(result.raceTime);
      const stars = num(result.stars);
      rec.plays++;
      if (rank !== null) {
        const rk = Math.floor(rank);
        if (rec.bestRank === 0 || rk < rec.bestRank) {
          rec.bestRank = rk;
          res.newBestRank = true;
        }
        if (rk === 1) {
          if (rec.wins === 0) res.firstWin = true;
          rec.wins++;
        }
      }
      if (time !== null && time > 0) {
        if (rec.bestTime === 0 || time < rec.bestTime) {
          rec.bestTime = time;
          res.newBestTime = true;
        }
      }
      if (stars !== null && Math.floor(stars) > rec.bestStars) rec.bestStars = Math.floor(stars);
      data[course] = rec;
      save();
      return res;
    },
    reload() {
      data = sanitize(readJSON(storage, key, null));
      return this.all();
    },
    reset() {
      data = {};
      save();
    },
  };
}

/** Seconds → 'm:ss.d' (65.34 → '1:05.3'). */
export function formatTime(secs) {
  const s = Number.isFinite(secs) && secs > 0 ? secs : 0;
  const tenths = Math.floor(s * 10 + 1e-6);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  const sec = Math.floor(rest / 10);
  const d = rest % 10;
  return `${m}:${String(sec).padStart(2, '0')}.${d}`;
}
