// audio.js - fully synthesized WebAudio SFX + procedural music (no assets)
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.sirenOsc = null;
    this.sirenGain = null;
  }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }
  _env(gainNode, t, a, peak, d, sustain = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }
  _osc(type, freq, t) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    return o;
  }
  blip(freqs, dur = 0.09, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = this._osc(type, f, t + i * dur);
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t + i * dur, 0.005, vol, dur * 0.95);
      o.start(t + i * dur); o.stop(t + (i + 1) * dur + 0.02);
    });
  }
  coin() { this.blip([988, 1319], 0.09, 'square', 0.22); }
  can() { this.blip([660, 880, 1100], 0.07, 'triangle', 0.25); }
  jump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 300, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.18);
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.master);
    this._env(g, t, 0.01, 0.2, 0.2);
    o.start(t); o.stop(t + 0.25);
  }
  honk() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [370, 466].forEach(f => {
      const o = this._osc('sawtooth', f, t);
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t, 0.01, 0.18, 0.28);
      o.start(t); o.stop(t + 0.35);
    });
  }
  crash(intensity = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.25 * intensity + 0.1;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + 2000 * Math.min(intensity, 1);
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.master);
    this._env(g, t, 0.005, 0.5 * Math.min(intensity, 1) + 0.1, dur);
    src.start(t);
    // metallic thunk
    const o = this._osc('square', 90 + Math.random() * 60, t);
    const g2 = this.ctx.createGain();
    o.connect(g2); g2.connect(this.master);
    this._env(g2, t, 0.005, 0.3, 0.15);
    o.start(t); o.stop(t + 0.2);
  }
  smash() {
    this.crash(0.5);
    this.blip([1200, 800, 500], 0.05, 'triangle', 0.2);
  }
  gag() { this.blip([523, 659, 784, 1047], 0.08, 'square', 0.22); }
  talk() { this.blip([300 + Math.random() * 200], 0.06, 'sine', 0.15); }
  missionStart() { this.blip([392, 523, 659, 784], 0.11, 'square', 0.25); }
  missionWin() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip([f], 0.14, 'square', 0.25), i * 110));
  }
  missionFail() { this.blip([392, 370, 349, 311], 0.16, 'sawtooth', 0.2); }
  busted() { this.blip([311, 277, 233, 196], 0.2, 'sawtooth', 0.25); }
  checkpoint() { this.blip([784, 988], 0.07, 'triangle', 0.25); }
  // --- car engine loop ---
  engineStart() {
    if (!this.ctx || this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(t);
  }
  engineSet(speed01, throttle) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    const f = 50 + speed01 * 160 + throttle * 30;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 1800, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.1 + throttle * 0.05, t, 0.1);
  }
  engineStop() {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    const osc = this.engineOsc;
    setTimeout(() => { try { osc.stop(); } catch (e) {} }, 300);
    this.engineOsc = null;
  }
  skid(on) {
    // reuse crash noise lightly - simple approach: tiny noise burst on demand, skip persistent loop
  }
  sirenStart() {
    if (!this.ctx || this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.06;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = 1.6;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG); lfoG.connect(this.sirenOsc.frequency);
    this.sirenOsc.frequency.value = 700;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start(); lfo.start();
    this.sirenLfo = lfo;
  }
  sirenStop() {
    if (!this.sirenOsc) return;
    const o = this.sirenOsc, l = this.sirenLfo, g = this.sirenGain;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    setTimeout(() => { try { o.stop(); l.stop(); } catch (e) {} }, 400);
    this.sirenOsc = null; this.sirenLfo = null;
  }
  // --- procedural music: jaunty original motif, i-vi-IV-V bounce ---
  startMusic() {
    if (this.musicTimer) return;
    const bassProg = [110, 87.31, 130.81, 98];      // A2 F2 C3 G2
    const melody = [
      440, 523, 659, 523, 440, 0, 349, 392,
      440, 523, 659, 784, 659, 523, 440, 0,
      349, 440, 523, 440, 349, 0, 392, 440,
      523, 659, 523, 440, 392, 349, 330, 0,
    ];
    const stepDur = 0.16;
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const s = this.musicStep;
      const t = this.ctx.currentTime;
      // bass every 2 steps
      if (s % 2 === 0) {
        const bar = Math.floor(s / 8) % bassProg.length;
        const o = this._osc('triangle', bassProg[bar], t);
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        this._env(g, t, 0.01, 0.16, stepDur * 1.8);
        o.start(t); o.stop(t + stepDur * 2);
      }
      // melody
      const m = melody[s % melody.length];
      if (m > 0) {
        const o = this._osc('square', m, t);
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        this._env(g, t, 0.01, 0.055, stepDur * 0.9);
        o.start(t); o.stop(t + stepDur);
      }
      // hat tick
      if (s % 2 === 1) {
        const buf = this.ctx.createBuffer(1, 600, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        const g = this.ctx.createGain(); g.gain.value = 0.05;
        src.connect(hp); hp.connect(g); g.connect(this.master);
        src.start(t);
      }
      this.musicStep++;
    }, stepDur * 1000);
  }
}
export const audio = new AudioEngine();
