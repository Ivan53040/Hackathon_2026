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
      <!-- 手機玩不了（要 webcam + 筆 + A/D 鍵盤）。與其假裝支援，不如講清楚 -->
      <p class="note desktop-only">Needs a desktop browser with a webcam.</p>
    </div>

    <div class="landing-modal" data-modal="join" role="dialog" aria-modal="true"
         aria-labelledby="join-title" hidden>
      <form class="landing-modal-card join-card" data-join-form>
        <p class="modal-kicker">Duel connection</p>
        <h2 id="join-title">JOIN A ROOM</h2>
        <p class="modal-copy">Enter the four-letter rune shared by the room host.</p>
        <label class="modal-label" for="room-code">Room code</label>
        <input class="field modal-field" id="room-code" data-room-code
               maxlength="4" minlength="4" autocomplete="off" spellcheck="false"
               aria-describedby="join-error" placeholder="RUNE">
        <p class="modal-error" id="join-error" data-join-error aria-live="polite"></p>
        <div class="modal-actions">
          <button class="btn" type="button" data-close="join">Cancel</button>
          <button class="btn primary" type="submit" data-join-submit>Join duel</button>
        </div>
      </form>
    </div>

    <div class="landing-modal" data-modal="help" role="dialog" aria-modal="true"
         aria-labelledby="help-title" hidden>
      <section class="landing-modal-card help-card">
        <p class="modal-kicker">Field guide</p>
        <h2 id="help-title">HOW TO PLAY</h2>
        <p class="modal-copy">Move, draw a rune, then cast before your opponent can react.</p>

        <div class="help-steps">
          <div class="help-step">
            <span class="help-key">A / D</span>
            <span><b>Move</b><small>Step left or right to dodge a straight spell.</small></span>
          </div>
          <div class="help-step">
            <span class="help-key">SHIFT</span>
            <span><b>Draw</b><small>Hold Shift and trace a rune with your wand.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">&#9651;</span>
            <span><b>Attack</b><small>Cast a direct spell at your opponent.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">&#9723;</span>
            <span><b>Build</b><small>Create cover. It breaks after taking two hits.</small></span>
          </div>
        </div>

        <p class="help-tip"><b>Cover advantage</b> Your cover blocks enemy spells and hides your HP and MP, while your own attacks pass through it.</p>
        <div class="modal-actions single-action">
          <button class="btn primary" type="button" data-close="help">Ready to duel</button>
        </div>
      </section>
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

  const joinModal = el.querySelector<HTMLElement>('[data-modal="join"]')!;
  const helpModal = el.querySelector<HTMLElement>('[data-modal="help"]')!;
  const roomCode = el.querySelector<HTMLInputElement>('[data-room-code]')!;
  const joinError = el.querySelector<HTMLElement>('[data-join-error]')!;
  const joinSubmit = el.querySelector<HTMLButtonElement>('[data-join-submit]')!;

  function openModal(modal: HTMLElement): void {
    modal.hidden = false;
    requestAnimationFrame(() => {
      if (modal === joinModal) roomCode.focus();
      else modal.querySelector<HTMLButtonElement>('[data-close]')?.focus();
    });
  }

  function closeModal(modal: HTMLElement): void {
    modal.hidden = true;
    joinError.textContent = '';
  }

  el.querySelector('[data-a="join"]')!.addEventListener('click', () => {
    fail('');
    roomCode.value = '';
    openModal(joinModal);
  });

  roomCode.addEventListener('input', () => {
    roomCode.value = roomCode.value.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase();
    joinError.textContent = '';
  });

  el.querySelector<HTMLFormElement>('[data-join-form]')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = roomCode.value.trim().toUpperCase();
    if (code.length !== 4) {
      joinError.textContent = 'Enter the complete four-letter room code.';
      roomCode.focus();
      return;
    }
    try {
      const r = await busy(joinSubmit, 'Checking…', () => checkRoom(code));
      if (!r) return;
      if (!r.exists) return void (joinError.textContent = 'No room uses that code. Check the rune and try again.');
      if (r.full) return void (joinError.textContent = 'That room already has two duelists.');
      h.onJoin(code, 'p_' + Math.random().toString(36).slice(2, 8));
    } catch {
      joinError.textContent = 'Cannot reach the duel server right now.';
    }
  });

  el.querySelector('[data-a="solo"]')!.addEventListener('click', () => h.onSolo());
  el.querySelector('[data-a="help"]')!.addEventListener('click', () => {
    openModal(helpModal);
  });

  el.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const modal = button.closest<HTMLElement>('[data-modal]');
      if (modal) closeModal(modal);
    });
  });

  el.querySelectorAll<HTMLElement>('[data-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!joinModal.hidden) closeModal(joinModal);
    else if (!helpModal.hidden) closeModal(helpModal);
  });

  show('landing');
}
