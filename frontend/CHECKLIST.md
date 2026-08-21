# 前端執行清單 (FRONTEND CHECKLIST)

> 印出來貼在牆上。每個 Block 結束時全隊站著唸一次。
> 詳細規格看 [`PLAN.md`](./PLAN.md)。

---

## 🟢 BLOCK 1 — 奠基 (H+0 → H+2)　**全隊同一張桌子**

- [ ] 0:00–0:30　E 主持唸完主計劃 §0 §1。**不准重新討論 v2 已定案的七點**
- [ ] 0:30–1:00　逐行唸 `core/types.ts`。有異議現在提，之後不准改
- [ ] 確認 wire 格式用 `host`/`guest` 不用 `me`/`them`（`../backend/PLAN.md` §5.3）
- [ ] 1:00–1:30　E 推 repo 骨架：vite + TS + three、`types.ts`、`bus.ts`、`config.ts`、`main.ts`、`CLAUDE.md`
- [ ] 每個人 `npm i && npm run dev` 跑得起來
- [ ] 五條 branch 開好：`ivan/tracking` `b/runes` `c/match` `d/scene` `e/net`
- [ ] 1:30–2:00　Ivan 交付 `mouseSource.ts`
- [ ] 確認 `../rules.md`：**AI 不准 commit / push，全部由人類做**

### ✅ M0 驗收（H+2）
- [ ] **所有人開網頁移動滑鼠，console 印出 WandFrame**
> 達不到就留下來解決，**不要進 Block 2**。

---

## 🟢 BLOCK 2 — 核心迴圈 (H+2 → H+8)

### Ivan · tracking
- [ ] MediaPipe Tasks 裝好，webcam 開起來
- [ ] 畫面上畫出 landmark + 外推筆尖點
- [ ] CV 30Hz 迴圈與遊戲 60Hz 分離
- [ ] `oneEuro.ts` 平滑上線

### B · runes
- [ ] `recognizer.ts` $1 移植完成（resample/rotate/scale/translate/distanceAtBestAngle）
- [ ] 硬 code 假 template 先測通
- [ ] `segmenter.ts` 狀態機（含 `e.repeat` 擋 key repeat、`window.blur` 保險）
- [ ] `console.time` 確認判定 <5ms

### C · match
- [ ] Wizard A/D 移動、W/S 瞄準、Space 三態
- [ ] 施法時 A/D/Space 全部失效
- [ ] 火球 + 飛行 + 命中判定
- [ ] **學徒 bot**
- [ ] 固定步長模擬迴圈（accumulator）

### D · scene
- [ ] Three.js 雙塔 6 平台場景
- [ ] `EffectComposer` + `UnrealBloomPass`
- [ ] 法師方塊人（先不用做好看）
- [ ] **符文拖尾**（Canvas2D overlay，多層描邊，**不准 shadowBlur**）

### E · 整合
- [ ] Debug HUD（`~`）
- [ ] 熱鍵 `1`/`2`/`3`/`M`/`B`
- [ ] 四個模組串進 `main.ts`
- [ ] 後端骨架（見 `../backend/CHECKLIST.md`）

- [ ] 每 2 小時站起來講 30 秒現況（不准超過 5 分鐘）
- [ ] **H+4 merge main + smoke test**

### ✅ M1 驗收（H+8，全隊圍著看）
- [ ] 按住 Shift → 法陣亮起 → 滑鼠畫 △ → 放開 → 拖尾吸附成完美三角 → 火球飛向 bot → bot 掉血
> **這 6 秒 loop 通了，專案就活了。**

---

## 🟡 BLOCK 3 — 真實輸入 + 完整規則 (H+8 → H+14)　**最危險的 block**

### Ivan
- [ ] MediaPipe 接上主流程
- [ ] 🔴 **MediaPipe wasm + .task 模型下載到 `public/mediapipe/`**（不要靠 CDN，會場斷網就死）
- [ ] 跟 B 一起坐著調 `TIP_EXTEND_PX` 與 One Euro 參數
- [ ] 丟失容忍（`LOST_FRAMES_TOLERANCE`）
- [ ] `hsvSource.ts` 綠色膠紙（降採樣到 160×120）

### B
- [ ] 🔴 **用 webcam 重錄所有 template，滑鼠 template 全部作廢**
- [ ] 每符文 ≥8 樣本，**至少 2 個不同的人**錄
- [ ] ○ 關閉旋轉不變性
- [ ] Z/△ 起終點距離規則
- [ ] 調 `CAST_THRESHOLD` / `HINT_THRESHOLD`

### C
- [ ] 護盾 + 閃電 + 穿盾規則
- [ ] 術士 bot
- [ ] 勝負判定 + 90 秒時限

### D
- [ ] 三個法術特效（火球拋物線+撞擊 / 護盾半球 / 閃電折線）
- [ ] 施法法陣（半徑隨 castProgress）
- [ ] 瞄準指示器三段虛線（**要顯眼**）
- [ ] 🔴 字體自架 `public/fonts/`，不要 link Google Fonts

### E
- [ ] HSV source 整合進 tracker
- [ ] WebSocket 通道打通（先傳空訊息也算）

- [ ] **H+12 merge main + smoke test**
- [ ] ⚠️ **H+14 檢查點：webcam 辨識率 <60% → 立刻執行 Kill #1（綠色膠紙），不要 debug MediaPipe**

### ✅ M2 驗收（H+14）
- [ ] 拿真筆對 webcam，三個符文都能施
- [ ] 能打贏學徒 bot

---

## 🔵 BLOCK 4 — 睡覺 (H+14 → H+22)　**強制**

- [ ] 第一批睡 H+14→20：Ivan、B、D
- [ ] 值班 H+14→20：C、E
- [ ] 第二批睡 H+20→26：C、E
- [ ] 值班 H+20→26：Ivan、B、D
- [ ] 值班只做低風險工作（bot 難度、音效素材、投影片、README、切版）
- [ ] **不准值班時改核心架構**

> 第 30 小時沒睡的人寫的 code 會害死團隊。

---

## 🟡 BLOCK 5 — 連線與內容 (H+20 → H+28)

### Ivan
- [ ] 校準頁三步驟完成（步驟 2 是教學）
- [ ] 設定頁（靈敏度 / 外推 / source / 鏡像 / 音量），存 `localStorage`

### B
- [ ] 每個符文測 20 次，**數據寫下來**，目標 85%
- [ ] 不同人畫都能中（至少 3 個人測過）

### C
- [ ] 大法師 bot
- [ ] 平衡：傷害、護盾時長、冷卻、bot 反應時間
- [ ] 結算數據

### D
- [ ] 音效全部（火球/護盾/閃電/失敗悶響/受傷/開場/環境低頻）
- [ ] 🔴 `audioCtx.resume()` 綁在第一次點擊
- [ ] 粒子打磨、受傷 / 勝負演出

### E
- [ ] `RemoteOpponent` + `toLocalView()` 視角轉換
- [ ] 斷線降級 bot（**兩個方向都要**，見 `../backend/PLAN.md` §6.2 §6.3）
- [ ] 大廳頁、結算頁
- [ ] 遙測上報（批次、失敗不重試）

- [ ] **H+16 / H+20 / H+24 各 merge 一次**

### ✅ M3 驗收（H+22）
- [ ] 🔴 **兩個並排視窗**（不是兩個分頁！背景分頁 rAF 會被節流到 1Hz）對戰
- [ ] 一方關掉，另一方自動接管成 bot 且不中斷
- [ ] host 關掉 / guest 關掉 **兩個方向都測**

### ✅ M4 驗收（H+26）
- [ ] 登入 → 校準 → 大廳 → 對戰 → 結算全通

### 🔬 H+26 外部測試（30 分鐘，比自己 debug 3 小時更有價值）
- [ ] 找 2 個團隊外的人對戰，**站旁邊看，什麼都不要說**
- [ ] 記錄：幾秒畫出第一個成功符文？（目標 <30 秒）
- [ ] 記錄：搞懂 W/S 瞄準了嗎？（搞不懂是 UI 的問題，不是他們的問題）
- [ ] 記錄：有沒有主動說「再來一場」？

### ✅ M5 驗收（H+27）
- [ ] 陌生人 30 秒內成功施法並理解瞄準

---

## 🔴 BLOCK 6 — 凍結與打磨 (H+28 → H+32)

- [ ] 28–30　修外部測試發現的問題，**只修最痛的前三個**
- [ ] **H+30 🔒 FEATURE FREEZE — 之後只准改 `config.ts` 數值與文案**
- [ ] 30–31　全隊各自完整打一場，列 bug，**只修 crash 級別**
- [ ] 31–32　**錄 demo 影片**（台上炸掉時的保險）
- [ ] 影片下載到本機，不是靠 YouTube

### ✅ M6 驗收（H+30）
- [ ] 無 crash
- [ ] 線上網址可玩

---

## 🔴 BLOCK 7 — Demo 準備 (H+32 → H+36)

- [ ] 32–33　投影片完成（**最多 5 張**）
      1. 遊戲截圖 + 標題（不要 bullet point）
      2. 問題：兩手被佔用 → 視角控制死路 → 三層相對瞄準
      3. 架構圖
      4. 數據：辨識率 / fps / 施法次數 / 延遲
      5. 下一步 + QR code
- [ ] 33–34　**完整彩排 3 次**，計時，每次真的操作，不准用講的
- [ ] 34–35　現場環境測試：換場地、換燈光、換筆、**用會場網路測連線**
- [ ] 35–36　緩衝。什麼都不要做。喝水，充電，深呼吸

### ✅ M7 驗收（H+34）
- [ ] 彩排 3 次完成
- [ ] 影片已錄

---

## 🎬 上台前檢查清單

```
□ 兩支筆（各帶一支備用）
□ 綠色膠紙
□ 檯燈 ×2          ← 認真的，會場燈光是最大變數
□ 兩台筆電充飽 + 接電源
□ 手機熱點開好、密碼寫在紙上
□ 兩台都只留一個瀏覽器分頁，關掉所有其他 app
□ webcam 權限預先授權
□ 🔴 兩台都確認拿得到 webcam（https 或 localhost，見 PLAN.md §7.1）
□ 🔴 伺服器已叫醒（免費方案冷啟 ~50 秒）
□ 背景乾淨（不要有人在後面走動）
□ 提前在實際位置測過追蹤率
□ 提前在會場網路測過房間連線
□ demo 影片已下載到本機
□ 全隊知道 M 鍵切滑鼠、B 鍵切 bot
□ 講者跟操作者是不同的人，並且練過默契
```
**操作者要是練習最多次的人，不一定是講最好的人。**

---

## 🪓 Kill List（按順序砍，不要猶豫）

- [ ] 1. 貼綠色膠紙（MediaPipe → HSV），包裝成「魔杖的能量水晶」
- [ ] 2. 砍到只剩 △ ○ 兩個符文
- [ ] 3. 樓層 3 層 → 2 層
- [ ] 4. 只做單人 bot 模式，砍掉整個 `net/`
- [ ] 5. 砍音效 → 砍結算頁 → 砍設定頁 → 砍遙測
- [ ] 6. 最後防線：滑鼠模式 + 錄好的影片

**砍東西不是失敗，是 36 小時內唯一能交付的方法。**

---

## 📌 三條鐵律（每次 merge 前唸一次）

1. **每 4 小時 merge 一次 main。** 不准有活超過 4 小時的 branch
2. **H+30 功能凍結。** 之後只准修 bug、調 config、做 demo
3. **卡住超過 45 分鐘必須開口。** 立刻切去 Kill List 的替代方案
