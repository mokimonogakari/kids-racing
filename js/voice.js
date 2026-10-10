// Short prompts: optional chatter is dropped instead of queued.
export class Voice {
  constructor({ onActivity = () => {}, onText = () => {} } = {}) {
    this.enabled = true; this.voice = null; this.lastAt = 0; this.current = null; this.timer = null;
    this.onActivity = onActivity; this.onText = onText;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.pickVoice();
    this.synth?.addEventListener?.('voiceschanged', () => this.pickVoice());
  }
  pickVoice() {
    try {
    const ja = (this.synth?.getVoices() || []).filter(v => /^ja(-|_|$)/i.test(v.lang));
    this.voice = ja.find(v => v.localService && /kyoko|nanami|haruka/i.test(v.name)) || ja.find(v => v.localService) || ja[0] || null;
    } catch { this.voice = null; }
  }
  say(text, o = {}) {
    if (!this.enabled) return false;
    const now = Date.now();
    if (o.minGap && now - this.lastAt < o.minGap) return false;
    if (o.interrupt === false && this.current) return false;
    this.stop(); this.lastAt = now; this.onText(text);
    if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; if (this.voice) u.voice = this.voice;
      u.rate = .95; u.pitch = 1.05; u.volume = 1; this.current = u;
      const end = () => { if (this.current === u) { clearTimeout(this.timer); this.current = null; this.onActivity(false); } };
      u.onend = end; u.onerror = end; this.onActivity(true);
      this.synth.resume?.(); this.synth.speak(u);
      this.timer = setTimeout(() => { if (this.current === u) this.stop(); }, Math.max(5000, text.length * 350));
      return true;
    } catch { this.stop(); return false; }
  }
  stop() {
    clearTimeout(this.timer); this.current = null;
    try { this.synth?.cancel(); } catch {}
    this.onActivity(false);
  }
}
