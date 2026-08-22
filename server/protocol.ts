/**
 * wire 型別 + 驗證　[擁有者：E]
 *
 * ⚠️ 型別名稱要跟 src/core/types.ts 一致，手動同步。
 * ⚠️ 規格已改過四次（v2→v5）。白名單寫錯不會 crash ——
 *    它會安靜地擋掉前端送的合法訊息，然後兩邊都以為是對方壞了。
 *    每次規格改版，先回來看這個檔案。
 */

export const SPELLS = ['bolt', 'heavy'] as const;

export const CLIENT_TYPES = ['input', 'cast', 'state', 'ping', 'pong', 'rematch'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

const MAX_ARRAY = 32;
const MAX_STR = 64;

function num(v: unknown): boolean { return typeof v === 'number' && Number.isFinite(v); }
function str(v: unknown): boolean { return typeof v === 'string' && v.length <= MAX_STR; }

/** 手寫 20 行就夠，不要裝 zod */
export function isValidMessage(m: unknown): m is { type: ClientType } {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  if (!str(o.type) || !CLIENT_TYPES.includes(o.type as ClientType)) return false;

  switch (o.type) {
    case 'input':
      return num(o.x) && typeof o.casting === 'boolean';
    case 'cast':
      return SPELLS.includes(o.spell as (typeof SPELLS)[number]) && num(o.score);
    case 'state':
      return Array.isArray(o.projectiles) && o.projectiles.length <= MAX_ARRAY;
    case 'ping':
    case 'pong':
      return num(o.t);
    case 'rematch':
      return true;
    default:
      return false;
  }
}
