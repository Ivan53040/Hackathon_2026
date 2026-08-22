# 分工表 —— 21 小時版

> **08/22 11:15 定案。原本的 H+0→H+36 時間表作廢。**
> 現況：H+15、剩約 21 小時（到期 08/23 08:24）、遊戲程式碼 0 行、骨架已推上去。
> 規格 [`PLAN.md`](./PLAN.md) · 動畫 [`ANIMATION.md`](./ANIMATION.md)

---

## 0. 五個人怎麼分

| 誰 | 職責 | 只碰這些檔案 |
|---|---|---|
| **Ivan** | 手部追蹤 | `src/tracking/`（**不做臉部**） |
| **你** | 後端 + 連線 + 部署 **+ 全部設計** | `server/` · `src/net/` · `src/ui/tokens.css` · 設計規格 · 素材 |
| **P1** | 符文辨識 → 頁面/HUD → 整合 | `src/runes/` `src/pages/` `src/ui/hud.ts` `src/main.ts` |
| **P2** | 遊戲邏輯 + 遮蔽物 + 魔量 → 特效 overlay | `src/match/` → `src/view/vfx.ts` |
| **P3** | 3D 第一人稱場景 | `src/view/camera.ts` `arena.ts` `opponent.ts` `post.ts` |

**沒有人碰別人的檔案。** 要別人改，在群組講。

> **`view/` 為什麼切兩半**：那是最大的一塊，一個人做不完。
> **P3 做 Three.js 的 3D 場景，P2 做 Canvas2D 的 overlay（拖尾／吸附／HUD 特效）。**
> 不同檔案、不同技術、不會 merge 衝突。

---

## 1. 🔑 介面先訂死 —— 這一節是「不打結」的全部祕密

三個人同時寫，只要這五個簽名對得上，最後就合得起來。
**現在每個人先把自己那個檔案建出來、簽名寫好、裡面空著也行，然後推上去。**
這樣別人 import 你的東西不會紅字，可以各寫各的。

```ts
// ── src/core/input.ts ────────────────── ✅ 已完成，直接用
export function getMoveAxis(): number;      // −1 左 / 0 / 1 右（A/D）
export function isCasting(): boolean;       // 按住 Shift

// ── src/runes/index.ts ───────────────── [P1]
export function initRunes(): void;          // 內部自己 listen Shift + 讀 tracker.getFrame()
export function disposeRunes(): void;
// 發出：EV.CAST_BEGIN · EV.CAST (CastEvent) · EV.FIZZLE (FizzleEvent) · EV.CAST_END

// ── src/match/index.ts ───────────────── [P2]
export function initMatch(mode: Mode, opponent: Opponent): void;
export function tickMatch(dt: number): MatchState;   // 每幀呼叫，含 covers 與 canSeeThemStats
export function disposeMatch(): void;
// 監聽：EV.CAST
// 發出：EV.SPELL_FIRED · EV.SPELL_HIT · EV.COVER_HIT · EV.COVER_BUILT
//       EV.NEAR_MISS · EV.NO_MANA · EV.MATCH_OVER

// ── src/view/index.ts ────────────────── [P3]
export function initView(canvas: HTMLCanvasElement): void;
export function renderView(s: MatchState, f: WandFrame, dt: number): void;
export function disposeView(): void;
// 監聽：EV.CAST_BEGIN · EV.CAST · EV.FIZZLE · EV.SPELL_HIT · EV.NEAR_MISS

// ── src/net/index.ts ─────────────────── [P2]
export async function createRoom(): Promise<{ code: string; playerId: string }>;
export function connect(code: string, playerId: string): Promise<Role>;
export function createRemoteOpponent(): Opponent;   // 跟 BotOpponent 完全同介面

// ── src/main.ts 只做這件事 ────────────── [P1]
// initRunes() · initMatch() · initView()
// 每幀：const s = tickMatch(dt); renderView(s, getFrame(), dt);
```

**型別全部從 `src/core/types.ts` import，不准自己定義。**
**事件名全部用 `src/core/bus.ts` 的 `EV`，不准打字串。**

---

## 2. 沒有人被卡住 —— 每個人第一步都能單獨做

| 你以為會卡在 | 其實已經好了 |
|---|---|
| 等 Ivan 的 webcam | ✅ `mouseSource` 已經能跑，`getFrame()` 現在就有值 |
| 等契約定案 | ✅ `types.ts` 已經定死並推上去 |
| 等別人的模組 | ✅ 照上面的簽名先建空檔案，互相 import 不會紅 |
| 等後端 | ✅ `server/` 骨架已在，`npm run server` 直接跑 |
| 等設計 | ✅ `tokens.css` 有暫定版，改 token 不用改結構 |

**所以三個人現在就能同時開工，一個小時內不需要對話。**

---

## 3. 每個人的任務卡

### 🧭 Ivan — 手部追蹤

**只碰** `src/tracking/`。**不要給他任何其他工作**，這是最長的一根竿子。

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | `handSource.ts`：MediaPipe HandLandmarker 接 webcam | 畫面上看得到筆尖點跟著手動 |
| 15:00 | 筆尖外推（landmark 8 沿 8→5 方向）+ One Euro 平滑 | 正常速度畫大三角形，拖尾平滑無跳點 |
| 17:00 | 丟失容忍 + 模型檔載到 `public/mediapipe/` | 手移出畫面再回來不會炸；斷網仍能跑 |
| 20:00 | 追蹤率調校，`1`/`2` 熱鍵即時切換 | 追蹤率 >90%，tracker ≥25fps |

**卡住的話**：切 `hsvSource.ts`（綠色膠紙，約 30 行），追蹤率立刻上去。

---

### 🎨 你 — 後端 + 連線 + 部署 + 全部設計

**設計優先於後端。** 後端骨架已經能跑，但三個人在等你的 token。

| 時間 | 交付 | 給誰 |
|---|---|---|
| **12:00** | 🔴 **`ui/tokens.css` 定案**（先去投影機選方向，10 分鐘） | P1、P2、P3 |
| 12:30 | **HUD 版面圖**：你的 HP / 對手 HP / 時間 / 符文小抄 / webcam PIP 各放哪、多大 | P1 |
| 13:30 | `npm run server` 跑起來，`curl` 能建房 | — |
| 14:30 | Landing + 大廳 + 結算的版面規格（**文字內容也一起給**） | P1 |
| **16:00** | 🔴 **部署上線，拿到 https 網址** —— 不要留到最後 | 全隊 |
| 18:00 | `net/socket.ts` + `net/remoteOpponent.ts` | P2 |
| 20:00 | 斷線降級 bot（**兩個方向都測**） | — |
| 21:00 | 送出角色參考圖生成（[`ANIMATION.md`](./ANIMATION.md) §2.1） | — |
| 00:00 | S1 idle / S2 charge / S6 hit + `manifest.json` | P3 |

> **素材只做 S1 / S2 / S6 三個狀態就夠撐全場。** 七個是 36 小時版本的規模。
> **`server/` 已經寫好能跑了** —— 你要做的是啟動它、部署它、寫 `net/` 那兩個檔案。

---

### 🔤 P1 — 符文辨識 → 頁面 → 整合

**碰** `src/runes/` `src/pages/` `src/ui/hud.ts` `src/main.ts`

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | `recognizer.ts` $1 + `segmenter.ts` Shift 狀態機 | **用滑鼠**按住 Shift 畫 △，console 印出 `{spell:'attack', score}` |
| 14:00 | 角點數前置判斷（3 角 → △） | 亂畫一條線不誤觸發 |
| 15:00 | 接上 `EV.CAST`，`main.ts` 串起三個模組 | M1 能跑完整迴圈 |
| 17:00 | 🔴 **用 webcam 重錄 template**（等 Ivan 13:00 交付） | 兩個人各畫 8 次都能中 |
| 19:00 | `ui/hud.ts` 照你的版面圖實作 | HP / 時間 / 小抄 / PIP 都在 |
| 22:00 | Landing + 大廳 + 結算 | 全流程走得完 |

> ⚠️ **template 一定要用 webcam 錄，滑鼠錄的作廢。** 懸空畫的抖動特性完全不同，
> 用錯來源辨識率會從 88% 掉到 60% 出頭，而且你會 debug 錯的地方。

**卡住的話**：只做一個符文 △，辨識率立刻接近 100%。

---

### ⚔️ P2 — 遊戲邏輯 → 特效 overlay

**碰** `src/match/`，然後 `src/view/vfx.ts`（只有這一個檔案，不要碰 P3 的）

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | `duelist.ts`：`x` 由 `getMoveAxis()` 驅動，無慣性；MP 自動回復 | 按 A/D 柱子動，MP 條會長回來 |
| **14:00** | 🔴 投射物 + 命中判定（比對 `toX`）+ **學徒 bot** | **M1：畫 △ → 火球飛過去 → bot 掉血** |
| **15:00** | 🔴 **遮蔽物 C1–C5**（見 [`PLAN.md`](./PLAN.md) §0.5） | 蓋牆擋得下攻擊，牆撐兩次；**從自己牆後開火穿得過去** |
| 16:00 | HP / 勝負 / 時限 / 術士 bot（會蓋牆） | 打到 0 會結束，bot 打得贏你才對 |
| **17:00** | 🔴 **`vfx.ts` 筆尖拖尾**（Canvas2D overlay，多層描邊） | 畫 △ 看得到金色軌跡 |
| **19:00** | 🔴 **符文吸附特效**（120ms 插值變形成完美形狀） | **全場最值錢的 30 行** |
| 21:00 | 失敗崩解 + 魔量不足的不同回饋 + near-miss | 玩家分得出「畫壞了」跟「沒魔力」 |
| 23:00 | 平衡（傷害、`COST`、`MP_REGEN`、`HIT_WIDTH`、bot） | 沒有必勝打法 |

> 🔴 **兩條最容易寫錯的：**
> 1. **命中比對 `projectile.toX`，不是對手現在的 `x`** —— 這是「閃得掉」的實作
> 2. **C2：從自己的牆後面攻擊要穿過去，不要擋。** 擋住的話兩邊都會躲起來，
>    30 秒沒人掉血，demo 就死了。v3–v5 這條寫反了，v6 改回來

> ⚠️ **命中判定比對 `projectile.toX`，不是對手現在的 `x`。**
> `toX` 是發射當下鎖定的位置——**這一行就是「側身閃得掉」的實作**，寫錯遊戲就不成立。

**卡住的話**：砍掉 `net/`，只做單人 bot。觀眾看不出差別。

---

### 🎬 P3 — 3D 第一人稱場景

**碰** `src/view/camera.ts` `arena.ts` `opponent.ts` `post.ts` `index.ts`
（**不要碰 `vfx.ts`，那是 P2 的**）

| 時間 | 交付 | 驗收 |
|---|---|---|
| **13:00** | Three.js 場景 + 第一人稱相機（FOV 55°）+ 對手佔位方塊 | 看得到一個在視線水平高度的東西 |
| **14:00** | 🔴 相機隨 `me.x` 側移（臨界阻尼 ~80ms） | 按 A/D 畫面跟著平移，不暈 |
| **15:00** | 🔴 **火球朝相機飛** —— 尺度 `pow(progress, 2.4)`，前慢後爆 | 有壓迫感，不是慢慢變大 |
| 16:00 | 命中閃白 + 相機震動（**≤8px、≤0.25s**） | 不會暈 |
| 17:00 | **遮蔽物的 3D 方塊** + 被打時扣耐久的視覺 | 看得出牆快破了 |
| 18:00 | 對手狀態機（idle / charge / hit / down）+ **頭頂血魔量條**，被牆擋住顯示 `???` | 看得出他要出手了 |
| 21:00 | 對手 sprite 接 `manifest.json` | 素材到了就換掉色塊 |
| 23:00 | Bloom + 環境光 | 掉幀就先砍 bloom |

> ⚠️ **不准用 Canvas2D `shadowBlur`。** 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
> 發光用三層描邊：20px α.15 / 10px α.35 / 3px 亮白核心。

**卡住的話**：關掉 bloom → 關掉相機震動 → 對手用純色剪影。

---

## 4. 檢查點（時間到就看，不討論）

| 真實時間 | 檢查點 | 標準 |
|---|---|---|
| **14:00** | **M1 核心迴圈** | 滑鼠畫 △ → 火球朝鏡頭飛 → bot 掉血 |
| **17:00** | **M2 真實輸入** | 拿真筆對 webcam 畫得出 △ 並命中；**線上網址已存在** |
| **20:00** | **M3 對戰** | 兩個並排視窗互打；一方關掉自動變 bot |
| **23:00** | **M4 完整流程** | Landing → 對戰 → 結算全通 |
| **02:00** | **M5 外部驗證** | 找 2 個外人試玩，**第一個問題問「會不會暈」** |
| **04:00** | 🔒 **凍結 + 錄備援影片** | 只准改 `config.ts` 數值 |
| **06:00** | **M6 彩排 3 次** | |
| **08:24** | 上台 | |

### ⚠️ 三條中止線 —— 時間到就砍，不要開會
- **14:00 M1 沒過** → 砍到一個符文、砍掉連線，全隊集中做單人 bot
- **17:00 辨識率 <60%** → 貼綠色膠紙走 HSV，不要 debug MediaPipe
- **20:00 連線不通** → 砍掉 `net/`，只做單人

---

## 5. 睡覺（強制）

| 時段 | 睡 | 值班 |
|---|---|---|
| 22:00 – 01:00 | P1、P3 | 你、Ivan、P2 |
| 01:00 – 04:00 | Ivan、P2 | 你、P1、P3 |
| 04:00 – 06:00 | 你 | 其他人 |

值班只做低風險工作（調參、素材、投影片）。**不准值班時改核心架構。**

---

## 6. 三條鐵律

1. **每 2 小時 merge 一次 main**（時間剩一半，週期也砍一半）
2. **04:00 功能凍結**
3. **卡住超過 30 分鐘必須開口**，立刻切 [`PLAN.md`](./PLAN.md) §10 Kill List

> Git branch：`ivan/tracking` · `you/net` · `p1/runes` · `p2/match` · `p3/view`
> **AI 不准 commit / push**（見 [`../rules.md`](../rules.md)）
