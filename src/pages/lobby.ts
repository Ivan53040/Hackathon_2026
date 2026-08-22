/**
 * 大廳　[Wesley]
 *
 * 這一頁玩家只有一件事要做：把房間代碼唸給旁邊的人聽。
 * 所以代碼要**大**，其他全部收掉。
 */
import { makeScreen, register, show } from './index';
import { EV, on } from '../core/bus';
import { hasPeer } from '../net';

let codeEl: HTMLElement;
let statusEl: HTMLElement;
let startBtn: HTMLButtonElement;
let poll = 0;

export function buildLobby(root: HTMLElement, onStart: () => void, onBot: () => void): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <p class="sub">房間代碼</p>
    <div class="code" data-code>----</div>
    <p class="err" data-status>等待對手加入…</p>
    <div class="actions">
      <button class="btn primary" data-a="start" disabled>開始對戰</button>
      <button class="btn" data-a="bot">改打 Bot</button>
    </div>
    <p class="note">把代碼唸給對手，他在登入頁按「加入房間」輸入。</p>
  `;
  register('lobby', el);

  codeEl = el.querySelector('[data-code]')!;
  statusEl = el.querySelector('[data-status]')!;
  startBtn = el.querySelector('[data-a="start"]')!;

  startBtn.addEventListener('click', onStart);
  el.querySelector('[data-a="bot"]')!.addEventListener('click', onBot);

  on(EV.NET_PEER, () => setPeer(true));
  on(EV.NET_LOST, () => setPeer(false));
}

export function enterLobby(code: string): void {
  codeEl.textContent = code;
  setPeer(hasPeer());
  show('lobby');
  // 等超過 60 秒就主動提供 bot —— 不要讓人乾等
  clearTimeout(poll);
  poll = window.setTimeout(() => {
    if (!hasPeer()) statusEl.textContent = '對手還沒來。可以先打 Bot，他來了再重開一局。';
  }, 60_000);
}

function setPeer(present: boolean): void {
  if (!statusEl) return;
  statusEl.textContent = present ? '兩個人都到了' : '等待對手加入…';
  startBtn.disabled = !present;
}
