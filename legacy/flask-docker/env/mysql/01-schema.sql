-- ============================================================
-- AI食代 SmartFridge 智慧冰箱 — 資料庫「結構」定義（DDL ONLY）
-- ============================================================
-- 這個檔案「只放結構」（CREATE TABLE / 索引 / 外鍵），不放任何測試資料。
-- 測試資料一律放 02-seed.sql；正式上線時把 02-seed.sql 拿掉即可，
-- 本檔（結構）完全不動。
--
-- docker-entrypoint-initdb.d 會「依檔名排序」自動執行：
--   01-schema.sql（先建表）→ 02-seed.sql（後灌測試資料）
--
-- ⚠️ 注意：init 腳本「只有在資料庫第一次初始化（資料夾為空）時」才會跑。
--   想重新套用，先 `docker compose down -v` 清掉 volume 再 `up`。
--
-- 命名規範：DB 欄位一律 snake_case；API 回傳 JSON 一律 camelCase（Flask 轉換）。
-- ============================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS smartfridge DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartfridge;

-- 依外鍵相依性「反向」刪除（子表先刪，父表後刪），重建時才不會卡外鍵
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS price_records;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS recipe_saves;
DROP TABLE IF EXISTS recipe_likes;
DROP TABLE IF EXISTS recipe_steps;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS shopping_items;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_state_entries;
DROP TABLE IF EXISTS ingredient_removal_history;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS users;

-- ============================================================
-- 1. users（使用者）── 一切資料的根，所有「我的 XX」都靠 user_id 關聯到這
-- ============================================================
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,           -- 帳號（登入用）
  password_hash VARCHAR(255) NOT NULL,                  -- werkzeug 雜湊，絕不存明碼
  chef_name     VARCHAR(50),                            -- 主廚暱稱
  chef_rank     VARCHAR(20),                            -- 主廚等級（依分享數推算後快取）
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 2. user_settings（個人化設定）── 與 users 一對一
--    收納原本散在 localStorage 的設定：主題、到期提醒、推播時間、導覽看過…
-- ============================================================
CREATE TABLE user_settings (
  user_id              INT PRIMARY KEY,                 -- 同時是 PK 也是 FK → 保證一人一列
  theme                VARCHAR(20)  NOT NULL DEFAULT 'sky',   -- 主題色（smartfridge-theme）
  expiry_reminder_days INT          NOT NULL DEFAULT 3,      -- 到期前幾天提醒（smartfridge-expiry-reminder-days）
  expiry_push_time     VARCHAR(10)  NOT NULL DEFAULT '09:00',-- 推播時間（smartfridge-expiry-push-time）
  tour_seen            TINYINT(1)   NOT NULL DEFAULT 0,      -- 是否看過新手導覽（TOUR_SEEN）
  restock_defaults_set TINYINT(1)   NOT NULL DEFAULT 0,      -- 是否已套用補貨預設（RESTOCK_DEFAULTS）
  recipe_update_time   VARCHAR(10)  NOT NULL DEFAULT '06:30',
  restock_reminder_ids TEXT,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_state_entries (
  user_id    INT NOT NULL,
  state_key  VARCHAR(120) NOT NULL,
  value_json LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, state_key),
  CONSTRAINT fk_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 3. ingredients（食材庫）── 屬於某使用者
-- ============================================================
CREATE TABLE ingredients (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  name         VARCHAR(100) NOT NULL,
  category     VARCHAR(20)  NOT NULL,                   -- grains/vegetables/protein/dairy/fruits/fats/other
  qty          VARCHAR(50)  NOT NULL,                   -- 例：「6 顆」「1 盒」（看得到的數量+單位）
  note         VARCHAR(500) NOT NULL DEFAULT '',
  storage_type ENUM('fridge','freezer','pantry') NOT NULL DEFAULT 'fridge',
  days_left    INT NOT NULL DEFAULT 0,                  -- 距到期剩幾天
  total_days   INT NOT NULL DEFAULT 0,                  -- 保鮮總天數（畫進度條用）
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ingredients_user (user_id),
  CONSTRAINT fk_ingredients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ingredient_removal_history (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  user_id                INT NOT NULL,
  original_ingredient_id INT NOT NULL,
  name                   VARCHAR(100) NOT NULL,
  category               VARCHAR(20)  NOT NULL,
  qty                    VARCHAR(50)  NOT NULL,
  note                   VARCHAR(500) NOT NULL DEFAULT '',
  storage_type           ENUM('fridge','freezer','pantry') NOT NULL DEFAULT 'fridge',
  days_left              INT NOT NULL DEFAULT 0,
  total_days             INT NOT NULL DEFAULT 0,
  removed_reason         ENUM('eaten','wasted','expired') NOT NULL DEFAULT 'wasted',
  removed_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at             DATETIME NOT NULL,
  INDEX idx_removed_user_time (user_id, removed_at),
  INDEX idx_removed_expires (expires_at),
  CONSTRAINT fk_removed_ingredients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 4. recipes（食譜：社群分享 + AI 配餐收藏）── 作者是某使用者
--    步驟與食材清單「正規化」到子表 recipe_steps / recipe_ingredients
-- ============================================================
CREATE TABLE recipes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  author_id    INT NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,                                    -- 一句話簡介
  full_content TEXT,                                    -- 完整內文（選填）
  image_url    LONGTEXT,
  prep_time    INT NOT NULL DEFAULT 0,                  -- 分鐘
  rating       DECIMAL(2,1) NOT NULL DEFAULT 0.0,       -- 1.0–5.0 評分
  origin       ENUM('ai','manual') NOT NULL DEFAULT 'manual', -- AI 配餐 / 自建（雙軌徽章用）
  is_public    TINYINT(1) NOT NULL DEFAULT 1,           -- 是否公開分享到社群
  tags         TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recipes_author (author_id),
  CONSTRAINT fk_recipes_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4a. recipe_ingredients（食譜的食材清單）── 屬於某食譜，多列
CREATE TABLE recipe_ingredients (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  ord       INT NOT NULL DEFAULT 0,                     -- 排序
  name      VARCHAR(100) NOT NULL,                      -- 例：「雞蛋 1 顆」
  INDEX idx_recipe_ingredients_recipe (recipe_id),
  CONSTRAINT fk_recipe_ingredients FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4b. recipe_steps（食譜的烹飪步驟）── 屬於某食譜，多列
CREATE TABLE recipe_steps (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  step_no   INT NOT NULL,                               -- 第幾步
  content   TEXT NOT NULL,
  INDEX idx_recipe_steps_recipe (recipe_id),
  CONSTRAINT fk_recipe_steps FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. recipe_likes（按讚）── 使用者 ↔ 食譜「多對多」，複合主鍵防重複按讚
-- ============================================================
CREATE TABLE recipe_likes (
  user_id    INT NOT NULL,
  recipe_id  INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, recipe_id),
  INDEX idx_likes_recipe (recipe_id),                   -- 反查「這道有幾個讚」
  CONSTRAINT fk_likes_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_likes_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 6. recipe_saves（收藏 / AI 配餐收藏）── 使用者 ↔ 食譜「多對多」
-- ============================================================
CREATE TABLE recipe_saves (
  user_id    INT NOT NULL,
  recipe_id  INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, recipe_id),
  INDEX idx_saves_recipe (recipe_id),
  CONSTRAINT fk_saves_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_saves_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7. shopping_items（採購清單）── 屬於某使用者
--    三通路比價：全聯 / 家樂福 / 美廉社（固定三欄）
--    補貨來源可「連回」冰箱裡的某項食材（linked_ingredient_id）
-- ============================================================
CREATE TABLE shopping_items (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  user_id              INT NOT NULL,
  name                 VARCHAR(100) NOT NULL,
  category             VARCHAR(20),
  qty                  INT NOT NULL DEFAULT 1,
  unit                 VARCHAR(20),
  price_px             INT,                             -- 全聯（pricePX）
  price_carrefour      INT,                             -- 家樂福（priceCarrefour）
  price_amart          INT,                             -- 美廉社（priceAMart）
  source               ENUM('seed','manual','restock') NOT NULL DEFAULT 'manual',
  linked_ingredient_id INT NULL,                        -- 補貨來源食材（linkedIngredientId）
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shopping_user (user_id),
  CONSTRAINT fk_shopping_user       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_shopping_ingredient FOREIGN KEY (linked_ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 8. follows（追蹤關係）── 使用者 ↔ 使用者「多對多」，複合主鍵防重複追蹤
-- ============================================================
CREATE TABLE follows (
  follower_id INT NOT NULL,                             -- 誰按了追蹤
  followed_id INT NOT NULL,                             -- 被追蹤的主廚
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id),
  INDEX idx_follows_followed (followed_id),             -- 反查「這個主廚有幾個粉絲」
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_followed FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 9. price_records（通路價格時間序列）── 爬蟲寫入的「大數據」表
--    這張是「公開市場資料」，不綁特定使用者（沒有 user_id）：
--    爬蟲每次抓三通路（全聯 / 家樂福 / 美廉社）就插一批列，
--    保留 crawled_at 時間戳，才能畫「價格趨勢」與「跨通路比價」。
--    norm_name 是 AI 把各家亂七八糟的商品名「對齊」後的標準品名，
--    跨通路比價就靠它（例：「義美鮮乳」與「義美牛奶」對齊成同一品名）。
-- ============================================================
CREATE TABLE price_records (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  channel    ENUM('px','carrefour','amart') NOT NULL,    -- 全聯 / 家樂福 / 美廉社
  item_name  VARCHAR(100) NOT NULL,                      -- 爬到的原始商品名
  norm_name  VARCHAR(100),                               -- AI 對齊後的標準品名（跨通路比對用）
  price      INT NOT NULL,                               -- 售價（整數元）
  unit       VARCHAR(20),                                -- 單位（每包 / 每斤 / 每瓶…）
  source_url VARCHAR(500),                               -- 來源網址（佐證、可回查）
  crawled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,-- 抓取時間（時間序列關鍵欄位）
  INDEX idx_price_norm (norm_name),                      -- 依標準品名跨通路比價
  INDEX idx_price_channel_time (channel, crawled_at),    -- 依通路看時間趨勢
  INDEX idx_price_name_time (norm_name, crawled_at)      -- 某品項的歷史價格走勢
) ENGINE=InnoDB;

-- ============================================================
-- 10. notifications（推播提醒紀錄）── 屬於某使用者
--     記錄「已推播過的提醒」，避免同一項食材每天重複推；
--     type='expiry' 快過期提醒、type='restock' 採購補貨推薦。
--     ingredient_id 指向觸發提醒的食材（食材被刪則一併刪）。
-- ============================================================
CREATE TABLE notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  type          ENUM('expiry','restock','recipe') NOT NULL DEFAULT 'expiry',
  ingredient_id INT NULL,                                -- 關於哪項食材（可為空）
  title         VARCHAR(200) NOT NULL,
  body          TEXT,                                    -- 內文（含 AI 產生的補貨建議文字）
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id),
  CONSTRAINT fk_notif_user       FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  CONSTRAINT fk_notif_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB;
