import { makeScreen, register, show } from './index';
import type { BotLevel } from '../match/botOpponent';

export function buildPractice(root: HTMLElement, onStart: () => void, onRetry: () => void): void {
  const el = makeScreen(root);
  el.classList.add('practice-screen');
  el.dataset.screen = 'practice';
  el.innerHTML = `
    <section class="practice-panel" aria-live="polite">
      <button class="btn practice-retry" data-retry>Retry calibration</button>
      <p class="practice-kicker">SPELL TEST</p>
      <h1>Try your wand</h1>
      <div class="practice-spells">
        <div><b>Z</b><span>Fireball</span><small>1 MP</small></div>
        <div><b>V</b><span>Rock</span><small>2 MP</small></div>
        <div><b>∧</b><span>Spike</span><small>2 MP</small></div>
        <div><b>m</b><span>Mushroom</span><small>2 MP</small></div>
        <div><b>ARC</b><span>Wall</span><small>2 MP</small></div>
      </div>
      <p class="practice-hint" data-hint>Hold Shift and draw any spell. Press Space when ready to enter the duel.</p>
      <p class="practice-countdown" data-countdown></p>
    </section>
  `;
  register('practice', el);
  el.querySelector('[data-retry]')!.addEventListener('click', (event) => {
    event.stopPropagation();
    onRetry();
  });
  el.addEventListener('click', onStart);
}

export function enterPractice(level: BotLevel): void {
  const el = document.querySelector<HTMLElement>('[data-screen="practice"]');
  void level;
  show('practice');
  if (el) el.querySelector<HTMLElement>('[data-hint]')!.textContent = 'Hold Shift and draw any spell. Press Space when ready to enter the duel.';
  setPracticeCountdown(null);
}

export function setPracticeCountdown(value: number | null): void {
  const el = document.querySelector<HTMLElement>('[data-screen="practice"] [data-countdown]');
  if (!el) return;
  el.textContent = value === null ? '' : value > 0 ? String(value) : 'GO';
}
