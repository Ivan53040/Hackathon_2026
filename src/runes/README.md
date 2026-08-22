# runes — 符文辨識

遊戲使用兩個單筆手勢：

- `Z` → `attack`
- `arc`（⌒）→ `wall`

按住 `Shift` 開始收集 `tracking/tracker.ts` 的最新筆尖座標，放開後由 `recognizer.ts` 判定。辨識成功會發出 `EV.CAST`，失敗則發出 `EV.FIZZLE`。

辨識器沿用 `backend-tracking-test` 的正規化與信心分數邏輯；Z 使用方向與三段幾何分數，arc 使用可反向、可小角度旋轉的單筆 template。成功時同時回傳對齊玩家軌跡的理想形狀，供 rune snap 特效使用。
