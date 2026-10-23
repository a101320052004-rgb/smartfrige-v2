from datetime import datetime

from . import repository


_VALID_STORAGE = {"fridge", "freezer", "pantry"}
_VALID_REMOVED_REASONS = {"eaten", "wasted", "expired"}


class ValidationError(Exception):
    pass


def list_ingredients(user_id) -> list[dict]:
    return [_to_api(row) for row in repository.fetch_ingredients(user_id)]


def list_removed_ingredients(user_id) -> list[dict]:
    return [_removed_to_api(row) for row in repository.fetch_removed_ingredients(user_id)]


def create_ingredient(user_id, payload: dict) -> dict:
    data = _from_api(payload)
    new_id = repository.insert_ingredient(user_id, data)
    return _to_api(repository.fetch_ingredient(user_id, new_id))


def update_ingredient(user_id, ingredient_id, payload: dict) -> dict | None:
    data = _from_api(payload)
    affected = repository.update_ingredient(user_id, ingredient_id, data)
    if affected == 0:
        return None
    return _to_api(repository.fetch_ingredient(user_id, ingredient_id))


def delete_ingredient(user_id, ingredient_id, reason: str = "wasted") -> dict | None:
    if reason not in _VALID_REMOVED_REASONS:
        reason = "wasted"
    row = repository.archive_and_delete_ingredient(user_id, ingredient_id, reason)
    return _removed_to_api(row) if row else None


def restore_removed_ingredient(user_id, removed_id) -> dict | None:
    new_id = repository.restore_removed_ingredient(user_id, removed_id)
    if new_id is None:
        return None
    return _to_api(repository.fetch_ingredient(user_id, new_id))


def _to_api(row: dict) -> dict:
    days_left = _effective_days_left(row)
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "category": row["category"],
        "qty": row["qty"],
        "note": row.get("note") or "",
        "storageType": row["storage_type"],
        "daysLeft": days_left,
        "totalDays": row["total_days"],
    }


def _removed_to_api(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "item": {
            "id": str(row["original_ingredient_id"]),
            "name": row["name"],
            "category": row["category"],
            "qty": row["qty"],
            "note": row.get("note") or "",
            "storageType": row["storage_type"],
            "daysLeft": row["days_left"],
            "totalDays": row["total_days"],
        },
        "reason": row["removed_reason"],
        "removedAt": _datetime_to_ms(row.get("removed_at")),
        "expiresAt": row.get("expires_at").isoformat() if row.get("expires_at") else None,
    }


def _datetime_to_ms(value) -> int:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return 0
    if not value:
        return 0
    return int(value.timestamp() * 1000)


def _effective_days_left(row: dict) -> int:
    base_days = int(row.get("days_left") or 0)
    created_at = row.get("created_at")
    if not created_at:
        return base_days
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at)
        except ValueError:
            return base_days
    elapsed_days = max(0, (datetime.now().date() - created_at.date()).days)
    return base_days - elapsed_days


def _from_api(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("資料格式錯誤")

    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValidationError("食材名稱不可空白")

    storage_type = payload.get("storageType", "fridge")
    if storage_type not in _VALID_STORAGE:
        raise ValidationError("storageType 必須是 fridge / freezer / pantry")

    return {
        "name": name,
        "category": str(payload.get("category", "other")),
        "qty": str(payload.get("qty", "")).strip(),
        "note": str(payload.get("note", "")).strip()[:500],
        "storage_type": storage_type,
        "days_left": _to_int(payload.get("daysLeft"), "daysLeft"),
        "total_days": _to_int(payload.get("totalDays"), "totalDays"),
    }


def _to_int(value, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} 必須是數字")
