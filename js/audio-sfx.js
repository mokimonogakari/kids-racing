// Race sound effects for the competitive mode. Every function takes the Sound
// instance from audio.js and uses its tone()/noise() helpers, so nothing here
// touches WebAudio directly except for (optional) stereo panning.
// All sounds are synthesised: no audio files, no imports.

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function noteFreq(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function now(sound, lead = 0.01) {
  return (sound.ctx && sound.ctx.currentTime ? sound.ctx.currentTime : 0) + lead;
}

/** A stereo panner routed into the sfx bus, or null when the browser has none. */
function makePanner(sound) {
  const c = sound.ctx;
  if (!c || typeof c.createStereoPanner !== 'function') return null;
  try {
    const p = c.createStereoPanner();
    p.connect(sound.sfx);
    return p;
  } catch (e) {
    return null;
  }
}

/** Tyres squeal for a moment when the car slides through a bend. */
export function skid(sound) {
  if (!sound.ok()) return;
  const t = now(sound);
  sound.noise(t, 0.28, { freq: 2200, sweep: 900, q: 1.4, gain: 0.18, attack: 0.015 });
  sound.tone(1900, t, 0.14, { type: 'sine', slide: 1150, gain: 0.05, attack: 0.01, release: 0.05 });
}

/** One "da" of the da-da-da over the red/white curb. */
export function curbTick(sound) {
  if (!sound.ok()) return;
  const t = now(sound, 0.005);
  sound.noise(t, 0.05, { filter: 'lowpass', freq: 900, sweep: 300, gain: 0.16, attack: 0.004 });
  sound.tone(90, t, 0.07, { type: 'sine', slide: 60, gain: 0.2, attack: 0.004, release: 0.03 });
}

/** A kart whooshes past (or we pass it). dir = -1 / 1 moves the sound across the stereo field. */
export function passBy(sound, dir = 1) {
  if (!sound.ok()) return;
  const t = now(sound);
  const d = dir < 0 ? -1 : 1;
  const dur = 0.55;
  const panner = makePanner(sound);
  if (panner && panner.pan) {
    try {
      panner.pan.setValueAtTime(-0.7 * d, t);
      panner.pan.linearRampToValueAtTime(0.7 * d, t + dur);
    } catch (e) {
      /* panning is optional */
    }
  }
  const dest = panner || undefined;
  sound.tone(520, t, dur, { type: 'sawtooth', slide: 260, lp: 1500, gain: 0.12, attack: 0.03, release: 0.12, dest });
  sound.noise(t, dur * 0.9, { freq: 1000, sweep: 320, q: 1.1, gain: 0.07, attack: 0.05, dest });
}

/** "Vroom" – a quick rev of the engine (countdown, good start). */
export function rev(sound) {
  if (!sound.ok()) return;
  const t = now(sound);
  // up... and back down: two slides that hand over to each other.
  sound.tone(70, t, 0.24, { type: 'sawtooth', slide: 190, slideTime: 0.22, lp: 600, gain: 0.2, attack: 0.02, release: 0.03 });
  sound.tone(190, t + 0.22, 0.3, { type: 'sawtooth', slide: 80, slideTime: 0.28, lp: 600, gain: 0.2, attack: 0.01, release: 0.14 });
  sound.noise(t, 0.3, { filter: 'lowpass', freq: 700, sweep: 250, gain: 0.08, attack: 0.03 });
}

/** The grandstand roars: a slow swell of noise with little voices scattered on top. */
export function crowd(sound, secs = 2.5) {
  if (!sound.ok()) return;
  const t = now(sound);
  const dur = Math.max(0.8, secs);
  sound.noise(t, dur, { freq: 1100, q: 0.6, gain: 0.1, attack: dur * 0.3 });
  sound.noise(t + dur * 0.15, dur * 0.8, { filter: 'highpass', freq: 2600, gain: 0.03, attack: dur * 0.25 });
  const n = 8 + Math.floor(Math.random() * 5); // 8..12 voices
  for (let i = 0; i < n; i++) {
    const f = 600 + Math.random() * 700;
    const at = t + dur * 0.1 + Math.random() * dur * 0.75;
    sound.tone(f, at, 0.14 + Math.random() * 0.12, { type: 'triangle', slide: f * (1.15 + Math.random() * 0.25), gain: 0.045, attack: 0.02 });
  }
}

/** A soft "clonk" when two karts touch. */
export function bumpCar(sound) {
  if (!sound.ok()) return;
  const t = now(sound, 0.005);
  sound.tone(180, t, 0.12, { type: 'sine', slide: 90, gain: 0.25, attack: 0.004, release: 0.06 });
  sound.noise(t, 0.06, { filter: 'lowpass', freq: 1400, sweep: 400, gain: 0.12, attack: 0.004 });
}

/** Jingle at the finish line, scaled to how well the race went. Never a sad sound. */
export function finishJingle(sound, rank = 1) {
  if (!sound.ok()) return;
  const t = now(sound, 0.02);
  const r = Number.isFinite(rank) ? rank : 1;
  if (r <= 1) {
    // Winner: rising arpeggio and a big bright chord.
    const notes = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
    notes.forEach((n, i) => {
      const f = noteFreq(n);
      sound.tone(f, t + i * 0.11, 0.3, { type: 'square', gain: 0.1, lp: 3200, attack: 0.01 });
      sound.tone(f / 2, t + i * 0.11, 0.3, { type: 'triangle', gain: 0.12 });
    });
    const chordAt = t + notes.length * 0.11 + 0.05;
    for (const n of ['C6', 'E6', 'G6']) sound.tone(noteFreq(n), chordAt, 1.3, { type: 'triangle', gain: 0.1, attack: 0.02, release: 0.5, vib: [5, 4] });
    sound.tone(noteFreq('C4'), chordAt, 1.3, { type: 'triangle', gain: 0.14, attack: 0.02, release: 0.5 });
    sound.tone(noteFreq('C7'), chordAt + 0.1, 0.5, { type: 'sine', gain: 0.05, release: 0.3 });
  } else if (r <= 3) {
    // Podium: a short bright fanfare.
    const seq = [['G5', 0, 0.14], ['G5', 0.16, 0.14], ['C6', 0.32, 0.6], ['E6', 0.6, 0.5]];
    for (const [n, dt, d] of seq) {
      sound.tone(noteFreq(n), t + dt, d, { type: 'square', gain: 0.09, lp: 3000, attack: 0.01 });
      sound.tone(noteFreq(n) / 2, t + dt, d, { type: 'triangle', gain: 0.12 });
    }
    sound.tone(noteFreq('C5'), t + 0.32, 0.8, { type: 'triangle', gain: 0.1, release: 0.3 });
  } else {
    // Everyone who finishes gets a gentle, warm rising tune.
    const seq = [['C5', 0], ['E5', 0.3], ['G5', 0.6]];
    for (const [n, dt] of seq) {
      sound.tone(noteFreq(n), t + dt, 0.55, { type: 'sine', gain: 0.12, attack: 0.03, release: 0.25, vib: [5, 3] });
      sound.tone(noteFreq(n) * 2, t + dt, 0.4, { type: 'triangle', gain: 0.04, attack: 0.03, release: 0.2 });
    }
    sound.tone(noteFreq('C6'), t + 0.95, 0.9, { type: 'sine', gain: 0.1, attack: 0.05, release: 0.5, vib: [5, 3] });
  }
}

/** Tucked in behind another kart: a soft rush of air. */
export function slipstream(sound) {
  if (!sound.ok()) return;
  const t = now(sound);
  sound.noise(t, 0.6, { filter: 'highpass', freq: 3000, sweep: 6000, gain: 0.08, attack: 0.08 });
  sound.tone(400, t, 0.4, { type: 'sine', slide: 700, gain: 0.03, attack: 0.05, release: 0.2 });
}
