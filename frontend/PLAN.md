# RUNESPIRE — 前端開發計劃 (FRONTEND PLAN)

> **v3 — 依「筆當魔杖」正式遊戲規格改寫。** 這份文件**只管瀏覽器裡的東西**。
> 後端 / 網路協定 / 部署請看 [`../backend/PLAN.md`](../backend/PLAN.md)。
> 執行用的打勾清單在 [`CHECKLIST.md`](./CHECKLIST.md)。
>
> **v2 → v3 主要變更（全隊 H+1 必讀）：**
> 1. 新增 **魔量 (MP)**：法術要花魔量，魔量自動回復，血量不回復。
> 2. 新增 **遮蔽物 (Cover)**：可用符文建牆；擋投射物、擋視線，**也會擋住自己的攻擊**。
> 3. **W/S 改成「按住」控制視角俯仰**，不再是三態循環；瞄準層由視角射線算出。
> 4. **樓層移動改成走到最左端下樓、最右端上樓**，Space 衝刺/跳層取消。
> 5. 血量與魔量 **顯示在角色頭頂**，敵方看得見，但**被遮蔽物擋住就看不見**。
> 6. 地圖為 **3D 方格（Minecraft 風）**，角色只做 2D 左右橫移。
> 7. 勝利條件改為 **擊殺對方全部人員**（1v1 時即擊殺對手）。
> 8. 登入頁四顆按鈕定案：**創建房間 / 加入房間 / 說明 / 設定**。

---

## 0. 邊界宣告（先讀，避免兩邊搶事做）

| 前端做 | 前端不做 |
|---|---|
| 筆尖追蹤（MediaPipe / HSV / Mouse） | 任何形式的伺服器端辨識 |
| $1 符文辨識（本地 <5ms） | 把軌跡點送到伺服器 |
| 完整遊戲模擬（Wizard / Spell / Cover / Bot） | 伺服器端權威模擬 |
| 命中判定、遮蔽物判定、視線判定 | 伺服器計算命中 |
| Three.js 渲染 + VFX + 音效 | — |
| 所有頁面與 UI | 使用者帳號 / 資料庫 |
| **host 端跑權威模擬並廣播** | — |

**核心原則：伺服器不知道什麼是三角形，也不知道什麼是牆。** 前端是完整的遊戲，後端只是一根水管。
斷網時前端必須仍能單機打 bot——這是 demo 的保命設計，不是附加功能。

---

## 0.5 遊戲規格（本次定案，所有模組以此為準）

### 場地
```
        己方塔（暖金）                    敵方塔（冷青）
   ┌───────────────────┐            ┌───────────────────┐
 2F│ ▓   @        ▓    │  ← 視線 →  │    ▓        ▓     │2F
 1F│      ▓   @        │            │  @      ▓         │1F
 0F│ @         ▓       │            │        @      ▓   │0F
   └───────────────────┘            └───────────────────┘
     x=0 ←──────→ x=1                  x=1 ←──────→ x=0
     走到最左 → 下樓                     （敵方塔鏡像）
     走到最右 → 上樓                   ▓ = 遮蔽物   @ = 法師
```
- 地圖為 **3D 方格（Minecraft 風）**，但**角色只能左右橫移**（2D 移動）。
- **共 3 層樓**，己方與敵方在**不同棟樓**，中間隔空。
- 每層水平位置 `x` 為 normalized `0..1`。

### 操作（左手鍵盤 / 右手筆）
| 輸入 | 行為 |
|---|---|
| `A` / `D` | 該層左右橫移，`x` clamp 0..1 |
| 走到 **最左端**並停留 `FLOOR_EDGE_HOLD_MS` | **下一層**（0F 時無效） |
| 走到 **最右端**並停留 `FLOOR_EDGE_HOLD_MS` | **上一層**（2F 時無效） |
| 按住 `W` | 視角朝上（`pitch` 往 +1 移動） |
| 按住 `S` | 視角朝下（`pitch` 往 −1 移動） |
| 放開 `W`/`S` | `pitch` 停在原處（**不自動歸零**，回正要自己按） |
| 右手：按住 `Shift` 在鏡頭前畫符文 | 施法 |

- **`pitch` 是連續值 `−1..1`**，但**瞄準層 `targetFloor` 是離散的 0/1/2**，由視角射線打到敵塔哪一層決定（§4.3.3）。連續視角給手感，離散結果給可預測的命中判定。
- **施法中（`casting === true`）`A`/`D`/`W`/`S` 全部無效。** 這是遊戲張力的來源，不准給例外。

### 資源
| 資源 | 規則 |
|---|---|
| **血量 HP** | `HP_MAX`，**不會回復**，歸零即死亡 |
| **魔量 MP** | `MP_MAX`，以 `MP_REGEN_PER_S` **自動回復**；施法要扣魔量，不夠**不能施法**（FIZZLE：魔量不足） |
| **顯示位置** | **兩條都顯示在角色頭頂**，敵方看得見 |
| **視線遮蔽** | 目標與觀看者之間有任何遮蔽物 → 頭頂數值變成 `???`（§4.3.4） |

### 符文與法術（四招，這就是猜拳循環）
| 符文 | 法術 | 類型 | 魔量 | 效果 |
|---|---|---|---|---|
| △ | 火球 fireball | 攻擊 | `COST.fireball` | 命中扣 `DMG_FIREBALL`；被護盾擋下（盾消失） |
| Z | 閃電 lightning | 攻擊 | `COST.lightning` | **穿透護盾**，扣 `DMG_LIGHTNING`；**仍會被遮蔽物擋下** |
| ○ | 護盾 shield | 防守 | `COST.shield` | `SHIELD_MS` 內擋一次火球（不擋閃電） |
| □ | 石牆 wall | 建造 | `COST.wall` | 在自己所在格前方生成**遮蔽物** |

> **口訣：牆擋一切但會碎，盾只擋火球但擋不住閃電，閃電穿盾但穿不過牆。**

### 遮蔽物 (Cover) 規則 —— 全新，最容易做錯的一段
| # | 情境 | 結果 |
|---|---|---|
| C1 | 敵方投射物飛到我的遮蔽物 | **遮蔽物消失，投射物消失，我不扣血** |
| C2 | **我在自己的遮蔽物後方施放攻擊** | **法術被自己的牆擋住，遮蔽物不損毀，魔量照扣** |
| C3 | 我的視線（含頭頂數值）被任何遮蔽物擋住 | 看不到對方數值，顯示 `???` |
| C4 | 每人最多 `COVER_MAX_PER_PLAYER` 面牆 | 超過時**最舊的一面自動崩解** |
| C5 | 遮蔽物只存在於**建造者那一棟塔**的該層該格 | 不能在敵方塔蓋牆 |

> **C2 是整個設計的靈魂：牆保護你，但你要開火就得走出牆外。**
> 蓋牆＝安全但打不到人；走出來＝能打人但會被打。所有走位張力都從這一條長出來。
> **實作提醒：C2 判定的是「我的位置」與「射線方向」之間有沒有我方的牆，不是碰撞後才回頭找。**

### 勝負
- **擊殺對方全部人員即獲勝。** 1v1 時 = 對手 HP 歸零。
- `MATCH_TIME_S` 時限到仍未分勝負 → **HP 高者勝**，同 HP 判和（demo 不要出現和局，時限只是保險）。
- 型別上 `wizards` 用**陣列**表示，為未來 2v2 留門，但 **36 小時內只做 1v1**。

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

> **不准再加新套件。** 要加先在群組問。每多一個套件就多一個凌晨三點爆炸的可能。

`vite.config.ts` 三件必做事：
```ts
export default defineConfig({
  plugins: [mkcert()],           // ← 見 §7.1，這是 LAN demo 的生死線
  server: {
    host: true,                  // 讓另一台筆電連得到
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws':  { target: 'ws://localhost:8787', ws: true },
    },
  },
});
```

---

## 2. 模組地圖與擁有者

```
src/
├── main.ts                 [E] 路由、生命週期、把所有東西接起來
├── core/
│   ├── types.ts            [E] 契約，H+1 定死
│   ├── bus.ts              [E] event bus
│   └── config.ts           [人類專屬] 所有可調數值，AI 禁改
├── tracking/               [Ivan] 獨佔
│   ├── tracker.ts          對外唯一入口，切換 source
│   ├── mediapipeSource.ts
│   ├── hsvSource.ts
│   ├── mouseSource.ts
│   └── oneEuro.ts
├── runes/                  [B] 獨佔
│   ├── recognizer.ts       $1 Unistroke
│   ├── segmenter.ts        Shift 狀態機
│   ├── templates.json      ← 必須用 webcam 錄（含 □）
│   └── trainer.html
├── match/                  [C] 獨佔
│   ├── match.ts            主模擬迴圈
│   ├── wizard.ts           移動 / 視角 / HP / MP
│   ├── spells.ts           四法術
│   ├── covers.ts           ★ 新增：遮蔽物與視線判定
│   ├── botOpponent.ts
│   └── rules.ts            命中 / 遮擋 / 勝負
├── scene/                  [D] 獨佔
│   ├── stage.ts            ★ 方格塔（voxel）
│   ├── wizardMesh.ts / nameplate.ts ★ 頭頂 HP/MP
│   ├── coverMesh.ts        ★ 新增
│   ├── vfx.ts / post.ts / audio.ts
├── pages/                  [E]，calibration + settings 給 [Ivan]
│   ├── landing.ts          ★ 四顆按鈕：創建房間/加入房間/說明/設定
│   ├── howto.ts            ★ 說明頁
│   ├── lobby.ts / match.ts / result.ts
└── net/                    [E] 獨佔（協定細節看 backend/PLAN.md）
```

**一人一資料夾。不准跨資料夾改別人的檔案。** 例外只有 `core/`，那是 E 的，要改在群組講一聲。

---

## 3. 共用契約 `src/core/types.ts`

H+1 逐行唸過，之後不准改。**v3 的型別以這裡為準，後端 `protocol.ts` 手動同步。**

```ts
export type Role = 'host' | 'guest';
export type Mode = 'solo' | 'host' | 'guest';
export type Spell = 'fireball' | 'lightning' | 'shield' | 'wall';
export type Floor = 0 | 1 | 2;

// ── 追蹤 ───────────────────────────────────────
export interface WandFrame {
  tip: { x: number; y: number } | null;   // normalized 0..1
  tipConfidence: number;                  // 0..1
  source: 'mediapipe' | 'hsv' | 'mouse';
  t: number;                              // performance.now()
}

// ── 遮蔽物 ─────────────────────────────────────
export interface Cover {
  id: number;
  owner: Role;        // 只會蓋在 owner 自己那棟塔
  floor: Floor;
  x: number;          // 0..1，塔內水平格位
  bornAt: number;     // 用於 C4「最舊的先崩解」
}

// ── 法師 ───────────────────────────────────────
export interface WizardState {
  id: string;
  floor: Floor;
  x: number;          // 0..1
  pitch: number;      // −1..1，連續視角
  targetFloor: Floor; // 由 pitch 推導，命中判定只看這個
  hp: number;
  mp: number;
  alive: boolean;
  casting: boolean;
  castProgress: number;   // 0..1，法陣半徑用
  shieldUntil: number;    // ms timestamp
  edgeHoldMs: number;     // 停在邊界多久了（樓層切換用）
}

export interface Projectile {
  id: number;
  owner: Role;
  spell: 'fireball' | 'lightning';
  fromFloor: Floor;
  toFloor: Floor;
  progress: number;   // 0..1
}

// ── wire 格式：永遠用絕對角色 host/guest ────────
export interface WireState {
  tick: number;
  host: WizardState[];      // 陣列，1v1 時長度 1
  guest: WizardState[];
  covers: Cover[];
  projectiles: Projectile[];
  timeLeft: number;
  winner: Role | null;
}

// ── 本地視角：全遊戲只講 me/them ────────────────
export interface MatchState {
  me: WizardState[];
  them: WizardState[];
  covers: (Cover & { side: 'me' | 'them' })[];
  projectiles: (Omit<Projectile, 'owner'> & { owner: 'me' | 'them' })[];
  timeLeft: number;
  winner: 'me' | 'them' | null;
}

// 網路邊界只做這一次轉換（§7.5）
export function toLocalView(s: WireState, myRole: Role): MatchState {
  const other: Role = myRole === 'host' ? 'guest' : 'host';
  const side = (o: Role) => (o === myRole ? 'me' : 'them') as 'me' | 'them';
  return {
    me: s[myRole],
    them: s[other],
    covers: s.covers.map(c => ({ ...c, side: side(c.owner) })),
    projectiles: s.projectiles.map(p => ({ ...p, owner: side(p.owner) })),
    timeLeft: s.timeLeft,
    winner: s.winner === null ? null : side(s.winner),
  };
}

// ── 對手介面：BotOpponent 與 RemoteOpponent 完全一致 ──
export interface Opponent {
  kind: 'bot' | 'remote';
  update(dt: number, view: MatchState): void;
  dispose(): void;
}
```

**三條硬規則：**
1. wire 上永遠是 `host`/`guest`，不准出現 `me`/`them`（原因見 `../backend/PLAN.md` §5.3）。
2. `covers` 是**權威狀態的一部分**，跟 `projectiles` 一樣由 host 廣播，guest 不自行增刪（只做出生/崩解的預測特效）。
3. `targetFloor` **由 host 算完寫進 state**，guest 不自己算，否則兩邊會瞄到不同層。

---

## 4. 各模組詳細規格

### 4.1 `tracking/` — Ivan

**（v3 無變更，唯一影響：符文從 3 個變 4 個，template 要多錄一個 □。）**

**唯一對外介面：**
```ts
export interface TipSource {
  readonly kind: 'mediapipe' | 'hsv' | 'mouse';
  start(video?: HTMLVideoElement): Promise<void>;
  read(): WandFrame;      // 永遠回傳最新一幀，不阻塞
  dispose(): void;
}
export function setSource(kind: WandFrame['source']): Promise<void>;
export function getFrame(): WandFrame;
```

**實作順序（不准跳）：**
1. `mouseSource.ts` — **H+2 前交付。四個人在等這個。** 30 行：mousemove → normalized，`Shift` 由 segmenter 自己聽。
2. `mediapipeSource.ts` — HandLandmarker，`numHands: 1`，`runningMode: 'VIDEO'`。
   筆尖 = landmark 8 + (landmark 8 − landmark 5) 正規化後 × `TIP_EXTEND_PX`。
3. `oneEuro.ts` — One Euro Filter，**這一步決定手感**。不做拖尾會抖到不能看。
4. 丟失處理：連續 `LOST_FRAMES_TOLERANCE` 幀追不到才發 `tip: null`，中間用上一幀撐住並衰減 `tipConfidence`。
5. `hsvSource.ts` — 綠色膠紙，約 30 行：drawImage 到離屏 canvas → getImageData → RGB→HSV 閾值 → 最大連通區質心。**降採樣到 160×120 再算**，不然掉 fps。
6. 校準頁 + 設定頁（見 §5）。

> ⚠️ **左手在鍵盤上、右手拿筆。** MediaPipe `numHands: 1` 時可能抓到左手（如果左手離開鍵盤入鏡）。
> 對策：只接受**畫面右半邊**的手，或用 `handedness` 過濾。校準頁要提示「左手放在鍵盤上、不要入鏡」。

**執行模型（必須照做）：**
- CV 迴圈 **30Hz**，遊戲迴圈 **60Hz** rAF。兩者不同步。
- **CV 不准在 rAF 裡跑**，不然 MediaPipe 一慢，畫面就跟著卡。

**驗收：** 正常速度畫大三角形拖尾平滑無跳點；追蹤率 >90%；tracker ≥25fps；`1`/`2`/`3` 熱鍵即時切換 source 不需重整；**左手在鍵盤上打 A/D/W/S 時不會干擾右手追蹤**。

---

### 4.2 `runes/` — B

**$1 Unistroke Recognizer**（約 150 行，自己寫，不裝套件）：
`resample(N=64)` → `rotateToZero()` → `scaleToSquare()` → `translateToOrigin()` → `distanceAtBestAngle()`

**四個符文：△ 火球 / Z 閃電 / ○ 護盾 / □ 石牆**

**四個一定會踩的坑：**
- **○ 必須關閉旋轉不變性**，否則圓形跟任何形狀都像。做法：`shield` template 走 Protractor 但把 indicative angle 固定為 0，或直接對 ○ 加一條幾何前置判斷。
- **Z 與 △ 混淆。** 規則：起點終點距離 > bounding box 尺寸 60% → 排除 △ / ○ / □（封閉圖形起終點必相近）。
- **★ □ 與 ○ 混淆（v3 新增的最大風險）。** $1 對「圓角方形」跟圓形的分數會很接近。
  必做前置幾何特徵：**角點數**。用 resample 後的點算轉角（相鄰向量夾角 > `CORNER_ANGLE_DEG`）：
  `≥3 個角 → 排除 ○`；`0~1 個角 → 排除 □ 與 △`。這 15 行比調閾值有效十倍。
- **□ 的收筆**：玩家畫方形常常不封口或畫過頭。把起終點距離容忍度放寬到 bounding box 的 35%。

**`segmenter.ts` 狀態機：**
```
IDLE ─(Shift keydown)─▶ RECORDING ─(Shift keyup)─▶ RECOGNIZING ─▶ IDLE
                            │
                     每幀 push tip（tip 為 null 時不 push）
                     MIN_STROKE_POINTS = 8   → 太短直接 FIZZLE 不判定
                     上限 200 點（ring buffer）
                     MAX_STROKE_MS = 4000 自動結束
```
- **`keydown` 會重複觸發**（key repeat），必須用 `if (e.repeat) return;` 擋掉。
- **失焦保險**：`window.blur` 時強制回 IDLE，不然 Alt+Tab 回來會卡在施法。
- **★ 與左手鍵盤共存**：`Shift` 按住時 `A/D/W/S` 仍會進 keydown（瀏覽器不會擋），
  但**移動由 `match/` 依 `casting` 旗標忽略**，segmenter 不需要處理。兩邊不要各做一次。

**輸出：**
```ts
export type RuneResult =
  | { kind: 'cast'; spell: Spell; score: number; durationMs: number }
  | { kind: 'fizzle'; reason: 'low-score' | 'too-short' | 'no-mana'; hint?: Spell };
```
`score > 0.80` → `CAST`；`0.65~0.80` → `FIZZLE(有提示)`；`< 0.65` → `FIZZLE(無提示)`。
**魔量不足由 `match/` 判定並回 `no-mana`**，runes 不管資源。

**`trainer.html` — 隱藏的關鍵任務**
> ⚠️ **template 必須用 webcam pipeline 錄，不能用滑鼠錄。**
> 懸空畫的抖動特性跟滑鼠完全不同。用錯來源的 template，辨識率會從 88% 掉到 60% 出頭。
>
> 每個符文錄 **≥8 個樣本**，**至少 2 個不同的人**錄。**四個符文 = 至少 64 筆。**

**驗收：** 四符文各 20 次 >85%；**□ 與 ○ 互相誤判 <5%**；亂畫一條線不誤觸發；判定 <5ms（用 `performance.now()` 印出來）。

---

### 4.3 `match/` — C　**（v3 改動最大的模組）**

**模擬迴圈（固定步長，不要用 rAF 的 dt 直接算物理）：**
```ts
const STEP = 1 / 60;
let acc = 0;
function tick(dt: number) {
  acc += Math.min(dt, 0.25);        // 上限防止分頁切回來時一次跑幾百步
  while (acc >= STEP) { step(STEP); acc -= STEP; }
}
```

#### 4.3.1 移動與樓層
```ts
// 施法中完全不吃輸入
if (w.casting) { w.edgeHoldMs = 0; return; }

w.x = clamp(w.x + dirX * MOVE_SPEED * dt, 0, 1);

const atLeft  = w.x <= 0 + EPS;
const atRight = w.x >= 1 - EPS;
if ((atLeft && dirX < 0) || (atRight && dirX > 0)) w.edgeHoldMs += dt * 1000;
else w.edgeHoldMs = 0;

if (w.edgeHoldMs >= FLOOR_EDGE_HOLD_MS) {
  if (atLeft  && w.floor > 0) { w.floor--; w.x = 1 - FLOOR_ENTRY_INSET; w.edgeHoldMs = 0; }
  if (atRight && w.floor < 2) { w.floor++; w.x = FLOOR_ENTRY_INSET;     w.edgeHoldMs = 0; }
}
```
- **下樓後出現在該層的右側、上樓後出現在該層的左側**（樓梯的直覺方向），`FLOOR_ENTRY_INSET` 讓玩家不會一落地就又觸發邊界。
- **邊界停留要有進度條**（scene 畫在腳下），不然玩家不知道自己在換樓。

#### 4.3.2 視角 `pitch`
```ts
if (keyW) w.pitch = clamp(w.pitch + PITCH_SPEED * dt, -1, 1);
if (keyS) w.pitch = clamp(w.pitch - PITCH_SPEED * dt, -1, 1);
// 放開不歸零
```

#### 4.3.3 `pitch` → `targetFloor`（離散化，命中判定唯一依據）
```ts
// 敵塔三層在畫面上的相對高度：以我所在層為 0，往上為正
// pitch 打到哪一層 = 找最接近的那層
const rel = w.pitch * PITCH_TO_FLOOR_SPAN;          // e.g. span = 2
const wanted = Math.round(w.floor + rel);
w.targetFloor = clamp(wanted, 0, 2) as Floor;
```
- **必須有明顯的 UI**：瞄準指示器 + 敵塔該層高亮（§4.4）。這是新玩家理解 W/S 的唯一途徑。
- `PITCH_TO_FLOOR_SPAN` 放在 `config.ts`，這是手感最敏感的一個數字。

#### 4.3.4 視線與遮擋（`covers.ts`）—— **v3 核心**
```ts
// 我（viewer）能不能看到目標 target 的頭頂數值？
export function canSee(viewer: WizardState, target: WizardState, covers: Cover[]): boolean {
  // 1) 我方塔內：擋在我與塔外之間的自己的牆（同層、在視線方向的前方）
  if (coverBlocksOutgoing(viewer, covers)) return false;
  // 2) 敵方塔內：擋在目標前面的敵方牆（同層、比目標更靠外）
  if (coverInFrontOf(target, covers)) return false;
  return true;
}
```
- **判定簡化原則：只看「同一層 + 水平區間」，不做真的 3D raycast。**
  36 小時內做 raycast 一定會出 bug，而且觀眾看不出差別。
- `coverBlocksOutgoing(w, covers)`：存在一面 `owner === w 的塔 && floor === w.targetFloor 對應的出口層 && |cover.x − w.x| < COVER_BLOCK_WIDTH` → 擋住。
  **這條同時被 C2（自己的牆擋自己的攻擊）與 C3（看不到對方）共用，寫成一個函式，不要寫兩份。**

#### 4.3.5 施法結算（順序不准改）
```
1. 收到 RuneResult(cast)
2. 魔量夠嗎？ 不夠 → FIZZLE(no-mana)，不扣魔量，播「魔量不足」提示
3. 扣魔量
4. spell === 'wall'  → 在 (myFloor, myX + COVER_OFFSET) 生成 Cover；
                        超過 COVER_MAX_PER_PLAYER 就崩解最舊的一面
   spell === 'shield' → shieldUntil = now + SHIELD_MS
   spell === 攻擊     → coverBlocksOutgoing(me) ?
                          被自己的牆擋下（VFX：撞牆炸開，牆不損毀）  ← C2
                        : 生成 Projectile(fromFloor = me.floor, toFloor = me.targetFloor)
5. 進入 CAST_RECOVERY_MS 硬直，期間不能移動也不能再施法
```

#### 4.3.6 命中判定（順序不准改）
```
投射物 progress → 1.0
1. 先看敵方塔上、toFloor 那層、命中點附近有沒有 Cover
      有 → Cover 消失、投射物消失、不扣血            ← C1
2. 目標是否還在 toFloor？（飛行途中換層 → 打空）      ← 走位的意義
3. 水平距離 < HIT_WIDTH？
4. shield 有效 且 spell === 'fireball' → 擋下，盾消失
   shield 有效 且 spell === 'lightning' → 穿透
5. 扣血；hp <= 0 → alive = false
6. 敵方全部 alive === false → winner
```

#### 4.3.7 資源
```ts
w.mp = Math.min(MP_MAX, w.mp + MP_REGEN_PER_S * dt);   // 血量不做任何回復
```

#### 4.3.8 `BotOpponent`（H+8 前至少要有學徒）
```ts
class BotOpponent implements Opponent {
  kind = 'bot' as const;
  constructor(private level: 'apprentice' | 'warlock' | 'archmage') {}
  update(dt: number, view: MatchState) { /* 讀 view 做反應 */ }
}
```
| 難度 | 行為 |
|---|---|
| 學徒 | 每 3 秒隨機丟火球，不理你的法陣，不蓋牆 |
| 術士 | 看到法陣 → `BOT_REACTION_MS.warlock` 後開始閃避，50% 開盾；血量低於一半會蓋一面牆 |
| 大法師 | 讀你的 `targetFloor` 主動換層；你畫 >0.8s 判斷是大招 → 開盾；**會蓋牆躲、走出牆外開火再退回**；會用閃電打你的盾 |

> **大法師必須示範 C2 的玩法**（走出牆外開火再退回）。judge 看 bot 打就會懂規則，比講解有效。

> Bot 存在的三個理由都很重要：開發期一人可測、連線爆炸時直接頂上、judge 排隊試玩不用有人陪打。

**驗收：** mouse mode 從頭打贏術士 bot；躲在牆後不會被打到；**站在自己牆後開火會被自己擋住且牆不消失**；魔量見底時無法施法且有明確提示；沒有必勝或必敗打法；60fps。

---

### 4.4 `scene/` — D

**你是這個 demo 的成敗關鍵。辨識準不準觀眾看不出來，畫面醜不醜一眼就知道。**

視覺方向：**「深夜天文台裡的活體星圖」**，塔體是**粗方格（voxel）**——像 Minecraft，但材質是石與金屬，不是泥土草皮。

```css
--void:#070A14  --stone:#1A2138  --stone-lit:#2E3A5C  --parchment:#E8DCC4
--gold-rune:#F0B429  --gold-hot:#FFF4D6   /* 你 */
--cyan-foe:#5FC9E8                        /* 對手 */
--ember:#E8543F  --ash:#4A4A52
```
**顏色分工是硬規則：你的一切暖金，對手的一切冷青。** 遮蔽物也依 owner 上色。

字體：標題 Cormorant Garamond / EB Garamond，數值 JetBrains Mono。**不要用 Inter。**
> ⚠️ **字體必須自架（`public/fonts/` + `@font-face`），不要 link Google Fonts。**

**必做（按優先度，做不完就從下面砍）：**
1. 場景：**雙塔 voxel、每塔 3 層**、正交或極輕透視相機、`EffectComposer` + `UnrealBloomPass`
2. **符文吸附特效**（§6.4）— 優先度高於一切其他 VFX
3. **★ 頭頂數值牌 `nameplate.ts`**：HP + MP 兩條，跟著角色走，**`canSee === false` 時整塊變成 `???`**
   （見 §6.1；這是 v3 唯一的新 HUD 元件，也是規格明文要求）
4. **★ 遮蔽物 `coverMesh.ts`**：一個發光石塊；生成時從地面長出（0.2s），被擊碎時炸成碎塊
5. 筆尖拖尾 — **螢幕空間 Canvas2D overlay，不是 3D 物件**
6. 施法法陣：地面圓環，半徑隨 `castProgress` 增長到 `SIGIL_MAX_RADIUS`
7. **★ 瞄準指示器**：從我的位置射出三段虛線，**打到敵塔的 `targetFloor` 那層要高亮邊框**
8. **★ 樓層切換進度**：站在邊界時腳下出現填充中的箭頭（`FLOOR_EDGE_HOLD_MS` 進度）
9. 四個法術特效：火球拋物線+撞擊 / 護盾半球 / 閃電折線 / **石牆升起**
10. **★ C2 專屬特效（不准砍）**：法術撞到自己的牆 → 在牆內側炸開一朵悶悶的暖金光暈，牆完好無損。
    **玩家要能在 0.2 秒內明白「是我自己擋到自己」**，不然會以為是 bug。
11. 音效（H+26 後 45 分鐘，freesound.org）

**鏡頭幾乎不動。** 唯一運動：**`pitch` 改變時鏡頭跟著微微俯仰（最多 ~40px，0.15s ease-out）**，讓「我在往上看」有體感。
**不准做成第一人稱或大幅度搖鏡** —— 觀眾必須永遠同時看到兩棟塔的六層。

**效能硬規則：**
- 每幀熱路徑不准配置物件。拖尾用 `Float32Array` ring buffer，粒子/投射物/**遮蔽物**用 object pool
- **不准用 Canvas2D `shadowBlur`** — 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
  發光用三層描邊：20px α0.15 / 10px α0.35 / 3px 亮白核心
- **voxel 塔用 `InstancedMesh` 一次畫完**，不要每個方塊一個 Mesh（六層 × 幾十格會直接吃掉幀預算）
- 材質重用，`BLOOM_STRENGTH` 從 0.9 起調，掉幀先砍 bloom resolution 不砍場景

---

### 4.5 `pages/` + 整合 — E

**H+1 必須完成並推上去（四個人在等）：** repo、vite+TS+three 骨架、`types.ts`、`bus.ts`、`config.ts`、`main.ts` 空殼、`CLAUDE.md`。

**Debug HUD（`~` 開關）— 這是全隊調參的眼睛：**
```
tracker fps | game fps | tip(x,y) | conf | 追蹤率% | last score | source
hp/mp | floor | x | pitch | targetFloor | covers(me/them) | RTT | tick | mode
```

**保命熱鍵（台上救命用，全隊都要背起來）：**
| 鍵 | 功能 |
|---|---|
| `1`/`2`/`3` | 切 mediapipe / hsv / mouse |
| `M` | 緊急切滑鼠模式 |
| `B` | 強制把對手換成 bot |
| `~` | Debug HUD |

**頁面流程（v3 定案）：**
```
        ┌──────────── 登入頁 ────────────┐
        │  ▸ 創建房間   ▸ 加入房間        │   ← 規格明定的四顆按鈕
        │  ▸ 說明       ▸ 設定            │
        └───────────────┬────────────────┘
                        ▼
          ⚠️ 校準（強制，在進房間之前）
                        ▼
              房間大廳（顯示房間代碼）
              ├─ 等對手加入 ▶ 對戰
              └─ 「與幻影對打」▶ 單人 bot 對戰   ← 保命路徑，不可砍
                        ▼
                   對戰 ▶ 結算 ▶ 再來一場
```
- **登入頁就是規格說的四顆按鈕，不多不少。** 單人練習**不放在登入頁**，改成大廳裡的「與幻影對打」——
  這樣既符合規格，又保住 Kill #4（只做單人模式）的退路。
- **校準必須在進房間之前。** 兩人進房才發現一方追蹤不到，這場就廢了還要重新配對。
- **說明頁**：四個符文大圖 + 控制鍵示意 + **一張圖講清楚 C2「自己的牆會擋自己」**。
  這一頁 judge 一定會看，值得花 30 分鐘做好。

---

## 5. 校準頁與設定頁（Ivan）

```
┌────────────────────────────────────┐
│           舉起你的魔杖               │
│      ┌──────────────────┐          │
│      │  [webcam 鏡像]    │          │
│      │        ✦         │ ← 筆尖    │
│      └──────────────────┘          │
│      追蹤訊號 ████████░░ 82%        │
│      左手放鍵盤上，不要入鏡           │
│      光線太暗時，把檯燈轉向自己       │
│               ● ○ ○                │
└────────────────────────────────────┘
步驟1 偵測到手 → 自動下一步
步驟2 按住 Shift 畫一個三角形 → 成功一次才過
步驟3 「你已準備好」→ 大廳
```
**步驟 2 是教學不是校準。** 玩家在這裡學會「按住 Shift 才畫」，之後就不會問。

設定頁：靈敏度、`TIP_EXTEND_PX`、source 切換、鏡像開關、**視角速度 `PITCH_SPEED`**、bloom 強度、音量。全部寫進 `localStorage`。

---

## 6. UX 細節

### 6.1 遊戲 HUD 與頭頂數值牌
- **頭頂數值牌（規格要求）**：角色頭上兩條——**上排 HP（暖金/冷青符文格）、下排 MP（細長條）**。
  - 敵方看得見。**被遮蔽物擋住時整塊換成 `???`**，並且**不要淡出**——要「明確地被擋住」，
    玩家才會意識到「我看不到他，因為有牆」。
- 自己的 HP/MP **同時**在畫面下方放大顯示一份（頭頂那份太小，施法時你在看筆尖）。
- **MP 不足時，符文小抄上花不起的符文變灰**——這是玩家理解魔量最快的方式。
- 左下符文小抄（△火球 ○護盾 Z閃電 □石牆），第一局後淡到 25% 透明度
- **webcam PIP 留著** — 這是「這是真的」的證據，judge 需要看到
- 瞄準指示器要顯眼 — **這是新玩家理解 W/S 的唯一途徑**

### 6.2 施法回饋鏈
```
Shift 按下 → 法陣浮現(0.1s) + 身體定住 + 環境音壓低
           → 軌跡拖尾即時繪製，法陣半徑隨長度增長
Shift 放開 → 判定 → 吸附特效(120ms) → 爆散成法術 → CAST_RECOVERY_MS 恢復行動
```
法陣大小洩漏「你在畫複雜的東西」但不洩漏是什麼——這是設計，不是 bug。

### 6.3 失敗反饋
**不准出現「辨識失敗」四個字。** 線條變 `--ash` 向下崩解成灰 + 悶響。玩家自己知道錯了。
**魔量不足是例外**：必須明確——法陣變灰 + MP 條閃紅 + 一聲短促的空響。
玩家要能區分「我畫壞了」跟「我沒魔力」，不然會覺得辨識爛。

### 6.4 Signature：符文吸附（Rune Snap）
**全場最值錢的 30 行 code，優先度高於一切其他 VFX。**
判定成功瞬間，玩家歪斜的軌跡在 `SNAP_DURATION_MS`(120ms) 內插值變形成完美 template，整條線爆金光，散成火星形成法術。
```
玩家畫的:    吸附後:     爆發:
  ／﹨        ╱╲         ✨
 ／  ﹨  →   ╱  ╲   →   ╱╲
╱____﹨     ╱____╲     ✦  ✦
```
心理效果：「系統認得我，而且把我畫得更好看」。比任何粒子特效都有力。

### 6.5 ★ 讓觀眾看懂「牆」的三個時刻
1. **蓋牆**：石塊從地面長出 + 低頻轟聲，牆上浮一個淡淡的 □ 符文。
2. **牆吃下攻擊**：牆炸碎成塊，被保護的人身上閃一下「安全」的光。**不扣血要看得出來。**
3. **自己被自己的牆擋住（C2）**：牆內側悶悶炸開，出現一個小小的「⊘」，畫面輕微一頓（80ms）。
   **這三個時刻做好，規則就不用講解。**

---

## 7. 前端專屬風險

> **每一條都足以單獨害死 demo。**

### 7.1 🔴 webcam 需要 secure context（最致命，最容易到現場才發現）
`getUserMedia()` 只在 **https** 或 **localhost** 可用。
→ 「兩台筆電用手機熱點直連」時，第二台連 `http://192.168.x.x:5173` **拿不到 webcam**。

**必做三選一，H+20 前驗過：**
1. **（推薦）兩台都連部署好的 https 網址**（走手機熱點）
2. `vite-plugin-mkcert` → dev server 直接是 `https://192.168.x.x:5173`，第二台信任憑證即可
3. 最後手段：第二台 Chrome 開 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 填入來源

### 7.2 🔴 MediaPipe 的 wasm/model 檔預設從 CDN 抓
會場網路擋掉或斷線 = 追蹤直接死。
**必做：把 `.wasm` 與 `.task` 模型檔下載到 `public/mediapipe/`，`FilesetResolver` 指向本機路徑。** H+14 前完成。

### 7.3 🔴 ★ 遮蔽物讓「打不到人」變成常態（v3 新增，最可能毀掉 demo 節奏）
牆太便宜 → 兩邊都躲在牆後 → **台上兩個人畫了 30 秒沒人掉血 → demo 死亡。**
**必做的三道保險（H+26 外部測試後一定要調）：**
- `COVER_MAX_PER_PLAYER` 上限（建議 2），且 **C4 最舊的自動崩解**
- `COST.wall` 要貴（建議 ≥ 火球 1.5 倍），蓋牆＝一段時間內沒魔力攻擊
- 若外部測試出現對峙 → **加 `COVER_DECAY_MS`（牆會自然崩解）**，數值放 `config.ts`
> 這是 v3 規格帶進來的**唯一一個遊戲性風險**，其他都是技術風險。盯緊它。

### 7.4 🟡 ★ 「按住 W/S」與 `Shift` 的組合鍵地獄
玩家會**按住 Shift 畫符文的同時還按著 W**。
- 施法中 `pitch` 必須凍結（§4.3.1），但 `keyup` 仍要被記錄，否則放開 Shift 後視角會**繼續自己轉**。
- 對策：維護 `keysDown` Set，`casting` 時只是**不套用**，不是不記錄。
- Windows 連按 Shift 五次會跳出「相黏鍵」對話框 → 排練前在兩台筆電關掉。

### 7.5 🟡 背景分頁的 rAF 會被節流到 ~1Hz
M3 驗收「兩個瀏覽器分頁對戰」會**假失敗**——背景那個根本沒在跑。
**用兩個並排的視窗，不是兩個分頁。** 寫進驗收步驟。

### 7.6 🟡 AudioContext 需要使用者手勢才能啟動
登入頁的按鈕點擊時 `audioCtx.resume()`。否則整場無聲，而且你會以為是音效檔壞了。

### 7.7 🟡 網路狀態的視角轉換
`me`/`them` 是視角詞彙，不能當 wire 格式。統一在 `net/` 邊界做一次 `toLocalView()`（§3）。
**v3 特別注意：`covers` 也要轉換 `side`。** 漏掉這一條 = guest 端會被自己的牆保護、被敵人的牆擋住攻擊，**規則整個反過來**。

### 7.8 🟡 Shift 鍵的瀏覽器行為
- `keydown` 重複觸發 → `e.repeat` 擋掉
- Shift 長按時瀏覽器可能觸發文字選取 → `user-select: none` + `preventDefault`
- 中文輸入法開啟時吃掉按鍵 → 提示玩家切英文，或監聽 `e.code` 而非 `e.key`

### 7.9 🟡 校準過的參數要能存
`localStorage` 存 source / 靈敏度 / 鏡像 / 視角速度。不然每次重整都要重調。

### 7.10 🟢 手臂酸
測試者一定會抱怨。對策：縮短 `MAX_STROKE_MS`，符文設計本來就短。列入 config 微調。

---

## 8. 效能預算（60fps = 16.6ms/幀）

| 項目 | 預算 | 超標怎麼辦 |
|---|---|---|
| MediaPipe 推論 | 獨立 30Hz 迴圈，不佔遊戲幀 | 降到 15Hz，或切 HSV |
| $1 辨識（4 template 集） | <5ms，且只在放開 Shift 那一幀 | 降 `RESAMPLE_N` |
| 遊戲模擬（含 cover / 視線） | <2ms | 視線判定只在**每 3 幀**算一次（數值牌不需要 60Hz） |
| Three.js render + Bloom | <10ms | 砍 bloom resolution → 砍 bloom |
| voxel 塔 | 一次 `InstancedMesh` draw call | 減少每層格數 |
| 拖尾 Canvas2D | <2ms | 減少描邊層數 |

**H+26 起每次改動都看一次 HUD 的 game fps。掉到 50 以下立刻查。**

---

## 9. 前端時間表（對照主計劃 36h）

| Block | 時間 | 前端重點 | 里程碑 |
|---|---|---|---|
| 1 奠基 | H+0→2 | 骨架、types（含 Cover/MP）、mouseSource | **M0** 所有人 console 印出 WandFrame |
| 2 核心迴圈 | H+2→8 | $1+segmenter / 移動+視角+火球+MP+學徒bot / 雙塔voxel+Bloom+拖尾 / HUD+熱鍵 | **M1** 滑鼠畫△→火球→bot掉血、MP 會扣會回 |
| 3 真實輸入 | H+8→14 | MediaPipe 上線、**webcam 重錄 4 個 template**、**遮蔽物完整規則(C1–C5)**、護盾+閃電、頭頂數值牌+遮擋 | **M2** 真筆施四法術、牆會擋人也會擋自己 |
| 4 睡覺 | H+14→22 | 分兩批，值班只做低風險工作 | — |
| 5 連線內容 | H+20→28 | 校準/設定/說明頁、閾值調校、大法師bot+**遮蔽物平衡**、音效、RemoteOpponent 接入 | **M3/M4** |
| 6 凍結打磨 | H+28→32 | **H+30 FEATURE FREEZE**，之後只改 config 數值與文案 | **M6** |
| 7 Demo | H+32→36 | 彩排 3 次、現場環境測試 | **M7** |

**⚠️ Block 3 最危險，v3 之後更危險（同時要上 MediaPipe 和整套遮蔽物規則）。**
**H+14 檢查點：webcam 辨識率若低於 60%，立刻執行 Kill #1（綠色膠紙），不要浪費時間 debug MediaPipe。**
**若 H+14 遮蔽物規則還沒通，先砍 Kill #2（□ 石牆改成場上預置的固定掩體），保住 C1/C2/C3 的玩法。**

---

## 10. 前端 Kill List（按順序砍，不要猶豫）

1. **貼綠色膠紙** — MediaPipe → HSV。損失「無 marker」的含金量，換來穩定。**值得。** 包裝成「魔杖的能量水晶」寫進設定頁
2. **★ 砍掉「建造」符文 □** — 改成**每層開場預置 1 面固定掩體**。
   C1（牆吃攻擊）/ C2（擋自己）/ C3（擋視線）**全部保留**，規格的核心玩法不變，只是不能自己蓋。
   同時解掉 §7.3 的對峙風險與 □/○ 誤判風險。**這一刀 CP 值最高。**
3. **砍到只剩 △ ○** — 辨識率立刻上升，猜拳變攻/防二選一，仍然成立
4. **樓層 3 層 → 2 層** — 瞄準變二選一，教學成本砍半
5. **視角 pitch 退回三態循環（up/level/down）** — 手感差一點，但實作與教學都最省
6. **只做單人 bot 模式** — 砍掉整個 `net/`（後端可獨立存活，見 backend/PLAN.md §12）
7. 砍音效 → 砍結算頁 → 砍設定頁 → 砍遙測
8. **最後防線：滑鼠模式 + 錄好的影片**

**⚠️ 不准砍的三件事：頭頂 HP/MP 數值牌、遮擋造成的 `???`、C2 的視覺回饋。**
這三個是規格的靈魂，也是 judge 看得懂這個遊戲的全部理由。

**砍東西不是失敗，是 36 小時內唯一能交付的方法。**

---

## 11. 給 AI agent 的硬規則（`CLAUDE.md` 摘要）

- 型別一律從 `core/types.ts` import，不准自己定義重複型別
- 事件名一律用 `core/bus.ts` 的 `EV` 常數，不准用字面字串
- 參數一律從 `core/config.ts` 讀，**不准在別處寫 magic number**（MP 成本、牆的上限、pitch 速度全部在那裡）
- **不准修改 `config.ts` 的數值** — 那是人類調參用的
- 只改自己資料夾內的檔案
- 座標一律 normalized 0..1；樓層一律 `0 | 1 | 2`
- **遮擋判定只用「同層 + 水平區間」，不准自作聰明做 3D raycast**
- 每幀熱路徑不准配置物件；不准用 `shadowBlur`；CV 30Hz 與遊戲 60Hz 分開
- 不准引入新的 npm 套件，先問
- **不准 `git add` / `commit` / `push`**（見 `../rules.md`）

**Vibe coding 紀律**：一人一 session；生成的 code 30 秒內講不出它在幹嘛就刪掉重來；每次生出能跑的東西立刻請人類 commit；每個資料夾一個 5 行手寫 README。

---

## 12. 最後一件事

這個 idea 最強的地方不是 CV，也不是 3D。
是那一刻：**你腳下法陣亮起，你動不了，對手正在瞄你，
你面前那面牆會擋下他的火球——但也會擋下你的。你有 0.8 秒決定要不要走出去。**

**所有前端時間都應該花在保護那 0.8 秒。** 🪄
