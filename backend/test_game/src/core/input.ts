/**
 * 鍵盤輸入　[擁有者：P1]
 *
 * 走位是 A/D，施法是按住 Shift。就這兩件事。
 * 分開放在 core/ 而不是 tracking/，因為它跟 webcam 無關 ——
 * webcam 出事切成滑鼠模式時，走位照樣能動。
 */
import type { Spell } from './types';

const down = new Set<string>();
const spellShortcuts: Record<string, Spell> = {
  Digit1: 'attack', Numpad1: 'attack',
  Digit2: 'rock', Numpad2: 'rock',
  Digit3: 'spike', Numpad3: 'spike',
  Digit4: 'mushroom', Numpad4: 'mushroom',
  Digit5: 'wall', Numpad5: 'wall',
};
const queuedSpells: Spell[] = [];
let disposer: (() => void) | null = null;

export function initInput(): void {
  if (disposer) return;
  const onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    down.add(e.code);
    const spell = spellShortcuts[e.code];
    // A shortcut is a direct cast, not part of a Shift-drawn rune.
    if (spell && !isCasting()) queuedSpells.push(spell);
  };
  const onUp = (e: KeyboardEvent) => { down.delete(e.code); };
  // 失焦時清空，否則 Alt+Tab 回來角色會自己一直走
  const onBlur = () => { down.clear(); queuedSpells.length = 0; };

  addEventListener('keydown', onDown);
  addEventListener('keyup', onUp);
  addEventListener('blur', onBlur);
  disposer = () => {
    removeEventListener('keydown', onDown);
    removeEventListener('keyup', onUp);
    removeEventListener('blur', onBlur);
    down.clear();
    queuedSpells.length = 0;
  };
}

/** 走位軸：−1 = 左，0 = 沒按，1 = 右。兩顆同時按算 0 */
export function getMoveAxis(): number {
  const l = down.has('KeyA') ? 1 : 0;
  const r = down.has('KeyD') ? 1 : 0;
  return r - l;
}

/** 是否正在起手施法。用 e.code 而不是 e.key —— 中文輸入法會吃掉 key */
export function isCasting(): boolean {
  return down.has('ShiftLeft') || down.has('ShiftRight');
}

export function isDown(code: string): boolean { return down.has(code); }

/** Return one direct keyboard cast, without repeating while the key is held. */
export function consumeSpellShortcut(): Spell | null {
  return queuedSpells.shift() ?? null;
}

/** Clear shortcuts pressed before a new match starts. */
export function clearSpellShortcuts(): void { queuedSpells.length = 0; }

export function disposeInput(): void { disposer?.(); disposer = null; }
