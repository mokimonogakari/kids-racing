// 音声ガイドの文言（ひらがな中心、4さい向け）と、順位アナウンスの間引き。
// 純粋モジュール: DOM も import も使わない。

export const RIVAL_NAMES = { bear: 'くまさん', rabbit: 'うさぎさん', frog: 'かえるさん', pig: 'ぶたさん', cat: 'ねこさん' };
export const RANK_WORDS = ['', 'いちばん', 'にばん', 'さんばん', 'よんばん', 'ごばん', 'ろくばん'];

function clampRank(rank) {
  const n = Math.floor(Number(rank));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, RANK_WORDS.length - 1);
}

export function rivalName(animal) {
  return RIVAL_NAMES[animal] || 'おともだち';
}

export function rankWord(rank) {
  return RANK_WORDS[clampRank(rank)];
}

/** いまの順位を伝える（順位が落ち着いたときに読む）。 */
export function rankLine(rank) {
  const r = clampRank(rank);
  if (r === 1) return 'いちばんだ！';
  if (r === 2) return 'にばんめ！ もうすこし！';
  return `いま ${rankWord(r)}め！ がんばれー！`;
}

const OVERTAKE = [
  (name) => 'ぬいた！',
  (name) => `${name}を ぬいた！`,
  (name) => 'やったー！ ぬいた！',
  (name) => `${name}より はやい！`,
  (name) => 'びゅーん！ ぬいた！',
];

/** 追い抜いたとき。i はバリエーション番号（呼び出し回数など）。 */
export function overtakeLine(animal, i = 0) {
  const k = ((Math.floor(Number(i)) || 0) % OVERTAKE.length + OVERTAKE.length) % OVERTAKE.length;
  return OVERTAKE[k](rivalName(animal));
}

/** 抜かれたとき（前向きに）。 */
export function overtakenLine(animal) {
  return `${rivalName(animal)}に ぬかれた！ おいかけろー！`;
}

/** ゴールの瞬間。何位でもほめる。 */
export function goalLine(rank) {
  const r = clampRank(rank);
  if (r === 1) return 'ゴール！ いちばん！ ゆうしょうだ！';
  if (r === 2) return 'ゴール！ にばん！ すごい！';
  if (r === 3) return 'ゴール！ さんばん！ やったね！';
  return 'ゴール！ さいごまで はしった！ えらい！';
}

/** ゴール画面でのひとこと。 */
export function podiumLine(rank) {
  const r = clampRank(rank);
  if (r === 1) return 'きんメダル！';
  if (r === 2) return 'ぎんメダル！';
  if (r === 3) return 'どうメダル！';
  return 'かんそう リボン！ つぎは ぬかそう！';
}

/** 進み具合の節目。k は 0.3 / 0.5 / 0.62 / 0.88。 */
export function milestoneLine(k, rank) {
  const key = Number(k);
  if (key === 0.3) return 'がんばれー！';
  if (key === 0.5) return `はんぶん！ いま ${rankWord(rank)}め！`;
  if (key === 0.62) return 'はやいね！';
  return 'もうすこし！';
}

/** さいごの直線。 */
export function lastStretchLine(rank) {
  if (clampRank(rank) === 1) return 'いちばんのまま ゴールしよう！';
  return 'さいごの ちょくせん！ ぜんそくりょく！';
}

export function startLine() {
  return 'よーい！';
}

export function goLine() {
  return 'どん！';
}

/** きょうそう設定の読み上げ。 */
export function levelLine(level) {
  if (level === 'easy') return 'やさしい きょうそう';
  if (level === 'hard') return 'つよい きょうそう';
  return 'ふつうの きょうそう';
}

export const RANK_SETTLE_MS = 700;
export const OVERTAKE_GAP_MS = 2500;
export const OVERTAKEN_GAP_MS = 4000;

/**
 * 順位・追い抜きの読み上げを間引くアナウンサー。
 * say(text, opts) は voice.say と同じ形。now() はミリ秒。
 * - rank(n): 候補を覚え、tick() で 700ms 以上同じ順位が続いたら一度だけ読む（同じ順位は二度読まない）。
 * - overtake(animal): 2.5s の間隔を空けて読む（割り込みあり）。
 * - overtaken(animal): 4s の間隔を空けて読む（割り込みなし）。
 */
export function createAnnouncer(say, now = () => Date.now()) {
  let pending = 0; // 候補の順位（0 = なし）
  let pendingAt = 0;
  let spoken = 0; // 最後に読んだ順位
  let lastOvertake = -Infinity;
  let lastOvertaken = -Infinity;
  let overtakes = 0;
  return {
    rank(newRank) {
      const r = clampRank(newRank);
      if (r === pending) return;
      pending = r;
      pendingAt = now();
    },
    overtake(animal) {
      const t = now();
      if (t - lastOvertake < OVERTAKE_GAP_MS) return false;
      lastOvertake = t;
      say(overtakeLine(animal, overtakes++), { interrupt: true });
      return true;
    },
    overtaken(animal) {
      const t = now();
      if (t - lastOvertaken < OVERTAKEN_GAP_MS) return false;
      lastOvertaken = t;
      say(overtakenLine(animal), { interrupt: false });
      return true;
    },
    tick() {
      if (!pending) return false;
      if (now() - pendingAt < RANK_SETTLE_MS) return false;
      const r = pending;
      pending = 0;
      if (r === spoken) return false;
      spoken = r;
      say(rankLine(r), { interrupt: false });
      return true;
    },
    reset() {
      pending = 0;
      pendingAt = 0;
      spoken = 0;
      lastOvertake = -Infinity;
      lastOvertaken = -Infinity;
      overtakes = 0;
    },
  };
}
