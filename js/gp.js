// Grand Prix: a short series of races with championship points (pure data, no DOM).
// Points go to the finishing order of each race; the best total after the last race wins.

export const GP_POINTS = [10, 8, 6, 4, 2, 1];
export const GP_COURSES = ['meadow', 'sea', 'snow'];

/** Finishing order of a race result as a list of racer ids (winner first). */
function orderIds(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.order)) {
    return result.order.map((e) => (e && typeof e === 'object' ? e.id : e)).filter((id) => typeof id === 'string');
  }
  if (Array.isArray(result.positions)) {
    return result.positions
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string')
      .slice()
      .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      .map((e) => e.id);
  }
  return [];
}

/**
 * Create a Grand Prix of `courses` (default: all three courses, in order).
 * @param {{courses?: string[]}} o
 */
export function createGrandPrix({ courses = GP_COURSES } = {}) {
  const list = Array.isArray(courses) && courses.length ? courses.slice() : GP_COURSES.slice();
  const gp = {
    courses: list,
    round: 0, // index of the next race to run
    results: [],
    points: {},
    finishes: {}, // id -> finishing positions so far (1-based), in race order

    /** Add one finished race (uses result.order, winner first). */
    addResult(result) {
      const ids = orderIds(result);
      ids.forEach((id, i) => {
        gp.points[id] = (gp.points[id] || 0) + (GP_POINTS[i] || 0);
        (gp.finishes[id] || (gp.finishes[id] = [])).push(i + 1);
      });
      gp.results.push(result);
      gp.round++;
      return gp.standings();
    },

    /** Championship table: points desc, then best finish, then the latest finish. */
    standings() {
      const rows = Object.keys(gp.points).map((id) => {
        const f = gp.finishes[id] || [];
        return {
          id,
          points: gp.points[id],
          best: f.length ? Math.min(...f) : Infinity,
          latest: f.length ? f[f.length - 1] : Infinity,
        };
      });
      rows.sort((a, b) => b.points - a.points || a.best - b.best || a.latest - b.latest);
      return rows.map((r, i) => ({ id: r.id, points: r.points, rank: i + 1, best: r.best === Infinity ? 0 : r.best }));
    },

    /** The player's place in the championship (0 before any race). */
    playerRank() {
      const row = gp.standings().find((r) => r.id === 'player');
      return row ? row.rank : 0;
    },

    nextCourse() {
      return gp.courses[gp.round] ?? null;
    },

    isFinished() {
      return gp.round >= gp.courses.length;
    },

    reset() {
      gp.round = 0;
      gp.results = [];
      gp.points = {};
      gp.finishes = {};
    },
  };
  return gp;
}

/** Gap to the leader, e.g. '+1.2' (never negative). */
export function formatGap(secs) {
  const s = Number(secs);
  const v = Number.isFinite(s) && s > 0 ? s : 0;
  return '+' + v.toFixed(1);
}
