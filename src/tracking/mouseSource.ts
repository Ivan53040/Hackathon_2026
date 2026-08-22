/**
 * 滑鼠來源　[擁有者：Ivan]
 *
 * H+2 的交付物，四個人在等這個。也是台上的保命符（M 鍵切過來）。
 *   滑鼠 x  → head（側身閃避）
 *   滑鼠位置 → tip（畫符文）
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
      return {
        tip: { x, y },
        tipConfidence: 1,
        head: (x - 0.5) * 2,   // −1..1
        headConfidence: 1,
        bodyScale: 0.25,       // 假值，滑鼠模式不需要正規化
        source: 'mouse',
        t: performance.now(),
      };
    },
    dispose() { window.removeEventListener('mousemove', onMove); },
  };
}
