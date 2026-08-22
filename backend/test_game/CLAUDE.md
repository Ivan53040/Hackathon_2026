# RUNESPIRE — Agent 規格

## 專案
瀏覽器**第一人稱**魔法對戰。TypeScript + Vite + Three.js。
webcam 追蹤**臉**（頭部左右位移＝閃避）與**手 + 筆**（畫符文施法）。
兩個符文：△ 快擊 0.5s / ⬠ 重擊 1.5s。畫得越久越痛，也越危險。

完整規格：`frontend/PLAN.md`（v5）· 分工：`frontend/WORKSPLIT.md` · 動畫：`frontend/ANIMATION.md`

## 硬規則
- 型別一律從 `src/core/types.ts` import，不准自己定義重複型別
- 事件名一律用 `src/core/bus.ts` 的 `EV` 常數，不准用字面字串
- 參數一律從 `src/core/config.ts` 讀，**不准在別處寫 magic number**
- **不准修改 `config.ts` 的數值** —— 那是人類調參用的
- 樣式一律用 `src/ui/tokens.css` 的 token，**不准寫死 hex 與 px**
- 只改自己資料夾內的檔案（見 WORKSPLIT.md）
- 座標一律 normalized 0..1；`head` 是 −1..1
- wire 格式永遠用 `host`/`guest`，**不准出現 `me`/`them`**

## 效能規則（即時系統，會被檢查）
- 每幀熱路徑不准配置物件。拖尾用 `Float32Array` ring buffer，粒子與投射物用 object pool
- **不准用 Canvas2D `shadowBlur`** —— 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
  發光用多層描邊：20px α.15 / 10px α.35 / 3px 亮白核心
- CV 迴圈 30Hz 與遊戲迴圈 60Hz **分開**，遊戲讀最新值做插值，不等 CV
- 第一人稱震動 ≤8px、≤0.25s，超過會讓人暈
- 不准引入新的 npm 套件，先問

## 風格
- 函式短，優先純函式
- 註解寫「為什麼」，不寫「做什麼」
- 每個模組匯出明確的 init / update / dispose

## Git
- **不准 `git add` / `git commit` / `git push` / 開 PR**，見 `rules.md`
- 不准在 commit message 出現任何 AI 署名
