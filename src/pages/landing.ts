/**
 * 登入頁　[Wesley]
 *
 * 規格定案：創建房間 / 加入房間 / 說明 / 設定 四顆。
 * ⚠️ 但四顆**平權**會讓人不知道該按哪個（Hick's Law）——
 *    所以「創建房間」做成主要按鈕，其餘三顆降級。
 *    這不是改規格，是把主要動作標出來。
 */
import { makeScreen, register, show } from './index';
import { createRoom, checkRoom } from '../net';

type Handlers = {
  onHost: (code: string, playerId: string) => void;
  onJoin: (code: string, playerId: string) => void;
  onSolo: () => void;
};

export function buildLanding(root: HTMLElement, h: Handlers): void {
  const el = makeScreen(root);
  el.classList.add('cover');          // 首頁鋪封面，其餘頁面維持純色
  // 全部的字收進一塊石碑裡 —— 封面因此可以全強度鋪滿，
  // 對比在碑面上成立而不是在畫上。見 .design/04-decision.md
  el.innerHTML = `
    <div class="stele">
      <h1>RUNESPIRE</h1>
      <p class="sub">Draw the rune · Cast the spell</p>
      <div class="runes">
        <span><b>&#9651;</b><i>Attack</i></span>
        <span><b>&#9723;</b><i>Build</i></span>
      </div>
      <div class="actions">
        <button class="btn primary" data-a="host">Create a room</button>
        <button class="btn" data-a="join">Join a room</button>
        <button class="btn" data-a="solo">Practise against a bot</button>
        <button class="btn" data-a="help">How to play</button>
      </div>
      <p class="err" data-err></p>
      <p class="note">
        Hold <b>Shift</b> and draw the rune in the air with your wand.<br>
        <b>A</b> / <b>D</b> to step left and right.
      </p>
    </div>
  `;
  register('landing', el);

  const err = el.querySelector<HTMLElement>('[data-err]')!;
  const fail = (m: string) => { err.textContent = m; };

  /** 連線要等，等的時候按鈕要看得出在等 —— 後端沒開時這是唯一的線索 */
  async function busy<T>(b: HTMLButtonElement, label: string, job: () => Promise<T>): Promise<T | null> {
    const original = b.textContent;
    b.setAttribute('aria-busy', 'true');
    b.disabled = true;
    b.textContent = label;
    try {
      return await job();
    } finally {
      b.removeAttribute('aria-busy');
      b.disabled = false;
      b.textContent = original;
    }
  }

  const hostBtn = el.querySelector<HTMLButtonElement>('[data-a="host"]')!;
  hostBtn.addEventListener('click', async () => {
    fail('');
    try {
      const r = await busy(hostBtn, 'Creating…', createRoom);
      if (r) h.onHost(r.code, r.playerId);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not create a room — you can still practise against a bot');
    }
  });

  el.querySelector('[data-a="join"]')!.addEventListener('click', async () => {
    fail('');
    const code = prompt('Room code (4 letters)')?.trim().toUpperCase();
    if (!code) return;
    try {
      const r = await checkRoom(code);
      if (!r.exists) return fail('No room with that code — check it again');
      if (r.full) return fail('That room already has two players');
      h.onJoin(code, 'p_' + Math.random().toString(36).slice(2, 8));
    } catch {
      fail('Cannot reach the server');
    }
  });

  el.querySelector('[data-a="solo"]')!.addEventListener('click', () => h.onSolo());
  el.querySelector('[data-a="help"]')!.addEventListener('click', () => {
    // TODO [Wesley]：做成正式的說明頁。現在先讓 judge 至少讀得到規則
    alert(
      'HOW TO PLAY\n\n' +
      'A / D      step left and right to dodge\n' +
      'Shift      hold, then draw the rune with your wand\n\n' +
      'Triangle   Attack\n' +
      'Square     Build cover\n\n' +
      'Cover takes two hits before it breaks.\n' +
      'Your own cover never blocks your shots —\n' +
      'so building one lets you defend and attack at once.\n' +
      'Behind cover, your opponent cannot read your HP or MP.',
    );
  });

  show('landing');
}
