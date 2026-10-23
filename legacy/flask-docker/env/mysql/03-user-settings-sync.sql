USE smartfridge;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS recipe_update_time VARCHAR(10) NOT NULL DEFAULT '06:30',
  ADD COLUMN IF NOT EXISTS restock_reminder_ids TEXT;

INSERT IGNORE INTO user_settings (user_id)
SELECT id FROM users;
