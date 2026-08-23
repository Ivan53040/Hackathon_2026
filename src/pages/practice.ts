import { EV, on } from '../core/bus';
import type { CastEvent, FizzleEvent, Spell } from '../core/types';
import { makeScreen, register, show, currentScreen } from './index';
import type { BotLevel } from '../match/botOpponent';

const SPELL_NAMES: Record<Spell, string> = {
  attack: 'Fireball',
  rock: 'Rock',
  spike: 'Spike',
  mushroom: 'Mushroom',
  wall: 'Wall',
};

const testedSpells = new Set<Spell>();

function showCastResult(el: HTMLElement, cast: CastEvent): void {
  testedSpells.add(cast.spell);
  const card = el.querySelector<HTMLElement>(`[data-spell="${cast.spell}"]`);
  card?.classList.add('passed');
  const cardResult = card?.querySelector<HTMLElement>('[data-card-result]');
  if (cardResult) cardResult.textContent = 'PASS';
  const result = el.querySelector<HTMLElement>('[data-result]');
  if (result) {
    result.dataset.state = 'success';
    result.textContent = `SUCCESS · ${SPELL_NAMES[cast.spell]} · ${testedSpells.size} / 5 complete`;
  }
}

function showFizzleResult(el: HTMLElement, fizzle: FizzleEvent): void {
  const result = el.querySelector<HTMLElement>('[data-result]');
  if (!result) return;
  result.dataset.state = 'failure';
  result.textContent = fizzle.bestGuess
    ? `NOT QUITE · Closest rune: ${SPELL_NAMES[fizzle.bestGuess]} · Try again`
    : 'NOT RECOGNIZED · Draw the full rune and try again';
}

function resetSpellTest(el: HTMLElement): void {
  testedSpells.clear();
  for (const card of el.querySelectorAll<HTMLElement>('[data-spell]')) {
    card.classList.remove('passed');
    const result = card.querySelector<HTMLElement>('[data-card-result]');
    if (result) result.textContent = 'WAIT';
  }
  const result = el.querySelector<HTMLElement>('[data-result]');
  if (result) {
    result.dataset.state = 'idle';
    result.textContent = 'Draw a rune to begin the five-spell test.';
  }
}

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
        <div data-spell="attack"><b>Z</b><span>Fireball</span><small>1 MP</small><em data-card-result>WAIT</em></div>
        <div data-spell="rock"><b>V</b><span>Rock</span><small>2 MP</small><em data-card-result>WAIT</em></div>
        <div data-spell="spike"><b>∧</b><span>Spike</span><small>2 MP</small><em data-card-result>WAIT</em></div>
        <div data-spell="mushroom"><b class="gesture-star" aria-label="Single-stroke five-point star"><svg viewBox="0 0 36 35" aria-hidden="true"><path d="M18 2 L34 33 L2 13 L34 13 L2 33 Z" /></svg></b><span>Mushroom</span><small>2 MP</small><em data-card-result>WAIT</em></div>
        <div data-spell="wall"><b class="gesture-curve" aria-label="Arch"><svg viewBox="0 0 36 22" aria-hidden="true"><path d="M3 18 Q18 2 33 18" /></svg></b><span>Wall</span><small>2 MP</small><em data-card-result>WAIT</em></div>
      </div>
      <p class="practice-result" data-result data-state="idle">Draw a rune to begin the five-spell test.</p>
      <div class="practice-tutorial" aria-label="Spell test controls">
        <div><kbd>SHIFT</kbd><span><b>HOLD TO DRAW</b><small>Release Shift to test the spell</small></span></div>
        <button type="button" data-ready><kbd>SPACE</kbd><span><b>READY TO FIGHT!</b><small>Start the real duel</small></span></button>
      </div>
      <p class="practice-hint" data-hint>The training target will not lose HP. Try every spell as many times as you need.</p>
      <p class="practice-countdown" data-countdown></p>
    </section>
  `;
  register('practice', el);
  on(EV.CAST, (raw) => {
    if (currentScreen() === 'practice') showCastResult(el, raw as CastEvent);
  });
  on(EV.FIZZLE, (raw) => {
    if (currentScreen() === 'practice') showFizzleResult(el, raw as FizzleEvent);
  });
  el.querySelector('[data-retry]')!.addEventListener('click', (event) => {
    event.stopPropagation();
    onRetry();
  });
  el.querySelector('[data-ready]')!.addEventListener('click', onStart);
  addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || currentScreen() !== 'practice') return;
    event.preventDefault();
    onStart();
  });
}

export function enterPractice(level: BotLevel): void {
  const el = document.querySelector<HTMLElement>('[data-screen="practice"]');
  void level;
  show('practice');
  if (el) resetSpellTest(el);
  setPracticeCountdown(null);
}

export function setPracticeCountdown(value: number | null): void {
  const el = document.querySelector<HTMLElement>('[data-screen="practice"] [data-countdown]');
  const ready = document.querySelector<HTMLButtonElement>('[data-screen="practice"] [data-ready]');
  if (!el) return;
  if (ready) ready.disabled = value !== null;
  el.textContent = value === null ? '' : value > 0 ? String(value) : 'GO';
}
