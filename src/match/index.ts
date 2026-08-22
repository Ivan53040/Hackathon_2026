/**
 * 對戰核心 + Bot　[擁有者：Bill]
 *
 * ⚠️ 簽名就是契約，不要改。
 * 規格：frontend/PLAN.md §0.5（遮蔽物三條規則）與 §4.3
 *
 * 兩條最容易寫錯的：
 *   1. 命中比對 projectile.toX，不是對手現在的 x —— 這是「閃得掉」的實作
 *   2. C2：從自己的牆後面攻擊要穿過去，不要擋
 */
import { CONFIG } from '../core/config';
import { EV, emit, on } from '../core/bus';
import { getMoveAxis, isCasting } from '../core/input';
import { getLatestState, getRole, sendState } from '../net';
import { createBotOpponent as makeBot, type BotLevel } from './botOpponent';
import {
  IDLE_INTENT, toLocalView,
  type CastEvent, type MatchState, type Mode, type Opponent, type Role, type Spell, type WireState,
} from '../core/types';
import type {
  CoverBuilt, CoverHit, MatchOver, NearMiss, NoMana, Side, SpellFired, SpellHit,
} from './events';

const STEP = 1 / 60;              // 固定步長。不要用 rAF 的 dt 直接算物理

let state: MatchState = freshState();
let mode: Mode = 'solo';
let opponent: Opponent | null = null;
let offCast: (() => void) | null = null;

let acc = 0;
let tick = 0;
let over = false;
let nextId = 1;
let queuedCast: Spell | null = null;   // EV.CAST 隨時會來，排到下一個 step 才結算
let myCastStart = 0;
let wasCasting = false;
let sendAcc = 0;

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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function initMatch(m: Mode, opp: Opponent): void {
  disposeMatch();
  mode = m;
  opponent = opp;
  offCast = on(EV.CAST, (raw) => { queuedCast = (raw as CastEvent).spell; });
  emit(EV.MATCH_START);
}

export function tickMatch(dt: number): MatchState {
  // guest 不模擬，畫面直接吃 host 的權威 state（backend/PLAN.md §5.4）
  if (mode === 'guest') {
    const w = getLatestState();
    if (w) state = toLocalView(w, getRole() ?? 'guest');
    return state;
  }

  acc += Math.min(dt, 0.25);          // 上限：分頁切回來不要一次跑幾百步
  while (acc >= STEP) { step(STEP); acc -= STEP; }

  if (mode === 'host') broadcast(dt);
  return state;
}

function step(dt: number): void {
  if (over) return;
  tick++;

  // ── 時限 ──
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft <= 0) {
    finish(state.me.hp === state.them.hp ? null : state.me.hp > state.them.hp ? 'me' : 'them', 'timeout');
    return;
  }

  // ── 我：走位 + 起手 ──
  // 走位讀鍵盤，不經過 tracking —— webcam 出事切滑鼠模式時走位照樣能動
  state.me.x = clamp01(state.me.x + getMoveAxis() * CONFIG.MOVE_SPEED * dt);

  const casting = isCasting();
  if (casting && !wasCasting) myCastStart = performance.now();
  wasCasting = casting;
  state.me.casting = casting;
  state.me.castProgress = casting
    ? clamp01((performance.now() - myCastStart) / CONFIG.MAX_STROKE_MS)
    : 0;

  // ── 對手：意圖 → 模擬 ──
  const intent = opponent ? (opponent.update(dt, state), opponent.consume()) : IDLE_INTENT;
  state.them.x = clamp01(state.them.x + intent.moveAxis * CONFIG.MOVE_SPEED * dt);
  state.them.casting = intent.casting;
  state.them.castProgress = intent.castProgress;

  // ── 魔量自動回復。血量不回復，見底即死亡 ──
  state.me.mp = Math.min(CONFIG.MP_MAX, state.me.mp + CONFIG.MP_REGEN_PER_S * dt);
  state.them.mp = Math.min(CONFIG.MP_MAX, state.them.mp + CONFIG.MP_REGEN_PER_S * dt);

  // ── 出招 ──
  if (queuedCast) { cast('me', queuedCast); queuedCast = null; }
  if (intent.cast) cast('them', intent.cast);

  // ── 投射物 ──
  advanceProjectiles(dt);

  // ── C3：對手前面有牆 → 看不到他頭頂的血魔量（純顯示，不影響規則）──
  state.canSeeThemStats = !state.covers.some(
    (c) => c.side === 'them' && Math.abs(c.x - state.them.x) < CONFIG.COVER_HIDE_W,
  );
}

// ─── 出招 ────────────────────────────────────────
function cast(side: Side, spell: Spell): void {
  const self = side === 'me' ? state.me : state.them;
  const foe = side === 'me' ? state.them : state.me;
  const need = CONFIG.COST[spell];

  if (self.mp < need) {
    // 只有玩家需要這個回饋。⚠️ 視覺要跟「畫壞了」明顯不同（PLAN.md §6.3）
    if (side === 'me') emit(EV.NO_MANA, { spell, mp: self.mp, need } as NoMana);
    return;
  }
  self.mp -= need;

  if (spell === 'wall') { buildCover(side, self.x); return; }

  // C2：這裡**故意不檢查自己的牆**。
  // 從自己的遮蔽物後方攻擊要穿過去 —— 蓋牆＝同時防守 + 攻擊，這是蓋牆的誘因。
  // 之前的版本把這條寫反，結果兩邊都躲起來、30 秒沒人掉血。不要「修好」它。
  const id = nextId++;
  // 玩家仍然在發射瞬間鎖定目標；敵方只能沿自己所在的 lane 直射。
  // Bot 會先橫移對準玩家，因此保留「看到起手後側移閃避」的玩法，
  // 同時不會再出現從敵人位置斜切到玩家位置的彈道。
  const toX = side === 'them' ? self.x : foe.x;
  state.projectiles.push({ id, owner: side, fromX: self.x, toX, progress: 0 });
  emit(EV.SPELL_FIRED, { owner: side, spell, fromX: self.x, toX, id } as SpellFired);
}

function buildCover(side: Side, x: number): void {
  // 蓋在自己所在的那條線上。
  // ⚠️ config 的 COVER_OFFSET 是「前方多遠」＝深度，給 view/ 用；
  //    橫向要對齊自己，不然 C1 擋不到打向我的攻擊、C3 也藏不住我的數值。
  const id = nextId++;
  state.covers.push({ id, x, hp: CONFIG.COVER_HP, bornAt: performance.now(), side });
  emit(EV.COVER_BUILT, { id, side, x, hp: CONFIG.COVER_HP } as CoverBuilt);

  // C4：超過上限 → 最舊的自動崩解
  const mine = state.covers.filter((c) => c.side === side).sort((a, b) => a.bornAt - b.bornAt);
  while (mine.length > CONFIG.COVER_MAX) {
    const oldest = mine.shift()!;
    state.covers = state.covers.filter((c) => c.id !== oldest.id);
    emit(EV.COVER_HIT, { id: oldest.id, side, x: oldest.x, hpLeft: 0 } as CoverHit);
  }
}

// ─── 命中 ────────────────────────────────────────
function advanceProjectiles(dt: number): void {
  const speed = 1000 / CONFIG.PROJ_MS;          // progress 每秒增加多少
  for (const p of state.projectiles) p.progress += speed * dt;

  const landed = state.projectiles.filter((p) => p.progress >= 1);
  if (!landed.length) return;
  state.projectiles = state.projectiles.filter((p) => p.progress < 1);
  for (const p of landed) resolve(p.owner, p.toX);
}

function resolve(owner: Side, toX: number): void {
  const targetSide: Side = owner === 'me' ? 'them' : 'me';
  const target = targetSide === 'me' ? state.me : state.them;

  // C1：只看**目標那一側**的牆。攻擊者自己的牆從頭到尾不參與判定（＝C2）
  const hits = state.covers
    .filter((c) => c.side === targetSide && Math.abs(c.x - toX) < CONFIG.COVER_BLOCK_W)
    .sort((a, b) => Math.abs(a.x - toX) - Math.abs(b.x - toX));
  const cover = hits[0];
  if (cover) {
    cover.hp -= 1;                              // 撐 COVER_HP 次
    emit(EV.COVER_HIT, { id: cover.id, side: targetSide, x: cover.x, hpLeft: cover.hp } as CoverHit);
    if (cover.hp <= 0) state.covers = state.covers.filter((c) => c.id !== cover.id);
    return;                                     // 攻擊消失，目標不扣血
  }

  // 比對 toX，不是 target.x 現在在哪 —— 側身閃得掉，整個遊戲靠這一行成立
  const missBy = Math.abs(target.x - toX);
  if (missBy >= CONFIG.HIT_WIDTH) {
    emit(EV.NEAR_MISS, { owner, toX, missBy } as NearMiss);
    return;
  }

  target.hp = Math.max(0, target.hp - CONFIG.DMG_ATTACK);
  emit(EV.SPELL_HIT, { target: targetSide, x: toX, dmg: CONFIG.DMG_ATTACK, hpLeft: target.hp } as SpellHit);
  if (target.hp <= 0) finish(owner, 'kill');
}

function finish(winner: Side | null, reason: 'kill' | 'timeout'): void {
  if (over) return;
  over = true;
  state.winner = winner;
  emit(EV.MATCH_OVER, { winner, reason } as MatchOver);
}

// ─── host 廣播（M3 才會真的被用到）────────────────
function broadcast(dt: number): void {
  sendAcc += dt;
  const period = 1 / CONFIG.TICK_HZ;
  if (sendAcc < period) return;
  sendAcc = 0;
  const role = (s: Side): Role => (s === 'me' ? 'host' : 'guest');
  const w: WireState = {
    tick,
    host: state.me,
    guest: state.them,
    covers: state.covers.map(({ side, ...c }) => ({ ...c, owner: role(side) })),
    projectiles: state.projectiles.map(({ owner, ...p }) => ({ ...p, owner: role(owner) })),
    timeLeft: state.timeLeft,
    winner: state.winner === null ? null : role(state.winner),
  };
  sendState(w);
}

export function createBotOpponent(level: BotLevel): Opponent {
  return makeBot(level);
}

export function disposeMatch(): void {
  offCast?.(); offCast = null;
  opponent?.dispose(); opponent = null;
  state = freshState();
  acc = 0; tick = 0; over = false; nextId = 1;
  queuedCast = null; wasCasting = false; sendAcc = 0;
}
