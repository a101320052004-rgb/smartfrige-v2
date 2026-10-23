SET NAMES utf8mb4;
USE smartfridge;

CREATE TABLE IF NOT EXISTS user_state_entries (
  user_id    INT NOT NULL,
  state_key  VARCHAR(120) NOT NULL,
  value_json LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, state_key),
  CONSTRAINT fk_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
