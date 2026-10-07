'use strict';
/* 光律方塊 — 介面、渲染、特效、場景、設定 */
(function () {
  const E = window.Engine;
  const Snd = window.LumenAudio;
  const SCENES = window.LumenScenes;
  const { Input, ACTIONS, DEFAULT_KEYS, ACTION_LABEL } = window.LumenInput;
  const { W, H, HIDDEN, VIS, SHAPES } = E;

  // ================= 設定 =================
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const DEFAULTS = {
    das: 130, arr: 20, sdf: 20,
    controls: coarse ? 'buttons' : 'off',
    haptics: true, sfx: 0.7, music: 0.6, ghost: true, fx: 'high', startLevel: 1,
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
  let lastCount = 4;
  let overDelay = 0;
  let overFade = 0;
  let overShown = false;
  let settingsReturn = 'menu';
  let wakeLock = null;
  let audioStarted = false;

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

  // 第一次互動才能啟動音訊（瀏覽器規定）
  function ensureAudio() {
    Snd.resume();
    Snd.setMusicVolume(settings.music);
    Snd.setSfxVolume(settings.sfx);
    if (!audioStarted) {
      audioStarted = true;
      if (mode === 'menu') Snd.playSong(0, 0);
    }
  }
  window.addEventListener('pointerdown', ensureAudio, { capture: true });
  window.addEventListener('keydown', ensureAudio, { capture: true });

  // ================= 主題 / 場景 =================
  const THEMES = [
    { name: '星空', accent: [122, 167, 255], style: 'gem' },
    { name: '深海', accent: [77, 232, 255], style: 'glass' },
    { name: '極光', accent: [109, 255, 176], style: 'glass' },
    { name: '霓虹都市', accent: [255, 93, 230], style: 'neon' },
    { name: '櫻花', accent: [255, 166, 216], style: 'soft' },
    { name: '夕陽雲海', accent: [255, 179, 107], style: 'gem' },
  ];
  let themeIdx = 0;
  const accent = THEMES[0].accent.slice();
  const scenes = [];
  let scene = null;
  let prevScene = null;
  let sceneFade = 1;

  function getScene(i) {
    if (!scenes[i]) {
      scenes[i] = new SCENES[i](settings.fx === 'low');
      scenes[i].resize(vw, vh);
    }
    return scenes[i];
  }
  function setTheme(i, instant) {
    themeIdx = i;
    const next = getScene(i);
    if (next === scene) return;
    if (instant || !scene) { scene = next; prevScene = null; sceneFade = 1; return; }
    prevScene = scene; scene = next; sceneFade = 0;
  }
  function rebuildScenes() {
    scenes.length = 0;
    scene = null; prevScene = null;
    setTheme(themeIdx, true);
  }
  function updateTheme(dt) {
    const k = Math.min(1, dt / 1000 * 1.6);
    const tgt = THEMES[themeIdx].accent;
    for (let i = 0; i < 3; i++) accent[i] += (tgt[i] - accent[i]) * k;
    if (sceneFade < 1) {
      sceneFade = Math.min(1, sceneFade + dt / 2200);
      if (sceneFade >= 1) prevScene = null;
    }
  }
  const rgb = (a, al) => (al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`);

  // ================= 方塊精靈（依主題換材質） =================
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
  function makeSprite(type, c, dpr, style) {
    const pad = Math.ceil(c * 0.45);
    const size = c + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const col = hex(COLORS[type]);
    const inset = Math.max(1, c * 0.045);
    const x = pad + inset, y = pad + inset, s = c - inset * 2;
    const rad = c * 0.2;
    if (style === 'neon') {
      g.shadowColor = rgb(col); g.shadowBlur = c * 0.6;
      g.fillStyle = rgb(mix(col, [5, 0, 20], 0.78));
      rr(g, x, y, s, s, rad); g.fill();
      g.strokeStyle = rgb(mix(col, [255, 255, 255], 0.25)); g.lineWidth = Math.max(1.5, c * 0.09);
      rr(g, x + 1, y + 1, s - 2, s - 2, rad); g.stroke();
      g.shadowBlur = c * 0.3;
      g.fillStyle = rgb(col, 0.85);
      rr(g, pad + c * 0.36, pad + c * 0.36, c * 0.28, c * 0.28, c * 0.06); g.fill();
    } else if (style === 'glass') {
      g.shadowColor = rgb(col, 0.9); g.shadowBlur = c * 0.4;
      g.fillStyle = rgb(col, 0.42);
      rr(g, x, y, s, s, rad); g.fill();
      g.shadowBlur = 0;
      const gr = g.createLinearGradient(x, y, x, y + s);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, rgb(col, 0.25));
      g.fillStyle = gr; rr(g, x, y, s, s, rad); g.fill();
      g.strokeStyle = rgb(mix(col, [255, 255, 255], 0.5), 0.95); g.lineWidth = Math.max(1, c * 0.06);
      rr(g, x + 0.5, y + 0.5, s - 1, s - 1, rad); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.22, s * 0.18, s * 0.08, -0.5, 0, Math.PI * 2); g.fill();
    } else if (style === 'soft') {
      const pc = mix(col, [255, 240, 248], 0.38);
      g.shadowColor = rgb(pc, 0.8); g.shadowBlur = c * 0.35;
      g.fillStyle = rgb(pc);
      rr(g, x, y, s, s, c * 0.3); g.fill();
      g.shadowBlur = 0;
      const gr = g.createRadialGradient(x + s * 0.35, y + s * 0.3, 0, x + s * 0.5, y + s * 0.5, s * 0.75);
      gr.addColorStop(0, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, rgb(mix(col, [120, 40, 90], 0.25), 0.3));
      g.fillStyle = gr; rr(g, x, y, s, s, c * 0.3); g.fill();
    } else {
      g.shadowColor = rgb(col, 0.9); g.shadowBlur = c * 0.5;
      g.fillStyle = rgb(col);
      rr(g, x, y, s, s, rad); g.fill();
      g.shadowBlur = 0;
      const grad = g.createLinearGradient(pad, pad, pad + c, pad + c);
      grad.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.55)));
      grad.addColorStop(0.45, rgb(col));
      grad.addColorStop(1, rgb(mix(col, [0, 0, 30], 0.45)));
      g.fillStyle = grad;
      rr(g, x, y, s, s, rad); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, c * 0.06);
      g.beginPath(); g.moveTo(pad + c * 0.2, pad + c * 0.12); g.lineTo(pad + c * 0.12, pad + c * 0.12); g.lineTo(pad + c * 0.12, pad + c * 0.8); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      rr(g, pad + c * 0.2, pad + c * 0.2, c * 0.6, c * 0.6, c * 0.12); g.fill();
    }
    return { cv, pad, c, size };
  }
  function getSprite(type) {
    const style = THEMES[themeIdx].style;
    const key = `${Math.round(cell * dpr)}`;
    if (key !== spriteKey) { sprites = {}; spriteKey = key; }
    const k = style + type;
    return sprites[k] || (sprites[k] = makeSprite(type, cell, dpr, style));
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
    const pw = vw, ph = vh;
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    portrait = vh > vw * 1.05;
    const buttons = settings.controls === 'buttons';
    if (portrait) {
      const reserve = buttons ? Math.min(Math.max(vh * 0.31, 175), 275) : 12;
      const top = 10;
      cell = Math.floor(Math.min((vw - 14) / 17.2, (vh - reserve - top - 6) / 20));
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
    const lx = bx - gap - sideW;
    pauseBtn.style.left = `${lx}px`;
    pauseBtn.style.top = `${by + cell * 11.6}px`;
    pauseBtn.style.width = `${sideW}px`;
    pauseBtn.style.height = `${cell * 1.7}px`;
    pauseBtn.style.fontSize = `${Math.max(11, cell * 0.55)}px`;
    touchEl.classList.toggle('mode-gesture', settings.controls === 'gesture');
    if (pw !== vw || ph !== vh) for (const s of scenes) if (s) s.resize(vw, vh);
  }
  function boardInfo() { return { x: bx, y: by, w: cell * 10, h: cell * VIS, c: cell, cx: bx + cell * 5, cy: by + cell * 10 }; }

  // ================= 特效 =================
  const fx = { particles: [], flashes: [], rings: [], streaks: [], popups: [], lockFlash: [], shake: 0, pulse: 0 };
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
  const musicStage = () => (game ? Math.min(4, Math.floor((game.lines % 10) / 2)) : 0);
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
        if (n === 0) break;
        Snd.play('clear', d);
        Snd.setStage(musicStage());
        for (const row of d.rows) {
          fx.flashes.push({ y: row.y, t: 0, life: 0.42 });
          for (let x = 0; x < W; x++) {
            const t = ID_TYPE[row.row[x]];
            if (!t) continue;
            const [px, py] = cellPos(x, row.y);
            burst(px + cell / 2, py + cell / 2, COLORS[t], settings.fx === 'low' ? 1 : 3, cell * (n >= 4 ? 14 : 8), 0.7, cell * 8);
          }
        }
        if (scene) scene.burst(Object.assign({}, d, { rows: d.rows.map((r) => ({ vy: r.y - HIDDEN })) }), boardInfo());
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
      case 'levelUp': {
        const idx = (d.level - 1) % THEMES.length;
        if (idx !== themeIdx) {
          setTheme(idx);
          Snd.playSong(idx, 0);
        }
        Snd.play('levelUp');
        popup([`LEVEL ${d.level}`, THEMES[idx].name], '#8be9ff');
        fx.rings.push({ t: 0, life: 1.1 });
        fx.pulse = 1;
        break;
      }
      case 'gameOver':
        Snd.stopMusic(2);
        Snd.play('gameOver');
        mode = 'over'; overDelay = 1.1; overFade = 0; overShown = false;
        input.releaseAll();
        break;
    }
  }
  function popup(lines, color) { fx.popups.push({ lines, color, t: 0, life: 1.5 }); if (fx.popups.length > 3) fx.popups.shift(); }

  // ================= 遊戲流程 =================
  function startGame() {
    ensureAudio();
    input.releaseAll();
    const lv = Math.max(1, Math.min(15, settings.startLevel | 0));
    game = new E.Game({ settings: { das: settings.das, arr: settings.arr, sdf: settings.sdf, startLevel: lv }, onEvent: onGameEvent });
    fx.particles.length = 0; fx.flashes.length = 0; fx.rings.length = 0; fx.streaks.length = 0; fx.popups.length = 0; fx.lockFlash.length = 0;
    fx.shake = 0; fx.pulse = 0; overFade = 0; overShown = false; lastWasHardDrop = false;
    const idx = (lv - 1) % THEMES.length;
    setTheme(idx);
    Snd.setMuffled(false);
    Snd.playSong(idx, 0);
    mode = 'countdown'; countdown = 2.2; lastCount = 4;
    showOverlay(null);
    touchEl.classList.toggle('hidden', settings.controls === 'off');
    requestWake();
  }
  function pauseGame() {
    if (mode !== 'playing') return;
    mode = 'paused'; input.releaseAll(); showOverlay('pause'); Snd.setMuffled(true); Snd.play('ui');
  }
  function resumeGame() {
    if (mode !== 'paused') return;
    mode = 'playing'; showOverlay(null); Snd.setMuffled(false); Snd.play('ui');
  }
  function toMenu() {
    mode = 'menu'; input.releaseAll(); game = null; showOverlay('menu');
    touchEl.classList.add('hidden');
    $('best-score').textContent = getBest().toLocaleString();
    setTheme(0);
    Snd.setMuffled(false);
    if (audioStarted) Snd.playSong(0, 0);
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
  let beat = 0;
  function drawBackground(t) {
    const B = boardInfo();
    if (prevScene && sceneFade < 1) {
      prevScene.draw(ctx, t, beat, B);
      ctx.globalAlpha = sceneFade;
      scene.draw(ctx, t, beat, B);
      ctx.globalAlpha = 1;
    } else if (scene) {
      scene.draw(ctx, t, beat, B);
    }
    // 場地後方光暈（隨節拍呼吸）
    if (!game) return;
    const cx = B.cx, cy = B.cy;
    const rad = cell * (13 + fx.pulse * 5 + beat * 1.5);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, rgb(accent, 0.16 + fx.pulse * 0.25 + beat * 0.06));
    rg.addColorStop(1, rgb(accent, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawWell() {
    const g = ctx;
    const x = bx, y = by, w = cell * 10, h = cell * VIS;
    g.fillStyle = 'rgba(2,4,18,0.74)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 10; i++) { g.moveTo(x + i * cell, y); g.lineTo(x + i * cell, y + h); }
    for (let j = 1; j < VIS; j++) { g.moveTo(x, y + j * cell); g.lineTo(x + w, y + j * cell); }
    g.stroke();
    g.shadowColor = rgb(accent, 0.9); g.shadowBlur = cell * (0.5 + beat * 0.5 + fx.pulse * 0.6);
    g.strokeStyle = rgb(mix(accent, [255, 255, 255], beat * 0.3), 0.7 + beat * 0.3); g.lineWidth = 2;
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
    if (settings.ghost) {
      const gy = game.ghostY();
      const col = hex(COLORS[type]);
      ctx.fillStyle = rgb(col, 0.13); ctx.strokeStyle = rgb(col, 0.65); ctx.lineWidth = 1.5;
      for (const [cx, cy] of SHAPES[type][p.rot]) {
        if (gy + cy < HIDDEN) continue;
        const x = bx + (p.x + cx) * cell, y = by + (gy + cy - HIDDEN) * cell;
        rr(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.18); ctx.fill(); ctx.stroke();
      }
    }
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
    ctx.fillStyle = 'rgba(2,4,18,0.55)';
    rr(ctx, x, y, w, h, cell * 0.3); ctx.fill();
    ctx.strokeStyle = rgb(accent, 0.3); ctx.lineWidth = 1; ctx.stroke();
  }

  function drawHud() {
    const lx = bx - gap - sideW;
    const rx = bx + cell * 10 + gap;
    const dim = 'rgba(200,210,245,0.75)';
    panelBox(lx, by, sideW, cell * 3.2);
    label('HOLD', lx + sideW / 2, by + cell * 0.55, cell * 0.42, dim, 'center');
    if (game.hold) drawPreview(game.hold, lx + sideW / 2, by + cell * 2.05, cell * 0.62, game.canHold ? 1 : 0.35);
    const stats = [['SCORE', game.score.toLocaleString()], ['LEVEL', String(game.level)], ['LINES', String(game.lines)]];
    stats.forEach(([k, v], i) => {
      const y = by + cell * (3.9 + i * 2.5);
      panelBox(lx, y, sideW, cell * 2.1);
      label(k, lx + sideW / 2, y + cell * 0.5, cell * 0.38, dim, 'center');
      fitLabel(v, lx + sideW / 2, y + cell * 1.3, sideW - cell * 0.4, cell * 0.85, '#fff', 'center');
    });
    panelBox(rx, by, sideW, cell * 12.4);
    label('NEXT', rx + sideW / 2, by + cell * 0.55, cell * 0.42, dim, 'center');
    game.next(5).forEach((t, i) => {
      const s = i === 0 ? cell * 0.7 : cell * 0.55;
      const cy = by + cell * (1.9 + (i === 0 ? 0 : 0.5) + i * 2.2);
      drawPreview(t, rx + sideW / 2, cy, s, i === 0 ? 1 : 0.85);
    });
    let y = by + cell * 13;
    if (game.combo > 0) { label(`${game.combo} COMBO`, rx + sideW / 2, y + cell * 0.5, cell * 0.55, '#8be9ff', 'center', 800); y += cell * 1.2; }
    if (game.b2b) label('B2B', rx + sideW / 2, y + cell * 0.5, cell * 0.55, '#ffe98a', 'center', 800);
  }

  function drawEffects() {
    const g = ctx;
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
    for (const s of fx.streaks) {
      const a = 1 - s.t / s.life;
      const [px, py0] = cellPos(s.x, s.y0);
      const py1 = cellPos(s.x, s.y1)[1];
      const gr = g.createLinearGradient(0, py0, 0, py1);
      const c = hex(s.color);
      gr.addColorStop(0, rgb(c, 0)); gr.addColorStop(1, rgb(c, 0.55 * a));
      g.fillStyle = gr; g.fillRect(px + cell * 0.1, py0, cell * 0.8, py1 - py0);
    }
    for (const f of fx.flashes) {
      const k = f.t / f.life;
      const a = (1 - k) * (1 - k);
      const y = by + (f.y - HIDDEN) * cell + cell / 2;
      const hh = cell * (0.6 + k * 1.6);
      const gr = g.createLinearGradient(0, y - hh, 0, y + hh);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(bx - cell * k, y - hh, cell * 10 + cell * 2 * k, hh * 2);
    }
    for (const r of fx.rings) {
      const k = r.t / r.life;
      const cx = bx + cell * 5, cy = by + cell * 10;
      const rad = cell * (r.small ? 4 : 5) + cell * (r.small ? 10 : 22) * k * (2 - k);
      g.strokeStyle = rgb(accent, (1 - k) * 0.9);
      g.lineWidth = cell * (r.small ? 0.25 : 0.7) * (1 - k) + 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, 6.283); g.stroke();
    }
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.max);
      g.fillStyle = rgb(hex(p.color), Math.min(1, a));
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalCompositeOperation = 'source-over';
    for (const pop of fx.popups) {
      const k = pop.t / pop.life;
      const a = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.55) / 0.45);
      const sc = k < 0.12 ? 1.25 - k / 0.12 * 0.25 : 1;
      const cx = bx + cell * 5, cy = by + cell * 7 - k * cell * 1.2;
      pop.lines.forEach((ln, i) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx, cy + (i ? cell * (0.5 + i) : 0));
        ctx.scale(sc, sc);
        ctx.shadowColor = pop.color; ctx.shadowBlur = cell * 0.7;
        label(ln, 0, 0, i === 0 ? cell * 1.15 : cell * 0.7, i === 0 ? pop.color : '#fff', 'center', 800);
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
    ctx.shadowColor = rgb(accent); ctx.shadowBlur = cell;
    label(String(Math.max(1, n)), 0, 0, cell * 4, '#fff', 'center', 800);
    ctx.restore();
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(t);
    if (!game) return;
    ctx.save();
    if (fx.shake > 0.3) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    drawWell();
    ctx.save();
    ctx.beginPath(); ctx.rect(bx - 2, by - cell * 1.5, cell * 10 + 4, cell * VIS + cell * 1.5 + 4); ctx.clip();
    drawBoard();
    if (mode !== 'countdown') drawPiece();
    drawEffects();
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
    const bi = Snd.beatInfo();
    beat = bi.playing ? Math.exp(-bi.phase * 5) * (bi.drums ? 1 : 0.55) : 0;
    updateTheme(dt);
    if (scene) scene.update(dt);
    if (prevScene) prevScene.update(dt);
    updateFx(dt);
    render(ts);
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
        b.addEventListener('click', () => { settings[key] = val; applySettings(key === 'fx'); buildSettings(); });
        seg.append(b);
      });
      row.append(lab, seg); body.append(row);
    };
    mkSlider('DAS 長按延遲', 'das', 40, 300, 5, (v) => `${v} ms`);
    mkSlider('ARR 連續移動間隔', 'arr', 0, 80, 1, (v) => (v === 0 ? '瞬間' : `${v} ms`));
    mkSlider('軟降速度', 'sdf', 5, 40, 1, (v) => (v >= 40 ? '瞬間' : `${v}×`));
    mkSlider('音樂音量', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    mkSlider('音效音量', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    mkSlider('起始等級', 'startLevel', 1, 15, 1, (v) => `${v}（${THEMES[(v - 1) % THEMES.length].name}）`);
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

  function applySettings(fxChanged) {
    saveSettings();
    Snd.setSfxVolume(settings.sfx);
    Snd.setMusicVolume(settings.music);
    input.settings = settings;
    if (game) { game.settings.das = settings.das; game.settings.arr = settings.arr; game.settings.sdf = settings.sdf; }
    touchEl.classList.toggle('mode-gesture', settings.controls === 'gesture');
    if (game && mode !== 'menu') touchEl.classList.toggle('hidden', settings.controls === 'off' || mode === 'over');
    layout();
    if (fxChanged) rebuildScenes();
  }

  // ================= 事件綁定 =================
  function ui(fn) { return () => { ensureAudio(); Snd.play('ui'); fn(); }; }
  $('btn-start').addEventListener('click', ui(startGame));
  $('btn-settings').addEventListener('click', ui(() => { settingsReturn = 'menu'; buildSettings(); showOverlay('settings'); }));
  $('btn-pause-settings').addEventListener('click', ui(() => { settingsReturn = 'pause'; buildSettings(); showOverlay('settings'); }));
  $('btn-settings-back').addEventListener('click', ui(() => { input.rebinding = null; showOverlay(settingsReturn); }));
  $('btn-reset-settings').addEventListener('click', ui(() => {
    settings = JSON.parse(JSON.stringify(DEFAULTS)); input.settings = settings; applySettings(true); buildSettings();
  }));
  $('btn-help').addEventListener('click', ui(() => showOverlay('help')));
  $('btn-help-back').addEventListener('click', ui(() => showOverlay('menu')));
  $('btn-resume').addEventListener('click', ui(resumeGame));
  $('btn-restart').addEventListener('click', ui(startGame));
  $('btn-quit').addEventListener('click', ui(toMenu));
  $('btn-again').addEventListener('click', ui(startGame));
  $('btn-over-quit').addEventListener('click', ui(toMenu));
  pauseBtn.addEventListener('click', () => { ensureAudio(); pauseGame(); });
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
    if (document.hidden) {
      if (mode === 'playing') pauseGame();
      Snd.suspend();
      releaseWake();
    } else {
      if (audioStarted) Snd.resume();
      if (mode === 'playing' || mode === 'countdown' || mode === 'paused') requestWake();
    }
  });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 100));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ================= 啟動 =================
  Snd.musicVol = settings.music;
  Snd.sfxVol = settings.sfx;
  $('best-score').textContent = getBest().toLocaleString();
  layout();
  setTheme(0, true);
  requestAnimationFrame((ts) => { last = ts; frame(ts); });

  // 供自動測試使用
  window.__lumen = {
    get game() { return game; }, get mode() { return mode; }, startGame, settings: () => settings,
    setTheme: (i) => { setTheme(i, true); }, get themeIdx() { return themeIdx; },
  };
})();
