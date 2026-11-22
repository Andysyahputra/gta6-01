// Neon Harbor — audio.js
// One job: all sound, synthesized live with the Web Audio API. No audio
// files, no network. Engine hum, police siren, gunshots, punch, payout
// chime and a quiet original bass-and-hat groove. Mute with the 0 key.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});

  function AudioEngine() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  AudioEngine.prototype.ensure = function () {
    if (this.ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine hum: sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    var filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    this.engineOsc.connect(filt);
    filt.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Siren: two-tone wail, silent until wanted > 0.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.6;
    var lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenLfo.start();
  };

  AudioEngine.prototype.resume = function () {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  AudioEngine.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : this.engineGain.gain.value;
  };

  AudioEngine.prototype.setEngine = function (speed01) {
    if (!this.ctx || this.muted) return;
    this.engineGain.gain.value = 0.02 + speed01 * 0.05;
    this.engineOsc.frequency.value = 55 + speed01 * 130;
  };

  AudioEngine.prototype.setSiren = function (on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.value = (on && !this.muted) ? 0.018 : 0.0;
  };

  AudioEngine.prototype.sirenBlip = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(660, t + 0.12);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.32);
  };

  AudioEngine.prototype.noiseBurst = function (dur, freq, vol) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var len = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    var f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    var g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  };

  AudioEngine.prototype.gunshot = function () { this.noiseBurst(0.14, 1800, 0.22); };
  AudioEngine.prototype.policeShot = function () { this.noiseBurst(0.12, 1400, 0.12); };
  AudioEngine.prototype.bump = function () { this.noiseBurst(0.18, 500, 0.25); };
  AudioEngine.prototype.punch = function () { this.noiseBurst(0.09, 300, 0.3); };
  AudioEngine.prototype.clickEmpty = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1400;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.06);
  };

  AudioEngine.prototype.payout = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var notes = [880, 1108, 1318, 1760];
    for (var i = 0; i < notes.length; i++) {
      var o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = notes[i];
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    }
  };

  // Original groove: 8-step loop, bass on 1/3/5/7, hat ticks on offbeats.
  AudioEngine.prototype.updateMusic = function (dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.21;
    var step = this.musicStep % 8;
    this.musicStep++;
    var t = this.ctx.currentTime;
    if (step === 0 || step === 3 || step === 5) {
      var bassNotes = [110, 110, 130.8, 98];
      var o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = bassNotes[[0, 1, 2, 1][step === 5 ? 2 : (step === 3 ? 1 : 0)]];
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + 0.22);
    }
    if (step % 2 === 1) this.noiseBurst(0.03, 6000, 0.03);
  };

  NH.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
