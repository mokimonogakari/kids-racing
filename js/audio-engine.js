// Engine sound: three gears, exhaust pulse, wind and a boost whistle — all WebAudio, no files.
// Used by audio.js (Sound.engineStart / engineSet / engineStop). No imports.

const GEARS = [0, 0.34, 0.68, 1.0]; // pct ranges of the three gears
const BASE_GAIN = 0.07;

/** Which gear (0..2) and how far into it (0..1) a speed fraction sits. */
export function gearOf(pct) {
  const p = Math.max(0, Math.min(0.9999, pct));
  let gear = 0;
  for (let g = 0; g < 3; g++) if (p >= GEARS[g]) gear = g;
  const lo = GEARS[gear];
  const hi = GEARS[gear + 1];
  return { gear, rpm: (p - lo) / (hi - lo) };
}

/** Fundamental frequency (Hz) for a speed fraction; > 1 means boosting. */
export function engineFreq(pct) {
  if (pct > 1) return 135 + (pct - 1) * 150;
  const { gear, rpm } = gearOf(pct);
  return 50 + rpm * 75 + gear * 6;
}

export class Engine {
  constructor(sound) {
    this.sound = sound;
    this.nodes = null;
    this.lastGear = -1;
    this.lastPct = 0;
  }

  get running() {
    return !!this.nodes;
  }

  /** Must be called after the AudioContext exists (user gesture). Idempotent. */
  start() {
    const s = this.sound;
    if (this.nodes || !s || !s.ctx || !s.sfx) return;
    try {
      const c = s.ctx;
      const t = c.currentTime;

      // Master gain for the whole engine.
      const out = c.createGain();
      out.gain.value = 0;
      out.connect(s.sfx);

      // Exhaust pulse: amplitude modulation by a slow LFO.
      const am = c.createGain();
      am.gain.value = 1;
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 9;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(am.gain);
      am.connect(out);

      // Low-pass shapes the raw oscillators into a muffled engine.
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      lp.Q.value = 0.9;
      lp.connect(am);

      // Fundamental (sawtooth) + an octave up (square, quieter).
      const low = c.createOscillator();
      low.type = 'sawtooth';
      low.frequency.value = 52;
      const lowGain = c.createGain();
      lowGain.gain.value = 1;
      low.connect(lowGain);
      lowGain.connect(lp);

      const high = c.createOscillator();
      high.type = 'square';
      high.frequency.value = 104;
      const highGain = c.createGain();
      highGain.gain.value = 0.22;
      high.connect(highGain);
      highGain.connect(lp);

      // Exhaust crackle: band-passed noise, modulated by the same LFO through `am`.
      const noiseBuf = s.noiseBuf || this.makeNoise(c);
      const exhaust = c.createBufferSource();
      exhaust.buffer = noiseBuf;
      exhaust.loop = true;
      const exhaustFilter = c.createBiquadFilter();
      exhaustFilter.type = 'bandpass';
      exhaustFilter.frequency.value = 180;
      exhaustFilter.Q.value = 1.2;
      const exhaustGain = c.createGain();
      exhaustGain.gain.value = 0.18;
      exhaust.connect(exhaustFilter);
      exhaustFilter.connect(exhaustGain);
      exhaustGain.connect(am);

      // Wind: high-passed noise that grows with speed squared (bypasses the pulse).
      const wind = c.createBufferSource();
      wind.buffer = noiseBuf;
      wind.loop = true;
      const windFilter = c.createBiquadFilter();
      windFilter.type = 'highpass';
      windFilter.frequency.value = 2400;
      const windGain = c.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(s.sfx);

      // Boost whistle: a small sine that only opens while boosting.
      const whistle = c.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.value = 1200;
      const whistleGain = c.createGain();
      whistleGain.gain.value = 0;
      whistle.connect(whistleGain);
      whistleGain.connect(s.sfx);

      low.start(t);
      high.start(t);
      lfo.start(t);
      exhaust.start(t, 0.1);
      wind.start(t, 0.37);
      whistle.start(t);
      out.gain.setTargetAtTime(BASE_GAIN, t, 0.3);

      this.nodes = { out, am, lfo, lfoGain, lp, low, high, highGain, exhaust, exhaustFilter, exhaustGain, wind, windGain, whistle, whistleGain };
      this.lastGear = -1;
      this.lastPct = 0;
    } catch (e) {
      this.nodes = null; // audio is optional
    }
  }

  /**
   * Update the engine for the current speed. pct = speed / max speed (1.45 while boosting).
   */
  set(pct, { boost = false, offroad = false, drift = false } = {}) {
    const n = this.nodes;
    const s = this.sound;
    if (!n || !s || !s.ctx) return;
    try {
      const c = s.ctx;
      const t = c.currentTime;
      const p = Math.max(0, Math.min(1.6, Number(pct) || 0));
      const { gear, rpm } = gearOf(p);
      const freq = engineFreq(p);
      // A gear change lets the pitch fall quickly and naturally; otherwise glide smoothly.
      const shifted = p <= 1 && gear !== this.lastGear;
      const tc = shifted ? 0.08 : 0.12;
      n.low.frequency.setTargetAtTime(freq, t, tc);
      n.high.frequency.setTargetAtTime(freq * 2, t, tc);
      this.lastGear = p > 1 ? 2 : gear;
      this.lastPct = p;

      // Exhaust pulse rate follows revs: 8 Hz idling, up to ~30 Hz at full revs (6 Hz off road).
      const revs = p > 1 ? 1 : rpm;
      n.lfo.frequency.setTargetAtTime(offroad ? 6 : 8 + revs * 22 + gear * 1.5, t, 0.1);
      n.lfoGain.gain.setTargetAtTime(offroad ? 0.5 : 0.35 - revs * 0.15, t, 0.1);
      n.exhaustFilter.frequency.setTargetAtTime(offroad ? 120 : 160 + revs * 120, t, 0.1);

      // Tone: muffled when rolling over grass, brighter with revs.
      n.lp.frequency.setTargetAtTime(offroad ? 220 : 300 + revs * 180 + (p > 1 ? 200 : 0), t, 0.1);
      n.highGain.gain.setTargetAtTime(p > 1 ? 0.32 : 0.18 + revs * 0.1, t, 0.1);

      // Wind grows with the square of speed (max 0.05).
      const windTarget = Math.min(0.05, 0.05 * Math.min(1, p * p / 1.21));
      n.windGain.gain.setTargetAtTime(windTarget, t, 0.15);

      // Boost whistle.
      const whistleOn = boost || p > 1;
      n.whistle.frequency.setTargetAtTime(1200 + Math.min(1, Math.max(0, p - 1) / 0.45) * 600, t, 0.12);
      n.whistleGain.gain.setTargetAtTime(whistleOn ? 0.03 : 0, t, whistleOn ? 0.08 : 0.2);

      // Overall level: a little louder while drifting or boosting.
      let gain = BASE_GAIN;
      if (drift) gain *= 1.2;
      if (p > 1) gain *= 1.15;
      n.out.gain.setTargetAtTime(gain, t, 0.12);
    } catch (e) {
      /* audio is optional */
    }
  }

  /**
   * Explicit gearbox for the circuit mode: gear 1..6 and rpm 0..1 drive the pitch instead
   * of the speed-based three-gear model. Call after set() each frame (it overrides pitch).
   */
  engineGear(gear, rpm) {
    const n = this.nodes;
    const s = this.sound;
    if (!n || !s || !s.ctx) return;
    try {
      const g = Math.max(1, Math.min(6, Math.round(Number(gear) || 1)));
      const r = Math.max(0, Math.min(1, Number(rpm) || 0));
      const t = s.ctx.currentTime;
      const freq = 46 + r * 92 + g * 4;
      const tc = g !== this.lastSimGear ? 0.06 : 0.1;
      this.lastSimGear = g;
      n.low.frequency.setTargetAtTime(freq, t, tc);
      n.high.frequency.setTargetAtTime(freq * 2, t, tc);
      n.lfo.frequency.setTargetAtTime(8 + r * 26, t, 0.08);
      n.lp.frequency.setTargetAtTime(320 + r * 260, t, 0.08);
    } catch (e) {
      /* audio is optional */
    }
  }

  /** Fade out over ~0.5 s and release every node. Safe to call twice. */
  stop() {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    this.lastGear = -1;
    const s = this.sound;
    try {
      const t = s && s.ctx ? s.ctx.currentTime : 0;
      n.out.gain.setTargetAtTime(0, t, 0.12);
      n.windGain.gain.setTargetAtTime(0, t, 0.12);
      n.whistleGain.gain.setTargetAtTime(0, t, 0.12);
      const end = t + 0.5;
      for (const src of [n.low, n.high, n.lfo, n.exhaust, n.wind, n.whistle]) {
        try {
          src.stop(end);
        } catch (e) {
          /* already stopped */
        }
      }
      // Detach the graph a moment after the fade so nothing keeps playing.
      const detach = () => {
        for (const node of Object.values(n)) {
          try {
            node.disconnect();
          } catch (e) {
            /* ignore */
          }
        }
      };
      if (typeof setTimeout === 'function') setTimeout(detach, 700);
      else detach();
    } catch (e) {
      /* ignore */
    }
  }

  makeNoise(c) {
    const len = c.sampleRate || 44100;
    const buf = c.createBuffer(1, len, c.sampleRate || 44100);
    const d = buf.getChannelData ? buf.getChannelData(0) : null;
    if (d) for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
