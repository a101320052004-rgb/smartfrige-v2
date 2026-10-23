SET NAMES utf8mb4;
USE smartfridge;

CREATE TABLE IF NOT EXISTS ingredient_removal_history (
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
