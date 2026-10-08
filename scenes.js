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
  // 共用：碎形山脊、體積雲
  // =========================================================
  function fbm1() {
    const ph = [], ph2 = [];
    for (let i = 0; i < 6; i++) { ph.push(rand(0, TAU)); ph2.push(rand(0, TAU)); }
    return (x) => {
      let v = 0, a = 1, f = 1, n = 0;
      for (let i = 0; i < 6; i++) { v += (Math.sin(x * f + ph[i]) + 0.5 * Math.sin(x * f * 1.37 + ph2[i])) * a; n += a * 1.5; a *= 0.52; f *= 2.07; }
      return v / n;
    };
  }
  // sharp=true：取絕對值做出尖峰（山）；false：圓滑起伏（沙丘、雲海）
  function ridgePts(w, base, amp, freq, sharp, step) {
    const f = fbm1(), pts = [];
    for (let x = -10; x <= w + 10; x += step || 3) {
      const v = f(x * freq);
      pts.push([x, base - amp * (sharp ? 1 - Math.abs(v) * 1.6 : (v + 1) / 2)]);
    }
    return pts;
  }
  function fillPts(g, pts, h, fill) {
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(pts[0][0], h + 5);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(pts[pts.length - 1][0], h + 5); g.closePath(); g.fill();
  }
  // 體積雲：一團團圓形雲朵，上方受光、下方陰影、邊緣透光
  function puffCloud(g, x, y, w, h, light, shade, rimCol, n) {
    const k = n || 14;
    const puffs = [];
    for (let i = 0; i < k; i++) {
      const u = (i / (k - 1)) * 2 - 1;
      const px = x + u * w * 0.5 + rand(-w, w) * 0.05;
      const r = h * (0.55 + 0.45 * Math.cos(u * Math.PI / 2)) * rand(0.75, 1.1);
      puffs.push([px, y - r * 0.35 + rand(-h, h) * 0.12, r]);
    }
    puffs.sort((a, b) => a[1] - b[1]);
    const clear = (c) => c.replace(/[\d.]+\)$/, '0)');
    // 先畫一層柔邊的陰影底，再畫受光的頂部，邊緣羽化，避免一顆顆泡泡的感覺
    for (const [px, py, r] of puffs) {
      const gr = g.createRadialGradient(px, py, 0, px, py, r * 1.15);
      gr.addColorStop(0, shade); gr.addColorStop(0.75, shade); gr.addColorStop(1, clear(shade));
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, r * 1.15, 0, TAU); g.fill();
    }
    for (const [px, py, r] of puffs) {
      const gr = g.createRadialGradient(px - r * 0.2, py - r * 0.55, 0, px - r * 0.1, py - r * 0.3, r * 0.95);
      gr.addColorStop(0, light); gr.addColorStop(0.55, light.replace(/[\d.]+\)$/, '0.6)')); gr.addColorStop(1, clear(light));
      g.fillStyle = gr; g.beginPath(); g.arc(px - r * 0.1, py - r * 0.3, r * 0.95, 0, TAU); g.fill();
    }
    if (rimCol) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [px, py, r] of puffs) {
        if (py > y - h * 0.2) continue; // 只有最上緣的雲朵有金邊
        const gr = g.createRadialGradient(px, py - r * 0.3, r * 0.6, px, py - r * 0.3, r * 1.1);
        gr.addColorStop(0, clear(rimCol)); gr.addColorStop(0.8, rimCol); gr.addColorStop(1, clear(rimCol));
        g.fillStyle = gr; g.beginPath(); g.arc(px, py - r * 0.3, r * 1.1, Math.PI * 1.1, Math.PI * 1.9); g.fill();
      }
      g.restore();
    }
    // 底部壓平
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
  // 深海：水面光紋、搖曳光束、珊瑚礁、海藻、魚群、水母、氣泡
  // =========================================================
  class DeepSea {
    constructor(low) { this.low = low; this.kick = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#1aa6c4'], [0.08, '#0b6f93'], [0.4, '#063a5c'], [0.75, '#04223c'], [1, '#020f1f']]);
      g.fillRect(0, 0, w, h);
      // 遠景礁岩輪廓
      fillPts(g, ridgePts(w, h * 0.86, h * 0.1, 0.012, false), h, 'rgba(10,50,80,0.6)');
      fillPts(g, ridgePts(w, h * 0.92, h * 0.08, 0.02, false), h, 'rgba(6,34,58,0.85)');
      // 沙地
      const sy = h * 0.95;
      g.fillStyle = vgrad(g, h, [[0.9, '#1d4f66'], [1, '#0c2a3a']]);
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 6) g.lineTo(x, sy + Math.sin(x * 0.02) * 6 * sc); g.lineTo(w, h); g.fill();
      // 珊瑚：分枝珊瑚、腦珊瑚、扇珊瑚
      const branch = (x, y, ang, len, wd, d, col) => {
        const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
        g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
        if (d <= 0) { g.fillStyle = 'rgba(255,230,240,0.9)'; g.beginPath(); g.arc(x1, y1, wd * 0.6, 0, TAU); g.fill(); return; }
        branch(x1, y1, ang - rand(0.25, 0.6), len * 0.75, wd * 0.75, d - 1, col);
        branch(x1, y1, ang + rand(0.25, 0.6), len * 0.75, wd * 0.75, d - 1, col);
      };
      const brain = (x, y, r, c1, c2) => {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
        gr.addColorStop(0, c1); gr.addColorStop(1, c2);
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, Math.PI, 0); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
        for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(x, y, r * k / 5, r * 0.7 * k / 5, 0, Math.PI, 0); g.stroke(); }
      };
      const fan = (x, y, r, col) => {
        g.strokeStyle = col; g.lineWidth = 1.2;
        for (let k = 0; k < 14; k++) { const a = -Math.PI * 0.9 + k / 13 * Math.PI * 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.6, x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
        g.globalAlpha = 0.5;
        for (let k = 1; k < 5; k++) { g.beginPath(); g.arc(x, y, r * k / 5, -Math.PI * 0.9, -Math.PI * 0.1); g.stroke(); }
        g.globalAlpha = 1;
      };
      const cols = ['#ff6f91', '#ff9a5a', '#c46bff', '#ffd25a', '#58e0c0'];
      for (let i = 0; i < 9; i++) {
        const x = rand(0, w), y = sy + rand(-4, 6) * sc;
        const kind = i % 3;
        if (kind === 0) branch(x, y, -Math.PI / 2 + rand(-0.3, 0.3), rand(18, 30) * sc, 4 * sc, 4, cols[i % cols.length]);
        else if (kind === 1) brain(x, y, rand(16, 26) * sc, '#ffb08a', '#b0503a');
        else fan(x, y, rand(30, 46) * sc, 'rgba(200,110,255,0.75)');
      }
      for (let x = 0; x < w; x += 7 * sc) { g.fillStyle = `rgba(${rand(150, 255) | 0},${rand(100, 220) | 0},${rand(150, 255) | 0},0.7)`; g.beginPath(); g.arc(x + rand(-3, 3), sy + rand(2, 12) * sc, rand(1.5, 3.5) * sc, 0, TAU); g.fill(); }
      // 動態元素
      this.kelp = [];
      for (let i = 0; i < (this.low ? 6 : 12); i++) { const side = i % 2; this.kelp.push({ x: side ? w - rand(0, 0.16) * w : rand(0, 0.16) * w, len: rand(0.3, 0.48) * h, ph: rand(0, TAU), wd: rand(5, 9) * sc, col: Math.random() < 0.5 ? '40,140,90' : '70,160,80' }); }
      this.anem = [];
      for (let i = 0; i < 5; i++) this.anem.push({ x: rand(0.05, 0.95) * w, y: sy + rand(0, 6) * sc, r: rand(12, 18) * sc, ph: rand(0, TAU), col: ['255,120,170', '255,170,90', '170,140,255'][i % 3] });
      this.fish = [];
      const n = this.low ? 18 : 40;
      this.school = { x: w * 0.5, y: h * 0.78, ang: 0 };
      for (let i = 0; i < n; i++) this.fish.push({ ox: rand(-1, 1), oy: rand(-1, 1), ph: rand(0, TAU), s: rand(0.8, 1.2), vx: 0, vy: 0, dx: 0, dy: 0 });
      this.clown = [];
      for (let i = 0; i < 3; i++) this.clown.push({ x: rand(0, w), y: h * rand(0.66, 0.9), v: rand(14, 24) * sc * (i % 2 ? -1 : 1), ph: rand(0, TAU) });
      this.jellies = [];
      for (let i = 0; i < (this.low ? 3 : 5); i++) this.jellies.push({ x: [0.08, 0.92, 0.15, 0.85, 0.5][i] * w, y: h * rand(0.15, 0.9), r: rand(14, 24) * sc, ph: rand(0, TAU), col: ['140,220,255', '220,150,255', '255,160,215', '150,255,215', '180,200,255'][i] });
      this.bubbles = [];
      for (let i = 0; i < (this.low ? 15 : 35); i++) this.bubbles.push(this.newBubble(true));
      this.rayImg = layer(60, 600);
      const rg = this.rayImg.g.createLinearGradient(0, 0, 0, 600);
      rg.addColorStop(0, 'rgba(190,250,255,0.55)'); rg.addColorStop(1, 'rgba(190,250,255,0)');
      this.rayImg.g.fillStyle = rg; this.rayImg.g.beginPath(); this.rayImg.g.moveTo(20, 0); this.rayImg.g.lineTo(40, 0); this.rayImg.g.lineTo(60, 600); this.rayImg.g.lineTo(0, 600); this.rayImg.g.fill();
    }
    newBubble(any, x, y) { return { x: x != null ? x : rand(0, this.w), y: y != null ? y : any ? rand(0, this.h) : this.h + 10, r: rand(1.2, 4) * this.sc, v: rand(20, 50) * this.sc, ph: rand(0, TAU) }; }
    update(dt) {
      const s = dt / 1000, w = this.w, h = this.h;
      this.kick *= Math.pow(0.2, s);
      this.time = (this.time || 0) + s;
      const T = this.time;
      this.school.x = w * 0.5 + Math.cos(T * 0.25) * w * 0.42;
      this.school.y = h * 0.78 + Math.sin(T * 0.5) * h * 0.08;
      this.school.ang = Math.atan2(Math.cos(T * 0.5) * h * 0.04, -Math.sin(T * 0.25) * w * 0.105);
      for (const f of this.fish) {
        f.ph += s * 12;
        const tx = this.school.x + f.ox * 46 * this.sc + Math.sin(T * 1.3 + f.ph * 0.1) * 6 * this.sc, ty = this.school.y + f.oy * 26 * this.sc;
        f.vx += ((tx - (f.px ?? tx)) * 2.2 - f.vx) * Math.min(1, s * 3) + f.dx; f.vy += ((ty - (f.py ?? ty)) * 2.2 - f.vy) * Math.min(1, s * 3) + f.dy;
        f.dx *= 0.9; f.dy *= 0.9;
        f.px = (f.px ?? tx) + f.vx * s; f.py = (f.py ?? ty) + f.vy * s;
      }
      for (const c of this.clown) { c.x += c.v * s * (1 + this.kick); c.ph += s * 9; if (c.x > w + 30) c.x = -30; if (c.x < -30) c.x = w + 30; }
      for (const j of this.jellies) { j.ph += s * 1.6; j.y -= (6 + 10 * Math.max(0, Math.sin(j.ph))) * s * this.sc * (1 + this.kick); if (j.y < -60) j.y = h + 60; }
      for (const b of this.bubbles) { b.y -= b.v * s; b.ph += s * 3; }
      this.bubbles = this.bubbles.filter((b) => b.y > -10);
      while (this.bubbles.length < (this.low ? 15 : 35)) this.bubbles.push(this.newBubble(false));
    }
    drawJelly(g, j, t) {
      const r = j.r, pulse = 1 + Math.sin(j.ph) * 0.12;
      g.save(); g.translate(j.x, j.y);
      g.globalCompositeOperation = 'lighter';
      glow(g, 0, 0, r * 3, j.col, 0.18);
      // 觸手
      g.strokeStyle = `rgba(${j.col},0.35)`; g.lineWidth = 1.1 * this.sc;
      for (let k = 0; k < 7; k++) {
        const x0 = (k / 6 - 0.5) * r * 1.4 * pulse;
        g.beginPath(); g.moveTo(x0, 0);
        for (let q = 1; q <= 8; q++) g.lineTo(x0 + Math.sin(j.ph * 1.3 + q * 0.7 + k) * 3 * this.sc, q * r * 0.45);
        g.stroke();
      }
      g.strokeStyle = `rgba(${j.col},0.55)`; g.lineWidth = 2.2 * this.sc;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo((k - 1) * r * 0.25, 0); for (let q = 1; q <= 6; q++) g.lineTo((k - 1) * r * 0.25 + Math.sin(j.ph + q + k) * 5 * this.sc, q * r * 0.3); g.stroke(); }
      // 傘
      const bg = g.createRadialGradient(0, -r * 0.3, 0, 0, 0, r * pulse);
      bg.addColorStop(0, 'rgba(255,255,255,0.75)'); bg.addColorStop(0.5, `rgba(${j.col},0.45)`); bg.addColorStop(1, `rgba(${j.col},0.15)`);
      g.fillStyle = bg;
      g.beginPath(); g.ellipse(0, 0, r * pulse, r * 0.85 / pulse, 0, Math.PI, 0);
      g.quadraticCurveTo(r * 0.5, r * 0.25, 0, r * 0.12); g.quadraticCurveTo(-r * 0.5, r * 0.25, -r * pulse, 0); g.fill();
      g.strokeStyle = `rgba(${j.col},0.9)`; g.lineWidth = 1.4 * this.sc;
      g.beginPath(); g.ellipse(0, 0, r * pulse, r * 0.85 / pulse, 0, Math.PI, 0); g.stroke();
      g.restore();
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      // 水面光紋
      g.strokeStyle = 'rgba(200,255,255,0.35)'; g.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 10) { const y = h * 0.015 + k * 6 * sc + Math.sin(x * 0.04 + t / 600 + k * 2) * 3 * sc + Math.sin(x * 0.11 - t / 400) * 2 * sc; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      // 光束
      for (let i = 0; i < 7; i++) {
        g.save(); g.globalAlpha = (0.16 + 0.08 * Math.sin(t / 1500 + i * 1.7) + beat * 0.05);
        g.translate(w * (i / 6), -10); g.rotate(0.25 + Math.sin(t / 3000 + i) * 0.06);
        g.drawImage(this.rayImg.cv, -30 * (1 + i % 3 * 0.4), 0, 60 * (1 + i % 3 * 0.4), h * 1.05); g.restore();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      // 海藻
      g.lineCap = 'round';
      for (const k of this.kelp) {
        const sway = (u) => Math.sin(t / 900 + k.ph + u * 3) * 14 * sc * u + this.kick * 12 * sc * u;
        g.strokeStyle = `rgba(${k.col},0.95)`; g.lineWidth = k.wd;
        g.beginPath(); g.moveTo(k.x, h);
        for (let q = 1; q <= 12; q++) { const u = q / 12; g.lineTo(k.x + sway(u), h - k.len * u); }
        g.stroke();
        g.fillStyle = `rgba(${k.col},0.9)`;
        for (let q = 2; q <= 11; q += 2) { const u = q / 12, x = k.x + sway(u), y = h - k.len * u; g.beginPath(); g.ellipse(x + (q % 4 ? 6 : -6) * sc, y, 7 * sc, 2.5 * sc, q % 4 ? 0.5 : -0.5, 0, TAU); g.fill(); }
      }
      // 海葵
      for (const a of this.anem) {
        for (let q = 0; q < 11; q++) {
          const ang = -Math.PI + (q / 10) * Math.PI;
          const sw = Math.sin(t / 500 + a.ph + q) * 0.25;
          g.strokeStyle = `rgba(${a.col},0.9)`; g.lineWidth = 2.6 * sc;
          g.beginPath(); g.moveTo(a.x, a.y);
          g.quadraticCurveTo(a.x + Math.cos(ang) * a.r * 0.5, a.y + Math.sin(ang) * a.r * 0.6, a.x + Math.cos(ang + sw) * a.r, a.y + Math.sin(ang + sw) * a.r);
          g.stroke();
        }
      }
      // 小丑魚
      for (const c of this.clown) {
        const dir = c.v > 0 ? 1 : -1, s2 = 1.2 * sc;
        g.save(); g.translate(c.x, c.y + Math.sin(c.ph * 0.3) * 4 * sc); g.scale(dir * s2, s2);
        g.fillStyle = '#ff7a1a'; g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-8, 0); g.lineTo(-14, -4 - Math.sin(c.ph)); g.lineTo(-14, 4 + Math.sin(c.ph)); g.fill();
        g.fillStyle = '#fff'; g.fillRect(-2, -5, 2.5, 10); g.fillRect(4, -4, 2, 8);
        g.fillStyle = '#111'; g.beginPath(); g.arc(6, -1.5, 1, 0, TAU); g.fill();
        g.restore();
      }
      // 魚群
      for (const f of this.fish) {
        if (f.px == null) continue;
        const ang = Math.atan2(f.vy, f.vx), s2 = sc * f.s;
        g.save(); g.translate(f.px, f.py); g.rotate(ang);
        g.fillStyle = 'rgba(200,230,245,0.85)';
        g.beginPath(); g.ellipse(0, 0, 5 * s2, 1.8 * s2, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-4 * s2, 0); g.lineTo(-7.5 * s2, -2 * s2 - Math.sin(f.ph) * s2); g.lineTo(-7.5 * s2, 2 * s2 + Math.sin(f.ph) * s2); g.fill();
        g.restore();
      }
      for (const j of this.jellies) this.drawJelly(g, j, t);
      g.strokeStyle = 'rgba(210,250,255,0.6)'; g.lineWidth = 1;
      for (const b of this.bubbles) { g.beginPath(); g.arc(b.x + Math.sin(b.ph) * 3 * sc, b.y, b.r, 0, TAU); g.stroke(); }
    }
    burst(d, B) {
      this.kick = Math.min(2, this.kick + 0.4 * d.lines);
      for (const f of this.fish) { const a = rand(0, TAU); f.dx += Math.cos(a) * 30 * d.lines; f.dy += Math.sin(a) * 30 * d.lines; }
      const n = Math.min(this.low ? 15 : 40, d.lines * 10);
      for (let i = 0; i < n; i++) { const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18; const b = this.newBubble(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c); b.v *= 2; this.bubbles.push(b); }
    }
  }

  // =========================================================
  // 極光：鮮豔的極光簾幕（上方與倒影）、雪山、結冰湖面、針葉林、小木屋
  // =========================================================
  class Aurora {
    constructor(low) { this.low = low; this.surge = 0; this.intensity = 1; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#020611'], [0.45, '#071a2a'], [0.66, '#0d3040'], [0.7, '#0a2232'], [1, '#030a12']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const r = Math.random() < 0.05 ? 1.4 : 0.8; g.fillStyle = `rgba(230,240,255,${rand(0.2, 0.85)})`; g.beginPath(); g.arc(rand(0, w), rand(0, h * 0.66), r, 0, TAU); g.fill(); }
      // 雪山（受極光照的綠色調）
      const horizon = (this.horizon = h * 0.74);
      const far = ridgePts(w, horizon, h * 0.12, 0.016, true);
      fillPts(g, far, h, vgrad(g, h, [[0.6, '#3a5c6a'], [0.74, '#1a2c38']]));
      // 山頂積雪：只在山脊以下一小段，往下漸淡
      g.save(); g.beginPath(); g.moveTo(far[0][0], h); for (const [x, y] of far) g.lineTo(x, y); g.lineTo(w + 10, h); g.clip();
      const top = Math.min(...far.map((p) => p[1]));
      const sg = g.createLinearGradient(0, top, 0, horizon - h * 0.02);
      sg.addColorStop(0, 'rgba(235,252,245,0.95)'); sg.addColorStop(0.45, 'rgba(190,225,230,0.55)'); sg.addColorStop(1, 'rgba(190,225,230,0)');
      g.fillStyle = sg; g.fillRect(0, top, w, horizon - top);
      g.restore();
      const near = ridgePts(w, horizon + h * 0.01, h * 0.05, 0.03, false);
      fillPts(g, near, h, '#0c1a24');
      // 冰湖
      const lake = (this.lake = horizon + h * 0.03);
      g.fillStyle = vgrad(g, h, [[lake / h, '#0a2a36'], [1, '#04121a']]);
      g.fillRect(0, lake, w, h - lake);
      g.strokeStyle = 'rgba(180,230,255,0.12)'; g.lineWidth = 1;
      for (let i = 0; i < 30; i++) { const y = lake + rand(0, h - lake); g.beginPath(); g.moveTo(rand(0, w), y); g.lineTo(rand(0, w), y + rand(-3, 3)); g.stroke(); }
      // 前景針葉林 + 小木屋（窗戶透出暖光）
      const pine = (x, y, s, col) => {
        g.fillStyle = col;
        g.fillRect(x - s * 0.04, y - s * 0.15, s * 0.08, s * 0.15);
        for (let k = 0; k < 5; k++) { const ww = s * (0.36 - k * 0.06), yy = y - s * 0.12 - k * s * 0.17; g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x, yy - s * 0.3); g.lineTo(x + ww, yy); g.fill(); }
        g.fillStyle = 'rgba(220,240,255,0.5)';
        for (let k = 0; k < 4; k++) { const ww = s * (0.3 - k * 0.06), yy = y - s * 0.14 - k * s * 0.17; g.fillRect(x - ww, yy - 1, ww * 1.4, 1.5); }
      };
      const shore = h * 0.9;
      g.fillStyle = '#050c12'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, shore + Math.sin(x * 0.03) * 8 * sc + Math.sin(x * 0.11) * 3 * sc); g.lineTo(w, h); g.fill();
      g.fillStyle = 'rgba(220,240,255,0.5)'; for (let x = 0; x <= w; x += 8) g.fillRect(x, shore + Math.sin(x * 0.03) * 8 * sc - 1, 8, 2);
      for (let i = 0; i < 26; i++) { const x = i % 2 ? rand(0, 0.3) * w : rand(0.7, 1) * w; pine(x, shore + rand(0, 20) * sc, rand(40, 80) * sc, '#071118'); }
      const cx = w * 0.78, cy = shore + 6 * sc, cw = 40 * sc, ch = 20 * sc;
      g.fillStyle = '#20140c'; g.fillRect(cx - cw / 2, cy - ch, cw, ch);
      g.fillStyle = '#e8f2ff'; g.beginPath(); g.moveTo(cx - cw * 0.65, cy - ch); g.lineTo(cx, cy - ch * 2); g.lineTo(cx + cw * 0.65, cy - ch); g.fill();
      g.fillStyle = '#ffc870'; g.fillRect(cx - cw * 0.3, cy - ch * 0.7, cw * 0.18, ch * 0.35); g.fillRect(cx + cw * 0.1, cy - ch * 0.7, cw * 0.18, ch * 0.35);
      glow(g, cx, cy - ch * 0.5, cw * 1.6, '255,180,90', 0.35);
      // 極光的低解析度緩衝區（放大後自然模糊）
      this.buf = layer(Math.ceil(w / 4), Math.ceil(h / 4));
      this.bands = [{ y: 0.06, amp: 0.05, col: [80, 255, 160], k: 1 }, { y: 0.14, amp: 0.06, col: [120, 220, 255], k: 0.7 }, { y: 0.03, amp: 0.03, col: [210, 110, 255], k: 0.6 }];
      // 每種顏色預先畫一條直向漸層光柱，繪製時只需拉伸與調透明度
      for (const b of this.bands) {
        const S = (b.spr = layer(4, 64));
        const [r, gg, bb] = b.col;
        const gr = S.g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, `rgba(${r},${gg},${bb},0)`); gr.addColorStop(0.15, `rgba(${r},${gg},${bb},0.6)`); gr.addColorStop(0.5, `rgba(${(r + 255) / 2 | 0},${gg},${bb},0.28)`); gr.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
        S.g.fillStyle = gr; S.g.fillRect(0, 0, 4, 64);
      }
    }
    update(dt) { this.surge *= Math.pow(0.3, dt / 1000); }
    renderAurora(t) {
      const B = this.buf, g = B.g, w = B.w, h = B.h;
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const T = t / 1000;
      const boost = 0.8 + Math.min(5, this.intensity) * 0.08 + this.surge * 0.4;
      const step = 1;
      for (const b of this.bands) {
        for (let x = 0; x < w; x += step) {
          const u = x / w;
          const yc = h * (b.y + b.amp * Math.sin(u * 4 + T * 0.35 + b.k * 3) + 0.015 * Math.sin(u * 9 - T * 0.8));
          const it = Math.max(0, 0.55 + 0.45 * Math.sin(u * 6 + T * 0.6 + b.k) * Math.sin(u * 2.3 - T * 0.25)) * b.k * boost;
          if (it < 0.03) continue;
          g.globalAlpha = Math.min(1, it);
          g.drawImage(b.spr.cv, x, yc, step + 0.5, h * (0.18 + 0.2 * it));
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      this.renderAurora(t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.9 + beat * 0.1;
      g.drawImage(this.buf.cv, 0, 0, w, h);
      // 結冰湖面的倒影：上下翻轉、壓扁、變淡
      g.save();
      g.beginPath(); g.rect(0, this.lake, w, h * 0.9 - this.lake); g.clip();
      g.globalAlpha = 0.45;
      g.translate(0, this.lake + this.horizon * 0.28); g.scale(1, -0.28); // 天空倒映：離地平線越遠，倒影越下面
      g.drawImage(this.buf.cv, 0, 0, w, h);
      g.restore();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.surge = Math.min(2, this.surge + 0.35 * d.lines + (d.lines >= 4 ? 0.6 : 0)); }
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
  // 櫻花：暮色富士山、五重塔、湖面倒影、滿開的櫻花樹、飄落花瓣
  // =========================================================
  class Sakura {
    constructor(low) { this.low = low; this.wind = 0; this.extra = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#2a2a5e'], [0.35, '#6a5a9a'], [0.58, '#e89ab8'], [0.7, '#ffd0c0'], [0.72, '#c58aa8'], [1, '#3a2a48']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,240,250,${rand(0.15, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.25), 1, 1); }
      // 富士山：微凹的山坡、鋸齒雪線
      const horizon = (this.horizon = h * 0.72);
      const fx = w * 0.5, ft = h * 0.56, fw = w * 0.75;
      const fuji = (yScale) => {
        g.beginPath(); g.moveTo(fx - fw, horizon);
        g.quadraticCurveTo(fx - fw * 0.35, horizon - (horizon - ft) * 0.35 * yScale, fx - fw * 0.09, horizon - (horizon - ft) * yScale);
        g.lineTo(fx + fw * 0.09, horizon - (horizon - ft) * yScale);
        g.quadraticCurveTo(fx + fw * 0.35, horizon - (horizon - ft) * 0.35 * yScale, fx + fw, horizon); g.closePath();
      };
      fuji(1);
      const mg = g.createLinearGradient(fx - fw, 0, fx + fw, 0);
      mg.addColorStop(0, '#6a6a9e'); mg.addColorStop(0.5, '#5a5a8a'); mg.addColorStop(1, '#3a3a66');
      g.fillStyle = mg; g.fill();
      g.save(); fuji(1); g.clip();
      g.fillStyle = '#f8f4ff';
      g.beginPath(); g.moveTo(fx - fw * 0.5, ft);
      const snowY = ft + (horizon - ft) * 0.32;
      for (let k = 0; k <= 14; k++) { const x = fx - fw * 0.3 + k * fw * 0.6 / 14; g.lineTo(x, snowY + (k % 2 ? 10 : -6) * sc + rand(-4, 4) * sc); }
      g.lineTo(fx + fw * 0.5, ft); g.closePath(); g.fill();
      g.fillStyle = 'rgba(120,110,170,0.45)'; g.fillRect(fx, ft, fw, snowY - ft + 12 * sc); // 背光側雪面
      g.restore();
      // 湖面與倒影
      const lake = horizon;
      g.fillStyle = vgrad(g, h, [[lake / h, '#b8789e'], [0.85, '#4a3a68'], [1, '#2a1e3a']]);
      g.fillRect(0, lake, w, h - lake);
      g.save(); g.globalAlpha = 0.35; g.translate(0, lake * 2); g.scale(1, -1); fuji(1); g.fillStyle = '#4a4a7a'; g.fill(); g.restore();
      g.strokeStyle = 'rgba(255,220,235,0.25)'; g.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const y = lake + rand(2, h * 0.2); g.beginPath(); g.moveTo(rand(0, w), y); g.lineTo(rand(0, w), y); g.stroke(); }
      // 五重塔（右側山丘）
      const tx = w * 0.84, tb = h * 0.73;
      g.fillStyle = '#2a1a2e'; g.beginPath(); g.ellipse(tx, tb + 10 * sc, w * 0.3, 20 * sc, 0, Math.PI, 0); g.fill();
      for (let k = 0; k < 5; k++) {
        const ww = (34 - k * 4) * sc, y = tb - k * 15 * sc;
        g.fillStyle = '#8a1e22'; g.fillRect(tx - ww * 0.3, y - 10 * sc, ww * 0.6, 10 * sc);
        g.fillStyle = '#ffcf8a'; g.fillRect(tx - ww * 0.18, y - 8 * sc, ww * 0.12, 5 * sc); g.fillRect(tx + ww * 0.06, y - 8 * sc, ww * 0.12, 5 * sc);
        g.fillStyle = '#2a1a22';
        g.beginPath(); g.moveTo(tx - ww * 0.62, y - 9 * sc); g.quadraticCurveTo(tx - ww * 0.3, y - 11 * sc, tx - ww * 0.22, y - 16 * sc); g.lineTo(tx + ww * 0.22, y - 16 * sc); g.quadraticCurveTo(tx + ww * 0.3, y - 11 * sc, tx + ww * 0.62, y - 9 * sc); g.fill();
      }
      g.strokeStyle = '#2a1a22'; g.lineWidth = 2 * sc; g.beginPath(); g.moveTo(tx, tb - 75 * sc); g.lineTo(tx, tb - 95 * sc); g.stroke();
      // 櫻花樹：樹幹 + 一團團粉紅花簇
      this.petalImgs = [petalSprite('#ffe1ee', '#ff9cc4'), petalSprite('#fff0f6', '#ffb6d3'), petalSprite('#ffd0e4', '#f07aa8')];
      const blossomCluster = (x, y, r) => {
        for (let k = 0; k < 26; k++) {
          const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r;
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.75;
          const rr = rand(3, 7) * sc;
          const gr = g.createRadialGradient(px - rr * 0.3, py - rr * 0.3, 0, px, py, rr);
          const lit = py < y ? 1 : 0.8;
          gr.addColorStop(0, `rgba(255,${(235 * lit) | 0},${(245 * lit) | 0},0.95)`); gr.addColorStop(1, `rgba(${(240 * lit) | 0},${(130 * lit) | 0},${(170 * lit) | 0},0.85)`);
          g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
        }
      };
      const tree = (x0, y0, ang, len, wd, d) => {
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.strokeStyle = '#2e1a20'; g.lineWidth = wd; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + rand(-6, 6) * sc, (y0 + y1) / 2 + rand(-6, 6) * sc, x1, y1); g.stroke();
        if (d <= 0) { blossomCluster(x1, y1, rand(20, 30) * sc); return; }
        tree(x1, y1, ang + rand(0.2, 0.55), len * 0.74, wd * 0.66, d - 1);
        tree(x1, y1, ang - rand(0.2, 0.55), len * 0.74, wd * 0.66, d - 1);
        if (d >= 2 && Math.random() < 0.6) blossomCluster(x1, y1, rand(14, 22) * sc);
      };
      tree(-10, h * 0.98, -1.1, 110 * sc, 16 * sc, 4);
      tree(w + 10, h * 0.99, Math.PI + 1.15, 100 * sc, 15 * sc, 4);
      // 上方垂下的花枝
      tree(-6, -4, 0.7, 50 * sc, 7 * sc, 3);
      tree(w + 6, -4, Math.PI - 0.6, 46 * sc, 6 * sc, 3);
      this.petals = [];
      for (let i = 0; i < (this.low ? 20 : 45); i++) this.petals.push(this.newPetal(true));
    }
    newPetal(anywhere, x, y) {
      return { x: x != null ? x : rand(-0.2, 1) * this.w, y: y != null ? y : anywhere ? rand(0, this.h) : rand(-30, -10), vx: rand(8, 26), vy: rand(18, 40), rot: rand(0, TAU), vr: rand(-2, 2), flip: rand(0, TAU), vf: rand(2, 5), s: rand(4, 7) * this.sc, k: (Math.random() * 3) | 0 };
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      const upd = (p) => { p.x += (p.vx + this.wind + Math.sin(p.flip) * 10) * s; p.y += p.vy * s; p.rot += p.vr * s; p.flip += p.vf * s; };
      for (const p of this.petals) { upd(p); if (p.y > this.h + 20 || p.x > this.w + 30) Object.assign(p, this.newPetal(false)); }
      for (const p of this.extra) { upd(p); p.vy += 30 * s; }
      this.extra = this.extra.filter((p) => p.y < this.h + 20 && p.x < this.w + 40);
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      glow(g, w * 0.5, this.horizon, w * 0.6, '255,190,210', 0.12 + beat * 0.06);
      g.globalCompositeOperation = 'source-over';
      const drawP = (p) => { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.flip)); g.drawImage(this.petalImgs[p.k].cv, -p.s, -p.s * 0.7, p.s * 2, p.s * 1.4); g.restore(); };
      for (const p of this.petals) drawP(p);
      for (const p of this.extra) drawP(p);
    }
    burst(d, B) {
      this.wind = Math.min(400, this.wind + 60 * d.lines + (d.lines >= 4 ? 140 : 0));
      const n = Math.min(this.low ? 15 : 40, d.lines * (this.low ? 4 : 10));
      for (let i = 0; i < n; i++) {
        const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18;
        const p = this.newPetal(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c);
        p.vx = rand(-120, 160); p.vy = rand(-100, 10); this.extra.push(p);
      }
    }
  }

  // =========================================================
  // 夕陽雲海：金色體積雲、穿出雲海的山峰、夕陽光芒、高空卷雲、歸鳥
  // =========================================================
  class Sunset {
    constructor(low) { this.low = low; this.flash = 0; this.bloomScale = 0.45; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#2a2a6a'], [0.25, '#7a4a8a'], [0.5, '#f08a6a'], [0.64, '#ffc87a'], [0.7, '#ffe4a8'], [1, '#f2a070']]);
      g.fillRect(0, 0, w, h);
      // 高空卷雲（上方細長、被照成粉金色）
      for (let i = 0; i < 10; i++) {
        const y = h * rand(0.01, 0.2), x = rand(-0.2, 1) * w, len = rand(100, 220) * sc;
        const cg = g.createLinearGradient(x, 0, x + len, 0);
        cg.addColorStop(0, 'rgba(255,200,190,0)'); cg.addColorStop(0.5, 'rgba(255,190,180,0.45)'); cg.addColorStop(1, 'rgba(255,200,190,0)');
        g.fillStyle = cg; g.beginPath(); g.ellipse(x + len / 2, y, len / 2, rand(2, 5) * sc, rand(-0.05, 0.05), 0, TAU); g.fill();
      }
      this.sun = { x: w * 0.5, y: h * 0.69, r: 34 * sc };
      glow(g, this.sun.x, this.sun.y, w * 1.0, '255,170,100', 0.35);
      glow(g, this.sun.x, this.sun.y, this.sun.r * 2.5, '255,240,200', 0.6);
      g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(this.sun.x, this.sun.y, this.sun.r, 0, TAU); g.fill();
      // 穿出雲海的山峰（逆光剪影帶金邊）
      const peaks = ridgePts(w, h * 0.74, h * 0.14, 0.012, true);
      fillPts(g, peaks, h, vgrad(g, h, [[0.6, '#5a3a5a'], [0.78, '#8a5a6a']]));
      g.strokeStyle = 'rgba(255,220,160,0.7)'; g.lineWidth = 1.2;
      g.beginPath(); peaks.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      // 雲海：多層體積雲，越近越大、越亮
      for (let row = 0; row < 3; row++) {
        const y0 = h * (0.76 + row * 0.08), n = 3 + row;
        for (let i = 0; i <= n; i++) {
          const cx = (i / n) * w + rand(-20, 20) * sc;
          puffCloud(g, cx, y0 + rand(-6, 6) * sc, w * (0.5 + row * 0.1), (32 + row * 12) * sc,
            row === 0 ? 'rgba(250,190,160,1)' : row === 1 ? 'rgba(235,170,150,1)' : 'rgba(215,150,145,1)',
            row === 0 ? 'rgba(170,100,120,1)' : row === 1 ? 'rgba(140,80,110,1)' : 'rgba(110,62,96,1)', 'rgba(255,210,140,0.3)', 12);
        }
      }
      // 會飄動的前景雲朵素材
      this.drift = [];
      for (let i = 0; i < 4; i++) {
        const C = layer(240, 100);
        puffCloud(C.g, 120, 70, 200, 30, 'rgba(240,180,160,0.95)', 'rgba(150,85,110,0.92)', 'rgba(255,210,150,0.35)', 10);
        this.drift.push({ img: C, x: rand(0, w), y: h * rand(0.62, 0.75), s: rand(0.6, 1) * sc, v: rand(4, 9) * sc });
      }
      this.ray = layer(60, 600);
      const rg = this.ray.g.createLinearGradient(0, 0, 0, 600);
      rg.addColorStop(0, 'rgba(255,230,170,0.5)'); rg.addColorStop(1, 'rgba(255,230,170,0)');
      this.ray.g.fillStyle = rg; this.ray.g.beginPath(); this.ray.g.moveTo(28, 0); this.ray.g.lineTo(32, 0); this.ray.g.lineTo(60, 600); this.ray.g.lineTo(0, 600); this.ray.g.fill();
      this.birds = [];
      for (let i = 0; i < 6; i++) this.birds.push({ x: rand(0, w), y: h * rand(0.02, 0.1), v: rand(12, 20) * sc, ph: rand(0, TAU), s: rand(0.7, 1.1) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      for (const c of this.drift) { c.x += c.v * s * (1 + this.flash); if (c.x > this.w + 130 * c.s) c.x = -130 * c.s; }
      for (const b of this.birds) { b.x += b.v * s; b.ph += s * 6; if (b.x > this.w + 20) { b.x = -20; b.y = this.h * rand(0.02, 0.1); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(this.sun.x, this.sun.y);
      for (let i = 0; i < 12; i++) {
        g.save(); g.rotate(Math.PI + (i - 5.5) * 0.2 + Math.sin(t / 4000 + i) * 0.03);
        g.globalAlpha = (0.06 + beat * 0.03 + this.flash * 0.08) * (i % 2 ? 0.6 : 1);
        g.drawImage(this.ray.cv, -30, 0, 60, h * 0.8); g.restore();
      }
      g.restore(); g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      for (const c of this.drift) g.drawImage(c.img.cv, c.x - 120 * c.s, c.y - 50 * c.s, 240 * c.s, 100 * c.s);
      g.strokeStyle = 'rgba(60,30,50,0.8)'; g.lineWidth = 1.4 * sc;
      for (const b of this.birds) {
        const f = Math.sin(b.ph) * 4 * sc * b.s, s2 = 7 * sc * b.s;
        g.beginPath(); g.moveTo(b.x - s2, b.y - f); g.quadraticCurveTo(b.x - s2 * 0.4, b.y - f * 0.3 - 2 * sc, b.x, b.y); g.quadraticCurveTo(b.x + s2 * 0.4, b.y - f * 0.3 - 2 * sc, b.x + s2, b.y - f); g.stroke();
      }
    }
    burst(d) { this.flash = Math.min(2, this.flash + 0.35 * d.lines); }
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
  // 敦煌：鳴沙山的沙丘稜線、月牙泉與樓閣、駝隊剪影、飛天彩帶、風沙
  // =========================================================
  class Dunhuang {
    constructor(low) { this.low = low; this.wind = 0; this.sand = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#1d1a46'], [0.3, '#5b3a6e'], [0.5, '#c4605a'], [0.6, '#f2a35e'], [0.66, '#ffd18a'], [1, '#8a4a2a']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,240,220,${rand(0.15, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.3), 1, 1); }
      this.sun = { x: w * 0.25, y: h * 0.635, r: 30 * sc };
      glow(g, this.sun.x, this.sun.y, w, '255,170,90', 0.4);
      glow(g, this.sun.x, this.sun.y, this.sun.r * 3, '255,230,170', 0.6);
      g.fillStyle = '#fff0c8'; g.beginPath(); g.arc(this.sun.x, this.sun.y, this.sun.r, 0, TAU); g.fill();
      // 沙丘：亮面 / 暗面以尖銳稜線分開
      const dune = (base, amp, freq, lit, dark, rim) => {
        // 沙丘：少數幾道銳利的沙脊（1-|sin| 在稜線處形成尖角）
        const p1 = rand(0, TAU), p2 = rand(0, TAU), pts = [];
        for (let x = -10; x <= w + 10; x += 4) {
          const v = 0.7 * Math.pow(1 - Math.abs(Math.sin(x * freq + p1)), 1.4) + 0.3 * Math.pow(1 - Math.abs(Math.sin(x * freq * 2.3 + p2)), 1.4);
          pts.push([x, base - amp * v]);
        }
        fillPts(g, pts, h, dark);
        // 向光面：每段「谷→峰」的上坡（面向左邊的夕陽）畫成一整塊平滑的亮面
        g.save(); g.beginPath(); g.moveTo(pts[0][0], h); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(w + 10, h); g.clip();
        let v = 0;
        for (let i = 1; i < pts.length - 1; i++) {
          const peak = pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1];
          const valley = pts[i][1] > pts[i - 1][1] && pts[i][1] >= pts[i + 1][1];
          if (valley) v = i;
          if (peak && i > v) {
            const [px, py] = pts[i], [vx] = pts[v];
            const gr = g.createLinearGradient(vx, py, px, py);
            gr.addColorStop(0, dark); gr.addColorStop(1, lit);
            g.fillStyle = gr;
            g.beginPath(); g.moveTo(pts[v][0], pts[v][1]);
            for (let k = v + 1; k <= i; k++) g.lineTo(pts[k][0], pts[k][1]);
            g.quadraticCurveTo(px + (px - vx) * 0.15, py + (h - py) * 0.5, px + (px - vx) * 0.1, h);
            g.lineTo(vx - 20 * sc, h); g.closePath(); g.fill();
          }
        }
        g.restore();
        g.strokeStyle = rim; g.lineWidth = 1.2;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        return pts;
      };
      dune(h * 0.67, h * 0.06, 0.01, 'rgba(240,170,110,0.9)', 'rgba(170,90,80,0.95)', 'rgba(255,220,170,0.6)');
      this.ridge = dune(h * 0.74, h * 0.08, 0.008, 'rgba(250,180,110,1)', 'rgba(150,72,60,1)', 'rgba(255,230,180,0.8)');
      // 月牙泉與樓閣
      const lx = w * 0.62, ly = h * 0.8;
      g.save(); g.translate(lx, ly);
      const lg = g.createLinearGradient(0, -12 * sc, 0, 12 * sc);
      lg.addColorStop(0, '#5ac0c8'); lg.addColorStop(1, '#2a6c8a');
      g.fillStyle = lg;
      g.beginPath(); g.ellipse(0, 0, 70 * sc, 14 * sc, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(150,72,60,1)'; g.beginPath(); g.ellipse(14 * sc, -5 * sc, 64 * sc, 11 * sc, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,220,160,0.45)'; g.fillRect(-60 * sc, 3 * sc, 40 * sc, 1.5);
      g.restore();
      g.fillStyle = '#3e6a3a'; for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(lx - 70 * sc + i * 8 * sc, ly + 10 * sc, 5 * sc, 2.5 * sc, 0, 0, TAU); g.fill(); }
      const px = lx + 30 * sc, py = ly - 4 * sc;
      g.fillStyle = '#4a2018'; g.fillRect(px - 14 * sc, py - 22 * sc, 28 * sc, 22 * sc);
      g.fillStyle = '#ffcc80'; for (let k = 0; k < 3; k++) g.fillRect(px - 10 * sc + k * 8 * sc, py - 16 * sc, 4 * sc, 8 * sc);
      for (const [yy, ww] of [[-22, 46], [-38, 34]]) {
        g.fillStyle = '#2a120e';
        g.beginPath(); g.moveTo(px - ww / 2 * sc, py + yy * sc); g.quadraticCurveTo(px - ww * 0.3 * sc, py + (yy - 3) * sc, px - ww * 0.18 * sc, py + (yy - 10) * sc); g.lineTo(px + ww * 0.18 * sc, py + (yy - 10) * sc); g.quadraticCurveTo(px + ww * 0.3 * sc, py + (yy - 3) * sc, px + ww / 2 * sc, py + yy * sc); g.fill();
      }
      g.fillStyle = '#4a2018'; g.fillRect(px - 9 * sc, py - 38 * sc, 18 * sc, 6 * sc);
      // 近景沙丘
      dune(h * 0.9, h * 0.07, 0.012, 'rgba(255,190,120,1)', 'rgba(130,60,50,1)', 'rgba(255,235,190,0.9)');
      // 沙紋
      g.strokeStyle = 'rgba(120,50,40,0.25)'; g.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const y = h * rand(0.92, 1), x = rand(0, w); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20 * sc, y - 3 * sc, x + 40 * sc, y); g.stroke(); }
      this.caravan = { x: rand(0, w), v: 8 * sc };
      // 飛天：兩位，帶著長長的彩帶
      this.apsaras = [{ x: 0.1, y: 0.06, dir: 1, ph: 0 }, { x: 0.9, y: 0.12, dir: -1, ph: 2 }];
      for (let i = 0; i < (this.low ? 30 : 70); i++) this.sand.push({ x: rand(0, w), y: h * rand(0.6, 1), v: rand(30, 70) * sc, a: rand(0.2, 0.6) });
    }
    update(dt) {
      const s = dt / 1000;
      this.wind *= Math.pow(0.3, s);
      this.caravan.x += this.caravan.v * s; if (this.caravan.x > this.w + 120 * this.sc) this.caravan.x = -120 * this.sc;
      for (const p of this.sand) { p.x += (p.v + this.wind) * s; p.y += Math.sin(p.x * 0.05) * 6 * s; if (p.x > this.w + 5) { p.x = -5; p.y = this.h * rand(0.6, 1); } }
    }
    ridgeY(x) { const pts = this.ridge; const i = Math.max(0, Math.min(pts.length - 1, Math.round((x + 10) / 4))); return pts[i][1]; }
    drawApsara(g, a, t) {
      const w = this.w, h = this.h, sc = this.sc;
      const x = a.x * w + Math.sin(t / 2400 + a.ph) * 14 * sc, y = a.y * h + Math.sin(t / 1700 + a.ph) * 8 * sc;
      g.save(); g.translate(x, y); g.scale(a.dir * sc * 1.1, sc * 1.1);
      // 飄帶（多條、波動）
      const cols = ['#3fb0a0', '#d8413a', '#f0c050', '#6a5cd0'];
      for (let r = 0; r < 4; r++) {
        g.strokeStyle = cols[r]; g.lineWidth = 3.2 - r * 0.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-2, 2 + r * 2);
        for (let q = 1; q <= 18; q++) g.lineTo(-q * 6, 2 + r * 3 + Math.sin(t / 500 + q * 0.5 + r + a.ph) * (q * 0.9) + q * (r - 1.5) * 0.6);
        g.stroke();
      }
      // 身形：上身、頭、髮髻、長裙
      g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(8, -10, 4.5, 0, TAU); g.fill();
      g.fillStyle = '#1a1010'; g.beginPath(); g.arc(9, -14, 3, 0, TAU); g.fill();
      g.fillStyle = '#c03a30'; g.beginPath(); g.moveTo(4, -6); g.lineTo(12, -6); g.lineTo(8, 4); g.fill();
      g.fillStyle = '#2f8a80'; g.beginPath(); g.moveTo(6, 2); g.quadraticCurveTo(0, 10, -16, 12); g.quadraticCurveTo(-6, 4, 6, 2); g.fill();
      g.strokeStyle = '#f2c9a0'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, -5); g.quadraticCurveTo(18, -10, 20, -18); g.stroke();
      g.restore();
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 駝隊沿著沙丘稜線走
      g.fillStyle = '#3a1810';
      for (let i = 0; i < 4; i++) {
        const x = this.caravan.x - i * 26 * sc, y = this.ridgeY(x) - 1;
        const bob = Math.sin(t / 300 + i) * 1 * sc, s2 = sc * 0.9;
        g.save(); g.translate(x, y + bob); g.scale(s2, s2);
        g.beginPath(); g.ellipse(0, -14, 10, 5, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(-2, -19, 4, 4, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(8, -15); g.quadraticCurveTo(14, -18, 14, -26); g.lineTo(18, -26); g.lineTo(16, -23); g.lineTo(11, -14); g.fill();
        for (const lx2 of [-7, -4, 4, 7]) g.fillRect(lx2 + Math.sin(t / 200 + lx2) * 1, -10, 1.6, 10);
        if (i === 0) { g.fillRect(-2, -26, 3, 7); g.beginPath(); g.arc(-0.5, -27, 2, 0, TAU); g.fill(); }
        g.restore();
      }
      // 風沙
      for (const p of this.sand) { g.fillStyle = `rgba(255,220,170,${p.a})`; g.fillRect(p.x, p.y, 2 * sc, 0.8 * sc); }
      for (const a of this.apsaras) this.drawApsara(g, a, t);
      g.globalCompositeOperation = 'lighter';
      glow(g, this.sun.x, this.sun.y, this.sun.r * 2.5, '255,220,150', 0.15 + beat * 0.08);
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.wind = Math.min(400, this.wind + 60 * d.lines + (d.lines >= 4 ? 150 : 0)); }
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
  // 冰晶洞窟：多面體發光水晶簇、冰柱、洞口光束、冰凍瀑布、飄浮冰晶
  // =========================================================
  class IceCave {
    constructor(low) { this.low = low; this.glowK = 0; this.motes = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0c1e3a'], [0.4, '#0a2a4c'], [0.7, '#123a5e'], [1, '#06162a']]);
      g.fillRect(0, 0, w, h);
      // 洞壁：兩側凹凸的冰岩
      const wall = (side) => {
        g.beginPath();
        const x0 = side ? w : 0;
        g.moveTo(x0, 0);
        for (let y = 0; y <= h; y += 8) { const d = (0.12 + 0.08 * Math.sin(y * 0.013 + side * 2) + 0.03 * Math.sin(y * 0.05)) * w; g.lineTo(side ? w - d : d, y); }
        g.lineTo(x0, h); g.closePath();
        const gr = g.createLinearGradient(side ? w : 0, 0, side ? w * 0.75 : w * 0.25, 0);
        gr.addColorStop(0, '#061428'); gr.addColorStop(1, '#1a4a72');
        g.fillStyle = gr; g.fill();
      };
      wall(0); wall(1);
      // 冰凍瀑布（左側），帶縱向冰紋
      const fx = w * 0.1, fw = w * 0.12;
      const fg = g.createLinearGradient(fx - fw, 0, fx + fw, 0);
      fg.addColorStop(0, 'rgba(160,230,255,0)'); fg.addColorStop(0.5, 'rgba(200,245,255,0.55)'); fg.addColorStop(1, 'rgba(160,230,255,0)');
      g.fillStyle = fg; g.fillRect(fx - fw, h * 0.1, fw * 2, h * 0.75);
      g.strokeStyle = 'rgba(230,250,255,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 16; i++) { const x = fx + rand(-fw, fw) * 0.8; g.beginPath(); g.moveTo(x, h * 0.1); g.quadraticCurveTo(x + rand(-6, 6), h * 0.5, x + rand(-4, 4), h * 0.85); g.stroke(); }
      // 地面冰層
      g.fillStyle = vgrad(g, h, [[0.86, '#2a6a96'], [1, '#0a2440']]);
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.88 + Math.sin(x * 0.02) * 8 * sc); g.lineTo(w, h); g.fill();
      // 水晶：多面柱體（三個面不同明暗 + 亮邊）
      const crystal = (x, y, len, wd, ang, hue) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
        const tip = [x + dx * len, y + dy * len];
        const sh = [x + dx * len * 0.78, y + dy * len * 0.78];
        const L1 = [x + nx * wd, y + ny * wd], R1 = [x - nx * wd, y - ny * wd];
        const L2 = [sh[0] + nx * wd, sh[1] + ny * wd], R2 = [sh[0] - nx * wd, sh[1] - ny * wd];
        const face = (pts, a) => { g.fillStyle = `hsla(${hue},85%,${a}%,0.9)`; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); };
        face([L1, L2, sh, [x, y]], 72);
        face([[x, y], sh, R2, R1], 48);
        face([L2, tip, sh], 85);
        face([sh, tip, R2], 58);
        g.strokeStyle = 'rgba(240,255,255,0.8)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(sh[0], sh[1]); g.lineTo(tip[0], tip[1]); g.stroke();
        this.glows.push([tip[0], tip[1], wd * 3, hue]);
      };
      this.glows = [];
      const cluster = (cx, cy, up, n, size, hue) => {
        for (let k = 0; k < n; k++) {
          const ang = (up ? -Math.PI / 2 : Math.PI / 2) + rand(-0.7, 0.7);
          const len = rand(0.5, 1) * size, wd = len * rand(0.12, 0.18);
          crystal(cx + rand(-size, size) * 0.35, cy, len, wd, ang, hue + rand(-15, 15));
        }
      };
      cluster(w * 0.12, h * 0.95, true, 7, 110 * sc, 190);
      cluster(w * 0.88, h * 0.93, true, 8, 130 * sc, 265);
      cluster(w * 0.5, h * 0.99, true, 5, 70 * sc, 175);
      cluster(w * 0.3, h * 0.97, true, 4, 60 * sc, 280);
      cluster(w * 0.7, h * 0.98, true, 4, 64 * sc, 200);
      cluster(w * 0.08, -2, false, 5, 80 * sc, 200);
      cluster(w * 0.94, -2, false, 5, 70 * sc, 270);
      // 冰柱
      for (let x = 0; x < w; x += rand(10, 22) * sc) {
        const len = rand(10, 40) * sc;
        const ig = g.createLinearGradient(0, 0, 0, len);
        ig.addColorStop(0, 'rgba(200,240,255,0.9)'); ig.addColorStop(1, 'rgba(200,240,255,0.1)');
        g.fillStyle = ig; g.beginPath(); g.moveTo(x - 4 * sc, 0); g.lineTo(x, len); g.lineTo(x + 4 * sc, 0); g.fill();
      }
      this.ray = layer(60, 500);
      const rg = this.ray.g.createLinearGradient(0, 0, 0, 500);
      rg.addColorStop(0, 'rgba(200,240,255,0.5)'); rg.addColorStop(1, 'rgba(200,240,255,0)');
      this.ray.g.fillStyle = rg; this.ray.g.beginPath(); this.ray.g.moveTo(24, 0); this.ray.g.lineTo(36, 0); this.ray.g.lineTo(60, 500); this.ray.g.lineTo(0, 500); this.ray.g.fill();
      for (let i = 0; i < (this.low ? 20 : 50); i++) this.motes.push({ x: rand(0, w), y: rand(0, h), v: rand(4, 12) * sc, ph: rand(0, TAU), r: rand(0.8, 2.2) * sc });
    }
    update(dt) {
      const s = dt / 1000;
      this.glowK *= Math.pow(0.25, s);
      for (const m of this.motes) { m.y -= m.v * s * (1 + this.glowK * 2); m.ph += s * 2; m.x += Math.sin(m.ph) * 4 * s; if (m.y < -5) { m.y = this.h + 5; m.x = rand(0, this.w); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        g.save(); g.globalAlpha = 0.12 + 0.05 * Math.sin(t / 2000 + i) + beat * 0.04;
        g.translate(w * (0.35 + i * 0.1), -10); g.rotate(-0.12 + i * 0.08);
        g.drawImage(this.ray.cv, -40, 0, 80, h * 1.1); g.restore();
      }
      g.globalAlpha = 1;
      for (const [x, y, r, hue] of this.glows) {
        const k = 0.35 + 0.25 * Math.sin(t / 700 + x) + beat * 0.15 + this.glowK * 0.5;
        const gr = g.createRadialGradient(x, y, 0, x, y, r * (1 + this.glowK));
        gr.addColorStop(0, `hsla(${hue},100%,80%,${0.6 * k})`); gr.addColorStop(1, `hsla(${hue},100%,60%,0)`);
        g.fillStyle = gr; g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
      }
      for (const m of this.motes) {
        const a = 0.4 + 0.4 * Math.sin(m.ph * 3);
        g.fillStyle = `rgba(210,245,255,${a})`;
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.glowK = Math.min(1.5, this.glowK + 0.3 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  // =========================================================
  // 熔岩：噴發的火山、灰燼雲被映紅、玄武岩崖上的熔岩裂縫、流動的熔岩河、火星
  // =========================================================
  class Lava {
    constructor(low) { this.low = low; this.erupt = 0; this.bombs = []; this.embers = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0a0405'], [0.35, '#2a0a08'], [0.6, '#6a1a0c'], [0.68, '#3a0e08'], [1, '#0a0303']]);
      g.fillRect(0, 0, w, h);
      // 灰燼雲：底部被岩漿映紅
      for (let i = 0; i < 10; i++) puffCloud(g, rand(0, w), h * rand(0.02, 0.3), rand(140, 240) * sc, rand(24, 40) * sc, 'rgba(70,40,40,1)', 'rgba(110,40,25,1)', 'rgba(255,120,40,0.25)', 10);
      // 火山（中央遠方）
      const vx = (this.vx = w * 0.5), vt = (this.vt = h * 0.6), base = h * 0.7;
      g.fillStyle = '#1a0806';
      g.beginPath(); g.moveTo(vx - w * 0.7, base); g.quadraticCurveTo(vx - w * 0.2, base - (base - vt) * 0.4, vx - w * 0.08, vt); g.lineTo(vx + w * 0.08, vt); g.quadraticCurveTo(vx + w * 0.2, base - (base - vt) * 0.4, vx + w * 0.7, base); g.fill();
      // 熔岩順著山坡流下
      g.strokeStyle = 'rgba(255,120,30,0.85)'; g.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        g.lineWidth = rand(1.5, 3.5) * sc;
        let x = vx + rand(-0.06, 0.06) * w, y = vt;
        g.beginPath(); g.moveTo(x, y);
        while (y < base) { x += rand(-6, 6) * sc + (x - vx) * 0.04; y += rand(6, 12) * sc; g.lineTo(x, y); }
        g.stroke();
      }
      glow(g, vx, vt, w * 0.35, '255,110,30', 0.5);
      // 前景玄武岩崖（左右）帶發光裂縫
      const cliff = (side) => {
        const pts = [];
        for (let y = h * 0.55; y <= h + 5; y += 10) pts.push([side ? w - (0.12 + 0.1 * Math.sin(y * 0.02) + rand(0, 0.03)) * w : (0.12 + 0.1 * Math.sin(y * 0.02 + 2) + rand(0, 0.03)) * w, y]);
        g.fillStyle = '#120605';
        g.beginPath(); g.moveTo(side ? w : 0, h * 0.55); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(side ? w : 0, h); g.fill();
        g.strokeStyle = 'rgba(255,100,20,0.75)'; g.lineWidth = 1.2 * sc;
        for (let k = 0; k < 7; k++) {
          let x = side ? w - rand(0, 0.15) * w : rand(0, 0.15) * w, y = h * rand(0.6, 0.95);
          g.beginPath(); g.moveTo(x, y);
          for (let q = 0; q < 6; q++) { x += rand(-12, 12) * sc; y += rand(-10, 10) * sc; g.lineTo(x, y); }
          g.stroke();
        }
      };
      cliff(0); cliff(1);
      this.riverY = h * 0.84;
      this.flowImg = layer(256, 64);
      const fg = this.flowImg.g;
      fg.fillStyle = '#ff5a10'; fg.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 90; i++) {
        const x = rand(0, 256), y = rand(0, 64), r = rand(4, 16);
        const gr = fg.createRadialGradient(x, y, 0, x, y, r);
        const bright = Math.random() < 0.5;
        gr.addColorStop(0, bright ? 'rgba(255,230,120,0.9)' : 'rgba(120,20,5,0.8)'); gr.addColorStop(1, bright ? 'rgba(255,200,80,0)' : 'rgba(80,10,0,0)');
        fg.fillStyle = gr; for (const dx of [-256, 0, 256]) fg.fillRect(x - r + dx, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < (this.low ? 30 : 70); i++) this.embers.push(this.newEmber(true));
    }
    newEmber(any, x, y) { return { x: x != null ? x : rand(0, this.w), y: y != null ? y : any ? rand(0, this.h) : this.h + 5, vx: rand(-10, 10), vy: -rand(30, 80) * this.sc, life: rand(2, 5), max: 5, r: rand(0.8, 2.2) * this.sc }; }
    update(dt) {
      const s = dt / 1000;
      this.T = (this.T || 0) + s;
      this.erupt *= Math.pow(0.3, s);
      if (Math.random() < s * (1.5 + this.erupt * 10)) for (let i = 0; i < 3; i++) this.bombs.push({ x: this.vx, y: this.vt, vx: rand(-60, 60) * this.sc, vy: -rand(80, 180) * this.sc * (1 + this.erupt * 0.5), life: rand(1.2, 2.2) });
      for (const b of this.bombs) { b.life -= s; b.vy += 120 * this.sc * s; b.x += b.vx * s; b.y += b.vy * s; }
      this.bombs = this.bombs.filter((b) => b.life > 0);
      for (const e of this.embers) { e.life -= s; e.x += (e.vx + Math.sin(this.T + e.y * 0.02) * 10) * s; e.y += e.vy * s; }
      this.embers = this.embers.filter((e) => e.life > 0 && e.y > -10);
      while (this.embers.length < (this.low ? 30 : 70)) this.embers.push(this.newEmber(false));
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc, T = this.T || 0;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      // 火山口光與煙柱
      g.globalCompositeOperation = 'lighter';
      glow(g, this.vx, this.vt, (60 + this.erupt * 60 + beat * 20) * sc, '255,140,40', 0.5 + this.erupt * 0.3);
      for (const b of this.bombs) { glow(g, b.x, b.y, 6 * sc, '255,180,60', 0.9); }
      g.globalCompositeOperation = 'source-over';
      // 熔岩河：貼圖往右流動，上下兩道暗色河岸
      const ry = this.riverY, rh = h * 0.07;
      const off = (T * 40 * sc) % (256 * sc);
      g.save(); g.beginPath();
      g.moveTo(0, ry); for (let x = 0; x <= w; x += 8) g.lineTo(x, ry + Math.sin(x * 0.015) * 8 * sc); g.lineTo(w, ry + rh); for (let x = w; x >= 0; x -= 8) g.lineTo(x, ry + rh + Math.sin(x * 0.02 + 1) * 6 * sc); g.closePath(); g.clip();
      for (let x = -256 * sc + off; x < w; x += 256 * sc) g.drawImage(this.flowImg.cv, x, ry - 10 * sc, 256 * sc, rh + 20 * sc);
      g.restore();
      g.globalCompositeOperation = 'lighter';
      glow(g, w * 0.5, ry + rh / 2, w * 0.7, '255,90,20', 0.25 + beat * 0.1 + this.erupt * 0.2);
      for (const e of this.embers) { const a = Math.min(1, e.life / 1.5); g.fillStyle = `rgba(255,${(150 + e.r * 30) | 0},60,${a})`; g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#0a0303'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 10) g.lineTo(x, ry + rh + 12 * sc + Math.sin(x * 0.03) * 6 * sc); g.lineTo(w, h); g.fill();
    }
    burst(d, B) {
      this.erupt = Math.min(2, this.erupt + 0.3 * d.lines + (d.lines >= 4 ? 0.6 : 0));
      const n = Math.min(this.low ? 15 : 40, d.lines * 10);
      for (let i = 0; i < n; i++) { const row = d.rows && d.rows.length ? d.rows[i % d.rows.length].vy : 18; const e = this.newEmber(false, B.x + rand(0, B.w), B.y + (row + 0.5) * B.c); e.vy *= 2; e.vx = rand(-80, 80); this.embers.push(e); }
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
  // 仙山：張家界般的石柱群（岩紋、松樹、層層雲霧）、雲海、亭台、仙鶴
  // =========================================================
  class FairyPeaks {
    constructor(low) { this.low = low; this.flash = 0; this.bloomScale = 0.5; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#cfe4ea'], [0.4, '#eef3ea'], [0.7, '#f6efe0'], [1, '#e8eee8']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.7, h * 0.15, w * 0.6, '255,245,220', 0.6);
      // 石柱：不規則邊緣、垂直岩紋、頂端松樹
      const pillar = (x, top, wd, col, edge, depth) => {
        const left = [], right = [];
        for (let y = top; y <= h; y += 6) {
          const k = (y - top) / (h - top);
          left.push([x - wd * (0.5 + 0.08 * Math.sin(y * 0.05 + x) + k * 0.15) + rand(-1, 1) * depth, y]);
          right.push([x + wd * (0.5 + 0.08 * Math.sin(y * 0.04 + x * 2) + k * 0.15) + rand(-1, 1) * depth, y]);
        }
        g.beginPath(); g.moveTo(left[0][0], top + wd * 0.1);
        g.quadraticCurveTo(x, top - wd * 0.15, right[0][0], top + wd * 0.1);
        for (const p of right) g.lineTo(p[0], p[1]);
        for (let i = left.length - 1; i >= 0; i--) g.lineTo(left[i][0], left[i][1]);
        g.closePath();
        const pg = g.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
        pg.addColorStop(0, edge); pg.addColorStop(0.35, col); pg.addColorStop(1, edge);
        g.fillStyle = pg; g.fill();
        if (depth > 0.5) {
          g.strokeStyle = 'rgba(40,50,45,0.25)'; g.lineWidth = 1;
          for (let k = 0; k < 6; k++) { const xx = x + rand(-0.4, 0.4) * wd; g.beginPath(); g.moveTo(xx, top + rand(5, 30) * sc); g.lineTo(xx + rand(-3, 3), top + rand(60, 200) * sc); g.stroke(); }
          g.strokeStyle = 'rgba(40,50,45,0.18)';
          for (let k = 0; k < 5; k++) { const yy = top + rand(10, 200) * sc; g.beginPath(); g.moveTo(x - wd * 0.45, yy); g.lineTo(x + wd * 0.4, yy + rand(-3, 3)); g.stroke(); }
        }
        // 松樹（頂端與岩縫）
        const pine = (px, py, s) => {
          g.fillStyle = depth > 0.5 ? '#24402e' : 'rgba(70,95,85,0.8)';
          g.fillRect(px - s * 0.04, py - s * 0.3, s * 0.08, s * 0.3);
          for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(px + (k - 1) * s * 0.25, py - s * (0.3 + k * 0.12), s * 0.32, s * 0.11, (k - 1) * 0.2, 0, TAU); g.fill(); }
        };
        for (let k = 0; k < 3; k++) pine(x + rand(-0.35, 0.35) * wd, top + 2, rand(14, 22) * sc * (0.6 + depth * 0.5));
        if (depth > 0.5) pine(x - wd * 0.55, top + rand(40, 90) * sc, 14 * sc);
      };
      const mist = (y, a) => {
        const mg = g.createLinearGradient(0, y - h * 0.05, 0, y + h * 0.05);
        mg.addColorStop(0, 'rgba(250,250,245,0)'); mg.addColorStop(0.5, `rgba(250,250,245,${a})`); mg.addColorStop(1, 'rgba(250,250,245,0)');
        g.fillStyle = mg; g.fillRect(0, y - h * 0.05, w, h * 0.1);
      };
      // 遠層（淡藍灰）→ 中層 → 近層（深綠灰）
      for (let i = 0; i < 9; i++) pillar(rand(0, w), h * rand(0.45, 0.6), rand(20, 34) * sc, '#b6c6c8', '#9aaeb2', 0.2);
      mist(h * 0.66, 0.85);
      for (let i = 0; i < 6; i++) pillar(rand(-0.05, 1.05) * w, h * rand(0.55, 0.68), rand(30, 46) * sc, '#8a9c96', '#6a7e78', 0.5);
      mist(h * 0.78, 0.8);
      pillar(w * 0.06, h * 0.6, 58 * sc, '#5e6e64', '#3a4a42', 1);
      pillar(w * 0.94, h * 0.64, 54 * sc, '#5e6e64', '#3a4a42', 1);
      // 亭台（右側石柱頂）
      const tx = w * 0.94, ty = h * 0.64 - 4 * sc;
      g.fillStyle = '#7a2a22'; g.fillRect(tx - 10 * sc, ty - 14 * sc, 3 * sc, 14 * sc); g.fillRect(tx + 7 * sc, ty - 14 * sc, 3 * sc, 14 * sc);
      g.fillStyle = '#2a2a30';
      g.beginPath(); g.moveTo(tx - 20 * sc, ty - 12 * sc); g.quadraticCurveTo(tx - 8 * sc, ty - 15 * sc, tx, ty - 28 * sc); g.quadraticCurveTo(tx + 8 * sc, ty - 15 * sc, tx + 20 * sc, ty - 12 * sc); g.fill();
      // 雲海
      for (let i = 0; i < 7; i++) puffCloud(g, w * (i / 6), h * rand(0.9, 0.97), w * 0.42, 34 * sc, 'rgba(255,255,252,1)', 'rgba(225,232,232,1)', null, 10);
      this.clouds = [];
      for (let i = 0; i < 4; i++) {
        const C = layer(220, 90);
        puffCloud(C.g, 110, 62, 190, 26, 'rgba(255,255,255,0.95)', 'rgba(228,234,236,0.9)', null, 9);
        this.clouds.push({ img: C, x: rand(0, w), y: h * rand(0.62, 0.85), s: rand(0.7, 1.1) * sc, v: rand(4, 9) * sc });
      }
      this.cranes = [];
      for (let i = 0; i < 3; i++) this.cranes.push({ x: rand(0, w), y: h * rand(0.02, 0.08), v: rand(14, 22) * sc, ph: rand(0, TAU) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      for (const c of this.clouds) { c.x += c.v * s * (1 + this.flash); if (c.x > this.w + 120 * c.s) c.x = -120 * c.s; }
      for (const c of this.cranes) { c.x += c.v * s; c.ph += s * 4; if (c.x > this.w + 40) { c.x = -40; c.y = this.h * rand(0.02, 0.08); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      for (const c of this.clouds) { g.globalAlpha = 0.9; g.drawImage(c.img.cv, c.x - 110 * c.s, c.y - 45 * c.s, 220 * c.s, 90 * c.s); }
      g.globalAlpha = 1;
      // 仙鶴
      for (const c of this.cranes) {
        const f = Math.sin(c.ph) * 8 * sc;
        g.save(); g.translate(c.x, c.y);
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.2 * sc;
        g.beginPath(); g.moveTo(-14 * sc, 2 * sc); g.lineTo(12 * sc, 0); g.stroke();
        g.fillStyle = '#fafafa';
        g.beginPath(); g.moveTo(-4 * sc, 0); g.quadraticCurveTo(-2 * sc, -f - 6 * sc, -16 * sc, -f); g.quadraticCurveTo(-8 * sc, -1 * sc, 4 * sc, 1 * sc); g.fill();
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(-16 * sc, -f); g.lineTo(-12 * sc, -f * 0.9); g.lineTo(-13 * sc, -f + 2 * sc); g.fill();
        g.fillStyle = '#d02020'; g.beginPath(); g.arc(12 * sc, -0.5 * sc, 1.3 * sc, 0, TAU); g.fill();
        g.restore();
      }
    }
    burst(d) { this.flash = Math.min(2, this.flash + 0.4 * d.lines); }
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
  // 海上風暴：翻滾雷雲、分岔閃電、斜雨、層層巨浪與浪花、懸崖燈塔旋轉光束、顛簸的帆船
  // =========================================================
  class Storm {
    constructor(low) { this.low = low; this.flash = 0; this.bolts = []; this.boltTimer = 3; this.intensity = 0; this.spray = []; }
    setIntensity(v) { this.intensity = v; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0a0f1c'], [0.4, '#1c2638'], [0.66, '#2e3c50'], [0.7, '#1a2636'], [1, '#060a12']]);
      g.fillRect(0, 0, w, h);
      // 雷雲（預先畫好兩層，繪製時緩慢平移）
      this.cloudL = [];
      for (let k = 0; k < 2; k++) {
        const C = layer(w * 1.5, h * 0.3);
        for (let i = 0; i < 9; i++) puffCloud(C.g, rand(0, w * 1.5), rand(0.25, 0.85) * h * 0.3, rand(140, 240) * sc, rand(26, 44) * sc, k ? 'rgba(80,92,112,1)' : 'rgba(60,70,90,1)', k ? 'rgba(30,36,50,1)' : 'rgba(22,26,38,1)', 'rgba(170,190,230,0.15)', 11);
        this.cloudL.push({ img: C, x: 0, v: (k ? 9 : 5) * sc, y: k ? h * 0.0 : -h * 0.05 });
      }
      // 右側懸崖與燈塔
      const cx = (this.lx = w * 0.86), base = h * 0.8;
      g.fillStyle = '#0a0e14';
      g.beginPath(); g.moveTo(w * 0.62, h); g.lineTo(w * 0.7, base + 10 * sc); g.lineTo(w * 0.78, base - 20 * sc); g.lineTo(w * 0.95, base - 26 * sc); g.lineTo(w + 5, base - 10 * sc); g.lineTo(w + 5, h); g.fill();
      const tb = base - 24 * sc, th = 70 * sc;
      this.ly = tb - th + 4 * sc;
      const lg = g.createLinearGradient(cx - 9 * sc, 0, cx + 9 * sc, 0);
      lg.addColorStop(0, '#9aa4b0'); lg.addColorStop(0.4, '#e8ecf0'); lg.addColorStop(1, '#6a7480');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(cx - 10 * sc, tb); g.lineTo(cx - 6 * sc, tb - th); g.lineTo(cx + 6 * sc, tb - th); g.lineTo(cx + 10 * sc, tb); g.fill();
      g.fillStyle = '#b02a2a';
      for (let k = 0; k < 3; k++) { const y = tb - th * (0.2 + k * 0.28); g.fillRect(cx - 9 * sc + k * 1.2 * sc, y, 18 * sc - k * 2.4 * sc, 7 * sc); }
      g.fillStyle = '#1a1e24'; g.fillRect(cx - 9 * sc, tb - th - 4 * sc, 18 * sc, 4 * sc);
      g.fillStyle = '#fff4c0'; g.fillRect(cx - 5 * sc, tb - th - 14 * sc, 10 * sc, 10 * sc);
      g.fillStyle = '#1a1e24'; g.beginPath(); g.moveTo(cx - 8 * sc, tb - th - 14 * sc); g.lineTo(cx, tb - th - 22 * sc); g.lineTo(cx + 8 * sc, tb - th - 14 * sc); g.fill();
      this.ly = tb - th - 9 * sc;
      this.beamImg = layer(400, 60);
      const bg = this.beamImg.g.createLinearGradient(0, 0, 400, 0);
      bg.addColorStop(0, 'rgba(255,245,200,0.8)'); bg.addColorStop(1, 'rgba(255,245,200,0)');
      this.beamImg.g.fillStyle = bg; this.beamImg.g.beginPath(); this.beamImg.g.moveTo(0, 26); this.beamImg.g.lineTo(400, 0); this.beamImg.g.lineTo(400, 60); this.beamImg.g.lineTo(0, 34); this.beamImg.g.fill();
      this.rain = [];
      for (let i = 0; i < (this.low ? 70 : 160); i++) this.rain.push({ x: rand(0, w), y: rand(0, h), v: rand(600, 900) * sc, l: rand(10, 22) * sc });
      this.waves = [
        { y: 0.7, amp: 10, len: 140, sp: 0.6, col: ['#4a6a86', '#1c2c40'], foam: 0.45 },
        { y: 0.77, amp: 16, len: 180, sp: 0.9, col: ['#3e6280', '#14243a'], foam: 0.6 },
        { y: 0.86, amp: 24, len: 220, sp: 1.2, col: ['#2e5474', '#0c1a2c'], foam: 0.75 },
        { y: 0.95, amp: 30, len: 260, sp: 1.6, col: ['#22466a', '#071220'], foam: 0.85 },
      ];
      this.ship = { x: w * 0.25 };
    }
    waveY(wv, x, t) {
      const sc = this.sc, k = 1 + Math.min(5, this.intensity) * 0.12 + this.flash * 0.2;
      return this.h * wv.y - wv.amp * sc * k * (Math.sin(x / (wv.len * sc) * TAU + t * wv.sp) * 0.7 + Math.sin(x / (wv.len * sc * 0.43) * TAU - t * wv.sp * 1.3) * 0.3);
    }
    bolt() {
      const w = this.w, h = this.h;
      const pts = [[rand(0.05, 0.95) * w, 0]];
      let x = pts[0][0], y = 0;
      const end = h * rand(0.45, 0.7);
      const branches = [];
      while (y < end) { x += rand(-25, 25) * this.sc; y += rand(15, 30) * this.sc; pts.push([x, y]); if (Math.random() < 0.18) branches.push([[x, y], [x + rand(-60, 60) * this.sc, y + rand(30, 70) * this.sc]]); }
      this.bolts.push({ pts, branches, life: 0.4 });
      this.flash = Math.max(this.flash, 1);
    }
    update(dt) {
      const s = dt / 1000;
      this.T = (this.T || 0) + s;
      this.flash *= Math.pow(0.02, s);
      for (const b of this.bolts) b.life -= s;
      this.bolts = this.bolts.filter((b) => b.life > 0);
      this.boltTimer -= s * (1 + this.intensity * 0.3);
      if (this.boltTimer <= 0) { this.boltTimer = rand(3, 7); this.bolt(); }
      for (const c of this.cloudL) { c.x -= c.v * s; if (c.x < -this.w * 0.5) c.x += this.w * 0.5; }
      for (const r of this.rain) { r.y += r.v * s; r.x -= r.v * 0.35 * s; if (r.y > this.h) { r.y = -r.l; r.x = rand(0, this.w * 1.3); } }
      for (const p of this.spray) { p.life -= s; p.vy += 300 * this.sc * s; p.x += p.vx * s; p.y += p.vy * s; }
      this.spray = this.spray.filter((p) => p.life > 0);
      // 浪頭濺起水花
      if (Math.random() < s * 8) { const x = rand(0, this.w), wv = this.waves[2 + ((Math.random() * 2) | 0)]; const y = this.waveY(wv, x, this.T); for (let i = 0; i < 6; i++) this.spray.push({ x, y, vx: rand(-60, 60) * this.sc, vy: -rand(80, 180) * this.sc, life: rand(0.5, 0.9), r: rand(1, 2.5) * this.sc }); }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc, T = this.T || 0;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      for (const c of this.cloudL) { g.drawImage(c.img.cv, c.x, c.y, w * 1.5, h * 0.3); }
      if (this.flash > 0.02) { g.fillStyle = `rgba(200,215,255,${this.flash * 0.35})`; g.fillRect(0, 0, w, h); }
      g.lineCap = 'round';
      for (const b of this.bolts) {
        const a = b.life / 0.4;
        g.strokeStyle = `rgba(230,240,255,${a})`; g.lineWidth = 2.5 * sc; g.shadowColor = 'rgba(160,190,255,1)'; g.shadowBlur = 14 * sc;
        g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.lineWidth = 1.2 * sc;
        for (const [p0, p1] of b.branches) { g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
        g.shadowBlur = 0;
      }
      // 燈塔光束（旋轉；朝向畫面時最亮）
      const ang = T * 1.1;
      const toward = Math.cos(ang);
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(this.lx, this.ly); g.scale(toward >= 0 ? -1 : 1, 1);
      g.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(ang));
      g.drawImage(this.beamImg.cv, 0, -30 * sc * (0.4 + Math.abs(toward)), w * 0.9, 60 * sc * (0.4 + Math.abs(toward)));
      g.restore(); g.globalAlpha = 1;
      glow(g, this.lx, this.ly, 30 * sc, '255,240,190', 0.8);
      g.globalCompositeOperation = 'source-over';
      // 浪：由遠到近，最後一層之前畫船
      this.waves.forEach((wv, idx) => {
        const top = h * wv.y - wv.amp * sc * 1.5;
        const wg = g.createLinearGradient(0, top, 0, top + h * 0.12);
        wg.addColorStop(0, wv.col[0]); wg.addColorStop(1, wv.col[1]);
        g.fillStyle = wg;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) g.lineTo(x, this.waveY(wv, x, T));
        g.lineTo(w, h); g.closePath(); g.fill();
        // 浪頭白沫：只在浪峰附近
        g.strokeStyle = `rgba(225,240,250,${wv.foam})`; g.lineWidth = (2 + idx * 1.5) * sc;
        g.beginPath();
        let on = false;
        for (let x = 0; x <= w + 8; x += 6) {
          const y = this.waveY(wv, x, T), y2 = this.waveY(wv, x + 6, T);
          const crest = y < this.h * wv.y - wv.amp * sc * 0.25;
          if (crest) { on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; } else on = false;
          void y2;
        }
        g.stroke();
        if (idx === 1) {
          // 帆船：隨浪起伏、傾斜
          const sx = this.ship.x, sy = this.waveY(wv, sx, T), tilt = Math.atan2(this.waveY(wv, sx + 10, T) - this.waveY(wv, sx - 10, T), 20);
          g.save(); g.translate(sx, sy - 2 * sc); g.rotate(tilt); g.scale(sc, sc);
          g.fillStyle = '#1a0e0a'; g.beginPath(); g.moveTo(-22, 0); g.lineTo(22, 0); g.lineTo(16, 8); g.lineTo(-16, 8); g.fill();
          g.fillRect(-1, -40, 2, 40);
          g.fillStyle = 'rgba(220,210,190,0.9)'; g.beginPath(); g.moveTo(1, -38); g.quadraticCurveTo(18, -20, 1, -4); g.fill();
          g.beginPath(); g.moveTo(-1, -34); g.quadraticCurveTo(-14, -18, -1, -6); g.fill();
          g.fillStyle = '#ffd27a'; g.fillRect(-8, 2, 3, 3);
          g.restore();
        }
      });
      g.fillStyle = 'rgba(230,240,250,0.8)';
      for (const p of this.spray) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(180,200,230,0.35)'; g.lineWidth = 1;
      g.beginPath();
      for (const r of this.rain) { g.moveTo(r.x, r.y); g.lineTo(r.x + r.l * 0.35, r.y - r.l); }
      g.stroke();
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.3 * d.lines); if (d.lines >= 3) this.bolt(); }
  }

  // =========================================================
  // 飛龍：祥雲、金龍追逐火焰寶珠（龍身沿軌跡蜿蜒、背鰭、龍角、龍鬚）
  // =========================================================
  class Dragon {
    constructor(low) { this.low = low; this.flash = 0; this.t = 0; this.speed = 1; this.bloomScale = 0.6; }
    resize(w, h) {
      this.w = w; this.h = h;
      const sc = (this.sc = Math.min(w, h) / 412);
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#070a22'], [0.4, '#141d4a'], [0.7, '#43285a'], [0.88, '#8a3d4e'], [1, '#d0703e']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.5, h * 1.02, w * 0.95, '255,160,80', 0.4);
      for (let i = 0; i < 150; i++) { g.fillStyle = `rgba(255,240,220,${rand(0.1, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.55), 1, 1); }
      // 祥雲：實心雲朵 + 金色捲雲邊
      this.cloudImg = layer(160, 80);
      const cg = this.cloudImg.g;
      cg.save(); cg.translate(80, 46);
      const cfill = cg.createLinearGradient(0, -30, 0, 16);
      cfill.addColorStop(0, 'rgba(255,236,205,0.95)'); cfill.addColorStop(1, 'rgba(230,170,150,0.9)');
      cg.fillStyle = cfill;
      cg.beginPath(); cg.moveTo(-70, 14);
      cg.bezierCurveTo(-74, -6, -48, -12, -38, -4); cg.bezierCurveTo(-34, -30, 0, -34, 6, -12);
      cg.bezierCurveTo(18, -36, 58, -26, 50, -2); cg.bezierCurveTo(72, -4, 76, 14, 66, 14); cg.closePath(); cg.fill();
      cg.strokeStyle = 'rgba(214,150,60,0.9)'; cg.lineWidth = 2;
      for (const [cx, cy, r] of [[-40, 2, 9], [4, -8, 12], [44, 2, 8]]) {
        cg.beginPath();
        for (let q = 0; q < 46; q++) { const a = q / 46 * TAU * 1.7 + Math.PI; const rr = r * (1 - q / 56); cg.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        cg.stroke();
      }
      cg.restore();
      this.clouds = [];
      for (let i = 0; i < 8; i++) this.clouds.push({ x: rand(0, w), y: rand(0.05, 0.98) * h, s: rand(0.55, 1.1) * sc, a: rand(0.35, 0.65), v: rand(5, 12) * sc, front: i < 3 });
      this.pearl = softDot('255,120,40');
      this.segN = this.low ? 40 : 54;
      this.spacing = 11 * sc;
      this.maxW = 21 * sc;
    }
    // 繞著場地外圍飛：大橢圓 + 上下起伏，龍大部分時間在場地四周
    headPos(t) {
      const w = this.w, h = this.h;
      const a = t * 0.32;
      return [w * 0.5 + Math.cos(a) * w * 0.44 + Math.sin(a * 3.1) * w * 0.04, h * 0.72 + Math.sin(a) * h * 0.22 + Math.sin(a * 2.3 + 1) * h * 0.03];
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.2, s);
      this.speed = 1 + this.flash * 1.2;
      this.t += s * this.speed;
      for (const c of this.clouds) { c.x += c.v * s; if (c.x > this.w + 90 * c.s) c.x = -90 * c.s; }
    }
    spine() {
      const segs = [this.headPos(this.t)];
      let tt = this.t;
      for (let i = 1; i < this.segN; i++) {
        const [px, py] = segs[i - 1];
        let p = null;
        for (let k = 0; k < 300; k++) {
          tt -= 0.002;
          const q = this.headPos(tt);
          if (Math.hypot(q[0] - px, q[1] - py) >= this.spacing) { p = q; break; }
        }
        segs.push(p || this.headPos(tt));
      }
      // 在路徑上加一點蛇行擺動
      const out = [];
      for (let i = 0; i < segs.length; i++) {
        const a = segs[Math.max(0, i - 1)], b = segs[Math.min(segs.length - 1, i + 1)];
        const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1;
        const wig = Math.sin(i * 0.33 - this.t * 3.2) * this.maxW * 0.55 * Math.min(1, i / 6);
        out.push([segs[i][0] + (dy / l) * wig, segs[i][1] - (dx / l) * wig]);
      }
      return out;
    }
    width(i) {
      const n = this.segN, u = i / (n - 1);
      if (i < 3) return this.maxW * (0.78 + i * 0.07);
      return this.maxW * Math.max(0.12, Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5 + 0.35) * (1 - u * 0.8));
    }
    frames(segs) {
      // 每節的前進方向 d 與背部法向 n（背在行進方向的左側）
      return segs.map((p, i) => {
        const a = segs[Math.max(0, i - 1)], b = segs[Math.min(segs.length - 1, i + 1)];
        let dx = a[0] - b[0], dy = a[1] - b[1];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        // sg：背部朝上為 1、朝下翻轉為 -1；垂直飛行時接近 0（身體側翻，鰭和腹甲在中間交換邊）
        const sg = Math.max(-1, Math.min(1, dx * 2.5));
        return { x: p[0], y: p[1], dx, dy, nx: dy, ny: -dx, r: this.width(i), sg };
      });
    }
    leg(g, f, side, t, ph, near) {
      const sc = this.sc;
      const up = f.sg >= 0 ? 1 : -1;
      const bx = f.x - f.nx * f.r * 0.3 * up, by = f.y - f.ny * f.r * 0.3 * up;
      const sw = Math.sin(t / 260 + ph) * 0.4;
      // 上臂往腹側伸出、前臂向前、三爪張開；近側與遠側前後錯開
      const a1 = Math.atan2(-f.ny * up, -f.nx * up) + (side > 0 ? -0.5 : 0.3) * up + sw;
      const l1 = f.r * 1.5, l2 = f.r * 1.3;
      const kx = bx + Math.cos(a1) * l1, ky = by + Math.sin(a1) * l1;
      const fwd = Math.atan2(f.dy, f.dx);
      const a2 = fwd * 0.6 + a1 * 0.4 + 0.3 * up;
      const px = kx + Math.cos(a2) * l2, py = ky + Math.sin(a2) * l2;
      g.lineCap = 'round';
      g.strokeStyle = near ? '#b9781c' : '#7a4c16'; g.lineWidth = f.r * 0.75;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(kx, ky); g.lineTo(px, py); g.stroke();
      g.strokeStyle = near ? '#f2c25a' : '#a06a22'; g.lineWidth = f.r * 0.3;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(kx, ky); g.stroke();
      // 肘部火焰毛
      g.fillStyle = near ? '#e2492c' : '#8a2a1e';
      g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx - f.dx * f.r * 1.2 + f.nx * 4 * sc, ky - f.dy * f.r * 1.2 + f.ny * 4 * sc, kx - f.dx * f.r * 1.6, ky - f.dy * f.r * 1.6); g.lineTo(kx + f.nx * 2 * sc, ky + f.ny * 2 * sc); g.fill();
      g.strokeStyle = near ? '#fff4d0' : '#c9a870'; g.lineWidth = Math.max(1, f.r * 0.14);
      for (const c of [-0.6, 0, 0.6]) {
        const ca = a2 + c;
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + Math.cos(ca) * f.r * 0.6, py + Math.sin(ca) * f.r * 0.6, px + Math.cos(ca + 0.7 * up) * f.r * 0.85, py + Math.sin(ca + 0.7 * up) * f.r * 0.85);
        g.stroke();
      }
    }
    drawHead(g, f, t) {
      const k = this.maxW / 13;
      g.save(); g.translate(f.x, f.y);
      g.rotate(Math.atan2(f.dy, f.dx));
      if (f.sg < 0) g.scale(1, -1); // 往左飛時翻面，頭頂永遠朝上
      const jaw = 0.5 + 0.5 * Math.sin(t / 420);
      // 鬃毛（火焰狀）
      for (let q = 0; q < 7; q++) {
        const ang = -2.2 + q * 0.62, len = (18 + (q % 2) * 8) * k;
        const wv = Math.sin(t / 180 + q) * 3 * k;
        g.fillStyle = q % 2 ? '#ff7a2a' : '#d6301e';
        g.beginPath(); g.moveTo(-6 * k, 0);
        g.quadraticCurveTo(-6 * k + Math.cos(ang) * len * 0.6 + wv, Math.sin(ang) * len * 0.6 - 4 * k, -6 * k + Math.cos(ang - 0.25) * len - 10 * k, Math.sin(ang) * len * 0.8 + wv);
        g.quadraticCurveTo(-6 * k + Math.cos(ang) * len * 0.4, Math.sin(ang) * len * 0.3 + 4 * k, -6 * k, 0);
        g.fill();
      }
      // 龍角（鹿角狀，往後分叉）
      g.strokeStyle = '#f3e3b0'; g.lineCap = 'round';
      for (const [y0, sc2] of [[-11, 1], [-9, 0.8]]) {
        g.lineWidth = 2.6 * k * sc2;
        g.beginPath(); g.moveTo(2 * k, y0 * k); g.bezierCurveTo(-6 * k, (y0 - 8) * k, -16 * k, (y0 - 10) * k, -28 * k * sc2, (y0 - 16) * k * sc2); g.stroke();
        g.lineWidth = 1.8 * k * sc2;
        g.beginPath(); g.moveTo(-10 * k, (y0 - 7) * k); g.quadraticCurveTo(-12 * k, (y0 - 14) * k, -8 * k, (y0 - 19) * k); g.stroke();
      }
      // 下顎（張合）
      g.save(); g.translate(14 * k, 3 * k); g.rotate(jaw * 0.28);
      const lj = g.createLinearGradient(0, 0, 0, 10 * k);
      lj.addColorStop(0, '#f6d27a'); lj.addColorStop(1, '#b0701a');
      g.fillStyle = lj;
      g.beginPath(); g.moveTo(-18 * k, -2 * k); g.lineTo(20 * k, 0); g.quadraticCurveTo(22 * k, 3 * k, 18 * k, 5 * k); g.quadraticCurveTo(0, 9 * k, -18 * k, 7 * k); g.fill();
      g.fillStyle = '#fff8e8';
      for (let q = 0; q < 5; q++) { const x = 2 * k + q * 3.6 * k; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 1.4 * k, -2.6 * k); g.lineTo(x + 2.8 * k, 0); g.fill(); }
      // 鬍鬚（下巴）
      g.strokeStyle = '#e8562a'; g.lineWidth = 1.6 * k;
      for (let q = 0; q < 4; q++) { g.beginPath(); g.moveTo(-4 * k + q * 4 * k, 7 * k); g.quadraticCurveTo(-8 * k + q * 3 * k, 14 * k, -14 * k + q * 2 * k + Math.sin(t / 200 + q) * 2 * k, 18 * k); g.stroke(); }
      g.restore();
      // 口腔
      g.fillStyle = '#5a0c12';
      g.beginPath(); g.moveTo(-2 * k, 2 * k); g.lineTo(36 * k, 1 * k); g.lineTo(34 * k, 3 * k + jaw * 10 * k); g.lineTo(-2 * k, 6 * k); g.fill();
      // 上顎與頭骨
      const hg = g.createLinearGradient(0, -16 * k, 0, 4 * k);
      hg.addColorStop(0, '#fff2b8'); hg.addColorStop(0.45, '#f0b63a'); hg.addColorStop(1, '#a8661a');
      g.fillStyle = hg;
      g.beginPath();
      g.moveTo(-10 * k, 8 * k);
      g.bezierCurveTo(-12 * k, -6 * k, -4 * k, -14 * k, 6 * k, -15 * k); // 後腦到眉骨
      g.quadraticCurveTo(12 * k, -16 * k, 16 * k, -11 * k);
      g.bezierCurveTo(22 * k, -10 * k, 30 * k, -9 * k, 36 * k, -8 * k); // 吻部
      g.quadraticCurveTo(43 * k, -8 * k, 42 * k, -2 * k); // 鼻頭
      g.quadraticCurveTo(41 * k, 2 * k, 36 * k, 1.5 * k);
      g.lineTo(-2 * k, 2.5 * k);
      g.quadraticCurveTo(-6 * k, 6 * k, -10 * k, 8 * k);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(110,55,10,0.7)'; g.lineWidth = 1 * k; g.stroke();
      // 上排牙與獠牙
      g.fillStyle = '#fffaf0';
      for (let q = 0; q < 6; q++) { const x = 12 * k + q * 3.8 * k; g.beginPath(); g.moveTo(x, 1.8 * k); g.lineTo(x + 1.4 * k, 4.4 * k); g.lineTo(x + 2.8 * k, 1.6 * k); g.fill(); }
      g.beginPath(); g.moveTo(31 * k, 1.5 * k); g.lineTo(32.5 * k, 7.5 * k); g.lineTo(34 * k, 1.3 * k); g.fill();
      // 鼻翼捲紋、鼻孔
      g.strokeStyle = '#c0661a'; g.lineWidth = 1.2 * k;
      g.beginPath(); g.arc(38 * k, -4 * k, 2.6 * k, Math.PI * 0.2, Math.PI * 1.6); g.stroke();
      g.fillStyle = '#5a2a08'; g.beginPath(); g.ellipse(39.5 * k, -3.5 * k, 1.2 * k, 0.8 * k, 0.3, 0, TAU); g.fill();
      // 眉骨（紅色火焰眉）與眼睛
      g.fillStyle = '#e0402a';
      g.beginPath(); g.moveTo(6 * k, -13 * k); g.quadraticCurveTo(14 * k, -19 * k, 20 * k, -12 * k); g.quadraticCurveTo(12 * k, -15 * k, 4 * k, -10 * k); g.fill();
      g.fillStyle = '#fff6d0'; g.beginPath(); g.ellipse(13 * k, -9 * k, 3.6 * k, 2.4 * k, -0.15, 0, TAU); g.fill();
      g.fillStyle = '#ff3a1a'; g.beginPath(); g.arc(13.8 * k, -9 * k, 1.8 * k, 0, TAU); g.fill();
      g.fillStyle = '#100'; g.beginPath(); g.ellipse(14 * k, -9 * k, 0.6 * k, 1.5 * k, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
      glow(g, 13.5 * k, -9 * k, 8 * k, '255,120,60', 0.45 + this.flash * 0.3);
      g.globalCompositeOperation = 'source-over';
      // 長鬚：從鼻側飄向後方
      g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 1.3 * k;
      for (const [y0, amp] of [[-2, 1], [0, -1]]) {
        g.beginPath(); g.moveTo(36 * k, y0 * k);
        for (let q = 1; q <= 14; q++) g.lineTo(36 * k - q * 5.5 * k, y0 * k + amp * q * 1.2 * k + Math.sin(t / 260 + q * 0.6) * 3.5 * k);
        g.stroke();
      }
      g.restore();
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      const drawCloud = (c) => { g.globalAlpha = c.a; g.drawImage(this.cloudImg.cv, c.x - 80 * c.s, c.y - 40 * c.s, 160 * c.s, 80 * c.s); };
      for (const c of this.clouds) if (!c.front) drawCloud(c);
      g.globalAlpha = 1;
      const segs = this.spine();
      const F = this.frames(segs);
      const n = F.length;
      // 火焰寶珠在龍頭前方
      const ph = this.headPos(this.t + 0.45);
      g.globalCompositeOperation = 'lighter';
      const pr = (13 + beat * 5 + this.flash * 8) * sc;
      g.drawImage(this.pearl.cv, ph[0] - pr * 2.6, ph[1] - pr * 2.6, pr * 5.2, pr * 5.2);
      glow(g, ph[0], ph[1], pr * 1.1, '255,250,220', 0.9);
      g.strokeStyle = 'rgba(255,170,80,0.6)'; g.lineWidth = 1.5 * sc;
      for (let q = 0; q < 3; q++) { g.beginPath(); g.arc(ph[0], ph[1], pr * (1.3 + q * 0.35), t / 300 + q * 2, t / 300 + q * 2 + 1.6); g.stroke(); }
      glow(g, F[0].x, F[0].y, this.maxW * 6, '255,190,90', 0.12 + this.flash * 0.2);
      g.globalCompositeOperation = 'source-over';
      // 遠側的腳（先畫，被身體擋住）
      for (const [i, ph2] of [[7, 0], [25, 2]]) if (F[i]) this.leg(g, F[i], -1, t, ph2 + 1.5, false);
      // 背鰭
      for (let i = 3; i < n - 4; i += 2) {
        const f = F[i], fl = f.r * 1.25 * Math.abs(f.sg);
        if (fl < 1) continue;
        const nx = f.nx * Math.sign(f.sg), ny = f.ny * Math.sign(f.sg);
        const bxp = f.x + nx * f.r * 0.8, byp = f.y + ny * f.r * 0.8;
        const tx = bxp + nx * fl - f.dx * fl * 0.9, ty = byp + ny * fl - f.dy * fl * 0.9;
        g.fillStyle = i % 4 === 1 ? '#ff7a2a' : '#d42c1c';
        g.beginPath(); g.moveTo(bxp + f.dx * f.r * 0.5, byp + f.dy * f.r * 0.5);
        g.quadraticCurveTo(bxp + nx * fl * 0.6, byp + ny * fl * 0.6, tx, ty);
        g.lineTo(bxp - f.dx * f.r * 0.7, byp - f.dy * f.r * 0.7); g.fill();
      }
      // 尾端火焰
      const tl = F[n - 1], tl2 = F[n - 4];
      for (let q = 0; q < 3; q++) {
        const ang = Math.atan2(-tl2.dy, -tl2.dx) + (q - 1) * 0.5 + Math.sin(t / 200 + q) * 0.15;
        const len = this.maxW * (2.2 - Math.abs(q - 1) * 0.6);
        g.fillStyle = q === 1 ? '#ff8a32' : '#d42c1c';
        g.beginPath(); g.moveTo(tl.x, tl.y);
        g.quadraticCurveTo(tl.x + Math.cos(ang + 0.4) * len * 0.6, tl.y + Math.sin(ang + 0.4) * len * 0.6, tl.x + Math.cos(ang) * len, tl.y + Math.sin(ang) * len);
        g.quadraticCurveTo(tl.x + Math.cos(ang - 0.4) * len * 0.5, tl.y + Math.sin(ang - 0.4) * len * 0.5, tl.x, tl.y); g.fill();
      }
      // 身體：一整條連續的管狀輪廓
      const back = F.map((f) => [f.x + f.nx * f.r, f.y + f.ny * f.r]);
      const belly = F.map((f) => [f.x - f.nx * f.r, f.y - f.ny * f.r]);
      g.beginPath();
      back.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = n - 1; i >= 0; i--) g.lineTo(belly[i][0], belly[i][1]);
      g.closePath();
      g.fillStyle = '#a8621a'; g.fill();
      g.strokeStyle = '#5e3208'; g.lineWidth = 1.4 * sc; g.stroke();
      // 背部較暗、中段金亮的光影
      g.save(); g.clip();
      g.lineCap = 'round'; g.lineJoin = 'round';
      const band = (off, wd, col) => {
        g.strokeStyle = col; g.lineWidth = wd;
        g.beginPath(); F.forEach((f, i) => { const x = f.x + f.nx * f.r * off * f.sg, y = f.y + f.ny * f.r * off * f.sg; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      };
      band(0.85, this.maxW * 0.5, 'rgba(120,60,10,0.55)');
      band(0.3, this.maxW * 0.5, 'rgba(240,180,70,0.6)');
      band(0.4, this.maxW * 0.14, 'rgba(255,235,170,0.55)');
      // 鱗片
      g.strokeStyle = 'rgba(110,55,8,0.55)'; g.lineWidth = Math.max(0.8, 0.9 * sc);
      for (let i = 2; i < n - 2; i += 2) {
        const f = F[i];
        if (f.r < 3 * sc) continue;
        const a = Math.atan2(f.dy, f.dx);
        for (const off of (i % 2 ? [0.55, -0.05] : [0.25, 0.85])) {
          const x = f.x + f.nx * f.r * off * f.sg, y = f.y + f.ny * f.r * off * f.sg;
          g.beginPath(); g.arc(x, y, f.r * 0.32, a + Math.PI * 0.55, a + Math.PI * 1.45); g.stroke();
        }
      }
      g.restore();
      // 腹甲：奶油色帶 + 橫紋
      g.beginPath();
      F.forEach((f, i) => { const x = f.x - f.nx * f.r * 0.35 * f.sg, y = f.y - f.ny * f.r * 0.35 * f.sg; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (let i = n - 1; i >= 0; i--) { const f = F[i]; g.lineTo(f.x - f.nx * f.r * 0.98 * f.sg, f.y - f.ny * f.r * 0.98 * f.sg); }
      g.closePath();
      g.fillStyle = '#e8c88a'; g.fill();
      g.strokeStyle = 'rgba(140,90,40,0.55)'; g.lineWidth = Math.max(0.8, 0.9 * sc);
      for (let i = 1; i < n - 2; i += 2) {
        const f = F[i];
        if (f.r < 2 * sc) continue;
        if (Math.abs(f.sg) < 0.2) continue;
        g.beginPath(); g.moveTo(f.x - f.nx * f.r * 0.35 * f.sg, f.y - f.ny * f.r * 0.35 * f.sg); g.lineTo(f.x - f.nx * f.r * 0.98 * f.sg, f.y - f.ny * f.r * 0.98 * f.sg); g.stroke();
      }
      // 近側的腳
      for (const [i, ph2] of [[5, 0], [23, 2]]) if (F[i]) this.leg(g, F[i], 1, t, ph2, true);
      this.drawHead(g, F[0], t);
      // 前景雲：龍在雲間穿梭
      for (const c of this.clouds) if (c.front) drawCloud(c);
      g.globalAlpha = 1;
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

  // =========================================================
  // 主場應援：棒球場看台、紅衣球迷、啦啦隊與吉祥物；隨著歌曲段落從白天 → 黃昏 → 夜晚
  // =========================================================
  // 味全龍風格吉祥物（正面 Q 版）：紅頭、白臉大鼻吻、藍色大眼、紅帽 W、金色鹿角與鬃毛、白色細條紋球衣
  // 原點 = 腳底中央，高度約 170 單位；s = 縮放，t = 時間，cheer = 舉手幅度 0..1
  function stadiumMascot(g, x, foot, s, t, cheer) {
    t = t || 0; cheer = cheer == null ? 1 : cheer;
    const RED = '#d8192a', RED_D = '#9a0f1c', RED_L = '#ff4a4a', INK = '#3a0a10', GOLD = '#ffc81e', GOLD_D = '#d08a10', WHITE = '#fffaf2', BLUE = '#2f8fe8';
    const line = (w) => { g.strokeStyle = INK; g.lineWidth = w || 2.4; g.lineJoin = 'round'; g.lineCap = 'round'; };
    const rg = (x0, y0, r, c0, c1) => { const q = g.createRadialGradient(x0 - r * 0.35, y0 - r * 0.4, r * 0.1, x0, y0, r); q.addColorStop(0, c0); q.addColorStop(1, c1); return q; };
    const bob = Math.abs(Math.sin(t * 4)) * 2.5;
    g.save(); g.translate(x, foot); g.scale(s, s); g.translate(0, -bob);

    // ---- 尾巴（身後右側）
    g.save(); line(2.4); g.fillStyle = RED;
    g.beginPath(); g.moveTo(14, -52); g.bezierCurveTo(40, -50, 52, -60, 50 + Math.sin(t * 3) * 3, -78);
    g.bezierCurveTo(44, -70, 34, -62, 16, -66); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = GOLD; g.beginPath(); g.moveTo(50 + Math.sin(t * 3) * 3, -78); g.lineTo(58, -92); g.lineTo(52, -80); g.lineTo(62, -84); g.lineTo(47, -72); g.closePath(); g.fill(); g.stroke();
    g.restore();

    // ---- 腳（紅鞋）與褲子
    for (const sx of [-1, 1]) {
      line(2.4); g.fillStyle = WHITE; g.beginPath(); g.roundRect(sx * 13 - 9, -40, 18, 26, 6); g.fill(); g.stroke();
      g.strokeStyle = RED; g.lineWidth = 2.2; g.beginPath(); g.moveTo(sx * 13 + sx * 8, -38); g.lineTo(sx * 13 + sx * 8, -16); g.stroke();
      line(2.4); g.fillStyle = rg(sx * 15, -8, 16, RED_L, RED_D); g.beginPath(); g.ellipse(sx * 15, -7, 15, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = WHITE; g.beginPath(); g.ellipse(sx * 15 + sx * 2, -3, 9, 2.6, 0, 0, Math.PI * 2); g.fill();
    }
    // ---- 身體（白色細條紋球衣）
    g.save(); line(2.6);
    g.beginPath(); g.moveTo(-26, -86); g.quadraticCurveTo(-32, -58, -25, -36); g.quadraticCurveTo(0, -30, 25, -36); g.quadraticCurveTo(32, -58, 26, -86); g.quadraticCurveTo(0, -94, -26, -86); g.closePath();
    g.fillStyle = WHITE; g.fill(); g.save(); g.clip();
    g.strokeStyle = 'rgba(200,30,40,0.45)'; g.lineWidth = 1; for (let k = -30; k <= 30; k += 6) { g.beginPath(); g.moveTo(k, -96); g.lineTo(k, -30); g.stroke(); }
    const sh = g.createLinearGradient(-30, 0, 30, 0); sh.addColorStop(0, 'rgba(120,80,90,0.25)'); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(120,80,90,0.3)'); g.fillStyle = sh; g.fillRect(-34, -96, 68, 70);
    // 胸前紅色字樣條（不寫隊名，只用飄帶）
    g.fillStyle = RED; g.beginPath(); g.moveTo(-20, -62); g.quadraticCurveTo(-2, -66, 20, -80); g.lineTo(20, -75); g.quadraticCurveTo(0, -60, -20, -58); g.closePath(); g.fill();
    g.fillStyle = RED; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('85', 0, -46);
    // 腰帶
    g.fillStyle = RED_D; g.fillRect(-34, -44, 68, 6);
    g.restore(); line(2.6); g.stroke();
    // 領口紅邊
    g.strokeStyle = RED; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, -89); g.lineTo(0, -78); g.lineTo(10, -89); g.stroke();
    g.restore();

    // ---- 手臂：左手插腰，右手舉起加油
    const arm = (sx, ang) => {
      g.save(); g.translate(sx * 24, -82); g.rotate(ang);
      line(2.4); g.fillStyle = WHITE; g.beginPath(); g.roundRect(-7, -2, 14, 16, 6); g.fill(); g.stroke(); // 袖子
      g.fillStyle = RED; g.beginPath(); g.roundRect(-5.5, 12, 11, 14, 5); g.fill(); g.stroke();
      g.fillStyle = rg(0, 31, 9, RED_L, RED_D); g.beginPath(); g.arc(0, 31, 8.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = WHITE; for (const a of [-0.8, 0, 0.8]) { g.beginPath(); g.ellipse(Math.sin(a) * 8, 31 + Math.cos(a) * 8, 2, 3.2, -a, 0, Math.PI * 2); g.fill(); g.stroke(); }
      g.restore();
    };
    arm(-1, 0.5);
    arm(1, -0.4 - cheer * (1.5 + Math.sin(t * 6) * 0.2));

    // ---- 頭
    g.save(); g.translate(0, -122); g.rotate(Math.sin(t * 2) * 0.04);
    // 金色鬃毛（臉頰兩側）
    for (const sx of [-1, 1]) {
      g.fillStyle = GOLD; line(2.2); g.beginPath(); g.moveTo(sx * 30, -14);
      g.lineTo(sx * 48, -16); g.lineTo(sx * 40, -6); g.lineTo(sx * 54, -2); g.lineTo(sx * 42, 6); g.lineTo(sx * 52, 14); g.lineTo(sx * 34, 16); g.closePath(); g.fill(); g.stroke();
    }
    // 頭部底色（紅）
    line(2.8); g.fillStyle = rg(0, -4, 44, RED_L, RED); g.beginPath(); g.ellipse(0, -2, 38, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // 白色臉（眼睛區 + 大鼻吻）
    g.fillStyle = WHITE; g.beginPath();
    g.moveTo(-30, -8); g.bezierCurveTo(-32, -24, -14, -28, 0, -22); g.bezierCurveTo(14, -28, 32, -24, 30, -8);
    g.bezierCurveTo(44, 2, 44, 30, 22, 36); g.bezierCurveTo(10, 40, -10, 40, -22, 36); g.bezierCurveTo(-44, 30, -44, 2, -30, -8); g.closePath();
    const fg = g.createLinearGradient(0, -26, 0, 40); fg.addColorStop(0, '#ffffff'); fg.addColorStop(1, '#f2dcd0'); g.fillStyle = fg; g.fill(); g.stroke();
    // 嘴巴（大笑）
    g.fillStyle = '#7a0c18'; g.beginPath(); g.moveTo(-20, 18); g.quadraticCurveTo(0, 26, 20, 18); g.quadraticCurveTo(14, 34, 0, 34); g.quadraticCurveTo(-14, 34, -20, 18); g.closePath(); g.fill(); line(2.2); g.stroke();
    g.fillStyle = '#ff7a8a'; g.beginPath(); g.ellipse(2, 30, 8, 3.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = WHITE; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 14, 19.5); g.lineTo(sx * 10, 19.8); g.lineTo(sx * 12, 26); g.closePath(); g.fill(); line(1.2); g.stroke(); }
    // 鼻孔
    g.fillStyle = INK; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 9, 8, 3, 4, sx * 0.4, 0, Math.PI * 2); g.fill(); }
    // 鼻吻高光
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-14, 2, 6, 3, -0.4, 0, Math.PI * 2); g.fill();
    // 大眼睛
    for (const sx of [-1, 1]) {
      const ex = sx * 13, ey = -10;
      line(2.4); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 11, 13, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      const ig = g.createRadialGradient(ex + sx * 1, ey - 3, 1, ex + sx * 1, ey + 1, 9); ig.addColorStop(0, '#9fd8ff'); ig.addColorStop(1, BLUE);
      g.fillStyle = ig; g.beginPath(); g.ellipse(ex + sx * 1.5, ey + 1, 7.5, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#081a3a'; g.beginPath(); g.ellipse(ex + sx * 1.5, ey + 1.5, 4, 5.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 2, ey - 4, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(ex + 3, ey + 4, 1.4, 0, Math.PI * 2); g.fill();
    }
    // 金色鹿角（從帽子兩側伸出）
    for (const sx of [-1, 1]) {
      g.save(); g.scale(sx, 1); line(2.4); g.fillStyle = GOLD;
      g.beginPath(); g.moveTo(24, -34); g.quadraticCurveTo(38, -48, 40, -66); g.lineTo(46, -64); g.quadraticCurveTo(46, -52, 42, -44);
      g.lineTo(54, -52); g.lineTo(56, -46); g.quadraticCurveTo(44, -36, 32, -28); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = GOLD_D; g.lineWidth = 1.2; g.beginPath(); g.moveTo(30, -36); g.quadraticCurveTo(38, -46, 40, -58); g.stroke();
      g.restore();
    }
    // 紅色棒球帽
    line(2.8); g.fillStyle = rg(0, -36, 36, RED_L, RED_D);
    g.beginPath(); g.moveTo(-34, -22); g.bezierCurveTo(-36, -58, 36, -58, 34, -22); g.quadraticCurveTo(0, -30, -34, -22); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(80,0,10,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, -27); g.stroke();
    g.fillStyle = RED_D; line(2.4); g.beginPath(); g.ellipse(0, -50, 4, 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // 帽簷
    g.fillStyle = RED; g.beginPath(); g.moveTo(-30, -24); g.quadraticCurveTo(0, -34, 30, -24); g.quadraticCurveTo(0, -18, -30, -24); g.closePath(); g.fill(); line(2.4); g.stroke();
    // 帽徽：白色 W
    g.save(); g.translate(0, -39); g.lineJoin = 'miter';
    g.strokeStyle = INK; g.lineWidth = 6.5; g.beginPath(); g.moveTo(-10, -6); g.lineTo(-5, 7); g.lineTo(0, -2); g.lineTo(5, 7); g.lineTo(10, -6); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 3.6; g.stroke();
    g.restore();
    g.restore();

    g.restore();
  }

  // 畫一張完整的球場（設計尺寸寬 412），NIGHT：0 白天 / 0.5 黃昏 / 1 夜晚
  function stadiumPaint(g, W, H, NIGHT) {
    let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rand = (a, b) => a + rnd() * (b - a);
    const pick = (a) => a[(rnd() * a.length) | 0];
    const circ = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    const ell = (x, y, rx, ry, col, rot) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fill(); };
    const rr = (x, y, w, h, r, col) => { g.fillStyle = col; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    const glow = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    const C = { red: '#e23b3f', dred: '#b3262e', clay: '#b83a30', gold: '#f7c548', cream: '#fff3dc', green: '#5db95a', dgreen: '#4aa34c', navy: '#2b3a78', wood: '#c08246' };
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const rgbs = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
    const skyAt = (k) => { // k: 0 day / 0.5 dusk / 1 night
      const D = [[110, 195, 240], [185, 228, 248], [244, 247, 238]], U = [[74, 90, 168], [240, 138, 122], [255, 210, 138]], N = [[5, 10, 36], [22, 32, 90], [74, 58, 102]];
      const [A, B, t] = k < 0.5 ? [D, U, k / 0.5] : [U, N, (k - 0.5) / 0.5];
      return A.map((c, i) => mixc(c, B[i], t));
    };
    const bulbs = [], lamps = [];
    const SKIN = ['#ffd9b8', '#f5c49c', '#e8ab7c', '#c98a5e', '#8d5a3a'];
    const HAIR = ['#2a1a14', '#4a2c1c', '#8a5a2a', '#e0a040', '#1a1a2a', '#a03020'];

    // ---------- 人物（Q 版，大頭小身體） ----------
    function person(x, foot, h, o) {
      const skin = o.skin || pick(SKIN), hair = o.hair || pick(HAIR);
      const headR = h * 0.215, headY = foot - h + headR + 1;
      const bw = h * 0.34, bt = headY + headR * 0.82, bh = h * 0.36;
      // 腿
      rr(x - bw * 0.42, bt + bh - 2, bw * 0.34, foot - (bt + bh) + 2, 2, o.pants || '#f4eee4');
      rr(x + bw * 0.08, bt + bh - 2, bw * 0.34, foot - (bt + bh) + 2, 2, o.pants || '#f4eee4');
      rr(x - bw * 0.46, foot - 2.5, bw * 0.42, 3, 1.5, '#3a2a2a'); rr(x + bw * 0.04, foot - 2.5, bw * 0.42, 3, 1.5, '#3a2a2a');
      // 手臂（在身體後）
      g.lineCap = 'round'; g.lineWidth = h * 0.085; g.strokeStyle = o.sleeve || o.top;
      const armUp = (side, dx, dy) => { g.beginPath(); g.moveTo(x + side * bw * 0.46, bt + 3); g.lineTo(x + side * bw * 0.46 + dx, bt + 3 + dy); g.stroke(); };
      let hands = [];
      if (o.arms === 'up') { armUp(-1, -h * 0.17, -h * 0.28); armUp(1, h * 0.17, -h * 0.28); hands = [[x - bw * 0.46 - h * 0.17, bt + 3 - h * 0.28], [x + bw * 0.46 + h * 0.17, bt + 3 - h * 0.28]]; }
      else if (o.arms === 'one') { armUp(-1, -h * 0.05, h * 0.2); armUp(1, h * 0.14, -h * 0.3); hands = [null, [x + bw * 0.46 + h * 0.14, bt + 3 - h * 0.3]]; }
      else if (o.arms === 'bat') { armUp(-1, h * 0.14, -h * 0.02); armUp(1, h * 0.17, -h * 0.05); }
      else { armUp(-1, -h * 0.04, h * 0.22); armUp(1, h * 0.04, h * 0.22); }
      for (const hd of hands) if (hd) circ(hd[0], hd[1], h * 0.055, skin);
      // 身體
      rr(x - bw / 2, bt, bw, bh, h * 0.07, o.top);
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x - bw / 2, bt + bh * 0.7, bw, bh * 0.3);
      if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(x - bw / 2, bt + bh * 0.18, bw, bh * 0.1); }
      if (o.star) circ(x + bw * 0.22, bt + bh * 0.46, h * 0.04, '#fff'); // 左胸白色圓點
      // 頭
      if (!o.cap) { ell(x, headY - headR * 0.1, headR * 1.06, headR * 1.05, hair); }
      circ(x, headY + headR * 0.08, headR, skin);
      if (!o.cap) { g.fillStyle = hair; g.beginPath(); g.ellipse(x, headY - headR * 0.55, headR * 1.02, headR * 0.5, 0, Math.PI, 0); g.fill(); }
      if (o.pony) { ell(x + headR * 1.0, headY + headR * 0.1, headR * 0.35, headR * 0.7, hair, 0.4); }
      // 臉
      circ(x - headR * 0.38, headY + headR * 0.12, headR * 0.1, '#2a1a1a'); circ(x + headR * 0.38, headY + headR * 0.12, headR * 0.1, '#2a1a1a');
      g.strokeStyle = '#8a3a2a'; g.lineWidth = Math.max(0.8, headR * 0.09); g.lineCap = 'round';
      g.beginPath(); g.arc(x, headY + headR * 0.32, headR * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      circ(x - headR * 0.62, headY + headR * 0.32, headR * 0.17, 'rgba(255,120,120,0.45)'); circ(x + headR * 0.62, headY + headR * 0.32, headR * 0.17, 'rgba(255,120,120,0.45)');
      // 帽子
      if (o.cap) {
        g.fillStyle = o.cap; g.beginPath(); g.ellipse(x, headY - headR * 0.18, headR * 1.04, headR * 0.92, 0, Math.PI, 0); g.fill();
        g.fillRect(x - headR * 1.04, headY - headR * 0.2, headR * 2.08, headR * 0.16);
        g.beginPath(); g.ellipse(x + headR * 0.55, headY - headR * 0.12, headR * 0.72, headR * 0.2, 0, 0, TAU); g.fill();
        { const wx = x, wy = headY - headR * 0.6, ww = headR * 0.3, wh = headR * 0.22; // 帽徽：低調的小 W
          g.strokeStyle = 'rgba(255,240,220,0.75)'; g.lineWidth = Math.max(0.8, headR * 0.09); g.lineJoin = 'round'; g.lineCap = 'round';
          g.beginPath(); g.moveTo(wx - ww, wy - wh); g.lineTo(wx - ww * 0.5, wy + wh); g.lineTo(wx, wy - wh * 0.3); g.lineTo(wx + ww * 0.5, wy + wh); g.lineTo(wx + ww, wy - wh); g.stroke(); }
      }
      return hands;
    }
    function flag(x, y, h, col, t) {
      g.strokeStyle = '#7a5a3a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y + h * 0.9); g.lineTo(x, y - h); g.stroke();
      const fw = h * 1.1, fh = h * 0.72;
      g.fillStyle = col; g.beginPath(); g.moveTo(x, y - h);
      for (let i = 0; i <= 8; i++) g.lineTo(x + fw * i / 8, y - h + Math.sin(i * 0.9 + t) * 2.2);
      for (let i = 8; i >= 0; i--) g.lineTo(x + fw * i / 8, y - h + fh + Math.sin(i * 0.9 + t) * 2.2);
      g.closePath(); g.fill();
      circ(x + fw * 0.5, y - h + fh * 0.5 + 1, fh * 0.26, C.gold);
    }

    // ---------- 天空與雲 ----------
    const sk = skyAt(NIGHT);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, rgbs(sk[0])); sky.addColorStop(0.6, rgbs(sk[1])); sky.addColorStop(1, rgbs(sk[2]));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (NIGHT > 0.55) {
      const a = clamp01((NIGHT - 0.55) / 0.35);
      for (let i = 0; i < 110; i++) { g.fillStyle = `rgba(255,250,235,${rand(0.3, 0.95) * a})`; const r = rnd() < 0.1 ? 1.5 : 0.9; g.beginPath(); g.arc(rand(0, W), rand(0, H * 0.55), r, 0, TAU); g.fill(); }
      // 月亮（落在左側看得見的位置）
      const mx = 50, my = 392;
      g.globalAlpha = a; glow(mx, my, 70, '200,215,255', 0.35); circ(mx, my, 20, '#fff8e0'); g.fillStyle = 'rgba(200,190,160,0.35)'; for (const [dx, dy, r] of [[-6, -4, 4], [6, 5, 3], [3, -8, 2.4]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, TAU); g.fill(); } g.globalAlpha = 1;
      g.globalAlpha = a; glow(mx, my, 70, '200,215,255', 0.0); g.globalAlpha = 1;
    }
    function cloud(x, y, s) { for (const [dx, dy, r] of [[-26, 4, 16], [-8, -6, 21], [14, -2, 19], [32, 6, 14], [0, 8, 18]]) circ(x + dx * s, y + dy * s, r * s, '#fff'); rr(x - 40 * s, y + 6 * s, 84 * s, 14 * s, 7 * s, '#fff'); g.fillStyle = 'rgba(150,200,235,0.25)'; g.fillRect(x - 36 * s, y + 14 * s, 76 * s, 6 * s); }
    cloud(70, 118, 1.1); cloud(330, 70, 0.9); cloud(60, 330, 0.8); cloud(350, 410, 1.0); cloud(290, 230, 0.7); cloud(130, 470, 0.9);

    // 彩旗串
    function bunting(x0, y0, x1, y1, sag, n) {
      g.strokeStyle = '#8a6a4a'; g.lineWidth = 1.3; g.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40; const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
        g.fillStyle = [C.red, '#fff', C.gold][i % 3]; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x, y + 18); g.fill(); bulbs.push([x, y + 2]);
        if (i % 3 === 1) { g.fillStyle = C.red; g.beginPath(); g.arc(x, y + 6, 2.4, 0, TAU); g.fill(); }
      }
    }
    bunting(-4, 6, W + 4, 6, 26, 15);
    bunting(-4, 38, W + 4, 52, 20, 13);
    // 氣球
    function balloon(x, y, r, col) { g.strokeStyle = 'rgba(80,60,60,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + r * 1.15); g.quadraticCurveTo(x - 4, y + r * 2.4, x + 2, y + r * 3.6); g.stroke(); ell(x, y, r * 0.9, r, col); g.fillStyle = col; g.beginPath(); g.moveTo(x - 3, y + r * 0.95); g.lineTo(x + 3, y + r * 0.95); g.lineTo(x, y + r * 1.2); g.fill(); ell(x - r * 0.3, y - r * 0.35, r * 0.18, r * 0.3, 'rgba(255,255,255,0.55)', 0.5); }
    balloon(24, 420, 14, C.red); balloon(48, 470, 11, '#fff'); balloon(386, 470, 14, C.red); balloon(362, 505, 11, '#fff'); balloon(20, 500, 10, '#fff');

    // ---------- 球場燈塔（白天是灰色的鐵塔，晚上才會亮）----------
    function tower(x, topY, baseY, bw) {
      g.strokeStyle = '#8c96ac'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, baseY); g.lineTo(x, topY); g.stroke();
      g.strokeStyle = 'rgba(120,130,150,0.7)'; g.lineWidth = 1.4;
      for (let yy = topY + 18; yy < baseY; yy += 26) { g.beginPath(); g.moveTo(x - 3, yy); g.lineTo(x + 3, yy + 13); g.moveTo(x + 3, yy); g.lineTo(x - 3, yy + 13); g.stroke(); }
      g.fillStyle = '#7a859c'; g.fillRect(x - bw / 2, topY - bw * 0.55, bw, bw * 0.55);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { g.fillStyle = '#d6dcea'; g.beginPath(); g.arc(x - bw / 2 + (i + 0.5) * bw / 6, topY - bw * 0.55 + (j + 0.5) * bw * 0.55 / 3, bw / 6 * 0.36, 0, TAU); g.fill(); }
      lamps.push([x, topY - bw * 0.275, bw]);
    }
    tower(W * 0.045, H * 0.1, H * 0.64, 54); tower(W * 0.955, H * 0.1, H * 0.64, 54);
    tower(W * 0.2, H * 0.4, H * 0.62, 36); tower(W * 0.8, H * 0.4, H * 0.62, 36);


    // ---------- 看台：三層，每層一排觀眾 + 木板座椅牆 ----------
    const standTop = H * 0.605;
    g.fillStyle = '#f6e3d2'; g.beginPath(); g.moveTo(0, H * 0.82); g.lineTo(0, standTop + 24); g.quadraticCurveTo(W / 2, standTop - 18, W, standTop + 24); g.lineTo(W, H * 0.82); g.fill();
    g.fillStyle = 'rgba(210,150,120,0.28)'; g.beginPath(); g.moveTo(0, standTop + 24); g.quadraticCurveTo(W / 2, standTop - 18, W, standTop + 24); g.lineTo(W, standTop + 36); g.quadraticCurveTo(W / 2, standTop - 6, 0, standTop + 36); g.fill();
    const flagsAll = [];
    for (let row = 0; row < 3; row++) {
      const baseY = standTop + 44 + row * 30, hh = 34 + row * 4;
      const step = 29 + row * 2;
      for (let x = 12 + (row % 2) * 12; x < W; x += step) {
        const curve = Math.sin(x / W * Math.PI) * -18 + 18;
        const fy = baseY + curve * (1 - row * 0.3) * 0.8;
        const jersey = rnd() < 0.78;
        const o = { top: jersey ? C.red : pick(['#fff', C.gold, '#fff', C.navy]), stripe: jersey && rnd() < 0.3 ? '#fff' : null, star: jersey && rnd() < 0.3, cap: jersey && rnd() < 0.45 ? C.red : null, arms: rnd() < 0.5 ? 'up' : rnd() < 0.5 ? 'one' : 'down', pony: rnd() < 0.2 };
        const hands = person(x + rand(-2, 2), fy, hh, o);
        if (o.arms === 'one' && hands[1] && rnd() < 0.7) flagsAll.push([hands[1][0], hands[1][1] + 6, 22 + row * 3]);
        else if (o.arms === 'up' && hands[0] && rnd() < 0.18) flagsAll.push([hands[0][0], hands[0][1] + 6, 24]);
      }
      // 座椅牆（紅白木板）
      const wy = baseY + (row === 2 ? 4 : 2) + Math.max(0, 0);
      g.fillStyle = row % 2 ? '#d84a40' : '#c23a36';
      g.beginPath(); g.moveTo(0, wy + 4); for (let x = 0; x <= W; x += 6) g.lineTo(x, wy + 4 + Math.sin(x / W * Math.PI) * -14 * (1 - row * 0.3) * 0.8 + 14 * (1 - row * 0.3) * 0.8); g.lineTo(W, wy + 26); g.lineTo(0, wy + 26); g.fill();
    }
    const tt = 0;
    for (const [fx, fy2, fh] of flagsAll) flag(fx, fy2, fh, C.red, fx * 0.1 + tt);

    // ---------- 木板圍欄與廣告小旗 ----------
    const fenceY = H * 0.78;
    g.fillStyle = '#a82a30'; g.fillRect(0, standTop + 128, W, fenceY - (standTop + 128));
    g.fillStyle = C.gold; g.fillRect(0, standTop + 128, W, 2.5);
    g.fillStyle = 'rgba(255,255,255,0.8)'; for (let x = 8; x < W; x += 20) { g.beginPath(); g.arc(x, standTop + 128 + (fenceY - standTop - 128) / 2 + 1, 2, 0, TAU); g.fill(); }
    g.fillStyle = C.wood; g.fillRect(0, fenceY, W, 18);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = fenceY + 6; y < fenceY + 18; y += 6) g.fillRect(0, y, W, 1);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, fenceY, W, 2);
    for (let x = 10; x < W; x += 46) { rr(x, fenceY + 4, 34, 10, 2, [C.red, '#fff', C.gold, C.navy][((x / 46) | 0) % 4]); }

    // ---------- 球場 ----------
    const gy = fenceY + 18;
    g.fillStyle = C.green; g.fillRect(0, gy, W, H - gy);
    for (let i = -12; i < 14; i++) {
      g.fillStyle = i % 2 ? 'rgba(120,205,110,0.55)' : 'rgba(60,150,70,0.4)';
      g.beginPath(); g.moveTo(W / 2 + i * 16, gy); g.lineTo(W / 2 + i * 16 + 16, gy); g.lineTo(W / 2 + (i + 1) * 64, H); g.lineTo(W / 2 + i * 64, H); g.fill();
    }
    // 內野深紅土
    const home = [W / 2, H * 0.985], b1 = [W * 0.82, H * 0.915], b2 = [W / 2, H * 0.845], b3 = [W * 0.18, H * 0.915];
    g.fillStyle = C.clay; g.beginPath(); g.moveTo(home[0], home[1] + 14); g.lineTo(b1[0] + 26, b1[1]); g.lineTo(b2[0], b2[1] - 22); g.lineTo(b3[0] - 26, b3[1]); g.closePath(); g.fill();
    g.fillStyle = C.green; g.beginPath(); g.moveTo(home[0], home[1] - 26); g.lineTo(b1[0] - 24, b1[1]); g.lineTo(b2[0], b2[1] + 18); g.lineTo(b3[0] + 24, b3[1]); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(home[0], home[1] + 6); g.lineTo(b1[0] + 70, b1[1] - 50); g.moveTo(home[0], home[1] + 6); g.lineTo(b3[0] - 70, b3[1] - 50); g.stroke();
    ell(W / 2, H * 0.915, 16, 7, C.clay);
    for (const [bx, by] of [b1, b2, b3]) { g.save(); g.translate(bx, by); g.scale(1, 0.55); g.rotate(Math.PI / 4); g.fillStyle = '#fff'; g.fillRect(-7, -7, 14, 14); g.restore(); }
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(home[0] - 8, home[1] + 4); g.lineTo(home[0] + 8, home[1] + 4); g.lineTo(home[0] + 8, home[1] + 9); g.lineTo(home[0], home[1] + 15); g.lineTo(home[0] - 8, home[1] + 9); g.fill();
    // 場上球員（紅色球衣、大頭）
    const R = { top: C.red, pants: '#fff', cap: C.red, star: true };
    person(b1[0] + 4, b1[1] + 12, 64, Object.assign({ arms: 'one' }, R));      // 一壘
    person(b3[0] - 4, b3[1] + 12, 64, Object.assign({ arms: 'one' }, R));      // 三壘
    person(W / 2, H * 0.935, 66, Object.assign({ arms: 'down' }, R));          // 投手
    person(W / 2 - 34, home[1] + 2, 72, Object.assign({ arms: 'bat', cap: C.dred }, R));   // 打者
    g.strokeStyle = '#d9b070'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(W / 2 - 14, home[1] - 52); g.lineTo(W / 2 - 4, home[1] - 92); g.stroke();
    circ(W / 2 + 40, home[1] - 90, 5, '#fff');

    // ---------- 兩側的啦啦隊與吉祥物（落在畫面左右兩側看得見的位置）----------
    // 啦啦隊（左）
    function pom(x, y, col) { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ell(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 2.6, 4.5, col, a); } circ(x, y, 4, '#fff7e0'); }
    for (const [x, hh, hair] of [[34, 78, '#2a1a14'], [72, 74, '#8a5a2a']]) {
      const hands = person(x, H * 0.665, hh, { top: C.red, stripe: '#fff', pants: '#fff', arms: 'up', pony: true, hair });
      hands.forEach((hd, i) => hd && pom(hd[0], hd[1] - 4, i ? C.gold : C.red));
    }

    // ---------- 日夜：整體調色 + 夜晚的燈光 ----------
    {
      const t = NIGHT;
      const tint = t <= 0.5 ? mixc([255, 255, 255], [255, 205, 190], t / 0.5) : mixc([255, 205, 190], [112, 128, 205], (t - 0.5) / 0.5);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = rgbs(tint); g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const dusk = clamp01(1 - Math.abs(t - 0.5) / 0.32);
      if (dusk > 0) glow(W / 2, H * 0.63, W * 0.95, '255,140,70', 0.3 * dusk);
      const L = clamp01((t - 0.42) / 0.4);
      if (L > 0) {
        glow(W * 0.3, H * 0.92, 240, '215,255,190', 0.14 * L); glow(W * 0.72, H * 0.92, 240, '215,255,190', 0.14 * L);
        glow(W / 2, H * 0.72, W * 0.8, '255,225,190', 0.08 * L);
        for (const [x, y, bw] of lamps) {
          glow(x, y, bw * 2.6, '255,242,205', 0.5 * L); glow(x, y, bw * 1.0, '255,255,255', 0.8 * L);
          const ang = x < W / 2 ? 1.2 : Math.PI - 1.2;
          g.save(); g.translate(x, y); g.rotate(ang);
          const gr = g.createLinearGradient(0, 0, 420, 0); gr.addColorStop(0, `rgba(255,246,220,${0.15 * L})`); gr.addColorStop(1, 'rgba(255,246,220,0)');
          g.fillStyle = gr; g.beginPath(); g.moveTo(0, -4); g.lineTo(420, -90); g.lineTo(420, 90); g.lineTo(0, 4); g.fill(); g.restore();
        }
        for (const [x, y, bw] of lamps) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { g.fillStyle = `rgba(255,255,245,${L})`; g.beginPath(); g.arc(x - bw / 2 + (i + 0.5) * bw / 6, y - bw * 0.275 + (j + 0.5) * bw * 0.55 / 3 + bw * 0.275 - bw * 0.275 + 0, bw / 6 * 0.4, 0, TAU); g.fill(); }
            for (const [x, y] of bulbs) { glow(x, y, 8, '255,210,130', 0.8 * L); g.fillStyle = `rgba(255,240,200,${L})`; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
        seed = 99;
        for (let i = 0; i < 110; i++) glow(rand(0, W), rand(H * 0.6, H * 0.77), rand(3.5, 6.5), rnd() < 0.85 ? '255,60,45' : '255,200,90', 0.42 * L);
      }
      g.globalCompositeOperation = 'source-over';
    }
    // 暗角與整體色調：稍微柔化
    const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(20,50,20,0.12)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);


  }
  function balloonSprite(col, shine) {
    const S = layer(30, 60), g = S.g;
    g.strokeStyle = 'rgba(80,60,60,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(15, 30); g.quadraticCurveTo(11, 44, 17, 58); g.stroke();
    const gr = g.createRadialGradient(11, 10, 1, 15, 15, 15); gr.addColorStop(0, shine); gr.addColorStop(1, col);
    g.fillStyle = gr; g.beginPath(); g.ellipse(15, 15, 12, 14, 0, 0, TAU); g.fill();
    g.fillStyle = col; g.beginPath(); g.moveTo(12, 28); g.lineTo(18, 28); g.lineTo(15, 32); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(10, 9, 2.5, 4.5, 0.5, 0, TAU); g.fill();
    return S;
  }
  class Stadium {
    constructor(low) { this.low = low; this.night = 0.12; this.target = 0.12; this.cheer = 0; this.balloons = []; this.sparks = []; this.confetti = []; this.fwT = 0; this.stage = 1; }
    resize(w, h) {
      this.w = w; this.h = h;
      this.sc = Math.min(w / 412, h / 860);
      this.W = w / this.sc; this.H = h / this.sc;
      this.keys = [null, null, null]; // 白天 / 黃昏 / 夜晚，用到時才畫
      const s = Math.min(root.devicePixelRatio || 1, 2);
      this.mbox = { x: this.W * 0.855 - 52, y: this.H * 0.668 - 128, w: 104, h: 134 };
      this.mcv = document.createElement('canvas');
      this.mcv.width = Math.ceil(this.mbox.w * this.sc * s); this.mcv.height = Math.ceil(this.mbox.h * this.sc * s);
      this.mg = this.mcv.getContext('2d');
      this.mpx = this.sc * s;
      this.bl = [[balloonSprite('#d8202c', '#ff8a80'), balloonSprite('#f2f0f4', '#ffffff')], [balloonSprite('#6a1a3c', '#a04060'), balloonSprite('#8890b8', '#b8c0e0')]];
      this.balloons = [];
      for (let i = 0; i < (this.low ? 3 : 6); i++) this.balloons.push(this.newBalloon(true));
    }
    key(k) {
      if (!this.keys[k]) {
        const L = layer(this.w, this.h);
        L.g.save(); L.g.scale(this.sc, this.sc); stadiumPaint(L.g, this.W, this.H, k / 2); L.g.restore();
        this.keys[k] = L;
      }
      return this.keys[k].cv;
    }
    newBalloon(anywhere, x) {
      return { x: x != null ? x : rand(0, this.W), y: anywhere ? rand(0.15, 0.7) * this.H : this.H * rand(0.62, 0.72), vy: rand(14, 26), ph: rand(0, TAU), z: rand(0.6, 1.1), k: Math.random() < 0.6 ? 0 : 1 };
    }
    setIntensity(i) {
      this.stage = i;
      this.target = [0, 0.15, 0.32, 0.55, 0.8, 1][Math.max(0, Math.min(5, Math.round(i)))];
    }
    update(dt) {
      const s = dt / 1000;
      this.night += (this.target - this.night) * (1 - Math.exp(-s / 3.5));
      this.cheer *= Math.pow(0.15, s);
      for (const b of this.balloons) { b.y -= b.vy * b.z * s; b.ph += s * 1.3; }
      this.balloons = this.balloons.filter((b) => b.y > -60);
      while (this.balloons.length < (this.low ? 3 : 6)) this.balloons.push(this.newBalloon(false));
      for (const p of this.sparks) { p.vy += 40 * s; p.x += p.vx * s; p.y += p.vy * s; p.life -= s; }
      this.sparks = this.sparks.filter((p) => p.life > 0);
      for (const p of this.confetti) { p.vy = Math.min(p.vy + 90 * s, 60); p.vx *= Math.pow(0.4, s); p.x += (p.vx + Math.sin(p.ph) * 18) * s; p.y += p.vy * s; p.ph += s * 6; p.r += p.vr * s; }
      this.confetti = this.confetti.filter((p) => p.y < this.H + 10);
      // 最終副歌的夜晚：自動放煙火
      if (this.night > 0.7 && this.stage >= 5) { this.fwT -= s; if (this.fwT <= 0) { this.fwT = rand(1.4, 2.6); this.firework(rand(0.1, 0.9) * this.W, rand(0.08, 0.35) * this.H, false); } }
    }
    firework(x, y, big) {
      const n = (big ? 60 : 36) * (this.low ? 0.5 : 1), col = Math.random() < 0.6 ? '255,90,80' : Math.random() < 0.5 ? '255,255,255' : '255,200,120';
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, v = rand(50, big ? 130 : 95); this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.9, 1.5), col }); }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h, sc = this.sc, N = this.night;
      // 白天 / 黃昏 / 夜晚三張底圖交叉淡入
      const k = N < 0.5 ? 0 : 1, f = N < 0.5 ? N / 0.5 : (N - 0.5) / 0.5;
      g.drawImage(this.key(k), 0, 0, w, h);
      if (f > 0.01) { g.globalAlpha = f; g.drawImage(this.key(k + 1), 0, 0, w, h); g.globalAlpha = 1; }
      g.save(); g.scale(sc, sc);
      const W = this.W, H = this.H;
      // 氣球（紅白兩色），晚上換成暗色版本
      for (const b of this.balloons) {
        const bx = b.x + Math.sin(b.ph) * 6, bw = 22 * b.z, bh = bw * 2;
        g.globalAlpha = 1 - N * 0.6; g.drawImage(this.bl[0][b.k].cv, bx - bw / 2, b.y - bh / 4, bw, bh);
        if (N > 0.05) { g.globalAlpha = N * 0.6; g.drawImage(this.bl[1][b.k].cv, bx - bw / 2, b.y - bh / 4, bw, bh); }
      }
      g.globalAlpha = 1;
      // 夜晚：燈塔隨節拍閃亮
      const L = Math.max(0, Math.min(1, (N - 0.42) / 0.4));
      if (L > 0) {
        g.globalCompositeOperation = 'lighter';
        for (const [x, y, r] of [[W * 0.045, H * 0.1 - 15, 54], [W * 0.955, H * 0.1 - 15, 54], [W * 0.2, H * 0.4 - 10, 36], [W * 0.8, H * 0.4 - 10, 36]]) glow(g, x, y, r * (1.6 + beat * 0.8), '255,245,215', (0.12 + beat * 0.25) * L);
        g.globalCompositeOperation = 'source-over';
      }
      // 吉祥物：跟著節拍跳、揮手（畫在小畫布上再依時段調色）
      const mb = this.mbox, mg = this.mg, px = this.mpx;
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, this.mcv.width, this.mcv.height);
      mg.globalCompositeOperation = 'source-over';
      mg.setTransform(px, 0, 0, px, -mb.x * px, -mb.y * px);
      stadiumMascot(mg, W * 0.855, H * 0.668 - this.cheer * 8, 0.62, t / 1000 + beat * 0.15, 0.7 + Math.min(0.5, beat * 0.5 + this.cheer));
      mg.setTransform(1, 0, 0, 1, 0, 0);
      if (N > 0.02) {
        mg.globalCompositeOperation = 'source-atop';
        mg.fillStyle = N < 0.5 ? `rgba(255,110,70,${0.18 * N / 0.5})` : `rgba(22,30,90,${0.18 + 0.32 * (N - 0.5) / 0.5})`;
        mg.fillRect(0, 0, this.mcv.width, this.mcv.height);
        mg.globalCompositeOperation = 'source-over';
      }
      g.drawImage(this.mcv, mb.x, mb.y, mb.w, mb.h);
      // 紙花與煙火
      for (const p of this.confetti) { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-2.5, -1.5, 5, 3); g.restore(); }
      if (this.sparks.length) {
        g.globalCompositeOperation = 'lighter';
        for (const p of this.sparks) { const a = Math.min(1, p.life) * 0.9; g.fillStyle = `rgba(${p.col},${a})`; g.beginPath(); g.arc(p.x, p.y, 1.8, 0, TAU); g.fill(); glow(g, p.x, p.y, 6, p.col, a * 0.35); }
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
    burst(d) {
      this.cheer = Math.min(1.2, this.cheer + 0.3 * d.lines);
      const W = this.W, H = this.H;
      // 紙花從兩側噴出
      const n = Math.min(this.low ? 20 : 50, d.lines * 10 + (d.lines >= 4 ? 20 : 0));
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0;
        this.confetti.push({ x: left ? 0 : W, y: H * rand(0.55, 0.66), vx: (left ? 1 : -1) * rand(60, 160), vy: rand(-180, -90), ph: rand(0, TAU), r: rand(0, TAU), vr: rand(-6, 6), c: Math.random() < 0.6 ? '#e8303a' : '#ffffff' });
      }
      // 晚上加煙火
      if (this.night > 0.45) { const m = Math.min(3, d.lines - 1 + (d.lines >= 4 ? 1 : 0)); for (let i = 0; i < m; i++) this.firework(rand(0.1, 0.9) * W, rand(0.06, 0.32) * H, d.lines >= 4); }
      // 多放幾顆氣球
      for (let i = 0; i < Math.min(3, d.lines - 1); i++) this.balloons.push(this.newBalloon(false, rand(0.05, 0.95) * W));
    }
  }

  root.LumenScenes = {
    星空: Starfield, 深海: DeepSea, 竹林: Bamboo, 極光: Aurora, 水墨: InkWash, 螢火森林: Firefly, 霓虹都市: NeonCity,
    敦煌: Dunhuang, 櫻花: Sakura, 冰晶洞窟: IceCave, 燈節: Lantern, 雨夜: RainyCity, 熔岩: Lava, 夕陽雲海: Sunset,
    長城: GreatWall, 荷塘月色: LotusPond, 仙山: FairyPeaks,
    土星環: Saturn, 楓紅: Maple, 海上風暴: Storm, 飛龍: Dragon,
    景福宮: Gyeongbokgung, 韓屋月夜: HanokMoon, 首爾夜光: SeoulNight, 主場應援: Stadium,
  };
})(typeof self !== 'undefined' ? self : this);
