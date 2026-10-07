'use strict';
/*
 * 狗狗哇沙米光律方塊 — 連線（WebRTC 點對點，PeerJS 公用配對服務）
 * 房主用「前綴 + 4 位數房號」當 Peer ID；加入者連到該 ID。
 * 只在進入對戰時才載入 PeerJS，單機遊戲完全不受影響。
 */
(function (root) {
  const PREFIX = 'gwlumen-v1-';
  const LIB = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

  function loadLib() {
    if (root.Peer) return Promise.resolve();
    if (loadLib.p) return loadLib.p;
    loadLib.p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB; s.async = true;
      s.onload = () => res();
      s.onerror = () => { loadLib.p = null; rej(new Error('無法載入連線元件，請確認網路後再試')); };
      document.head.appendChild(s);
    });
    return loadLib.p;
  }

  function peerOptions() {
    // 測試用：?peerhost=localhost&peerport=9000 可改連自架的配對伺服器
    const q = new URLSearchParams(location.search);
    const base = {
      debug: 0,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] },
    };
    if (q.get('peerhost')) return Object.assign(base, { host: q.get('peerhost'), port: +q.get('peerport') || 9000, path: q.get('peerpath') || '/', secure: false });
    return base;
  }

  function errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '找不到這個房號，請確認房號是否正確、房主是否還在等待';
    if (t === 'unavailable-id') return '房號重複，請再試一次';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '無法連到配對伺服器，請確認網路後再試';
    if (t === 'browser-incompatible') return '這個瀏覽器不支援連線對戰，請改用 Chrome';
    if (t === 'webrtc' || t === 'negotiation-failed') return '無法建立直連（可能是行動網路限制），建議兩人連同一個 Wi-Fi';
    return (e && e.message) || '連線發生錯誤';
  }

  class Net {
    constructor(handlers) {
      this.h = handlers || {};
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.isHost = false;
    }

    emit(name, ...args) { if (this.h[name]) this.h[name](...args); }

    openPeer(id) {
      return new Promise((res, rej) => {
        const p = id ? new root.Peer(id, peerOptions()) : new root.Peer(peerOptions());
        let done = false;
        p.on('open', () => {
          if (done) return; done = true;
          this.peer = p;
          p.on('error', (e) => {
            const t = e && e.type;
            if (this.joining && (t === 'peer-unavailable' || t === 'network')) return; // 加入重試中，由 join() 處理
            if (this.isHost && /^(network|server-error|socket-error|socket-closed|unavailable-id|disconnected)$/.test(t || '')) { this.emit('unstable'); return; } // keepAlive() 會處理
            this.emit('error', errText(e), e);
          });
          p.on('disconnected', () => { setTimeout(() => { try { if (!p.destroyed && p.disconnected) p.reconnect(); } catch (_) { /* ignore */ } }, 500); });
          res(p);
        });
        p.on('error', (e) => { if (done) return; done = true; try { p.destroy(); } catch (_) { /* ignore */ } rej(e); });
        setTimeout(() => { if (done) return; done = true; try { p.destroy(); } catch (_) { /* ignore */ } rej({ type: 'network' }); }, 12000);
      });
    }

    // 房主：用指定（或隨機）房號註冊。手機切到 LINE 傳房號時頁面會被暫停、和配對伺服器斷線，
    // 回來時 keepAlive() 會用同一個房號重新註冊，房號不會失效。
    async host(preferred) {
      await loadLib();
      this.isHost = true;
      let lastErr = null;
      for (let i = 0; i < 6; i++) {
        const code = i === 0 && preferred ? String(preferred) : String(1000 + Math.floor(Math.random() * 9000));
        try {
          await this.openHostPeer(code);
          this.code = code;
          break;
        } catch (e) {
          lastErr = e;
          if (!e || e.type !== 'unavailable-id') throw new Error(errText(e));
        }
      }
      if (!this.code) throw new Error(errText(lastErr));
      clearInterval(this.aliveTimer);
      this.aliveTimer = setInterval(() => this.keepAlive(), 3000);
      return this.code;
    }

    async openHostPeer(code) {
      const p = await this.openPeer(PREFIX + code);
      p.on('connection', (c) => {
        if (this.conn && this.conn.open) {
          c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 400); });
          return;
        }
        this.wire(c);
      });
      return p;
    }

    // 房主在等人時：斷線就重連；整個 Peer 被關掉就用同一個房號重新註冊
    async keepAlive() {
      if (!this.isHost || !this.code || this.closed || this.reviving) return;
      const p = this.peer;
      if (p && !p.destroyed && !p.disconnected) { this.dcTries = 0; return; }
      if (p && !p.destroyed && p.disconnected && (this.dcTries = (this.dcTries || 0) + 1) <= 2) { try { p.reconnect(); } catch (_) { /* ignore */ } return; }
      if (this.connected) { try { p.reconnect(); } catch (_) { /* ignore */ } return; } // 比賽中不要拆掉現有連線
      this.dcTries = 0;
      try { if (p && !p.destroyed) p.destroy(); } catch (_) { /* ignore */ }
      this.reviving = true;
      try {
        await this.openHostPeer(this.code); // 伺服器可能還留著舊的 ID，失敗就等下一輪再試
        this.emit('revived');
      } catch (_) { /* 下一輪再試 */ }
      this.reviving = false;
    }

    // 加入：找不到房間時會持續重試一段時間（房主可能正在 LINE 傳房號，頁面暫停中）
    async join(code) {
      await loadLib();
      this.isHost = false;
      this.code = code;
      try { await this.openPeer(null); } catch (e) { throw new Error(errText(e)); }
      let attemptErr = null;
      this.joining = true;
      this.peer.on('error', (e) => { if (attemptErr) attemptErr(e); });
      const deadline = Date.now() + 60000;
      let n = 0, lastType = null;
      while (!this.closed && Date.now() < deadline) {
        n++;
        if (n > 1) this.emit('retry', n, lastType);
        const r = await new Promise((res) => {
          const c = this.peer.connect(PREFIX + code, { reliable: true });
          const t = setTimeout(() => fin({ type: 'timeout' }), 9000);
          const fin = (v) => { clearTimeout(t); attemptErr = null; res(v); };
          attemptErr = (e) => { try { c.close(); } catch (_) { /* ignore */ } fin(e); };
          c.on('open', () => { this.wire(c, true); fin(null); });
          c.on('error', (e) => { if (!c.open) { try { c.close(); } catch (_) { /* ignore */ } fin(e); } });
        });
        if (!r) { this.joining = false; return; }
        lastType = r.type;
        if (this.closed) break;
        if (r.type === 'network' || r.type === 'server-error' || r.type === 'socket-error' || r.type === 'socket-closed') {
          try { if (this.peer && this.peer.disconnected && !this.peer.destroyed) this.peer.reconnect(); } catch (_) { /* ignore */ }
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      this.joining = false;
      if (this.closed) throw new Error('已取消');
      if (lastType === 'peer-unavailable') throw new Error('找不到這個房號：請確認房號，並請房主回到遊戲的房間畫面');
      throw new Error('連線逾時：兩支手機之間無法直連（可能是行動網路限制），建議兩人連同一個 Wi-Fi 再試');
    }

    wire(c, alreadyOpen) {
      this.conn = c;
      const onOpen = () => {
        this.emit('connected');
        const pc = c.peerConnection;
        if (pc) pc.addEventListener('iceconnectionstatechange', () => {
          if (pc.iceConnectionState === 'failed') this.emit('error', '無法建立直連（可能是行動網路限制），建議兩人連同一個 Wi-Fi');
          if (pc.iceConnectionState === 'disconnected') this.emit('unstable');
        });
      };
      if (alreadyOpen) onOpen(); else c.on('open', onOpen);
      c.on('data', (d) => this.emit('data', d));
      c.on('close', () => { if (this.conn === c) { this.conn = null; this.emit('closed'); } });
      c.on('error', (e) => this.emit('error', errText(e), e));
    }

    get connected() { return !!(this.conn && this.conn.open); }

    send(msg) { if (this.connected) { try { this.conn.send(msg); } catch (_) { /* ignore */ } } }

    close() {
      this.closed = true;
      clearInterval(this.aliveTimer);
      const c = this.conn, p = this.peer;
      this.conn = null; this.peer = null;
      try { if (c) c.close(); } catch (_) { /* ignore */ }
      try { if (p) p.destroy(); } catch (_) { /* ignore */ }
    }
  }

  root.LumenNet = { Net, loadLib, PREFIX };
})(typeof self !== 'undefined' ? self : this);
