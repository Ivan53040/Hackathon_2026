/**
 * 被動 bot：只在場地上慢慢左右巡邏，不會施法、蓋牆或閃避。
 *
 * 這個版本是 tracking / gesture 測試用，讓玩家可以專心測試 Z 與 arc
 * 的辨識，不會被敵方投射物打斷。
 */
import { IDLE_INTENT, type MatchState, type Opponent, type OpponentIntent } from '../core/types';

export type BotLevel = 'apprentice' | 'warlock' | 'archmage';

// Match 用 MOVE_SPEED 乘上這個軸值；小於 1 讓巡邏速度明顯慢於玩家。
const WALK_AXIS = 0.22;
const TURN_LEFT_EDGE = 0.08;
const TURN_RIGHT_EDGE = 0.92;

export function createBotOpponent(_level: BotLevel): Opponent {
  let moveAxis = WALK_AXIS;
  let direction = 1;

  return {
    kind: 'bot',

    update(_dt: number, view: MatchState): void {
      const x = view.them.x;
      if (x <= TURN_LEFT_EDGE) direction = 1;
      if (x >= TURN_RIGHT_EDGE) direction = -1;
      moveAxis = direction * WALK_AXIS;
    },

    consume(): OpponentIntent {
      return { ...IDLE_INTENT, moveAxis };
    },

    dispose(): void {
      moveAxis = 0;
      direction = 1;
    },
  };
}
