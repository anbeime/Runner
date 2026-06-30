/**
 * 像素方块世界 - 完整音效与音乐系统
 * 纯 Web Audio API 程序化生成，无需外部音频文件
 * 包含：方块脚步声、放置/破坏音效、跳跃/落地、环境音乐
 */

/* ============================================
   音符定义
   ============================================ */
const PENTATONIC_C = [
  261.63, 293.66, 329.63, 392.00, 440.00,  // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.00,  // C5 D5 E5 G5 A5
  1046.50,                                   // C6
];

const BASS_NOTES = [65.41, 73.42, 82.41, 87.31, 98.00, 110.00, 130.81, 146.83];

/* ============================================
   方块脚步声参数
   ============================================ */
const FOOTSTEP_PARAMS = {
  grass:   { cutoff: 600,  q: 1.0, vol: 0.12, decay: 0.08, color: 'pink' },
  dirt:    { cutoff: 400,  q: 0.8, vol: 0.10, decay: 0.06, color: 'pink' },
  stone:   { cutoff: 1500, q: 2.5, vol: 0.14, decay: 0.04, color: 'white' },
  sand:    { cutoff: 2500, q: 1.5, vol: 0.11, decay: 0.10, color: 'white' },
  wood:    { cutoff: 350,  q: 3.0, vol: 0.13, decay: 0.07, color: 'brown' },
  snow:    { cutoff: 300,  q: 0.5, vol: 0.06, decay: 0.05, color: 'pink' },
  gravel:  { cutoff: 2000, q: 2.0, vol: 0.15, decay: 0.05, color: 'white' },
  glass:   { cutoff: 3000, q: 4.0, vol: 0.12, decay: 0.03, color: 'white' },
  default: { cutoff: 800,  q: 1.5, vol: 0.11, decay: 0.06, color: 'pink' },
};

/** 方块类型 → 脚步声类型映射 */
function getFootstepType(blockType) {
  const map = {
    1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand',
    5: 'wood', 6: 'wood', 9: 'snow', 10: 'gravel',
    14: 'glass',
  };
  return map[blockType] || 'default';
}

/* ============================================
   GameAudio 主类
   ============================================ */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    
    this.isPlaying = false;
    this.isMusicMuted = false;
    this.isSfxMuted = false;
    this._musicVol = 0.30;
    this._sfxVol = 0.70;
    this._nodes = [];
    this._timers = [];
    
    // 脚步声冷却（防止过于密集）
    this._lastFootstep = 0;
    this._footstepMinGap = 0.25; // 最短间隔秒
  }

  /** 初始化（需用户交互后调用） */
  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);
    
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this._musicVol;
    this.musicGain.connect(this.masterGain);
    
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this._sfxVol;
    this.sfxGain.connect(this.masterGain);
    
    this._startMusic();
    this.isPlaying = true;
  }

  /* ============================================
     背景音乐
     ============================================ */
  _startMusic() {
    this._startPad();
    this._startBassDrone();
    this._playMelodyPhrase();
    this._playAmbientChime();
  }

  /** 环境铺底 —— 温暖失谐锯齿波 */
  _startPad() {
    const now = this.ctx.currentTime;
    [0, 6, -6].forEach(detune => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 130.81; // C3
      osc.detune.value = detune;
      
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 350;
      filt.Q.value = 1.2;
      
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08 + Math.random() * 0.04;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 150;
      lfo.connect(lfoG);
      lfoG.connect(filt.frequency);
      
      const g = this.ctx.createGain();
      g.gain.value = 0.06;
      
      osc.connect(filt);
      filt.connect(g);
      g.connect(this.musicGain);
      osc.start(now);
      lfo.start(now);
      this._nodes.push(osc, filt, lfo, lfoG, g);
    });
  }

  /** 低音持续音 */
  _startBassDrone() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = BASS_NOTES[0];
    
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(now);
    this._nodes.push(osc, g);
    this._bassOsc = osc;
    this._nextBassNote();
  }

  _nextBassNote() {
    if (!this.isPlaying) return;
    const note = BASS_NOTES[Math.floor(Math.random() * BASS_NOTES.length)];
    this._bassOsc.frequency.setTargetAtTime(note, this.ctx.currentTime, 0.4);
    this._timers.push(setTimeout(() => this._nextBassNote(), (4 + Math.random() * 5) * 1000));
  }

  /** 旋律短句 —— 钢琴音色 */
  _playMelodyPhrase() {
    if (!this.isPlaying || !this.ctx) return;
    
    // 随机选 3~6 个音符组成短句
    const count = 3 + Math.floor(Math.random() * 4);
    const notes = [];
    for (let i = 0; i < count; i++) {
      notes.push(PENTATONIC_C[Math.floor(Math.random() * PENTATONIC_C.length)]);
    }
    
    const now = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const t = now + i * 0.55;
      this._playPianoNote(freq, t, 0.4 + Math.random() * 0.3);
    });
    
    // 下一句间隔
    const gap = 4 + Math.random() * 8;
    this._timers.push(setTimeout(() => this._playMelodyPhrase(), gap * 1000));
  }

  /** 钢琴音色 —— 三角波 + 谐波 + 包络 */
  _playPianoNote(freq, startTime, duration) {
    const ctx = this.ctx;
    
    // 基频 + 第二泛音
    [1, 2].forEach((harmonic, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * harmonic;
      
      const env = ctx.createGain();
      const vol = idx === 0 ? 0.09 : 0.025;
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(vol, startTime + 0.015);
      env.gain.setValueAtTime(vol, startTime + duration * 0.7);
      env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      // 混响模拟
      const delay = ctx.createDelay(0.4);
      delay.delayTime.value = 0.22;
      const fb = ctx.createGain();
      fb.gain.value = 0.18;
      const dry = ctx.createGain();
      dry.gain.value = 0.7;
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      
      osc.connect(env);
      env.connect(dry);
      dry.connect(this.musicGain);
      env.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(this.musicGain);
      
      osc.start(startTime);
      osc.stop(startTime + duration + 0.6);
      
      // 延迟清理
      const cleanupT = (duration + 0.8) * 1000;
      this._timers.push(setTimeout(() => {
        try { osc.disconnect(); env.disconnect(); delay.disconnect(); fb.disconnect(); dry.disconnect(); wet.disconnect(); } catch(e){}
      }, cleanupT));
    });
  }

  /** 环境高音叮当 */
  _playAmbientChime() {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = PENTATONIC_C[Math.floor(Math.random() * 5) + 5] * 2;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.03, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    
    osc.connect(env);
    env.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 2.5);
    
    this._timers.push(setTimeout(() => {
      try { osc.disconnect(); env.disconnect(); } catch(e){}
    }, 3000));
    
    this._timers.push(setTimeout(() => this._playAmbientChime(), (7 + Math.random() * 12) * 1000));
  }

  /* ============================================
     音效 —— 脚步声
     ============================================ */
  /** 播放脚步声（按脚下方块类型） */
  playFootstep(blockType) {
    if (!this.ctx || this.isSfxMuted) return;
    
    // 冷却检查
    const now = this.ctx.currentTime;
    if (now - this._lastFootstep < this._footstepMinGap) return;
    this._lastFootstep = now;
    
    const type = getFootstepType(blockType);
    const params = FOOTSTEP_PARAMS[type] || FOOTSTEP_PARAMS.default;
    
    this._playNoiseBurst(params, 0.7 + Math.random() * 0.3);
  }

  /* ============================================
     音效 —— 方块放置
     ============================================ */
  playBlockPlace(blockType) {
    if (!this.ctx || this.isSfxMuted) return;
    const now = this.ctx.currentTime;
    
    // 低频"咚"声
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.15, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
    
    setTimeout(() => { try { osc.disconnect(); env.disconnect(); } catch(e){} }, 300);
    
    // 叠加噪声
    const params = getFootstepType(blockType);
    const p = FOOTSTEP_PARAMS[params] || FOOTSTEP_PARAMS.default;
    this._playNoiseBurst({ ...p, vol: p.vol * 0.5, decay: p.decay * 0.6 }, 0.5);
  }

  /* ============================================
     音效 —— 方块破坏
     ============================================ */
  playBlockBreak(blockType) {
    if (!this.ctx || this.isSfxMuted) return;
    const now = this.ctx.currentTime;
    
    // 碎裂声 —— 多次短噪声
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.025;
      const params = FOOTSTEP_PARAMS[getFootstepType(blockType)] || FOOTSTEP_PARAMS.default;
      this._playNoiseBurst({
        cutoff: params.cutoff * (1.5 + i * 0.5),
        q: params.q * 1.5,
        vol: params.vol * 0.5,
        decay: 0.03,
        color: 'white',
      }, 0.4 + Math.random() * 0.3, t);
    }
  }

  /* ============================================
     音效 —— 跳跃
     ============================================ */
  playJump() {
    if (!this.ctx || this.isSfxMuted) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.06, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
    
    setTimeout(() => { try { osc.disconnect(); env.disconnect(); } catch(e){} }, 300);
  }

  /* ============================================
     音效 —— 落地
     ============================================ */
  playLand(blockType) {
    if (!this.ctx || this.isSfxMuted) return;
    const params = FOOTSTEP_PARAMS[getFootstepType(blockType)] || FOOTSTEP_PARAMS.default;
    this._playNoiseBurst({ ...params, vol: params.vol * 1.5, decay: params.decay * 1.3 }, 0.8);
  }

  /* ============================================
     音效 —— 入水
     ============================================ */
  playSplash() {
    if (!this.ctx || this.isSfxMuted) return;
    const now = this.ctx.currentTime;
    
    // 水花声：过滤白噪声
    this._playNoiseBurst({ cutoff: 3000, q: 0.8, vol: 0.16, decay: 0.25, color: 'white' }, 0.7);
    
    // 气泡声
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.04, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
    setTimeout(() => { try { osc.disconnect(); env.disconnect(); } catch(e){} }, 500);
  }

  /* ============================================
     噪声发生器（核心）
     ============================================ */
  _playNoiseBurst(params, pitchVariation = 1, atTime = null) {
    const ctx = this.ctx;
    const now = atTime || ctx.currentTime;
    const duration = params.decay * (0.8 + Math.random() * 0.4);
    
    // 创建噪声缓冲
    const sampleRate = ctx.sampleRate;
    const len = Math.ceil(sampleRate * duration);
    const buf = ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    
    for (let i = 0; i < len; i++) {
      // 不同颜色噪声
      if (params.color === 'pink') {
        // 粉红噪声近似：累加白噪声并衰减
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.3);
      } else if (params.color === 'brown') {
        // 布朗噪声：更强的低频
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.15);
      } else {
        // 白噪声
        data[i] = (Math.random() * 2 - 1);
      }
      // 包络衰减
      data[i] *= Math.pow(1 - i / len, 1.5);
    }
    
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4 * pitchVariation;
    
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = params.cutoff * (0.9 + Math.random() * 0.2);
    filt.Q.value = params.q;
    
    const env = ctx.createGain();
    env.gain.setValueAtTime(params.vol * (0.8 + Math.random() * 0.4), now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    src.connect(filt);
    filt.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration + 0.05);
    
    setTimeout(() => {
      try { src.disconnect(); filt.disconnect(); env.disconnect(); } catch(e){}
    }, (duration + 0.1) * 1000);
  }

  /* ============================================
     控制
     ============================================ */
  toggleMusic() {
    this.isMusicMuted = !this.isMusicMuted;
    this.musicGain.gain.value = this.isMusicMuted ? 0 : this._musicVol;
    return this.isMusicMuted;
  }

  toggleSfx() {
    this.isSfxMuted = !this.isSfxMuted;
    this.sfxGain.gain.value = this.isSfxMuted ? 0 : this._sfxVol;
    return this.isSfxMuted;
  }

  toggleAll() {
    const musicMuted = this.toggleMusic();
    if (musicMuted) {
      this.isSfxMuted = true;
      this.sfxGain.gain.value = 0;
    } else {
      this.isSfxMuted = false;
      this.sfxGain.gain.value = this._sfxVol;
    }
  }

  pause() {
    if (this.masterGain) this.masterGain.gain.value = 0;
  }

  resume() {
    if (this.masterGain) {
      this.masterGain.gain.value = 1.0;
      if (this.isMusicMuted) this.musicGain.gain.value = 0;
      else this.musicGain.gain.value = this._musicVol;
      if (this.isSfxMuted) this.sfxGain.gain.value = 0;
      else this.sfxGain.gain.value = this._sfxVol;
    }
  }

  dispose() {
    this.isPlaying = false;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this._nodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch(e){} });
    this._nodes = [];
    if (this.masterGain) { try { this.masterGain.disconnect(); } catch(e){} }
    if (this.ctx) { this.ctx.close().catch(()=>{}); this.ctx = null; }
  }
}
