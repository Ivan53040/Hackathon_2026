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
let externalFrame: WandFrame = { tip: null, tipConfidence: 0, source: 'pen', t: 0 };

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
    case 'pen':
      next = createPenSource();
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

/** 接收 tracking runtime iframe 持續送出的筆尖座標。 */
export function publishExternalFrame(frame: {
  timestamp?: number;
  tip?: WandFrame['tip'];
  confidence?: number;
  tipConfidence?: number;
}): void {
  externalFrame = {
    tip: frame.tip ?? null,
    tipConfidence: frame.tipConfidence ?? frame.confidence ?? (frame.tip ? 1 : 0),
    source: 'pen',
    t: frame.timestamp ?? performance.now(),
  };
}

export function clearExternalFrame(): void {
  externalFrame = { tip: null, tipConfidence: 0, source: 'pen', t: performance.now() };
}

export function dispose(): void { sourceRequest++; current?.dispose(); current = null; }

function createPenSource(): TipSource {
  return {
    kind: 'pen',
    async start() { /* Camera lifecycle is owned by the tracking runtime. */ },
    read(): WandFrame { return externalFrame; },
    dispose() { clearExternalFrame(); },
  };
}
