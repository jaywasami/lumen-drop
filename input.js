'use strict';
/* 輸入：鍵盤 / 手把 / 螢幕按鍵 / 手勢 → 統一轉成遊戲動作 */
(function (root) {
  const ACTIONS = ['left', 'right', 'softDrop', 'hardDrop', 'cw', 'ccw', 'r180', 'hold'];
  const HELD = new Set(['left', 'right', 'softDrop']);
  const DEFAULT_KEYS = {
    left: ['ArrowLeft'], right: ['ArrowRight'], softDrop: ['ArrowDown'], hardDrop: ['Space'],
    cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ'], r180: ['KeyA'], hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
  };
  const ACTION_LABEL = {
    left: '向左', right: '向右', softDrop: '軟降', hardDrop: '硬降',
    cw: '順時針', ccw: '逆時針', r180: '旋轉 180°', hold: '暫存',
  };
  // 標準手把 (Gamepad "standard" mapping)
  const PAD_BUTTONS = {
    0: 'cw', 1: 'ccw', 2: 'hold', 3: 'r180', 4: 'hold', 5: 'cw', 6: 'ccw', 7: 'hardDrop',
    12: 'hardDrop', 13: 'softDrop', 14: 'left', 15: 'right',
  };

  class Input {
    constructor(opts) {
      this.getGame = opts.getGame; // () => Game | null（僅在可操作時回傳）
      this.settings = opts.settings;
      this.onPause = opts.onPause || (() => {});
      this.onRestart = opts.onRestart || (() => {});
      this.onFirstInput = opts.onFirstInput || (() => {});
      this.onHaptic = opts.onHaptic || (() => {});
      this.sources = {}; // action -> Set(sourceId)，供 left/right/softDrop 計數
      this.padPrev = {};
      this.padAxisPrev = { left: false, right: false, down: false };
      this.rebinding = null;
      this.cellPx = 24;
      this.bind();
    }

    keysFor(code) {
      const out = [];
      const map = this.settings.keys;
      for (const a of ACTIONS) if (map[a] && map[a].includes(code)) out.push(a);
      return out;
    }

    // ---------- 統一出入口 ----------
    press(action, src) {
      const g = this.getGame();
      if (!g) return;
      this.onFirstInput();
      if (HELD.has(action)) {
        const set = this.sources[action] || (this.sources[action] = new Set());
        const was = set.size;
        set.add(src);
        if (was === 0) g.press(action);
      } else {
        g.press(action);
      }
      this.onHaptic(action);
    }

    release(action, src) {
      if (!HELD.has(action)) return;
      const set = this.sources[action];
      if (!set) return;
      set.delete(src);
      if (set.size === 0) {
        const g = this.getGame();
        if (g) g.release(action);
      }
    }

    releaseAll() {
      for (const a of Object.keys(this.sources)) this.sources[a].clear();
      document.querySelectorAll('#touch .b.active, #touch .b.armed').forEach((b) => { b.classList.remove('active', 'armed'); b._armed = null; });
      this.gesturePointers.clear();
      const g = this.getGame();
      if (g) g.releaseAll();
    }

    // ---------- 綁定事件 ----------
    bind() {
      // 鍵盤
      window.addEventListener('keydown', (e) => {
        if (this.rebinding) {
          e.preventDefault();
          if (e.code !== 'Escape') this.rebinding(e.code);
          else this.rebinding(null);
          return;
        }
        if (e.repeat) { if (this.keysFor(e.code).length) e.preventDefault(); return; }
        if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); this.onPause(); return; }
        if (e.code === 'KeyR') { this.onRestart(); return; }
        const acts = this.keysFor(e.code);
        if (acts.length) {
          e.preventDefault();
          for (const a of acts) this.press(a, 'k:' + e.code);
        }
      });
      window.addEventListener('keyup', (e) => {
        for (const a of this.keysFor(e.code)) this.release(a, 'k:' + e.code);
      });
      window.addEventListener('blur', () => this.releaseAll());

      // 螢幕按鍵
      document.querySelectorAll('#touch .b').forEach((btn) => {
        const action = btn.dataset.action;
        // 硬降防誤觸：預設放開才落下，手指滑出按鈕即取消
        const confirmDrop = () => action === 'hardDrop' && this.settings.hdMode !== 'press';
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          if (confirmDrop()) {
            if (!this.getGame()) return;
            btn.classList.add('armed');
            btn._armed = e.pointerId;
            if (this.settings.haptics && navigator.vibrate) navigator.vibrate(4);
            return;
          }
          btn.classList.add('active');
          this.press(action, 'p:' + e.pointerId);
        });
        btn.addEventListener('pointermove', (e) => {
          if (btn._armed !== e.pointerId) return;
          const r = btn.getBoundingClientRect();
          const m = 6;
          const inside = e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m;
          btn.classList.toggle('armed', inside);
        });
        const up = (e) => {
          btn.classList.remove('active');
          if (btn._armed === e.pointerId) {
            const fire = e.type === 'pointerup' && btn.classList.contains('armed');
            btn._armed = null;
            btn.classList.remove('armed');
            if (fire) this.press('hardDrop', 'p:' + e.pointerId);
            return;
          }
          this.release(action, 'p:' + e.pointerId);
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', (e) => { if (btn._armed === e.pointerId) { btn._armed = null; btn.classList.remove('armed'); } else up(e); });
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });

      // 手勢（綁在整個畫面，僅 controls === 'gesture' 時生效）
      this.gesturePointers = new Map();
      const cv = document.getElementById('c');
      cv.addEventListener('pointerdown', (e) => {
        if (this.settings.controls !== 'gesture' || !this.getGame()) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        this.gesturePointers.set(e.pointerId, {
          sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(),
          acc: 0, soft: false, moved: false, maxDown: 0,
        });
      });
      cv.addEventListener('pointermove', (e) => {
        const p = this.gesturePointers.get(e.pointerId);
        if (!p) return;
        const g = this.getGame();
        if (!g) return;
        const dx = e.clientX - p.lx;
        p.lx = e.clientX;
        const totalDx = e.clientX - p.sx;
        const totalDy = e.clientY - p.sy;
        if (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 10) p.moved = true;
        // 左右：每拖過一格就移一格
        p.acc += dx;
        const step = this.cellPx * 0.85;
        while (p.acc >= step) { p.acc -= step; if (g.moveH(1)) this.onHaptic('move'); }
        while (p.acc <= -step) { p.acc += step; if (g.moveH(-1)) this.onHaptic('move'); }
        // 往下：偏垂直且超過門檻 → 軟降
        const vertical = totalDy > 28 && Math.abs(totalDy) > Math.abs(totalDx) * 0.8;
        if (vertical && !p.soft) { p.soft = true; this.press('softDrop', 'g:' + e.pointerId); }
        else if (!vertical && p.soft) { p.soft = false; this.release('softDrop', 'g:' + e.pointerId); }
        p.ly = e.clientY;
      });
      const end = (e) => {
        const p = this.gesturePointers.get(e.pointerId);
        if (!p) return;
        this.gesturePointers.delete(e.pointerId);
        if (p.soft) this.release('softDrop', 'g:' + e.pointerId);
        if (e.type === 'pointercancel') return;
        const dt = performance.now() - p.t;
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;
        const speed = Math.abs(dy) / Math.max(dt, 1);
        if (!p.moved && dt < 300) {
          this.press(e.clientX > window.innerWidth / 2 ? 'cw' : 'ccw', 'g');
        } else if (dy > this.cellPx * 3.5 && dt < 260 && speed > 0.9 && Math.abs(dy) > Math.abs(dx) * 2) {
          this.press('hardDrop', 'g');
        } else if (dy < -this.cellPx * 2 && dt < 320 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          this.press('hold', 'g');
        }
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
    }

    // ---------- 手把輪詢（每幀呼叫） ----------
    poll() {
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      let pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      this.padConnected = pad ? pad.id : null;
      if (!pad) return;
      // 按鈕
      for (const idx of Object.keys(PAD_BUTTONS)) {
        const b = pad.buttons[idx];
        if (!b) continue;
        const down = b.pressed || b.value > 0.6;
        const was = !!this.padPrev[idx];
        if (down && !was) this.press(PAD_BUTTONS[idx], 'pad:' + idx);
        else if (!down && was) this.release(PAD_BUTTONS[idx], 'pad:' + idx);
        this.padPrev[idx] = down;
      }
      // Start 暫停
      const start = pad.buttons[9] && pad.buttons[9].pressed;
      if (start && !this.padPrev.start) this.onPause();
      this.padPrev.start = start;
      const back = pad.buttons[8] && pad.buttons[8].pressed;
      if (back && !this.padPrev.back) this.onRestart();
      this.padPrev.back = back;
      // 左搖桿：左右 / 下
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const L = ax < -0.5, R = ax > 0.5, D = ay > 0.6;
      if (L !== this.padAxisPrev.left) { L ? this.press('left', 'pad:axL') : this.release('left', 'pad:axL'); }
      if (R !== this.padAxisPrev.right) { R ? this.press('right', 'pad:axR') : this.release('right', 'pad:axR'); }
      if (D !== this.padAxisPrev.down) { D ? this.press('softDrop', 'pad:axD') : this.release('softDrop', 'pad:axD'); }
      this.padAxisPrev = { left: L, right: R, down: D };
    }
  }

  root.LumenInput = { Input, ACTIONS, DEFAULT_KEYS, ACTION_LABEL };
})(typeof self !== 'undefined' ? self : this);
