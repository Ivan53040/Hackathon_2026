/**
 * 頁面路由　[Wesley]
 * Landing → 大廳 → 對戰 → 結算。就四個畫面，不用 router library。
 */
import '../ui/screens.css';

export type Screen = 'landing' | 'singleplayer' | 'lobby' | 'tracking' | 'practice' | 'game' | 'results';

const nodes = new Map<Screen, HTMLElement>();
let current: Screen = 'landing';

export function register(name: Screen, el: HTMLElement): void {
  el.hidden = true;
  el.inert = true;
  nodes.set(name, el);
}

export function show(name: Screen): void {
  current = name;
  for (const [k, el] of nodes) {
    const inactive = k !== name;
    el.hidden = inactive;
    el.inert = inactive;
    if (k === 'tracking') {
      const trackingFrame = el.querySelector<HTMLIFrameElement>('iframe');
      if (trackingFrame) {
        trackingFrame.inert = inactive;
        trackingFrame.tabIndex = inactive ? -1 : 0;
        trackingFrame.setAttribute('aria-hidden', String(inactive));
      }
    }
  }
}

export function currentScreen(): Screen { return current; }

/** 建一個 .screen 容器並掛上去 */
export function makeScreen(root: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen';
  root.appendChild(el);
  return el;
}
