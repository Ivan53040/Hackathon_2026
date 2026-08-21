# Hackathon_2026 — RUNESPIRE

##Date: 21/08/2026

> 兩名法師，一層場地，中間隔空。左手 A/D 走位，右手拿筆在鏡頭前畫符文。
> 兩個符文：**△ 攻擊、□ 建造**。血量不回、魔量自動回。
> 你蓋的牆會擋下他的攻擊——**也會擋下你自己的**。要開火就得走出去。
> 5 人 / 36 小時 / 目標：台上兩台筆電對決，觀眾看得懂、想排隊玩。

## 計劃文件

| 文件 | 內容 |
|---|---|
| [frontend/PLAN.md](frontend/PLAN.md) | 前端規格 **v4**：遊戲規格（單層/兩符文/魔量/遮蔽物）、tracking / runes / match / scene / pages、效能預算、前端風險 |
| [frontend/CHECKLIST.md](frontend/CHECKLIST.md) | 前端逐 Block 打勾清單、里程碑 M0–M7、上台檢查表 |
| [backend/PLAN.md](backend/PLAN.md) | 後端規格 **v4**：伺服器、WebSocket 協定（含 covers/mp）、斷線降級、部署（HTTPS/WSS） |
| [backend/CHECKLIST.md](backend/CHECKLIST.md) | 後端打勾清單與驗收表 B1–B15 |
| [.design/](.design/) | 設計流程：brief / 問題定義 / 旅程與資訊層級（角色 D） |
| [rules.md](rules.md) | AI 協作與 Git 規範（**AI 不得 commit / push**） |

## 三條鐵律

1. 每 4 小時 merge 一次 main
2. H+30 功能凍結
3. 卡住超過 45 分鐘必須開口
