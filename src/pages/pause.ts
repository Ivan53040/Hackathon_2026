/**
 * 對局中的選單　[Wesley]
 *
 * 進了對局之前完全沒有退出路徑 —— 只能等 90 秒結束或重新整理。
 * `02-journey-ia.md` 早就要求「返回路徑必須存在」，這是補那一項。
 *
 * ⚠️ ESC **不直接退出**。三個理由：
 *   1. ESC 也是瀏覽器離開全螢幕的鍵，demo 時誤按會把 judge 踢出對局
 *   2. 連線對戰中離開等於丟下對手
 *   3. 遊戲慣例就是 ESC 開選單，不是 ESC 投降
 *
 * 這一層不走 pages/index.ts 的 show()，因為它要**疊在對局上面**而不是取代它。
 */
import { show } from './index';

type Handlers = { onLeave: () => void };

let el: HTMLElement | null = null;
let open = false;
let lastFocus: HTMLElement | null = null;

export function buildPause(root: HTMLElement, h: Handlers): void {
  if (el) return;
  el = document.createElement('div');
  el.className = 'pause';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Match menu');
  el.innerHTML = `
    <div class="pause-card">
      <h2>Paused</h2>
      <p class="pause-note" data-note></p>
      <div class="actions">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="leave">Leave match</button>
      </div>
      <p class="note">Esc to resume</p>
    </div>
  `;
  root.appendChild(el);

  el.querySelector('[data-a="resume"]')!.addEventListener('click', closePause);
  el.querySelector('[data-a="leave"]')!.addEventListener('click', () => {
    closePause();
    h.onLeave();
    show('landing');
  });
}

/**
 * @param paused solo 時世界真的停住；連線對戰停不了，要講出來，
 *               否則玩家會邊看選單邊被打而不知道為什麼。
 */
export function openPause(paused: boolean): void {
  if (!el || open) return;
  open = true;
  lastFocus = document.activeElement as HTMLElement | null;
  el.querySelector<HTMLElement>('[data-note]')!.textContent = paused
    ? 'The duel is frozen while this is open.'
    : 'The duel keeps running — your opponent is still moving.';
  el.hidden = false;
  el.querySelector<HTMLButtonElement>('[data-a="resume"]')!.focus();
}

export function closePause(): void {
  if (!el || !open) return;
  open = false;
  el.hidden = true;
  lastFocus?.focus();          // 焦點還給原本的地方，鍵盤使用者才不會迷路
  lastFocus = null;
}

export function isPaused(): boolean { return open; }

export function disposePause(): void {
  el?.remove();
  el = null;
  open = false;
  lastFocus = null;
}
