/**
 * 追蹤模組對外唯一入口　[擁有者：Ivan]
 *
 * 其他模組只能碰 setSource() 與 getFrame()。不要 import 底下的 *Source。
 * CV 迴圈 30Hz 與遊戲迴圈 60Hz 分離 —— 遊戲每幀讀最新值，不等 CV。
 */
import type { WandFrame } from '../core/types';
import { createMouseSource } from './mouseSource';

export interface TipSource {
  readonly kind: WandFrame['source'];
  start(video?: HTMLVideoElement): Promise<void>;
  read(): WandFrame;
  dispose(): void;
}

const IDLE: WandFrame = {
  tip: null, tipConfidence: 0,
  head: 0, headConfidence: 0,
  bodyScale: 0.25, source: 'mouse', t: 0,
};

let current: TipSource | null = null;

export async function setSource(kind: WandFrame['source']): Promise<void> {
  current?.dispose();
  current = null;
  switch (kind) {
    case 'mouse':
      current = createMouseSource();
      break;
    case 'mediapipe':
      // TODO [Ivan, H+8]：handSource + faceSource + 融合，見 frontend/PLAN.md §4.1
      console.warn('[tracker] mediapipe 尚未實作，退回 mouse');
      current = createMouseSource();
      break;
  }
  await current.start();
}

export function getFrame(): WandFrame {
  return current ? current.read() : { ...IDLE, t: performance.now() };
}

export function currentKind(): WandFrame['source'] | null {
  return current?.kind ?? null;
}

export function dispose(): void { current?.dispose(); current = null; }
