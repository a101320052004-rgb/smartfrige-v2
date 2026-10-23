SET NAMES utf8mb4;
USE smartfridge;

SET @has_ingredient_note := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ingredients'
    AND COLUMN_NAME = 'note'
);

SET @sql := IF(
  @has_ingredient_note = 0,
  'ALTER TABLE ingredients ADD COLUMN note VARCHAR(500) NOT NULL DEFAULT '''' AFTER qty',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_removed_note := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ingredient_removal_history'
    AND COLUMN_NAME = 'note'
);

SET @sql := IF(
  @has_removed_note = 0,
  'ALTER TABLE ingredient_removal_history ADD COLUMN note VARCHAR(500) NOT NULL DEFAULT '''' AFTER qty',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
