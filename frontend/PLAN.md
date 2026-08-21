# RUNESPIRE — 前端開發計劃 (FRONTEND PLAN)

> 對應 `PLAN.md` v2。這份文件**只管瀏覽器裡的東西**。
> 後端 / 網路協定 / 部署請看 [`../backend/PLAN.md`](../backend/PLAN.md)。
> 執行用的打勾清單在 [`CHECKLIST.md`](./CHECKLIST.md)。

---

## 0. 邊界宣告（先讀，避免兩邊搶事做）

| 前端做 | 前端不做 |
|---|---|
| 筆尖追蹤（MediaPipe / HSV / Mouse） | 任何形式的伺服器端辨識 |
| $1 符文辨識（本地 <5ms） | 把軌跡點送到伺服器 |
| 完整遊戲模擬（Wizard / Spell / Bot） | 伺服器端權威模擬 |
| Three.js 渲染 + VFX + 音效 | — |
| 所有頁面與 UI | 使用者帳號 / 資料庫 |
| **host 端跑權威模擬並廣播** | 伺服器計算命中 |

**核心原則：伺服器不知道什麼是三角形。** 前端是完整的遊戲，後端只是一根水管。
斷網時前端必須仍能單機打 bot——這是 demo 的保命設計，不是附加功能。

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
│   ├── templates.json      ← 必須用 webcam 錄
│   └── trainer.html
├── match/                  [C] 獨佔
│   ├── match.ts            主模擬迴圈
│   ├── wizard.ts
│   ├── spells.ts
│   ├── botOpponent.ts
│   └── rules.ts
├── scene/                  [D] 獨佔
│   ├── stage.ts / wizardMesh.ts / vfx.ts / post.ts / audio.ts
├── pages/                  [E]，calibration + settings 給 [Ivan]
└── net/                    [E] 獨佔（協定細節看 backend/PLAN.md）
```

**一人一資料夾。不准跨資料夾改別人的檔案。** 例外只有 `core/`，那是 E 的，要改在群組講一聲。

---

## 3. 共用契約 `src/core/types.ts`

H+1 逐行唸過，之後不准改。完整內容見主 `PLAN.md` §3，此處只記**前端額外補充的三件事**（v2 沒寫但一定會撞到）：

```ts
// 1) 網路來的狀態一律用 host/guest 為 key，不要用 me/them。
//    me/them 是「視角」，兩邊視角相反，用來當 wire 格式必踩坑。
export type Role = 'host' | 'guest';

// 2) 前端統一在網路邊界做一次視角轉換，之後全遊戲只講 me/them。
export function toLocalView(s: WireState, myRole: Role): MatchState {
  const other: Role = myRole === 'host' ? 'guest' : 'host';
  return {
    me: s[myRole], them: s[other],
    projectiles: s.projectiles.map(p => ({ ...p, owner: p.owner === myRole ? 'me' : 'them' })),
    timeLeft: s.timeLeft,
    winner: s.winner === null ? null : (s.winner === myRole ? 'me' : 'them'),
  };
}

// 3) 遊戲模式明確化，bot 與連線走同一條路
export type Mode = 'solo' | 'host' | 'guest';
```

---

## 4. 各模組詳細規格

### 4.1 `tracking/` — Ivan

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

**執行模型（必須照做）：**
- CV 迴圈 **30Hz**（`setInterval` 或自帶節流），遊戲迴圈 **60Hz** rAF。
- 兩者不同步。遊戲每幀讀 `getFrame()` 拿最新值，不等 CV。
- **CV 不准在 rAF 裡跑**，不然 MediaPipe 一慢，畫面就跟著卡。

**驗收：** 正常速度畫大三角形拖尾平滑無跳點；追蹤率 >90%；tracker ≥25fps；`1`/`2`/`3` 熱鍵即時切換 source 不需重整。

---

### 4.2 `runes/` — B

**$1 Unistroke Recognizer**（約 150 行，自己寫，不裝套件）：
`resample(N=64)` → `rotateToZero()` → `scaleToSquare()` → `translateToOrigin()` → `distanceAtBestAngle()`

**兩個一定會踩的坑：**
- **○ 必須關閉旋轉不變性**，否則圓形跟任何形狀都像。做法：`shield` template 走 Protractor 但把 indicative angle 固定為 0，或直接對 ○ 加一條幾何前置判斷（見下）。
- **Z 與 △ 混淆。** 規則：起點終點距離 > bounding box 尺寸 60% → 排除 △ 與 ○（封閉圖形起終點必相近）。

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

**輸出：** `score > 0.80` → `CAST`；`0.65~0.80` → `FIZZLE(有提示)`；`< 0.65` → `FIZZLE(無提示)`。

**`trainer.html` — 隱藏的關鍵任務**
> ⚠️ **template 必須用 webcam pipeline 錄，不能用滑鼠錄。**
> 懸空畫的抖動特性跟滑鼠完全不同。用錯來源的 template，辨識率會從 88% 掉到 60% 出頭，
> 而且你們會花好幾小時 debug 錯的地方。
>
> 每個符文錄 **≥8 個樣本**，**至少 2 個不同的人**錄。一個人錄的 template 只認得那個人。

**驗收：** 三符文各 20 次 >85%；亂畫一條線不誤觸發；判定 <5ms（用 `performance.now()` 印出來，不要用感覺的）。

---

### 4.3 `match/` — C

**模擬迴圈（固定步長，不要用 rAF 的 dt 直接算物理）：**
```ts
const STEP = 1 / 60;
let acc = 0;
function tick(dt: number) {
  acc += Math.min(dt, 0.25);        // 上限防止分頁切回來時一次跑幾百步
  while (acc >= STEP) { step(STEP); acc -= STEP; }
}
```

**Wizard：**
- A/D 在該層水平移動，`x` clamp 0..1
- W/S 改 `aim`，三態循環不繞回（up 再按 W 沒事）
- Space 依 aim：`up`→爬層 / `down`→跳層 / `level`→衝刺（`DASH_IFRAME_MS` 無敵）
- `casting === true` 時 **A/D/Space 全部無效**。這是遊戲張力的來源，不准給例外

**Spell 規則表（這就是猜拳循環，不准動）：**

| 攻擊 | 對方有盾 | 對方無盾 |
|---|---|---|
| 火球 △ | 擋下，盾消失 | 扣 3 |
| 閃電 Z | **穿透**，扣 1 | 扣 1 |

- 命中判定：投射物 `progress` 到 1.0 且 `toFloor === them.floor` 且水平距離 < 命中寬度
- 對手在飛行途中換層 → **打空**。這就是走位的意義

**`BotOpponent`（H+8 前至少要有學徒）：**
```ts
class BotOpponent implements Opponent {
  kind = 'bot' as const;
  constructor(private level: 'apprentice' | 'warlock' | 'archmage') {}
  update(dt, myState) { /* 讀 myState.casting / castProgress / aim 做反應 */ }
}
```
| 難度 | 行為 |
|---|---|
| 學徒 | 每 3 秒隨機丟火球，不理你的法陣 |
| 術士 | 看到法陣 → `BOT_REACTION_MS.warlock` 後開始閃避，50% 開盾 |
| 大法師 | 讀你的瞄準層主動換層；你畫 >0.8s 判斷是大招 → 開盾；會用閃電打你的盾 |

> Bot 存在的三個理由都很重要：開發期一人可測、連線爆炸時直接頂上、judge 排隊試玩不用有人陪打。

**驗收：** mouse mode 從頭打贏術士 bot；沒有必勝或必敗打法；60fps。

---

### 4.4 `scene/` — D

**你是這個 demo 的成敗關鍵。辨識準不準觀眾看不出來，畫面醜不醜一眼就知道。**

視覺方向：**「深夜天文台裡的活體星圖」**。不是霓虹賽博。

```css
--void:#070A14  --stone:#1A2138  --stone-lit:#2E3A5C  --parchment:#E8DCC4
--gold-rune:#F0B429  --gold-hot:#FFF4D6   /* 你 */
--cyan-foe:#5FC9E8                        /* 對手 */
--ember:#E8543F  --ash:#4A4A52
```
**顏色分工是硬規則：你的一切暖金，對手的一切冷青。** 觀眾 3 秒內讀懂畫面。

字體：標題 Cormorant Garamond / EB Garamond，數值 JetBrains Mono。**不要用 Inter。**
> ⚠️ **字體必須自架（`public/fonts/` + `@font-face`），不要 link Google Fonts。**
> 會場網路擋掉或斷線時，你的襯線體會掉回 Times New Roman，整個美術方向當場報廢。

**必做（按優先度，做不完就從下面砍）：**
1. 場景：雙塔 6 平台、正交或極輕透視相機、`EffectComposer` + `UnrealBloomPass`
2. **符文吸附特效**（§6.4）— 優先度高於一切其他 VFX
3. 筆尖拖尾 — **螢幕空間 Canvas2D overlay，不是 3D 物件**
4. 施法法陣：地面圓環，半徑隨 `castProgress` 增長到 `SIGIL_MAX_RADIUS`
5. 三個法術特效：火球拋物線+撞擊、護盾半球、閃電折線
6. 瞄準指示器：三段虛線指向目前瞄準層
7. 音效（H+26 後 45 分鐘，freesound.org）

**鏡頭永遠不動。** 唯一運動：瞄準層改變時往該方向微移 ~30px（0.15s ease-out）。
觀眾必須一眼看到雙方在哪一層——這是 demo 成敗關鍵，不准妥協。

**效能硬規則：**
- 每幀熱路徑不准配置物件。拖尾用 `Float32Array` ring buffer，粒子/投射物用 object pool
- **不准用 Canvas2D `shadowBlur`** — 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
  發光用三層描邊：20px α0.15 / 10px α0.35 / 3px 亮白核心
- 材質重用，`BLOOM_STRENGTH` 從 0.9 起調，掉幀先砍 bloom resolution 不砍場景

---

### 4.5 `pages/` + 整合 — E

**H+1 必須完成並推上去（四個人在等）：** repo、vite+TS+three 骨架、`types.ts`、`bus.ts`、`config.ts`、`main.ts` 空殼、`CLAUDE.md`。

**Debug HUD（`~` 開關）— 這是全隊調參的眼睛：**
```
tracker fps | game fps | tip(x,y) | conf | 追蹤率% | last score | source | RTT | tick | mode
```

**保命熱鍵（台上救命用，全隊都要背起來）：**
| 鍵 | 功能 |
|---|---|
| `1`/`2`/`3` | 切 mediapipe / hsv / mouse |
| `M` | 緊急切滑鼠模式 |
| `B` | 強制把對手換成 bot |
| `~` | Debug HUD |

**頁面流程：**
```
Landing ─┬─ 建立房間 ─┐
         ├─ 加入房間 ─┤
         ├─ 單人練習 ─┤
         ├─ 玩法說明  │
         └─ 設定      │
                      ▼
        ⚠️ 校準（強制，在進房間之前）
                      ▼
                  房間大廳 ▶ 對戰 ▶ 結算 ▶ 再來一場
```
**校準必須在進房間之前。** 兩人進房才發現一方追蹤不到，這場就廢了還要重新配對。

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
│      光線太暗時，把檯燈轉向自己       │
│               ● ○ ○                │
└────────────────────────────────────┘
步驟1 偵測到手 → 自動下一步
步驟2 按住 Shift 畫一個三角形 → 成功一次才過
步驟3 「你已準備好」→ 大廳
```
**步驟 2 是教學不是校準。** 玩家在這裡學會「按住 Shift 才畫」，之後就不會問。

設定頁：靈敏度、`TIP_EXTEND_PX`、source 切換、鏡像開關、bloom 強度、音量。全部寫進 `localStorage`。

---

## 6. UX 細節

### 6.1 遊戲 HUD
- 血量用**符文圖示**不用血條
- 左下符文小抄（△火球 ○護盾 Z閃電），第一局後淡到 25% 透明度
- **webcam PIP 留著** — 這是「這是真的」的證據，judge 需要看到
- 瞄準指示器要顯眼 — **這是新玩家理解 W/S 的唯一途徑**

### 6.2 施法回饋鏈
```
Shift 按下 → 法陣浮現(0.1s) + 身體定住 + 環境音壓低
           → 軌跡拖尾即時繪製，法陣半徑隨長度增長
Shift 放開 → 判定 → 吸附特效(120ms) → 爆散成法術 → 0.3s 恢復行動
```
法陣大小洩漏「你在畫複雜的東西」但不洩漏是什麼——這是設計，不是 bug。

### 6.3 失敗反饋
**不准出現「辨識失敗」四個字。** 線條變 `--ash` 向下崩解成灰 + 悶響。玩家自己知道錯了。

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

---

## 7. 前端專屬風險 —— v2 計劃**沒寫到**的部分

> 這一節是我逐條檢查後補上的。**每一條都足以單獨害死 demo。**

### 7.1 🔴 webcam 需要 secure context（最致命，最容易到現場才發現）
`getUserMedia()` 只在 **https** 或 **localhost** 可用。
→ Kill #3「兩台筆電用手機熱點直連」時，第二台連 `http://192.168.x.x:5173` **拿不到 webcam**，整個遊戲當場變成滑鼠模式。

**必做三選一，H+20 前驗過：**
1. **（推薦）兩台都連部署好的 https 網址**（走手機熱點）
2. `vite-plugin-mkcert` → dev server 直接是 `https://192.168.x.x:5173`，第二台信任憑證即可
3. 最後手段：第二台 Chrome 開 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 填入來源

### 7.2 🔴 MediaPipe 的 wasm/model 檔預設從 CDN 抓
會場網路擋掉或斷線 = 追蹤直接死。
**必做：把 `.wasm` 與 `.task` 模型檔下載到 `public/mediapipe/`，`FilesetResolver` 指向本機路徑。** H+14 前完成。

### 7.3 🟡 背景分頁的 rAF 會被節流到 ~1Hz
M3 驗收「兩個瀏覽器分頁對戰」會**假失敗**——背景那個根本沒在跑。
**用兩個並排的視窗，不是兩個分頁。** 寫進驗收步驟。

### 7.4 🟡 AudioContext 需要使用者手勢才能啟動
Landing 頁的按鈕點擊時 `audioCtx.resume()`。否則整場無聲，而且你會以為是音效檔壞了。

### 7.5 🟡 網路狀態的視角轉換
`me`/`them` 是視角詞彙，不能當 wire 格式。統一在 `net/` 邊界做一次 `toLocalView()`（§3）。
**不做這件事 = guest 端左右塔顛倒、血量互換，而且 debug 起來像鬼打牆。**

### 7.6 🟡 Shift 鍵的瀏覽器行為
- `keydown` 重複觸發 → `e.repeat` 擋掉
- Shift 長按時瀏覽器可能觸發文字選取 → `user-select: none` + `preventDefault`
- 中文輸入法開啟時吃掉按鍵 → 提示玩家切英文，或監聽 `e.code` 而非 `e.key`

### 7.7 🟡 校準過的參數要能存
`localStorage` 存 source / 靈敏度 / 鏡像。不然每次重整都要重調，H+30 後你會調到崩潰。

### 7.8 🟢 手臂酸
測試者一定會抱怨。對策：縮短 `MAX_STROKE_MS`，符文設計本來就短。列入 config 微調。

---

## 8. 效能預算（60fps = 16.6ms/幀）

| 項目 | 預算 | 超標怎麼辦 |
|---|---|---|
| MediaPipe 推論 | 獨立 30Hz 迴圈，不佔遊戲幀 | 降到 15Hz，或切 HSV |
| $1 辨識 | <5ms，且只在放開 Shift 那一幀 | 降 `RESAMPLE_N` |
| 遊戲模擬 | <2ms | — |
| Three.js render + Bloom | <10ms | 砍 bloom resolution → 砍 bloom |
| 拖尾 Canvas2D | <2ms | 減少描邊層數 |

**H+26 起每次改動都看一次 HUD 的 game fps。掉到 50 以下立刻查。**

---

## 9. 前端時間表（對照主計劃 36h）

| Block | 時間 | 前端重點 | 里程碑 |
|---|---|---|---|
| 1 奠基 | H+0→2 | 骨架、types、mouseSource | **M0** 所有人 console 印出 WandFrame |
| 2 核心迴圈 | H+2→8 | $1+segmenter / Wizard+火球+學徒bot / 雙塔+Bloom+拖尾 / HUD+熱鍵 | **M1** 滑鼠畫△→火球→bot掉血 |
| 3 真實輸入 | H+8→14 | MediaPipe 上線、**webcam 重錄 template**、護盾+閃電+術士bot、三法術特效 | **M2** 真筆施三法術打贏學徒 |
| 4 睡覺 | H+14→22 | 分兩批，值班只做低風險工作 | — |
| 5 連線內容 | H+20→28 | 校準/設定頁、閾值調校、大法師bot+平衡、音效、RemoteOpponent 接入 | **M3/M4** |
| 6 凍結打磨 | H+28→32 | **H+30 FEATURE FREEZE**，之後只改 config 數值與文案 | **M6** |
| 7 Demo | H+32→36 | 彩排 3 次、現場環境測試 | **M7** |

**⚠️ Block 3 最危險。H+14 時 webcam 辨識率若低於 60%，立刻執行 Kill #1（綠色膠紙），不要浪費時間 debug MediaPipe。**

---

## 10. 前端 Kill List（按順序砍，不要猶豫）

1. **貼綠色膠紙** — MediaPipe → HSV。損失「無 marker」的含金量，換來穩定。**值得。** 包裝成「魔杖的能量水晶」寫進設定頁
2. **砍到只剩 △ ○** — 辨識率立刻上升，猜拳變攻/防二選一，仍然成立
3. **樓層 3 層 → 2 層** — 瞄準變二選一，教學成本砍半
4. **只做單人 bot 模式** — 砍掉整個 `net/`（後端可獨立存活，見 backend/PLAN.md §11）
5. 砍音效 → 砍結算頁 → 砍設定頁 → 砍遙測
6. **最後防線：滑鼠模式 + 錄好的影片**

**砍東西不是失敗，是 36 小時內唯一能交付的方法。**

---

## 11. 給 AI agent 的硬規則（`CLAUDE.md` 摘要）

- 型別一律從 `core/types.ts` import，不准自己定義重複型別
- 事件名一律用 `core/bus.ts` 的 `EV` 常數，不准用字面字串
- 參數一律從 `core/config.ts` 讀，**不准在別處寫 magic number**
- **不准修改 `config.ts` 的數值** — 那是人類調參用的
- 只改自己資料夾內的檔案
- 座標一律 normalized 0..1
- 每幀熱路徑不准配置物件；不准用 `shadowBlur`；CV 30Hz 與遊戲 60Hz 分開
- 不准引入新的 npm 套件，先問

**Vibe coding 紀律**：一人一 session；生成的 code 30 秒內講不出它在幹嘛就刪掉重來；每次生出能跑的東西立刻 commit（由人類 commit，見 `../rules.md`）；每個資料夾一個 5 行手寫 README（凌晨四點 debug 別人模組時值一小時）。

---

## 12. 最後一件事

這個 idea 最強的地方不是 CV，也不是 3D。
是那一刻：**你腳下法陣亮起，你動不了，對手正在瞄你，而你手上還有 0.8 秒要畫完那個三角形。**

**所有前端時間都應該花在保護那 0.8 秒。** 🪄
