// App controller: screens, input, game loop, settings, persistence.
import { Sound } from './audio.js';
import { Voice } from './voice.js';
import { Renderer } from './render.js';
import { Race } from './race.js';
import { COURSES, COURSE_IDS } from './course.js';
import { VEHICLES, drawVehicleFront, drawCourseTile, drawSticker } from './art.js';
import { STICKERS, createStickerBook, stickersForRace } from './stickers.js';
import { loadSettings, saveSettings } from './settings.js';
import { getStorage } from './storage.js';
import { steerFromPointer, steerFromTilt } from './physics.js';

const params = new URLSearchParams(location.search);
const FAST = params.get('fast') === '1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const storage = getStorage();
const settings = loadSettings(storage);
const book = createStickerBook(storage);
const sound = new Sound();
const caption = document.createElement('div');
caption.className = 'voice-caption'; caption.setAttribute('role', 'status'); caption.hidden = true;
document.body.append(caption);
let captionTimer;
const voice = new Voice({
  onActivity: active => sound.duckVoice(active),
  onText: text => { clearTimeout(captionTimer); caption.textContent = text; caption.hidden = false; captionTimer = setTimeout(() => caption.hidden = true, 3500); },
});
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
  earned: [],
};

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

// ---------------------------------------------------------------- screens
function show(name) {
  app.screen = name;
  for (const sec of $$('.screen')) {
    const on = sec.id === 'scr-' + name;
    sec.hidden = !on;
    sec.classList.toggle('enter', on);
  }
  document.body.classList.toggle('racing', name === 'race' || name === 'goal');
  if (name === 'title' || name === 'vehicle' || name === 'course' || name === 'book') {
    sound.playMusic('menu');
  }
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
  if (!cv.clientWidth) return; // hidden: painted again when its screen is shown
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
    b.innerHTML = `<canvas class="vcanvas" aria-hidden="true"></canvas><span class="label" aria-hidden="true">${v.label}</span>`;
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
    go('course');
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
const RIVAL_NAMES = { bear: 'くまさん', rabbit: 'うさぎさん', frog: 'かえるさん', pig: 'ぶたさん', cat: 'ねこさん' };

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
  const seed = params.get('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  app.race = new Race({
    course: app.course,
    vehicle: app.vehicle,
    speed: settings.speed,
    length: FAST ? 170 : settings.speed === 'slow' ? 1050 : 1250,
    seed,
    hooks: raceHooks(),
  });
  show('race');
  sound.playMusic(COURSES[app.course].music);
  voice.say('よーい！');
  lastT = 0;
}

function raceHooks() {
  return {
    starReward: () => {
      sound.whoosh();
      voice.say('ほしが ５こ！ びゅーん！');
      renderer.confetti(25);
    },
    count: () => sound.beep(false),
    go: () => {
      voice.say('どん！');
      sound.beep(true);
      sound.engineStart();
    },
    collect: (kind, id) => {
      if (kind === 'star') $('#star-count').textContent = `${app.race.stars % 5} / 5`;
      sound.chime(kind === 'fruit');
      const slot = kind === 'star' ? 0 : 1 + COURSES[app.course].fruits.indexOf(id);
      renderer.burst(renderer.carX, renderer.carY, 10, ['#fff6a8', '#ffd23f', '#ffffff', '#ff9fd1'], 200);
      renderer.flyTo(id, renderer.carX, renderer.carY - 30, slot);
      if (kind === 'fruit') voice.say('おいしそう！', { minGap: 5000, interrupt: false });
    },
    bump: (what) => {
      sound.boing();
      sound.giggle();
      if (what === 'cow') sound.moo();
      renderer.burst(renderer.carX, renderer.carY - 20, 8, ['#ffffff', '#ffd23f', '#ff9fd1'], 160);
      if (what === 'rival') voice.say('ぽよーん！', { minGap: 4000, interrupt: false });
    },
    fence: () => sound.boing(),
    boost: () => {
      sound.whoosh();
      voice.say('びゅーん！', { minGap: 6000, interrupt: false });
    },
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
    pass: (animal) => {
      sound.cheer();
      voice.say(`${RIVAL_NAMES[animal] || ''}が おうえんしてるよ。がんばれー！`, { minGap: 7000, interrupt: false });
    },
    milestone: (k) => {
      if (k === 0.3) voice.say('がんばれー！', { interrupt: false });
      else if (k === 0.62) voice.say('はやいね！ がんばれー！', { interrupt: false });
      else voice.say('もうすこし！', { interrupt: false });
    },
    honk: () => sound.horn(app.vehicle),
    goal: (result) => onGoal(result),
  };
}

function onGoal(result) {
  sound.engineStop();
  sound.fanfare();
  setTimeout(() => sound.cheer(), 600);
  voice.say('ゴール！ すごいね！');
  renderer.confetti(90);
  let n = 0;
  clearInterval(app.fireworkTimer);
  app.fireworkTimer = setInterval(() => {
    if (app.paused) return;
    renderer.firework();
    if (n++ % 3 === 0) renderer.confetti(30);
    if (n > 12) clearInterval(app.fireworkTimer);
  }, 800);
  const earned = stickersForRace(result);
  app.lastResult = result;
  app.earned = earned;
  app.fresh = book.add(earned);
  clearTimeout(app.goalTimer);
  app.goalTimer = setTimeout(showGoal, FAST ? 1800 : 2600);
}

function showGoal() {
  show('goal');
  const recordKey = 'buubuu.best-stars.' + app.course;
  let best = 0;
  try { best = Math.max(0, Number(storage.getItem(recordKey)) || 0); } catch {}
  const stars = app.lastResult.stars;
  $('#race-record').textContent = `⭐ ${stars}こ あつめた！${stars > best ? ' 🎉 しんきろく！' : ` ベスト ${best}こ`}`;
  try { storage.setItem(recordKey, String(Math.max(best, stars))); } catch {}
  paintVehicle($('.goal-car'), app.vehicle, true);
  const box = $('.earned');
  box.innerHTML = '';
  app.earned.forEach((id, i) => {
    const cv = document.createElement('canvas');
    cv.style.animationDelay = 0.25 + i * 0.18 + 's';
    cv.setAttribute('aria-hidden', 'true');
    box.appendChild(cv);
    paintCanvas(cv, (c, w) => drawSticker(c, id, w, true));
  });
  setTimeout(() => {
    if (app.screen === 'goal') voice.say('シールを もらったよ！ いちばん！', { interrupt: false });
  }, 1200);
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
$('#race-home').onclick = () => { leaveRace(); resumeRace(); go('title'); };
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

$('#btn-honk').addEventListener('click', (e) => {
  e.stopPropagation();
  if (app.race && !app.paused) app.race.honk();
  const b = e.currentTarget;
  b.classList.remove('toot');
  void b.offsetWidth;
  b.classList.add('toot');
});

// ---------------------------------------------------------------- loop
let lastT = 0;
const fps = { frames: [], log: false };
function frame(ts) {
  requestAnimationFrame(frame);
  if (fps.log) fps.frames.push(ts);
  const racing = app.screen === 'race' || app.screen === 'goal';
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
  renderer.steer = steer;
  renderer.dt = dt;
  renderer.draw(app.race, ts / 1000);
  sound.engineSet(Math.min(1.5, app.race.speedPct));
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
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    paintMenus();
    if (app.screen === 'goal') paintVehicle($('.goal-car'), app.vehicle, true);
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
  go('vehicle');
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
  startRace();
});
$('#btn-other').addEventListener('click', () => {
  sound.pop();
  leaveRace();
  go('vehicle');
});

function leaveRace() {
  clearTimeout(app.goalTimer);
  clearInterval(app.fireworkTimer);
  sound.engineStop();
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
$('#btn-close').addEventListener('click', closeSettings);
$('#btn-home').addEventListener('click', () => {
  leaveRace();
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
  get app() {
    return app;
  },
  get race() {
    return app.race;
  },
  book,
  settings,
  fps,
  renderer,
};
