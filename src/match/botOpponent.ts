/**
 * Bot 對手　[擁有者：Bill]
 *
 * ⚠️ 視角陷阱：`update(dt, view)` 收到的是**玩家的** MatchState。
 *    所以 `view.them` 才是我自己，`view.me` 是敵人（玩家），
 *    `p.owner === 'me'` 的投射物是朝我飛過來的。
 *
 * 這裡只回傳「意圖」，血量、位置、命中全部由 match/index.ts 模擬。
 * 跟 RemoteOpponent 同介面 —— 連線爆炸時一行對調。
 */
import { CONFIG } from '../core/config';
import { IDLE_INTENT, type MatchState, type Opponent, type OpponentIntent, type Spell } from '../core/types';

export type BotLevel = 'apprentice' | 'warlock' | 'archmage';

/**
 * 起手時間。借用 PROJ_MS（0.8s）—— 跟人畫一個符文的時間差不多。
 * ⚠️ 這是我借的，不是設計定的。要獨立調整請人類在 config.ts 加一個 BOT_CHARGE_MS。
 */
const CHARGE_MS = CONFIG.PROJ_MS;

export function createBotOpponent(level: BotLevel): Opponent {
  const reactMs = CONFIG.BOT_REACT_MS[level];
  const canWall = level !== 'apprentice';       // 學徒不蓋牆、不閃避
  const canDodge = level !== 'apprentice';

  let moveAxis = 0;
  let charging: Spell | null = null;
  let chargeMs = 0;
  let pending: Spell | null = null;
  /** 這一發投射物已經被我看到多久了（reaction delay 用） */
  const seen = new Map<number, number>();

  function decideNext(view: MatchState): Spell | null {
    const me = view.them;                        // ← 我自己
    const myCovers = view.covers.filter((c) => c.side === 'them');

    // 我站的這條線上有沒有牆？沒有的話先蓋 —— 蓋完照樣能開火（C2），所以蓋牆沒壞處。
    // 已經被自己的牆罩住就不要再蓋，不然兩面牆疊在同一條線上，純浪費魔量。
    const covered = myCovers.some((c) => Math.abs(c.x - me.x) < CONFIG.COVER_BLOCK_W);
    if (canWall && !covered && myCovers.length < CONFIG.COVER_MAX && me.mp >= CONFIG.COST.wall) {
      // 大法師一定先蓋牆再打；術士只在完全沒牆時才蓋
      if (level === 'archmage' || myCovers.length === 0) return 'wall';
    }
    if (me.mp >= CONFIG.COST.attack) return 'attack';
    return null;
  }

  return {
    kind: 'bot',

    update(dt: number, view: MatchState): void {
      const me = view.them;
      const dtMs = dt * 1000;

      // ── 閃避：只有「飛行中且鎖定我這條線」的投射物才需要閃 ──
      // toX 是發射當下鎖定的，所以躲的時機是「彈在空中」，不是「對方在畫」
      moveAxis = 0;
      if (canDodge) {
        let threat: { toX: number } | null = null;
        for (const p of view.projectiles) {
          if (p.owner !== 'me') continue;                       // 只有玩家打過來的才是威脅
          const age = (seen.get(p.id) ?? 0) + dtMs;
          seen.set(p.id, age);
          if (age < reactMs) continue;                          // 還沒反應過來
          if (Math.abs(p.toX - me.x) < CONFIG.HIT_WIDTH) threat = p;
        }
        // 走掉的彈清掉，不然 Map 會一直長
        for (const id of seen.keys()) if (!view.projectiles.some((p) => p.id === id)) seen.delete(id);

        if (threat) {
          const away = Math.sign(me.x - threat.toX) || 1;
          // 貼到邊了就往反方向鑽，不要卡在牆角被打
          moveAxis = (me.x <= 0.02 && away < 0) || (me.x >= 0.98 && away > 0) ? -away : away;
        }
      }

      // ── 起手 → 出招 ──
      if (charging) {
        chargeMs += dtMs;
        if (chargeMs >= CHARGE_MS) { pending = charging; charging = null; chargeMs = 0; }
      } else if (!pending) {
        charging = decideNext(view);
        chargeMs = 0;
      }
    },

    consume(): OpponentIntent {
      const cast = pending;
      pending = null;                              // 拿走就清掉，不會重複觸發
      if (!charging && !cast) return { ...IDLE_INTENT, moveAxis };
      return {
        moveAxis,
        cast,
        casting: charging !== null,                // ← 玩家唯一的預警：對手舉杖
        castProgress: charging ? Math.min(1, chargeMs / CHARGE_MS) : 0,
      };
    },

    dispose(): void {
      charging = null; pending = null; moveAxis = 0; chargeMs = 0;
      seen.clear();
    },
  };
}
