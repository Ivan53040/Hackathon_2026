# 分工表 — 誰做什麼，誰不准碰什麼

> 規格 v5 · 對應 [`PLAN.md`](./PLAN.md) · 動畫另見 [`ANIMATION.md`](./ANIMATION.md)
> **每個人先讀自己那一段，再讀「交接點」那一節。**

---

## 為什麼要重分

v4 時 D 一個人扛了「3D 場景 + VFX + HUD + 全部頁面 + 動畫」。**那是兩個人的量。**
v5 之後重新切，原則有三條：

1. **一人一資料夾**，不准跨資料夾改別人的檔案
2. **D 出設計系統，別人照著實作** —— D 不再手工做每一個頁面
3. **動畫生成是「等待型」工作**，可以跟寫 code 並行，所以由三個人分攤

---

## 誰擁有什麼

| 人 | 資料夾 | 一句話職責 | v5 工作量 |
|---|---|---|---|
| **Ivan (A)** | `tracking/` | 讓筆尖與頭部座標穩定流出來 | 🔺 **上升**（多了臉部追蹤） |
| **B** | `runes/` + `pages/tutorial.ts` | 畫得歪也能中，並教會玩家怎麼畫 | 持平 |
| **C** | `match/` + `net/remoteOpponent.ts` | 讓這 90 秒有博弈張力 | 🔻 **下降**（砍掉牆/MP/樓層） |
| **D**（你） | `view/` + `ui/tokens.css` | 讓第一人稱成立、讓它看起來像魔法 | 🔻 **下降**（交出頁面） |
| **E** | `main.ts` `core/` `ui/hud.ts` `pages/` `net/` `server/` | 讓五個人的東西合得起來，台上不會炸 | 🔺 上升 |

---

## Ivan (A) — `tracking/`　★ v5 最高風險，不要給他別的事

**擁有**
```
tracking/tracker.ts  handSource.ts  faceSource.ts  mouseSource.ts  oneEuro.ts
public/mediapipe/    ← wasm + .task 模型檔（必須下載到本機）
```

**交付順序**
| 時間 | 交付 | 誰在等 |
|---|---|---|
| **H+2** | `mouseSource.ts`（滑鼠 x → `head`，滑鼠位置 → `tip`） | **四個人全部** |
| H+8 | `handSource.ts` 接上 webcam，畫面上看得到筆尖 | B |
| H+12 | `faceSource.ts`：`head` + `bodyScale` | C、D |
| H+14 | **融合**：`tip` 換算成相對身體座標 | B（辨識率靠這個） |
| H+16 | 模型檔下載到 `public/mediapipe/` | 全隊（會場斷網保命） |

**不准碰**：任何其他資料夾。**v5 之後校準頁不是他的了。**

**Ivan 的唯一 KPI**：`getFrame()` 在 25fps 以上穩定回傳，且 `head` 不抖。
> `head` 抖動會直接變成畫面暈眩，比 `tip` 抖更嚴重。**平滑參數要分開調。**

---

## B — `runes/` + 教學頁

**擁有**
```
runes/recognizer.ts  segmenter.ts  templates.json  trainer.html
pages/tutorial.ts    ← v5 新增給 B（原本的校準頁）
```

**為什麼教學頁給 B**：那一頁唯一要教的事情是「怎麼畫符文才會被認出來」。
**寫辨識器的人最清楚怎麼畫會中。** 交給別人做，教出來的動作跟辨識器對不上。

**交付順序**
| 時間 | 交付 |
|---|---|
| H+6 | $1 Recognizer + `segmenter.ts`，用假 template 先測通 |
| H+10 | `trainer.html` 可以錄 template |
| **H+14** | **用 webcam 重錄全部 template**（滑鼠錄的一律作廢） |
| H+20 | 教學頁三步驟 |
| H+24→28 | 調閾值，兩個符文各測 20 次，**數據寫下來** |

**不准碰**：`match/`、`view/`。要改別人的東西在群組講。

---

## C — `match/` + 連線對手

**擁有**
```
match/match.ts  duelist.ts  spells.ts  botOpponent.ts  rules.ts
net/remoteOpponent.ts   ← v5 從 E 移過來
```

**為什麼 `remoteOpponent.ts` 給 C**：它跟 `botOpponent.ts` 實作同一個 `Opponent` 介面。
**同一個人寫兩邊，介面才不會歪。** 而且 v5 砍掉牆與 MP 之後 C 有餘力。

**交付順序**
| 時間 | 交付 |
|---|---|
| H+6 | `duelist` 位置由 `head` 驅動 + 快擊 + 命中判定 |
| **H+8** | **學徒 bot** — M1 驗收要用 |
| H+12 | 重擊 + `HIT_WIDTH` 差異 + 術士 bot |
| H+20 | `remoteOpponent.ts` + 斷線降級成 bot（**兩個方向都要測**） |
| H+24 | 大法師 bot |
| H+26→30 | **平衡**：傷害、繪製時間、`HIT_WIDTH`、bot 反應時間 |

**不准碰**：`view/`（你只發事件，不畫東西）、`tracking/`。

---

## D（你）— `view/` + 設計系統

**擁有**
```
view/camera.ts  opponent.ts  arena.ts  anim.ts  vfx.ts  post.ts  audio.ts
ui/tokens.css   ← 你擁有，全隊引用
```

**你不再擁有**（v4 時是你的，現在交出去）
| 交給誰 | 什麼 | 你還是要出什麼 |
|---|---|---|
| **E** | `ui/hud.ts`、Landing、大廳、結算頁 | **`tokens.css` + 一張 HUD 版面圖** |
| **B** | 教學頁 | tokens |
| **動畫三人組** | 素材生成 | **`ANIMATION.md` 的規格與 prompt** |

**交付順序**
| 時間 | 交付 | 誰在等 |
|---|---|---|
| **H+3** | `ui/tokens.css` 第一版 | **E 與 B 在等，優先於一切** |
| H+6 | 第一人稱相機 + 對手佔位方塊 + 拖尾 | M1 |
| H+8 | 頭部視差 A8（**要花一小時實測阻尼**） | — |
| H+12 | 投射物朝相機飛 A16 + 命中 A17 + 震動 A9 | C |
| H+14 | 吸附特效 A13 | — |
| H+18 | 對手 sprite 系統接上（先用佔位） | 動畫三人組 |
| H+24 | 動畫全套接線 + near-miss A10 | — |
| H+28 | 音效 | — |

> **H+3 的 `tokens.css` 是你最重要的一次交付。** 在那之前 E 跟 B 只能寫死顏色，
> 之後每改一次 token 就要全部重來。**先出 token，再做場景。**

---

## E — 骨架、整合、後端、頁面

**擁有**
```
main.ts  core/{types,bus,config}.ts  ui/hud.ts
pages/{landing,lobby,results}.ts
net/socket.ts   server/**
```

**交付順序**
| 時間 | 交付 | 誰在等 |
|---|---|---|
| **H+1** | **repo 骨架 + `types.ts` + `bus.ts` + `config.ts` + `CLAUDE.md`** | **全部四個人** |
| H+4 | Debug HUD（`~`）+ 保命熱鍵 `1`/`2`/`M`/`B` | 全隊調參 |
| H+8 | 把四個模組串進 `main.ts` | M1 |
| H+14 | 後端房間 + WebSocket 通道 | C |
| **H+20** | **部署上線，拿到 https 網址** | 全隊 |
| H+22 | 頁面三張（用 D 的 tokens） | — |
| H+26 | 遙測 + summary | 講稿 |

**E 的隱藏職責**：每 4 小時主持 15 分鐘 merge + smoke test，**親手跑一次完整流程**，記錄壞了什麼。

---

## 交接點（只有這五個，其他都是自己的事）

| # | 從 | 到 | 介面 | 時間 |
|---|---|---|---|---|
| 1 | Ivan | 全部 | `getFrame(): WandFrame` | H+2 假的，H+14 真的 |
| 2 | B | C | `EV.CAST` 事件 `{ spell, score }` | H+6 |
| 3 | C | D | `MatchState` + `EV.SPELL_HIT` / `EV.NEAR_MISS` | H+8 |
| 4 | **D** | **E + B** | **`ui/tokens.css`** | **H+3** |
| 5 | 動畫三人組 | D | `public/anim/*.png` + `manifest.json` | H+18 |

**這五條線以外的溝通都是浪費時間。**

---

## 三條鐵律

1. **每 4 小時 merge 一次 main。** 不准有活超過 4 小時的 branch
2. **H+30 功能凍結。** 之後只准改 `config.ts` 數值與文案
3. **卡住超過 45 分鐘必須開口。** 立刻切到 [`PLAN.md`](./PLAN.md) §10 的 Kill List

> Git：branch 名 `ivan/tracking`、`b/runes`、`c/match`、`d/view`、`e/core`。
> **AI 不准 commit / push**（見 [`../rules.md`](../rules.md)）。
