# server — 房間 + 轉發　[E]

`npm run server` → :8787。前端 `npm run dev` 透過 vite proxy 連過來。
伺服器**不解析遊戲內容**，只轉發。改規格時唯一要動的是 `protocol.ts` 的白名單。
生產環境同源吐 `dist/`，所以不需要 CORS。
心法：可以慢、可以錯，但絕對不准 crash。
