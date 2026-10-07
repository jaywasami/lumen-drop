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
          p.on('error', (e) => this.emit('error', errText(e), e));
          p.on('disconnected', () => { try { if (!p.destroyed) p.reconnect(); } catch (_) { /* ignore */ } });
          res(p);
        });
        p.on('error', (e) => { if (done) return; done = true; try { p.destroy(); } catch (_) { /* ignore */ } rej(e); });
        setTimeout(() => { if (done) return; done = true; try { p.destroy(); } catch (_) { /* ignore */ } rej({ type: 'network' }); }, 12000);
      });
    }

    async host() {
      await loadLib();
      this.isHost = true;
      let lastErr = null;
      for (let i = 0; i < 6; i++) {
        const code = String(1000 + Math.floor(Math.random() * 9000));
        try {
          await this.openPeer(PREFIX + code);
          this.code = code;
          break;
        } catch (e) {
          lastErr = e;
          if (!e || e.type !== 'unavailable-id') throw new Error(errText(e));
        }
      }
      if (!this.code) throw new Error(errText(lastErr));
      this.peer.on('connection', (c) => {
        if (this.conn && this.conn.open) {
          c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 400); });
          return;
        }
        this.wire(c);
      });
      return this.code;
    }

    async join(code) {
      await loadLib();
      this.isHost = false;
      try { await this.openPeer(null); } catch (e) { throw new Error(errText(e)); }
      this.code = code;
      return new Promise((res, rej) => {
        let done = false;
        const c = this.peer.connect(PREFIX + code, { reliable: true });
        const onErr = (msg) => { if (done) return; done = true; rej(new Error(msg)); };
        this.peer.on('error', (e) => onErr(errText(e)));
        c.on('open', () => { if (done) return; done = true; res(); });
        this.wire(c);
        setTimeout(() => onErr('連線逾時：找不到房間，或兩支手機之間無法直連（建議連同一個 Wi-Fi）'), 15000);
      });
    }

    wire(c) {
      this.conn = c;
      c.on('open', () => {
        this.emit('connected');
        const pc = c.peerConnection;
        if (pc) pc.addEventListener('iceconnectionstatechange', () => {
          if (pc.iceConnectionState === 'failed') this.emit('error', '無法建立直連（可能是行動網路限制），建議兩人連同一個 Wi-Fi');
          if (pc.iceConnectionState === 'disconnected') this.emit('unstable');
        });
      });
      c.on('data', (d) => this.emit('data', d));
      c.on('close', () => { if (this.conn === c) { this.conn = null; this.emit('closed'); } });
      c.on('error', (e) => this.emit('error', errText(e), e));
    }

    get connected() { return !!(this.conn && this.conn.open); }

    send(msg) { if (this.connected) { try { this.conn.send(msg); } catch (_) { /* ignore */ } } }

    close() {
      const c = this.conn, p = this.peer;
      this.conn = null; this.peer = null;
      try { if (c) c.close(); } catch (_) { /* ignore */ }
      try { if (p) p.destroy(); } catch (_) { /* ignore */ }
    }
  }

  root.LumenNet = { Net, loadLib, PREFIX };
})(typeof self !== 'undefined' ? self : this);
