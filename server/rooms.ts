/**
 * 房間模型　[擁有者：E]
 * 全部在記憶體。不要資料庫、不要 Redis。
 */
import type { WebSocket } from 'ws';

export type Role = 'host' | 'guest';

export interface Player {
  id: string;
  role: Role;
  ws: WebSocket;
  socketAlive: boolean;   // 連線心跳，跟遊戲裡的死活無關
  lastSeen: number;
}

export interface Room {
  code: string;
  players: Map<string, Player>;   // 最多 2
  createdAt: number;
  emptySince: number | null;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // 排除易混淆的 I / O → 23^4 = 279,841
const MAX_ROOMS = 200;
const EMPTY_TTL_MS = 60_000;
const ROOM_TTL_MS = 2 * 60 * 60_000;

const rooms = new Map<string, Room>();

function code4(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function createRoom(): Room | null {
  if (rooms.size >= MAX_ROOMS) return null;
  for (let i = 0; i < 10; i++) {
    const code = code4();
    if (!rooms.has(code)) {
      const room: Room = { code, players: new Map(), createdAt: Date.now(), emptySince: Date.now() };
      rooms.set(code, room);
      return room;
    }
  }
  return null;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function newPlayerId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 8);
}

export function join(room: Room, id: string, ws: WebSocket): Player | null {
  const existing = room.players.get(id);
  if (existing) { existing.ws = ws; existing.socketAlive = true; return existing; }
  if (room.players.size >= 2) return null;
  const role: Role = room.players.size === 0 ? 'host' : 'guest';
  const p: Player = { id, role, ws, socketAlive: true, lastSeen: Date.now() };
  room.players.set(id, p);
  room.emptySince = null;
  return p;
}

export function leave(room: Room, id: string): void {
  room.players.delete(id);
  if (room.players.size === 0) room.emptySince = Date.now();
}

/** 房間裡的另一個人。伺服器唯一需要知道的事 */
export function peerOf(room: Room, id: string): Player | undefined {
  for (const p of room.players.values()) if (p.id !== id) return p;
  return undefined;
}

export function stats() {
  let players = 0;
  for (const r of rooms.values()) players += r.players.size;
  return { rooms: rooms.size, players };
}

/** 每 30 秒掃一次。不做會在凌晨三點慢慢變慢 */
export function startGC(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const empty = r.emptySince !== null && now - r.emptySince > EMPTY_TTL_MS;
      const old = now - r.createdAt > ROOM_TTL_MS;
      if (empty || old) rooms.delete(code);
    }
  }, 30_000);
}
