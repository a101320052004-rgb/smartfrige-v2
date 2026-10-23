from app.lib.db import get_cursor


SCHEDULE_FIELDS = {"expiry_push_time", "recipe_update_time"}


def fetch_user_ids_due_for(field: str, time_text: str) -> list[int]:
    if field not in SCHEDULE_FIELDS:
        raise ValueError(f"Unsupported schedule field: {field}")

    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT user_id FROM user_settings WHERE {field}=%s",
            (time_text,),
        )
        return [int(row["user_id"]) for row in cur.fetchall()]


def fetch_user_ids_due_for_recurring_expiry(time_text: str, interval_hours: int) -> list[int]:
    current_hour, current_minute = [int(part) for part in time_text.split(":")]
    due_ids: list[int] = []

    with get_cursor(dictionary=True) as cur:
        cur.execute("SELECT user_id, expiry_push_time FROM user_settings")
        rows = cur.fetchall()

    current_minutes = current_hour * 60 + current_minute
    interval_minutes = interval_hours * 60
    for row in rows:
        try:
            start_hour, start_minute = [int(part) for part in str(row["expiry_push_time"]).split(":")]
        except (TypeError, ValueError):
            continue
        start_minutes = start_hour * 60 + start_minute
        elapsed = current_minutes - start_minutes
        if elapsed >= 0 and elapsed % interval_minutes == 0:
            due_ids.append(int(row["user_id"]))

    return due_ids
