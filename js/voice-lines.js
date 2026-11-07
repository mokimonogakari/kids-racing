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

// ---------------------------------------------------------------- ブースト・グリッド
/** 星が5こたまって、きいろいブーストボタンが光ったとき。 */
export function boostReadyLine() {
  return 'ほしが たまった！ きいろい ボタンを おして！';
}

/** ブーストを使ったとき（じどう発動でも同じ）。 */
export function boostUsedLine() {
  return 'びゅーん！';
}

/** スタートグリッドにみんなが並んだとき。 */
export function gridIntroLine() {
  return 'みんな ならんだよ！';
}

// ---------------------------------------------------------------- グランプリ
export const COURSE_NAMES = { meadow: 'はらっぱ', sea: 'うみ', snow: 'ゆきやま', city: 'よるの まち' };

export function courseName(courseId) {
  return COURSE_NAMES[courseId] || 'つぎの コース';
}

/** グランプリ（3戦）の開始。 */
export function gpStartLine() {
  return 'グランプリ スタート！ ３つの コースで しょうぶ！';
}

/** つぎのレースへ。 */
export function gpNextLine(courseId) {
  return `つぎは ${courseName(courseId)}！`;
}

/** 途中の総合順位。 */
export function gpStandingsLine(rank) {
  return `いまの そうごうは ${rankWord(rank)}め！`;
}

/** 3戦が終わったときの総合結果。何位でもほめる。 */
export function gpChampionLine(rank) {
  const r = clampRank(rank);
  if (r === 1) return 'チャンピオン！ おめでとう！';
  if (r <= 3) return `そうごう ${rankWord(r)}！ すごい！`;
  return 'さんせん かんそう！ えらい！';
}

// ---------------------------------------------------------------- のりものの せいのう
const VEHICLE_STAT_LINES = {
  car: 'あかい くるまは なんでも じょうず',
  fire: 'しょうぼうしゃは まがるのが じょうず。 ちょっと ゆっくり',
  bus: 'バスは ゆっくりだけど いちばん よく まがる',
  police: 'パトカーは いちばん はやい！',
  ambulance: 'きゅうきゅうしゃは かそくが とくい',
  dino: 'きょうりゅうカーは かそくが いちばん はやい。 でも ちょっと すべる',
};

/** のりものを選んだときの、性能のひとこと。 */
export function vehicleStatLine(id) {
  return VEHICLE_STAT_LINES[id] || VEHICLE_STAT_LINES.car;
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
/** Someone new is in the lead ('player' or an animal id). */
export function leaderLine(id) {
  if (id === 'player') return 'いちばんに なった！';
  return `${rivalName(id)}が せんとう！`;
}

/** A rival's rocket start. */
export function rocketLine(animal) {
  return `${rivalName(animal)} ロケットスタート！`;
}

const JUMPS = ['とんだー！', 'ジャンプ！', 'たかーい！', 'そらを とんだ！'];
/** Jump cheer; i picks a variation. */
export function jumpLine(i = 0) {
  const n = Math.abs(Math.floor(Number(i) || 0));
  return JUMPS[n % JUMPS.length];
}

/** Passing / being passed by the ghost of your best run. */
export function ghostLine(ahead) {
  return ahead ? 'おばけを ぬいた！' : 'おばけに ぬかれた！ まけるな！';
}

export function photoFinishLine() {
  return 'しゃしん はんてい！';
}

export function nightLine() {
  return 'よるの まち！ ライトを つけて しゅっぱつ！';
}

export function ghostIntroLine() {
  return 'まえの じぶんと しょうぶ！ すけている くるまが おばけ だよ';
}

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
