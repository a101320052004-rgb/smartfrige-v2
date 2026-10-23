from app.lib.db import get_cursor, get_db_conn


_COLUMNS = (
    "id, name, category, qty, unit, price_px, price_carrefour, "
    "price_amart, source, linked_ingredient_id"
)


def fetch_items(user_id) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM shopping_items "
            "WHERE user_id=%s ORDER BY created_at DESC, id DESC",
            (user_id,),
        )
        return cur.fetchall()


def fetch_item(user_id, item_id) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM shopping_items WHERE id=%s AND user_id=%s",
            (item_id, user_id),
        )
        return cur.fetchone()


def insert_item(user_id, data: dict) -> int:
    if data.get("source") == "restock" and data.get("linked_ingredient_id"):
        delete_restock_item(user_id, data["linked_ingredient_id"])

    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO shopping_items "
            "(user_id, name, category, qty, unit, price_px, price_carrefour, "
            "price_amart, source, linked_ingredient_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                user_id,
                data["name"], data["category"], data["qty"], data["unit"],
                data["price_px"], data["price_carrefour"], data["price_amart"],
                data["source"], data.get("linked_ingredient_id"),
            ),
        )
        new_id = cur.lastrowid
    get_db_conn().commit()
    return new_id


def update_qty(user_id, item_id, qty: int) -> int:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE shopping_items SET qty=%s WHERE id=%s AND user_id=%s",
            (qty, item_id, user_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def delete_item(user_id, item_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM shopping_items WHERE id=%s AND user_id=%s",
            (item_id, user_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def delete_restock_item(user_id, ingredient_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM shopping_items "
            "WHERE user_id=%s AND source='restock' AND linked_ingredient_id=%s",
            (user_id, ingredient_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def delete_all_restock_items(user_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM shopping_items WHERE user_id=%s AND source='restock'",
            (user_id,),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected
