'use strict';
/*
 * 狗狗哇沙米光律方塊 — 音訊引擎（Web Audio 即時合成）
 * - 程式作曲：每個場景一首曲子，依「階段」逐層加入樂器
 * - 換場景時在小節線上交叉淡入淡出
 * - 玩家動作音效依當下和弦取音，聽起來像在演奏
 */
(function (root) {
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    gong: [0, 2, 4, 7, 9], // 五聲音階：宮調
    zhi: [0, 2, 5, 7, 9], // 五聲音階：徵調
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    hijaz: [0, 1, 4, 5, 7, 8, 10], // 西域風
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 鼓組各聲部最早出現的階段
  const DRUM_STAGE = { kick: 2, kickSoft: 2, tom: 2, hat: 2, shaker: 2, tanggu: 2, woodblock: 2, snare: 3, clap: 3, rim: 3, ohat: 3, cymbal: 3 };

  // ================= 曲目 =================
  // prog：每小節和弦根音（音階級數，0 起算）
  // arpSeq：16 格，數字為「延伸和弦音」索引（-1 休止）
  // bassSeq：16 格字元 R=根音 5=五度 3=三度 O=高八度 -=延長 .=休止
  // leadSeq：[A, B] 兩段 2 小節動機，元素 [起始格, 音階級數, 長度格數]
  const SONGS = [
    {
      name: '星空', bpm: 86, root: 62, scale: 'lydian', prog: [0, 1, 5, 4], sevenths: true,
      pad: 'glass', arp: 'bell', bass: 'sub', lead: 'soft', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.1,
      arpSeq: [0, -1, 2, -1, 4, -1, 3, -1, 5, -1, 2, -1, 6, -1, 4, -1],
      bassSeq: 'R-------R---5---',
      drums: { kickSoft: 'x.........x.....', snare: '....x.......x...', hat: '..x...x...x..xx.' },
      leadSeq: [
        [[0, 4, 4], [4, 6, 2], [6, 7, 6], [12, 6, 2], [14, 4, 2], [16, 5, 8], [24, 4, 4], [28, 2, 4]],
        [[0, 4, 4], [4, 6, 2], [6, 9, 6], [12, 8, 2], [14, 7, 2], [16, 6, 8], [24, 4, 8]],
      ],
    },
    {
      name: '深海', bpm: 72, root: 57, scale: 'dorian', prog: [0, 3, 6, 4], sevenths: true,
      pad: 'warm', arp: 'drop', bass: 'sub', lead: 'whale', arpOct: 1, bassOct: -2, leadOct: 0, wet: 1.4,
      arpSeq: [0, -1, -1, 4, -1, -1, 2, -1, -1, 5, -1, -1, 3, -1, -1, -1],
      bassSeq: 'R-------R-----5-',
      drums: { kickSoft: 'x.......x.......', shaker: '..x...x...x...x.', rim: '....x.......x...' },
      leadSeq: [
        [[0, 4, 12], [16, 6, 8], [24, 5, 8]],
        [[0, 7, 8], [8, 6, 8], [16, 4, 16]],
      ],
    },
    {
      name: '極光', bpm: 100, root: 64, scale: 'major', prog: [0, 4, 5, 3], sevenths: false,
      pad: 'choir', arp: 'glass', bass: 'round', lead: 'flute', arpOct: 0, bassOct: -2, leadOct: 0, wet: 1.2,
      arpSeq: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 3, 2, 1],
      bassSeq: 'R---R---R-5-O---',
      drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      leadSeq: [
        [[0, 7, 6], [6, 6, 2], [8, 4, 8], [16, 5, 6], [22, 4, 2], [24, 2, 8]],
        [[0, 4, 4], [4, 5, 4], [8, 7, 8], [16, 9, 6], [22, 8, 2], [24, 7, 8]],
      ],
    },
    {
      name: '水墨', bpm: 76, epic: 'eastern', vol: 0.72, root: 62, scale: 'gong', prog: [0, 4, 3, 1], sevenths: false, gong: true,
      pad: 'warm', arp: 'zheng', bass: 'round', lead: 'dizi', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.3,
      arpSeq: [0, -1, 1, -1, 2, -1, 3, -1, 4, -1, 3, -1, 2, -1, 1, -1],
      bassSeq: 'R-------5-------',
      drums: { tanggu: 'x.......x.......', woodblock: '....x.......x.x.' },
      leadSeq: [
        [[0, 4, 6], [6, 3, 2], [8, 2, 4], [12, 1, 4], [16, 2, 6], [22, 1, 2], [24, 0, 8]],
        [[0, 5, 4], [4, 6, 4], [8, 7, 6], [14, 6, 2], [16, 5, 4], [20, 4, 4], [24, 3, 8]],
      ],
    },
    {
      name: '霓虹都市', bpm: 116, root: 53, scale: 'minor', prog: [0, 5, 2, 6], sevenths: false, pump: true,
      pad: 'saw', arp: 'pluck', bass: 'saw', lead: 'saw', arpOct: 1, bassOct: -1, leadOct: 1, wet: 0.9,
      arpSeq: [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 6, 5, 4, 2, 1],
      bassSeq: 'R-O-R-O-R-O-R-O-',
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...' },
      leadSeq: [
        [[0, 4, 4], [4, 3, 2], [6, 2, 2], [8, 0, 6], [14, 2, 2], [16, 3, 8], [24, 4, 4], [28, 6, 4]],
        [[0, 7, 4], [4, 6, 2], [6, 4, 2], [8, 3, 6], [14, 4, 2], [16, 2, 8], [24, 0, 8]],
      ],
    },
    {
      name: '櫻花', bpm: 90, root: 62, scale: 'major', prog: [0, 5, 3, 4], sevenths: false, swing: 0.08,
      pad: 'warm', arp: 'koto', bass: 'round', lead: 'flute', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.1,
      arpSeq: [0, -1, 1, 2, -1, 4, -1, 2, 0, -1, 1, 2, 4, -1, 5, -1],
      bassSeq: 'R-------5-------',
      drums: { tom: 'x.......x..x....', shaker: '....x.......x...', rim: '......x.......x.' },
      leadSeq: [
        [[0, 4, 6], [6, 5, 2], [8, 4, 4], [12, 2, 4], [16, 1, 6], [22, 2, 2], [24, 0, 8]],
        [[0, 2, 4], [4, 4, 4], [8, 5, 6], [14, 7, 2], [16, 8, 8], [24, 7, 4], [28, 5, 4]],
      ],
    },
    {
      name: '燈節', bpm: 118, epic: 'eastern', vol: 0.72, root: 55, scale: 'zhi', prog: [0, 3, 1, 4], sevenths: false, gong: true,
      pad: 'saw', arp: 'pipa', bass: 'round', lead: 'erhu', arpOct: 1, bassOct: -1, leadOct: 1, wet: 0.9,
      arpSeq: [0, 1, 2, 1, 3, 2, 1, 0, 0, 2, 4, 2, 3, 1, 2, 1],
      bassSeq: 'R-R-5-R-R-R-5-O-',
      drums: { tanggu: 'x...x...x.x.x...', woodblock: '..x...x...x...x.', cymbal: '....x.......x...' },
      leadSeq: [
        [[0, 5, 3], [3, 4, 1], [4, 3, 4], [8, 2, 4], [12, 3, 2], [14, 4, 2], [16, 5, 6], [22, 7, 2], [24, 6, 8]],
        [[0, 7, 4], [4, 6, 2], [6, 5, 2], [8, 4, 6], [14, 3, 2], [16, 2, 4], [20, 1, 4], [24, 0, 8]],
      ],
    },
    {
      name: '夕陽雲海', bpm: 112, root: 58, scale: 'major', prog: [1, 4, 0, 5], sevenths: true, pump: true, swing: 0.1,
      pad: 'stab', padSeq: '..x...x...x...x.', arp: 'pluck', bass: 'saw', lead: 'soft', arpOct: 1, bassOct: -2, leadOct: 1, wet: 0.9,
      arpSeq: [0, -1, -1, 2, -1, -1, 4, -1, -1, 3, -1, -1, 5, -1, -1, -1],
      bassSeq: 'R--R--O-R--R-5-O',
      drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' },
      leadSeq: [
        [[0, 4, 3], [3, 5, 3], [6, 4, 2], [8, 2, 8], [16, 4, 3], [19, 5, 3], [22, 7, 2], [24, 6, 8]],
        [[0, 7, 3], [3, 6, 3], [6, 4, 2], [8, 5, 8], [16, 4, 4], [20, 2, 4], [24, 1, 8]],
      ],
    },
    {
      name: '竹林', bpm: 80, epic: 'eastern', root: 60, scale: 'gong', prog: [0, 3, 4, 2], sevenths: false, vol: 0.85,
      pad: 'warm', arp: 'qin', bass: 'round', lead: 'xiao', arpOct: 0, bassOct: -2, leadOct: 0, wet: 1.35,
      arpSeq: [0, -1, -1, 2, -1, -1, 4, -1, 3, -1, -1, 1, -1, -1, 2, -1],
      bassSeq: 'R-------R-------',
      drums: { woodblock: '....x.......x...', shaker: '..x...x...x...x.' },
      leadSeq: [
        [[0, 7, 8], [8, 9, 4], [12, 8, 4], [16, 7, 6], [22, 6, 2], [24, 5, 8]],
        [[0, 10, 6], [6, 9, 2], [8, 8, 8], [16, 9, 4], [20, 7, 4], [24, 6, 8]],
      ],
    },
    {
      name: '敦煌', bpm: 96, epic: 'eastern', root: 57, scale: 'hijaz', prog: [0, 1, 0, 6], sevenths: false, swing: 0.05, vol: 0.85,
      pad: 'choir', arp: 'oud', bass: 'round', lead: 'erhu', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.1,
      arpSeq: [0, 1, 2, 1, 0, -1, 2, 3, 4, 3, 2, -1, 1, 2, 1, 0],
      bassSeq: 'R--R--R-R--R-5--',
      drums: { tom: 'x..x..x...x.x...', rim: '..x...x...x...x.', cymbal: '........x.......' },
      leadSeq: [
        [[0, 4, 3], [3, 5, 1], [4, 4, 4], [8, 2, 2], [10, 1, 2], [12, 0, 4], [16, 1, 6], [22, 2, 2], [24, 4, 8]],
        [[0, 7, 4], [4, 6, 2], [6, 5, 2], [8, 4, 8], [16, 5, 3], [19, 4, 1], [20, 2, 4], [24, 1, 8]],
      ],
    },
    {
      name: '螢火森林', bpm: 92, root: 65, scale: 'major', prog: [0, 5, 3, 4], sevenths: true,
      pad: 'glass', arp: 'kalimba', bass: 'round', lead: 'soft', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.2,
      arpSeq: [0, -1, 2, 4, -1, 2, 5, -1, 4, -1, 2, 4, -1, 6, -1, 4],
      bassSeq: 'R-----R-5-----O-',
      drums: { kickSoft: 'x.......x.......', shaker: 'x.x.x.x.x.x.x.x.', rim: '....x.......x...' },
      leadSeq: [
        [[0, 4, 4], [4, 5, 2], [6, 4, 2], [8, 2, 8], [16, 0, 4], [20, 1, 4], [24, 2, 8]],
        [[0, 7, 4], [4, 6, 2], [6, 4, 2], [8, 5, 8], [16, 4, 4], [20, 2, 4], [24, 4, 8]],
      ],
    },
    {
      name: '冰晶洞窟', bpm: 84, root: 61, scale: 'minor', prog: [0, 5, 2, 6], sevenths: true,
      pad: 'glass', arp: 'celesta', bass: 'sub', lead: 'soft', arpOct: 1, bassOct: -2, leadOct: 1, wet: 1.5,
      arpSeq: [0, -1, 4, -1, 2, -1, 6, -1, 4, -1, 2, -1, 5, -1, 3, -1],
      bassSeq: 'R-------R---5---',
      drums: { kickSoft: 'x.........x.....', snare: '....x.......x...', hat: '..x.....x.x...x.' },
      leadSeq: [
        [[0, 7, 6], [6, 6, 2], [8, 4, 8], [16, 5, 6], [22, 4, 2], [24, 2, 8]],
        [[0, 4, 4], [4, 6, 4], [8, 7, 8], [16, 9, 4], [20, 8, 4], [24, 7, 8]],
      ],
    },
    {
      name: '雨夜', bpm: 78, root: 60, scale: 'dorian', prog: [0, 3, 1, 4], sevenths: true, swing: 0.16, rain: true,
      pad: 'warm', arp: 'epiano', bass: 'round', lead: 'soft', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.2,
      arpSeq: [0, -1, -1, 2, -1, 1, -1, 3, -1, -1, 2, -1, 4, -1, 3, -1],
      bassSeq: 'R------5R---3---',
      drums: { kickSoft: 'x......x..x.....', rim: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      leadSeq: [
        [[0, 4, 3], [3, 6, 3], [6, 7, 2], [8, 6, 8], [16, 4, 4], [20, 2, 4], [24, 3, 8]],
        [[0, 9, 4], [4, 7, 4], [8, 6, 6], [14, 4, 2], [16, 3, 8], [24, 2, 8]],
      ],
    },
    {
      name: '熔岩', bpm: 132, root: 52, scale: 'phrygian', prog: [0, 1, 0, 6], sevenths: false, pump: true, vol: 0.85,
      pad: 'saw', arp: 'pluck', bass: 'saw', lead: 'saw', arpOct: 1, bassOct: -1, leadOct: 1, wet: 0.8,
      arpSeq: [0, 0, 2, 0, 1, 0, 2, 4, 0, 0, 2, 0, 3, 2, 1, 0],
      bassSeq: 'R-RRR-RRR-RRR-O-',
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............xx', clap: '....x.......x...' },
      leadSeq: [
        [[0, 4, 2], [2, 3, 2], [4, 1, 4], [8, 0, 4], [12, 1, 4], [16, 4, 2], [18, 5, 2], [20, 4, 4], [24, 3, 8]],
        [[0, 7, 4], [4, 5, 4], [8, 4, 4], [12, 3, 4], [16, 1, 8], [24, 0, 8]],
      ],
    },
    {
      name: '長城', bpm: 104, root: 58, scale: 'gong', prog: [0, 3, 4, 2], sevenths: false, gong: true, epic: 'eastern', vol: 0.8,
      pad: 'choir', arp: 'pipa', bass: 'round', lead: 'suona', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.0,
      arpSeq: [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 4, 3, 2, 1],
      bassSeq: 'R---R-5-R---R-O-',
      drums: { tanggu: 'x...x...x..xx...', woodblock: '..x...x...x...x.', cymbal: '....x.......x...' },
      leadSeq: [
        [[0, 5, 4], [4, 6, 2], [6, 7, 2], [8, 8, 6], [14, 7, 2], [16, 6, 4], [20, 5, 4], [24, 4, 8]],
        [[0, 8, 3], [3, 7, 1], [4, 6, 4], [8, 5, 4], [12, 6, 4], [16, 7, 6], [22, 8, 2], [24, 10, 8]],
      ],
    },
    {
      name: '荷塘月色', bpm: 68, root: 62, scale: 'gong', prog: [0, 4, 3, 1], sevenths: false, swing: 0.1, epic: 'eastern', vol: 0.85,
      pad: 'warm', arp: 'zheng', bass: 'round', lead: 'erhu', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.4,
      arpSeq: [0, -1, 2, -1, 4, 3, -1, 2, 1, -1, 3, -1, 5, 4, -1, 2],
      bassSeq: 'R-------5-------',
      drums: { woodblock: '........x.......', shaker: '..x...x...x...x.' },
      leadSeq: [
        [[0, 4, 6], [6, 3, 2], [8, 2, 8], [16, 3, 4], [20, 4, 4], [24, 1, 8]],
        [[0, 5, 4], [4, 6, 4], [8, 7, 8], [16, 6, 4], [20, 4, 4], [24, 2, 8]],
      ],
    },
    {
      name: '仙山', bpm: 84, root: 59, scale: 'zhi', prog: [0, 3, 1, 4], sevenths: false, gong: true, epic: 'eastern', vol: 0.85,
      pad: 'choir', arp: 'zheng', bass: 'sub', lead: 'dizi', arpOct: 0, bassOct: -2, leadOct: 1, wet: 1.5,
      arpSeq: [0, 2, 4, -1, 3, -1, 2, 1, 0, 2, 4, -1, 5, -1, 4, 2],
      bassSeq: 'R-------R---5---',
      drums: { tanggu: 'x.......x.....x.', woodblock: '....x.......x...' },
      leadSeq: [
        [[0, 7, 8], [8, 6, 4], [12, 5, 4], [16, 4, 6], [22, 3, 2], [24, 2, 8]],
        [[0, 9, 4], [4, 8, 4], [8, 7, 8], [16, 8, 4], [20, 6, 4], [24, 5, 8]],
      ],
    },
  ];

  function degToMidi(song, deg, oct) {
    const s = SCALES[song.scale];
    const n = s.length;
    const o = Math.floor(deg / n);
    const d = ((deg % n) + n) % n;
    return song.root + s[d] + 12 * (o + (oct || 0));
  }
  function chordMidis(song, rootDeg, oct, size) {
    const n = size || (song.sevenths ? 4 : 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(degToMidi(song, rootDeg + i * 2, oct));
    return out;
  }
  // 延伸和弦音：索引 i → 和弦第 i%4 個音、往上 floor(i/4) 個八度
  function extTone(song, rootDeg, i, oct) {
    const tones = [0, 2, 4, song.sevenths ? 6 : 7];
    return degToMidi(song, rootDeg + tones[i % 4], oct + Math.floor(i / 4));
  }

  // ================= 引擎 =================
  const A = {
    ctx: null,
    musicVol: 0.6,
    sfxVol: 0.7,
    players: [],
    noiseBuf: null,
    sfxIdx: 0,
    boost: 0,
    build: false,
    SONGS,

    init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC({ latencyHint: 'interactive' }));

      this.masterFilter = c.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 20000;
      this.masterFilter.Q.value = 0.6;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = c.createGain();
      this.master.gain.value = 0.82;
      this.masterFilter.connect(comp); comp.connect(this.master); this.master.connect(c.destination);

      // 效果：延遲 + 殘響（音樂與音效共用）
      this.fxIn = c.createGain();
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.8);
      this.delay = c.createDelay(2);
      this.delay.delayTime.value = 0.375;
      const fb = c.createGain(); fb.gain.value = 0.32;
      const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
      const ret = c.createGain(); ret.gain.value = 0.85;
      this.fxIn.connect(this.reverb);
      this.fxIn.connect(this.delay);
      this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
      dlp.connect(this.reverb); dlp.connect(ret);
      this.reverb.connect(ret);
      ret.connect(this.masterFilter);

      // 音色亮度：強度越高濾波越開，聽起來越亮越飽滿
      this.musicTone = c.createBiquadFilter(); this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 2200; this.musicTone.Q.value = 0.8;
      this.wetTone = c.createBiquadFilter(); this.wetTone.type = 'lowpass'; this.wetTone.frequency.value = 2200;
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol;
      this.stageGain = c.createGain(); this.stageGain.gain.value = 0.8;
      this.musicBus.connect(this.musicTone); this.musicTone.connect(this.stageGain); this.stageGain.connect(this.masterFilter);
      this.musicWet = c.createGain(); this.musicWet.gain.value = this.musicVol;
      this.musicWet.connect(this.wetTone); this.wetTone.connect(this.fxIn);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.masterFilter);
      this.sfxWet = c.createGain(); this.sfxWet.gain.value = this.sfxVol * 0.8; this.sfxWet.connect(this.fxIn);
      this.sfxOut = { dry: this.sfxBus, wet: this.sfxWet };

      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      setInterval(() => this.tick(), 25);
    },

    makeImpulse(sec) {
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * sec);
      const buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      return buf;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },

    setMusicVolume(v) {
      this.musicVol = v;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.setTargetAtTime(v, t, 0.05);
      this.musicWet.gain.setTargetAtTime(v, t, 0.05);
    },
    setSfxVolume(v) {
      this.sfxVol = v;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sfxBus.gain.setTargetAtTime(v, t, 0.05);
      this.sfxWet.gain.setTargetAtTime(v * 0.8, t, 0.05);
    },
    setMuffled(on) {
      if (!this.ctx) return;
      this.masterFilter.frequency.setTargetAtTime(on ? 520 : 20000, this.ctx.currentTime, on ? 0.12 : 0.25);
    },

    // ---------- 合成基本單元 ----------
    connectOut(node, out, wet) {
      node.connect(out.dry);
      if (wet > 0 && out.wet) {
        const g = this.ctx.createGain(); g.gain.value = wet;
        node.connect(g); g.connect(out.wet);
      }
    },

    // o: t f dur peak waves[[type, cents, gain, ratio]] a d(=撥弦衰減) s r cut cutEnv cutTime q ftype pitchFrom glide vib out wet
    synth(o) {
      const c = this.ctx;
      const t = Math.max(o.t, c.currentTime);
      const g = c.createGain();
      let input = g;
      if (o.cut) {
        const f = c.createBiquadFilter();
        f.type = o.ftype || 'lowpass';
        f.Q.value = o.q || 0.7;
        f.frequency.setValueAtTime(Math.min(18000, o.cut * (o.cutEnv || 1)), t);
        if (o.cutEnv) f.frequency.exponentialRampToValueAtTime(o.cut, t + (o.cutTime || 0.15));
        f.connect(g);
        input = f;
      }
      const a = o.a || 0.005;
      const peak = o.peak || 0.1;
      let end;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (o.d) {
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.d);
        end = t + a + o.d + 0.05;
      } else {
        const dur = Math.max(o.dur || 0.2, a + 0.01);
        const r = o.r || 0.1;
        if (o.s != null && o.s < 1) g.gain.setTargetAtTime(peak * o.s, t + a, 0.12);
        g.gain.setTargetAtTime(0.0001, t + dur, r / 4);
        end = t + dur + r + 0.05;
      }
      let lfoGain = null;
      if (o.vib) {
        const lfo = c.createOscillator(); lfo.frequency.value = o.vib[0];
        lfoGain = c.createGain(); lfoGain.gain.value = o.f * o.vib[1];
        lfo.connect(lfoGain);
        lfo.start(t + 0.15); lfo.stop(end);
      }
      const waves = o.waves || [[o.wave || 'sine', 0, 1, 1]];
      for (const [type, cents, gain, ratio] of waves) {
        const osc = c.createOscillator();
        osc.type = type;
        const f = o.f * (ratio || 1);
        if (o.pitchFrom) {
          osc.frequency.setValueAtTime(f * o.pitchFrom, t);
          osc.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.03));
        } else osc.frequency.setValueAtTime(f, t);
        if (cents) osc.detune.value = cents;
        if (lfoGain) lfoGain.connect(osc.frequency);
        if (gain !== 1) {
          const wg = c.createGain(); wg.gain.value = gain;
          osc.connect(wg); wg.connect(input);
        } else osc.connect(input);
        osc.start(t); osc.stop(end);
      }
      this.connectOut(g, o.out || this.sfxOut, o.wet || 0);
    },

    noise(o) {
      const c = this.ctx;
      const t = Math.max(o.t, c.currentTime);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = o.ftype || 'highpass';
      f.frequency.setValueAtTime(o.freq || 1000, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.sweep || o.d || 0.2));
      f.Q.value = o.q || 0.7;
      const g = c.createGain();
      const a = o.a || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.peak || 0.1, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + (o.d || 0.1));
      src.connect(f); f.connect(g);
      this.connectOut(g, o.out || this.sfxOut, o.wet || 0);
      src.start(t, Math.random() * 1.5);
      src.stop(t + a + (o.d || 0.1) + 0.05);
    },

    // ---------- 樂器 ----------
    pad(t, midis, dur, timbre, out, vel) {
      const n = midis.length;
      const v = (vel || 1) / Math.sqrt(n);
      const P = {
        warm: { waves: [['sawtooth', -8, 0.45], ['triangle', 7, 0.6]], cut: 850, a: 0.6, r: 1.3, peak: 0.06, wet: 0.55 },
        glass: { waves: [['sine', 0, 0.6], ['triangle', 5, 0.3, 2]], a: 0.45, r: 1.6, peak: 0.07, wet: 0.6 },
        saw: { waves: [['sawtooth', -10, 0.45], ['sawtooth', 10, 0.45]], cut: 1500, a: 0.25, r: 0.8, peak: 0.05, wet: 0.45 },
        choir: { waves: [['sawtooth', -6, 0.4], ['sawtooth', 6, 0.4], ['sine', 0, 0.3, 2]], cut: 1100, q: 2.2, a: 0.8, r: 1.6, peak: 0.055, wet: 0.65 },
        stab: { waves: [['sawtooth', -8, 0.5], ['square', 8, 0.2]], cut: 900, cutEnv: 4, cutTime: 0.12, d: 0.32, peak: 0.065, wet: 0.35 },
      }[timbre];
      for (const m of midis) this.synth(Object.assign({}, P, { t, f: mtof(m), dur, peak: P.peak * v, out }));
    },

    pluck(t, midi, timbre, out, vel) {
      const v = vel || 1;
      const f = mtof(midi);
      const P = {
        bell: { waves: [['sine', 0, 0.7], ['sine', 0, 0.22, 2], ['sine', 0, 0.1, 3.01]], d: 1.2, peak: 0.07, wet: 0.6 },
        pluck: { waves: [['sawtooth', 0, 0.5], ['square', 6, 0.2]], cut: 800, cutEnv: 5, cutTime: 0.12, d: 0.32, peak: 0.065, wet: 0.45 },
        drop: { waves: [['sine', 0, 1]], pitchFrom: 0.6, glide: 0.05, d: 0.28, peak: 0.1, wet: 0.7 },
        glass: { waves: [['triangle', 0, 0.6], ['sine', 0, 0.3, 2]], d: 0.6, peak: 0.07, wet: 0.55 },
        koto: { waves: [['triangle', 0, 0.7], ['sawtooth', 0, 0.15]], cut: 2400, cutEnv: 2.5, cutTime: 0.2, pitchFrom: 1.025, glide: 0.06, d: 0.75, peak: 0.08, wet: 0.4 },
        zheng: { waves: [['triangle', 0, 0.65], ['sawtooth', 0, 0.18], ['sine', 0, 0.2, 2]], cut: 3000, cutEnv: 2, cutTime: 0.25, pitchFrom: 0.985, glide: 0.07, d: 1.4, peak: 0.085, wet: 0.5 },
        qin: { waves: [['triangle', 0, 0.75], ['sine', 0, 0.3, 2]], cut: 1600, cutEnv: 1.6, cutTime: 0.3, pitchFrom: 0.97, glide: 0.12, d: 2.0, peak: 0.1, wet: 0.55 },
        kalimba: { waves: [['sine', 0, 0.85], ['sine', 0, 0.12, 5.4]], a: 0.002, d: 0.9, peak: 0.09, wet: 0.5 },
        oud: { waves: [['sawtooth', 0, 0.4], ['triangle', 0, 0.5]], cut: 2200, cutEnv: 2, cutTime: 0.1, pitchFrom: 1.03, glide: 0.05, d: 0.6, peak: 0.08, wet: 0.4 },
        celesta: { waves: [['sine', 0, 0.75], ['sine', 0, 0.2, 4], ['triangle', 0, 0.1, 2]], d: 1.5, peak: 0.07, wet: 0.75 },
        epiano: { waves: [['sine', 0, 0.8], ['triangle', 0, 0.12, 2], ['sine', 0, 0.06, 7]], a: 0.004, d: 1.3, peak: 0.08, wet: 0.45 },
        pipa: { waves: [['triangle', 0, 0.6], ['sawtooth', 0, 0.25]], cut: 3500, cutEnv: 1.8, cutTime: 0.08, d: 0.35, peak: 0.075, wet: 0.35 },
      }[timbre];
      this.synth(Object.assign({}, P, { t, f, peak: P.peak * v, out }));
    },

    // 弦樂團：五把鋸齒波微微走音疊在一起，慢起慢收
    strings(t, midis, dur, vel, out) {
      const v = vel / Math.sqrt(midis.length);
      for (const m of midis) {
        this.synth({ t, f: mtof(m), dur, waves: [['sawtooth', -16, 0.22], ['sawtooth', -7, 0.22], ['sawtooth', 0, 0.22], ['sawtooth', 8, 0.22], ['sawtooth', 15, 0.22]],
          cut: 1300 + vel * 1700, q: 0.5, a: 0.45, s: 0.9, r: 1.1, peak: 0.05 * v, out, wet: 0.6 });
      }
    },
    // 銅管重音：濾波器快速打開再收回
    brass(t, midis, dur, vel, out) {
      const v = vel / Math.sqrt(midis.length);
      for (const m of midis) {
        this.synth({ t, f: mtof(m), dur, waves: [['sawtooth', -5, 0.5], ['sawtooth', 5, 0.5], ['square', 0, 0.12]],
          cut: 650, cutEnv: 4, cutTime: 0.2, q: 1.2, a: 0.025, s: 0.7, r: 0.3, peak: 0.06 * v, out, wet: 0.35 });
      }
    },

    bassNote(t, midi, dur, timbre, out) {
      const P = {
        sub: { waves: [['sine', 0, 1], ['triangle', 0, 0.25]], a: 0.01, s: 0.8, r: 0.12, peak: 0.22 },
        saw: { waves: [['sawtooth', 0, 0.6], ['sawtooth', -7, 0.4]], cut: 380, cutEnv: 4, cutTime: 0.1, q: 4, a: 0.005, s: 0.6, r: 0.08, peak: 0.12 },
        round: { waves: [['triangle', 0, 1], ['sine', 0, 0.5]], cut: 900, a: 0.01, s: 0.7, r: 0.1, peak: 0.2 },
      }[timbre];
      this.synth(Object.assign({}, P, { t, f: mtof(midi), dur, out, wet: 0.04 }));
    },

    leadNote(t, midi, dur, timbre, out, vel) {
      const f = mtof(midi);
      const P = {
        soft: { waves: [['triangle', 0, 0.7], ['sine', 0, 0.25, 2]], a: 0.03, s: 0.7, r: 0.35, vib: [5, 0.006], peak: 0.075, wet: 0.55 },
        saw: { waves: [['sawtooth', -6, 0.4], ['sawtooth', 6, 0.4]], cut: 2200, a: 0.02, s: 0.7, r: 0.25, vib: [5.5, 0.005], peak: 0.045, wet: 0.5 },
        flute: { waves: [['sine', 0, 0.8], ['triangle', 0, 0.15, 2]], a: 0.07, s: 0.8, r: 0.3, vib: [4.5, 0.007], peak: 0.08, wet: 0.6 },
        whale: { waves: [['sine', 0, 1], ['triangle', 0, 0.2]], pitchFrom: 0.94, glide: 0.35, a: 0.35, s: 0.85, r: 1.2, vib: [3, 0.01], peak: 0.07, wet: 0.85 },
        xiao: { waves: [['sine', 0, 0.9], ['triangle', 0, 0.1, 2]], pitchFrom: 0.97, glide: 0.15, a: 0.1, s: 0.8, r: 0.5, vib: [4, 0.007], peak: 0.09, wet: 0.7 },
        suona: { waves: [['square', 0, 0.35], ['sawtooth', 0, 0.45]], ftype: 'bandpass', cut: 1500, q: 1.6, pitchFrom: 0.94, glide: 0.08, a: 0.03, s: 0.85, r: 0.2, vib: [6, 0.012], peak: 0.09, wet: 0.4 },
        dizi: { waves: [['sine', 0, 0.85], ['triangle', 0, 0.12, 2]], pitchFrom: 1.06, glide: 0.07, a: 0.05, s: 0.8, r: 0.25, vib: [5.5, 0.008], peak: 0.085, wet: 0.55 },
        erhu: { waves: [['sawtooth', -4, 0.45], ['sawtooth', 4, 0.35]], cut: 1700, q: 1.2, pitchFrom: 0.955, glide: 0.14, a: 0.08, s: 0.85, r: 0.3, vib: [6, 0.011], peak: 0.05, wet: 0.5 },
      }[timbre];
      this.synth(Object.assign({}, P, { t, f, dur, out, peak: P.peak * (vel || 1) }));
      if (timbre === 'flute' || timbre === 'dizi' || timbre === 'xiao') this.noise({ t, ftype: 'bandpass', freq: f * 2, q: 3, a: 0.05, d: Math.min(dur, 0.4), peak: 0.012, out });
    },

    drum(kind, t, vel, out) {
      const v = vel || 1;
      switch (kind) {
        case 'kick':
          this.synth({ t, f: 48, pitchFrom: 3.2, glide: 0.11, waves: [['sine', 0, 1]], d: 0.42, peak: 0.75 * v, out });
          this.noise({ t, freq: 3500, d: 0.012, peak: 0.08 * v, out });
          break;
        case 'kickSoft':
          this.synth({ t, f: 42, pitchFrom: 2.6, glide: 0.12, waves: [['sine', 0, 1]], d: 0.5, peak: 0.45 * v, out });
          break;
        case 'snare':
          this.noise({ t, ftype: 'bandpass', freq: 1800, q: 0.7, d: 0.18, peak: 0.22 * v, out, wet: 0.25 });
          this.synth({ t, f: 180, pitchFrom: 1.2, waves: [['triangle', 0, 1]], d: 0.1, peak: 0.13 * v, out });
          break;
        case 'clap':
          for (let i = 0; i < 3; i++) this.noise({ t: t + i * 0.011, ftype: 'bandpass', freq: 1300, q: 1.2, d: i === 2 ? 0.16 : 0.02, peak: 0.16 * v, out, wet: 0.3 });
          break;
        case 'hat':
          this.noise({ t, freq: 7500, d: 0.045, peak: 0.07 * v, out });
          break;
        case 'ohat':
          this.noise({ t, freq: 6500, d: 0.26, peak: 0.05 * v, out, wet: 0.1 });
          break;
        case 'shaker':
          this.noise({ t, ftype: 'bandpass', freq: 6000, q: 1.5, a: 0.012, d: 0.06, peak: 0.05 * v, out });
          break;
        case 'rim':
          this.noise({ t, ftype: 'bandpass', freq: 2600, q: 5, d: 0.035, peak: 0.12 * v, out, wet: 0.3 });
          break;
        case 'tom':
          this.synth({ t, f: 72, pitchFrom: 1.7, glide: 0.1, waves: [['sine', 0, 1]], d: 0.55, peak: 0.5 * v, out, wet: 0.25 });
          this.noise({ t, ftype: 'lowpass', freq: 700, d: 0.09, peak: 0.12 * v, out });
          break;
        case 'timpani':
          this.synth({ t, f: 55, pitchFrom: 1.15, glide: 0.3, waves: [['sine', 0, 1]], d: 1.3, peak: 0.6 * v, out, wet: 0.4 });
          this.synth({ t, f: 110, waves: [['sine', 0, 1]], d: 0.5, peak: 0.12 * v, out });
          this.noise({ t, ftype: 'lowpass', freq: 320, d: 0.15, peak: 0.12 * v, out });
          break;
        case 'taikoBig':
          this.synth({ t, f: 48, pitchFrom: 2, glide: 0.15, waves: [['sine', 0, 1]], d: 0.95, peak: 0.75 * v, out, wet: 0.45 });
          this.noise({ t, ftype: 'lowpass', freq: 500, d: 0.2, peak: 0.22 * v, out });
          break;
        case 'woodblock':
          this.synth({ t, f: 880, pitchFrom: 1.1, glide: 0.02, waves: [['sine', 0, 1]], d: 0.06, peak: 0.2 * v, out, wet: 0.2 });
          this.noise({ t, ftype: 'bandpass', freq: 1800, q: 6, d: 0.02, peak: 0.06 * v, out });
          break;
        case 'tanggu':
          this.synth({ t, f: 60, pitchFrom: 1.8, glide: 0.12, waves: [['sine', 0, 1]], d: 0.6, peak: 0.6 * v, out, wet: 0.25 });
          this.noise({ t, ftype: 'lowpass', freq: 400, d: 0.12, peak: 0.15 * v, out });
          break;
        case 'cymbal':
          this.noise({ t, freq: 4500, d: 0.45, peak: 0.08 * v, out, wet: 0.3 });
          this.noise({ t, ftype: 'bandpass', freq: 7000, q: 3, d: 0.2, peak: 0.05 * v, out });
          break;
        case 'gong':
          [[1, 0.09], [1.48, 0.05], [2.03, 0.04], [2.74, 0.025]].forEach(([r, pk]) => {
            this.synth({ t, f: 98 * r, pitchFrom: 1.02, glide: 0.5, waves: [['sine', 0, 1]], a: 0.02, d: 3.5, peak: pk * v, out, wet: 0.7 });
          });
          this.noise({ t, ftype: 'lowpass', freq: 800, d: 0.4, peak: 0.05 * v, out });
          break;
        case 'crash':
          this.noise({ t, freq: 3200, d: 1.7, peak: 0.1 * v, out, wet: 0.45 });
          break;
      }
    },

    // ---------- 播放器 ----------
    makePlayer(idx, startAt, stage, rate) {
      const c = this.ctx;
      const song = SONGS[idx];
      const p = {
        idx, song, step: 0, start: startAt, next: startAt, stage: stage || 0, stageTarget: stage || 0, rate: rate || 1,
        stepDur: 60 / (song.bpm * (rate || 1)) / 4, chords: [], stopping: false, dead: false,
      };
      p.fadeDry = c.createGain(); p.fadeWet = c.createGain();
      p.fadeDry.gain.value = 0.0001; p.fadeWet.gain.value = 0.0001;
      p.fadeDry.gain.setValueAtTime(0.0001, startAt);
      p.fadeDry.gain.exponentialRampToValueAtTime(song.vol || 1, startAt + 0.6);
      p.fadeWet.gain.setValueAtTime(0.0001, startAt);
      p.fadeWet.gain.exponentialRampToValueAtTime((song.wet || 1) * (song.vol || 1), startAt + 0.6);
      p.fadeDry.connect(this.musicBus); p.fadeWet.connect(this.musicWet);
      p.duck = c.createGain(); p.duck.connect(p.fadeDry);
      p.duckWet = c.createGain(); p.duckWet.connect(p.fadeWet);
      p.outMain = { dry: p.duck, wet: p.duckWet };
      p.outDrum = { dry: p.fadeDry, wet: p.fadeWet };
      return p;
    },

    current() {
      for (let i = this.players.length - 1; i >= 0; i--) if (!this.players[i].stopping) return this.players[i];
      return null;
    },

    playSong(idx, stage, rate) {
      this.init();
      if (!this.ctx) return;
      if (typeof idx === 'string') idx = Math.max(0, SONGS.findIndex((x) => x.name === idx));
      rate = rate || 1;
      const cur = this.current();
      if (cur && cur.idx === idx && cur.rate === rate) { this.setStage(stage || 0); return; }
      const now = this.ctx.currentTime;
      let startAt = now + 0.08;
      if (cur && now >= cur.start) {
        // 在目前曲子的下一個小節線切換
        const bar = cur.stepDur * 16;
        const el = now - cur.start;
        let tb = cur.start + Math.ceil(el / bar) * bar;
        if (tb - now < 0.35) tb += bar;
        startAt = tb;
        this.fadeOut(cur, tb, 1.6);
        this.riser(now, tb);
        this.drum('crash', tb, 1, this.sfxOut);
      } else if (cur) {
        this.fadeOut(cur, now, 0.3);
      }
      const p = this.makePlayer(idx, startAt, stage, rate);
      this.players.push(p);
      this.applyTone(stage || 0, startAt);
      this.delay.delayTime.setTargetAtTime(p.stepDur * 3, startAt, 0.05); // 附點八分
    },

    fadeOut(p, at, dur) {
      p.stopping = true;
      p.stopAt = at;
      const t = Math.max(at, this.ctx.currentTime);
      for (const g of [p.fadeDry.gain, p.fadeWet.gain]) {
        g.cancelScheduledValues(t);
        g.setTargetAtTime(0.0001, t, dur / 4);
      }
      p.deadAt = t + dur + 0.5;
    },

    stopMusic(dur) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (const p of this.players) if (!p.stopping) this.fadeOut(p, now, dur || 1.5);
    },

    setStage(s) {
      const p = this.current();
      if (!p) return;
      p.stageTarget = Math.max(0, Math.min(5, s));
      this.applyTone(p.stageTarget);
    },

    // 升級前的鋪陳（本關剩最後幾行）
    setBuild(on) {
      if (this.build === !!on) return;
      this.build = !!on;
      const p = this.current();
      this.applyTone(p ? p.stageTarget : 0);
    },

    // Combo 期間的即時加強（0 = 無）
    setBoost(n) {
      this.boost = n || 0;
      const p = this.current();
      this.applyTone(p ? p.stageTarget : 0);
    },

    applyTone(stage, at) {
      if (!this.ctx) return;
      const f = this.boost >= 2 || this.build ? 20000 : [2200, 3400, 5500, 9000, 15000, 20000][Math.max(0, Math.min(5, stage))];
      const t = Math.max(at || 0, this.ctx.currentTime);
      for (const node of [this.musicTone, this.wetTone]) {
        node.frequency.cancelScheduledValues(t);
        node.frequency.setTargetAtTime(f, t, 0.8);
      }
      const st = Math.max(0, Math.min(5, stage));
      const g = [0.66, 0.76, 0.88, 1.0, 1.14, 1.3][st] * (this.boost >= 2 || this.build ? 1.08 : 1);
      this.stageGain.gain.cancelScheduledValues(t);
      this.stageGain.gain.setTargetAtTime(g, t, 0.8);
    },

    tick() {
      const c = this.ctx;
      if (!c || c.state !== 'running') return;
      const ahead = c.currentTime + 0.12;
      for (const p of this.players) {
        // 跳過暫停期間累積的落後（例如分頁被背景化）
        if (p.next < c.currentTime - 0.25) {
          const skip = Math.ceil((c.currentTime - p.next) / p.stepDur);
          p.step += skip; p.next += skip * p.stepDur;
        }
        while (p.next < ahead && !(p.stopping && p.next > p.stopAt + 0.01)) {
          const swing = p.song.swing && p.step % 2 ? p.song.swing * p.stepDur : 0;
          this.scheduleStep(p, p.step, p.next + swing);
          p.step++;
          p.next += p.stepDur;
        }
        if (p.stopping && c.currentTime > p.deadAt) {
          p.dead = true;
          try { p.fadeDry.disconnect(); p.fadeWet.disconnect(); } catch (_) { /* ignore */ }
        }
      }
      this.players = this.players.filter((p) => !p.dead);
    },

    scheduleStep(p, step, t) {
      const song = p.song;
      const s16 = step % 16;
      const bar = Math.floor(step / 16);
      const deg = song.prog[bar % song.prog.length];
      if (s16 === 0) {
        p.stage = p.stageTarget;
        p.chords.push({ t, deg });
        if (p.chords.length > 4) p.chords.shift();
      }
      const stage = p.stage;
      const out = p.outMain;

      // Pad
      if (song.padSeq) {
        if (song.padSeq[s16] === 'x') this.pad(t, chordMidis(song, deg, 0), p.stepDur * 2, song.pad, out, 1);
      } else if (s16 === 0) {
        this.pad(t, chordMidis(song, deg, 0), p.stepDur * 16, song.pad, out, 1);
      }
      const climax = stage >= 5;
      const hot = climax || this.boost >= 2;
      // Arp（高潮 / Combo 時加一層高八度）
      const ai = song.arpSeq[s16];
      if (ai >= 0) {
        this.pluck(t, extTone(song, deg, ai, song.arpOct), song.arp, out, stage === 0 ? 0.8 : 1);
        if (hot) this.pluck(t + p.stepDur * 0.5, extTone(song, deg, ai + 2, song.arpOct + 1), song.arp, out, 0.4);
      }
      // Bass
      if (stage >= 1) {
        const ch = song.bassSeq[s16];
        if (ch !== '.' && ch !== '-') {
          let len = 1;
          while (s16 + len < 16 && song.bassSeq[s16 + len] === '-') len++;
          const off = (SCALES[song.scale].length === 5 ? { R: 0, 5: 3, 3: 2, O: 5 } : { R: 0, 5: 4, 3: 2, O: 7 })[ch] || 0;
          this.bassNote(t, degToMidi(song, deg + off, song.bassOct), p.stepDur * len * 0.95, song.bass, out);
        }
      }
      // Drums
      for (const kind in song.drums) {
        if (stage < DRUM_STAGE[kind]) continue;
        const ch = song.drums[kind][s16];
        if (!ch || ch === '.') continue;
        const v = ch === 'X' ? 1.25 : ch === 'o' ? 0.5 : 1;
        this.drum(kind, t, v, p.outDrum);
        if (kind === 'kick' && song.pump) {
          for (const g of [p.duck.gain, p.duckWet.gain]) {
            g.cancelScheduledValues(t);
            g.setValueAtTime(0.42, t);
            g.linearRampToValueAtTime(1, t + p.stepDur * 3);
          }
        }
      }
      if (song.rain && s16 === 0) this.noise({ t, ftype: 'bandpass', freq: 2600, q: 0.4, a: 0.6, d: p.stepDur * 17, peak: 0.045, out: p.outDrum, wet: 0.2 });
      if (song.gong && stage >= 3 && s16 === 0 && bar % 4 === 0) this.drum('gong', t, 1, p.outDrum);
      // 史詩層：第 3 階起弦樂團 + 定音鼓 / 大太鼓，第 4 階起銅管重音
      const eastern = song.epic === 'eastern';
      const tri = chordMidis(song, deg, 0, 3);
      if (stage >= 3 && s16 === 0) {
        this.strings(t, tri.map((m) => m + 12).concat([tri[0]]), p.stepDur * 16, [0, 0, 0, 0.6, 0.85, 1.1][stage], out);
      }
      if (stage >= 3) {
        const hit = eastern
          ? s16 === 0 || (stage >= 4 && s16 === 8) || (stage >= 5 && s16 % 4 === 0)
          : (s16 === 0 && (bar % 2 === 0 || stage >= 4)) || (stage >= 5 && s16 === 8);
        if (hit) this.drum(eastern ? 'taikoBig' : 'timpani', t, s16 === 0 ? 1 : 0.7, p.outDrum);
      }
      if (stage >= 4 && !eastern && (s16 === 0 || (s16 === 14 && bar % 2 === 1))) {
        this.brass(t, tri.map((m) => m + 12), p.stepDur * (s16 === 0 ? 3 : 2), stage >= 5 ? 1 : 0.7, out);
      }
      if (stage >= 5 && bar % 4 === 3 && s16 >= 12) this.drum(eastern ? 'tanggu' : 'tom', t, 0.6 + (s16 - 12) * 0.13, p.outDrum);
      if (stage >= 5 && s16 % 8 === 0 && song.bassSeq[s16] !== '.') this.bassNote(t, degToMidi(song, deg, song.bassOct - 1), p.stepDur * 6, 'sub', out);
      // 升級前的鋪陳：小鼓滾奏越來越密、升騰音
      if (this.build) {
        const dense = s16 >= 12 ? 1 : s16 >= 8 ? 2 : 4;
        if (s16 % dense === 0) this.drum('snare', t, 0.3 + 0.7 * (s16 / 16), p.outDrum);
        if (s16 === 0) this.riser(t, t + p.stepDur * 16);
      }
      // 高潮層：16 分音符鼓點、每 4 小節一記鈸、大鼓推進
      if (hot && stage >= 2) {
        const hatOn = song.drums.hat && song.drums.hat[s16] !== '.';
        if (!hatOn) this.drum('hat', t, s16 % 4 === 2 ? 0.8 : 0.45, p.outDrum);
      }
      if (climax) {
        if (s16 === 0 && bar % 2 === 0) this.drum('crash', t, 0.6, p.outDrum);
        if (s16 % 4 === 0 && !song.drums.kick) this.drum('kick', t, 0.55, p.outDrum);
        if (s16 === 12 && bar % 2 === 1) this.drum('snare', t + p.stepDur * 2, 0.5, p.outDrum);
      }
      // Lead
      if (stage >= 4) {
        const motif = song.leadSeq[Math.floor(step / 32) % song.leadSeq.length];
        const s32 = step % 32;
        for (const [st, d, len] of motif) {
          if (st === s32) {
            this.leadNote(t, degToMidi(song, d, song.leadOct), p.stepDur * len * 0.92, song.lead, out);
            if (climax) this.leadNote(t, degToMidi(song, d, song.leadOct + 1), p.stepDur * len * 0.92, song.lead, out, 0.45);
          }
        }
      }
    },

    // 目前聽到的和弦（給音效取音）
    chordNow() {
      const p = this.current() || this.players[this.players.length - 1];
      if (!p || !this.ctx) return { song: SONGS[0], deg: 0 };
      const now = this.ctx.currentTime;
      let deg = p.song.prog[0];
      for (const ch of p.chords) if (ch.t <= now) deg = ch.deg;
      return { song: p.song, deg };
    },

    // 給畫面用的節拍資訊
    beatInfo() {
      const p = this.current();
      if (!p || !this.ctx || this.ctx.state !== 'running') return { phase: 0.5, beat: 0, drums: false, playing: false };
      const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
      const el = now - p.start;
      if (el < 0) return { phase: 0.5, beat: 0, drums: false, playing: false };
      const beats = el / (p.stepDur * 4);
      return { phase: beats % 1, beat: Math.floor(beats), drums: p.stage >= 2, playing: true, stage: p.stage, bpm: p.song.bpm };
    },

    nextGrid(div) {
      const p = this.current();
      const now = this.ctx.currentTime;
      if (!p || now < p.start) return now;
      const g = p.stepDur * (div || 1);
      return p.start + Math.ceil((now - p.start + 0.005) / g) * g;
    },

    riser(t0, t1) {
      const dur = Math.max(0.3, t1 - t0);
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(6000, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + dur); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
      src.connect(f); f.connect(g); this.connectOut(g, this.sfxOut, 0.5);
      src.start(t0); src.stop(t0 + dur + 0.1);
    },

    // ---------- 動作音效（跟著和弦） ----------
    play(name, d) {
      if (!this.ctx) return;
      d = d || {};
      const now = this.ctx.currentTime;
      const { song, deg } = this.chordNow();
      const out = this.sfxOut;
      const tone = (i, oct) => extTone(song, deg, i, oct);
      switch (name) {
        case 'move':
          this.sfxIdx = (this.sfxIdx + 1) % 4;
          this.synth({ t: now, f: mtof(tone(this.sfxIdx, 2)), waves: [['triangle', 0, 1]], d: 0.05, peak: 0.035, out });
          break;
        case 'rotate':
          this.sfxIdx = (this.sfxIdx + 1) % 6;
          this.synth({ t: now, f: mtof(tone(this.sfxIdx, 1)), waves: [['sine', 0, 0.8], ['sine', 0, 0.2, 2]], d: 0.22, peak: 0.07, out, wet: 0.35 });
          break;
        case 'hold':
          this.synth({ t: now, f: mtof(tone(0, 1)), waves: [['triangle', 0, 1]], d: 0.18, peak: 0.08, out, wet: 0.4 });
          this.synth({ t: now + 0.06, f: mtof(tone(2, 1)), waves: [['triangle', 0, 1]], d: 0.22, peak: 0.07, out, wet: 0.4 });
          break;
        case 'lock':
          this.synth({ t: now, f: mtof(tone(0, -1)), waves: [['triangle', 0, 1]], d: 0.09, peak: 0.12, out });
          this.noise({ t: now, freq: 3000, d: 0.025, peak: 0.04, out });
          break;
        case 'hardDrop':
          this.synth({ t: now, f: 46, pitchFrom: 3, glide: 0.09, waves: [['sine', 0, 1]], d: 0.3, peak: 0.55, out });
          this.synth({ t: now, f: mtof(tone(0, -1)), waves: [['triangle', 0, 1]], d: 0.16, peak: 0.1, out });
          this.noise({ t: now, freq: 1500, d: 0.07, peak: 0.07, out });
          break;
        case 'clear': {
          const n = d.lines || 0;
          const t0 = this.nextGrid(1);
          const cur = this.current();
          const step = cur ? cur.stepDur : 0.12;
          const start = Math.min(4, Math.max(0, d.combo || 0));
          const count = n >= 4 ? 8 : n + 3;
          for (let i = 0; i < count; i++) {
            const t = t0 + i * step * (n >= 4 ? 0.5 : 1);
            this.synth({ t, f: mtof(tone(start + i, 1)), waves: [['sine', 0, 0.7], ['sine', 0, 0.2, 2], ['triangle', 0, 0.15, 3]], d: 0.9, peak: 0.08, out, wet: 0.6 });
          }
          if (n >= 4 || d.tspin) {
            this.pad(t0, chordMidis(song, deg, 0, 4).concat([extTone(song, deg, 4, 0)]), step * 8, 'stab', out, 2.2);
            this.drum('crash', t0, 1.2, out);
            this.synth({ t: t0, f: 40, pitchFrom: 2.5, glide: 0.2, waves: [['sine', 0, 1]], d: 0.8, peak: 0.5, out });
          }
          if (d.tspin) this.noise({ t: now, ftype: 'bandpass', freq: 400, freqEnd: 5000, sweep: 0.3, q: 3, d: 0.35, peak: 0.08, out, wet: 0.5 });
          if (d.pc) {
            for (let i = 0; i < 12; i++) this.synth({ t: t0 + 0.4 + i * step * 0.5, f: mtof(tone(i, 1)), waves: [['sine', 0, 0.8], ['sine', 0, 0.2, 2]], d: 1.2, peak: 0.07, out, wet: 0.8 });
          }
          break;
        }
        case 'tspinNoLines':
          this.noise({ t: now, ftype: 'bandpass', freq: 500, freqEnd: 3000, sweep: 0.2, q: 3, d: 0.25, peak: 0.06, out, wet: 0.4 });
          this.synth({ t: now, f: mtof(tone(1, 1)), waves: [['square', 0, 0.5]], cut: 2000, d: 0.2, peak: 0.04, out, wet: 0.3 });
          break;
        case 'levelUp':
          for (let i = 0; i < 6; i++) this.synth({ t: now + i * 0.06, f: mtof(tone(i, 1)), waves: [['sine', 0, 0.8], ['triangle', 0, 0.2, 2]], d: 0.6, peak: 0.07, out, wet: 0.6 });
          break;
        case 'gameOver':
          [0, -2, -5, -9].forEach((iv, i) => this.synth({ t: now + 0.3 + i * 0.32, f: mtof(69 + iv), waves: [['triangle', 0, 0.8], ['sine', 0, 0.3, 2]], d: 1.4, peak: 0.09, out, wet: 0.8 }));
          this.pad(now + 1.4, [45, 52, 57, 60], 2.5, 'warm', out, 1.2);
          break;
        case 'count':
          this.synth({ t: now, f: mtof(74), waves: [['sine', 0, 0.8], ['sine', 0, 0.2, 2]], d: 0.35, peak: 0.1, out, wet: 0.5 });
          break;
        case 'go':
          [74, 78, 81, 86].forEach((m) => this.synth({ t: now, f: mtof(m), waves: [['sine', 0, 0.8], ['sine', 0, 0.2, 2]], d: 0.9, peak: 0.06, out, wet: 0.6 }));
          break;
        case 'ui':
          this.synth({ t: now, f: mtof(tone(2, 2)), waves: [['sine', 0, 1]], d: 0.08, peak: 0.05, out, wet: 0.2 });
          break;
      }
    },
  };

  root.LumenAudio = A;
})(typeof self !== 'undefined' ? self : this);
