/**
 * 遠端對手　[擁有者：你]
 *
 * 跟 BotOpponent 實作完全相同的 Opponent 介面 ——
 * 這個介面存在的唯一理由就是：連線爆炸時一行對調，比賽不中斷。
 *
 *   const opponent = mode === 'solo' ? createBotOpponent('warlock')
 *                                    : createRemoteOpponent();
 *
 * ⚠️ 它只負責「對手這一幀想做什麼」，不負責對手的血量與位置 ——
 *    那些由 match/ 依 mode 決定：
 *      host  → 自己模擬（用這裡回傳的 intent）
 *      guest → 直接吃 socket.getLatestState()，不模擬
 */
import { CONFIG } from '../core/config';
import { EV, on } from '../core/bus';
import { IDLE_INTENT, type MatchState, type Opponent, type OpponentIntent, type Spell } from '../core/types';
import { isHost } from './socket';

interface PeerMsg { type: string; moveAxis?: number; casting?: boolean; spell?: Spell; }

export function createRemoteOpponent(): Opponent {
  let moveAxis = 0;
  let casting = false;
  let castStartedAt = 0;
  let pendingCast: Spell | null = null;

  const offMsg = on(EV.NET_PEER_MSG, (raw) => {
    const m = raw as PeerMsg;
    if (m.type === 'input') {
      // 直接吃對方的走位意圖 —— 不再從兩次 x 反推位移（那條路會被 host 的權威 x 打死循環）
      moveAxis = typeof m.moveAxis === 'number' ? Math.sign(m.moveAxis) : 0;
      const nowCasting = !!m.casting;
      if (nowCasting && !casting) castStartedAt = performance.now();   // 起手的那一刻
      casting = nowCasting;
    } else if (m.type === 'cast' && m.spell) {
      // 施法事件不能漏，所以先存起來，等 match/ 這一幀來拿
      pendingCast = m.spell;
    }
  });

  return {
    kind: 'remote',

    update(_dt: number, _view: MatchState): void {
      // 遠端對手不需要「思考」，它的意圖是從網路來的。
      // 這個方法留空是對的 —— 保持跟 BotOpponent 同介面，才能一行對調。
    },

    consume(): OpponentIntent {
      // guest 端不模擬對手，畫面吃 host 的 state，所以回傳中性意圖就好
      if (!isHost()) return IDLE_INTENT;

      const cast = pendingCast;
      pendingCast = null;                 // 拿走就清掉，不會重複觸發

      // 起手光暈的進度由 host 自己算 —— 不放進 wire，少一個欄位少一個不同步的來源。
      // 公式跟 match/index.ts 的 me.castProgress 一致（elapsed / MAX_STROKE_MS）。
      const castProgress = casting
        ? Math.min(1, (performance.now() - castStartedAt) / CONFIG.MAX_STROKE_MS)
        : 0;

      return { moveAxis, cast, casting, castProgress };
    },

    dispose(): void {
      offMsg();
      moveAxis = 0;
      pendingCast = null;
      casting = false;
      castStartedAt = 0;
    },
  };
}
