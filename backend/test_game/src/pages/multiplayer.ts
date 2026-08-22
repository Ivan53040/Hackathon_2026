import { makeScreen, register, show } from './index';
import { checkRoom, createRoom } from '../net';

type Handlers = {
  onHost: (code: string, playerId: string) => void;
  onJoin: (code: string, playerId: string) => void;
  onBack: () => void;
};

export function buildMultiplayer(root: HTMLElement, handlers: Handlers): void {
  const el = makeScreen(root);
  el.innerHTML = `
    <p class="sub">Multiplayer</p>
    <h1>Play with a friend</h1>
    <div class="actions">
      <button class="btn primary" data-create>Create a room</button>
      <button class="btn" data-join>Join a room</button>
      <button class="btn" data-back>Back</button>
    </div>
    <p class="err" data-error></p>
  `;
  register('multiplayer', el);
  const error = el.querySelector<HTMLElement>('[data-error]')!;
  const fail = (message: string) => { error.textContent = message; };

  el.querySelector('[data-create]')!.addEventListener('click', async () => {
    fail('');
    try {
      const { code, playerId } = await createRoom();
      handlers.onHost(code, playerId);
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : 'Cannot create a room');
    }
  });
  el.querySelector('[data-join]')!.addEventListener('click', async () => {
    fail('');
    const code = prompt('Room code (4 letters)')?.trim().toUpperCase();
    if (!code) return;
    try {
      const result = await checkRoom(code);
      if (!result.exists) return fail('No room with that code');
      if (result.full) return fail('That room is full');
      handlers.onJoin(code, `p_${Math.random().toString(36).slice(2, 8)}`);
    } catch {
      fail('Cannot reach the server');
    }
  });
  el.querySelector('[data-back]')!.addEventListener('click', handlers.onBack);
}

export function enterMultiplayer(): void { show('multiplayer'); }
