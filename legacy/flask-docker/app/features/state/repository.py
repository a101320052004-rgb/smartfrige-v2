from app.lib.db import get_cursor, get_db_conn


def fetch_state(user_id, state_key: str) -> str | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT value_json FROM user_state_entries WHERE user_id=%s AND state_key=%s",
            (user_id, state_key),
        )
        row = cur.fetchone()
        return row["value_json"] if row else None


def fetch_states(user_id, keys: list[str]) -> dict[str, str]:
    if not keys:
        return {}
    placeholders = ",".join(["%s"] * len(keys))
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT state_key, value_json FROM user_state_entries "
            f"WHERE user_id=%s AND state_key IN ({placeholders})",
            tuple([user_id, *keys]),
        )
        return {row["state_key"]: row["value_json"] for row in cur.fetchall()}


def upsert_state(user_id, state_key: str, value_json: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_state_entries (user_id, state_key, value_json)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)
            """,
            (user_id, state_key, value_json),
        )
    get_db_conn().commit()


def delete_state(user_id, state_key: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM user_state_entries WHERE user_id=%s AND state_key=%s",
            (user_id, state_key),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected
