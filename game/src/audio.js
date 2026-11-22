// Neon Harbor — all sound synthesized with the Web Audio API.
// No audio files, no network: engine hum, siren, gunshot, punch,
// cash chime and a quiet original bass-and-hat groove. Mute with key 0.

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.musicTimer = null; this.beat = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.startMusic();
    } catch { this.ctx = null; }
  }
  toggleMute() { this.muted = !this.muted; return this.muted; }
  blip(freq, dur, type = 'sine', vol = 0.15) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }
  gunshot() { this.blip(180, 0.12, 'square', 0.25); this.blip(60, 0.18, 'sawtooth', 0.2); }
  punch() { this.blip(90, 0.1, 'triangle', 0.3); }
  bump() { this.blip(70, 0.15, 'sawtooth', 0.25); }
  cash() { this.blip(880, 0.12, 'sine', 0.2); setTimeout(() => this.blip(1320, 0.2, 'sine', 0.2), 90); }
  pickup() { this.blip(660, 0.1, 'sine', 0.18); setTimeout(() => this.blip(990, 0.14, 'sine', 0.18), 80); }
  sirenTick(on) {
    if (!this.ctx || this.muted) return;
    this.blip(on ? 950 : 700, 0.35, 'sine', 0.05);
  }
  setEngine(speed01) {
    if (!this.ctx || this.muted) return;
    try {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0.0;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 420;
        this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.value = 55 + speed01 * 130;
      this.engineGain.gain.value = speed01 > 0.02 ? 0.035 + speed01 * 0.03 : 0.0;
    } catch { /* best-effort */ }
  }
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const bass = [55, 0, 65.4, 0, 49, 0, 58.3, 73.4];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const n = bass[this.beat % bass.length];
      if (n) this.blip(n, 0.22, 'triangle', 0.07);
      if (this.beat % 2 === 0) this.blip(6000, 0.03, 'square', 0.015);
      this.beat++;
    }, 240);
  }
}
