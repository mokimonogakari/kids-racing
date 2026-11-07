import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RIVAL_NAMES, RANK_WORDS, rankLine, overtakeLine, overtakenLine, goalLine, podiumLine, milestoneLine,
  lastStretchLine, startLine, goLine, levelLine, createAnnouncer, RANK_SETTLE_MS, OVERTAKE_GAP_MS, OVERTAKEN_GAP_MS,
  boostReadyLine, boostUsedLine, gridIntroLine, gpStartLine, gpNextLine, gpStandingsLine, gpChampionLine,
  vehicleStatLine, COURSE_NAMES,
} from '../js/voice-lines.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

test('every line is a non-empty string for all ranks, animals and keys', () => {
  for (let rank = 1; rank <= 6; rank++) {
    for (const f of [rankLine, goalLine, podiumLine, lastStretchLine]) assert.ok(nonEmpty(f(rank)), `${f.name}(${rank})`);
    for (const k of [0.3, 0.5, 0.62, 0.88]) assert.ok(nonEmpty(milestoneLine(k, rank)));
  }
  for (const animal of Object.keys(RIVAL_NAMES)) {
    for (let i = 0; i < 8; i++) assert.ok(nonEmpty(overtakeLine(animal, i)));
    assert.ok(nonEmpty(overtakenLine(animal)));
    assert.ok(overtakenLine(animal).includes(RIVAL_NAMES[animal]));
  }
  assert.ok(nonEmpty(overtakeLine('unknown', 1)), 'unknown animals still get a line');
  assert.ok(nonEmpty(startLine()) && nonEmpty(goLine()));
  for (const level of ['easy', 'normal', 'hard', 'bogus']) assert.ok(nonEmpty(levelLine(level)));
  assert.equal(RANK_WORDS.length, 7);
  // strange ranks never break anything
  for (const r of [0, -2, 99, NaN, undefined, '3']) assert.ok(nonEmpty(goalLine(r)) && nonEmpty(rankLine(r)));
});

test('goal and podium lines differ per rank and always praise', () => {
  const goals = [1, 2, 3, 4].map(goalLine);
  assert.equal(new Set(goals).size, 4, 'ranks 1-4 get distinct goal lines');
  assert.equal(goalLine(5), goalLine(4), '4th and below share the gentle line');
  assert.equal(goalLine(6), goalLine(4));
  for (const g of goals) assert.ok(g.startsWith('ゴール！'));
  assert.ok(goalLine(1).includes('いちばん'));
  assert.ok(goalLine(6).includes('えらい'));
  assert.ok(podiumLine(1).includes('きん') && podiumLine(2).includes('ぎん') && podiumLine(3).includes('どう'));
  assert.equal(podiumLine(4), podiumLine(6));
  assert.ok(rankLine(1).includes('いちばん'));
  assert.ok(rankLine(4).includes('よんばん'));
  assert.ok(milestoneLine(0.5, 3).includes('さんばん'));
  assert.notEqual(lastStretchLine(1), lastStretchLine(2));
});

test('overtake lines rotate through several variations', () => {
  const lines = new Set();
  for (let i = 0; i < 10; i++) lines.add(overtakeLine('bear', i));
  assert.ok(lines.size >= 4, 'at least four different overtake lines');
  assert.equal(overtakeLine('bear', 0), overtakeLine('bear', 5), 'variations cycle');
  assert.ok([...lines].some((l) => l.includes('くまさん')), 'some lines name the rival');
});

test('boost, grid and grand prix lines are short hiragana praise', () => {
  assert.ok(boostReadyLine().includes('ボタン'), 'tells the child which button to press');
  assert.ok(nonEmpty(boostUsedLine()) && nonEmpty(gridIntroLine()) && nonEmpty(gpStartLine()));
  for (const c of ['meadow', 'sea', 'snow']) {
    assert.ok(gpNextLine(c).includes(COURSE_NAMES[c]), `next line names the course ${c}`);
  }
  assert.ok(nonEmpty(gpNextLine('bogus')), 'unknown courses still get a line');
  assert.equal(new Set(['meadow', 'sea', 'snow'].map(gpNextLine)).size, 3, 'each course has its own line');
  for (let rank = 1; rank <= 6; rank++) {
    assert.ok(nonEmpty(gpStandingsLine(rank)) && nonEmpty(gpChampionLine(rank)));
    assert.ok(gpStandingsLine(rank).includes(RANK_WORDS[rank]), 'standings line says the rank');
  }
  assert.ok(gpChampionLine(1).includes('チャンピオン'));
  assert.notEqual(gpChampionLine(2), gpChampionLine(1));
  assert.ok(gpChampionLine(2).includes('にばん') && gpChampionLine(3).includes('さんばん'));
  assert.equal(gpChampionLine(4), gpChampionLine(6), '4th and below share one gentle line');
  assert.ok(gpChampionLine(6).includes('えらい'));
  for (const r of [0, -1, 99, NaN, undefined]) assert.ok(nonEmpty(gpChampionLine(r)) && nonEmpty(gpStandingsLine(r)));
});

test('every vehicle gets its own stat line, unknown ids fall back', () => {
  const ids = ['car', 'fire', 'bus', 'police', 'ambulance', 'dino'];
  const lines = ids.map(vehicleStatLine);
  for (const l of lines) assert.ok(nonEmpty(l));
  assert.equal(new Set(lines).size, ids.length, 'all six lines differ');
  assert.ok(vehicleStatLine('police').includes('はやい'));
  assert.ok(vehicleStatLine('bus').includes('まがる'));
  assert.ok(vehicleStatLine('dino').includes('かそく'));
  assert.equal(vehicleStatLine('bogus'), vehicleStatLine('car'));
});

test('announcer reads a rank only after it has settled, and only once', () => {
  let t = 0;
  const said = [];
  const a = createAnnouncer((text, opts) => said.push([text, opts]), () => t);
  a.rank(3);
  t = 300;
  assert.equal(a.tick(), false, 'not yet settled');
  assert.equal(said.length, 0);
  a.rank(2); // changed before settling: timer restarts
  t = 900;
  assert.equal(a.tick(), false);
  t = 1700;
  assert.equal(a.tick(), true);
  assert.equal(said.length, 1);
  assert.equal(said[0][0], rankLine(2));
  assert.deepEqual(said[0][1], { interrupt: false });
  t = 5000;
  assert.equal(a.tick(), false, 'nothing pending');
  a.rank(2); // same rank again: never re-read
  t = 5000 + RANK_SETTLE_MS + 1;
  assert.equal(a.tick(), false);
  assert.equal(said.length, 1);
  a.rank(1);
  t += RANK_SETTLE_MS + 1;
  assert.equal(a.tick(), true);
  assert.equal(said.at(-1)[0], rankLine(1));
  a.reset();
  a.rank(1);
  t += RANK_SETTLE_MS + 1;
  assert.equal(a.tick(), true, 'after reset the same rank can be read again');
});

test('announcer keeps a minimum gap between overtake and overtaken lines', () => {
  let t = 1000;
  const said = [];
  const a = createAnnouncer((text, opts) => said.push([text, opts]), () => t);
  assert.equal(a.overtake('bear'), true);
  assert.deepEqual(said[0][1], { interrupt: true });
  t += OVERTAKE_GAP_MS - 1;
  assert.equal(a.overtake('cat'), false, 'too soon');
  t += 1;
  assert.equal(a.overtake('cat'), true);
  assert.notEqual(said[0][0], said[1][0], 'successive overtake lines vary');
  // overtaken has its own, independent gap
  assert.equal(a.overtaken('pig'), true);
  assert.deepEqual(said.at(-1)[1], { interrupt: false });
  assert.ok(said.at(-1)[0].includes('ぶたさん'));
  t += OVERTAKEN_GAP_MS - 1;
  assert.equal(a.overtaken('pig'), false);
  t += 1;
  assert.equal(a.overtaken('frog'), true);
  assert.equal(said.length, 4);
});
