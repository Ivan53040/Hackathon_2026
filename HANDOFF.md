# HANDOFF — Runespire 前端畫面（給接手的 AI agent）

**時間：08/22 12:50　·　到期：08/23 08:24（剩約 19.5 小時）**
這份文件是自足的，不需要之前的對話。**先讀完整份再動手。**

---

## 0. 這是什麼專案

瀏覽器**第一人稱**魔法對戰。webcam 追蹤手持筆的筆尖，玩家在空中**畫符文**出招。

```
A / D      左右移動閃避（鍵盤只有這兩顆 + Shift）
Shift      按住，然後用筆在鏡頭前畫符文
△ 攻擊      飛向對手，命中扣血
□ 建造      在自己前方生成遮蔽物
```

**遮蔽物三條規則（不要改，改了遊戲就不成立）：**
1. **C1** 敵方攻擊打到我的遮蔽物 → 牆扣一次耐久（撐 2 次），我不扣血
2. **C2** 我從自己的牆後方攻擊 → **穿過去，不被擋**（這是蓋牆的誘因：同時防守＋攻擊）
3. **C3** 敵方前面有牆 → 我看不到他頭頂的血魔量，但看得到人

完整規格：`frontend/PLAN.md` §0.5。分工：`frontend/WORKSPLIT.md`。

---

## 1. 跑起來

```bash
npm install
npm run dev        # https://localhost:5173  （mkcert 會要密碼，webcam 需要 https）
npm run server     # :8787  後端，另一個終端
npm run build      # tsc --noEmit && vite build —— 改完一定要跑這個
```

**開發用網址：`https://localhost:5173/?solo=1`**
`?solo=1` 會跳過首頁，直接開一場對 bot 的真實對戰。

> ⚠️ 舊的 `?mock=1` 已經移除。它用假狀態餵畫面，**玩家的攻擊與建造完全不會被模擬** ——
> 看起來像遊戲壞了。`src/core/mockMatch.ts` 已刪除。

---

## 2. 目前狀態

| 模組 | 擁有者 | 狀態 |
|---|---|---|
| `src/core/` | Wesley | ✅ 完成。types / bus / config / input |
| `src/tracking/` | Ivan | 🟡 只有 `mouseSource`，MediaPipe 進行中 |
| `src/runes/` | Bill | ✅ $1 辨識器完成 |
| `src/match/` | Bill | ✅ 模擬 + 遮蔽物 + bot 完成 |
| `src/net/` | Wesley | ✅ 完成。socket + remoteOpponent + 斷線降級 |
| `src/pages/` | Wesley | ✅ Landing / Lobby / Results |
| `src/ui/` | Wesley | ✅ tokens.css + hud.ts |
| **`src/view/`** | **你** | 🟡 **這是你的工作區** |
| `server/` | Wesley | ✅ 完成 |

---

## 3. 🔴 你只能碰 `src/view/` 和 `src/ui/hud.ts`

**不准碰**：`src/core/` `src/runes/` `src/match/` `src/net/` `server/`
—— 那些是別人正在同時編輯的，改了會 merge 衝突。

**特別禁止**：
- **不准改 `src/core/config.ts` 的數值。** 那是人類調參用的
- **不准改 `src/core/types.ts`**。要加欄位先問
- **不准 `git add` / `commit` / `push`**（見 `rules.md`，這是硬規定）

---

## 4. 你會用到的介面

```ts
// 每幀由 main.ts 呼叫。s 是當前戰況，f 是筆尖，dt 是秒
export function renderView(s: MatchState, f: WandFrame, dt: number): void;
export function initView(overlayCanvas: HTMLCanvasElement): void;
export function disposeView(): void;

// src/core/types.ts（只讀，不要改）
interface MatchState {
  me: Duelist; them: Duelist;
  covers: { id; side: 'me'|'them'; x: number; hp: number; bornAt: number }[];
  projectiles: { id; owner: 'me'|'them'; fromX: number; toX: number; progress: number }[];
  canSeeThemStats: boolean;    // false → 對手頭頂顯示 ???
  timeLeft: number; winner: 'me'|'them'|null;
}
interface Duelist { id; x: number; hp: number; mp: number; casting: boolean; castProgress: number }
// x 一律 normalized 0..1。progress 0..1

// 筆尖軌跡（畫拖尾用）
import { getStroke } from '../runes';    // readonly Vec2[]，normalized 0..1

// 事件：src/core/bus.ts 的 EV 常數，payload 型別在 src/match/events.ts
on(EV.CAST,        p)  // CastEvent { spell, score, points, templatePoints, durationMs }
on(EV.FIZZLE,      p)  // { bestGuess, score, points }
on(EV.NO_MANA,     p)  // { spell, mp, need }   ⚠️ 視覺必須跟「畫壞了」明顯不同
on(EV.SPELL_HIT,   p)  // { target, x, dmg, hpLeft }
on(EV.NEAR_MISS,   p)  // { owner, toX, missBy }
on(EV.COVER_BUILT, p)  // { id, side, x, hp }
on(EV.COVER_HIT,   p)  // { id, side, x, hpLeft }   hpLeft 0 = 打碎了
```

---

## 5. `src/view/` 現況

```
index.ts      入口。3D 渲染 + Canvas2D overlay（拖尾、軌跡、頭頂數值、HUD）
camera.ts     第一人稱相機。臨界阻尼側移 + 受擊震動
arena.ts      夜空 / 月亮 / 星星 / 遠處尖塔 / 地面格線 / 兩塊平台 / 燈光
actors.ts     對手 sprite + 遮蔽物 pool + 投射物 pool
nameplate.ts  對手頭頂血魔量，被牆擋住畫 ???
```

對手是 **billboard sprite**：載 `/anim/wizard.png`，載不到就退回程式畫的幾何法師。
第一人稱只從正面看對手，所以 billboard 比 3D 網格更清楚也更省。

---

## 6. 🎯 你要做的（照順序，做完一個 build 一次）

### A. webcam 畫中畫（PIP）　20 分鐘　🔴 優先

規格明訂：**這是「這是真的」的唯一證據，judge 需要看到。**
畫面右下角放一個小的 webcam 即時影像。

- 從 `src/tracking/` 拿不到 video element，**自己開**：`navigator.mediaDevices.getUserMedia({video:true})`
- 失敗（沒授權、沒相機）就**安靜地不顯示**，不要跳錯誤
- 尺寸約 200×150，右下角，留 24px 邊距
- 加一圈 `--me` 的細邊框 + 標籤文字 `LIVE`
- **水平鏡像**（`transform: scaleX(-1)`），不然玩家會覺得手反了

### B. HUD 襯底　15 分鐘

`src/ui/hud.ts` 的血格與魔量條現在浮在半空，像 debug 文字。
加一塊半透明深色底板 + 一條 `--me` 細線，讓它像 UI。

### C. 🔴 符文吸附特效（Rune Snap）　60 分鐘　**全場最值錢的一段**

收到 `EV.CAST` 時：玩家歪歪斜斜的軌跡在 **120ms** 內插值變形成完美的 template 形狀，
整條線爆金光，然後散成火星。

```
CastEvent.points          玩家實際畫的軌跡
CastEvent.templatePoints  理想形狀
CONFIG.SNAP_MS            120
```

**兩組點數量不同，要先重採樣成相同點數再逐點 lerp。**
心理效果是「系統認得我，而且把我畫得更好看」——這比任何粒子特效都有力。

### D. 失敗反饋　20 分鐘

- `EV.FIZZLE` → 線條變 `--ash` 向下崩解成灰，450ms
- `EV.NO_MANA` → **必須跟畫壞了明顯不同**：法陣變灰 + 魔量條閃紅
  玩家要分得出「我畫壞了」跟「我沒魔力」，不然會覺得辨識爛

### E. 命中與遮蔽物回饋　30 分鐘

- `EV.SPELL_HIT` → 畫面邊緣紅色 vignette 閃一下 0.3s
- `EV.COVER_HIT` → 牆的位置炸出碎塊；`hpLeft === 0` 時更大
- `EV.COVER_BUILT` → 石塊從地面長出 0.2s

### F. Bloom　20 分鐘　（有時間才做）

`EffectComposer` + `UnrealBloomPass`，`CONFIG.BLOOM_STRENGTH`。
**掉幀就砍掉，不要猶豫。**

---

## 7. ⚠️ 硬規則（會被檢查）

- **不准用 Canvas2D `shadowBlur`。** 成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
  發光用三層描邊：20px α.15 / 10px α.35 / 3px 亮白核心（`index.ts` 的 `drawTrail` 是範例）
- **每幀熱路徑不准配置物件。** 粒子與投射物用 object pool（`actors.ts` 已經是這樣）
- **相機震動 ≤ 8px、≤ 0.25s。** 第一人稱超過這個會讓人暈
- **顏色一律用 `src/ui/tokens.css` 的 CSS 變數**，不准寫死 hex
  讀法：`getComputedStyle(document.documentElement).getPropertyValue('--me')`
- **不准引入新的 npm 套件**

---

## 8. 色票（`src/ui/tokens.css`）

```
--void       #0E182F   夜空
--struct     #5C6EAE   建築      對底 3.61:1
--struct-lit #8FA0D8   受光邊
--me         #D4AF37   我方 暖金
--me-hot     #FFEFC2
--them       #1E7FB8   敵方 冷藍  ⚠️ 不是 #3CC6FF
--them-hot   #3CC6FF   敵方亮部
--spell-core #E6F2FF   法術核心
--magic      #5A3DFF   吸附爆光
--ash        #39405C   失敗的符文
```

> 敵方識別色刻意壓深：`#3CC6FF` 與金色的相對亮度只差 1.08 倍，
> 投影機洗掉飽和度後兩邊會變同一個顏色。壓到 `#1E7FB8` 之後差 2.38 倍。
> **不要改回去。**

---

## 9. 驗收

改完每一項都要：

```bash
npm run build          # 必須零 error
```

然後開 `https://localhost:5173/?solo=1` 目視確認。

**最後回報**：改了哪些檔案、跑了什麼檢查、有沒有沒解決的問題。
**不要 commit，留給人類。**
