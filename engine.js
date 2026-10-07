'use strict';
/*
 * 狗狗哇沙米光律方塊 — 遊戲核心邏輯（無 DOM，可在 Node 測試）
 * SRS 旋轉 / wall kick、7-bag、DAS/ARR、鎖定延遲、T-Spin、Combo、B2B、Perfect Clear
 */
(function (root) {
  const W = 10;
  const H = 40; // 含上方 20 列隱藏區
  const VIS = 20; // 可見列數
  const HIDDEN = H - VIS;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const TYPE_ID = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

  // 每種方塊 rotation 0 的格子 (x, y)，y 向下
  const BASE = {
    I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { size: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };

  const SHAPES = {};
  for (const t of TYPES) {
    const { size, cells } = BASE[t];
    const states = [cells];
    for (let i = 1; i < 4; i++) {
      states.push(t === 'O' ? cells : states[i - 1].map(([x, y]) => [size - 1 - y, x]));
    }
    SHAPES[t] = states;
  }

  // SRS kick（y 向上的標準表，套用時 y 取負）
  const KICKS_JLSTZ = {
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const KICKS_180 = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];

  // T-Spin：各旋轉狀態「尖端」那側的兩個角
  const T_FRONT = [
    [[0, 0], [2, 0]],
    [[2, 0], [2, 2]],
    [[0, 2], [2, 2]],
    [[0, 0], [0, 2]],
  ];
  const T_CORNERS = [[0, 0], [2, 0], [0, 2], [2, 2]];

  // 對戰：連擊攻擊加成（索引 = 第幾次連續消行，0 = 第一次）
  const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
  // 對戰：一次消行要送出幾行垃圾
  function attackFor(lines, tspin, mini, b2b, combo, pc) {
    if (lines <= 0) return 0;
    let a = tspin ? (mini ? [0, 0, 1, 2][lines] : [0, 2, 4, 6][lines]) : [0, 0, 1, 2, 4][lines];
    if (b2b) a += 1;
    a += COMBO_ATTACK[Math.min(Math.max(combo, 0), COMBO_ATTACK.length - 1)];
    if (pc) a += 10;
    return a;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFAULT_SETTINGS = {
    das: 130, // ms，按住多久開始連續移動
    arr: 20, // ms，連續移動間隔（0 = 瞬間到牆）
    sdf: 20, // 軟降倍率（>= 40 = 瞬間）
    lockDelay: 500,
    maxResets: 15,
    startLevel: 1,
    linesPerLevel: 10,
    gravityScale: 1, // 等級對速度的影響倍率（< 1 = 加速較慢）
    reward: 1, // 過關獎勵：升級後該關起始速度倍率（< 1 = 先放慢，隨消行逐漸加回 1）
    maxGarbagePerLock: 8, // 對戰：每次放下方塊最多頂上來幾行垃圾
  };

  function gravityCps(level) {
    // 官方公式：每格秒數 = (0.8 - (level-1)*0.007)^(level-1)
    const sec = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
    return Math.min(1 / sec, 60);
  }

  class Game {
    constructor(opts = {}) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, opts.settings);
      this.seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      this.onEvent = opts.onEvent || null;
      this.reset();
    }

    emit(type, data) {
      if (this.onEvent) this.onEvent(type, data || {});
    }

    reset() {
      this.rng = mulberry32(this.seed);
      this.board = [];
      for (let y = 0; y < H; y++) this.board.push(new Uint8Array(W));
      this.queue = [];
      this.hold = null;
      this.canHold = true;
      this.score = 0;
      this.lines = 0;
      this.level = this.settings.startLevel;
      this.combo = -1;
      this.b2b = false;
      this.pieces = 0;
      this.time = 0;
      this.over = false;
      this.garbageQueue = [];
      this.garbageRng = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
      this.attackSent = 0;
      this.garbageTaken = 0;
      this.held = { left: false, right: false, softDrop: false };
      this.activeDir = 0;
      this.das = 0;
      this.arrAcc = 0;
      this.cur = null;
      this.spawn();
    }

    // ---------- 隨機 / 佇列 ----------
    refill() {
      while (this.queue.length < 14) {
        const bag = TYPES.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        this.queue.push(...bag);
      }
    }

    // 過關獎勵：每升一級（第一關除外），新的一關從 reward 倍速度開始，隨本關消行數線性加回 1 倍
    rewardMul() {
      const s = this.settings;
      if (this.level <= s.startLevel || s.reward >= 1) return 1;
      const progress = (this.lines % s.linesPerLevel) / s.linesPerLevel;
      return s.reward + (1 - s.reward) * progress;
    }

    // ---------- 對戰：垃圾行 ----------
    receiveGarbage(n) {
      n = Math.floor(n);
      if (n > 0 && !this.over) { this.garbageQueue.push(n); this.emit('garbageQueued', { lines: n, pending: this.pendingGarbage() }); }
    }

    pendingGarbage() {
      return this.garbageQueue.reduce((a, b) => a + b, 0);
    }

    // 從底部頂上垃圾行（同一批的缺口在同一欄）；回傳實際頂上的行數
    applyGarbage() {
      let budget = this.settings.maxGarbagePerLock;
      let total = 0;
      while (budget > 0 && this.garbageQueue.length) {
        const take = Math.min(budget, this.garbageQueue[0]);
        const hole = Math.floor(this.garbageRng() * W);
        for (let k = 0; k < take; k++) {
          const top = this.board.shift();
          if (top.some((v) => v)) this.toppedByGarbage = true;
          const row = new Uint8Array(W).fill(8);
          row[hole] = 0;
          this.board.push(row);
        }
        this.garbageQueue[0] -= take;
        if (this.garbageQueue[0] <= 0) this.garbageQueue.shift();
        budget -= take; total += take;
      }
      if (total) { this.garbageTaken += total; this.emit('garbage', { lines: total, pending: this.pendingGarbage() }); }
      return total;
    }

    next(n = 5) {
      this.refill();
      return this.queue.slice(0, n);
    }

    // ---------- 碰撞 ----------
    collides(type, rot, x, y) {
      const cells = SHAPES[type][rot];
      for (let i = 0; i < 4; i++) {
        const cx = x + cells[i][0];
        const cy = y + cells[i][1];
        if (cx < 0 || cx >= W || cy >= H) return true;
        if (cy >= 0 && this.board[cy][cx]) return true;
      }
      return false;
    }

    cellsOf(p) {
      return SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
    }

    grounded() {
      const p = this.cur;
      return this.collides(p.type, p.rot, p.x, p.y + 1);
    }

    ghostY() {
      const p = this.cur;
      let y = p.y;
      while (!this.collides(p.type, p.rot, p.x, y + 1)) y++;
      return y;
    }

    // ---------- 生成 ----------
    spawn(type) {
      this.refill();
      const t = type || this.queue.shift();
      this.cur = { type: t, rot: 0, x: 3, y: 19 };
      this.lowestY = this.cur.y;
      this.resets = 0;
      this.lockTimer = 0;
      this.gAcc = 0;
      this.lastRotate = false;
      this.lastKick = 0;
      if (this.collides(t, 0, this.cur.x, this.cur.y)) {
        this.over = true;
        this.emit('gameOver', { reason: 'blockOut' });
        return false;
      }
      this.emit('spawn', { type: t });
      return true;
    }

    // ---------- 輸入 ----------
    press(action) {
      if (this.over) return;
      switch (action) {
        case 'left':
        case 'right': {
          const dir = action === 'left' ? -1 : 1;
          if (this.held[action]) return;
          this.held[action] = true;
          this.activeDir = dir;
          this.das = 0;
          this.arrAcc = 0;
          this.moveH(dir);
          break;
        }
        case 'softDrop':
          this.held.softDrop = true;
          break;
        case 'hardDrop':
          this.hardDrop();
          break;
        case 'cw': this.rotate(1); break;
        case 'ccw': this.rotate(-1); break;
        case 'r180': this.rotate(2); break;
        case 'hold': this.doHold(); break;
      }
    }

    release(action) {
      switch (action) {
        case 'left':
        case 'right': {
          if (!this.held[action]) return;
          this.held[action] = false;
          const dir = action === 'left' ? -1 : 1;
          if (this.activeDir === dir) {
            const other = dir === -1 ? 'right' : 'left';
            if (this.held[other]) {
              this.activeDir = -dir;
              this.das = this.settings.das; // 已蓄力，直接續移
              this.arrAcc = 0;
            } else {
              this.activeDir = 0;
              this.das = 0;
              this.arrAcc = 0;
            }
          }
          break;
        }
        case 'softDrop':
          this.held.softDrop = false;
          break;
      }
    }

    releaseAll() {
      this.release('left');
      this.release('right');
      this.release('softDrop');
    }

    // ---------- 動作 ----------
    afterMove() {
      if (this.grounded()) {
        if (this.resets < this.settings.maxResets) {
          this.resets++;
          this.lockTimer = 0;
        }
      } else {
        this.lockTimer = 0;
      }
    }

    moveH(dir) {
      const p = this.cur;
      if (!p || this.collides(p.type, p.rot, p.x + dir, p.y)) return false;
      p.x += dir;
      this.lastRotate = false;
      this.afterMove();
      this.emit('move', { dir });
      return true;
    }

    rotate(dir) {
      const p = this.cur;
      if (!p || this.over || p.type === 'O') return false;
      const from = p.rot;
      const to = (from + dir + 4) % 4;
      const table = dir === 2 ? KICKS_180 : (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${from}${to}`];
      for (let i = 0; i < table.length; i++) {
        const nx = p.x + table[i][0];
        const ny = p.y - table[i][1];
        if (!this.collides(p.type, to, nx, ny)) {
          p.rot = to;
          p.x = nx;
          p.y = ny;
          this.lastRotate = true;
          this.lastKick = i;
          if (p.y > this.lowestY) { this.lowestY = p.y; this.resets = 0; }
          this.afterMove();
          this.emit('rotate', { dir, kick: i });
          return true;
        }
      }
      return false;
    }

    doHold() {
      if (!this.canHold || this.over) return false;
      const t = this.cur.type;
      const prev = this.hold;
      this.hold = t;
      this.canHold = false;
      if (prev) this.spawn(prev); else this.spawn();
      this.emit('hold', { type: t });
      return true;
    }

    hardDrop() {
      const p = this.cur;
      if (!p || this.over) return;
      const startY = p.y;
      const trail = this.cellsOf(p);
      while (!this.collides(p.type, p.rot, p.x, p.y + 1)) p.y++;
      const dist = p.y - startY;
      if (dist > 0) this.lastRotate = false;
      this.score += dist * 2;
      this.emit('hardDrop', { dist, trail, x: p.x, y: p.y, type: p.type, rot: p.rot });
      this.lockPiece();
    }

    // ---------- 鎖定 / 消行 ----------
    isOccupied(x, y) {
      return x < 0 || x >= W || y >= H || (y >= 0 && this.board[y][x] !== 0);
    }

    detectTSpin() {
      const p = this.cur;
      if (p.type !== 'T' || !this.lastRotate) return { tspin: false, mini: false };
      let n = 0;
      for (const [cx, cy] of T_CORNERS) if (this.isOccupied(p.x + cx, p.y + cy)) n++;
      if (n < 3) return { tspin: false, mini: false };
      const front = T_FRONT[p.rot];
      const frontFull = front.every(([cx, cy]) => this.isOccupied(p.x + cx, p.y + cy));
      const mini = !(frontFull || this.lastKick === 4);
      return { tspin: true, mini };
    }

    lockPiece() {
      const p = this.cur;
      const id = TYPE_ID[p.type];
      const cells = this.cellsOf(p);
      const { tspin, mini } = this.detectTSpin();
      for (const [cx, cy] of cells) this.board[cy][cx] = id;
      this.pieces++;

      if (cells.every(([, cy]) => cy < HIDDEN)) {
        this.over = true;
        this.cur = null;
        this.emit('lock', { cells, type: p.type, lines: 0, tspin, mini });
        this.emit('gameOver', { reason: 'lockOut' });
        return;
      }

      // 找出滿列
      const full = [];
      for (let y = H - 1; y >= 0; y--) {
        if (this.board[y].every((v) => v !== 0)) full.push(y);
      }
      const n = full.length;
      const clearedRows = full.map((y) => ({ y, row: Array.from(this.board[y]) }));
      if (n) {
        const keep = this.board.filter((_, y) => !full.includes(y));
        const fresh = [];
        for (let i = 0; i < n; i++) fresh.push(new Uint8Array(W));
        this.board = fresh.concat(keep);
      }

      // 計分
      const prevLevel = this.level;
      let gained = 0;
      let b2bApplied = false;
      let pc = false;
      let combo = this.combo;
      if (n > 0) {
        let base;
        if (tspin) base = mini ? [100, 200, 400][n] || 400 : [400, 800, 1200, 1600][n];
        else base = [0, 100, 300, 500, 800][n];
        base *= this.level;
        const difficult = tspin || n === 4;
        if (difficult && this.b2b) { base = Math.floor(base * 1.5); b2bApplied = true; }
        this.b2b = difficult;
        this.combo++;
        combo = this.combo;
        if (this.combo > 0) base += 50 * this.combo * this.level;
        gained += base;
        this.lines += n;
        this.level = this.settings.startLevel + Math.floor(this.lines / this.settings.linesPerLevel);
        pc = this.board.every((row) => row.every((v) => v === 0));
        if (pc) {
          const bonus = (n === 4 && b2bApplied ? 3200 : [0, 800, 1200, 1800, 2000][n]) * prevLevel;
          gained += bonus;
        }
      } else {
        this.combo = -1;
        combo = -1;
        if (tspin) {
          gained += (mini ? 100 : 400) * this.level;
        }
      }
      this.score += gained;

      // 對戰：消行產生攻擊，先抵銷自己排隊中的垃圾，剩下的送給對手；沒消行就把垃圾頂上來
      let attack = 0;
      if (n > 0) {
        attack = attackFor(n, tspin, mini, b2bApplied, combo, pc);
        let a = attack;
        while (a > 0 && this.garbageQueue.length) {
          const take = Math.min(a, this.garbageQueue[0]);
          this.garbageQueue[0] -= take; a -= take;
          if (this.garbageQueue[0] <= 0) this.garbageQueue.shift();
        }
        if (attack - a > 0) this.emit('garbageCancel', { lines: attack - a, pending: this.pendingGarbage() });
        if (a > 0) { this.attackSent += a; this.emit('attack', { lines: a, raw: attack }); }
      } else if (this.garbageQueue.length) {
        this.applyGarbage();
      }

      this.emit('lock', { cells, type: p.type, lines: n, tspin, mini, attack });
      if (n > 0 || tspin) {
        this.emit('clear', {
          lines: n, rows: clearedRows, tspin, mini, combo, b2b: b2bApplied, pc, gained, type: p.type,
        });
      }
      if (this.level > prevLevel) this.emit('levelUp', { level: this.level });

      this.canHold = true;
      if (this.toppedByGarbage) {
        this.over = true; this.cur = null;
        this.emit('gameOver', { reason: 'garbage' });
        return;
      }
      this.spawn();
    }

    // ---------- 時間推進 ----------
    update(dtMs) {
      if (this.over || !this.cur) return;
      // 固定上限的子步進，避免掉幀時行為失真
      while (dtMs > 0 && !this.over) {
        const dt = Math.min(dtMs, 16.7);
        dtMs -= dt;
        this.step(dt);
      }
    }

    step(dt) {
      this.time += dt;
      const s = this.settings;

      // 水平自動移動 (DAS / ARR)
      if (this.activeDir !== 0) {
        if (this.das < s.das) {
          this.das += dt;
          if (this.das >= s.das) {
            const over = this.das - s.das;
            this.das = s.das;
            this.moveH(this.activeDir);
            this.arrAcc = over;
            this.autoShift();
          }
        } else {
          this.arrAcc += dt;
          this.autoShift();
        }
      }

      // 重力
      let cps = gravityCps(1 + (this.level - 1) * s.gravityScale) * this.rewardMul();
      const soft = this.held.softDrop;
      if (soft) cps = s.sdf >= 40 ? Infinity : cps * s.sdf;
      if (cps === Infinity) {
        let n = 0;
        while (!this.grounded()) { this.cur.y++; n++; }
        if (n) {
          this.lastRotate = false;
          this.score += n;
          this.noteLowest();
        }
      } else {
        this.gAcc += (cps * dt) / 1000;
        while (this.gAcc >= 1) {
          if (!this.grounded()) {
            this.cur.y++;
            this.gAcc -= 1;
            this.lastRotate = false;
            if (soft) this.score += 1;
            this.noteLowest();
          } else {
            this.gAcc = 0;
            break;
          }
        }
      }

      // 鎖定延遲
      if (this.grounded()) {
        this.lockTimer += dt;
        if (this.lockTimer >= s.lockDelay) this.lockPiece();
      } else {
        this.lockTimer = 0;
      }
    }

    autoShift() {
      const s = this.settings;
      const dir = this.activeDir;
      if (s.arr <= 0) {
        while (this.moveH(dir)) { /* 到牆 */ }
        this.arrAcc = 0;
        return;
      }
      while (this.arrAcc >= s.arr) {
        if (!this.moveH(dir)) { this.arrAcc = 0; break; }
        this.arrAcc -= s.arr;
      }
    }

    noteLowest() {
      if (this.cur.y > this.lowestY) {
        this.lowestY = this.cur.y;
        this.resets = 0;
      }
    }
  }

  const api = {
    attackFor, COMBO_ATTACK,
    Game, W, H, VIS, HIDDEN, TYPES, TYPE_ID, SHAPES, DEFAULT_SETTINGS, gravityCps, mulberry32,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
