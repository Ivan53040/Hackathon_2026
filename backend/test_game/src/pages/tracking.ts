import { makeScreen, register, show, currentScreen } from './index';
import { clearExternalFrame, publishExternalFrame } from '../tracking/tracker';

export type TrackingFlow = 'singleplayer' | 'multiplayer';

type Shape = 'z' | 'arc';
type TrackingMessage = {
  source?: string;
  type?: string;
  frame?: { timestamp?: number; tip?: { x: number; y: number } | null; confidence?: number; tipConfidence?: number };
  shape?: Shape;
  confidence?: number;
};

let enterTrackingPage: ((usePen: boolean, flow: TrackingFlow) => void) | null = null;
let activeFlow: TrackingFlow = 'singleplayer';
let armed = false;
let transitioning = false;
let frame: HTMLIFrameElement | null = null;
let status: HTMLElement | null = null;
let enter: HTMLButtonElement | null = null;
let title: HTMLElement | null = null;
let copy: HTMLElement | null = null;
const passed = new Set<Shape>();

// Keep this in sync with the tracking page's small A target (the tip-only cell).
// The iframe reports the tip in normalized camera coordinates.
const TIP_TARGET = { x: 0.825, y: 0.255, width: 0.03, height: 0.055 };
let tipInTarget = false;

function isTipInTarget(tip: { x: number; y: number } | null | undefined): boolean {
  return Boolean(
    tip
      && tip.x >= TIP_TARGET.x
      && tip.x <= TIP_TARGET.x + TIP_TARGET.width
      && tip.y >= TIP_TARGET.y
      && tip.y <= TIP_TARGET.y + TIP_TARGET.height,
  );
}

function resetProgress(): void {
  passed.clear();
  transitioning = false;
  if (enter) enter.disabled = true;
  for (const item of document.querySelectorAll<HTMLElement>('[data-shape]')) {
    item.classList.remove('passed');
    const result = item.querySelector('b');
    if (result) result.textContent = 'WAIT';
  }
}

function update(message: string): void {
  if (status) status.textContent = message;
}

function armWandTest(): void {
  if (currentScreen() !== 'tracking' || armed) return;
  if (!tipInTarget) {
    update('請先把筆尖放到 A 框內，再按 Space 開始測試。');
    return;
  }
  armed = true;
  resetProgress();
  title!.textContent = 'Draw your test runes';
  copy!.textContent = 'Tip captured. Complete the Z and ∧ tests in the tracking window.';
  update('筆尖已抓取，現在開始測試。');
  frame?.contentWindow?.postMessage({ source: 'runespire-tracking', type: 'arm' }, location.origin);
}

function continueAfterTest(usePen: boolean): void {
  if (transitioning || !enterTrackingPage) return;
  transitioning = true;
  enter!.disabled = true;
  enterTrackingPage(usePen, activeFlow);
}

export function buildTracking(root: HTMLElement, onReady: (usePen: boolean, flow: TrackingFlow) => void): void {
  enterTrackingPage = onReady;
  const el = makeScreen(root);
  el.classList.add('tracking-screen');
  el.innerHTML = `
    <iframe class="tracking-frame" title="Wand tracking calibration" src="/tracking/index.html"></iframe>
    <section class="tracking-gate" aria-live="polite">
      <p class="tracking-kicker">RUNESPIRE / WAND CHECK</p>
      <h1 data-title>Pick up your wand</h1>
      <p class="tracking-copy" data-copy>Put the tip inside the highlighted target, then press <b>Space</b> to capture it and begin testing.</p>
      <div class="tracking-progress"><span data-shape="z">Z <b>WAIT</b></span><span data-shape="arc">∧ <b>WAIT</b></span></div>
      <p class="tracking-status" data-status>請先把筆尖放到 A 框內。</p>
      <div class="tracking-actions">
        <button class="btn primary" data-enter disabled>Continue</button>
        <button class="btn" data-mouse>Use mouse mode</button>
      </div>
    </section>
  `;
  register('tracking', el);

  frame = el.querySelector<HTMLIFrameElement>('.tracking-frame');
  status = el.querySelector<HTMLElement>('[data-status]');
  title = el.querySelector<HTMLElement>('[data-title]');
  copy = el.querySelector<HTMLElement>('[data-copy]');
  enter = el.querySelector<HTMLButtonElement>('[data-enter]');
  const mouse = el.querySelector<HTMLButtonElement>('[data-mouse]')!;

  const onMessage = (event: MessageEvent<TrackingMessage>): void => {
    if (event.source !== frame?.contentWindow || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== 'runespire-tracking') return;
    if (message.type === 'frame' && message.frame) {
      publishExternalFrame(message.frame);
      tipInTarget = isTipInTarget(message.frame.tip);
      if (!armed) {
        update(tipInTarget ? '筆尖已在 A 框內，請按 Space 開始測試。' : '請先把筆尖放到 A 框內。');
      }
    }
    if (!armed || message.type !== 'gesture' || (message.shape !== 'z' && message.shape !== 'arc')) return;

    passed.add(message.shape);
    const item = el.querySelector<HTMLElement>(`[data-shape="${message.shape}"]`);
    if (item) {
      item.classList.add('passed');
      item.querySelector('b')!.textContent = `${Math.round((message.confidence ?? 0) * 100)}% PASS`;
    }
    if (passed.size === 2) {
      enter!.disabled = false;
      update('兩個測試都成功，準備進入自由練習。');
      window.setTimeout(() => continueAfterTest(true), 450);
    } else {
      update(`${message.shape === 'arc' ? '∧' : 'Z'} 已辨識，請完成另一個測試。`);
    }
  };
  addEventListener('message', onMessage);
  el.addEventListener('screen:dispose', () => removeEventListener('message', onMessage), { once: true });

  enter!.addEventListener('click', () => continueAfterTest(true));
  mouse.addEventListener('click', () => {
    clearExternalFrame();
    continueAfterTest(false);
  });
  addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || currentScreen() !== 'tracking') return;
    event.preventDefault();
    armWandTest();
  });
}

export function enterTracking(flow: TrackingFlow): void {
  activeFlow = flow;
  armed = false;
  tipInTarget = false;
  resetProgress();
  if (title) title.textContent = 'Pick up your wand';
  if (copy) copy.innerHTML = 'Put the tip inside the highlighted target, then press <b>Space</b> to capture it and begin testing.';
  update('請先把筆尖放到 A 框內。');
  if (frame) frame.src = `/tracking/index.html?session=${Date.now()}`;
  show('tracking');
}
