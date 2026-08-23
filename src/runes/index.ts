/**
 * 符文辨識　[擁有者：Bill]
 *
 * ⚠️ 簽名就是契約，不要改。
 * 規格：frontend/PLAN.md §4.2
 *
 * 這裡只做「切段」與「發事件」：
 *   Shift 按下 → 開始收點 → Shift 放開 → 丟給 recognizer → CAST 或 FIZZLE
 * 魔量夠不夠不歸這裡管，那是 match/ 的事（它會發 EV.NO_MANA）。
 */
import { EV, emit } from '../core/bus';
import { isCasting } from '../core/input';
import { getFrame } from '../tracking/tracker';
import { CONFIG } from '../core/config';
import { recognize } from './recognizer';
import type { CastEvent, FizzleEvent, Vec2 } from '../core/types';

let raf = 0;
let wasCasting = false;
let points: Vec2[] = [];
let startedAt = 0;
/** 這一筆已經判過了。擋住「畫太久自動收筆」之後每幀重複判定 */
let settled = false;

export function initRunes(): void {
  const loop = () => {
    const casting = isCasting();

    if (casting && !wasCasting) {          // Shift 按下
      points = [];
      startedAt = performance.now();
      settled = false;
      emit(EV.CAST_BEGIN);
    } else if (casting && !settled) {      // 畫的過程
      const tip = getFrame().tip;
      if (tip && points.length < 200) {
        // 同一點連續 push 會讓 resample 的路徑長度變 0，直接擋掉
        const last = points[points.length - 1];
        if (!last || Math.hypot(tip.x - last.x, tip.y - last.y) > 1e-4) points.push({ ...tip });
      }
      // 畫太久自動收筆，不然手會酸而且拖尾會塞滿。判完就鎖住，等放開 Shift 才能再畫
      if (performance.now() - startedAt > CONFIG.MAX_STROKE_MS) finish();
    } else if (!casting && wasCasting && !settled) {   // Shift 放開 → 判定
      finish();
    }

    wasCasting = casting;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function finish(): void {
  settled = true;
  emit(EV.CAST_END);
  const stroke = points;
  points = [];
  const durationMs = performance.now() - startedAt;

  const r = recognize(stroke);
  if (!r) {
    // 太短 / 沒動 —— 連猜都不猜，不要給提示（PLAN.md §6.3：不准出現「辨識失敗」）
    emit(EV.FIZZLE, { bestGuess: null, score: 0, points: stroke } as FizzleEvent);
    return;
  }

  const castThreshold = r.spell === 'attack'
    ? CONFIG.CAST_THRESHOLD_ATTACK
    : r.spell === 'rock'
      ? CONFIG.CAST_THRESHOLD_ROCK
      : r.spell === 'spike'
        ? CONFIG.CAST_THRESHOLD_SPIKE
      : r.spell === 'mushroom'
          ? CONFIG.CAST_THRESHOLD_MUSHROOM
          : CONFIG.CAST_THRESHOLD;
  if (r.score >= castThreshold) {
    emit(EV.CAST, {
      spell: r.spell,
      score: r.score,
      points: stroke,
      templatePoints: r.templatePoints,
      durationMs,
    } as CastEvent);
    return;
  }

  // 接近成功門檻時提供最接近的符文提示。
  const bestGuess = r.score >= CONFIG.HINT_THRESHOLD ? r.spell : null;
  emit(EV.FIZZLE, { bestGuess, score: r.score, points: stroke } as FizzleEvent);
}

/** 給 view/ 畫拖尾用。回傳玩家這一筆正在畫的軌跡 */
export function getStroke(): readonly Vec2[] { return points; }

export function disposeRunes(): void {
  cancelAnimationFrame(raf);
  points = [];
  wasCasting = false;
  settled = false;
}
