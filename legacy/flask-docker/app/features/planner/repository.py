from app.lib.db import get_cursor


def fetch_user_ingredients(user_id: int) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT name, category, qty, storage_type, days_left, total_days "
            "FROM ingredients "
            "WHERE user_id=%s ORDER BY days_left ASC",
            (user_id,),
        )
        return cur.fetchall()
