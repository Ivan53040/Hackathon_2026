# match — 對戰核心 + Bot　[Bill]

固定步長模擬（accumulator, 1/60），不要用 rAF 的 dt 直接算物理。
`me.x` 由 `core/input` 的 `getMoveAxis()` 驅動，**無慣性無加速度**。
`BotOpponent` 與 `RemoteOpponent` 實作同一個 `Opponent` 介面，連線爆炸時一行對調。

## 兩條寫錯就毀掉遊戲的

1. **命中比對 `projectile.toX`，不是對手現在的 `x`。**
   `toX` 是發射當下鎖定的線。比現在的 `x` 的話玩家永遠閃不掉。→ `resolve()`
2. **C2：從自己的牆後面攻擊要穿過去。**
   實作方式是「命中判定**只看目標那一側**的牆」，攻擊者自己的牆從頭到尾不參與。
   這是一條**寫在缺席裡**的規則 —— 看起來像少寫了，不要「修好」它。→ `resolve()`

## 兩個規格上的判斷（有疑義找我）

- **牆蓋在建造者自己那條線上**，不是 `x + COVER_OFFSET`。
  `COVER_OFFSET(0.10) > COVER_BLOCK_W(0.09)`，橫向偏移的話 C1 擋不到打向我的攻擊、
  C3 也藏不住我的數值，牆就完全沒用了。**`COVER_OFFSET` 請當成深度（前方多遠），給 `view/` 用。**
- **`me.castProgress` = 起手經過時間 / `MAX_STROKE_MS`。**
  config 裡沒有「一次起手該多久」的參數，先借 `MAX_STROKE_MS`。
  法陣長太慢的話，跟我說一聲加一個 `SIGIL_FULL_MS`。

## 事件（型別在 `events.ts`，view/ 可以直接 import）

| 事件 | payload |
|---|---|
| `EV.SPELL_FIRED` | `{ owner, spell, fromX, toX, id }` |
| `EV.SPELL_HIT` | `{ target, x, dmg, hpLeft }` |
| `EV.NEAR_MISS` | `{ owner, toX, missBy }` ← 玩家必須知道自己閃掉了 |
| `EV.COVER_BUILT` | `{ id, side, x, hp }` |
| `EV.COVER_HIT` | `{ id, side, x, hpLeft }` ← `hpLeft` 0 = 這一下打碎了 |
| `EV.NO_MANA` | `{ spell, mp, need }` ← 視覺必須跟「畫壞了」明顯不同 |
| `EV.MATCH_OVER` | `{ winner, reason: 'kill' \| 'timeout' }` |

`owner` / `target` / `side` 都是 `'me' | 'them'`，已經轉成本地視角。

## mode

- `solo` / `host` → 這裡跑權威模擬；`host` 另外以 `TICK_HZ` 廣播 `WireState`
- `guest` → **不模擬**，直接吃 `getLatestState()` 過 `toLocalView()`

`core/mockMatch.ts` 已刪除 —— 真的 match 會動了，假狀態只會讓人誤以為遊戲壞掉。
開發時用 `?solo=1` 直接開一場 bot 對戰。
