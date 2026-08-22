/**
 * Express + ws　[擁有者：E]
 *
 * 伺服器只做三件事：發房號、記住房裡有誰、把訊息從 A 轉發給 B。
 * 它不知道什麼是三角形，也不知道誰打中誰。
 * 核心心法：可以慢、可以錯，但絕對不准 crash —— 一個 crash = 兩台筆電同時白畫面。
 */
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { createRoom, getRoom, join, leave, newPlayerId, peerOf, startGC, stats } from './rooms';
import { isValidMessage } from './protocol';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: '32kb' }));

// ── 建房限流：同 IP 每分鐘 20 次 ──────────────────
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

app.post('/api/room', (req, res) => {
  if (rateLimited(req.ip ?? '?')) {
    return res.status(429).json({ error: { code: 'TOO_MANY', message: '太頻繁了，等一下再試' } });
  }
  const room = createRoom();
  if (!room) {
    return res.status(503).json({ error: { code: 'FULL', message: '伺服器忙碌中，稍後再試' } });
  }
  res.status(201).json({ code: room.code, playerId: newPlayerId() });
});

app.get('/api/room/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: '找不到這個房間，代碼再確認一次' } });
  }
  res.json({ exists: true, players: room.players.size, full: room.players.size >= 2 });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...stats(), uptimeS: Math.round(process.uptime()) });
});

// 生產環境同源吐前端 —— 沒有 CORS、沒有 mixed content、只要顧一個網址
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}

const server = createServer(app);
// maxPayload 16KB —— v5 的 state 訊息約 200–300 bytes，這是防呆不是限制
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const code = url.pathname.replace(/^\/ws\//, '').toUpperCase();
  const playerId = url.searchParams.get('playerId') ?? newPlayerId();

  const room = getRoom(code);
  if (!room) return ws.close(4004, 'ROOM_NOT_FOUND');

  const me = join(room, playerId, ws);
  if (!me) return ws.close(4009, 'ROOM_FULL');

  const send = (sock: WebSocket, obj: unknown) => {
    try { sock.send(JSON.stringify(obj)); } catch { /* 對方剛斷線，丟掉就好 */ }
  };

  send(ws, { type: 'welcome', playerId: me.id, role: me.role, code: room.code, peers: room.players.size });
  const peer = peerOf(room, me.id);
  if (peer) {
    send(peer.ws, { type: 'peerJoined', peers: room.players.size });
    send(ws, { type: 'peerJoined', peers: room.players.size });
  }

  ws.on('pong', () => { me.socketAlive = true; me.lastSeen = Date.now(); });

  ws.on('message', (raw) => {
    try {
      const msg: unknown = JSON.parse(String(raw));
      if (!isValidMessage(msg)) return;          // 壞訊息丟掉，不報錯不 crash
      const other = peerOf(room, me.id);
      if (other) send(other.ws, msg);            // 原樣轉發。不解析、不改欄位
    } catch { /* 壞 JSON，丟掉 */ }
  });

  ws.on('close', () => {
    leave(room, me.id);
    const other = peerOf(room, me.id);
    if (other) send(other.ws, { type: 'peerLeft', peers: room.players.size });
  });
});

// heartbeat：連兩次沒回就當離開
setInterval(() => {
  for (const ws of wss.clients) {
    try { ws.ping(); } catch { /* ignore */ }
  }
}, 2000);

startGC();

// 絕對不准 crash
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('SIGTERM', () => {
  for (const ws of wss.clients) { try { ws.close(1001, 'SERVER_RESTART'); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
});

server.listen(PORT, () => console.log(`[runespire] server on :${PORT}`));
