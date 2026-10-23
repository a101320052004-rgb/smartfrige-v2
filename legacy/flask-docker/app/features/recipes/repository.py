import json

from app.lib.db import get_cursor, get_db_conn


def fetch_recipes(user_id) -> list[dict]:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            """
            SELECT
              r.id, r.author_id, r.name, r.description, r.full_content,
              r.image_url, r.prep_time, r.rating, r.origin,
              r.is_public, r.created_at, r.tags,
              u.chef_name, u.username,
              (SELECT COUNT(*) FROM recipe_likes rl WHERE rl.recipe_id = r.id) AS like_count,
              EXISTS(SELECT 1 FROM recipe_likes rl WHERE rl.recipe_id = r.id AND rl.user_id = %s) AS liked,
              EXISTS(SELECT 1 FROM recipe_saves rs WHERE rs.recipe_id = r.id AND rs.user_id = %s) AS saved,
              (SELECT COUNT(*) FROM recipes cr WHERE cr.author_id = r.author_id AND cr.is_public = 1) AS author_recipe_count
            FROM recipes r
            JOIN users u ON u.id = r.author_id
            WHERE r.is_public = 1 OR r.author_id = %s
            ORDER BY r.created_at DESC, r.id DESC
            """,
            (user_id, user_id, user_id),
        )
        recipes = cur.fetchall()

    if not recipes:
        return []

    ids = [row["id"] for row in recipes]
    ingredients = _fetch_child_rows("recipe_ingredients", "ord", ids)
    steps = _fetch_child_rows("recipe_steps", "step_no", ids)
    for row in recipes:
        row["ingredients"] = ingredients.get(row["id"], [])
        row["steps"] = steps.get(row["id"], [])
    return recipes


def fetch_recipe(user_id, recipe_id) -> dict | None:
    rows = [row for row in fetch_recipes(user_id) if int(row["id"]) == int(recipe_id)]
    return rows[0] if rows else None


def insert_recipe(user_id, data: dict) -> int:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO recipes
            (author_id, name, description, full_content, image_url, prep_time,
             rating, origin, is_public, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                data["name"],
                data.get("description"),
                data.get("full_content"),
                data.get("image_url"),
                data["prep_time"],
                data["rating"],
                data["origin"],
                1 if data["is_public"] else 0,
                json.dumps(data.get("tags") or [], ensure_ascii=False),
            ),
        )
        recipe_id = cur.lastrowid
        _replace_children(cur, recipe_id, data.get("ingredients") or [], data.get("steps") or [])
    get_db_conn().commit()
    return recipe_id


def update_recipe(user_id, recipe_id, data: dict) -> int:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM recipes WHERE id=%s AND author_id=%s",
            (recipe_id, user_id),
        )
        if cur.fetchone() is None:
            return 0
        cur.execute(
            """
            UPDATE recipes SET
              name=%s, description=%s, full_content=%s, image_url=%s,
              prep_time=%s, rating=%s, origin=%s,
              is_public=%s, tags=%s
            WHERE id=%s AND author_id=%s
            """,
            (
                data["name"],
                data.get("description"),
                data.get("full_content"),
                data.get("image_url"),
                data["prep_time"],
                data["rating"],
                data["origin"],
                1 if data["is_public"] else 0,
                json.dumps(data.get("tags") or [], ensure_ascii=False),
                recipe_id,
                user_id,
            ),
        )
        _replace_children(cur, recipe_id, data.get("ingredients") or [], data.get("steps") or [])
    get_db_conn().commit()
    return 1


def delete_recipe(user_id, recipe_id) -> int:
    with get_cursor() as cur:
        cur.execute("DELETE FROM recipes WHERE id=%s AND author_id=%s", (recipe_id, user_id))
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def toggle_like(user_id, recipe_id) -> dict:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT user_id FROM recipe_likes WHERE user_id=%s AND recipe_id=%s",
            (user_id, recipe_id),
        )
        exists = cur.fetchone() is not None
    with get_cursor() as cur:
        if exists:
            cur.execute(
                "DELETE FROM recipe_likes WHERE user_id=%s AND recipe_id=%s",
                (user_id, recipe_id),
            )
        else:
            cur.execute(
                "INSERT IGNORE INTO recipe_likes (user_id, recipe_id) VALUES (%s, %s)",
                (user_id, recipe_id),
            )
    get_db_conn().commit()
    return recipe_stats(user_id, recipe_id)


def toggle_save(user_id, recipe_id) -> dict:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT user_id FROM recipe_saves WHERE user_id=%s AND recipe_id=%s",
            (user_id, recipe_id),
        )
        exists = cur.fetchone() is not None
    with get_cursor() as cur:
        if exists:
            cur.execute(
                "DELETE FROM recipe_saves WHERE user_id=%s AND recipe_id=%s",
                (user_id, recipe_id),
            )
        else:
            cur.execute(
                "INSERT IGNORE INTO recipe_saves (user_id, recipe_id) VALUES (%s, %s)",
                (user_id, recipe_id),
            )
    get_db_conn().commit()
    return recipe_stats(user_id, recipe_id)


def recipe_stats(user_id, recipe_id) -> dict:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id=%s) AS likes,
              EXISTS(SELECT 1 FROM recipe_likes WHERE user_id=%s AND recipe_id=%s) AS liked,
              EXISTS(SELECT 1 FROM recipe_saves WHERE user_id=%s AND recipe_id=%s) AS saved
            """,
            (recipe_id, user_id, recipe_id, user_id, recipe_id),
        )
        return cur.fetchone() or {"likes": 0, "liked": False, "saved": False}


def fetch_followed_ids(user_id) -> list[int]:
    with get_cursor(dictionary=True) as cur:
        cur.execute("SELECT followed_id FROM follows WHERE follower_id=%s", (user_id,))
        return [row["followed_id"] for row in cur.fetchall()]


def follow_user(user_id, followed_id) -> None:
    with get_cursor() as cur:
        cur.execute(
            "INSERT IGNORE INTO follows (follower_id, followed_id) VALUES (%s, %s)",
            (user_id, followed_id),
        )
    get_db_conn().commit()


def unfollow_user(user_id, followed_id) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM follows WHERE follower_id=%s AND followed_id=%s",
            (user_id, followed_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def _fetch_child_rows(table: str, order_col: str, recipe_ids: list[int]) -> dict[int, list[str]]:
    placeholders = ",".join(["%s"] * len(recipe_ids))
    value_col = "name" if table == "recipe_ingredients" else "content"
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT recipe_id, {value_col} AS value FROM {table} "
            f"WHERE recipe_id IN ({placeholders}) ORDER BY {order_col} ASC, id ASC",
            tuple(recipe_ids),
        )
        rows = cur.fetchall()

    grouped: dict[int, list[str]] = {}
    for row in rows:
        grouped.setdefault(row["recipe_id"], []).append(row["value"])
    return grouped


def _replace_children(cur, recipe_id, ingredients: list[str], steps: list[str]) -> None:
    cur.execute("DELETE FROM recipe_ingredients WHERE recipe_id=%s", (recipe_id,))
    cur.execute("DELETE FROM recipe_steps WHERE recipe_id=%s", (recipe_id,))
    for index, name in enumerate(ingredients, start=1):
        cur.execute(
            "INSERT INTO recipe_ingredients (recipe_id, ord, name) VALUES (%s, %s, %s)",
            (recipe_id, index, name),
        )
    for index, content in enumerate(steps, start=1):
        cur.execute(
            "INSERT INTO recipe_steps (recipe_id, step_no, content) VALUES (%s, %s, %s)",
            (recipe_id, index, content),
        )
