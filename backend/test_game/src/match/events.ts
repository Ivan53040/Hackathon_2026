/**
 * match/ 發出的事件 payload　[擁有者：Bill]
 *
 * view/ 想要型別安全就 import 這裡；事件名一律用 core/bus 的 EV。
 * 這個檔案不影響 WORKSPLIT §1 的四個簽名，純粹是給 Wesley 少猜一點。
 */
import type { DamageSpell, Spell } from '../core/types';

export type Side = 'me' | 'them';

/** EV.SPELL_FIRED —— 投射物生出來了。fromX 發射點、toX 鎖定的目標線 */
export interface SpellFired { owner: Side; spell: Spell; fromX: number; toX: number; id: number; }

/** EV.SPELL_HIT —— 打中人。x 是命中位置（= toX），拿來放爆散特效 */
export interface SpellHit { target: Side; x: number; dmg: number; hpLeft: number; spell: DamageSpell; }

/** EV.NEAR_MISS —— 打空了。玩家必須知道自己「閃掉了」，這是走位的正回饋 */
export interface NearMiss { owner: Side; toX: number; missBy: number; }

/** EV.COVER_BUILT */
export interface CoverBuilt { id: number; side: Side; x: number; hp: number; }

/** EV.COVER_HIT —— 牆扣耐久。hpLeft 0 代表這一下打碎了 */
export interface CoverHit { id: number; side: Side; x: number; hpLeft: number; }

/** EV.NO_MANA —— 畫對了但沒魔力。⚠️ 視覺必須跟「畫壞了」明顯不同 */
export interface NoMana { spell: Spell; mp: number; need: number; }

/** EV.MATCH_OVER —— winner null = 時限到平手 */
export interface MatchOver { winner: Side | null; reason: 'kill' | 'timeout'; }
