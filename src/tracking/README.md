# tracking — 手 / 臉 / 筆尖　[Ivan]

對外只有 `tracker.ts` 的 `setSource()` 與 `getFrame()`。別的模組不要 import 底下的 `*Source`。
CV 30Hz 與遊戲 60Hz **分離**，CV 不准跑在 rAF 裡。
One Euro 平滑決定手感，不做拖尾會抖到不能看。
走位不歸這裡管 —— 那是 `core/input.ts` 的 A/D。webcam 出事切滑鼠模式時走位照樣能動。
