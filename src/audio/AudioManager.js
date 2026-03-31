const AUDIO_PREF_KEY = 'boxsim_audio_muted_v1';

const BGM_CHORDS = [
  [60, 64, 67, 71],
  [62, 65, 69, 72],
  [57, 60, 64, 67],
  [59, 62, 65, 69],
];
const BGM_WALK = [36, 43, 38, 41, 36, 43, 47, 43];

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class AudioManager {
  constructor(bus) {
    this.bus = bus;
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;

    this._bgmStarted = false;
    this._bgmStep = 0;
    this._bgmNextTime = 0;
    this._bgmInterval = 0.28;
    this._pendingSfx = [];
    this._hasInteracted = false;
    this._unlockBound = () => {
      this._hasInteracted = true;
      this.unlock();
    };
    this._muted = this._loadMuted();
    this._toggleBtn = document.getElementById('btn-audio');

    this._bindUI();
    this._bindBus();
    this._bindUnlock();
  }

  update() {
    if (!this.ctx || this._muted || this.ctx.state !== 'running' || !this._bgmStarted) return;

    const lookAhead = 0.45;
    while (this._bgmNextTime < this.ctx.currentTime + lookAhead) {
      this._scheduleBgmStep(this._bgmStep, this._bgmNextTime);
      this._bgmNextTime += this._bgmInterval;
      this._bgmStep = (this._bgmStep + 1) % BGM_WALK.length;
    }
  }

  unlock() {
    if (!this._hasInteracted) return;
    this._ensureContext(true);
    if (!this.ctx) return;

    if (this.ctx.state === 'running') {
      if (!this._muted && !this._bgmStarted) this.startBgm();
      this._flushPending();
      return;
    }

    const resumeResult = this.ctx.resume?.();
    if (resumeResult && typeof resumeResult.then === 'function') {
      resumeResult
        .then(() => {
          if (!this._muted && !this._bgmStarted) this.startBgm();
          this._flushPending();
        })
        .catch(() => {});
      return;
    }

    if (!this._muted && !this._bgmStarted) this.startBgm();
    this._flushPending();
  }

  async toggleMute() {
    this._muted = !this._muted;
    this._saveMuted();
    this._updateButton();

    if (this._muted) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      }
      return;
    }

    this._hasInteracted = true;
    this.unlock();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(0.95, this.ctx.currentTime, 0.05);
    }
  }

  play(name) {
    if (this._muted) return;
    if (!this._hasInteracted) return;
    this._ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      this._pendingSfx.push(name);
      return;
    }

    this._playNow(name);
  }

  _playNow(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;

    switch (name) {
      case 'swap':
        this._playWhoosh(this.ctx.currentTime, 0.2, 0.14);
        this._playTone(this.ctx.currentTime + 0.03, 0.08, 420, 310, 'triangle', 0.035);
        break;
      case 'error':
        this._playTone(this.ctx.currentTime, 0.07, 180, 150, 'square', 0.045);
        this._playTone(this.ctx.currentTime + 0.08, 0.09, 170, 135, 'square', 0.035);
        break;
      case 'purchase':
        this._playNoise(this.ctx.currentTime, 0.04, 0.015, 3800, 1.1);
        this._playTone(this.ctx.currentTime, 0.06, 940, 620, 'square', 0.03);
        this._playTone(this.ctx.currentTime + 0.045, 0.08, 780, 520, 'triangle', 0.035);
        break;
      case 'boxLand':
        this._playTone(this.ctx.currentTime, 0.12, 110, 58, 'sine', 0.12);
        this._playNoise(this.ctx.currentTime, 0.05, 0.025, 900, 0.6);
        break;
      case 'boxOpen':
        this._playTone(this.ctx.currentTime, 0.1, 660, 740, 'square', 0.035);
        this._playTone(this.ctx.currentTime + 0.06, 0.12, 740, 880, 'triangle', 0.04);
        this._playTone(this.ctx.currentTime + 0.12, 0.18, 880, 1175, 'triangle', 0.045);
        this._playNoise(this.ctx.currentTime, 0.1, 0.012, 5200, 1.5);
        break;
      case 'display':
        this._playNoise(this.ctx.currentTime, 0.035, 0.012, 3200, 1.2);
        this._playTone(this.ctx.currentTime, 0.06, 760, 910, 'triangle', 0.03);
        break;
      case 'sell':
        this._playTone(this.ctx.currentTime, 0.07, 720, 920, 'triangle', 0.035);
        this._playTone(this.ctx.currentTime + 0.05, 0.08, 920, 1220, 'triangle', 0.035);
        this._playNoise(this.ctx.currentTime, 0.04, 0.012, 4500, 1.3);
        break;
      case 'roundStart':
        this._playWhoosh(this.ctx.currentTime, 0.18, 0.035);
        this._playTone(this.ctx.currentTime + 0.02, 0.08, 392, 494, 'triangle', 0.03);
        this._playTone(this.ctx.currentTime + 0.09, 0.12, 494, 622, 'triangle', 0.035);
        break;
      case 'roundWin':
        this._playTone(this.ctx.currentTime, 0.1, 659, 784, 'triangle', 0.04);
        this._playTone(this.ctx.currentTime + 0.08, 0.12, 784, 988, 'triangle', 0.045);
        this._playTone(this.ctx.currentTime + 0.16, 0.22, 988, 1318, 'sine', 0.04);
        this._playNoise(this.ctx.currentTime + 0.1, 0.12, 0.012, 7000, 2.4);
        break;
      case 'roundFail':
        this._playTone(this.ctx.currentTime, 0.12, 260, 190, 'square', 0.03);
        this._playTone(this.ctx.currentTime + 0.1, 0.18, 190, 140, 'sine', 0.03);
        break;
      case 'coupon':
        this._playTone(this.ctx.currentTime, 0.12, 820, 1040, 'triangle', 0.035);
        this._playTone(this.ctx.currentTime + 0.07, 0.14, 1040, 1320, 'triangle', 0.028);
        this._playNoise(this.ctx.currentTime, 0.1, 0.01, 6400, 2.1);
        break;
      default:
        break;
    }
  }

  startBgm() {
    if (!this.ctx || this._muted) return;
    this._bgmStarted = true;
    this._bgmStep = 0;
    this._bgmNextTime = this.ctx.currentTime + 0.02;
    this._primeBgm();
  }

  _bindUI() {
    if (!this._toggleBtn) return;
    this._toggleBtn.addEventListener('click', () => this.toggleMute());
    this._updateButton();
  }

  _bindBus() {
    this.bus.on('round:start', () => this.play('roundStart'));
    this.bus.on('round:end', (result) => this.play(result?.cleared ? 'roundWin' : 'roundFail'));
    this.bus.on('display:added', () => this.play('display'));
  }

  _bindUnlock() {
    addEventListener('pointerdown', this._unlockBound);
    addEventListener('keydown', this._unlockBound);
  }

  _ensureContext(force = false) {
    if (this.ctx) return;
    if (!force && !this._hasInteracted) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.masterGain.gain.value = this._muted ? 0.0001 : 0.95;
    this.musicGain.gain.value = 0.42;
    this.sfxGain.gain.value = 0.95;

    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.noiseBuffer = this._createNoiseBuffer();
  }

  _scheduleBgmStep(step, time) {
    const chord = BGM_CHORDS[Math.floor(step / 2) % BGM_CHORDS.length];
    const root = BGM_WALK[step % BGM_WALK.length];
    const accent = step % 4 === 0;

    this._playTone(time, 0.24, midiToFreq(root), midiToFreq(root - 1), 'sine', accent ? 0.095 : 0.06, this.musicGain);
    this._playTone(time + 0.01, 0.2, midiToFreq(chord[0]), midiToFreq(chord[0]), 'triangle', 0.034, this.musicGain);
    this._playTone(time + 0.01, 0.2, midiToFreq(chord[1]), midiToFreq(chord[1]), 'triangle', 0.03, this.musicGain);
    this._playTone(time + 0.01, 0.2, midiToFreq(chord[2]), midiToFreq(chord[2]), 'triangle', 0.026, this.musicGain);

    if (step % 2 === 1) {
      this._playTone(time + 0.03, 0.14, midiToFreq(chord[3] + 12), midiToFreq(chord[3] + 11), 'triangle', 0.045, this.musicGain);
    }
    if (step % 4 === 0) this._playNoise(time, 0.05, 0.014, 1800, 0.7, this.musicGain);
    if (step % 4 === 2) this._playNoise(time, 0.04, 0.01, 3200, 1.5, this.musicGain);
  }

  _playTone(startTime, duration, fromFreq, toFreq, type, gainAmount, output = this.sfxGain) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, toFreq), startTime + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(fromFreq, toFreq) * 2.2, startTime);
    filter.Q.value = 0.4;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainAmount, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  _playNoise(startTime, duration, gainAmount, cutoff, q = 0.7, output = this.sfxGain) {
    if (!this.ctx || !this.noiseBuffer) return;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    src.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cutoff, startTime);
    filter.Q.value = q;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainAmount, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    src.start(startTime);
    src.stop(startTime + duration + 0.03);
  }

  _playWhoosh(startTime, duration, gainAmount) {
    if (!this.ctx || !this.noiseBuffer) return;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    src.buffer = this.noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(300, startTime);
    filter.frequency.exponentialRampToValueAtTime(2800, startTime + duration);
    filter.Q.value = 0.9;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainAmount, startTime + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    src.start(startTime);
    src.stop(startTime + duration + 0.03);
  }

  _createNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 0.8);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _loadMuted() {
    try {
      return localStorage.getItem(AUDIO_PREF_KEY) === '1';
    } catch {
      return false;
    }
  }

  _saveMuted() {
    try {
      localStorage.setItem(AUDIO_PREF_KEY, this._muted ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  }

  _flushPending() {
    if (!this.ctx || this.ctx.state !== 'running' || this._muted) return;
    if (this._pendingSfx.length === 0) return;

    const pending = this._pendingSfx.splice(0);
    for (const name of pending) this._playNow(name);
  }

  _primeBgm() {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const warmupUntil = this.ctx.currentTime + 0.7;
    while (this._bgmNextTime < warmupUntil) {
      this._scheduleBgmStep(this._bgmStep, this._bgmNextTime);
      this._bgmNextTime += this._bgmInterval;
      this._bgmStep = (this._bgmStep + 1) % BGM_WALK.length;
    }
  }

  _updateButton() {
    if (!this._toggleBtn) return;
    this._toggleBtn.textContent = this._muted ? '사운드 OFF' : '사운드 ON';
    this._toggleBtn.classList.toggle('muted', this._muted);
  }
}
