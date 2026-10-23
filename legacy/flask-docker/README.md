# 初版架構：Flask + MySQL + Docker

這是專案前期（2026 年 6 月）的版本，所有服務用 Docker Compose 在本機啟動：

```
瀏覽器 → Nginx → Flask（Python）→ MySQL
                    └→ Gemini API
```

後來為了讓專案能上線給人實際使用，改成 Vercel + Supabase（見根目錄 README）。
這裡保留作為學習對照，**正式部署不會用到這個資料夾**。

| 路徑 | 內容 |
|------|------|
| `app/features/<功能>/` | 依功能分資料夾：`routes.py`（路由）→ `service.py`（商業邏輯）→ `repository.py`（SQL） |
| `app/lib/` | 共用模組：資料庫連線、認證、Gemini、排程 |
| `env/mysql/` | 建表（`01-schema.sql`）與測試資料（`02-seed.sql`），之後的檔案是逐步加上的 migration |
| `env/flask/`、`env/nginx/` | Dockerfile 與 Nginx 設定 |
| `sql.md` | 資料表欄位規格 |

## 啟動方式（僅供參考）

需要先在此資料夾建立 `secrets/`（MySQL 密碼、Flask secret key），並在專案根目錄執行過 `npm run build`。

```bash
cd legacy/flask-docker
docker compose up -d --build
curl http://localhost:5000/api/health
```
