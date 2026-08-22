# match — 對戰核心 + Bot　[C]

固定步長模擬（accumulator），不要用 rAF 的 dt 直接算物理。
`x` 直接由 `WandFrame.head` 映射，**無慣性無加速度** —— 延遲一毫秒都很明顯。
投射物發射當下鎖定 `toX`，之後不追蹤對手。**這就是「側身閃得掉」的實作。**
`BotOpponent` 與 `RemoteOpponent` 實作同一個 `Opponent` 介面，連線爆炸時一行對調。
