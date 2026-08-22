/**
 * WebSocket 客戶端　[擁有者：你]
 *
 * 這一層只做傳輸，不懂遊戲規則。
 * 收到訊息 → 丟到 bus；要送東西 → 呼叫 send*()。
 *
 * 同步模型：host-authoritative, 15Hz
 *   host  跑權威模擬，每 tick 廣播完整 WireState
 *   guest 送自己的 input / cast，畫面吃 host 的 state
 * 詳見 ../../backend/PLAN.md §5.4
 */
import { CONFIG } from '../core/config';
import { EV, emit } from '../core/bus';
import type { Role, Spell, WireState } from '../core/types';

interface RoomInfo { code: string; playerId: string; }

let ws: WebSocket | null = null;
let myRole: Role | null = null;
let latest: WireState | null = null;
let lastPeerMsgAt = 0;
let rtt = 0;
let peerPresent = false;
type TimerId = ReturnType<typeof setInterval>;
let timers: TimerId[] = [];

// ─── HTTP ────────────────────────────────────────
export async function createRoom(): Promise<RoomInfo> {
  const r = await fetch('/api/room', { method: 'POST' });
  if (!r.ok) throw new Error((await r.json())?.error?.message ?? '建立房間失敗');
  return r.json();
}

/** 加入前先查，錯字可以立刻給回饋，不用等 WebSocket 關閉碼 */
export async function checkRoom(code: string): Promise<{ exists: boolean; full: boolean }> {
  const r = await fetch(`/api/room/${encodeURIComponent(code)}`);
  if (r.status === 404) return { exists: false, full: false };
  const j = await r.json();
  return { exists: true, full: !!j.full };
}

// ─── WebSocket ───────────────────────────────────
export function connect(code: string, playerId: string): Promise<Role> {
  disconnect();
  // 頁面是 https 時 ws:// 會被擋成 mixed content，必須跟著切 wss://
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws/${code.toUpperCase()}?playerId=${encodeURIComponent(playerId)}`;

  return new Promise<Role>((resolve, reject) => {
    const sock = new WebSocket(url);
    ws = sock;
    let settled = false;

    sock.onmessage = (ev) => {
      let m: Record<string, unknown>;
      try { m = JSON.parse(String(ev.data)); } catch { return; }   // 壞訊息丟掉，不要炸

      switch (m.type) {
        case 'welcome':
          myRole = m.role as Role;
          peerPresent = (m.peers as number) >= 2;
          if (!settled) { settled = true; resolve(myRole); }
          break;

        case 'peerJoined':
          peerPresent = true;
          lastPeerMsgAt = performance.now();
          emit(EV.NET_PEER, { present: true });
          break;

        case 'peerLeft':
          peerPresent = false;
          emit(EV.NET_LOST, { reason: 'peerLeft' });
          break;

        case 'state':
          latest = m as unknown as WireState;
          lastPeerMsgAt = performance.now();
          emit(EV.NET_STATE, latest);
          break;

        case 'input':
        case 'cast':
        case 'start':
          lastPeerMsgAt = performance.now();
          emit(EV.NET_PEER_MSG, m);       // RemoteOpponent 在聽 input/cast，main 在聽 start
          break;

        // 🔴 ping/pong 也要算「對方還活著」。
        // 大廳裡沒有人送 input/state（遊戲迴圈只在 game 畫面才送），
        // 少了這兩行，兩個人進房 3 秒後就會互相判定對方斷線，開始鍵永遠按不下去。
        case 'ping':
          lastPeerMsgAt = performance.now();
          send({ type: 'pong', t: m.t });
          break;

        case 'pong':
          lastPeerMsgAt = performance.now();
          rtt = performance.now() - (m.t as number);
          break;
      }
    };

    sock.onerror = () => { if (!settled) { settled = true; reject(new Error('連線失敗')); } };
    sock.onclose = (e) => {
      if (!settled) {
        settled = true;
        reject(new Error(closeReason(e.code)));
      } else {
        emit(EV.NET_LOST, { reason: 'closed', code: e.code });
      }
      stopTimers();
    };

    // 量 RTT
    timers.push(setInterval(() => send({ type: 'ping', t: performance.now() }), 2000));

    // 對方 PEER_TIMEOUT_MS 沒消息 → 當作斷了。台上的保命符靠這一條觸發
    timers.push(setInterval(() => {
      if (!peerPresent || lastPeerMsgAt === 0) return;
      if (performance.now() - lastPeerMsgAt > CONFIG.PEER_TIMEOUT_MS) {
        peerPresent = false;
        emit(EV.NET_LOST, { reason: 'timeout' });
      }
    }, 500));
  });
}

function closeReason(code: number): string {
  if (code === 4004) return '找不到這個房間，代碼再確認一次';
  if (code === 4009) return '這個房間已經有兩個人了';
  return '連線中斷';
}

function send(obj: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* 剛斷線，丟掉就好 */ }
  }
}

// ─── 對外送訊息 ──────────────────────────────────
let seq = 0;

/**
 * guest 與 host 都送。15Hz，由 main 的節流迴圈呼叫。
 *
 * 🔴 送的是**意圖**（moveAxis）不是**位置**（x）。
 * 位置是 host 權威模擬的產物 —— guest 畫面上的 x 就是 host 上一幀算給它的。
 * 如果 guest 把那個 x 原封不動送回來，host 算出來的位移永遠是 0，
 * guest 就完全動不了、法陣也不會亮。意圖是本地的，不會繞這一圈。
 */
export function sendInput(moveAxis: number, casting: boolean): void {
  send({ type: 'input', seq: seq++, moveAxis, casting });
}

/** host 按下「開始」時廣播一次，guest 自動進場 —— 不用兩邊各按一次 */
export function sendStart(): void { send({ type: 'start' }); }

/** 事件觸發，不節流 —— 施法漏掉一次比延遲 60ms 嚴重得多 */
export function sendCast(spell: Spell, score: number, durationMs: number): void {
  send({ type: 'cast', spell, score, durationMs });
}

/** host 專用，15Hz 廣播權威狀態 */
export function sendState(s: WireState): void {
  send({ type: 'state', ...s });
}

export function sendRematch(): void { send({ type: 'rematch' }); }

// ─── 查詢 ────────────────────────────────────────
export function getRole(): Role | null { return myRole; }
export function isHost(): boolean { return myRole === 'host'; }
export function getLatestState(): WireState | null { return latest; }
export function getRTT(): number { return rtt; }
export function hasPeer(): boolean { return peerPresent; }
export function isConnected(): boolean { return ws?.readyState === WebSocket.OPEN; }

function stopTimers(): void { timers.forEach(clearInterval); timers = []; }

export function disconnect(): void {
  stopTimers();
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  myRole = null; latest = null; peerPresent = false; lastPeerMsgAt = 0;
}
