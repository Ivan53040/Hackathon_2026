# 前端執行清單 (FRONTEND CHECKLIST)

> **v6 — 第一人稱 + 手部追蹤 + 遮蔽物 + 魔量。走位是 A/D。** 印出來貼在牆上。
> 規格 [`PLAN.md`](./PLAN.md) · 分工 [`WORKSPLIT.md`](./WORKSPLIT.md) · 動畫 [`ANIMATION.md`](./ANIMATION.md)
>
> **★ = 相對 v5 的差異。⚠️ v5 曾經砍掉「牆」與「MP」，v6 已經把兩個都加回來了** ——
> 舊表頭寫成「v5 砍掉 牆 · MP」，跟 `PLAN.md` v6 和實際的 code 相反，已更正。
>
> 🕐 **時程以 [`WORKSPLIT.md`](./WORKSPLIT.md) 的時鐘為準**（13:00 / 14:00 / … / 08:24 上台）。
> 下面的 `H+` 區塊是 36 小時版留下來的，**只當「做完沒」的清單用，不要照它排睡覺時間**
> （真正的睡覺班表在 WORKSPLIT §5）。

---

## 🟢 BLOCK 1 — 奠基（H+0 → H+2）　全隊同一張桌子

- [ ] 唸完 [`PLAN.md`](./PLAN.md) 開頭那句話與 §0.5。**v5 已定案的七點不准重新討論**
- [ ] 逐行唸 `core/types.ts`（`WandFrame.tip`；`Projectile.toX`）與 `core/input.ts`
- [ ] ★ 確認 wire 用 `host`/`guest`，不用 `me`/`them`
- [ ] ★ 確認**投射物發射當下鎖定 `toX`，之後不追蹤** ← 這是「閃得掉」的實作
- [ ] **E** 推 repo 骨架：vite + TS + three、`types.ts`、`bus.ts`、`config.ts`、`CLAUDE.md`
- [ ] 每個人 `npm i && npm run dev` 跑得起來
      ⚠️ `vite-plugin-mkcert` **第一次會要 sudo 密碼**（裝本機 CA）。在自己的終端機跑、輸入密碼就過；
      在不能輸密碼的環境（CI／代跑）會直接起不來
- [ ] 五條 branch：`ivan/tracking` `b/runes` `c/match` `d/view` `e/core`
- [ ] **Ivan** 交付 `mouseSource.ts`（滑鼠 x → `head`）
- [ ] 讀 [`../rules.md`](../rules.md)：**AI 不准 commit / push**

### ✅ M0（H+2）
- [ ] ✅ **已通過**：開網頁按 A/D 柱子會動、滑鼠是筆尖、Shift 出現光環
> 達不到就留下來解決，不要進 Block 2。

---

## 🟢 BLOCK 2 — 核心迴圈（H+2 → H+8）

### Ivan · tracking
- [ ] MediaPipe HandLandmarker 接上 webcam，畫面上看得到筆尖
- [ ] CV 30Hz 與遊戲 60Hz 分離（**CV 不准在 rAF 裡跑**）
- [ ] `oneEuro.ts` 平滑上線

### B · runes　→ **Bill 已交付**（`src/runes/`）
- [x] $1 Recognizer（resample / rotate / scale / translate / distanceAtBestAngle）
- [x] ★ 角點數前置判斷：`3 角 → △ 攻擊`、`4 角 → □ 建造`
- [x] `segmenter.ts`（`e.repeat` 擋重複、`window.blur` 保險）
- [x] `performance.now()` 確認判定 <5ms　→ **實測 median 0.31ms · p95 0.38ms**

### C · match　→ **Bill 已交付**（`src/match/`）
- [x] ★ `x` 由 `getMoveAxis()` 驅動，**無慣性無加速度**
- [x] `attack` + 投射物 + 命中判定（**比對 `toX`**）+ MP 扣除與回復
- [x] **學徒 bot**
- [x] 固定步長模擬迴圈（accumulator, 1/60）

### D · view
- [ ] 🔴 **`ui/tokens.css` 第一版 — H+3 前交付，E 與 B 在等**
- [ ] ★ 第一人稱相機，FOV 55°，對手在視線水平高度
- [ ] ★ 對手佔位剪影 + 讀 `public/anim/manifest.json` 的路徑（素材後到）
- [ ] 符文拖尾（Canvas2D overlay，多層描邊，**不准 shadowBlur**）

### E · 整合
- [ ] Debug HUD（`~`）：`tracker fps | game fps | tip | head | hp | RTT | mode`
- [ ] 保命熱鍵 `1`/`2` 切 source、`M` 滑鼠模式、`B` 強制 bot
- [ ] 四個模組串進 `main.ts`

### 動畫三人組
- [ ] 🔴 **H+4：角色參考圖定案**（[`ANIMATION.md`](./ANIMATION.md) §2.1），全隊看過才往下

- [ ] **H+4 merge main + smoke test**

### ✅ M1（H+8，全隊圍著看）
- [ ] 按住 Shift → 起手光暈 → 滑鼠畫 △ → 放開 → 吸附成完美三角 → **火球朝鏡頭飛過來** → bot 掉血
> **這 6 秒 loop 通了，專案就活了。**

---

## 🟡 BLOCK 3 — 真實輸入（H+8 → H+14）　最危險的 block

### Ivan
- [ ] 🔴 **MediaPipe wasm + .task 下載到 `public/mediapipe/`**（會場斷網保命）
- [ ] ★ 量 fps：掉幀就把 CV 降到 15Hz，再不行走 HSV

### B
- [ ] 🔴 **用 webcam 重錄全部 template，滑鼠 template 作廢**
- [ ] 每符文 ≥8 樣本，**至少 2 個不同的人**錄
- [ ] 調 `CAST_THRESHOLD`

### C　→ **Bill 已交付**
- [x] 🔴 **遮蔽物 C1–C5**：擋攻擊、撐兩次、**從自己牆後開火要穿得過去**
- [x] 術士 bot
      ⚠️ 它是**看到火球才閃**，不是「看到起手就閃」—— 起手時閃沒有用，
      `toX` 是放開 Shift 那一刻才鎖定的，先閃只是換一條線被鎖
- [x] 勝負判定 + 時限（`MATCH_TIME_S` 到 → HP 高者勝）

### D
- [ ] 🔴 ★ 頭部視差 A8 —— **花一小時實測阻尼，太快會暈太慢沒感覺**
- [ ] ★ 投射物朝相機飛 A16，**尺度曲線前 70% 慢、後 30% 暴衝**
- [ ] ★ 命中 A17 + 震動 A9（**幅度 ≤8px**）
- [ ] 吸附特效 A13
- [ ] 🔴 字體自架 `public/fonts/`，不要 link Google Fonts

### 動畫三人組
- [ ] 人員 1：S1 idle / S2 charge 生成 + 抽格（**S2 最重要，多生幾次挑**）
- [ ] 你：F1 攻擊火球 / F3 命中爆散
- [ ] ★ 每段生完檢查：第一格與最後一格疊起來，**地面線有沒有跑掉**

- [ ] **H+12 merge + smoke test**
- [ ] ⚠️ **H+14 檢查點：辨識率 <60% 或 fps <45 → 立刻執行 Kill List，不要 debug**

### ✅ M2（H+14）
- [ ] 拿真筆對 webcam，△ 攻擊與 □ 建造都能施
- [ ] ★ **側身真的閃得掉火球**（這是 v5 的核心，閃不掉就沒有遊戲）
- [ ] 打贏學徒 bot

---

## 🔵 BLOCK 4 — 睡覺（H+14 → H+22）　強制

- [ ] 第一批 H+14→20：Ivan、B、D　·　值班：C、E
- [ ] 第二批 H+20→26：C、E　·　值班：Ivan、B、D
- [ ] 值班只做低風險工作（bot 難度、動畫生成、投影片、切版）
- [ ] **不准值班時改核心架構**

---

## 🟡 BLOCK 5 — 連線與內容（H+20 → H+28）

### Ivan
- [ ] 追蹤穩定度收尾，參數存 `localStorage`

### B
- [ ] 教學頁三步驟（偵測到手臉 → 試畫一次三角形 → 進場）
- [ ] 每個符文測 20 次，**數據寫下來**，目標 85%
- [ ] ★ **△ 與 □ 互相誤判 <5%**
      現況：程式生成的軌跡（含雜訊）0% 誤判，但**還沒有真人畫過**。
      18:00 拿到 webcam template 之後才算數

### C
- [x] 大法師 bot　→ 照 [`WORKSPLIT.md`](./WORKSPLIT.md) 20:00 的描述做：**蓋牆 → 從牆後開火 → 牆破了再蓋**
      （這一行原本寫的「抓畫完的空檔反擊」是 v5 的描述，v6 沒有施法定身，沒有空檔可抓）
- [ ] `remoteOpponent.ts` + 斷線降級 bot（**兩個方向都要測**）
- [ ] 平衡：傷害、繪製時間、`HIT_WIDTH`、bot 反應

### D
- [ ] ★ 對手 sprite 系統接上真素材（H+18 之後）
- [ ] ★ near-miss A10 —— **打空必須有回饋**，否則玩家不知道自己閃掉了
- [ ] 動畫全套接線（A1–A21）
- [ ] ★ `prefers-reduced-motion` 路徑：關 A8/A9/A10/A18，**保留 A13/A16/A19**
- [ ] 音效

### E
- [ ] 🔴 **H+20 前部署上線，拿到 https 網址**
- [ ] Landing / 大廳 / 結算三頁（**用 D 的 tokens，不准寫死 hex**）
- [ ] `ui/hud.ts`：你的 HP · 對手 HP · 時間 · 符文小抄 · webcam PIP
- [ ] 遙測 + summary

### 動畫三人組
- [ ] 🔴 **H+18：七個狀態全交 + `manifest.json`** → D 接線
- [ ] H+22：Landing 主視覺
- [ ] H+24：開場 3 秒

### ✅ M3（H+22）
- [ ] 🔴 **兩個並排視窗**（不是分頁，背景分頁 rAF 被節流會假失敗）對戰
- [ ] host 關掉 → guest 繼續 ✅　·　guest 關掉 → host 繼續 ✅

### ✅ M4（H+26）
- [ ] Landing → 教學 → 大廳 → 對戰 → 結算全通

### 🔬 H+26 外部測試（30 分鐘，比自己 debug 3 小時有價值）
- [ ] 找 2 個團隊外的人對戰，**站旁邊看，什麼都不要說**
- [ ] 🔴 ★ **第一個問題問「會不會暈」**，比「好不好玩」更早問
- [ ] 記錄：幾秒畫出第一個成功符文？（目標 <30 秒）
- [ ] 記錄：有沒有主動按 A/D 閃避？（沒有就是視覺回饋不夠）
- [ ] 記錄：有沒有說「再來一場」？

### ✅ M5（H+27）
- [ ] 陌生人 30 秒內成功施法、並且會用身體閃避、且不會暈

---

## 🔴 BLOCK 6 — 凍結與打磨（H+28 → H+32）

- [ ] 28–30　修外部測試發現的問題，**只修最痛的前三個**
- [ ] **H+30 🔒 FEATURE FREEZE + 素材凍結** —— 之後只准改 `config.ts` 與文案
- [ ] 30–31　全隊各自完整打一場，只修 crash 級別
- [ ] 🔴 **H+31 錄 demo 備援影片並下載到兩台筆電本機**（[`ANIMATION.md`](./ANIMATION.md) B4）
      內容要有：舉筆 → 畫符文 → 吸附 → 火球朝鏡頭 → 側身閃過 → 反擊命中

### ✅ M6（H+30）
- [ ] 無 crash，線上可玩，不會暈

---

## 🔴 BLOCK 7 — Demo（H+32 → H+36）

- [ ] 投影片 5 張：截圖／問題與解法／架構圖／數據／QR code
- [ ] **完整彩排 3 次**，計時，真的操作
- [ ] 🔴 ★ **站位彩排**：兩位玩家**側身面向觀眾，螢幕轉向觀眾**
      → 觀眾從螢幕讀對手、從真人讀玩家。**第一人稱只有這樣才成立**
- [ ] 現場環境測試：換場地、換燈光、換筆、**用會場網路測連線**
- [ ] 35–36 緩衝。什麼都不要做

### ✅ M7（H+34）
- [ ] 彩排 3 次完成 · 備援影片已錄且在本機

---

## 🎬 上台前檢查

```
□ 兩支筆（各帶備用）       □ 檯燈 ×2 ← 會場燈光是最大變數
□ 兩台筆電充飽 + 接電源     □ 手機熱點開好、密碼寫紙上
□ 兩台都只留一個分頁       □ webcam 權限預先授權
□ 🔴 兩台都確認拿得到 webcam（https 或 localhost）
□ 🔴 伺服器已叫醒（免費方案冷啟 ~50 秒）
□ 背景乾淨、提前在實際位置測過追蹤率與 fps
□ demo 備援影片在本機（不是靠 YouTube）
□ 全隊知道 M 鍵切滑鼠、B 鍵切 bot
□ 🔴 站位排練過：側身面向觀眾
```

---

## 🪓 Kill List（按順序砍，不要猶豫）

- [ ] 1. **貼綠色膠紙**（MediaPipe → HSV），包裝成「魔杖的能量水晶」
- [ ] 2. **砍掉建造 □，改成開場預置 2 面固定遮蔽物** —— 辨識率接近 100%，遊戲變純反應速度，仍然成立
- [ ] 3. **相機視差關掉** —— 解掉暈眩風險
- [ ] 5. **只做單人 bot 模式**，砍掉整個 `net/`
- [ ] 6. **動畫素材全砍**，用程式剪影（[`ANIMATION.md`](./ANIMATION.md) §6）
- [ ] 7. 砍音效 → 砍結算頁 → 砍遙測
- [ ] 8. **最後防線：滑鼠模式 + 錄好的影片**

> ⚠️ **不准砍**：符文吸附 A13 · 投射物尺度曲線 A16 · near-miss A10 · demo 備援影片。

---

## 📌 三條鐵律

1. **每 4 小時 merge 一次 main**
2. **H+30 功能凍結**
3. **卡住超過 45 分鐘必須開口**，立刻切 Kill List
