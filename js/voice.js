// Japanese voice prompts via speechSynthesis. Never blocks; silent if missing.
export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.lastAt = 0;
    try {
      this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
      if (this.synth) {
        this.pickVoice();
        if ('onvoiceschanged' in this.synth) this.synth.onvoiceschanged = () => this.pickVoice();
      }
    } catch (e) {
      this.synth = null;
    }
  }

  pickVoice() {
    try {
      const list = this.synth.getVoices() || [];
      const ja = list.filter((v) => /^ja(-|_|$)/i.test(v.lang));
      // Prefer a female / friendly sounding voice when names hint at it.
      this.voice = ja.find((v) => /kyoko|o-ren|female|nanami|haruka|ayumi/i.test(v.name)) || ja[0] || null;
    } catch (e) {
      this.voice = null;
    }
  }

  /**
   * @param {string} text
   * @param {{interrupt?: boolean, minGap?: number}} o
   */
  say(text, o = {}) {
    if (!this.enabled || !this.synth) return;
    try {
      const now = Date.now();
      if (o.minGap && now - this.lastAt < o.minGap) return;
      this.lastAt = now;
      if (o.interrupt !== false) this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.85;
      u.pitch = 1.25;
      u.volume = 1;
      this.synth.speak(u);
    } catch (e) {
      /* ignore */
    }
  }

  stop() {
    try {
      if (this.synth) this.synth.cancel();
    } catch (e) {}
  }
}
