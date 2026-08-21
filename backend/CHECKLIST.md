# 後端執行清單 (BACKEND CHECKLIST)

> 擁有者：**E**。詳細規格看 [`PLAN.md`](./PLAN.md)。
> 後端不是關鍵路徑，**但它的失敗是致命的**。早做完，早部署，然後把時間拿去幫整合。

---

## H+0 → H+1　契約

- [ ] 跟前端一起逐行唸 `src/core/types.ts`
- [ ] 🔴 確認 wire 格式用 **`host`/`guest`** 不用 `me`/`them`（[PLAN.md §5.3](./PLAN.md)）
- [ ] `server/protocol.ts` 型別名稱與前端一致，改動要在群組講
- [ ] 決定部署平台（**Render 推薦；絕對不要 Vercel/Netlify**，不支援長連線 WS）

---

## H+2 → H+8　骨架

- [ ] `npm i express ws` / `npm i -D tsx @types/express @types/ws`
- [ ] `package.json` scripts：`dev` / `server` / `build` / `start`
- [ ] `vite.config.ts` proxy：`/api` → 8787，`/ws` → 8787（`ws: true`）
- [ ] `server/index.ts` 起得來，`process.env.PORT` 有讀
- [ ] `rooms.ts`：Room / Player 模型
- [ ] 代碼產生器，字母表排除 `I` `O`
- [ ] `POST /api/room` → `{ code, playerId }`
- [ ] `GET /api/room/:code` → `{ exists, players, full }`
- [ ] `GET /api/health` → `{ ok, rooms, players, uptimeS }`
- [ ] `/ws/:code?playerId=` 握手 + `welcome` 訊息
- [ ] 純轉發：找到房裡另一人就原樣送過去
- [ ] `peerJoined` / `peerLeft` 廣播

**測試**
- [ ] `curl -X POST localhost:8787/api/room`
- [ ] `npx wscat -c "ws://localhost:8787/ws/FLUX?playerId=p_a"` 開兩個，互通
- [ ] 第三個連線被拒（close 4009 ROOM_FULL）
- [ ] 房間不存在被拒（close 4004 ROOM_NOT_FOUND）

---

## H+8 → H+14　韌性

- [ ] 🔴 `process.on('uncaughtException')` + `unhandledRejection` → log 但**不要退出**
- [ ] 每個 message handler 包 try/catch，壞 JSON 丟掉不 crash
- [ ] `ws` 設 `maxPayload: 16 * 1024`
- [ ] 手寫驗證：`type` 白名單、數字 `Number.isFinite`、字串長度上限
- [ ] Heartbeat：每 2 秒 `ws.ping()`，連兩次沒 pong 就 `terminate()`
- [ ] 房間 GC：每 30 秒掃，空房超過 60 秒刪除
- [ ] `MAX_ROOMS = 200` 上限，超過回 503
- [ ] 建房限流：同 IP 每分鐘 20 次
- [ ] `SIGTERM` graceful shutdown → `close(1001, 'SERVER_RESTART')`
- [ ] log 不記 IP、不記個資

**測試**
- [ ] wscat 送 `{{{` → 伺服器不 crash
- [ ] 拔網路線，3 秒內對方收到 `peerLeft`

---

## H+14 → H+20　🔴 部署（不要留到最後）

- [ ] `npm run build` 產出 `dist/`
- [ ] `express.static('dist')` + SPA fallback（**順序在 API/WS 之後**）
- [ ] 推上 Render（或 Fly.io）
- [ ] 🔴 **拿到 https 網址**
- [ ] 確認 `wss://` 連得上（前端 `location.protocol === 'https:' ? 'wss:' : 'ws:'`）
- [ ] 確認同源 → 不需要 CORS
- [ ] `curl https://<網址>/api/health` 回 200
- [ ] 🔴 **在線上網址開兩台裝置，確認兩台都拿得到 webcam 畫面**
- [ ] 量測冷啟時間，寫在牆上（Render 免費方案約 50 秒）
- [ ] 此後所有測試都在線上做，不要只在 localhost 測

**LAN 備援（Plan B，排練前要能跑）**
- [ ] `vite-plugin-mkcert` 裝好，dev server 是 `https://<區網IP>:5173`
- [ ] 第二台筆電**已信任憑證**，能拿到 webcam

---

## H+20 → H+22　斷線降級（**台上的保命符**）

- [ ] 前端 `RemoteOpponent` 實作 `Opponent` 介面（與 `BotOpponent` 完全一致）
- [ ] `toLocalView()` 視角轉換在 `net/` 邊界做一次
- [ ] `PEER_TIMEOUT_MS = 3000` 判定超時
- [ ] 畫面顯示「對手失去連線 — 由幻影接管」
- [ ] **host 端**：guest 走掉 → `RemoteOpponent` → `BotOpponent(warlock)`，繼承 HP/位置
- [ ] 🔴 **guest 端**：host 走掉 → **自我提升為 solo**，用最後一份 state 當初始值，本地跑權威模擬（[PLAN.md §6.3](./PLAN.md)）
- [ ] 兩條路徑都不會讓畫面靜止

### ✅ M3 驗收（H+22）
- [ ] 🔴 **兩個並排視窗**（不是兩個分頁，背景分頁 rAF 被節流會假失敗）對戰
- [ ] host 關掉 → guest 遊戲繼續 ✅
- [ ] guest 關掉 → host 遊戲繼續 ✅
- [ ] **兩個方向都測過**

---

## H+22 → H+26　遙測與收尾

- [ ] `POST /api/telemetry` 收批次事件，append 到 `data/telemetry.jsonl`
- [ ] `GET /api/telemetry/summary` → total / recognitionRate / bySpell / bySource
- [ ] 前端每 10 筆或 30 秒批次送，**失敗就丟掉不重試**（遙測絕不能影響遊戲）
- [ ] 大廳頁對接（顯示房間代碼、等待對手、開始）
- [ ] `scripts/loadtest.ts`：2 個假 client 15Hz 跑 5 分鐘
- [ ] 確認記憶體不漲、空房會被 GC
- [ ] `server/README.md` 5 行手寫

---

## H+26 → H+30　現場驗證與凍結

- [ ] 🔴 **用會場網路**跑一次完整對戰
- [ ] 會場網路擋 WS → 切手機熱點再測一次
- [ ] 🔒 **H+30 FEATURE FREEZE**：後端之後只准改文案與環境變數
- [ ] `curl /api/telemetry/summary` 把數字抄進投影片（**部署平台重啟會清掉檔案**）

---

## H+32 → H+36　Demo

- [ ] 每次彩排前 `curl /api/health`
- [ ] 上台前 10 分鐘叫醒伺服器，之後每 10 分鐘 ping 一次
- [ ] **H+30 之後不要重啟伺服器**（遙測數字會歸零）
- [ ] 三條備援路徑全隊都知道：
      - Plan A 兩台 → 手機熱點 → https 網址
      - Plan B 區網 + mkcert https
      - Plan C 直接 demo bot 對戰（觀眾不會知道差別）

---

## ✅ 後端驗收表

| # | 標準 | 通過 |
|---|---|---|
| B1 | `POST /api/room` 回 4 字母代碼 | ☐ |
| B2 | 兩個 wscat 同房互通 | ☐ |
| B3 | 第三人被拒 4009 | ☐ |
| B4 | 拔線 3 秒內 peerLeft | ☐ |
| B5 | guest 端：host 離線遊戲不中斷 | ☐ |
| B6 | host 端：guest 離線遊戲不中斷 | ☐ |
| B7 | 線上 https 兩台對戰，**兩台都有 webcam** | ☐ |
| B8 | 5 分鐘 loadtest 記憶體不漲、空房被 GC | ☐ |
| B9 | `/api/telemetry/summary` 數字可貼投影片 | ☐ |
| B10 | 送壞 JSON 不 crash | ☐ |

---

## 🪓 後端 Kill List

- [ ] 1. 砍重連（`playerId` 復原）— 斷線降級 bot 已涵蓋 demo 所有情境
- [ ] 2. 砍限流與驗證 — **但全域 try/catch 不准砍**
- [ ] 3. 砍 `GET /api/room/:code` — 直接讓 WS 連線失敗處理錯誤
- [ ] 4. 砍遙測 — **最後才砍**，這是講稿最有說服力的一句話
- [ ] 5. ☠️ 整個後端砍掉，只做單人 bot 模式
      → `RemoteOpponent` 換 `BotOpponent`，一行的事。
      **`Opponent` 介面就是為了這一刻設計的。**

---

## ⚠️ 三個最容易忘、忘了會死的事

1. **沒有 https 就沒有 webcam。** 第二台筆電連 `http://192.168.x.x` 拿不到攝影機，
   遊戲當場退化成滑鼠模式，賣點全滅。→ [PLAN.md §9.1](./PLAN.md)
2. **wire 用 `host`/`guest`，不要用 `me`/`them`。** 用錯會讓 guest 端血量互換、
   左右顛倒，而且症狀看起來像渲染 bug。→ [PLAN.md §5.3](./PLAN.md)
3. **host 離線時 guest 會靜止。** guest 從沒跑過權威模擬，必須「自我提升」。
   → [PLAN.md §6.3](./PLAN.md)

---

## 📎 Git 規範提醒

`../rules.md`：**AI 不准 `git add` / `commit` / `push` / 開 PR，全部由人類做，
且 commit message 不准有任何 AI 署名。** commit 格式：

```text
<type>(<scope>): <imperative summary>
```
例：`feat(server): add room code generation and websocket relay`
