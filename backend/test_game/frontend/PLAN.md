# RUNESPIRE — 前端開發計劃 (FRONTEND PLAN)

> **v6 — 回歸原始構想。** 第一人稱 + 手部追蹤 + 遮蔽物 + 魔量。
> 這份文件只管瀏覽器裡的東西。
> 後端請看 [`../backend/PLAN.md`](../backend/PLAN.md)　·　打勾清單 [`CHECKLIST.md`](./CHECKLIST.md)
> **分工與動畫規格 → [`WORKSPLIT.md`](./WORKSPLIT.md)（每個人先讀自己那一段）**
> 設計決策 → [`../.design/`](../.design/)

---

## 這個遊戲是什麼（一句話，講稿也用這句）

> **所有體感遊戲都在比幅度——揮得夠大就算數。我們比精確度：你得把那個形狀畫對。**
> **而火球正朝著你的臉飛過來。**

> 走位是 `A`/`D`，因為它不是重點。**重點是你右手在空中畫的那個形狀準不準。**

---

## v5 → v6 變更（全隊必讀）

| # | 變更 | 影響 |
|---|---|---|
| 1 | **純第一人稱。** 你看不到自己，只看到對手 | 不用做自己的角色 |
| 2 | **走位 `A`/`D`，沒有臉部追蹤、沒有 W/S 視角** | Ivan 只做手部追蹤 |
| 3 | 🔴 **救回遮蔽物與魔量**（08/22 11:40 對照原始構想後修正） | P2 的模組加回兩塊 |
| 4 | 🔴 **修正一條被寫反的規則**，見 §0.5 C2 | 對峙風險消失 |
| 5 | 兩個符文：**△ 攻擊 · □ 建造** | 跟原始構想一致 |
| 6 | 校準頁縮成**「試畫一次」教學畫面** | 交給 P1 |
| 7 | 只做 1v1（型別留門給 2v2） | — |

> ### 🔴 v3 到 v5 有一條規則被寫反了，v6 改回來
> **原始構想**：己方在自己的遮蔽物後方攻擊，攻擊**不會**被擋住 ——
> 這樣才有建造誘因，**可以同時防守＋攻擊**。
>
> **v3/v4 寫成**：被自己的牆擋住，要開火得走出牆外。
>
> 反過來的版本會造成**兩邊都躲起來，30 秒沒人掉血**（v4 §7.3 標記的風險）。
> **那個風險是規則寫錯造成的，不是設計問題。改回原始版本後它不存在。**

---

## 0. 邊界

| 前端做 | 前端不做 |
|---|---|
| 手 / 臉 / 筆尖追蹤 | 任何伺服器端辨識 |
| $1 符文辨識（本地 <5ms） | 把軌跡送到伺服器 |
| 完整遊戲模擬 + 命中判定 | 伺服器端權威模擬 |
| Three.js 第一人稱渲染 + 動畫 + 音效 | — |
| **host 端跑權威模擬並廣播** | — |

**伺服器只是一根水管。斷網時前端必須仍能單機打 bot。**

---

## 0.5 遊戲規格（v6 定案）

### 場地

```
        我方（第一人稱，看不到自己）        敵方
   ┌──────────────────────────┐   ┌──────────────────────────┐
   │   ▓         @            │←→ │        @        ▓        │
   └──────────────────────────┘   └──────────────────────────┘
     x=0 ←──────────────→ x=1       x=1 ←──────────────→ x=0
                         ▓ = 遮蔽物   @ = 法師
```

- **3D 方格（Minecraft 風）**，但角色只做 **2D 左右橫移**。
- 己方與敵方在**不同棟樓面對面**，中間隔空。
- **第一人稱**，鏡頭永遠水平看向對面。位置 `x` 為 normalized `0..1`。

### 操作

| 輸入 | 行為 |
|---|---|
| **`A` / `D`** | 左右橫移。無慣性無加速度 |
| **按住 `Shift` + 右手持筆在鏡頭前畫** | 出招 |

**鍵盤只有三顆鍵。** 沒有 W/S、沒有 Space、沒有瞄準。
走位讀 `core/input.ts` 的 `getMoveAxis()`，不經過 `tracking/` ——
**webcam 出事切滑鼠模式時，走位照樣能動。**

### 資源

| 資源 | 規則 |
|---|---|
| **血量 HP** | `HP_MAX`，**不回復**，見底即死亡 |
| **魔量 MP** | `MP_MAX`，`MP_REGEN_PER_S` 自動回復；出招要扣，不夠不能出招 |
| **顯示** | **兩條都在角色頭頂，敵方看得見** —— 除非被遮蔽物擋住（C3） |

### 招式（兩個）

| 符文 | 招式 | 魔量 | 效果 |
|---|---|---|---|
| **△** | **攻擊 `attack`** | `COST.attack` | 飛向對手，命中扣 `DMG_ATTACK`。**也可以打敵方的遮蔽物** |
| **□** | **建造 `wall`** | `COST.wall` | 在自己前方生成遮蔽物 |

> `COST.wall` 比攻擊貴 —— 蓋完牆會有一段時間打不出去。這是蓋牆唯一的代價。

### 遮蔽物規則 —— 三條，順序不要記錯

| # | 情境 | 結果 |
|---|---|---|
| **C1** | 敵方攻擊打到我的遮蔽物 | **遮蔽物扣一次耐久**（撐 `COVER_HP` = 2 次），攻擊消失，**我不扣血** |
| **C2** | 🔴 **我從自己的遮蔽物後方攻擊** | **穿過去，不被擋。** 遮蔽物完好，魔量照扣 |
| **C3** | 敵方前面有遮蔽物 | **我看不到他頭頂的血魔量**（顯示 `???`），但仍看得到他這個人 |
| C4 | 每人最多 `COVER_MAX` 面 | 超過時**最舊的自動崩解** |
| C5 | 遮蔽物只在建造者那一側 | 不能在對手場地蓋牆 |

> **C2 是整個設計的誘因來源：蓋牆＝同時防守 ＋ 攻擊。**
> 所以玩家會主動蓋牆，遊戲會往前推進，不會變成兩邊乾瞪眼。
>
> **C3 只藏數值，不藏人。** 藏整個人的話，躲在牆後＝無敵又隱形又能開火，會失衡。

### 勝負

- **擊殺對方全部人員獲勝。** 1v1 時 = 對手 HP 歸零。
- `MATCH_TIME_S` 到仍未分勝負 → HP 高者勝（時限只是保險）。

---

## 1. 技術棧與啟動

```
Vite 5 + TypeScript 5 (strict)
Three.js r16x + EffectComposer + UnrealBloomPass
@mediapipe/tasks-vision  (HandLandmarker, WASM)
無狀態管理 library、無 React、無 UI framework
```

```bash
npm create vite@latest . -- --template vanilla-ts
npm i three @mediapipe/tasks-vision
npm i -D @types/three vite-plugin-mkcert
```

**不准再加新套件。** 要加先在群組問。

```ts
// vite.config.ts —— 三件必做的事
export default defineConfig({
  plugins: [mkcert()],           // ← §7.1，LAN demo 的生死線
  server: {
    host: true,
    proxy: { '/api':'http://localhost:8787', '/ws':{target:'ws://localhost:8787',ws:true} },
  },
});
```

---

## 2. 模組地圖與擁有者

**詳細分工、交付物、時程請看 [`WORKSPLIT.md`](./WORKSPLIT.md)。**

```
src/
├── main.ts                 [E] 路由、生命週期、串接
├── core/                   [E]
│   ├── types.ts            契約，定死了
│   ├── bus.ts              event bus
│   ├── input.ts            A/D 走位 + Shift 起手
│   └── config.ts           所有可調數值　**AI 禁改**
├── tracking/               [Ivan] 獨佔　★ v5 最高風險
│   ├── tracker.ts          對外唯一入口
│   ├── handSource.ts       HandLandmarker → 筆尖
│   ├── mouseSource.ts      ✅ 已交付，台上保命符
│   └── oneEuro.ts          平滑，決定手感
├── runes/                  [B] 獨佔
│   ├── recognizer.ts       $1 Unistroke
│   ├── segmenter.ts        Shift 狀態機
│   ├── templates.json      ★ 必須用 webcam 錄
│   └── trainer.html
├── match/                  [C] 獨佔
│   ├── match.ts            模擬迴圈
│   ├── duelist.ts          位置 / HP / 施法狀態
│   ├── spells.ts           兩個法術 + 命中
│   ├── botOpponent.ts      三個難度
│   └── rules.ts
├── view/                   [D] 獨佔　★ v5 改名（原 scene/）
│   ├── camera.ts           ★ 第一人稱相機 + 頭部視差
│   ├── opponent.ts         ★ 對手（唯一有動畫的角色）
│   ├── arena.ts            背景 / 幕 / 燈光
│   ├── anim.ts             ★ 動畫時序表，見 §5
│   ├── vfx.ts              拖尾 / 吸附 / 法術
│   ├── post.ts             Bloom
│   └── audio.ts
├── ui/                     [D 出規格 · E 實作]
│   ├── tokens.css          ★ D 擁有。顏色 / 字級 / 間距 / 動畫曲線
│   └── hud.ts              E 實作，讀 tokens
├── pages/                  [E]（校準頁 → B）
└── net/                    [E]
```

---

## 3. 共用契約 `src/core/types.ts`

H+1 逐行唸過，之後不准改。後端 `protocol.ts` 手動同步。

```ts
export type Role  = 'host' | 'guest';
export type Mode  = 'solo' | 'host' | 'guest';
export type Spell = 'attack' | 'wall';

// ── 追蹤 ────────────────────────────────────────
export interface WandFrame {
  tip: { x: number; y: number } | null;  // ★ v5：已換算成「相對身體」的座標
  tipConfidence: number;                 // 0..1
  head: number;                          // ★ −1..1，頭部左右位移（0 = 正中）
  headConfidence: number;                // 0..1
  bodyScale: number;                      // ★ 眼距或肩寬，用來正規化
  source: 'mediapipe' | 'mouse';
  t: number;                             // performance.now()
}

// ── 對戰 ────────────────────────────────────────
export interface Duelist {
  id: string;
  x: number;              // 0..1，由 A/D 推導
  hp: number;
  alive: boolean;
  casting: boolean;
  castProgress: number;   // 0..1，起手光暈用
}

export interface Projectile {
  id: number;
  owner: Role;
  spell: Spell;
  fromX: number;          // 發射時發射者的 x
  toX: number;            // 發射時目標的 x（鎖定當下位置 → 所以閃得掉）
  progress: number;       // 0..1
}

// ── wire：永遠用絕對角色 host/guest ───────────────
export interface WireState {
  tick: number;
  host: Duelist;
  guest: Duelist;
  projectiles: Projectile[];
  timeLeft: number;
  winner: Role | null;
}

// ── 本地視角：全遊戲只講 me/them ──────────────────
export interface MatchState {
  me: Duelist;
  them: Duelist;
  projectiles: (Omit<Projectile,'owner'> & { owner:'me'|'them' })[];
  timeLeft: number;
  winner: 'me' | 'them' | null;
}

export function toLocalView(s: WireState, myRole: Role): MatchState {
  const other: Role = myRole === 'host' ? 'guest' : 'host';
  const side = (o: Role) => (o === myRole ? 'me' : 'them') as 'me'|'them';
  return {
    me: s[myRole], them: s[other],
    projectiles: s.projectiles.map(p => ({ ...p, owner: side(p.owner) })),
    timeLeft: s.timeLeft,
    winner: s.winner === null ? null : side(s.winner),
  };
}

export interface Opponent {
  kind: 'bot' | 'remote';
  update(dt: number, view: MatchState): void;
  dispose(): void;
}
```

**兩條硬規則：**
1. wire 上永遠是 `host`/`guest`，不准出現 `me`/`them`（原因見 `../backend/PLAN.md` §5.3）。
2. **投射物在發射當下鎖定目標的 `x`（`toX`），之後不追蹤。** 這就是「閃得掉」的實作，也是整個遊戲成立的原因。

---

## 4. 各模組規格

### 4.1 `tracking/` — Ivan　★ v5 最高風險

**對外唯一介面：**
```ts
export function setSource(kind: WandFrame['source']): Promise<void>;
export function getFrame(): WandFrame;   // 永遠回最新一幀，不阻塞
```

**實作順序（不准跳）：**
1. ✅ **`mouseSource.ts` 已交付。** 台上保命符：webcam 出事按 `M` 切過來。
2. `handSource.ts` — HandLandmarker，`numHands:1`。筆尖 = landmark 8 + (8−5) 方向外推 `TIP_EXTEND`。
3. `oneEuro.ts` — 平滑。**這一步決定手感**，不做拖尾會抖到不能看。
4. 丟失處理：連續 `LOST_FRAMES` 幀追不到才發 `null`，中間用上一幀撐住。
5. 模型檔下載到 `public/mediapipe/`，`FilesetResolver` 指向本機（會場斷網保命）。

**效能：**
- CV 迴圈 **30Hz**，遊戲迴圈 **60Hz**，兩者分離。**CV 不准跑在 rAF 裡。**
- 掉幀就把 CV 降到 15Hz。還是不行 → 綠色膠紙走 HSV。

**驗收：** 畫大三角形拖尾平滑無跳點；追蹤率 >90%；tracker ≥25fps；遊戲 ≥55fps；`1`/`2` 熱鍵切換。

---

### 4.2 `runes/` — B

**$1 Unistroke Recognizer**（約 150 行，自己寫）：
`resample(64)` → `rotateToZero()` → `scaleToSquare()` → `translateToOrigin()` → `distanceAtBestAngle()`

**兩個符文：△ 攻擊 / □ 建造。**
- 角點數前置判斷：`3 角 → △`，`4 角 → □`。**這 15 行比調閾值有效十倍。**
- □ 的收筆常常不封口或畫過頭 → 起終點距離容忍度放寬到 bounding box 的 35%。

> ⚠️ **備案現在就一起錄**：若 △/□ 混淆率高，**把 □ 改成一條水平線 `—`** ——
> 語意上更像牆，形狀上跟 △ 差最遠，而且單筆直線是 $1 最容易認的東西。

**`segmenter.ts`：**
```
IDLE ─(Shift keydown)─▶ RECORDING ─(Shift keyup)─▶ RECOGNIZING ─▶ IDLE
                            │  每幀 push tip（null 不 push）
                            │  MIN_POINTS 8 · 上限 200（ring buffer）
                            │  MAX_STROKE_MS 4000 自動結束
```
- `keydown` 會重複觸發 → `if (e.repeat) return;`
- `window.blur` 強制回 IDLE，不然 Alt+Tab 回來會卡住

**`trainer.html` — 隱藏的關鍵任務**
> ⚠️ **template 必須用 webcam pipeline 錄，不能用滑鼠錄。**
> 懸空畫的抖動特性跟滑鼠完全不同。用錯來源的 template 辨識率會掉到 60% 出頭，
> 而且你會花好幾小時 debug 錯的地方。
> **每個符文 ≥8 樣本，至少 2 個不同的人錄。**

**驗收：** 兩個符文各 20 次 >85%；**△ 與 □ 互相誤判 <5%**；亂畫一條線不誤觸發；判定 <5ms。

---

### 4.3 `match/` — C　（v5 砍掉一半）

```ts
// 固定步長，不要用 rAF 的 dt 直接算
const STEP = 1/60; let acc = 0;
function tick(dt:number){ acc += Math.min(dt,.25); while(acc>=STEP){ step(STEP); acc-=STEP; } }
```

**位置**：`x += getMoveAxis() * MOVE_SPEED * dt`，clamp 0..1。
**沒有加速度、沒有慣性**——按下去就動，放開就停。延遲一毫秒都會很明顯。

**施法結算**（順序不准改）：
```
1. 辨識成功？          否 → FIZZLE（畫壞了）
2. MP 夠嗎？           否 → FIZZLE（魔量不足，★ 視覺要跟畫壞了不一樣）
3. 扣 MP
4. spell === 'wall'    → 在 (me.x + COVER_OFFSET) 生成 Cover(hp = COVER_HP)
                          超過 COVER_MAX → 最舊的崩解
5. spell === 'attack'  → 生成 Projectile，toX = 對手當下的 x
                          ★ 不檢查自己的牆 —— C2：穿過去
```

**命中判定**（順序不准改）：
```
progress 到 1.0
  1. 對手那一側、|cover.x − toX| < COVER_BLOCK_W 有牆？
       → 牆 hp−1（歸零消失），投射物消失，對手不扣血      ← C1
  2. 否則 |them.x − toX| < HIT_WIDTH ？
       是 → 扣 HP     否 → 打空，觸發 near-miss（§5 A10）
```

> **命中比對的是 `toX`（發射當下鎖定的位置），不是對手現在的 `x`。**
> 這一行就是「按 A/D 閃得掉」的實作。寫成比對現在的 `x`，遊戲就不成立。

**資源**
- HP 不回復；MP 以 `MP_REGEN_PER_S` 自動回復
- ★ **host 驗 MP 的時間點是「開始施法那一刻」**，不是 cast 送達那一刻。
  MP 只會回復不會自己掉，且施法中不能再施法 → 開始時夠，結束時必然夠。
  這一條消滅整類「明明有魔力卻施法失敗」的網路 bug。

**可見性（純顯示，不影響規則）**
```
canSeeThemStats = 敵方那側沒有 |cover.x − them.x| < COVER_HIDE_W 的牆
false → 他頭頂的血魔量顯示成 ???，但人還是看得到
```

**`BotOpponent`**：

| 難度 | 行為 |
|---|---|
| 學徒 | 每 3 秒隨機攻擊一次，不蓋牆、不閃避 |
| 術士 | 看到你起手 → `BOT_REACT_MS` 後側移閃避；魔量滿時會蓋牆 |
| 大法師 | **蓋牆 → 從牆後開火 → 牆被打掉就再蓋一面**。這正好把 C1/C2/C3 演給觀眾看 |

**驗收：** mouse mode 從頭打贏術士 bot；沒有必勝打法；**兩邊都躲牆時仍會有人先動**；60fps。

---

### 4.4 `view/` — D　（規格見 §5 與 [`WORKSPLIT.md`](./WORKSPLIT.md)）

**第一人稱的三個硬規則：**
1. **對手永遠在視線水平高度。** 決鬥的視線是平的，不要俯視也不要仰視
2. **`FOV` 55°，寫在 `config.ts`，要實測。** 太廣對手太小，太窄側移像暈船
3. **相機震動幅度 ≤ 8px，時長 ≤ 0.25s。** 第一人稱的震動預算比第三人稱小很多，超過就會暈

**觀眾怎麼看懂（第一人稱專屬的解）：**
```
螢幕上   = 對手
螢幕前面 = 玩家本人（正在側身閃避、舉筆畫符文）
```
觀眾從螢幕讀對手，從真人讀玩家。
走位改回 A/D 之後，玩家的身體只剩**右手在空中畫符文**這個動作——
但那正好是全場最大、最看得懂的動作，也剛好就是這個專案的賣點。
**台上站位要設計：兩位玩家側身面向觀眾，螢幕轉向觀眾，那隻手要露出來。** 寫進 demo 劇本。

---

### 4.5 `ui/` — D 出規格，E 實作

`tokens.css` 由 D 擁有，內容：顏色、字級、間距、圓角、動畫時長與曲線。
**E 與 B 做頁面時只能引用 token，不准寫死 hex 與 px。**

HUD 只有三樣東西：**你的 HP · 對手的 HP · 剩餘時間**。加上左下符文小抄與 webcam PIP。

> **webcam PIP 留著。** 它是「這是真的」的唯一證據，judge 需要看到。

---

## 5. 動畫規格　★ D 的主戰場

**第一人稱最重要的認知：畫面上唯一會演戲的角色是「對手」。** 你自己沒有身體，
所以對手的動畫要承擔全部的角色表演，而相機要承擔全部的「我」的感受。

### 5.1 對手（`opponent.ts` + `anim.ts`）

| # | 動畫 | 時長 | 曲線 | 為什麼 |
|---|---|---|---|---|
| A1 | idle 呼吸 / 微搖 | 3.2s loop | sine | 靜止的剪影看起來像貼圖，會讓人以為當機 |
| A2 | **起手（舉杖過頭）** | 0.25s | ease-out back | **這是你唯一的預警**，必須突出 |
| A3 | 施法中（杖尖畫圈） | loop | linear | 圈的大小隨 `castProgress` 成長 → 洩漏他在畫大招 |
| A4 | 釋放 | 0.15s | ease-in | 快。攻擊要突然 |
| A5 | 側身閃避 | 0.18s | ease-out | 對應對面玩家真的在閃身 |
| A6 | 受擊 | 0.30s | ease-out + 2 次衰減抖動 | |
| A7 | 倒下 | 0.80s | ease-in | 結束的句號，Peak-End 的 End |

### 5.2 相機（`camera.ts`）—— 這是「我」的身體

| # | 動畫 | 參數 | 為什麼 |
|---|---|---|---|
| A8 | **側移時的相機平移** | 跟隨 `x`，臨界阻尼 ~80ms | 太快會暈，太慢沒體感。這個數字要實測 |
| A9 | 受擊震動 | 0.25s，衰減正弦，**≤8px** | 幅度是第一人稱最容易做錯的地方 |
| A10 | **近失 near-miss** | 0.20s 輕微側推 + 都卜勒音效 | **打空必須有回饋**，否則玩家不知道自己閃掉了 |
| A11 | 起手時視野微縮 | FOV −2°，0.3s | 讓「我在專注」有體感 |

### 5.3 符文（`vfx.ts`）

| # | 動畫 | 時長 | 曲線 |
|---|---|---|---|
| A12 | 拖尾繪製 | 即時 | — |
| A13 | **吸附 snap** | 120ms | ease-out cubic |
| A14 | 點燃 → 射出 | 0.20s | ease-in |
| A15 | 失敗崩解 | 0.45s | ease-in，向下崩成灰 |

> **A13 是全場最值錢的 30 行。** 判定成功瞬間，歪斜的軌跡插值變形成完美 template，
> 爆金光，散成火星射出。心理效果：「系統認得我，而且把我畫得更好看」。

### 5.4 投射物（`vfx.ts`）★ 第一人稱的關鍵

| # | 動畫 | 參數 |
|---|---|---|
| A16 | **朝相機飛行** | `PROJ_MS`。**尺度曲線是關鍵**：前 70% 緩慢變大，最後 30% 暴衝 |
| A17 | 命中 | 0.30s 畫面閃 + A9 震動 |

> **A16 的尺度曲線決定第一人稱好不好玩。** 線性放大會讓火球看起來慢又假；
> 前慢後爆才有「它真的朝我來了」的壓迫感。`scale = pow(progress, 2.4)` 起調。

### 5.5 環境與 UI

| # | 動畫 | 時長 |
|---|---|---|
| A18 | 環境光呼吸 | 6s loop, sine, ±4% |
| A19 | **HP 扣減** | 0.35s ease-out，先閃白再降 —— 讓人看到扣了多少 |
| A20 | 開場倒數 | 3s，同時是「看清楚對手」的時間 |
| A21 | 勝負演出 | 1.2s |

### 5.6 動畫硬規則

- **全部走 `anim.ts` 的同一個時間軸**，不要各自 `setTimeout`
- **`prefers-reduced-motion` 必須有路徑**：關掉 A8/A9/A10/A18，保留 A13/A16/A19（它們承載資訊）
- 每幀熱路徑不准配置物件；粒子與投射物用 object pool
- **不准用 Canvas2D `shadowBlur`** —— 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒

---

## 6. UX 細節

### 6.1 施法回饋鏈
```
Shift 按下 → 起手光暈 + FOV 微縮(A11) + 環境音壓低
           → 拖尾即時繪製
Shift 放開 → 判定 → 吸附(A13) → 點燃射出(A14)
```

### 6.2 失敗反饋
**不准出現「辨識失敗」四個字。** 線條變灰向下崩解 + 悶響（A15）。玩家自己知道錯了。

### 6.3 校準頁 → 教學畫面（B 擁有）
```
步驟 1  偵測到手與臉 → 自動下一步
步驟 2  按住 Shift，畫一個三角形 → 成功一次才過
步驟 3  「準備好了」→ 大廳
```
**步驟 2 是教學不是校準。** 玩家在這裡學會「按住 Shift 才畫」，之後就不會問。
臉部座標系已經處理掉大部分的個體差異，所以不需要調參數。

---

## 7. 風險

### 7.1 🔴 webcam 需要 secure context
`getUserMedia()` 只在 https / localhost 可用。第二台筆電連 `http://192.168.x.x` **拿不到攝影機**。
**三選一，H+20 前驗過：** ① 兩台都連部署好的 https ② `vite-plugin-mkcert` ③ Chrome flag。

### 7.2 🔴 MediaPipe 的 wasm/model 預設從 CDN 抓
會場網路擋掉就死。**下載到 `public/mediapipe/`，`FilesetResolver` 指向本機。** H+14 前完成。

### 7.3 🟡 走位改回鍵盤之後，觀眾看不到玩家在動
原本靠臉部追蹤時，玩家會真的側身閃避，觀眾從真人身上就讀得到一半的戰況。
現在玩家坐著按 A/D，**「螢幕＝對手、真人＝玩家」那個解法只剩一半**。
剩下的一半仍然成立且更重要：**玩家的右手還是在空中畫符文**，那是全場最大的動作。
→ **對策**：webcam PIP 一定要留、要夠大；台上站位讓觀眾看得到那隻手。

### 7.4 🔴 ★ 第一人稱暈眩
相機震動 >8px 或視差跟隨 <50ms 都會讓人不舒服。
**H+26 外部測試一定要問「會不會暈」，這題比「好不好玩」更早問。**

### 7.5 🟡 背景分頁的 rAF 被節流到 ~1Hz
M3「兩個分頁對戰」會假失敗。**用兩個並排視窗。**

### 7.6 🟡 AudioContext 需要使用者手勢
Landing 按鈕點擊時 `audioCtx.resume()`。

### 7.7 🟡 視角轉換
`me`/`them` 是視角詞彙，不能當 wire 格式。統一在 `net/` 邊界做一次 `toLocalView()`。

### 7.8 🟡 Shift 鍵
`e.repeat` 擋重複；`user-select:none`；監聽 `e.code` 而非 `e.key`（輸入法會吃鍵）。

---

## 8. 效能預算（60fps = 16.6ms/幀）

| 項目 | 預算 | 超標怎麼辦 |
|---|---|---|
| HandLandmarker | 獨立 30Hz | 降 15Hz → 綠色膠紙 HSV |
| $1 辨識 | <5ms，只在放開 Shift 那一幀 | 降 `RESAMPLE_N` |
| 遊戲模擬 | <2ms | — |
| Three.js + Bloom | <10ms | 砍 bloom resolution → 砍 bloom |
| 拖尾 Canvas2D | <2ms | 減少描邊層數 |

---

## 9. 時間表

> **原本的 H+0→H+36 表已作廢。** 真實時程、每個人的任務卡、檢查點
> 全部在 **[`WORKSPLIT.md`](./WORKSPLIT.md)**。那份是唯一的時間依據。

**三條中止線（時間到就砍，不要開會）**
- **14:00 M1 沒過** → 砍到一個符文、砍掉連線，全隊做單人 bot
- **17:00 webcam 辨識率 <60%** → 貼綠色膠紙走 HSV，不要 debug MediaPipe
- **20:00 連線不通** → 砍掉 `net/`，只做單人。觀眾看不出差別

---

## 10. Kill List（按順序砍，不要猶豫）

1. **貼綠色膠紙**（MediaPipe → HSV），包裝成「魔杖的能量水晶」
2. **砍掉建造 □，改成開場預置 2 面固定遮蔽物**
   C1/C2/C3 全保留，核心玩法不變，而且**只剩一個符文＝辨識率接近 100%** —— 辨識率接近 100%，遊戲變成純反應速度，**仍然成立**
3. **相機視差關掉**，第一人稱變成固定相機 —— 解掉暈眩風險
4. **只做單人 bot 模式**，砍掉整個 `net/`
5. 砍音效 → 砍結算頁 → 砍遙測
6. **最後防線：滑鼠模式 + 錄好的影片**

**砍東西不是失敗，是 36 小時內唯一能交付的方法。**

---

## 11. 給 AI agent 的硬規則

- 型別一律從 `core/types.ts` import，不准自己定義重複型別
- 事件名一律用 `core/bus.ts` 的 `EV` 常數
- 參數一律從 `core/config.ts` 讀，**不准在別處寫 magic number**
- **不准修改 `config.ts` 的數值** —— 那是人類調參用的
- 樣式一律用 `ui/tokens.css` 的 token，**不准寫死 hex 與 px**
- 只改自己資料夾內的檔案
- 座標一律 normalized 0..1；走位讀 `getMoveAxis()`（−1/0/1）
- 每幀熱路徑不准配置物件；不准用 `shadowBlur`；CV 30Hz 與遊戲 60Hz 分開
- 不准引入新的 npm 套件，先問
- **不准 `git add` / `commit` / `push`**（見 `../rules.md`）

---

## 12. 最後一件事

第一人稱把這個遊戲的賭注講清楚了：

**那顆火球是朝著你的臉飛過來的。你可以按 A/D 閃開，也可以蓋一面牆擋下來——
但你的右手還在空中，還有 0.8 秒要把那個形狀畫完。**

**所有時間都應該花在保護那 0.8 秒。** 🪄
