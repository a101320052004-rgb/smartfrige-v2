# AI食代 SmartFridge — 變更歷史紀錄

> 每次有改動被全組 5 人確認通過後，將變更記錄在此。
> 格式：日期 ｜ 變更類型 ｜ 內容 ｜ 確認方式

---

## 紀錄格式

```
### YYYY-MM-DD — [變更類型]
**變更內容：** 說明做了什麼
**影響頁面：** 哪些頁面或元件受到影響
**確認方式：** 全組確認 / 指定成員確認
**備註：** 其他說明（選填）
```

變更類型：`UI調整` ｜ `新功能` ｜ `Bug修復` ｜ `資料規格` ｜ `架構調整` ｜ `文件更新`

---

## 歷史紀錄

### 2026-06-11 — 架構調整（全專案改名 smartchill → smartfridge）
**變更內容：** 專案統一品牌為 **AI食代 SmartFridge**，把殘留的 `smartchill` 全部換成 `smartfridge`：
- **資料庫名**、**DB 使用者**、**容器名**（`smartfridge-mysql`/`-flask`）、**密碼字串**（`secrets/*.txt` 三檔 + `config.py` 後備值）、**前端 localStorage key**（`smartchill-*`→`smartfridge-*`，src/ 全部）、**文件/SQL 標題**（SmartChill Elite → AI食代 SmartFridge）。
- `START_HERE.md` 最上方新增「**每次 git pull 之後要跑什麼**」表 + 「一鍵安全重置」指令 + 驗證步驟。
**影響頁面：** `docker-compose.yml`、`app/config.py`、`secrets/*.txt`、`env/mysql/*.sql`、`src/**`（多檔 localStorage key）、全 `.md`
**確認方式：** `grep -r smartchill` 全 repo 0 殘留；前端僅改字串字面值（不影響型別）
**備註：** ⚠️ **每個人 pull 後必跑** `docker compose down -v && docker compose up -d`（改了 DB 名/帳密，光 up -d 不會生效，會用新帳密連舊庫而登入失敗）。`down -v` 會清掉本機測試資料（含自己註冊的帳號），重建後回到 demo/amber seed，屬正常。

---

### 2026-06-11 — 資料規格 + 文件更新（功能②爬蟲比價補進架構）
**變更內容：** 核對三大功能（①AI辨識食材入庫 ②快過期提醒＋採購推薦＋AI爬蟲比價 ③AI配餐用現有庫存）與文件邏輯，發現①③已吻合、**②的「爬蟲／價格時間序列／自動比價／到期→補貨／推播紀錄」完全沒進 DB 與分工**，補齊：
1. **DB 加兩張表（10→12）**：`price_records`（爬蟲價格時間序列，不綁 user，含 `norm_name` AI 對齊品名 + `crawled_at` 時間戳，三個索引供趨勢/比價）、`notifications`（推播提醒紀錄，type=expiry/restock，FK→users/ingredients）。
2. **API 補端點**：`/api/notifications*`、`/api/prices*`（crawl/compare）、`/api/restock/suggest`。
3. **分工調整**：組 B（食材已完成範本、有餘裕）接手最重的爬蟲比價（`scan/`、`notifications/`、`prices/`）；組 D 加 `restock/`。功能②定為 B→D 接力（呼叫 API，非改檔，不衝突）。
4. **整理 AI 設計原則**（ARCHITECTURE 第九節）：爬蟲＝程式、比大小＝程式、對齊亂品名＝AI、講人話建議＝AI——避免「用 AI 算數字」這種脫褲子放屁，省 token、結果可驗證，同時保住 2 個 AI 亮點 + 1 個大數據亮點。
**影響頁面：** `env/mysql/01-schema.sql`、`ARCHITECTURE.md`、`team/WORKFLOW.md`（純規格/文件，前端未動）
**確認方式：** ⬜ 待全組確認新表欄位與 B/D 接力分工後才進後端
**備註：** `shopping_items.price_*` 改定義為「加入清單當下的價格快照」，即時歷史價走 `price_records`，兩表分工釐清。

---

### 2026-06-11 — 新功能（食材：DB→畫面完整範本）
**變更內容：** 把「食材」做成全隊可照抄的端到端範例。
- 後端 `app/features/ingredients/` 補成完整 CRUD：`GET / POST / PUT /<id> / DELETE /<id>`，全部 `@login_required` + `current_user_id()` 過濾，寫入有 commit；service 層做 camelCase↔snake_case 轉換與輸入驗證（ValidationError→400），改不到別人的資料回 404。
- 前端 `src/lib/api.ts` 新增共用 `request()` 與 `ingredientsApi`（list/create/update/remove）；`App.tsx` 登入後 `list()` 載入真實食材取代寫死假資料；`DashboardView` 的新增/編輯/刪除/復原/掃描批次/到期自動移除全部接 API。
**影響頁面：** `app/features/ingredients/`、`src/lib/api.ts`、`src/App.tsx`、`src/components/DashboardView.tsx`
**確認方式：** curl/urllib 實測 CRUD 全通（login→create 201→update 200→delete→404 隔離）；`npx tsc --noEmit` 0 錯誤；中文編碼正常
**備註：** 修掉拆檔造成的編碼 bug——`02-seed.sql` 補上 `SET NAMES utf8mb4`（docker 分檔執行，少這行中文會變亂碼）。新帳號登入時食材為空屬正常（每人只看自己的），demo 帳號才有 seed 食材。

---

### 2026-06-11 — 資料規格（DB 結構補齊 + schema/seed 拆檔）
**變更內容：**
1. **schema / seed 拆兩檔**：原 `env/mysql/init.sql`（建表+假資料混在一起）拆成 `01-schema.sql`（只放結構）+ `02-seed.sql`（只放測試資料）。正式上線把 `02-seed.sql` 掛載拿掉即可變空庫，結構不動。docker-compose 改掛兩支、依檔名排序執行。
2. **補齊「按鈕→資料表」缺口**：原本 5 表 → 10 表。新增 `user_settings`（主題/到期提醒/推播/導覽，與 users 一對一）、`recipe_ingredients`、`recipe_steps`（食譜內容正規化子表）、`recipe_likes`（按讚）、`recipe_saves`（收藏/AI配餐收藏）；`recipes` 補 `full_content`、`rating`；`shopping_items` 補 `price_amart`（美廉社，三通路比價）、`source`、`linked_ingredient_id`（補貨連回食材，FK→ingredients）。
3. seed 外鍵一律用子查詢抓 id、不寫死數字，確保關聯永遠正確。
4. ARCHITECTURE.md 補完整：ER 關聯總覽、10 表欄位、**「按鈕→資料表」稽核表**、API 端點補按讚/收藏/設定。
**影響頁面：** 後端 DB only（前端尚未接，無 UI 影響）；`env/mysql/01-schema.sql`、`02-seed.sql`、`docker-compose.yml`、`ARCHITECTURE.md`、`AGENT.md`、`README.md`、`team/*`
**確認方式：** ⬜ 待全組確認 DB 欄位後才進後端開發（執行順序第 2 步）
**備註：** 雙軌徽章不需新欄位，由 `recipes` 的 origin/is_public 即時 COUNT 算出。

---

### 2026-06-10 — 新功能（組 A：認證）
**變更內容：** 完成使用者認證——`app/features/auth/`（register / login / logout / me），用 Flask session（cookie）做登入狀態，密碼以 werkzeug scrypt 雜湊。新增 `app/lib/auth.py`（`current_user_id()`、`login_required`）供各組做資料隔離。種子帳號 `demo`/`demo1234`、`amber`/`amber1234` 可直接登入。
**影響頁面：** 新增 `app/features/auth/`、`app/lib/auth.py`；更新 `app/features/__init__.py`、`env/mysql/init.sql`（真實密碼雜湊）、ARCHITECTURE.md 第十節
**確認方式：** 本機 curl 實測 6 條流程全通過（登入 / me / 錯誤密碼 / 註冊 / 重複註冊 / 登出）
**備註：** Gemini 共用模組與 Nginx 尚未做（組 A 剩餘工作）

---

### 2026-06-10 — 架構調整
**變更內容：** 建立後端基礎建設——MySQL 資料庫（`env/mysql/init.sql`，5 張表 + seed）、Flask 應用骨架（`app/`，create_app + config + lib/db + 三層 feature 架構）、`docker-compose.yml`（MySQL + Flask 容器）、Docker secrets 密碼檔。完成第一支可運行 API：`GET /api/health`、`GET /api/ingredients`（從 MySQL 撈、回傳 camelCase）。README 改寫為「怎麼跑 + 資料夾結構」說明。
**影響頁面：** 新增 `app/`、`env/`、`secrets/`、`docker-compose.yml`；更新 README.md、ARCHITECTURE.md
**確認方式：** 本機實測通過（docker compose up → curl 驗證三層串接）
**備註：** `app/features/ingredients/` 為其他組複製用的範例 feature；下一步建 Nginx + 各組 API

---

### 2026-06-10 — 文件更新
**變更內容：** 新增 `ARCHITECTURE.md`（後端階段共同合約：系統架構、MySQL schema、API 規格、五人分工）；合併 `FEATURES.md` 進 `PROGRESS.md` 並刪除 FEATURES.md，消除文件重複
**影響頁面：** 無（純文件）
**確認方式：** 待全組確認 ARCHITECTURE.md 的 DB 欄位與 API 格式
**備註：** 進入後端開發前，全組需先對齊 ARCHITECTURE.md 的資料規格

---

### 2026-06-03 — 文件更新
**變更內容：** 建立 Harness Engineering 文件架構，包含 AGENT.md、team/ROLES.md、team/CHANGELOG.md
**影響頁面：** 無（純文件）
**確認方式：** 初始建立
**備註：** 根據功能&UI優化-0603-v1 文件的團隊討論結果建立

---

### 2026-06-03 — UI調整
**變更內容：** 新增介面色系主題切換功能，支援三種主題：深墨綠（原版）、灰藍（Slate）、銀灰（Silver）
**影響頁面：** App.tsx（側邊欄、手機導覽、Header）、SettingsView.tsx（新增色系選擇器區塊）
**確認方式：** 待全組確認
**備註：** 主題即點即換，自動儲存至 localStorage，重整後保留設定

<!-- 之後每次全組確認通過，在上方新增一條紀錄 -->
