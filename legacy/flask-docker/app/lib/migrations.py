from __future__ import annotations

import logging

from .db import get_cursor, get_db_conn


LOGGER = logging.getLogger(__name__)


def run_startup_migrations(app) -> None:
    with app.app_context():
        try:
            _ensure_recipe_notifications()
            _drop_recipe_calories()
            _mark_legacy_item_expiry_notifications_read()
        except Exception:
            LOGGER.exception("Startup migration failed")


def _ensure_recipe_notifications() -> None:
    with get_cursor() as cur:
        cur.execute(
            "ALTER TABLE notifications "
            "MODIFY type ENUM('expiry','restock','recipe') NOT NULL DEFAULT 'expiry'"
        )
    get_db_conn().commit()


def _mark_legacy_item_expiry_notifications_read() -> None:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE notifications SET is_read=1 "
            "WHERE type='expiry' AND ingredient_id IS NOT NULL AND is_read=0"
        )
    get_db_conn().commit()


def _drop_recipe_calories() -> None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'recipes'
              AND COLUMN_NAME = 'calories'
            """
        )
        exists = bool((cur.fetchone() or {}).get("count"))
    if not exists:
        return
    with get_cursor() as cur:
        cur.execute("ALTER TABLE recipes DROP COLUMN calories")
    get_db_conn().commit()
