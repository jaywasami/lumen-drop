'use strict';
/* 即時合成音效（Web Audio）。v1 只有 SFX，音樂在下一版加入。 */
(function (root) {
  const PENTA = [0, 2, 4, 7, 9];
  const A = {
    ctx: null, master: null, sfxBus: null, vol: 0.7,

    init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.vol;
      this.sfxBus.connect(comp); comp.connect(this.master); this.master.connect(this.ctx.destination);
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },

    setVolume(v) {
      this.vol = v;
      if (this.sfxBus) this.sfxBus.gain.value = v;
    },

    // 單音：f 起始頻率，f2 結束頻率
    tone({ f = 440, f2 = null, t = 0.1, type = 'sine', v = 0.2, delay = 0, attack = 0.004 }) {
      const c = this.ctx; if (!c || this.vol <= 0) return;
      const t0 = c.currentTime + delay;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + t);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + t + 0.02);
    },

    noise({ t = 0.1, v = 0.2, hp = 800, delay = 0 }) {
      const c = this.ctx; if (!c || this.vol <= 0) return;
      const t0 = c.currentTime + delay;
      const len = Math.floor(c.sampleRate * t);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = c.createGain(); g.gain.value = v;
      s.connect(f); f.connect(g); g.connect(this.sfxBus);
      s.start(t0);
    },

    note(degree, base = 392) { // 五聲音階，易聽不刺耳
      const oct = Math.floor(degree / 5);
      return base * Math.pow(2, (PENTA[((degree % 5) + 5) % 5] + 12 * oct) / 12);
    },

    play(name, d = {}) {
      if (!this.ctx) return;
      switch (name) {
        case 'move': this.tone({ f: 1200, f2: 900, t: 0.03, type: 'triangle', v: 0.05 }); break;
        case 'rotate': this.tone({ f: 700, f2: 1100, t: 0.045, type: 'triangle', v: 0.08 }); break;
        case 'hold': this.tone({ f: 520, f2: 780, t: 0.09, type: 'sine', v: 0.12 }); this.tone({ f: 780, f2: 520, t: 0.09, delay: 0.07, v: 0.1 }); break;
        case 'lock': this.tone({ f: 180, f2: 70, t: 0.1, type: 'sine', v: 0.22 }); this.noise({ t: 0.04, v: 0.05, hp: 3000 }); break;
        case 'hardDrop':
          this.tone({ f: 140, f2: 38, t: 0.16, type: 'sine', v: 0.35 });
          this.noise({ t: 0.09, v: 0.12, hp: 1200 });
          break;
        case 'clear': {
          const n = d.lines || 1;
          const base = 392 * Math.pow(2, Math.min(Math.max(d.combo || 0, 0), 7) / 12 * 2);
          for (let i = 0; i < n + 2; i++) {
            this.tone({ f: this.note(i + 2, base / 2), t: 0.28, type: 'triangle', v: 0.16, delay: i * 0.055 });
            this.tone({ f: this.note(i + 7, base / 2), t: 0.2, type: 'sine', v: 0.07, delay: i * 0.055 + 0.01 });
          }
          if (n >= 4) {
            for (let i = 0; i < 5; i++) this.tone({ f: this.note(i * 2, 196), t: 0.9, type: 'sawtooth', v: 0.05, delay: 0.02 });
            this.tone({ f: 80, f2: 40, t: 0.4, v: 0.35 });
            this.noise({ t: 0.5, v: 0.1, hp: 500 });
          }
          if (d.tspin) this.tone({ f: 330, f2: 990, t: 0.35, type: 'square', v: 0.07 });
          if (d.pc) for (let i = 0; i < 8; i++) this.tone({ f: this.note(i + 4, 392), t: 0.5, type: 'sine', v: 0.12, delay: 0.3 + i * 0.07 });
          break;
        }
        case 'tspinNoLines': this.tone({ f: 330, f2: 660, t: 0.18, type: 'square', v: 0.06 }); break;
        case 'levelUp':
          for (let i = 0; i < 6; i++) this.tone({ f: this.note(i * 1 + 3, 392), t: 0.35, type: 'triangle', v: 0.15, delay: i * 0.07 });
          break;
        case 'gameOver':
          for (let i = 0; i < 6; i++) this.tone({ f: this.note(8 - i * 1.2 | 0, 392) / 2, t: 0.5, type: 'sine', v: 0.18, delay: i * 0.12 });
          break;
        case 'count': this.tone({ f: 660, t: 0.12, type: 'sine', v: 0.15 }); break;
        case 'go': this.tone({ f: 990, t: 0.3, type: 'sine', v: 0.2 }); this.tone({ f: 1320, t: 0.3, type: 'triangle', v: 0.1 }); break;
        case 'ui': this.tone({ f: 880, f2: 1100, t: 0.05, type: 'triangle', v: 0.08 }); break;
      }
    },
  };
  root.LumenAudio = A;
})(typeof self !== 'undefined' ? self : this);
