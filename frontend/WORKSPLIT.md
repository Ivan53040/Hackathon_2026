# 分工表 —— 20 小時版

> **08/22 11:35 定案。** 現況：剩 20.8 小時（到期 08/23 08:24）、遊戲程式碼 0 行、骨架與 `net/` 已完成。
> 規格 [`PLAN.md`](./PLAN.md) v6 · 動畫 [`ANIMATION.md`](./ANIMATION.md)

---

## 0. 五個人

| 誰 | 職責 | 只碰這些檔案 |
|---|---|---|
| **Wesley（你）** | 畫面 + 頁面 + 整合 | `src/view/` `src/ui/` `src/pages/` `src/main.ts` |
| **Bill** | 符文辨識 + 遊戲邏輯 | `src/runes/` `src/match/` |
| **Ivan** | 手部追蹤 | `src/tracking/` |
| **美術 A1** | 對手角色素材 | `public/anim/` |
| **美術 A2** | 場景 / 特效 / 投影片 / demo 影片 | `public/anim/fx/` · 簡報 |

**沒有人碰別人的資料夾。** 要別人改，在群組講一聲。

### 已經做完、不用再寫的
```
✅ package.json / vite / tsconfig      npm run dev 直接跑
✅ src/core/types.ts                   契約，v6 定死
✅ src/core/bus.ts                     事件常數
✅ src/core/config.ts                  所有可調數值
✅ src/core/input.ts                   A/D 走位 + Shift 起手
✅ src/tracking/{tracker,mouseSource,oneEuro}.ts
✅ src/net/{socket,remoteOpponent}.ts  連線 + 斷線降級
✅ server/**                           後端，npm run server 直接跑
```

---

## 1. 🔑 介面先訂死 —— 這一節是「不打結」的全部祕密

**兩個人同時寫，只要簽名對得上，最後就合得起來。**
**開工第一件事：把自己的檔案建出來、簽名寫好、裡面空著，先推上去。**
這樣對方 import 你的東西不會紅字，可以完全平行寫。

```ts
// ── src/runes/index.ts ───────────────────────── [Bill]
export function initRunes(): void;    // 內部自己 listen Shift + 讀 tracker.getFrame()
export function disposeRunes(): void;
// 發出：EV.CAST_BEGIN · EV.CAST (CastEvent) · EV.FIZZLE · EV.CAST_END

// ── src/match/index.ts ───────────────────────── [Bill]
export function initMatch(mode: Mode, opponent: Opponent): void;
export function tickMatch(dt: number): MatchState;   // 每幀呼叫，含 covers 與 canSeeThemStats
export function createBotOpponent(level: 'apprentice'|'warlock'|'archmage'): Opponent;
export function disposeMatch(): void;
// 監聽：EV.CAST
// 發出：EV.SPELL_FIRED · EV.SPELL_HIT · EV.COVER_BUILT · EV.COVER_HIT
//       EV.NEAR_MISS · EV.NO_MANA · EV.MATCH_OVER

// ── src/view/index.ts ────────────────────────── [Wesley]
export function initView(canvas: HTMLCanvasElement): void;
export function renderView(s: MatchState, f: WandFrame, dt: number): void;
export function disposeView(): void;
// 監聽：EV.CAST_BEGIN · EV.CAST · EV.FIZZLE · EV.SPELL_HIT
//       EV.NEAR_MISS · EV.COVER_BUILT · EV.COVER_HIT

// ── 已完成，直接用 ──────────────────────────────
getMoveAxis(): number      // core/input   −1 / 0 / 1
isCasting(): boolean       // core/input   按住 Shift
getFrame(): WandFrame      // tracking/tracker
createRemoteOpponent(): Opponent          // net
createRoom() / connect() / sendInput() / sendCast() / sendState()   // net
```

**型別全部從 `core/types.ts` import。事件名全部用 `core/bus.ts` 的 `EV`。**

---

## 2. 現在就開工，沒有人被卡住

| 你以為會卡在 | 其實 |
|---|---|
| 等 Ivan 的 webcam | ✅ `mouseSource` 能跑，`getFrame()` 現在就有值 |
| 等契約 | ✅ `types.ts` 已定死並推上去 |
| 等對方的模組 | ✅ 照 §1 建空檔案，互相 import 不會紅 |
| 等後端 | ✅ `npm run server` 直接跑 |
| 等連線 | ✅ `net/` 兩個檔案寫完了 |
| 等美術 | ✅ 對手先用色塊，素材到了換 sprite |

---

## 3. 任務卡

### 💻 Wesley — 畫面 + 頁面 + 整合

| 時間 | 交付 | 驗收 |
|---|---|---|
| **12:00** | `ui/tokens.css` 定案（先去投影機選方向，10 分鐘） | 顏色不用再改 |
| **13:00** | `view/`：Three.js 場景 + 第一人稱相機（FOV 55°）+ 對手色塊 | 看得到一個在視線水平高度的東西 |
| **14:00** | 🔴 **筆尖拖尾**（Canvas2D overlay，多層描邊，**不准 shadowBlur**） | **M1：畫 △ 看得到金色軌跡** |
| 15:00 | **火球朝相機飛** —— 尺度 `pow(progress, 2.4)`，前慢後爆 | 有壓迫感，不是慢慢變大 |
| 16:00 | 命中閃白 + 相機震動（**≤8px、≤0.25s**）+ 相機隨 `me.x` 側移 | 不會暈 |
| 17:00 | **遮蔽物 3D 方塊** + 耐久視覺（撐兩次，快破要看得出來） | 一眼看出牆快沒了 |
| 18:00 | **對手頭頂血魔量條**，被牆擋住顯示 `???` | 讀得到 |
| 19:00 | 🔴 **符文吸附特效**（120ms 插值變形成完美形狀） | **全場最值錢的 30 行** |
| **20:00** | 🔴 **部署上線，拿到 https 網址** | 手機開得起來 |
| 22:00 | Landing / 大廳 / 結算 + `ui/hud.ts` | 全流程走得完 |
| 00:00 | 對手 sprite 接 `manifest.json` | 素材到了就換掉色塊 |

### 🎮 Bill — 符文辨識 + 遊戲邏輯

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | `runes/`：$1 Recognizer + `segmenter.ts` Shift 狀態機 | **用滑鼠**按住 Shift 畫 △，console 印出 `{spell:'attack', score}` |
| **14:00** | 🔴 `match/`：`x` 由 `getMoveAxis()` 驅動 + 投射物 + 命中 + **學徒 bot** | **M1：畫 △ → 火球飛過去 → bot 掉血** |
| 15:00 | MP 扣除與自動回復 + 角點判定（3 角 → △、4 角 → □） | MP 條會長回來；亂畫不誤觸發 |
| **16:00** | 🔴 **遮蔽物 C1–C5**（見 [`PLAN.md`](./PLAN.md) §0.5） | 蓋牆擋得下攻擊、撐兩次、**從自己牆後開火穿得過去** |
| 17:00 | HP / 勝負 / 時限 + 術士 bot（會蓋牆） | 打不贏才對 |
| **18:00** | 🔴 **用 webcam 重錄 template**（等 Ivan 13:00 交付） | 兩個人各畫 8 次都能中 |
| 20:00 | 大法師 bot：蓋牆 → 從牆後開火 → 牆破了再蓋 | 正好把 C1/C2/C3 演給觀眾看 |
| 22:00 | 平衡（`DMG` / `COST` / `MP_REGEN` / `HIT_WIDTH` / bot 反應） | 沒有必勝打法 |

> 🔴 **兩條最容易寫錯的：**
> 1. **命中比對 `projectile.toX`，不是對手現在的 `x`。** `toX` 是發射當下鎖定的位置 —— 這一行就是「按 A/D 閃得掉」的實作
> 2. **C2：從自己的牆後面攻擊要穿過去，不要擋。** 擋住的話兩邊都會躲起來、30 秒沒人掉血。v3–v5 這條寫反了，v6 改回原始構想

### 🎯 Ivan — 手部追蹤

**只碰** `src/tracking/`。**不要給他任何其他工作**，這是最長的一根竿子。

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | `handSource.ts`：MediaPipe HandLandmarker 接 webcam | 畫面上看得到筆尖點跟著手動 |
| 15:00 | 筆尖外推（landmark 8 沿 8→5 方向）+ One Euro 平滑 | 正常速度畫大三角形，拖尾平滑無跳點 |
| 17:00 | 丟失容忍 + 模型檔載到 `public/mediapipe/` | 手移出畫面再回來不炸；斷網仍能跑 |
| 20:00 | 追蹤率調校，`1`/`2` 熱鍵即時切換 | 追蹤率 >90%，tracker ≥25fps |

**卡住的話**：切 `hsvSource.ts`（綠色膠紙，約 30 行），追蹤率立刻上去。

### 🎨 美術 A1 — 對手角色

**對手是玩家整場唯一看得到的角色。** 你們生的不是「動畫」，是「對手」。

| 時間 | 交付 |
|---|---|
| **13:00** | 🔴 **角色參考圖定案**（[`ANIMATION.md`](./ANIMATION.md) §2.1），全隊看過 |
| 16:00 | S1 `idle`（12 格 loop）+ 抽格 + 去背 |
| **18:00** | 🔴 **S2 `charge` 舉杖過頭** —— 玩家唯一的預警，**多生幾次挑最好的** |
| 20:00 | S6 `hit` 受擊 |
| **22:00** | 🔴 `manifest.json` 交給 Wesley |

> **只做 S1 / S2 / S6 三個就夠撐全場。** 七個是 36 小時版本的規模。
> 全部從**同一張參考圖** image-to-video，不然會生出三個不同的人。
> **鏡頭固定**：每段生完把第一格與最後一格疊起來，確認地面線沒跑掉。

### 🎨 美術 A2 — 場景 / 特效 / 簡報

| 時間 | 交付 |
|---|---|
| 15:00 | 背景板（**靜態圖** 2048×1024，不要影片） |
| 18:00 | F1 攻擊火球 loop + F3 命中爆散（**純黑底**，遊戲裡用加色混合） |
| 20:00 | F2 石牆升起與破碎 |
| 23:00 | 投影片 5 張：截圖／問題與解法／架構圖／數據／QR code |
| **04:00** | 🔴 **demo 備援影片，錄好並下載到兩台筆電本機** |

> **B4 不是宣傳素材，是保險。** 錄**真實遊玩畫面**（不是 AI 生成）：
> 舉筆 → 畫符文 → 吸附 → 火球朝鏡頭 → 按 A/D 閃過 → 蓋牆 → 從牆後反擊命中。

---

## 4. 檢查點（時間到就看，不討論）

| 時間 | 檢查點 | 標準 |
|---|---|---|
| **14:00** | **M1 核心迴圈** | 滑鼠畫 △ → 火球朝鏡頭飛 → bot 掉血 |
| **17:00** | **M2 真實輸入** | 真筆對 webcam 畫得出 △ 並命中；遮蔽物三條規則正確 |
| **20:00** | **M3 對戰 + 上線** | 兩個並排視窗互打；一方關掉自動變 bot；https 網址存在 |
| **23:00** | **M4 完整流程** | Landing → 對戰 → 結算全通 |
| **02:00** | **M5 外部驗證** | 找 2 個外人試玩，**第一個問題問「會不會暈」** |
| **04:00** | 🔒 **凍結 + 影片錄好** | 只准改 `config.ts` 數值 |
| **06:00** | **M6 彩排 3 次** | 計時，真的操作 |
| **08:24** | 上台 | |

### ⚠️ 三條中止線 —— 時間到就砍，不要開會
- **14:00 M1 沒過** → 砍到一個符文、砍掉連線，全隊集中做單人 bot
- **17:00 辨識率 <60%** → 貼綠色膠紙走 HSV，不要 debug MediaPipe
- **20:00 連線不通** → 砍掉 `net/`，只做單人。**觀眾看不出差別**

---

## 5. 睡覺（強制）

| 時段 | 睡 | 值班 |
|---|---|---|
| 22:00 – 01:00 | Bill、A1 | Wesley、Ivan、A2 |
| 01:00 – 04:00 | Wesley、Ivan | Bill、A1、A2 |
| 04:00 – 06:00 | A2 | 其他人 |

值班只做低風險工作（調參、素材、投影片）。**不准值班時改核心架構。**

---

## 6. 三條鐵律

1. **每 2 小時 merge 一次 main**
2. **04:00 功能凍結**
3. **卡住超過 30 分鐘必須開口**，立刻切 [`PLAN.md`](./PLAN.md) §10 Kill List

> Git branch：`wesley/view` · `bill/match` · `ivan/tracking`
> **AI 不准 commit / push**（見 [`../rules.md`](../rules.md)）
