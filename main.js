'use strict';
/* 光律方塊 — 介面、渲染、特效、設定 */
(function () {
  const E = window.Engine;
  const Snd = window.LumenAudio;
  const { Input, ACTIONS, DEFAULT_KEYS, ACTION_LABEL } = window.LumenInput;
  const { W, H, HIDDEN, VIS, SHAPES, TYPE_ID } = E;

  // ================= 設定 =================
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const DEFAULTS = {
    das: 130, arr: 20, sdf: 20,
    controls: coarse ? 'buttons' : 'off',
    haptics: true, sfx: 0.7, ghost: true, fx: 'high',
    keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
  };
  let settings = loadSettings();
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('lumen.settings.v1') || '{}');
      const merged = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), s);
      merged.keys = Object.assign({}, DEFAULTS.keys, s.keys || {});
      return merged;
    } catch (_) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function saveSettings() {
    try { localStorage.setItem('lumen.settings.v1', JSON.stringify(settings)); } catch (_) { /* ignore */ }
  }
  function getBest() { try { return +localStorage.getItem('lumen.best') || 0; } catch (_) { return 0; } }
  function setBest(v) { try { localStorage.setItem('lumen.best', String(v)); } catch (_) { /* ignore */ } }

  // ================= DOM =================
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const touchEl = $('touch');
  const pauseBtn = $('btn-pause');
  const overlays = ['menu', 'pause', 'gameover', 'help', 'settings'].reduce((o, k) => (o[k] = $(k), o), {});
  function showOverlay(name) {
    for (const k in overlays) overlays[k].classList.toggle('hidden', k !== name);
  }

  // ================= 狀態 =================
  let mode = 'menu'; // menu | countdown | playing | paused | over
  let game = null;
  let countdown = 0;
  let overDelay = 0;
  let overFade = 0;
  let overShown = false;
  let settingsReturn = 'menu';
  let wakeLock = null;

  const input = new Input({
    getGame: () => (mode === 'playing' ? game : null),
    settings,
    onPause: () => { if (mode === 'playing') pauseGame(); else if (mode === 'paused') resumeGame(); else if (mode === 'menu') startGame(); },
    onRestart: () => { if (mode === 'playing' || mode === 'paused' || mode === 'over') startGame(); },
    onFirstInput: () => Snd.resume(),
    onHaptic: haptic,
  });

  function haptic(action) {
    if (!settings.haptics || !navigator.vibrate) return;
    const ms = { hardDrop: 18, hold: 10, cw: 8, ccw: 8, r180: 8, left: 5, right: 5, softDrop: 4 }[action] || 0;
    if (ms) navigator.vibrate(ms);
  }

  // ================= 主題 =================
  const THEMES = [
    { name: '星空', top: [8, 10, 40], bot: [34, 14, 78], accent: [122, 167, 255], star: [200, 215, 255] },
    { name: '深海', top: [2, 22, 48], bot: [0, 78, 96], accent: [77, 232, 255], star: [170, 255, 255] },
    { name: '極光', top: [4, 14, 30], bot: [18, 64, 62], accent: [109, 255, 176], star: [200, 255, 230] },
    { name: '霓虹都市', top: [22, 4, 42], bot: [78, 10, 84], accent: [255, 93, 230], star: [255, 190, 255] },
    { name: '櫻花', top: [42, 14, 42], bot: [96, 30, 72], accent: [255, 166, 216], star: [255, 220, 240] },
    { name: '夕陽', top: [42, 12, 40], bot: [118, 42, 42], accent: [255, 179, 107], star: [255, 230, 190] },
  ];
  const themeCur = JSON.parse(JSON.stringify(THEMES[0]));
  let themeIdx = 0;
  function lerpArr(a, b, k) { for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k; }
  function updateTheme(dt) {
    const target = THEMES[themeIdx];
    const k = Math.min(1, dt / 1000 * 1.6);
    for (const key of ['top', 'bot', 'accent', 'star']) lerpArr(themeCur[key], target[key], k);
  }
  const rgb = (a, al) => (al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`);

  // ================= 方塊精靈 =================
  const COLORS = { I: '#3de9ff', O: '#ffe14d', T: '#c070ff', S: '#5dff8a', Z: '#ff5d6c', J: '#5d8bff', L: '#ffa94d' };
  const ID_TYPE = ['', 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  let sprites = {};
  let spriteKey = '';

  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function makeSprite(type, c, dpr) {
    const pad = Math.ceil(c * 0.4);
    const size = c + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const col = hex(COLORS[type]);
    const inset = Math.max(1, c * 0.04);
    g.shadowColor = rgb(col, 0.9); g.shadowBlur = c * 0.5;
    g.fillStyle = rgb(col);
    rr(g, pad + inset, pad + inset, c - inset * 2, c - inset * 2, c * 0.2); g.fill();
    g.shadowBlur = 0;
    const grad = g.createLinearGradient(pad, pad, pad + c, pad + c);
    grad.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.55)));
    grad.addColorStop(0.45, rgb(col));
    grad.addColorStop(1, rgb(mix(col, [0, 0, 30], 0.45)));
    g.fillStyle = grad;
    rr(g, pad + inset, pad + inset, c - inset * 2, c - inset * 2, c * 0.2); g.fill();
    // 內側光澤
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, c * 0.06);
    g.beginPath(); g.moveTo(pad + c * 0.2, pad + c * 0.12); g.lineTo(pad + c * 0.12, pad + c * 0.12); g.lineTo(pad + c * 0.12, pad + c * 0.8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    rr(g, pad + c * 0.2, pad + c * 0.2, c * 0.6, c * 0.6, c * 0.12); g.fill();
    return { cv, pad, c, size };
  }
  function getSprite(type) {
    const key = `${Math.round(cell * dpr)}`;
    if (key !== spriteKey) { sprites = {}; spriteKey = key; }
    return sprites[type] || (sprites[type] = makeSprite(type, cell, dpr));
  }
  function drawCell(type, x, y, size, alpha) {
    const sp = getSprite(type);
    const r = size / sp.c;
    if (alpha != null && alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.cv, x - sp.pad * r, y - sp.pad * r, sp.size * r, sp.size * r);
    if (alpha != null && alpha !== 1) ctx.globalAlpha = 1;
  }

  // ================= 版面 =================
  let dpr = 1, vw = 0, vh = 0, cell = 24, bx = 0, by = 0, sideW = 0, gap = 0, portrait = true;
  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    portrait = vh > vw * 1.05;
    const buttons = settings.controls === 'buttons';
    if (portrait) {
      const reserve = buttons ? Math.min(Math.max(vh * 0.31, 175), 275) : 12;
      const top = 10;
      cell = Math.min((vw - 14) / 17.2, (vh - reserve - top - 6) / 20);
      cell = Math.floor(cell);
      const avail = vh - reserve - top;
      by = top + Math.max(0, (avail - cell * 20) * 0.5);
    } else {
      cell = Math.floor(Math.min((vh - 20) / 20, vw / 24));
      by = (vh - cell * 20) / 2;
    }
    sideW = cell * 3.3; gap = cell * 0.3;
    const totalW = sideW * 2 + gap * 2 + cell * 10;
    bx = (vw - totalW) / 2 + sideW + gap;
    input.cellPx = cell;
    // 暫停鈕放在左欄下方
    const lx = bx - gap - sideW;
    pauseBtn.style.left = `${lx}px`;
    pauseBtn.style.top = `${by + cell * 11.6}px`;
    pauseBtn.style.width = `${sideW}px`;
    pauseBtn.style.height = `${cell * 1.7}px`;
    pauseBtn.style.fontSize = `${Math.max(11, cell * 0.55)}px`;
    touchEl.classList.toggle('mode-gesture', settings.controls === 'gesture');
  }

  // ================= 特效 =================
  const fx = { particles: [], flashes: [], rings: [], streaks: [], popups: [], lockFlash: [], shake: 0, pulse: 0 };
  const stars = [];
  function initStars() {
    stars.length = 0;
    const n = settings.fx === 'low' ? 50 : 130;
    for (let i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6.28 });
  }
  const maxParticles = () => (settings.fx === 'low' ? 140 : 480);
  function addParticle(p) { if (fx.particles.length < maxParticles()) fx.particles.push(p); }
  function burst(x, y, color, n, speed, life, gravity) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.9);
      addParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life * (0.6 + Math.random() * 0.6), size: cell * (0.07 + Math.random() * 0.12), color, g: gravity || 0 });
    }
  }
  function cellPos(x, y) { return [bx + x * cell, by + (y - HIDDEN) * cell]; }

  function updateFx(dt) {
    const s = dt / 1000;
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.life -= s; if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
      p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s;
    }
    for (const arr of [fx.flashes, fx.rings, fx.streaks, fx.popups, fx.lockFlash]) {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += s; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
    }
    fx.shake *= Math.pow(0.0008, s);
    fx.pulse *= Math.pow(0.05, s);
    if (mode === 'over') overFade = Math.min(1, overFade + s * 1.2);
  }

  // ================= 遊戲事件 =================
  let lastWasHardDrop = false;
  function onGameEvent(type, d) {
    switch (type) {
      case 'move': Snd.play('move'); break;
      case 'rotate': Snd.play('rotate'); break;
      case 'hold': Snd.play('hold'); break;
      case 'hardDrop': {
        lastWasHardDrop = true;
        Snd.play('hardDrop');
        const fin = SHAPES[d.type][d.rot].map(([cx, cy]) => [d.x + cx, d.y + cy]);
        const cols = {};
        for (const [x, y] of d.trail) cols[x] = Math.min(cols[x] == null ? 99 : cols[x], y);
        const finTop = {};
        for (const [x, y] of fin) finTop[x] = Math.min(finTop[x] == null ? 99 : finTop[x], y);
        if (d.dist > 0) for (const x in cols) fx.streaks.push({ x: +x, y0: cols[x], y1: finTop[x], color: COLORS[d.type], t: 0, life: 0.28 });
        const occupied = new Set(fin.map((c) => c.join()));
        for (const [x, y] of fin) {
          if (occupied.has(`${x},${y + 1}`)) continue;
          const [px, py] = cellPos(x, y + 1);
          burst(px + cell / 2, py, COLORS[d.type], settings.fx === 'low' ? 3 : 7, cell * 6, 0.45, cell * 14);
        }
        fx.shake = Math.max(fx.shake, Math.min(2 + d.dist * 0.35, 9));
        break;
      }
      case 'lock': {
        if (!lastWasHardDrop) Snd.play('lock');
        lastWasHardDrop = false;
        fx.lockFlash.push({ cells: d.cells, t: 0, life: 0.16 });
        if (d.tspin && d.lines === 0) { Snd.play('tspinNoLines'); popup(['T-SPIN' + (d.mini ? ' MINI' : '')], '#d9a8ff'); }
        break;
      }
      case 'clear': {
        const n = d.lines;
        Snd.play('clear', d);
        for (const row of d.rows) {
          fx.flashes.push({ y: row.y, t: 0, life: 0.42 });
          for (let x = 0; x < W; x++) {
            const t = ID_TYPE[row.row[x]];
            if (!t) continue;
            const [px, py] = cellPos(x, row.y);
            burst(px + cell / 2, py + cell / 2, COLORS[t], settings.fx === 'low' ? 1 : 3, cell * (n >= 4 ? 14 : 8), 0.7, cell * 8);
          }
        }
        const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
        const lines = [];
        if (d.tspin) lines.push('T-SPIN' + (d.mini ? ' MINI' : '') + (n ? ' ' + names[n] : ''));
        else lines.push(names[n]);
        if (d.b2b) lines.push('BACK-TO-BACK');
        if (d.combo > 0) lines.push(`${d.combo} COMBO`);
        if (d.pc) lines.push('PERFECT CLEAR');
        popup(lines, n >= 4 || d.tspin ? '#ffe98a' : '#ffffff');
        fx.shake = Math.max(fx.shake, 3 + n * 2.5);
        fx.pulse = Math.min(1, fx.pulse + 0.25 + n * 0.18);
        if (n >= 4 || d.pc) fx.rings.push({ t: 0, life: 0.9 });
        else if (n >= 2) fx.rings.push({ t: 0, life: 0.6, small: true });
        break;
      }
      case 'levelUp':
        Snd.play('levelUp');
        themeIdx = (d.level - 1) % THEMES.length;
        popup([`LEVEL ${d.level}`, THEMES[themeIdx].name], '#8be9ff');
        fx.rings.push({ t: 0, life: 1.1 });
        fx.pulse = 1;
        break;
      case 'gameOver':
        Snd.play('gameOver');
        mode = 'over'; overDelay = 1.1; overFade = 0; overShown = false;
        input.releaseAll();
        break;
    }
  }
  function popup(lines, color) { fx.popups.push({ lines, color, t: 0, life: 1.5 }); if (fx.popups.length > 3) fx.popups.shift(); }

  // ================= 遊戲流程 =================
  function startGame() {
    Snd.resume();
    input.releaseAll();
    game = new E.Game({ settings: { das: settings.das, arr: settings.arr, sdf: settings.sdf }, onEvent: onGameEvent });
    fx.particles.length = 0; fx.flashes.length = 0; fx.rings.length = 0; fx.streaks.length = 0; fx.popups.length = 0; fx.lockFlash.length = 0;
    fx.shake = 0; fx.pulse = 0; overFade = 0; lastWasHardDrop = false;
    themeIdx = 0;
    mode = 'countdown'; countdown = 2.2; lastCount = 4;
    showOverlay(null);
    touchEl.classList.toggle('hidden', settings.controls === 'off');
    requestWake();
  }
  let lastCount = 4;
  function pauseGame() {
    if (mode !== 'playing') return;
    mode = 'paused'; input.releaseAll(); showOverlay('pause'); Snd.play('ui');
  }
  function resumeGame() {
    if (mode !== 'paused') return;
    mode = 'playing'; showOverlay(null); Snd.play('ui');
  }
  function toMenu() {
    mode = 'menu'; input.releaseAll(); game = null; showOverlay('menu');
    touchEl.classList.add('hidden');
    $('best-score').textContent = getBest().toLocaleString();
    releaseWake();
  }
  function finishGame() {
    const g = game;
    const best = getBest();
    const isNew = g.score > best && g.score > 0;
    if (isNew) setBest(g.score);
    const secs = g.time / 1000;
    $('over-stats').innerHTML = [
      ['分數', g.score.toLocaleString()], ['消除行數', g.lines], ['等級', g.level],
      ['方塊數', g.pieces], ['時間', `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`],
      ['每秒方塊', (g.pieces / Math.max(secs, 1)).toFixed(2)],
    ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    $('over-new').classList.toggle('hidden', !isNew);
    showOverlay('gameover');
    touchEl.classList.add('hidden');
    releaseWake();
  }
  async function requestWake() {
    try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) { /* ignore */ }
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (_) { /* ignore */ } wakeLock = null; }

  // ================= 繪圖 =================
  function drawBackground(t, dt) {
    const g = ctx;
    const grad = g.createLinearGradient(0, 0, 0, vh);
    const boost = fx.pulse * 0.25;
    grad.addColorStop(0, rgb(mix(themeCur.top, [255, 255, 255], boost * 0.3)));
    grad.addColorStop(1, rgb(mix(themeCur.bot, [255, 255, 255], boost * 0.4)));
    g.fillStyle = grad; g.fillRect(0, 0, vw, vh);
    // 場地後方光暈
    const cx = bx + cell * 5, cy = by + cell * 10;
    const rad = cell * (14 + fx.pulse * 5);
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, rgb(themeCur.accent, 0.22 + fx.pulse * 0.25));
    rg.addColorStop(1, rgb(themeCur.accent, 0));
    g.fillStyle = rg; g.fillRect(0, 0, vw, vh);
    // 星點
    const speed = 0.012 + (game ? game.level * 0.003 : 0);
    g.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      s.y += speed * s.z * dt / 1000; if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
      const tw = 0.6 + 0.4 * Math.sin(t / 700 + s.tw);
      g.fillStyle = rgb(themeCur.star, 0.65 * tw * s.z);
      const r = s.z * 1.5;
      g.fillRect(s.x * vw, s.y * vh, r, r);
    }
    // 飄浮光球
    if (settings.fx !== 'low') {
      for (let i = 0; i < 5; i++) {
        const ox = (Math.sin(t / 5200 + i * 1.9) * 0.5 + 0.5) * vw;
        const oy = (Math.cos(t / 6800 + i * 2.7) * 0.5 + 0.5) * vh;
        const r = cell * (3 + (i % 3) * 1.8);
        const og = g.createRadialGradient(ox, oy, 0, ox, oy, r);
        og.addColorStop(0, rgb(themeCur.accent, 0.09)); og.addColorStop(1, rgb(themeCur.accent, 0));
        g.fillStyle = og; g.fillRect(ox - r, oy - r, r * 2, r * 2);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawWell() {
    const g = ctx;
    const x = bx, y = by, w = cell * 10, h = cell * VIS;
    g.fillStyle = 'rgba(2,4,18,0.62)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 10; i++) { g.moveTo(x + i * cell, y); g.lineTo(x + i * cell, y + h); }
    for (let j = 1; j < VIS; j++) { g.moveTo(x, y + j * cell); g.lineTo(x + w, y + j * cell); }
    g.stroke();
    g.shadowColor = rgb(themeCur.accent, 0.9); g.shadowBlur = cell * 0.6;
    g.strokeStyle = rgb(themeCur.accent, 0.75); g.lineWidth = 2;
    g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    g.shadowBlur = 0;
  }

  function drawBoard() {
    const b = game.board;
    for (let y = HIDDEN; y < H; y++) {
      const row = b[y];
      for (let x = 0; x < W; x++) {
        const id = row[x];
        if (id) drawCell(ID_TYPE[id], bx + x * cell, by + (y - HIDDEN) * cell, cell);
      }
    }
  }

  function drawPiece() {
    const p = game.cur;
    if (!p) return;
    const type = p.type;
    // 幽靈
    if (settings.ghost) {
      const gy = game.ghostY();
      const col = hex(COLORS[type]);
      ctx.fillStyle = rgb(col, 0.13); ctx.strokeStyle = rgb(col, 0.65); ctx.lineWidth = 1.5;
      for (const [cx, cy] of SHAPES[type][p.rot]) {
        const x = bx + (p.x + cx) * cell, y = by + (gy + cy - HIDDEN) * cell;
        if (gy + cy < HIDDEN) continue;
        rr(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.18); ctx.fill(); ctx.stroke();
      }
    }
    // 本體（含平滑下落）
    const grounded = game.grounded();
    const frac = grounded ? 0 : Math.min(game.gAcc, 0.999);
    const lockP = grounded ? Math.min(1, game.lockTimer / game.settings.lockDelay) : 0;
    for (const [cx, cy] of SHAPES[type][p.rot]) {
      const gy = p.y + cy;
      if (gy < HIDDEN - 1) continue;
      const x = bx + (p.x + cx) * cell, y = by + (gy - HIDDEN + frac) * cell;
      drawCell(type, x, y, cell);
      if (lockP > 0) {
        ctx.fillStyle = `rgba(255,255,255,${lockP * 0.38})`;
        rr(ctx, x + 1, y + 1, cell - 2, cell - 2, cell * 0.2); ctx.fill();
      }
    }
  }

  function drawPreview(type, cx, cy, s, alpha) {
    const cells = SHAPES[type][0];
    let minx = 9, maxx = -9, miny = 9, maxy = -9;
    for (const [x, y] of cells) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const w = (maxx - minx + 1) * s, h = (maxy - miny + 1) * s;
    for (const [x, y] of cells) drawCell(type, cx - w / 2 + (x - minx) * s, cy - h / 2 + (y - miny) * s, s, alpha);
  }

  function label(text, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px system-ui, -apple-system, "Noto Sans TC", sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
  function fitLabel(text, x, y, maxW, size, color, align) {
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    label(text, x, y, w > maxW ? size * maxW / w : size, color, align, 700);
  }

  function panelBox(x, y, w, h) {
    ctx.fillStyle = 'rgba(2,4,18,0.5)';
    rr(ctx, x, y, w, h, cell * 0.3); ctx.fill();
    ctx.strokeStyle = rgb(themeCur.accent, 0.28); ctx.lineWidth = 1; ctx.stroke();
  }

  function drawHud() {
    const lx = bx - gap - sideW;
    const rx = bx + cell * 10 + gap;
    const dim = 'rgba(190,200,240,0.7)';
    // HOLD
    panelBox(lx, by, sideW, cell * 3.2);
    label('HOLD', lx + sideW / 2, by + cell * 0.55, cell * 0.42, dim, 'center');
    if (game.hold) drawPreview(game.hold, lx + sideW / 2, by + cell * 2.05, cell * 0.62, game.canHold ? 1 : 0.35);
    // 數值
    const stats = [['SCORE', game.score.toLocaleString()], ['LEVEL', String(game.level)], ['LINES', String(game.lines)]];
    stats.forEach(([k, v], i) => {
      const y = by + cell * (3.9 + i * 2.5);
      panelBox(lx, y, sideW, cell * 2.1);
      label(k, lx + sideW / 2, y + cell * 0.5, cell * 0.38, dim, 'center');
      fitLabel(v, lx + sideW / 2, y + cell * 1.3, sideW - cell * 0.4, cell * 0.85, '#fff', 'center');
    });
    // NEXT
    panelBox(rx, by, sideW, cell * 12.4);
    label('NEXT', rx + sideW / 2, by + cell * 0.55, cell * 0.42, dim, 'center');
    const nxt = game.next(5);
    nxt.forEach((t, i) => {
      const s = i === 0 ? cell * 0.7 : cell * 0.55;
      const cy = by + cell * (1.9 + (i === 0 ? 0 : 0.5) + i * 2.2);
      drawPreview(t, rx + sideW / 2, cy, s, i === 0 ? 1 : 0.85);
    });
    // Combo / B2B 標示
    let y = by + cell * 13;
    if (game.combo > 0) { label(`${game.combo} COMBO`, rx + sideW / 2, y + cell * 0.5, cell * 0.55, '#8be9ff', 'center', 800); y += cell * 1.2; }
    if (game.b2b) label('B2B', rx + sideW / 2, y + cell * 0.5, cell * 0.55, '#ffe98a', 'center', 800);
  }

  function drawEffects(t) {
    const g = ctx;
    // 鎖定閃光
    for (const f of fx.lockFlash) {
      const a = 1 - f.t / f.life;
      g.fillStyle = `rgba(255,255,255,${a * 0.55})`;
      for (const [x, y] of f.cells) {
        if (y < HIDDEN) continue;
        const [px, py] = cellPos(x, y);
        rr(g, px + 1, py + 1, cell - 2, cell - 2, cell * 0.2); g.fill();
      }
    }
    g.globalCompositeOperation = 'lighter';
    // 硬降殘影
    for (const s of fx.streaks) {
      const a = 1 - s.t / s.life;
      const [px, py0] = cellPos(s.x, s.y0);
      const py1 = cellPos(s.x, s.y1)[1];
      const gr = g.createLinearGradient(0, py0, 0, py1);
      const c = hex(s.color);
      gr.addColorStop(0, rgb(c, 0)); gr.addColorStop(1, rgb(c, 0.55 * a));
      g.fillStyle = gr; g.fillRect(px + cell * 0.1, py0, cell * 0.8, py1 - py0);
    }
    // 消行閃光
    for (const f of fx.flashes) {
      const k = f.t / f.life;
      const a = (1 - k) * (1 - k);
      const y = by + (f.y - HIDDEN) * cell + cell / 2;
      const hh = cell * (0.6 + k * 1.6);
      const gr = g.createLinearGradient(0, y - hh, 0, y + hh);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(bx - cell * k, y - hh, cell * 10 + cell * 2 * k, hh * 2);
    }
    // 衝擊波
    for (const r of fx.rings) {
      const k = r.t / r.life;
      const cx = bx + cell * 5, cy = by + cell * 10;
      const rad = cell * (r.small ? 4 : 5) + cell * (r.small ? 10 : 22) * k * (2 - k);
      g.strokeStyle = rgb(themeCur.accent, (1 - k) * 0.9);
      g.lineWidth = cell * (r.small ? 0.25 : 0.7) * (1 - k) + 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, 6.283); g.stroke();
    }
    // 粒子
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.max);
      g.fillStyle = rgb(hex(p.color), Math.min(1, a));
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalCompositeOperation = 'source-over';
    // 文字彈出
    for (const pop of fx.popups) {
      const k = pop.t / pop.life;
      const a = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.55) / 0.45);
      const sc = k < 0.12 ? 1.25 - k / 0.12 * 0.25 : 1;
      const cx = bx + cell * 5, cy = by + cell * 7 - k * cell * 1.2;
      pop.lines.forEach((ln, i) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx, cy + i * cell * (i ? 1.0 : 0) + (i ? cell * 0.5 : 0));
        ctx.scale(sc, sc);
        ctx.shadowColor = pop.color; ctx.shadowBlur = cell * 0.7;
        const size = i === 0 ? cell * 1.15 : cell * 0.7;
        label(ln, 0, 0, size, i === 0 ? pop.color : '#fff', 'center', 800);
        ctx.restore();
      });
    }
  }

  function drawCountdown() {
    const n = Math.ceil(countdown / 0.7);
    if (n !== lastCount) { lastCount = n; if (n >= 1 && n <= 3) Snd.play('count'); }
    const frac = (countdown % 0.7) / 0.7;
    ctx.save();
    ctx.translate(bx + cell * 5, by + cell * 9);
    ctx.globalAlpha = Math.min(1, frac * 1.6);
    ctx.scale(0.8 + frac * 0.6, 0.8 + frac * 0.6);
    ctx.shadowColor = rgb(themeCur.accent); ctx.shadowBlur = cell;
    label(String(Math.max(1, n)), 0, 0, cell * 4, '#fff', 'center', 800);
    ctx.restore();
  }

  function render(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    drawBackground(t, dt);
    if (!game) return;
    ctx.save();
    if (fx.shake > 0.3) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    drawWell();
    ctx.save();
    ctx.beginPath(); ctx.rect(bx - 2, by - cell * 1.5, cell * 10 + 4, cell * VIS + cell * 1.5 + 4); ctx.clip();
    drawBoard();
    if (mode !== 'countdown') drawPiece();
    drawEffects(t);
    ctx.restore();
    drawHud();
    if (mode === 'countdown') drawCountdown();
    if (mode === 'over') {
      ctx.fillStyle = `rgba(30,0,10,${overFade * 0.55})`;
      ctx.fillRect(bx, by, cell * 10, cell * VIS);
    }
    ctx.restore();
  }

  // ================= 主迴圈 =================
  let last = performance.now();
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(50, ts - last); last = ts;
    input.poll();
    if (mode === 'countdown') {
      countdown -= dt / 1000;
      if (countdown <= 0) { mode = 'playing'; Snd.play('go'); }
    } else if (mode === 'playing') {
      game.update(dt);
    } else if (mode === 'over') {
      overDelay -= dt / 1000;
      if (overDelay <= 0 && !overShown) { overShown = true; finishGame(); }
    }
    updateTheme(dt);
    updateFx(dt);
    render(ts, dt);
  }

  // ================= 設定介面 =================
  const keyName = (code) => ({
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: '空白鍵', ShiftLeft: '左 Shift', ShiftRight: '右 Shift',
    ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  }[code] || code.replace(/^Key/, '').replace(/^Digit/, ''));

  function buildSettings() {
    const body = $('settings-body');
    body.innerHTML = '';
    const mkSlider = (labelText, key, min, max, step, fmt) => {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('label');
      const span = document.createElement('span');
      lab.append(labelText, span);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = settings[key];
      const show = () => { span.textContent = fmt(+inp.value); };
      show();
      inp.addEventListener('input', () => { settings[key] = +inp.value; show(); applySettings(); });
      row.append(lab, inp); body.append(row);
    };
    const mkSeg = (labelText, key, opts) => {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('label'); lab.append(labelText);
      const seg = document.createElement('div'); seg.className = 'seg';
      opts.forEach(([val, text]) => {
        const b = document.createElement('button');
        b.textContent = text; if (settings[key] === val) b.classList.add('on');
        b.addEventListener('click', () => { settings[key] = val; applySettings(); buildSettings(); });
        seg.append(b);
      });
      row.append(lab, seg); body.append(row);
    };
    mkSlider('DAS 長按延遲', 'das', 40, 300, 5, (v) => `${v} ms`);
    mkSlider('ARR 連續移動間隔', 'arr', 0, 80, 1, (v) => (v === 0 ? '瞬間' : `${v} ms`));
    mkSlider('軟降速度', 'sdf', 5, 40, 1, (v) => (v >= 40 ? '瞬間' : `${v}×`));
    mkSlider('音效音量', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    mkSeg('觸控操作', 'controls', [['buttons', '螢幕按鍵'], ['gesture', '手勢'], ['off', '關閉']]);
    mkSeg('震動回饋', 'haptics', [[true, '開'], [false, '關']]);
    mkSeg('落點提示', 'ghost', [[true, '開'], [false, '關']]);
    mkSeg('特效品質', 'fx', [['high', '高'], ['low', '省電']]);

    const h = document.createElement('h3'); h.textContent = '鍵盤按鍵（點擊後按新按鍵）'; h.style.textAlign = 'left';
    body.append(h);
    const list = document.createElement('div'); list.className = 'keys-list';
    ACTIONS.forEach((a) => {
      const name = document.createElement('div'); name.textContent = ACTION_LABEL[a];
      const b = document.createElement('button');
      b.textContent = (settings.keys[a] || []).map(keyName).join(' / ') || '未設定';
      b.addEventListener('click', () => {
        b.textContent = '請按下按鍵…（Esc 取消）';
        input.rebinding = (code) => {
          input.rebinding = null;
          if (code) { settings.keys[a] = [code]; saveSettings(); }
          buildSettings();
        };
      });
      list.append(name, b);
    });
    body.append(list);
    const gp = document.createElement('div'); gp.className = 'gp-status'; gp.id = 'gp-status';
    body.append(gp);
    updateGpStatus();
  }
  function updateGpStatus() {
    const el = $('gp-status'); if (!el) return;
    el.textContent = input.padConnected ? `🎮 已連接手把：${input.padConnected.slice(0, 40)}` : '🎮 未偵測到手把（連接後按任意鍵即可）';
  }
  setInterval(updateGpStatus, 1000);

  function applySettings() {
    saveSettings();
    Snd.setVolume(settings.sfx);
    input.settings = settings;
    if (game) { game.settings.das = settings.das; game.settings.arr = settings.arr; game.settings.sdf = settings.sdf; }
    touchEl.classList.toggle('mode-gesture', settings.controls === 'gesture');
    if (game && mode !== 'menu') touchEl.classList.toggle('hidden', settings.controls === 'off' || mode === 'over');
    initStars();
    layout();
  }

  // ================= 事件綁定 =================
  function ui(fn) { return () => { Snd.resume(); Snd.play('ui'); fn(); }; }
  $('btn-start').addEventListener('click', ui(startGame));
  $('btn-settings').addEventListener('click', ui(() => { settingsReturn = 'menu'; buildSettings(); showOverlay('settings'); }));
  $('btn-pause-settings').addEventListener('click', ui(() => { settingsReturn = 'pause'; buildSettings(); showOverlay('settings'); }));
  $('btn-settings-back').addEventListener('click', ui(() => { input.rebinding = null; showOverlay(settingsReturn); }));
  $('btn-reset-settings').addEventListener('click', ui(() => {
    settings = JSON.parse(JSON.stringify(DEFAULTS)); input.settings = settings; applySettings(); buildSettings();
  }));
  $('btn-help').addEventListener('click', ui(() => showOverlay('help')));
  $('btn-help-back').addEventListener('click', ui(() => showOverlay('menu')));
  $('btn-resume').addEventListener('click', ui(resumeGame));
  $('btn-restart').addEventListener('click', ui(startGame));
  $('btn-quit').addEventListener('click', ui(toMenu));
  $('btn-again').addEventListener('click', ui(startGame));
  $('btn-over-quit').addEventListener('click', ui(toMenu));
  pauseBtn.addEventListener('click', () => { Snd.resume(); pauseGame(); });
  $('btn-fs').addEventListener('click', ui(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});
      }
    } catch (_) { /* 不支援 */ }
  }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (mode === 'playing') pauseGame(); releaseWake(); }
    else if (mode === 'playing' || mode === 'countdown') requestWake();
  });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 100));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ================= 啟動 =================
  Snd.vol = settings.sfx;
  $('best-score').textContent = getBest().toLocaleString();
  initStars();
  layout();
  requestAnimationFrame((ts) => { last = ts; frame(ts); });

  // 供自動測試使用
  window.__lumen = { get game() { return game; }, get mode() { return mode; }, startGame, settings: () => settings };
})();
