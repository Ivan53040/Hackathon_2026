# runes — 符文辨識　[Bill]

$1 Unistroke，自己寫，不裝套件。兩個符文：**△ attack / □ wall**。

## 流程
```
Shift 按下 → 每幀收 tracker.getFrame().tip → Shift 放開 → recognize()
  score ≥ CAST_THRESHOLD(0.80)      → EV.CAST   (CastEvent)
  HINT_THRESHOLD(0.65) ~ 0.80       → EV.FIZZLE (bestGuess 有值)
  < 0.65 或點數 < MIN_STROKE_POINTS → EV.FIZZLE (bestGuess = null)
```
魔量夠不夠不歸這裡管，那是 `match/` 的事（它會發 `EV.NO_MANA`）。

## 為什麼是角點分流而不是純 $1
`recognizer.ts` 先數轉角：**3 角 → △、4 角 → □**，$1 只負責給分數。
兩個坑已經處理掉：
- 封閉圖形要**繞一圈**數角，不然三角形只數到 2 個角，跟正方形的 3 個撞在一起
- 繞一圈時起點那個角會在頭尾各偵測一次 → 用**環狀分群**去重，不是 cooldown

`templatePoints` 已經對齊玩家軌跡的位置與大小，**故意不旋轉** ——
畫歪的三角形要吸附成正的，「系統把我畫得更好看」才是這個特效值錢的地方。

## ⚠️ 18:00 要做的事
現在的 template 是**程式生的理想形狀**（`RAW_SHAPES`），只夠滑鼠開發期用。
等 Ivan 13:00 交 webcam，**必須用 webcam pipeline 重錄**，滑鼠錄的一律作廢 —— 抖動特性完全不同。
每符文 ≥8 樣本，至少 2 個不同的人錄。換掉 `RAW_SHAPES` 即可，其餘不用動。

備案：若 △/□ 混淆率高，把 □ 改成一條水平線 `—`（形狀上跟 △ 差最遠）。
