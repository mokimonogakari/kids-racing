// App controller: screens, input, game loop, settings, persistence.
import { Sound } from './audio.js';
import { Voice } from './voice.js';
import { Renderer } from './render.js';
import { Race } from './race.js';
import { COURSES, COURSE_IDS } from './course.js';
import { VEHICLES, drawVehicleFront, drawAnimalKart, drawCourseTile, drawSticker } from './art.js';
import { drawMedal, drawTrophy } from './art-medals.js';
import { createGrandPrix, formatGap } from './gp.js';
import { statBars } from './vehicle-stats.js';
import { STICKERS, createStickerBook, stickersForRace } from './stickers.js';
import { loadSettings, saveSettings } from './settings.js';
import { getStorage } from './storage.js';
import { createRecords, formatTime } from './records.js';
import * as L from './voice-lines.js';
// Ghost runs (best lap of each course). Loaded lazily so a missing/broken module never blocks the game.
let ghosts = null;
import('./ghost.js')
  .then((m) => {
    if (typeof m.createGhostStore === 'function') ghosts = m.createGhostStore(storage);
  })
  .catch(() => {});
import { steerFromPointer, steerFromTilt, clamp } from './physics.js';

const params = new URLSearchParams(location.search);
const FAST = params.get('fast') === '1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const storage = getStorage();
const settings = loadSettings(storage);
const book = createStickerBook(storage);
const records = createRecords(storage);
const sound = new Sound();
const caption = document.createElement('div');
caption.className = 'voice-caption'; caption.setAttribute('role', 'status'); caption.hidden = true;
document.body.append(caption);
let captionTimer;
const voice = new Voice({
  onActivity: active => sound.duckVoice(active),
  onText: text => { clearTimeout(captionTimer); caption.textContent = text; caption.hidden = false; captionTimer = setTimeout(() => caption.hidden = true, 3500); },
});
// Rank / overtake announcements are debounced so a close race does not become a monologue.
const announcer = L.createAnnouncer((text, o) => voice.say(text, o));
const canvas = $('#game');
const renderer = new Renderer(canvas);

sound.sfxOn = settings.sound;
sound.musicOn = settings.music;
voice.enabled = settings.voice;

const app = {
  screen: 'title',
  vehicle: null,
  course: null,
  race: null,
  paused: false,
  settingsOpen: false,
  busy: false,
  goalTimer: 0,
  fireworkTimer: 0,
  lastResult: null,
  recordInfo: null,
  earned: [],
  mode: 'single', // 'single' | 'gp' | 'circuit'
  gp: null,
  circuit: 'coast',
  car: { model: 'gt', color: '#e8344a', number: 7 },
  replay: null,
};

// Voice lines that may not exist yet in voice-lines.js get a plain fallback.
const say = (fn, fallback, ...args) => (typeof L[fn] === 'function' ? L[fn](...args) : fallback);
const STAT_LABEL = { speed: 'はやさ', accel: 'かそく', grip: 'まがる' };
const COURSE_NAME = { meadow: 'はらっぱ', sea: 'うみ', snow: 'ゆきやま' };
const racerName = (id) => {
  if (id === 'player') return 'あなた';
  if (app.mode === 'circuit') {
    const car = rivalCar(id);
    if (car && car.number != null) return `No.${car.number}`;
  }
  return (L.RIVAL_NAMES && L.RIVAL_NAMES[id]) || id;
};
/** Sports-car info of a circuit rival (by racer id), or null. */
function rivalCar(id) {
  const rs = app.race && app.race.rivals;
  if (!Array.isArray(rs)) return null;
  const r = rs.find((o) => o.animal === id || o.id === id);
  return (r && r.car) || null;
}
const shortName = (id) => racerName(id).replace(/さん$/, '');

// ---------------------------------------------------------------- audio unlock
function unlockAudio() {
  sound.unlock();
  if (sound.pending && sound.ctx) {
    const name = sound.pending;
    sound.pending = null;
    sound.playMusic(name);
  }
}
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

// Big on-screen word ("ぬいた！").
function flashText(text) {
  if (typeof renderer.flash === 'function') renderer.flash(text);
}

// Haptics (Android); silent no-op elsewhere. Follows the sound-effects switch.
function vibrate(pattern) {
  try {
    if (settings.sound && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch (e) {
    /* optional */
  }
}

// ---------------------------------------------------------------- screens
function show(name) {
  app.screen = name;
  for (const sec of $$('.screen')) {
    const on = sec.id === 'scr-' + name;
    sec.hidden = !on;
    sec.classList.toggle('enter', on);
  }
  document.body.classList.toggle('racing', ['race', 'goal', 'standings', 'cup', 'replay'].includes(name));
  document.body.classList.toggle('circuit-mode', app.mode === 'circuit' && ['race', 'goal', 'replay'].includes(name));
  if (name === 'title' || name === 'vehicle' || name === 'course' || name === 'book' || name === 'garage' || name === 'circuit') {
    sound.playMusic('menu');
    sound.nightAmbience?.(false);
    sound.crowdAmbience?.(false);
  }
  if (name !== 'garage') stopGarageSpin();
  if (!(app.mode === 'circuit' && ['race', 'goal', 'replay'].includes(name))) detach3D();
}

function go(name) {
  if (name === 'vehicle') {
    $('.grid.vehicles').classList.remove('picked');
    $$('.grid.vehicles .card').forEach((c) => c.classList.remove('chosen'));
    show('vehicle');
    paintMenus();
    voice.say('どれに のる？');
  } else if (name === 'course') {
    $('.grid.courses').classList.remove('picked');
    $$('.grid.courses .card').forEach((c) => c.classList.remove('chosen'));
    show('course');
    paintMenus();
    voice.say('どこを はしる？', { interrupt: false });
  } else if (name === 'garage') {
    app.mode = 'circuit';
    openGarage();
  } else if (name === 'circuit') {
    openCircuitSelect();
  } else if (name === 'book') {
    buildBook();
    show('book');
  } else {
    show(name);
    if (name === 'title') paintMenus();
  }
}

// ---------------------------------------------------------------- canvases
function paintCanvas(cv, draw) {
  if (!cv || !cv.clientWidth) return; // hidden: painted again when its screen is shown
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // clientWidth ignores CSS transforms (e.g. pop-in animations).
  const w = Math.max(40, Math.round((cv.clientWidth || cv.width) * dpr));
  const h = Math.max(40, Math.round((cv.clientHeight || cv.height) * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  draw(c, w, h);
}

function paintVehicle(cv, id, crown = false) {
  paintCanvas(cv, (c, w, h) => {
    const s = Math.min(w, h) / (crown ? 118 : 100);
    c.translate((w - 100 * s) / 2, h - 100 * s - (crown ? 0 : (h - 100 * s) / 2));
    c.scale(s, s);
    drawVehicleFront(c, id, 0);
    if (crown) drawFlowerCrown(c);
  });
}

/** A rival's kart (box 100x110) fitted into a canvas, cheering. */
function paintKart(cv, animal, frame = 1) {
  paintCanvas(cv, (c, w, h) => {
    const s = Math.min(w / 100, h / 110);
    c.translate((w - 100 * s) / 2, (h - 110 * s) / 2);
    c.scale(s, s);
    drawAnimalKart(c, animal, frame);
  });
}

function drawFlowerCrown(c) {
  const cols = ['#ff5a8a', '#ffd23f', '#ffffff', '#ff9f1c', '#a77bff', '#5cc7ff', '#ff5a8a'];
  cols.forEach((col, i) => {
    const x = 18 + i * 10.7;
    const y = -4 + Math.abs(i - 3) * 2.2;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.6, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(61,44,62,.5)';
      c.stroke();
    }
    c.beginPath();
    c.arc(x, y, 2.6, 0, Math.PI * 2);
    c.fillStyle = '#ffb13b';
    c.fill();
  });
}

function paintChosenVehicle() {
  if (app.vehicle) paintVehicle($('.chosen-vehicle'), app.vehicle);
}

const CARD_BG = {
  car: 'linear-gradient(#ffe1e1, #ffc2c2)',
  fire: 'linear-gradient(#ffe9d6, #ffc9a8)',
  bus: 'linear-gradient(#fff6cc, #ffe78a)',
  police: 'linear-gradient(#e3ecff, #c3d4ff)',
  ambulance: 'linear-gradient(#ffe6ee, #ffd0de)',
  dino: 'linear-gradient(#e2f9d8, #bff0a8)',
};

function buildMenus() {
  const vg = $('.grid.vehicles');
  vg.innerHTML = '';
  for (const v of VEHICLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card vehicle-card';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', v.label);
    b.dataset.vehicle = v.id;
    b.style.background = CARD_BG[v.id];
    const bars = statBars(v.id);
    const stats = ['speed', 'accel', 'grip']
      .map((k) => `<i><em>${STAT_LABEL[k]}</em>${'<b></b>'.repeat(bars[k])}${'<s></s>'.repeat(Math.max(0, 5 - bars[k]))}</i>`)
      .join('');
    b.innerHTML = `<canvas class="vcanvas" aria-hidden="true"></canvas><span class="label" aria-hidden="true">${v.label}</span><span class="stats" aria-hidden="true">${stats}</span>`;
    b.addEventListener('click', () => pickVehicle(v.id, b));
    vg.appendChild(b);
  }
  const cg = $('.grid.courses');
  cg.innerHTML = '';
  for (const id of COURSE_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card course-card';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', COURSES[id].label);
    b.dataset.course = id;
    b.innerHTML = `<canvas aria-hidden="true"></canvas>`;
    b.addEventListener('click', () => pickCourse(id, b));
    cg.appendChild(b);
  }
}

function paintMenus() {
  if (app.screen === 'race' || app.screen === 'goal') return;
  for (const b of $$('.vehicle-card')) paintVehicle($('canvas', b), b.dataset.vehicle);
  for (const b of $$('.course-card')) paintCanvas($('canvas', b), (c, w, h) => drawCourseTile(c, b.dataset.course, w, h));
  paintVehicle($('.title-car'), 'car');
  paintChosenVehicle();
}

// ---------------------------------------------------------------- choices
const VEHICLE_SAY = { car: 'あかい くるま！', fire: 'しょうぼうしゃ！', bus: 'バス！', police: 'パトカー！', ambulance: 'きゅうきゅうしゃ！', dino: 'きょうりゅうカー！' };
const COURSE_SAY = { meadow: 'はらっぱ！', sea: 'うみ！', snow: 'ゆきやま！' };

function pickVehicle(id, el) {
  if (app.busy) return;
  app.busy = true;
  app.vehicle = id;
  sound.horn(id);
  el.classList.add('chosen');
  el.parentElement.classList.add('picked');
  voice.say(VEHICLE_SAY[id]);
  setTimeout(() => {
    app.busy = false;
    if (app.mode === 'gp' && app.gp) {
      app.course = app.gp.nextCourse() || 'meadow';
      voice.say(say('gpNextLine', `さいしょは ${COURSE_NAME[app.course]}！`, app.course), { interrupt: false });
      startRace();
    } else {
      go('course');
    }
  }, 1100);
}

function pickCourse(id, el) {
  if (app.busy) return;
  app.busy = true;
  app.course = id;
  sound.pop();
  el.classList.add('chosen');
  el.parentElement.classList.add('picked');
  voice.say(COURSE_SAY[id]);
  setTimeout(() => {
    app.busy = false;
    startRace();
  }, 900);
}

// ---------------------------------------------------------------- race
function startRace() {
  clearInput();
  resumeRace();
  $('#star-count').textContent = '0 / 5';
  if (!app.vehicle) app.vehicle = 'car';
  if (!app.course) app.course = 'meadow';
  clearTimeout(app.goalTimer);
  clearInterval(app.fireworkTimer);
  renderer.particles.length = 0;
  renderer.flyers.length = 0;
  announcer.reset();
  sound.setTempo?.(1);
  const seed = params.get('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  let ghostRec = null;
  try {
    ghostRec = settings.ghost && ghosts ? ghosts.get(app.course) : null;
  } catch (e) {
    ghostRec = null;
  }
  app.ghost = ghostRec && Array.isArray(ghostRec.trace) && ghostRec.trace.length > 1 ? ghostRec : null;
  app.jumps = 0;
  app.race = new Race({
    ghost: app.ghost ? app.ghost.trace : null,
    course: app.course,
    vehicle: app.vehicle,
    speed: settings.speed,
    rivals: settings.rivals,
    length: FAST ? 170 : settings.speed === 'slow' ? 1050 : 1250,
    seed,
    hooks: raceHooks(),
  });
  show('race');
  const camBtn = $('#btn-cam');
  if (camBtn) camBtn.hidden = true;
  renderer.camMode = 'chase';
  sound.playMusic(COURSES[app.course].music);
  updateStarHud();
  btnBoost?.classList.remove('ready', 'fire');
  buildGridIntro();
  const night = !!(COURSES[app.course] && COURSES[app.course].night);
  sound.nightAmbience?.(night);
  if (night) voice.say(say('nightLine', 'よるの まち！ ライトを つけて しゅっぱつ！'));
  if (app.ghost) voice.say(say('ghostIntroLine', 'まえの じぶんと しょうぶ！ すけている くるまが おばけ だよ'), { interrupt: false });
  voice.say(L.startLine(), { interrupt: false });
  lastT = 0;
}

/** "⭐ n / 5": stars collected toward the next boost. */
function updateStarHud() {
  const r = app.race;
  if (!r) return;
  const charge = Number.isFinite(r.boostCharge) ? r.boostCharge : r.stars % 5;
  $('#star-count').textContent = `${charge} / 5`;
}

// ---------------------------------------------------------------- start grid intro
function buildGridIntro() {
  const el = $('#grid-intro');
  if (!el || !app.race) return;
  const race = app.race;
  const entries = [...race.rivals.map((r) => ({ id: r.animal, z: r.z })), { id: 'player', z: race.player.z }].sort((a, b) => b.z - a.z);
  el.innerHTML = '';
  for (const [i, e] of entries.entries()) {
    const card = document.createElement('div');
    card.className = 'gcard' + (e.id === 'player' ? ' you' : '');
    card.innerHTML = `<canvas aria-hidden="true"></canvas><b>${i + 1}</b><span>${shortName(e.id)}</span>`;
    el.appendChild(card);
  }
  el.hidden = false;
  el.classList.remove('out');
  document.body.classList.add('intro');
  requestAnimationFrame(() => {
    entries.forEach((e, i) => {
      const cv = el.children[i] && $('canvas', el.children[i]);
      if (!cv) return;
      paintRacer(cv, e.id, 0);
    });
  });
  voice.say(say('gridIntroLine', 'みんな ならんだよ！'), { interrupt: false });
}
function hideGridIntro() {
  const el = $('#grid-intro');
  document.body.classList.remove('intro');
  if (!el || el.hidden) return;
  el.classList.add('out');
  setTimeout(() => {
    el.hidden = true;
  }, 700);
}

function raceHooks() {
  return {
    starReward: () => {
      sound.whoosh();
      voice.say('ほしが ５こ！ びゅーん！');
      renderer.confetti(25);
    },
    count: (left) => {
      sound.beep(false);
      if (left === 1) sound.rev?.();
    },
    go: () => {
      hideGridIntro();
      voice.say(L.goLine());
      sound.beep(true);
      sound.engineStart();
    },
    boostReady: () => {
      btnBoost?.classList.add('ready');
      sound.chime(true);
      voice.say(say('boostReadyLine', 'ほしが たまった！ きいろい ボタンを おして！'));
      updateStarHud();
    },
    boostUsed: () => {
      btnBoost?.classList.remove('ready');
      pulse(btnBoost, 'fire');
      sound.whoosh();
      voice.say(say('boostUsedLine', 'びゅーん！'));
      renderer.confetti(20);
      updateStarHud();
    },
    collect: (kind, id) => {
      if (kind === 'star') updateStarHud();
      sound.chime(kind === 'fruit');
      const slot = kind === 'star' ? 0 : 1 + COURSES[app.course].fruits.indexOf(id);
      renderer.burst(renderer.carX, renderer.carY, 10, ['#fff6a8', '#ffd23f', '#ffffff', '#ff9fd1'], 200);
      renderer.flyTo(id, renderer.carX, renderer.carY - 30, slot);
      if (kind === 'fruit') voice.say('おいしそう！', { minGap: 5000, interrupt: false });
    },
    bump: (what) => {
      renderer.burst(renderer.carX, renderer.carY - 20, 8, ['#ffffff', '#ffd23f', '#ff9fd1'], 160);
      if (what === 'rival') {
        // Karts touching: a real "thud", a shake and a buzz, but still playful.
        sound.bumpCar?.();
        sound.giggle();
        renderer.shake?.(1);
        vibrate(40);
        voice.say('ぽよーん！', { minGap: 4000, interrupt: false });
      } else if (what === 'cow') {
        sound.boing();
        sound.moo();
        renderer.shake?.(0.6);
        vibrate(30);
      } else {
        sound.boing();
        sound.giggle();
        renderer.shake?.(0.5);
        vibrate(30);
      }
    },
    fence: () => sound.boing(),
    boost: () => {
      sound.whoosh();
      voice.say('びゅーん！', { minGap: 6000, interrupt: false });
    },
    slipstream: () => sound.slipstream?.(),
    curb: () => {
      sound.curb?.();
      renderer.shake?.(0.25);
      vibrate(15);
    },
    drift: () => sound.skid?.(),
    event: (type) => {
      if (type === 'cow') {
        sound.moo();
        voice.say('うしさんが わたるよ！');
      } else if (type === 'whale') {
        setTimeout(() => sound.splash(), 500);
        voice.say('くじらさんだ！ ざぶーん！');
      } else if (type === 'snowman') {
        sound.hello();
        voice.say('ゆきだるまさん、こんにちは！');
      }
    },
    overtake: (animal) => {
      sound.passBy?.(1);
      flashText('ぬいた！');
      renderer.confetti(12);
      announcer.overtake(animal);
    },
    overtaken: (animal) => {
      sound.passBy?.(-1);
      announcer.overtaken(animal);
    },
    rank: (n) => announcer.rank(n),
    milestone: (k, rank) => voice.say(L.milestoneLine(k, rank), { interrupt: false }),
    lastStretch: (rank) => {
      voice.say(L.lastStretchLine(rank));
      sound.setTempo?.(1.12);
    },
    honk: () => sound.horn(app.vehicle),
    jump: (who) => {
      if (who !== 'player') return;
      sound.jump?.();
      vibrate(20);
      voice.say(say('jumpLine', 'とんだー！', app.jumps++), { minGap: 3000, interrupt: false });
    },
    land: (who) => {
      if (who !== 'player') return;
      sound.land?.();
      renderer.shake?.(0.6);
      renderer.burst(renderer.carX, renderer.carY, 10, ['#ffffff', '#e8e2d6', '#ffd23f'], 180);
      vibrate(35);
    },
    ghostPass: (ahead) => {
      if (ahead) flashText('おばけを ぬいた！');
      voice.say(say('ghostLine', ahead ? 'おばけを ぬいた！' : 'おばけに ぬかれた！ まけるな！', ahead), { minGap: 4000, interrupt: false });
    },
    photoFinish: () => {
      sound.shutter?.();
      voice.say(say('photoFinishLine', 'しゃしん はんてい！'));
      vibrate([30, 30, 30]);
    },
    rivalRocket: (animal) => voice.say(say('rocketLine', 'ロケットスタート！', animal), { minGap: 5000, interrupt: false }),
    leader: (id) => {
      if (id === 'player') sound.chime(true);
      voice.say(say('leaderLine', id === 'player' ? 'いちばんに なった！' : 'せんとうが かわった！', id), { minGap: 3500, interrupt: false });
    },
    goal: (result) => onGoal(result),
  };
}

function onGoal(result) {
  sound.engineStop();
  sound.setTempo?.(1);
  const rank = result.rank || 1;
  sound.finishJingle?.(rank);
  setTimeout(() => sound.crowd?.(3), 300);
  voice.say(L.goalLine(rank));
  vibrate([60, 40, 60]);
  renderer.confetti(rank === 1 ? 90 : rank <= 3 ? 50 : 25);
  clearInterval(app.fireworkTimer);
  if (rank <= 3) {
    let n = 0;
    app.fireworkTimer = setInterval(() => {
      if (app.paused) return;
      renderer.firework();
      if (n++ % 3 === 0) renderer.confetti(rank === 1 ? 30 : 15);
      if (n > (rank === 1 ? 12 : 6)) clearInterval(app.fireworkTimer);
    }, 800);
  }
  const earned = stickersForRace(result);
  app.lastResult = result;
  app.earned = earned;
  app.fresh = book.add(earned);
  app.recordInfo = records.update(app.mode === 'circuit' ? 'circuit-' + app.circuit : app.course, result);
  if (app.mode === 'circuit') sound.crowdAmbience?.(true);
  try {
    if (app.mode === 'circuit') throw new Error('no ghosts on circuits');
    const trace = result.trace || (app.race && app.race.trace);
    if (ghosts && Array.isArray(trace) && trace.length > 1) {
      app.recordInfo.newGhost = !!ghosts.offer(app.course, { time: result.raceTime, vehicle: app.vehicle, trace });
    }
  } catch (e) {
    /* ghost saving is optional */
  }
  if (app.mode === 'gp' && app.gp) {
    try {
      app.gp.addResult(result);
    } catch (e) {
      /* a broken series must not break the goal */
    }
  }
  clearTimeout(app.goalTimer);
  app.goalTimer = setTimeout(showGoal, FAST ? 1800 : 2600);
}

function showGoal() {
  const result = app.lastResult;
  if (!result) return;
  show('goal');
  sound.playMusic('podium');
  paintGoal();
  setTimeout(() => {
    if (app.screen === 'goal' && app.lastResult === result) voice.say(L.podiumLine(result.rank || 1), { interrupt: false });
  }, 1200);
}

/** (Re)paints everything on the goal screen; also used after a resize. */
function paintGoal() {
  const result = app.lastResult;
  if (!result) return;
  const rank = result.rank || 1;

  // Medal with the finishing position.
  paintCanvas($('#medal-canvas'), (c, w, h) => {
    const s = Math.min(w, h);
    c.translate((w - s) / 2, (h - s) / 2);
    drawMedal(c, rank, s);
  });
  // The winner wears the flower crown (circuit: the sports car, side-on).
  if (app.mode === 'circuit') paintSportsCar($('.goal-car'), app.car.model, 'front34', app.car.color, app.car.number);
  else paintVehicle($('.goal-car'), app.vehicle, rank === 1);

  // Podium: 2nd, 1st, 3rd.
  const podium = $('#podium');
  if (podium) {
    podium.innerHTML = '';
    const top = (result.order || []).slice(0, 3);
    const steps = [];
    for (const place of [2, 1, 3]) {
      const entry = top[place - 1];
      if (!entry) continue;
      const step = document.createElement('div');
      step.className = `step p${place}${entry.id === 'player' ? ' you' : ''}`;
      step.setAttribute('aria-label', `${place}い ${entry.id === 'player' ? 'あなた' : (L.RIVAL_NAMES[entry.id] || entry.id)}`);
      const cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      step.appendChild(cv);
      const b = document.createElement('b');
      b.className = 'place';
      b.textContent = String(place);
      step.appendChild(b);
      podium.appendChild(step);
      steps.push([cv, entry]);
    }
    for (const [cv, entry] of steps) paintRacer(cv, entry.id, 1);
  }

  // Not on the podium? Show where you came in, with your own car.
  const yp = $('#your-place');
  if (yp) {
    if (rank >= 4) {
      yp.hidden = false;
      paintRacer($('canvas', yp), 'player');
      const b = $('b', yp);
      if (b) b.textContent = `${rank}い`;
    } else {
      yp.hidden = true;
    }
  }

  // Stickers earned this race.
  const box = $('.earned');
  box.innerHTML = '';
  app.earned.forEach((id, i) => {
    const cv = document.createElement('canvas');
    cv.style.animationDelay = 0.25 + i * 0.18 + 's';
    cv.setAttribute('aria-hidden', 'true');
    box.appendChild(cv);
    paintCanvas(cv, (c, w) => drawSticker(c, id, w, true));
  });

  // Results: everyone's time (winner) or gap to the winner.
  const res = $('#results');
  if (res) {
    res.innerHTML = '';
    const order = result.order || [];
    const me = order.find((e) => e.id === 'player');
    // order[i].time includes the countdown when it comes from race time; line it up with raceTime.
    const offset = me && Number.isFinite(me.time) && Number.isFinite(result.raceTime) ? me.time - result.raceTime : 0;
    const t1 = order[0] && Number.isFinite(order[0].time) ? order[0].time : NaN;
    const rows = [];
    order.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (e.id === 'player' ? ' you' : '');
      row.setAttribute('role', 'listitem');
      let t = '—';
      if (Number.isFinite(e.time)) t = i === 0 || !Number.isFinite(t1) ? formatTime(Math.max(0, e.time - offset)) : formatGap(e.time - t1);
      row.innerHTML = `<b class="pos">${i + 1}</b><canvas aria-hidden="true"></canvas><span class="name">${shortName(e.id)}</span><span class="time">${t}</span>`;
      res.appendChild(row);
      rows.push([row, e]);
    });
    for (const [row, e] of rows) {
      const cv = $('canvas', row);
      paintRacer(cv, e.id, 0);
    }
  }
  const gpMode = app.mode === 'gp' && !!app.gp;
  const bNext = $('#btn-next');
  if (bNext) bNext.hidden = !gpMode;
  $('#btn-again').hidden = gpMode;
  $('#btn-other').hidden = gpMode;
  paintLaps(result);

  // One-line record: place, stars, time, and any new best.
  const info = app.recordInfo || {};
  let line = app.mode === 'circuit'
    ? `🏁 ${rank}い　⏱ ${formatTime(result.raceTime || 0)}${Number.isFinite(result.bestLap) ? `　ベストラップ ${formatTime(result.bestLap)}` : ''}`
    : `🏁 ${rank}い　⭐ ${result.stars}こ　⏱ ${formatTime(result.raceTime || 0)}`;
  if (info.newBestTime) line += ' 🎉 しんきろく！';
  if (info.firstWin) line += ' 🏆 はじめての ゆうしょう！';
  $('#race-record').textContent = line;
}


// ---------------------------------------------------------------- circuit mode
// Modules for the circuit mode load lazily, so a missing file never blocks the kids' modes.
const gt = { circuit: null, art: null, replay: null };
const gtReady = Promise.all([
  import('./circuit.js').then((m) => (gt.circuit = m)).catch(() => {}),
  import('./art-gt.js').then((m) => (gt.art = m)).catch(() => {}),
  import('./replay.js').then((m) => (gt.replay = m)).catch(() => {}),
]);
// ---- real 3D (WebGL / Three.js) for the circuit mode. Any failure falls back to the 2D view.
const NO3D = params.get('no3d') === '1';
const g3 = { view: null, garage: null, viewP: null, garageP: null, on: false, failed: false, gFailed: false, garageOn: false, gLast: 0 };
function webglOK() {
  if (NO3D) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}
const HAS_GL = webglOK();
/** Car colour id ('red') or hex → hex. */
function carHex(color) {
  if (typeof color === 'string' && color[0] === '#') return color;
  const list = (gt.art && gt.art.CAR_COLORS) || [];
  const hit = list.find((c) => c.id === color);
  return hit ? hit.hex : '#d3172b';
}
function withHex(car) {
  const c = car || { model: 'gt', color: 'red', number: 1 };
  return { ...c, hex: carHex(c.color) };
}
function loadView3D() {
  if (!HAS_GL || g3.failed) return Promise.resolve(null);
  if (!g3.viewP) {
    g3.viewP = import('./view3d.js')
      .then(async (m) => {
        const v = m.createView3D($('#gl'));
        if (!v || v.supported === false) throw new Error('no webgl');
        await v.ready;
        v.resize?.(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
        g3.view = v;
        return v;
      })
      .catch((e) => {
        console.warn('3D view unavailable', e);
        g3.failed = true;
        return null;
      });
  }
  return g3.viewP;
}
function loadGarage3D() {
  if (!HAS_GL || g3.gFailed) return Promise.resolve(null);
  if (!g3.garageP) {
    g3.garageP = import('./garage3d.js')
      .then(async (m) => {
        const cv = $('#garage-gl');
        cv.hidden = false;
        const g = m.createGarage3D(cv);
        if (!g || g.supported === false) throw new Error('no webgl');
        await g.ready;
        g3.garage = g;
        return g;
      })
      .catch((e) => {
        console.warn('3D garage unavailable', e);
        g3.gFailed = true;
        $('#garage-gl').hidden = true;
        return null;
      });
  }
  return g3.garageP;
}
/** Hand the circuit race to the 3D view (if it is ready); the 2D canvas keeps only the HUD. */
function attach3D(race) {
  if (!g3.view || !race || app.mode !== 'circuit' || g3.failed) return false;
  try {
    g3.view.start(race, {
      car: withHex(app.car),
      rivals: race.rivals.map((r) => withHex(r.car)),
    });
    g3.view.setCamera?.(renderer.camMode && ['chase', 'far', 'bumper'].includes(renderer.camMode) ? renderer.camMode : 'chase');
    g3.view.setReplay?.(false);
    g3.on = true;
    g3.race = race;
    renderer.hudOnly = true;
    document.body.classList.add('gl3d');
    return true;
  } catch (e) {
    console.warn('3D start failed', e);
    fail3D();
    return false;
  }
}
function detach3D() {
  g3.on = false;
  g3.race = null;
  renderer.hudOnly = false;
  document.body.classList.remove('gl3d');
}
function fail3D() {
  g3.failed = true;
  detach3D();
}
/** Draw the 3D world for this frame; returns false when the 2D view must draw instead. */
function render3D(race, dt, t) {
  if (!g3.on || g3.race !== race) return false;
  try {
    g3.view.render(race, dt, t);
    return true;
  } catch (e) {
    console.warn('3D render failed', e);
    fail3D();
    return false;
  }
}
// 3D garage: spins on its own loop while the garage is open
function garage3DShow() {
  loadGarage3D().then((g) => {
    if (!g || app.screen !== 'garage') return;
    const stage = $('.garage-stage');
    stage.classList.add('gl3d');
    try {
      const r = stage.getBoundingClientRect();
      g.resize?.(r.width, r.height, window.devicePixelRatio || 1);
      g.show(app.car.model, carHex(app.car.color), app.car.number);
    } catch (e) {
      g3.gFailed = true;
      stage.classList.remove('gl3d');
      $('#garage-gl').hidden = true;
      return;
    }
    if (!g3.garageOn) {
      g3.garageOn = true;
      g3.gLast = 0;
      requestAnimationFrame(garageLoop);
    }
  });
}
function garageLoop(ts) {
  if (app.screen !== 'garage' || !g3.garage || g3.gFailed) {
    g3.garageOn = false;
    return;
  }
  const dt = g3.gLast ? Math.min(0.05, (ts - g3.gLast) / 1000) : 1 / 60;
  g3.gLast = ts;
  try {
    g3.garage.render(dt);
  } catch (e) {
    console.warn('3D garage render failed', e);
    g3.gFailed = true;
    g3.garageOn = false;
    $('.garage-stage').classList.remove('gl3d');
    $('#garage-gl').hidden = true;
    return;
  }
  requestAnimationFrame(garageLoop);
}
function garage3DSync() {
  if (!g3.garage || g3.gFailed || app.screen !== 'garage') return;
  try {
    g3.garage.setModel?.(app.car.model);
    g3.garage.setColor?.(carHex(app.car.color));
  } catch (e) {
    /* the 2D picture stays as a fallback */
  }
}

const CIRCUIT_FALLBACK = {
  coast: { id: 'coast', label: 'うみぞい サーキット', base: 'sea', music: 'sea' },
  mountain: { id: 'mountain', label: 'やまの サーキット', base: 'meadow', music: 'meadow' },
};
const MODEL_FALLBACK = ['gt', 'proto', 'hatch'];
const COLOR_FALLBACK = ['#e8344a', '#2f6fe0', '#f4f4f4', '#ffd23f', '#22262e', '#2fb36a', '#ff8a1f', '#9b5de5'];
const MODEL_STATS = { gt: { speed: 4, accel: 3, grip: 3 }, proto: { speed: 5, accel: 3, grip: 4 }, hatch: { speed: 3, accel: 5, grip: 4 } };
const CAR_VIEWS = ['front34', 'side', 'rear'];
const CIRCUIT_LAPS = FAST ? 2 : 3;

function circuitDefs() {
  return (gt.circuit && gt.circuit.CIRCUITS) || CIRCUIT_FALLBACK;
}
function carModels() {
  const m = gt.art && gt.art.CAR_MODELS;
  let list = null;
  if (Array.isArray(m)) list = m.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean);
  else if (m && typeof m === 'object') list = Object.keys(m);
  if (!list || !list.length) list = (gt.circuit && gt.circuit.CAR_MODEL_IDS) || MODEL_FALLBACK;
  return list;
}
function carColors() {
  const m = gt.art && gt.art.CAR_COLORS;
  const raw = Array.isArray(m) ? m : m && typeof m === 'object' ? Object.values(m) : null;
  const list = raw
    ? raw.map((x) => (typeof x === 'string' ? x : x && (x.hex || x.color || x.value || x.body))).filter((x) => typeof x === 'string')
    : [];
  return list.length ? list : COLOR_FALLBACK;
}
/** Native drawing box of drawSportsCar for a view (art-gt.js may export it; else a sane guess). */
function carBox(model, view) {
  const a = gt.art || {};
  const b = (typeof a.carBox === 'function' && a.carBox(model, view)) || (a.CAR_BOX && (a.CAR_BOX[view] || a.CAR_BOX[model])) || null;
  if (b && Array.isArray(b)) return { w: b[0], h: b[1] };
  if (b && b.w) return b;
  return view === 'side' ? { w: 240, h: 110 } : { w: 200, h: 140 };
}
function paintSportsCar(cv, model, view, color, number) {
  paintCanvas(cv, (c, w, h) => {
    if (!(gt.art && typeof gt.art.drawSportsCar === 'function')) {
      const s = Math.min(w, h) / 100;
      c.translate((w - 100 * s) / 2, (h - 100 * s) / 2);
      c.scale(s, s);
      drawVehicleFront(c, 'car', 0);
      return;
    }
    const box = carBox(model, view);
    const s = Math.min(w / box.w, h / box.h) * 0.94;
    c.translate((w - box.w * s) / 2, (h - box.h * s) / 2);
    c.scale(s, s);
    try {
      gt.art.drawSportsCar(c, model, view, color, number, {});
    } catch (e) {
      /* art is optional */
    }
  });
}

let garageSpin = 0;
let garageView = 0;
function stopGarageSpin() {
  clearInterval(garageSpin);
  garageSpin = 0;
}
function paintGarageCar() {
  const cv = $('#garage-car');
  if (!cv) return;
  paintSportsCar(cv, app.car.model, CAR_VIEWS[garageView % CAR_VIEWS.length], app.car.color, app.car.number);
  cv.classList.remove('turning');
  void cv.offsetWidth;
  cv.classList.add('turning');
}
function buildGarage() {
  const models = carModels();
  const colors = carColors();
  if (!models.includes(app.car.model)) app.car.model = models[0];
  if (!colors.includes(app.car.color)) app.car.color = colors[0];
  const mBox = $('.garage-models');
  mBox.innerHTML = '';
  for (const id of models) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', (L.CAR_MODEL_NAMES && L.CAR_MODEL_NAMES[id]) || id);
    b.setAttribute('aria-pressed', String(id === app.car.model));
    b.dataset.model = id;
    b.innerHTML = '<canvas aria-hidden="true"></canvas>';
    b.addEventListener('click', () => {
      app.car.model = id;
      sound.horn?.('car');
      voice.say(say('garageLine', 'かっこいい！', id));
      syncGarage();
    });
    mBox.appendChild(b);
  }
  const cBox = $('.garage-colors');
  cBox.innerHTML = '';
  for (const col of colors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', 'いろ');
    b.setAttribute('aria-pressed', String(col === app.car.color));
    b.dataset.color = col;
    b.style.background = col;
    b.addEventListener('click', () => {
      app.car.color = col;
      sound.pop();
      syncGarage();
    });
    cBox.appendChild(b);
  }
  syncGarage();
}
function syncGarage() {
  for (const b of $$('.garage-models button')) {
    b.setAttribute('aria-pressed', String(b.dataset.model === app.car.model));
    paintSportsCar($('canvas', b), b.dataset.model, 'side', app.car.color, app.car.number);
  }
  for (const b of $$('.garage-colors button')) b.setAttribute('aria-pressed', String(b.dataset.color === app.car.color));
  const artModel = gt.art && Array.isArray(gt.art.CAR_MODELS) ? gt.art.CAR_MODELS.find((m) => m && m.id === app.car.model) : null;
  const raw = (artModel && artModel.stats) || MODEL_STATS[app.car.model] || MODEL_STATS.gt;
  const st = {};
  for (const k of ['speed', 'accel', 'grip']) st[k] = Math.max(1, Math.min(5, Math.round(Number(raw[k]) || 3)));
  const el = $('.garage-stats');
  if (el) {
    el.innerHTML = ['speed', 'accel', 'grip']
      .map((k) => `<i>${STAT_LABEL[k]} ${'<b></b>'.repeat(st[k])}${'<s></s>'.repeat(5 - st[k])}</i>`)
      .join('');
  }
  paintGarageCar();
  garage3DSync();
}
function openGarage() {
  show('garage');
  garage3DShow();
  loadView3D(); // warm up the 3D race view while the child picks a car
  gtReady.then(() => {
    if (app.screen !== 'garage') return;
    buildGarage();
    stopGarageSpin();
    garageSpin = setInterval(() => {
      if (app.screen !== 'garage') return stopGarageSpin();
      garageView++;
      paintGarageCar();
    }, 1800);
  });
  voice.say(say('circuitLine', 'サーキットで しょうぶ！'));
  voice.say('どの くるまに する？', { interrupt: false });
}

/** One lap of a circuit as a polyline (0..1 box) for the selection cards. */
function circuitOutline(id) {
  try {
    if (!gt.circuit || typeof gt.circuit.generateCircuit !== 'function') return null;
    const course = gt.circuit.generateCircuit(id, { laps: 1, seed: 1 });
    const n = course.lapLength || course.segments.length;
    let x = 0;
    let y = 0;
    let hd = 0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      hd += (course.segments[i].curve || 0) * 0.02;
      x += Math.sin(hd);
      y -= Math.cos(hd);
      pts.push([x, y]);
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
    return pts.map(([px, py]) => [(px - minX) / span, (py - minY) / span]);
  } catch (e) {
    return null;
  }
}
function paintCircuitCard(cv, id, def) {
  paintCanvas(cv, (c, w, h) => {
    const sea = def.base === 'sea';
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sea ? '#7fd3ff' : '#a9e07a');
    g.addColorStop(1, sea ? '#2f8fd8' : '#4f9e3a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const pts = circuitOutline(id);
    if (!pts) return;
    const pad = Math.min(w, h) * 0.16;
    const sz = Math.min(w, h) - pad * 2;
    const ox = (w - sz) / 2;
    const oy = (h - sz) / 2 - h * 0.04;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const path = () => {
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(ox + px * sz, oy + py * sz) : c.moveTo(ox + px * sz, oy + py * sz)));
    };
    path();
    c.strokeStyle = '#1b1e25';
    c.lineWidth = Math.max(8, w * 0.07);
    c.stroke();
    path();
    c.strokeStyle = '#5b606c';
    c.lineWidth = Math.max(5, w * 0.045);
    c.stroke();
    path();
    c.setLineDash([w * 0.02, w * 0.02]);
    c.strokeStyle = 'rgba(255,255,255,.75)';
    c.lineWidth = Math.max(1, w * 0.006);
    c.stroke();
    c.setLineDash([]);
    const [sx, sy] = pts[0];
    c.fillStyle = '#fff';
    c.fillRect(ox + sx * sz - w * 0.03, oy + sy * sz - w * 0.012, w * 0.06, w * 0.024);
  });
}
function openCircuitSelect() {
  const grid = $('.grid.circuits');
  grid.classList.remove('picked');
  grid.innerHTML = '';
  const defs = circuitDefs();
  for (const id of Object.keys(defs)) {
    const def = defs[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card circuit-card';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', def.label);
    b.dataset.circuit = id;
    b.innerHTML = `<canvas aria-hidden="true"></canvas><span class="label" aria-hidden="true">${def.label}</span>`;
    b.addEventListener('click', () => {
      if (app.busy) return;
      app.busy = true;
      app.circuit = id;
      sound.pop();
      b.classList.add('chosen');
      grid.classList.add('picked');
      voice.say(def.label + '！');
      setTimeout(() => {
        app.busy = false;
        startCircuitRace();
      }, 900);
    });
    grid.appendChild(b);
  }
  show('circuit');
  requestAnimationFrame(() => {
    for (const b of $$('.circuit-card')) paintCircuitCard($('canvas', b), b.dataset.circuit, defs[b.dataset.circuit]);
  });
  voice.say('どの サーキットを はしる？', { interrupt: false });
}

function circuitHooks() {
  const base = raceHooks();
  return {
    ...base,
    lap: (n, time, best) => {
      const laps = (app.race && app.race.course && app.race.course.laps) || CIRCUIT_LAPS;
      sound.lapBeep?.(!!best);
      if (best && n > 1) {
        flashText('ベストラップ！');
        voice.say(say('bestLapLine', 'ベストラップ！'), { interrupt: true });
      }
      if (n + 1 < laps) voice.say(say('lapLine', `${n + 1}しゅうめ！`, n + 1, laps), { interrupt: !best });
    },
    finalLap: () => {
      const laps = (app.race && app.race.course && app.race.course.laps) || CIRCUIT_LAPS;
      flashText('ファイナルラップ');
      sound.setTempo?.(1.12);
      voice.say(say('lapLine', 'さいごの いっしゅう！', laps, laps), { interrupt: false });
    },
  };
}

function startCircuitRace() {
  app.mode = 'circuit';
  clearInput();
  resumeRace();
  clearTimeout(app.goalTimer);
  clearInterval(app.fireworkTimer);
  renderer.particles.length = 0;
  renderer.flyers.length = 0;
  announcer.reset();
  sound.setTempo?.(1);
  app.replay = null;
  app.ghost = null;
  app.vehicle = 'car';
  const seed = params.get('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  app.race = new Race({
    circuit: app.circuit,
    car: { ...app.car },
    course: 'meadow',
    vehicle: 'car',
    speed: settings.speed,
    rivals: settings.rivals,
    laps: CIRCUIT_LAPS,
    seed,
    hooks: circuitHooks(),
  });
  if (!app.race.playerCar) app.race.playerCar = { ...app.car };
  {
    const race = app.race;
    if (!attach3D(race)) {
      loadView3D().then((v) => {
        if (v && app.race === race && ['race', 'goal'].includes(app.screen)) attach3D(race);
      });
    }
  }
  renderer.camMode = renderer.camMode && renderer.camMode !== 'tv' && renderer.camMode !== 'heli' ? renderer.camMode : 'chase';
  show('race');
  const def = circuitDefs()[app.circuit] || {};
  sound.playMusic(def.music || 'meadow');
  sound.crowdAmbience?.(true);
  $('#btn-cam').hidden = false;
  btnBoost?.classList.remove('ready', 'fire');
  buildGridIntro();
  app.gearWas = 1;
  app.brakeAt = 0;
  voice.say(say('circuitLine', 'サーキットで 3しゅう しょうぶ！'));
  voice.say(L.startLine(), { interrupt: false });
  lastT = 0;
}

const CAM_MODES = ['chase', 'far', 'bumper'];
function cycleCamera() {
  const i = CAM_MODES.indexOf(renderer.camMode);
  renderer.camMode = CAM_MODES[(i + 1) % CAM_MODES.length];
  if (g3.on) g3.view.setCamera?.(renderer.camMode);
  flashText({ chase: 'カメラ うしろ', far: 'カメラ とおく', bumper: 'カメラ まえ' }[renderer.camMode]);
}

/** Gear shifts and brakes are heard, not seen. */
function circuitAudio(race) {
  const p = race.player || {};
  if (Number.isFinite(p.gear)) {
    sound.engineGear?.(p.gear, Number.isFinite(p.rpm) ? p.rpm : 0.5);
    if (p.gear > (app.gearWas || 1) && race.state === 'race') sound.gearShift?.();
    app.gearWas = p.gear;
  }
  const now = performance.now();
  if (race.braking && !app.wasBraking && now - (app.brakeAt || 0) > 2500 && race.state === 'race') {
    app.brakeAt = now;
    sound.brakeSquealSoft?.();
  }
  app.wasBraking = !!race.braking;
}

/** Lap table on the goal screen (circuit only). */
function paintLaps(result) {
  const box = $('#laps');
  const replayBtn = $('#btn-replay');
  const circuit = app.mode === 'circuit';
  if (replayBtn) {
    const rec = app.race && app.race.replay;
    replayBtn.hidden = !(circuit && rec && Array.isArray(rec.frames) && rec.frames.length > 30 && gt.replay);
  }
  if (!box) return;
  const laps = (result && result.lapTimes) || [];
  box.hidden = !circuit || !laps.length;
  if (box.hidden) return;
  const best = Math.min(...laps.filter(Number.isFinite));
  box.innerHTML = laps
    .map((t, i) => `<div class="lap-row${t === best ? ' best' : ''}"><span>${i + 1}しゅう</span><b>${Number.isFinite(t) ? formatTime(t) : '—'}</b></div>`)
    .join('');
}

// ---- replay
function startReplay() {
  if (!app.race || !gt.replay || typeof gt.replay.createReplayPlayer !== 'function') return;
  clearTimeout(app.goalTimer);
  clearInterval(app.fireworkTimer);
  app.replay = gt.replay.createReplayPlayer(app.race);
  if (!app.replay || app.replay.duration <= 0) {
    app.replay = null;
    return;
  }
  // Remember where everyone finished so the goal screen keeps its state afterwards.
  app.replaySaved = {
    p: { x: app.race.player.x, z: app.race.player.z, speed: app.race.player.speed },
    r: app.race.rivals.map((o) => ({ x: o.x, z: o.z, speed: o.speed })),
  };
  app.replay.restart?.();
  renderer.camMode = app.replay.camera;
  renderer.replayMode = true;
  renderer.particles.length = 0;
  show('replay');
  sound.playMusic(((circuitDefs()[app.circuit] || {}).music) || 'meadow');
  sound.crowdAmbience?.(true);
  sound.engineStart();
  voice.say(say('replayLine', 'リプレイ！'));
  app.replayLast = 0;
}
function replayFrame(ts) {
  const rp = app.replay;
  if (!rp || !app.race) return endReplay();
  if (app.paused) {
    app.replayLast = 0;
    return;
  }
  const dt = app.replayLast ? Math.min(0.05, (ts - app.replayLast) / 1000) : 1 / 60;
  app.replayLast = ts;
  const race = app.race;
  const zBefore = race.player.z;
  const rzBefore = race.rivals.map((o) => o.z);
  rp.step(dt);
  rp.apply(race);
  // Speeds from movement, so speedo, engine and wheels look alive.
  if (dt > 0) {
    race.player.speed = Math.max(0, (race.player.z - zBefore) / dt);
    race.rivals.forEach((o, i) => (o.speed = Math.max(0, (o.z - rzBefore[i]) / dt)));
  }
  renderer.camMode = rp.camera;
  renderer.steer = race.player.steer || 0;
  renderer.dt = dt;
  if (g3.on) {
    g3.view.setReplay?.(true);
    g3.view.setCamera?.(rp.camera);
  }
  render3D(race, dt, ts / 1000);
  renderer.draw(race, ts / 1000);
  const max = (race.playerPreset && race.playerPreset.maxSpeed) || (race.preset && race.preset.maxSpeed) || 1;
  sound.engineSet(Math.min(1.5, race.player.speed / max), {});
  const bar = $('#replay-progress');
  if (bar) bar.style.width = `${Math.round((rp.t / Math.max(0.01, rp.duration)) * 100)}%`;
  if (rp.done) endReplay();
}
function endReplay() {
  const race = app.race;
  const saved = app.replaySaved;
  if (race && saved) {
    Object.assign(race.player, saved.p);
    race.rivals.forEach((o, i) => saved.r[i] && Object.assign(o, saved.r[i]));
  }
  app.replay = null;
  app.replaySaved = null;
  renderer.replayMode = false;
  renderer.camMode = 'chase';
  if (g3.on) {
    try {
      g3.view.setReplay?.(false);
      g3.view.setCamera?.('chase');
    } catch (e) {
      fail3D();
    }
  }
  sound.engineStop();
  if (app.screen === 'replay') {
    if (app.lastResult) showGoal();
    else go('title');
  }
}

// ---------------------------------------------------------------- grand prix
function paintRacer(cv, id, frame = 1) {
  if (app.mode === 'circuit') {
    const car = id === 'player' ? app.car : rivalCar(id);
    if (car) return paintSportsCar(cv, car.model, 'front34', car.color, car.number);
  }
  if (id === 'player') paintVehicle(cv, app.vehicle);
  else paintKart(cv, id, frame);
}

function fillStandings(list, standings, small = false) {
  if (!list) return;
  list.innerHTML = '';
  const rows = [];
  for (const e of standings) {
    const row = document.createElement('div');
    row.className = 'row' + (e.id === 'player' ? ' you' : '');
    row.setAttribute('role', 'listitem');
    row.innerHTML = `<b class="pos">${e.rank}</b><canvas aria-hidden="true"></canvas><span class="name">${small ? shortName(e.id) : racerName(e.id)}</span><span class="pts">${e.points}てん</span>`;
    list.appendChild(row);
    rows.push([row, e]);
  }
  requestAnimationFrame(() => {
    for (const [row, e] of rows) paintRacer($('canvas', row), e.id, e.rank === 1 ? 1 : 0);
  });
}

function showStandings() {
  const gp = app.gp;
  if (!gp) return go('title');
  clearInterval(app.fireworkTimer);
  const standings = gp.standings();
  const roundEl = $('#standings-round');
  if (roundEl) roundEl.textContent = `${gp.round} / ${gp.courses.length} レース`;
  show('standings');
  sound.playMusic('podium');
  fillStandings($('#standings-list'), standings);
  sound.standingsSting?.();
  const rank = gp.playerRank();
  setTimeout(() => {
    if (app.screen === 'standings') voice.say(say('gpStandingsLine', `いまの そうごうは ${L.RANK_WORDS ? L.RANK_WORDS[rank] || rank + 'ばん' : rank + 'ばん'}め！`, rank), { interrupt: false });
  }, 500);
}

function nextGpRace() {
  const gp = app.gp;
  if (!gp) return go('title');
  if (gp.isFinished()) return showCup();
  app.course = gp.nextCourse() || 'meadow';
  voice.say(say('gpNextLine', `つぎは ${COURSE_NAME[app.course]}！`, app.course));
  startRace();
}

function showCup() {
  const gp = app.gp;
  if (!gp) return go('title');
  const standings = gp.standings();
  const rank = gp.playerRank();
  const champion = standings[0];
  show('cup');
  sound.playMusic('podium');
  const text = $('#cup-text');
  if (text) text.textContent = rank === 1 ? 'チャンピオン！' : `そうごう ${rank}い！`;
  paintCanvas($('#cup-canvas'), (c, w, h) => {
    const sz = Math.min(w, h);
    c.translate((w - sz) / 2, (h - sz) / 2);
    drawTrophy(c, sz);
  });
  if (champion) {
    const cv = $('#cup-champ');
    if (champion.id === 'player') paintVehicle(cv, app.vehicle, true);
    else paintKart(cv, champion.id, 1);
  }
  fillStandings($('#cup-standings'), standings, true);
  // The cup sticker: gold for the champion, silver / bronze for the next two.
  const cupId = rank === 1 ? 'cup' : rank === 2 ? 'cup-silver' : rank === 3 ? 'cup-bronze' : null;
  const box = $('#cup-earned');
  if (box) {
    box.innerHTML = '';
    if (cupId && STICKERS.includes(cupId)) {
      book.add([cupId]);
      const cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      box.appendChild(cv);
      paintCanvas(cv, (c, w) => drawSticker(c, cupId, w, true));
    }
  }
  if (typeof sound.cupFanfare === 'function') sound.cupFanfare();
  else sound.fanfare();
  setTimeout(() => sound.crowd?.(3), 400);
  vibrate([80, 40, 80, 40, 120]);
  renderer.confetti(rank === 1 ? 120 : 60);
  clearInterval(app.fireworkTimer);
  let n = 0;
  app.fireworkTimer = setInterval(() => {
    renderer.firework();
    if (n++ % 2 === 0) renderer.confetti(20);
    if (n > (rank === 1 ? 16 : 6)) clearInterval(app.fireworkTimer);
  }, 700);
  const fallback = rank === 1 ? 'チャンピオン！ おめでとう！' : rank <= 3 ? `そうごう ${rank}ばん！ すごい！` : 'さんせん かんそう！ えらい！';
  voice.say(say('gpChampionLine', fallback, rank));
}

function startGrandPrix() {
  unlockAudio();
  sound.pop();
  app.mode = 'gp';
  app.gp = createGrandPrix();
  voice.say(say('gpStartLine', 'グランプリ スタート！ ４つの コースで しょうぶ！'));
  go('vehicle');
}

function endGrandPrix() {
  app.mode = 'single';
  app.gp = null;
}

// ---------------------------------------------------------------- sticker book
function buildBook() {
  const g = $('.book-grid');
  g.innerHTML = '';
  for (const id of STICKERS) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.setAttribute('role', 'listitem');
    const owned = book.has(id);
    slot.setAttribute('aria-label', owned ? `シール ${book.count(id)}まい` : 'まだ ないシール');
    const cv = document.createElement('canvas');
    slot.appendChild(cv);
    if (owned && book.count(id) > 1) {
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = String(book.count(id));
      slot.appendChild(n);
    }
    g.appendChild(slot);
  }
  requestAnimationFrame(() => {
    $$('.book-grid .slot').forEach((slot, i) => {
      paintCanvas($('canvas', slot), (c, w) => drawSticker(c, STICKERS[i], w, book.has(STICKERS[i])));
    });
  });
  voice.say(book.distinct() ? 'シールが いっぱい！' : 'レースで シールを あつめよう！');
}

// ---------------------------------------------------------------- input
const pointers = new Map();
const keys = { left: false, right: false };
const padPointers = new Map();
function clearInput() {
  pointers.clear(); padPointers.clear(); keys.left = keys.right = false;
  $$('.steer-pad').forEach(b => b.classList.remove('held'));
}
for (const b of $$('.steer-pad')) {
  b.addEventListener('pointerdown', e => {
    if (app.paused) return;
    e.preventDefault(); b.setPointerCapture(e.pointerId);
    padPointers.set(e.pointerId, Number(b.dataset.steer)); b.classList.add('held');
  });
  const releasePad = e => { padPointers.delete(e.pointerId); b.classList.remove('held'); };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(name, releasePad);
}
const pausePanel = document.createElement('div');
pausePanel.className = 'race-break'; pausePanel.hidden = true;
pausePanel.setAttribute('role', 'dialog'); pausePanel.setAttribute('aria-label', 'ひとやすみ');
pausePanel.innerHTML = '<div><h2>ひとやすみ</h2><button id="race-resume">▶ つづける</button><button id="race-home">⌂ おうちへ</button></div>';
document.body.append(pausePanel);
function pauseRace() {
  if (app.screen !== 'race') return;
  setPaused(true); pausePanel.hidden = false; $('#race-resume').focus();
}
function resumeRace() { pausePanel.hidden = true; if (!app.settingsOpen) setPaused(false); }
$('#btn-pause').onclick = pauseRace;
$('#race-resume').onclick = resumeRace;
$('#race-home').onclick = () => { leaveRace(); endGrandPrix(); resumeRace(); go('title'); };
window.addEventListener('blur', () => { clearInput(); pauseRace(); });
let tilt = { value: 0, active: false };

const raceEl = $('#scr-race');
raceEl.addEventListener('pointerdown', (e) => {
  if (app.paused) return;
  if (e.target.closest('button')) return;
  pointers.set(e.pointerId, e.clientX);
  try {
    raceEl.setPointerCapture(e.pointerId);
  } catch (err) {}
});
raceEl.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX);
});
const release = (e) => pointers.delete(e.pointerId);
raceEl.addEventListener('pointerup', release);
raceEl.addEventListener('pointercancel', release);
raceEl.addEventListener('lostpointercapture', release);

window.addEventListener('keydown', (e) => {
  if (app.screen !== 'race' || app.paused) return;
  if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'ArrowRight') keys.right = true;
  if (e.key === ' ' && app.race && app.screen === 'race') app.race.honk();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'ArrowRight') keys.right = false;
});

function screenAngle() {
  try {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  } catch (e) {}
  return typeof window.orientation === 'number' ? window.orientation : 0;
}
function onOrientation(e) {
  const a = screenAngle();
  let deg = e.gamma || 0;
  if (a === 90) deg = e.beta || 0;
  else if (a === -90 || a === 270) deg = -(e.beta || 0);
  else if (a === 180) deg = -(e.gamma || 0);
  tilt.value = steerFromTilt(deg);
  tilt.active = true;
}
function enableTilt(on) {
  if (on) window.addEventListener('deviceorientation', onOrientation);
  else {
    window.removeEventListener('deviceorientation', onOrientation);
    tilt = { value: 0, active: false };
  }
}

function currentSteer() {
  if (padPointers.size) return Array.from(padPointers.values()).at(-1);
  let steer = 0;
  if (pointers.size) {
    const last = Array.from(pointers.values()).pop();
    steer = steerFromPointer(last, window.innerWidth);
  } else if (keys.left !== keys.right) {
    steer = keys.left ? -1 : 1;
  } else if (settings.tilt && tilt.active) {
    steer = tilt.value;
  }
  return steer;
}

function pulse(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
$('#btn-honk').addEventListener('click', (e) => {
  e.stopPropagation();
  if (app.race && !app.paused) app.race.honk();
  pulse(e.currentTarget, 'toot');
});
const btnBoost = $('#btn-boost');
btnBoost?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!app.race || app.paused || app.screen !== 'race') return;
  const used = typeof app.race.useBoost === 'function' ? app.race.useBoost() : false;
  if (!used) sound.pop(); // not ready yet: a little "tap" so the button still answers
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'b' && app.race && app.screen === 'race' && !app.paused) app.race.useBoost?.();
});

/** The rival closest to the player (for its engine sound). */
function nearestRival(race) {
  if (typeof race.nearestRival === 'function') return race.nearestRival();
  let best = null;
  let dist = Infinity;
  for (const r of race.rivals) {
    const d = Math.abs(r.z - race.player.z);
    if (d < dist) {
      dist = d;
      best = r;
    }
  }
  return best ? { rival: best, dist } : null;
}

// ---------------------------------------------------------------- loop
let lastT = 0;
const fps = { frames: [], log: false };
function frame(ts) {
  requestAnimationFrame(frame);
  if (fps.log) fps.frames.push(ts);
  if (app.screen === 'replay') {
    replayFrame(ts);
    return;
  }
  const racing = ['race', 'goal', 'standings', 'cup'].includes(app.screen);
  if (!racing || !app.race) {
    lastT = 0;
    return;
  }
  if (app.paused) {
    lastT = 0;
    return;
  }
  const dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 1 / 60;
  lastT = ts;
  const steer = app.screen === 'race' ? currentSteer() : 0;
  app.race.update(dt, { steer });
  announcer.tick();
  renderer.steer = steer;
  renderer.dt = dt;
  render3D(app.race, dt, ts / 1000);
  renderer.draw(app.race, ts / 1000);
  const p = app.race.player;
  sound.engineSet(Math.min(1.5, app.race.speedPct), { boost: p.boost > 0, offroad: !!p.offroad, drift: !!p.drift });
  if (btnBoost) btnBoost.classList.toggle('ready', app.screen === 'race' && !!app.race.boostReady);
  if (app.mode === 'circuit') circuitAudio(app.race);
  // The nearest rival's engine: louder when close, panned to its side.
  if (typeof sound.rivalEngineSet === 'function') {
    const near = app.screen === 'race' && app.race.state === 'race' ? nearestRival(app.race) : null;
    if (near && near.rival) {
      const max = (app.race.preset && app.race.preset.maxSpeed) || 1;
      sound.rivalEngineSet(clamp(1 - near.dist / 900, 0, 1), clamp((near.rival.x - p.x) / 1.5, -1, 1), clamp(near.rival.speed / max, 0, 1.5));
    } else sound.rivalEngineSet(0, 0, 0);
  }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- resize / visibility
function readSafe() {
  const cs = getComputedStyle($('#safe'));
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}
let resizeTimer = 0;
function onResize() {
  renderer.resize(readSafe());
  try {
    g3.view?.resize?.(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    if (g3.garage && app.screen === 'garage') {
      const r = $('.garage-stage').getBoundingClientRect();
      g3.garage.resize?.(r.width, r.height, window.devicePixelRatio || 1);
    }
  } catch (e) {
    /* 3D is optional */
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    paintMenus();
    if (app.screen === 'goal') paintGoal();
    if (app.screen === 'book') buildBook();
  }, 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

function setPaused(p) {
  app.paused = p;
  if (p) {
    clearInput();
    sound.engineStop();
    sound.suspend();
    voice.stop();
  } else {
    sound.resume();
    if (app.race && app.screen === 'race' && app.race.state === 'race') sound.engineStart();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPaused(true); pauseRace(); }
  else if (!app.settingsOpen && pausePanel.hidden) setPaused(false);
});
window.addEventListener('pagehide', () => setPaused(true));

// Block gestures that would zoom / select / open menus.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener(
  'touchmove',
  (e) => {
    if (!e.target.closest('.book-page, #settings .panel')) e.preventDefault();
  },
  { passive: false },
);

// ---------------------------------------------------------------- buttons
$('#btn-start').addEventListener('click', () => {
  unlockAudio();
  sound.pop();
  endGrandPrix();
  go('vehicle');
});
$('#btn-gp')?.addEventListener('click', startGrandPrix);
$('#btn-next')?.addEventListener('click', () => {
  sound.pop();
  showStandings();
});
$('#btn-standings-next')?.addEventListener('click', () => {
  sound.pop();
  nextGpRace();
});
$('#btn-cup-home')?.addEventListener('click', () => {
  sound.pop();
  leaveRace();
  endGrandPrix();
  go('title');
});
$('#btn-book').addEventListener('click', () => {
  sound.pop();
  go('book');
});
for (const b of $$('[data-go]')) {
  b.addEventListener('click', () => {
    sound.pop();
    go(b.dataset.go);
  });
}
for (const b of $$('[data-say]')) {
  b.addEventListener('click', () => {
    sound.pop();
    voice.say(b.dataset.say);
  });
}
$('#btn-again').addEventListener('click', () => {
  sound.pop();
  if (app.mode === 'circuit') startCircuitRace();
  else startRace();
});
$('#btn-other').addEventListener('click', () => {
  sound.pop();
  const wasCircuit = app.mode === 'circuit';
  leaveRace();
  endGrandPrix();
  if (wasCircuit) app.mode = 'circuit';
  go(wasCircuit ? 'garage' : 'vehicle');
});
$('#btn-circuit')?.addEventListener('click', () => {
  unlockAudio();
  sound.pop();
  endGrandPrix();
  app.mode = 'circuit';
  go('garage');
});
$('#btn-garage-go')?.addEventListener('click', () => {
  sound.horn?.('car');
  go('circuit');
});
$('#btn-cam')?.addEventListener('click', () => {
  sound.pop();
  cycleCamera();
});
$('#btn-replay')?.addEventListener('click', () => {
  sound.pop();
  startReplay();
});
$('#btn-replay-cam')?.addEventListener('click', () => {
  sound.pop();
  if (app.replay) {
    app.replay.nextCamera();
    renderer.camMode = app.replay.camera;
  }
});
$('#btn-replay-close')?.addEventListener('click', () => {
  sound.pop();
  endReplay();
});

function leaveRace() {
  clearTimeout(app.goalTimer);
  clearInterval(app.fireworkTimer);
  sound.engineStop();
  sound.rivalEngineSet?.(0, 0, 0);
  sound.setTempo?.(1);
  announcer.reset();
  hideGridIntro();
  btnBoost?.classList.remove('ready', 'fire');
  sound.crowdAmbience?.(false);
  app.replay = null;
  renderer.camMode = 'chase';
  app.race = null;
  pointers.clear();
}

// ---------------------------------------------------------------- parent settings (long press)
const gear = $('#gear');
let pressStart = 0;
let pressRaf = 0;
function pressTick() {
  const p = Math.min(1, (performance.now() - pressStart) / 2000);
  gear.style.setProperty('--p', p.toFixed(3));
  if (p >= 1) {
    cancelPress();
    openSettings();
    return;
  }
  pressRaf = requestAnimationFrame(pressTick);
}
function cancelPress() {
  pressStart = 0;
  gear.classList.remove('pressing');
  cancelAnimationFrame(pressRaf);
  gear.style.setProperty('--p', '0');
}
gear.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  pressStart = performance.now();
  cancelAnimationFrame(pressRaf);
  gear.classList.add('pressing');
  pressRaf = requestAnimationFrame(pressTick);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) gear.addEventListener(ev, cancelPress);
gear.addEventListener('click', (e) => {
  // Keyboard activation (detail === 0) opens directly for adults using a keyboard.
  if (e.detail === 0) openSettings();
});

function syncSettingsUI() {
  for (const b of $$('#settings .toggle')) b.setAttribute('aria-pressed', String(!!settings[b.dataset.key]));
  for (const b of $$('#settings [data-speed]')) b.setAttribute('aria-pressed', String(settings.speed === b.dataset.speed));
  for (const b of $$('#settings [data-rivals]')) b.setAttribute('aria-pressed', String(settings.rivals === b.dataset.rivals));
}
function openSettings() {
  app.settingsOpen = true;
  setPaused(true);
  syncSettingsUI();
  $('#settings').hidden = false;
  $('#btn-close').focus({ preventScroll: true });
}
function closeSettings() {
  app.settingsOpen = false;
  $('#settings').hidden = true;
  setPaused(!pausePanel.hidden);
}
function applySettings() {
  saveSettings(storage, settings);
  sound.setSfx(settings.sound);
  sound.setMusic(settings.music);
  voice.enabled = settings.voice;
  if (!settings.voice) voice.stop();
  enableTilt(settings.tilt);
  syncSettingsUI();
}
for (const b of $$('#settings .toggle')) {
  b.addEventListener('click', async () => {
    const key = b.dataset.key;
    const next = !settings[key];
    if (key === 'tilt' && next) {
      const DOE = window.DeviceOrientationEvent;
      try {
        if (DOE && typeof DOE.requestPermission === 'function') {
          const res = await DOE.requestPermission();
          if (res !== 'granted') {
            settings.tilt = false;
            applySettings();
            return;
          }
        }
      } catch (e) {
        settings.tilt = false;
        applySettings();
        return;
      }
    }
    settings[key] = next;
    applySettings();
  });
}
for (const b of $$('#settings [data-speed]')) {
  b.addEventListener('click', () => {
    settings.speed = b.dataset.speed;
    applySettings();
  });
}
// Competition level ("きょうそう"): how strong the rival karts are. Takes effect from the next race.
for (const b of $$('#settings [data-rivals]')) {
  b.addEventListener('click', () => {
    settings.rivals = b.dataset.rivals;
    applySettings();
    voice.say(L.levelLine(settings.rivals));
  });
}
$('#btn-close').addEventListener('click', closeSettings);
$('#btn-home').addEventListener('click', () => {
  leaveRace();
  endGrandPrix();
  closeSettings();
  go('title');
});
$('#btn-reset').addEventListener('click', () => {
  let ok = true;
  try {
    ok = window.confirm('シールブックの記録をすべて消しますか？');
  } catch (e) {}
  if (ok) {
    book.reset();
    records.reset?.();
    ghosts?.reset?.();
    if (app.screen === 'book') buildBook();
  }
});

// ---------------------------------------------------------------- boot
buildMenus();
onResize();
paintMenus();
enableTilt(settings.tilt);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintMenus).catch(() => {});

if ('serviceWorker' in navigator && params.get('nosw') !== '1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Small hook for automated tests / debugging (read-only use).
window.__kr = {
  get ghosts() {
    return ghosts;
  },
  get app() {
    return app;
  },
  get race() {
    return app.race;
  },
  book,
  records,
  settings,
  fps,
  renderer,
  g3,
};
