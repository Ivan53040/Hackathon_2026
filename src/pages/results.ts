/**
 * 結算　[Wesley]
 *
 * Peak-End：體驗由最強的一刻與**結尾**決定。
 * 所以這一頁除了勝負，還要給一個數字 —— 那是玩家會記得的東西。
 */
import { makeScreen, register, show } from './index';

let titleEl: HTMLElement;
let statEl: HTMLElement;

export function buildResults(root: HTMLElement, onAgain: () => void, onHome: () => void): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <h1 data-title>—</h1>
    <p class="sub" data-stat></p>
    <div class="actions">
      <button class="btn primary" data-a="again">再來一場</button>
      <button class="btn" data-a="home">回大廳</button>
    </div>
  `;
  register('results', el);
  titleEl = el.querySelector('[data-title]')!;
  statEl = el.querySelector('[data-stat]')!;
  el.querySelector('[data-a="again"]')!.addEventListener('click', onAgain);
  el.querySelector('[data-a="home"]')!.addEventListener('click', onHome);
}

export function enterResults(win: boolean, casts: number, hits: number): void {
  titleEl.textContent = win ? '勝利' : '敗北';
  const rate = casts > 0 ? Math.round((hits / casts) * 100) : 0;
  statEl.textContent = `施法 ${casts} 次 · 辨識成功率 ${rate}%`;
  show('results');
}
