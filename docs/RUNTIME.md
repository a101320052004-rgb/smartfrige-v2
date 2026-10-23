# AI食代 SmartFridge Runtime 說明

最後更新：2026-06-25

目前正式部署不是舊的 Flask/MySQL Docker 架構，而是 Vercel + Supabase 架構。

## 正式 Runtime

- 前端：React + Vite，部署在 Vercel。
- API：Vercel Serverless Functions，主要邏輯在 `serverless-handler.ts`。
- 資料庫：Supabase Postgres。
- 登入：Supabase Auth。
- 前端 Supabase client：`src/lib/supabase.ts`。
- 前端 API 包裝：`src/lib/api.ts`。
- Vercel API route：只保留 `api/[...path].ts` 單一 catch-all function，所有 `/api/...` 都交給 `serverless-handler.ts` 分派。
- Supabase schema / RLS / trigger：`supabase/rls.sql`，需要手動貼到 Supabase SQL Editor 執行。

## 正式會讀取的檔案

- `src/`
- `api/[...path].ts`
- `serverless-handler.ts`
- `index.html`
- `vite.config.ts`
- `package.json`
- `package-lock.json`
- `assets/`
- `supabase/rls.sql`
- `vercel.json`

## 正式不會讀取的舊架構

以下檔案保留作為本機或歷史參考，Vercel 正式部署不會讀取：

- `legacy/flask-docker/app/`
- `legacy/flask-docker/env/mysql/`
- `legacy/flask-docker/env/flask/`
- `legacy/flask-docker/env/nginx/`
- `legacy/flask-docker/docker-compose.yml`
- `docs/collaboration/ARCHITECTURE.md` 裡的部分舊 Flask/MySQL 說明
- `docs/collaboration/` 裡的部分舊架構文件

## 必要環境變數

Vercel Project Settings > Environment Variables 至少需要：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `APP_URL`
- `CRON_SECRET`（選用，但正式環境建議設定）

本機開發使用 `.env.local`。`.env`、`.env.local`、`secrets/` 不可以上傳 GitHub。

## Auth 現況

- Email + 密碼登入：Supabase Auth + `users` profile table。
- 忘記密碼：Supabase Auth recovery email。
- Gmail 驗證碼登入：Supabase Email OTP。
- Gmail OTP 不走 Gmail SMTP。Supabase `Authentication > Emails > Templates > Magic Link` 必須包含 `{{ .Token }}`，使用者才會看到驗證碼；長度以 Supabase 後台設定為準，前端目前接受 6 到 9 碼。

建議 Magic Link 文字：

```text
你的 AI食代 SmartFridge 登入驗證碼是：{{ .Token }}

如果不是你本人操作，請忽略這封信。
```

## Serverless 功能

以下功能不能直接放前端，必須走 Vercel Serverless Functions：

- Gemini / AI 食譜生成
- AI 拍照辨識
- 圖片生成
- 爬蟲比價
- 需要 service-role key 的資料庫維護
- 通知同步 API

## 通知同步

`vercel.json` 設定了 Vercel Cron：

- `/api/notifications/sync-expiry`
- 每天 UTC 01:00 執行一次，也就是台灣時間 09:00。

這個排程用來同步即期食材通知。

如果 Vercel 有設定 `CRON_SECRET`，Cron request 需要帶：

```text
Authorization: Bearer <CRON_SECRET>
```

## 食材移除紀錄

- 已吃完：寫入 `ingredient_removal_history`，`status = eaten`。
- 過期：寫入 `ingredient_removal_history`，`status = expired`。
- 丟掉：寫入 `ingredient_removal_history`，`status = wasted`。
- UI 和資料庫保留 180 天。

## AI 可儲天數規則

如果修改 AI 拍照辨識的可儲天數邏輯，務必同步檢查：

- `serverless-handler.ts` 的 `PRODUCE_SHELF_LIFE_DAYS`
- PDF 原始來源：`docs/references/生鮮蔬果建議儲運溫度參考資料.pdf`

規則：

- Gemini 有回可儲天數時優先使用 Gemini。
- Gemini 沒回時，使用 PDF 參考表。
- Gemini 和 PDF 都沒有時，前端欄位保持空白，讓使用者自行填寫。
- 找不到價格時，顯示「無」。
