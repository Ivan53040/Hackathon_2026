import { makeScreen, register, show } from './index';

export function buildSettings(root: HTMLElement, onBack: () => void): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <p class="sub">Settings</p>
    <h1>Settings</h1>
    <p class="note">Settings will be added here.</p>
    <button class="btn" data-back>Back</button>
  `;
  register('settings', el);
  el.querySelector('[data-back]')!.addEventListener('click', onBack);
}

export function enterSettings(): void { show('settings'); }
