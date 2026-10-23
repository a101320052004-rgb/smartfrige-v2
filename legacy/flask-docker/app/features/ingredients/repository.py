from app.lib.db import get_cursor, get_db_conn


_COLUMNS = "id, name, category, qty, note, storage_type, days_left, total_days, created_at"
_EFFECTIVE_DAYS_LEFT = "days_left - GREATEST(DATEDIFF(CURDATE(), DATE(created_at)), 0)"
_REMOVED_COLUMNS = (
    "id, original_ingredient_id, name, category, qty, note, storage_type, "
    "days_left, total_days, removed_reason, removed_at, expires_at"
)


def fetch_ingredients(user_id) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM ingredients "
            f"WHERE user_id=%s ORDER BY {_EFFECTIVE_DAYS_LEFT} ASC, id ASC",
            (user_id,),
        )
        return cur.fetchall()


def fetch_ingredient(user_id, ingredient_id) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM ingredients WHERE id=%s AND user_id=%s",
            (ingredient_id, user_id),
        )
        return cur.fetchone()


def fetch_removed_ingredients(user_id) -> list[dict]:
    purge_expired_removed_ingredients()
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_REMOVED_COLUMNS} FROM ingredient_removal_history "
            "WHERE user_id=%s AND expires_at > NOW() "
            "ORDER BY removed_at DESC, id DESC",
            (user_id,),
        )
        return cur.fetchall()


def insert_ingredient(user_id, data: dict) -> int:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO ingredients "
            "(user_id, name, category, qty, note, storage_type, days_left, total_days) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                user_id,
                data["name"], data["category"], data["qty"], data["note"],
                data["storage_type"], data["days_left"], data["total_days"],
            ),
        )
        new_id = cur.lastrowid
    get_db_conn().commit()
    return new_id


def update_ingredient(user_id, ingredient_id, data: dict) -> int:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE ingredients SET "
            "name=%s, category=%s, qty=%s, note=%s, storage_type=%s, "
            "days_left=%s, total_days=%s, created_at=CURRENT_TIMESTAMP "
            "WHERE id=%s AND user_id=%s",
            (
                data["name"], data["category"], data["qty"], data["note"],
                data["storage_type"], data["days_left"], data["total_days"],
                ingredient_id, user_id,
            ),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def archive_and_delete_ingredient(user_id, ingredient_id, reason: str) -> dict | None:
    conn = get_db_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT "
            "id, name, category, qty, note, storage_type, "
            f"{_EFFECTIVE_DAYS_LEFT} AS days_left, total_days "
            "FROM ingredients WHERE id=%s AND user_id=%s FOR UPDATE",
            (ingredient_id, user_id),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return None

        cur.execute(
            "INSERT INTO ingredient_removal_history "
            "(user_id, original_ingredient_id, name, category, qty, note, storage_type, "
            "days_left, total_days, removed_reason, expires_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, DATE_ADD(NOW(), INTERVAL 6 MONTH))",
            (
                user_id,
                row["id"],
                row["name"], row["category"], row["qty"], row["note"], row["storage_type"],
                row["days_left"], row["total_days"], reason,
            ),
        )
        removed_id = cur.lastrowid
        cur.execute(
            "DELETE FROM ingredients WHERE id=%s AND user_id=%s",
            (ingredient_id, user_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()

    return fetch_removed_ingredient(user_id, removed_id)


def fetch_removed_ingredient(user_id, removed_id) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_REMOVED_COLUMNS} FROM ingredient_removal_history "
            "WHERE id=%s AND user_id=%s AND expires_at > NOW()",
            (removed_id, user_id),
        )
        return cur.fetchone()


def restore_removed_ingredient(user_id, removed_id) -> int | None:
    conn = get_db_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            f"SELECT {_REMOVED_COLUMNS} FROM ingredient_removal_history "
            "WHERE id=%s AND user_id=%s AND expires_at > NOW() FOR UPDATE",
            (removed_id, user_id),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return None

        cur.execute(
            "INSERT INTO ingredients "
            "(user_id, name, category, qty, note, storage_type, days_left, total_days) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                user_id,
                row["name"], row["category"], row["qty"], row["note"],
                row["storage_type"], row["days_left"], row["total_days"],
            ),
        )
        new_id = cur.lastrowid
        cur.execute(
            "DELETE FROM ingredient_removal_history WHERE id=%s AND user_id=%s",
            (removed_id, user_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()

    return new_id


def purge_expired_removed_ingredients() -> int:
    with get_cursor() as cur:
        cur.execute("DELETE FROM ingredient_removal_history WHERE expires_at <= NOW()")
        affected = cur.rowcount
    get_db_conn().commit()
    return affected
