'use strict';
/*
 * 狗狗哇沙米光律方塊 — 對戰電腦
 * 每個新方塊：列舉（目前方塊 / 暫存方塊）× 四種旋轉 × 每個橫向位置，
 * 模擬落下後用盤面特徵打分（高度、洞、凹凸、消行），挑最好的放。
 * 難度決定出手速度與失誤率。
 */
(function (root) {
  const E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { W, H, SHAPES } = E;

  const LEVELS = {
    easy: { pps: 0.6, mistake: 0.35, pool: 5, tetris: 0 },
    normal: { pps: 1.1, mistake: 0.12, pool: 3, tetris: 1.5 },
    hard: { pps: 2.0, mistake: 0, pool: 1, tetris: 3 },
  };

  function evaluate(board, linesCleared, cfg, usedWell) {
    const heights = new Array(W).fill(0);
    let holes = 0;
    for (let x = 0; x < W; x++) {
      let seen = false;
      for (let y = 0; y < H; y++) {
        if (board[y][x]) { if (!seen) { heights[x] = H - y; seen = true; } } else if (seen) holes++;
      }
    }
    let agg = 0, bump = 0, maxH = 0;
    for (let x = 0; x < W; x++) { agg += heights[x]; maxH = Math.max(maxH, heights[x]); if (x) bump += Math.abs(heights[x] - heights[x - 1]); }
    let score = -0.51 * agg - 0.36 * holes * 2 - 0.18 * bump + 0.76 * linesCleared;
    if (linesCleared === 4) score += cfg.tetris * 4;
    else if (linesCleared > 0 && maxH < 8 && cfg.tetris > 0) score -= cfg.tetris * 0.6;
    if (maxH > 14) score -= (maxH - 14) * 3;
    // 留最右邊一條直井等長條打 Tetris（堆得不高時）
    if (cfg.tetris > 0 && maxH < 12) {
      if (usedWell && linesCleared < 4) score -= cfg.tetris * 1.6;
      const others = heights.slice(0, W - 1);
      const minOther = Math.min(...others);
      score += Math.min(4, minOther - heights[W - 1]) * cfg.tetris * 0.25;
    }
    return score;
  }

  function place(board, type, rot, x) {
    const cells = SHAPES[type][rot];
    const fits = (yy) => cells.every(([cx, cy]) => {
      const bx = x + cx, by = yy + cy;
      return bx >= 0 && bx < W && by < H && (by < 0 || !board[by][bx]);
    });
    if (!fits(0)) return null;
    let y = 0;
    while (fits(y + 1)) y++;
    const b = board.map((r) => Uint8Array.from(r));
    for (const [cx, cy] of cells) { if (y + cy < 0) return null; b[y + cy][x + cx] = 1; }
    let lines = 0;
    for (let yy = H - 1; yy >= 0; yy--) {
      if (b[yy].every((v) => v)) { b.splice(yy, 1); b.unshift(new Uint8Array(W)); lines++; yy++; }
    }
    return { board: b, lines, usedWell: cells.some(([cx]) => x + cx === W - 1) };
  }

  class Bot {
    constructor(game, level) {
      this.game = game;
      this.cfg = LEVELS[level] || LEVELS.normal;
      this.timer = 0;
      this.nextDelay = this.delay();
    }
    delay() { return (1000 / this.cfg.pps) * (0.75 + Math.random() * 0.5); }

    update(dt) {
      const g = this.game;
      if (g.over || !g.cur) return;
      this.timer += dt;
      if (this.timer < this.nextDelay) return;
      this.timer = 0;
      this.nextDelay = this.delay();
      this.act();
    }

    act() {
      const g = this.game;
      const opts = [{ hold: false, type: g.cur.type }];
      if (g.canHold) opts.push({ hold: true, type: g.hold || g.next(1)[0] });
      const cands = [];
      for (const o of opts) {
        for (let rot = 0; rot < 4; rot++) {
          if (o.type === 'O' && rot > 0) break;
          for (let x = -2; x < W; x++) {
            const r = place(g.board, o.type, rot, x);
            if (!r) continue;
            cands.push({ hold: o.hold, rot, x, score: evaluate(r.board, r.lines, this.cfg, r.usedWell) });
          }
        }
      }
      if (!cands.length) { g.hardDrop(); return; }
      cands.sort((a, b) => b.score - a.score);
      let pick = cands[0];
      if (Math.random() < this.cfg.mistake) pick = cands[Math.floor(Math.random() * Math.min(this.cfg.pool, cands.length))];
      if (pick.hold) g.doHold();
      const p = g.cur;
      if (!p) return;
      if (!g.collides(p.type, pick.rot, pick.x, p.y)) { p.rot = pick.rot; p.x = pick.x; }
      g.hardDrop();
    }
  }

  const api = { Bot, LEVELS, evaluate, place };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LumenBot = api;
})(typeof self !== 'undefined' ? self : this);
