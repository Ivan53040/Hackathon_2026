# Tracking Gate — 問題 · 決定 · Gate

Track B（單頁／流程）　·　2026-08-22　·　範圍：**只有校準關卡**，不含 Landing 與遊戲場景

> 期限壓力下把 01/02/03/04/07 收成這一份。這是**刻意的取捨**，不是流程跑完了 ——
> 少掉的是獨立的方向探索（Stage 3 只有一個方向被提出，沒有並列比較）。

---

## 1. 問題

`?solo=1` 進來看到的是 Ivan 的 **WandFrame lab**（除錯工具）整頁塞進 iframe，
上面再蓋一張卡片。同一個畫面同時有 **10 個區塊**在對玩家說話：

| # | 區塊 | 對玩家 |
|---|---|---|
| 1 | `WandFrame lab` / `HACKATHON / TRACKING` | ❌ 內部代號 |
| 2 | `event: { timestamp, tip }` | ❌ 資料契約 |
| 3 | `1 · Pen tracking test` | ❌ 測試編號 |
| 4 | Start recording / Clear / Download JSON / `0 frames` | ❌ 蒐資料用 |
| 5 | `TIP NOT DETECTED` | ⚠️ 意思對，語言是機器的 |
| 6 | `PUT ONLY THE COLOURED TIP IN THE SMALL BOX` | ✅ 指令 |
| 7 | `Step 0 — Capture background + person mask` | ✅ 指令 |
| 8 | `ARC DETECTED / All gesture tests passed` | ✅ 回饋 |
| 9 | 右下 15 格 HUD | ❌ 儀表板 |
| 10 | 我們的卡片：kicker + 標題 + 說明 + 進度 + 狀態 + 2 按鈕 | ⚠️ 與 6、7 打架 |

**核心缺陷不是「字太多」，是「兩套教學同時存在」。** 第 10 塊與第 6、7 塊各自
在下指令，玩家不知道要聽誰的。5 秒測試不及格。

**影響對象**：所有第一次進遊戲的人，包含評審。**嚴重度**：高 —— 這是遊戲的第一道門，
過不了就完全玩不到。

---

## 2. 限制（決定了解法）

- **lab 的原始碼不在 repo**，只有 build 產物（`index-KdwXLll0.js` 等）→ 改不了它的內部
- **iframe 同源** → 父層可以注入樣式
- **`bridge.js` 只送 `ready` / `frame{tip,confidence}` / `gesture{shape}`**，
  **不送「目前第幾步」** → 逐步校準指引**只有 lab 知道**

第三點是關鍵：我們沒有能力重寫步驟指引，所以**話語權必須交給 lab**，
我們只講它講不了的事。

---

## 3. 方案比較

| 方案 | 做法 | 為什麼不選 |
|---|---|---|
| A 把卡片字變小 | 純視覺 | 沒解決兩套教學打架，只是把噪音變小聲 |
| B 全部自己重寫 | 父層做完整校準 UI | bridge 不送步驟事件，做不到；要改 Ivan 的檔 |
| **C 注入樣式 + 切分話語權** ✅ | 關掉除錯介面、只留 `.stage-wrap`；我們的面板只留狀態／符文／入口 | — |

**選 C 的代價**：依賴 lab 的 DOM 結構（`.shell > header` 等選擇器）。
Ivan 重 build 若改了結構，注入會失效 —— 但失效的後果是「回到現在這個樣子」，
不是壞掉，可接受。

---

## 4. 決定

**版面：舞台式。** 相機收成畫面上半置中的一塊，面板在下緣置中、寬度與舞台對齊，
兩者讀起來是同一個東西的上下兩半。

**留下 / 關掉**

```
section.shell
  header / .toolbar / .record-bar / aside.hud / footer   → 關（?debug=1 開回）
  .stage-wrap                                            → 留（相機 · 逐步指引 · 筆畫）
    #tip-state / #shape-test                             → 關（我們用玩家的語言講一次）
```

**面板只有四件事**：狀態一行 · 兩個符文 · 兩顆按鈕 · 筆尖指示。
原本的 kicker、標題、整段說明全部刪除。

**狀態一行只描述「還差什麼」，不下跟校準步驟有關的指令。**
lab 在 Step 0 會叫你把筆移出畫面 —— 我們若同時喊「把筆舉起來」就是互相矛盾。
筆尖指示因此是**中性回報**（偵測中／尚未偵測到），不是命令。

**顏色**：注入的值從 `tokens.css` 讀出後帶進 iframe，不寫死 —— 色票改了會跟著變。

---

## 5. Gate（scoped：anti-AI · a11y · mobile）

| 檢查 | 結果 |
|---|---|
| B6 對比 | `--parchment` 15.55:1 · `--struct-lit` 6.88:1 · `--dim` 5.01:1 · `--me` 8.39:1 — **全過** |
| WCAG 1.4.11 非文字元件 | 圓點原本用 `--ash` = **1.73:1 不足**，已改 `--dim` = 5.01:1 ✅ |
| B7 reduced-motion | 已加 `@media (prefers-reduced-motion: reduce)` ✅ |
| B9 觸控目標 | 按鈕 `min-height: 2.75rem` = 44px ✅ |
| B12 圓角 | 全案 `--radius: 2px`，注入時把 lab 的 10px 圓角一併改掉 ✅ |
| B1 紫藍 CTA | 未使用，CTA 是 `--me` 金 ✅ |
| B3 字體聲部 | 未新增字體 ✅ |
| 五態 | loading（正在啟動相機）· 進行中 · 成功（都通過）· **error 未處理** ⚠️ |
| 反通用測試 | 符文字形本身是說明、色票與遊戲同源、話語權切分是這個專案獨有的限制推出來的 ✅ |

### 開放中的問題

1. **⚠️ error 態沒做。** 相機被拒時 lab 顯示
   `Could not start camera — NotAllowedError: Permission denied`。
   `NotAllowedError` 這種字眼評審看到會以為壞掉。bridge 不送 error 事件，
   父層無從得知 —— 要修得動 `bridge.js`（Ivan 的檔）。
   **這是目前最大的 demo 風險。**
2. `#tracking-box` 的「PUT ONLY THE COLOURED TIP…」在無相機時被舞台右緣裁切。
   有相機時位置應該正確，但未實測。
3. lab 內部文案仍是英文，與面板的中文並存。

**結論：PASS WITH OPEN WARNINGS。** 沒有 BLOCK 級缺陷；上列三項為已知未解。
