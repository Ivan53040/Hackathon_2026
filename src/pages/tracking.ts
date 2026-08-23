import { makeScreen, register, show, currentScreen } from './index';
import { clearExternalFrame, publishExternalFrame } from '../tracking/tracker';
import { hasPeer } from '../net';

export type TrackingFlow = 'singleplayer' | 'multiplayer';

type TrackingPhase = 'align' | 'positioning' | 'runes';
type TrackingMessage = {
  source?: string;
  type?: string;
  frame?: { timestamp?: number; tip?: { x: number; y: number } | null; confidence?: number; tipConfidence?: number };
  phase?: TrackingPhase;
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
let readyOverlay: HTMLElement | null = null;
let readyCount: HTMLElement | null = null;
let readyKicker: HTMLElement | null = null;
let readyTitle: HTMLElement | null = null;
let readyFoot: HTMLElement | null = null;
let readyCountdownTimer: number | null = null;

const READY_COUNTDOWN_MS = 3000;

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
    title!.textContent = 'Calibration complete';
    copy!.textContent = 'Wand linked. Entering the five-spell test arena.';
    update('定位完成，正在進入五技能測試場。');
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
  transitioning = false;
  if (enter) enter.disabled = true;
}

function stopReadyCountdown(hide = true): void {
  if (readyCountdownTimer !== null) window.clearInterval(readyCountdownTimer);
  readyCountdownTimer = null;
  if (hide && readyOverlay) readyOverlay.hidden = true;
}

/**
 * 這一頁在單人與連線兩條流程都會出現，但接下來要發生的事完全不同 ——
 * 單人是進法術練習場，連線是進對戰。原本兩邊都寫「Ready to try your spell」，
 * 連線那邊等於在對手還沒校準完的時候騙玩家說可以開始了。
 */
function applyReadyCopy(): void {
  if (!readyKicker || !readyTitle || !readyFoot) return;
  if (activeFlow === 'singleplayer') {
    readyKicker.textContent = 'CALIBRATION COMPLETE';
    readyTitle.textContent = 'Ready to try your spells?';
    readyFoot.textContent = 'ENTERING SPELL TEST';
    return;
  }
  readyKicker.textContent = hasPeer() ? 'BOTH WANDS LINKED' : 'YOUR WAND IS LINKED';
  readyTitle.textContent = hasPeer() ? 'Your opponent is ready' : 'Waiting for your opponent…';
  readyFoot.textContent = hasPeer() ? 'ENTERING THE DUEL' : 'THEY ARE STILL CALIBRATING';
}

function startReadyCountdown(): void {
  if (readyCountdownTimer !== null || transitioning || !readyOverlay || !readyCount) return;
  applyReadyCopy();
  let endsAt = performance.now() + READY_COUNTDOWN_MS;
  readyOverlay.hidden = false;
  readyCount.textContent = '3';
  readyCountdownTimer = window.setInterval(() => {
    // 連線對戰：對手還沒進房就把終點一直往後推，倒數原地不動。
    // 少了這道閘，兩台各自數完各自的 3 秒，先校準完的那台會直接進場
    // 對著一個還沒到的對手打 —— 畫面上是「Waiting」，行為卻不是。
    if (activeFlow !== 'singleplayer') {
      applyReadyCopy();
      if (!hasPeer()) {
        endsAt = performance.now() + READY_COUNTDOWN_MS;
        readyCount!.textContent = '—';
        readyOverlay!.dataset.waiting = 'true';
        return;
      }
      delete readyOverlay!.dataset.waiting;
    }
    const remaining = endsAt - performance.now();
    if (remaining <= 0) {
      stopReadyCountdown(false);
      readyCount!.textContent = 'GO';
      continueAfterTest(true);
      return;
    }
    readyCount!.textContent = String(Math.ceil(remaining / 1000));
  }, 50);
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
  stopReadyCountdown(false);
  enter!.disabled = true;
  enterTrackingPage(usePen, activeFlow);
}

function retryTracking(): void {
  stopReadyCountdown();
  clearExternalFrame();
  frame?.contentWindow?.postMessage({ source: 'runespire-tracking', type: 'reset' }, location.origin);
  enterTracking(activeFlow);
}

export function buildTracking(root: HTMLElement, onReady: (usePen: boolean, flow: TrackingFlow) => void): void {
  enterTrackingPage = onReady;
  const el = makeScreen(root);
  page = el;
  el.classList.add('tracking-screen');
  el.dataset.phase = 'align';
  el.innerHTML = `
    <iframe class="tracking-frame" title="Wand tracking calibration"></iframe>
    <div class="tracking-vignette" aria-hidden="true"></div>

    <section class="tracking-ready-screen" data-ready-screen hidden aria-live="assertive">
      <p data-ready-kicker>CALIBRATION COMPLETE</p>
      <h1 data-ready-title>Ready to try your spells?</h1>
      <strong data-ready-count>3</strong>
      <small data-ready-foot>ENTERING SPELL TEST</small>
    </section>

    <header class="tracking-header">
      <div class="tracking-brand"><span>R</span><p><b>RUNESPIRE</b><small>WAND ATTUNEMENT</small></p></div>
      <div class="tracking-header-actions">
        <button class="btn tracking-retry" data-retry>Retry</button>
        <button class="btn tracking-mouse" data-mouse>Use mouse mode</button>
      </div>
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
      <button data-enter hidden disabled>Continue</button>
    </section>

    <footer class="tracking-flow" aria-label="Calibration progress">
      <div data-step="align" class="current"><b>01</b><span>ALIGN TIP</span></div>
      <i></i>
      <div data-step="positioning"><b>02</b><span>POSITION TEST</span></div>
      <i></i>
      <div data-step="runes"><b>03</b><span>SPELL TEST</span></div>
    </footer>
  `;
  register('tracking', el);

  frame = el.querySelector<HTMLIFrameElement>('.tracking-frame');
  status = el.querySelector<HTMLElement>('[data-status]');
  title = el.querySelector<HTMLElement>('[data-title]');
  copy = el.querySelector<HTMLElement>('[data-copy]');
  lockLabel = el.querySelector<HTMLElement>('[data-lock]');
  readyOverlay = el.querySelector<HTMLElement>('[data-ready-screen]');
  readyCount = el.querySelector<HTMLElement>('[data-ready-count]');
  readyKicker = el.querySelector<HTMLElement>('[data-ready-kicker]');
  readyTitle = el.querySelector<HTMLElement>('[data-ready-title]');
  readyFoot = el.querySelector<HTMLElement>('[data-ready-foot]');
  enter = el.querySelector<HTMLButtonElement>('[data-enter]');
  const mouse = el.querySelector<HTMLButtonElement>('[data-mouse]')!;
  const retry = el.querySelector<HTMLButtonElement>('[data-retry]')!;

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
      if (message.phase === 'runes') startReadyCountdown();
    }
  };
  addEventListener('message', onMessage);
  el.addEventListener('screen:dispose', () => removeEventListener('message', onMessage), { once: true });

  enter!.addEventListener('click', () => continueAfterTest(true));
  retry.addEventListener('click', retryTracking);
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
  stopReadyCountdown();
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
