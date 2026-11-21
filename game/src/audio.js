// Neon Harbor — all sound synthesised with the Web Audio API (no audio files,
// no network): engine hum, police siren, gunshot, punch, cash chime, and a
// quiet original bass-and-hat groove. Mute with the 0 key or the HUD button.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.musicTimer = null; this.musicStep = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine hum: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // Police siren: two-tone wail via LFO on a triangle osc.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 750;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.type = 'sine'; this.sirenLfo.frequency.value = 0.6;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 220;
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start(); this.sirenLfo.start();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }
  setEngine(speedRatio, driving) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.03 + speedRatio * 0.05 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, t, 0.1);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, this.ctx.currentTime, 0.2);
  }
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    if (lowpass) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; src.connect(f); f.connect(g); }
    else src.connect(g);
    g.connect(this.ctx.destination); src.start(t);
  }
  shot() { this.noise(0.12, 0.3, 1800); this.blip(180, 0.08, 'square', 0.1, 60); }
  punch() { this.noise(0.08, 0.22, 500); this.blip(90, 0.1, 'sine', 0.18, 45); }
  bump() { this.noise(0.1, 0.2, 700); }
  cash() { this.blip(880, 0.12, 'sine', 0.12); setTimeout(() => this.blip(1318, 0.2, 'sine', 0.12), 90); }
  fail() { this.blip(220, 0.3, 'sawtooth', 0.1, 110); }
  pickup() { this.blip(660, 0.1, 'sine', 0.12); setTimeout(() => this.blip(990, 0.14, 'sine', 0.12), 80); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
  // Original groove: 8-step bass line + hats, quiet, scheduled ahead.
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const bassNotes = [55, 0, 55, 65.4, 0, 55, 49, 58.3];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const step = this.musicStep % 8;
      const n = bassNotes[step];
      if (n) this.blip(n, 0.22, 'triangle', 0.05);
      if (step % 2 === 0) this.noise(0.03, 0.02, 6000);
      this.musicStep++;
    }, 240);
  }
}
