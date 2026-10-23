from app.lib.db import get_cursor, get_db_conn


_COLUMNS = "id, user_id, type, ingredient_id, title, body, is_read, created_at"
_EFFECTIVE_DAYS_LEFT = "days_left - GREATEST(DATEDIFF(CURDATE(), DATE(created_at)), 0)"


def fetch_notifications(user_id) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM notifications "
            "WHERE user_id=%s ORDER BY created_at DESC, id DESC",
            (user_id,),
        )
        return cur.fetchall()


def fetch_notification(user_id, notification_id) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM notifications WHERE id=%s AND user_id=%s",
            (notification_id, user_id),
        )
        return cur.fetchone()


def unread_exists(user_id, notif_type: str, ingredient_id) -> bool:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT id FROM notifications "
            "WHERE user_id=%s AND type=%s AND ingredient_id <=> %s AND is_read=0 "
            "LIMIT 1",
            (user_id, notif_type, ingredient_id),
        )
        return cur.fetchone() is not None


def exists_today(user_id, notif_type: str, ingredient_id) -> bool:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT id FROM notifications "
            "WHERE user_id=%s AND type=%s AND ingredient_id <=> %s "
            "AND DATE(created_at)=CURDATE() "
            "LIMIT 1",
            (user_id, notif_type, ingredient_id),
        )
        return cur.fetchone() is not None


def aggregate_exists_within_hours(user_id, notif_type: str, hours: int) -> bool:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT id FROM notifications "
            "WHERE user_id=%s AND type=%s AND ingredient_id IS NULL "
            "AND created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR) "
            "LIMIT 1",
            (user_id, notif_type, hours),
        )
        return cur.fetchone() is not None


def insert_notification(user_id, data: dict, dedupe_scope: str = "unread") -> int | None:
    if dedupe_scope == "none":
        already_exists = False
    elif dedupe_scope == "today":
        already_exists = exists_today(user_id, data["type"], data.get("ingredient_id"))
    else:
        already_exists = unread_exists(user_id, data["type"], data.get("ingredient_id"))

    if already_exists:
        return None

    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO notifications (user_id, type, ingredient_id, title, body) "
            "VALUES (%s, %s, %s, %s, %s)",
            (
                user_id,
                data["type"],
                data.get("ingredient_id"),
                data["title"],
                data.get("body"),
            ),
        )
        new_id = cur.lastrowid
    get_db_conn().commit()
    return new_id


def mark_read(user_id, notification_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE notifications SET is_read=1 WHERE id=%s AND user_id=%s",
            (notification_id, user_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def delete_unread_by_ingredient(user_id, notif_type: str, ingredient_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM notifications "
            "WHERE user_id=%s AND type=%s AND ingredient_id=%s AND is_read=0",
            (user_id, notif_type, ingredient_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def delete_all_unread_by_type(user_id, notif_type: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM notifications WHERE user_id=%s AND type=%s AND is_read=0",
            (user_id, notif_type),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def fetch_expiry_reminder_days(user_id) -> int:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT expiry_reminder_days FROM user_settings WHERE user_id=%s",
            (user_id,),
        )
        row = cur.fetchone()
    return int((row or {}).get("expiry_reminder_days") or 3)


def fetch_expiring_ingredients(user_id, days: int) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT id, name, {_EFFECTIVE_DAYS_LEFT} AS days_left FROM ingredients "
            f"WHERE user_id=%s AND {_EFFECTIVE_DAYS_LEFT} BETWEEN 0 AND %s "
            "ORDER BY days_left ASC, id ASC",
            (user_id, days),
        )
        return cur.fetchall()
