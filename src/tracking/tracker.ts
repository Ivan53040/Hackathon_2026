/**
 * 追蹤模組對外唯一入口　[擁有者：Ivan]
 *
 * 其他模組只能碰 setSource() 與 getFrame()。不要 import 底下的 *Source。
 * CV 迴圈 30Hz 與遊戲迴圈 60Hz 分離 —— 遊戲每幀讀最新值，不等 CV。
 */
import type { WandFrame } from '../core/types';
import { createHandSource } from './handSource';
import { createMouseSource } from './mouseSource';

export interface TipSource {
  readonly kind: WandFrame['source'];
  start(video?: HTMLVideoElement): Promise<void>;
  read(): WandFrame;
  dispose(): void;
}

const IDLE: WandFrame = { tip: null, tipConfidence: 0, source: 'mouse', t: 0 };

let current: TipSource | null = null;
let sourceRequest = 0;

export async function setSource(kind: WandFrame['source']): Promise<void> {
  const request = ++sourceRequest;
  current?.dispose();
  current = null;
  let next: TipSource;
  switch (kind) {
    case 'mouse':
      next = createMouseSource();
      break;
    case 'mediapipe':
      next = createHandSource();
      break;
  }
  try {
    await next.start();
    if (request !== sourceRequest) { next.dispose(); return; }
    current = next;
  } catch (error) {
    next.dispose();
    if (request !== sourceRequest) return;
    console.warn('[tracker] webcam unavailable, falling back to mouse', error);
    const fallback = createMouseSource();
    await fallback.start();
    current = fallback;
  }
}

export function getFrame(): WandFrame {
  return current ? current.read() : { ...IDLE, t: performance.now() };
}

export function currentKind(): WandFrame['source'] | null {
  return current?.kind ?? null;
}

export function dispose(): void { sourceRequest++; current?.dispose(); current = null; }
