/**
 * 符文辨識　[擁有者：Bill]
 *
 * ⚠️ 這是空殼，簽名就是契約。Bill 把內容填進去，不要改簽名。
 * 規格：frontend/PLAN.md §4.2
 */
import { EV, emit } from '../core/bus';
import { isCasting } from '../core/input';
import { getFrame } from '../tracking/tracker';
import type { CastEvent, FizzleEvent, Vec2 } from '../core/types';

let raf = 0;
let wasCasting = false;
let points: Vec2[] = [];

export function initRunes(): void {
  const loop = () => {
    const casting = isCasting();

    if (casting && !wasCasting) {          // Shift 按下
      points = [];
      emit(EV.CAST_BEGIN);
    } else if (casting) {                  // 畫的過程
      const tip = getFrame().tip;
      if (tip && points.length < 200) points.push({ ...tip });
    } else if (!casting && wasCasting) {   // Shift 放開 → 判定
      emit(EV.CAST_END);
      // TODO [Bill]：$1 Recognizer + 角點數前置判斷（3 角 → attack、4 角 → wall）
      //   成功 → emit(EV.CAST, { spell, score, points, templatePoints, durationMs } as CastEvent)
      //   失敗 → emit(EV.FIZZLE, { bestGuess, score, points } as FizzleEvent)
      void ({} as CastEvent); void ({} as FizzleEvent);
      points = [];
    }

    wasCasting = casting;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

/** 給 view/ 畫拖尾用。回傳玩家這一筆正在畫的軌跡 */
export function getStroke(): readonly Vec2[] { return points; }

export function disposeRunes(): void {
  cancelAnimationFrame(raf);
  points = [];
  wasCasting = false;
}
