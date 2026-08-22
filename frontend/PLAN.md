# RUNESPIRE — 前端開發計劃 (FRONTEND PLAN)

> **v5 — 第一人稱 + 臉部追蹤。** 這份文件只管瀏覽器裡的東西。
> 後端請看 [`../backend/PLAN.md`](../backend/PLAN.md)　·　打勾清單 [`CHECKLIST.md`](./CHECKLIST.md)
> **分工與動畫規格 → [`WORKSPLIT.md`](./WORKSPLIT.md)（每個人先讀自己那一段）**
> 設計決策 → [`../.design/`](../.design/)

---

## 這個遊戲是什麼（一句話，講稿也用這句）

> **所有體感遊戲都在比幅度——揮得夠大就算數。我們比精確度：你得把那個形狀畫對。**
> **而火球正朝著你的臉飛過來。**

---

## v4 → v5 變更（全隊必讀）

| # | 變更 | 影響 |
|---|---|---|
| 1 | **改成純第一人稱。** 你看不到自己，只看到對手 | D 的場景大幅簡化：不用做自己的角色 |
| 2 | **加入臉部追蹤。** 頭部左右位移＝閃避；同時提供身體座標系 | Ivan 工作量上升，是新的最高風險 |
| 3 | **砍掉：牆／掩體、MP、樓層、瞄準、走位鍵** | C 的模組砍掉一半 |
| 4 | 兩個符文的差別改成**畫的時間**，不是效果 | B 幾乎不變 |
| 5 | 施法代價改成**物理的**：邊閃邊畫很難，不需要規則限制 | 移除所有定身/凍結邏輯 |
| 6 | 校準頁縮成**「試畫一次」教學畫面** | 交給 B（見 WORKSPLIT） |
| 7 | `Shift` 起手**暫時保留**，行有餘力再換成「舉手過眼」 | 降風險 |

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

## 0.5 遊戲規格（v5 定案）

### 場地

```
        ┌─────────────────────────────────────┐
        │                                     │
        │              🧙  對手                │   ← 你在螢幕上只看得到這個
        │            （視線水平高度）            │
        │                                     │
        │   ╱ 你正在畫的符文軌跡（浮在眼前）      │
        └─────────────────────────────────────┘
              ↑ 相機 = 你的眼睛，FOV 55°

          你的頭往左移 ── 相機往左移 ── 火球從右邊擦過去
```

- **純第一人稱。畫面上沒有你自己。**
- 對手在對面，隔一段固定距離，**永遠在視線水平高度**（決鬥的視線是平的）。
- 雙方各自在一條左右向的線上移動，位置 `x` 為 normalized `0..1`。
- **FOV 55°** —— 太廣對手會太小，太窄側移會像暈船。這個值放 `config.ts`，要實測。

### 輸入

| 追蹤 | 控制 |
|---|---|
| **頭部左右位移** | 你的 `x`。**側身＝閃避。** 這是唯一的移動方式 |
| **臉的肩寬／眼距** | 身體座標系：把筆尖從「相對畫面」換成「相對身體」 |
| **筆尖軌跡** | 畫符文 |
| **按住 `Shift`** | 起手（v5 暫留；升級目標是「舉手過眼睛高度」） |

> **v5 沒有任何走位鍵。** A/D/W/S/Space 全部移除。鍵盤只剩 `Shift`。

### 符文與法術（兩個，差別是**畫的時間**）

| 符文 | 名稱 | 目標繪製時間 | 傷害 | 飛行 |
|---|---|---|---|---|
| **△** | 快擊 `bolt` | ~0.5s | `DMG_BOLT` 低 | 快，好躲 |
| **⬠** | 重擊 `heavy` | ~1.5s | `DMG_HEAVY` 高 | 慢，但範圍寬、難躲 |

> **口訣：畫得越久，越危險——對他，也對你。**
> 你花 1.5 秒畫重擊的那段時間，沒辦法好好閃避。
> **這個代價不寫在規則裡，寫在你的身體裡。**

### 資源與勝負

- **HP** `HP_MAX`，不回復，歸零即敗。**沒有 MP。**
- `MATCH_TIME_S` 到仍未分勝負 → HP 高者勝。

---

## 1. 技術棧與啟動

```
Vite 5 + TypeScript 5 (strict)
Three.js r16x + EffectComposer + UnrealBloomPass
@mediapipe/tasks-vision  (HandLandmarker + FaceLandmarker, WASM)
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
│   ├── types.ts            契約，H+1 定死
│   ├── bus.ts              event bus
│   └── config.ts           所有可調數值　**AI 禁改**
├── tracking/               [Ivan] 獨佔　★ v5 最高風險
│   ├── tracker.ts          對外唯一入口
│   ├── handSource.ts       HandLandmarker → 筆尖
│   ├── faceSource.ts       ★ FaceLandmarker → 頭部位移 + 身體座標系
│   ├── mouseSource.ts      H+2 前交付，四個人在等
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
export type Spell = 'bolt' | 'heavy';

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
  x: number;              // 0..1，由 head 推導
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
1. **`mouseSource.ts` — H+2 前交付。** 滑鼠 x → `head`，滑鼠位置 → `tip`。四個人在等這個。
2. `handSource.ts` — HandLandmarker，`numHands:1`。筆尖 = landmark 8 + (8−5) 方向外推 `TIP_EXTEND`。
3. **`faceSource.ts`** — FaceLandmarker，`numFaces:1`。
   - `head` = 鼻尖 x 相對畫面中心，除以 `bodyScale`
   - `bodyScale` = 兩眼外眼角距離（比肩寬穩定，且 FaceLandmarker 直接給）
4. **★ 融合**：`tip` 換算成相對身體：`tipBody = (tipRaw − faceOrigin) / bodyScale`
   → **玩家往前坐或往旁邊挪，符文不會變形。這是砍掉校準的關鍵。**
5. `oneEuro.ts` — 對 `tip` 與 `head` 分別平滑。**`head` 要更重的平滑**（頭會抖，抖動會直接變成暈船）。
6. 丟失處理：連續 `LOST_FRAMES` 幀追不到才發 `null`，中間用上一幀撐住。

**效能：兩個模型同時跑是真風險。**
- CV 迴圈 **30Hz**，遊戲迴圈 **60Hz**，兩者分離
- 若 fps 掉：先把 face 降到 **15Hz**（頭部位移不需要 30Hz），hand 維持 30Hz
- 還是不行 → Kill #1

**驗收：** 畫大三角形拖尾平滑無跳點；`head` 平滑無抖動；tracker ≥25fps；遊戲 ≥55fps；`1`/`2` 熱鍵切換 source。

---

### 4.2 `runes/` — B

**$1 Unistroke Recognizer**（約 150 行，自己寫）：
`resample(64)` → `rotateToZero()` → `scaleToSquare()` → `translateToOrigin()` → `distanceAtBestAngle()`

**兩個符文：△ 快擊 / ⬠ 重擊。**
- 角點數前置判斷：`3 角 → △`，`5 角 → ⬠`。**這 15 行比調閾值有效十倍。**
- ⬠ 選五芒星（一筆畫）而不是五邊形——**一筆畫的軌跡對 $1 友善得多**，而且畫起來比較久，剛好符合「重擊要花時間」的設計。

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

**驗收：** 兩個符文各 20 次 >85%；亂畫一條線不誤觸發；判定 <5ms（用 `performance.now()` 印出來）。

---

### 4.3 `match/` — C　（v5 砍掉一半）

```ts
// 固定步長，不要用 rAF 的 dt 直接算
const STEP = 1/60; let acc = 0;
function tick(dt:number){ acc += Math.min(dt,.25); while(acc>=STEP){ step(STEP); acc-=STEP; } }
```

**位置**：`x` 直接由 `WandFrame.head` 映射，經 `HEAD_TO_X_GAIN` 放大再 clamp 0..1。
**沒有加速度、沒有慣性**——身體怎麼動，角色就怎麼動。延遲一毫秒都會很明顯。

**施法結算**（順序不准改）：
```
1. 辨識成功？        否 → FIZZLE
2. 生成 Projectile：toX = 對手當下的 x   ← 鎖定，之後不追
```

**命中判定**：
```
progress 到 1.0 → |them.x − p.toX| < HIT_WIDTH[spell] ？
   是 → 扣 HP　否 → 打空（★ 觸發 near-miss 特效，見 §5 A10）
```
`HIT_WIDTH.bolt` 窄、`HIT_WIDTH.heavy` 寬 —— 重擊難躲就是靠這個數字。

**`BotOpponent`**：

| 難度 | 行為 |
|---|---|
| 學徒 | 每 3 秒隨機丟快擊，不閃避 |
| 術士 | 看到你起手 → `BOT_REACT_MS` 後開始側移閃避；偶爾用重擊 |
| 大法師 | 看你畫超過 0.8s → 判斷是重擊 → **提前側移**；會抓你剛畫完的空檔反擊 |

**驗收：** mouse mode 從頭打贏術士 bot；沒有必勝打法；60fps。

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
觀眾從螢幕讀對手，從真人讀玩家。**這只有在玩家的身體真的在動時才成立**——
也就是說臉部追蹤不是加分項，是第一人稱能不能上台的前提。
**台上站位要設計：兩位玩家側身面向觀眾，螢幕轉向觀眾。** 寫進 demo 劇本。

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
| A8 | **頭部視差** | 跟隨 `head`，臨界阻尼 ~80ms | **太快會暈，太慢沒體感。這個數字要花一小時實測** |
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

### 7.3 🔴 ★ 兩個模型同時跑掉 fps
v5 新增的最大技術風險。對策見 §4.1：face 降 15Hz → 再不行 Kill #1。

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
| HandLandmarker | 獨立 30Hz | 降 15Hz |
| **FaceLandmarker** | 獨立 30Hz | **先降這個到 15Hz** |
| $1 辨識 | <5ms，只在放開 Shift 那一幀 | 降 `RESAMPLE_N` |
| 遊戲模擬 | <2ms | — |
| Three.js + Bloom | <10ms | 砍 bloom resolution → 砍 bloom |
| 拖尾 Canvas2D | <2ms | 減少描邊層數 |

---

## 9. 時間表

| Block | 時間 | 重點 | 里程碑 |
|---|---|---|---|
| 1 奠基 | H+0→2 | 骨架、`types.ts`、`mouseSource` | **M0** console 印出 WandFrame |
| 2 核心迴圈 | H+2→8 | $1+segmenter / 位置+快擊+學徒bot / 第一人稱相機+對手+拖尾 / HUD+熱鍵 | **M1** 滑鼠畫△→火球飛向鏡頭→bot 掉血 |
| 3 真實輸入 | H+8→14 | hand+face 上線、**webcam 重錄 template**、重擊+閃避+術士bot、動畫 A1–A10 | **M2** 真筆施兩法術、側身閃得掉 |
| 4 睡覺 | H+14→22 | 兩批輪 | — |
| 5 連線與內容 | H+20→28 | 教學頁、閾值調校、大法師bot、動畫全套、`RemoteOpponent` | **M3/M4** |
| 6 凍結打磨 | H+28→32 | **H+30 FEATURE FREEZE** | **M6** |
| 7 Demo | H+32→36 | 彩排 3 次、現場測試 | **M7** |

**⚠️ H+14 檢查點：webcam 辨識率 <60% 或 fps <45 → 立刻執行 Kill List，不要 debug。**

---

## 10. Kill List（按順序砍，不要猶豫）

1. **face 降到 15Hz** → 再不行**砍掉 faceSource，`head` 改用滑鼠 x 或 A/D 鍵**
   （損失「零鍵盤」的講稿，但遊戲仍成立）
2. **砍掉重擊 ⬠，只剩一個符文 △** —— 辨識率接近 100%，遊戲變成純反應速度，**仍然成立**
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
- 座標一律 normalized 0..1；`head` 是 −1..1
- 每幀熱路徑不准配置物件；不准用 `shadowBlur`；CV 30Hz 與遊戲 60Hz 分開
- 不准引入新的 npm 套件，先問
- **不准 `git add` / `commit` / `push`**（見 `../rules.md`）

---

## 12. 最後一件事

第一人稱把這個遊戲的賭注講清楚了：

**那顆火球是朝著你的臉飛過來的。你可以側身閃開——但你的右手還在空中，
還有 0.8 秒要把那個形狀畫完。**

**所有時間都應該花在保護那 0.8 秒。** 🪄
