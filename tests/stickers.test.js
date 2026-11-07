import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStickerBook, stickersForRace, medalForRank, cupForRank, STICKERS, MEDAL_STICKERS, CUP_STICKERS, STICKER_KEY } from '../js/stickers.js';
import { MEDAL_SPRITES, medalBg, drawTrophy, drawCup, cupMetal } from '../js/art-medals.js';
import { loadSettings, saveSettings, sanitizeSettings, DEFAULT_SETTINGS } from '../js/settings.js';

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

test('a race always earns stickers', () => {
  const ids = stickersForRace({ vehicle: 'bus', course: 'sea', stars: 0, fruits: {} });
  assert.deepEqual(ids, ['whale', 'v-bus']);
  const more = stickersForRace({ vehicle: 'dino', course: 'meadow', stars: 3, fruits: { apple: 2, strawberry: 0, bogus: 3 }, event: 'cow' });
  assert.deepEqual(more, ['star', 'apple', 'cow', 'v-dino']);
  for (const id of more) assert.ok(STICKERS.includes(id));
});

test('a finishing rank adds the medal (or the finisher ribbon) first', () => {
  const base = { vehicle: 'car', course: 'snow', stars: 2, fruits: { mikan: 1 } };
  assert.deepEqual(stickersForRace({ ...base, rank: 1 }), ['gold', 'star', 'mikan', 'snowman', 'v-car']);
  assert.deepEqual(stickersForRace({ ...base, rank: 2 }), ['silver', 'star', 'mikan', 'snowman', 'v-car']);
  assert.deepEqual(stickersForRace({ ...base, rank: 3 }), ['bronze', 'star', 'mikan', 'snowman', 'v-car']);
  for (const rank of [4, 5, 6]) assert.equal(stickersForRace({ ...base, rank })[0], 'ribbon');
  // no rank (old results) and junk ranks behave like before
  assert.deepEqual(stickersForRace({ vehicle: 'bus', course: 'sea', stars: 0, fruits: {} }), ['whale', 'v-bus']);
  assert.deepEqual(stickersForRace({ vehicle: 'bus', course: 'sea', stars: 0, fruits: {}, rank: 'x' }), ['whale', 'v-bus']);
  assert.deepEqual(stickersForRace({ vehicle: 'bus', course: 'sea', stars: 0, fruits: {}, rank: NaN }), ['whale', 'v-bus']);
  assert.deepEqual(MEDAL_STICKERS, ['gold', 'silver', 'bronze', 'ribbon']);
  for (const id of MEDAL_STICKERS) assert.ok(STICKERS.includes(id), `${id} is a known sticker`);
  assert.equal(STICKERS.indexOf('gold'), STICKERS.indexOf('star') + 1, 'medals sit right after the star');
  assert.equal(medalForRank(1), 'gold');
  assert.equal(medalForRank(6), 'ribbon');
  assert.equal(medalForRank(undefined), null);
});

test('grand prix cups are stickers of their own and never come from a single race', () => {
  assert.deepEqual(CUP_STICKERS, ['cup', 'cup-silver', 'cup-bronze']);
  for (const id of CUP_STICKERS) assert.ok(STICKERS.includes(id));
  assert.ok(STICKERS.indexOf('cup') > STICKERS.indexOf('ribbon'), 'cups sit right after the medals');
  assert.ok(STICKERS.indexOf('cup-bronze') < STICKERS.indexOf('apple'));
  assert.equal(cupForRank(1), 'cup');
  assert.equal(cupForRank(2), 'cup-silver');
  assert.equal(cupForRank(3), 'cup-bronze');
  assert.equal(cupForRank(4), null);
  assert.equal(cupForRank(NaN), null);
  // a race result on its own never hands out a cup
  const ids = stickersForRace({ vehicle: 'car', course: 'meadow', stars: 2, fruits: {}, rank: 1 });
  assert.ok(!ids.some((id) => CUP_STICKERS.includes(id)));
  // the book accepts them like any other sticker
  const b = createStickerBook(memoryStorage());
  assert.deepEqual(b.add(['cup']), ['cup']);
  assert.equal(b.count('cup'), 1);
  assert.deepEqual(b.add(['cup', 'cup-silver']), ['cup-silver']);
  assert.equal(b.count('cup'), 2);
});

test('cup sprites draw without errors and have their own backgrounds', () => {
  const noop = new Proxy({}, { get: (_, k) => (k === 'canvas' ? { width: 100, height: 120 } : () => 0), set: () => true });
  for (const id of CUP_STICKERS) {
    const def = MEDAL_SPRITES[id];
    assert.ok(def, `${id} sprite exists`);
    assert.deepEqual(def.box, [100, 120]);
    assert.doesNotThrow(() => def.draw(noop, 0));
    assert.notEqual(medalBg(id), '#fff', `${id} has a background colour`);
  }
  assert.equal(cupMetal('cup'), 'gold');
  assert.equal(cupMetal('cup-silver'), 'silver');
  assert.equal(cupMetal('cup-bronze'), 'bronze');
  assert.doesNotThrow(() => drawTrophy(noop, 120));
  assert.doesNotThrow(() => drawCup(noop, 80, 'bronze'));
  assert.doesNotThrow(() => drawCup(noop, 80, 'unknown-metal'));
});

test('sticker book persists across reloads', () => {
  const st = memoryStorage();
  const b1 = createStickerBook(st);
  assert.equal(b1.distinct(), 0);
  const fresh = b1.add(['star', 'cow', 'v-car']);
  assert.deepEqual(fresh, ['star', 'cow', 'v-car']);
  const fresh2 = b1.add(['star', 'whale']);
  assert.deepEqual(fresh2, ['whale']);
  const b2 = createStickerBook(st); // "reload"
  assert.equal(b2.count('star'), 2);
  assert.equal(b2.count('whale'), 1);
  assert.equal(b2.data.plays, 2);
  assert.equal(b2.distinct(), 4);
  b2.reset();
  assert.equal(createStickerBook(st).distinct(), 0);
});

test('sticker book survives broken or hostile storage', () => {
  const b = createStickerBook(throwingStorage);
  assert.deepEqual(b.add(['star']), ['star']);
  assert.equal(b.count('star'), 1, 'works in memory even if saving fails');
  const nul = createStickerBook(null);
  nul.add(['cow']);
  assert.equal(nul.count('cow'), 1);
  const junk = memoryStorage({ [STICKER_KEY]: '{not json' });
  assert.equal(createStickerBook(junk).distinct(), 0);
  const weird = memoryStorage({ [STICKER_KEY]: JSON.stringify({ counts: { star: -3, cow: 'x', hacker: 5, whale: 2.7 }, plays: 'a' }) });
  const w = createStickerBook(weird);
  assert.equal(w.count('star'), 0);
  assert.equal(w.count('cow'), 0);
  assert.equal(w.count('hacker'), 0);
  assert.equal(w.count('whale'), 2);
  assert.equal(w.data.plays, 0);
});

test('settings load defaults, persist, and sanitise', () => {
  const st = memoryStorage();
  assert.deepEqual(loadSettings(st), { ...DEFAULT_SETTINGS });
  saveSettings(st, { ...DEFAULT_SETTINGS, music: false, speed: 'normal', extra: 1 });
  const s = loadSettings(st);
  assert.equal(s.music, false);
  assert.equal(s.speed, 'normal');
  assert.equal('extra' in s, false);
  assert.deepEqual(loadSettings(throwingStorage), { ...DEFAULT_SETTINGS });
  assert.equal(saveSettings(throwingStorage, s), false);
  const bad = memoryStorage({ 'buubuu-race.settings.v1': JSON.stringify({ speed: 'turbo', sound: 'yes' }) });
  assert.deepEqual(loadSettings(bad), { ...DEFAULT_SETTINGS });
});

test('rival level (きょうそう) defaults to normal and only accepts easy/normal/hard', () => {
  assert.equal(DEFAULT_SETTINGS.rivals, 'normal');
  assert.equal(sanitizeSettings({ rivals: 'turbo' }).rivals, 'normal');
  assert.equal(sanitizeSettings({ rivals: 'hard' }).rivals, 'hard');
  assert.equal(sanitizeSettings({ rivals: 'easy' }).rivals, 'easy');
  assert.equal(sanitizeSettings({ rivals: 7 }).rivals, 'normal');
  const st = memoryStorage();
  saveSettings(st, { ...DEFAULT_SETTINGS, rivals: 'hard' });
  assert.equal(loadSettings(st).rivals, 'hard');
  const old = memoryStorage({ 'buubuu-race.settings.v1': JSON.stringify({ sound: false, speed: 'normal' }) });
  assert.equal(loadSettings(old).rivals, 'normal', 'settings saved before the update still load');
});

test('settings.ghost defaults to on and only accepts booleans', () => {
  assert.equal(DEFAULT_SETTINGS.ghost, true);
  assert.equal(sanitizeSettings({ ghost: false }).ghost, false);
  assert.equal(sanitizeSettings({ ghost: 'no' }).ghost, true);
  assert.equal(sanitizeSettings({}).ghost, true);
});
