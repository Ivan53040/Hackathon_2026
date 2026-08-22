/**
 * 第一人稱畫面　[擁有者：Wesley]
 *
 * 畫面上沒有你自己，只有對手。
 * 對手承擔全部角色表演，相機承擔全部「我」的感受。
 * 規格：frontend/PLAN.md §4.4 與 §5（動畫）
 */
import type { MatchState, WandFrame } from '../core/types';

export function initView(_canvas: HTMLCanvasElement): void {
  // TODO [Wesley]：Three.js 場景 + 第一人稱相機（FOV 55°）+ 對手色塊
}

export function renderView(_s: MatchState, _f: WandFrame, _dt: number): void {
  // TODO [Wesley]：渲染 + 拖尾 + 投射物朝相機飛 + 遮蔽物 + 頭頂血魔量
}

export function disposeView(): void {}
