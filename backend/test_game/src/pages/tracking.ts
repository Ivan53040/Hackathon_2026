import { makeScreen, register, show } from './index';
import { clearExternalFrame, publishExternalFrame } from '../tracking/tracker';

type Shape = 'z' | 'arc';
type TrackingMessage = {
  source?: string;
  type?: string;
  frame?: { timestamp?: number; tip?: { x: number; y: number } | null; confidence?: number; tipConfidence?: number };
  shape?: Shape;
  confidence?: number;
};

export function buildTracking(root: HTMLElement, onEnter: (usePen: boolean) => void): void {
  const el = makeScreen(root);
  el.classList.add('tracking-screen');
  el.innerHTML = `
    <iframe class="tracking-frame" title="Wand tracking calibration" src="/tracking/index.html"></iframe>
    <section class="tracking-gate" aria-live="polite">
      <p class="tracking-kicker">RUNESPIRE / TRACKING GATE</p>
      <h1>Calibrate your wand</h1>
      <p class="tracking-copy">先完成背景與筆尖校準，再各畫一次 Z 和 arc。Z 會施放攻擊，arc 會建立防禦。</p>
      <div class="tracking-progress"><span data-shape="z">Z <b>WAIT</b></span><span data-shape="arc">ARC <b>WAIT</b></span></div>
      <p class="tracking-status" data-status>正在等待追蹤器啟動…</p>
      <div class="tracking-actions">
        <button class="btn primary" data-enter disabled>進入遊戲</button>
        <button class="btn" data-mouse>使用滑鼠模式測試</button>
      </div>
    </section>
  `;
  register('tracking', el);

  const frame = el.querySelector<HTMLIFrameElement>('.tracking-frame')!;
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const enter = el.querySelector<HTMLButtonElement>('[data-enter]')!;
  const mouse = el.querySelector<HTMLButtonElement>('[data-mouse]')!;
  const passed = new Set<Shape>();

  const update = (message: string): void => { status.textContent = message; };
  const onMessage = (event: MessageEvent<TrackingMessage>): void => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== 'runespire-tracking') return;
    if (message.type === 'ready') update('追蹤器已啟動，請依照右側畫面完成校準。');
    if (message.type === 'frame' && message.frame) publishExternalFrame(message.frame);
    if (message.type === 'gesture' && (message.shape === 'z' || message.shape === 'arc')) {
      passed.add(message.shape);
      const item = el.querySelector<HTMLElement>(`[data-shape="${message.shape}"]`);
      if (item) { item.classList.add('passed'); item.querySelector('b')!.textContent = `${Math.round((message.confidence ?? 0) * 100)}% PASS`; }
      if (passed.size === 2) {
        enter.disabled = false;
        update('Z 與 arc 都已通過，可以進入遊戲。');
      } else update(`${message.shape.toUpperCase()} 已辨識，請再完成另一個手勢。`);
    }
  };
  addEventListener('message', onMessage);
  el.addEventListener('screen:dispose', () => removeEventListener('message', onMessage), { once: true });

  enter.addEventListener('click', () => onEnter(true));
  mouse.addEventListener('click', () => {
    clearExternalFrame();
    onEnter(false);
  });
}

export function enterTracking(): void { show('tracking'); }
