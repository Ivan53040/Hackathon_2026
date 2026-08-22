# core — 契約　[E]

`types.ts` 是全隊的契約，H+1 定死。改它要在群組講一聲，後端 `server/protocol.ts` 手動同步。
`bus.ts` 事件名一律用 `EV` 常數，不准用字面字串。
`config.ts` **是人類的**，AI 不准改數值。調參只改這個檔案。
