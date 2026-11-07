// Sticker book: which stickers exist, which a race earns, and persistence.
import { readJSON, writeJSON } from './storage.js';

export const VEHICLE_IDS = ['car', 'fire', 'bus', 'police', 'ambulance', 'dino'];

/** Medal stickers for the finishing position: 1st, 2nd, 3rd, and the finisher's ribbon. */
export const MEDAL_STICKERS = ['gold', 'silver', 'bronze', 'ribbon'];
/** Grand Prix cups: overall champion, 2nd and 3rd over the series. */
export const CUP_STICKERS = ['cup', 'cup-silver', 'cup-bronze'];

export const STICKERS = [
  'star',
  ...MEDAL_STICKERS,
  ...CUP_STICKERS,
  'apple', 'strawberry', 'watermelon', 'pineapple', 'mikan', 'grape',
  'cow', 'whale', 'snowman',
  ...VEHICLE_IDS.map((v) => 'v-' + v),
];

export const STICKER_KEY = 'buubuu-race.stickers.v1';

/** Grand Prix cup sticker for an overall rank (1 = gold cup, 2 = silver, 3 = bronze, else none). */
export function cupForRank(rank) {
  if (!Number.isFinite(rank)) return null;
  if (rank <= 1) return 'cup';
  if (rank === 2) return 'cup-silver';
  if (rank === 3) return 'cup-bronze';
  return null;
}

/** Medal sticker id for a finishing rank (1 = gold, 2 = silver, 3 = bronze, else ribbon). */
export function medalForRank(rank) {
  if (!Number.isFinite(rank)) return null;
  if (rank <= 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'ribbon';
}

/**
 * Stickers earned by a finished race. Always at least the vehicle medal and
 * the course friend, so a race can never give "nothing". With a finishing
 * rank, the medal (or finisher's ribbon) comes first.
 * @param {{vehicle:string, course:string, stars:number, fruits:Object<string,number>, event?:string, rank?:number}} r
 */
export function stickersForRace(r) {
  const out = [];
  const medal = medalForRank(r.rank);
  if (medal) out.push(medal);
  if (r.stars > 0) out.push('star');
  for (const [id, n] of Object.entries(r.fruits || {})) if (n > 0 && STICKERS.includes(id)) out.push(id);
  const friend = r.event || { meadow: 'cow', sea: 'whale', snow: 'snowman' }[r.course];
  if (friend && STICKERS.includes(friend)) out.push(friend);
  if (VEHICLE_IDS.includes(r.vehicle)) out.push('v-' + r.vehicle);
  return out;
}

function emptyBook() {
  return { counts: {}, plays: 0 };
}

function sanitize(raw) {
  const book = emptyBook();
  if (!raw || typeof raw !== 'object') return book;
  if (Number.isFinite(raw.plays) && raw.plays >= 0) book.plays = Math.floor(raw.plays);
  if (raw.counts && typeof raw.counts === 'object') {
    for (const id of STICKERS) {
      const n = raw.counts[id];
      if (Number.isFinite(n) && n > 0) book.counts[id] = Math.min(9999, Math.floor(n));
    }
  }
  return book;
}

export function createStickerBook(storage, key = STICKER_KEY) {
  let book = sanitize(readJSON(storage, key, null));
  return {
    get data() {
      return book;
    },
    count(id) {
      return book.counts[id] || 0;
    },
    has(id) {
      return (book.counts[id] || 0) > 0;
    },
    distinct() {
      return STICKERS.filter((id) => book.counts[id] > 0).length;
    },
    /** Adds stickers; returns the ids that were brand new. */
    add(ids) {
      const fresh = [];
      for (const id of ids) {
        if (!STICKERS.includes(id)) continue;
        if (!book.counts[id]) fresh.push(id);
        book.counts[id] = (book.counts[id] || 0) + 1;
      }
      book.plays++;
      writeJSON(storage, key, book);
      return fresh;
    },
    reload() {
      book = sanitize(readJSON(storage, key, null));
      return book;
    },
    reset() {
      book = emptyBook();
      writeJSON(storage, key, book);
    },
  };
}
