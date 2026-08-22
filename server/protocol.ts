/**
 * wire 型別 + 驗證　[擁有者：E]
 *
 * ⚠️ 型別名稱要跟 src/core/types.ts 一致，手動同步。
 * ⚠️ 規格已改過四次（v2→v5）。白名單寫錯不會 crash ——
 *    它會安靜地擋掉前端送的合法訊息，然後兩邊都以為是對方壞了。
 *    每次規格改版，先回來看這個檔案。
 */

export const SPELLS = ['attack', 'wall'] as const;

export const CLIENT_TYPES = ['input', 'cast', 'state', 'ping', 'pong', 'rematch', 'start'] as const;
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
      // ⚠️ v6.1：欄位從 x（位置）改成 moveAxis（意圖）。
      // 位置是 host 權威模擬的產物，guest 送回位置會造成死循環 —— 見 src/net/socket.ts
      return num(o.moveAxis) && typeof o.casting === 'boolean';
    case 'cast':
      return SPELLS.includes(o.spell as (typeof SPELLS)[number]) && num(o.score);
    case 'state':
      // 陣列長度上限：防止有人送十萬面牆把對方瀏覽器打死
      return Array.isArray(o.projectiles) && o.projectiles.length <= MAX_ARRAY
          && Array.isArray(o.covers) && o.covers.length <= MAX_ARRAY;
    case 'ping':
    case 'pong':
      return num(o.t);
    case 'rematch':
    case 'start':
      return true;
    default:
      return false;
  }
}
