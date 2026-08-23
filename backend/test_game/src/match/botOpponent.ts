/**
 * Single-player opponent behaviour.
 *
 * Training keeps the current quiet patrol. The other levels use the same
 * movement model, but periodically cast a random spell.
 */
import { CONFIG } from '../core/config';
import { IDLE_INTENT, type MatchState, type Opponent, type OpponentIntent, type Spell } from '../core/types';

export type BotLevel = 'training' | 'easy' | 'medium' | 'hard';

const TURN_LEFT_EDGE = CONFIG.PLAYER_EDGE_MARGIN;
const TURN_RIGHT_EDGE = 1 - CONFIG.PLAYER_EDGE_MARGIN;
const RANDOM_SPELLS: Spell[] = ['attack', 'rock', 'spike', 'mushroom', 'wall'];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomDirection(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

function castInterval(level: BotLevel): number {
  if (level === 'easy') return 3;
  if (level === 'medium' || level === 'hard') return 2;
  return Number.POSITIVE_INFINITY;
}

export function createBotOpponent(level: BotLevel): Opponent {
  let moveAxis: number = CONFIG.BOT_MOVE_SPEED_FACTOR;
  let direction: number = randomDirection();
  let stopped = false;
  let modeTime = randomBetween(CONFIG.BOT_WALK_MIN_S, CONFIG.BOT_WALK_MAX_S);
  let spellTime = castInterval(level);
  let castingTime = 0;
  let nextSpell: Spell | null = null;

  return {
    kind: 'bot',

    update(dt: number, view: MatchState): void {
      const x = view.them.x;
      if (x <= TURN_LEFT_EDGE) direction = 1;
      if (x >= TURN_RIGHT_EDGE) direction = -1;

      modeTime -= dt;
      if (modeTime <= 0) {
        if (stopped) {
          stopped = false;
          direction = randomDirection();
          modeTime = randomBetween(CONFIG.BOT_WALK_MIN_S, CONFIG.BOT_WALK_MAX_S);
        } else if (Math.random() < CONFIG.BOT_STOP_CHANCE) {
          stopped = true;
          modeTime = randomBetween(CONFIG.BOT_STOP_MIN_S, CONFIG.BOT_STOP_MAX_S);
        } else {
          direction = randomDirection();
          modeTime = randomBetween(CONFIG.BOT_WALK_MIN_S, CONFIG.BOT_WALK_MAX_S);
        }
      }
      moveAxis = stopped ? 0 : direction * CONFIG.BOT_MOVE_SPEED_FACTOR;

      castingTime = Math.max(0, castingTime - dt);
      spellTime -= dt;
      if (spellTime <= 0 && level !== 'training' && !nextSpell && castingTime <= 0) {
        nextSpell = RANDOM_SPELLS[Math.floor(Math.random() * RANDOM_SPELLS.length)];
        castingTime = 0.28;
        spellTime = castInterval(level);
      }
    },

    consume(): OpponentIntent {
      const cast = nextSpell;
      nextSpell = null;
      return {
        ...IDLE_INTENT,
        moveAxis,
        cast,
        casting: castingTime > 0,
        castProgress: castingTime > 0 ? 1 - castingTime / 0.28 : 0,
      };
    },

    dispose(): void {
      moveAxis = 0;
      direction = 1;
      stopped = false;
      modeTime = 0;
      spellTime = Number.POSITIVE_INFINITY;
      castingTime = 0;
      nextSpell = null;
    },
  };
}

/** Motionless, non-casting target used only by the post-calibration spell test. */
export function createPracticeOpponent(): Opponent {
  return {
    kind: 'bot',
    update(): void { /* The practice target deliberately stays still. */ },
    consume(): OpponentIntent { return IDLE_INTENT; },
    dispose(): void { /* No timers or listeners to release. */ },
  };
}
