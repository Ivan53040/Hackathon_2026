/**
 * RUNESPIRE — 共用契約　[擁有者：E]
 *
 * H+1 全隊逐行唸過，之後不准改。
 * 後端 server/protocol.ts 手動同步，改動必須在群組講一聲。
 * 規格：frontend/PLAN.md §3
 */

export type Role = 'host' | 'guest';
export type Mode = 'solo' | 'host' | 'guest';
export type Spell = 'attack' | 'wall';   // △ 攻擊 · □ 建造

// ─── 追蹤 ──────────────────────────────────────────
export interface Vec2 { x: number; y: number; }

export interface WandFrame {
  /** 筆尖，normalized 0..1，已水平鏡像 */
  tip: Vec2 | null;
  tipConfidence: number;   // 0..1
  source: 'pen' | 'mediapipe' | 'mouse';
  t: number;               // performance.now()
}

// ─── 對戰 ──────────────────────────────────────────
export interface Duelist {
  id: string;
  x: number;             // 0..1，由 A/D 推導
  hp: number;            // 不回復，歸零即敗
  mp: number;            // 自動回復，不夠不能施法
  casting: boolean;
  castProgress: number;  // 0..1，起手光暈半徑用
}

/**
 * 遮蔽物。只蓋在建造者自己那一側。
 *
 * 三條規則，順序不要記錯：
 *   1. 敵方攻擊打到我的牆 → 牆扣一次耐久（撐兩次），我不扣血
 *   2. 我從自己的牆後面攻擊 → **穿過去，不被擋**
 *      ← 這是蓋牆的誘因：同時防守 + 攻擊
 *   3. 敵方前面有牆 → 我看不到他頭頂的血魔量
 */
export interface Cover {
  id: number;
  owner: Role;
  x: number;             // 0..1，在 owner 自己那一側
  hp: number;            // 耐久，起始 COVER_HP（2），歸零消失
  bornAt: number;        // C4 超過上限時最舊的先崩解
}

export interface Projectile {
  id: number;
  owner: Role;
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
  covers: Cover[];
  projectiles: Projectile[];
  timeLeft: number;
  winner: Role | null;
}

// ─── 本地視角：轉換過之後全遊戲只講 me/them ─────────
export interface MatchState {
  me: Duelist;
  them: Duelist;
  covers: (Omit<Cover, 'owner'> & { side: 'me' | 'them' })[];
  projectiles: (Omit<Projectile, 'owner'> & { owner: 'me' | 'them' })[];
  /** 對手前面有沒有牆。false → 他頭頂的血魔量顯示成 ???。純顯示，不影響規則 */
  canSeeThemStats: boolean;
  timeLeft: number;
  winner: 'me' | 'them' | null;
}

/** 網路邊界只做這一次轉換。少了它，guest 端血量會互換、火球會朝自己飛 */
export function toLocalView(s: WireState, myRole: Role): MatchState {
  const other: Role = myRole === 'host' ? 'guest' : 'host';
  const side = (o: Role) => (o === myRole ? 'me' : 'them') as 'me' | 'them';
  const them = s[other];
  return {
    me: s[myRole],
    them,
    covers: s.covers.map(({ owner, ...c }) => ({ ...c, side: side(owner) })),
    projectiles: s.projectiles.map(({ owner, ...p }) => ({ ...p, owner: side(owner) })),
    // 每個 client 自己算，不進 wire —— 兩邊算出來的結果本來就不同
    canSeeThemStats: !s.covers.some((c) => c.owner === other && Math.abs(c.x - them.x) < 0.08),
    timeLeft: s.timeLeft,
    winner: s.winner === null ? null : side(s.winner),
  };
}

// ─── 對手抽象：BotOpponent 與 RemoteOpponent 完全一致 ───
// 這個介面存在的唯一理由：連線爆炸時一行換成 bot，demo 不中斷

/** 對手這一幀想做什麼。注意是「意圖」不是「狀態」—— 狀態由 match/ 模擬出來 */
export interface OpponentIntent {
  moveAxis: number;        // −1 左 / 0 / 1 右
  cast: Spell | null;      // 這一幀要出的招，沒有就是 null
  casting: boolean;        // 正在畫（給起手光暈用）
  castProgress: number;    // 0..1
}

export const IDLE_INTENT: OpponentIntent = {
  moveAxis: 0, cast: null, casting: false, castProgress: 0,
};

export interface Opponent {
  readonly kind: 'bot' | 'remote';
  update(dt: number, view: MatchState): void;
  /** 每幀讀一次。回傳後 cast 會被清掉，不會重複觸發 */
  consume(): OpponentIntent;
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
