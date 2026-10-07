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
    constructor(low) { this.low = low; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#1b2350'], [0.3, '#5a4f86'], [0.5, '#e08a6a'], [0.6, '#ffc98a'], [1, '#3a3050']]);
      g.fillRect(0, 0, w, h);
      this.sun = { x: w * 0.68, y: h * 0.5, r: 30 * sc };
      glow(g, this.sun.x, this.sun.y, w * 0.9, '255,190,120', 0.45);
      glow(g, this.sun.x, this.sun.y, this.sun.r * 3, '255,240,200', 0.6);
      g.fillStyle = '#fff4d8'; g.beginPath(); g.arc(this.sun.x, this.sun.y, this.sun.r, 0, TAU); g.fill();
      const ridge = (base, amp, seed) => {
        const pts = [];
        for (let x = -20; x <= w + 20; x += 6) pts.push([x, base - amp * (0.6 * Math.abs(Math.sin(x * 0.0055 + seed)) + 0.4 * Math.abs(Math.sin(x * 0.017 + seed * 2.3)))]);
        return pts;
      };
      const fill = (pts, top, bot, base) => {
        const gr = g.createLinearGradient(0, Math.min(...pts.map((p) => p[1])), 0, base + h * 0.15);
        gr.addColorStop(0, top); gr.addColorStop(1, bot);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-20, h); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(w + 20, h); g.closePath(); g.fill();
      };
      // 城牆：沿著山脊走、上緣有垛口，向陽面受光
      const wall = (pts, thick, lit, dark, towers) => {
        g.lineJoin = 'round';
        g.strokeStyle = dark; g.lineWidth = thick;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - thick * 0.4) : g.moveTo(x, y - thick * 0.4))); g.stroke();
        g.strokeStyle = lit; g.lineWidth = thick * 0.35;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - thick * 0.75) : g.moveTo(x, y - thick * 0.75))); g.stroke();
        g.fillStyle = dark;
        for (let i = 0; i < pts.length; i += 2) { const [x, y] = pts[i]; g.fillRect(x - thick * 0.18, y - thick * 1.25, thick * 0.36, thick * 0.4); }
        // 烽火台：放在局部最高點
        for (let i = 3; i < pts.length - 3; i++) {
          const [x, y] = pts[i];
          if (y < pts[i - 3][1] && y < pts[i + 3][1] && Math.random() < towers) {
            const tw = thick * 2.2, th = thick * 2.4;
            g.fillStyle = dark; g.fillRect(x - tw / 2, y - th - thick * 0.6, tw, th);
            g.fillStyle = lit; g.fillRect(x - tw / 2, y - th - thick * 0.6, tw * 0.35, th);
            g.fillStyle = dark;
            for (let k = 0; k < 4; k++) g.fillRect(x - tw / 2 + k * tw / 3.4, y - th - thick * 1.05, tw / 6, thick * 0.45);
            g.fillStyle = 'rgba(20,10,10,0.8)'; g.fillRect(x - tw * 0.12, y - th * 0.75, tw * 0.24, th * 0.35);
          }
        }
      };
      const r1 = ridge(h * 0.6, h * 0.12, 1.1);
      fill(r1, 'rgba(110,100,150,0.75)', 'rgba(200,150,150,0.2)', h * 0.6);
      wall(r1, 4 * sc, 'rgba(240,190,160,0.75)', 'rgba(80,65,100,0.9)', 0.5);
      for (let i = 0; i < 3; i++) glow(g, rand(0, w), h * rand(0.62, 0.7), w * 0.45, '255,220,200', 0.3);
      const r2 = ridge(h * 0.74, h * 0.13, 3.7);
      fill(r2, 'rgba(70,55,90,0.92)', 'rgba(140,90,110,0.5)', h * 0.74);
      wall(r2, 7 * sc, 'rgba(255,190,140,0.85)', 'rgba(45,32,55,1)', 0.6);
      for (let i = 0; i < 3; i++) glow(g, rand(0, w), h * rand(0.78, 0.85), w * 0.5, '255,210,200', 0.25);
      const r3 = ridge(h * 0.92, h * 0.1, 6.2);
      fill(r3, 'rgba(35,25,45,1)', 'rgba(25,18,32,1)', h * 0.92);
      // 光束素材
      const R = (this.ray = layer(60, 500));
      const rg = R.g.createLinearGradient(0, 0, 0, 500);
      rg.addColorStop(0, 'rgba(255,230,180,0.5)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
      R.g.fillStyle = rg; R.g.beginPath(); R.g.moveTo(28, 0); R.g.lineTo(32, 0); R.g.lineTo(60, 500); R.g.lineTo(0, 500); R.g.fill();
      this.geese = [];
      const lead = { x: rand(0.1, 0.4) * w, y: h * rand(0.2, 0.32) };
      for (let i = 0; i < 9; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        this.geese.push({ dx: -Math.abs(k) * 16 * sc, dy: k * 9 * sc, ph: rand(0, TAU) });
      }
      this.flock = { x: lead.x, y: lead.y, v: 18 * sc };
      this.mists = [];
      for (let i = 0; i < (this.low ? 3 : 5); i++) this.mists.push({ x: rand(0, w), y: h * rand(0.62, 0.9), r: w * rand(0.3, 0.5), v: rand(4, 10) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      this.flock.x += this.flock.v * s * (1 + this.flash);
      if (this.flock.x > this.w + 200 * this.sc) { this.flock.x = -60 * this.sc; this.flock.y = this.h * rand(0.15, 0.32); }
      for (const gs of this.geese) gs.ph += s * 6;
      for (const m of this.mists) { m.x += m.v * s; if (m.x - m.r > this.w) m.x = -m.r; }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(this.sun.x, this.sun.y);
      for (let i = 0; i < 9; i++) {
        g.save(); g.rotate(-Math.PI / 2 + (i - 4) * 0.28 + Math.sin(t / 3000 + i) * 0.03);
        g.globalAlpha = (0.12 + beat * 0.06 + this.flash * 0.15) * (i % 2 ? 0.6 : 1);
        g.drawImage(this.ray.cv, -30, 0, 60, h * 0.9);
        g.restore();
      }
      g.restore(); g.globalAlpha = 1;
      for (const m of this.mists) glow(g, m.x, m.y, m.r, '255,225,210', 0.12);
      g.globalCompositeOperation = 'source-over';
      // 人字雁陣
      g.fillStyle = 'rgba(40,25,45,0.85)';
      const k = this.sc * 1.3;
      for (const gs of this.geese) {
        const x = this.flock.x + gs.dx, y = this.flock.y + gs.dy;
        const f = Math.sin(gs.ph) * 5 * k;
        g.beginPath();
        g.moveTo(x - 9 * k, y - f); g.quadraticCurveTo(x - 4 * k, y - f * 0.3 - 1.5 * k, x, y);
        g.lineTo(x + 5 * k, y - 0.6 * k); g.lineTo(x, y + 1.2 * k);
        g.quadraticCurveTo(x - 4 * k, y - f * 0.2 + 1 * k, x - 9 * k, y - f); g.fill();
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 2 * k, y - f * 0.6, x + 2 * k, y - f * 1.1); g.lineTo(x + 2.5 * k, y); g.fill();
      }
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
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

  root.LumenScenes = {
    星空: Starfield, 深海: DeepSea, 竹林: Bamboo, 極光: Aurora, 水墨: InkWash, 螢火森林: Firefly, 霓虹都市: NeonCity,
    敦煌: Dunhuang, 櫻花: Sakura, 冰晶洞窟: IceCave, 燈節: Lantern, 雨夜: RainyCity, 熔岩: Lava, 夕陽雲海: Sunset,
    長城: GreatWall, 荷塘月色: LotusPond, 仙山: FairyPeaks,
  };
})(typeof self !== 'undefined' ? self : this);
