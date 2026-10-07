'use strict';
const assert = require('node:assert/strict');
const { Game, W, H, SHAPES, TYPE_ID } = require('../engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// 以字串設定盤面底部：由下往上，'#' = 方塊
function setBottom(g, rows) {
  for (let y = 0; y < H; y++) g.board[y].fill(0);
  rows.slice().reverse().forEach((r, i) => {
    for (let x = 0; x < W; x++) g.board[H - 1 - i][x] = r[x] === '#' ? 1 : 0;
  });
}
function put(g, type, rot, x, y) { g.cur = { type, rot, x, y }; g.lowestY = y; g.resets = 0; g.lockTimer = 0; g.lastRotate = false; }
function events(g) { const ev = []; g.onEvent = (t, d) => ev.push([t, d]); return ev; }

console.log('engine');

test('7-bag：每 7 個方塊必含 7 種', () => {
  const g = new Game({ seed: 1 });
  const seq = [g.cur.type];
  for (let i = 0; i < 20; i++) seq.push(g.queue.shift()), g.refill();
  for (let b = 0; b < 3; b++) {
    const bag = seq.slice(b * 7, b * 7 + 7);
    assert.equal(new Set(bag).size, 7);
  }
});

test('相同種子 → 相同序列', () => {
  const a = new Game({ seed: 42 }), b = new Game({ seed: 42 });
  assert.deepEqual(a.next(14), b.next(14));
});

test('生成位置：置中、在隱藏區邊緣', () => {
  for (const t of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
    const g = new Game({ seed: 3 });
    g.spawn(t);
    const xs = g.cellsOf(g.cur).map((c) => c[0]);
    assert.ok(Math.min(...xs) >= 3 && Math.max(...xs) <= 6, t);
    assert.ok(g.cellsOf(g.cur).every((c) => c[1] >= 19 && c[1] <= 21), t);
  }
});

test('四個旋轉狀態共 4 格且互不重疊', () => {
  for (const t of Object.keys(SHAPES)) for (const st of SHAPES[t]) {
    assert.equal(new Set(st.map((c) => c.join())).size, 4);
  }
});

test('硬降：I 落到最底並 +2/格', () => {
  const g = new Game({ seed: 5 });
  g.spawn('I');
  const y0 = g.cur.y;
  g.press('hardDrop');
  // I 水平放在最底列
  assert.ok(g.board[H - 1].some((v) => v === TYPE_ID.I));
  assert.equal(g.score, (H - 1 - (y0 + 1)) * 2);
});

test('單行消除 100 分並移除該列', () => {
  const g = new Game({ seed: 5 });
  setBottom(g, ['#########.']);
  g.spawn('I'); put(g, 'I', 1, 7, 30); // 直立 I，佔 col 9
  const ev = events(g);
  g.press('hardDrop');
  assert.equal(g.lines, 1);
  assert.equal(g.score >= 100, true);
  const clear = ev.find((e) => e[0] === 'clear')[1];
  assert.equal(clear.lines, 1);
  assert.ok(g.board[H - 1].some((v) => v) && !g.board[H - 1].every((v) => v)); // 直立 I 剩 3 格往下掉
});

test('Tetris 800 分，第二次 Tetris B2B ×1.5', () => {
  const g = new Game({ seed: 5 });
  const rows = Array(4).fill('#########.');
  setBottom(g, rows);
  g.spawn('I'); put(g, 'I', 1, 7, 30);
  g.score = 0; g.press('hardDrop');
  const first = g.score - (g.score % 1); // 含硬降分
  assert.equal(g.lines, 4);
  assert.equal(g.b2b, true);
  const afterFirst = g.score;
  setBottom(g, rows);
  put(g, 'I', 1, 7, 30);
  g.press('hardDrop');
  // 第二次：800*1.5 + combo 50*1*level + 硬降
  const gain = g.score - afterFirst;
  assert.ok(gain >= 1200 + 50, `gain=${gain}`);
});

test('Combo 計數與重置', () => {
  const g = new Game({ seed: 7 });
  setBottom(g, ['#########.', '#########.']);
  put(g, 'I', 1, 7, 30); g.press('hardDrop');
  assert.equal(g.combo, 0);
  setBottom(g, ['#########.']);
  put(g, 'I', 1, 7, 30); g.press('hardDrop');
  assert.equal(g.combo, 1);
  setBottom(g, []);
  put(g, 'O', 0, 3, 30); g.press('hardDrop');
  assert.equal(g.combo, -1);
});

test('Perfect Clear 觸發並加分', () => {
  const g = new Game({ seed: 9 });
  setBottom(g, ['#########.']);
  put(g, 'I', 1, 7, 30);
  const ev = events(g);
  g.press('hardDrop');
  // 直立 I 剩 3 格，不是 PC
  assert.equal(ev.find((e) => e[0] === 'clear')[1].pc, false);
  // 真正的 PC：只剩一列且被清掉
  const g2 = new Game({ seed: 9 });
  setBottom(g2, ['######....']);
  put(g2, 'I', 0, 6, 38); // 水平 I：cells row y+1 = 39，col 6..9
  const ev2 = events(g2);
  g2.press('hardDrop');
  const c = ev2.find((e) => e[0] === 'clear')[1];
  assert.equal(c.pc, true);
  assert.ok(c.gained >= 800);
});

test('T-Spin 判定：三角規則 + lastRotate', () => {
  const g = new Game({ seed: 11 });
  // T 在 rot 2 (朝下)，底部凹槽，左右下角被佔
  setBottom(g, [
    '#.#.......',
    '...',
  ].slice(0, 1));
  setBottom(g, ['#.#.......']);
  put(g, 'T', 0, 0, 37);
  g.lastRotate = true;
  // T rot0: cells (1,0)(0,1)(1,1)(2,1) at x=0,y=37 → rows 37,38
  // corners: (0,37),(2,37),(0,39),(2,39)；(0,39),(2,39) 被佔（#），(0,37) 空 (2,37) 空 → 2 個
  assert.equal(g.detectTSpin().tspin, false);
  // 讓上方兩角之一也被佔
  g.board[37][0] = 1;
  const r = g.detectTSpin();
  assert.equal(r.tspin, true);
  // 前方兩角（上方 (0,37),(2,37)）只有一個佔 → mini（非第 5 踢）
  assert.equal(r.mini, true);
  g.board[37][2] = 1;
  assert.equal(g.detectTSpin().mini, false);
  g.lastRotate = false;
  assert.equal(g.detectTSpin().tspin, false);
});

test('真實 T-Spin Double（旋轉入槽 + 消 2 行）', () => {
  const g = new Game({ seed: 13 });
  //  .........     第 37 列 (最上)
  //  ##.#######   第 38 列？ 下面這樣放:
  setBottom(g, [
    '###.######', // y=37 : 洞在 col 3 上方只有單格洞…
    '##...#####', // y=38
    '###.######', // y=39
  ]);
  // 標準 TSD：T 由 rot3/rot1 旋轉進入，這裡直接放 rot 2 於 (2,37) 並設 lastRotate
  // rot2 cells: (2,0)?? 取引擎資料：
  const cellsRel = SHAPES.T[2];
  // 令 T 的 stem 朝下對準 col 3：stem 是 rot2 中 y=2 的那格
  const stem = cellsRel.find((c) => c[1] === 2);
  const x = 3 - stem[0];
  put(g, 'T', 2, x, 37 - 0);
  // 檢查該位置是否合法：需要 T 完全落在 y 37..39
  const ok = !g.collides('T', 2, x, 37);
  assert.ok(ok, '位置合法');
  g.lastRotate = true;
  g.lastKick = 0;
  const ev = events(g);
  // 鎖定
  g.lockPiece();
  const c = ev.find((e) => e[0] === 'clear')[1];
  assert.equal(c.tspin, true);
  assert.equal(c.lines, 2);
  assert.ok(c.gained >= 1200);
});

test('SRS：靠牆旋轉會 kick', () => {
  const g = new Game({ seed: 1 });
  g.spawn('J');
  put(g, 'J', 1, -1, 30); // rot1 向左超出？先確保合法
  // 直立 J (rot1)，把它放在最左：x=-1 時最左格 x=-1+? 需合法
  for (let x = -2; x <= 0; x++) {
    if (!g.collides('J', 1, x, 30)) { g.cur.x = x; break; }
  }
  const before = g.cur.x;
  assert.equal(g.rotate(-1), true); // 逆時針回 rot0：在牆邊需要 kick
  assert.ok(g.cellsOf(g.cur).every((c) => c[0] >= 0 && c[0] < W));
  assert.ok(typeof before === 'number');
});

test('I 方塊 SRS：貼牆直立旋轉可成功', () => {
  const g = new Game({ seed: 1 });
  g.spawn('I');
  put(g, 'I', 1, -2, 30);
  while (!g.collides('I', 1, g.cur.x - 1, 30)) g.cur.x--; // 貼左牆
  assert.equal(g.rotate(1), true);
});

test('DAS/ARR：按住一段時間後連續移動', () => {
  const g = new Game({ seed: 1, settings: { das: 100, arr: 30 } });
  g.spawn('O');
  const x0 = g.cur.x;
  g.press('left');
  assert.equal(g.cur.x, x0 - 1); // 立即移 1 格
  g.update(90);
  assert.equal(g.cur.x, x0 - 1); // 還沒到 DAS
  g.update(10 + 30 * 2); // DAS 到 + 2 個 ARR
  assert.ok(g.cur.x <= x0 - 3, `x=${g.cur.x}`);
  g.release('left');
  const x1 = g.cur.x;
  g.update(300);
  assert.equal(g.cur.x, x1);
});

test('ARR=0：瞬間到牆', () => {
  const g = new Game({ seed: 1, settings: { das: 50, arr: 0 } });
  g.spawn('T');
  g.press('right');
  g.update(60);
  const xs = g.cellsOf(g.cur).map((c) => c[0]);
  assert.equal(Math.max(...xs), W - 1);
});

test('左右同時按：後按的優先，放開後續移原方向', () => {
  const g = new Game({ seed: 1, settings: { das: 50, arr: 20 } });
  g.spawn('T');
  g.press('left');
  g.update(10);
  g.press('right');
  assert.equal(g.activeDir, 1);
  g.release('right');
  assert.equal(g.activeDir, -1);
});

test('鎖定延遲：落地 500ms 後鎖定', () => {
  const g = new Game({ seed: 2, settings: { lockDelay: 500 } });
  g.spawn('O');
  put(g, 'O', 0, 3, H - 2 - 1); // O cells rows y+0..y+1 ; y=37 → rows 37,38 → 還能再下 1
  g.cur.y = 38; // 貼底：rows 38,39
  const ev = events(g);
  g.update(400);
  assert.equal(ev.filter((e) => e[0] === 'lock').length, 0);
  g.update(150);
  assert.equal(ev.filter((e) => e[0] === 'lock').length, 1);
});

test('鎖定延遲：移動可重置，但有次數上限', () => {
  const g = new Game({ seed: 2, settings: { lockDelay: 500, maxResets: 3, das: 9999 } });
  g.spawn('O');
  g.cur.y = 38; g.lowestY = 38; g.resets = 0;
  const ev = events(g);
  // 連續左右撥動 3 次可重置，第 4 次起不再重置
  for (let i = 0; i < 6; i++) {
    g.update(300);
    if (ev.some((e) => e[0] === 'lock')) break;
    g.press(i % 2 ? 'left' : 'right');
    g.release(i % 2 ? 'left' : 'right');
  }
  assert.ok(ev.some((e) => e[0] === 'lock'), '最終仍會鎖定');
});

test('Hold：每個方塊只能 hold 一次，換出後可再 hold', () => {
  const g = new Game({ seed: 3 });
  const first = g.cur.type;
  assert.equal(g.doHold(), true);
  assert.equal(g.hold, first);
  assert.equal(g.doHold(), false);
  g.press('hardDrop');
  assert.equal(g.canHold, true);
});

test('軟降：每格 +1 分，速度大於重力', () => {
  const g = new Game({ seed: 3, settings: { sdf: 20 } });
  g.spawn('T');
  const y0 = g.cur.y;
  g.press('softDrop');
  g.update(120);
  assert.ok(g.cur.y - y0 >= 2);
  assert.equal(g.score, g.cur.y - y0);
});

test('Block out：生成處被擋 → Game Over', () => {
  const g = new Game({ seed: 3 });
  for (let y = 19; y < 22; y++) g.board[y].fill(1);
  const ev = events(g);
  g.spawn('T');
  assert.equal(g.over, true);
  assert.ok(ev.some((e) => e[0] === 'gameOver'));
});

test('升級：每 10 行 +1 等級', () => {
  const g = new Game({ seed: 3 });
  for (let i = 0; i < 10; i++) {
    setBottom(g, ['#########.']);
    put(g, 'I', 1, 7, 30);
    g.press('hardDrop');
  }
  assert.equal(g.lines, 10);
  assert.equal(g.level, 2);
});

test('第一關速度 = 每秒 1 格，不受獎勵影響', () => {
  const g = new Game({ seed: 3, settings: { reward: 0.6, gravityScale: 0.55 } });
  assert.equal(g.rewardMul(), 1);
  const y0 = g.cur.y;
  g.update(1000);
  assert.equal(g.cur.y - y0, 1);
});

test('過關獎勵：升級後速度放慢，隨消行逐漸加回', () => {
  const g = new Game({ seed: 3, settings: { reward: 0.6, linesPerLevel: 10 } });
  g.lines = 10; g.level = 2; // 剛升到第 2 關
  assert.ok(Math.abs(g.rewardMul() - 0.6) < 1e-9);
  g.lines = 15;
  assert.ok(Math.abs(g.rewardMul() - 0.8) < 1e-9);
  g.lines = 19;
  assert.ok(g.rewardMul() > 0.95 && g.rewardMul() < 1);
  // 新關起點比上一關終點慢
  const E = require('../engine.js');
  const endOfL1 = E.gravityCps(1);
  const startOfL2 = E.gravityCps(2) * 0.6;
  assert.ok(startOfL2 < E.gravityCps(2) && startOfL2 < endOfL1 * 1.0 + 0.0001 + 0.0, `start ${startOfL2} end ${endOfL1}`);
});

test('起始等級 > 1 時，第一關沒有獎勵', () => {
  const g = new Game({ seed: 3, settings: { reward: 0.6, startLevel: 5 } });
  assert.equal(g.rewardMul(), 1);
});

test('對戰攻擊表', () => {
  const { attackFor } = require('../engine.js');
  assert.equal(attackFor(1, false, false, false, 0, false), 0);
  assert.equal(attackFor(2, false, false, false, 0, false), 1);
  assert.equal(attackFor(3, false, false, false, 0, false), 2);
  assert.equal(attackFor(4, false, false, false, 0, false), 4);
  assert.equal(attackFor(4, false, false, true, 0, false), 5); // B2B +1
  assert.equal(attackFor(2, true, false, false, 0, false), 4); // TSD
  assert.equal(attackFor(1, true, true, false, 0, false), 0); // T-Spin mini single
  assert.equal(attackFor(1, false, false, false, 4, false), 2); // 第 5 連 combo
  assert.equal(attackFor(4, false, false, false, 0, true), 14); // PC
});

test('Tetris 送出 4 行攻擊', () => {
  const g = new Game({ seed: 5 });
  setBottom(g, ['####......'].concat(Array(4).fill('#########.')));
  put(g, 'I', 1, 7, 30);
  const ev = events(g);
  g.press('hardDrop');
  const at = ev.find((e) => e[0] === 'attack');
  assert.ok(at); assert.equal(at[1].lines, 4);
});

test('垃圾行：沒消行時從底部頂上，缺口同欄', () => {
  const g = new Game({ seed: 5 });
  setBottom(g, []);
  g.receiveGarbage(3);
  assert.equal(g.pendingGarbage(), 3);
  put(g, 'O', 0, 3, 10);
  g.press('hardDrop');
  assert.equal(g.pendingGarbage(), 0);
  const rows = [g.board[H - 1], g.board[H - 2], g.board[H - 3]];
  for (const r of rows) assert.equal(r.filter((v) => v === 0).length, 1);
  const hole = rows[0].indexOf(0);
  assert.ok(rows.every((r) => r.indexOf(0) === hole));
  assert.ok(g.board[H - 4].some((v) => v)); // O 方塊被墊高
});

test('垃圾行：消行可以抵銷排隊中的垃圾', () => {
  const g = new Game({ seed: 5 });
  g.receiveGarbage(3);
  setBottom(g, ['####......'].concat(Array(4).fill('#########.')));
  put(g, 'I', 1, 7, 30);
  const ev = events(g);
  g.press('hardDrop');
  assert.equal(g.pendingGarbage(), 0);
  assert.equal(ev.find((e) => e[0] === 'attack')[1].lines, 1); // 4 - 3
});

test('垃圾行把方塊頂出頂部 → 遊戲結束', () => {
  const g = new Game({ seed: 5 });
  setBottom(g, []);
  g.board[0][0] = 1; // 最頂端（隱藏區最上方）已有方塊
  g.receiveGarbage(1);
  put(g, 'O', 0, 3, 30);
  const ev = events(g);
  g.press('hardDrop');
  assert.equal(g.over, true);
  assert.equal(ev.find((e) => e[0] === 'gameOver')[1].reason, 'garbage');
});

console.log(`\n${passed} passed`);
