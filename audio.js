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
    gyemyeon: [0, 3, 5, 7, 10], // 韓國界面調（哀愁的五聲小調）
    in: [0, 1, 5, 7, 8], // 日本都節音階
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 鼓組各聲部最早出現的階段
  const DRUM_STAGE = { kick: 2, kickSoft: 2, tom: 2, hat: 2, shaker: 2, tanggu: 2, woodblock: 2, janggu: 2, jangguHi: 2, buk: 2, brush: 2, ride: 2, doum: 2, tek: 2, frame: 2, kickHard: 2, bowl: 0, taikoBig: 2, gated: 3, tamb: 3, snare: 3, clap: 3, rim: 3, ohat: 3, cymbal: 3 };
  // 鼓組在立體聲中的位置（-1 左、1 右）
  const DRUM_PAN = { ride: 0.35, brush: -0.25, tamb: 0.4, tek: 0.3, doum: -0.1, hat: 0.3, ohat: 0.3, shaker: -0.3, rim: -0.2, woodblock: 0.25, jangguHi: 0.25, janggu: -0.15, tom: -0.2, cymbal: 0.2 };

  // ================= 曲目 =================
  // 每首歌一種曲風：拍號（steps 每小節格數、beat 每拍格數）、律動、配器、高潮層都不同
  // prog：每小節和弦根音（音階級數）；arp：每格延伸和弦音索引（-1 休止）
  // bassSeq：R 根音 5 五度 3 三度 O 高八度 - 延長 . 休止；'walk' = 爵士行走低音
  // mel / counter：兩小節一句，「級數/長度」以空白分隔，r 為休止
  // epic：高潮層 orch 管弦 / eastern 鼓樂 / choir 合唱 / synth 合成器 / none 不加
  const SONGS = [
    { // 太空氛圍：幾乎沒有鼓，鐘聲琶音配長延遲，合唱推進
      name: '星空', bpm: 68, steps: 16, beat: 4, root: 62, scale: 'lydian', prog: [0, 4, 5, 3], sevenths: true, wet: 1.6,
      pad: 'glass', arp: 'bell', arpOct: 1, bass: 'sub', bassOct: -2, lead: 'soft', leadOct: 1, epic: 'choir',
      arpSeq: [0, -1, -1, -1, 4, -1, -1, -1, 2, -1, -1, 6, -1, -1, -1, -1],
      bassSeq: 'R---------------',
      drums: { kickSoft: 'x...............', shaker: '........x.......' },
      mel: ['4/8 6/4 7/4 9/8 7/8', '11/8 9/4 7/4 6/12 r/4'],
    },
    { // Trip-hop：半拍慢板、慵懶搖擺、黑膠雜音
      name: '深海', bpm: 84, steps: 16, beat: 4, root: 57, scale: 'dorian', prog: [0, 0, 3, 3], sevenths: true, swing: 0.12, lofi: true, wet: 1.3,
      pad: 'warm', arp: 'epiano', arpOct: 0, bass: 'sub', bassOct: -2, lead: 'whale', leadOct: 0, epic: 'none',
      arpSeq: [0, -1, -1, 2, -1, -1, -1, -1, -1, 3, -1, -1, 1, -1, -1, -1],
      bassSeq: 'R-----R...R-----',
      drums: { kick: 'x......x..x.....', snare: '........x.......', hat: '..x...x...x...xx' },
      mel: ['4/12 3/4 2/16', '6/8 4/4 3/4 2/12 r/4'],
      counter: { t: 'epiano', oct: 1, seq: ['r/4 4/2 3/2 2/8 r/16', 'r/8 6/2 4/2 3/4 r/16'] },
    },
    { // 古琴與簫的二重奏：留白、木魚
      name: '竹林', bpm: 64, steps: 16, beat: 4, root: 60, scale: 'gong', prog: [0, 0, 3, 4], sevenths: false, wet: 1.4, vol: 0.9,
      pad: null, arp: 'qin', arpOct: 0, bass: 'round', bassOct: -1, lead: 'xiao', leadOct: 0, epic: 'none',
      arpSeq: [0, -1, -1, -1, 2, -1, -1, 1, -1, -1, -1, -1, 3, -1, -1, -1],
      bassSeq: 'R---------------',
      drums: { woodblock: '........x.......' },
      mel: ['7/12 8/4 9/8 7/8', '10/6 9/2 8/8 7/16'],
      counter: { t: 'dizi', oct: 1, seq: ['r/16 9/4 8/4 7/8', 'r/16 8/4 7/4 5/8'] },
    },
    { // 北歐民謠圓舞曲 3/4：豎琴、合唱般的主旋律、框鼓
      name: '極光', bpm: 138, steps: 12, beat: 4, root: 62, scale: 'dorian', prog: [0, 6, 3, 4], sevenths: false, wet: 1.3,
      pad: 'choir', arp: 'harp', arpOct: 0, bass: 'round', bassOct: -2, lead: 'choirLead', leadOct: 1, epic: 'choir',
      arpSeq: [0, -1, -1, -1, 2, -1, 4, -1, 2, -1, 4, -1],
      bassSeq: 'R-----------',
      drums: { frame: 'x...........', tamb: '....x...x...' },
      mel: ['4/4 5/2 6/2 7/8 6/4 4/4', '7/4 8/2 9/2 10/8 9/2 8/2 7/4'],
    },
    { // 韓國宮廷樂 12/8：伽倻琴、大笒、長鼓
      name: '景福宮', bpm: 72, steps: 12, beat: 3, root: 63, scale: 'zhi', prog: [0, 3, 1, 4], sevenths: false, gong: true, wet: 1.25, vol: 0.85,
      pad: 'warm', arp: 'gayageum', arpOct: 0, bass: 'round', bassOct: -2, lead: 'daegeum', leadOct: 1, epic: 'eastern',
      arpSeq: [0, -1, 1, 2, -1, -1, 3, -1, 2, 1, -1, -1],
      bassSeq: 'R-----5-----',
      drums: { janggu: 'x.....x..x..', jangguHi: '...x.x...x.x' },
      mel: ['5/6 6/3 5/3 4/6 3/3 2/3', '7/6 8/3 7/3 6/6 5/3 4/3'],
    },
    { // 古箏刮奏 + 琵琶輪指主旋律
      name: '水墨', bpm: 76, steps: 16, beat: 4, root: 62, scale: 'gong', prog: [0, 4, 3, 1], sevenths: false, gong: true, wet: 1.3, vol: 0.8,
      pad: null, arp: 'zheng', arpOct: 0, bass: 'round', bassOct: -2, lead: 'pipaTrem', leadOct: 1, epic: 'none',
      arpSeq: [0, 1, 2, 3, 4, -1, -1, -1, 4, 3, 2, -1, -1, -1, -1, -1],
      bassSeq: 'R-------5-------',
      drums: { woodblock: 'x.......x.x.....', tanggu: '............x...' },
      mel: ['4/6 3/2 2/4 1/4 2/6 1/2 0/8', '5/4 6/4 7/6 6/2 5/4 4/4 3/8'],
    },
    { // 二胡抒情 6/8：搖籃般的分解和弦
      name: '荷塘月色', bpm: 54, steps: 12, beat: 3, root: 62, scale: 'gong', prog: [0, 4, 3, 1], sevenths: false, wet: 1.45, vol: 0.85,
      pad: 'warm', arp: 'zheng', arpOct: 0, bass: 'round', bassOct: -2, lead: 'erhu', leadOct: 1, epic: 'eastern',
      arpSeq: [0, 2, 4, 2, 4, 2, 1, 3, 5, 3, 5, 3],
      bassSeq: 'R-----R-----',
      drums: { woodblock: '......x.....' },
      mel: ['4/6 3/3 2/3 1/6 2/6', '5/3 6/3 7/6 6/3 4/3 2/6'],
    },
    { // 愛爾蘭吉格舞 6/8：哨笛、吉他刷弦、框鼓
      name: '螢火森林', bpm: 112, steps: 12, beat: 3, root: 67, scale: 'major', prog: [0, 3, 0, 4], sevenths: false, wet: 1.0,
      pad: null, arp: 'guitar', arpOct: -1, bass: 'round', bassOct: -2, lead: 'whistle', leadOct: 1, epic: 'none',
      arpSeq: [0, -1, 2, 0, -1, 2, 0, -1, 2, 0, -1, 2],
      bassSeq: 'R--5--R--5--',
      drums: { frame: 'x..x..x..x..', tamb: '..x..x..x..x' },
      mel: ['4/1 3/1 2/1 4/2 6/1 7/2 6/1 4/2 3/1 2/2 1/1 0/3 2/2 4/1 6/3', '7/2 6/1 7/2 9/1 8/2 7/1 6/2 4/1 6/2 7/1 4/3 2/2 1/1 0/3'],
    },
    { // 80 年代 Synthwave：八度貝斯、閘門小鼓、方波主旋律
      name: '霓虹都市', bpm: 104, steps: 16, beat: 4, root: 53, scale: 'minor', prog: [0, 5, 2, 6], sevenths: false, pump: true, drive: true, vol: 1.25, wet: 0.9,
      pad: 'supersaw', arp: 'pluck', arpOct: 1, bass: 'saw', bassOct: -1, lead: 'square', leadOct: 1, epic: 'synth',
      arpSeq: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7],
      bassSeq: 'RORORORORORORORO',
      drums: { kick: 'x...x...x...x...', gated: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      mel: ['4/4 3/2 2/2 0/6 2/2 3/8 4/4 6/4', '7/4 6/2 4/2 3/6 4/2 2/8 0/8'],
    },
    { // 太空迪斯可 / 放克：擊勾貝斯、Clav 切分、銅管
      name: '土星環', bpm: 118, steps: 16, beat: 4, root: 62, scale: 'dorian', prog: [0, 3, 0, 4], sevenths: true, drive: true, vol: 1.1, wet: 0.9,
      pad: 'stab', padSeq: '..x..x....x..x..', arp: 'clav', arpOct: 0, bass: 'slap', bassOct: -1, lead: 'trumpetLead', leadOct: 1, epic: 'orch',
      arpSeq: [0, -1, 2, 0, -1, 2, -1, 4, 0, -1, 2, -1, 4, -1, 2, -1],
      bassSeq: 'R..R.O.R..R.5.O.',
      drums: { kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', tamb: 'x.x.x.x.x.x.x.x.' },
      mel: ['7/2 7/2 r/2 6/2 4/4 r/4 7/2 9/2 7/4 6/4 4/4', '4/2 6/2 7/4 r/4 6/2 4/2 3/4 2/2 0/2 r/8'],
    },
    { // 絲路：Maqsum 節奏（Doum-Tek）、烏德琴、蘆笛
      name: '敦煌', bpm: 96, steps: 16, beat: 4, root: 57, scale: 'hijaz', prog: [0, 1, 0, 6], sevenths: false, swing: 0.05, wet: 1.1, vol: 1.2,
      pad: 'choir', arp: 'oud', arpOct: 0, bass: 'round', bassOct: -2, lead: 'ney', leadOct: 1, epic: 'choir',
      arpSeq: [0, 1, 2, 1, 0, -1, 2, 3, 4, 3, 2, -1, 1, 2, 1, 0],
      bassSeq: 'R.......R.......',
      drums: { doum: 'x.......x.......', tek: '..x...x.....x.x.' },
      mel: ['4/3 5/1 4/4 2/2 1/2 0/4 1/6 2/2 4/8', '7/4 6/2 5/2 4/8 5/3 4/1 2/4 1/8'],
    },
    { // 日本都節音階：箏、尺八、太鼓
      name: '櫻花', bpm: 80, steps: 16, beat: 4, root: 64, scale: 'in', prog: [0, 0, 3, 3], sevenths: false, wet: 1.3, vol: 0.85,
      pad: 'warm', arp: 'koto', arpOct: 0, bass: 'round', bassOct: -2, lead: 'shaku', leadOct: 1, epic: 'eastern',
      arpSeq: [0, -1, 1, 2, -1, 4, -1, 2, 0, -1, 1, 2, 4, -1, 3, -1],
      bassSeq: 'R-------R-------',
      drums: { taikoBig: 'x.......x..x....', rim: '....x.......x...' },
      mel: ['5/6 4/2 3/4 1/4 2/8 1/8', '5/4 6/4 7/6 6/2 5/8 4/8'],
    },
    { // 阿里郎般的韓國民謠 3/4：奚琴、伽倻琴、桶鼓
      name: '韓屋月夜', bpm: 88, steps: 12, beat: 4, root: 57, scale: 'gyemyeon', prog: [0, 3, 2, 4], sevenths: false, gong: true, wet: 1.45, vol: 0.85,
      pad: 'warm', arp: 'gayageum', arpOct: 0, bass: 'sub', bassOct: -2, lead: 'haegeum', leadOct: 1, epic: 'eastern',
      arpSeq: [0, -1, -1, -1, 2, -1, -1, -1, 4, -1, 3, -1],
      bassSeq: 'R-----------',
      drums: { buk: 'x...........', jangguHi: '....x...x.x.' },
      mel: ['4/8 5/4 7/4 6/4 5/4', '5/4 4/4 2/4 4/8 2/4'],
    },
    { // 中國戰鼓進行曲：法國號、撥弦固定音型、太鼓與軍鼓
      name: '長城', bpm: 92, steps: 16, beat: 4, root: 55, scale: 'gong', prog: [0, 3, 4, 2], sevenths: false, gong: true, wet: 1.0, vol: 0.8,
      pad: 'choir', arp: 'pizz', arpOct: -1, bass: 'round', bassOct: -2, lead: 'horn', leadOct: 0, epic: 'orch',
      arpSeq: [0, 0, 2, 0, 4, 0, 2, 0, 0, 0, 2, 0, 4, 2, 1, 0],
      bassSeq: 'R...R...R...R.5.',
      drums: { taikoBig: 'x.......x.x.....', snare: '..x.x..x..x.x.xx' },
      mel: ['5/4 6/2 7/2 8/6 7/2 6/4 5/4 4/8', '8/3 7/1 6/4 5/4 6/4 7/6 8/2 10/8'],
    },
    { // 音樂盒圓舞曲 3/4：清脆音樂盒、鋼片琴主旋律
      name: '冰晶洞窟', bpm: 100, steps: 12, beat: 4, root: 69, scale: 'minor', prog: [0, 5, 3, 4], sevenths: false, wet: 1.5, vol: 1.6,
      pad: 'glass', arp: 'musicbox', arpOct: 0, bass: null, lead: 'celesta', leadOct: 1, epic: 'choir',
      arpSeq: [0, -1, 4, -1, 2, -1, 7, -1, 4, -1, 2, -1],
      drums: { rim: '....x...x...' },
      mel: ['4/4 3/2 2/2 4/4 7/8 6/4', '7/4 9/2 8/2 7/4 4/8 2/4'],
    },
    { // K-pop：808、人聲切片、四拍大鼓
      name: '首爾夜光', bpm: 124, steps: 16, beat: 4, root: 54, scale: 'minor', prog: [5, 3, 0, 6], sevenths: true, pump: true, drive: true, wet: 0.9, vol: 0.85,
      pad: 'saw', arp: 'pluck', arpOct: 1, bass: '808', bassOct: -1, lead: 'chop', leadOct: 1, epic: 'synth',
      arpSeq: [0, -1, 4, 2, -1, 4, 0, -1, 2, -1, 4, 2, -1, 5, 4, -1],
      bassSeq: 'R--R--R-R--R-5-O',
      drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', ohat: '..x...x...x...x.' },
      mel: ['4/2 4/2 5/2 4/2 2/4 1/2 2/2 4/6 5/2 4/8', '7/2 7/2 6/2 4/4 5/2 4/4 2/8 0/8'],
    },
    { // Lo-fi Hip Hop：爵士和弦、慵懶搖擺、黑膠雜音
      name: '楓紅', bpm: 76, steps: 16, beat: 4, root: 60, scale: 'major', prog: [1, 4, 0, 5], sevenths: true, ext: true, swing: 0.17, lofi: true, vol: 1.3, wet: 1.0,
      pad: 'epianoComp', padSeq: 'x.....x...x.....', arp: null, bass: 'round', bassOct: -2, lead: 'nylon', leadOct: 1, epic: 'none',
      bassSeq: 'R.....R...5.....',
      drums: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      mel: ['4/3 2/1 4/2 6/2 7/8 r/16', 'r/8 9/2 7/2 6/2 4/2 2/8 r/8'],
    },
    { // 舞獅鬧元宵：急促堂鼓、鈸、嗩吶
      name: '燈節', bpm: 136, steps: 16, beat: 4, root: 55, scale: 'zhi', prog: [0, 3, 1, 4], sevenths: false, gong: true, drive: true, wet: 0.9, vol: 0.75,
      pad: null, arp: 'pipa', arpOct: 1, bass: 'round', bassOct: -1, lead: 'suona', leadOct: 1, epic: 'eastern',
      arpSeq: [0, 1, 2, 1, 3, 2, 1, 0, 0, 2, 4, 2, 3, 1, 2, 1],
      bassSeq: 'R-R-5-R-R-R-5-O-',
      drums: { tanggu: 'x.x.x.x.x.xxx.x.', cymbal: '..x...x...x...x.', woodblock: 'x...x...x...x...' },
      mel: ['5/3 4/1 3/4 2/4 3/2 4/2 5/6 7/2 6/8', '7/4 6/2 5/2 4/6 3/2 2/4 1/4 0/8'],
    },
    { // 爵士黑色電影：搖擺 12/8、行走低音、刷鼓與 Ride、弱音小號
      name: '雨夜', bpm: 92, steps: 12, beat: 3, root: 57, scale: 'dorian', prog: [1, 4, 0, 0], sevenths: true, ext: true, rain: true, wet: 1.1,
      pad: 'epianoComp', padSeq: 'x.....x..x..', arp: null, bass: 'upright', bassSeq: 'walk', bassOct: -2, lead: 'trumpet', leadOct: 0, epic: 'none',
      drums: { ride: 'x..x.xx..x.x', brush: '...x.....x..', kickSoft: 'x...........' },
      mel: ['6/3 7/2 6/1 4/6 r/3 2/2 3/1 4/6', '7/3 9/3 8/2 7/1 6/6 4/3 2/3 0/3'],
    },
    { // 冥想：頌缽、合唱、遠方的笛
      name: '仙山', bpm: 56, steps: 16, beat: 4, root: 59, scale: 'zhi', prog: [0, 3, 1, 4], sevenths: false, wet: 1.6, vol: 0.9,
      pad: 'choir', arp: 'qin', arpOct: 1, bass: 'sub', bassOct: -2, lead: 'dizi', leadOct: 1, epic: 'choir',
      arpSeq: [0, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, 4, -1, -1, -1],
      bassSeq: 'R---------------',
      drums: { bowl: 'x...............' }, drumStage: { bowl: 0 },
      mel: ['7/12 8/4 9/16', '9/8 8/8 7/16'],
    },
    { // 海盜 6/8：弦樂固定音型、提琴、定音鼓
      name: '海上風暴', bpm: 100, steps: 12, beat: 3, root: 50, scale: 'minor', prog: [0, 5, 6, 4], sevenths: false, rain: true, wet: 1.0, vol: 1.05,
      pad: null, arp: 'stringOst', arpOct: 0, bass: 'round', bassOct: -1, lead: 'fiddle', leadOct: 1, epic: 'orch',
      arpSeq: [0, 0, 2, 0, 0, 2, 0, 0, 4, 0, 0, 2],
      bassSeq: 'R..R..R..R..',
      drums: { tom: 'x.....x.....', snare: '...x.....x..' },
      mel: ['4/2 4/1 5/2 6/1 7/3 6/3 4/3 2/3 4/6', '7/2 7/1 8/2 9/1 10/3 9/3 7/3 6/3 4/6'],
    },
    { // 金屬：失真強力和弦、雙大鼓、失真吉他主奏
      name: '熔岩', bpm: 150, steps: 16, beat: 4, root: 52, scale: 'phrygian', prog: [0, 0, 1, 0], sevenths: false, drive: true, wet: 0.7, vol: 1.1,
      pad: 'power', padSeq: 'x..x..x.x..x..x.', arp: null, bass: 'saw', bassOct: -1, lead: 'guitarLead', leadOct: 1, epic: 'none',
      bassSeq: 'R.RR.RR.R.RR.R.R',
      drums: { kickHard: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...' },
      mel: ['4/2 3/2 1/4 0/4 1/2 3/2 4/8 5/4 4/4', '7/4 5/4 4/4 3/4 1/8 0/8'],
    },
    { // 中國搖滾：強力和弦 + 二胡 + 琵琶
      name: '飛龍', bpm: 128, steps: 16, beat: 4, root: 57, scale: 'zhi', prog: [0, 3, 4, 1], sevenths: false, drive: true, wet: 0.9, vol: 1.0,
      pad: 'power', padSeq: 'x...x...x...x.x.', arp: 'pipa', arpOct: 1, bass: 'saw', bassOct: -1, lead: 'erhu', leadOct: 1, epic: 'eastern',
      arpSeq: [0, -1, 1, -1, 2, -1, 3, -1, 4, -1, 3, -1, 2, -1, 1, -1],
      bassSeq: 'R.R.R.R.R.R.R.RO',
      drums: { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      mel: ['5/3 6/1 7/4 8/2 7/2 5/4 6/6 5/2 4/8', '8/2 9/2 10/4 9/4 8/4 7/4 5/4 5/8'],
    },
    { // Tropical House：反拍和弦、馬林巴、鋼鼓主旋律
      name: '夕陽雲海', bpm: 106, steps: 16, beat: 4, root: 58, scale: 'major', prog: [5, 3, 0, 4], sevenths: true, pump: true, wet: 1.0, vol: 0.9,
      pad: 'stab', padSeq: '..x...x...x...x.', arp: 'marimba', arpOct: 0, bass: 'round', bassOct: -2, lead: 'steelpan', leadOct: 1, epic: 'synth',
      arpSeq: [0, -1, 2, -1, 4, 2, -1, 4, 0, -1, 2, -1, 4, -1, 2, -1],
      bassSeq: 'R..R..R.R..R..R.',
      drums: { kick: 'x...x...x...x...', clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' },
      mel: ['4/2 4/2 6/2 4/2 2/4 1/2 2/6 4/2 6/2 7/8', '7/2 6/2 4/4 2/2 4/6 2/4 1/4 0/8'],
    },
  ];
  // 解析旋律字串
  for (const s of SONGS) {
    const parse = (str) => { const out = []; let pos = 0; for (const tok of str.trim().split(/\s+/)) { const [d, l] = tok.split('/'); const len = +l; if (d !== 'r') out.push([pos, +d, len]); pos += len; } return out; };
    s.leadSeq = s.mel.map(parse);
    if (s.counter) s.counter.notes = s.counter.seq.map(parse);
  }

  function degToMidi(song, deg, oct) {
    const s = SCALES[song.scale];
    const n = s.length;
    const o = Math.floor(deg / n);
    const d = ((deg % n) + n) % n;
    return song.root + s[d] + 12 * (o + (oct || 0));
  }
  // 聲部連接：在轉位與八度之間挑一個和上一個和弦最接近、且不偏離中心音域的排法
  function voiceLead(chord, prev, center) {
    const n = chord.length;
    const cands = [];
    for (let inv = 0; inv < n; inv++) {
      const v = chord.slice(inv).concat(chord.slice(0, inv).map((m) => m + 12));
      for (const sh of [-12, 0, 12]) cands.push(v.map((m) => m + sh));
    }
    let best = cands[0], bestCost = Infinity;
    for (const v of cands) {
      const mean = v.reduce((a, b) => a + b, 0) / n;
      let cost = Math.abs(mean - center) * 0.6;
      if (prev && prev.length === n) for (let i = 0; i < n; i++) cost += Math.abs(v[i] - prev[i]);
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
    return best;
  }
  // 副歌和弦進行：大調系用 IV-V-vi-I、小調系用 VI-VII-i-v、五聲音階用 5-6-1-1 一類的進行
  function chorusProg(song) {
    if (song.chorus) return song.chorus;
    const n = SCALES[song.scale].length;
    if (n === 5) return [3, 4, 0, 0];
    return ['major', 'lydian'].includes(song.scale) ? [3, 4, 5, 0] : [5, 6, 0, 4];
  }
  // 副歌旋律：以和弦音為骨架，單數小節往上爬、雙數小節往下收在長音上
  function chorusBar(song, deg, cbar, S, Bt) {
    const five = SCALES[song.scale].length === 5;
    const up = five ? [2, 3, 5, 7] : [2, 4, 7, 9];
    const down = five ? [7, 5, 4, 3] : [9, 7, 6, 4];
    const rise = cbar % 2 === 0;
    const rh = S === 16 ? (rise ? [[0, 6], [6, 2], [8, 4], [12, 4]] : [[0, 4], [4, 4], [8, 8]])
      : Bt === 3 ? (rise ? [[0, 6], [6, 3], [9, 3]] : [[0, 3], [3, 3], [6, 6]])
      : (rise ? [[0, 4], [4, 4], [8, 4]] : [[0, 6], [6, 2], [8, 4]]);
    const tones = rise ? up : down;
    return rh.map(([st, len], i) => [st, deg + tones[Math.min(i, tones.length - 1)] + (cbar % 4 === 3 && !rise ? -2 : 0), len]);
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
    voiceBudget: 84,
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
      // 母帶：溫和的膠水壓縮 → 低頻飽滿 / 高頻空氣感 → 防爆音限幅
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 1.8; comp.attack.value = 0.012; comp.release.value = 0.25;
      // 手機喇叭放不出 45Hz 以下，這段只會吃掉音量空間、讓喇叭和壓縮器破音 → 直接濾掉
      const lowShelf = c.createBiquadFilter(); lowShelf.type = 'highpass'; lowShelf.frequency.value = 42; lowShelf.Q.value = 0.7;
      const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 42; hp2.Q.value = 0.7;
      const air = c.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = 2;
      const mud = c.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 320; mud.Q.value = 0.9; mud.gain.value = -2.5;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.3;
      // 最後一道柔性削波：萬一還是超過，也是圓滑的飽和而不是數位爆音
      const soft = c.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15); }
      soft.curve = curve; soft.oversample = '2x';
      this.master = c.createGain();
      this.master.gain.value = 0.78;
      this.masterFilter.connect(comp); comp.connect(lowShelf); lowShelf.connect(hp2); hp2.connect(mud); mud.connect(air); air.connect(limiter); limiter.connect(this.master); this.master.connect(soft); soft.connect(c.destination);

      // 效果：延遲 + 殘響（音樂與音效共用）
      // 殘響：預延遲 + 立體聲、越後面越暗的空間；延遲：左右來回的乒乓回音
      this.fxIn = c.createGain();
      const pre = c.createDelay(0.1); pre.delayTime.value = 0.022;
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.6);
      const revLo = c.createBiquadFilter(); revLo.type = 'highpass'; revLo.frequency.value = 180; // 殘響不要糊低頻
      this.delay = c.createDelay(2);
      this.delay.delayTime.value = 0.375;
      this.delayR = c.createDelay(2);
      this.delayR.delayTime.value = 0.375;
      const fb = c.createGain(); fb.gain.value = 0.3;
      const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3000;
      const dhp = c.createBiquadFilter(); dhp.type = 'highpass'; dhp.frequency.value = 250;
      const merge = c.createChannelMerger(2);
      const dret = c.createGain(); dret.gain.value = 0.55;
      const ret = c.createGain(); ret.gain.value = 0.85;
      this.fxIn.connect(pre); pre.connect(revLo); revLo.connect(this.reverb);
      this.fxIn.connect(dhp); dhp.connect(this.delay);
      this.delay.connect(dlp); dlp.connect(this.delayR); this.delayR.connect(fb); fb.connect(this.delay);
      dlp.connect(merge, 0, 0); this.delayR.connect(merge, 0, 1);
      merge.connect(dret); dret.connect(ret);
      dret.connect(this.reverb);
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
      const sr = c.sampleRate;
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        // 漫射尾巴：雜訊經一階低通，低通係數隨時間變大 → 高頻比低頻先消失，聽起來溫暖不刺耳
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len;
          const cut = 0.85 - 0.75 * Math.pow(k, 0.6);
          lp += (Math.random() * 2 - 1 - lp) * cut;
          const env = Math.pow(1 - k, 2.2) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
          d[i] = lp * env * 1.4;
        }
        // 早期反射：左右聲道不同的幾個離散回音，增加空間定位感
        const taps = ch ? [0.013, 0.021, 0.034, 0.047, 0.061] : [0.009, 0.017, 0.029, 0.041, 0.055];
        taps.forEach((tt, j) => { const i = Math.floor(tt * sr); if (i < len) d[i] += (j % 2 ? -1 : 1) * (0.5 - j * 0.07); });
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
      // 同時發聲數上限：音樂太滿時略過新音符，避免手機音訊執行緒來不及算而爆音（音效不受限）
      const isMusic = o.out && o.out !== this.sfxOut;
      const nOsc = (o.waves || [1]).length + (o.vib ? 1 : 0);
      if (isMusic) {
        const now = c.currentTime;
        if (!this.voiceList) this.voiceList = [];
        if (this.voiceList.length > 64) this.voiceList = this.voiceList.filter((v) => v[0] > now);
        let active = 0;
        for (const v of this.voiceList) if (v[0] > now) active += v[1];
        if (active + nOsc > this.voiceBudget) return;
        const a0 = o.a || 0.005;
        this.voiceList.push([o.d ? t + a0 + o.d : t + Math.max(o.dur || 0.2, a0) + (o.r || 0.1), nOsc]);
      }
      const g = c.createGain();
      let input = g;
      if (o.dist) {
        // 失真：tanh 曲線（依強度快取）
        if (!this.distCurves) this.distCurves = {};
        if (!this.distCurves[o.dist]) { const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * o.dist) / Math.tanh(o.dist); } this.distCurves[o.dist] = cv; }
        const ws = c.createWaveShaper(); ws.curve = this.distCurves[o.dist];
        ws.connect(g); input = ws;
      }
      if (o.cut) {
        const f = c.createBiquadFilter();
        f.type = o.ftype || 'lowpass';
        f.Q.value = o.q || 0.7;
        f.frequency.setValueAtTime(Math.min(18000, o.cut * (o.cutEnv || 1)), t);
        if (o.cutEnv) f.frequency.exponentialRampToValueAtTime(o.cut, t + (o.cutTime || 0.15));
        f.connect(input);
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
      const outs = Array.isArray(out) ? out : [out];
      const n = midis.length;
      const v = (vel || 1) / Math.sqrt(n);
      const P = {
        warm: { waves: [['sawtooth', -8, 0.45], ['triangle', 7, 0.6]], cut: 850, a: 0.6, r: 1.3, peak: 0.06, wet: 0.55 },
        glass: { waves: [['sine', 0, 0.6], ['triangle', 5, 0.3, 2]], a: 0.45, r: 1.6, peak: 0.07, wet: 0.6 },
        saw: { waves: [['sawtooth', -10, 0.45], ['sawtooth', 10, 0.45]], cut: 1500, a: 0.25, r: 0.8, peak: 0.05, wet: 0.45 },
        choir: { waves: [['sawtooth', -6, 0.4], ['sawtooth', 6, 0.4], ['sine', 0, 0.3, 2]], cut: 1100, q: 2.2, a: 0.8, r: 1.6, peak: 0.055, wet: 0.65 },
        stab: { waves: [['sawtooth', -8, 0.5], ['square', 8, 0.2]], cut: 900, cutEnv: 4, cutTime: 0.12, d: 0.32, peak: 0.065, wet: 0.35 },
        supersaw: { waves: [['sawtooth', -18, 0.2], ['sawtooth', -8, 0.2], ['sawtooth', 0, 0.2], ['sawtooth', 8, 0.2], ['sawtooth', 18, 0.2]], cut: 2200, a: 0.15, r: 0.6, peak: 0.055, wet: 0.5 },
        power: { waves: [['sawtooth', -6, 0.5], ['sawtooth', 6, 0.5]], dist: 4, cut: 2400, q: 0.7, a: 0.004, s: 0.9, r: 0.06, peak: 0.08, wet: 0.12 },
      }[timbre];
      if (timbre === 'epianoComp') { midis.forEach((m, i) => this.pluck(t + i * 0.008, m, 'epiano', outs[i % outs.length], 0.8 * (vel || 1))); return; }
      if (timbre === 'power') midis = [midis[0], midis[0] + 7, midis[0] + 12]; // 強力和弦：根音 + 五度 + 八度
      midis.forEach((m, i) => this.synth(Object.assign({}, P, { t, f: mtof(m), dur, peak: P.peak * v, out: outs[i % outs.length] })));
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
        // 伽倻琴：絲弦溫暖的撥奏，餘音帶「弄絃」揉音
        harp: { waves: [['triangle', 0, 0.6], ['sine', 0, 0.3, 2]], pitchFrom: 1.005, glide: 0.02, d: 1.6, peak: 0.08, wet: 0.6 },
        musicbox: { waves: [['sine', 0, 0.8], ['sine', 0, 0.25, 4.01], ['sine', 0, 0.08, 9.3]], a: 0.001, d: 1.4, peak: 0.09, wet: 0.7 },
        marimba: { waves: [['sine', 0, 0.9], ['sine', 0, 0.25, 3.96]], a: 0.002, pitchFrom: 1.01, glide: 0.02, d: 0.45, peak: 0.1, wet: 0.3 },
        clav: { waves: [['square', 0, 0.4], ['sawtooth', 0, 0.3]], cut: 2500, cutEnv: 2, cutTime: 0.05, q: 4, d: 0.16, peak: 0.085, wet: 0.2 },
        guitar: { waves: [['sawtooth', 0, 0.4], ['triangle', 0, 0.4]], cut: 2000, cutEnv: 2, cutTime: 0.1, d: 0.25, peak: 0.06, wet: 0.3 },
        nylon: { waves: [['triangle', 0, 0.7], ['sine', 0, 0.3, 2], ['sawtooth', 0, 0.05]], cut: 3000, cutEnv: 1.5, cutTime: 0.15, pitchFrom: 1.003, glide: 0.02, d: 1.0, peak: 0.085, wet: 0.45 },
        pizz: { waves: [['triangle', 0, 0.7], ['sine', 0, 0.3]], cut: 1500, d: 0.22, peak: 0.1, wet: 0.5 },
        stringOst: { waves: [['sawtooth', -6, 0.4], ['sawtooth', 6, 0.4]], cut: 1800, cutEnv: 1.6, cutTime: 0.08, a: 0.01, d: 0.2, peak: 0.06, wet: 0.3 },
        steelpan: { waves: [['sine', 0, 0.8], ['sine', 0, 0.3, 2], ['sine', 0, 0.15, 3.01]], a: 0.003, pitchFrom: 1.01, glide: 0.02, d: 0.7, peak: 0.09, wet: 0.4 },
        gayageum: { waves: [['triangle', 0, 0.7], ['sine', 0, 0.25, 2], ['sawtooth', 0, 0.08]], cut: 2600, cutEnv: 2.2, cutTime: 0.18, pitchFrom: 0.988, glide: 0.06, vib: [5.2, 0.011], d: 1.25, peak: 0.09, wet: 0.5 },
      }[timbre];
      this.synth(Object.assign({}, P, { t, f, peak: P.peak * v, out }));
    },

    // 弦樂團：五把鋸齒波微微走音疊在一起，慢起慢收
    strings(t, midis, dur, vel, out) {
      const outs = Array.isArray(out) ? out : [out];
      const v = vel / Math.sqrt(midis.length);
      midis.forEach((m, i) => {
        this.synth({ t, f: mtof(m), dur, waves: [['sawtooth', -13, 0.36], ['sawtooth', 0, 0.3], ['sawtooth', 12, 0.36]],
          cut: 1300 + vel * 1700, q: 0.5, a: 0.45, s: 0.9, r: 1.1, peak: 0.05 * v, out: outs[i % outs.length], wet: 0.6 });
      });
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
        sub: { waves: [['sine', 0, 1], ['triangle', 0, 0.35]], a: 0.01, s: 0.8, r: 0.12, peak: 0.18 },
        saw: { waves: [['sawtooth', 0, 0.6], ['sawtooth', -7, 0.4]], cut: 380, cutEnv: 4, cutTime: 0.1, q: 4, a: 0.005, s: 0.6, r: 0.08, peak: 0.12 },
        round: { waves: [['triangle', 0, 1], ['sine', 0, 0.5]], cut: 900, a: 0.01, s: 0.7, r: 0.1, peak: 0.2 },
        upright: { waves: [['triangle', 0, 1], ['sine', 0, 0.5]], cut: 1200, pitchFrom: 1.02, glide: 0.03, a: 0.005, s: 0.4, r: 0.1, peak: 0.2 },
        slap: { waves: [['sawtooth', 0, 0.5], ['square', 0, 0.3]], cut: 900, cutEnv: 5, cutTime: 0.06, q: 3, a: 0.003, s: 0.5, r: 0.08, peak: 0.14 },
        808: { waves: [['sine', 0, 1], ['triangle', 0, 0.3]], pitchFrom: 1.35, glide: 0.07, a: 0.004, s: 0.85, r: 0.18, peak: 0.2 },
      }[timbre];
      while (midi < 33) midi += 12; // 低於 55Hz 手機聽不到，移到聽得到的八度
      this.synth(Object.assign({}, P, { t, f: mtof(midi), dur, out, wet: 0.04 }));
    },

    leadNote(t, midi, dur, timbre, out, vel) {
      const f = mtof(midi);
      // 琵琶輪指：快速重複撥弦
      if (timbre === 'pipaTrem') {
        for (let k = 0; k * 0.075 < dur; k++) this.pluck(t + k * 0.075, midi, 'pipa', out, (vel || 1) * (k ? 0.55 + 0.1 * Math.sin(k) : 1));
        return;
      }
      const P = {
        choirLead: { waves: [['sawtooth', -8, 0.35], ['sawtooth', 8, 0.35], ['sine', 0, 0.3]], ftype: 'bandpass', cut: 900, q: 1.3, a: 0.18, s: 0.85, r: 0.5, vib: [5, 0.006], peak: 0.09, wet: 0.7 },
        whistle: { waves: [['sine', 0, 0.9], ['sine', 0, 0.05, 2]], pitchFrom: 1.03, glide: 0.04, a: 0.02, s: 0.85, r: 0.12, vib: [6, 0.008], peak: 0.085, wet: 0.45 },
        square: { waves: [['square', -5, 0.35], ['square', 5, 0.35]], cut: 2600, a: 0.01, s: 0.8, r: 0.15, vib: [5.5, 0.006], peak: 0.05, wet: 0.45 },
        trumpetLead: { waves: [['sawtooth', 0, 0.5], ['sawtooth', 7, 0.35], ['square', 0, 0.1]], cut: 900, cutEnv: 3, cutTime: 0.12, q: 1.5, a: 0.03, s: 0.8, r: 0.15, vib: [5.5, 0.006], peak: 0.06, wet: 0.35 },
        trumpet: { waves: [['sawtooth', 0, 0.6], ['square', 0, 0.2]], ftype: 'bandpass', cut: 1300, q: 3, pitchFrom: 0.97, glide: 0.06, a: 0.04, s: 0.8, r: 0.25, vib: [5, 0.009], peak: 0.08, wet: 0.5 },
        ney: { waves: [['sine', 0, 0.8], ['triangle', 0, 0.15, 2], ['sawtooth', 0, 0.03]], pitchFrom: 0.95, glide: 0.15, a: 0.12, s: 0.8, r: 0.4, vib: [5, 0.012], peak: 0.08, wet: 0.6 },
        shaku: { waves: [['sine', 0, 0.85], ['triangle', 0, 0.1, 2]], pitchFrom: 0.92, glide: 0.25, a: 0.1, s: 0.75, r: 0.5, vib: [4, 0.014], peak: 0.09, wet: 0.65 },
        horn: { waves: [['sawtooth', 0, 0.3], ['triangle', 0, 0.6]], cut: 700, cutEnv: 2, cutTime: 0.2, a: 0.08, s: 0.85, r: 0.35, vib: [4.5, 0.004], peak: 0.1, wet: 0.55 },
        fiddle: { waves: [['sawtooth', -3, 0.45], ['sawtooth', 4, 0.35]], ftype: 'bandpass', cut: 1900, q: 1, pitchFrom: 0.985, glide: 0.05, a: 0.04, s: 0.85, r: 0.2, vib: [6.2, 0.012], peak: 0.07, wet: 0.45 },
        guitarLead: { waves: [['sawtooth', 0, 0.5], ['square', 0, 0.3]], dist: 3, cut: 2600, q: 0.8, pitchFrom: 0.97, glide: 0.06, a: 0.01, s: 0.85, r: 0.2, vib: [5.5, 0.01], peak: 0.05, wet: 0.35 },
        soft: { waves: [['triangle', 0, 0.7], ['sine', 0, 0.25, 2]], a: 0.03, s: 0.7, r: 0.35, vib: [5, 0.006], peak: 0.075, wet: 0.55 },
        saw: { waves: [['sawtooth', -6, 0.4], ['sawtooth', 6, 0.4]], cut: 2200, a: 0.02, s: 0.7, r: 0.25, vib: [5.5, 0.005], peak: 0.045, wet: 0.5 },
        flute: { waves: [['sine', 0, 0.8], ['triangle', 0, 0.15, 2]], a: 0.07, s: 0.8, r: 0.3, vib: [4.5, 0.007], peak: 0.08, wet: 0.6 },
        whale: { waves: [['sine', 0, 1], ['triangle', 0, 0.2]], pitchFrom: 0.94, glide: 0.35, a: 0.35, s: 0.85, r: 1.2, vib: [3, 0.01], peak: 0.07, wet: 0.85 },
        xiao: { waves: [['sine', 0, 0.9], ['triangle', 0, 0.1, 2]], pitchFrom: 0.97, glide: 0.15, a: 0.1, s: 0.8, r: 0.5, vib: [4, 0.007], peak: 0.09, wet: 0.7 },
        suona: { waves: [['square', 0, 0.35], ['sawtooth', 0, 0.45]], ftype: 'bandpass', cut: 1500, q: 1.6, pitchFrom: 0.94, glide: 0.08, a: 0.03, s: 0.85, r: 0.2, vib: [6, 0.012], peak: 0.09, wet: 0.4 },
        dizi: { waves: [['sine', 0, 0.85], ['triangle', 0, 0.12, 2]], pitchFrom: 1.06, glide: 0.07, a: 0.05, s: 0.8, r: 0.25, vib: [5.5, 0.008], peak: 0.085, wet: 0.55 },
        erhu: { waves: [['sawtooth', -4, 0.45], ['sawtooth', 4, 0.35]], cut: 1700, q: 1.2, pitchFrom: 0.955, glide: 0.14, a: 0.08, s: 0.85, r: 0.3, vib: [6, 0.011], peak: 0.05, wet: 0.5 },
        // 大笒：低沉帶氣聲的竹笛，起音往上滑、揉音寬而慢
        daegeum: { waves: [['sine', 0, 0.85], ['triangle', 0, 0.16, 2], ['sawtooth', 0, 0.03, 3]], pitchFrom: 0.94, glide: 0.2, a: 0.09, s: 0.82, r: 0.45, vib: [4.4, 0.013], peak: 0.085, wet: 0.65 },
        // 奚琴：鼻音較重的拉弦
        haegeum: { waves: [['sawtooth', -3, 0.5], ['sawtooth', 5, 0.3]], ftype: 'bandpass', cut: 1250, q: 2.2, pitchFrom: 0.95, glide: 0.16, a: 0.09, s: 0.85, r: 0.35, vib: [6.4, 0.014], peak: 0.085, wet: 0.55 },
        // K-pop 人聲切片風格的主旋律
        chop: { waves: [['sawtooth', -7, 0.4], ['square', 7, 0.25], ['sine', 0, 0.3, 2]], ftype: 'bandpass', cut: 1400, cutEnv: 1.8, cutTime: 0.08, q: 2.5, a: 0.008, s: 0.6, r: 0.12, vib: [6, 0.004], peak: 0.07, wet: 0.45 },
      }[timbre];
      if (!P) { this.pluck(t, midi, timbre, out, vel); return; } // 撥弦類樂器當主旋律（鋼片琴、鋼鼓、尼龍吉他）
      this.synth(Object.assign({}, P, { t, f, dur, out, peak: P.peak * (vel || 1) }));
      const breath = { flute: 0.012, dizi: 0.012, xiao: 0.012, whistle: 0.01, ney: 0.03, shaku: 0.035 }[timbre];
      if (breath) this.noise({ t, ftype: 'bandpass', freq: f * 2, q: 3, a: 0.05, d: Math.min(dur, 0.5), peak: breath * (vel || 1), out });
      if (timbre === 'daegeum') this.noise({ t, ftype: 'bandpass', freq: f * 1.5, q: 2, a: 0.08, d: Math.min(dur, 0.6), peak: 0.022 * (vel || 1), out, wet: 0.4 });
    },

    drum(kind, t, vel, out) {
      const v = vel || 1;
      switch (kind) {
        case 'kick':
          this.synth({ t, f: 52, pitchFrom: 3, glide: 0.1, waves: [['sine', 0, 1], ['sine', 0, 0.25, 2]], d: 0.38, peak: 0.6 * v, out });
          this.noise({ t, freq: 3500, d: 0.012, peak: 0.08 * v, out });
          break;
        case 'kickSoft':
          this.synth({ t, f: 50, pitchFrom: 2.4, glide: 0.12, waves: [['sine', 0, 1], ['sine', 0, 0.2, 2]], d: 0.45, peak: 0.38 * v, out });
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
          this.synth({ t, f: 62, pitchFrom: 1.15, glide: 0.3, waves: [['sine', 0, 1]], d: 1.2, peak: 0.45 * v, out, wet: 0.4 });
          this.synth({ t, f: 110, waves: [['sine', 0, 1]], d: 0.5, peak: 0.12 * v, out });
          this.noise({ t, ftype: 'lowpass', freq: 320, d: 0.15, peak: 0.12 * v, out });
          break;
        case 'taikoBig':
          this.synth({ t, f: 55, pitchFrom: 1.9, glide: 0.15, waves: [['sine', 0, 1], ['sine', 0, 0.2, 2]], d: 0.85, peak: 0.55 * v, out, wet: 0.4 });
          this.noise({ t, ftype: 'lowpass', freq: 500, d: 0.2, peak: 0.22 * v, out });
          break;
        case 'woodblock':
          this.synth({ t, f: 880, pitchFrom: 1.1, glide: 0.02, waves: [['sine', 0, 1]], d: 0.06, peak: 0.2 * v, out, wet: 0.2 });
          this.noise({ t, ftype: 'bandpass', freq: 1800, q: 6, d: 0.02, peak: 0.06 * v, out });
          break;
        case 'tanggu':
          this.synth({ t, f: 64, pitchFrom: 1.8, glide: 0.12, waves: [['sine', 0, 1]], d: 0.55, peak: 0.48 * v, out, wet: 0.25 });
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
        case 'brush':
          this.noise({ t, ftype: 'bandpass', freq: 3000, q: 0.6, a: 0.02, d: 0.18, peak: 0.08 * v, out, wet: 0.2 });
          break;
        case 'ride':
          this.noise({ t, freq: 7000, d: 0.35, peak: 0.045 * v, out, wet: 0.2 });
          this.synth({ t, f: 5200, waves: [['square', 0, 0.5], ['square', 0, 0.5, 1.42]], d: 0.3, peak: 0.012 * v, out });
          break;
        case 'gated': // 80 年代閘門殘響小鼓
          this.noise({ t, ftype: 'bandpass', freq: 1700, q: 0.6, a: 0.002, d: 0.24, peak: 0.26 * v, out, wet: 0.6 });
          this.synth({ t, f: 190, pitchFrom: 1.3, waves: [['triangle', 0, 1]], d: 0.12, peak: 0.14 * v, out });
          break;
        case 'doum':
          this.synth({ t, f: 85, pitchFrom: 1.3, glide: 0.06, waves: [['sine', 0, 1]], d: 0.35, peak: 0.5 * v, out, wet: 0.2 });
          this.noise({ t, ftype: 'lowpass', freq: 400, d: 0.05, peak: 0.1 * v, out });
          break;
        case 'tek':
          this.noise({ t, ftype: 'bandpass', freq: 3500, q: 2, d: 0.04, peak: 0.2 * v, out, wet: 0.2 });
          this.synth({ t, f: 700, waves: [['triangle', 0, 1]], d: 0.05, peak: 0.08 * v, out });
          break;
        case 'frame': // 框鼓 / 寶思蘭鼓
          this.synth({ t, f: 90, pitchFrom: 1.6, glide: 0.05, waves: [['sine', 0, 1]], d: 0.3, peak: 0.45 * v, out, wet: 0.2 });
          this.noise({ t, ftype: 'lowpass', freq: 1200, d: 0.06, peak: 0.1 * v, out });
          break;
        case 'tamb':
          this.noise({ t, freq: 7500, a: 0.005, d: 0.12, peak: 0.06 * v, out });
          this.noise({ t: t + 0.03, freq: 9000, d: 0.08, peak: 0.03 * v, out });
          break;
        case 'kickHard':
          this.synth({ t, f: 60, pitchFrom: 3, glide: 0.06, waves: [['sine', 0, 1], ['sine', 0, 0.25, 2]], d: 0.22, peak: 0.5 * v, out });
          this.noise({ t, freq: 4000, d: 0.012, peak: 0.18 * v, out });
          break;
        case 'bowl': // 頌缽：兩個略微走音的分音產生拍頻
          [[1, 0.06], [1.006, 0.05], [2.71, 0.02]].forEach(([r, pk]) => this.synth({ t, f: 262 * r, waves: [['sine', 0, 1]], a: 0.05, d: 5, peak: pk * v, out, wet: 0.8 }));
          break;
        case 'janggu': // 長鼓左面「宮」：低沉圓潤
          this.synth({ t, f: 96, pitchFrom: 1.45, glide: 0.08, waves: [['sine', 0, 1], ['triangle', 0, 0.2, 1.5]], d: 0.45, peak: 0.42 * v, out, wet: 0.25 });
          this.noise({ t, ftype: 'lowpass', freq: 900, d: 0.05, peak: 0.08 * v, out });
          break;
        case 'jangguHi': // 長鼓右面「德」：竹鞭清脆的拍擊
          this.noise({ t, ftype: 'bandpass', freq: 2200, q: 1.8, d: 0.06, peak: 0.16 * v, out, wet: 0.25 });
          this.synth({ t, f: 340, pitchFrom: 1.3, glide: 0.02, waves: [['triangle', 0, 1]], d: 0.07, peak: 0.12 * v, out });
          break;
        case 'buk': // 韓國桶鼓：深沉
          this.synth({ t, f: 62, pitchFrom: 1.7, glide: 0.12, waves: [['sine', 0, 1]], d: 0.65, peak: 0.48 * v, out, wet: 0.3 });
          this.noise({ t, ftype: 'lowpass', freq: 450, d: 0.1, peak: 0.14 * v, out });
          break;
      }
    },

    // ---------- 播放器 ----------
    makePlayer(idx, startAt, stage, rate) {
      const c = this.ctx;
      const song = SONGS[idx];
      const p = {
        idx, song, step: 0, start: startAt, next: startAt, stage: stage || 0, stageTarget: stage || 0, rate: rate || 1,
        stepDur: 60 / (song.bpm * (rate || 1)) / (song.beat || 4), chords: [], stopping: false, dead: false,
      };
      p.fadeDry = c.createGain(); p.fadeWet = c.createGain();
      p.fadeDry.gain.value = 0.0001; p.fadeWet.gain.value = 0.0001;
      p.fadeDry.gain.setValueAtTime(0.0001, startAt);
      p.fadeDry.gain.exponentialRampToValueAtTime(song.vol || 1, startAt + 0.6);
      p.fadeWet.gain.setValueAtTime(0.0001, startAt);
      p.fadeWet.gain.exponentialRampToValueAtTime((song.wet || 1) * (song.vol || 1), startAt + 0.6);
      if (song.lofi) {
        // Lo-fi：整體壓暗高頻，像老唱片
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.Q.value = 0.5;
        p.fadeDry.connect(lp); lp.connect(this.musicBus);
      } else p.fadeDry.connect(this.musicBus);
      p.fadeWet.connect(this.musicWet);
      p.duck = c.createGain(); p.duck.connect(p.fadeDry);
      p.duckWet = c.createGain(); p.duckWet.connect(p.fadeWet);
      p.outMain = { dry: p.duck, wet: p.duckWet };
      p.outDrum = { dry: p.fadeDry, wet: p.fadeWet };
      // 立體聲：琶音左右交錯、和弦聲部分散、鼓組各就各位
      const panned = (dest, wet, pan) => {
        if (!c.createStereoPanner) return { dry: dest, wet };
        const sp = c.createStereoPanner(); sp.pan.value = pan; sp.connect(dest);
        return { dry: sp, wet };
      };
      p.outL = panned(p.duck, p.duckWet, -0.6);
      p.outR = panned(p.duck, p.duckWet, 0.6);
      p.outWide = [p.outL, p.outMain, p.outR];
      p.drumPan = {};
      for (const k in DRUM_PAN) p.drumPan[k] = panned(p.fadeDry, p.fadeWet, DRUM_PAN[k]);
      p.voicing = null;
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
        const bar = cur.stepDur * (cur.song.steps || 16);
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
      const f = this.boost >= 2 || this.build ? 20000 : [1500, 2600, 4200, 8000, 14000, 20000][Math.max(0, Math.min(5, stage))];
      const t = Math.max(at || 0, this.ctx.currentTime);
      for (const node of [this.musicTone, this.wetTone]) {
        node.frequency.cancelScheduledValues(t);
        node.frequency.setTargetAtTime(f, t, 0.8);
      }
      const st = Math.max(0, Math.min(5, stage));
      const g = [0.5, 0.62, 0.76, 0.98, 1.16, 1.36][st] * (this.boost >= 2 || this.build ? 1.08 : 1);
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
          const swing = p.song.swing && (p.song.beat || 4) === 4 && p.step % 2 ? p.song.swing * p.stepDur : 0;
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
      const S = p.song.steps || 16, Bt = p.song.beat || 4;
      const s16 = step % S;
      const bar = Math.floor(step / S);
      let entered = 0;
      if (s16 === 0) {
        const prev = p.stage;
        p.stage = p.stageTarget;
        if (p.stage > prev) entered = p.stage;
        if (p.stage < 3) p.chorusBar = null; else if (p.chorusBar == null) p.chorusBar = bar;
      }
      const stage = p.stage;
      // 最終副歌升全音（Key change）
      const song = stage >= 5 ? (p.songUp || (p.songUp = Object.assign({}, p.song, { root: p.song.root + 2 }))) : p.song;
      const chorus = stage >= 3;
      const prog = chorus ? chorusProg(song) : song.prog;
      const cbar = chorus && p.chorusBar != null ? bar - p.chorusBar : bar;
      const deg = prog[cbar % prog.length];
      if (s16 === 0) {
        p.chords.push({ t, deg });
        if (p.chords.length > 4) p.chords.shift();
      }
      const out = p.outMain;
      const climax = stage >= 5;
      const hot = climax || this.boost >= 2;
      const onBeat = s16 % Bt === 0;
      const dpan = (k) => p.drumPan[k] || p.outDrum;
      // 進入新段落：鈸 + 大鼓重擊 + 和弦湧起，讓段落轉換聽得出來
      if (entered >= 2) {
        const east = song.epic === 'eastern' || song.gong;
        this.drum(east ? 'gong' : 'crash', t, 0.9, p.outDrum);
        this.drum(east ? 'taikoBig' : song.epic === 'orch' ? 'timpani' : 'kick', t, 1, p.outDrum);
        if (entered >= 3) this.pad(t, chordMidis(song, deg, 1, 3), p.stepDur * S, song.epic === 'synth' ? 'supersaw' : 'choir', p.outWide, 0.7);
      }

      // 和聲（聲部連接：挑最接近上一個和弦的轉位）
      if (s16 === 0) p.voicing = voiceLead(chordMidis(song, deg, 0, song.ext ? 5 : undefined), p.voicing, song.root + 5);
      if (song.pad) {
        if (song.padSeq) {
          if (song.padSeq[s16] === 'x' && (stage >= 1 || s16 === 0)) this.pad(t, p.voicing, p.stepDur * 2, song.pad, p.outWide, 1);
        } else if (s16 === 0) this.pad(t, p.voicing, p.stepDur * S, song.pad, p.outWide, 1);
      }
      // 琶音 / 伴奏音型
      if (song.arp && song.arpSeq) {
        const ai = song.arpSeq[s16];
        if (ai >= 0) {
          const hv = 0.86 + Math.random() * 0.24 + (onBeat ? 0.08 : 0);
          const side = (s16 >> 1) % 2 ? p.outR : p.outL;
          this.pluck(t + Math.random() * 0.006, extTone(song, deg, ai, song.arpOct || 0), song.arp, side, (stage === 0 ? 0.8 : 1) * hv);
          if (hot || stage >= 4) this.pluck(t + p.stepDur * 0.5, extTone(song, deg, ai + 2, (song.arpOct || 0) + 1), song.arp, side === p.outL ? p.outR : p.outL, 0.4);
        }
      }
      // 低音
      if (stage >= 1 && song.bass) {
        if (song.bassSeq === 'walk') {
          // 爵士行走低音：每拍一音，最後一拍用半音接近下一個和弦根音
          if (onBeat) {
            const bi = s16 / Bt, nb = S / Bt;
            const nextDeg = song.prog[(bar + 1) % song.prog.length];
            let m;
            if (bi === 0) m = degToMidi(song, deg, song.bassOct);
            else if (bi === nb - 1) m = degToMidi(song, nextDeg, song.bassOct) + (Math.random() < 0.5 ? -1 : 1);
            else m = degToMidi(song, deg + [0, 2, 4, 5][bi] , song.bassOct);
            this.bassNote(t, m, p.stepDur * Bt * 0.9, song.bass, out);
          }
        } else if (song.bassSeq) {
          const ch = song.bassSeq[s16];
          if (ch && ch !== '.' && ch !== '-') {
            let len = 1;
            while (s16 + len < S && song.bassSeq[s16 + len] === '-') len++;
            const off = (SCALES[song.scale].length === 5 ? { R: 0, 5: 3, 3: 2, O: 5 } : { R: 0, 5: 4, 3: 2, O: 7 })[ch] || 0;
            this.bassNote(t, degToMidi(song, deg + off, song.bassOct), p.stepDur * len * 0.95, song.bass, out);
          }
        }
      }
      // 鼓
      for (const kind in song.drums) {
        const need = song.drumStage && song.drumStage[kind] != null ? song.drumStage[kind] : DRUM_STAGE[kind] != null ? DRUM_STAGE[kind] : 2;
        if (stage < need) continue;
        const ch = song.drums[kind][s16];
        if (!ch || ch === '.') continue;
        let v = ch === 'X' ? 1.25 : ch === 'o' ? 0.5 : 1;
        if (kind === 'hat' || kind === 'shaker' || kind === 'tamb' || kind === 'ride') v *= onBeat ? 1 : 0.62 + Math.random() * 0.18;
        this.drum(kind, t, v, dpan(kind));
        if ((kind === 'kick' || kind === 'kickHard') && song.pump) {
          for (const g of [p.duck.gain, p.duckWet.gain]) {
            g.cancelScheduledValues(t);
            g.setValueAtTime(0.42, t);
            g.linearRampToValueAtTime(1, t + p.stepDur * 3);
          }
        }
      }
      // 每 8 小節最後一拍的過門（用這首歌自己的鼓）
      if (stage >= 2 && !this.build && bar % 8 === 7 && s16 >= S - Bt) {
        const d = song.drums || {};
        const kind = d.snare ? 'snare' : d.gated ? 'gated' : d.tanggu ? 'tanggu' : d.janggu ? 'jangguHi' : d.frame ? 'frame' : d.doum ? 'tek' : d.buk ? 'buk' : d.taikoBig ? 'taikoBig' : d.brush ? 'brush' : null;
        if (kind && ((s16 - (S - Bt)) % 2 === 0 || stage >= 3)) this.drum(kind, t, 0.45 + (s16 - (S - Bt)) * 0.12, dpan(kind));
      }
      // 副歌的推進層：大鼓在 1、3 拍（最終副歌每拍），低音疊高八度
      if (chorus && song.drums && Object.keys(song.drums).length && !song.drums.bowl) {
        const big = song.drive ? 'kick' : song.epic === 'eastern' || song.gong ? 'taikoBig' : song.epic === 'orch' ? 'timpani' : 'tom';
        const every = stage >= 5 ? Bt : Bt * 2;
        if (s16 % every === 0 && !(song.drums[big] && song.drums[big][s16] === 'x')) this.drum(big, t, s16 === 0 ? 0.8 : 0.55, p.outDrum);
      }
      if (chorus && song.bass && song.bassSeq && song.bassSeq !== 'walk') {
        const ch = song.bassSeq[s16];
        if (ch && ch !== '.' && ch !== '-') this.bassNote(t, degToMidi(song, deg, song.bassOct + 1), p.stepDur * 0.9, song.bass, out);
      }
      if (song.lofi && Math.random() < 0.3) this.noise({ t: t + Math.random() * p.stepDur, freq: 2500, d: 0.004, peak: 0.015 + Math.random() * 0.03, out: p.outDrum });
      if (song.rain && s16 === 0) this.noise({ t, ftype: 'bandpass', freq: 2600, q: 0.4, a: 0.6, d: p.stepDur * (S + 1), peak: 0.045, out: p.outDrum, wet: 0.2 });
      if (song.gong && stage >= 3 && s16 === 0 && bar % 4 === 0) this.drum('gong', t, 1, p.outDrum);
      // 高潮層：依曲風不同
      const tri = chordMidis(song, deg, 0, 3);
      const half = S / 2;
      if (song.epic === 'orch' || song.epic === 'eastern') {
        const east = song.epic === 'eastern';
        if (stage >= 3 && s16 === 0) this.strings(t, tri.map((m) => m + 12), p.stepDur * S, [0, 0, 0, 0.6, 0.85, 1.1][stage], p.outWide);
        if (stage >= 3) {
          const hit = east ? s16 === 0 || (stage >= 4 && s16 === half) || (stage >= 5 && onBeat) : (s16 === 0 && (bar % 2 === 0 || stage >= 4)) || (stage >= 5 && s16 === half);
          if (hit) this.drum(east ? 'taikoBig' : 'timpani', t, s16 === 0 ? 1 : 0.7, p.outDrum);
        }
        if (!east && stage >= 4 && (s16 === 0 || (s16 === S - 2 && bar % 2 === 1))) this.brass(t, tri.map((m) => m + 12), p.stepDur * (s16 === 0 ? 3 : 2), stage >= 5 ? 1 : 0.7, out);
      } else if (song.epic === 'choir') {
        if (stage >= 3 && s16 === 0) this.pad(t, tri.map((m) => m + 12), p.stepDur * S, 'choir', p.outWide, [0, 0, 0, 0.8, 1, 1.2][stage]);
        if (stage >= 5 && s16 === 0) this.pad(t, [tri[0] + 24, tri[2] + 24], p.stepDur * S, 'glass', p.outWide, 0.8);
      } else if (song.epic === 'synth') {
        if (stage >= 3 && s16 % Bt === Bt / 2) this.pad(t, tri.map((m) => m + 12), p.stepDur * 1.5, 'stab', p.outWide, 0.55 + (stage - 3) * 0.15);
        if (stage >= 4 && bar % 8 === 7 && s16 === 0) this.riser(t, t + p.stepDur * S);
      }
      // 升級前的鋪陳：有鼓的曲子用滾奏，安靜的曲子只用升騰音
      if (this.build) {
        if (song.drive || song.epic === 'orch' || song.epic === 'eastern') {
          const dense = s16 >= S * 0.75 ? 1 : s16 >= S / 2 ? 2 : 4;
          if (s16 % dense === 0) this.drum(song.epic === 'eastern' ? 'tanggu' : 'snare', t, 0.3 + 0.7 * (s16 / S), p.outDrum);
        }
        if (s16 === 0) this.riser(t, t + p.stepDur * S);
      }
      // 舞曲類高潮：補滿 16 分音符鈸、每兩小節一記鈸
      if (song.drive && hot && stage >= 2) {
        const hatOn = song.drums.hat && song.drums.hat[s16] !== '.';
        if (!hatOn) this.drum('hat', t, s16 % 4 === 2 ? 0.8 : 0.45, dpan('hat'));
      }
      if (song.drive && climax && s16 === 0 && bar % 2 === 0) this.drum('crash', t, 0.6, p.outDrum);
      // 主旋律
      //   主歌（第 1~2 階）：作曲的旋律；第 1 階每隔一句才唱，第 2 階每句都唱
      //   副歌（第 3 階起）：依和弦生成的上揚旋律，音域更高、更長的音；第 4 階起疊八度
      const phrase = Math.floor(step / (S * 2));
      const sP = step % (S * 2);
      if (!chorus && stage >= 1 && song.leadSeq && (stage >= 2 || phrase % 2 === 0)) {
        const motif = song.leadSeq[phrase % song.leadSeq.length];
        const section = Math.floor(step / (S * 8));
        const shift = section % 2 === 1 && song.leadSeq.length > 1 && phrase % 2 === 0 ? 2 : 0;
        const lv = stage >= 2 ? 0.8 : 0.55;
        for (let i = 0; i < motif.length; i++) {
          const [st, d, len] = motif[i];
          if (st !== sP) continue;
          const dd = i === motif.length - 1 ? d : d + shift;
          this.leadNote(t, degToMidi(song, dd, song.leadOct), p.stepDur * len * 0.92, song.lead, out, lv * (0.92 + Math.random() * 0.12));
        }
      }
      if (chorus) {
        const notes = chorusBar(song, deg, cbar, S, Bt);
        for (const [st, d, len] of notes) {
          if (st !== s16) continue;
          this.leadNote(t, degToMidi(song, d, song.leadOct), p.stepDur * len * 0.94, song.lead, out, 1);
          if (stage >= 4) this.leadNote(t, degToMidi(song, d, song.leadOct + 1), p.stepDur * len * 0.94, song.lead, p.outR, stage >= 5 ? 0.55 : 0.4);
        }
      }
      // 對位旋律（第 3 階起）
      if (song.counter && stage === 2) {
        const motif = song.counter.notes[phrase % song.counter.notes.length];
        for (const [st, d, len] of motif) if (st === sP) this.leadNote(t, degToMidi(song, d, song.counter.oct || 0), p.stepDur * len * 0.9, song.counter.t, p.outR, 0.55);
      }
    },

    // 目前聽到的和弦（給音效取音）
    chordNow() {
      const p = this.current() || this.players[this.players.length - 1];
      if (!p || !this.ctx) return { song: SONGS[0], deg: 0 };
      const now = this.ctx.currentTime;
      let deg = p.song.prog[0];
      for (const ch of p.chords) if (ch.t <= now) deg = ch.deg;
      return { song: (p.stage >= 5 && p.songUp) || p.song, deg };
    },

    // 給畫面用的節拍資訊
    beatInfo() {
      const p = this.current();
      if (!p || !this.ctx || this.ctx.state !== 'running') return { phase: 0.5, beat: 0, drums: false, playing: false };
      const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
      const el = now - p.start;
      if (el < 0) return { phase: 0.5, beat: 0, drums: false, playing: false };
      const beats = el / (p.stepDur * (p.song.beat || 4));
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
          this.synth({ t: now, f: 58, pitchFrom: 2.6, glide: 0.08, waves: [['sine', 0, 1], ['sine', 0, 0.3, 2]], d: 0.26, peak: 0.4, out });
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
            this.synth({ t: t0, f: 55, pitchFrom: 2.2, glide: 0.2, waves: [['sine', 0, 1], ['sine', 0, 0.25, 2]], d: 0.7, peak: 0.36, out });
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
        case 'warp':
          // 進入超空間：1.4 秒的升騰音 + 低頻漸強
          this.riser(now, now + 1.4);
          this.synth({ t: now, f: 55, pitchFrom: 0.5, glide: 1.3, waves: [['sawtooth', 0, 0.5], ['sine', 0, 1]], cut: 300, cutEnv: 0.3, cutTime: 1.3, a: 1.2, s: 1, dur: 1.3, r: 0.1, peak: 0.12, out, wet: 0.3 });
          for (let i = 0; i < 8; i++) this.synth({ t: now + i * 0.16, f: mtof(tone(i, 1)), waves: [['sine', 0, 0.7], ['sine', 0, 0.2, 2]], d: 0.5, peak: 0.04 + i * 0.006, out, wet: 0.7 });
          break;
        case 'arrive':
          // 抵達新場景：大鼓轟鳴 + 鈸 + 和弦光芒
          this.drum('taikoBig', now, 1.3, out);
          this.drum('timpani', now, 1, out);
          this.drum('crash', now, 1.4, out);
          this.synth({ t: now, f: 52, pitchFrom: 2, glide: 0.4, waves: [['sine', 0, 1], ['sine', 0, 0.25, 2]], d: 1.2, peak: 0.42, out });
          [0, 2, 4, 7, 9].forEach((i) => this.synth({ t: now + 0.05, f: mtof(tone(i, 1)), waves: [['sine', 0, 0.6], ['triangle', 0, 0.2, 2]], d: 2.2, peak: 0.06, out, wet: 0.8 }));
          break;
        case 'goShout':
          [76, 79, 83, 88].forEach((m, i) => this.synth({ t: now + i * 0.04, f: mtof(m), waves: [['sawtooth', -6, 0.3], ['sawtooth', 6, 0.3]], cut: 3000, d: 0.5, peak: 0.05, out, wet: 0.5 }));
          this.drum('kick', now, 1, out);
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
        case 'attack':
          // 發射攻擊：上揚的掃頻光束
          this.noise({ t: now, ftype: 'bandpass', freq: 600, freqEnd: 6000, sweep: 0.25, q: 2, d: 0.3, peak: 0.07, out, wet: 0.4 });
          this.synth({ t: now, f: mtof(tone(0, 1)), pitchFrom: 0.5, glide: 0.18, waves: [['sawtooth', 0, 0.4]], cut: 2500, d: 0.3, peak: 0.05, out, wet: 0.4 });
          break;
        case 'warn':
          // 垃圾行來襲：低沉警告雙音
          [0, 0.16].forEach((dt) => this.synth({ t: now + dt, f: mtof(52), waves: [['square', 0, 0.5]], cut: 900, d: 0.14, peak: 0.06, out }));
          break;
        case 'garbage':
          // 垃圾行頂上來：沉重撞擊
          this.synth({ t: now, f: 55, pitchFrom: 2.2, glide: 0.25, waves: [['sine', 0, 1], ['sine', 0, 0.3, 2]], d: 0.45, peak: 0.42, out });
          this.noise({ t: now, freq: 900, d: 0.18, peak: 0.12, out });
          this.drum('tom', now, 0.9, out);
          break;
        case 'win':
          [0, 2, 4, 7].forEach((i, k) => this.synth({ t: now + k * 0.09, f: mtof(tone(i, 1)), waves: [['sine', 0, 0.7], ['triangle', 0, 0.25, 2]], d: 1.2, peak: 0.08, out, wet: 0.7 }));
          this.drum('crash', now + 0.3, 1.1, out);
          this.drum('taikoBig', now, 1, out);
          break;
      }
    },
  };

  root.LumenAudio = A;
})(typeof self !== 'undefined' ? self : this);
