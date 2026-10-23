# 技術複習筆記

這份筆記整理這個專案用到的核心觀念，每一節都附上程式所在位置，方便回頭對照。
建議閱讀順序：先看第 1 節的請求流程，再挑有興趣的功能看。

---

## 1. 一個請求怎麼走完全程

```
瀏覽器（React）
  │  src/lib/api.ts 發出 fetch('/api/scan', …)，帶上 Supabase 登入 token
  ▼
Vercel
  │  vercel.json 把所有 /api/* 改寫到 api/[...path].ts
  ▼
api/[...path].ts  ──►  serverless-handler.ts 的 handler()
  │  把網址拆成 segments，例如 ['scan']，用 if 判斷交給對應函式
  ▼
scanIngredients() ──► Gemini API ──► 回傳 JSON 給前端
```

**為什麼只用一個 catch-all 檔案？**
Vercel 免費方案（Hobby）有 Serverless Function 數量上限。每個 `api/*.ts` 都算一個 function，所以把全部路由收進一個入口，再自己分派。

**複習重點**：`serverless-handler.ts` 開頭的 `handler()` 就是一張手寫的路由表，可以和 Express 的 `app.get('/scan', …)` 對照著理解。

---

## 2. 為什麼 AI 金鑰不能放前端

前端程式碼會整包下載到使用者的瀏覽器，任何人按 F12 都看得到。所以：

- `VITE_` 開頭的環境變數會被打包進前端，**只能放公開的值**（Supabase URL、anon key）
- `GEMINI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 只能在 Serverless 端用 `process.env` 讀

**複習重點**：`.env.example` 裡哪些有 `VITE_` 前綴、哪些沒有，以及原因。

---

## 3. 登入與資料隔離：Supabase Auth + RLS

### 登入
前端用 Supabase Auth 登入後會拿到一個 access token（JWT）。呼叫後端時放在 `Authorization: Bearer <token>`。
後端的 `requireSupabaseProfile()` 會拿這個 token 去問 Supabase「這是誰」，再找出（或建立）對應的 `users` 資料。

### RLS（Row Level Security，逐列權限）
就算前端直接查資料庫，也只能看到自己的資料，因為規則寫在資料庫層：

```sql
-- supabase/rls.sql
create policy "ingredients_owner_all"
on public.ingredients
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = ingredients.user_id
      and u.auth_user_id = (select auth.uid())   -- 只有自己的食材
  )
);
```

**為什麼重要**：權限檢查放在資料庫，就不怕後端哪支 API 忘記加 `where user_id = ?`。

**兩種金鑰的差別**
| 金鑰 | 會不會受 RLS 限制 | 用在哪 |
|------|------|------|
| anon key + 使用者 token | 會，只看得到自己的 | 一般 API |
| service_role key | 不會，看得到全部 | 排程（要掃所有使用者）|

**延伸閱讀**：[`資安詳解.pdf`](資安詳解.pdf) 有密碼雜湊（PBKDF2 + salt）、簽章 Cookie 等五大機制的逐行說明。

---

## 4. AI 拍照辨識（`scanIngredients`）

流程：圖片轉 base64 → 連同 prompt 送 Gemini → 要求回 JSON → **後端再驗證一次**。

### Prompt 設計技巧
- 明確規定輸出格式：`只回傳 JSON，不要使用 Markdown`
- 限定欄位值：`category must be one of: grains, vegetables, …`
- **不確定就回 null，不要猜**：看不出保存期限時 `daysLeft` 回 `null`
- `temperature: 0.1`：辨識任務要穩定，不要創意

### 不要完全相信 AI 的輸出
AI 回來的東西都要過一遍正規化：

```ts
// serverless-handler.ts
daysLeft: safeDaysLeft(item.daysLeft, storageType, category)
          ?? referenceDaysLeft(String(item.name || ''), category, storageType),
```

- `safeDaysLeft`：限制範圍（冷藏最多 30 天、冷凍 180 天、常溫 365 天，水果最多 14 天）
- `referenceDaysLeft`：AI 沒給天數時，改查 `PRODUCE_SHELF_LIFE_DAYS` 對照表（資料來源：[`references/`](references/) 裡的蔬果儲運溫度參考資料）
- `??`（nullish coalescing）：左邊是 `null` / `undefined` 才用右邊

---

## 5. 快過期提醒與排程（`syncExpiryNotifications`）

```json
// vercel.json
"crons": [
  { "path": "/api/notifications/sync-expiry", "schedule": "0 1 * * *" },
  { "path": "/api/prices/sync",               "schedule": "0 2 * * *" }
]
```

- Cron 格式 `分 時 日 月 週`，`0 1 * * *` = 每天 UTC 01:00 = **台灣 09:00**（台灣是 UTC+8）
- 排程以 service_role 身分跑 `syncAllExpiryNotifications()`，逐一處理每個使用者；單一使用者失敗不會中斷整批（`try/catch` 收進 `failures`）

**避免重複通知**：先查今天已經發過哪些食材（`alreadyNotified` 這個 `Set`），只新增還沒通知過的。

**保護排程網址**：`ensureCronRequest()` 檢查 `Authorization: Bearer <CRON_SECRET>`，避免任何人都能觸發。

---

## 6. 爬蟲比價：什麼該交給 AI、什麼不該

這是專案最重要的設計判斷：

| 任務 | 用什麼 | 原因 |
|------|--------|------|
| 抓價格 | 程式（爬蟲） | 規則固定，AI 只會更慢更貴 |
| 比便宜 | SQL / 程式 | 比大小不需要「理解」 |
| 品名對齊 | 規則式程式 | 原本想用 AI，實作後發現正規表達式就夠，還省 token |
| 看圖辨識、寫食譜 | AI | 真的需要理解語意或圖像 |

品名正規化範例（`normalizePriceName`、`removeUnits`）：

```
「光泉鮮乳 (936ml)」
  → 去括號    → 「光泉鮮乳 936ml」
  → 去單位    → 「光泉鮮乳」          ← 用來搜尋與比對
  → 抽出單位  → ["936ml"]            ← 用來算單價
```

每天的比價排程 `syncPriceWatchlist()` 會抓 6 個常見食材 × 3 個通路，存進 `price_records`，累積成價格時間序列。

---

## 7. 前端：React 狀態與 PWA

- 每個分頁是一個 View 元件（`src/components/*View.tsx`），共用狀態放在 `App.tsx`
- 所有對後端的呼叫集中在 `src/lib/api.ts`，元件裡不直接寫 `fetch`
- **PWA**：`public/manifest.webmanifest` + `index.html` 的 meta 標籤，讓手機「加到主畫面」後像 App 一樣全螢幕開啟
- **iOS 瀏海／底部橫條**：用 CSS `env(safe-area-inset-top)` 留出安全區（`src/index.css`）

---

## 8. 架構演進：從 Flask 到 Serverless

| | 初版（`legacy/flask-docker/`） | 正式版 |
|---|---|---|
| 後端 | Flask（Python），依功能分資料夾 | Vercel Serverless（TypeScript） |
| 資料庫 | MySQL，跑在 Docker | Supabase Postgres（雲端） |
| 登入 | Flask session | Supabase Auth |
| 權限 | 每支 API 自己檢查 user_id | 資料庫 RLS |
| 部署 | `docker compose up`，只能本機 | push 到 GitHub 自動部署 |

**為什麼換**：Docker 版只能在自己電腦跑，評審和使用者無法實際操作；Serverless + 託管資料庫不用自己管伺服器，免費額度也夠學生專案用。

**複習方法**：比較 `legacy/flask-docker/app/features/scan/` 和 `serverless-handler.ts` 的 `scanIngredients()`，同一個功能用兩種架構怎麼寫。

---

## 9. 團隊協作的做法

- **共同合約**（[`collaboration/ARCHITECTURE.md`](collaboration/ARCHITECTURE.md)）：資料表欄位、API 格式、命名規則先講好。DB 用 `snake_case`、API 回傳用 `camelCase`
- **每個檔案只有一個主人**：依功能切資料夾，平行開發不衝突
- **跟 AI 協作的鐵則**：每次開新對話先貼合約，不讓 AI 自己發明欄位
- **Branch → PR → Review → 合併 → 寫 CHANGELOG**

---

## 自我測驗

1. 為什麼 `GEMINI_API_KEY` 不能加 `VITE_` 前綴？
2. RLS 和「在 API 裡寫 `where user_id = ?`」差在哪？哪個比較安全？
3. 排程為什麼要用 service_role key？這把 key 外洩會怎樣？
4. `0 1 * * *` 為什麼是台灣早上 9 點？
5. 為什麼品名比對最後沒有用 AI？
6. Gemini 回傳的 `daysLeft` 是 999 時，系統會存成多少？
