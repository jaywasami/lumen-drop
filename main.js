'use strict';
/* 狗狗哇沙米光律方塊 — 介面、渲染、特效、場景、設定 */
(function () {
  const E = window.Engine;
  const Snd = window.LumenAudio;
  const SCENES = window.LumenScenes;
  const { Input, ACTIONS, DEFAULT_KEYS, ACTION_LABEL } = window.LumenInput;
  const { W, H, HIDDEN, VIS, SHAPES } = E;

  // 版本號：日期 + 當天第幾版（每次發佈更新）
  const VERSION = '2026.10.08-15';

  // ================= 設定 =================
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const DEFAULTS = {
    das: 130, arr: 20, sdf: 20,
    controls: coarse ? 'buttons' : 'off',
    haptics: true, sfx: 0.7, music: 0.6, ghost: true, fx: coarse ? 'balanced' : 'high', showFps: false, startLevel: 1, hdMode: 'release', show180: false, hdGap: 36, btnScale: 1, customPad: null, difficulty: 'relaxed', transitions: true, name: '', vsRounds: 3, stage: -1,
    keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
  };
  let settings = loadSettings();
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('lumen.settings.v1') || '{}');
      const merged = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), s);
      merged.keys = Object.assign({}, DEFAULTS.keys, s.keys || {});
      merged.startLevel = 1; // 起始等級只在本次開啟有效，避免下次還停在高等級
      // 舊版手機預設是「高」：第一次升級到有省電模式的版本時，自動改成省電
      if (!s.fxv) { if (coarse && merged.fx === 'high') merged.fx = 'balanced'; merged.fxv = 1; }
      return merged;
    } catch (_) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function saveSettings() {
    try { localStorage.setItem('lumen.settings.v1', JSON.stringify(Object.assign({}, settings, { startLevel: 1, fxv: 1 }))); } catch (_) { /* ignore */ }
  }
  function getBest() { try { return +localStorage.getItem('lumen.best') || 0; } catch (_) { return 0; } }
  function setBest(v) { try { localStorage.setItem('lumen.best', String(v)); } catch (_) { /* ignore */ } }

  // ================= DOM =================
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  let ctx = canvas.getContext('2d');
  // 場景背景另外畫在一張解析度較低的畫布，再放大貼到主畫布（省電模式）
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d', { alpha: false });
  let sdpr = 1;
  // 特定關卡（球場）即使開省電也用完整畫質；離開後回到原本設定
  let fxBoost = false;
  const fxLevel = () => (fxBoost ? 'high' : settings.fx);
  const powerSave = () => fxLevel() !== 'high';
  const touchEl = $('touch');
  const glCanvas = $('gl');
  let post = null;
  function setupPost() {
    if (fxLevel() === 'low') post = null;
    else if (!post) post = window.LumenPost && window.LumenPost.create(glCanvas);
    if (post) post.setLight(fxLevel() === 'balanced');
    document.body.classList.toggle('post-on', !!post && !post.lightMode);
    document.body.classList.toggle('post-light', !!post && post.lightMode);
  }
  const pauseBtn = $('btn-pause');
  const zoneBtn = $('btn-zone');
  const overlays = ['menu', 'pause', 'gameover', 'help', 'settings', 'versus', 'room', 'vsresult', 'vsquit'].reduce((o, k) => (o[k] = $(k), o), {});
  function showOverlay(name) {
    for (const k in overlays) overlays[k].classList.toggle('hidden', k !== name);
  }

  // ================= 狀態 =================
  let mode = 'menu'; // menu | countdown | playing | transition | paused | over | vsround | vsdone
  let vs = null; // 對戰狀態（單機時為 null）
  let resumeMode = 'playing';
  let tr = null; // 過關過場
  let levelStart = { time: 0, score: 0, lines: 0, maxCombo: 0 };
  const DIFFICULTY = { relaxed: { linesPerLevel: 30, gravityScale: 0.55, reward: 0.6 }, normal: { linesPerLevel: 30, gravityScale: 0.8, reward: 0.7 }, classic: { linesPerLevel: 30, gravityScale: 1, reward: 0.85 } };
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
    getGame: () => (mode === 'playing' && !(vs && vs.quitOpen) ? game : null),
    settings,
    onPause: () => {
      if (vs && vs.kind === 'net') { if (mode === 'playing' || mode === 'countdown' || mode === 'vsround') toggleVsQuit(); return; }
      if (mode === 'playing') pauseGame(); else if (mode === 'paused') resumeGame(); else if (mode === 'menu' && !overlays.menu.classList.contains('hidden')) startGame();
    },
    onRestart: () => { if (vs) return; if (mode === 'playing' || mode === 'paused' || mode === 'over') startGame(); },
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
      if (mode === 'menu') Snd.playSong(THEMES[0].name, 0);
    }
  }
  window.addEventListener('pointerdown', ensureAudio, { capture: true });
  window.addEventListener('keydown', ensureAudio, { capture: true });

  // ================= 主題 / 場景 =================
  const THEMES = [
    { name: '星空', accent: [122, 167, 255], style: 'gem', sub: '在星河之間，靜靜落下' },
    { name: '深海', accent: [77, 232, 255], style: 'glass', sub: '沉入光照不到的地方' },
    { name: '竹林', accent: [150, 225, 140], style: 'porcelain', sub: '風過竹林，一葉知秋', light: true },
    { name: '極光', accent: [109, 255, 176], style: 'glass', sub: '夜空在呼吸' },
    { name: '景福宮', accent: [120, 210, 190], style: 'jade', sub: '宮燈照亮千年的屋簷' },
    { name: '水墨', accent: [214, 72, 58], style: 'porcelain', sub: '山色有無中', light: true },
    { name: '荷塘月色', accent: [255, 170, 205], style: 'jade', sub: '荷塘月色，曲曲折折' },
    { name: '螢火森林', accent: [200, 255, 120], style: 'glass', sub: '森林在夜裡發光' },
    { name: '霓虹都市', accent: [255, 93, 230], style: 'neon', sub: '午夜的城市不睡' },
    { name: '土星環', accent: [255, 200, 140], style: 'gem', sub: '在星環的陰影裡漂流' },
    { name: '敦煌', accent: [240, 180, 90], style: 'gold', sub: '飛天的彩帶穿過千年' },
    { name: '櫻花', accent: [255, 166, 216], style: 'soft', sub: '花落知多少' },
    { name: '韓屋月夜', accent: [255, 196, 110], style: 'gold', sub: '月圓的夜晚，屋瓦上落滿銀杏' },
    { name: '長城', accent: [255, 190, 130], style: 'gold', sub: '萬里長城今猶在' },
    { name: '冰晶洞窟', accent: [150, 230, 255], style: 'glass', sub: '光在冰裡迷了路' },
    { name: '首爾夜光', accent: [255, 110, 210], style: 'neon', sub: '漢江上的彩虹在夜裡跳舞' },
    { name: '楓紅', accent: [255, 120, 60], style: 'porcelain', sub: '停車坐愛楓林晚', light: true },
    { name: '燈節', accent: [255, 170, 60], style: 'gold', sub: '東風夜放花千樹' },
    { name: '雨夜', accent: [120, 180, 255], style: 'neon', sub: '霓虹在雨裡暈開' },
    { name: '仙山', accent: [150, 220, 210], style: 'porcelain', sub: '雲深不知處', light: true },
    { name: '海上風暴', accent: [140, 190, 255], style: 'glass', sub: '風暴中守著一盞燈' },
    { name: '熔岩', accent: [255, 110, 50], style: 'gem', sub: '大地的心跳' },
    { name: '飛龍', accent: [255, 200, 80], style: 'gold', sub: '龍騰九霄' },
    { name: '夕陽雲海', accent: [255, 179, 107], style: 'gem', sub: '雲海盡頭是黃昏' },
    { name: '主場應援', accent: [255, 96, 90], style: 'gem', sub: '全場一起喊出來！', hiFx: true, songs: ['主場應援', '龍光乍現'] },
  ];
  let themeIdx = 0;
  // 有多首歌的關卡：每次進這關就從上次的下一首開始（記在本機，重開遊戲也接著輪），播完一首換下一首
  const songTurn = {};
  function nextSong(i, cont) {
    const th = THEMES[i];
    if (!th.songs) return th.name;
    if (!cont) {
      let first = 0;
      try { first = +(localStorage.getItem('lumen-song-turn-' + th.name) || 0) || 0; } catch (_) { /* ignore */ }
      try { localStorage.setItem('lumen-song-turn-' + th.name, String(first + 1)); } catch (_) { /* ignore */ }
      songTurn[i] = first;
    } else songTurn[i] = (songTurn[i] || 0) + 1;
    return th.songs[songTurn[i] % th.songs.length];
  }
  const accent = THEMES[0].accent.slice();
  const scenes = [];
  let scene = null;
  let prevScene = null;
  let sceneFade = 1;
  let sceneFadeMs = 2200;

  function getScene(i) {
    if (!scenes[i]) {
      scenes[i] = new SCENES[THEMES[i].name](!THEMES[i].hiFx && settings.fx === 'low');
      scenes[i].resize(vw, vh);
    }
    return scenes[i];
  }
  function setTheme(i, instant) {
    themeIdx = i;
    const boost = !!THEMES[i].hiFx && settings.fx !== 'high';
    if (boost !== fxBoost) { fxBoost = boost; if (vw) setSceneRes(); setupPost(); }
    touchEl.classList.toggle('light', !!THEMES[i].light);
    const next = getScene(i);
    if (next === scene) return;
    if (instant || !scene) { scene = next; prevScene = null; sceneFade = 1; return; }
    prevScene = scene; scene = next; sceneFade = 0;
    sceneFadeMs = vs ? 4800 : 2200; // 對戰中場景慢慢轉換，不打斷比賽
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
      sceneFade = Math.min(1, sceneFade + dt / sceneFadeMs);
      if (sceneFade >= 1) prevScene = null;
    }
  }
  const rgb = (a, al) => (al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`);

  // ================= 方塊精靈（依主題換材質） =================
  const COLORS = { I: '#3de9ff', O: '#ffe14d', T: '#c070ff', S: '#5dff8a', Z: '#ff5d6c', J: '#5d8bff', L: '#ffa94d', G: '#7c8494', W: '#e6eeff' };
  const ID_TYPE = ['', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G', 'W']; // 8 = 對戰垃圾行、9 = Zone 累積行
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
    } else if (style === 'porcelain') {
      const pc = mix(col, [245, 240, 228], 0.22);
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = c * 0.2;
      g.fillStyle = rgb(pc);
      rr(g, x, y, s, s, c * 0.16); g.fill();
      g.shadowBlur = 0;
      const gr = g.createRadialGradient(x + s * 0.3, y + s * 0.25, 0, x + s * 0.5, y + s * 0.5, s * 0.8);
      gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, rgb(mix(col, [20, 20, 30], 0.5), 0.35));
      g.fillStyle = gr; rr(g, x, y, s, s, c * 0.16); g.fill();
      g.strokeStyle = 'rgba(20,20,30,0.75)'; g.lineWidth = Math.max(1.2, c * 0.06);
      rr(g, x + 0.5, y + 0.5, s - 1, s - 1, c * 0.16); g.stroke();
    } else if (style === 'jade') {
      const jc = mix(col, [170, 230, 200], 0.18);
      g.shadowColor = rgb(jc, 0.7); g.shadowBlur = c * 0.35;
      const gr0 = g.createLinearGradient(x, y, x + s, y + s);
      gr0.addColorStop(0, rgb(mix(jc, [255, 255, 255], 0.45))); gr0.addColorStop(0.5, rgb(jc)); gr0.addColorStop(1, rgb(mix(jc, [10, 40, 30], 0.45)));
      g.fillStyle = gr0; rr(g, x, y, s, s, c * 0.24); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.ellipse(x + s * 0.5, y + s * 0.5, s * 0.32, s * 0.2, -0.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, c * 0.05);
      rr(g, x + 1, y + 1, s - 2, s - 2, c * 0.22); g.stroke();
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
      if (style === 'gold') {
        g.strokeStyle = 'rgba(255,214,120,0.95)'; g.lineWidth = Math.max(1.2, c * 0.075);
        rr(g, x + 0.5, y + 0.5, s - 1, s - 1, rad); g.stroke();
      }
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
  function setSceneRes() {
    const f = fxLevel();
    sdpr = f === 'high' ? dpr : f === 'low' ? Math.min(dpr, 1) : Math.min(dpr * 0.5, 1.5);
    sceneCanvas.width = Math.round(vw * sdpr); sceneCanvas.height = Math.round(vh * sdpr);
  }
  function layout() {
    const pw = vw, ph = vh;
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    setSceneRes();
    portrait = vh > vw * 1.05;
    const buttons = settings.controls === 'buttons';
    // 螢幕按鍵尺寸（左手區：硬降 / 間隔 / ◀▶ / ▼）
    const bs = Math.max(0.7, Math.min(1.4, +settings.btnScale || 1));
    const rs = Math.round(Math.min(56, Math.max(44, vh * 0.062)) * bs);
    const rb = Math.round(Math.min(100, Math.max(76, vh * 0.108)) * bs);
    touchEl.style.setProperty('--padw', `${Math.round(Math.min(vw * 0.485, Math.min(vw * 0.44, 212) * bs))}px`);
    touchEl.style.setProperty('--bfs', String(bs));
    const hdGap = Math.max(0, (settings.hdGap | 0) - 16); // 扣掉格線間距，讓設定值 = 實際距離
    touchEl.style.setProperty('--rs', rs + 'px');
    touchEl.style.setProperty('--rb', rb + 'px');
    touchEl.style.setProperty('--hdgap', hdGap + 'px');
    const padH = rs * 2 + rb + hdGap + 8 * 3 + 14;
    const gapK = vs ? 0.5 : 0.3; // 對戰時加寬場地左側間隙，放垃圾行量表
    if (portrait) {
      const reserve = buttons ? padH + 12 : 12;
      const top = 10;
      cell = Math.floor(Math.min((vw - 14) / (16.6 + gapK * 2), (vh - reserve - top - 6) / 20));
      const avail = vh - reserve - top;
      by = top + Math.max(0, (avail - cell * 20) * 0.5);
    } else {
      cell = Math.floor(Math.min((vh - 20) / 20, vw / 24));
      by = (vh - cell * 20) / 2;
    }
    sideW = cell * 3.3; gap = cell * gapK;
    const totalW = sideW * 2 + gap * 2 + cell * 10;
    bx = (vw - totalW) / 2 + sideW + gap;
    input.cellPx = cell;
    const lx = bx - gap - sideW;
    pauseBtn.style.left = `${lx}px`;
    pauseBtn.style.top = `${by + cell * (vs ? 16.6 : 11.6)}px`;
    pauseBtn.style.width = `${sideW}px`;
    pauseBtn.style.height = `${cell * 1.7}px`;
    pauseBtn.style.fontSize = `${Math.max(11, cell * 0.55)}px`;
    pauseBtn.textContent = vs && vs.kind === 'net' ? '離開' : '❚❚';
    zoneBtn.style.left = `${lx}px`; zoneBtn.style.top = `${by + cell * 13.7}px`;
    zoneBtn.style.width = `${sideW}px`; zoneBtn.style.height = `${cell * 2.7}px`;
    zoneBtn.classList.toggle('hidden', !!vs);
    touchEl.classList.toggle('mode-gesture', settings.controls === 'gesture');
    touchEl.classList.toggle('show180', !!settings.show180);
    applyCustomPad();
    if (pw !== vw || ph !== vh) for (const s of scenes) if (s) s.resize(vw, vh);
  }
  // ================= 自訂按鍵位置 =================
  const padButtons = () => Array.from(touchEl.querySelectorAll('.b'));
  // customPad 儲存「未乘整體倍率」的左上角與寬高（占視窗比例）；實際顯示再乘上 btnScale，以中心縮放
  const bsNow = () => Math.max(0.7, Math.min(1.4, +settings.btnScale || 1));
  function applyCustomPad() {
    const cp = settings.customPad;
    touchEl.classList.toggle('custom', !!cp);
    const bs = bsNow();
    for (const b of padButtons()) {
      const r = cp && cp[b.dataset.action];
      if (cp) {
        const q = r || { x: 0.42, y: 0.8, w: 64 / vw, h: 56 / vh };
        const w0 = q.w * vw, h0 = q.h * vh, w = w0 * bs, h = h0 * bs;
        const cx = q.x * vw + w0 / 2, cy = q.y * vh + h0 / 2;
        b.style.left = `${Math.max(0, Math.min(vw - w, cx - w / 2))}px`; b.style.top = `${Math.max(0, Math.min(vh - h, cy - h / 2))}px`;
        b.style.width = `${w}px`; b.style.height = `${h}px`;
      } else {
        b.style.left = b.style.top = b.style.width = b.style.height = '';
      }
    }
  }
  function rectToStore(r) {
    const bs = bsNow();
    const w0 = r.width / bs, h0 = r.height / bs;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { x: (cx - w0 / 2) / vw, y: (cy - h0 / 2) / vh, w: w0 / vw, h: h0 / vh };
  }
  function capturePad() {
    const cp = {};
    for (const b of padButtons()) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      cp[b.dataset.action] = rectToStore(r);
    }
    return cp;
  }
  let editSel = null, editReturn = null, editWasHidden = false;
  function openPadEditor() {
    editReturn = settingsReturn;
    showOverlay(null);
    if (settings.controls !== 'buttons') { settings.controls = 'buttons'; layout(); }
    editWasHidden = touchEl.classList.contains('hidden');
    touchEl.classList.remove('hidden');
    if (!settings.customPad) { settings.customPad = capturePad(); applyCustomPad(); }
    touchEl.classList.add('editing');
    input.editing = true;
    $('pad-editor').classList.remove('hidden');
    selectBtn(padButtons().find((b) => b.dataset.action === 'cw') || padButtons()[0]);
  }
  function closePadEditor() {
    if (editSel) editSel.classList.remove('sel');
    editSel = null;
    touchEl.classList.remove('editing');
    input.editing = false;
    $('pad-editor').classList.add('hidden');
    if (editWasHidden) touchEl.classList.add('hidden');
    saveSettings();
    buildSettings();
    showOverlay('settings');
    settingsReturn = editReturn || 'menu';
  }
  function storeBtn(b) {
    settings.customPad[b.dataset.action] = rectToStore(b.getBoundingClientRect());
  }
  function selectBtn(b) {
    if (editSel) editSel.classList.remove('sel');
    editSel = b;
    if (b) { b.classList.add('sel'); syncSizeSliders(); }
    $('pe-sel').textContent = b ? `已選：${b.getAttribute('aria-label') || b.dataset.action}` : '先點選一顆按鍵';
  }
  function syncSizeSliders() {
    if (!editSel) return;
    const r = editSel.getBoundingClientRect();
    $('pe-w').value = Math.round(r.width); $('pe-h').value = Math.round(r.height);
    $('pe-w-v').textContent = `${Math.round(r.width)}px`; $('pe-h-v').textContent = `${Math.round(r.height)}px`;
    $('pe-all').value = Math.round(bsNow() * 100); $('pe-all-v').textContent = `${Math.round(bsNow() * 100)}%`;
  }
  function setSelSize(w, hgt) {
    if (!editSel) return;
    const r = editSel.getBoundingClientRect();
    w = w == null ? r.width : Math.max(36, Math.min(vw * 0.9, w));
    hgt = hgt == null ? r.height : Math.max(32, Math.min(vh * 0.5, hgt));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    editSel.style.width = `${w}px`; editSel.style.height = `${hgt}px`;
    editSel.style.left = `${Math.max(0, Math.min(vw - w, cx - w / 2))}px`;
    editSel.style.top = `${Math.max(0, Math.min(vh - hgt, cy - hgt / 2))}px`;
    storeBtn(editSel);
    syncSizeSliders();
  }
  for (const b of padButtons()) {
    let drag = null;
    b.addEventListener('pointerdown', (e) => {
      if (!input.editing) return;
      e.preventDefault();
      selectBtn(b);
      const r = b.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!input.editing || !drag || drag.id !== e.pointerId) return;
      const r = b.getBoundingClientRect();
      const x = Math.max(0, Math.min(vw - r.width, e.clientX - drag.dx));
      const y = Math.max(0, Math.min(vh - r.height, e.clientY - drag.dy));
      b.style.left = `${x}px`; b.style.top = `${y}px`;
    });
    const end = (e) => { if (!input.editing || !drag || drag.id !== e.pointerId) return; drag = null; storeBtn(b); syncSizeSliders(); };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }
  function resizeSel(k) {
    if (!editSel) return;
    const r = editSel.getBoundingClientRect();
    setSelSize(r.width * k, r.height * k);
  }

  function boardInfo() { return { x: bx, y: by, w: cell * 10, h: cell * VIS, c: cell, cx: bx + cell * 5, cy: by + cell * 10 }; }

  // ================= 特效 =================
  const fx = { missiles: [], particles: [], flashes: [], rings: [], streaks: [], popups: [], lockFlash: [], shards: [], waves: [], shake: 0, pulse: 0, aberr: 0, flash: 0, impact: 0, impactV: 0, rowOff: null, rowT: 1 };
  const maxParticles = () => (fxLevel() === 'low' ? 140 : 480);
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
    for (let i = fx.missiles.length - 1; i >= 0; i--) {
      const m = fx.missiles[i];
      m.t += s;
      if (m.t >= m.life) { burst(m.x1, m.y1, m.color, fxLevel() === 'low' ? 5 : 14, cell * 5, 0.45, 0); fx.missiles.splice(i, 1); }
    }
    for (const arr of [fx.flashes, fx.rings, fx.streaks, fx.popups, fx.lockFlash]) {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += s; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
    }
    fx.shake *= Math.pow(0.0008, s);
    fx.pulse *= Math.pow(0.05, s);
    fx.aberr *= Math.pow(0.02, s);
    fx.flash *= Math.pow(0.004, s);
    // 撞擊彈簧（場地被硬降撞得往下沉再彈回）
    const k = 520, damp = 22;
    fx.impactV += (-k * fx.impact - damp * fx.impactV) * s;
    fx.impact += fx.impactV * s;
    if (fx.rowT < 1) fx.rowT = Math.min(1, fx.rowT + s / 0.2);
    for (let i = fx.shards.length - 1; i >= 0; i--) {
      const p = fx.shards[i];
      p.life -= s; if (p.life <= 0) { fx.shards.splice(i, 1); continue; }
      p.vy += cell * 30 * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
    }
    for (let i = fx.waves.length - 1; i >= 0; i--) { fx.waves[i].t += s; if (fx.waves[i].t >= fx.waves[i].life) fx.waves.splice(i, 1); }
    if (mode === 'over') overFade = Math.min(1, overFade + s * 1.2);
  }

  // ================= 遊戲事件 =================
  let lastWasHardDrop = false;
  // 音樂強度：關內每消 2 行升一階；越後面的關卡起點越高，不會退回安靜
  const musicStage = () => {
    if (!game) return 0;
    // 每關都是一首完整的歌：前奏 → 主歌 → 主歌二 → 副歌 → 副歌二 → 最終副歌（升 Key）
    const lpl = game.settings.linesPerLevel;
    const f = (game.lines % lpl) / lpl;
    let st = 0;
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.87]) if (f >= x) st++;
    return Math.max(st, Math.min(1, Math.floor((game.level - 1) / 4)));
  };
  // 每輪完所有場景，下一輪曲速加快
  const musicRate = () => (game ? 1 + 0.05 * Math.min(3, Math.floor((game.level - 1) / THEMES.length)) : 1);
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
          burst(px + cell / 2, py, COLORS[d.type], fxLevel() === 'low' ? 3 : 7, cell * 6, 0.45, cell * 14);
        }
        fx.shake = Math.max(fx.shake, Math.min(1 + d.dist * 0.2, 5));
        fx.impactV += Math.min(30 + d.dist * 8, 200);
        fx.aberr = Math.max(fx.aberr, Math.min(0.15 + d.dist * 0.03, 0.6));
        break;
      }
      case 'lock': {
        if (!lastWasHardDrop) { Snd.play('lock'); fx.impactV += 18; }
        if (d.lines === 0) Snd.setBoost(0);
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
        intensity = musicStage();
        {
          const lpl = game.settings.linesPerLevel;
          Snd.setBuild(vs ? game.pendingGarbage() >= 4 : lpl - (game.lines % lpl) <= 2);
        }
        Snd.setBoost(d.combo >= 2 ? d.combo : 0);
        levelStart.maxCombo = Math.max(levelStart.maxCombo, d.combo);
        const low = fxLevel() === 'low';
        const cxB = bx + cell * 5;
        for (const row of d.rows) {
          fx.flashes.push({ y: row.y, t: 0, life: 0.42 });
          for (let x = 0; x < W; x++) {
            const t = ID_TYPE[row.row[x]];
            if (!t) continue;
            const [px, py] = cellPos(x, row.y);
            burst(px + cell / 2, py + cell / 2, COLORS[t], low ? 1 : 3, cell * (n >= 4 ? 14 : 8), 0.7, cell * 8);
            // 方塊碎片：整格方塊旋轉著飛散
            if (!low || x % 2 === 0) {
              const dir = (px + cell / 2 - cxB) / (cell * 5);
              const power = n >= 4 ? 1.6 : 1;
              fx.shards.push({
                type: t, x: px + cell / 2, y: py + cell / 2,
                vx: (dir * 9 + (Math.random() - 0.5) * 6) * cell * power,
                vy: -(6 + Math.random() * 8) * cell * power,
                rot: 0, vr: (Math.random() - 0.5) * 14, s: 0.55 + Math.random() * 0.35, life: 0.9, max: 0.9,
              });
            }
          }
        }
        // 上方方塊往下掉的動畫
        const cleared = d.rows.map((r) => r.y).sort((a, b) => b - a);
        const off = new Float32Array(H);
        let cnt = 0, ci = 0;
        for (let oy = H - 1; oy >= 0; oy--) {
          if (ci < cleared.length && cleared[ci] === oy) { cnt++; ci++; continue; }
          if (oy + cnt < H) off[oy + cnt] = -cnt;
        }
        fx.rowOff = off; fx.rowT = 0;
        const midY = (d.rows.reduce((a, r) => a + r.y, 0) / d.rows.length - HIDDEN + 0.5) * cell + by;
        if (n >= 4 || d.tspin || d.pc) {
          fx.waves.push({ x: cxB / vw, y: midY / vh, t: 0, life: 0.85, s: n >= 4 ? 1 : 0.7 });
          fx.aberr = Math.max(fx.aberr, 1.2);
          fx.flash = Math.max(fx.flash, 0.22);
        } else if (n >= 2) {
          fx.waves.push({ x: cxB / vw, y: midY / vh, t: 0, life: 0.6, s: 0.35 });
        }
        if (scene) scene.burst(Object.assign({}, d, { rows: d.rows.map((r) => ({ vy: r.y - HIDDEN })) }), boardInfo());
        const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
        const lines = [];
        if (d.zone) lines.push(zoneName(n), `${n} LINES`);
        else if (d.tspin) lines.push('T-SPIN' + (d.mini ? ' MINI' : '') + (n ? ' ' + names[n] : ''));
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
        const idx = themeFor(d.level);
        Snd.setBuild(false);
        intensity = musicStage();
        Snd.play('levelUp');
        if (vs) {
          // 對戰：沒有過場、沒有減速獎勵，場景與音樂慢慢轉換
          Snd.playSong(nextSong(idx), musicStage(), musicRate());
          setTheme(idx);
          popup([`LEVEL ${d.level}`, THEMES[idx].name], '#8be9ff');
          fx.rings.push({ t: 0, life: 1.1 });
          fx.pulse = Math.max(fx.pulse, 0.6);
          break;
        }
        if (settings.transitions && mode === 'playing') {
          startTransition(idx, d.level);
          break;
        }
        Snd.playSong(nextSong(idx), musicStage(), musicRate());
        setTheme(idx);
        popup([`LEVEL ${d.level}`, '過關獎勵：速度放慢'], '#8be9ff');
        fx.rings.push({ t: 0, life: 1.1 });
        fx.pulse = 1;
        fx.waves.push({ x: (bx + cell * 5) / vw, y: (by + cell * 10) / vh, t: 0, life: 1.2, s: 1.2 });
        fx.flash = Math.max(fx.flash, 0.35);
        break;
      }
      case 'attack': if (vs) vsSendAttack(d.lines); break;
      case 'zoneStart':
        Snd.setZone(true); Snd.play('zoneStart');
        zoneFx.on = 1; zoneFx.crescendo = false;
        popup(['ZONE'], '#e6eeff');
        fx.flash = Math.max(fx.flash, 0.35); fx.pulse = 1;
        fx.waves.push({ x: (bx + cell * 5) / vw, y: (by + cell * 10) / vh, t: 0, life: 1.1, s: 1.2 });
        if (navigator.vibrate && settings.haptics) navigator.vibrate([20, 40, 20]);
        break;
      case 'zoneLine': {
        Snd.play('zoneLine', d);
        zoneFx.hit = 1;
        const yb = by + cell * VIS;
        for (let i = 0; i < 24; i++) addParticle({ x: bx + Math.random() * cell * 10, y: yb - Math.random() * cell * d.total, vx: (Math.random() - 0.5) * cell * 6, vy: -Math.random() * cell * 6, life: 0.8, max: 0.8, size: cell * 0.12, color: '#e6eeff', g: 0 });
        break;
      }
      case 'zoneEnd':
        Snd.setZone(false); zoneFx.crescendo = false;
        if (d.lines) Snd.play('zoneEnd', d);
        break;
      case 'garbageQueued':
        if (!vs) break;
        Snd.play('warn');
        missile(oppBoardCenter(), meterTop(), d.lines, '#ff5d6c', 0.55);
        Snd.setBuild(game.pendingGarbage() >= 4);
        break;
      case 'garbageCancel':
        if (!vs) break;
        popup([`抵銷 ${d.lines}`], '#8be9ff');
        Snd.setBuild(game.pendingGarbage() >= 4);
        break;
      case 'garbage': {
        if (!vs) break;
        Snd.play('garbage');
        Snd.setBuild(game.pendingGarbage() >= 4);
        fx.shake = Math.max(fx.shake, 4 + d.lines * 1.2);
        fx.impactV -= Math.min(60 + d.lines * 20, 220);
        fx.aberr = Math.max(fx.aberr, 0.5);
        for (let i = 0; i < Math.min(d.lines, 8); i++) {
          const [px, py] = cellPos(0, H - 1 - i);
          for (let x = 0; x < W; x += 2) burst(px + x * cell + cell / 2, py + cell / 2, '#ff6b7a', 1, cell * 6, 0.5, cell * 10);
        }
        if (navigator.vibrate && settings.haptics) navigator.vibrate(30);
        break;
      }
      case 'gameOver':
        Snd.setZone(false);
        if (vs) {
          Snd.setBoost(0); Snd.setBuild(false); Snd.play('gameOver');
          input.releaseAll();
          vsLocalDead();
          break;
        }
        Snd.stopMusic(2);
        Snd.setBoost(0);
        Snd.setBuild(false);
        Snd.play('gameOver');
        mode = 'over'; overDelay = 1.1; overFade = 0; overShown = false;
        input.releaseAll();
        break;
    }
  }
  // Zone 結算名稱（沿用 Tetris Effect 的說法）
  function zoneName(n) {
    if (n >= 20) return 'ULTIMATRIS';
    if (n >= 18) return 'PERFECTRIS';
    if (n >= 16) return 'DECAHEXATRIS';
    if (n >= 12) return 'DODECATRIS';
    if (n >= 8) return 'OCTORIS';
    return 'ZONE CLEAR';
  }
  const zoneFx = { on: 0, hit: 0, crescendo: false };
  function popup(lines, color) { fx.popups.push({ lines, color, t: 0, life: 1.5 }); if (fx.popups.length > 3) fx.popups.shift(); }

  // ================= 遊戲流程 =================
  function startGame(opts) {
    const versus = !!(opts && opts.versus);
    if (!versus && vs) cleanupVs();
    ensureAudio();
    input.releaseAll();
    const lv = versus ? 1 : Math.max(1, Math.min(THEMES.length, settings.startLevel | 0));
    if (!versus) newSoloOrder();
    const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.relaxed;
    game = versus
      ? new E.Game({ seed: opts.seed, settings: vsGameSettings(), onEvent: onGameEvent })
      : new E.Game({ settings: { das: settings.das, arr: settings.arr, sdf: settings.sdf, startLevel: lv, linesPerLevel: diff.linesPerLevel, gravityScale: diff.gravityScale, reward: diff.reward, zone: true }, onEvent: onGameEvent });
    levelStart = { time: 0, score: 0, lines: 0, maxCombo: 0 };
    tr = null;
    fx.particles.length = 0; fx.flashes.length = 0; fx.rings.length = 0; fx.streaks.length = 0; fx.popups.length = 0; fx.lockFlash.length = 0;
    fx.shards.length = 0; fx.waves.length = 0; fx.missiles.length = 0; fx.aberr = 0; fx.flash = 0; fx.impact = 0; fx.impactV = 0; fx.rowT = 1;
    fx.shake = 0; fx.pulse = 0; overFade = 0; overShown = false; lastWasHardDrop = false;
    const idx = themeFor(lv);
    setTheme(idx);
    Snd.setMuffled(false);
    Snd.setBoost(0);
    Snd.setBuild(false);
    Snd.setZone(false); zoneFx.on = 0; zoneFx.crescendo = false;
    intensity = musicStage();
    Snd.playSong(nextSong(idx), musicStage(), musicRate());
    mode = 'countdown'; countdown = 2.2; lastCount = 4;
    showOverlay(null);
    touchEl.classList.toggle('hidden', settings.controls === 'off');
    layout();
    requestWake();
  }
  function pauseGame() {
    if (mode !== 'playing' && mode !== 'transition') return;
    resumeMode = mode;
    mode = 'paused'; input.releaseAll(); showOverlay('pause'); Snd.setMuffled(true); Snd.play('ui');
  }
  function resumeGame() {
    if (mode !== 'paused') return;
    mode = resumeMode || 'playing'; showOverlay(null); Snd.setMuffled(false); Snd.play('ui');
  }
  function toMenu() {
    cleanupVs();
    Snd.setZone(false); zoneFx.on = 0;
    mode = 'menu'; input.releaseAll(); game = null; showOverlay('menu');
    layout();
    touchEl.classList.add('hidden');
    $('best-score').textContent = getBest().toLocaleString();
    setTheme(0);
    Snd.setMuffled(false);
    if (audioStarted) Snd.playSong(THEMES[0].name, 0);
    releaseWake();
  }

  // ================= 對戰 =================
  // 電腦對戰：另一個 Engine.Game + LumenBot；連線對戰：LumenNet（PeerJS），房主判定每局勝負。
  // 訊息：hello{name,rounds} round{r,seed,rounds,lpl,gs} atk{n,r} b{s,p,l,a,n} dead{r}
  //       result{r,hostWon,wins,over} rematch ping{ts} pong{ts} bye full
  const ROUND_NAMES = { 1: '一局決勝', 3: '三戰兩勝', 5: '五戰三勝' };
  const CPU_NAMES = { easy: '電腦・簡單', normal: '電腦・普通', hard: '電腦・困難' };
  const myName = () => (settings.name || '').trim().slice(0, 12) || '玩家';
  const needWins = () => Math.ceil((vs ? vs.rounds : 1) / 2);
  const randSeed = () => (Math.random() * 4294967296) >>> 0;
  function vsGameSettings() {
    return { das: settings.das, arr: settings.arr, sdf: settings.sdf, startLevel: 1, linesPerLevel: vs.lpl, gravityScale: vs.gs, reward: 1 };
  }
  function newVs(o) {
    return Object.assign({
      kind: 'cpu', isHost: true, rounds: 3, lpl: 12, gs: 0.55, round: 0, wins: [0, 0], oppName: null, code: null,
      opp: { s: '', p: 0, l: 1, a: 0, n: 0 }, oppGame: null, bot: null, net: null, started: false, matchOver: false,
      decided: false, banner: null, oppDead: false, localDead: false, myReady: false, oppReady: false,
      rtt: 0, lastSnap: 0, lastRecv: 0, lagging: false, quitOpen: false, gone: false, pingTimer: null,
      tot: { atk: 0, lines: 0, pieces: 0, time: 0 },
    }, o);
  }
  const forgetHostRoom = () => { try { sessionStorage.removeItem('lumen.hostRoom'); } catch (_) { /* ignore */ } };
  function cleanupVs() {
    forgetHostRoom();
    if (!vs) return;
    const v = vs;
    vs = null;
    clearInterval(v.pingTimer);
    if (v.net) { try { v.net.send({ t: 'bye' }); } catch (_) { /* ignore */ } setTimeout(() => v.net.close(), 120); }
    Snd.setBuild(false);
    fx.missiles.length = 0;
  }
  function snapshot(g) {
    const b = [];
    for (let y = HIDDEN; y < H; y++) b.push(Array.from(g.board[y]));
    if (g.cur && !g.over) {
      const id = ID_TYPE.indexOf(g.cur.type);
      for (const [x, y] of g.cellsOf(g.cur)) if (y >= HIDDEN && x >= 0 && x < W) b[y - HIDDEN][x] = id;
    }
    return b.map((r) => r.join('')).join('');
  }

  // ---------- 選單 ----------
  function openVersus() {
    cleanupVs();
    $('vs-name').value = settings.name || '';
    $('vs-name').classList.remove('need');
    for (const b of $('vs-rounds').children) b.classList.toggle('on', +b.dataset.v === +settings.vsRounds);
    showOverlay('versus');
  }
  function needName() {
    if ((settings.name || '').trim()) return true;
    const el = $('vs-name');
    el.classList.add('need'); el.placeholder = '請先輸入暱稱'; el.focus();
    return false;
  }
  function roomStatus(text, err) { const el = $('room-status'); el.textContent = text; el.classList.toggle('err', !!err); }
  function updateRoom() {
    if (!vs || vs.kind !== 'net') return;
    $('room-title').textContent = vs.isHost ? '你的房間' : '加入房間';
    $('room-code').textContent = vs.code || '';
    $('room-share').classList.toggle('hidden', !(vs.isHost && vs.code));
    const pl = $('room-players');
    pl.innerHTML = '';
    const row = (name, tag, empty) => {
      const d = document.createElement('div');
      if (empty) { d.className = 'empty'; d.textContent = name; } else { const sp = document.createElement('span'); sp.textContent = tag; d.append(name, sp); }
      pl.append(d);
    };
    row(myName(), vs.isHost ? '你・房主' : '你');
    if (vs.oppName) row(vs.oppName, `${vs.isHost ? '對手' : '房主'}${vs.rtt ? `・延遲 ${Math.round(vs.rtt)} ms` : ''}`);
    else row(vs.isHost ? '等待對手加入…' : '連線中…', '', true);
    $('room-info').textContent = `賽制：${ROUND_NAMES[vs.rounds] || ''}${vs.isHost ? '' : '（房主決定）'}`;
    const st = $('room-start');
    st.classList.toggle('hidden', !vs.isHost);
    st.disabled = !(vs.net && vs.net.connected && vs.oppName);
  }
  function netHandlers(my) {
    return {
      connected: () => {
        if (vs !== my) return;
        my.gone = false; my.lastRecv = performance.now();
        my.net.send({ t: 'hello', name: myName(), rounds: my.isHost ? my.rounds : 0 });
        clearInterval(my.pingTimer);
        my.pingTimer = setInterval(() => { if (my.net && my.net.connected) my.net.send({ t: 'ping', ts: performance.now() }); }, 1000);
        roomStatus(my.isHost ? '對手已加入！按「開始比賽」' : '已連線，等待房主開始比賽…');
        updateRoom();
      },
      data: (m) => { if (vs === my) onNetData(m); },
      closed: () => { if (vs === my) onNetClosed(); },
      error: (msg) => {
        if (vs !== my) return;
        if (mode === 'menu') roomStatus(msg, true);
        else if (mode === 'vsdone') $('vr-note').textContent = msg;
      },
      unstable: () => { if (vs === my) my.lagging = true; },
      revived: () => { if (vs === my && mode === 'menu' && !my.oppName) roomStatus('房間已恢復，等待對手加入…'); },
      retry: (n, why) => {
        if (vs !== my || mode !== 'menu') return;
        roomStatus(why === 'peer-unavailable' ? `還找不到房間，持續嘗試中（第 ${n} 次）…\n請房主回到遊戲的房間畫面` : `連線中，持續嘗試（第 ${n} 次）…`);
      },
    };
  }
  async function createRoom(preferred) {
    if (typeof preferred !== 'string') preferred = null;
    if (!needName()) return;
    cleanupVs();
    const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.relaxed;
    const my = vs = newVs({ kind: 'net', isHost: true, rounds: +settings.vsRounds || 3, lpl: diff.linesPerLevel, gs: diff.gravityScale });
    showOverlay('room'); updateRoom(); roomStatus('正在建立房間…');
    my.net = new window.LumenNet.Net(netHandlers(my));
    try {
      const code = await my.net.host(preferred);
      if (vs !== my) { my.net.close(); return; }
      my.code = code;
      try { sessionStorage.setItem('lumen.hostRoom', JSON.stringify({ code, t: Date.now() })); } catch (_) { /* ignore */ }
      roomStatus('把房號或邀請連結傳給朋友，傳完請回到這個畫面等待');
      updateRoom();
    } catch (e) { if (vs === my) roomStatus((e && e.message) || '建立房間失敗', true); }
  }
  async function joinRoom(code) {
    if (!needName()) return;
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) { $('vs-code').focus(); return; }
    cleanupVs();
    const my = vs = newVs({ kind: 'net', isHost: false, code });
    showOverlay('room'); updateRoom(); roomStatus(`正在連線到房間 ${code}…`);
    my.net = new window.LumenNet.Net(netHandlers(my));
    try {
      await my.net.join(code);
    } catch (e) {
      if (vs !== my) return;
      roomStatus((e && e.message) || '連線失敗', true);
      my.net.close();
    }
  }
  async function shareRoom() {
    if (!vs || !vs.code) return;
    const url = `${location.origin}${location.pathname}?room=${vs.code}`;
    const text = `來跟我玩狗狗哇沙米光律方塊對戰！房號 ${vs.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: '狗狗哇沙米光律方塊', text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); roomStatus('已複製邀請連結'); } catch (_) { roomStatus(url); }
  }
  function startCpu(level) {
    cleanupVs();
    const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.relaxed;
    vs = newVs({ kind: 'cpu', cpuLevel: level, rounds: +settings.vsRounds || 3, oppName: CPU_NAMES[level], lpl: diff.linesPerLevel, gs: diff.gravityScale });
    beginMatch();
  }

  // ---------- 連線訊息 ----------
  function onNetData(m) {
    if (!m || typeof m !== 'object') return;
    vs.lastRecv = performance.now();
    vs.lagging = false;
    switch (m.t) {
      case 'hello':
        vs.oppName = String(m.name || '對手').slice(0, 12);
        if (!vs.isHost && ROUND_NAMES[m.rounds]) vs.rounds = m.rounds;
        updateRoom();
        break;
      case 'round':
        if (vs.isHost) break;
        if (ROUND_NAMES[m.rounds]) vs.rounds = m.rounds;
        vs.lpl = +m.lpl || 12; vs.gs = +m.gs || 0.55;
        if (m.r === 1) { vs.wins = [0, 0]; vs.tot = { atk: 0, lines: 0, pieces: 0, time: 0 }; vs.matchOver = false; vs.myReady = vs.oppReady = false; }
        vs.started = true;
        startRound(m.r, m.seed >>> 0);
        break;
      case 'atk':
        if (m.r === vs.round && game && !game.over && !vs.decided) game.receiveGarbage(Math.min(20, m.n | 0));
        break;
      case 'b':
        if (typeof m.s === 'string') vs.opp = { s: m.s.slice(0, 200), p: m.p | 0, l: m.l | 0, a: m.a | 0, n: m.n | 0 };
        break;
      case 'dead':
        if (vs.isHost && m.r === vs.round) roundDecided(true);
        break;
      case 'result':
        if (vs.isHost || m.r !== vs.round || vs.decided) break;
        vs.decided = true;
        vs.wins = [m.wins[0] | 0, m.wins[1] | 0];
        showRoundEnd(!m.hostWon, !!m.over);
        break;
      case 'rematch':
        vs.oppReady = true;
        updateResultBtn();
        if (vs.isHost && vs.myReady) beginMatch();
        break;
      case 'ping': vs.net.send({ t: 'pong', ts: m.ts }); break;
      case 'pong':
        vs.rtt = vs.rtt ? vs.rtt * 0.7 + (performance.now() - m.ts) * 0.3 : performance.now() - m.ts;
        if (mode === 'menu') updateRoom();
        break;
      case 'full': roomStatus('這個房間已經有兩個人了', true); break;
      case 'bye': onNetClosed(); break;
    }
  }
  function onNetClosed() {
    if (!vs || vs.kind !== 'net' || vs.gone) return;
    vs.gone = true;
    clearInterval(vs.pingTimer);
    if (vs.started && !vs.matchOver && mode !== 'menu') {
      finishMatch(true, `${vs.oppName || '對手'} 已離線，你獲勝`);
    } else if (mode === 'vsdone') {
      $('vr-note').textContent = `${vs.oppName || '對手'} 已離開`;
      updateResultBtn();
    } else {
      vs.oppName = null; vs.rtt = 0;
      if (vs.isHost) roomStatus('對手離開了，等待新的對手加入…');
      else roomStatus('和房主的連線中斷了', true);
      updateRoom();
    }
  }

  // ---------- 比賽流程 ----------
  function beginMatch() {
    forgetHostRoom();
    vs.wins = [0, 0]; vs.tot = { atk: 0, lines: 0, pieces: 0, time: 0 };
    vs.matchOver = false; vs.started = true; vs.myReady = vs.oppReady = false;
    hostStartRound(1);
  }
  function hostStartRound(r) {
    const seed = randSeed();
    if (vs.kind !== 'net') { startRound(r, seed); return; }
    vs.net.send({ t: 'round', r, seed, rounds: vs.rounds, lpl: vs.lpl, gs: vs.gs });
    // 房主晚半個往返時間再開始，讓兩邊倒數大致同步
    const delay = Math.min(250, (vs.rtt || 0) / 2);
    const my = vs;
    if (delay > 5) setTimeout(() => { if (vs === my) startRound(r, seed); }, delay);
    else startRound(r, seed);
  }
  // 對戰場景順序：每局用這局的種子洗牌，兩邊（同種子）看到同一套隨機順序
  function shuffledThemes(seed) {
    let a = (seed ^ 0x5bd1e995) >>> 0;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const order = THEMES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  function startRound(r, seed) {
    vs.themeOrder = shuffledThemes(seed);
    Object.assign(vs, { round: r, seed, decided: false, banner: null, oppDead: false, localDead: false, quitOpen: false, lastRecv: performance.now(), lagging: false });
    vs.opp = { s: '', p: 0, l: 1, a: 0, n: 0 };
    startGame({ versus: true, seed });
    if (vs.kind === 'cpu') {
      vs.oppGame = new E.Game({ seed, settings: Object.assign(vsGameSettings(), { das: 130, arr: 20, sdf: 20 }), onEvent: onCpuEvent });
      vs.bot = new window.LumenBot.Bot(vs.oppGame, vs.cpuLevel);
    }
  }
  function onCpuEvent(type, d) {
    if (!vs || vs.kind !== 'cpu' || !game) return;
    if (type === 'attack') { if (!game.over && !vs.decided) game.receiveGarbage(d.lines); } else if (type === 'gameOver') roundDecided(true);
  }
  function vsSendAttack(n) {
    Snd.play('attack');
    missile([bx + cell * 5, by + cell * 10], oppBoardCenter(), n, '#' + mix(accent, [255, 255, 255], 0.4).map((v) => (v | 0).toString(16).padStart(2, '0')).join(''), 0.5);
    if (vs.kind === 'cpu') { if (vs.oppGame && !vs.oppGame.over) vs.oppGame.receiveGarbage(n); } else vs.net.send({ t: 'atk', n, r: vs.round });
  }
  function vsLocalDead() {
    vs.localDead = true;
    if (vs.kind === 'net') vs.net.send({ t: 'b', s: snapshot(game), p: 0, l: game.level, a: game.attackSent, n: game.lines });
    if (vs.kind === 'cpu' || vs.isHost) roundDecided(false);
    else vs.net.send({ t: 'dead', r: vs.round });
  }
  // 只有房主（或電腦對戰）會呼叫：決定這局勝負並通知對方
  function roundDecided(iWon) {
    if (!vs || vs.decided || mode === 'vsdone') return;
    vs.decided = true;
    vs.wins[iWon ? 0 : 1]++;
    const over = vs.wins[0] >= needWins() || vs.wins[1] >= needWins();
    if (vs.kind === 'net') vs.net.send({ t: 'result', r: vs.round, hostWon: iWon, wins: [vs.wins[1], vs.wins[0]], over });
    showRoundEnd(iWon, over);
  }
  function addTotals() {
    if (!game || vs.counted === vs.round) return;
    vs.counted = vs.round;
    vs.tot.atk += game.attackSent; vs.tot.lines += game.lines; vs.tot.pieces += game.pieces; vs.tot.time += game.time;
  }
  function showRoundEnd(iWon, over) {
    addTotals();
    mode = 'vsround';
    vs.banner = { win: iWon, t: 0, over, next: false };
    vs.oppDead = iWon;
    input.releaseAll();
    Snd.setBuild(false); Snd.setBoost(0);
    if (iWon) {
      Snd.play('win');
      fx.rings.push({ t: 0, life: 1.2 });
      fx.flash = Math.max(fx.flash, 0.3);
      fx.pulse = 1;
      fx.waves.push({ x: (bx + cell * 5) / vw, y: (by + cell * 10) / vh, t: 0, life: 1.2, s: 1 });
    }
  }
  function finishMatch(forcedWin, note) {
    if (!vs) return;
    if (game && vs.counted !== vs.round) addTotals();
    vs.matchOver = true;
    vs.quitOpen = false;
    mode = 'vsdone';
    const win = forcedWin != null ? forcedWin : vs.wins[0] > vs.wins[1];
    const t = $('vr-title');
    t.textContent = win ? '你贏了！' : '你輸了';
    t.className = win ? 'win' : 'lose';
    $('vr-note').textContent = note || `${ROUND_NAMES[vs.rounds]}・對手 ${vs.oppName || ''}`;
    const sc = $('vr-score');
    sc.innerHTML = '';
    const sp = (txt) => { const e = document.createElement('span'); e.textContent = txt; return e; };
    const bb = document.createElement('b'); bb.textContent = `${vs.wins[0]} : ${vs.wins[1]}`;
    sc.append(sp(myName()), bb, sp(vs.oppName || '對手'));
    const secs = vs.tot.time / 1000;
    $('vr-stats').innerHTML = [
      ['送出攻擊', vs.tot.atk], ['消除行數', vs.tot.lines], ['方塊數', vs.tot.pieces], ['每秒方塊', (vs.tot.pieces / Math.max(secs, 1)).toFixed(2)],
    ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    Snd.play(win ? 'win' : 'ui');
    touchEl.classList.add('hidden');
    showOverlay('vsresult');
    updateResultBtn();
    releaseWake();
  }
  function updateResultBtn() {
    if (!vs) return;
    const b = $('vr-again');
    if (vs.kind === 'cpu') { b.disabled = false; b.textContent = '再來一場'; return; }
    const ok = vs.net && vs.net.connected && !vs.gone;
    b.disabled = !ok || vs.myReady;
    b.textContent = !ok ? '對手已離開' : vs.myReady ? '等待對手…' : vs.oppReady ? '再來一場（對手已準備）' : '再來一場';
  }
  function rematch() {
    if (!vs) return;
    if (vs.kind === 'cpu') { beginMatch(); return; }
    if (!vs.net || !vs.net.connected) return;
    vs.myReady = true;
    vs.net.send({ t: 'rematch' });
    updateResultBtn();
    if (vs.isHost && vs.oppReady) beginMatch();
  }
  function toggleVsQuit() {
    if (!vs) return;
    vs.quitOpen = !vs.quitOpen;
    input.releaseAll();
    showOverlay(vs.quitOpen ? 'vsquit' : null);
  }
  function updateVs(dt) {
    if (!vs) return;
    const now = performance.now();
    if (vs.kind === 'cpu' && vs.oppGame) {
      const g = vs.oppGame;
      if (mode === 'playing') { g.update(dt); vs.bot.update(dt); }
      vs.opp = { s: snapshot(g), p: g.pendingGarbage(), l: g.level, a: g.attackSent, n: g.lines };
    }
    if (vs.kind === 'net' && vs.net && vs.net.connected && game && (mode === 'playing' || mode === 'countdown') && !game.over && now - vs.lastSnap > 90) {
      vs.lastSnap = now;
      vs.net.send({ t: 'b', s: snapshot(game), p: game.pendingGarbage(), l: game.level, a: game.attackSent, n: game.lines });
    }
    if (vs.kind === 'net' && vs.started && !vs.matchOver && !vs.gone) {
      const quiet = now - vs.lastRecv;
      if (quiet > 2500) vs.lagging = true;
      if (quiet > 12000) { onNetClosed(); vs && vs.net && vs.net.close(); }
    }
    if (mode === 'vsround' && vs.banner) {
      vs.banner.t += dt / 1000;
      if (vs.banner.t >= 3.2 && !vs.banner.next) {
        vs.banner.next = true;
        if (vs.banner.over) finishMatch();
        else if (vs.kind === 'cpu' || vs.isHost) hostStartRound(vs.round + 1);
      }
    }
  }

  // ---------- 對戰畫面 ----------
  function oppGeom() {
    const x = bx - gap - sideW, y = by + cell * 3.6, w = sideW;
    const mc = (sideW - cell * 0.5) / 10;
    return { x, y, w, h: cell * 1.8 + mc * VIS, mc, ox: x + (w - mc * 10) / 2, oy: y + cell * 0.9 };
  }
  function oppBoardCenter() { const o = oppGeom(); return [o.ox + o.mc * 5, o.oy + o.mc * VIS / 2]; }
  function meterTop() { return [bx - gap / 2, by + cell * VIS - Math.min(VIS, game ? game.pendingGarbage() : 0) * cell]; }
  function missile(from, to, n, color, life) {
    fx.missiles.push({ x0: from[0], y0: from[1], x1: to[0], y1: to[1], n, color, t: 0, life, bend: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25) });
  }
  function drawMissiles() {
    if (!fx.missiles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of fx.missiles) {
      const dx = m.x1 - m.x0, dy = m.y1 - m.y0;
      const cxp = (m.x0 + m.x1) / 2 - dy * m.bend, cyp = (m.y0 + m.y1) / 2 + dx * m.bend;
      const at = (k) => [(1 - k) * (1 - k) * m.x0 + 2 * (1 - k) * k * cxp + k * k * m.x1, (1 - k) * (1 - k) * m.y0 + 2 * (1 - k) * k * cyp + k * k * m.y1];
      const k = ease(m.t / m.life);
      const r = cell * (0.22 + 0.05 * Math.min(m.n, 8));
      const c = hex(m.color);
      for (let i = 10; i >= 0; i--) {
        const kk = Math.max(0, k - i * 0.025);
        const [px, py] = at(kk);
        const a = (1 - i / 11) * 0.8;
        ctx.fillStyle = rgb(c, a);
        ctx.beginPath(); ctx.arc(px, py, r * (1 - i / 14), 0, Math.PI * 2); ctx.fill();
      }
      const [hx, hy] = at(k);
      const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 3);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.3, rgb(c, 0.6)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(hx - r * 3, hy - r * 3, r * 6, r * 6);
    }
    ctx.restore();
  }
  function drawGarbageMeter() {
    const p = game.pendingGarbage();
    const x = bx - gap + cell * 0.08, w = Math.max(3, gap - cell * 0.16 - 2), bot = by + cell * VIS;
    ctx.fillStyle = 'rgba(2,4,18,0.6)';
    ctx.fillRect(x, by, w, cell * VIS);
    if (p <= 0) return;
    const hh = Math.min(VIS, p) * cell;
    const blink = p >= 6 ? 0.65 + 0.35 * Math.sin(performance.now() / 70) : 1;
    ctx.save();
    ctx.shadowColor = '#ff3050'; ctx.shadowBlur = cell * 0.6;
    const gr = ctx.createLinearGradient(0, bot - hh, 0, bot);
    gr.addColorStop(0, `rgba(255,120,120,${blink})`); gr.addColorStop(1, `rgba(255,40,70,${blink})`);
    ctx.fillStyle = gr;
    ctx.fillRect(x, bot - hh, w, hh);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < Math.min(VIS, p); i++) ctx.fillRect(x, bot - i * cell, w, 1);
  }
  function drawVsHud(lx, rx) {
    const dim = 'rgba(200,210,245,0.75)';
    const o = oppGeom();
    panelBox(o.x, o.y, o.w, o.h);
    fitLabel(vs.oppName || '對手', o.x + o.w / 2, o.y + cell * 0.46, o.w - cell * 0.3, cell * 0.42, '#ffb3c0', 'center');
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(o.ox, o.oy, o.mc * 10, o.mc * VIS);
    const str = vs.opp.s || '';
    for (let i = 0; i < str.length && i < W * VIS; i++) {
      const id = str.charCodeAt(i) - 48;
      if (id <= 0 || id > 8) continue;
      ctx.fillStyle = COLORS[ID_TYPE[id]];
      ctx.fillRect(o.ox + (i % W) * o.mc + 0.5, o.oy + ((i / W) | 0) * o.mc + 0.5, o.mc - 1, o.mc - 1);
    }
    ctx.strokeStyle = 'rgba(255,180,200,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(o.ox - 0.5, o.oy - 0.5, o.mc * 10 + 1, o.mc * VIS + 1);
    if (vs.opp.p > 0) {
      const hh = Math.min(VIS, vs.opp.p) * o.mc;
      ctx.fillStyle = '#ff4060';
      ctx.fillRect(o.ox - Math.max(2, cell * 0.12), o.oy + o.mc * VIS - hh, Math.max(2, cell * 0.09), hh);
    }
    if (vs.oppDead) {
      ctx.fillStyle = 'rgba(20,0,10,0.6)'; ctx.fillRect(o.ox, o.oy, o.mc * 10, o.mc * VIS);
      label('KO', o.ox + o.mc * 5, o.oy + o.mc * VIS / 2, cell * 0.9, '#ff6b7a', 'center', 900);
    } else if (vs.lagging && vs.kind === 'net') {
      label('連線不穩…', o.ox + o.mc * 5, o.oy + o.mc * VIS / 2, cell * 0.36, '#ffd27a', 'center', 700);
    }
    label(`LV ${vs.opp.l || 1}・${vs.opp.n || 0} 行`, o.x + o.w / 2, o.y + o.h - cell * 0.45, cell * 0.34, dim, 'center');
    [['LEVEL', String(game.level)], ['LINES', String(game.lines)]].forEach(([k, v], i) => {
      const y = by + cell * (11.5 + i * 2.5);
      panelBox(lx, y, sideW, cell * 2.1);
      label(k, lx + sideW / 2, y + cell * 0.5, cell * 0.38, dim, 'center');
      fitLabel(v, lx + sideW / 2, y + cell * 1.3, sideW - cell * 0.4, cell * 0.85, '#fff', 'center');
    });
    const sy = by + cell * 15;
    panelBox(rx, sy, sideW, cell * 5);
    label(vs.rounds > 1 ? `第 ${vs.round} 局` : '一局決勝', rx + sideW / 2, sy + cell * 0.5, cell * 0.36, dim, 'center');
    fitLabel(myName(), rx + sideW / 2, sy + cell * 1.35, sideW - cell * 0.3, cell * 0.4, '#8be9ff', 'center');
    label(`${vs.wins[0]} : ${vs.wins[1]}`, rx + sideW / 2, sy + cell * 2.45, cell * 0.95, '#fff', 'center', 800);
    fitLabel(vs.oppName || '對手', rx + sideW / 2, sy + cell * 3.55, sideW - cell * 0.3, cell * 0.4, '#ffb3c0', 'center');
    label(`攻擊 ${game.attackSent}`, rx + sideW / 2, sy + cell * 4.45, cell * 0.34, dim, 'center');
  }
  function drawRoundBanner() {
    const b = vs.banner;
    const k = Math.min(1, b.t / 0.4);
    ctx.fillStyle = `rgba(0,0,10,${0.55 * k})`;
    ctx.fillRect(bx, by, cell * 10, cell * VIS);
    const cx = bx + cell * 5, cy = by + cell * 7.5;
    label(vs.rounds > 1 ? `第 ${vs.round} 局` : '一局決勝', cx, cy - cell * 2.3, cell * 0.6, 'rgba(220,228,255,0.9)', 'center', 700);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(cx, cy);
    const sc = 1.5 - 0.5 * ease(b.t / 0.5);
    ctx.scale(sc, sc);
    ctx.shadowColor = b.win ? '#ffd860' : '#6f86ff'; ctx.shadowBlur = cell * 1.2;
    label(b.win ? '勝利' : '落敗', 0, 0, cell * 2.2, b.win ? '#ffe98a' : '#b5c2ff', 'center', 900);
    ctx.restore();
    const nw = needWins();
    const rows = [[myName(), vs.wins[0], '#8be9ff'], [vs.oppName || '對手', vs.wins[1], '#ffb3c0']];
    rows.forEach(([name, w, col], i) => {
      const y = cy + cell * (2.6 + i * 1.3);
      fitLabel(name, bx + cell * 4.6, y, cell * 4, cell * 0.5, col, 'right');
      for (let j = 0; j < nw; j++) {
        const dx = bx + cell * (5.4 + j * 0.9);
        ctx.beginPath(); ctx.arc(dx, y, cell * 0.28, 0, Math.PI * 2);
        if (j < w) { ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = cell * 0.5; ctx.fill(); ctx.shadowBlur = 0; } else { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    });
    const msg = b.over ? '比賽結束' : (b.t > 3.2 && vs.kind === 'net' && !vs.isHost ? '等待房主…' : '下一局即將開始');
    label(msg, cx, cy + cell * 5.6, cell * 0.5, 'rgba(220,228,255,0.85)', 'center', 600);
  }

  // 單機：每局隨機洗牌場景順序，而且第一關不會和上一局一樣
  let soloOrder = null, lastFirstTheme = -1;
  function newSoloOrder() {
    soloOrder = shuffledThemes((Math.random() * 4294967296) >>> 0);
    if (soloOrder[0] === lastFirstTheme) [soloOrder[0], soloOrder[1]] = [soloOrder[1], soloOrder[0]];
    lastFirstTheme = soloOrder[0];
  }
  function themeFor(level) {
    // 單人模式可在設定裡指定關卡：整局都在那個場景
    if (!vs && settings.stage >= 0 && settings.stage < THEMES.length) return settings.stage | 0;
    const i = (level - 1) % THEMES.length;
    const order = vs ? vs.themeOrder : soloOrder;
    return order ? order[i] : i;
  }

  // ================= 過關過場 =================
  // 時間軸（秒）：0 光帶掃過＋LEVEL CLEAR 逐字飛入 → 0.6 成績 → 1.6 超空間隧道 → 2.7 白光抵達、
  // 新場景光圈擴散 → 3.1 場景名逐字浮現、光芒旋轉、副標打字 → 5.0 READY → 5.45 GO! → 5.9 結束
  const TR_LEN = 5.9, TR_WARP = 1.6, TR_ARRIVE = 2.7, TR_IRIS = 1.1;
  function startTransition(toIdx, level) {
    const secs = (game.time - levelStart.time) / 1000;
    tr = {
      t: 0, to: toIdx, level, switched: false, warped: false, ready: false, go: false, prev: null, streaks: [],
      lines: game.lines - levelStart.lines, score: game.score - levelStart.score,
      time: `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`, combo: levelStart.maxCombo,
    };
    mode = 'transition';
    fx.popups.length = 0;
    input.releaseAll();
    // 場地四周噴出彩光
    for (let i = 0; i < (fxLevel() === 'low' ? 30 : 90); i++) {
      const side = i % 4;
      const x = side < 2 ? bx + Math.random() * cell * 10 : side === 2 ? bx : bx + cell * 10;
      const y = side === 0 ? by : side === 1 ? by + cell * VIS : by + Math.random() * cell * VIS;
      const a = Math.atan2(y - (by + cell * 10), x - (bx + cell * 5)) + (Math.random() - 0.5) * 0.8;
      const sp = cell * (6 + Math.random() * 10);
      addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, size: cell * (0.1 + Math.random() * 0.15), color: Object.values(COLORS)[i % 7], g: 0 });
    }
  }
  function updateTransition(dt) {
    const s = dt / 1000;
    tr.t += s;
    const t = tr.t;
    if (!tr.warped && t >= TR_WARP) { tr.warped = true; Snd.play('warp'); }
    // 超空間光束：越接近抵達越密、越快
    if (t >= TR_WARP && t < TR_ARRIVE + 0.2) {
      const k = Math.min(1, (t - TR_WARP) / (TR_ARRIVE - TR_WARP));
      const n = Math.floor((fxLevel() === 'low' ? 60 : 160) * k * s * 10);
      for (let i = 0; i < n; i++) tr.streaks.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.15, v: 0.6 + Math.random() * 1.2, w: 0.5 + Math.random() * 1.8, hue: Math.random() });
      fx.aberr = Math.max(fx.aberr, 0.6 + k * 1.6);
    }
    for (const st of tr.streaks) st.r += st.v * s * (1 + st.r * 4);
    tr.streaks = tr.streaks.filter((st) => st.r < 1.6);
    if (!tr.switched && t >= TR_ARRIVE) {
      tr.switched = true;
      tr.prev = scene;
      setTheme(tr.to, true);
      Snd.playSong(nextSong(tr.to), musicStage(), musicRate());
      Snd.play('arrive');
      fx.flash = 1;
      fx.pulse = 1;
      fx.shake = Math.max(fx.shake, 10);
      fx.waves.push({ x: (bx + cell * 5) / vw, y: (by + cell * 10) / vh, t: 0, life: 1.6, s: 1.6 });
      fx.rings.push({ t: 0, life: 1.3 });
    }
    if (tr.prev && t > TR_ARRIVE + TR_IRIS) tr.prev = null;
    if (!tr.ready && t >= 5.0) { tr.ready = true; Snd.play('count'); }
    if (!tr.go && t >= 5.45) { tr.go = true; Snd.play('goShout'); }
    if (t >= TR_LEN) {
      mode = 'playing';
      levelStart = { time: game.time, score: game.score, lines: game.lines, maxCombo: 0 };
      tr = null;
      popup(['BONUS TIME', '過關獎勵：速度放慢'], '#8be9ff');
    }
  }
  const SERIF = '"Noto Serif TC", "Songti TC", "Source Han Serif TC", "PMingLiU", serif';
  const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  const fade = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  // 逐字飛入：每個字從放大、透明縮回原位
  function letters(text, cx, cy, size, font, color, t, t0, stagger, glowCol) {
    ctx.font = font.replace('{s}', size);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const sp = size * 0.06;
    const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
    let x = cx - total / 2;
    chars.forEach((c, i) => {
      const k = ease((t - t0 - i * stagger) / 0.35);
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha *= k;
        ctx.translate(x + widths[i] / 2, cy - (1 - k) * size * 0.4);
        const sc = 1 + (1 - k) * 1.2;
        ctx.scale(sc, sc);
        ctx.shadowColor = glowCol; ctx.shadowBlur = size * (0.4 + (1 - k));
        ctx.fillStyle = color;
        ctx.fillText(c, -widths[i] / 2, 0);
        ctx.restore();
      }
      x += widths[i] + sp;
    });
  }
  function drawTransition() {
    const t = tr.t;
    const cx = bx + cell * 5, cy = by + cell * 8.5;
    const W = cell * 10, Hh = cell * VIS;
    // 背景壓暗：超空間時最暗
    const dim = Math.min(1, t / 0.3) * Math.min(1, (TR_LEN - t) / 0.5) * (t < TR_WARP ? 0.5 : t < TR_ARRIVE ? 0.5 + 0.4 * fade(TR_WARP, TR_ARRIVE, t) : 0.45);
    ctx.fillStyle = `rgba(0,0,8,${dim})`;
    ctx.fillRect(0, 0, vw, vh);
    // 1. 光帶掃過場地
    if (t < 0.9) {
      const k = t / 0.9;
      ctx.save();
      ctx.beginPath(); ctx.rect(bx, by, W, Hh); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const y = by + Hh * (1.2 - k * 1.6);
      const gr = ctx.createLinearGradient(0, y - cell * 3, 0, y + cell * 3);
      gr.addColorStop(0, rgb(accent, 0)); gr.addColorStop(0.5, `rgba(255,255,255,${0.55 * (1 - k * 0.5)})`); gr.addColorStop(1, rgb(accent, 0));
      ctx.fillStyle = gr; ctx.fillRect(bx, y - cell * 3, W, cell * 6);
      ctx.restore();
    }
    // 2. LEVEL CLEAR 逐字＋成績
    const a1 = 1 - fade(TR_WARP, TR_WARP + 0.25, t);
    if (a1 > 0 && t > 0.1) {
      ctx.save(); ctx.globalAlpha = a1;
      letters(`LEVEL ${tr.level - 1} CLEAR`, cx, cy - cell * 1.4, cell * 1.1, '800 {s}px system-ui, sans-serif', '#fff', t, 0.12, 0.035, rgb(accent));
      const a2 = fade(0.6, 0.9, t);
      if (a2 > 0) {
        ctx.globalAlpha = a1 * a2;
        const rows = [[`消除 ${tr.lines} 行`, `+${tr.score.toLocaleString()} 分`], [`用時 ${tr.time}`, `最大連擊 ${Math.max(0, tr.combo)}`]];
        rows.forEach(([l, r], i) => {
          const yy = cy + cell * (0.4 + i * 1.1) + (1 - ease(a2)) * cell * 0.6;
          label(l, cx - cell * 0.4, yy, cell * 0.62, 'rgba(220,228,255,0.95)', 'right', 600);
          label(r, cx + cell * 0.4, yy, cell * 0.62, 'rgba(220,228,255,0.95)', 'left', 600);
        });
      }
      ctx.restore();
    }
    // 3. 超空間光束
    if (tr.streaks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.hypot(vw, vh) * 0.6;
      const scx = bx + cell * 5, scy = by + cell * 10;
      ctx.lineCap = 'round';
      for (const st of tr.streaks) {
        const r0 = st.r * R, r1 = (st.r + 0.05 + st.r * 0.25) * R;
        const col = st.hue < 0.6 ? `rgba(255,255,255,${Math.min(1, st.r * 2.5)})` : rgb(mix(accent, [255, 255, 255], 0.3), Math.min(1, st.r * 2.5));
        ctx.strokeStyle = col; ctx.lineWidth = st.w * (0.5 + st.r * 2);
        ctx.beginPath();
        ctx.moveTo(scx + Math.cos(st.a) * r0, scy + Math.sin(st.a) * r0);
        ctx.lineTo(scx + Math.cos(st.a) * r1, scy + Math.sin(st.a) * r1);
        ctx.stroke();
      }
      // 中心光核
      const k = fade(TR_WARP, TR_ARRIVE, t) * (1 - fade(TR_ARRIVE, TR_ARRIVE + 0.4, t));
      if (k > 0) {
        const rg = ctx.createRadialGradient(scx, scy, 0, scx, scy, cell * (2 + k * 6));
        rg.addColorStop(0, `rgba(255,255,255,${k})`); rg.addColorStop(0.4, rgb(accent, k * 0.6)); rg.addColorStop(1, rgb(accent, 0));
        ctx.fillStyle = rg; ctx.fillRect(0, 0, vw, vh);
      }
      ctx.restore();
    }
    // 4. 光圈邊緣的光環
    if (t >= TR_ARRIVE && t < TR_ARRIVE + TR_IRIS) {
      const k = ease((t - TR_ARRIVE) / TR_IRIS);
      const r = k * Math.hypot(vw, vh);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = cell * 0.5 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(bx + cell * 5, by + cell * 10, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // 5. 新場景標題：旋轉光芒、逐字浮現、副標打字
    const a3 = fade(3.0, 3.3, t) * (1 - fade(4.85, 5.05, t));
    if (a3 > 0) {
      const th = THEMES[tr.to];
      const ty = cy - cell * 0.5;
      ctx.save();
      ctx.globalAlpha = a3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, ty);
      ctx.rotate(t * 0.25);
      for (let i = 0; i < 14; i++) {
        ctx.rotate(Math.PI * 2 / 14);
        const gr = ctx.createLinearGradient(0, 0, cell * 9, 0);
        gr.addColorStop(0, rgb(accent, 0.28)); gr.addColorStop(1, rgb(accent, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cell * 9, -cell * 0.5); ctx.lineTo(cell * 9, cell * 0.5); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = a3;
      label(`STAGE ${tr.level}`, cx, cy - cell * 2.7, cell * 0.55, rgb(accent), 'center', 700);
      const size = th.name.length > 3 ? cell * 1.6 : th.name.length > 2 ? cell * 1.9 : cell * 2.5;
      letters(th.name, cx, ty, size, `700 {s}px ${SERIF}`, '#fff', t, 3.1, 0.13, rgb(accent));
      const lw = cell * 8 * ease((t - 3.4) / 0.6);
      if (lw > 0) {
        const gr = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
        gr.addColorStop(0, rgb(accent, 0)); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, rgb(accent, 0));
        ctx.fillStyle = gr; ctx.fillRect(cx - lw / 2, ty + size * 0.75, lw, 2);
      }
      const nChars = Math.max(0, Math.floor((t - 3.7) / 0.07));
      if (nChars > 0) {
        const sub = [...th.sub].slice(0, nChars).join('');
        ctx.font = `500 ${cell * 0.68}px ${SERIF}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = rgb(accent); ctx.shadowBlur = cell * 0.4;
        ctx.fillStyle = 'rgba(240,242,255,0.95)';
        ctx.fillText(sub, cx, ty + size * 0.75 + cell * 1.1);
      }
      ctx.restore();
    }
    // 6. READY → GO!
    if (t >= 5.0 && t < TR_LEN) {
      const isGo = t >= 5.45;
      const k = isGo ? (t - 5.45) / (TR_LEN - 5.45) : (t - 5.0) / 0.45;
      ctx.save();
      ctx.globalAlpha = isGo ? 1 - k * k : Math.min(1, k * 3);
      const sc = isGo ? 1 + k * 0.8 : 1.3 - ease(k) * 0.3;
      ctx.translate(cx, cy); ctx.scale(sc, sc);
      ctx.shadowColor = rgb(accent); ctx.shadowBlur = cell * 1.2;
      label(isGo ? 'GO!' : 'READY', 0, 0, cell * (isGo ? 2 : 1.4), isGo ? '#fff6c0' : '#fff', 'center', 900);
      ctx.restore();
    }
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
  let fftLast = 0, fftBass = 0, beatSmooth = 0;
  let intensity = 0;
  function drawBackground(t) {
    const B = boardInfo();
    if (tr && tr.prev && tr.t >= TR_ARRIVE) {
      tr.prev.draw(ctx, t, beat, B);
      const r = ease((tr.t - TR_ARRIVE) / TR_IRIS) * Math.hypot(vw, vh);
      ctx.save();
      ctx.beginPath(); ctx.arc(B.cx, B.cy, Math.max(1, r), 0, Math.PI * 2); ctx.clip();
      scene.draw(ctx, t, beat, B);
      ctx.restore();
    } else if (prevScene && sceneFade < 1) {
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
    const anim = fx.rowT < 1 && fx.rowOff;
    const ease = anim ? 1 - fx.rowT * fx.rowT : 0;
    for (let y = HIDDEN; y < H; y++) {
      const row = b[y];
      const dy = anim ? fx.rowOff[y] * ease : 0;
      for (let x = 0; x < W; x++) {
        const id = row[x];
        if (id) drawCell(ID_TYPE[id], bx + x * cell, by + (y - HIDDEN + dy) * cell, cell);
      }
    }
    // 方塊隨低音呼吸：再疊一層加亮（省電以上才有）
    if (fxLevel() !== 'low' && beat > 0.06) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = beat * 0.22;
      for (let y = HIDDEN; y < H; y++) {
        const row = b[y];
        for (let x = 0; x < W; x++) if (row[x] && row[x] !== 9) drawCell(ID_TYPE[row[x]], bx + x * cell, by + (y - HIDDEN) * cell, cell);
      }
      ctx.restore();
    }
    // Zone 累積行：白光脈動
    if (game.zoneRows) {
      const k = 0.35 + 0.25 * Math.sin(performance.now() / 180) + zoneFx.hit * 0.4;
      const top = by + (VIS - game.zoneRows) * cell;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, top, 0, by + cell * VIS);
      gr.addColorStop(0, `rgba(220,235,255,${k * 0.5})`); gr.addColorStop(1, `rgba(160,200,255,${k * 0.2})`);
      ctx.fillStyle = gr; ctx.fillRect(bx, top, cell * 10, game.zoneRows * cell);
      ctx.restore();
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
    const stats = vs ? [] : [['SCORE', game.score.toLocaleString()], ['LEVEL', String(game.level)], ['LINES', String(game.lines)]];
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
    if (vs) drawVsHud(lx, rx);
    else drawZoneMeter(lx);
  }
  function drawZoneMeter(lx) {
    const y = by + cell * 13.7, h = cell * 2.7;
    const z = game.zone, m = z ? Math.max(0, z.t / z.max) : game.zoneMeter;
    const ready = !z && m >= 0.25;
    panelBox(lx, y, sideW, h);
    const cx = lx + sideW / 2, cy = y + h * 0.56, r = Math.min(sideW, h) * 0.3;
    ctx.lineWidth = cell * 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = z ? '#e6eeff' : ready ? rgb(mix(accent, [255, 255, 255], 0.5)) : rgb(accent, 0.7);
    if (ready || z) { ctx.shadowColor = '#fff'; ctx.shadowBlur = cell * (0.4 + 0.3 * Math.sin(performance.now() / 200)); }
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * m); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
    for (let q = 0; q < 4; q++) { const a = -Math.PI / 2 + q * Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - cell * 0.13), cy + Math.sin(a) * (r - cell * 0.13)); ctx.lineTo(cx + Math.cos(a) * (r + cell * 0.13), cy + Math.sin(a) * (r + cell * 0.13)); ctx.stroke(); }
    label('ZONE', lx + sideW / 2, y + cell * 0.42, cell * 0.36, z || ready ? '#fff' : 'rgba(200,210,245,0.75)', 'center', 700);
    if (z) label(String(game.zoneRows), cx, cy, cell * 0.55, '#fff', 'center', 800);
    else if (ready) label('發動', cx, cy, cell * 0.36, '#fff', 'center', 700);
    zoneBtn.classList.toggle('ready', ready);
  }
  const TAU = Math.PI * 2;
  function drawZoneOverlay() {
    const z = game.zone;
    const k = zoneFx.on;
    if (k <= 0.01) return;
    // 時間停止：整個畫面偏藍變暗，場地四周白光
    ctx.fillStyle = `rgba(6,10,30,${0.45 * k})`;
    ctx.fillRect(0, 0, vw, vh);
    if (z) {
      const m = Math.max(0, z.t / z.max);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by - cell * 0.45, cell * 10, cell * 0.18);
      ctx.fillStyle = m < 0.15 ? '#ffd27a' : '#e6eeff'; ctx.fillRect(bx, by - cell * 0.45, cell * 10 * m, cell * 0.18);
    }
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
    for (const p of fx.shards) {
      const a = Math.min(1, p.life / p.max * 1.6);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const sz = cell * p.s;
      drawCell(p.type, -sz / 2, -sz / 2, sz, a);
      ctx.restore();
    }
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
    if (sdpr < dpr) {
      // 場景畫在低解析度畫布上再放大（場景本來就是柔和的漸層，肉眼幾乎看不出差別）
      const main = ctx;
      ctx = sceneCtx;
      ctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
      drawBackground(t);
      ctx = main;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sceneCanvas, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(t);
    }
    if (settings.showFps) drawFps();
    if (!game) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawZoneOverlay();
    ctx.save();
    if (fx.shake > 0.3) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    ctx.save();
    ctx.translate(0, Math.max(-cell * 0.25, Math.min(cell * 0.45, fx.impact)));
    drawWell();
    ctx.save();
    ctx.beginPath(); ctx.rect(bx - 2, by - cell * 1.5, cell * 10 + 4, cell * VIS + cell * 1.5 + 4); ctx.clip();
    drawBoard();
    if (mode !== 'countdown') drawPiece();
    ctx.restore();
    ctx.restore();
    drawEffects();
    if (scene && scene.drawFront) scene.drawFront(ctx, t);
    drawHud();
    if (vs) { drawGarbageMeter(); drawMissiles(); }
    if (mode === 'countdown') drawCountdown();
    if (vs && mode === 'vsround' && vs.banner) drawRoundBanner();
    if (tr && (mode === 'transition' || mode === 'paused')) drawTransition();
    if (mode === 'over') {
      ctx.fillStyle = `rgba(30,0,10,${overFade * 0.55})`;
      ctx.fillRect(bx, by, cell * 10, cell * VIS);
    }
    ctx.restore();
  }

  // ================= 主迴圈 =================
  let last = performance.now();
  // 幀率計：每秒更新一次，顯示畫面幀數與每幀運算時間
  const fpsStat = { n: 0, acc: 0, work: 0, fps: 0, ms: 0 };
  function drawFps() {
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(4, 4, 112, 18);
    ctx.fillStyle = fpsStat.fps >= 55 ? '#8f8' : fpsStat.fps >= 40 ? '#ff8' : '#f88';
    ctx.fillText(`${fpsStat.fps} fps · ${fpsStat.ms.toFixed(1)} ms`, 8, 7);
    ctx.restore();
  }
  let perfAcc = 0, perfN = 0;
  // 淺色場景（水墨）光暈要壓低，避免白紙過曝
  function bloomScale() {
    const s1 = scene && scene.bloomScale != null ? scene.bloomScale : 1;
    if (!prevScene || sceneFade >= 1) return s1;
    const s0 = prevScene.bloomScale != null ? prevScene.bloomScale : 1;
    return s0 + (s1 - s0) * sceneFade;
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    // 省電模式：上限 60fps（120Hz 螢幕就每兩次刷新畫一次）
    if (powerSave() && ts - last < 1000 / 60 - 3) return;
    const t0 = performance.now();
    const dt = Math.min(50, ts - last); last = ts;
    fpsStat.n++; fpsStat.acc += dt;
    if (fpsStat.acc >= 1000) { fpsStat.fps = Math.round(fpsStat.n * 1000 / fpsStat.acc); fpsStat.ms = fpsStat.work / fpsStat.n; fpsStat.n = 0; fpsStat.acc = 0; fpsStat.work = 0; }
    input.poll();
    if (mode === 'countdown') {
      countdown -= dt / 1000;
      if (countdown <= 0) { mode = 'playing'; Snd.play('go'); }
    } else if (mode === 'playing') {
      game.update(dt);
    } else if (mode === 'transition') {
      updateTransition(dt);
    } else if (mode === 'over') {
      overDelay -= dt / 1000;
      if (overDelay <= 0 && !overShown) { overShown = true; finishGame(); }
    }
    updateVs(dt);
    const bi = Snd.beatInfo();
    if (fxLevel() !== 'low' && Snd.analyser && bi.playing) {
      // 用 FFT 讀低音能量驅動畫面（每秒最多約 60 次），衰減讓光暈有餘韻
      if (ts - fftLast >= 15) { fftLast = ts; fftBass = Snd.bassLevel(); }
      beatSmooth = Math.max(fftBass, beatSmooth * Math.pow(0.004, dt / 1000));
      beat = beatSmooth;
    } else beat = bi.playing ? Math.exp(-bi.phase * 5) * (bi.drums ? 1 : 0.55) : 0;
    // Zone：淡入淡出、結束前 1.5 秒開始漸強
    const zOn = game && game.zone ? 1 : 0;
    zoneFx.on += (zOn - zoneFx.on) * Math.min(1, dt / 250);
    zoneFx.hit *= Math.pow(0.05, dt / 1000);
    if (game && game.zone && game.zone.t < 1500 && !zoneFx.crescendo && mode === 'playing') { zoneFx.crescendo = true; Snd.zoneCrescendo(game.zone.t / 1000); }
    updateTheme(dt);
    const sdt = dt * (1 - 0.8 * zoneFx.on); // Zone 中背景慢動作
    if (scene) { if (scene.setIntensity) scene.setIntensity(game ? intensity : 1); scene.update(sdt); }
    // 有多首歌的關卡：一首播完就換下一首，不必等換關
    if (game && THEMES[themeIdx].songs && (mode === 'playing' || mode === 'paused')) {
      const sp = Snd.songProgress && Snd.songProgress();
      if (sp && sp.len && sp.bars >= sp.len && THEMES[themeIdx].songs.includes(sp.name)) Snd.playSong(nextSong(themeIdx, true), musicStage(), musicRate());
    }
    if (prevScene) prevScene.update(sdt);
    if (tr && tr.prev) tr.prev.update(dt);
    updateFx(dt);
    render(ts);
    // 效能保護：遊玩中連續 3 秒平均低於約 40fps，就自動關閉光暈後製
    if (post && mode === 'playing' && !window.__noPerfGuard) {
      perfAcc += dt; perfN++;
      if (perfAcc >= 3000) {
        if (perfAcc / perfN > 25) {
          // 太慢：完整光暈 → 省電光暈 → 關閉光暈
          if (!post.lightMode) { post.setLight(true); document.body.classList.remove('post-on'); document.body.classList.add('post-light'); }
          else { post = null; document.body.classList.remove('post-light'); }
          popup(['已切換省電顯示'], '#8be9ff');
        }
        perfAcc = 0; perfN = 0;
      }
    }
    if (post) {
      const ok = post.render(canvas, {
        bloom: (0.45 + beat * 0.25 + fx.pulse * 0.45) * bloomScale(),
        thr: 0.68,
        aberr: fx.aberr,
        vig: 0.45,
        flash: fx.flash,
        grain: 0.035,
        waves: fx.waves.slice(-3).map((w) => {
          const k = w.t / w.life;
          return { x: w.x, y: w.y, r: k * 1.1, s: w.s * (1 - k) };
        }),
      });
      if (!ok) { post = null; document.body.classList.remove('post-on'); document.body.classList.remove('post-light'); }
    }
    fpsStat.work += performance.now() - t0;
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
    mkSeg('難度曲線（下一局生效）', 'difficulty', [['relaxed', '輕鬆'], ['normal', '標準'], ['classic', '經典']]);
    mkSeg('過關過場', 'transitions', [[true, '開'], [false, '關']]);
    {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('label'); lab.append('按鍵位置');
      const seg = document.createElement('div'); seg.className = 'seg';
      const b1 = document.createElement('button'); b1.textContent = '自訂按鍵位置';
      b1.addEventListener('click', () => { Snd.play('ui'); openPadEditor(); });
      seg.append(b1);
      if (settings.customPad) {
        const b2 = document.createElement('button'); b2.textContent = '恢復預設位置';
        b2.addEventListener('click', () => { settings.customPad = null; applySettings(); buildSettings(); });
        seg.append(b2);
      }
      row.append(lab, seg); body.append(row);
    }
    mkSlider('按鍵整體大小', 'btnScale', 0.7, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`);
    mkSlider('起始等級（速度）', 'startLevel', 1, THEMES.length, 1, (v) => `${v}`);
    {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('label'); lab.append('指定關卡（下一局生效）');
      const sel = document.createElement('select'); sel.className = 'stage-sel';
      [[-1, '隨機（每關換場景）']].concat(THEMES.map((th, i) => [i, th.name])).forEach(([v, name]) => {
        const o = document.createElement('option'); o.value = String(v); o.textContent = name; if ((settings.stage | 0) === v || (v === -1 && !(settings.stage >= 0))) o.selected = true; sel.append(o);
      });
      sel.addEventListener('change', () => { settings.stage = +sel.value; applySettings(); });
      row.append(lab, sel); body.append(row);
    }
    mkSeg('觸控操作', 'controls', [['buttons', '螢幕按鍵'], ['gesture', '手勢'], ['off', '關閉']]);
    mkSeg('硬降按鈕', 'hdMode', [['release', '放開才落（防誤觸）'], ['press', '按下即落']]);
    mkSlider('硬降鍵與 ◀ 的距離', 'hdGap', 16, 96, 2, (v) => `${v} px`);
    mkSeg('顯示 180° 按鈕', 'show180', [[false, '隱藏'], [true, '顯示']]);
    mkSeg('震動回饋', 'haptics', [[true, '開'], [false, '關']]);
    mkSeg('落點提示', 'ghost', [[true, '開'], [false, '關']]);
    mkSeg('畫面品質', 'fx', [['high', '高（最耗電）'], ['balanced', '省電（建議）'], ['low', '最省電']]);
    mkSeg('顯示幀率', 'showFps', [[false, '關'], [true, '開']]);

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
    if (fxChanged) { rebuildScenes(); setupPost(); setSceneRes(); }
  }

  // ================= 事件綁定 =================
  function ui(fn) { return () => { ensureAudio(); Snd.play('ui'); fn(); }; }
  $('pe-smaller').addEventListener('click', () => resizeSel(0.9));
  $('pe-bigger').addEventListener('click', () => resizeSel(1.1));
  $('pe-reset').addEventListener('click', () => {
    settings.customPad = null; applyCustomPad();
    settings.customPad = capturePad(); applyCustomPad();
    syncSizeSliders();
  });
  $('pe-w').addEventListener('input', (e) => setSelSize(+e.target.value, null));
  $('pe-h').addEventListener('input', (e) => setSelSize(null, +e.target.value));
  $('pe-all').addEventListener('input', (e) => {
    settings.btnScale = +e.target.value / 100;
    layout(); applyCustomPad(); syncSizeSliders();
  });
  $('pe-done').addEventListener('click', () => { Snd.play('ui'); closePadEditor(); });
  $('btn-start').addEventListener('click', ui(() => startGame()));
  $('btn-versus').addEventListener('click', ui(openVersus));
  $('vs-name').addEventListener('input', (e) => { settings.name = e.target.value.trim().slice(0, 12); e.target.classList.remove('need'); saveSettings(); });
  for (const b of $('vs-rounds').children) {
    b.addEventListener('click', ui(() => { settings.vsRounds = +b.dataset.v; saveSettings(); for (const x of $('vs-rounds').children) x.classList.toggle('on', x === b); }));
  }
  for (const b of $('vs-cpu').children) b.addEventListener('click', ui(() => startCpu(b.dataset.cpu)));
  $('vs-create').addEventListener('click', ui(createRoom));
  $('vs-join').addEventListener('click', ui(() => joinRoom($('vs-code').value)));
  $('vs-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('vs-code').value); });
  $('vs-back').addEventListener('click', ui(() => showOverlay('menu')));
  $('room-share').addEventListener('click', ui(shareRoom));
  $('room-start').addEventListener('click', ui(() => { if (vs && vs.isHost && vs.net && vs.net.connected) beginMatch(); }));
  $('room-cancel').addEventListener('click', ui(openVersus));
  $('vr-again').addEventListener('click', ui(rematch));
  $('vr-quit').addEventListener('click', ui(toMenu));
  $('vq-stay').addEventListener('click', ui(toggleVsQuit));
  $('vq-leave').addEventListener('click', ui(toMenu));
  $('btn-settings').addEventListener('click', ui(() => { settingsReturn = 'menu'; buildSettings(); showOverlay('settings'); }));
  $('btn-pause-settings').addEventListener('click', ui(() => { settingsReturn = 'pause'; buildSettings(); showOverlay('settings'); }));
  $('btn-settings-back').addEventListener('click', ui(() => { input.rebinding = null; showOverlay(settingsReturn); }));
  $('btn-reset-settings').addEventListener('click', ui(() => {
    settings = JSON.parse(JSON.stringify(DEFAULTS)); input.settings = settings; applySettings(true); buildSettings();
  }));
  $('btn-help').addEventListener('click', ui(() => showOverlay('help')));
  $('btn-help-back').addEventListener('click', ui(() => showOverlay('menu')));
  $('btn-resume').addEventListener('click', ui(resumeGame));
  $('btn-restart').addEventListener('click', ui(() => { if (vs && vs.kind === 'cpu') beginMatch(); else startGame(); }));
  $('btn-quit').addEventListener('click', ui(toMenu));
  $('btn-again').addEventListener('click', ui(() => startGame()));
  $('btn-over-quit').addEventListener('click', ui(toMenu));
  zoneBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); input.press('zone', 'zbtn'); });
  pauseBtn.addEventListener('click', () => { ensureAudio(); if (vs && vs.kind === 'net') toggleVsQuit(); else pauseGame(); });
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
      if (mode === 'playing' && !(vs && vs.kind === 'net')) pauseGame();
      if (!(vs && vs.kind === 'net' && vs.started && !vs.matchOver)) Snd.suspend();
      releaseWake();
    } else {
      if (audioStarted) Snd.resume();
      if (vs && vs.net && vs.net.keepAlive) vs.net.keepAlive(); // 從 LINE 切回來：立刻檢查房間是否還在
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
  $('ver').textContent = `版本 ${VERSION}`;
  setupPost();
  layout();
  setTheme(0, true);
  requestAnimationFrame((ts) => { last = ts; frame(ts); });

  // 邀請連結 ?room=1234：直接帶到對戰畫面並填好房號
  {
    const q = new URLSearchParams(location.search);
    const code = (q.get('room') || '').replace(/\D/g, '');
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('lumen.hostRoom') || 'null'); } catch (_) { /* ignore */ }
    if (code.length === 4) {
      openVersus();
      $('vs-code').value = code;
      q.delete('room');
      try { history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '')); } catch (_) { /* ignore */ }
    } else if (saved && saved.code && Date.now() - saved.t < 20 * 60 * 1000 && (settings.name || '').trim()) {
      // 房主切到別的 App 時手機把網頁關掉重載：自動用原來的房號重開房間
      openVersus();
      createRoom(String(saved.code));
    }
  }

  // 供自動測試使用
  window.__lumen = {
    get game() { return game; }, get mode() { return mode; }, get fpsStat() { return fpsStat; }, applySettings, startGame, settings: () => settings, get vs() { return vs; }, startCpu,
    setTheme: (i) => { setTheme(i, true); }, get scene() { return scene; }, themes: THEMES, get themeIdx() { return themeIdx; }, get post() { return post; },
  };
})();
