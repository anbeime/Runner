/**
 * 像素方块世界 - 程序化背景音乐系统
 * 使用 Web Audio API 生成，无需外部音频文件
 * 风格：温暖环境音 + 五声音阶旋律，类似 Minecraft C418 风格
 */

/** 五声音阶（C大调）：C D E G A */
const PENTATONIC = [
  261.63, 293.66, 329.63, 392.00, 440.00,  // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.00,  // C5 D5 E5 G5 A5
  1046.50, 1174.66,                          // C6 D6
];

/** 低音音符 */
const BASS_NOTES = [65.41, 73.42, 82.41, 87.31, 98.00, 110.00]; // C2 D2 E2 F2 G2 A2

/** 和弦进行（用五声音阶索引） */
const CHORD_PROGRESSIONS = [
  [0, 3, 7],   // C major
  [3, 7, 10],  // G major  
  [1, 4, 8],   // D minor
  [4, 8, 11],  // A minor
];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.isMuted = false;
    this._volume = 0.35;
    this._nodes = [];
    this._animFrameId = null;
    this._melodyTimer = null;
    this._chordIndex = 0;
  }

  /** 初始化音频上下文（必须在用户交互后调用） */
  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // 主音量
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.masterGain.connect(this.ctx.destination);

    // 启动所有音轨
    this._startPad();
    this._startBass();
    this._startMelody();
    this._startAmbientChime();

    this.isPlaying = true;
  }

  /** ── 环境铺底音 ── */
  _startPad() {
    const now = this.ctx.currentTime;
    
    // 使用两个轻微失谐的锯齿波制造温暖感
    const createPadVoice = (detune) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 130.81; // C3
      osc.detune.value = detune;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 1.5;
      
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12; // 缓慢 LFO
      
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = 0.08;
      
      osc.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(this.masterGain);
      
      osc.start(now);
      lfo.start(now);
      
      this._nodes.push(osc, lfo, filter, lfoGain, voiceGain);
    };
    
    createPadVoice(0);
    createPadVoice(8);  // 轻微失谐
  }

  /** ── 低音贝斯 ── */
  _startBass() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = BASS_NOTES[0];
    
    const bassGain = this.ctx.createGain();
    bassGain.gain.value = 0.06;
    
    osc.connect(bassGain);
    bassGain.connect(this.masterGain);
    osc.start(now);
    
    this._nodes.push(osc, bassGain);
    
    // 缓慢切换低音音符
    this._bassOsc = osc;
    this._nextBassNote();
  }

  _nextBassNote() {
    if (!this.isPlaying) return;
    const note = BASS_NOTES[Math.floor(Math.random() * BASS_NOTES.length)];
    this._bassOsc.frequency.setTargetAtTime(note, this.ctx.currentTime, 0.3);
    
    const duration = 4 + Math.random() * 4; // 4-8秒换一次
    this._bassTimer = setTimeout(() => this._nextBassNote(), duration * 1000);
  }

  /** ── 主旋律 ── */
  _startMelody() {
    this._playMelodyNote();
  }

  _playMelodyNote() {
    if (!this.isPlaying || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // 随机选音符
    const noteIdx = Math.floor(Math.random() * PENTATONIC.length);
    const freq = PENTATONIC[noteIdx];
    
    // 音符时长
    const duration = 0.4 + Math.random() * 0.8;
    const gap = 1.5 + Math.random() * 3.5;
    
    // 主音色：带滤波的三角波
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800 + Math.random() * 600;
    filter.Q.value = 2;
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.10, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    // 混响模拟：延迟
    const delay = this.ctx.createDelay(0.3);
    delay.delayTime.value = 0.25;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.15;
    const dryGain = this.ctx.createGain();
    dryGain.gain.value = 0.6;
    const wetGain = this.ctx.createGain();
    wetGain.gain.value = 0.4;
    
    osc.connect(filter);
    filter.connect(env);
    env.connect(dryGain);
    dryGain.connect(this.masterGain);
    env.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + duration + 0.5);
    
    // 清理
    const cleanup = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
      delay.disconnect();
      feedback.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
    };
    setTimeout(cleanup, (duration + 1) * 1000);
    
    this._melodyTimer = setTimeout(() => this._playMelodyNote(), (duration + gap) * 1000);
  }

  /** ── 环境叮当声 ── */
  _startAmbientChime() {
    this._playChime();
  }

  _playChime() {
    if (!this.isPlaying || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const freq = PENTATONIC[Math.floor(Math.random() * 5) + 5] * 2; // 高八度
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.04, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    
    osc.connect(env);
    env.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 2);
    
    const cleanup = () => {
      osc.disconnect();
      env.disconnect();
    };
    setTimeout(cleanup, 2500);
    
    const gap = 6 + Math.random() * 10;
    this._chimeTimer = setTimeout(() => this._playChime(), gap * 1000);
  }

  /** 切换静音 */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this._volume;
    }
    return this.isMuted;
  }

  /** 设置音量 0-1 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.value = this._volume;
    }
  }

  /** 暂停 */
  pause() {
    if (this.masterGain) {
      this.masterGain.gain.value = 0;
    }
  }

  /** 恢复 */
  resume() {
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.value = this._volume;
    }
  }

  /** 销毁 */
  dispose() {
    this.isPlaying = false;
    
    clearTimeout(this._melodyTimer);
    clearTimeout(this._chimeTimer);
    clearTimeout(this._bassTimer);
    
    for (const node of this._nodes) {
      try { node.stop?.(); } catch (e) {}
      try { node.disconnect?.(); } catch (e) {}
    }
    this._nodes = [];
    
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch (e) {}
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
