# Smart Fridge / AI食代 生產資料庫欄位規格

本文件只說明生產資料庫的資料表與欄位，不包含 SQL 建表程式碼。  
資料庫建議使用 MySQL 8.x，字元集使用 `utf8mb4`，所有時間欄位以台灣時區或 UTC 統一管理。

## 資料表總覽

| 資料表 | 用途 |
| --- | --- |
| `users` | 使用者帳號 |
| `ingredients` | 現有食材庫 |
| `removed_ingredients` | 吃完、浪費、過期紀錄 |
| `recipes` | 食譜資料，包含社群食譜與 AI 食譜 |
| `recipe_ingredients` | 食譜需要食材 |
| `recipe_steps` | 食譜步驟 |
| `recipe_likes` | 食譜按讚 |
| `recipe_saves` | 食譜收藏 |
| `follows` | 主廚追蹤 |
| `shopping_items` | 智能採購清單 |
| `shopping_item_exclusions` | 單一店家移除某採購品項 |
| `price_records` | 各通路價格紀錄 |
| `notifications` | 到期、補貨提醒 |
| `diet_restrictions` | 飲食禁忌設定 |
| `recipe_generation_logs` | AI 生成食譜紀錄 |

## 1. `users` 使用者帳號

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 使用者流水號 |
| `username` | VARCHAR(80) | 是 | UNIQUE | 登入帳號 |
| `email` | VARCHAR(255) | 否 | UNIQUE | 電子信箱 |
| `password_hash` | VARCHAR(255) | 是 |  | 加密後密碼，不存明碼 |
| `chef_name` | VARCHAR(80) | 否 |  | 顯示在系統中的主廚名稱 |
| `chef_rank` | VARCHAR(50) | 否 |  | 主廚等級或稱號 |
| `created_at` | DATETIME | 是 |  | 建立時間 |
| `updated_at` | DATETIME | 是 |  | 最後更新時間 |

## 2. `ingredients` 現有食材庫

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 食材流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `name` | VARCHAR(120) | 是 |  | 食材名稱 |
| `category` | ENUM | 是 | INDEX | 食材分類：全榖雜糧、蔬菜、蛋白質、乳品、水果、油脂堅果、其他 |
| `qty` | VARCHAR(60) | 是 |  | 份量文字，例如 `1 瓶`、`3 顆` |
| `storage_type` | ENUM | 是 |  | 保存方式：冷藏、冷凍、室溫 |
| `days_left` | INT | 是 | INDEX | 距離到期剩餘天數 |
| `total_days` | INT | 是 |  | 保存總天數 |
| `image_url` | VARCHAR(500) | 否 |  | 食材照片網址 |
| `is_custom` | BOOLEAN | 是 |  | 是否為使用者自訂食材 |
| `created_at` | DATETIME | 是 |  | 建立時間 |
| `updated_at` | DATETIME | 是 |  | 最後更新時間 |

## 3. `removed_ingredients` 吃完、浪費、過期紀錄

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 紀錄流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `original_ingredient_id` | BIGINT | 否 |  | 原本食材 ID，若原資料已刪除可為空 |
| `name` | VARCHAR(120) | 是 |  | 食材名稱 |
| `category` | ENUM | 是 | INDEX | 食材分類 |
| `qty` | VARCHAR(60) | 是 |  | 移除時份量 |
| `storage_type` | ENUM | 是 |  | 移除時保存方式 |
| `days_left` | INT | 是 |  | 移除時剩餘天數 |
| `total_days` | INT | 是 |  | 保存總天數 |
| `reason` | ENUM | 是 | INDEX | 移除原因：吃完、浪費、過期 |
| `removed_at` | DATETIME | 是 |  | 移除時間 |
| `restored_at` | DATETIME | 否 |  | 復原時間 |

## 4. `recipes` 食譜資料

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 食譜流水號 |
| `author_id` | BIGINT | 是 | FK, INDEX | 作者使用者 ID |
| `name` | VARCHAR(150) | 是 |  | 食譜名稱 |
| `description` | TEXT | 否 |  | 食譜簡介 |
| `full_content` | TEXT | 否 |  | 詳細說明 |
| `image_url` | VARCHAR(500) | 否 |  | 成品照片網址 |
| `prep_time` | INT | 是 |  | 烹飪時間，單位分鐘 |
| `rating` | DECIMAL(2,1) | 是 |  | 評分 |
| `origin` | ENUM | 是 | INDEX | 來源：AI 生成或手動建立 |
| `owner` | ENUM | 否 |  | 歸屬：AI、社群、我的食譜 |
| `is_public` | BOOLEAN | 是 | INDEX | 是否公開 |
| `created_at` | DATETIME | 是 | INDEX | 建立時間 |
| `updated_at` | DATETIME | 是 |  | 最後更新時間 |

## 5. `recipe_ingredients` 食譜需要食材

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 食譜食材流水號 |
| `recipe_id` | BIGINT | 是 | FK, INDEX | 對應食譜 |
| `ord` | INT | 是 | INDEX | 顯示排序 |
| `name` | VARCHAR(150) | 是 |  | 食材文字，例如 `雞蛋 1 顆` |

## 6. `recipe_steps` 食譜步驟

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 步驟流水號 |
| `recipe_id` | BIGINT | 是 | FK, INDEX | 對應食譜 |
| `step_no` | INT | 是 | INDEX | 步驟順序 |
| `content` | TEXT | 是 |  | 步驟內容 |

## 7. `recipe_likes` 食譜按讚

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `user_id` | BIGINT | 是 | PK, FK | 按讚的使用者 |
| `recipe_id` | BIGINT | 是 | PK, FK, INDEX | 被按讚的食譜 |
| `created_at` | DATETIME | 是 |  | 按讚時間 |

## 8. `recipe_saves` 食譜收藏

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `user_id` | BIGINT | 是 | PK, FK | 收藏者 |
| `recipe_id` | BIGINT | 是 | PK, FK, INDEX | 被收藏的食譜 |
| `created_at` | DATETIME | 是 |  | 收藏時間 |

## 9. `follows` 主廚追蹤

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `follower_id` | BIGINT | 是 | PK, FK | 追蹤者 |
| `followed_id` | BIGINT | 是 | PK, FK, INDEX | 被追蹤者 |
| `created_at` | DATETIME | 是 |  | 追蹤時間 |

## 10. `shopping_items` 智能採購清單

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 採購品項流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `name` | VARCHAR(120) | 是 |  | 商品名稱 |
| `category` | VARCHAR(40) | 否 |  | 商品分類 |
| `qty` | INT | 是 |  | 數量 |
| `unit` | VARCHAR(20) | 否 |  | 單位，例如盒、瓶、把 |
| `price_px` | INT | 否 |  | 全聯價格 |
| `price_carrefour` | INT | 否 |  | 家樂福價格 |
| `price_amart` | INT | 否 |  | 美廉社價格 |
| `price_rt_mart` | INT | 否 |  | 大潤發價格 |
| `price_wellcome` | INT | 否 |  | Wellcome 或其他通路價格 |
| `source` | ENUM | 是 | INDEX | 來源：預設、手動、補貨 |
| `linked_ingredient_id` | BIGINT | 否 | FK | 由哪個食材觸發補貨 |
| `created_at` | DATETIME | 是 |  | 建立時間 |
| `updated_at` | DATETIME | 是 |  | 最後更新時間 |

## 11. `shopping_item_exclusions` 單一店家移除品項

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `user_id` | BIGINT | 是 | PK, FK | 使用者 |
| `shopping_item_id` | BIGINT | 是 | PK, FK | 採購品項 |
| `channel` | ENUM | 是 | PK | 被移除的店家或平台 |
| `created_at` | DATETIME | 是 |  | 移除時間 |

## 12. `price_records` 各通路價格紀錄

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 價格紀錄流水號 |
| `channel` | ENUM | 是 | INDEX | 通路名稱 |
| `item_name` | VARCHAR(150) | 是 |  | 原始商品名稱 |
| `norm_name` | VARCHAR(150) | 否 | INDEX | AI 或規則整理後的標準品名 |
| `price` | INT | 是 |  | 價格 |
| `unit` | VARCHAR(30) | 否 |  | 商品單位 |
| `source_url` | VARCHAR(500) | 否 |  | 資料來源網址 |
| `crawled_at` | DATETIME | 是 | INDEX | 抓取時間 |

## 13. `notifications` 到期與補貨提醒

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 提醒流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `type` | ENUM | 是 | INDEX | 提醒類型：到期、補貨 |
| `ingredient_id` | BIGINT | 否 | FK | 相關食材 |
| `title` | VARCHAR(200) | 是 |  | 提醒標題 |
| `body` | TEXT | 否 |  | 提醒內容 |
| `is_read` | BOOLEAN | 是 | INDEX | 是否已讀 |
| `created_at` | DATETIME | 是 |  | 建立時間 |

## 14. `diet_restrictions` 飲食禁忌設定

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 禁忌項目流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `label` | VARCHAR(100) | 是 |  | 禁忌名稱，例如花生、海鮮、乳製品 |
| `is_active` | BOOLEAN | 是 | INDEX | 是否啟用 |
| `created_at` | DATETIME | 是 |  | 建立時間 |
| `updated_at` | DATETIME | 是 |  | 最後更新時間 |

## 15. `recipe_generation_logs` AI 生成食譜紀錄

| 欄位 | 型態 | 必填 | 鍵值 | 說明 |
| --- | --- | --- | --- | --- |
| `id` | BIGINT | 是 | PK | 生成紀錄流水號 |
| `user_id` | BIGINT | 是 | FK, INDEX | 所屬使用者 |
| `mode` | ENUM | 是 |  | 生成模式：隨機取材或選擇食材 |
| `selected_ingredient_ids` | JSON | 否 |  | 使用者選取的食材 ID 快照 |
| `generated_recipe_ids` | JSON | 否 |  | 生成出的食譜 ID 快照 |
| `prompt_summary` | TEXT | 否 |  | 本次生成條件摘要 |
| `created_at` | DATETIME | 是 | INDEX | 生成時間 |

## 生產環境備註

- 所有使用者資料都必須透過 `user_id` 做資料隔離。
- 密碼只能存 `password_hash`。
- 圖片建議放物件儲存服務，資料庫只存 `image_url`。
- `removed_ingredients` 用於浪費統計、吃完紀錄與誤刪復原。
- `shopping_item_exclusions` 用於「只刪除單一店家的某品項」，不影響其他店家。
- `price_records` 會快速成長，正式環境建議定期封存或分區。
- `recipe_generation_logs` 可用於追蹤 AI 推薦來源與除錯。
