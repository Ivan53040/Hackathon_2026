# backend tracking test

這是一個可獨立執行的 WandFrame 魔杖追蹤測試 backend。它使用 Node.js 提供已編譯的測試頁；webcam、筆尖追蹤及圖形辨識仍在玩家瀏覽器內執行。

## 啟動

需要 Node.js 20 或以上，不需要安裝 npm 套件。

```powershell
cd backend-tracking-test
npm start
```

然後開啟：

- 測試頁：<http://127.0.0.1:4180/>
- 健康檢查：<http://127.0.0.1:4180/health>

在 `localhost` 或 `127.0.0.1` 上，瀏覽器可以透過 HTTP 使用 webcam。若部署至另一部電腦或公開網域，必須使用 HTTPS。

## 操作

1. 完成背景、人物 mask 與筆尖校準。
2. 按住 `Shift` 並畫圖形。
3. 放開 `Shift` 後立即判定。
4. 只測試 5 種單筆姿勢：Z、橫線、m（雙拱）、arc（單拱）及 star。

圖片中的兩個三角形共用 Triangle 測試。新增的圖片手勢採用方向敏感的單筆模板，因此左右箭嘴會分開判斷。J Hook 已移除，Z 只按標準 Z 字判斷。

全畫面測試期間，筆跡只會在按住 `Shift` 後出現；放開後保留約 0.9 秒顯示判定結果，之後自動清除。橫線只接受接近水平方向的筆劃；星形要求較完整的內外角交替及至少七個明顯轉折。

## 設定

```powershell
$env:PORT = '4180'
$env:TRACKING_HOST = '127.0.0.1'
npm start
```

如要自行提供 HTTPS，設定兩個絕對路徑：

```powershell
$env:TRACKING_TLS_KEY = 'C:\certs\tracking-key.pem'
$env:TRACKING_TLS_CERT = 'C:\certs\tracking-cert.pem'
npm start
```

## API

`GET /health` 回傳 backend 狀態、版本、輸入方法及支援圖形。

## 注意

此封裝使用目前保存下來的編譯版本。原始 TypeScript 工作區先前被外部同步移除，因此本資料夾適合測試及交付執行，不應當作完整原始碼備份。
