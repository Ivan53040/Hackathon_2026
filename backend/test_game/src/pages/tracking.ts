import { makeScreen, register, show, currentScreen } from './index';
import { clearExternalFrame, publishExternalFrame } from '../tracking/tracker';

export type TrackingFlow = 'singleplayer' | 'multiplayer';

type Shape = 'z' | 'arc';
type TrackingPhase = 'align' | 'positioning' | 'runes';
type TrackingMessage = {
  source?: string;
  type?: string;
  frame?: { timestamp?: number; tip?: { x: number; y: number } | null; confidence?: number; tipConfidence?: number };
  phase?: TrackingPhase;
  shape?: Shape;
  confidence?: number;
};

let enterTrackingPage: ((usePen: boolean, flow: TrackingFlow) => void) | null = null;
let activeFlow: TrackingFlow = 'singleplayer';
let armed = false;
let transitioning = false;
let tipInTarget = false;
let frame: HTMLIFrameElement | null = null;
let page: HTMLElement | null = null;
let status: HTMLElement | null = null;
let enter: HTMLButtonElement | null = null;
let title: HTMLElement | null = null;
let copy: HTMLElement | null = null;
let lockLabel: HTMLElement | null = null;
const passed = new Set<Shape>();

// Matches the tracking page's small A / tip-only cell in normalized camera coordinates.
const TIP_TARGET = { x: 0.825, y: 0.255, width: 0.03, height: 0.055 };

function isTipInTarget(tip: { x: number; y: number } | null | undefined): boolean {
  return Boolean(
    tip
      && tip.x >= TIP_TARGET.x
      && tip.x <= TIP_TARGET.x + TIP_TARGET.width
      && tip.y >= TIP_TARGET.y
      && tip.y <= TIP_TARGET.y + TIP_TARGET.height,
  );
}

function update(message: string): void {
  if (status) status.textContent = message;
}

function setPhase(phase: TrackingPhase): void {
  if (!page) return;
  page.dataset.phase = phase;
  const order: TrackingPhase[] = ['align', 'positioning', 'runes'];
  const activeIndex = order.indexOf(phase);
  for (const item of page.querySelectorAll<HTMLElement>('[data-step]')) {
    const index = order.indexOf(item.dataset.step as TrackingPhase);
    item.classList.toggle('current', index === activeIndex);
    item.classList.toggle('passed', index < activeIndex);
  }

  if (phase === 'positioning') {
    title!.textContent = 'Wand positioning';
    copy!.textContent = 'Follow the glowing movement prompts. Keep the wand tip visible inside the test area.';
    update('定位測試已開始，請跟隨畫面指示移動筆尖。');
  } else if (phase === 'runes') {
    title!.textContent = 'Rune check';
    copy!.textContent = 'Hold Shift, draw Z and ∧, then release Shift to submit each rune.';
    update('定位完成。請畫出 Z 和 ∧ 完成最後測試。');
  }
}

function setTipReady(ready: boolean): void {
  tipInTarget = ready;
  page?.classList.toggle('tip-ready', ready && !armed);
  if (lockLabel) lockLabel.textContent = armed ? 'LOCKED' : ready ? 'LIGHT FOUND' : 'SEARCHING';
  if (!armed) {
    update(ready ? '已看到筆尖光點。請按 Spacebar 開始定位測試。' : '請將筆尖放進 A 框，等待光點出現。');
  }
}

function resetProgress(): void {
  passed.clear();
  transitioning = false;
  if (enter) enter.disabled = true;
  for (const item of page?.querySelectorAll<HTMLElement>('[data-shape]') ?? []) {
    item.classList.remove('passed');
    const result = item.querySelector('b');
    if (result) result.textContent = 'WAIT';
  }
}

function armWandTest(): void {
  if (currentScreen() !== 'tracking' || armed) return;
  if (!tipInTarget) {
    update('未偵測到 A 框內的光點，請對準後再按 Spacebar。');
    page?.classList.add('space-rejected');
    window.setTimeout(() => page?.classList.remove('space-rejected'), 320);
    return;
  }

  armed = true;
  page?.classList.remove('tip-ready');
  page?.classList.add('test-armed');
  if (lockLabel) lockLabel.textContent = 'LOCKED';
  resetProgress();
  setPhase('positioning');
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
  page = el;
  el.classList.add('tracking-screen');
  el.dataset.phase = 'align';
  el.innerHTML = `
    <iframe class="tracking-frame" title="Wand tracking calibration" src="/tracking/index.html"></iframe>
    <div class="tracking-vignette" aria-hidden="true"></div>

    <header class="tracking-header">
      <div class="tracking-brand"><span>R</span><p><b>RUNESPIRE</b><small>WAND ATTUNEMENT</small></p></div>
      <button class="btn tracking-mouse" data-mouse>Use mouse mode</button>
    </header>

    <section class="tracking-intro">
      <p class="tracking-kicker">CALIBRATION / WAND LINK</p>
      <h1 data-title>Pick up your wand</h1>
      <p class="tracking-copy" data-copy>Place the coloured tip inside frame A. Wait for the light point, then press Spacebar.</p>
    </section>

    <section class="tracking-console" aria-live="polite">
      <div class="tracking-signal">
        <span class="tracking-orb" aria-hidden="true"><i></i></span>
        <p><small>TIP SIGNAL</small><b data-lock>SEARCHING</b></p>
      </div>
      <p class="tracking-status" data-status>請將筆尖放進 A 框，等待光點出現。</p>
      <div class="tracking-space-prompt"><kbd>SPACEBAR</kbd><span>START POSITION TEST</span></div>
      <div class="tracking-runes" aria-label="Rune test progress">
        <span data-shape="z">Z <b>WAIT</b></span>
        <span data-shape="arc">∧ <b>WAIT</b></span>
      </div>
      <button data-enter hidden disabled>Continue</button>
    </section>

    <footer class="tracking-flow" aria-label="Calibration progress">
      <div data-step="align" class="current"><b>01</b><span>ALIGN TIP</span></div>
      <i></i>
      <div data-step="positioning"><b>02</b><span>POSITION TEST</span></div>
      <i></i>
      <div data-step="runes"><b>03</b><span>RUNE CHECK</span></div>
    </footer>
  `;
  register('tracking', el);

  frame = el.querySelector<HTMLIFrameElement>('.tracking-frame');
  status = el.querySelector<HTMLElement>('[data-status]');
  title = el.querySelector<HTMLElement>('[data-title]');
  copy = el.querySelector<HTMLElement>('[data-copy]');
  lockLabel = el.querySelector<HTMLElement>('[data-lock]');
  enter = el.querySelector<HTMLButtonElement>('[data-enter]');
  const mouse = el.querySelector<HTMLButtonElement>('[data-mouse]')!;

  const onMessage = (event: MessageEvent<TrackingMessage>): void => {
    if (event.source !== frame?.contentWindow || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== 'runespire-tracking') return;

    if (message.type === 'frame' && message.frame) {
      publishExternalFrame(message.frame);
      if (!armed) setTipReady(isTipInTarget(message.frame.tip));
    }
    if (message.type === 'space') armWandTest();
    if (armed && message.type === 'phase' && (message.phase === 'positioning' || message.phase === 'runes')) {
      setPhase(message.phase);
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
      update('測試完成，正在進入自由練習。');
      window.setTimeout(() => continueAfterTest(true), 450);
    } else {
      update(`${message.shape === 'arc' ? '∧' : 'Z'} 已辨識，請完成另一個符文。`);
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
  page?.classList.remove('tip-ready', 'test-armed', 'space-rejected');
  setPhase('align');
  if (title) title.textContent = 'Pick up your wand';
  if (copy) copy.textContent = 'Place the coloured tip inside frame A. Wait for the light point, then press Spacebar.';
  if (lockLabel) lockLabel.textContent = 'SEARCHING';
  update('請將筆尖放進 A 框，等待光點出現。');
  if (frame) frame.src = `/tracking/index.html?session=${Date.now()}`;
  show('tracking');
}
