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
import { getGraphicsQuality, setGraphicsQuality } from '../view/quality';

type Handlers = {
  onHost: (code: string, playerId: string) => void;
  onJoin: (code: string, playerId: string) => void;
  onSolo: () => void;
  onQualityChanged: () => void;
};

export function buildLanding(root: HTMLElement, h: Handlers): void {
  const el = makeScreen(root);
  const quality = getGraphicsQuality();
  el.classList.add('cover');          // 首頁鋪封面，其餘頁面維持純色
  // 全部的字收進一塊石碑裡 —— 封面因此可以全強度鋪滿，
  // 對比在碑面上成立而不是在畫上。見 .design/04-decision.md
  el.innerHTML = `
    <!--
      動態封面。muted 是必要的不是選擇的：瀏覽器只放行靜音自動播放，
      有聲的自動播放會被擋 —— 在自己的機器上可能過（互動過很多次），
      評審的乾淨瀏覽器不會過。聲音改由第一次點擊開啟，見下面 armAudio()。
      poster 讓 cover.jpg 先頂著，影片載完才接上，斷網也不會開天窗。
    -->
    <video class="cover-video" data-cover-video
           src="/cover.mp4" poster="/cover-poster.jpg"
           autoplay muted loop playsinline preload="auto"
           aria-hidden="true" tabindex="-1"></video>
    <div class="stele">
      <h1>RUNESPIRE</h1>
      <p class="sub">Draw the rune · Cast the spell</p>
      <div class="runes">
        <span><b>Z</b><i>Fireball</i></span>
        <span><b>V</b><i>Rock</i></span>
        <span><b>∧</b><i>Spike</i></span>
        <span><b>★</b><i>Mushroom</i></span>
        <span><b>&#x2312;</b><i>Wall</i></span>
      </div>
      <div class="actions">
        <button class="btn primary" data-a="host">Create a room</button>
        <button class="btn" data-a="join">Join a room</button>
        <button class="btn" data-a="solo">Single player</button>
        <button class="btn" data-a="help">How to play</button>
        <button class="btn quality-button" data-a="quality" aria-pressed="${quality === 'low'}">
          Graphics quality <span data-quality>${quality.toUpperCase()}</span>
        </button>
      </div>
      <p class="err" data-err></p>
      <p class="note">
        Hold <b>Shift</b> and draw one of five runes with your wand.<br>
        <b>A</b> / <b>D</b> to move · <b>1–5</b> to test spells directly.
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
            <span class="help-rune">Z</span>
            <span><b>Fireball · 1 MP</b><small>Fast direct spell; a wall can block it.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">V</span>
            <span><b>Rock · 2 MP</b><small>Drops onto the locked lane and ignores walls.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">∧</span>
            <span><b>Spike · 2 MP</b><small>Raises a one-cell spike strip along your lane.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">★</span>
            <span><b>Mushroom · 2 MP</b><small>Creates a three-cell slowing zone around the opponent.</small></span>
          </div>
          <div class="help-step">
            <span class="help-rune">&#x2312;</span>
            <span><b>Wall · 2 MP</b><small>Creates cover that breaks after two Fireball hits.</small></span>
          </div>
        </div>

        <p class="help-tip"><b>Tip</b> Every offensive spell locks its target lane when cast. Move after the warning to dodge it.</p>
        <div class="modal-actions single-action">
          <button class="btn primary" type="button" data-close="help">Ready to duel</button>
        </div>
      </section>
    </div>
  `;
  register('landing', el);

  const err = el.querySelector<HTMLElement>('[data-err]')!;
  const fail = (m: string) => { err.textContent = m; };

  /*
   * 封面聲音。自動播放政策擋的是「沒有使用者手勢的有聲播放」，
   * 所以影片先靜音播，等第一次點擊（任何一顆按鈕都算）再開聲。
   * 只做一次，之後就解除監聽。
   * play() 回傳的 promise 可能被拒絕（例如使用者關了自動播放）——
   * 吞掉就好，首頁不該因為沒聲音而噴錯。
   */
  const coverVideo = el.querySelector<HTMLVideoElement>('[data-cover-video]');
  function armAudio(): void {
    if (!coverVideo) return;
    coverVideo.muted = false;
    coverVideo.volume = 0.35;        // 背景音，不要蓋過講解的人
    void coverVideo.play().catch(() => { /* 擋掉就維持靜音，不影響遊戲 */ });
  }
  el.addEventListener('pointerdown', armAudio, { once: true });

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
  const qualityButton = el.querySelector<HTMLButtonElement>('[data-a="quality"]')!;
  const qualityLabel = qualityButton.querySelector<HTMLElement>('[data-quality]')!;
  qualityButton.addEventListener('click', () => {
    const next = getGraphicsQuality() === 'high' ? 'low' : 'high';
    setGraphicsQuality(next);
    qualityLabel.textContent = next.toUpperCase();
    qualityButton.setAttribute('aria-pressed', String(next === 'low'));
    h.onQualityChanged();
  });
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
