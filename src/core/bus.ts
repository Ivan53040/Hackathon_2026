/**
 * 極簡 event bus　[擁有者：E]
 * 不要引入 library。事件名一律用 EV 常數，不准用字面字串。
 */

export const EV = {
  WAND_FRAME:   'wand:frame',
  CAST:         'rune:cast',
  FIZZLE:       'rune:fizzle',
  CAST_BEGIN:   'rune:begin',
  CAST_END:     'rune:end',
  SPELL_FIRED:  'match:fired',
  SPELL_HIT:    'match:hit',
  NEAR_MISS:    'match:nearMiss',   // 打空 —— 玩家必須知道自己閃掉了
  COVER_BUILT:  'match:coverBuilt',
  COVER_HIT:    'match:coverHit',   // 牆扣耐久，帶 { id, hpLeft }
  NO_MANA:      'match:noMana',     // 跟「畫壞了」要有不同的視覺
  HP_CHANGE:    'match:hp',
  MP_CHANGE:    'match:mp',
  MATCH_START:  'match:start',
  MATCH_OVER:   'match:over',
  NET_STATE:    'net:state',      // host 廣播的權威 WireState
  NET_PEER:     'net:peer',       // 對手進房
  NET_PEER_MSG: 'net:peerMsg',    // 對手的 input / cast，RemoteOpponent 在聽
  NET_LOST:     'net:lost',       // 斷線 → 換成 bot，比賽不中斷
  MODE_CHANGE:  'app:mode',
} as const;

export type EventName = (typeof EV)[keyof typeof EV];
type Handler = (payload?: unknown) => void;

const map = new Map<string, Set<Handler>>();

export function on(name: EventName, fn: Handler): () => void {
  let set = map.get(name);
  if (!set) { set = new Set(); map.set(name, set); }
  set.add(fn);
  return () => set!.delete(fn);
}

export function off(name: EventName, fn: Handler): void {
  map.get(name)?.delete(fn);
}

export function emit(name: EventName, payload?: unknown): void {
  const set = map.get(name);
  if (!set) return;
  // 複製一份再迭代：handler 裡面 off 自己不會炸掉迴圈
  for (const fn of [...set]) {
    try { fn(payload); }
    catch (err) { console.error(`[bus] handler failed on "${name}"`, err); }
  }
}

export function clearAll(): void { map.clear(); }
