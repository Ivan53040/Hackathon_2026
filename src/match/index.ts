/**
 * 對戰核心 + Bot　[擁有者：Bill]
 *
 * ⚠️ 這是空殼，簽名就是契約。Bill 把內容填進去，不要改簽名。
 * 規格：frontend/PLAN.md §0.5（遮蔽物三條規則）與 §4.3
 *
 * 兩條最容易寫錯的：
 *   1. 命中比對 projectile.toX，不是對手現在的 x —— 這是「閃得掉」的實作
 *   2. C2：從自己的牆後面攻擊要穿過去，不要擋
 */
import { CONFIG } from '../core/config';
import { IDLE_INTENT, type MatchState, type Mode, type Opponent } from '../core/types';

let state: MatchState = freshState();

function freshState(): MatchState {
  const d = (id: string, x: number) => ({
    id, x, hp: CONFIG.HP_MAX, mp: CONFIG.MP_MAX,
    casting: false, castProgress: 0,
  });
  return {
    me: d('me', 0.5), them: d('them', 0.5),
    covers: [], projectiles: [],
    canSeeThemStats: true,
    timeLeft: CONFIG.MATCH_TIME_S,
    winner: null,
  };
}

export function initMatch(_mode: Mode, _opponent: Opponent): void {
  state = freshState();
  // TODO [Bill]：訂閱 EV.CAST，開始模擬
}

export function tickMatch(_dt: number): MatchState {
  // TODO [Bill]：固定步長模擬 —— 移動 / MP 回復 / 投射物 / 命中 / 遮蔽物 / 勝負
  return state;
}

export function createBotOpponent(
  _level: 'apprentice' | 'warlock' | 'archmage',
): Opponent {
  // TODO [Bill]：三個難度。大法師要會「蓋牆 → 從牆後開火 → 牆破了再蓋」
  return {
    kind: 'bot',
    update() {},
    consume() { return IDLE_INTENT; },
    dispose() {},
  };
}

export function disposeMatch(): void { state = freshState(); }
