'use strict';
/*
 * 光律方塊 — WebGL 後製
 * 把 2D 畫面當成貼圖：泛光（bloom，兩層模糊）、衝擊波扭曲、色差、暗角
 */
(function (root) {
  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const BRIGHT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThr;
void main() {
  vec3 c = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.3, l), 1.0);
}`;

  const BLUR = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.227;
  s += (texture2D(uTex, vUv + uDir * 1.385).rgb + texture2D(uTex, vUv - uDir * 1.385).rgb) * 0.316;
  s += (texture2D(uTex, vUv + uDir * 3.231).rgb + texture2D(uTex, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

  const COPY = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 0.5, -0.5)).rgb
         + texture2D(uTex, vUv + uTexel * vec2(-0.5,  0.5)).rgb
         + texture2D(uTex, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

  const COMPOSITE = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uBloom;
uniform float uAberr;
uniform float uVig;
uniform float uFlash;
uniform float uGrain;
uniform float uTime;
uniform vec2 uAspect;
uniform vec4 uW0;
uniform vec4 uW1;
uniform vec4 uW2;
vec2 wave(vec2 uv, vec4 w) {
  if (w.w <= 0.0) return vec2(0.0);
  vec2 d = (uv - w.xy) * uAspect;
  float dist = length(d);
  float diff = dist - w.z;
  float width = 0.09;
  if (abs(diff) > width) return vec2(0.0);
  float x = diff / width;
  float k = (1.0 - x * x);
  return (d / max(dist, 0.0001)) / uAspect * sin(x * 3.14159) * k * w.w * 0.02;
}
void main() {
  vec2 off = wave(vUv, uW0) + wave(vUv, uW1) + wave(vUv, uW2);
  vec2 uv = vUv - off;
  float ab = (uAberr + length(off) * 40.0) * 0.006;
  vec2 dc = uv - 0.5;
  vec3 col;
  col.r = texture2D(uScene, uv + dc * ab).r;
  col.g = texture2D(uScene, uv).g;
  col.b = texture2D(uScene, uv - dc * ab).b;
  vec3 bloom = texture2D(uBloom1, uv).rgb * 0.7 + texture2D(uBloom2, uv).rgb * 0.6;
  col += bloom * uBloom;
  col += vec3(length(off) * 18.0) * 0.18;
  float v = smoothstep(1.05, 0.35, length((vUv - 0.5) * vec2(1.1, 0.95)));
  col *= mix(1.0, v, uVig);
  col = mix(col, vec3(1.0), uFlash);
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

  class Post {
    constructor(canvas) {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('no webgl');
      this.gl = gl;
      this.canvas = canvas;
      this.lost = false;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.progs = {
        bright: this.program(BRIGHT, ['uTex', 'uTexel', 'uThr']),
        blur: this.program(BLUR, ['uTex', 'uDir']),
        copy: this.program(COPY, ['uTex', 'uTexel']),
        comp: this.program(COMPOSITE, ['uScene', 'uBloom1', 'uBloom2', 'uBloom', 'uAberr', 'uVig', 'uFlash', 'uGrain', 'uTime', 'uAspect', 'uW0', 'uW1', 'uW2']),
      };
      this.src = this.texture();
      this.w = 0; this.h = 0;
    }

    program(fs, uniforms) {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
      return { p, u };
    }

    texture() {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    target(w, h) {
      const gl = this.gl;
      const tex = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }

    resize(w, h) {
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      this.canvas.width = w; this.canvas.height = h;
      const q = (d) => [Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d))];
      this.q1 = this.target(...q(4)); this.q2 = this.target(...q(4));
      this.e1 = this.target(...q(8)); this.e2 = this.target(...q(8));
    }

    pass(prog, target, setup) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); }
      setup(prog.u);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    bind(unit, tex) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    blur(a, b, radius) {
      const gl = this.gl;
      const P = this.progs.blur;
      this.pass(P, b, (u) => { this.bind(0, a.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, radius / a.w, 0); });
      this.pass(P, a, (u) => { this.bind(0, b.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, radius / b.h); });
    }

    // p: { bloom, thr, aberr, vig, flash, waves: [{x, y, r, s}] }（x、y 為 0~1，y 由上往下）
    render(srcCanvas, p) {
      if (this.lost) return false;
      const gl = this.gl;
      this.resize(srcCanvas.width, srcCanvas.height);
      gl.bindTexture(gl.TEXTURE_2D, this.src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

      const { bright, copy, comp } = this.progs;
      this.pass(bright, this.q1, (u) => {
        this.bind(0, this.src); gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uTexel, 1 / this.w, 1 / this.h);
        gl.uniform1f(u.uThr, p.thr);
      });
      this.blur(this.q1, this.q2, 1);
      this.blur(this.q1, this.q2, 2);
      this.pass(copy, this.e1, (u) => {
        this.bind(0, this.q1.tex); gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uTexel, 1 / this.q1.w, 1 / this.q1.h);
      });
      this.blur(this.e1, this.e2, 1.5);
      this.blur(this.e1, this.e2, 3);

      const waves = p.waves || [];
      this.pass(comp, null, (u) => {
        this.bind(0, this.src); gl.uniform1i(u.uScene, 0);
        this.bind(1, this.q1.tex); gl.uniform1i(u.uBloom1, 1);
        this.bind(2, this.e1.tex); gl.uniform1i(u.uBloom2, 2);
        gl.uniform1f(u.uBloom, p.bloom);
        gl.uniform1f(u.uAberr, p.aberr || 0);
        gl.uniform1f(u.uVig, p.vig || 0);
        gl.uniform1f(u.uFlash, p.flash || 0);
        gl.uniform1f(u.uGrain, p.grain || 0);
        gl.uniform1f(u.uTime, (performance.now() / 1000) % 100);
        gl.uniform2f(u.uAspect, this.w / this.h, 1);
        ['uW0', 'uW1', 'uW2'].forEach((n, i) => {
          const w = waves[i];
          if (w) gl.uniform4f(u[n], w.x, 1 - w.y, w.r, w.s);
          else gl.uniform4f(u[n], 0, 0, 0, 0);
        });
      });
      return true;
    }
  }

  root.LumenPost = {
    create(canvas) {
      try { return new Post(canvas); } catch (e) { console.warn('WebGL 後製停用：', e.message); return null; }
    },
  };
})(typeof self !== 'undefined' ? self : this);
