/**
 * RUNESPIRE — 共用契約　[擁有者：E]
 *
 * H+1 全隊逐行唸過，之後不准改。
 * 後端 server/protocol.ts 手動同步，改動必須在群組講一聲。
 * 規格：frontend/PLAN.md §3
 */

export type Role = 'host' | 'guest';
export type Mode = 'solo' | 'host' | 'guest';
export type Spell = 'bolt' | 'heavy';

// ─── 追蹤 ──────────────────────────────────────────
export interface Vec2 { x: number; y: number; }

export interface WandFrame {
  /** 筆尖。已換算成「相對身體」的座標（0..1），不是相對畫面。tracking/ 負責換算 */
  tip: Vec2 | null;
  tipConfidence: number;   // 0..1
  /** 頭部左右位移。−1 = 最左，0 = 正中，1 = 最右。這是唯一的移動輸入 */
  head: number;
  headConfidence: number;  // 0..1
  /** 身體尺度（外眼角距離），用來正規化 tip。玩家坐遠坐近符文都不變形 */
  bodyScale: number;
  source: 'mediapipe' | 'mouse';
  t: number;               // performance.now()
}

// ─── 對戰 ──────────────────────────────────────────
export interface Duelist {
  id: string;
  x: number;             // 0..1，由 head 推導
  hp: number;
  casting: boolean;
  castProgress: number;  // 0..1，起手光暈半徑用
}

export interface Projectile {
  id: number;
  owner: Role;
  spell: Spell;
  fromX: number;
  /**
   * 發射當下鎖定的目標位置。之後不再追蹤對手。
   * 這一行就是「側身閃得掉」的實作，也是整個遊戲成立的原因。
   */
  toX: number;
  progress: number;      // 0..1
}

// ─── wire：永遠用絕對角色 host/guest，不准出現 me/them ───
export interface WireState {
  tick: number;
  host: Duelist;
  guest: Duelist;
  projectiles: Projectile[];
  timeLeft: number;
  winner: Role | null;
}

// ─── 本地視角：轉換過之後全遊戲只講 me/them ─────────
export interface MatchState {
  me: Duelist;
  them: Duelist;
  projectiles: (Omit<Projectile, 'owner'> & { owner: 'me' | 'them' })[];
  timeLeft: number;
  winner: 'me' | 'them' | null;
}

/** 網路邊界只做這一次轉換。少了它，guest 端血量會互換、火球會朝自己飛 */
export function toLocalView(s: WireState, myRole: Role): MatchState {
  const other: Role = myRole === 'host' ? 'guest' : 'host';
  const side = (o: Role) => (o === myRole ? 'me' : 'them') as 'me' | 'them';
  return {
    me: s[myRole],
    them: s[other],
    projectiles: s.projectiles.map(({ owner, ...p }) => ({ ...p, owner: side(owner) })),
    timeLeft: s.timeLeft,
    winner: s.winner === null ? null : side(s.winner),
  };
}

// ─── 對手抽象：BotOpponent 與 RemoteOpponent 完全一致 ───
// 這個介面存在的唯一理由：連線爆炸時一行換成 bot，demo 不中斷
export interface Opponent {
  readonly kind: 'bot' | 'remote';
  update(dt: number, view: MatchState): void;
  dispose(): void;
}

// ─── 符文事件 ──────────────────────────────────────
export interface CastEvent {
  spell: Spell;
  score: number;          // 0..1
  points: Vec2[];         // 玩家實際軌跡，給吸附特效用
  templatePoints: Vec2[]; // 理想形狀
  durationMs: number;
}

export interface FizzleEvent {
  bestGuess: Spell | null;
  score: number;
  points: Vec2[];
}
