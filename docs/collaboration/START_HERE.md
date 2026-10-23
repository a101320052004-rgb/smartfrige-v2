# 🚀 START HERE — 團隊成員第一天照著做

> 你剛 `git clone` / `git pull` 下來，不知道從哪開始？**從上到下照這份做一遍就對了。**
> 這份是「按順序的行動清單」；更細的規格在 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，更細的分工在 [`WORKFLOW.md`](./WORKFLOW.md)。

---

## ⚡ 拉到程式碼後要跑什麼（先看這個！）

> 先確認 **Docker Desktop 已打開**（右下角綠燈）。指令都用 `&&` 串成一條，整段複製貼上、一次跑完不漏步驟。

### 🅰️ 第一次跑（剛 clone / 換新電腦）

```bash
docker compose up -d --build && npm install && npm run dev
```
> 第一次會自動建好 12 張表 + 灌 demo 假資料，前端開在 http://localhost:3000。

---

### 🅱️ 之後每次 `git pull`（平常用這條就好）

```bash
git pull && npm run dev
```
> 前端 `src/` 改動 Vite 會自動熱更新，**通常什麼都不用重建**。

---

### 🔁 只有「資料庫有變」時，才多跑這條重建

> 什麼算「資料庫有變」：有人改了 `env/mysql/*.sql`、`docker-compose.yml`、或 DB 名稱/帳密（看 CHANGELOG 就知道）。

```bash
git pull && docker compose down -v && docker compose up -d --build && npm run dev
```
> 為什麼非重建不可：建表腳本**只在空庫第一次**跑，不清掉舊 volume，新結構/新帳密不會生效。

---

### 🆘 搞混了 / 不確定狀態 → 一鍵打掉重來（保證乾淨）

```bash
git pull && docker compose down -v && docker compose up -d --build && npm install && npm run dev
```
> 這條一定對，只是會清掉本機測試資料、多跑一次 `npm install`。不確定時跑它最安全。

---

### ✅ 跑完驗證（任何一條跑完都可以這樣檢查）

```bash
docker compose ps && curl http://localhost:5000/api/health
```
> 兩個容器都 `Up`、health 回 `{"success":true,...,"service":"smartfridge-flask"}`，再開 http://localhost:3000 用 `demo / demo1234` 登入，能進去就全部到位。

> ⚠️ `down -v` 會清掉本機資料庫的測試資料（含你自己註冊的帳號），這是正常的——重建後回到 `02-seed.sql` 的 `demo`/`amber` 帳號。
>
> 📌 **2026-06-11 這次更新**：專案整個改名為 `smartfridge`（資料庫/帳密/容器名全換），屬於「資料庫有變」，所以**這次 pull 後每個人務必跑一次上面 🔁 或 🆘 那條**，否則新帳密連舊庫會登入失敗。

---

## 0. 先讀這三份（約 15 分鐘）

| 順序 | 文件 | 你會知道 |
|:---:|------|---------|
| 1️⃣ | [`README.md`](../README.md) | 專案是什麼、怎麼跑起來 |
| 2️⃣ | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 系統設計、DB schema、API 規格（**你要遵守的合約**） |
| 3️⃣ | [`WORKFLOW.md`](./WORKFLOW.md) | 你負責哪塊、怎麼切 branch、怎麼請 AI 開工 |

---

## ⏱️ 先後順序（重要！不是一開始就全部平行）

```
階段 0：組 A 先建 infra + 認證 → 合併進 main
   │      （B / C / D 這段先讀文件、規劃，或寫不依賴登入的 API 骨架）
   ▼  組 A 進 main、docker compose up 跑得起來後
階段 1：B / C / D 各自 branch 平行開工
   │      （這時才真正「一人一個 branch 同時做」）
   ▼
階段 2：前端各自接自己頁面的 API → 整合測試 → 合回 main
```

- **為什麼不能一開始全平行**：B/C/D 都要 `docker compose up` 才能測，而那套基礎建設是組 A 建的。
- **軟依賴**：組 D 的「收藏」要等組 C 的 `/api/recipes/saved`；但組 D 可以先做採購部分，不用空等。

---

## ✅ 第一天 Checklist

### A. 裝環境（每台電腦只做一次）
- [ ] 裝 **Docker Desktop** → 打開它，確認右下角是綠燈（在跑）
- [ ] 裝 **Node.js 18 以上**
- [ ] 裝 **DBeaver**（看資料庫用，可選）

### B. 拿到最新程式碼
```bash
git clone <repo 網址>                      # 第一次
# 或，如果已經有了：
git checkout main && git pull origin main
```

### C. 跑起來（驗證環境 OK）
```bash
# 後端：MySQL + Flask
docker compose up -d
curl http://localhost:5000/api/health      # 看到 {"success":true,...} 就成功

# 前端
npm install        # 第一次才需要
npm run dev        # 開 http://localhost:3000
```
> 跑不起來 → 看最下面「🆘 卡住了？」。

### D. 認領功能 + 切 branch
1. 打開 [`WORKFLOW.md`](./WORKFLOW.md) 第二節分工表，找到**你那組的 branch 名**（別自己取）。
2. ```bash
   git checkout main && git pull origin main
   git checkout -b feature/community        # 換成分工表指定的名字
   ```

### E. 請 AI 開工
1. 開一個新的 AI 對話。
2. 貼 [`WORKFLOW.md`](./WORKFLOW.md) 第六節**你那組的「開工指令」**（把【】換成你的功能）。
3. ⚠️ **讓 AI 先講計畫**（要新增/修改哪些檔案），你確認後**再讓它開始寫**。

### F. 每天的開發循環
```bash
# 上工：先同步別人合進去的最新進度
git checkout main && git pull origin main
git checkout feature/community && git merge main

# 做事…小步 commit（一次一個小功能）
git add .
git commit -m "feat(community): 新增追蹤 API"

# 下工：推上去
git push
```

### G. 功能做完 → 發 PR
照 [`WORKFLOW.md`](./WORKFLOW.md) 第四節（發 PR）與第七節（合併檢查清單）。

---

## 📛 統一命名規範（大家一定要用一樣的，否則接不起來）

| 項目 | 規則 | 範例 |
|------|------|------|
| **Branch 名** | `feature/<功能>`，小寫、用連字號；**用分工表指定的** | `feature/ingredients` |
| **Commit 訊息** | `<類型>(<範圍>): <說明>` | `feat(recipes): 新增食譜列表 API` |
| Commit 類型 | `feat` 新功能／`fix` 修錯／`refactor` 重構／`docs` 文件／`test` 測試 | |
| **API 路徑** | `/api/<複數小寫名詞>` | `/api/ingredients` |
| **API 成功回傳** | `{ success: true, data }` | 用 `app/lib/responses.py` 的 `ok()` |
| **API 失敗回傳** | `{ success: false, error, code }` | 用 `fail()` |
| **DB 欄位名** | snake_case（底線） | `days_left` |
| **API 的 JSON 欄位** | camelCase（駝峰） | `daysLeft` |
| **Flask blueprint 變數** | 一律叫 `bp` | `bp = Blueprint('recipes', __name__)` |
| **後端 feature 資料夾** | `app/features/<功能>/`，內含 `routes.py` / `service.py` / `repository.py` | |
| 資料庫名 | 一律 `smartfridge` | |
| 容器名 | `smartfridge-<服務>` | `smartfridge-flask` |

> 這些**不是建議，是規定**。一個人用 `daysLeft`、另一個用 `days_left`，前後端就接不起來。
> 有疑問先看 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，不要自己發明。

---

## 🆘 卡住了？

| 症狀 | 解法 |
|------|------|
| `docker compose up` 報錯 | 確認 Docker Desktop 有打開、在跑 |
| API 連不上 `:5000` | `docker compose ps` 看 `smartfridge-flask` 是不是 `Up` |
| DBeaver 連不上資料庫 | 容器要先在跑；`Public Key Retrieval` 錯誤看 [README 的 DBeaver 段](../README.md) |
| 網站 `:3000` 打不開 | 有沒有跑 `npm run dev` |
| 改了 `01-schema.sql` / `02-seed.sql` 沒生效 | `docker compose down -v && docker compose up -d`（重建資料庫） |
| git 出現 `<<<<<<<` 衝突 | 看 [`WORKFLOW.md`](./WORKFLOW.md) 第三節「萬一衝突了」 |
| 不確定欄位 / API 怎麼命名 | 查 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，別自己猜 |

---

**一句話總結：** 讀三份文件 → 跑起來驗證 → 切自己的 branch → 貼開工指令給 AI → AI 先講計畫你再放行 → 小步 commit、勤 pull → 發 PR。
