# 場景 — 給 Bill

**目標：把決鬥場從「三個色塊」變成「一個地方」。**
你的 `runes/` 與 `match/` 都完成了，這是接下來最缺人的一塊。

---

## 0. 🔴 最重要的一條：你只寫一個新檔

**新檔：`src/view/scenery.ts`　—— 這個檔 100% 是你的，我不碰。**

**不准開** `src/view/arena.ts`、`index.ts`、`actors.ts`、`camera.ts`
—— 我同時在裡面，一起改必衝突。

介面就三個（照 `CLAUDE.md` 的 init / update / dispose 慣例）：

```ts
import * as THREE from 'three';

export function buildScenery(scene: THREE.Scene): void;
export function updateScenery(t: number, dt: number): void;   // 沒有動畫就留空
export function disposeScenery(): void;
```

寫完跟我說一聲，**接線那一行我自己加**（在 `arena.ts` 裡呼叫 `buildScenery`）。
你可以先自己在本機臨時加那行測試，但**不要提交那行**。

---

## 1. 場地尺寸（照抄，不要自己猜）

```
相機（我）      x = 0,  y = 1.6,  z = 0        FOV 55°，視線水平
我的平台        z = 0.6
對手            z = −7.5                       ← 這條視線不能被擋
對手的平台      z = −8.5   (GAP = 8.5)
橫向範圍        x ∈ [−3, 3]                    (LANE_WIDTH = 6)
地板            y = −0.65，80×80
平台高度        y = −0.3，厚 0.6，深 3.2
```

**霧已經存在**：`Fog(--void, 7.65, 28.9)`。
放在 28.9 以外的東西會被霧吃光 —— 要嘛放進範圍內，要嘛材質設 `fog: false`
（現有的月亮、星星、遠處尖塔都是 `fog: false`）。

---

## 2. 現在有什麼（不用重做）

`arena.ts` 已經有：天空球漸層、260 顆星星、月亮 + 光暈、5 座遠處尖塔剪影、
地板 + `GridHelper` 透視格線、兩塊平台 + 受光邊、三盞燈、霧。

**缺的是中景。** 近景是平台、遠景是尖塔，**中間 z ∈ [−3, −7] 完全是空的**，
所以現在看起來像三個色塊漂在夜空裡。

---

## 3. 要做的（照優先序，做完一項 build 一次）

### 🔴 A. 中景：兩側的柱子 / 拱門　60 分鐘

沿 `x = ±4.5`（在 lane 外側，擋不到人）擺 4–6 對柱子，z 從 0 排到 −9。
柱頭可以有簡單的燈火（`MeshBasicMaterial` 亮點，不要真光源）。

**這一項最值錢** —— 它同時給出「這是室內競技場」和「距離感」。
柱子隨 z 縮小＋被霧吃掉，是最便宜的景深。

**驗收：站在原地，畫面中間 1/3 完全淨空，看得到對手全身。**

### 🟡 B. 平台落地　20 分鐘

現在兩塊平台是裸 Box 浮在地板上。加台階或基座讓它接到地面。

### 🟡 C. 地面符文環　30 分鐘

兩個站位各一圈蝕刻圓環（`RingGeometry` 線框即可，`--struct-lit`，透明度 0.2）。
**注意**：`actors.ts` 已經有一個施法用的 sigil 環在對手腳下，
你的是靜態裝飾，**顏色要壓暗**，不然玩家會分不出「他在起手」。

### 🟢 D. 遠處尖塔加窗光　20 分鐘

現有 5 座剪影加一些亮點窗戶（`Points` 或小 plane）。便宜，效果好。

### 🟢 E. 中景浮石　有時間才做

z ∈ [−4, −7]、y ∈ [2, 5] 飄幾塊石頭，用 `updateScenery` 做極慢的上下浮動。

---

## 4. 硬規則（會被檢查）

- **顏色一律從 `src/ui/tokens.css` 讀**，不准寫死 hex：
  ```ts
  new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--struct').trim())
  ```
  可用：`--void --struct --struct-lit --me --them --spell-core --magic --ash`
  ⚠️ **不要用 `--them` 系列做裝飾** —— 那是敵方識別色，場景搶了會害玩家看錯
- **不准引入新的 npm 套件**
- **不准在 `updateScenery` 裡配置物件**（每幀熱路徑）。要動的東西在 `buildScenery` 就開好
- **不准加新的光源**。現在有 3 盞，再加會掉 fps。發亮用 `MeshBasicMaterial`
- **不准改 `src/core/config.ts` 的數值**
- **不准 `git add` / `commit` / `push`**（見 `rules.md`）

---

## 5. 驗收

```bash
npm run build          # 必須零 error
```

然後開 `https://localhost:5173/` → 點 **Practise against a bot** 目視確認：

1. **fps 還是 60**（左上角 HUD 有顯示）。掉到 55 以下就砍東西，不要猶豫
2. **對手全身清楚可見**，中間 1/3 沒有任何遮擋
3. 左右走位（A / D）時場景有視差，不會穿模

⚠️ **不要用 `?mock=1` 測。** 那是假狀態，玩家的攻擊與建造不會被模擬。

---

## 6. 做完回報

- 改了哪些檔（應該只有 `src/view/scenery.ts` 一個）
- fps 前 / 後
- 有沒有沒解決的問題

**不要 commit，留給人類。**
