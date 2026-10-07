# 狗狗哇沙米光律方塊 (Lumen Drop)

網頁版落下方塊遊戲，手感優先。支援鍵盤、手把、手機觸控。

- 遊玩：https://jaywasami.github.io/lumen-drop/
- 手機：用 Chrome 開啟 →「加到主畫面」即可全螢幕、離線遊玩
- 測試：`node test/engine.test.js`

## 結構
- `engine.js` 遊戲核心邏輯（SRS、7-bag、DAS/ARR、鎖定延遲、T-Spin、Combo、B2B…）
- `input.js` 鍵盤 / 手把 / 螢幕按鍵 / 手勢
- `main.js` 介面、渲染、特效、設定
- `audio.js` 程式作曲的背景音樂（8 首，含兩首中國風五聲音階曲，隨消行逐層疊加）與跟著和弦走的動作音效
- `scenes.js` 八個動態場景：星空、深海、極光、水墨、霓虹都市、櫻花、燈節、夕陽雲海
- `post.js` WebGL 後製：光暈、衝擊波、色差
