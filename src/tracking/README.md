# tracking — 手 / 臉 / 筆尖　[Ivan]

對外由 `tracker.ts` 提供 `setSource()` 與 `getFrame()`。正式流程使用 `pen` source，接收 tracking runtime iframe 傳入的 `WandFrame`；`mediapipe` 與 `mouse` 保留作為備援。
CV 30Hz 與遊戲 60Hz **分離**，CV 不准跑在 rAF 裡。
One Euro 平滑決定手感，不做拖尾會抖到不能看。
走位不歸這裡管 —— 那是 `core/input.ts` 的 A/D。webcam 出事切滑鼠模式時走位照樣能動。
