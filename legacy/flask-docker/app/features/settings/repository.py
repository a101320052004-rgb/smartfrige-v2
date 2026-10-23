import json

from app.lib.db import get_cursor, get_db_conn


_SETTINGS_COLUMNS = (
    "s.theme, s.expiry_reminder_days, s.expiry_push_time, "
    "s.recipe_update_time, s.tour_seen, s.restock_defaults_set, "
    "s.restock_reminder_ids"
)


def ensure_settings(user_id) -> None:
    with get_cursor() as cur:
        cur.execute(
            "INSERT IGNORE INTO user_settings (user_id) VALUES (%s)",
            (user_id,),
        )
    get_db_conn().commit()


def fetch_settings(user_id) -> dict | None:
    ensure_settings(user_id)
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT u.chef_name, {_SETTINGS_COLUMNS} "
            "FROM users u "
            "JOIN user_settings s ON s.user_id = u.id "
            "WHERE u.id=%s",
            (user_id,),
        )
        return cur.fetchone()


def update_chef_name(user_id, chef_name: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE users SET chef_name=%s WHERE id=%s",
            (chef_name, user_id),
        )
    get_db_conn().commit()


def update_settings(user_id, data: dict) -> None:
    ensure_settings(user_id)
    db_fields = {
        "theme": data.get("theme"),
        "expiry_reminder_days": data.get("expiry_reminder_days"),
        "expiry_push_time": data.get("expiry_push_time"),
        "recipe_update_time": data.get("recipe_update_time"),
        "tour_seen": data.get("tour_seen"),
        "restock_defaults_set": data.get("restock_defaults_set"),
        "restock_reminder_ids": json.dumps(data.get("restock_reminder_ids", []), ensure_ascii=False)
        if "restock_reminder_ids" in data else None,
    }
    updates = {key: value for key, value in db_fields.items() if value is not None}
    if not updates:
        return

    assignments = ", ".join(f"{key}=%s" for key in updates)
    values = list(updates.values()) + [user_id]
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE user_settings SET {assignments} WHERE user_id=%s",
            values,
        )
    get_db_conn().commit()
