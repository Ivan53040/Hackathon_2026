import { makeScreen, register, show } from './index';
import type { BotLevel } from '../match/botOpponent';

type Handlers = {
  onSelect: (level: BotLevel) => void;
  onBack: () => void;
};

export function buildSingleplayer(root: HTMLElement, handlers: Handlers): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <p class="sub">Single player</p>
    <h1>Choose your opponent</h1>
    <div class="actions difficulty-actions">
      <button class="btn primary" data-level="training">Training<small>Moving target · no spells</small></button>
      <button class="btn" data-level="easy">Easy<small>Random spells every 3 seconds</small></button>
      <button class="btn" data-level="medium">Medium<small>Random spells every 2 seconds</small></button>
      <button class="btn" data-level="hard">Hard<small>Random spells every 2 seconds · 15 HP</small></button>
    </div>
    <button class="btn back-button" data-back>Back</button>
  `;
  register('singleplayer', el);

  for (const button of el.querySelectorAll<HTMLButtonElement>('[data-level]')) {
    button.addEventListener('click', () => handlers.onSelect(button.dataset.level as BotLevel));
  }
  el.querySelector('[data-back]')!.addEventListener('click', handlers.onBack);
}

export function enterSingleplayer(): void {
  show('singleplayer');
}
