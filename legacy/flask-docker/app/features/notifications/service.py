from . import repository


EXPIRY_BATCH_INTERVAL_HOURS = 3


def list_notifications(user_id) -> list[dict]:
    return [_to_api(row) for row in repository.fetch_notifications(user_id)]


def mark_read(user_id, notification_id) -> dict | None:
    affected = repository.mark_read(user_id, notification_id)
    if affected == 0:
        return None
    return _to_api(repository.fetch_notification(user_id, notification_id))


def create_restock_notification(user_id, ingredient_id, ingredient_name: str) -> dict | None:
    data = {
        "type": "restock",
        "ingredient_id": ingredient_id,
        "title": f"{ingredient_name} 已加入補貨提醒",
        "body": "這項食材會出現在智慧採購清單中，方便您補貨。",
    }
    notification_id = repository.insert_notification(user_id, data)
    if notification_id is None:
        return None
    return _to_api(repository.fetch_notification(user_id, notification_id))


def clear_restock_notification(user_id, ingredient_id) -> int:
    return repository.delete_unread_by_ingredient(user_id, "restock", ingredient_id)


def clear_all_restock_notifications(user_id) -> int:
    return repository.delete_all_unread_by_type(user_id, "restock")


def sync_expiry_notifications(user_id) -> dict:
    days = repository.fetch_expiry_reminder_days(user_id)
    ingredients = repository.fetch_expiring_ingredients(user_id, days)
    if not ingredients:
        return {"created": 0, "notifications": []}

    if repository.aggregate_exists_within_hours(user_id, "expiry", EXPIRY_BATCH_INTERVAL_HOURS):
        return {"created": 0, "notifications": []}

    notification_id = repository.insert_notification(
        user_id,
        {
            "type": "expiry",
            "ingredient_id": None,
            "title": f"{len(ingredients)} 項食材即將到期",
            "body": _format_expiry_batch_body(ingredients, days),
        },
        dedupe_scope="none",
    )
    created = [_to_api(repository.fetch_notification(user_id, notification_id))] if notification_id is not None else []
    return {"created": len(created), "notifications": created}


def _format_expiry_batch_body(ingredients: list[dict], days: int) -> str:
    lines = []
    for ingredient in ingredients:
        days_left = int(ingredient.get("days_left") or 0)
        label = "今天到期" if days_left <= 0 else f"剩 {days_left} 天"
        lines.append(f"{ingredient['name']}｜{label}")

    return "\n".join(lines)


def _to_api(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "type": row["type"],
        "ingredientId": str(row["ingredient_id"]) if row.get("ingredient_id") else None,
        "title": row["title"],
        "body": row.get("body") or "",
        "isRead": bool(row.get("is_read")),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else "",
    }
