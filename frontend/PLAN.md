# RUNESPIRE — 前端開發計劃 (FRONTEND PLAN)

> **v4 — 大幅簡化。** 這份文件**只管瀏覽器裡的東西**。
> 後端 / 網路協定 / 部署請看 [`../backend/PLAN.md`](../backend/PLAN.md)。
> 執行用的打勾清單在 [`CHECKLIST.md`](./CHECKLIST.md)。
> 設計決策與資訊層級在 [`../.design/`](../.design/)。
>
> **為什麼砍：這個遊戲的賣點是「用手在空中畫符文」。**
> v3 的三層樓 + 連續視角 + 四種法術 + 猜拳循環，把注意力從手勢移開了，
> 而且新玩家在 30 秒內學不會。**v4 把所有不服務手勢的東西砍掉。**
>
> **v3 → v4 變更（全隊 H+1 必讀）：**
> 1. **樓層 3 層 → 1 層。** 移除 `Floor`、爬樓、樓層切換停留。
> 2. **移除 W/S 視角。** 移除 `pitch`、`targetFloor`、瞄準指示器。沒有瞄準了。
> 3. **法術 4 招 → 2 招：△ 攻擊、□ 建造。** 移除護盾與閃電。
> 4. **施法中可以移動。** 移除「施法定身」；代價改由掩體承擔（C2）。
> 5. **視線被擋 = 完全看不到對手**（不再是頭頂顯示 `???`）。
> 6. VFX 優先度重排，法陣升到第 1（依 `.design/02-journey-ia.md` 的資訊層級）。

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

## 0.5 遊戲規格（**v4 定案**，所有模組以此為準）

### 場地

```
        己方場地（暖金 · 填實）              敵方場地（冷青 · 描邊）
   ┌─────────────────────────┐        ┌─────────────────────────┐
   │   ▓        @      ▓     │  ←→    │      ▓       @          │
   └─────────────────────────┘        └─────────────────────────┘
     x=0 ←──────────────→ x=1            x=1 ←──────────────→ x=0
                              ▓ = 遮蔽物   @ = 法師
```

- **只有一層。** 沒有樓層、沒有爬樓、沒有俯仰視角。
- 兩塊平台面對面，中間隔空。角色只能**左右橫移**。
- 水平位置 `x` 為 normalized `0..1`。
- **鏡頭完全固定**，永遠同時看得到兩邊全場。

### 操作（左手鍵盤 / 右手筆）

| 輸入 | 行為 |
|---|---|
| `A` / `D` | 左右橫移，`x` clamp 0..1 |
| 按住 `Shift` + 右手在鏡頭前畫符文 | 施法 |

**就這兩件事。** 沒有 W/S、沒有 Space、沒有瞄準。

> ★ **v4：施法中可以移動。**
> v3 用「施法定身」當作施法的代價；v4 改由**掩體**承擔這個角色——
> 你要開火就得走出牆外（C2），走出來就會被打。
> 這個代價是**位置**而不是**狀態**，10 公尺外看得到，`???` 或凍結看不到。

### 資源

| 資源 | 規則 |
|---|---|
| **血量 HP** | `HP_MAX`，**不會回復**，歸零即敗 |
| **魔量 MP** | `MP_MAX`，`MP_REGEN_PER_S` 自動回復；施法要扣，不夠不能施法 |
| **顯示** | 兩條都在角色頭頂，敵方看得見——**除非被牆擋住（見 C3）** |

### 符文與法術（**兩招**）

| 符文 | 法術 | 魔量 | 效果 |
|---|---|---|---|
| **△** | **攻擊 attack** | `COST.attack` | 飛向對手，命中扣 `DMG_ATTACK`；**被任何牆擋下** |
| **□** | **建造 wall** | `COST.wall` | 在自己前方生成遮蔽物 |

> **口訣：牆擋一切但會碎，而且也擋你自己。**

> ⚠️ **給 B 的辨識風險**：△ 與 □ 都是封閉多邊形，是原本四招裡**最相似的兩個**。
> 兩招整體會比四招好認很多，但這一對要特別測。
> **若混淆率高，把 □ 改成一條水平線 `—`**——語意上更像牆，形狀上跟 △ 差最遠。
> 這個 fallback 現在就寫進 `templates.json` 的備案，不要等到 H+24。

### 遮蔽物 (Cover) 規則 —— 唯一複雜的一段

| # | 情境 | 結果 |
|---|---|---|
| **C1** | 敵方攻擊飛到我的遮蔽物 | 遮蔽物消失、攻擊消失、**我不扣血** |
| **C2** | **我在自己的遮蔽物後方攻擊** | **被自己的牆擋住**，遮蔽物不損毀，魔量照扣 |
| **C3** | 我與對手之間有任何遮蔽物 | **★ 我完全看不到他**——人、數值、法陣全部隱藏 |
| **C4** | 每人最多 `COVER_MAX_PER_PLAYER` 面 | 超過時**最舊的自動崩解** |
| **C5** | 遮蔽物只存在於建造者那一側 | 不能在對手場地蓋牆 |

> **C2 是整個設計的靈魂：牆保護你，但你要開火就得走出牆外。**

> **★ C3 是 v4 的關鍵改動。** v3 原本是頭頂數值變 `???`，v4 改成**完全看不到**。
> 理由：`???` 需要閱讀，10 公尺外不成立；「對手憑空消失」不需要閱讀，而且更戲劇性。

### 勝負

- **對手 HP 歸零即獲勝。**
- `MATCH_TIME_S` 時限到仍未分勝負 → **HP 高者勝**（時限只是保險，demo 不該出現）。

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

H+1 逐行唸過，之後不准改。**v4 的型別以這裡為準，後端 `protocol.ts` 手動同步。**

> **★ v4 從契約裡刪掉的東西：`Floor`、`pitch`、`targetFloor`、`edgeHoldMs`、
> `shieldUntil`、`fromFloor`、`toFloor`，以及 `lightning` / `shield` 兩個法術。**
> 後端 `protocol.ts` 的驗證白名單要跟著改（伺服器不解析內容，所以不會 crash，但要同步）。

```ts
export type Role = 'host' | 'guest';
export type Mode = 'solo' | 'host' | 'guest';
export type Spell = 'attack' | 'wall';        // ★ v4：就兩招

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
  owner: Role;        // 只會蓋在 owner 自己那一側
  x: number;          // 0..1
  bornAt: number;     // 用於 C4「最舊的先崩解」
}

// ── 法師 ───────────────────────────────────────
export interface WizardState {
  id: string;
  x: number;          // 0..1，單層，只有一個維度
  hp: number;
  mp: number;
  alive: boolean;
  casting: boolean;
  castProgress: number;   // 0..1，法陣半徑用
}

export interface Projectile {
  id: number;
  owner: Role;
  progress: number;   // 0..1
  fromX: number;      // 發射時的 x，命中判定用
}

// ── wire 格式：永遠用絕對角色 host/guest ────────
export interface WireState {
  tick: number;
  host: WizardState[];      // 陣列，1v1 時長度 1（為 2v2 留門，36 小時內只做 1v1）
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

// 網路邊界只做這一次轉換（§7.7）
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
3. **★ C3 的可見性（誰看得到誰）由每個 client 自己算，不進 wire 格式。**
   它是純顯示狀態，不影響規則，而且兩邊算出來的結果本來就不同。

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

**驗收：** 正常速度畫大三角形拖尾平滑無跳點；追蹤率 >90%；tracker ≥25fps；`1`/`2`/`3` 熱鍵即時切換 source 不需重整；**左手在鍵盤上打 A/D 時不會干擾右手追蹤**。

---

### 4.2 `runes/` — B

**$1 Unistroke Recognizer**（約 150 行，自己寫，不裝套件）：
`resample(N=64)` → `rotateToZero()` → `scaleToSquare()` → `translateToOrigin()` → `distanceAtBestAngle()`

**★ v4：只有兩個符文 —— △ 攻擊 / □ 建造。**
辨識率會比四個符文高很多，但這兩個是原本四招裡**最相似的一對**（都是封閉多邊形）。

**兩個一定會踩的坑：**
- **△ 與 □ 混淆。** 不要只靠 $1 分數，加一條前置幾何特徵：**角點數**。
  用 resample 後的點算轉角（相鄰向量夾角 > `CORNER_ANGLE_DEG`）：
  `3 個角 → △`，`4 個角 → □`。這 15 行比調閾值有效十倍。
- **□ 的收筆**：玩家畫方形常常不封口或畫過頭。起終點距離容忍度放寬到 bounding box 的 35%。

> ⚠️ **備案現在就準備好，不要等到 H+24：**
> 若 △/□ 混淆率高，**把 □ 改成一條水平線 `—`**——語意上更像牆，形狀上跟 △ 差最遠，
> 而且單筆直線是 $1 最容易認的東西。`templates.json` 兩組都先錄起來。

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
- **★ 與左手鍵盤共存**：v4 施法中**可以移動**，所以 `Shift` 按住時 `A/D` 照常生效。
  segmenter 只管 `Shift`，不要碰移動鍵。

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

### 4.3 `match/` — C　**（v4 大幅簡化）**

> **v4 砍掉的東西：樓層、`pitch` 視角、`targetFloor`、護盾、閃電、施法定身。**
> C 的工作量大約剩下 v3 的一半。省下來的時間拿去做 bot 與平衡。

#### 4.3.1 移動

```ts
// 單層，只有左右
if (keyA) w.x -= MOVE_SPEED * dt;
if (keyD) w.x += MOVE_SPEED * dt;
w.x = clamp(w.x, 0, 1);
```

- **★ v4：施法中可以移動。** `casting === true` 不再凍結 `A`/`D`。
  代價改由**掩體**承擔：你要開火就得走出牆外（C2），走出來就會被打。
- 沒有 Space、沒有衝刺、沒有跳層。**移動只有一個維度，玩家兩秒就懂。**

#### 4.3.2 視線與遮擋（`covers.ts`）—— **v4 核心，唯一複雜的一段**

| # | 規則 | 結果 |
|---|---|---|
| **C1** | 敵方攻擊飛到我的牆 | **牆消失、攻擊消失、我不扣血** |
| **C2** | **我在自己的牆後方攻擊** | **被自己的牆擋住，牆不損毀，MP 照扣** |
| **C3** | 我與對手之間有任何牆 | **★ 我完全看不到他**（人、數值牌、施法法陣全部隱藏） |
| **C4** | 每人最多 `COVER_MAX_PER_PLAYER` 面 | 超過時**最舊的自動崩解** |
| **C5** | 牆只能蓋在自己這一側 | 不能在對手場地蓋牆 |

```ts
// 單層之後判定只剩一維，非常便宜
function blockedByCover(fromX: number, side: Role, covers: Cover[]): Cover | null {
  return covers.find(c => c.owner === side && Math.abs(c.x - fromX) < COVER_BLOCK_WIDTH) ?? null;
}
```

> **C2 是整個設計的靈魂：牆保護你，但你要開火就得走出牆外。**
> 蓋牆＝安全但打不到人；走出來＝能打人但會被打。所有走位張力都從這一條長出來。

> **★ C3 是 v4 新增，而且它比 v3 的 `???` 強：**
> 不需要閱讀，10 公尺外成立，而且「對手憑空消失」本身就是戲劇性的。
> **但它會放大對峙風險（§7.3），因為躲在牆後現在同時＝安全＋隱形。盯緊平衡。**

#### 4.3.3 施法結算（順序不准改）

```
1. 辨識成功？          否 → FIZZLE（畫壞了）
2. MP 夠嗎？           否 → FIZZLE（魔量不足，★ 視覺要跟畫壞了不一樣）
3. 扣 MP
4. spell === 'wall'    → 在 (myX + COVER_OFFSET) 生成 Cover；超過 C4 上限則崩解最舊的
5. spell === 'attack'  → 先檢查 C2（自己的牆擋住？）
                          是 → 播 C2 特效，不生成投射物，MP 已扣
                          否 → 生成 Projectile
```

#### 4.3.4 命中判定

```
1. 投射物飛到對手側，先看路徑上有沒有對手的 Cover  → 有 → C1，牆碎、彈消失
2. 對手還在命中範圍嗎？（|them.x − hitX| < HIT_WIDTH）  ← 走位的意義
3. 扣 HP。HP <= 0 → alive = false → 勝負判定
```

**沒有護盾、沒有穿盾規則。** 擋下攻擊的唯一方式是牆與走位。

#### 4.3.5 資源

- **HP**：`HP_MAX`，**不回復**，歸零即敗
- **MP**：`MP_MAX`，`MP_REGEN_PER_S` 自動回復；不夠不能施法
- **★ 網路重點**：host 驗 MP 的時間點是**開始施法那一刻**，不是 cast 送達那一刻。
  MP 只會回復不會自己掉，且施法中不能再施法 → **開始時夠，結束時必然夠**。
  這一條消滅整類「明明有魔力卻施法失敗」的 bug。

#### 4.3.6 `BotOpponent`（H+8 前至少要有學徒）

| 難度 | 行為 |
|---|---|
| 學徒 | 每 3 秒隨機攻擊一次，不蓋牆、不閃避 |
| 術士 | 看到你的法陣 → `BOT_REACTION_MS.warlock` 後開始左右閃避；會蓋牆 |
| 大法師 | **蓋牆躲起來 → 走出牆外開火 → 退回牆後**。這正好把 C2 演給觀眾看 |

> **大法師 bot 是 Plan C 的門面。** 連線爆炸時單機 demo 靠它演完整套規則，
> 排練時要跟連線對戰一樣熟。

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

> ★ **v4 重排過。** 依 `.design/02-journey-ia.md` 的資訊層級：
> Layer 1（觀眾半秒內要讀到的）排在最前面，其餘往後。

1. **法陣**（Layer 1 最高權重）：跟著角色走的地面光環，半徑隨 `castProgress` 增長到
   `SIGIL_MAX_RADIUS`。**這是全畫面最強烈的事件**，比任何法術特效重要。
2. **符文吸附特效**（§6.4）— signature，優先度高於一切其他 VFX
3. **★ 敵我第二層編碼**：暖金/冷青**不夠**（兩色亮度差只有 3%，投影機過曝後同色）。
   **我方＝填實，敵方＝空心描邊**，形狀在灰階與色盲下都活著
4. **★ C2 專屬特效（不准砍）**：攻擊撞到自己的牆 → 牆內側炸開一朵悶悶的暖金光暈，
   牆完好無損，畫面輕微一頓（80ms）。**玩家要能在 0.2 秒內明白「是我自己擋到自己」**
5. **★ 遮蔽物 `coverMesh.ts`**：發光石塊，生成時從地面長出（0.2s），被擊碎時炸成碎塊
6. 場景：**兩座平台 voxel、單層**、正交或極輕透視相機、`EffectComposer` + `UnrealBloomPass`
7. **★ 頭頂數值牌 `nameplate.ts`**：HP + MP 兩條跟著角色走；**被擋住時整個角色一起消失**（§6.1）
8. 筆尖拖尾 — **螢幕空間 Canvas2D overlay，不是 3D 物件**
9. 兩個法術特效：攻擊飛行+撞擊 / 石牆升起
10. 音效（H+26 後 45 分鐘，freesound.org）

**★ v4：鏡頭完全不動。** 沒有 pitch 了，也就沒有理由動。
**不准做成第一人稱或搖鏡** —— 觀眾必須永遠同時看到兩邊的整個場地。


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
hp/mp | x | casting | covers(me/them) | canSeeThem | RTT | tick | mode
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

- **頭頂數值牌**：角色頭上兩條——**上排 HP（暖金/冷青符文格）、下排 MP（細長條）**。
  - **★ v4：被遮蔽物擋住時，對手整個人連同數值牌一起看不見**（不是顯示 `???`）。
    不要淡出，要「消失」——玩家才會意識到「他躲起來了，我打不到也看不到」。
- 自己的 HP/MP **同時**在畫面下方放大顯示一份（頭頂那份太小，施法時你在看筆尖）。
- **MP 不足時，符文小抄上花不起的符文變灰**——這是玩家理解魔量最快的方式。
- 左下符文小抄（**△ 攻擊　□ 建造**，就兩個），第一局後淡到 25% 透明度
- **webcam PIP 留著** — 這是「這是真的」的證據，judge 需要看到


### 6.2 施法回饋鏈

```
Shift 按下 → 法陣浮現(0.1s) + 環境音壓低（★ v4：身體不再定住，可以邊走邊畫）
           → 軌跡拖尾即時繪製，法陣半徑隨長度增長
Shift 放開 → 判定 → 吸附特效(120ms) → 爆散成法術
```
法陣大小洩漏「你在畫複雜的東西」但不洩漏是什麼——這是設計，不是 bug。

> ★ **v4：法陣跟著角色走。** 因為可以邊走邊畫，法陣是**貼在腳下的移動光環**，
> 不是釘在地上的圓。這反而更好——觀眾看得到「那個發光的人正在準備什麼」。


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
- `COST.wall` 要貴（建議 ≥ 攻擊 1.5 倍），蓋牆＝一段時間內沒魔力攻擊
- 若外部測試出現對峙 → **加 `COVER_DECAY_MS`（牆會自然崩解）**，數值放 `config.ts`
> 這是 v3 規格帶進來的**唯一一個遊戲性風險**，其他都是技術風險。盯緊它。

### 7.4 🟡 `Shift` 與 `A`/`D` 同時按住

v4 移除了 W/S，但玩家會**按住 Shift 畫符文的同時還按著 A/D 走位**——
而且 v4 允許這樣做（施法中可以移動），所以這是**正常操作，不是邊界情況**。
- 維護 `keysDown` Set，`keydown` 一律記錄（`e.repeat` 要擋掉）。
- `window.blur` 時清空整個 Set，否則 Alt+Tab 回來角色會自己一直走。
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
| 1 奠基 | H+0→2 | 骨架、types（v4：Cover/MP，無 Floor/pitch）、mouseSource | **M0** 所有人 console 印出 WandFrame |
| 2 核心迴圈 | H+2→8 | $1+segmenter / 移動+攻擊+MP+學徒bot / 場地voxel+Bloom+拖尾 / HUD+熱鍵 | **M1** 滑鼠畫△→攻擊→bot掉血、MP 會扣會回 |
| 3 真實輸入 | H+8→14 | MediaPipe 上線、**webcam 重錄 2 個 template**、**遮蔽物完整規則(C1–C5)**、頭頂數值牌+C3 隱形 | **M2** 真筆施兩法術、牆會擋人也會擋自己 |
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
2. **★ 砍掉「建造」符文 □** — 改成**開場預置 2 面固定掩體**。
   C1（牆吃攻擊）/ C2（擋自己）/ C3（擋視線）**全部保留**，核心玩法不變，只是不能自己蓋。
   同時解掉 §7.3 的對峙風險與 △/□ 誤判風險。**這一刀 CP 值最高，而且只剩一個符文＝辨識率接近 100%。**
3. **□ 改成水平線 `—`** — 若 △/□ 混淆率高，這一刀比調閾值有效
4. **只做單人 bot 模式** — 砍掉整個 `net/`（後端可獨立存活，見 backend/PLAN.md §12）
7. 砍音效 → 砍結算頁 → 砍設定頁 → 砍遙測
8. **最後防線：滑鼠模式 + 錄好的影片**

**⚠️ 不准砍的三件事：頭頂 HP/MP 數值牌、遮擋造成的 `???`、C2 的視覺回饋。**
這三個是規格的靈魂，也是 judge 看得懂這個遊戲的全部理由。

**砍東西不是失敗，是 36 小時內唯一能交付的方法。**

---

## 11. 給 AI agent 的硬規則（`CLAUDE.md` 摘要）

- 型別一律從 `core/types.ts` import，不准自己定義重複型別
- 事件名一律用 `core/bus.ts` 的 `EV` 常數，不准用字面字串
- 參數一律從 `core/config.ts` 讀，**不准在別處寫 magic number**（MP 成本、牆的上限、移動速度全部在那裡）
- **不准修改 `config.ts` 的數值** — 那是人類調參用的
- 只改自己資料夾內的檔案
- 座標一律 normalized 0..1；**沒有樓層，`x` 是唯一的位置維度**
- **遮擋判定只用「水平區間」，不准自作聰明做 3D raycast**
- 每幀熱路徑不准配置物件；不准用 `shadowBlur`；CV 30Hz 與遊戲 60Hz 分開
- 不准引入新的 npm 套件，先問
- **不准 `git add` / `commit` / `push`**（見 `../rules.md`）

**Vibe coding 紀律**：一人一 session；生成的 code 30 秒內講不出它在幹嘛就刪掉重來；每次生出能跑的東西立刻請人類 commit；每個資料夾一個 5 行手寫 README。

---

## 12. 最後一件事

這個 idea 最強的地方不是 CV，也不是 3D。
是那一刻：**你躲在自己蓋的牆後面，安全，但也打不到他。
要開火就得走出去。你腳下法陣亮著，手上還有 0.8 秒要畫完那個三角形。**

**所有前端時間都應該花在保護那 0.8 秒。** 🪄

**所有前端時間都應該花在保護那 0.8 秒。** 🪄
