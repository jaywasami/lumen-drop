'use strict';
/*
 * 光律方塊 — 動態場景
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

  // =========================================================
  // 0 星空：星雲 + 向外飛行的星點（消行時曲速）
  // =========================================================
  class Starfield {
    constructor(low) { this.low = low; this.warp = 0; this.shoots = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#04061a'], [0.5, '#0d0a2c'], [1, '#1c0b3c']]);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const cols = ['90,60,210', '40,110,230', '200,60,170', '40,170,210', '120,80,255'];
      for (let i = 0; i < 8; i++) {
        glow(g, rand(0, w), rand(0, h), rand(0.25, 0.6) * Math.max(w, h), cols[i % cols.length], rand(0.07, 0.16));
      }
      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(220,225,255,${rand(0.1, 0.55)})`;
        const s = rand(0.5, 1.3);
        g.fillRect(rand(0, w), rand(0, h), s, s);
      }
      g.globalCompositeOperation = 'source-over';
      const n = this.low ? 60 : 150;
      this.stars = [];
      for (let i = 0; i < n; i++) this.stars.push(this.newStar(Math.random()));
    }
    newStar(r) {
      return { a: rand(0, TAU), r: r != null ? r : rand(0.01, 0.12), v: rand(0.012, 0.035), s: rand(0.7, 1.8), c: Math.random() < 0.2 ? '170,200,255' : Math.random() < 0.1 ? '255,200,240' : '255,255,255' };
    }
    update(dt) {
      const s = dt / 1000;
      this.warp *= Math.pow(0.22, s);
      const k = 1 + this.warp * 14;
      for (let i = 0; i < this.stars.length; i++) {
        const st = this.stars[i];
        st.pr = st.r;
        st.r += st.v * k * s * (0.4 + st.r);
        if (st.r > 1.2) this.stars[i] = this.newStar();
      }
      if (!this.low && Math.random() < s * 0.12) {
        this.shoots.push({ x: rand(0, this.w), y: rand(0, this.h * 0.5), vx: rand(-500, -250), vy: rand(150, 300), life: 0.9 });
      }
      for (const sh of this.shoots) { sh.x += sh.vx * s; sh.y += sh.vy * s; sh.life -= s; }
      this.shoots = this.shoots.filter((sh) => sh.life > 0);
    }
    draw(g, t, beat, B) {
      g.drawImage(this.bg.cv, 0, 0, this.w, this.h);
      const cx = B.cx, cy = B.cy;
      const R = Math.hypot(this.w, this.h) * 0.62;
      g.globalCompositeOperation = 'lighter';
      const bright = 0.65 + beat * 0.35;
      const streak = this.warp > 0.06;
      for (const st of this.stars) {
        const a = Math.min(1, st.r * 2.2) * bright;
        const x = cx + Math.cos(st.a) * st.r * R;
        const y = cy + Math.sin(st.a) * st.r * R;
        if (streak) {
          const pr = Math.max(0, st.r - (st.r - st.pr) * 4 - this.warp * 0.04);
          g.strokeStyle = `rgba(${st.c},${a})`;
          g.lineWidth = st.s * (0.4 + st.r);
          g.beginPath();
          g.moveTo(cx + Math.cos(st.a) * pr * R, cy + Math.sin(st.a) * pr * R);
          g.lineTo(x, y);
          g.stroke();
        } else {
          const sz = st.s * (0.4 + st.r * 1.2);
          g.fillStyle = `rgba(${st.c},${a})`;
          g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      for (const sh of this.shoots) {
        const gr = g.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 0.15, sh.y - sh.vy * 0.15);
        gr.addColorStop(0, `rgba(255,255,255,${sh.life})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = gr; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(sh.x - sh.vx * 0.15, sh.y - sh.vy * 0.15); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.warp = Math.min(1.4, this.warp + 0.18 * d.lines + (d.lines >= 4 ? 0.5 : 0) + (d.tspin ? 0.3 : 0)); }
  }

  // =========================================================
  // 1 深海：光束、氣泡、海雪、隨節拍收縮的水母
  // =========================================================
  class DeepSea {
    constructor(low) { this.low = low; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#0b5578'], [0.35, '#073452'], [0.75, '#03172b'], [1, '#010812']]);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.5, -h * 0.1, w * 0.9, '120,220,255', 0.18);
      // 海床
      g.fillStyle = '#010610';
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w + 20; x += 20) g.lineTo(x, h * 0.9 - Math.abs(Math.sin(x * 0.013)) * h * 0.05 - Math.sin(x * 0.041) * h * 0.012);
      g.lineTo(w, h); g.closePath(); g.fill();
      // 光束素材
      const ray = (this.ray = layer(120, 600));
      const rg = ray.g;
      const gr = rg.createLinearGradient(0, 0, 0, 600);
      gr.addColorStop(0, 'rgba(170,240,255,0.55)'); gr.addColorStop(1, 'rgba(170,240,255,0)');
      rg.fillStyle = gr;
      rg.beginPath(); rg.moveTo(40, 0); rg.lineTo(80, 0); rg.lineTo(120, 600); rg.lineTo(0, 600); rg.closePath(); rg.fill();
      this.rays = [];
      for (let i = 0; i < 6; i++) this.rays.push({ x: rand(-0.1, 1.1), w: rand(0.6, 1.6), a: rand(0.08, 0.18), ph: rand(0, TAU), sp: rand(0.2, 0.5) });
      // 水母素材
      this.jellyImg = {};
      for (const [key, col] of [['c', '120,230,255'], ['p', '210,140,255'], ['k', '255,150,210']]) {
        const J = layer(80, 60);
        const jg = J.g;
        const jr = jg.createRadialGradient(40, 40, 2, 40, 40, 38);
        jr.addColorStop(0, `rgba(${col},0.85)`); jr.addColorStop(0.6, `rgba(${col},0.35)`); jr.addColorStop(1, `rgba(${col},0)`);
        jg.fillStyle = jr;
        jg.beginPath(); jg.ellipse(40, 40, 36, 32, 0, Math.PI, 0); jg.closePath(); jg.fill();
        jg.strokeStyle = `rgba(${col},0.7)`; jg.lineWidth = 1.5;
        jg.beginPath(); jg.ellipse(40, 40, 30, 26, 0, Math.PI, 0); jg.stroke();
        this.jellyImg[key] = { img: J, col };
      }
      this.jellies = [];
      const keys = ['c', 'p', 'k'];
      for (let i = 0; i < (this.low ? 2 : 4); i++) this.jellies.push({ x: rand(0.05, 0.95) * w, y: rand(0.2, 1) * h, s: rand(0.5, 1.1), k: keys[i % 3], ph: rand(0, TAU), vx: rand(-6, 6) });
      this.bubbles = [];
      for (let i = 0; i < (this.low ? 15 : 36); i++) this.bubbles.push(this.newBubble(true));
      this.snow = [];
      for (let i = 0; i < (this.low ? 30 : 80); i++) this.snow.push({ x: rand(0, w), y: rand(0, h), v: rand(4, 14), s: rand(0.6, 1.8), ph: rand(0, TAU) });
    }
    newBubble(anywhere, x, y) {
      return { x: x != null ? x : rand(0, this.w), y: y != null ? y : anywhere ? rand(0, this.h) : this.h + 10, r: rand(1.5, 5), v: rand(25, 70), ph: rand(0, TAU), temp: x != null };
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.1, s);
      for (const b of this.bubbles) { b.y -= b.v * s; b.ph += s * 3; }
      this.bubbles = this.bubbles.filter((b) => b.y > -20 || !b.temp);
      for (const b of this.bubbles) if (b.y < -20) Object.assign(b, this.newBubble(false));
      for (const p of this.snow) { p.y += p.v * s; p.ph += s; if (p.y > this.h) { p.y = -5; p.x = rand(0, this.w); } }
      const b = this.beat || 0;
      for (const j of this.jellies) {
        j.y -= (6 + b * 30) * j.s * s;
        j.x += j.vx * s;
        if (j.y < -80) { j.y = this.h + 60; j.x = rand(0.05, 0.95) * this.w; }
      }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
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
      g.globalAlpha = 1;
      for (const p of this.snow) {
        g.fillStyle = `rgba(200,240,255,${0.25 + 0.2 * Math.sin(p.ph)})`;
        g.fillRect(p.x + Math.sin(p.ph) * 4, p.y, p.s, p.s);
      }
      // 水母：在拍點收縮、推進
      this.beat = beat;
      for (const j of this.jellies) {
        const pulse = beat;
        const J = this.jellyImg[j.k];
        const sx = 80 * j.s * (1 - pulse * 0.12), sy = 60 * j.s * (1 + pulse * 0.1);
        g.drawImage(J.img.cv, j.x - sx / 2, j.y - sy * 0.66, sx, sy);
        g.strokeStyle = `rgba(${J.col},0.35)`; g.lineWidth = 1.2;
        for (let k = 0; k < 5; k++) {
          const bx = j.x + (k - 2) * 7 * j.s;
          g.beginPath(); g.moveTo(bx, j.y);
          for (let q = 1; q <= 6; q++) g.lineTo(bx + Math.sin(t / 400 + q * 0.8 + k + j.ph) * 4 * j.s, j.y + q * 9 * j.s);
          g.stroke();
        }
      }
      for (const b of this.bubbles) {
        g.strokeStyle = 'rgba(190,240,255,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.arc(b.x + Math.sin(b.ph) * 3, b.y, b.r, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(b.x + Math.sin(b.ph) * 3 - b.r * 0.4, b.y - b.r * 0.5, 1.2, 1.2);
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
    }
  }

  // =========================================================
  // 2 極光：雪山夜空與飄動的光幕
  // =========================================================
  class Aurora {
    constructor(low) { this.low = low; this.flash = 0; }
    resize(w, h) {
      this.w = w; this.h = h;
      const L = (this.bg = layer(w, h));
      const g = L.g;
      g.fillStyle = vgrad(g, h, [[0, '#01020a'], [0.5, '#04101f'], [0.8, '#0a2234'], [1, '#03080f']]);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(230,240,255,${rand(0.15, 0.7)})`;
        const s = rand(0.5, 1.4);
        g.fillRect(rand(0, w), rand(0, h * 0.75), s, s);
      }
      const mountain = (base, amp, color, seed, cap) => {
        g.fillStyle = color;
        g.beginPath(); g.moveTo(0, h);
        const pts = [];
        for (let x = 0; x <= w + 30; x += 30) {
          const y = base - Math.abs(Math.sin(x * 0.006 + seed)) * amp - Math.sin(x * 0.021 + seed * 2) * amp * 0.25;
          pts.push([x, y]); g.lineTo(x, y);
        }
        g.lineTo(w, h); g.closePath(); g.fill();
        if (cap) {
          g.strokeStyle = 'rgba(200,230,255,0.18)'; g.lineWidth = 1.5;
          g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      };
      mountain(h * 0.84, h * 0.14, '#0a1726', 1.3, true);
      mountain(h * 0.92, h * 0.09, '#040912', 4.1, false);
      // 光幕條紋素材
      this.strips = [];
      for (const [lo, hi] of [['90,255,170', '170,90,255'], ['70,210,255', '120,255,200'], ['170,100,255', '255,110,200']]) {
        const S = layer(4, 256);
        const gr = S.g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, `rgba(${hi},0)`);
        gr.addColorStop(0.45, `rgba(${hi},0.28)`);
        gr.addColorStop(0.88, `rgba(${lo},0.95)`);
        gr.addColorStop(1, `rgba(${lo},0)`);
        S.g.fillStyle = gr; S.g.fillRect(0, 0, 4, 256);
        this.strips.push(S);
      }
      this.ribbons = [
        { base: 0.3, hgt: 0.3, sp: 1, ph: 0, strip: 0, amp: 0.05 },
        { base: 0.22, hgt: 0.22, sp: 0.7, ph: 2, strip: 1, amp: 0.04 },
        { base: 0.4, hgt: 0.2, sp: 1.3, ph: 4, strip: 2, amp: 0.035 },
      ];
      if (this.low) this.ribbons.length = 2;
      this.snow = [];
      for (let i = 0; i < (this.low ? 15 : 40); i++) this.snow.push({ x: rand(0, w), y: rand(0, h), v: rand(10, 30), s: rand(0.8, 2) });
    }
    update(dt) {
      const s = dt / 1000;
      this.flash *= Math.pow(0.15, s);
      for (const p of this.snow) { p.y += p.v * s; p.x += Math.sin(p.y * 0.02) * 0.3; if (p.y > this.h) { p.y = -5; p.x = rand(0, this.w); } }
    }
    draw(g, t, beat, B) {
      const w = this.w, h = this.h;
      g.drawImage(this.bg.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const step = this.low ? 10 : 6;
      const bright = 0.75 + beat * 0.3 + this.flash * 0.6;
      const ts = t / 1000;
      for (const r of this.ribbons) {
        const S = this.strips[r.strip];
        const hh = r.hgt * h * (1 + this.flash * 0.25);
        for (let x = 0; x < w; x += step) {
          const y = r.base * h
            + Math.sin(x * 0.0045 + ts * 0.35 * r.sp + r.ph) * h * r.amp
            + Math.sin(x * 0.013 - ts * 0.6 * r.sp + r.ph * 2) * h * r.amp * 0.4;
          const a = (0.3 + 0.3 * Math.sin(x * 0.011 + ts * 0.9 * r.sp + r.ph) + 0.1 * Math.sin(x * 0.029 - ts * 1.3)) * bright;
          if (a <= 0.02) continue;
          g.globalAlpha = Math.min(1, a);
          g.drawImage(S.cv, x, Math.round(y - hh), step, Math.round(hh));
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(230,245,255,0.6)';
      for (const p of this.snow) g.fillRect(p.x, p.y, p.s, p.s);
      g.globalCompositeOperation = 'source-over';
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.2 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
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
      g.strokeStyle = 'rgba(40,15,40,0.75)'; g.lineWidth = 1.4; g.lineCap = 'round';
      for (const b of this.birds) {
        const f = Math.sin(b.ph) * 5 * b.s;
        g.beginPath(); g.moveTo(b.x - 7 * b.s, b.y - f); g.lineTo(b.x, b.y); g.lineTo(b.x + 7 * b.s, b.y - f); g.stroke();
      }
    }
    burst(d) { this.flash = Math.min(1.5, this.flash + 0.25 * d.lines + (d.lines >= 4 ? 0.5 : 0)); }
  }

  root.LumenScenes = [Starfield, DeepSea, Aurora, NeonCity, Sakura, Sunset];
})(typeof self !== 'undefined' ? self : this);
