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
    <p class="sub">Room code</p>
    <div class="code" data-code>----</div>
    <p class="err" data-status>Waiting for an opponent…</p>
    <div class="actions">
      <button class="btn primary" data-a="start" disabled>Start duel</button>
      <button class="btn" data-a="bot">Fight a bot instead</button>
    </div>
    <p class="note">Read the code out to your opponent. They enter it under “Join a room”.</p>
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
    if (!hasPeer()) statusEl.textContent = 'Still no opponent. Fight a bot for now — you can restart when they arrive.';
  }, 60_000);
}

function setPeer(present: boolean): void {
  if (!statusEl) return;
  statusEl.textContent = present ? 'Both players ready' : 'Waiting for an opponent…';
  startBtn.disabled = !present;
}
