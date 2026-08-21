# RUNESPIRE — 後端開發計劃 (BACKEND PLAN)

> **v3 — 依「筆當魔杖」正式遊戲規格改寫。** 這份文件涵蓋**伺服器、網路協定、部署**。
> 瀏覽器端請看 [`../frontend/PLAN.md`](../frontend/PLAN.md)。
> 執行用打勾清單在 [`CHECKLIST.md`](./CHECKLIST.md)。
>
> **擁有者：E。預估 ~350 行 + 部署，一個人 5 小時。**
>
> **v2 → v3 對後端的影響（只有一句話）：**
> **`state` 訊息多了 `mp`、`covers`、`pitch`、`targetFloor`，`winner` 改成擊殺判定——
> 但伺服器依然完全不解析內容，所以後端的程式碼幾乎不用改。**
> 唯一要動的是 `protocol.ts` 的型別名稱同步，與 `maxPayload` 的重新確認（§5.6）。

---

## 0. 職責邊界（這一節是全文最重要的）

### 伺服器做什麼
1. 發房間代碼、記住房間裡有誰
2. 把訊息從 A 轉發給 B
3. 告訴雙方誰是 host、誰進來了、誰走了
4. 收遙測、算辨識率（demo 講稿要用）
5. 生產環境把前端 build 出來的靜態檔一起吐出去

### 伺服器**不**做什麼
- ❌ 不做符文辨識
- ❌ 不做遊戲模擬 / 命中判定
- ❌ **不做遮蔽物判定、不做視線判定、不算魔量**
- ❌ 不存資料庫
- ❌ 不做帳號、登入、密碼
- ❌ 不用 Docker、不用 Redis、不用 ORM

### 為什麼辨識與規則一定在前端
```
❌ 後端辨識：軌跡 64 點 → HTTP/WS → 伺服器 $1 → 回傳 → 施法
   延遲 80–250ms。網路一抖 = 施法失效 = demo 死亡

✅ 前端辨識：筆尖 → 本地 $1 (3ms) → { spell, targetFloor, score } 約 60 bytes → 送出
   延遲 <5ms。離線也能打 bot
```
**伺服器不該知道什麼是三角形，也不該知道什麼是牆。**
它只該知道房間裡有兩個人，以及怎麼把訊息從 A 傳到 B。

> ⚠️ v3 加了遮蔽物與魔量之後，會有人（包括 AI agent）想「在伺服器驗一下魔量夠不夠」。
> **不准。** 沒有排行榜就沒有作弊誘因，對手是坐在你旁邊的人。
> 任何伺服器端規則驗證都會讓「斷線降級 bot」（§6.2/§6.3）變得不可能。

---

## 1. 技術棧

```
Node 20 LTS
express 4        HTTP + 靜態檔
ws 8             WebSocket（不用 socket.io，我們不需要它的 fallback 與 30KB）
tsx              直接跑 TS，不編譯
```
```bash
npm i express ws
npm i -D tsx @types/express @types/ws
```
**不准加其他套件。** 沒有 Redis、沒有 Prisma、沒有 zod（驗證手寫 20 行就夠）。

---

## 2. 目錄結構

```
server/
├── index.ts        Express + ws bootstrap，靜態檔，graceful shutdown   ~90 行
├── rooms.ts        Room / Player 模型、代碼產生、GC                    ~110 行
├── protocol.ts     wire 型別 + 手寫驗證（與前端共用型別名稱）           ~90 行
├── telemetry.ts    施法紀錄 JSONL + 摘要                                ~50 行
└── README.md       5 行手寫，說明怎麼跑
```
> `protocol.ts` 的型別要跟前端 `src/core/types.ts` **名稱一致**（v3 新增 `Cover`、`WizardState.mp`、
> `WizardState.pitch`、`WizardState.targetFloor`）。
> 36 小時內不做 monorepo 共享，**手動保持同步，改動必須在群組講一聲。**

---

## 3. 資料模型（全部在記憶體）

```ts
type Role = 'host' | 'guest';

interface Player {
  id: string;            // 'p_' + 6 隨機字元，給重連用
  role: Role;
  ws: WebSocket;
  alive: boolean;        // heartbeat 用（注意：這是「連線活著」，不是遊戲裡的死活）
  lastSeen: number;
}

interface Room {
  code: string;          // 4 大寫字母
  players: Map<string, Player>;   // 最多 2
  createdAt: number;
  emptySince: number | null;      // GC 用
}

const rooms = new Map<string, Room>();
```

> ⚠️ **命名陷阱**：v3 的 `WizardState` 也有 `alive`（角色是否被擊殺）。
> `Player.alive` 是**連線心跳**，兩者完全無關。
> 若擔心混淆，把伺服器這個欄位改名為 `socketAlive`——**建議改，凌晨三點你會感謝自己。**

**房間代碼：** 4 個字母，字母表排除易混淆的 `I` `O`：
```ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // 23 個 → 23^4 = 279,841 組
```
產生時碰撞就重抽，重抽 10 次還撞就回 503（實務上不會發生）。

**上限與 GC：**
- 最多 `MAX_ROOMS = 200`，超過拒絕建房
- 每 30 秒掃一次：`emptySince` 超過 60 秒的房間刪掉
- 房間存活上限 2 小時，超過強制清掉

---

## 4. HTTP API

| Method | Path | 回傳 | 說明 |
|---|---|---|---|
| `POST` | `/api/room` | `{ code, playerId }` | 建房。呼叫者預定 host |
| `GET` | `/api/room/:code` | `{ exists, players, full }` | 加入前檢查，錯字立刻給回饋 |
| `GET` | `/api/health` | `{ ok, rooms, players, uptimeS }` | 部署檢查 + demo 前一分鐘確認伺服器活著 |
| `POST` | `/api/telemetry` | `{ ok }` | 批次上傳施法紀錄，見 §7 |
| `GET` | `/api/telemetry/summary` | `{ total, bySpell, recognitionRate }` | **demo 講稿要用的那一句數字** |

**回應碼：**
```
201 建房成功 / 200 查詢成功 / 404 房間不存在 / 409 房間已滿 / 429 太頻繁 / 503 伺服器滿載
```
錯誤格式一律：`{ "error": { "code": "ROOM_FULL", "message": "這個房間已經有兩個人了" } }`
**message 是要直接顯示給玩家看的中文**（登入頁「加入房間」輸入錯代碼時就是顯示這一句），
不要寫 stack trace。

---

## 5. WebSocket 協定 `/ws/:code?playerId=xxx`

### 5.1 連線握手
```
client 連上 /ws/FLUX?playerId=p_ab12de
   ├─ 房間不存在        → close(4004, 'ROOM_NOT_FOUND')
   ├─ 房間已有 2 人且我不是其中之一 → close(4009, 'ROOM_FULL')
   └─ OK → server 送 welcome
```
```jsonc
// server → client，連上第一件事
{ "type":"welcome", "playerId":"p_ab12de", "role":"host", "code":"FLUX", "peers":1 }
```

### 5.2 訊息表（★ = v3 變更）

```jsonc
// ── server → 雙方 ──────────────────────────────
{ "type":"welcome",    "playerId":"...", "role":"host"|"guest", "code":"FLUX", "peers":1 }
{ "type":"peerJoined", "peers":2 }
{ "type":"peerLeft",   "peers":1 }
{ "type":"error",      "code":"ROOM_FULL", "message":"..." }

// ── client → server，15Hz（伺服器原樣轉發給另一人）─
// ★ aim(三態字串) 換成 pitch(連續) + targetFloor(離散)
{ "type":"input", "seq":812, "floor":1, "x":0.42,
  "pitch":0.35, "targetFloor":2,
  "casting":true, "castProgress":0.6 }

// ── client → server，事件觸發 ──────────────────
// ★ spell 多了 "wall"；aim 換成 targetFloor
{ "type":"cast", "spell":"fireball"|"lightning"|"shield"|"wall",
  "targetFloor":2, "score":0.91, "durationMs":1180 }
{ "type":"rematch" }

// ── host → server → guest，15Hz ────────────────
// ★ host/guest 改成陣列（為 2v2 留門，1v1 時長度 1）
// ★ 每個 wizard 多了 mp / alive / pitch / targetFloor
// ★ 新增 covers 陣列
{ "type":"state", "tick":812, "ackSeq":810,
  "host":  [ { "id":"h0","floor":0,"x":0.3,"pitch":0,"targetFloor":0,
               "hp":10,"mp":64,"alive":true,
               "casting":false,"castProgress":0,"shieldUntil":0 } ],
  "guest": [ { "id":"g0","floor":2,"x":0.7,"pitch":-0.5,"targetFloor":1,
               "hp":7,"mp":30,"alive":true,
               "casting":true,"castProgress":0.4,"shieldUntil":0 } ],
  "covers":[ { "id":7,"owner":"guest","floor":2,"x":0.62,"bornAt":1724200012345 } ],
  "projectiles":[ { "id":41,"owner":"host","spell":"fireball",
                    "fromFloor":0,"toFloor":2,"progress":0.4 } ],
  "timeLeft":47, "winner":null }

// ── 雙向 ───────────────────────────────────────
{ "type":"ping", "t":1234567 }
{ "type":"pong", "t":1234567 }
```

### 5.3 🔴 為什麼 wire 格式用 `host`/`guest` 而不是 `me`/`them`

`me`/`them` 是**視角**詞彙——host 的 `me` 是 guest 的 `them`。
一旦用它當 wire 格式，guest 端的血量會互換、投射物方向會反、左右塔會顛倒，
而且症狀長得像「渲染 bug」，你會在 D 的資料夾裡 debug 兩小時，錯的地方在 `net/`。

**v3 讓這件事嚴重十倍：`covers` 也帶 `owner`。**
搞錯的話 guest 端會變成「敵人的牆保護我、我的牆擋住敵人」，**規則整個反過來**，
而且看起來完全不像網路 bug。

**規則：wire 上永遠是絕對角色 `host`/`guest`。前端在 `net/` 邊界做一次視角轉換
（`toLocalView()`，見 `../frontend/PLAN.md` §3），之後全遊戲只講 me/them。**

### 5.4 同步模型：Host-authoritative, 15Hz
- **先進房的是 host**，跑權威模擬並廣播完整狀態
- guest 送 `input` + `cast`，本地做插值與立即的 VFX 預測（拖尾、法陣），
  但 **HP / MP / 命中 / 遮蔽物的生滅一律以 host 的 `state` 為準**
- **命中判定、遮蔽物判定、視線判定 100% 由 host 決定**
- guest 端的頭頂數值牌 `???` 由 guest 自己依收到的 `covers` 算（純顯示，不影響規則）
- 不用 rollback、不用 lockstep、不用預測回滾

**為什麼可以這麼粗暴：** 這個遊戲是**離散樓層 + 慢速投射物 + 靜態遮蔽物**，100ms 延遲肉眼看不出來。
唯一會被看出來的是「蓋牆的瞬間」——所以 **guest 端可以在本地先播蓋牆特效，但那面牆要等 host 的 `state` 才算數**。
牆位置差一點沒人看得出來，牆存不存在不一致才會出事。

### 5.5 伺服器的轉發規則（全部邏輯就這幾行）
```
收到 input / cast / state / ping / pong / rematch
   → 找出房間裡的另一個人
   → 原樣轉發（不解析內容、不改欄位、不驗證遊戲邏輯）
   → 對方不在就丟掉，不報錯
```
**伺服器不看 `spell` 是什麼，不看 `hp` 合不合理，不看 `mp` 夠不夠，不看牆蓋在哪。**

### 5.6 ★ v3 訊息大小重新確認（30 秒的事，但不做會在最糟的時間爆掉）
`state` 訊息長大了：2 個 wizard × ~10 欄位 + 最多 4 面牆 + 投射物。
粗估 **~600–900 bytes**，仍遠低於 `maxPayload: 16KB`。**不需要改，但要親眼確認一次：**
```bash
# 在 host 端 console 印一次
console.log(JSON.stringify(state).length);
```
> 若哪天有人想把符文軌跡塞進 `cast`（**不准**），這個數字會直接破表——那就是警報。

---

## 6. 連線狀態機與斷線處理

### 6.1 Heartbeat
- 伺服器每 **2 秒** 對每個 socket 發 `ws.ping()`
- 收到 `pong` → `socketAlive = true`
- 連兩次沒回 → `terminate()` → 視同離開
- 客戶端也自己發 `{type:'ping'}` 量 RTT，顯示在 Debug HUD

### 6.2 對手斷線 → 幻影接管（**H+22 前必須做，這是台上的保命符**）
```
收到 peerLeft，或 PEER_TIMEOUT_MS(3000) 沒收到對方訊息
   ↓
畫面出現「對手失去連線 — 由幻影接管」
   ↓
RemoteOpponent 就地換成 BotOpponent（術士難度），
繼承當前 HP / MP / 位置 / 樓層 / ★ 場上所有遮蔽物
   ↓
比賽繼續，不中斷
```
> ★ **v3 重點：接管時不要清掉 `covers`。** 牆突然全部消失是全場最明顯的 glitch，
> 觀眾不知道什麼是 RemoteOpponent，但一定看得到牆憑空不見。

### 6.3 🔴 host 離線時 guest 怎麼辦（**會直接卡死，必做**）
guest 端**從來沒有跑過權威模擬**——它一直在等 `state`。host 一走，guest 的畫面會靜止不動。

**必做：guest 收到 `peerLeft` 時執行「自我提升」：**
```
1. 用最後一份 state 當作初始狀態（★ 含 covers、mp、每個 wizard 的 alive）
2. mode: 'guest' → 'solo'，本地開始跑權威模擬
3. them 換成 BotOpponent(warlock)，繼承 HP / MP / floor / x
4. ★ 立刻用最後一份 covers 重建本地的遮蔽物狀態，之後由本地權威接手生滅
5. 之後不再等任何網路訊息
```
guest 離線時 host 只要 §6.2 就夠了。**兩條路徑都要在 M3 測到。**

> ★ **v3 的新失敗模式**：自我提升後若忘了接手 `covers`，guest 端會出現
> 「牆看得到但打不碎 / 打不到人」——因為本地模擬裡根本沒有那些牆。
> **M3 驗收一定要在「場上有牆」的狀態下拔線測。**

### 6.4 重連（有時間才做，優先度低於 6.3）
`playerId` 存在 `sessionStorage`。同 `playerId` 重新連上同房間 → 沿用原 role，發 `peerJoined`。
**做不完就砍，6.2/6.3 已經涵蓋了 demo 的所有失敗情境。**

---

## 7. 遙測（不要跳過，這是講稿的彈藥）

> E 的任務：**H+28 你要能講「我們收集了 600 次施法，平均辨識率 88.3%」——這一句比任何架構圖都有說服力。**

**客戶端**：每次施法（成功或 fizzle）記一筆，**每 10 筆或每 30 秒批次送出**，用 `navigator.sendBeacon` 或 `fetch(keepalive:true)`，失敗就丟掉不重試（遙測絕不能影響遊戲）。

```jsonc
POST /api/telemetry
{ "events":[
  { "t":1724200000000, "spell":"wall", "score":0.88, "ok":true,
    "source":"mediapipe", "durationMs":1180, "session":"s_x9f2" },
  // ★ v3：魔量不足導致的失敗要分開記，不能算進辨識率
  { "t":1724200003000, "spell":"lightning", "score":0.93, "ok":false,
    "reason":"no-mana", "source":"mediapipe", "durationMs":900, "session":"s_x9f2" }
]}
```
> ★ **`reason:"no-mana"` 的事件不列入辨識率分母。**
> 那是玩家沒魔力，不是我們認不出來。混在一起會**低估自己的辨識率**，
> 然後你在台上報一個比實際更難看的數字。

**伺服器**：append 到 `data/telemetry.jsonl`（純檔案，不要資料庫）。

```jsonc
GET /api/telemetry/summary
{ "total":612, "ok":541, "recognitionRate":0.883,
  "excludedNoMana":38,
  "bySpell":{ "fireball":{"n":250,"rate":0.91},
              "shield":{"n":198,"rate":0.86},
              "lightning":{"n":164,"rate":0.87},
              "wall":{"n":120,"rate":0.84} },
  "bySource":{ "mediapipe":0.87, "hsv":0.93, "mouse":0.98 } }
```
> ⚠️ 部署平台的檔案系統多半是暫時性的（重啟就沒了）。
> **H+30 之後不要重啟伺服器**，或在 demo 前先 `curl summary` 把數字抄到投影片上。

---

## 8. 安全與韌性（每一條都是防止台上白畫面）

| 項目 | 做法 |
|---|---|
| **全域 try/catch** | `process.on('uncaughtException')` + `unhandledRejection` → log 後**不要退出** |
| **JSON 解析** | 每個 `message` handler 包 try/catch，壞訊息丟掉，不要讓一個 client 打死伺服器 |
| **訊息大小上限** | `ws` 的 `maxPayload: 16 * 1024`。★ v3 的 `state` 約 600–900 bytes，仍安全（§5.6） |
| **型別驗證** | 手寫 20 行：`type` 必須在白名單、數字欄位 `Number.isFinite`、字串長度上限、**陣列長度上限**（`covers`/`projectiles` 各 ≤ 32，防止有人送十萬面牆把對方瀏覽器打死） |
| **建房限流** | 同 IP 每分鐘最多 20 次建房。記憶體 Map，過期就清 |
| **CORS** | 生產環境同源（伺服器吐前端靜態檔）→ **不需要 CORS**。dev 走 vite proxy → 也不需要 |
| **不記 IP** | log 只記房間代碼與事件，不記 IP、不記個資 |
| **graceful shutdown** | `SIGTERM` → 對所有 socket 送 `close(1001,'SERVER_RESTART')` |

**核心心法：伺服器可以慢、可以錯，但絕對不准 crash。** 一個 crash = 兩台筆電同時白畫面。

---

## 9. 🔴 部署（H+20 前必須有線上網址，不要留到最後）

### 9.1 為什麼一定要 HTTPS（不是「比較好」，是「不然遊戲不能玩」）
```
getUserMedia() 只在 secure context (https / localhost) 可用
   ↓ 沒有 https
第二台筆電拿不到 webcam → 只能用滑鼠 → demo 的整個賣點消失

頁面是 https 時，ws:// 會被瀏覽器擋成 mixed content
   ↓
必須用 wss://。前端連線一律用：
   const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
```

### 9.2 部署方式：**單一 Node 程序，同源提供前端 + API + WS**
```
npm run build          → dist/
node server/index.ts   → express.static('dist') + /api + /ws，同一個 port
```
同源的三個好處：**沒有 CORS、沒有 mixed content、只要顧一個網址。**

```ts
// index.ts 尾端，順序很重要：API 與 WS 要在 SPA fallback 之前
app.use(express.static('dist'));
app.get('*', (_, res) => res.sendFile(path.resolve('dist/index.html')));
```
> ★ 前端有多個頁面（登入 / 說明 / 設定 / 大廳 / 對戰 / 結算），但**是 SPA 前端路由**，
> 所以 fallback 一行就夠。**不要為了說明頁去加第二個 HTML 檔。**

### 9.3 平台選擇

| 平台 | 優點 | 要注意 |
|---|---|---|
| **Render**（推薦） | 免費、自動 https、原生支援 WebSocket、git push 即部署 | 免費方案閒置會休眠，**冷啟 ~50 秒**。demo 前 10 分鐘先開一次網頁把它叫醒 |
| **Fly.io** | 不休眠、延遲低 | 要裝 CLI、要寫 `fly.toml` |
| **Railway** | 最簡單 | 免費額度有限 |

> ❌ **不要用 Vercel / Netlify / Cloudflare Pages。** 它們的 serverless 函式**不支援長連線 WebSocket**，
> 你會浪費兩小時才發現這件事。

**環境變數（就這兩個）：**
```
PORT=8787          # 平台會自己注入，程式一定要讀 process.env.PORT
NODE_ENV=production
```

### 9.4 會場網路的備援
會場 WiFi 很可能擋 WebSocket 或做 captive portal。**排練時就要用會場網路測過。**
```
Plan A  兩台筆電 → 手機熱點 → 部署好的 https 網址        ← 首選
Plan B  一台跑 server + vite(mkcert https)，另一台連 https://<區網IP>:5173
        ⚠️ 第二台必須信任憑證，否則沒有 webcam。排練時就要裝好
Plan C  直接 demo 單人打大法師 bot，觀眾不會知道差別    ← 有疑慮就走這條
```
> ★ Plan C 在 v3 更可行：**大法師 bot 會蓋牆、走出牆外開火再退回**，
> 這正好把規格的核心玩法演一遍。**排練時 Plan C 要跟 Plan A 一樣熟。**

---

## 10. 本機開發

```bash
# 終端 1
npm run server        # tsx watch server/index.ts   → :8787
# 終端 2
npm run dev           # vite（proxy /api 與 /ws 到 8787）→ :5173
```
```jsonc
// package.json
"scripts": {
  "dev":    "vite",
  "server": "tsx watch server/index.ts",
  "build":  "vite build",
  "start":  "NODE_ENV=production tsx server/index.ts"
}
```

**手動測試（不用寫測試框架，36 小時內不值得）：**
```bash
curl -X POST localhost:8787/api/room
curl localhost:8787/api/room/FLUX
curl localhost:8787/api/health
npx wscat -c "ws://localhost:8787/ws/FLUX?playerId=p_test1"   # 開兩個，互相傳訊息
```
**`scripts/loadtest.ts`**（20 分鐘，很值得）：開 2 個假 client 以 15Hz 互丟**含 4 面牆的完整 `state`**
跑 5 分鐘，確認記憶體不漲、房間會被 GC。凌晨三點記憶體洩漏會毀掉整場。

---

## 11. 後端時間表

| 時段 | 內容 | 產出 |
|---|---|---|
| **H+0→1** | 跟前端一起唸 `types.ts`（★ 含 `Cover` / `mp` / `pitch` / `targetFloor`），確定 wire 用 host/guest | 契約定案 |
| **H+2→8** | `index.ts` 骨架 + `rooms.ts` + HTTP API + WS 通道打通（先傳空訊息也算） | `curl` 能建房，wscat 兩端互通 |
| **H+8→14** | 完整訊息轉發、heartbeat、驗證（★ 含陣列長度上限）、限流、GC | **M2 支援** |
| **H+14→20** | 🔴 **部署上線，拿到 https 網址**。此後所有測試都在線上做 | 線上網址 |
| **H+20→22** | 前端 `RemoteOpponent` 對接、斷線降級、**host 離線 guest 自我提升(§6.3，★ 含 covers 接手)** | **M3** |
| **H+22→26** | 遙測 endpoint + summary（★ `no-mana` 分開算）、大廳頁對接、loadtest | 數字可查 |
| **H+26→30** | 用**會場網路**測一次完整對戰；冷啟時間量測 | 風險歸零 |
| **H+30** | 🔒 **FEATURE FREEZE**。之後後端只准改文案與環境變數 | — |
| **H+32→36** | 彩排時保持伺服器熱著，`/api/health` 每次彩排前 curl 一次 | **M7** |

> **後端不是關鍵路徑，但它的失敗是致命的。** 早做完，早部署，然後把時間拿去幫整合。
> ★ **v3 之後這句話更重要**：C 要實作整套遮蔽物規則，是全隊最重的一塊。
> **E 部署完就去幫 C 測 C1/C2/C3。**

---

## 12. 後端風險與 Kill List

| 風險 | 機率 | 影響 | 觸發條件 | 對策 |
|---|---|---|---|---|
| 會場網路擋 WebSocket | 中 | 高 | 連不上 | 手機熱點 → Plan C bot |
| 免費方案冷啟 50 秒 | **高** | 中 | demo 當下第一次連 | 上台前 10 分鐘叫醒，並每 10 分鐘 ping 一次 |
| 部署平台不支援 WS | 中 | 致命 | 選錯平台 | §9.3 已排除 Vercel/Netlify |
| 沒有 https → 沒 webcam | **高** | **致命** | 走區網 demo | §9.1 + mkcert，排練必測 |
| ★ `covers` 的 owner 視角轉換寫錯 | **高** | **致命** | guest 端規則反過來 | §5.3 + M3 一定要用 guest 端測「我的牆保護我」 |
| ★ 自我提升沒接手 covers | 中 | 高 | host 離線且場上有牆 | §6.3 步驟 4；M3 要在有牆時拔線 |
| ★ `protocol.ts` 與前端型別不同步 | **高** | 中 | 有人加欄位沒講 | 加欄位一律群組公告；伺服器不解析所以不會 crash，但驗證白名單要更新 |
| 記憶體洩漏（房間沒清） | 中 | 中 | 跑久了變慢 | GC + loadtest |
| 伺服器 crash | 低 | 致命 | 壞訊息 | §8 全域 catch + payload 上限 |

### Kill List
1. **砍重連（§6.4）** — 斷線降級 bot 已經涵蓋所有 demo 情境
2. **砍遙測** — 但這會讓你少掉講稿裡最有說服力的一句話，**最後才砍**
3. **砍限流與驗證** — hackathon 沒有攻擊者。**但全域 try/catch 與陣列長度上限不准砍**
4. **砍 `GET /api/room/:code`** — 直接讓 WS 連線失敗處理錯誤（登入頁「加入房間」的錯誤提示會變差）
5. **☠️ 整個後端砍掉，只做單人 bot 模式**
   - 前端 `Opponent` 介面設計就是為了這一刻：`RemoteOpponent` 換成 `BotOpponent`，一行的事
   - ★ v3 讓這條退路更好看：**大法師 bot 會蓋牆、走出牆外開火**，單機 demo 一樣演得完整套規則
   - **這正是為什麼 §5 的架構要這樣切。連線是支線，bot 是主線。**

---

## 13. 驗收標準

| # | 標準 | 怎麼測 |
|---|---|---|
| B1 | `POST /api/room` 回傳 4 字母代碼 | `curl` |
| B2 | 兩個 wscat 連同房間，A 送的 B 收得到 | 手動 |
| B3 | 第三個人加入被拒（4009） | wscat |
| B4 | 拔網路線 3 秒內對方收到 peerLeft | 手動 |
| B5 | **guest 端：host 關掉分頁後遊戲不中斷** | 兩個**並排視窗**（不是分頁，背景分頁 rAF 會被節流） |
| B6 | **host 端：guest 關掉後遊戲不中斷** | 同上 |
| B7 | 線上 https 網址兩台裝置能對戰，且**兩台都有 webcam 畫面** | 手機熱點 |
| B8 | 5 分鐘 loadtest 記憶體不漲、空房被 GC | `scripts/loadtest.ts` |
| B9 | `/api/telemetry/summary` 回傳可貼進投影片的數字（★ `no-mana` 有被排除） | `curl` |
| B10 | 送壞掉的 JSON 伺服器不 crash | `wscat` 送 `{{{` |
| ★ B11 | **`covers` 完整轉發**：host 蓋牆，guest 端 0.2 秒內看到同一面牆 | 並排視窗 |
| ★ B12 | **guest 端的牆保護 guest、擋 guest 自己的攻擊**（不是反過來） | 並排視窗，站在自己牆後開火 |
| ★ B13 | **場上有牆時 host 離線 → guest 自我提升後牆還在、還能被打碎** | 並排視窗，先蓋牆再關掉 host |
| ★ B14 | 送 `covers` 長度 100 的訊息 → 被驗證擋掉，伺服器不 crash、對方不卡死 | `wscat` |

**M3（H+22）團隊驗收：兩個並排視窗對戰，任一方關掉，另一方自動接管成 bot 且不中斷。**
**兩個方向都要測，而且要在場上有牆的狀態下測。**
