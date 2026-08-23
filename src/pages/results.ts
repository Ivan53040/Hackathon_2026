/**
 * 結算　[Wesley]
 *
 * Peak-End：體驗由最強的一刻與**結尾**決定。
 * 所以這一頁除了勝負，還要給一個數字 —— 那是玩家會記得的東西。
 */
import { makeScreen, register, show } from './index';

let titleEl: HTMLElement;
let statEl: HTMLElement;
let scoreEl: HTMLElement;
let myHpEl: HTMLElement;
let theirHpEl: HTMLElement;
let foeEl: HTMLElement;

export function buildResults(root: HTMLElement, onAgain: () => void, onHome: () => void): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <h1 data-title>—</h1>
    <div class="scoreline">
      <div data-side="me"><b>YOU</b><span data-my-hp>—</span></div>
      <i>vs</i>
      <div data-side="them"><b data-foe>OPPONENT</b><span data-their-hp>—</span></div>
    </div>
    <p class="sub" data-stat></p>
    <div class="actions">
      <button class="btn primary" data-a="again">Duel again</button>
      <button class="btn" data-a="home">Back to menu</button>
    </div>
  `;
  register('results', el);
  titleEl = el.querySelector('[data-title]')!;
  statEl = el.querySelector('[data-stat]')!;
  scoreEl = el.querySelector('.scoreline')!;
  myHpEl = el.querySelector('[data-my-hp]')!;
  theirHpEl = el.querySelector('[data-their-hp]')!;
  foeEl = el.querySelector('[data-foe]')!;
  el.querySelector('[data-a="again"]')!.addEventListener('click', onAgain);
  el.querySelector('[data-a="home"]')!.addEventListener('click', onHome);
}

export interface ResultsView {
  /** null = 雙方同血的平手，不能硬塞成 DEFEAT */
  winner: 'me' | 'them' | null;
  reason: 'kill' | 'timeout';
  myHp: number;
  theirHp: number;
  casts: number;
  hits: number;
  /** solo 時對手叫 BOT，連線對戰才叫 OPPONENT */
  soloOpponent: boolean;
}

export function enterResults(v: ResultsView): void {
  titleEl.textContent = v.winner === null ? 'DRAW' : v.winner === 'me' ? 'VICTORY' : 'DEFEAT';
  // 勝負色跟著遊戲裡的識別色：我方暖金、敵方冷藍
  scoreEl.dataset.outcome = v.winner ?? 'draw';
  foeEl.textContent = v.soloOpponent ? 'BOT' : 'OPPONENT';
  myHpEl.textContent = `${v.myHp} HP`;
  theirHpEl.textContent = `${v.theirHp} HP`;
  const rate = v.casts > 0 ? Math.round((v.hits / v.casts) * 100) : 0;
  const how = v.reason === 'timeout' ? 'Time up' : v.winner === 'me' ? 'Opponent down' : 'You went down';
  statEl.textContent = `${how} · ${v.casts} casts · ${rate}% recognised`;
  show('results');
}
