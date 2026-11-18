// All sound is synthesized with the Web Audio API — no audio files, no network.
// Engine hum, police siren, gunshot, punch thud, cash chime, and a quiet original
// bass-and-hat groove. Created lazily on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: a sawtooth whose pitch follows speed, through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      // Siren: two-tone wail via an LFO on a triangle oscillator.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 130, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 3000;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.12, 0.35, 2600); this.blip(180, 0.08, 'square', 0.12, 60); }
  punch() { this.blip(120, 0.12, 'sine', 0.3, 55); this.noiseBurst(0.06, 0.15, 900); }
  bump() { this.noiseBurst(0.09, 0.22, 700); this.blip(90, 0.1, 'sine', 0.18, 45); }
  cash() { this.blip(880, 0.12, 'sine', 0.18); setTimeout(() => this.blip(1318, 0.22, 'sine', 0.18), 90); }
  pickup() { this.blip(660, 0.1, 'triangle', 0.18, 990); }
  denied() { this.blip(160, 0.18, 'square', 0.12, 110); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.2), i * 110)); }

  // Original groove: Am — F — C — G bass roots with a hat tick, one bar = 8 steps.
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.musicOn = true;
    const roots = [55, 43.65, 65.41, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      if (step === 0 || step === 3 || step === 6) this.blip(roots[bar] * 2, 0.22, 'triangle', 0.10);
      if (step % 2 === 1) this.noiseBurst(0.03, 0.045, 8000);
      if (step === 4) this.blip(roots[bar] * 4, 0.08, 'sine', 0.05);
      this.musicStep++;
    }, 190);
  }
}
