# AI食代 SmartFridge — 系統架構 & 分工說明

> **這份文件是後端開發階段的「共同合約」。**
> 五個人各自跟 AI 工作前，請先把這份文件貼給 AI，確保大家從同一個起點出發、做出來的東西接得起來。
>
> 最後更新：2026-06-11 ｜ 階段：UI 定稿完成、資料庫結構（10 表）定案，準備進入後端 API

---

## 一、我們現在在哪、要去哪

```
現在（v2 前端原型）                  目標（v3 全端 + 容器化）
━━━━━━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
React 前端                    →     React 前端（改呼叫 API）
localStorage 假資料           →     MySQL 真實資料庫
無後端                        →     Flask API 伺服器
本機 npm run dev              →     Docker Compose 一鍵啟動
```

目標：把現在存在瀏覽器 localStorage 的假資料，換成存在 MySQL，中間用 Flask API 串接，整套用 Docker 跑起來。

---

## 二、系統架構

```
        瀏覽器
          │  HTTP 請求
          ▼
   ┌─────────────┐
   │    Nginx    │  port 80
   │  （反向代理）│
   └──────┬──────┘
          │
    ┌─────┴─────────────────────┐
    │                           │
    ▼                           ▼
 /static/*                   /api/*
 前端打包檔（dist/）       轉發給 Flask
                               │
                               ▼
                        ┌─────────────┐
                        │    Flask    │  API 邏輯
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │    MySQL    │  資料儲存
                        └─────────────┘
```

**重點：Nginx、Flask、MySQL 三個都是 Docker 容器。**
你不需要在電腦上安裝 MySQL，`docker compose up` 就會把三個一起啟動。

| 服務 | 角色 | 說明 |
|------|------|------|
| Nginx | 門口接待 | 把前端網頁給瀏覽器，`/api/*` 的請求轉給 Flask |
| Flask | 後端大腦 | 處理 API 邏輯、跟資料庫溝通 |
| MySQL | 倉庫 | 儲存所有資料（使用者、食材、食譜…） |

---

## 三、資料庫設計（MySQL）

> 命名規範：**資料庫欄位一律 `snake_case`**（SQL 慣例）。
> API 回傳的 JSON 一律 **`camelCase`**（配合現有前端 TypeScript）。
> Flask 負責中間轉換。每張表下方都附「DB 欄位 ↔ API 欄位」對照，照著做就不會接錯。

### 📁 結構與測試資料「分兩個檔」（重要）

| 檔案 | 內容 | 正式上線時 |
|------|------|-----------|
| `env/mysql/01-schema.sql` | **只放結構**（CREATE TABLE / 外鍵 / 索引） | ✅ 保留 |
| `env/mysql/02-seed.sql` | **只放測試假資料**（demo / amber 等） | ❌ 拿掉這支即可變空庫 |

- docker-entrypoint 依**檔名排序**先跑 `01-`（建表）再跑 `02-`（灌資料）。
- 正式用：把 `docker-compose.yml` 裡 `02-seed.sql` 那行掛載刪掉／註解，結構完全不動。
- seed 的所有外鍵都用「子查詢抓 id」（`SELECT id FROM users WHERE username='demo'`），**不寫死數字**，保證關聯永遠正確。
- ⚠️ init 腳本只在資料庫**第一次初始化**時跑。改完要重套：`docker compose down -v` 清掉 volume 再 `up`。

### 🗺️ 資料表關聯總覽（ER）

```
users ─┬─< ingredients ──────────────┐（補貨來源）
       ├─1:1─ user_settings           │
       ├─< recipes ─┬─< recipe_ingredients
       │            ├─< recipe_steps
       │            ├─< recipe_likes >─┐
       │            └─< recipe_saves >─┤（多對多，另一端接回 users）
       ├─< shopping_items >───────────┘（linked_ingredient_id → ingredients）
       ├─< notifications ──→ ingredients（提醒指向某食材）
       └─< follows（自我多對多：follower / followed）

price_records（獨立，不綁 user）── 爬蟲寫入的「公開市場價」時間序列

「─<」= 一對多　「>─」= 多對多的另一端　「1:1」= 一對一
```

### 1. `users`（使用者）

| DB 欄位 | 型別 | 說明 |
|---------|------|------|
| `id` | INT PK AI | 主鍵 |
| `username` | VARCHAR(50) UNIQUE | 帳號 |
| `password_hash` | VARCHAR(255) | 加密後的密碼（**絕不存明碼**） |
| `chef_name` | VARCHAR(50) | 主廚名稱 |
| `chef_rank` | VARCHAR(20) | 主廚等級（依分享數推算後快取） |
| `created_at` | DATETIME | 建立時間 |

### 2. `user_settings`（個人化設定，與 users 一對一）

> 收納原本散在 localStorage 的設定，一個使用者一列（`user_id` 同時是 PK 也是 FK）。

| DB 欄位 | 型別 | API 欄位 | 對應 localStorage |
|---------|------|---------|------------------|
| `user_id` | INT PK FK→users | — | — |
| `theme` | VARCHAR(20) | `theme` | `smartfridge-theme` |
| `expiry_reminder_days` | INT | `expiryReminderDays` | `smartfridge-expiry-reminder-days` |
| `expiry_push_time` | VARCHAR(10) | `expiryPushTime` | `smartfridge-expiry-push-time` |
| `tour_seen` | BOOLEAN | `tourSeen` | `smartfridge-tour-seen` |
| `restock_defaults_set` | BOOLEAN | `restockDefaultsSet` | `smartfridge-restock-defaults` |

### 3. `ingredients`（食材庫）

| DB 欄位 | 型別 | API 欄位（camelCase） |
|---------|------|----------------------|
| `id` | INT PK AI | `id` |
| `user_id` | INT FK→users | （後端用，不外露） |
| `name` | VARCHAR(100) | `name` |
| `category` | VARCHAR(20) | `category` |
| `qty` | VARCHAR(50) | `qty` |
| `storage_type` | ENUM('fridge','freezer','pantry') | `storageType` |
| `days_left` | INT | `daysLeft` |
| `total_days` | INT | `totalDays` |

### 4. `recipes`（食譜：社群 + AI 配餐收藏）

| DB 欄位 | 型別 | API 欄位 |
|---------|------|---------|
| `id` | INT PK AI | `id` |
| `author_id` | INT FK→users | `author.id` |
| `name` | VARCHAR(100) | `name` |
| `description` | TEXT | `description` |
| `full_content` | TEXT | `fullContent` |
| `image_url` | VARCHAR(500) | `image` |
| `prep_time` | INT | `prepTime` |
| `rating` | DECIMAL(2,1) | `rating` |
| `origin` | ENUM('ai','manual') | `origin` |
| `is_public` | BOOLEAN | `isPublic` |
| `created_at` | DATETIME | `createdAt` |

> 步驟與食材清單「正規化」到子表（不是塞 JSON）：

**4a. `recipe_ingredients`**（食譜食材，多列）：`id` / `recipe_id` FK→recipes / `ord`(排序) / `name` → API 組成 `ingredients: string[]`
**4b. `recipe_steps`**（烹飪步驟，多列）：`id` / `recipe_id` FK→recipes / `step_no` / `content` → API 組成 `steps: string[]`

### 5. `recipe_likes`（按讚 ❤️，使用者 ↔ 食譜 多對多）

| DB 欄位 | 型別 | 說明 |
|---------|------|------|
| `user_id` | INT FK→users | 誰按讚 |
| `recipe_id` | INT FK→recipes | 哪道菜 |
| `created_at` | DATETIME | 按讚時間 |

> 主鍵 `(user_id, recipe_id)` 複合鍵防重複按讚。`COUNT(*)` 即該食譜讚數 → API 的 `likes`。

### 6. `recipe_saves`（收藏 / AI 配餐收藏，使用者 ↔ 食譜 多對多）

| DB 欄位 | 型別 | 說明 |
|---------|------|------|
| `user_id` | INT FK→users | 誰收藏 |
| `recipe_id` | INT FK→recipes | 收藏哪道 |
| `created_at` | DATETIME | 收藏時間 |

> 主鍵 `(user_id, recipe_id)`。對應前端「收藏」與配餐頁「AI 配餐收藏」→ API 的 `saved`。

### 7. `shopping_items`（採購清單）

| DB 欄位 | 型別 | API 欄位 |
|---------|------|---------|
| `id` | INT PK AI | `id` |
| `user_id` | INT FK→users | （後端用） |
| `name` | VARCHAR(100) | `name` |
| `category` | VARCHAR(20) | `category` |
| `qty` | INT | `qty` |
| `unit` | VARCHAR(20) | `unit` |
| `price_px` | INT | `pricePX`（全聯） |
| `price_carrefour` | INT | `priceCarrefour`（家樂福） |
| `price_amart` | INT | `priceAMart`（美廉社） |
| `source` | ENUM('seed','manual','restock') | `source` |
| `linked_ingredient_id` | INT FK→ingredients NULL | `linkedIngredientId` |

> **三通路比價（單品）**：全聯 / 家樂福 / 美廉社。這三欄存的是「使用者把這項加入採購清單當下的價格快照」；
> 而**即時抓取的歷史價、跨通路趨勢比價**走獨立的 `price_records`（爬蟲表，見第 9 張）。兩者分工：`shopping_items` = 我的採購清單、`price_records` = 市場價資料庫。
> `linked_ingredient_id`：補貨品連回冰箱裡的食材；該食材被刪時 `ON DELETE SET NULL`（採購品保留、只斷連結）。

### 8. `follows`（追蹤關係，使用者 ↔ 使用者 多對多）

| DB 欄位 | 型別 | 說明 |
|---------|------|------|
| `follower_id` | INT FK→users | 誰按了追蹤 |
| `followed_id` | INT FK→users | 被追蹤的主廚 |
| `created_at` | DATETIME | 追蹤時間 |

> 主鍵：`(follower_id, followed_id)` 複合鍵，避免重複追蹤。

### 9. `price_records`（通路價格時間序列 ── 爬蟲寫入的「大數據」表）

> 這張**不綁特定使用者**（公開市場價，全體共用）。爬蟲每次抓三通路就插一批列，靠 `crawled_at` 時間戳累積出「價格趨勢」與「跨通路比價」。

| DB 欄位 | 型別 | API 欄位 | 說明 |
|---------|------|---------|------|
| `id` | INT PK AI | `id` | |
| `channel` | ENUM('px','carrefour','amart') | `channel` | 全聯 / 家樂福 / 美廉社 |
| `item_name` | VARCHAR(100) | `itemName` | 爬到的原始商品名 |
| `norm_name` | VARCHAR(100) | `normName` | **AI 對齊後**的標準品名（跨通路比對的關鍵） |
| `price` | INT | `price` | 售價（整數元） |
| `unit` | VARCHAR(20) | `unit` | 每包 / 每斤 / 每瓶… |
| `source_url` | VARCHAR(500) | `sourceUrl` | 來源網址（佐證、可回查） |
| `crawled_at` | DATETIME | `crawledAt` | 抓取時間（時間序列關鍵欄位） |

> **為什麼要存歷史、不只存「最新一筆」？** 因為功能②要的是「**趨勢**」——這週牛奶比上週貴 8%、現在是不是低點該買，這些都得有時間序列才算得出來。這就是這張表的「大數據」價值，也是這個專案最有份量的地方。

### 10. `notifications`（推播提醒紀錄）── 屬於某使用者

> 記錄「已推播過的提醒」，避免同一項食材每天重複轟炸；同時當作 App 內的「通知中心」歷史。

| DB 欄位 | 型別 | API 欄位 | 說明 |
|---------|------|---------|------|
| `id` | INT PK AI | `id` | |
| `user_id` | INT FK→users | （後端用） | |
| `type` | ENUM('expiry','restock') | `type` | 快過期提醒 / 採購補貨推薦 |
| `ingredient_id` | INT FK→ingredients NULL | `ingredientId` | 觸發提醒的食材 |
| `title` | VARCHAR(200) | `title` | |
| `body` | TEXT | `body` | 內文（含 AI 產生的補貨建議文字） |
| `is_read` | BOOLEAN | `isRead` | 已讀 |
| `created_at` | DATETIME | `createdAt` | |

---

## 三之二、按鈕 → 資料表 稽核（每個會「存東西」的動作都有家）

> 對照前端目前用 localStorage 暫存的所有狀態，確認接 API 後每個都有對應資料表。

| 前端頁面 / 按鈕 | 動作 | 對應資料表 | 雙軌等級徽章來源 |
|----------------|------|-----------|-----------------|
| 食材頁 新增/編輯/刪除食材 | 寫食材 | `ingredients` | — |
| 食材頁 AI 拍照辨識 | Gemini → 暫存 → 確認新增 | `ingredients`（確認後） | — |
| 採購頁 登記待買 / 編輯數量 / 刪除 | 寫採購 | `shopping_items` | — |
| 採購頁 三通路比價（單品最低價） | 讀三個價欄 | `shopping_items.price_*` | — |
| 採購頁 補貨（連回食材） | 寫採購 + 連結 | `shopping_items.linked_ingredient_id` | — |
| 食材頁 快過期推播提醒 | 偵測 days_left → 寫提醒 | `notifications`(type=expiry) | — |
| 採購頁 自動補貨推薦（快過期→建議買） | AI 產生建議 → 寫提醒 + 採購 | `notifications`(type=restock) + `shopping_items`(source=restock) | — |
| 採購頁 爬蟲抓即時價 / 歷史趨勢 / 跨通路比價 | 爬蟲寫入 + AI 對齊品名 | `price_records` | — |
| 社群 按讚 ❤️ | toggle | `recipe_likes` | — |
| 社群 收藏 ⭐ | toggle | `recipe_saves` | — |
| 社群 / 配餐頁 上傳·分享食譜 | 寫食譜 | `recipes`(+`recipe_steps`/`recipe_ingredients`) | 原創軌（origin=manual）|
| 配餐頁 AI 配餐收藏分享 | 寫食譜 | `recipes`(origin=ai) | AI 軌（origin=ai）|
| 社群 追蹤 / 取消追蹤主廚 | toggle | `follows` | — |
| 主廚稱號徽章 | 即時計算，不另存 | `COUNT(recipes WHERE author_id=? AND is_public AND origin)` | ← 由 recipes 推算 |
| 設定 主題色 / 到期提醒天數 / 推播時間 | 寫設定 | `user_settings` | — |
| 新手導覽看過 | 寫設定 | `user_settings.tour_seen` | — |

> **雙軌徽章不需要新欄位**：原創數 = `recipes` 中 `is_public=1 AND origin='manual'` 的筆數；
> AI 數 = `origin='ai'` 的筆數。即時 `COUNT` 算出來即可（`chefTier.ts` 的邏輯搬到後端 SQL）。

---

## 四、API 規格

### 統一回傳格式（**所有 API 都遵守**）

成功：
```json
{ "success": true, "data": { ... } }
```

失敗：
```json
{ "success": false, "error": "找不到該食材", "code": 404 }
```

> 這條最重要：五個人的 API 錯誤格式必須一模一樣，前端才能統一處理。

### 端點清單

| 區塊 | 方法 + 路徑 | 用途 |
|------|------------|------|
| **Auth** | `POST /api/register` | 註冊 |
| | `POST /api/login` | 登入 |
| | `POST /api/logout` | 登出 |
| **食材** | `GET /api/ingredients` | 取得我的食材列表 |
| | `POST /api/ingredients` | 新增食材 |
| | `PUT /api/ingredients/<id>` | 編輯食材 |
| | `DELETE /api/ingredients/<id>` | 刪除食材 |
| **食譜** | `GET /api/recipes` | 取得社群食譜列表 |
| | `POST /api/recipes` | 新增 / 上傳食譜 |
| | `PUT /api/recipes/<id>` | 編輯食譜 |
| | `DELETE /api/recipes/<id>` | 刪除食譜 |
| | `GET /api/recipes/saved` | 我收藏的食譜 |
| | `POST /api/recipes/<id>/save` | 收藏一道食譜（寫 `recipe_saves`） |
| | `DELETE /api/recipes/<id>/save` | 取消收藏 |
| | `POST /api/recipes/<id>/like` | 按讚（寫 `recipe_likes`） |
| | `DELETE /api/recipes/<id>/like` | 收回讚 |
| **設定** | `GET /api/settings` | 取得我的個人化設定（`user_settings`） |
| | `PUT /api/settings` | 更新主題 / 到期提醒 / 推播時間 / 導覽 |
| **採購** | `GET /api/shopping` | 取得採購清單 |
| | `POST /api/shopping` | 新增採購項目 |
| | `PUT /api/shopping/<id>` | 編輯數量 |
| | `DELETE /api/shopping/<id>` | 移除項目 |
| **社群** | `GET /api/follows` | 我追蹤的主廚列表 |
| | `POST /api/follows` | 追蹤某主廚 |
| | `DELETE /api/follows/<id>` | 取消追蹤 |
| | `GET /api/users/<id>/recipes` | 某主廚的公開食譜 |
| **提醒** | `GET /api/notifications` | 取得我的提醒列表（通知中心） |
| | `POST /api/notifications/check` | 掃我的食材→產生快過期提醒（避免重複）；也回傳該補貨的清單 |
| | `PUT /api/notifications/<id>/read` | 標記已讀 |
| **比價 / 爬蟲** | `GET /api/prices?name=<品名>` | 某品項三通路即時最低價 + 歷史趨勢（讀 `price_records`） |
| | `POST /api/prices/crawl` | 觸發爬蟲抓三通路 → AI 對齊品名 → 寫入 `price_records`（排程或手動） |
| | `GET /api/prices/compare?items=a,b,c` | 一籃子採購的跨通路比價（哪家整體最便宜） |
| **AI（Gemini）** | `POST /api/scan` | 上傳照片 → Gemini 辨識食材 → 回傳食材清單 |
| | `POST /api/recipes/generate` | **依冰箱現有食材** → Gemini 產生配餐建議 |
| | `POST /api/restock/suggest` | 依快過期食材 + 最新爬蟲價 → Gemini 產生「該買什麼、去哪家買」建議 |

---

## 五、分工（依功能分，每個檔案只有一個主人）

> **分工最高原則：每個檔案只能有一個主人。** 後端各自待在自己的 `app/features/<功能>/` 資料夾，
> 前端每個頁面只歸一個人改。這樣大家平行開發、幾乎不會 git 衝突。

| 組別 | 人數 | 負責功能 | 後端資料夾（私人） | 前端頁面（私人） | 難度 |
|------|:---:|---------|------------------|----------------|:---:|
| **組 A** | **2 人** | 基礎建設 + 認證 + Gemini | `auth/`、`lib/gemini.py`、Docker、Nginx | AuthScreen、SettingsView | 🔴🔴🔴🔴🔴 |
| **組 B** | 1 人 | 食材 + AI 辨識 + 快過期提醒 + **爬蟲比價** | `ingredients/`、`scan/`、`notifications/`、`prices/` | DashboardView | 🔴🔴🔴🔴🔴 |
| **組 C** | 1 人 | 社群（食譜分享 + 追蹤 + 等級） | `recipes/`、`follows/` | CommunityView | 🔴🔴🔴🔴 |
| **組 D** | 1 人 | 採購 + AI 配餐 + 補貨推薦 | `shopping/`、`planner/`、`restock/` | ShoppingView、PlannerView | 🔴🔴🔴🔴 |

> **組 B 的食材 CRUD 已是現成範本（最省力），所以把功能②最重的「爬蟲 + 時間序列比價」交給組 B**——他們有餘裕、又能把整個專案最有份量的大數據功能扛起來。
> 功能②是「跨組接力」：組 B 偵測快過期 + 抓價（`notifications` / `prices`）→ 組 D 拿這些資料產生補貨清單與 AI 建議（`restock` / `shopping`）。組 D 是**呼叫**組 B 的 `GET /api/prices`、`GET /api/notifications/check`，不改組 B 的檔，不會 git 衝突。

**這版比舊版好在哪：**
- ✅ **`CommunityView.tsx` 現在只歸組 C 一人** —— 消除了原本「C、D 兩人同改一個複雜頁面」的最大衝突源。
- ✅ **`recipes` 表整個歸組 C** —— 一張表一個主人，社群分享與收藏邏輯不會被切成兩半。
- ✅ **營養頁跟食材同一人（組 B）** —— 營養數據本來就從食材推算，同一資料領域給同一人，零衝突。
- ✅ **設定頁跟認證同一人（組 A）** —— 登入與使用者設定本來就相關。

**為什麼組 A 兩人：** 它是地基，必須最先完成（其他人才能 `docker compose up`），含 Docker / Nginx / 認證機制 / Gemini 共用模組，最重。

> 🔗 **唯一的跨組依賴（不是衝突）：** 組 D 的 AI 配餐「收藏」會呼叫組 C 的 `POST /api/recipes/saved`。
> 這是「呼叫對方的 API」，**不是改對方的檔案**，不會 git 衝突；只要組 C 先把該 API 做好即可。

---

## 六、執行順序（六步）

```
【1】UI 定稿            ✅ 已完成
       │
【2】確認本文件         🟡 進行中（全組需確認 DB 欄位與 API 格式）
       │
【3】組A 建 Docker 環境  ✅ MySQL + Flask 骨架已建好、第一支 API 已接通
       │                  （docker-compose / env/mysql/01-schema.sql + 02-seed.sql / app/ 三層架構）
       ▼
【4】四組各自 branch 做後端  ⬜ 待開始（組B/C/D 同時進行，互不干擾）
       │
【5】前端改接 API        ⬜ localStorage 換成 fetch('/api/...')
       │
【6】整合測試、合回 main  ⬜ 全組
```

**鐵律：第 2 步沒全組確認，不准進第 4 步。**（避免各做各的接不起來）

> **目前可運行：** `docker compose up -d` → MySQL（10 表，結構 `01-schema.sql` + 測試資料 `02-seed.sql` 分檔）+ Flask。
> 啟動指令與資料夾結構詳見 [`README.md`](./README.md)。
>
> ✅ **食材（ingredients）已做成「從 DB 到畫面」完整範本**，其他組照抄即可：
> - 後端：`app/features/ingredients/` 完整 CRUD（GET/POST/PUT/DELETE），三層 routes → service → repository，全部 `@login_required` + `current_user_id()` 做資料隔離。
> - 前端：`src/lib/api.ts` 的 `ingredientsApi`（共用 `request()`）+ `App.tsx` 登入後 `list()` 載入 + `DashboardView` 增刪改接 API。
> - 其他頁面（採購、社群…）複製這條線的寫法即可，不必重新發明。

---

## 七、Git 分支策略

```
main                         ← 隨時可運行的穩定版
 ├── feature/infra-auth       ← 組A
 ├── feature/ingredients      ← 組B
 ├── feature/recipes          ← 組C
 └── feature/shopping-follow  ← 組D
```

- 每組從 `main` 切自己的 branch
- 做完發 **Pull Request**，由組 A（或指定整合者）review 後合回 `main`
- 合併前先 `git pull` 最新的 main，減少衝突

---

## 八、跟 AI 協作的鐵則

> 用 AI 分工完全可行，但前提是 **每個人的 AI 都讀同一份合約**。

1. **每次開新對話的第一句**：把這份 `ARCHITECTURE.md` 貼給 AI，說「請先讀這份規格，我負責 ○○ 功能」
2. **欄位命名嚴格照本文件**：不要讓 AI 自己發明欄位名
3. **API 回傳格式嚴格照第四節**：`{ success, data }` / `{ success, error, code }`
4. **改 SPEC 要全組同意**：如果你發現規格要改，先在群組講，更新本文件，再動工
5. **每次通過的變更**：記到 `CHANGELOG.md`

---

## 九、Gemini AI 整合（食材辨識 + 智慧配餐）

本專案的三個 AI 功能都用 **Google Gemini**，分別對應你列的三個功能：

| 對應功能 | 頁面 | API | 說明 |
|------|------|-----|------|
| **①** AI 食材辨識 | DashboardView 掃描鈕 | `POST /api/scan` | 上傳照片，Gemini Vision 辨識食材 → 確認後寫 `ingredients` |
| **②** AI 補貨推薦 | ShoppingView | `POST /api/restock/suggest` | 依快過期食材 + 最新爬蟲價，Gemini 產生「買什麼、去哪家」建議 |
| **③** AI 智慧配餐 | PlannerView | `POST /api/recipes/generate` | 依**冰箱現有食材**，Gemini 產生配餐建議 |

### 🧭 功能②「爬蟲比價 + AI 推薦」要怎麼做才不會「脫褲子放屁」（重要設計原則）

> 這是全專案最有份量的一塊，但也最容易過度包裝。原則：**能用程式算的就用程式，AI 只做程式做不到的事。**

整條流程拆成「**爬蟲 → 比價 → 推薦**」三段，各段該用什麼工具講清楚：

| 階段 | 做什麼 | 用什麼 | 為什麼 |
|------|--------|--------|--------|
| 1. 爬蟲抓價 | 定時抓全聯 / 家樂福 / 美廉社的商品與價格，寫入 `price_records`（含 `crawled_at`） | **純程式**（requests / BeautifulSoup 或 Selenium） | 抓網頁是工程問題，不需要 AI |
| 2a. 品名對齊 | 把三家不同寫法的同一商品對成同一個 `norm_name`（「義美鮮乳」↔「義美牛奶」） | **Gemini**（少量、必要時才呼叫） | 這是「語意對應」，程式硬規則做不準，正是 AI 的強項 |
| 2b. 比價計算 | 同一 `norm_name` 找三通路最低價、算「比上週貴/便宜幾%」 | **純程式**（SQL `MIN()` / 時間序列相減） | 數字比大小是程式最會的，丟給 AI 反而又慢又貴又不穩 ← 這裡用 AI 才是脫褲子放屁 |
| 3. 自動推薦 | 把「快過期食材 + 各品項最低價與趨勢」整理成一句白話建議：「鮮奶明天到期，全聯特價 $58 比家樂福便宜 $9，建議今天補」 | **Gemini**（讀程式算好的數字，只負責「講人話」） | 自然語言生成是 AI 強項；但**判斷便宜與否的數字是程式先算好的**，AI 不做數學 |

**一句話記住分工：爬蟲＝程式、比大小＝程式、對齊亂品名＝AI、講人話建議＝AI。**

> 這樣設計的好處：(1) AI 呼叫次數少、省 token；(2) 比價結果穩定可驗證（數字是 SQL 算的，不是 AI 猜的）；(3) 仍保有兩個 AI 亮點（品名對齊 + 自然語言推薦）＋一個大數據亮點（價格時間序列），對「扎實度 / 夠不夠 AI」很有說服力。

### 🔑 鐵則（分工前全組必須有共識）

1. **API key 一律走 Docker secret**：放 `secrets/gemini_api_key.txt`，**絕不寫死在 `.py`、絕不 commit 明碼進程式碼**。
2. **只有 Flask 後端能呼叫 Gemini，前端絕對不行。**
   - 原因：key 若放前端，任何人打開瀏覽器 F12 就看得到、會被盜用、燒爆你的額度。
   - 正確流程：`前端上傳照片 → Flask → Gemini → Flask 整理結果 → 回前端`
3. **共用一個模組** `app/lib/gemini.py` 封裝呼叫，各 feature 共用，不要每組各寫一份。
4. Flask 用環境變數 `GEMINI_API_KEY_FILE` 透過 `config.py` 的 `_read_secret` 讀取。

### 拿到 key 後，組 A 要做的接線（目前尚未接，等 key）

```yaml
# docker-compose.yml 的 flask 服務新增：
    environment:
      GEMINI_API_KEY_FILE: /run/secrets/gemini_api_key
    secrets:
      - gemini_api_key
# 檔尾 secrets 區塊新增：
  gemini_api_key:
    file: ./secrets/gemini_api_key.txt
```

> 在拿到真實 key 之前，AI 辨識/配餐這兩支 API 可先回傳 mock 假資料，讓前端先串。

---

## 十、認證與資料隔離（✅ 已定案：Flask session）

**機制已實作完成**，用 **Flask session（cookie-based）**——前端登入後瀏覽器自動帶 cookie，後端從 session 認出是誰。

### 已可用的 API（組 A 完成）

| API | 說明 |
|-----|------|
| `POST /api/register` | 註冊（`{username, password, chefName?}`），成功後直接登入 |
| `POST /api/login` | 登入（`{username, password}`） |
| `POST /api/logout` | 登出 |
| `GET /api/me` | 問「現在誰登入」，未登入回 401 |

### 種子帳號（可直接登入測試）

| 帳號 | 密碼 |
|------|------|
| `demo` | `demo1234` |
| `amber` | `amber1234` |

### 🔑 其他組怎麼做「只看自己的資料」（重要）

各組的「我的 XX」API（食材、採購、收藏…）要**依登入者過濾**，用現成工具 `app/lib/auth.py`：

```python
from app.lib.auth import current_user_id, login_required

@bp.route('/ingredients', methods=['GET'])
@login_required                      # 沒登入自動回 401
def get_ingredients():
    uid = current_user_id()          # 拿到目前登入者的 user_id
    items = service.list_ingredients(uid)   # 只查這個人的
    return ok(items)
```

> 範例 `app/features/ingredients/` 目前仍回「全部」（範本階段），組 B 接手後改成用 `current_user_id()` 過濾。

> ⚠️ 開發階段提醒：前端 `npm run dev`（port 3002）直接打 Flask（port 5000）會有 **CORS** 問題。
> 等 Nginx 建好、前端打包後同一個 port 80 就沒這問題。過渡期可在 Vite 設 proxy 或 Flask 開 CORS。

---

## 十一、相關文件索引

| 文件 | 用途 |
|------|------|
| `START_HERE.md` | **新人第一天照著做**：環境、跑起來、切 branch、統一命名規範 |
| `ARCHITECTURE.md`（本文件） | 後端階段的共同合約：架構、DB、API、Gemini、分工 |
| `WORKFLOW.md` | **分工開工指南**：branch 步驟、AI 協作問題、開工指令範本 |
| `AGENT.md` | AI 工具入口，專案背景與規則 |
| `CHANGELOG.md` | 每次全組通過的變更紀錄 |
| `README.md` | 怎麼安裝、怎麼跑起來 |
