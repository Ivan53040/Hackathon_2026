# net — 連線　[socket: E · remoteOpponent: C]

wire 上永遠是 `host`/`guest`，**不准出現 `me`/`them`**。
視角轉換只在這個資料夾邊界做一次（`toLocalView()`）。
少了它，guest 端血量會互換、火球會朝自己飛，而且看起來像渲染 bug。
斷線 3 秒 → 換成 BotOpponent(warlock)，比賽不中斷。這是台上的保命符。
