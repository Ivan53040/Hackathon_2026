# tracking — 手 / 臉 / 筆尖　[Ivan]

對外只有 `tracker.ts` 的 `setSource()` 與 `getFrame()`。別的模組不要 import 底下的 `*Source`。
CV 30Hz 與遊戲 60Hz **分離**，CV 不准跑在 rAF 裡。
`head` 的平滑要比 `tip` 重很多 —— 頭抖會直接變成畫面暈眩。
筆尖必須換算成「相對身體」（除以 `bodyScale`），玩家挪位置符文才不會變形。
