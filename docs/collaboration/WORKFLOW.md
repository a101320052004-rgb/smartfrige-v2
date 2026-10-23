# AI食代 SmartFridge — 分工開工指南

> 給五個人「怎麼分頭用 AI 開發又能接得起來」的完整流程。
> 開工前每個人都要讀過這份 + `ARCHITECTURE.md`。

---

## 〇、現在到哪、下一步做什麼（先看這個）

**地基已經鋪好了，接下來四組各自接自己的頁面。**

✅ **已完成（組 A + 共同）**
- Docker 一鍵啟動（MySQL + Flask）、10 張關聯資料表（`01-schema.sql` 結構 / `02-seed.sql` 測試資料分檔）
- 認證：`register / login / logout`（Flask session）
- **食材 = 從 DB 到畫面的完整範本**：後端 `app/features/ingredients/` 全 CRUD + 前端 `DashboardView` 接 API（`src/lib/api.ts` 的 `ingredientsApi`）。**其他組照這條線抄。**

⬜ **接下來每個人的第一步**

| 組別 | branch | 下一步具體動作 |
|------|--------|--------------|
| 組 A | `feature/infra-auth` | 建 `app/lib/gemini.py` 共用模組（key 走 secret）+ Nginx；前端接 SettingsView |
| 組 B | `feature/ingredients` | CRUD 已完成 → ①AI 拍照辨識 `POST /api/scan` ②快過期提醒 `notifications` ③**爬蟲比價** `prices`（抓三通路→AI 對齊品名→存時間序列） |
| 組 C | `feature/community` | 照範本做 `recipes`、`follows`、按讚/收藏 後端 → 前端 CommunityView 接 API |
| 組 D | `feature/shopping-planner` | 照範本做 `shopping`、`planner` → 補貨推薦 `restock`（呼叫組 B 的 `/api/prices`，AI 產生「買什麼去哪買」）→ 前端 ShoppingView / PlannerView |

**每個人的開工流程（三步）：**
1. 從 `main` 切自己的 branch（第四節有指令）
2. 開新 AI 對話，先貼 `ARCHITECTURE.md` + 第六節自己那段「開工指令」，照 `app/features/ingredients/` 範本做
3. 做完 `curl` 測通 → 發 PR → 組 A review 合併 → 記一筆 `CHANGELOG.md`

> 細節都在下面：分工在第二節、檔案歸屬在第三節、branch 指令在第四節、給 AI 的開工指令在第六節。

---

## 一、為什麼要先對齊（最重要的觀念）

五個人各自開 AI 對話，每個 AI 都是**全新的、看不到隊友在做什麼**。
如果不先講好規格，會發生：後端說 `ingredient_id`、前端找 `id`，兩邊程式碼看起來都對，但永遠接不起來。

**解法：所有人的 AI 都讀同一份合約 `ARCHITECTURE.md`。**
規格先於程式碼。這份文件就是合約，AI 只是照合約施工的工人。

---

## 二、分工總覽

> **最高原則：每個檔案只有一個主人。** 後端各自待在自己的 `app/features/<功能>/` 資料夾，前端每頁只歸一人。

| 組別 | 人數 | 負責功能 | Branch 名稱 | 後端資料夾（私人） | 前端頁面（私人） |
|------|:---:|---------|------------|------------------|----------------|
| 組 A | 2 | 基礎建設 + 認證 + Gemini | `feature/infra-auth` | `app/features/auth/`、`app/lib/gemini.py`、`docker-compose.yml`、`env/` | AuthScreen、SettingsView |
| 組 B | 1 | 食材 + AI 辨識 + 快過期提醒 + 爬蟲比價 | `feature/ingredients` | `app/features/ingredients/`（已有範本）、`scan/`、`notifications/`、`prices/` | DashboardView |
| 組 C | 1 | 社群（食譜 + 追蹤 + 雙軌徽章） | `feature/community` | `app/features/recipes/`、`app/features/follows/` | CommunityView |
| 組 D | 1 | 採購 + AI 配餐 + 補貨推薦 | `feature/shopping-planner` | `app/features/shopping/`、`app/features/planner/`、`app/features/restock/` | ShoppingView、PlannerView |

> 組 A 要**最先**完成基礎建設，其他組才能 `docker compose up` 跑起來。
> `app/features/ingredients/` 是現成範本，每組照它的三層寫法複製。
>
> 🔗 **跨組依賴（都是「呼叫 API」不是改檔，不會 git 衝突）：**
> - 組 D 的 AI 配餐「收藏」呼叫組 C 的 `POST /api/recipes/saved`。
> - 組 D 的補貨推薦呼叫組 B 的 `GET /api/prices`、`GET /api/notifications/check`（功能②是 B→D 接力：B 抓價＋偵測快過期，D 產生補貨建議）。
>
> 📌 **未列入本期分工（先放著）：**
> - **營養分析（NutritionView）**：尚未確定需求，目前頁面未啟用、不顯示；待主功能都完成後再評估是否開發。
> - **門市地圖（StoreView）**：原為未使用的死碼，已移除；其互動地圖構想若要保留，未來併入 ShoppingView。

---

## 三、檔案怎麼分？會不會改到別人？（最重要）

### 核心觀念：三層架構天生就把後端工作隔開了

每組的後端工作有 **90% 在自己的 `app/features/<你的功能>/` 資料夾裡**（`routes.py` / `service.py` / `repository.py`）。
那是你的**私人空間**，別組不會碰 → 幾乎不會衝突。這就是為什麼我們照 petshop 用 feature 資料夾分層。

```
app/features/
├── ingredients/   ← 組B 的私人空間
├── recipes/       ← 組C 的私人空間
├── shopping/      ← 組D 的私人空間
├── follows/       ← 組D 的私人空間
└── auth/          ← 組A 的私人空間
```

### 🟢 安全區（你自己的檔，隨便改不會撞到別人）

| 組別 | 你的私人檔案 |
|------|------------|
| 組 A | `app/features/auth/*`、`app/lib/gemini.py`、`AuthScreen.tsx`、`SettingsView.tsx` |
| 組 B | `app/features/ingredients/*`、`scan/*`、`notifications/*`、`prices/*`、`DashboardView.tsx` |
| 組 C | `app/features/recipes/*`、`app/features/follows/*`、`CommunityView.tsx` |
| 組 D | `app/features/shopping/*`、`app/features/planner/*`、`restock/*`、`ShoppingView.tsx`、`PlannerView.tsx` |

### 🔴 危險區（共用檔，動之前先在群組喊一聲）

| 共用檔 | 誰會動 | 怎麼避免撞車 |
|--------|--------|------------|
| `app/features/__init__.py` | 每組都要加一行註冊自己的 blueprint | 各加各的那一行，衝突也只有一兩行、很好解（兩行都留） |
| `env/mysql/01-schema.sql`、`02-seed.sql` | 原則上只有組 A | 組 A 一開始就建好 10 張表，其他組**不要動**；要加欄位先喊 |
| `docker-compose.yml` | 只有組 A | 其他組完全不要碰 |
| `src/types.ts` | 多組可能加型別 | 各加各的 interface，少衝突；加之前掃一眼有沒有重複 |

> ✅ **新分工已消除最大衝突源：** `CommunityView.tsx` 以前要 C、D 兩人同改，現在整個歸組 C 一人，不再是危險區。
> 剩下的危險區只有上面這幾個共用檔，而且大多只有組 A 會動，其他組基本碰不到。

### 萬一真的衝突了（git conflict）不要慌

`git merge main` 時如果同一檔同一行被兩人改過，git 會在檔案裡標出來：

```
<<<<<<< HEAD
你的版本
=======
別人的版本
>>>>>>> main
```

處理方式：打開檔案 → 兩段都看 → 手動留下對的、刪掉 `<<<`/`===`/`>>>` 這些記號 → `git add` → `git commit`。
不確定怎麼留，**找組 A／整合者一起看**，不要自己亂猜。

### 🏆 黃金守則（記這 4 條就好）

1. **只改自己功能資料夾裡的檔**，別組的不要碰。
2. **要動共用檔（紅色那些）先在群組喊一聲。**
3. **每天上工先 `git pull`、下工前 `git push`**，不要積一週才合（積越久衝突越大）。
4. **小步 commit**，一次一個小功能，不要一次塞一大包。

---

## 四、Branch 分工步驟（照著打）

### 開新功能

```bash
# 1. 先把本地 main 更新到最新
git checkout main
git pull origin main

# 2. 從 main 切出自己的 branch
git checkout -b feature/recipes      # 換成你的 branch 名

# 3. 開發…改檔案…然後小步提交（一個小功能 commit 一次）
git add .
git commit -m "feat(recipes): 新增食譜列表 API"

# 4. 推上遠端
git push -u origin feature/recipes
```

### 完成後發 PR

```bash
# 推完後到 GitHub 開 Pull Request，或用 gh：
gh pr create --base main --title "feat: 食譜 API" --body "完成 GET/POST /api/recipes"
```

由組 A（或指定整合者）review 後合併進 `main`。

### 合併後，回來更新自己的 main

```bash
git checkout main
git pull origin main
```

### 開發中途想同步別人合進去的最新進度

```bash
git checkout main
git pull origin main
git checkout feature/recipes
git merge main          # 把最新 main 併進自己的 branch，及早解衝突
```

---

## 五、大家都用 AI 會遇到的問題（先預見 + 對策）

| # | 會發生的問題 | 對策 |
|---|------------|------|
| 1 | 各自的 AI 不知道隊友在做什麼，自己發明一套 | **每次開工第一句先貼 `ARCHITECTURE.md`**（見第五節範本） |
| 2 | 欄位命名不一致（`expiry_date` vs `expiryDate`） | 嚴格照 ARCHITECTURE 第三節「DB ↔ API 對照表」 |
| 3 | 各組錯誤格式不同 | 一律用 `app/lib/responses.py` 的 `ok()` / `fail()` |
| 4 | 每組各寫一份 DB 連線、各寫一份 Gemini 呼叫 | DB 用 `app/lib/db.py`、Gemini 用 `app/lib/gemini.py`，**共用不重造** |
| 5 | 多組改到同一個檔（`docker-compose.yml`、`01-schema.sql`、`features/__init__.py`、`CommunityView.tsx`）→ git 衝突 | 約定誰改哪段；要動共用檔先在群組講；頻繁 `git pull`；小步 commit |
| 6 | AI 自己改了資料表結構，但沒更新 schema / 文件 | **改 schema 一律先改 `ARCHITECTURE.md` + `01-schema.sql`，全組同意才動** |
| 7 | AI 幻覺出不存在的套件 / 欄位 / API | review 時檢查；**跑得起來、API 回得出正確 JSON 才算完成** |
| 8 | 假資料各塞各的，測試結果兜不起來 | 統一用 `env/mysql/02-seed.sql` 的 seed |
| 9 | 不小心直接 commit 到 `main` | **一律走 branch + PR**，不直接推 main |
| 10 | 把 API key / 密碼寫進程式碼 | **一律走 `secrets/` + Docker secret**，程式碼裡只讀檔不寫死 |

---

## 六、每個人的「開工指令」範本（貼給 AI 的第一段話）

> 開新對話時，**先貼這段**，把【】裡換成自己的功能。重點在最後一行：**先讓 AI 講計畫，你確認後再讓它寫。**

```
我在開發 AI食代 SmartFridge 智慧冰箱專案的後端。
請先閱讀專案根目錄的 ARCHITECTURE.md（系統架構 / DB schema / API 規格 / 命名規範）
和 README.md（資料夾結構 / 三層架構），以及 app/features/ingredients/（現成範本）。

我這次負責：【功能，例如：食譜 recipes】
對應資料表：【recipes】
要做的 API：【GET /api/recipes、POST /api/recipes …】

請嚴格遵守：
1. 照 app/features/ingredients/ 的三層架構：routes.py → service.py → repository.py
2. DB 欄位用 snake_case、API 回傳用 camelCase，照 ARCHITECTURE.md 的對照表，欄位名不要自己發明
3. 回傳格式一律用 app/lib/responses.py 的 ok() / fail()
4. DB 連線用 app/lib/db.py 的 get_cursor()，不要自己另寫連線
5. 不要修改別組的檔案；若需要動 docker-compose.yml、01-schema.sql、features/__init__.py 這些共用檔，先告訴我、不要直接改

請先告訴我你打算「新增哪些檔案、改哪些檔案、各檔做什麼」，等我確認後再開始寫程式。
```

### 各組可直接複製的版本

**組 B — 食材 + AI 辨識 + 快過期提醒 + 爬蟲比價**（CRUD 已是現成範本，剩三件）
> 我負責食材 ingredients。後端 `GET/POST/PUT/DELETE` 與前端 DashboardView 串接**已完成**（這條就是全隊的範本）。我要補三件：
> 1. **AI 食材辨識** `POST /api/scan`（`app/features/scan/`）：拍照 → 呼叫 `app/lib/gemini.py` → 回食材清單，照 ARCHITECTURE 第九節①。
> 2. **快過期提醒** `app/features/notifications/`：`GET /api/notifications`、`POST /api/notifications/check`（掃我的食材 days_left → 寫 `notifications`，避免重複推）。
> 3. **爬蟲比價** `app/features/prices/`（功能②，本專案最有份量的一塊）：純程式爬全聯/家樂福/美廉社寫入 `price_records`（含 crawled_at），用 Gemini 把各家亂品名對齊成 `norm_name`，比價（最低價、趨勢）用 SQL 算、不要丟給 AI。`GET /api/prices`、`POST /api/prices/crawl`。**嚴格照 ARCHITECTURE 第九節「爬蟲＝程式、比大小＝程式、對齊品名＝AI、講人話＝AI」的分工，不要過度用 AI。**

**組 C — 社群（食譜 + 追蹤 + 等級）**
> 我負責社群。要做食譜 `GET/POST/PUT/DELETE /api/recipes`、`GET/POST /api/recipes/saved`，追蹤 `GET/POST/DELETE /api/follows`、`GET /api/users/<id>/recipes`，以及廚師等級計算。前端整個 CommunityView 由我負責（食譜顯示 + 追蹤 + 等級）。

**組 D — 採購 + AI 配餐 + 補貨推薦**
> 我負責採購 shopping_items、AI 配餐與補貨推薦。要做：
> 1. `GET/POST/PUT/DELETE /api/shopping`（採購清單，照範本三層）。
> 2. **AI 配餐** `POST /api/recipes/generate`（`app/features/planner/`）：依**冰箱現有食材**呼叫 `app/lib/gemini.py` 產生配餐，照 ARCHITECTURE 第九節③。配餐「收藏」呼叫組 C 的 `POST /api/recipes/saved`。
> 3. **補貨推薦** `app/features/restock/`：`POST /api/restock/suggest`——**呼叫組 B 的** `GET /api/notifications/check`（拿快過期清單）+ `GET /api/prices`（拿各通路最新價），把整理好的數字交給 Gemini 產生「買什麼、去哪家買」白話建議，寫進 `shopping_items`(source=restock) 與 `notifications`(type=restock)。前端接 ShoppingView、PlannerView。

**組 A — 基礎建設 + 認證 + Gemini**
> 我負責認證與共用模組。要做 `POST /api/register`、`POST /api/login`、`POST /api/logout`（用 Flask session），決定資料隔離方式（依 user_id 過濾），建立 `app/lib/gemini.py` 共用模組（key 走 secret），前端接 AuthScreen、SettingsView。Nginx 反向代理也由我建。

---

## 七、PR 與合併規則（給 review 的人）

合併進 `main` 前，確認：

- [ ] `docker compose up -d` 跑得起來，容器沒掛
- [ ] 新 API 用 `curl` 測得到，回傳是 `{ success, data }` / `{ success, error, code }` 格式
- [ ] 欄位命名符合 `ARCHITECTURE.md`（沒有自己發明的欄位）
- [ ] 沒有把 key / 密碼寫死在程式碼
- [ ] 沒有亂改別組的檔案
- [ ] 若改了 schema，`01-schema.sql`（必要時 `02-seed.sql`）和 `ARCHITECTURE.md` 都同步更新了

通過 → 合併，並到 `team/CHANGELOG.md` 記一筆。
任一項不過 → 退回，請對方修好再重發 PR。
