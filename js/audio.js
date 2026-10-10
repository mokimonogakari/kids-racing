// All sound is synthesised with WebAudio: no audio files.
const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function noteFreq(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Original little tunes (32 eighth-note steps each). '.' = rest.
const TRACKS = {
  menu: {
    bpm: 104, lead: 'triangle', leadGain: 0.5,
    melody: 'C5 E5 G5 E5 F5 A5 G5 . E5 G5 C6 G5 A5 G5 E5 . D5 F5 A5 F5 G5 F5 E5 D5 C5 E5 D5 B4 C5 . . .',
    bass: 'C3 . G2 . F2 . C3 . C3 . G2 . F2 . A2 . D3 . A2 . G2 . B2 . C3 . G2 . C3 . . .',
    drums: 'k.h.s.h.k.h.s.hh',
  },
  meadow: {
    bpm: 132, lead: 'square', leadGain: 0.28,
    melody: 'G4 B4 D5 B4 G4 B4 D5 G5 E5 . D5 B4 C5 . A4 . G4 B4 D5 G5 F#5 E5 D5 B4 C5 E5 D5 A4 G4 . . .',
    bass: 'G2 . D3 . G2 . D3 . C3 . G2 . D3 . D2 . G2 . D3 . E3 . B2 . C3 . D3 . G2 . D2 .',
    drums: 'k.h.s.h.k.hks.h.',
  },
  sea: {
    bpm: 100, lead: 'triangle', leadGain: 0.55,
    melody: 'F5 . A5 . C6 . A5 G5 F5 . D5 . C5 . . . Bb4 . D5 F5 G5 . F5 D5 C5 . A4 . F4 . . .',
    bass: 'F2 . C3 . F2 . C3 . D3 . A2 . D3 . A2 . Bb2 . F2 . Bb2 . F2 . C3 . G2 . F2 . C3 .',
    drums: 'k..hs..hk.h.s..h',
  },
  snow: {
    bpm: 120, lead: 'sine', leadGain: 0.6,
    melody: 'D5 F#5 A5 F#5 D5 F#5 A5 D6 B5 A5 G5 E5 F#5 . . . G5 B5 D6 B5 A5 F#5 D5 F#5 E5 G5 F#5 E5 D5 . . .',
    bass: 'D3 . A2 . D3 . A2 . G2 . D3 . A2 . E3 . G2 . D3 . F#2 . B2 . A2 . E3 . D3 . A2 .',
    drums: 'jjk.jjs.jjk.jjs.',
  },
};

function parseSeq(str) {
  return str.trim().split(/\s+/).map((t) => (t === '.' ? 0 : noteFreq(t)));
}
for (const t of Object.values(TRACKS)) {
  t.m = parseSeq(t.melody);
  t.b = parseSeq(t.bass);
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.track = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.engine = null;
    this.chimeStep = 0;
    this.lastChime = 0;
  }

  /** Must be called from a user gesture (pointerup/touchend/click). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = this.sfxOn ? 0.55 : 0;
        this.sfx.connect(this.master);
        this.mus = this.ctx.createGain();
        this.mus.gain.value = this.musicOn ? 0.13 : 0;
        this.mus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      // iOS: play a silent buffer inside the gesture.
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch (e) {
      /* audio is optional */
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
    if (!on) this.engineStop();
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.mus) this.mus.gain.setTargetAtTime(on ? (this.voiceActive ? 0.035 : 0.13) : 0, this.ctx.currentTime, 0.1);
  }

  duckVoice(active) {
    this.voiceActive = active;
    this.setMusic(this.musicOn);
    if (this.sfx) this.sfx.gain.setTargetAtTime(this.sfxOn ? (active ? .24 : .55) : 0, this.ctx.currentTime, .08);
  }

  suspend() {
    try {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    } catch (e) {}
  }
  resume() {
    try {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    } catch (e) {}
  }

  // ---------- building blocks ----------
  tone(freq, t, dur, o = {}) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideTime || dur));
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain ?? 0.3;
    const a = o.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - (o.release ?? 0.08)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    if (o.vib) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      l.connect(lg);
      lg.connect(osc.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    g.connect(o.dest || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  noise(t, dur, o = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  ok() {
    return this.ctx && this.sfxOn && this.ctx.state === 'running';
  }

  // ---------- sound effects ----------
  horn(vehicle = 'car') {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.01;
    switch (vehicle) {
      case 'fire': {
        // "ウー" wail + "カンカン" bell
        this.tone(560, t, 1.3, { type: 'triangle', slide: 980, slideTime: 0.6, gain: 0.25, release: 0.4 });
        for (let i = 0; i < 4; i++) {
          this.tone(1760, t + i * 0.28, 0.25, { type: 'sine', gain: 0.18 });
          this.tone(2640, t + i * 0.28, 0.18, { type: 'sine', gain: 0.08 });
        }
        break;
      }
      case 'bus':
        this.tone(311, t, 0.22, { type: 'square', gain: 0.16, lp: 1200 });
        this.tone(392, t, 0.22, { type: 'square', gain: 0.12, lp: 1200 });
        this.tone(311, t + 0.3, 0.5, { type: 'square', gain: 0.16, lp: 1200 });
        this.tone(392, t + 0.3, 0.5, { type: 'square', gain: 0.12, lp: 1200 });
        break;
      case 'police':
        for (let i = 0; i < 2; i++) {
          this.tone(520, t + i * 0.55, 0.55, { type: 'triangle', slide: 900, slideTime: 0.3, gain: 0.25 });
        }
        break;
      case 'ambulance':
        for (let i = 0; i < 2; i++) {
          this.tone(960, t + i * 0.8, 0.38, { type: 'triangle', gain: 0.24 });
          this.tone(770, t + i * 0.8 + 0.4, 0.38, { type: 'triangle', gain: 0.24 });
        }
        break;
      case 'dino':
        this.tone(260, t, 0.75, { type: 'sawtooth', slide: 120, gain: 0.2, lp: 900, vib: [11, 18] });
        this.noise(t, 0.6, { freq: 500, q: 2, gain: 0.12 });
        this.tone(900, t + 0.75, 0.15, { type: 'sine', slide: 1400, gain: 0.15 });
        break;
      default:
        // "プップー"
        this.tone(440, t, 0.13, { type: 'square', gain: 0.14, lp: 2200 });
        this.tone(554, t, 0.13, { type: 'square', gain: 0.1, lp: 2200 });
        this.tone(440, t + 0.2, 0.42, { type: 'square', gain: 0.14, lp: 2200 });
        this.tone(554, t + 0.2, 0.42, { type: 'square', gain: 0.1, lp: 2200 });
    }
  }

  chime(big = false) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.005;
    const now = performance.now();
    this.chimeStep = now - this.lastChime < 900 ? Math.min(this.chimeStep + 1, 6) : 0;
    this.lastChime = now;
    const scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3];
    const f = scale[this.chimeStep];
    if (big) {
      [1046.5, 1318.5, 1568, 2093].forEach((fr, i) => this.tone(fr, t + i * 0.07, 0.4, { gain: 0.2 }));
    } else {
      this.tone(f, t, 0.35, { gain: 0.22 });
      this.tone(f * 2, t + 0.05, 0.25, { gain: 0.07 });
    }
  }

  boing() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.005;
    this.tone(160, t, 0.45, { type: 'sine', slide: 520, slideTime: 0.18, gain: 0.32, vib: [16, 40] });
  }

  giggle() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.12;
    for (let i = 0; i < 5; i++) {
      const f = 1250 - i * 70 + Math.random() * 40;
      this.tone(f, t + i * 0.09, 0.07, { type: 'triangle', slide: f * 0.8, gain: 0.13, vib: [30, 30] });
    }
  }

  cheer() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.01;
    this.noise(t, 1.1, { freq: 1300, q: 0.8, gain: 0.08, attack: 0.25 });
    for (let i = 0; i < 6; i++) {
      const f = 700 + Math.random() * 500;
      this.tone(f, t + 0.1 + i * 0.12, 0.18, { type: 'triangle', slide: f * 1.3, gain: 0.06 });
    }
  }

  fanfare() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.02;
    const seq = [
      ['C5', 0, 0.14], ['E5', 0.15, 0.14], ['G5', 0.3, 0.14], ['C6', 0.45, 0.5],
      ['A5', 1.0, 0.14], ['C6', 1.15, 0.14], ['E6', 1.3, 0.8],
    ];
    for (const [n, dt, d] of seq) {
      this.tone(noteFreq(n), t + dt, d, { type: 'square', gain: 0.1, lp: 3000 });
      this.tone(noteFreq(n) / 2, t + dt, d, { type: 'triangle', gain: 0.14 });
    }
  }

  whoosh() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.005;
    this.noise(t, 0.7, { freq: 400, sweep: 3200, q: 1.5, gain: 0.22, attack: 0.08 });
    this.tone(300, t, 0.5, { type: 'sine', slide: 900, gain: 0.12 });
  }

  moo() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.01;
    this.tone(150, t, 1.0, { type: 'sawtooth', slide: 105, gain: 0.2, lp: 700, attack: 0.15, release: 0.3, vib: [5, 4] });
  }

  splash() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.01;
    this.noise(t, 1.2, { filter: 'lowpass', freq: 1800, sweep: 300, gain: 0.25, attack: 0.02 });
    for (let i = 0; i < 5; i++) this.tone(500 + Math.random() * 600, t + 0.2 + i * 0.1, 0.08, { slide: 1400, gain: 0.07 });
  }

  hello() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.01;
    this.tone(784, t, 0.18, { type: 'triangle', gain: 0.18 });
    this.tone(1046, t + 0.2, 0.35, { type: 'triangle', gain: 0.18, vib: [6, 10] });
  }

  beep(go = false) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.005;
    if (go) this.tone(1318.5, t, 0.5, { type: 'square', gain: 0.12, lp: 3000 });
    else this.tone(659, t, 0.18, { type: 'square', gain: 0.1, lp: 2500 });
  }

  pop() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.005;
    this.tone(500, t, 0.12, { slide: 1000, gain: 0.25 });
  }

  // ---------- engine hum ----------
  engineStart() {
    if (!this.ok() || this.engine) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 340;
    const g = c.createGain();
    g.gain.value = 0;
    const am = c.createGain();
    am.gain.value = 1;
    const lfo = c.createOscillator();
    lfo.frequency.value = 10;
    const lg = c.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg);
    lg.connect(am.gain);
    osc.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(this.sfx);
    osc.start();
    lfo.start();
    g.gain.setTargetAtTime(0.07, c.currentTime, 0.3);
    this.engine = { osc, g, lfo };
  }

  engineSet(pct) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(52 + pct * 60, t, 0.1);
    this.engine.lfo.frequency.setTargetAtTime(8 + pct * 12, t, 0.1);
  }

  engineStop() {
    if (!this.engine) return;
    const e = this.engine;
    this.engine = null;
    try {
      const t = this.ctx.currentTime;
      e.g.gain.setTargetAtTime(0, t, 0.15);
      e.osc.stop(t + 0.8);
      e.lfo.stop(t + 0.8);
    } catch (err) {}
  }

  // ---------- music ----------
  playMusic(name) {
    if (!this.ctx) {
      this.pending = name;
      return;
    }
    if (this.track === TRACKS[name]) return;
    this.track = TRACKS[name] || null;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    this.track = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const tr = this.track;
    if (!tr || !this.ctx || this.ctx.state !== 'running') return;
    const stepDur = 60 / tr.bpm / 2;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const i = this.step % tr.m.length;
      const t = this.nextTime;
      if (this.musicOn) {
        const m = tr.m[i];
        if (m) {
          this.tone(m, t, stepDur * 1.6, { type: tr.lead, gain: 0.35 * tr.leadGain, dest: this.mus, release: stepDur });
          if (tr.lead === 'sine') this.tone(m * 2, t, stepDur, { type: 'sine', gain: 0.05, dest: this.mus });
        }
        const b = tr.b[i % tr.b.length];
        if (b) this.tone(b, t, stepDur * 1.8, { type: 'triangle', gain: 0.4, dest: this.mus, release: stepDur });
        const d = tr.drums[i % tr.drums.length];
        if (d === 'k') this.tone(120, t, 0.16, { slide: 45, gain: 0.5, dest: this.mus });
        else if (d === 'h') this.noise(t, 0.05, { filter: 'highpass', freq: 7000, gain: 0.08, dest: this.mus });
        else if (d === 's') this.noise(t, 0.12, { freq: 1800, q: 0.7, gain: 0.14, dest: this.mus });
        else if (d === 'j') this.noise(t, 0.09, { filter: 'highpass', freq: 9000, gain: 0.12, dest: this.mus });
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
