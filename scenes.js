'use strict';
/*
 * 狗狗哇沙米光律方塊 — 動態場景
 * 每個場景：resize(w, h) 預先畫好靜態層、update(dt) 推進動畫、draw(g, t, beat, board) 繪製、burst(d, board) 消行反應
 * beat：0~1 的節拍脈衝（拍點時最大）
 */
(function (root) {
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function layer(w, h) {
    const cv = document.createElement('canvas');
    const s = Math.min(root.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.ceil(w * s));
    cv.height = Math.max(1, Math.ceil(h * s));
    const g = cv.getContext('2d');
    g.scale(s, s);
    return { cv, g, w, h };
  }
  function vgrad(g, h, stops) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    return gr;
  }
  function glow(g, x, y, r, color, alpha) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color},${alpha})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 柔光點：中心亮、往外淡出
  function softDot(color) {
    const S = layer(32, 32);
    const gr = S.g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, `rgba(${color},0.9)`); gr.addColorStop(0.5, `rgba(${color},0.3)`); gr.addColorStop(1, `rgba(${color},0)`);
    S.g.fillStyle = gr; S.g.fillRect(0, 0, 32, 32);
    return S;
  }
  // 梅花：五瓣、花心有黃色花蕊
  function plumSprite() {
    const S = layer(40, 40);
    const g = S.g;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const px = 20 + Math.cos(a) * 8, py = 20 + Math.sin(a) * 8;
      const gr = g.createRadialGradient(px, py, 0, px, py, 9);
      gr.addColorStop(0, '#f6a0a8'); gr.addColorStop(0.6, '#d8313f'); gr.addColorStop(1, '#a3121f');
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, 8.5, 0, TAU); g.fill();
    }
    g.fillStyle = '#7a0d16'; g.beginPath(); g.arc(20, 20, 4, 0, TAU); g.fill();
    g.strokeStyle = '#f2c84b'; g.lineWidth = 0.8;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; g.beginPath(); g.moveTo(20, 20); g.lineTo(20 + Math.cos(a) * 7, 20 + Math.sin(a) * 7); g.stroke(); }
    g.fillStyle = '#ffe07a';
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; g.beginPath(); g.arc(20 + Math.cos(a) * 7, 20 + Math.sin(a) * 7, 1, 0, TAU); g.fill(); }
    return S;
  }
  function petalSprite(c1, c2) {
    const S = layer(20, 14);
    const gr = S.g.createLinearGradient(0, 0, 20, 14);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    S.g.fillStyle = gr;
    S.g.beginPath(); S.g.ellipse(10, 7, 9, 6, 0, 0, TAU); S.g.fill();
    return S;
  }

  // 鏡頭失焦光斑：中心柔、邊緣一圈略亮
  function bokehSprite(color) {
    const S = layer(64, 64);
    const gr = S.g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${color},0.55)`);
    gr.addColorStop(0.7, `rgba(${color},0.45)`);
    gr.addColorStop(0.86, `rgba(${color},0.7)`);
    gr.addColorStop(1, `rgba(${color},0)`);
    S.g.fillStyle = gr;
    S.g.fillRect(0, 0, 64, 64);
    return S;
  }

  // =========================================================
  // 共用：帶十字光芒的星星、流星（發光頭 + 長尾 + 碎屑）
  // =========================================================
  function starSprite(col) {
    const S = layer(64, 64);
    const g = S.g;
    g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(32, 32, 0, 32, 32, 14);
    core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.25, `rgba(${col},0.8)`); core.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = core; g.fillRect(0, 0, 64, 64);
    const spike = (ang, len, wd, a) => {
      g.save(); g.translate(32, 32); g.rotate(ang);
      const gr = g.createLinearGradient(-len, 0, len, 0);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(-len, -wd / 2, len * 2, wd);
      g.restore();
    };
    spike(0, 31, 1.6, 0.9); spike(Math.PI / 2, 31, 1.6, 0.9);
    spike(Math.PI / 4, 16, 1, 0.45); spike(-Math.PI / 4, 16, 1, 0.45);
    return S;
  }

  class Meteors {
    constructor(sc) { this.sc = sc; this.list = []; this.bits = []; this.head = starSprite('200,225,255'); }
    spawn(x, y, ang, speed, len, col) {
      this.list.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, len, life: 0, max: rand(0.9, 1.6), col: col || '210,230,255' });
    }
    random(w, h, big) {
      const ang = rand(0.45, 0.85) + (Math.random() < 0.5 ? 0 : Math.PI / 2 - 0.2);
      const fromRight = Math.cos(ang) < 0;
      this.spawn(fromRight ? rand(0.4, 1.1) * w : rand(-0.1, 0.6) * w, rand(-0.05, 0.35) * h, ang, rand(500, 900) * this.sc * (big ? 1.3 : 1), rand(140, 260) * this.sc * (big ? 1.5 : 1),
        ['210,230,255', '255,220,180', '190,255,230', '255,190,230'][(Math.random() * 4) | 0]);
    }
    update(s) {
      for (const m of this.list) {
        m.life += s; m.x += m.vx * s; m.y += m.vy * s;
        if (Math.random() < 0.6) this.bits.push({ x: m.x, y: m.y, vx: m.vx * 0.05 + rand(-20, 20), vy: m.vy * 0.05 + rand(-10, 20), life: rand(0.3, 0.7), col: m.col });
      }
      this.list = this.list.filter((m) => m.life < m.max);
      for (const b of this.bits) { b.x += b.vx * s; b.y += b.vy * s; b.life -= s; }
      this.bits = this.bits.filter((b) => b.life > 0);
      if (this.bits.length > 400) this.bits.splice(0, this.bits.length - 400);
    }
    draw(g) {
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bits) { g.fillStyle = `rgba(${b.col},${b.life})`; g.fillRect(b.x, b.y, 1.4, 1.4); }
      for (const m of this.list) {
        const k = m.life / m.max;
        const a = Math.sin(Math.min(1, k) * Math.PI);
        const sp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
        const gr = g.createLinearGradient(m.x, m.y, tx, ty);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.15, `rgba(${m.col},${a * 0.7})`); gr.addColorStop(1, `rgba(${m.col},0)`);
        g.strokeStyle = gr; g.lineCap = 'round';
        g.lineWidth = 4 * this.sc; g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(tx, ty); g.stroke();
        g.lineWidth = 1.6 * this.sc; g.globalAlpha = 1;
        g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(tx, ty); g.stroke();
        const hs = 26 * this.sc * (0.6 + a * 0.4);
        g.globalAlpha = a;
        g.drawImage(this.head.cv, m.x - hs / 2, m.y - hs / 2, hs, hs);
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  // =========================================================
  // 0 星空：銀河帶、漂移的星雲、光芒星、曲速星場、流星與彗星
  // =========================================================
  class Starfield {
    constructor(low) { this.low = low; this.warp = 0; this.intensity = 0; this.flash = 0; this.comet = null; this.cometTimer = rand(12, 25); this.meteorTimer = 2; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#02030c'], [0.5, '#080a24'], [1, '#140a2e']]);
      g.fillRect(0, 0, w, h);
      // 銀河帶（對角）
      g.save();
      g.translate(w * 0.5, h * 0.45); g.rotate(-0.55);
      g.globalCompositeOperation = 'lighter';
      const D = Math.hypot(w, h);
      for (let i = 0; i < 26; i++) {
        const x = rand(-0.6, 0.6) * D, y = rand(-0.06, 0.06) * D;
        const r = rand(0.06, 0.16) * D;
        const c = ['120,140,255', '180,120,255', '255,160,200', '120,200,255'][i % 4];
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${c},0.2)`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < (this.low ? 1000 : 2400); i++) {
        const x = rand(-0.6, 0.6) * D, y = (Math.random() + Math.random() + Math.random() - 1.5) * 0.06 * D;
        g.fillStyle = `rgba(230,235,255,${rand(0.15, 0.7)})`;
        const s = rand(0.4, 1.2); g.fillRect(x, y, s, s);
      }
      // 暗塵帶
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 14; i++) {
        const x = rand(-0.5, 0.5) * D, y = rand(-0.015, 0.015) * D, r = rand(0.02, 0.06) * D;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(4,4,14,0.45)'); gr.addColorStop(1, 'rgba(4,4,14,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.restore();
      // 遠方星系
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const x = rand(0.1, 0.9) * w, y = rand(0.1, 0.9) * h, r = rand(14, 26) * sc;
        g.save(); g.translate(x, y); g.rotate(rand(0, TAU)); g.scale(1, 0.4);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, 'rgba(255,240,220,0.7)'); gr.addColorStop(0.2, 'rgba(220,200,255,0.25)'); gr.addColorStop(1, 'rgba(160,140,255,0)');
        g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
      }
      // 背景小星（多種色溫）
      for (let i = 0; i < (this.low ? 300 : 650); i++) {
        const c = ['230,235,255', '200,215,255', '255,235,200', '255,210,180'][(Math.random() * 4) | 0];
        g.fillStyle = `rgba(${c},${rand(0.15, 0.7)})`;
        const s = rand(0.5, 1.5); g.fillRect(rand(0, w), rand(0, h), s, s);
      }
      g.globalCompositeOperation = 'source-over';
      // 星雲層（會緩慢漂移、呼吸）
      this.nebulae = [];
      for (const cols of [['110,80,255', '255,90,180'], ['60,170,255', '150,90,255']]) {
        const N = layer(w * 0.6, h * 0.6);
        const ng = N.g;
        ng.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 18; i++) {
          const r = rand(0.05, 0.12) * w;
          const x = rand(0.25, 0.75) * w * 0.6, y = rand(0.25, 0.75) * h * 0.6;
          const gr = ng.createRadialGradient(x, y, 0, x, y, r);
          const c = cols[i % 2];
          gr.addColorStop(0, `rgba(${c},0.16)`); gr.addColorStop(0.5, `rgba(${c},0.06)`); gr.addColorStop(1, `rgba(${c},0)`);
          ng.fillStyle = gr; ng.fillRect(x - r, y - r, r * 2, r * 2);
        }
        this.nebulae.push({ L: N, x: rand(-0.2, 0.4) * w, y: rand(-0.2, 0.4) * h, vx: rand(-4, 4), vy: rand(-3, 3), ph: rand(0, TAU) });
      }
      this.sprites = ['255,255,255', '170,200,255', '255,220,170', '200,170,255'].map(starSprite);
      this.bright = [];
      for (let i = 0; i < (this.low ? 14 : 30); i++) this.bright.push({ x: rand(0, w), y: rand(0, h), s: rand(8, 22) * sc, k: (Math.random() * 4) | 0, ph: rand(0, TAU), sp: rand(0.6, 1.8) });
      this.stars = [];
      for (let i = 0; i < (this.low ? 50 : 110); i++) this.stars.push(this.newStar(Math.random()));
      this.meteors = new Meteors(sc);
    }
    newStar(r) {
      return { a: rand(0, TAU), r: r != null ? r : rand(0.01, 0.12), v: rand(0.012, 0.035), s: rand(0.8, 2.2), c: Math.random() < 0.25 ? '170,200,255' : Math.random() < 0.15 ? '255,200,240' : '255,255,255' };
    }
    update(dt) {
      const s = dt / 1000;
      this.warp *= Math.pow(0.22, s);
      this.flash *= Math.pow(0.1, s);
      const k = 1 + this.warp * 14 + this.intensity * 0.25;
      for (let i = 0; i < this.stars.length; i++) {
        const st = this.stars[i];
        st.pr = st.r;
        st.r += st.v * k * s * (0.4 + st.r);
        if (st.r > 1.2) this.stars[i] = this.newStar();
      }
      for (const n of this.nebulae) { n.x += n.vx * s; n.y += n.vy * s; n.ph += s * 0.3; if (n.x < -0.4 * this.w || n.x > 0.8 * this.w) n.vx = -n.vx; if (n.y < -0.4 * this.h || n.y > 0.8 * this.h) n.vy = -n.vy; }
      for (const b of this.bright) b.ph += s * b.sp * (1 + this.intensity * 0.2);
      // 流星：強度越高越頻繁，高潮時下流星雨
      this.meteorTimer -= s;
      if (this.meteorTimer <= 0) {
        const n = this.intensity >= 5 ? (this.low ? 2 : 4) : 1;
        for (let i = 0; i < n; i++) this.meteors.random(this.w, this.h, false);
        this.meteorTimer = this.intensity >= 5 ? rand(0.6, 1.5) : rand(2.5, 6) / (1 + this.intensity * 0.3);
      }
      this.meteors.update(s);
      // 彗星
      this.cometTimer -= s;
      if (!this.comet && this.cometTimer <= 0) {
        const fromLeft = Math.random() < 0.5;
        this.comet = { x: fromLeft ? -0.2 * this.w : 1.2 * this.w, y: rand(0.1, 0.4) * this.h, vx: (fromLeft ? 1 : -1) * rand(25, 40) * this.sc, vy: rand(4, 12) * this.sc };
      }
      if (this.comet) {
        this.comet.x += this.comet.vx * s; this.comet.y += this.comet.vy * s;
        if (this.comet.x < -0.4 * this.w || this.comet.x > 1.4 * this.w) { this.comet = null; this.cometTimer = rand(20, 40); }
      }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, ts = t / 1000;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const nb = 0.55 + this.intensity * 0.09 + beat * 0.15 + this.flash * 0.5;
      for (const n of this.nebulae) {
        g.globalAlpha = Math.min(1, nb * (0.75 + 0.25 * Math.sin(n.ph)));
        g.drawImage(n.L.cv, n.x, n.y, w * 1.4, h * 1.4);
      }
      g.globalAlpha = 1;
      // 光芒星
      for (const b of this.bright) {
        const tw = 0.55 + 0.45 * Math.sin(b.ph);
        const sz = b.s * (0.7 + 0.3 * tw) * (1 + beat * 0.25);
        g.globalAlpha = 0.5 + 0.5 * tw;
        g.drawImage(this.sprites[b.k].cv, b.x - sz, b.y - sz, sz * 2, sz * 2);
      }
      g.globalAlpha = 1;
      // 曲速星場
      const cx = B.cx, cy = B.cy;
      const R = Math.hypot(w, h) * 0.62;
      const bright = 0.7 + beat * 0.3;
      const streak = this.warp > 0.06;
      for (const st of this.stars) {
        const a = Math.min(1, st.r * 2.2) * bright;
        const x = cx + Math.cos(st.a) * st.r * R, y = cy + Math.sin(st.a) * st.r * R;
        if (streak) {
          const pr = Math.max(0, st.r - (st.r - st.pr) * 5 - this.warp * 0.05);
          g.strokeStyle = `rgba(${st.c},${a})`; g.lineWidth = st.s * (0.5 + st.r);
          g.beginPath(); g.moveTo(cx + Math.cos(st.a) * pr * R, cy + Math.sin(st.a) * pr * R); g.lineTo(x, y); g.stroke();
        } else {
          const sz = st.s * (0.5 + st.r * 1.4);
          g.fillStyle = `rgba(${st.c},${a})`;
          g.beginPath(); g.arc(x, y, sz * 0.6, 0, TAU); g.fill();
        }
      }
      // 彗星：白色塵埃尾（彎）＋藍色離子尾（直）
      if (this.comet) {
        const c = this.comet, sc = this.sc;
        const dir = Math.sign(c.vx);
        const ion = g.createLinearGradient(c.x, c.y, c.x - dir * 260 * sc, c.y - 40 * sc);
        ion.addColorStop(0, 'rgba(140,200,255,0.55)'); ion.addColorStop(1, 'rgba(140,200,255,0)');
        g.strokeStyle = ion; g.lineWidth = 3 * sc;
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x - dir * 260 * sc, c.y - 40 * sc); g.stroke();
        for (let i = 0; i < 6; i++) {
          const dust = g.createLinearGradient(c.x, c.y, c.x - dir * 200 * sc, c.y + 20 * sc);
          dust.addColorStop(0, 'rgba(255,240,220,0.18)'); dust.addColorStop(1, 'rgba(255,240,220,0)');
          g.strokeStyle = dust; g.lineWidth = (14 - i * 2) * sc;
          g.beginPath(); g.moveTo(c.x, c.y); g.quadraticCurveTo(c.x - dir * 100 * sc, c.y + (6 + i * 3) * sc, c.x - dir * (180 + i * 10) * sc, c.y + (24 + i * 6) * sc); g.stroke();
        }
        const hs = 34 * sc;
        g.drawImage(this.sprites[1].cv, c.x - hs, c.y - hs, hs * 2, hs * 2);
      }
      g.globalCompositeOperation = 'source-over';
      this.meteors.draw(g);
    }
    burst(d) {
      this.warp = Math.min(1.4, this.warp + 0.18 * d.lines + (d.lines >= 4 ? 0.5 : 0) + (d.tspin ? 0.3 : 0));
      this.flash = Math.min(1.2, this.flash + 0.2 * d.lines);
      const n = d.lines >= 4 ? 4 : d.lines >= 2 ? 1 : 0;
      for (let i = 0; i < n; i++) this.meteors.random(this.w, this.h, true);
    }
  }

  // =========================================================
  // 1 深海：光束、景深光斑、海雪、半透明發光水母
  // =========================================================
  const JELLY_COLS = ['140,220,255', '205,150,255', '255,160,215', '150,255,215'];
  class DeepSea {
    constructor(low) { this.low = low; this.flash = 0; this.beat = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0b5578'], [0.3, '#073452'], [0.7, '#03172b'], [1, '#010812']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.45, -h * 0.1, w * 1.0, '120,220,255', 0.2);
      // 水面波光
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(180,240,255,${rand(0.02, 0.07)})`;
        g.beginPath(); g.ellipse(rand(0, w), rand(0, h * 0.08), rand(10, 40), rand(1, 3), 0, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      // 海床：岩石與珊瑚剪影
      g.fillStyle = '#010610';
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w + 20; x += 14) g.lineTo(x, h * 0.9 - Math.abs(Math.sin(x * 0.013)) * h * 0.05 - Math.sin(x * 0.041) * h * 0.012);
      g.lineTo(w, h); g.closePath(); g.fill();
      g.strokeStyle = '#010711'; g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x0 = rand(0, w), y0 = h * rand(0.88, 0.94);
        const coral = (x, y, a, len, wd, d) => {
          if (d <= 0) return;
          const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
          g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
          coral(x1, y1, a - rand(0.2, 0.5), len * 0.7, wd * 0.7, d - 1);
          coral(x1, y1, a + rand(0.2, 0.5), len * 0.7, wd * 0.7, d - 1);
        };
        coral(x0, y0, -Math.PI / 2 + rand(-0.2, 0.2), rand(14, 26), 4, 4);
      }
      // 光束素材
      const ray = (this.ray = layer(120, 600));
      const rg = ray.g;
      const gr = rg.createLinearGradient(0, 0, 0, 600);
      gr.addColorStop(0, 'rgba(170,240,255,0.5)'); gr.addColorStop(0.6, 'rgba(170,240,255,0.12)'); gr.addColorStop(1, 'rgba(170,240,255,0)');
      rg.fillStyle = gr;
      rg.beginPath(); rg.moveTo(45, 0); rg.lineTo(75, 0); rg.lineTo(120, 600); rg.lineTo(0, 600); rg.closePath(); rg.fill();
      this.rays = [];
      for (let i = 0; i < 6; i++) this.rays.push({ x: rand(-0.1, 1.1), w: rand(0.6, 1.6), a: rand(0.07, 0.16), ph: rand(0, TAU), sp: rand(0.2, 0.5) });
      this.bokehImg = bokehSprite('150,230,255');
      this.bokeh = [];
      for (let i = 0; i < (this.low ? 8 : 20); i++) this.bokeh.push({ x: rand(0, w), y: rand(0, h), r: rand(6, 28), a: rand(0.06, 0.2), vy: rand(-6, -2), ph: rand(0, TAU) });
      const sc = Math.min(w, h) / 412;
      this.jellies = [];
      for (let i = 0; i < (this.low ? 2 : 3); i++) {
        this.jellies.push({ x: rand(0.08, 0.92) * w, y: rand(0.2, 1) * h, R: [24, 34, 46][i] * sc * rand(0.9, 1.1), col: JELLY_COLS[i % JELLY_COLS.length], ph: rand(0, TAU), rate: rand(1.3, 1.9), vy: 0, vx: rand(-5, 5), c: 0 });
      }
      this.jellies.sort((a, b) => a.R - b.R);
      this.bubbles = [];
      for (let i = 0; i < (this.low ? 12 : 30); i++) this.bubbles.push(this.newBubble(true));
      this.snow = [];
      for (let i = 0; i < (this.low ? 30 : 80); i++) this.snow.push({ x: rand(0, w), y: rand(0, h), v: rand(4, 14), s: rand(1, 2.6), ph: rand(0, TAU) });
    }
    newBubble(anywhere, x, y) {
      return { x: x != null ? x : rand(0, this.w), y: y != null ? y : anywhere ? rand(0, this.h) : this.h + 10, r: rand(1.5, 4.5), v: rand(25, 70), ph: rand(0, TAU), temp: x != null };
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.1, s);
      for (const b of this.bubbles) { b.y -= b.v * s; b.ph += s * 3; }
      this.bubbles = this.bubbles.filter((b) => b.y > -20 || !b.temp);
      for (const b of this.bubbles) if (b.y < -20) Object.assign(b, this.newBubble(false));
      for (const p of this.snow) { p.y += p.v * s; p.ph += s; if (p.y > this.h) { p.y = -5; p.x = rand(0, this.w); } }
      for (const b of this.bokeh) { b.y += b.vy * s; b.ph += s * 0.6; if (b.y < -40) { b.y = this.h + 40; b.x = rand(0, this.w); } }
      // 水母：收縮時往上推進，放鬆時緩緩下沉
      for (const j of this.jellies) {
        j.ph += s * j.rate;
        const cyc = Math.pow(Math.max(0, Math.sin(j.ph)), 2);
        j.c = Math.max(cyc, this.beat * 0.7);
        j.vy += -j.c * 70 * s * (j.R / 24);
        j.vy *= Math.pow(0.35, s);
        j.y += (j.vy + 6) * s;
        j.x += j.vx * s;
        if (j.y < -j.R * 6) { j.y = this.h + j.R * 2; j.x = rand(0.08, 0.92) * this.w; }
        if (j.x < -60 || j.x > this.w + 60) j.vx = -j.vx;
      }
    }
    drawJelly(g, j, t) {
      const { x, y, R, col, c } = j;
      const rx = R * (1 - 0.16 * c), ry = R * (0.78 + 0.12 * c);
      const ts = t / 1000;
      glow(g, x, y, R * 2.8, col, 0.08 + 0.08 * c);
      // 觸手
      const nT = this.low ? 8 : 14;
      g.lineCap = 'round';
      for (let k = 0; k < nT; k++) {
        const u = k / (nT - 1);
        const sx = x - rx * 0.9 + u * rx * 1.8, sy = y + R * 0.08;
        const len = R * (3.0 + (k % 3) * 0.8) * (1 - 0.2 * c);
        let px = sx, py = sy;
        const segs = 7;
        for (let q = 1; q <= segs; q++) {
          const f = q / segs;
          const nx = sx + Math.sin(ts * 1.9 + k * 0.7 - f * 3.4 + j.ph) * R * 0.22 * f + (u - 0.5) * R * 0.35 * f;
          const ny = sy + len * f;
          g.strokeStyle = `rgba(${col},${0.6 * (1 - f) + 0.05})`;
          g.lineWidth = Math.max(0.5, R * 0.035 * (1 - f * 0.6));
          g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
          px = nx; py = ny;
        }
      }
      // 口腕：四條半透明緞帶
      for (let a = 0; a < 4; a++) {
        const off = (a - 1.5) * R * 0.16;
        const L = R * 1.7;
        const left = [], right = [];
        for (let q = 0; q <= 10; q++) {
          const f = q / 10;
          const cx = x + off + Math.sin(ts * 1.4 + a * 1.7 + f * 4) * R * 0.2 * f;
          const cy = y + R * 0.12 + f * L;
          const wd = R * 0.11 * (1 - f * 0.75) * (1 + 0.3 * Math.sin(f * 14 + ts * 3));
          left.push([cx - wd, cy]); right.push([cx + wd, cy]);
        }
        g.fillStyle = `rgba(${col},0.26)`;
        g.beginPath(); g.moveTo(left[0][0], left[0][1]);
        for (const [px, py] of left) g.lineTo(px, py);
        for (let q = right.length - 1; q >= 0; q--) g.lineTo(right[q][0], right[q][1]);
        g.closePath(); g.fill();
      }
      // 傘膜：邊緣較亮（菲涅耳），傘緣呈波浪
      const bell = () => {
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, Math.PI, 0);
        const N = 10;
        for (let i = 0; i < N; i++) {
          const x0 = x + rx - (2 * rx * i) / N, x1 = x + rx - (2 * rx * (i + 1)) / N;
          g.quadraticCurveTo((x0 + x1) / 2, y + R * (0.13 + 0.05 * c), x1, y);
        }
        g.closePath();
      };
      const bg = g.createRadialGradient(x, y - ry * 0.25, 0, x, y - ry * 0.1, R * 1.05);
      bg.addColorStop(0, `rgba(${col},0.08)`);
      bg.addColorStop(0.55, `rgba(${col},0.16)`);
      bg.addColorStop(0.86, `rgba(${col},0.42)`);
      bg.addColorStop(1, `rgba(${col},0.1)`);
      g.fillStyle = bg; bell(); g.fill();
      g.strokeStyle = `rgba(${col},0.75)`; g.lineWidth = Math.max(0.8, R * 0.04); bell(); g.stroke();
      // 內傘與生殖腺
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath(); g.ellipse(x, y - ry * 0.05, rx * 0.62, ry * 0.58, 0, Math.PI, 0); g.fill();
      // 四葉狀生殖腺：柔和的發光團
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * TAU + Math.PI / 4;
        const gx = x + Math.cos(ang) * rx * 0.22, gy = y - ry * 0.4 + Math.sin(ang) * ry * 0.13;
        const gg = g.createRadialGradient(gx, gy, 0, gx, gy, R * 0.16);
        gg.addColorStop(0, 'rgba(255,255,255,0.45)'); gg.addColorStop(0.5, `rgba(${col},0.35)`); gg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gg;
        g.beginPath(); g.ellipse(gx, gy, R * 0.16, R * 0.11, ang, 0, TAU); g.fill();
      }
      // 高光
      const hl = g.createRadialGradient(x - rx * 0.35, y - ry * 0.62, 0, x - rx * 0.35, y - ry * 0.62, rx * 0.4);
      hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.beginPath(); g.ellipse(x - rx * 0.35, y - ry * 0.62, rx * 0.4, ry * 0.25, -0.3, 0, TAU); g.fill();
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      this.beat = beat;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const r of this.rays) {
        const sway = Math.sin(t / 1000 * r.sp + r.ph);
        g.save();
        g.globalAlpha = r.a * (0.7 + 0.3 * sway) * (1 + this.flash);
        g.translate(r.x * w, -20);
        g.rotate(0.12 + sway * 0.05);
        g.drawImage(this.ray.cv, -60 * r.w, 0, 120 * r.w, h * 1.1);
        g.restore();
      }
      for (const b of this.bokeh) {
        g.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(b.ph));
        g.drawImage(this.bokehImg.cv, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      g.globalAlpha = 1;
      for (const p of this.snow) {
        g.fillStyle = `rgba(200,240,255,${0.22 + 0.18 * Math.sin(p.ph)})`;
        g.fillRect(p.x + Math.sin(p.ph) * 4, p.y, p.s, p.s);
      }
      for (const j of this.jellies) this.drawJelly(g, j, t);
      for (const b of this.bubbles) {
        const bx = b.x + Math.sin(b.ph) * 3;
        g.strokeStyle = 'rgba(190,240,255,0.4)'; g.lineWidth = 0.8;
        g.beginPath(); g.arc(bx, b.y, b.r, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath(); g.arc(bx - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    burst(d, B) {
      this.flash = Math.min(1.5, this.flash + 0.3 * d.lines);
      const n = Math.min(this.low ? 15 : 50, d.lines * (this.low ? 4 : 12));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        this.bubbles.push(this.newBubble(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c + rand(-6, 6)));
      }
      for (const j of this.jellies) j.vy -= 40 * d.lines;
    }
  }

  // =========================================================
  // 2 極光：雪山、湖面倒影、松林；光柱結構的極光帷幕會變色、湧動；流星
  // =========================================================
  const AURORA_PALETTES = [
    ['120,255,180', '90,255,150', '170,110,255'],
    ['90,240,255', '120,255,200', '255,120,210'],
    ['200,140,255', '120,255,190', '255,110,150'],
  ];
  class Aurora {
    constructor(low) { this.low = low; this.flash = 0; this.intensity = 0; this.surges = []; this.meteorTimer = 4; this.pal = 0; this.palT = 0; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      this.lake = h * 0.83;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#010309'], [0.45, '#03111f'], [0.78, '#0a2537'], [0.83, '#0d2a3a'], [1, '#02070c']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < (this.low ? 250 : 500); i++) {
        g.fillStyle = `rgba(230,240,255,${rand(0.12, 0.75)})`;
        const s = rand(0.5, 1.5); g.fillRect(rand(0, w), rand(0, this.lake * 0.85), s, s);
      }
      // 雪山（受極光微光照亮的稜線）
      const mountain = (base, amp, color, seed, rim) => {
        const pts = [];
        for (let x = -20; x <= w + 20; x += 12) pts.push([x, base - Math.abs(Math.sin(x * 0.006 + seed)) * amp - Math.sin(x * 0.021 + seed * 2) * amp * 0.25 - Math.abs(Math.sin(x * 0.05 + seed)) * amp * 0.08]);
        g.fillStyle = color;
        g.beginPath(); g.moveTo(-20, this.lake);
        for (const [x, y] of pts) g.lineTo(x, y);
        g.lineTo(w + 20, this.lake); g.closePath(); g.fill();
        if (rim) {
          g.strokeStyle = rim; g.lineWidth = 1.2;
          g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
          // 稜線下的雪光：沿稜線往下漸淡
          for (let k = 1; k <= 6; k++) {
            g.strokeStyle = `rgba(190,235,255,${0.07 - k * 0.01})`; g.lineWidth = 2;
            g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + k * 3) : g.moveTo(x, y + k * 3))); g.stroke();
          }
        }
      };
      mountain(this.lake - h * 0.02, h * 0.18, '#0b1a2a', 1.3, 'rgba(160,255,210,0.35)');
      mountain(this.lake, h * 0.09, '#050c15', 4.1, null);
      // 松林剪影
      g.fillStyle = '#02060a';
      for (let i = 0; i < 40; i++) {
        const x = rand(0, w), th = rand(10, 26) * sc, y = this.lake + 1;
        g.beginPath(); g.moveTo(x, y - th); g.lineTo(x - th * 0.28, y); g.lineTo(x + th * 0.28, y); g.fill();
      }
      g.fillStyle = 'rgba(2,6,10,1)'; g.fillRect(0, this.lake + 1, w, 2);
      // 光柱條紋素材（下緣亮、上緣漸淡並偏色）
      this.strips = [];
      for (const pal of AURORA_PALETTES) {
        const S = layer(4, 256);
        const gr = S.g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, `rgba(${pal[2]},0)`);
        gr.addColorStop(0.35, `rgba(${pal[2]},0.22)`);
        gr.addColorStop(0.7, `rgba(${pal[1]},0.6)`);
        gr.addColorStop(0.9, `rgba(${pal[0]},1)`);
        gr.addColorStop(0.96, 'rgba(235,255,250,0.85)');
        gr.addColorStop(1, `rgba(${pal[0]},0.15)`);
        S.g.fillStyle = gr; S.g.fillRect(0, 0, 4, 256);
        this.strips.push(S);
      }
      this.cs = 1 / 3;
      this.cbuf = document.createElement('canvas');
      this.cbuf.width = Math.max(1, Math.round(w * this.cs)); this.cbuf.height = Math.max(1, Math.round(h * this.cs));
      this.cg = this.cbuf.getContext('2d');
      this.cbuf2 = document.createElement('canvas');
      this.cbuf2.width = this.cbuf.width; this.cbuf2.height = this.cbuf.height;
      this.cg2 = this.cbuf2.getContext('2d');
      this.ribbons = [
        { base: 0.34, hgt: 0.34, sp: 1, ph: 0, amp: 0.06 },
        { base: 0.24, hgt: 0.24, sp: 0.7, ph: 2, amp: 0.045 },
        { base: 0.44, hgt: 0.22, sp: 1.3, ph: 4, amp: 0.04 },
      ];
      if (this.low) this.ribbons.length = 2;
      this.mist = [];
      for (let i = 0; i < 4; i++) this.mist.push({ x: rand(0, w), y: this.lake - rand(0, 0.05) * h, r: rand(0.25, 0.45) * w, v: rand(3, 8) });
      this.bright = ['220,240,255', '180,255,220'].map(starSprite);
      this.bstars = [];
      for (let i = 0; i < 14; i++) this.bstars.push({ x: rand(0, w), y: rand(0, this.lake * 0.6), s: rand(6, 14) * sc, ph: rand(0, TAU), k: i % 2 });
      this.meteors = new Meteors(sc);
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      this.palT += s;
      if (this.palT > 18) { this.palT = 0; this.pal = (this.pal + 1) % AURORA_PALETTES.length; }
      // 湧動：沿光幕跑動的增亮波
      if (Math.random() < s * (0.15 + this.intensity * 0.12)) this.surges.push({ x: rand(-0.2, 0.2) * this.w, v: rand(120, 260) * this.sc * (Math.random() < 0.5 ? 1 : -1), t: 0, r: rand(0, this.ribbons.length) | 0 });
      for (const sg of this.surges) { sg.t += s; sg.x += sg.v * s; }
      this.surges = this.surges.filter((sg) => sg.t < 4);
      for (const m of this.mist) { m.x += m.v * s; if (m.x - m.r > this.w) m.x = -m.r; }
      for (const b of this.bstars) b.ph += s * 1.2;
      this.meteorTimer -= s;
      if (this.meteorTimer <= 0) { this.meteors.random(this.w, this.lake, false); this.meteorTimer = rand(4, 9) / (1 + this.intensity * 0.25); }
      this.meteors.update(s);
    }
    drawCurtains(g, t, beat) {
      const S = this.cs;
      const w = this.w * S, h = this.h * S, ts = t / 1000;
      const step = this.low ? 2 : 1;
      const bright = 0.7 + beat * 0.25 + this.flash * 0.6 + this.intensity * 0.06;
      const palNext = (this.pal + 1) % AURORA_PALETTES.length;
      const mixK = Math.max(0, (this.palT - 14) / 4);
      this.ribbons.forEach((r, ri) => {
        const hh = r.hgt * h * (1 + this.flash * 0.25 + this.intensity * 0.03);
        for (let x = 0; x < w; x += step) {
          const X = x / S;
          const fold = Math.sin(X * 0.0045 + ts * 0.32 * r.sp + r.ph) * h * r.amp + Math.sin(X * 0.013 - ts * 0.55 * r.sp + r.ph * 2) * h * r.amp * 0.4;
          const y = r.base * h + fold;
          // 光柱結構：細碎、緩慢移動的亮度起伏
          const rays = 0.68 + 0.32 * Math.sin(X * 0.06 + ts * 1.5 + ri) * Math.sin(X * 0.021 - ts * 0.9);
          let a = (0.38 + 0.3 * Math.sin(X * 0.011 + ts * 0.8 * r.sp + r.ph)) * rays * bright;
          for (const sg of this.surges) if (sg.r === ri) { const d = Math.abs(X - sg.x); if (d < 80 * this.sc) a += (1 - d / (80 * this.sc)) * 0.6 * (1 - sg.t / 4); }
          if (a <= 0.02) continue;
          const len = hh * (0.75 + 0.35 * rays);
          g.globalAlpha = Math.min(1, a * (1 - mixK));
          g.drawImage(this.strips[this.pal].cv, x, Math.round(y - len), step, Math.round(len));
          if (mixK > 0) { g.globalAlpha = Math.min(1, a * mixK); g.drawImage(this.strips[palNext].cv, x, Math.round(y - len), step, Math.round(len)); }
        }
      });
      g.globalAlpha = 1;
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 先畫到低解析緩衝，再放大：光幕自然柔化
      const cg = this.cg;
      cg.globalCompositeOperation = 'source-over';
      cg.clearRect(0, 0, this.cbuf.width, this.cbuf.height);
      cg.globalCompositeOperation = 'lighter';
      this.drawCurtains(cg, t, beat);
      // 輕微模糊，讓光幕像雲霧般柔和
      const cg2 = this.cg2;
      cg2.clearRect(0, 0, this.cbuf2.width, this.cbuf2.height);
      cg2.filter = 'blur(1.6px)';
      cg2.drawImage(this.cbuf, 0, 0);
      cg2.filter = 'none';
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bstars) {
        const tw = 0.6 + 0.4 * Math.sin(b.ph);
        g.globalAlpha = tw;
        g.drawImage(this.bright[b.k].cv, b.x - b.s, b.y - b.s, b.s * 2, b.s * 2);
      }
      g.globalAlpha = 1;
      g.drawImage(this.cbuf2, 0, 0, w, h);
      g.globalAlpha = 0.5;
      g.drawImage(this.cbuf, 0, 0, w, h);
      // 湖面倒影
      g.save();
      g.beginPath(); g.rect(0, this.lake + 2, w, h - this.lake); g.clip();
      g.translate(0, this.lake + 2); g.scale(1, -0.3);
      g.globalAlpha = 0.4;
      g.drawImage(this.cbuf2, 0, -this.lake, w, h);
      g.restore();
      g.globalAlpha = 1;
      // 水面波紋
      g.strokeStyle = 'rgba(180,255,220,0.08)'; g.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const y = this.lake + 6 + i * (h - this.lake) / 10;
        g.beginPath(); g.moveTo(0, y + Math.sin(t / 800 + i) * 1.5); g.lineTo(w, y + Math.sin(t / 700 + i * 2) * 1.5); g.stroke();
      }
      for (const m of this.mist) glow(g, m.x, m.y, m.r, '160,220,220', 0.06);
      g.globalCompositeOperation = 'source-over';
      this.meteors.draw(g);
    }
    burst(d) {
      this.flash = Math.min(1.5, this.flash + 0.2 * d.lines + (d.lines >= 4 ? 0.5 : 0));
      for (let i = 0; i < d.lines; i++) this.surges.push({ x: rand(0, 1) * this.w, v: rand(160, 300) * this.sc * (Math.random() < 0.5 ? 1 : -1), t: 0, r: i % this.ribbons.length });
      if (d.lines >= 4) for (let i = 0; i < 3; i++) this.meteors.random(this.w, this.lake, true);
    }
  }

  // =========================================================
  // 3 霓虹都市：合成器浪潮夕陽、天際線、透視網格地板
  // =========================================================
  class NeonCity {
    constructor(low) { this.low = low; this.scroll = 0; this.warp = 0; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const hy = (this.hy = h * 0.6);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, hy, [[0, '#07011a'], [0.45, '#22073f'], [0.8, '#5c0f58'], [1, '#c52a78']]);
      g.fillRect(0, 0, w, hy);
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(255,220,255,${rand(0.1, 0.5)})`;
        g.fillRect(rand(0, w), rand(0, hy * 0.6), 1, 1);
      }
      // 太陽
      const R = Math.min(w, h) * 0.24;
      const sx = w / 2, sy = hy - R * 0.25;
      glow(g, sx, sy, R * 2.4, '255,80,160', 0.35);
      const S = layer(R * 2 + 4, R * 2 + 4);
      const sg = S.g;
      const sgr = sg.createLinearGradient(0, 0, 0, R * 2);
      sgr.addColorStop(0, '#ffe66b'); sgr.addColorStop(0.55, '#ff8a4c'); sgr.addColorStop(1, '#ff2d8b');
      sg.fillStyle = sgr;
      sg.beginPath(); sg.arc(R + 2, R + 2, R, 0, TAU); sg.fill();
      sg.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 7; i++) {
        const yy = R + 2 + R * (0.15 + i * 0.13);
        sg.fillRect(0, yy, R * 2 + 4, 2 + i * 1.3);
      }
      g.drawImage(S.cv, sx - R - 2, sy - R - 2, R * 2 + 4, R * 2 + 4);
      // 天際線（兩層）
      const skyline = (color, minH, maxH, windows) => {
        let x = -10;
        while (x < w + 10) {
          const bw = rand(18, 48), bh = rand(minH, maxH) * h;
          g.fillStyle = color;
          g.fillRect(x, hy - bh, bw, bh);
          if (Math.random() < 0.3) g.fillRect(x + bw * 0.4, hy - bh - rand(6, 20), 2, 20);
          if (windows) {
            for (let wy = hy - bh + 6; wy < hy - 4; wy += 7) {
              for (let wx = x + 4; wx < x + bw - 4; wx += 6) {
                if (Math.random() < 0.28) {
                  g.fillStyle = Math.random() < 0.5 ? 'rgba(80,230,255,0.75)' : 'rgba(255,110,220,0.7)';
                  g.fillRect(wx, wy, 2.5, 3);
                }
              }
            }
          }
          x += bw + rand(0, 6);
        }
      };
      skyline('#2a0a44', 0.08, 0.2, false);
      skyline('#0d0320', 0.04, 0.14, true);
      // 地面
      g.fillStyle = vgrad(g, h, [[0, '#000'], [hy / h, '#1a0330'], [1, '#05000d']]);
      g.fillRect(0, hy, w, h - hy);
      g.fillStyle = 'rgba(255,90,200,0.9)';
      g.fillRect(0, hy - 1, w, 2);
    }
    update(dt) {
      const s = dt / 1000;
      this.warp *= Math.pow(0.2, s);
      this.flash *= Math.pow(0.1, s);
      this.scroll = (this.scroll + s * (0.35 + this.warp * 2.5)) % 1;
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, hy = this.hy;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const vx = w / 2;
      const a0 = 0.35 + beat * 0.45 + this.flash * 0.5;
      const N = this.low ? 10 : 16;
      // 橫線（往觀者移動）
      for (let i = 0; i < N; i++) {
        const z = (i + this.scroll) / N;
        const y = hy + (h - hy) * Math.pow(z, 2.3);
        const a = a0 * z;
        g.fillStyle = `rgba(255,70,210,${a * 0.35})`; g.fillRect(0, y - 2, w, 4);
        g.fillStyle = `rgba(255,140,240,${a})`; g.fillRect(0, y - 0.5, w, 1.2);
      }
      // 縱線（往消失點收斂）
      g.lineWidth = 1.2;
      for (let k = -10; k <= 10; k++) {
        const bx = vx + k * w * 0.16;
        g.strokeStyle = `rgba(90,220,255,${a0 * 0.55})`;
        g.beginPath(); g.moveTo(vx + k * w * 0.012, hy); g.lineTo(bx, h); g.stroke();
      }
      glow(g, vx, hy, w * 0.6, '255,60,170', 0.12 + beat * 0.12 + this.flash * 0.2);
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) {
      this.warp = Math.min(1.5, this.warp + 0.25 * d.lines + (d.lines >= 4 ? 0.6 : 0));
      this.flash = Math.min(1.5, this.flash + 0.3 * d.lines);
    }
  }

  // =========================================================
  // 4 櫻花：月夜、遠山、枝頭與翻飛的花瓣
  // =========================================================
  class Sakura {
    constructor(low) { this.low = low; this.wind = 0; this.extra = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#120822'], [0.5, '#3e1946'], [0.82, '#94406e'], [1, '#d77a9a']]);
      g.fillRect(0, 0, w, h);
      const mx = w * 0.84, my = h * 0.05, mr = Math.min(w, h) * 0.06;
      glow(g, mx, my, mr * 5, '255,220,235', 0.25);
      g.fillStyle = '#fff3ea';
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(230,200,210,0.35)';
      g.beginPath(); g.arc(mx - mr * 0.3, my + mr * 0.15, mr * 0.22, 0, TAU); g.fill();
      // 遠山
      g.fillStyle = 'rgba(60,24,70,0.9)';
      g.beginPath(); g.moveTo(0, h * 0.86); g.lineTo(w * 0.32, h * 0.86); g.lineTo(w * 0.52, h * 0.66); g.lineTo(w * 0.72, h * 0.86); g.lineTo(w, h * 0.86); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = 'rgba(255,235,245,0.45)';
      g.beginPath(); g.moveTo(w * 0.47, h * 0.705); g.lineTo(w * 0.52, h * 0.66); g.lineTo(w * 0.57, h * 0.705); g.lineTo(w * 0.54, h * 0.698); g.lineTo(w * 0.52, h * 0.712); g.lineTo(w * 0.5, h * 0.698); g.fill();
      g.fillStyle = '#1e0b26';
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w + 20; x += 20) g.lineTo(x, h * 0.92 - Math.sin(x * 0.01) * h * 0.02);
      g.lineTo(w, h); g.fill();
      // 枝頭
      const branch = (x0, y0, ang, len, wid, depth) => {
        if (depth <= 0 || len < 8) {
          for (let i = 0; i < 6; i++) {
            g.fillStyle = ['rgba(255,183,208,0.9)', 'rgba(255,158,194,0.85)', 'rgba(255,214,230,0.9)'][i % 3];
            g.beginPath(); g.arc(x0 + rand(-10, 10), y0 + rand(-10, 10), rand(2.5, 6), 0, TAU); g.fill();
          }
          return;
        }
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.strokeStyle = '#1a0816'; g.lineWidth = wid; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0);
        g.quadraticCurveTo((x0 + x1) / 2 + rand(-10, 10), (y0 + y1) / 2 + rand(-10, 10), x1, y1); g.stroke();
        branch(x1, y1, ang + rand(0.2, 0.6), len * rand(0.6, 0.75), wid * 0.65, depth - 1);
        branch(x1, y1, ang - rand(0.2, 0.6), len * rand(0.6, 0.75), wid * 0.65, depth - 1);
      };
      const bl = Math.min(w, h) * 0.2;
      branch(-10, h * 0.015, 0.12, bl, 8, 4);
      branch(w + 10, h * 0.03, Math.PI - 0.15, bl * 0.8, 6, 4);
      // 花瓣素材
      const P = (this.petal = layer(24, 16));
      const pg = P.g;
      const pgr = pg.createLinearGradient(0, 0, 24, 16);
      pgr.addColorStop(0, '#ffe3ee'); pgr.addColorStop(1, '#ff8fb8');
      pg.fillStyle = pgr;
      pg.beginPath(); pg.moveTo(2, 8); pg.quadraticCurveTo(8, 0, 20, 3); pg.lineTo(17, 8); pg.lineTo(20, 13); pg.quadraticCurveTo(8, 16, 2, 8); pg.fill();
      this.petals = [];
      for (let i = 0; i < (this.low ? 25 : 65); i++) this.petals.push(this.newPetal(true));
    }
    newPetal(anywhere, x, y) {
      return {
        x: x != null ? x : rand(-0.2, 1) * this.w, y: y != null ? y : anywhere ? rand(0, this.h) : rand(-40, -10),
        vx: rand(12, 40), vy: rand(20, 50), rot: rand(0, TAU), vr: rand(-2, 2), flip: rand(0, TAU), vf: rand(1.5, 4), s: rand(0.5, 1.1),
      };
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      const upd = (p) => {
        p.x += (p.vx + this.wind) * s; p.y += p.vy * s; p.rot += p.vr * s; p.flip += p.vf * s;
      };
      for (const p of this.petals) {
        upd(p);
        if (p.y > this.h + 20 || p.x > this.w + 30) Object.assign(p, this.newPetal(false));
      }
      for (const p of this.extra) { upd(p); p.vy += 30 * s; }
      this.extra = this.extra.filter((p) => p.y < this.h + 20 && p.x < this.w + 40);
    }
    draw(g, t, beat, B) {
      g.drawImage(this.bg.cv, 0, 0, this.w, this.h);
      g.globalCompositeOperation = 'lighter';
      glow(g, this.w * 0.84, this.h * 0.05, Math.min(this.w, this.h) * 0.3, '255,200,225', 0.06 + beat * 0.08);
      g.globalCompositeOperation = 'source-over';
      const img = this.petal.cv;
      const drawP = (p) => {
        g.save();
        g.translate(p.x, p.y); g.rotate(p.rot); g.scale(p.s, p.s * Math.cos(p.flip));
        g.drawImage(img, -12, -8, 24, 16);
        g.restore();
      };
      g.globalAlpha = 0.9;
      for (const p of this.petals) drawP(p);
      for (const p of this.extra) drawP(p);
      g.globalAlpha = 1;
    }
    burst(d, B) {
      this.wind = Math.min(400, this.wind + 60 * d.lines + (d.lines >= 4 ? 120 : 0));
      const n = Math.min(this.low ? 12 : 40, d.lines * (this.low ? 3 : 10));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        const p = this.newPetal(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c);
        p.vx = rand(60, 220); p.vy = rand(-90, 10);
        this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 5 夕陽雲海：落日、多層雲海、飛鳥
  // =========================================================
  class Sunset {
    constructor(low) { this.low = low; this.flash = 0; this.off = [0, 0, 0]; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#170f3c'], [0.3, '#4b2468'], [0.5, '#c8506f'], [0.6, '#ff935c'], [0.66, '#ffd08a'], [0.72, '#c86a72'], [1, '#2a1636']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,240,255,${rand(0.1, 0.5)})`;
        g.fillRect(rand(0, w), rand(0, h * 0.3), 1, 1);
      }
      this.sun = { x: w * 0.5, y: h * 0.64, r: Math.min(w, h) * 0.11 };
      glow(g, this.sun.x, this.sun.y, Math.max(w, h) * 0.55, '255,160,90', 0.4);
      g.fillStyle = '#fff1c8';
      g.beginPath(); g.arc(this.sun.x, this.sun.y, this.sun.r, 0, TAU); g.fill();
      // 雲層
      const cloud = (yRatio, top, bottom, scale, count) => {
        const C = layer(w * 2, h * 0.4);
        const cg = C.g;
        const ch = h * 0.4;
        for (let i = 0; i < count; i++) {
          const x = (i / count) * w * 2 + rand(-20, 20);
          const y = ch * rand(0.35, 0.6);
          const r = rand(30, 70) * scale;
          const gr = cg.createLinearGradient(0, y - r, 0, y + r);
          gr.addColorStop(0, top); gr.addColorStop(1, bottom);
          cg.fillStyle = gr;
          cg.beginPath(); cg.arc(x, y, r, 0, TAU); cg.fill();
          if (x < r * 2) { cg.beginPath(); cg.arc(x + w * 2, y, r, 0, TAU); cg.fill(); }
        }
        cg.fillStyle = bottom;
        cg.fillRect(0, ch * 0.6, w * 2, ch * 0.4);
        return { L: C, y: yRatio * h };
      };
      this.clouds = [
        cloud(0.52, 'rgba(255,190,150,0.9)', 'rgba(170,80,120,0.95)', 0.8, 28),
        cloud(0.62, 'rgba(255,170,140,0.95)', 'rgba(120,55,105,1)', 1.1, 22),
        cloud(0.74, 'rgba(230,130,130,1)', 'rgba(60,28,70,1)', 1.5, 16),
      ];
      this.birds = [];
      for (let i = 0; i < (this.low ? 3 : 6); i++) this.birds.push({ x: rand(0, w), y: rand(0.15, 0.45) * h, v: rand(15, 35), ph: rand(0, TAU), s: rand(0.6, 1.2) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      const sp = [6, 14, 28];
      for (let i = 0; i < 3; i++) this.off[i] = (this.off[i] + sp[i] * s * (1 + this.flash)) % (this.w * 2);
      for (const b of this.birds) { b.x += b.v * s; b.ph += s * 7; if (b.x > this.w + 20) { b.x = -20; b.y = rand(0.15, 0.45) * this.h; } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const sun = this.sun;
      g.save();
      g.translate(sun.x, sun.y);
      g.rotate(t / 20000);
      g.fillStyle = `rgba(255,220,170,${0.04 + beat * 0.03 + this.flash * 0.05})`;
      for (let i = 0; i < 10; i++) {
        g.rotate(TAU / 10);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(w, h), -30); g.lineTo(Math.max(w, h), 30); g.fill();
      }
      g.restore();
      glow(g, sun.x, sun.y, sun.r * 3, '255,220,160', 0.25 + beat * 0.2 + this.flash * 0.3);
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) {
        const c = this.clouds[i];
        const x = -this.off[i];
        g.drawImage(c.L.cv, x, c.y - h * 0.2, w * 2, h * 0.4);
        g.drawImage(c.L.cv, x + w * 2, c.y - h * 0.2, w * 2, h * 0.4);
      }
      g.fillStyle = 'rgba(40,15,40,0.85)';
      for (const b of this.birds) {
        const k = b.s * 1.8 * (Math.min(this.w, this.h) / 412);
        const f = Math.sin(b.ph) * 7 * k;
        g.beginPath();
        g.moveTo(b.x - 12 * k, b.y - f);
        g.quadraticCurveTo(b.x - 6 * k, b.y - f * 0.4 - 2 * k, b.x - 1.5 * k, b.y - 0.5 * k);
        g.lineTo(b.x + 3 * k, b.y - 0.8 * k);
        g.lineTo(b.x + 1.5 * k, b.y - 0.5 * k);
        g.quadraticCurveTo(b.x + 6 * k, b.y - f * 0.4 - 2 * k, b.x + 12 * k, b.y - f);
        g.quadraticCurveTo(b.x + 6 * k, b.y - f * 0.2 + 1.5 * k, b.x, b.y + 2 * k);
        g.quadraticCurveTo(b.x - 6 * k, b.y - f * 0.2 + 1.5 * k, b.x - 12 * k, b.y - f);
        g.fill();
      }
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  // =========================================================
  // 水墨：宣紙、層層煙雲遠山、朱紅日、白鶴、紅梅；消行時墨跡暈開
  // =========================================================
  class InkWash {
    constructor(low) { this.low = low; this.splats = []; this.bloomScale = 0.12; this.mistOff = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#f1ebdf'], [0.6, '#e8e0cf'], [1, '#d9cfba']]);
      g.fillRect(0, 0, w, h);
      // 紙紋
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(110,90,60,${rand(0.015, 0.05)})`;
        g.fillRect(rand(0, w), rand(0, h), rand(0.5, 2), rand(0.5, 1.5));
      }
      g.strokeStyle = 'rgba(120,100,70,0.05)'; g.lineWidth = 0.6;
      for (let i = 0; i < 80; i++) {
        const x = rand(0, w), y = rand(0, h);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rand(-20, 20), y + rand(-10, 10), x + rand(-40, 40), y + rand(-6, 6)); g.stroke();
      }
      // 朱紅日
      const sx = w * 0.76, sy = h * 0.13, sr = Math.min(w, h) * 0.075;
      glow(g, sx, sy, sr * 2.2, '200,55,45', 0.12);
      g.fillStyle = 'rgba(196,50,40,0.88)';
      g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
      // 遠山（越遠越淡、山腳被雲霧吃掉）
      const mountains = [
        { base: 0.42, amp: 0.16, a: 0.16, seed: 1.7 },
        { base: 0.55, amp: 0.17, a: 0.28, seed: 4.2 },
        { base: 0.7, amp: 0.15, a: 0.48, seed: 7.9 },
        { base: 0.86, amp: 0.13, a: 0.75, seed: 2.3 },
      ];
      for (const m of mountains) {
        const base = m.base * h, amp = m.amp * h;
        const pts = [];
        let top = h;
        for (let x = -10; x <= w + 10; x += 6) {
          const y = base - amp * (0.55 * Math.pow(Math.abs(Math.sin(x * 0.0065 + m.seed)), 1.6)
            + 0.3 * Math.abs(Math.sin(x * 0.017 + m.seed * 3)) + 0.15 * Math.sin(x * 0.047 + m.seed));
          pts.push([x, y]); top = Math.min(top, y);
        }
        const gr = g.createLinearGradient(0, top, 0, base + h * 0.12);
        gr.addColorStop(0, `rgba(25,28,34,${m.a})`);
        gr.addColorStop(0.55, `rgba(40,44,50,${m.a * 0.55})`);
        gr.addColorStop(1, 'rgba(60,60,60,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-10, h);
        for (const [x, y] of pts) g.lineTo(x, y);
        g.lineTo(w + 10, h); g.closePath(); g.fill();
        // 乾筆皴擦
        g.strokeStyle = `rgba(20,20,26,${m.a * 0.5})`; g.lineWidth = 1;
        for (let i = 0; i < pts.length; i += 3) {
          const [x, y] = pts[i];
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-3, 3), y + rand(6, 22) * (0.5 + m.a)); g.stroke();
        }
      }
      // 近景松樹（左下）
      const tx = w * 0.06, ty = h;
      g.strokeStyle = 'rgba(18,18,22,0.85)'; g.lineCap = 'round';
      g.lineWidth = 7; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + w * 0.08, h * 0.86, tx + w * 0.02, h * 0.74); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(tx + w * 0.04, h * 0.82); g.quadraticCurveTo(tx + w * 0.12, h * 0.79, tx + w * 0.18, h * 0.8); g.stroke();
      g.fillStyle = 'rgba(18,22,20,0.8)';
      for (const [cx, cy, rx] of [[tx + w * 0.02, h * 0.73, 0.07], [tx + w * 0.18, h * 0.79, 0.06], [tx + w * 0.08, h * 0.77, 0.05]]) {
        for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + rand(-8, 8), cy + rand(-3, 3), rx * w * rand(0.5, 1), 4, rand(-0.15, 0.15), 0, TAU); g.fill(); }
      }
      // 扁舟
      const bxp = w * 0.8, byp = h * 0.93;
      g.fillStyle = 'rgba(20,20,24,0.8)';
      g.beginPath(); g.moveTo(bxp - 22, byp); g.quadraticCurveTo(bxp, byp + 8, bxp + 22, byp); g.lineTo(bxp + 16, byp + 3); g.lineTo(bxp - 16, byp + 3); g.fill();
      g.fillRect(bxp - 2, byp - 12, 2, 12);
      g.strokeStyle = 'rgba(30,30,36,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(bxp - 30 + i * 6, byp + 7 + i * 3); g.lineTo(bxp + 20 - i * 4, byp + 7 + i * 3); g.stroke(); }
      // 動態元素
      this.mists = [];
      for (let i = 0; i < (this.low ? 3 : 5); i++) this.mists.push({ y: rand(0.4, 0.95) * h, w: rand(0.6, 1.2) * w, h: rand(0.05, 0.1) * h, x: rand(0, w), v: rand(4, 12), a: rand(0.35, 0.6) });
      this.cranes = [];
      for (let i = 0; i < 3; i++) this.cranes.push({ x: rand(0, w), y: rand(0.12, 0.35) * h, v: rand(14, 26), ph: rand(0, TAU), s: rand(0.8, 1.3) });
      this.petals = [];
      this.plum = plumSprite(); this.plumPetal = petalSprite('#f4a6ae', '#c42a37');
      const psc = Math.min(w, h) / 412;
      for (let i = 0; i < (this.low ? 10 : 20); i++) this.petals.push({ x: rand(0, w), y: rand(0, h), vx: rand(8, 22), vy: rand(14, 30), r: (Math.random() < 0.35 ? rand(13, 18) : rand(7, 10)) * psc, ph: rand(0, TAU), rot: rand(0, TAU), vr: rand(-1.5, 1.5) });
    }
    update(dt) {
      const s = dt / 1000;
      for (const m of this.mists) { m.x += m.v * s; if (m.x - m.w > this.w) m.x = -m.w * 0.5; }
      for (const c of this.cranes) { c.x += c.v * s; c.ph += s * 3.2; if (c.x > this.w + 40) { c.x = -40; c.y = rand(0.12, 0.35) * this.h; } }
      for (const p of this.petals) { p.x += p.vx * s; p.y += p.vy * s; p.ph += s * 2; if (p.y > this.h || p.x > this.w + 10) { p.x = rand(-0.2, 0.9) * this.w; p.y = -10; } }
      for (const sp of this.splats) sp.t += s;
      this.splats = this.splats.filter((sp) => sp.t < sp.life);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 墨跡暈開
      for (const sp of this.splats) {
        const k = sp.t / sp.life;
        const r = sp.r * (1 - Math.pow(1 - Math.min(1, k * 3), 3));
        const a = sp.a * (1 - k);
        for (const [ox, oy, rr] of sp.blobs) {
          const gr = g.createRadialGradient(sp.x + ox * r, sp.y + oy * r, 0, sp.x + ox * r, sp.y + oy * r, r * rr);
          gr.addColorStop(0, `rgba(15,15,20,${a})`); gr.addColorStop(0.7, `rgba(15,15,20,${a * 0.6})`); gr.addColorStop(1, 'rgba(15,15,20,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(sp.x + ox * r, sp.y + oy * r, r * rr, 0, TAU); g.fill();
        }
      }
      // 雲霧
      for (const m of this.mists) {
        const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.w * 0.5);
        gr.addColorStop(0, `rgba(245,240,230,${m.a})`); gr.addColorStop(1, 'rgba(245,240,230,0)');
        g.save(); g.translate(m.x, m.y); g.scale(1, m.h / (m.w * 0.5)); g.translate(-m.x, -m.y);
        g.fillStyle = gr; g.fillRect(m.x - m.w * 0.5, m.y - m.w * 0.5, m.w, m.w);
        g.restore();
      }
      // 白鶴（墨線）
      g.strokeStyle = 'rgba(20,20,25,0.8)'; g.lineCap = 'round'; g.lineWidth = 1.6;
      for (const c of this.cranes) {
        const f = Math.sin(c.ph) * 7 * c.s;
        g.beginPath();
        g.moveTo(c.x - 12 * c.s, c.y - f); g.quadraticCurveTo(c.x - 5 * c.s, c.y - f * 0.3 - 2, c.x, c.y);
        g.quadraticCurveTo(c.x + 5 * c.s, c.y - f * 0.3 - 2, c.x + 12 * c.s, c.y - f);
        g.moveTo(c.x, c.y); g.lineTo(c.x + 9 * c.s, c.y + 1); g.stroke();
        g.fillStyle = 'rgba(190,40,35,0.9)'; g.fillRect(c.x + 9 * c.s, c.y - 0.5, 2, 2);
      }
      // 紅梅：整朵梅花與單片花瓣
      for (const p of this.petals) {
        g.save();
        g.translate(p.x + Math.sin(p.ph) * 5, p.y); g.rotate(p.rot + p.ph * 0.5 * p.vr);
        g.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.ph)));
        const img = p.r > 12 * (Math.min(w, h) / 412) ? this.plum.cv : this.plumPetal.cv;
        const sz = p.r;
        if (img === this.plum.cv) g.drawImage(img, -sz, -sz, sz * 2, sz * 2);
        else g.drawImage(img, -sz, -sz * 0.7, sz * 2, sz * 1.4);
        g.restore();
      }
      // 節拍：朱日微微發亮
      g.fillStyle = `rgba(210,60,45,${beat * 0.18})`;
      g.beginPath(); g.arc(w * 0.76, h * 0.13, Math.min(w, h) * 0.085, 0, TAU); g.fill();
    }
    burst(d, B) {
      const n = Math.min(6, d.lines + (d.lines >= 4 ? 2 : 0));
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const blobs = [];
        for (let k = 0; k < 5; k++) blobs.push([rand(-0.5, 0.5), rand(-0.5, 0.5), rand(0.35, 0.8)]);
        this.splats.push({
          x: B.cx + side * (B.w * 0.5 + rand(10, Math.max(20, (this.w - B.w) * 0.5))) * rand(0.6, 1),
          y: B.y + rand(0.1, 0.95) * B.h, r: rand(40, 90) * (d.lines >= 4 ? 1.4 : 1), a: 0.55, t: 0, life: 2.4, blobs,
        });
      }
      if (this.splats.length > 14) this.splats.splice(0, this.splats.length - 14);
    }
  }

  // =========================================================
  // 燈節：夜空、宮殿飛簷、宮燈（透光漸層、竹骨、金帽、流蘇）、天燈、煙火
  // =========================================================
  function lanternSprite() {
    // 以 2 倍解析度繪製 60×78 的宮燈
    const S = layer(120, 156);
    const g = S.g;
    g.scale(2, 2);
    const cx = 30, cy = 40, rx = 27, ry = 28;
    // 吊鉤
    g.strokeStyle = '#d8a84a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, 7); g.stroke();
    const cap = (y) => {
      const gr = g.createLinearGradient(cx - 13, 0, cx + 13, 0);
      gr.addColorStop(0, '#5e3509'); gr.addColorStop(0.3, '#f6d685'); gr.addColorStop(0.55, '#b98326'); gr.addColorStop(0.8, '#f3cf7a'); gr.addColorStop(1, '#5e3509');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx - 13, y); g.lineTo(cx + 13, y); g.lineTo(cx + 11, y + 6); g.lineTo(cx - 11, y + 6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,240,190,0.5)'; g.fillRect(cx - 12, y + 1, 24, 0.8);
    };
    // 燈身：內部透光
    const body = g.createRadialGradient(cx, cy + 2, 0, cx, cy, ry);
    body.addColorStop(0, '#fff6c8'); body.addColorStop(0.2, '#ffd06a'); body.addColorStop(0.45, '#ff6a32');
    body.addColorStop(0.75, '#cf1d1d'); body.addColorStop(1, '#6e0a12');
    g.fillStyle = body;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.clip();
    // 竹骨
    for (let k = -3; k <= 3; k++) {
      g.strokeStyle = 'rgba(110,10,15,0.45)'; g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(cx, cy, Math.abs(k) / 3.4 * rx + 0.01, ry, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,190,130,0.14)'; g.lineWidth = 0.6;
      g.beginPath(); g.ellipse(cx - 0.8, cy, Math.abs(k) / 3.4 * rx + 0.01, ry, 0, 0, TAU); g.stroke();
    }
    // 左右邊緣變暗，做出立體感
    const side = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
    side.addColorStop(0, 'rgba(50,0,5,0.55)'); side.addColorStop(0.28, 'rgba(50,0,5,0)'); side.addColorStop(0.72, 'rgba(50,0,5,0)'); side.addColorStop(1, 'rgba(50,0,5,0.6)');
    g.fillStyle = side; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    // 福字
    g.font = '700 17px "Noto Serif TC", "Songti TC", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,214,120,0.9)';
    g.fillText('福', cx, cy + 1);
    // 高光
    const hl = g.createRadialGradient(cx - 9, cy - 13, 0, cx - 9, cy - 13, 11);
    hl.addColorStop(0, 'rgba(255,255,255,0.4)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(cx - 22, cy - 26, 26, 26);
    g.restore();
    g.strokeStyle = 'rgba(90,5,10,0.65)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();
    cap(7); cap(66);
    return S;
  }

  class Lantern {
    constructor(low) { this.low = low; this.fw = []; this.fwTimer = 2; }
    resize(w, h) {
      this.w = w; this.h = h;
      this.sc = Math.min(w, h) / 412;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#06051a'], [0.45, '#1a0a31'], [0.78, '#55142d'], [0.86, '#86282a'], [1, '#110408']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        g.fillStyle = `rgba(255,235,210,${rand(0.08, 0.45)})`;
        g.fillRect(rand(0, w), rand(0, h * 0.5), 1, 1);
      }
      glow(g, w * 0.5, h * 0.9, w * 0.85, '255,120,60', 0.28);
      // 宮殿剪影（飛簷、斗拱的層次）
      const roof = (cx, baseY, width, height, tiers, color) => {
        let y = baseY;
        for (let k = 0; k < tiers; k++) {
          const ww = width * (1 - k * 0.22), hh = height;
          g.fillStyle = color;
          g.fillRect(cx - ww * 0.36, y - hh * 0.9, ww * 0.72, hh * 0.9);
          for (let wx = cx - ww * 0.32; wx < cx + ww * 0.32; wx += 8) {
            if (Math.random() < 0.55) {
              const wg = g.createLinearGradient(0, y - hh * 0.62, 0, y - hh * 0.2);
              wg.addColorStop(0, `rgba(255,${rand(170, 210) | 0},110,0.85)`); wg.addColorStop(1, 'rgba(255,120,40,0.5)');
              g.fillStyle = wg; g.fillRect(wx, y - hh * 0.62, 4, hh * 0.42);
            }
          }
          g.fillStyle = color;
          g.beginPath();
          g.moveTo(cx - ww * 0.64, y - hh * 0.98);
          g.quadraticCurveTo(cx - ww * 0.46, y - hh * 1.02, cx - ww * 0.3, y - hh * 1.48);
          g.lineTo(cx + ww * 0.3, y - hh * 1.48);
          g.quadraticCurveTo(cx + ww * 0.46, y - hh * 1.02, cx + ww * 0.64, y - hh * 0.98);
          g.lineTo(cx + ww * 0.6, y - hh * 0.86); g.lineTo(cx - ww * 0.6, y - hh * 0.86); g.fill();
          g.strokeStyle = 'rgba(255,150,80,0.25)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(cx - ww * 0.62, y - hh * 0.97); g.quadraticCurveTo(cx - ww * 0.46, y - hh * 1.0, cx - ww * 0.3, y - hh * 1.46); g.stroke();
          y -= hh * 1.38;
        }
      };
      const gy = h * 0.93;
      roof(w * 0.12, gy - h * 0.03, w * 0.32, h * 0.035, 1, '#1d0610');
      roof(w * 0.9, gy - h * 0.025, w * 0.28, h * 0.03, 2, '#1d0610');
      roof(w * 0.2, gy, w * 0.42, h * 0.05, 2, '#0f0308');
      roof(w * 0.78, gy, w * 0.36, h * 0.045, 4, '#0f0308');
      roof(w * 0.5, gy + 4, w * 0.5, h * 0.035, 1, '#0f0308');
      g.fillStyle = '#0a0205'; g.fillRect(0, gy, w, h - gy);
      this.lantern = lanternSprite();
      // 天燈
      const K = (this.sky = layer(28, 36));
      const kg = K.g;
      const kgr = kg.createLinearGradient(0, 0, 0, 36);
      kgr.addColorStop(0, 'rgba(255,226,160,0.95)'); kgr.addColorStop(0.7, 'rgba(255,150,70,0.95)'); kgr.addColorStop(1, 'rgba(230,90,40,0.9)');
      kg.fillStyle = kgr; kg.beginPath(); kg.moveTo(4, 2); kg.quadraticCurveTo(14, -1, 24, 2); kg.lineTo(21, 32); kg.lineTo(7, 32); kg.closePath(); kg.fill();
      kg.strokeStyle = 'rgba(160,60,20,0.35)'; kg.lineWidth = 0.6;
      for (const x of [9, 14, 19]) { kg.beginPath(); kg.moveTo(x, 2); kg.lineTo(x + (x - 14) * 0.2, 32); kg.stroke(); }
      const fl = kg.createRadialGradient(14, 30, 0, 14, 30, 8);
      fl.addColorStop(0, 'rgba(255,255,220,1)'); fl.addColorStop(1, 'rgba(255,200,100,0)');
      kg.fillStyle = fl; kg.fillRect(4, 22, 20, 14);
      this.bokehImg = bokehSprite('255,150,70');
      this.bokehImg2 = bokehSprite('255,90,60');
      this.bokeh = [];
      for (let i = 0; i < (this.low ? 10 : 24); i++) this.bokeh.push({ x: rand(0, w), y: rand(0.15, 0.85) * h, r: rand(6, 22) * this.sc, a: rand(0.12, 0.35), ph: rand(0, TAU), k: Math.random() < 0.5 });
      this.strings = [{ y0: 0.02, y1: 0.035, sag: 0.03, n: 9 }];
      this.skies = [];
      for (let i = 0; i < (this.low ? 7 : 16); i++) this.skies.push({ x: rand(0, w), y: rand(0.2, 1.1) * h, z: rand(0.35, 1), ph: rand(0, TAU) });
    }
    firework(x, y, big) {
      const n = Math.round((this.low ? 26 : 64) * (big ? 1.4 : 1));
      const cols = ['255,210,90', '255,90,70', '255,150,200', '255,240,190', '140,220,255'];
      const col = cols[(Math.random() * cols.length) | 0];
      const sp = rand(70, 120) * (big ? 1.5 : 1) * this.sc;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.05, 0.05);
        const v = sp * rand(0.75, 1);
        this.fw.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(1.2, 1.7), max: 1.7, col, tw: rand(0, TAU) });
      }
      this.fw.push({ flash: true, x, y, life: 0.25, max: 0.25, r: sp * 0.9 });
    }
    update(dt) {
      const s = dt / 1000;
      for (const k of this.skies) { k.y -= (9 + 14 * k.z) * s; k.ph += s; if (k.y < -40) { k.y = this.h + 20; k.x = rand(0, this.w); } }
      for (const b of this.bokeh) b.ph += s * 0.8;
      for (const p of this.fw) {
        p.life -= s;
        if (p.flash) continue;
        p.px = p.x; p.py = p.y;
        p.vx *= Math.pow(0.35, s); p.vy = p.vy * Math.pow(0.35, s) + 38 * s * this.sc;
        p.x += p.vx * s; p.y += p.vy * s;
      }
      this.fw = this.fw.filter((p) => p.life > 0);
      this.fwTimer -= s;
      if (this.fwTimer <= 0) { this.fwTimer = rand(2.5, 5); this.firework(rand(0.1, 0.9) * this.w, rand(0.12, 0.4) * this.h, false); }
    }
    drawTassel(g, x, y, sway, t, i) {
      g.fillStyle = '#e8b24a';
      g.beginPath(); g.arc(x, y + 2, 2.2, 0, TAU); g.fill();
      g.lineWidth = 0.9;
      for (let k = 0; k < 9; k++) {
        const dx = (k - 4) * 0.8;
        const wv = Math.sin(t / 500 + k * 0.6 + i) * 1.4 - sway * 40;
        g.strokeStyle = k % 4 === 0 ? 'rgba(240,190,90,0.9)' : 'rgba(200,20,35,0.9)';
        g.beginPath(); g.moveTo(x + dx * 0.4, y + 4); g.quadraticCurveTo(x + dx + wv * 0.5, y + 14, x + dx + wv, y + 24); g.stroke();
      }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bokeh) {
        g.globalAlpha = b.a * (0.75 + 0.25 * Math.sin(b.ph));
        g.drawImage((b.k ? this.bokehImg : this.bokehImg2).cv, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      g.globalAlpha = 1;
      for (const k of this.skies) {
        const sx = k.x + Math.sin(k.ph) * 6, sz = (0.5 + k.z * 0.7) * this.sc;
        const fl = 0.85 + 0.15 * Math.sin(t / 120 + k.ph * 7);
        glow(g, sx, k.y + 26 * sz, 30 * sz, '255,150,60', 0.28 * k.z * fl);
        g.globalAlpha = 0.45 + k.z * 0.55;
        g.drawImage(this.sky.cv, sx - 14 * sz, k.y, 28 * sz, 36 * sz);
        g.globalAlpha = 1;
      }
      // 煙火（帶尾跡）
      g.lineCap = 'round';
      for (const p of this.fw) {
        const k = p.life / p.max;
        if (p.flash) { glow(g, p.x, p.y, p.r, '255,240,210', 0.5 * k); continue; }
        const tw = k < 0.35 ? 0.5 + 0.5 * Math.sin(t / 40 + p.tw) : 1;
        g.strokeStyle = `rgba(${k > 0.75 ? '255,250,230' : p.col},${Math.min(1, k * 1.5) * tw})`;
        g.lineWidth = 1.6 * this.sc;
        g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      // 宮燈串
      const ls = this.sc * 0.95;
      for (let si = 0; si < this.strings.length; si++) {
        const st = this.strings[si];
        const y0 = st.y0 * h, y1 = st.y1 * h, sag = st.sag * h;
        const yAt = (x) => { const k = x / w; return y0 + (y1 - y0) * k + sag * 4 * k * (1 - k); };
        g.strokeStyle = 'rgba(20,5,8,0.95)'; g.lineWidth = 1.6;
        g.beginPath(); for (let x = 0; x <= w; x += 8) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x))); g.stroke();
        for (let i = 0; i < st.n; i++) {
          const x = (i + 0.5) / st.n * w, y = yAt(x);
          if (x > B.x - 18 * ls && x < B.x + B.w + 18 * ls) continue; // 場地正後方不掛，避免干擾判讀
          const sway = Math.sin(t / 1100 + i * 1.3 + si) * 0.06 + beat * 0.05 * (i % 2 ? 1 : -1);
          const fl = 0.9 + 0.1 * Math.sin(t / 90 + i * 3.1);
          g.save(); g.translate(x, y); g.rotate(sway); g.scale(ls, ls);
          g.globalCompositeOperation = 'lighter';
          glow(g, 0, 40, 62, '255,100,40', (0.32 + beat * 0.2) * fl);
          glow(g, 0, 40, 26, '255,200,120', 0.25 * fl);
          g.globalCompositeOperation = 'source-over';
          g.drawImage(this.lantern.cv, -30, 0, 60, 78);
          this.drawTassel(g, 0, 72, sway, t, i);
          g.restore();
        }
      }
    }
    burst(d) {
      const n = Math.min(5, d.lines + (d.lines >= 4 ? 2 : 0) + (d.tspin ? 1 : 0));
      for (let i = 0; i < n; i++) this.firework(rand(0.1, 0.9) * this.w, rand(0.1, 0.4) * this.h, d.lines >= 4);
    }
  }

  // =========================================================
  // 竹林：晨霧、斜射陽光、三層竹子、飄落竹葉、光中浮塵
  // =========================================================
  function leafSprite(c1, c2) {
    const S = layer(30, 10);
    const g = S.g;
    const gr = g.createLinearGradient(0, 0, 30, 10);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 5); g.quadraticCurveTo(12, -1, 30, 5); g.quadraticCurveTo(12, 11, 0, 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(1, 5); g.lineTo(28, 5); g.stroke();
    return S;
  }
  class Bamboo {
    constructor(low) { this.low = low; this.wind = 0; this.extra = []; this.bloomScale = 0.6; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#d6e8cf'], [0.35, '#9cc39a'], [0.7, '#4f7d55'], [1, '#1d3523']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.15, -h * 0.05, w * 0.9, '255,250,220', 0.5);
      const stalk = (x, wd, top, color, node, lean) => {
        g.fillStyle = color;
        g.save(); g.translate(x, h); g.rotate(lean);
        g.fillRect(-wd / 2, -h - 20, wd, h + 20);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-wd / 2, -h - 20, wd * 0.25, h + 20);
        for (let y = -rand(30, 80); y > -h - 20; y -= rand(50, 90) * sc) {
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-wd / 2 - 1, y, wd + 2, Math.max(1.5, wd * 0.12));
          g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-wd / 2, y + Math.max(1.5, wd * 0.12), wd, 1);
        }
        g.restore();
        // 葉叢
        for (let k = 0; k < 3; k++) {
          const ly = top + rand(0, h * 0.4);
          for (let q = 0; q < 6; q++) {
            g.save(); g.translate(x + Math.sin(lean) * (h - ly), ly); g.rotate(rand(-0.6, 0.6) + (Math.random() < 0.5 ? Math.PI : 0));
            g.fillStyle = color;
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10 * sc, -3 * sc, 26 * sc, 0); g.quadraticCurveTo(10 * sc, 3 * sc, 0, 0); g.fill();
            g.restore();
          }
        }
      };
      for (let i = 0; i < 14; i++) stalk(rand(0, w), rand(4, 7) * sc, rand(0, h * 0.3), `rgba(120,160,120,${rand(0.25, 0.4)})`, true, rand(-0.04, 0.04));
      // 霧
      for (let i = 0; i < 4; i++) glow(g, rand(0, w), rand(0.5, 0.9) * h, w * 0.5, '230,240,225', 0.35);
      for (let i = 0; i < 9; i++) stalk(rand(0, w), rand(8, 12) * sc, rand(0, h * 0.2), `rgba(55,95,60,${rand(0.6, 0.8)})`, true, rand(-0.05, 0.05));
      for (let i = 0; i < 3; i++) glow(g, rand(0, w), rand(0.75, 1) * h, w * 0.6, '200,225,195', 0.3);
      // 光束
      const R = (this.ray = layer(80, 600));
      const rg = R.g.createLinearGradient(0, 0, 0, 600);
      rg.addColorStop(0, 'rgba(255,250,220,0.55)'); rg.addColorStop(1, 'rgba(255,250,220,0)');
      R.g.fillStyle = rg; R.g.beginPath(); R.g.moveTo(30, 0); R.g.lineTo(50, 0); R.g.lineTo(80, 600); R.g.lineTo(0, 600); R.g.fill();
      this.rays = [];
      for (let i = 0; i < 5; i++) this.rays.push({ x: rand(-0.1, 0.8), w: rand(0.6, 1.5), a: rand(0.1, 0.22), ph: rand(0, TAU) });
      // 近景竹（每幀繪製、會搖曳）
      this.near = [];
      for (let i = 0; i < 5; i++) this.near.push({ x: [0.03, 0.12, 0.88, 0.97, 0.5][i] * w + rand(-10, 10), wd: rand(14, 20) * sc, ph: rand(0, TAU), nodes: Array.from({ length: 14 }, () => rand(60, 95) * sc) });
      this.leafImg = leafSprite('#7fb36a', '#2f5e30');
      this.leaves = [];
      for (let i = 0; i < (this.low ? 10 : 22); i++) this.leaves.push(this.newLeaf(true));
      this.motes = [];
      for (let i = 0; i < (this.low ? 15 : 40); i++) this.motes.push({ x: rand(0, w), y: rand(0, h), v: rand(3, 10), ph: rand(0, TAU) });
    }
    newLeaf(anywhere, x, y) {
      return { x: x != null ? x : rand(-0.2, 1) * this.w, y: y != null ? y : anywhere ? rand(0, this.h) : rand(-30, -10), vx: rand(10, 30), vy: rand(25, 50), rot: rand(0, TAU), vr: rand(-2, 2), flip: rand(0, TAU), vf: rand(2, 4), s: rand(0.6, 1.1) * this.sc };
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      const upd = (p) => { p.x += (p.vx + this.wind) * s; p.y += p.vy * s; p.rot += p.vr * s; p.flip += p.vf * s; };
      for (const p of this.leaves) { upd(p); if (p.y > this.h + 20 || p.x > this.w + 30) Object.assign(p, this.newLeaf(false)); }
      for (const p of this.extra) { upd(p); p.vy += 40 * s; }
      this.extra = this.extra.filter((p) => p.y < this.h + 20 && p.x < this.w + 40);
      for (const m of this.motes) { m.y -= m.v * s; m.ph += s; if (m.y < -5) { m.y = this.h + 5; m.x = rand(0, this.w); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const r of this.rays) {
        g.save();
        g.globalAlpha = r.a * (0.75 + 0.25 * Math.sin(t / 2000 + r.ph));
        g.translate(r.x * w, -20); g.rotate(-0.35);
        g.drawImage(this.ray.cv, -40 * r.w, 0, 80 * r.w, h * 1.3);
        g.restore();
      }
      g.globalAlpha = 1;
      if (!this.dot) this.dot = softDot('255,245,200');
      for (const m of this.motes) {
        const r = 4 * this.sc * (1 + 0.3 * Math.sin(m.ph * 3));
        g.globalAlpha = 0.35 + 0.3 * Math.sin(m.ph * 2);
        g.drawImage(this.dot.cv, m.x + Math.sin(m.ph) * 6 - r, m.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      // 近景竹
      for (const n of this.near) {
        const sway = Math.sin(t / 1600 + n.ph) * 0.018 + this.wind * 0.00015;
        g.save(); g.translate(n.x, h + 10); g.rotate(sway);
        const gr = g.createLinearGradient(-n.wd / 2, 0, n.wd / 2, 0);
        gr.addColorStop(0, '#15301a'); gr.addColorStop(0.35, '#5c8f52'); gr.addColorStop(0.6, '#3a6a3a'); gr.addColorStop(1, '#10240f');
        g.fillStyle = gr;
        g.fillRect(-n.wd / 2, -h - 40, n.wd, h + 40);
        let y = -20;
        for (const step of n.nodes) {
          y -= step;
          if (y < -h - 40) break;
          g.fillStyle = 'rgba(10,25,10,0.6)'; g.fillRect(-n.wd / 2 - 1.5, y, n.wd + 3, 3);
          g.fillStyle = 'rgba(200,230,170,0.35)'; g.fillRect(-n.wd / 2, y + 3, n.wd, 1.2);
        }
        g.restore();
      }
      const img = this.leafImg.cv;
      const drawLeaf = (p) => {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(p.s, p.s * Math.cos(p.flip));
        g.drawImage(img, -15, -5, 30, 10); g.restore();
      };
      for (const p of this.leaves) drawLeaf(p);
      for (const p of this.extra) drawLeaf(p);
    }
    burst(d, B) {
      this.wind = Math.min(500, this.wind + 70 * d.lines + (d.lines >= 4 ? 150 : 0));
      const n = Math.min(this.low ? 10 : 30, d.lines * (this.low ? 3 : 8));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        const p = this.newLeaf(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c);
        p.vx = rand(60, 220); p.vy = rand(-90, 10);
        this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 敦煌：大漠黃昏、石窟崖壁、層層沙丘、飛天彩帶、風沙
  // =========================================================
  class Dunhuang {
    constructor(low) { this.low = low; this.flash = 0; this.speed = 1; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#14203d'], [0.3, '#47406a'], [0.52, '#c97f5c'], [0.62, '#f0bd78'], [1, '#6b3a25']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,240,220,${rand(0.1, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.3), 1, 1); }
      // 新月
      const mx = w * 0.2, my = h * 0.12, mr = 18 * sc;
      glow(g, mx, my, mr * 4, '255,240,210', 0.18);
      // 新月：外圓弧 + 內圓弧圍成
      g.fillStyle = '#fff3d6';
      g.beginPath();
      g.arc(mx, my, mr, Math.PI * 0.35, Math.PI * 1.65, false);
      g.arc(mx + mr * 0.55, my, mr * 0.85, Math.PI * 1.45, Math.PI * 0.55, true);
      g.closePath(); g.fill();
      glow(g, w * 0.6, h * 0.62, w * 0.8, '255,190,110', 0.35);
      // 沙丘
      const dune = (base, amp, top, bot, seed) => {
        const gr = g.createLinearGradient(0, base - amp, 0, h);
        gr.addColorStop(0, top); gr.addColorStop(1, bot);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w + 10; x += 8) g.lineTo(x, base - amp * Math.pow(Math.abs(Math.sin(x * 0.004 + seed)), 1.4) - amp * 0.2 * Math.sin(x * 0.011 + seed * 2));
        g.lineTo(w, h); g.closePath(); g.fill();
      };
      dune(h * 0.66, h * 0.08, '#c98f6a', '#8a5a48', 1.2);
      dune(h * 0.76, h * 0.1, '#e2a66a', '#9a5e38', 3.4);
      dune(h * 0.9, h * 0.1, '#d08a4e', '#5a2f1c', 5.1);
      // 石窟崖壁（右側）
      const cx0 = w * 0.72;
      const cliff = g.createLinearGradient(cx0, 0, w, 0);
      cliff.addColorStop(0, '#a4683f'); cliff.addColorStop(0.4, '#8a5232'); cliff.addColorStop(1, '#5a311d');
      g.fillStyle = cliff;
      g.beginPath(); g.moveTo(cx0, h); g.lineTo(cx0 + w * 0.02, h * 0.45);
      for (let y = h * 0.45; y > h * 0.3; y -= 10) g.lineTo(cx0 + w * 0.03 + Math.sin(y * 0.1) * 4, y);
      g.lineTo(w, h * 0.28); g.lineTo(w, h); g.closePath(); g.fill();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const nx = cx0 + w * (0.06 + c * 0.065), ny = h * (0.4 + r * 0.11);
          const nw = 10 * sc, nh = 16 * sc;
          g.fillStyle = 'rgba(30,12,6,0.85)';
          g.beginPath(); g.moveTo(nx - nw / 2, ny + nh / 2); g.lineTo(nx - nw / 2, ny - nh * 0.1); g.quadraticCurveTo(nx, ny - nh * 0.8, nx + nw / 2, ny - nh * 0.1); g.lineTo(nx + nw / 2, ny + nh / 2); g.fill();
          if (Math.random() < 0.5) glow(g, nx, ny + nh * 0.1, nw, '255,180,90', 0.35);
        }
      }
      this.ribbons = [];
      const cols = [['80,200,190', '30,120,140'], ['230,90,70', '150,40,40'], ['240,200,110', '180,120,50']];
      for (let i = 0; i < 3; i++) this.ribbons.push({ y: rand(0.15, 0.45) * h, amp: rand(0.04, 0.08) * h, ph: rand(0, TAU), sp: rand(0.25, 0.45), len: rand(0.6, 0.9) * w, wd: rand(6, 10) * sc, col: cols[i], off: rand(0, 1) });
      this.sand = [];
      for (let i = 0; i < (this.low ? 30 : 80); i++) this.sand.push({ x: rand(0, w), y: rand(0.4, 1) * h, v: rand(30, 90), s: rand(0.6, 1.6) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      this.speed = 1 + this.flash * 2;
      for (const r of this.ribbons) r.off = (r.off + s * 0.05 * r.sp * this.speed) % 1.6;
      for (const p of this.sand) { p.x += p.v * s * this.speed; p.y += Math.sin(p.x * 0.02) * 0.2; if (p.x > this.w + 5) { p.x = -5; p.y = rand(0.4, 1) * this.h; } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      const ts = t / 1000;
      // 飛天彩帶
      for (const r of this.ribbons) {
        const head = -0.3 * w + r.off * (w + r.len);
        const N = 40;
        const top = [], bot = [];
        for (let i = 0; i <= N; i++) {
          const f = i / N;
          const x = head - f * r.len;
          const y = r.y + Math.sin(x * 0.012 + ts * r.sp * 2 + r.ph) * r.amp + Math.sin(f * 9 + ts * 2) * r.amp * 0.15;
          const wd = r.wd * Math.sin(f * Math.PI) * (0.6 + 0.4 * Math.sin(f * 12 + ts * 3));
          top.push([x, y - wd]); bot.push([x, y + wd]);
        }
        const gr = g.createLinearGradient(head - r.len, 0, head, 0);
        gr.addColorStop(0, `rgba(${r.col[0]},0)`); gr.addColorStop(0.5, `rgba(${r.col[0]},${0.8 + beat * 0.2})`); gr.addColorStop(1, `rgba(${r.col[1]},0.9)`);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(top[0][0], top[0][1]);
        for (const [x, y] of top) g.lineTo(x, y);
        for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = 0.8;
        g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
      g.globalCompositeOperation = 'lighter';
      if (!this.dot) this.dot = softDot('255,210,150');
      for (const p of this.sand) {
        const r = p.s * 3.2 * this.sc;
        g.globalAlpha = 0.45;
        g.drawImage(this.dot.cv, p.x - r * 1.6, p.y - r * 0.6, r * 3.2, r * 1.2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  // =========================================================
  // 螢火森林：月光、三層樹影、發光蘑菇、霧、螢火蟲
  // =========================================================
  class Firefly {
    constructor(low) { this.low = low; this.flash = 0; this.swarm = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#030a16'], [0.5, '#06222c'], [1, '#020b0b']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.7, h * 0.08, w * 0.7, '170,230,255', 0.18);
      const trees = (n, color, minW, maxW, fog) => {
        for (let i = 0; i < n; i++) {
          const x = rand(-0.05, 1.05) * w, tw = rand(minW, maxW) * sc;
          g.fillStyle = color;
          g.beginPath(); g.moveTo(x - tw * 0.6, h); g.lineTo(x - tw * 0.4, 0); g.lineTo(x + tw * 0.4, 0); g.lineTo(x + tw * 0.7, h); g.fill();
          for (let k = 0; k < 3; k++) {
            g.lineWidth = tw * 0.25; g.strokeStyle = color;
            const by = rand(0.1, 0.6) * h, dir = Math.random() < 0.5 ? -1 : 1;
            g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + dir * tw * 1.5, by - tw, x + dir * tw * 3, by - tw * 2.2); g.stroke();
          }
        }
        if (fog) for (let i = 0; i < 4; i++) glow(g, rand(0, w), rand(0.4, 0.95) * h, w * 0.5, fog, 0.18);
      };
      trees(10, 'rgba(30,70,80,0.55)', 10, 18, '90,160,170');
      trees(7, 'rgba(12,35,40,0.85)', 16, 26, '60,120,130');
      trees(4, '#030b0c', 26, 40, null);
      // 地面與發光蘑菇
      g.fillStyle = '#020807';
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w + 10; x += 10) g.lineTo(x, h * 0.9 - Math.sin(x * 0.02) * 6 - Math.sin(x * 0.007) * 10);
      g.lineTo(w, h); g.fill();
      this.mush = [];
      for (let i = 0; i < 14; i++) {
        const x = rand(0, w), y = h * 0.9 - Math.sin(x * 0.02) * 6 - Math.sin(x * 0.007) * 10 + rand(0, 8);
        const r = rand(4, 10) * sc;
        this.mush.push({ x, y, r, ph: rand(0, TAU), col: Math.random() < 0.7 ? '90,255,220' : '160,140,255' });
        g.fillStyle = 'rgba(200,230,220,0.55)'; g.fillRect(x - r * 0.15, y - r * 1.2, r * 0.3, r * 1.2);
        const mg = g.createRadialGradient(x, y - r * 1.2, 0, x, y - r * 1.2, r);
        mg.addColorStop(0, 'rgba(220,255,245,0.95)'); mg.addColorStop(1, 'rgba(60,200,180,0.8)');
        g.fillStyle = mg; g.beginPath(); g.ellipse(x, y - r * 1.2, r, r * 0.55, 0, Math.PI, 0); g.fill();
      }
      this.glowImg = bokehSprite('210,255,120');
      this.flies = [];
      for (let i = 0; i < (this.low ? 18 : 45); i++) this.flies.push({ x: rand(0, w), y: rand(0.25, 0.95) * h, ph: rand(0, TAU), sp: rand(0.3, 0.8), blink: rand(0, TAU), r: rand(3, 6) * sc, ax: rand(20, 60), ay: rand(10, 30) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      for (const f of this.flies) { f.ph += s * f.sp; f.blink += s * rand(1.5, 2.5); }
      for (const p of this.swarm) { p.x += p.vx * s; p.y += p.vy * s; p.vy -= 10 * s; p.life -= s; }
      this.swarm = this.swarm.filter((p) => p.life > 0);
    }
    draw(g, t, beat, B) {
      g.drawImage(this.bg.cv, 0, 0, this.w, this.h);
      g.globalCompositeOperation = 'lighter';
      for (const m of this.mush) glow(g, m.x, m.y - m.r, m.r * (4 + beat * 2), m.col, 0.25 + 0.1 * Math.sin(t / 700 + m.ph) + this.flash * 0.3);
      const img = this.glowImg.cv;
      for (const f of this.flies) {
        const x = f.x + Math.sin(f.ph) * f.ax, y = f.y + Math.sin(f.ph * 1.7) * f.ay;
        const a = Math.max(0, Math.sin(f.blink)) * (0.6 + this.flash * 0.6);
        if (a < 0.02) continue;
        const r = f.r * (2.5 + beat);
        g.globalAlpha = Math.min(1, a);
        g.drawImage(img, x - r, y - r, r * 2, r * 2);
        g.fillStyle = 'rgba(250,255,200,1)'; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      }
      for (const p of this.swarm) {
        const r = p.r * 2.5;
        g.globalAlpha = Math.min(1, p.life);
        g.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    burst(d, B) {
      this.flash = Math.min(1.5, this.flash + 0.25 * d.lines);
      const n = Math.min(this.low ? 12 : 40, d.lines * (this.low ? 3 : 10));
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? B.x - 6 : B.x + B.w + 6;
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        this.swarm.push({ x: side, y: B.y + (row + 0.5) * B.c, vx: (side < B.cx ? -1 : 1) * rand(20, 80), vy: rand(-60, -10), life: rand(1.5, 2.5), r: rand(3, 6) * this.sc });
      }
    }
  }

  // =========================================================
  // 冰晶洞窟：冰柱晶簇、頂部光柱、焦散光紋、冰晶閃光
  // =========================================================
  class IceCave {
    constructor(low) { this.low = low; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#020818'], [0.45, '#06213a'], [1, '#0b3350']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.5, 0, w * 0.6, '170,240,255', 0.35);
      const shard = (x, y, len, wd, ang, a) => {
        g.save(); g.translate(x, y); g.rotate(ang);
        const gr = g.createLinearGradient(-wd, 0, wd, 0);
        gr.addColorStop(0, `rgba(30,90,140,${a})`); gr.addColorStop(0.45, `rgba(170,235,255,${a})`); gr.addColorStop(0.55, `rgba(110,190,235,${a})`); gr.addColorStop(1, `rgba(20,60,110,${a})`);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-wd, 0); g.lineTo(-wd * 0.7, len * 0.85); g.lineTo(0, len); g.lineTo(wd * 0.7, len * 0.85); g.lineTo(wd, 0); g.closePath(); g.fill();
        g.strokeStyle = `rgba(220,250,255,${a * 0.8})`; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len); g.stroke();
        g.restore();
      };
      this.tips = [];
      for (const [depth, a] of [[0.5, 0.35], [0.8, 0.6], [1, 0.9]]) {
        for (let i = 0; i < 9; i++) {
          const x = rand(0, w), len = rand(0.08, 0.22) * h * depth, wd = rand(6, 14) * sc * depth;
          shard(x, -5, len, wd, rand(-0.15, 0.15), a);
          this.tips.push({ x, y: len, ph: rand(0, TAU) });
          const bx = rand(0, w), blen = rand(0.06, 0.16) * h * depth;
          shard(bx, h + 5, blen, wd * 1.2, Math.PI + rand(-0.2, 0.2), a);
          this.tips.push({ x: bx, y: h - blen, ph: rand(0, TAU) });
        }
      }
      this.sparkles = [];
      for (let i = 0; i < (this.low ? 25 : 70); i++) this.sparkles.push({ x: rand(0, w), y: rand(0, h), ph: rand(0, TAU), sp: rand(1, 3), s: rand(0.8, 2) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      for (const p of this.sparkles) { p.ph += s * p.sp; p.y += 4 * s; if (p.y > this.h) p.y = 0; }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      // 焦散光紋
      const ts = t / 1000;
      g.lineWidth = 1.2;
      for (let k = 0; k < (this.low ? 4 : 8); k++) {
        g.strokeStyle = `rgba(150,230,255,${0.05 + 0.03 * Math.sin(ts + k)})`;
        g.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = h * (0.15 + k * 0.1) + Math.sin(x * 0.02 + ts * 0.8 + k) * 12 + Math.sin(x * 0.05 - ts * 1.3 + k * 2) * 5;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      // 冰晶尖端閃光（隨節拍）
      for (const tp of this.tips) {
        const a = Math.max(0, Math.sin(ts * 1.5 + tp.ph)) * 0.25 + beat * 0.25 + this.flash * 0.4;
        if (a > 0.05) glow(g, tp.x, tp.y, 18 * this.sc, '200,245,255', Math.min(0.8, a));
      }
      if (!this.star) this.star = starSprite('200,240,255');
      for (const p of this.sparkles) {
        const a = Math.pow(Math.max(0, Math.sin(p.ph)), 4);
        if (a < 0.05) continue;
        const r = p.s * 7 * this.sc * (0.6 + 0.4 * a);
        g.globalAlpha = a;
        g.drawImage(this.star.cv, p.x - r, p.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.3 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  // =========================================================
  // 熔岩：火山剪影、流動的熔岩河、地裂光、上升的火星、濃煙
  // =========================================================
  class Lava {
    constructor(low) { this.low = low; this.flash = 0; this.extra = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#070103'], [0.45, '#250705'], [0.75, '#55140a'], [1, '#140302']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) glow(g, rand(0, w), rand(0, h * 0.4), w * 0.5, '40,20,20', 0.6);
      const volcano = (cx, base, wd, ht, color, rim) => {
        g.fillStyle = color;
        g.beginPath(); g.moveTo(cx - wd, base); g.quadraticCurveTo(cx - wd * 0.3, base - ht * 0.6, cx - wd * 0.12, base - ht);
        g.lineTo(cx + wd * 0.12, base - ht); g.quadraticCurveTo(cx + wd * 0.3, base - ht * 0.6, cx + wd, base); g.fill();
        if (rim) { glow(g, cx, base - ht, wd * 0.5, '255,120,40', 0.45); }
      };
      volcano(w * 0.25, h * 0.75, w * 0.45, h * 0.28, '#1b0605', true);
      volcano(w * 0.8, h * 0.78, w * 0.5, h * 0.22, '#120403', true);
      g.fillStyle = '#0b0202'; g.fillRect(0, h * 0.78, w, h * 0.22);
      // 地裂
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        let x = rand(0, w), y = h * rand(0.8, 0.98);
        g.strokeStyle = 'rgba(255,110,30,0.7)'; g.lineWidth = rand(1, 2.5);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rand(-25, 25); y += rand(-6, 6); g.lineTo(x, y); }
        g.stroke();
      }
      this.embers = [];
      for (let i = 0; i < (this.low ? 30 : 80); i++) this.embers.push(this.newEmber(true));
    }
    newEmber(anywhere, x, y) {
      return { x: x != null ? x : rand(0, this.w), y: y != null ? y : anywhere ? rand(0, this.h) : this.h * rand(0.8, 1), vx: rand(-10, 10), vy: rand(-60, -25), life: rand(2, 5), ph: rand(0, TAU), s: rand(1.3, 3) * this.sc, temp: x != null };
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      const upd = (p) => { p.x += (p.vx + Math.sin(p.ph) * 12) * s; p.y += p.vy * s; p.ph += s * 2; p.life -= s; };
      for (const p of this.embers) { upd(p); if (p.life <= 0 || p.y < -10) Object.assign(p, this.newEmber(false)); }
      for (const p of this.extra) { upd(p); p.vy += 30 * s; }
      this.extra = this.extra.filter((p) => p.life > 0);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const ts = t / 1000;
      // 熔岩河（流動的光帶）
      for (let k = 0; k < 4; k++) {
        const yb = h * (0.84 + k * 0.035);
        g.strokeStyle = `rgba(255,${120 + k * 30},40,${0.35 + beat * 0.2 + this.flash * 0.3})`;
        g.lineWidth = (6 - k) * this.sc;
        g.beginPath();
        for (let x = 0; x <= w; x += 10) {
          const y = yb + Math.sin(x * 0.015 - ts * (1 + k * 0.3)) * 6 + Math.sin(x * 0.04 + ts * 2) * 2;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      glow(g, w * 0.5, h * 0.92, w * 0.7, '255,90,20', 0.2 + beat * 0.15 + this.flash * 0.3);
      if (!this.dot) { this.dot = softDot('255,130,40'); this.dot2 = softDot('255,200,90'); }
      const drawE = (p) => {
        const a = Math.min(1, p.life * 0.6) * (0.65 + 0.35 * Math.sin(p.ph * 5));
        const r = p.s * 3.2;
        g.globalAlpha = a;
        g.drawImage((p.s > 2 * this.sc ? this.dot2 : this.dot).cv, p.x - r, p.y - r * 1.3, r * 2, r * 2.6);
      };
      for (const p of this.embers) drawE(p);
      for (const p of this.extra) drawE(p);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    burst(d, B) {
      this.flash = Math.min(1.5, this.flash + 0.3 * d.lines + (d.lines >= 4 ? 0.5 : 0));
      const n = Math.min(this.low ? 20 : 70, d.lines * (this.low ? 5 : 18));
      for (let i = 0; i < n; i++) {
        const p = this.newEmber(false, rand(0.1, 0.9) * this.w, this.h * 0.9);
        p.vy = rand(-260, -120); p.vx = rand(-60, 60); p.life = rand(1.2, 2.2);
        this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 雨夜：失焦的城市燈光、直式霓虹招牌、雨絲、濕路倒影、閃電
  // =========================================================
  class RainyCity {
    constructor(low) { this.low = low; this.lightning = 0; this.ripples = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#04060d'], [0.6, '#0b1322'], [0.82, '#101a2c'], [1, '#05070c']]);
      g.fillRect(0, 0, w, h);
      // 樓影
      for (let i = 0; i < 12; i++) {
        const bw = rand(30, 70) * sc, bh = rand(0.25, 0.6) * h, x = rand(-20, w);
        g.fillStyle = `rgba(${rand(10, 20) | 0},${rand(14, 24) | 0},${rand(28, 40) | 0},0.9)`;
        g.fillRect(x, h * 0.82 - bh, bw, bh);
        for (let wy = h * 0.82 - bh + 8; wy < h * 0.8; wy += 9) for (let wx = x + 5; wx < x + bw - 5; wx += 8) {
          if (Math.random() < 0.18) { g.fillStyle = `rgba(255,${rand(180, 230) | 0},150,${rand(0.2, 0.5)})`; g.fillRect(wx, wy, 3, 4); }
        }
      }
      // 失焦光斑
      const cols = ['255,90,170', '90,200,255', '255,190,90', '160,120,255', '255,255,220'];
      const bimgs = cols.map((c) => bokehSprite(c));
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 45; i++) {
        const r = rand(6, 26) * sc;
        g.globalAlpha = rand(0.15, 0.45);
        g.drawImage(bimgs[(Math.random() * cols.length) | 0].cv, rand(0, w) - r, rand(0.35, 0.8) * h - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      // 直式霓虹招牌
      this.signs = [
        { x: w * 0.06, y: h * 0.42, text: '麵', col: '255,80,150' },
        { x: w * 0.9, y: h * 0.36, text: '茶館', col: '90,220,255' },
        { x: w * 0.2, y: h * 0.62, text: '書店', col: '255,190,80' },
        { x: w * 0.8, y: h * 0.6, text: '夜市', col: '190,120,255' },
      ];
      // 濕路面
      g.fillStyle = vgrad(g, h, [[0, 'rgba(0,0,0,0)'], [0.82, 'rgba(8,12,22,0.9)'], [1, 'rgba(4,6,12,1)']]);
      g.fillRect(0, h * 0.82, w, h * 0.18);
      this.drops = [];
      for (let i = 0; i < (this.low ? 60 : 150); i++) this.drops.push({ x: rand(0, w * 1.2), y: rand(0, h), v: rand(600, 900) * sc, l: rand(10, 22) * sc, a: rand(0.15, 0.4) });
    }
    update(dt) {
      const s = dt / 1000;
      this.lightning *= Math.pow(0.02, s);
      for (const d of this.drops) {
        d.y += d.v * s; d.x -= d.v * 0.15 * s;
        if (d.y > this.h * rand(0.85, 1)) {
          if (Math.random() < 0.3 && this.ripples.length < 30) this.ripples.push({ x: d.x, y: d.y, t: 0 });
          d.y = rand(-40, 0); d.x = rand(0, this.w * 1.2);
        }
      }
      for (const r of this.ripples) r.t += s;
      this.ripples = this.ripples.filter((r) => r.t < 0.6);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 招牌與倒影
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.signs.length; i++) {
        const sg = this.signs[i];
        const flick = Math.sin(t / 53 + i * 9) > 0.97 ? 0.3 : 1;
        const a = (0.75 + beat * 0.25) * flick;
        const fs = 20 * this.sc;
        const chars = sg.text.split('');
        const hgt = chars.length * fs * 1.15 + fs * 0.4;
        glow(g, sg.x, sg.y + hgt / 2, fs * 2.5, sg.col, 0.25 * a);
        g.strokeStyle = `rgba(${sg.col},${0.8 * a})`; g.lineWidth = 1.5;
        g.strokeRect(sg.x - fs * 0.7, sg.y, fs * 1.4, hgt);
        g.font = `700 ${fs}px "Noto Serif TC", "Songti TC", serif`;
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillStyle = `rgba(${sg.col},${a})`;
        chars.forEach((c, k) => g.fillText(c, sg.x, sg.y + fs * 0.3 + k * fs * 1.15));
        // 倒影
        const ry = h * 0.84 + (h * 0.82 - sg.y) * 0.08;
        const rg = g.createLinearGradient(0, ry, 0, ry + hgt * 0.8);
        rg.addColorStop(0, `rgba(${sg.col},${0.25 * a})`); rg.addColorStop(1, `rgba(${sg.col},0)`);
        g.fillStyle = rg;
        g.fillRect(sg.x - fs * 0.5 + Math.sin(t / 300 + i) * 2, ry, fs, hgt * 0.8);
      }
      // 雨
      g.strokeStyle = 'rgba(180,200,255,0.35)'; g.lineWidth = 1;
      g.beginPath();
      for (const d of this.drops) { g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.15, d.y - d.l); }
      g.stroke();
      g.strokeStyle = 'rgba(180,200,255,0.3)';
      for (const r of this.ripples) {
        const k = r.t / 0.6;
        g.globalAlpha = 1 - k;
        g.beginPath(); g.ellipse(r.x, r.y, 2 + k * 10 * this.sc, 1 + k * 3 * this.sc, 0, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      if (this.lightning > 0.02) { g.fillStyle = `rgba(200,215,255,${this.lightning * 0.35})`; g.fillRect(0, 0, w, h); }
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) {
      if (d.lines >= 3 || d.tspin) this.lightning = 1;
      for (let i = 0; i < d.lines * 6; i++) this.ripples.push({ x: rand(0, this.w), y: this.h * rand(0.85, 1), t: 0 });
    }
  }

  // =========================================================
  // 長城：日出、層層山脊與雲霧、蜿蜒城牆與烽火台、人字雁陣
  // =========================================================
  class GreatWall {
    constructor(low) { this.low = low; this.flash = 0; this.fires = []; this.smoke = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      // 黃昏天空：上深藍、中段紫、地平線金橘
      g.fillStyle = vgrad(g, h, [[0, '#0e1638'], [0.22, '#2b2a5e'], [0.42, '#7a4a78'], [0.55, '#e0805a'], [0.63, '#ffc277'], [0.7, '#f39a5a'], [1, '#2a1622']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,240,220,${rand(0.1, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.25), 1, 1); }
      // 落日在右側地平線，光暈很大
      this.sun = { x: w * 0.78, y: h * 0.6, r: 24 * sc };
      glow(g, this.sun.x, this.sun.y, w * 1.1, '255,160,90', 0.32);
      glow(g, this.sun.x, this.sun.y, this.sun.r * 4, '255,235,190', 0.45);
      g.fillStyle = '#fff2cf'; g.beginPath(); g.arc(this.sun.x, this.sun.y, this.sun.r, 0, TAU); g.fill();
      // 雲帶：底部被夕陽照亮的長條雲
      for (let i = 0; i < 9; i++) {
        const cy = h * rand(0.08, 0.48), cx = rand(-0.1, 1.1) * w, cw = rand(120, 260) * sc, ch = rand(5, 11) * sc;
        const lit = 1 - Math.abs(cy / h - 0.5) * 1.5;
        const cg = g.createLinearGradient(0, cy - ch, 0, cy + ch);
        cg.addColorStop(0, `rgba(60,45,90,${0.55})`); cg.addColorStop(0.6, `rgba(120,70,110,0.5)`); cg.addColorStop(1, `rgba(255,${(150 + lit * 60) | 0},110,${0.35 + lit * 0.4})`);
        g.fillStyle = cg;
        g.beginPath(); g.ellipse(cx, cy, cw, ch, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(cx + cw * 0.3, cy - ch * 0.6, cw * 0.5, ch * 0.8, 0, 0, TAU); g.fill();
      }
      // 崎嶇山脊：多層正弦 + 隨機起伏
      const ridge = (base, amp, seed, rough) => {
        const ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU)];
        const pts = [];
        for (let x = -20; x <= w + 20; x += 4) {
          let y = Math.sin(x * 0.006 + ph[0]) * 0.5 + Math.sin(x * 0.013 + ph[1]) * 0.3 + Math.sin(x * 0.031 + ph[2]) * 0.14 * rough + Math.sin(x * 0.07 + ph[3]) * 0.06 * rough;
          pts.push([x, base - amp * (0.55 + y * 0.7)]);
        }
        return pts;
      };
      const mount = (pts, top, bot, base, shade) => {
        const gr = g.createLinearGradient(0, Math.min(...pts.map((p) => p[1])), 0, base + h * 0.1);
        gr.addColorStop(0, top); gr.addColorStop(1, bot);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-20, h); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(w + 20, h); g.closePath(); g.fill();
        // 背光面：坡往右下的地方加深，做出山體立體感
        if (shade) {
          g.fillStyle = shade;
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            if (y1 > y0) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + (y1 - y0) * 3, base + h * 0.06); g.lineTo(x0 + (y1 - y0) * 3, base + h * 0.06); g.fill(); }
          }
        }
        // 向陽稜線
        g.strokeStyle = 'rgba(255,190,130,0.35)'; g.lineWidth = 1;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      };
      const mist = (y, a) => {
        const mg = g.createLinearGradient(0, y - h * 0.04, 0, y + h * 0.04);
        mg.addColorStop(0, 'rgba(255,200,170,0)'); mg.addColorStop(0.5, `rgba(255,200,170,${a})`); mg.addColorStop(1, 'rgba(255,200,170,0)');
        g.fillStyle = mg; g.fillRect(0, y - h * 0.04, w, h * 0.08);
      };
      this.towers = [];
      // 城牆：側面陰影 + 向陽頂面 + 垛口 + 敵樓
      const wall = (pts, thick, lit, face, dark, towerEvery, depth) => {
        const top = pts.map(([x, y]) => [x, y - thick * 0.9]);
        // 牆身（側面）
        const fg = g.createLinearGradient(0, Math.min(...top.map((p) => p[1])), 0, Math.max(...pts.map((p) => p[1])) + thick);
        fg.addColorStop(0, face); fg.addColorStop(1, dark);
        g.fillStyle = fg;
        g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + thick * 0.4);
        g.fill();
        // 磚縫
        if (thick > 8 * sc) {
          g.strokeStyle = 'rgba(40,20,20,0.25)'; g.lineWidth = 0.7;
          for (let k = 1; k < 4; k++) { g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y + thick * 0.3 * k) : g.moveTo(x, y + thick * 0.3 * k))); g.stroke(); }
        }
        // 頂面走道
        g.strokeStyle = lit; g.lineWidth = Math.max(1.2, thick * 0.28); g.lineJoin = 'round';
        g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        // 垛口
        let acc = 0;
        const step = Math.max(2.5, thick * 0.55);
        for (let i = 1; i < top.length; i++) {
          const [x0, y0] = top[i - 1], [x1, y1] = top[i];
          acc += Math.hypot(x1 - x0, y1 - y0);
          if (acc >= step) {
            acc = 0;
            g.fillStyle = face; g.fillRect(x1 - thick * 0.16, y1 - thick * 0.42, thick * 0.32, thick * 0.42);
            g.fillStyle = lit; g.fillRect(x1 - thick * 0.16, y1 - thick * 0.42, thick * 0.1, thick * 0.42);
          }
        }
        // 敵樓：放在局部高點附近
        let last = -999;
        for (let i = 4; i < pts.length - 4; i++) {
          const [x, y] = top[i];
          if (x < 0 || x > w) continue;
          if (x - last < towerEvery) continue;
          if (!(y <= top[i - 4][1] && y <= top[i + 4][1])) continue;
          last = x;
          const tw = thick * 2.6, th = thick * 2.2;
          const tx = x - tw / 2, ty = y - th;
          g.fillStyle = face; g.fillRect(tx, ty, tw, th + thick * 0.3);
          g.fillStyle = dark; g.fillRect(tx + tw * 0.62, ty, tw * 0.38, th + thick * 0.3); // 背光側
          g.fillStyle = lit; g.fillRect(tx, ty, tw, Math.max(1, thick * 0.18));
          // 拱窗
          g.fillStyle = 'rgba(25,10,15,0.9)';
          for (const k of [0.22, 0.48]) { const ax = tx + tw * k, aw = tw * 0.13, ah = th * 0.36; g.beginPath(); g.moveTo(ax, ty + th * 0.75); g.lineTo(ax, ty + th * 0.75 - ah); g.arc(ax + aw / 2, ty + th * 0.75 - ah, aw / 2, Math.PI, 0); g.lineTo(ax + aw, ty + th * 0.75); g.fill(); }
          // 頂上垛口 / 近處的樓閣屋頂
          if (depth >= 2) {
            g.fillStyle = dark;
            g.beginPath(); g.moveTo(tx - tw * 0.15, ty); g.quadraticCurveTo(tx + tw * 0.1, ty - th * 0.05, tx + tw * 0.2, ty - th * 0.38); g.lineTo(tx + tw * 0.8, ty - th * 0.38); g.quadraticCurveTo(tx + tw * 0.9, ty - th * 0.05, tx + tw * 1.15, ty); g.fill();
            g.strokeStyle = lit; g.lineWidth = 1; g.beginPath(); g.moveTo(tx - tw * 0.15, ty); g.quadraticCurveTo(tx + tw * 0.1, ty - th * 0.05, tx + tw * 0.2, ty - th * 0.38); g.stroke();
          } else {
            g.fillStyle = face;
            for (let k = 0; k < 4; k++) g.fillRect(tx + k * tw / 3.3, ty - thick * 0.4, tw / 6, thick * 0.4);
          }
          this.towers.push({ x: x, y: ty - (depth >= 2 ? th * 0.38 : thick * 0.4), s: thick, depth });
        }
      };
      const r0 = ridge(h * 0.6, h * 0.08, 1, 0.6);
      mount(r0, 'rgba(120,80,120,0.85)', 'rgba(230,140,110,0.5)', h * 0.6);
      wall(r0, 3.2 * sc, 'rgba(255,200,160,0.7)', 'rgba(110,70,100,1)', 'rgba(90,55,85,1)', 90 * sc, 0);
      mist(h * 0.64, 0.22);
      const r1 = ridge(h * 0.7, h * 0.14, 2, 1.5);
      mount(r1, 'rgba(80,50,85,1)', 'rgba(120,62,80,1)', h * 0.7);
      wall(r1, 7 * sc, 'rgba(255,190,140,0.85)', 'rgba(95,60,80,1)', 'rgba(55,32,52,1)', 110 * sc, 1);
      mist(h * 0.75, 0.18);
      const r2 = ridge(h * 0.83, h * 0.15, 3, 1.7);
      mount(r2, 'rgba(48,28,50,1)', 'rgba(62,32,50,1)', h * 0.83);
      wall(r2, 14 * sc, 'rgba(255,185,130,0.95)', 'rgba(110,70,75,1)', 'rgba(40,22,35,1)', 150 * sc, 2);
      mist(h * 0.88, 0.1);
      // 前景：深色山坡與松樹剪影
      const r3 = ridge(h * 0.97, h * 0.08, 4, 1.5);
      mount(r3, 'rgba(22,12,24,1)', 'rgba(12,6,14,1)', h * 0.97);
      const pine = (x, y, s) => {
        g.fillStyle = '#0d070f';
        g.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.3);
        for (let k = 0; k < 4; k++) { const ww = s * (0.5 - k * 0.1), yy = y - s * 0.25 - k * s * 0.2; g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x, yy - s * 0.32); g.lineTo(x + ww, yy); g.fill(); }
      };
      for (let i = 0; i < r3.length; i += 3) if (Math.random() < 0.5) pine(r3[i][0], r3[i][1] + 4, rand(18, 34) * sc);
      // 光束素材
      const R = (this.ray = layer(60, 500));
      const rg = R.g.createLinearGradient(0, 0, 0, 500);
      rg.addColorStop(0, 'rgba(255,220,160,0.55)'); rg.addColorStop(1, 'rgba(255,220,160,0)');
      R.g.fillStyle = rg; R.g.beginPath(); R.g.moveTo(28, 0); R.g.lineTo(32, 0); R.g.lineTo(60, 500); R.g.lineTo(0, 500); R.g.fill();
      this.geese = [];
      for (let i = 0; i < 9; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        this.geese.push({ dx: -Math.abs(k) * 15 * sc, dy: k * 8 * sc, ph: rand(0, TAU) });
      }
      this.flock = { x: rand(0.1, 0.4) * w, y: h * rand(0.03, 0.07), v: 16 * sc };
      this.mists = [];
      for (let i = 0; i < (this.low ? 3 : 6); i++) this.mists.push({ x: rand(0, w), y: h * rand(0.64, 0.9), r: w * rand(0.25, 0.45), v: rand(4, 10) * sc });
      // 每座敵樓一盞烽火：平時微弱，消行時點燃
      this.fires = this.towers.map((tw) => ({ x: tw.x, y: tw.y, s: tw.s, depth: tw.depth, heat: 0.15, ph: rand(0, TAU) }));
      this.smoke = [];
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      this.flock.x += this.flock.v * s * (1 + this.flash);
      if (this.flock.x > this.w + 200 * this.sc) { this.flock.x = -60 * this.sc; this.flock.y = this.h * rand(0.02, 0.07); }
      for (const gs of this.geese) gs.ph += s * 6;
      for (const m of this.mists) { m.x += m.v * s; if (m.x - m.r > this.w) m.x = -m.r; }
      for (const f of this.fires) {
        f.heat = Math.max(0.15, f.heat - s * 0.12);
        f.ph += s * 9;
        if (f.heat > 0.4 && Math.random() < s * 6 * f.heat && this.smoke.length < (this.low ? 30 : 80)) this.smoke.push({ x: f.x, y: f.y - f.s, r: f.s * rand(0.6, 1), a: 0.35 * f.heat, vx: rand(4, 10) * this.sc, vy: -rand(10, 18) * this.sc * (0.5 + f.depth * 0.3), life: rand(2, 3.5), max: 3.5 });
      }
      for (const p of this.smoke) { p.life -= s; p.x += p.vx * s; p.y += p.vy * s; p.r += s * 5 * this.sc; }
      this.smoke = this.smoke.filter((p) => p.life > 0);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(this.sun.x, this.sun.y);
      for (let i = 0; i < 9; i++) {
        g.save(); g.rotate(Math.PI / 2 + 0.55 + (i - 4) * 0.2 + Math.sin(t / 3000 + i) * 0.03);
        g.globalAlpha = (0.08 + beat * 0.05 + this.flash * 0.12) * (i % 2 ? 0.6 : 1);
        g.drawImage(this.ray.cv, -30, 0, 60, h * 0.9);
        g.restore();
      }
      g.restore(); g.globalAlpha = 1;
      for (const m of this.mists) glow(g, m.x, m.y, m.r, '255,210,190', 0.05);
      // 烽火
      for (const f of this.fires) {
        const fl = f.heat * (0.8 + 0.2 * Math.sin(f.ph) + 0.1 * Math.sin(f.ph * 2.3));
        glow(g, f.x, f.y - f.s * 0.6, f.s * (2.5 + fl * 2.5), '255,120,40', 0.22 * fl + beat * 0.03);
        glow(g, f.x, f.y - f.s * 0.5, f.s * (0.6 + fl * 0.9), '255,220,140', 0.55 * fl);
      }
      g.globalCompositeOperation = 'source-over';
      for (const p of this.smoke) {
        const k = p.life / p.max;
        const sg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        sg.addColorStop(0, `rgba(120,100,110,${p.a * k * 0.6})`); sg.addColorStop(1, 'rgba(120,100,110,0)');
        g.fillStyle = sg; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      // 人字雁陣
      g.fillStyle = 'rgba(30,20,40,0.85)';
      const k = this.sc * 1.2;
      for (const gs of this.geese) {
        const x = this.flock.x + gs.dx, y = this.flock.y + gs.dy;
        const f = Math.sin(gs.ph) * 5 * k;
        g.beginPath();
        g.moveTo(x - 9 * k, y - f); g.quadraticCurveTo(x - 4 * k, y - f * 0.3 - 1.5 * k, x, y);
        g.lineTo(x + 5 * k, y - 0.6 * k); g.lineTo(x, y + 1.2 * k);
        g.quadraticCurveTo(x - 4 * k, y - f * 0.2 + 1 * k, x - 9 * k, y - f); g.fill();
      }
    }
    burst(d) {
      this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0));
      // 點燃烽火：消越多行點越多座，Tetris 全線點亮
      const n = d.lines >= 4 ? this.fires.length : Math.min(this.fires.length, d.lines * 2);
      const order = this.fires.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) order[i].heat = Math.min(1.2, order[i].heat + 0.8 + (d.lines >= 4 ? 0.3 : 0));
    }
  }

  // =========================================================
  // 荷塘月色：月夜池塘、荷葉、會擺動的荷花、悠游的錦鯉、漣漪
  // =========================================================
  class LotusPond {
    constructor(low) { this.low = low; this.ripples = []; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#050b1c'], [0.18, '#0b1d33'], [0.22, '#0a2a33'], [1, '#03141a']]);
      g.fillRect(0, 0, w, h);
      // 月亮與倒影
      const mx = w * 0.78, my = h * 0.08, mr = 22 * sc;
      glow(g, mx, my, mr * 5, '230,240,255', 0.25);
      g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      this.moonX = mx;
      // 遠岸柳樹剪影
      g.fillStyle = '#020910';
      g.beginPath(); g.moveTo(0, h * 0.21);
      for (let x = 0; x <= w; x += 10) g.lineTo(x, h * 0.2 - Math.abs(Math.sin(x * 0.03)) * 6 * sc - (x < w * 0.3 ? 18 * sc * Math.sin(x / (w * 0.3) * Math.PI) : 0));
      g.lineTo(w, h * 0.22); g.lineTo(0, h * 0.22); g.fill();
      g.strokeStyle = 'rgba(2,9,16,0.9)'; g.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const x = rand(0, w * 0.35), y = h * 0.16; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y + 20 * sc, x + rand(-2, 4), y + rand(25, 45) * sc); g.stroke(); }
      // 荷葉（俯視的圓葉、放射葉脈、缺口）
      this.pads = [];
      const pad = (x, y, r, tone) => {
        const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
        gr.addColorStop(0, `rgba(${70 + tone},${130 + tone},${80 + tone * 0.5},1)`);
        gr.addColorStop(1, `rgba(${20 + tone * 0.3},${60 + tone * 0.5},${35},1)`);
        g.fillStyle = gr;
        const notch = rand(0, TAU);
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, notch + 0.06, notch + TAU - 0.06); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(160,220,150,0.25)'; g.lineWidth = 0.8;
        for (let k = 0; k < 14; k++) { const a = notch + 0.3 + (k / 14) * (TAU - 0.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke(); }
        g.strokeStyle = 'rgba(200,255,200,0.15)'; g.beginPath(); g.arc(x, y, r * 0.97, notch + 0.2, notch + TAU - 0.2); g.stroke();
      };
      for (let i = 0; i < 22; i++) {
        const y = h * rand(0.25, 1), r = rand(16, 34) * sc * (0.6 + (y / h) * 0.6);
        const x = rand(0, w);
        pad(x, y, r, rand(-10, 20) | 0);
        if (Math.random() < 0.35) this.pads.push({ x, y: y - r * 0.2, r });
      }
      // 月光倒影
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(220,235,255,${rand(0.05, 0.18)})`;
        g.fillRect(mx - rand(4, 30) * sc, h * 0.24 + i * h * 0.02, rand(8, 60) * sc, 1.5);
      }
      // 荷花素材（側視、粉色多層花瓣）
      const F = (this.flower = layer(60, 60));
      const fg = F.g;
      const petal = (ang, len, wd, c1, c2) => {
        fg.save(); fg.translate(30, 44); fg.rotate(ang);
        const gr = fg.createLinearGradient(0, 0, 0, -len);
        gr.addColorStop(0, c2); gr.addColorStop(1, c1);
        fg.fillStyle = gr;
        fg.beginPath(); fg.moveTo(0, 0); fg.quadraticCurveTo(-wd, -len * 0.5, 0, -len); fg.quadraticCurveTo(wd, -len * 0.5, 0, 0); fg.fill();
        fg.restore();
      };
      for (const a of [-1.1, 1.1, -0.7, 0.7]) petal(a, 22, 9, '#ffd6e6', '#d4507e');
      for (const a of [-0.35, 0.35, 0]) petal(a, 28, 10, '#fff0f6', '#e0608c');
      fg.fillStyle = '#f2d36a'; fg.beginPath(); fg.ellipse(30, 30, 4, 2.5, 0, 0, TAU); fg.fill();
      this.glowDot = softDot('255,180,210');
      // 錦鯉
      this.koi = [];
      const kcols = [['255,120,40', '255,250,240'], ['255,250,245', '230,60,40'], ['255,180,60', '255,255,255'], ['30,30,30', '255,140,60']];
      for (let i = 0; i < (this.low ? 3 : 5); i++) this.koi.push({ x: rand(0, w), y: h * rand(0.3, 0.95), a: rand(0, TAU), v: rand(18, 34) * sc, turn: rand(-0.4, 0.4), ph: rand(0, TAU), len: rand(40, 58) * sc, col: kcols[i % kcols.length] });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      for (const k of this.koi) {
        k.ph += s * (5 + this.flash * 6);
        if (Math.random() < s * 0.4) k.turn = rand(-0.6, 0.6);
        k.a += k.turn * s;
        const sp = k.v * (1 + this.flash * 1.5);
        k.x += Math.cos(k.a) * sp * s; k.y += Math.sin(k.a) * sp * s;
        if (k.x < -40) k.x = this.w + 40; if (k.x > this.w + 40) k.x = -40;
        if (k.y < this.h * 0.26) k.a = Math.abs(k.a); if (k.y > this.h + 30) k.a = -Math.abs(k.a);
        if (Math.random() < s * 0.15 && this.ripples.length < 25) this.ripples.push({ x: k.x, y: k.y, t: 0, max: 1.6 });
      }
      for (const r of this.ripples) r.t += s;
      this.ripples = this.ripples.filter((r) => r.t < r.max);
    }
    drawKoi(g, k) {
      const L = k.len;
      g.save(); g.translate(k.x, k.y); g.rotate(k.a);
      const sw = Math.sin(k.ph) * 0.35;
      // 尾鰭
      g.save(); g.translate(-L * 0.5, 0); g.rotate(sw);
      g.fillStyle = `rgba(${k.col[0]},0.75)`;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-L * 0.25, -L * 0.25, -L * 0.42, -L * 0.18); g.quadraticCurveTo(-L * 0.3, 0, -L * 0.42, L * 0.18); g.quadraticCurveTo(-L * 0.25, L * 0.25, 0, 0); g.fill();
      g.restore();
      // 身體
      const gr = g.createLinearGradient(0, -L * 0.15, 0, L * 0.15);
      gr.addColorStop(0, `rgba(${k.col[0]},1)`); gr.addColorStop(0.5, `rgba(${k.col[0]},0.95)`); gr.addColorStop(1, `rgba(${k.col[0]},0.8)`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(L * 0.5, 0);
      g.bezierCurveTo(L * 0.45, -L * 0.17, -L * 0.1, -L * 0.18, -L * 0.52, Math.sin(k.ph) * L * 0.03);
      g.bezierCurveTo(-L * 0.1, L * 0.18, L * 0.45, L * 0.17, L * 0.5, 0);
      g.fill();
      // 斑紋
      g.fillStyle = `rgba(${k.col[1]},0.9)`;
      g.beginPath(); g.ellipse(L * 0.1, -L * 0.03, L * 0.13, L * 0.07, 0.3, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-L * 0.2, L * 0.03, L * 0.09, L * 0.05, -0.2, 0, TAU); g.fill();
      // 胸鰭
      g.fillStyle = `rgba(${k.col[0]},0.55)`;
      g.beginPath(); g.ellipse(L * 0.2, -L * 0.17, L * 0.1, L * 0.04, -0.8 + sw, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(L * 0.2, L * 0.17, L * 0.1, L * 0.04, 0.8 - sw, 0, TAU); g.fill();
      g.restore();
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      for (const k of this.koi) this.drawKoi(g, k);
      g.strokeStyle = 'rgba(200,230,255,0.35)'; g.lineWidth = 1;
      for (const r of this.ripples) {
        const k = r.t / r.max;
        g.globalAlpha = (1 - k) * 0.8;
        g.beginPath(); g.ellipse(r.x, r.y, 4 + k * 40 * this.sc, 2 + k * 16 * this.sc, 0, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < this.pads.length; i++) {
        const p = this.pads[i];
        const sway = Math.sin(t / 1400 + i) * 0.06;
        const sz = p.r * 1.3;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.4 + beat * 0.3 + this.flash * 0.3;
        g.drawImage(this.glowDot.cv, p.x - sz, p.y - sz * 1.1, sz * 2, sz * 2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.save(); g.translate(p.x, p.y); g.rotate(sway);
        g.drawImage(this.flower.cv, -sz * 0.5, -sz * 0.73, sz, sz);
        g.restore();
      }
    }
    burst(d, B) {
      this.flash = Math.min(1.5, this.flash + 0.3 * d.lines);
      for (let i = 0; i < d.lines * 4; i++) this.ripples.push({ x: rand(0, this.w), y: this.h * rand(0.3, 1), t: 0, max: 1.8 });
    }
  }

  // =========================================================
  // 仙山：雲海上的石柱群峰、山頂涼亭、瀑布、仙鶴、流雲
  // =========================================================
  class FairyPeaks {
    constructor(low) { this.low = low; this.flash = 0; this.bloomScale = 0.4; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#9fc8d8'], [0.4, '#e6e2d2'], [0.7, '#f5dcc4'], [1, '#c9d6dc']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.3, h * 0.25, w * 0.7, '255,245,225', 0.6);
      // 石柱群峰（遠淡近深，頂上有松）
      const pillar = (x, top, wd, color, hi) => {
        const path = () => {
          g.beginPath(); g.moveTo(x - wd * 0.5, h);
          for (let y = h; y > top; y -= 12) g.lineTo(x - wd * 0.5 + Math.sin(y * 0.05 + x) * wd * 0.08, y);
          g.quadraticCurveTo(x, top - wd * 0.15, x + wd * 0.5, top + wd * 0.05);
          for (let y = top; y < h; y += 12) g.lineTo(x + wd * 0.5 + Math.sin(y * 0.04 + x * 2) * wd * 0.08, y);
          g.closePath();
        };
        g.fillStyle = color; path(); g.fill();
        // 立體感：左側受光、右側陰影
        const sh = g.createLinearGradient(x - wd * 0.5, 0, x + wd * 0.5, 0);
        sh.addColorStop(0, hi); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.fillStyle = sh; path(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
        for (let y = top + 10; y < h; y += rand(14, 30)) { g.beginPath(); g.moveTo(x - wd * 0.5, y); g.lineTo(x + wd * 0.5, y + rand(-3, 3)); g.stroke(); }
        // 頂上松
        for (let k = 0; k < 4; k++) {
          const px = x + rand(-0.35, 0.35) * wd, ph = rand(8, 16) * sc;
          g.fillStyle = color === '#2c3d36' ? '#1c2b22' : 'rgba(60,85,80,0.7)';
          g.beginPath(); g.moveTo(px, top - ph); g.lineTo(px - ph * 0.6, top + 2); g.lineTo(px + ph * 0.6, top + 2); g.fill();
        }
      };
      for (let i = 0; i < 7; i++) pillar(rand(0, w), h * rand(0.35, 0.55), rand(24, 40) * sc, 'rgba(110,140,150,0.45)', 'rgba(255,255,255,0.08)');
      for (let i = 0; i < 3; i++) glow(g, rand(0, w), h * rand(0.6, 0.8), w * 0.5, '255,255,255', 0.5);
      const near = [[0.08, 0.4, 56], [0.9, 0.32, 64], [0.5, 0.58, 48]];
      this.peaks = [];
      for (const [px, pt, pw] of near) { pillar(px * w, h * pt, pw * sc, '#2c3d36', 'rgba(200,230,210,0.15)'); this.peaks.push({ x: px * w, top: h * pt, wd: pw * sc }); }
      // 山頂涼亭（右側高峰）
      const P = this.peaks[1];
      const ex = P.x, ey = P.top - 4 * sc, ew = 26 * sc;
      g.fillStyle = '#7a1e1e'; g.fillRect(ex - ew * 0.35, ey - ew * 0.55, ew * 0.08, ew * 0.55); g.fillRect(ex + ew * 0.27, ey - ew * 0.55, ew * 0.08, ew * 0.55);
      g.fillStyle = '#1a1a1a';
      g.beginPath(); g.moveTo(ex - ew * 0.65, ey - ew * 0.5); g.quadraticCurveTo(ex - ew * 0.3, ey - ew * 0.55, ex, ey - ew * 1.05); g.quadraticCurveTo(ex + ew * 0.3, ey - ew * 0.55, ex + ew * 0.65, ey - ew * 0.5); g.lineTo(ex, ey - ew * 0.62); g.fill();
      // 瀑布起點（左側高峰）
      const Q = this.peaks[0];
      this.fall = { x: Q.x + Q.wd * 0.35, top: Q.top + 20 * sc, bot: h * 0.85, wd: 7 * sc };
      this.drops = [];
      for (let i = 0; i < (this.low ? 15 : 35); i++) this.drops.push({ y: rand(0, 1), v: rand(0.5, 0.9), dx: rand(-1, 1) });
      // 雲
      this.cloud = softDot('255,255,255');
      this.clouds = [];
      for (let i = 0; i < (this.low ? 8 : 16); i++) this.clouds.push({ x: rand(-0.2, 1.2) * w, y: h * rand(0.55, 1), r: rand(60, 130) * sc, v: rand(4, 12) * sc, a: rand(0.45, 0.8) });
      this.cranes = [];
      for (let i = 0; i < 3; i++) this.cranes.push({ x: rand(0, w), y: h * rand(0.12, 0.35), v: rand(14, 24) * sc, ph: rand(0, TAU), s: rand(1.2, 1.8) * sc });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      for (const d of this.drops) { d.y += d.v * s; if (d.y > 1) d.y -= 1; }
      for (const c of this.clouds) { c.x += c.v * s; if (c.x - c.r > this.w) c.x = -c.r; }
      for (const c of this.cranes) { c.x += c.v * s; c.ph += s * 2.4; if (c.x > this.w + 50) { c.x = -50; c.y = this.h * rand(0.12, 0.35); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 瀑布
      const F = this.fall;
      const fg = g.createLinearGradient(0, F.top, 0, F.bot);
      fg.addColorStop(0, 'rgba(255,255,255,0.85)'); fg.addColorStop(1, 'rgba(255,255,255,0.15)');
      g.fillStyle = fg; g.fillRect(F.x - F.wd / 2, F.top, F.wd, F.bot - F.top);
      g.strokeStyle = 'rgba(210,235,245,0.9)'; g.lineWidth = 1;
      for (const d of this.drops) {
        const y = F.top + d.y * (F.bot - F.top);
        g.beginPath(); g.moveTo(F.x + d.dx * F.wd * 0.4, y); g.lineTo(F.x + d.dx * F.wd * 0.4, y + 10 * this.sc); g.stroke();
      }
      // 仙鶴：白身、黑翼尖、紅頂
      for (const c of this.cranes) {
        const k = c.s, f = Math.sin(c.ph) * 9 * k;
        g.fillStyle = '#fbfbf8';
        g.beginPath(); g.ellipse(c.x, c.y, 7 * k, 2.2 * k, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(c.x - 2 * k, c.y); g.quadraticCurveTo(c.x - 4 * k, c.y - f * 0.6, c.x - 14 * k, c.y - f); g.lineTo(c.x - 9 * k, c.y - f * 0.8 + 2 * k); g.quadraticCurveTo(c.x - 3 * k, c.y + 1 * k, c.x + 2 * k, c.y); g.fill();
        g.fillStyle = '#222';
        g.beginPath(); g.moveTo(c.x - 14 * k, c.y - f); g.lineTo(c.x - 10 * k, c.y - f * 0.85 + 1.5 * k); g.lineTo(c.x - 12 * k, c.y - f * 0.7); g.fill();
        g.strokeStyle = '#f2f2ee'; g.lineWidth = 1.2 * k;
        g.beginPath(); g.moveTo(c.x + 6 * k, c.y - 0.5 * k); g.lineTo(c.x + 13 * k, c.y - 1.5 * k); g.stroke();
        g.strokeStyle = '#333'; g.lineWidth = 0.8 * k;
        g.beginPath(); g.moveTo(c.x - 6 * k, c.y + 0.5 * k); g.lineTo(c.x - 15 * k, c.y + 2 * k); g.stroke();
        g.fillStyle = '#d42a2a'; g.beginPath(); g.arc(c.x + 13 * k, c.y - 1.8 * k, 1 * k, 0, TAU); g.fill();
      }
      // 流雲
      for (const c of this.clouds) {
        g.globalAlpha = c.a * (0.9 + this.flash * 0.1);
        g.drawImage(this.cloud.cv, c.x - c.r, c.y - c.r * 0.45, c.r * 2, c.r * 0.9);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
      glow(g, w * 0.3, h * 0.25, w * 0.5, '255,240,210', 0.08 + beat * 0.08 + this.flash * 0.15);
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0)); for (const c of this.clouds) c.x += 6 * d.lines * this.sc; }
  }

  // =========================================================
  // 土星環：巨大環狀行星（前後環遮擋）、衛星、小行星帶、流星
  // =========================================================
  class Saturn {
    constructor(low) { this.low = low; this.flash = 0; this.intensity = 0; this.meteorTimer = 3; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#03040c'], [0.6, '#0a0c1e'], [1, '#141024']]);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) glow(g, rand(0, w), rand(0, h), rand(0.3, 0.5) * w, ['40,90,140', '140,80,60', '90,60,140'][i % 3], 0.12);
      for (let i = 0; i < (this.low ? 300 : 700); i++) {
        g.fillStyle = `rgba(${['230,235,255', '255,230,200', '200,215,255'][(Math.random() * 3) | 0]},${rand(0.15, 0.8)})`;
        const s = rand(0.5, 1.6); g.fillRect(rand(0, w), rand(0, h), s, s);
      }
      g.globalCompositeOperation = 'source-over';
      // 行星
      const px = (this.px = w * 0.72), py = (this.py = h * 0.72), pr = (this.pr = Math.min(w, h) * 0.34);
      const ring = (front) => {
        g.save(); g.translate(px, py); g.rotate(-0.38); g.scale(1, 0.24);
        const bands = [[1.25, 1.42, 'rgba(220,190,150,0.55)'], [1.44, 1.62, 'rgba(240,215,175,0.75)'], [1.66, 1.72, 'rgba(180,150,120,0.35)'], [1.74, 1.98, 'rgba(230,200,160,0.6)'], [2.02, 2.12, 'rgba(200,170,140,0.3)']];
        for (const [r0, r1, c] of bands) {
          g.strokeStyle = c; g.lineWidth = (r1 - r0) * pr;
          g.beginPath();
          if (front) g.arc(0, 0, (r0 + r1) / 2 * pr, 0, Math.PI);
          else g.arc(0, 0, (r0 + r1) / 2 * pr, Math.PI, TAU);
          g.stroke();
        }
        g.restore();
      };
      ring(false);
      const pg = g.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#f6dcae'); pg.addColorStop(0.5, '#d2a46c'); pg.addColorStop(0.85, '#7a5634'); pg.addColorStop(1, '#2a1a10');
      g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(px, py, pr, 0, TAU); g.clip();
      g.translate(px, py); g.rotate(-0.38);
      for (let i = -8; i <= 8; i++) {
        g.fillStyle = `rgba(${i % 2 ? '120,80,40' : '255,235,200'},${0.06 + Math.abs(Math.sin(i * 1.7)) * 0.08})`;
        g.fillRect(-pr * 1.2, i * pr * 0.11, pr * 2.4, pr * 0.07);
      }
      g.restore();
      // 夜面陰影
      const sh = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.55, 'rgba(0,0,0,0.1)'); sh.addColorStop(1, 'rgba(0,0,10,0.75)');
      g.fillStyle = sh; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      ring(true);
      glow(g, px, py, pr * 1.4, '255,210,160', 0.08);
      this.sprites = ['255,240,220', '180,210,255'].map(starSprite);
      this.bright = [];
      for (let i = 0; i < (this.low ? 10 : 22); i++) this.bright.push({ x: rand(0, w), y: rand(0, h * 0.6), s: rand(6, 16) * sc, k: i % 2, ph: rand(0, TAU) });
      this.rocks = [];
      for (let i = 0; i < (this.low ? 12 : 26); i++) {
        const pts = []; const n = 7;
        for (let k = 0; k < n; k++) pts.push([Math.cos(k / n * TAU) * rand(0.6, 1), Math.sin(k / n * TAU) * rand(0.6, 1)]);
        this.rocks.push({ x: rand(0, w), y: rand(0, h), r: rand(2, 7) * sc, vx: rand(-8, -2) * sc, vy: rand(1, 4) * sc, rot: rand(0, TAU), vr: rand(-1, 1), pts });
      }
      this.moons = [{ a: 0.5, r: 2.45, s: 9 * sc, v: 0.12, c: '#cfd6e6' }, { a: 3.2, r: 2.9, s: 6 * sc, v: 0.08, c: '#e8c9a0' }];
      this.meteors = new Meteors(sc);
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      for (const r of this.rocks) { r.x += r.vx * s; r.y += r.vy * s; r.rot += r.vr * s; if (r.x < -20) { r.x = this.w + 20; r.y = rand(0, this.h); } if (r.y > this.h + 20) r.y = -20; }
      for (const m of this.moons) m.a += m.v * s;
      for (const b of this.bright) b.ph += s * 1.3;
      this.meteorTimer -= s;
      if (this.meteorTimer <= 0) { this.meteors.random(this.w, this.h * 0.6, false); this.meteorTimer = rand(3, 7) / (1 + this.intensity * 0.3); }
      this.meteors.update(s);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bright) { g.globalAlpha = 0.5 + 0.5 * Math.sin(b.ph); g.drawImage(this.sprites[b.k].cv, b.x - b.s, b.y - b.s, b.s * 2, b.s * 2); }
      g.globalAlpha = 1;
      glow(g, this.px, this.py, this.pr * 1.6, '255,200,150', 0.06 + beat * 0.08 + this.flash * 0.2);
      g.globalCompositeOperation = 'source-over';
      // 衛星：繞到行星後方時隱藏
      for (const m of this.moons) {
        const ex = Math.cos(m.a) * this.pr * m.r, ey = Math.sin(m.a) * this.pr * m.r * 0.24;
        const x = this.px + ex * Math.cos(-0.38) - ey * Math.sin(-0.38), y = this.py + ex * Math.sin(-0.38) + ey * Math.cos(-0.38);
        if (Math.sin(m.a) < 0 && Math.hypot(x - this.px, y - this.py) < this.pr) continue;
        const mg = g.createRadialGradient(x - m.s * 0.4, y - m.s * 0.4, 0, x, y, m.s);
        mg.addColorStop(0, m.c); mg.addColorStop(1, '#202430');
        g.fillStyle = mg; g.beginPath(); g.arc(x, y, m.s, 0, TAU); g.fill();
      }
      g.fillStyle = '#6b5a4c';
      for (const r of this.rocks) {
        g.save(); g.translate(r.x, r.y); g.rotate(r.rot);
        const rg = g.createLinearGradient(-r.r, -r.r, r.r, r.r);
        rg.addColorStop(0, '#b8a08a'); rg.addColorStop(1, '#2a2420');
        g.fillStyle = rg;
        g.beginPath(); r.pts.forEach(([px, py], i) => (i ? g.lineTo(px * r.r, py * r.r) : g.moveTo(px * r.r, py * r.r))); g.closePath(); g.fill();
        g.restore();
      }
      this.meteors.draw(g);
    }
    burst(d) {
      this.flash = Math.min(1.5, this.flash + 0.3 * d.lines);
      for (let i = 0; i < (d.lines >= 4 ? 3 : d.lines >= 2 ? 1 : 0); i++) this.meteors.random(this.w, this.h * 0.6, true);
    }
  }

  // =========================================================
  // 楓紅：中式庭園白牆、月洞門、灰瓦、楓樹、飄落楓葉、金色斜陽
  // =========================================================
  function mapleSprite(c1, c2) {
    const S = layer(40, 40);
    const g = S.g;
    const gr = g.createRadialGradient(20, 24, 2, 20, 20, 20);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.beginPath();
    const lobes = [[-90, 18], [-150, 15], [-30, 15], [160, 11], [20, 11]];
    g.moveTo(20, 24);
    for (const [deg, len] of lobes) {
      const a = deg * Math.PI / 180;
      g.lineTo(20 + Math.cos(a - 0.35) * len * 0.5, 22 + Math.sin(a - 0.35) * len * 0.5);
      g.lineTo(20 + Math.cos(a) * len, 22 + Math.sin(a) * len);
      g.lineTo(20 + Math.cos(a + 0.35) * len * 0.5, 22 + Math.sin(a + 0.35) * len * 0.5);
      g.lineTo(20, 24);
    }
    g.fill();
    g.strokeStyle = 'rgba(90,20,10,0.5)'; g.lineWidth = 0.8;
    for (const [deg, len] of lobes) { const a = deg * Math.PI / 180; g.beginPath(); g.moveTo(20, 24); g.lineTo(20 + Math.cos(a) * len * 0.85, 22 + Math.sin(a) * len * 0.85); g.stroke(); }
    g.beginPath(); g.moveTo(20, 24); g.lineTo(20, 36); g.stroke();
    return S;
  }
  class Maple {
    constructor(low) { this.low = low; this.wind = 0; this.extra = []; this.bloomScale = 0.45; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#f3b86c'], [0.35, '#f7d18e'], [0.55, '#fde9c2'], [1, '#e9ddc8']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.3, h * 0.3, w * 0.7, '255,220,150', 0.5);
      // 白牆（下半部），上有灰瓦
      const wallTop = (this.wallTop = h * 0.58);
      const wg = g.createLinearGradient(0, wallTop, 0, h);
      wg.addColorStop(0, '#f6f1e8'); wg.addColorStop(1, '#d8d0c2');
      g.fillStyle = wg; g.fillRect(0, wallTop, w, h - wallTop);
      g.fillStyle = '#4c4f58'; g.fillRect(0, wallTop - 10 * sc, w, 12 * sc);
      g.fillStyle = '#5d616b';
      for (let x = 0; x < w; x += 9 * sc) { g.beginPath(); g.arc(x + 4 * sc, wallTop - 10 * sc, 4.5 * sc, Math.PI, 0); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, wallTop + 2 * sc, w, 6 * sc);
      // 月洞門：透出遠方的寶塔與夕照
      const gx = (this.gx = w * 0.5), gy = (this.gy = wallTop + (h - wallTop) * 0.52), gr2 = (this.gr = Math.min(w * 0.3, (h - wallTop) * 0.42));
      g.save(); g.beginPath(); g.arc(gx, gy, gr2, 0, TAU); g.clip();
      g.fillStyle = vgrad(g, h, [[wallTop / h, '#f5b36a'], [1, '#c8743e']]); g.fillRect(gx - gr2, gy - gr2, gr2 * 2, gr2 * 2);
      glow(g, gx + gr2 * 0.2, gy, gr2, '255,230,170', 0.6);
      g.fillStyle = 'rgba(110,60,40,0.75)';
      const tx = gx - gr2 * 0.25;
      for (let k = 0; k < 5; k++) {
        const ww = gr2 * (0.34 - k * 0.05), yy = gy + gr2 * 0.4 - k * gr2 * 0.22;
        g.fillRect(tx - ww * 0.35, yy - gr2 * 0.14, ww * 0.7, gr2 * 0.14);
        g.beginPath(); g.moveTo(tx - ww * 0.65, yy - gr2 * 0.12); g.quadraticCurveTo(tx, yy - gr2 * 0.24, tx + ww * 0.65, yy - gr2 * 0.12); g.lineTo(tx, yy - gr2 * 0.18); g.fill();
      }
      g.fillStyle = 'rgba(80,50,40,0.6)';
      g.beginPath(); g.moveTo(gx - gr2, gy + gr2 * 0.6); g.quadraticCurveTo(gx, gy + gr2 * 0.35, gx + gr2, gy + gr2 * 0.55); g.lineTo(gx + gr2, gy + gr2); g.lineTo(gx - gr2, gy + gr2); g.fill();
      g.restore();
      g.strokeStyle = '#9a9488'; g.lineWidth = 6 * sc; g.beginPath(); g.arc(gx, gy, gr2 + 3 * sc, 0, TAU); g.stroke();
      g.strokeStyle = '#efe9de'; g.lineWidth = 2 * sc; g.beginPath(); g.arc(gx, gy, gr2 + 6 * sc, 0, TAU); g.stroke();
      // 楓樹：枝幹 + 一團團紅黃葉叢
      this.leafImgs = [mapleSprite('#ffcf5a', '#e8641c'), mapleSprite('#ff7a3a', '#b8180f'), mapleSprite('#ffb04a', '#d23a12')];
      const tree = (x0, y0, ang, len, wd, d) => {
        if (d <= 0) {
          for (let k = 0; k < 9; k++) {
            const img = this.leafImgs[(Math.random() * 3) | 0];
            const s = rand(10, 18) * sc;
            g.save(); g.translate(x0 + rand(-18, 18) * sc, y0 + rand(-14, 14) * sc); g.rotate(rand(0, TAU));
            g.drawImage(img.cv, -s, -s, s * 2, s * 2); g.restore();
          }
          return;
        }
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.strokeStyle = '#3a2418'; g.lineWidth = wd; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + rand(-8, 8), (y0 + y1) / 2 + rand(-8, 8), x1, y1); g.stroke();
        tree(x1, y1, ang + rand(0.25, 0.6), len * 0.72, wd * 0.65, d - 1);
        tree(x1, y1, ang - rand(0.25, 0.6), len * 0.72, wd * 0.65, d - 1);
      };
      tree(-10, h * 0.62, -0.75, 90 * sc, 12 * sc, 5);
      tree(w + 10, h * 0.6, Math.PI + 0.7, 80 * sc, 11 * sc, 5);
      // 斜陽光束
      const R = (this.ray = layer(60, 500));
      const rg = R.g.createLinearGradient(0, 0, 0, 500);
      rg.addColorStop(0, 'rgba(255,230,170,0.5)'); rg.addColorStop(1, 'rgba(255,230,170,0)');
      R.g.fillStyle = rg; R.g.beginPath(); R.g.moveTo(22, 0); R.g.lineTo(38, 0); R.g.lineTo(60, 500); R.g.lineTo(0, 500); R.g.fill();
      this.leaves = [];
      for (let i = 0; i < (this.low ? 12 : 26); i++) this.leaves.push(this.newLeaf(true));
    }
    newLeaf(anywhere, x, y) {
      return { x: x != null ? x : rand(-0.2, 1) * this.w, y: y != null ? y : anywhere ? rand(0, this.h) : rand(-30, -10), vx: rand(10, 30), vy: rand(25, 50), rot: rand(0, TAU), vr: rand(-2, 2), flip: rand(0, TAU), vf: rand(2, 4), s: rand(9, 15) * this.sc, k: (Math.random() * 3) | 0 };
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      const upd = (p) => { p.x += (p.vx + this.wind) * s; p.y += p.vy * s; p.rot += p.vr * s; p.flip += p.vf * s; };
      for (const p of this.leaves) { upd(p); if (p.y > this.h + 20 || p.x > this.w + 30) Object.assign(p, this.newLeaf(false)); }
      for (const p of this.extra) { upd(p); p.vy += 40 * s; }
      this.extra = this.extra.filter((p) => p.y < this.h + 20 && p.x < this.w + 40);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        g.save(); g.globalAlpha = 0.12 + 0.06 * Math.sin(t / 1800 + i) + beat * 0.05;
        g.translate(w * (0.05 + i * 0.12), -20); g.rotate(-0.5);
        g.drawImage(this.ray.cv, -30, 0, 60 * (1 + i * 0.2), h * 1.3); g.restore();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const drawL = (p) => {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.flip));
        g.drawImage(this.leafImgs[p.k].cv, -p.s, -p.s, p.s * 2, p.s * 2); g.restore();
      };
      for (const p of this.leaves) drawL(p);
      for (const p of this.extra) drawL(p);
    }
    burst(d, B) {
      this.wind = Math.min(500, this.wind + 70 * d.lines + (d.lines >= 4 ? 150 : 0));
      const n = Math.min(this.low ? 10 : 30, d.lines * (this.low ? 3 : 8));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        const p = this.newLeaf(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c);
        p.vx = rand(60, 220); p.vy = rand(-90, 10);
        this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 海上風暴：翻滾烏雲、斜雨、層層巨浪與浪花、燈塔旋轉光束、閃電
  // =========================================================
  class Storm {
    constructor(low) { this.low = low; this.flash = 0; this.bolts = []; this.boltTimer = 3; this.intensity = 0; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#05070c'], [0.5, '#141c2a'], [0.62, '#26344a'], [1, '#070b12']]);
      g.fillRect(0, 0, w, h);
      // 燈塔岩岸（右側）
      const lx = (this.lx = w * 0.84), ly = (this.ly = h * 0.5);
      g.fillStyle = '#05080c';
      g.beginPath(); g.moveTo(w * 0.62, h * 0.72); g.quadraticCurveTo(w * 0.75, h * 0.58, lx - 20 * sc, ly + 60 * sc); g.lineTo(w, ly + 40 * sc); g.lineTo(w, h * 0.75); g.closePath(); g.fill();
      const tw = 16 * sc, th = 70 * sc;
      const tg = g.createLinearGradient(lx - tw, 0, lx + tw, 0);
      tg.addColorStop(0, '#d8d8d8'); tg.addColorStop(0.5, '#f4f4f4'); tg.addColorStop(1, '#8a8a8a');
      g.fillStyle = tg;
      g.beginPath(); g.moveTo(lx - tw * 0.6, ly + 60 * sc); g.lineTo(lx - tw * 0.4, ly + 60 * sc - th); g.lineTo(lx + tw * 0.4, ly + 60 * sc - th); g.lineTo(lx + tw * 0.6, ly + 60 * sc); g.fill();
      g.fillStyle = '#b8282a';
      for (let k = 0; k < 2; k++) g.fillRect(lx - tw * 0.55 + k * tw * 0.04, ly + 60 * sc - th * (0.3 + k * 0.35), tw * 1.1 - k * tw * 0.08, th * 0.12);
      g.fillStyle = '#1c1c1c'; g.fillRect(lx - tw * 0.5, ly + 60 * sc - th - 14 * sc, tw, 3 * sc);
      g.fillStyle = '#ffe9a8'; g.fillRect(lx - tw * 0.32, ly + 60 * sc - th - 11 * sc, tw * 0.64, 11 * sc);
      g.fillStyle = '#1c1c1c'; g.beginPath(); g.moveTo(lx - tw * 0.45, ly + 60 * sc - th - 11 * sc); g.lineTo(lx, ly + 60 * sc - th - 22 * sc); g.lineTo(lx + tw * 0.45, ly + 60 * sc - th - 11 * sc); g.fill();
      this.lampY = ly + 60 * sc - th - 5.5 * sc;
      // 烏雲素材
      // 烏雲：多層灰藍雲團（中心不發白）
      const C = (this.cloud = layer(64, 64));
      const cgr = C.g.createRadialGradient(32, 32, 0, 32, 32, 32);
      cgr.addColorStop(0, 'rgba(46,56,74,0.95)'); cgr.addColorStop(0.55, 'rgba(34,42,58,0.7)'); cgr.addColorStop(1, 'rgba(20,26,38,0)');
      C.g.fillStyle = cgr; C.g.fillRect(0, 0, 64, 64);
      this.clouds = [];
      for (let i = 0; i < (this.low ? 14 : 28); i++) this.clouds.push({ x: rand(-0.2, 1.2) * w, y: rand(-0.05, 0.38) * h, r: rand(80, 170) * sc, v: rand(10, 30) * sc, a: rand(0.6, 0.95) });
      this.drops = [];
      for (let i = 0; i < (this.low ? 70 : 170); i++) this.drops.push({ x: rand(0, w * 1.3), y: rand(0, h), v: rand(800, 1100) * sc, l: rand(14, 26) * sc });
      this.waves = [0.66, 0.74, 0.83, 0.93].map((k, i) => ({ y: h * k, amp: (8 + i * 6) * sc, len: rand(0.012, 0.02) / sc, sp: 0.8 + i * 0.35, ph: rand(0, TAU), col: ['#1a2a3c', '#14222f', '#0e1924', '#08111a'][i] }));
    }
    bolt() {
      const x0 = rand(0.05, 0.7) * this.w;
      const pts = [[x0, 0]];
      let x = x0, y = 0;
      const end = this.h * rand(0.45, 0.62);
      while (y < end) { y += rand(18, 36) * this.sc; x += rand(-22, 22) * this.sc; pts.push([x, y]); }
      const branch = [];
      const bi = (pts.length * rand(0.3, 0.6)) | 0;
      let bx = pts[bi][0], by = pts[bi][1];
      branch.push([bx, by]);
      for (let k = 0; k < 4; k++) { by += rand(15, 30) * this.sc; bx += rand(10, 30) * this.sc * (Math.random() < 0.5 ? -1 : 1); branch.push([bx, by]); }
      this.bolts.push({ pts, branch, t: 0, life: 0.35 });
      this.flash = Math.max(this.flash, 1);
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.008, s);
      for (const c of this.clouds) { c.x += c.v * s; if (c.x - c.r > this.w) c.x = -c.r; }
      for (const d of this.drops) { d.y += d.v * s; d.x -= d.v * 0.25 * s; if (d.y > this.h) { d.y = rand(-40, 0); d.x = rand(0, this.w * 1.3); } }
      for (const b of this.bolts) b.t += s;
      this.bolts = this.bolts.filter((b) => b.t < b.life);
      this.boltTimer -= s;
      if (this.boltTimer <= 0) { this.bolt(); this.boltTimer = rand(4, 9) / (1 + this.intensity * 0.35); }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, ts = t / 1000;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 燈塔光束
      g.globalCompositeOperation = 'lighter';
      const ang = ts * 0.9;
      const dir = Math.cos(ang);
      const len = w * 1.2;
      const spread = 0.12;
      const bx = this.lx, by = this.lampY;
      const bgr = g.createLinearGradient(bx, by, bx + dir * len, by);
      bgr.addColorStop(0, `rgba(255,240,180,${0.35 * Math.abs(dir) + 0.05})`); bgr.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = bgr;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + dir * len, by - len * spread * Math.abs(dir)); g.lineTo(bx + dir * len, by + len * spread * Math.abs(dir)); g.fill();
      glow(g, bx, by, 30 * this.sc, '255,240,180', 0.6);
      g.globalCompositeOperation = 'source-over';
      // 烏雲
      for (const c of this.clouds) {
        g.globalAlpha = c.a;
        g.drawImage(this.cloud.cv, c.x - c.r, c.y - c.r * 0.55, c.r * 2, c.r * 1.1);
      }
      g.globalAlpha = 1;
      // 閃電
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bolts) {
        const a = 1 - b.t / b.life;
        for (const [lw, al] of [[6, 0.25], [2.2, 1]]) {
          g.strokeStyle = `rgba(210,225,255,${a * al})`; g.lineWidth = lw * this.sc;
          g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
          g.beginPath(); b.branch.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      }
      if (this.flash > 0.02) { g.fillStyle = `rgba(190,205,255,${this.flash * 0.28})`; g.fillRect(0, 0, w, h); }
      g.globalCompositeOperation = 'source-over';
      // 巨浪與浪花
      for (const wv of this.waves) {
        g.fillStyle = wv.col;
        g.beginPath(); g.moveTo(0, h);
        const pts = [];
        for (let x = 0; x <= w + 8; x += 8) {
          const y = wv.y + Math.sin(x * wv.len + ts * wv.sp + wv.ph) * wv.amp + Math.sin(x * wv.len * 2.3 - ts * wv.sp * 1.4) * wv.amp * 0.35;
          pts.push([x, y]); g.lineTo(x, y);
        }
        g.lineTo(w, h); g.closePath(); g.fill();
        g.strokeStyle = `rgba(220,235,255,${0.25 + this.flash * 0.2})`; g.lineWidth = 1.5 * this.sc;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.fillStyle = 'rgba(230,240,255,0.5)';
        for (let i = 0; i < pts.length; i += 3) { const [x, y] = pts[i]; if (pts[i + 1] && pts[i + 1][1] > y && Math.random() < 0.4) g.fillRect(x, y - 2, 3 * this.sc, 1.5); }
      }
      // 雨
      g.strokeStyle = 'rgba(170,190,220,0.35)'; g.lineWidth = 1;
      g.beginPath();
      for (const d of this.drops) { g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.25, d.y - d.l); }
      g.stroke();
    }
    burst(d) { if (d.lines >= 2 || d.tspin) this.bolt(); if (d.lines >= 4) setTimeout(() => this.bolt(), 180); }
  }

  // =========================================================
  // 飛龍：祥雲、金龍追逐火焰寶珠（龍身沿軌跡蜿蜒、背鰭、龍角、龍鬚）
  // =========================================================
  class Dragon {
    constructor(low) { this.low = low; this.flash = 0; this.t = 0; this.speed = 1; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0b0f2a'], [0.45, '#1d2a5a'], [0.75, '#6a3a6a'], [1, '#c4664a']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.5, h * 0.95, w * 0.9, '255,170,90', 0.35);
      for (let i = 0; i < 150; i++) { g.fillStyle = `rgba(255,240,220,${rand(0.1, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.5), 1, 1); }
      this.clouds = [];
      for (let i = 0; i < 9; i++) this.clouds.push({ x: rand(0, w), y: rand(0.1, 0.95) * h, s: rand(0.6, 1.2) * sc, a: rand(0.35, 0.7), v: rand(5, 14) * sc });
      this.cloudImg = layer(140, 70);
      // 將祥雲畫成素材
      const C = this.cloudImg, cg = C.g;
      cg.save(); cg.translate(70, 40);
      cg.fillStyle = 'rgba(255,230,190,0.2)'; cg.strokeStyle = 'rgba(255,210,140,0.95)'; cg.lineWidth = 2;
      cg.beginPath(); cg.moveTo(-60, 10); cg.quadraticCurveTo(-40, -20, -10, -5); cg.quadraticCurveTo(10, -30, 35, -10); cg.quadraticCurveTo(65, -15, 60, 10); cg.closePath(); cg.fill(); cg.stroke();
      for (const [cx, cy, r] of [[-30, -6, 10], [10, -14, 13], [40, -4, 9]]) {
        cg.beginPath();
        for (let k = 0; k < 40; k++) { const a2 = k / 40 * TAU * 1.6; const rr = r * (1 - k / 50); cg.lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr); }
        cg.stroke();
      }
      cg.restore();
      this.pearl = softDot('255,120,40');
      this.segN = this.low ? 36 : 48;
    }
    headPos(t) {
      const w = this.w, h = this.h;
      return [w * (0.5 + 0.4 * Math.sin(t * 0.5)), h * (0.42 + 0.3 * Math.sin(t * 0.8 + 1) * Math.cos(t * 0.31))];
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      this.speed = 1 + this.flash * 1.5;
      this.t += s * this.speed;
      for (const c of this.clouds) { c.x += c.v * s; if (c.x > this.w + 80 * c.s) c.x = -80 * c.s; }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      for (const c of this.clouds) { g.globalAlpha = c.a; g.drawImage(this.cloudImg.cv, c.x - 70 * c.s, c.y - 35 * c.s, 140 * c.s, 70 * c.s); }
      g.globalAlpha = 1;
      // 寶珠（龍頭前方）
      const ph = this.headPos(this.t + 0.35);
      g.globalCompositeOperation = 'lighter';
      const pr = (16 + beat * 6 + this.flash * 10) * sc;
      g.drawImage(this.pearl.cv, ph[0] - pr * 2.5, ph[1] - pr * 2.5, pr * 5, pr * 5);
      glow(g, ph[0], ph[1], pr * 1.2, '255,250,220', 0.9);
      g.globalCompositeOperation = 'source-over';
      // 龍身：沿軌跡取樣
      const width = (i) => (34 * sc) * (i < 4 ? 0.7 + i * 0.08 : Math.max(0.15, 1 - (i - 4) / this.segN * 0.95));
      // 沿飛行軌跡按距離取樣：每節間隔固定，龍身才會拉長蜿蜒
      const segs = [this.headPos(this.t)];
      let tt = this.t;
      for (let i = 1; i < this.segN; i++) {
        const gap = Math.max(4 * sc, width(i) * 0.42);
        const [px, py] = segs[i - 1];
        let p = null;
        for (let k = 0; k < 200; k++) {
          tt -= 0.004;
          const q = this.headPos(tt);
          if (Math.hypot(q[0] - px, q[1] - py) >= gap) { p = q; break; }
        }
        segs.push(p || this.headPos(tt));
      }
      // 背鰭（紅色）
      g.fillStyle = '#c8281e';
      for (let i = 2; i < segs.length - 2; i += 2) {
        const [x0, y0] = segs[i - 1], [x1, y1] = segs[i + 1];
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l, wv = width(i);
        const [x, y] = segs[i];
        g.beginPath(); g.moveTo(x + nx * wv * 0.45 - dx * 0.3, y + ny * wv * 0.45 - dy * 0.3); g.lineTo(x + nx * wv * 1.05, y + ny * wv * 1.05); g.lineTo(x + nx * wv * 0.45 + dx * 0.3, y + ny * wv * 0.45 + dy * 0.3); g.fill();
      }
      // 身體：由尾往頭畫圓節，金色漸層 + 鱗片
      for (let i = segs.length - 1; i >= 0; i--) {
        const [x, y] = segs[i];
        const r = width(i) * 0.55;
        const bg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        bg.addColorStop(0, '#fff3b0'); bg.addColorStop(0.5, '#f0b434'); bg.addColorStop(1, '#8a5210');
        g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        if (i % 2 === 0 && r > 3) { g.strokeStyle = 'rgba(120,60,10,0.45)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y + r * 0.2, r * 0.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      }
      // 龍爪（兩對）
      for (const i of [8, 22]) {
        if (!segs[i + 1]) continue;
        const [x, y] = segs[i], [x1, y1] = segs[i + 1];
        const dx = x1 - x, dy = y1 - y, l = Math.hypot(dx, dy) || 1;
        const nx = dy / l, ny = -dx / l, wv = width(i);
        g.strokeStyle = '#d8962a'; g.lineWidth = 3 * sc; g.lineCap = 'round';
        const fx = x + nx * wv * 1.2 + Math.sin(t / 200 + i) * 3, fy = y + ny * wv * 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(fx, fy); g.stroke();
        g.strokeStyle = '#fff0c0'; g.lineWidth = 1.2 * sc;
        for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(Math.atan2(ny, nx) + a) * 5 * sc, fy + Math.sin(Math.atan2(ny, nx) + a) * 5 * sc); g.stroke(); }
      }
      // 龍頭
      const [hx, hy] = segs[0];
      const [nx2, ny2] = segs[2];
      const ang = Math.atan2(hy - ny2, hx - nx2);
      g.save(); g.translate(hx, hy); g.rotate(ang);
      const k = sc * 1.9;
      // 龍鬚
      g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 1.2 * k;
      for (const sgn of [-1, 1]) {
        g.beginPath(); g.moveTo(16 * k, sgn * 4 * k);
        for (let q = 1; q <= 10; q++) g.lineTo(16 * k - q * 5 * k, sgn * (4 + q * 2.2) * k + Math.sin(t / 250 + q * 0.7) * 3 * k);
        g.stroke();
      }
      // 鬃毛
      g.fillStyle = '#d03a22';
      g.beginPath(); g.moveTo(-6 * k, -8 * k); g.quadraticCurveTo(-22 * k, -16 * k, -26 * k, -4 * k); g.quadraticCurveTo(-20 * k, 0, -26 * k, 6 * k); g.quadraticCurveTo(-16 * k, 14 * k, -6 * k, 8 * k); g.fill();
      // 頭形
      const hg = g.createLinearGradient(0, -10 * k, 0, 10 * k);
      hg.addColorStop(0, '#fff0a0'); hg.addColorStop(1, '#c47c16');
      g.fillStyle = hg;
      g.beginPath(); g.moveTo(-8 * k, -9 * k); g.quadraticCurveTo(10 * k, -11 * k, 22 * k, -4 * k); g.lineTo(24 * k, 2 * k); g.quadraticCurveTo(12 * k, 4 * k, 20 * k, 7 * k); g.quadraticCurveTo(6 * k, 11 * k, -8 * k, 9 * k); g.closePath(); g.fill();
      // 龍角
      g.strokeStyle = '#f5e2a8'; g.lineWidth = 2.2 * k;
      g.beginPath(); g.moveTo(0, -8 * k); g.quadraticCurveTo(-8 * k, -18 * k, -18 * k, -22 * k); g.stroke();
      g.beginPath(); g.moveTo(-9 * k, -16 * k); g.lineTo(-6 * k, -22 * k); g.stroke();
      // 眼
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(8 * k, -4 * k, 3 * k, 2 * k, 0, 0, TAU); g.fill();
      g.fillStyle = '#c00'; g.beginPath(); g.arc(8.5 * k, -4 * k, 1.3 * k, 0, TAU); g.fill();
      g.restore();
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.3 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  // =========================================================
  // 韓風共用
  // =========================================================
  // 青紗燈籠（청사초롱）：上紅下藍的絲燈，金色框架
  function chorongSprite() {
    const S = layer(64, 104);
    const g = S.g;
    g.scale(2, 2);
    const cx = 16, top = 8, bot = 44, rw = 12;
    g.strokeStyle = '#c99a45'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, top); g.stroke();
    const body = (y0, y1, c0, c1) => {
      const gr = g.createLinearGradient(cx - rw, 0, cx + rw, 0);
      gr.addColorStop(0, c1); gr.addColorStop(0.35, c0); gr.addColorStop(0.65, c0); gr.addColorStop(1, c1);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx - rw, y0); g.lineTo(cx + rw, y0); g.quadraticCurveTo(cx + rw + 2, (y0 + y1) / 2, cx + rw, y1); g.lineTo(cx - rw, y1); g.quadraticCurveTo(cx - rw - 2, (y0 + y1) / 2, cx - rw, y0); g.fill();
    };
    body(top + 2, top + 22, '#ff5a4a', '#8e1420');
    body(top + 22, bot - 2, '#4a7dff', '#142a7a');
    // 內部燭光
    const fl = g.createRadialGradient(cx, top + 21, 0, cx, top + 21, 15);
    fl.addColorStop(0, 'rgba(255,240,200,0.85)'); fl.addColorStop(0.5, 'rgba(255,200,120,0.25)'); fl.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = fl; g.fillRect(cx - rw, top + 2, rw * 2, bot - top - 4);
    // 金框
    g.fillStyle = '#d9ad55';
    g.fillRect(cx - rw - 1.5, top, rw * 2 + 3, 2.4); g.fillRect(cx - rw - 1.5, bot - 2.4, rw * 2 + 3, 2.4);
    g.strokeStyle = 'rgba(217,173,85,0.8)'; g.lineWidth = 0.7;
    for (const x of [cx - rw * 0.55, cx, cx + rw * 0.55]) { g.beginPath(); g.moveTo(x, top + 2); g.lineTo(x, bot - 2); g.stroke(); }
    // 流蘇
    g.strokeStyle = '#ff6a55'; g.lineWidth = 0.8;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx + k * 0.8, bot); g.lineTo(cx + k * 1.4, bot + 7); g.stroke(); }
    return S;
  }
  // 蓮花燈（연등）：粉嫩花瓣層層包住燭光
  function lotusLampSprite(c1, c2) {
    const S = layer(56, 56);
    const g = S.g;
    const cx = 28, cy = 32;
    const glowG = g.createRadialGradient(cx, cy - 4, 0, cx, cy - 4, 26);
    glowG.addColorStop(0, 'rgba(255,240,200,0.6)'); glowG.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = glowG; g.fillRect(0, 0, 56, 56);
    const petal = (ang, len, wd, col) => {
      g.save(); g.translate(cx, cy); g.rotate(ang);
      const gr = g.createLinearGradient(0, 0, 0, -len);
      gr.addColorStop(0, c2); gr.addColorStop(0.7, col); gr.addColorStop(1, '#fff4f6');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wd, -len * 0.55, 0, -len); g.quadraticCurveTo(-wd, -len * 0.55, 0, 0); g.fill();
      g.restore();
    };
    for (const a of [-1.25, 1.25, -0.85, 0.85]) petal(a, 17, 7, c1);
    for (const a of [-0.45, 0.45, 0]) petal(a, 20, 7.5, c1);
    g.fillStyle = '#3c8a4a';
    g.beginPath(); g.ellipse(cx, cy + 3, 14, 4, 0, 0, TAU); g.fill();
    return S;
  }
  // 韓式屋頂：中間平、兩端優雅上翹（처마）
  function hanokRoof(g, cx, y, w, hgt, col, lift) {
    const l = lift == null ? 0.55 : lift;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx - w * 0.5, y - hgt * l);
    g.quadraticCurveTo(cx - w * 0.36, y + hgt * 0.05, cx - w * 0.12, y);
    g.lineTo(cx + w * 0.12, y);
    g.quadraticCurveTo(cx + w * 0.36, y + hgt * 0.05, cx + w * 0.5, y - hgt * l);
    g.quadraticCurveTo(cx + w * 0.34, y - hgt * 0.35, cx + w * 0.22, y - hgt);
    g.lineTo(cx - w * 0.22, y - hgt);
    g.quadraticCurveTo(cx - w * 0.34, y - hgt * 0.35, cx - w * 0.5, y - hgt * l);
    g.fill();
  }

  // =========================================================
  // 景福宮：月下宮殿、丹青屋簷、青紗燈籠、緩緩升起的蓮花燈
  // =========================================================
  class Gyeongbokgung {
    constructor(low) { this.low = low; this.lamps = []; this.glowK = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#050a24'], [0.4, '#121a48'], [0.68, '#2c2560'], [0.8, '#5a2f5c'], [0.9, '#2a1830'], [1, '#0b0710']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(230,235,255,${rand(0.1, 0.6)})`; const r = rand(0.4, 1.3); g.beginPath(); g.arc(rand(0, w), rand(0, h * 0.6), r, 0, TAU); g.fill(); }
      // 滿月
      const mx = (this.mx = w * 0.5), my = (this.my = h * 0.032), mr = 21 * sc;
      glow(g, mx, my, mr * 5, '200,210,255', 0.18);
      const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
      mg.addColorStop(0, '#fffef4'); mg.addColorStop(0.7, '#f1ecd6'); mg.addColorStop(1, '#d8d2bd');
      g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(170,160,140,0.25)';
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.22], [0.25, 0.2, 0.16], [0.05, -0.35, 0.12], [0.35, -0.2, 0.09]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU); g.fill(); }
      // 北岳山
      g.fillStyle = '#141a3a';
      g.beginPath(); g.moveTo(0, h * 0.66);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, h * 0.66 - Math.sin(x / w * Math.PI) * h * 0.06 - Math.sin(x / 37) * 4 * sc - Math.sin(x / 13) * 2 * sc);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      glow(g, w * 0.5, h * 0.8, w * 0.75, '255,150,80', 0.3);
      // 勤政殿：兩層屋頂、丹青、紅柱、石台
      const cx = w * 0.5, base = h * 0.87;
      const bw = Math.min(w * 0.82, 360 * sc);
      // 石台（月台）
      g.fillStyle = '#6e6a72'; g.fillRect(cx - bw * 0.56, base, bw * 1.12, h * 0.02);
      g.fillStyle = '#8c8790'; g.fillRect(cx - bw * 0.5, base - h * 0.012, bw, h * 0.014);
      g.fillStyle = 'rgba(255,220,170,0.35)'; g.fillRect(cx - bw * 0.56, base, bw * 1.12, 1.5);
      const floor = (y, ww, hh, tier) => {
        // 柱間透出暖光
        const colTop = y - hh * 0.62;
        g.fillStyle = '#2a0b0e'; g.fillRect(cx - ww * 0.4, colTop, ww * 0.8, hh * 0.62);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const x0 = cx - ww * 0.4 + (i + 0.12) * ww * 0.8 / n, x1w = ww * 0.8 / n * 0.76;
          const lg = g.createLinearGradient(0, colTop, 0, y);
          lg.addColorStop(0, `rgba(255,${(175 + Math.random() * 40) | 0},100,0.85)`); lg.addColorStop(1, 'rgba(255,120,50,0.6)');
          g.fillStyle = lg; g.fillRect(x0, colTop + hh * 0.08, x1w, hh * 0.54);
          g.strokeStyle = 'rgba(120,50,30,0.6)'; g.lineWidth = 0.6;
          for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0, colTop + hh * 0.08 + k * hh * 0.135); g.lineTo(x0 + x1w, colTop + hh * 0.08 + k * hh * 0.135); g.stroke(); }
        }
        g.fillStyle = '#a3252a';
        for (let i = 0; i <= n; i++) g.fillRect(cx - ww * 0.4 + i * ww * 0.8 / n - 1.6 * sc, colTop, 3.2 * sc, hh * 0.62);
        // 丹青：綠藍紅的彩繪帶
        const dy = colTop - hh * 0.16;
        const band = [['#2f8a6d', 0.06], ['#1f4f9a', 0.05], ['#2f8a6d', 0.05]];
        let yy = dy;
        for (const [c, k] of band) { g.fillStyle = c; g.fillRect(cx - ww * 0.44, yy, ww * 0.88, hh * k); yy += hh * k; }
        for (let x = cx - ww * 0.43; x < cx + ww * 0.43; x += 7 * sc) {
          g.fillStyle = '#e45a4c'; g.beginPath(); g.arc(x, dy + hh * 0.08, 1.6 * sc, 0, TAU); g.fill();
          g.fillStyle = '#f2d36b'; g.beginPath(); g.arc(x + 3.5 * sc, dy + hh * 0.08, 1 * sc, 0, TAU); g.fill();
        }
        // 屋頂
        const rg = g.createLinearGradient(0, dy - hh * 0.72, 0, dy);
        rg.addColorStop(0, '#3a3a52'); rg.addColorStop(1, '#14121c');
        hanokRoof(g, cx, dy, ww * 1.12, hh * (tier ? 0.62 : 0.72), rg, 0.7);
        g.fillStyle = 'rgba(200,210,255,0.25)'; g.fillRect(cx - ww * 0.25, dy - hh * (tier ? 0.62 : 0.72), ww * 0.5, 1.5); // 屋脊月光
        g.strokeStyle = 'rgba(160,170,210,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx - ww * 0.56, dy - hh * (tier ? 0.62 : 0.72) * 0.7); g.quadraticCurveTo(cx - ww * 0.4, dy + 1, cx - ww * 0.12, dy); g.lineTo(cx + ww * 0.12, dy); g.quadraticCurveTo(cx + ww * 0.4, dy + 1, cx + ww * 0.56, dy - hh * (tier ? 0.62 : 0.72) * 0.7); g.stroke();
        return dy - hh * (tier ? 0.62 : 0.72);
      };
      const hh = h * 0.07;
      const y1 = floor(base - h * 0.012, bw * 0.78, hh, 0);
      floor(y1 + hh * 0.18, bw * 0.55, hh * 0.85, 1);
      // 兩側迴廊
      for (const sx of [-1, 1]) {
        const x0 = cx + sx * bw * 0.62, ww = w * 0.5;
        g.fillStyle = '#120d16'; g.fillRect(Math.min(x0, x0 + sx * ww), base - h * 0.028, ww, h * 0.05);
        for (let x = 0; x < ww; x += 11 * sc) { g.fillStyle = 'rgba(255,170,90,0.55)'; g.fillRect(x0 + sx * x - 3 * sc, base - h * 0.022, 6 * sc, h * 0.016); }
        g.fillStyle = '#16141d';
        g.fillRect(Math.min(x0, x0 + sx * ww), base - h * 0.04, ww, h * 0.014);
      }
      g.fillStyle = '#07050a'; g.fillRect(0, base + h * 0.02, w, h);
      this.chorong = chorongSprite();
      this.lampImgs = [lotusLampSprite('#ff9cc0', '#e04d82'), lotusLampSprite('#ffd27a', '#e08a2a'), lotusLampSprite('#a8e8b8', '#3aa070')];
      this.lamps = [];
      for (let i = 0; i < (this.low ? 8 : 18); i++) this.lamps.push(this.newLamp(true));
    }
    newLamp(anywhere, x) {
      return { x: x != null ? x : rand(0, this.w), y: anywhere ? rand(0.1, 1) * this.h : this.h + rand(10, 60), vy: rand(10, 22), z: rand(0.45, 1), ph: rand(0, TAU), k: (Math.random() * 3) | 0 };
    }
    update(dt) {
      const s = dt / 1000;
      this.glowK *= Math.pow(0.2, s);
      for (const l of this.lamps) { l.y -= l.vy * l.z * s * (1 + this.glowK); l.ph += s * 0.9; }
      this.lamps = this.lamps.filter((l) => l.y > -50);
      while (this.lamps.length < (this.low ? 8 : 18)) this.lamps.push(this.newLamp(false));
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 月光雲
      g.globalCompositeOperation = 'lighter';
      glow(g, this.mx, this.my, 60 * sc, '220,225,255', 0.12 + beat * 0.06);
      for (const l of this.lamps) {
        const s = 22 * l.z * sc, sx = l.x + Math.sin(l.ph) * 8 * sc;
        glow(g, sx, l.y, s * 2.2, '255,170,120', (0.18 + this.glowK * 0.2) * l.z);
        g.globalAlpha = 0.5 + 0.5 * l.z;
        g.drawImage(this.lampImgs[l.k].cv, sx - s, l.y - s, s * 2, s * 2);
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'source-over';
      // 頂部一串青紗燈籠
      const y0 = h * 0.012, sag = h * 0.028, n = 8, ls = 0.9 * sc;
      const yAt = (x) => { const k = x / w; return y0 + sag * 4 * k * (1 - k); };
      g.strokeStyle = 'rgba(10,8,20,0.95)'; g.lineWidth = 1.4;
      g.beginPath(); for (let x = 0; x <= w; x += 8) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x))); g.stroke();
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * w, y = yAt(x);
        if (x > B.x - 16 * ls && x < B.x + B.w + 16 * ls) continue;
        const sway = Math.sin(t / 1300 + i * 1.7) * 0.07 + beat * 0.04 * (i % 2 ? 1 : -1);
        g.save(); g.translate(x, y); g.rotate(sway); g.scale(ls, ls);
        g.globalCompositeOperation = 'lighter';
        glow(g, 0, 28, 48, '255,140,90', 0.3 + beat * 0.2 + this.glowK * 0.3);
        glow(g, 0, 36, 30, '120,150,255', 0.18);
        g.globalCompositeOperation = 'source-over';
        g.drawImage(this.chorong.cv, -16, 0, 32, 52);
        g.restore();
      }
    }
    burst(d, B) {
      this.glowK = Math.min(1.5, this.glowK + 0.3 * d.lines);
      const n = Math.min(this.low ? 4 : 10, d.lines * 2 + (d.lines >= 4 ? 4 : 0));
      for (let i = 0; i < n; i++) { const l = this.newLamp(false, rand(0.05, 0.95) * this.w); l.y = this.h * rand(0.85, 1); l.vy = rand(30, 50); this.lamps.push(l); }
    }
  }

  // =========================================================
  // 韓屋月夜：中秋大月亮、雲影掠過、北村韓屋屋瓦、柿子樹、銀杏葉與芒草
  // =========================================================
  function ginkgoSprite() {
    const S = layer(32, 32);
    const g = S.g;
    const gr = g.createRadialGradient(16, 22, 2, 16, 14, 16);
    gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.6, '#f6c93a'); gr.addColorStop(1, '#d8941a');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(16, 26); g.lineTo(3, 9); g.quadraticCurveTo(16, 0, 29, 9); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,100,20,0.45)'; g.lineWidth = 0.6;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(16, 26); g.lineTo(16 + k * 3.6, 6); g.stroke(); }
    g.strokeStyle = '#b8801c'; g.lineWidth = 1; g.beginPath(); g.moveTo(16, 26); g.lineTo(16, 31); g.stroke();
    return S;
  }
  class HanokMoon {
    constructor(low) { this.low = low; this.wind = 0; this.extra = []; this.moonK = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#071528'], [0.45, '#0f2c44'], [0.75, '#1d4a5c'], [1, '#0a1820']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(230,240,255,${rand(0.08, 0.4)})`; g.fillRect(rand(0, w), rand(0, h * 0.55), 1, 1); }
      // 大月亮放在上方：場地外最醒目的位置
      const mx = (this.mx = w * 0.5), my = (this.my = h * 0.02), mr = (this.mr = Math.min(w * 0.36, 150 * sc));
      glow(g, mx, my, mr * 2.6, '255,220,150', 0.3);
      const mg = g.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, 0, mx, my, mr);
      mg.addColorStop(0, '#fffbe6'); mg.addColorStop(0.6, '#ffe7a8'); mg.addColorStop(1, '#f2c26a');
      g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(200,150,70,0.22)';
      for (const [dx, dy, r] of [[-0.35, 0.3, 0.2], [0.3, 0.45, 0.15], [0.05, 0.6, 0.1], [-0.1, 0.15, 0.08], [0.45, 0.15, 0.09]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU); g.fill(); }
      // 月兔搗年糕（淡淡的剪影）
      g.fillStyle = 'rgba(190,140,60,0.28)';
      const rx = mx - mr * 0.42, ry = my + mr * 0.62, rs = mr * 0.16;
      g.beginPath(); g.ellipse(rx, ry, rs, rs * 0.75, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(rx + rs * 0.7, ry - rs * 0.7, rs * 0.45, rs * 0.4, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(rx + rs * 0.6, ry - rs * 1.4, rs * 0.12, rs * 0.45, -0.3, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(rx + rs * 0.9, ry - rs * 1.35, rs * 0.12, rs * 0.45, 0.2, 0, TAU); g.fill();
      g.fillRect(rx + rs * 1.6, ry - rs * 0.2, rs * 0.7, rs * 0.9);
      // 北村：三層韓屋屋瓦往下堆疊
      const rows = [[0.7, '#16323f', 0.85], [0.79, '#0f2430', 1], [0.88, '#08151d', 1.25]];
      for (const [ky, col, z] of rows) {
        const y = h * ky;
        let x = -rand(0, 40) * sc;
        while (x < w + 40) {
          const rw = rand(70, 120) * sc * z, rh = rand(16, 22) * sc * z;
          // 牆與窗紙透光
          g.fillStyle = col; g.fillRect(x + rw * 0.14, y - rh * 0.1, rw * 0.72, h - y);
          if (Math.random() < 0.65) {
            const wx = x + rw * rand(0.25, 0.55), ww = rw * 0.18, wy = y + rh * 0.35, wh = rh * 0.9;
            const lg = g.createLinearGradient(0, wy, 0, wy + wh);
            lg.addColorStop(0, 'rgba(255,214,140,0.9)'); lg.addColorStop(1, 'rgba(255,170,90,0.75)');
            g.fillStyle = lg; g.fillRect(wx, wy, ww, wh);
            g.strokeStyle = 'rgba(70,40,20,0.7)'; g.lineWidth = 0.7;
            for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(wx + ww * k / 3, wy); g.lineTo(wx + ww * k / 3, wy + wh); g.stroke(); }
            for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(wx, wy + wh * k / 4); g.lineTo(wx + ww, wy + wh * k / 4); g.stroke(); }
            glow(g, wx + ww / 2, wy + wh / 2, ww * 2.2, '255,180,90', 0.18);
          }
          hanokRoof(g, x + rw / 2, y, rw, rh, col, 0.55);
          // 瓦片縱紋
          g.strokeStyle = 'rgba(160,200,220,0.12)'; g.lineWidth = 1;
          for (let tx = x + rw * 0.2; tx < x + rw * 0.8; tx += 4 * sc) { g.beginPath(); g.moveTo(tx, y - rh * 0.95); g.lineTo(tx + (tx - x - rw / 2) * 0.12, y - 1); g.stroke(); }
          g.strokeStyle = 'rgba(255,230,170,0.22)'; g.beginPath(); g.moveTo(x + rw * 0.28, y - rh); g.lineTo(x + rw * 0.72, y - rh); g.stroke();
          x += rw * rand(0.85, 1.05);
        }
      }
      // 柿子樹：右上角伸出的枝幹與橘色柿子
      const persimmon = (x, y, r) => {
        const pg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
        pg.addColorStop(0, '#ffd27a'); pg.addColorStop(0.5, '#ff8a2a'); pg.addColorStop(1, '#c84b10');
        g.fillStyle = pg; g.beginPath(); g.ellipse(x, y, r, r * 0.88, 0, 0, TAU); g.fill();
        g.fillStyle = '#3e5a2a';
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.25, y - r * 0.8 + Math.sin(a) * r * 0.15, r * 0.28, r * 0.12, a, 0, TAU); g.fill(); }
      };
      const branch = (x0, y0, ang, len, wd, d) => {
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.strokeStyle = '#1a1210'; g.lineWidth = wd; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + rand(-6, 6) * sc, (y0 + y1) / 2 + rand(-6, 6) * sc, x1, y1); g.stroke();
        if (d <= 0) { if (Math.random() < 0.85) persimmon(x1, y1 + 6 * sc, rand(6, 8.5) * sc); return; }
        branch(x1, y1, ang + rand(0.2, 0.55), len * 0.72, wd * 0.62, d - 1);
        branch(x1, y1, ang - rand(0.2, 0.55), len * 0.72, wd * 0.62, d - 1);
      };
      branch(w + 6, h * 0.035, Math.PI - 0.35, 30 * sc, 7 * sc, 3);
      branch(-6, h * 0.05, 0.3, 26 * sc, 6 * sc, 3);
      this.leafImg = ginkgoSprite();
      this.leaves = [];
      for (let i = 0; i < (this.low ? 10 : 22); i++) this.leaves.push(this.newLeaf(true));
      this.clouds = [];
      for (let i = 0; i < 4; i++) this.clouds.push({ x: rand(-0.3, 1) * w, y: my + rand(0.3, 1.1) * mr, wd: rand(110, 200) * sc, v: rand(6, 12) * sc, a: rand(0.25, 0.45) });
      this.grass = [];
      for (let i = 0; i < (this.low ? 8 : 16); i++) { const side = i % 2; this.grass.push({ x: side ? w - rand(0, 0.2) * w : rand(0, 0.2) * w, len: rand(90, 150) * sc, ph: rand(0, TAU), lean: side ? -1 : 1 }); }
    }
    newLeaf(anywhere, x, y) {
      return { x: x != null ? x : rand(-0.1, 1.1) * this.w, y: y != null ? y : anywhere ? rand(0, this.h) : rand(-30, -10), vx: rand(-8, 12), vy: rand(22, 40), rot: rand(0, TAU), vr: rand(-1.5, 1.5), flip: rand(0, TAU), vf: rand(1.5, 3.5), s: rand(7, 11) * this.sc };
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      this.moonK *= Math.pow(0.25, s);
      const upd = (p) => { p.x += (p.vx + this.wind) * s; p.y += p.vy * s; p.rot += p.vr * s; p.flip += p.vf * s; };
      for (const p of this.leaves) { upd(p); if (p.y > this.h + 20 || p.x > this.w + 30) Object.assign(p, this.newLeaf(false)); }
      for (const p of this.extra) { upd(p); p.vy += 30 * s; }
      this.extra = this.extra.filter((p) => p.y < this.h + 20 && p.x < this.w + 40);
      for (const c of this.clouds) { c.x += c.v * s; if (c.x - c.wd > this.w) c.x = -c.wd; }
      for (const gg of this.grass) gg.ph += s * (1 + this.wind / 120);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      glow(g, this.mx, this.my, this.mr * 1.7, '255,220,150', 0.08 + beat * 0.05 + this.moonK * 0.25);
      g.globalCompositeOperation = 'source-over';
      // 雲影掠過月亮
      for (const c of this.clouds) {
        g.fillStyle = `rgba(30,50,70,${c.a})`;
        g.beginPath(); g.ellipse(c.x, c.y, c.wd * 0.5, c.wd * 0.07, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(c.x + c.wd * 0.15, c.y - c.wd * 0.05, c.wd * 0.28, c.wd * 0.06, 0, 0, TAU); g.fill();
        g.fillStyle = `rgba(255,220,160,${c.a * 0.25})`;
        g.fillRect(c.x - c.wd * 0.3, c.y - c.wd * 0.075, c.wd * 0.6, 1);
      }
      // 芒草隨風搖
      g.lineCap = 'round';
      for (const gg of this.grass) {
        const sway = Math.sin(gg.ph) * 0.12 + this.wind * 0.0015 + gg.lean * 0.12;
        const tipX = gg.x + Math.sin(sway) * gg.len, tipY = h - Math.cos(sway) * gg.len;
        g.strokeStyle = 'rgba(12,22,26,0.95)'; g.lineWidth = 1.8 * sc;
        g.beginPath(); g.moveTo(gg.x, h); g.quadraticCurveTo(gg.x, h - gg.len * 0.5, tipX, tipY); g.stroke();
        // 蓬鬆的芒草穗：被月光照亮的柔軟羽狀
        g.save(); g.translate(tipX, tipY); g.rotate(sway + gg.lean * 0.5);
        const pg = g.createLinearGradient(0, 0, 0, -26 * sc);
        pg.addColorStop(0, 'rgba(220,200,160,0.15)'); pg.addColorStop(1, 'rgba(255,240,205,0.6)');
        g.fillStyle = pg;
        g.beginPath(); g.ellipse(0, -13 * sc, 4.5 * sc, 14 * sc, 0, 0, TAU); g.fill();
        g.restore();
      }
      const drawL = (p) => {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.flip));
        g.drawImage(this.leafImg.cv, -p.s, -p.s, p.s * 2, p.s * 2); g.restore();
      };
      for (const p of this.leaves) drawL(p);
      for (const p of this.extra) drawL(p);
    }
    burst(d, B) {
      this.wind = Math.min(400, this.wind + 60 * d.lines + (d.lines >= 4 ? 120 : 0));
      this.moonK = Math.min(1.2, this.moonK + 0.25 * d.lines);
      const n = Math.min(this.low ? 10 : 26, d.lines * (this.low ? 3 : 7));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        const p = this.newLeaf(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c);
        p.vx = rand(50, 200) * (Math.random() < 0.5 ? -1 : 1); p.vy = rand(-90, 0);
        this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 首爾夜光：南山塔、城市天際線與霓虹招牌、漢江倒影、盤浦大橋月光彩虹噴泉
  // =========================================================
  class SeoulNight {
    constructor(low) { this.low = low; this.drops = []; this.surge = 0; this.fw = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0a0620'], [0.4, '#1b0f3e'], [0.62, '#3e1a5c'], [0.7, '#7a2a6e'], [0.74, '#2a1238'], [1, '#05030c']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,235,255,${rand(0.08, 0.4)})`; g.fillRect(rand(0, w), rand(0, h * 0.45), 1, 1); }
      // 南山與 N 首爾塔（左上，避開場地）
      const tx = (this.tx = w * 0.13);
      g.fillStyle = '#140c26';
      g.beginPath(); g.moveTo(-20, h * 0.66); g.quadraticCurveTo(tx, h * 0.53, w * 0.42, h * 0.66); g.fill();
      const tb = h * 0.565, tt = (this.tt = h * 0.39);
      g.fillStyle = '#d8d4e8';
      g.beginPath(); g.moveTo(tx - 4 * sc, tb); g.lineTo(tx - 2 * sc, tt + h * 0.05); g.lineTo(tx + 2 * sc, tt + h * 0.05); g.lineTo(tx + 4 * sc, tb); g.fill();
      g.fillStyle = '#ece8f8'; g.beginPath(); g.ellipse(tx, tt + h * 0.05, 10 * sc, 5 * sc, 0, 0, TAU); g.fill();
      g.fillRect(tx - 7 * sc, tt + h * 0.035, 14 * sc, h * 0.015);
      g.fillStyle = '#cfcbe0'; g.fillRect(tx - 1 * sc, tt, 2 * sc, h * 0.035);
      // 天際線：兩層大樓、點點窗燈
      const skyline = (base, hmin, hmax, col, winA) => {
        let x = 0;
        while (x < w) {
          const bw = rand(16, 34) * sc, bh = rand(hmin, hmax) * h;
          g.fillStyle = col; g.fillRect(x, base - bh, bw - 1, bh);
          for (let wy = base - bh + 4 * sc; wy < base - 3 * sc; wy += 5 * sc) for (let wx = x + 3 * sc; wx < x + bw - 4 * sc; wx += 4 * sc) {
            if (Math.random() < winA) { g.fillStyle = `rgba(255,${(200 + Math.random() * 50) | 0},${(150 + Math.random() * 90) | 0},${rand(0.4, 0.9)})`; g.fillRect(wx, wy, 1.6 * sc, 2.2 * sc); }
          }
          x += bw;
        }
      };
      const base = (this.base = h * 0.74);
      skyline(base, 0.05, 0.11, '#1c1236', 0.18);
      skyline(base, 0.02, 0.07, '#110a22', 0.3);
      // 霓虹招牌（韓文）
      this.signs = [];
      const words = ['서울', '노래방', '치킨', '카페', '한강'];
      const cols = ['255,80,180', '80,220,255', '255,200,80', '160,120,255', '120,255,180'];
      const spots = [[0.12, 0.05], [0.88, 0.07], [0.35, 0.03], [0.66, 0.045], [0.93, 0.02]];
      spots.forEach(([kx, ky], i) => this.signs.push({ x: kx * w, y: base - ky * h, word: words[i], col: cols[i], ph: rand(0, TAU), s: rand(10, 12) * sc }));
      // 漢江
      g.fillStyle = vgrad(g, h, [[base / h, '#1a0c30'], [1, '#04030a']]);
      g.fillRect(0, base, w, h - base);
      // 盤浦大橋（橋面在河上）
      const by = (this.bridgeY = base + h * 0.06);
      g.fillStyle = '#0c0818'; g.fillRect(0, by - 6 * sc, w, 7 * sc);
      for (let x = 0; x < w; x += 46 * sc) g.fillRect(x, by, 6 * sc, h * 0.05);
      g.fillStyle = 'rgba(255,220,150,0.7)';
      for (let x = 0; x < w; x += 9 * sc) g.fillRect(x, by - 7 * sc, 2 * sc, 1.5 * sc);
      // 倒影用的柔光條
      this.refl = [];
      for (let i = 0; i < (this.low ? 14 : 30); i++) this.refl.push({ x: rand(0, w), y: rand(base + 2, h), wd: rand(10, 30) * sc, col: cols[(Math.random() * cols.length) | 0], ph: rand(0, TAU) });
      this.nozzles = [];
      for (let x = 6 * sc; x < w; x += 7 * sc) this.nozzles.push(x);
    }
    update(dt) {
      const s = dt / 1000;
      this.surge *= Math.pow(0.25, s);
      for (const r of this.refl) r.ph += s * 1.5;
      for (const p of this.fw) { p.life -= s; if (p.flash) continue; p.px = p.x; p.py = p.y; p.vx *= Math.pow(0.4, s); p.vy = p.vy * Math.pow(0.4, s) + 40 * s * this.sc; p.x += p.vx * s; p.y += p.vy * s; }
      this.fw = this.fw.filter((p) => p.life > 0);
    }
    firework(x, y, big) {
      const n = (this.low ? 24 : 54) * (big ? 1.4 : 1);
      const cols = ['255,90,200', '90,220,255', '255,230,120', '180,140,255'];
      const col = cols[(Math.random() * cols.length) | 0];
      const sp = rand(60, 110) * this.sc * (big ? 1.4 : 1);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.fw.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1, 1.5), max: 1.5, col }); }
      this.fw.push({ flash: true, x, y, life: 0.25, max: 0.25, r: sp });
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      // 塔頂燈隨節拍換色
      const hue = (t / 40) % 360;
      const tc = `hsla(${hue},90%,65%,`;
      const tgx = this.tx, tgy = this.tt + h * 0.05;
      const gr = g.createRadialGradient(tgx, tgy, 0, tgx, tgy, 40 * sc * (1 + beat * 0.4));
      gr.addColorStop(0, tc + '0.6)'); gr.addColorStop(1, tc + '0)');
      g.fillStyle = gr; g.fillRect(tgx - 60 * sc, tgy - 60 * sc, 120 * sc, 120 * sc);
      // 霓虹招牌
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const sg of this.signs) {
        const on = 0.75 + 0.25 * Math.sin(t / 300 + sg.ph) + beat * 0.2;
        g.font = `700 ${sg.s}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
        g.shadowColor = `rgba(${sg.col},1)`; g.shadowBlur = 10 * sc;
        g.fillStyle = `rgba(${sg.col},${Math.min(1, on)})`;
        g.fillText(sg.word, sg.x, sg.y);
      }
      g.shadowBlur = 0;
      // 河面倒影
      for (const r of this.refl) {
        const a = 0.12 + 0.1 * Math.sin(r.ph);
        g.fillStyle = `rgba(${r.col},${a})`;
        g.fillRect(r.x + Math.sin(r.ph * 0.7) * 4, r.y, r.wd, 1.5);
      }
      // 月光彩虹噴泉：橋邊一排水柱拋物線落入河中，顏色沿橋流動
      const by = this.bridgeY - 3 * sc;
      const power = 1 + this.surge;
      g.lineWidth = 1.6 * sc;
      for (let i = 0; i < this.nozzles.length; i++) {
        const x0 = this.nozzles[i];
        if (x0 > B.x && x0 < B.x + B.w && by < B.y + B.h) continue;
        const hh = (360 * i / this.nozzles.length + t / 25) % 360;
        const reach = (26 + 8 * Math.sin(t / 700 + i * 0.4)) * sc * power;
        const fall = (h - by) * 0.55;
        g.strokeStyle = `hsla(${hh},95%,65%,${0.45 + beat * 0.2})`;
        g.beginPath(); g.moveTo(x0, by); g.quadraticCurveTo(x0 + reach * 0.6, by - 6 * sc * power, x0 + reach, by + fall); g.stroke();
        if (!this.low && i % 3 === 0) {
          const k = (t / 600 + i * 0.37) % 1;
          const px = x0 + reach * k, py = by + (by + fall - by) * k * k - 6 * sc * power * 4 * k * (1 - k);
          g.fillStyle = `hsla(${hh},100%,80%,0.8)`; g.fillRect(px, py, 2 * sc, 2 * sc);
        }
      }
      // 煙火
      g.lineCap = 'round';
      for (const p of this.fw) {
        const k = p.life / p.max;
        if (p.flash) { glow(g, p.x, p.y, p.r, '255,240,255', 0.45 * k); continue; }
        g.strokeStyle = `rgba(${p.col},${Math.min(1, k * 1.5)})`; g.lineWidth = 1.5 * sc;
        g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) {
      this.surge = Math.min(2, this.surge + 0.35 * d.lines);
      const n = Math.min(4, d.lines - 1 + (d.lines >= 4 ? 2 : 0) + (d.tspin ? 1 : 0));
      for (let i = 0; i < n; i++) this.firework(rand(0.1, 0.9) * this.w, rand(0.05, 0.3) * this.h, d.lines >= 4);
    }
  }

  root.LumenScenes = {
    星空: Starfield, 深海: DeepSea, 竹林: Bamboo, 極光: Aurora, 水墨: InkWash, 螢火森林: Firefly, 霓虹都市: NeonCity,
    敦煌: Dunhuang, 櫻花: Sakura, 冰晶洞窟: IceCave, 燈節: Lantern, 雨夜: RainyCity, 熔岩: Lava, 夕陽雲海: Sunset,
    長城: GreatWall, 荷塘月色: LotusPond, 仙山: FairyPeaks,
    土星環: Saturn, 楓紅: Maple, 海上風暴: Storm, 飛龍: Dragon,
    景福宮: Gyeongbokgung, 韓屋月夜: HanokMoon, 首爾夜光: SeoulNight,
  };
})(typeof self !== 'undefined' ? self : this);
