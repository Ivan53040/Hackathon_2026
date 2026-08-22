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
import { EV, on } from '../core/bus';
import { IDLE_INTENT, type MatchState, type Opponent, type OpponentIntent, type Spell } from '../core/types';
import { isHost } from './socket';

interface PeerMsg { type: string; x?: number; casting?: boolean; castProgress?: number; spell?: Spell; }

export function createRemoteOpponent(): Opponent {
  let lastX: number | null = null;
  let prevX: number | null = null;
  let casting = false;
  let castProgress = 0;
  let pendingCast: Spell | null = null;

  const offMsg = on(EV.NET_PEER_MSG, (raw) => {
    const m = raw as PeerMsg;
    if (m.type === 'input') {
      prevX = lastX;
      lastX = typeof m.x === 'number' ? m.x : lastX;
      casting = !!m.casting;
      castProgress = m.castProgress ?? 0;
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

      // host 端：從對方兩次 input 的位移反推他在往哪邊走。
      // 用位移而不是直接吃他的 x，是因為位置由 host 權威模擬 ——
      // 直接吃 x 會讓遠端玩家可以瞬移，也會讓 15Hz 的抖動變成畫面抖動。
      let moveAxis = 0;
      if (lastX !== null && prevX !== null) {
        const d = lastX - prevX;
        if (Math.abs(d) > 0.001) moveAxis = Math.sign(d);
      }

      const cast = pendingCast;
      pendingCast = null;                 // 拿走就清掉，不會重複觸發

      return { moveAxis, cast, casting, castProgress };
    },

    dispose(): void {
      offMsg();
      lastX = prevX = null;
      pendingCast = null;
      casting = false;
      castProgress = 0;
    },
  };
}
