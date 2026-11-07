import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecords, formatTime, RECORDS_KEY } from '../js/records.js';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}
const throwingStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceeded');
  },
};

test('first race sets every record; later races only beat them when better', () => {
  const st = memoryStorage();
  const rec = createRecords(st);
  assert.deepEqual(rec.get('meadow'), { bestRank: 0, bestTime: 0, bestStars: 0, plays: 0, wins: 0 });

  const first = rec.update('meadow', { rank: 1, raceTime: 70.2, stars: 12 });
  assert.deepEqual(first, { newBestTime: true, newBestRank: true, firstWin: true });
  assert.deepEqual(rec.get('meadow'), { bestRank: 1, bestTime: 70.2, bestStars: 12, plays: 1, wins: 1 });

  // slower and worse: nothing new, but plays counts
  const worse = rec.update('meadow', { rank: 3, raceTime: 80, stars: 5 });
  assert.deepEqual(worse, { newBestTime: false, newBestRank: false, firstWin: false });
  assert.equal(rec.get('meadow').plays, 2);
  assert.equal(rec.get('meadow').bestRank, 1);
  assert.equal(rec.get('meadow').bestTime, 70.2);

  // equal time / equal rank is not a new record; a second win is not a first win
  const same = rec.update('meadow', { rank: 1, raceTime: 70.2, stars: 12 });
  assert.deepEqual(same, { newBestTime: false, newBestRank: false, firstWin: false });
  assert.equal(rec.get('meadow').wins, 2);

  // faster beats the time only
  const faster = rec.update('meadow', { rank: 2, raceTime: 65.34, stars: 20 });
  assert.deepEqual(faster, { newBestTime: true, newBestRank: false, firstWin: false });
  assert.equal(rec.get('meadow').bestStars, 20);

  // other courses are independent
  assert.equal(rec.get('sea').plays, 0);
  const sea = rec.update('sea', { rank: 4, raceTime: 90, stars: 0 });
  assert.deepEqual(sea, { newBestTime: true, newBestRank: true, firstWin: false });
  const later = rec.update('sea', { rank: 2, raceTime: 95, stars: 1 });
  assert.deepEqual(later, { newBestTime: false, newBestRank: true, firstWin: false });
  assert.deepEqual(Object.keys(rec.all()).sort(), ['meadow', 'sea']);
});

test('records persist across reloads and get() returns copies', () => {
  const st = memoryStorage();
  const a = createRecords(st);
  a.update('snow', { rank: 2, raceTime: 75, stars: 7 });
  const copy = a.get('snow');
  copy.bestRank = 99;
  assert.equal(a.get('snow').bestRank, 2);
  const b = createRecords(st);
  assert.deepEqual(b.get('snow'), { bestRank: 2, bestTime: 75, bestStars: 7, plays: 1, wins: 0 });
  assert.ok(st._map.has(RECORDS_KEY));
  b.reset();
  assert.deepEqual(createRecords(st).all(), {});
});

test('records survive broken, hostile or missing storage', () => {
  const t = createRecords(throwingStorage);
  assert.deepEqual(t.update('meadow', { rank: 1, raceTime: 60, stars: 3 }), { newBestTime: true, newBestRank: true, firstWin: true });
  assert.equal(t.get('meadow').wins, 1, 'works in memory even if saving fails');

  const nul = createRecords(null);
  nul.update('sea', { rank: 5, raceTime: 88, stars: 0 });
  assert.equal(nul.get('sea').bestRank, 5);

  const junk = memoryStorage({ [RECORDS_KEY]: '{not json' });
  assert.deepEqual(createRecords(junk).all(), {});

  const weird = memoryStorage({
    [RECORDS_KEY]: JSON.stringify({
      meadow: { bestRank: -1, bestTime: 'fast', bestStars: 4.9, plays: 'x', wins: 2 },
      sea: 'nope',
      snow: null,
      '': { bestRank: 1 },
    }),
  });
  const w = createRecords(weird);
  assert.deepEqual(w.get('meadow'), { bestRank: 0, bestTime: 0, bestStars: 4, plays: 0, wins: 2 });
  assert.deepEqual(w.get('sea'), { bestRank: 0, bestTime: 0, bestStars: 0, plays: 0, wins: 0 });
  assert.deepEqual(Object.keys(w.all()), ['meadow']);

  // junk results do not corrupt a record
  const r = createRecords(memoryStorage());
  assert.deepEqual(r.update('meadow', { rank: NaN, raceTime: -3, stars: 'many' }), { newBestTime: false, newBestRank: false, firstWin: false });
  assert.deepEqual(r.update('', { rank: 1 }), { newBestTime: false, newBestRank: false, firstWin: false });
  assert.deepEqual(r.update('meadow', null), { newBestTime: false, newBestRank: false, firstWin: false });
  assert.equal(r.get('meadow').plays, 1);
  assert.equal(r.get('meadow').bestRank, 0);
});

test('formatTime renders m:ss.d', () => {
  assert.equal(formatTime(65.34), '1:05.3');
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(59.99), '0:59.9');
  assert.equal(formatTime(60), '1:00.0');
  assert.equal(formatTime(600.05), '10:00.0');
  assert.equal(formatTime(NaN), '0:00.0');
  assert.equal(formatTime(-4), '0:00.0');
});
