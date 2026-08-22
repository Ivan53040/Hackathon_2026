/**
 * 滑鼠來源　[擁有者：Ivan]
 *
 * 台上的保命符：webcam 出事就按 M 切過來，遊戲照樣能玩。
 * 滑鼠位置 → tip（畫符文）。走位不歸這裡管，那是 core/input.ts 的 A/D。
 */
import type { WandFrame } from '../core/types';
import type { TipSource } from './tracker';

export function createMouseSource(): TipSource {
  let x = 0.5, y = 0.5;
  const onMove = (e: MouseEvent) => {
    x = e.clientX / window.innerWidth;
    y = e.clientY / window.innerHeight;
  };

  return {
    kind: 'mouse',
    async start() { window.addEventListener('mousemove', onMove); },
    read(): WandFrame {
      return { tip: { x, y }, tipConfidence: 1, source: 'mouse', t: performance.now() };
    },
    dispose() { window.removeEventListener('mousemove', onMove); },
  };
}
