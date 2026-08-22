import { makeScreen, register, show } from './index';

type Handlers = {
  onSingleplayer: () => void;
  onMultiplayer: () => void;
  onSettings: () => void;
};

export function buildLanding(root: HTMLElement, handlers: Handlers): void {
  const el = makeScreen(root);
  el.classList.add('cover');
  el.innerHTML = `
    <h1>RUNESPIRE</h1>
    <p class="sub">Draw the rune · Cast the spell</p>
    <div class="actions main-menu-actions">
      <button class="btn primary" data-a="singleplayer">Singleplayer</button>
      <button class="btn" data-a="multiplayer">Multiplayer</button>
      <button class="btn" data-a="settings">Settings</button>
    </div>
    <p class="note">Choose a mode to begin.</p>
  `;
  register('landing', el);
  el.querySelector('[data-a="singleplayer"]')!.addEventListener('click', handlers.onSingleplayer);
  el.querySelector('[data-a="multiplayer"]')!.addEventListener('click', handlers.onMultiplayer);
  el.querySelector('[data-a="settings"]')!.addEventListener('click', handlers.onSettings);
  show('landing');
}
