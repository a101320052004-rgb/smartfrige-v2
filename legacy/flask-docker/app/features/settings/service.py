import json

from . import repository


VALID_THEMES = {"rose", "emerald", "slate", "silver", "sky", "mint"}
DEFAULT_SETTINGS = {
    "theme": "sky",
    "expiryReminderDays": 3,
    "expiryPushTime": "09:00",
    "recipeUpdateTime": "06:30",
    "tourSeen": False,
    "restockDefaultsSet": False,
    "restockReminderIds": [],
}


class ValidationError(Exception):
    pass


def get_settings(user_id) -> dict:
    return _to_api(repository.fetch_settings(user_id))


def update_settings(user_id, payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("設定資料格式錯誤")

    if "chefName" in payload:
        chef_name = str(payload.get("chefName") or "").strip()[:15] or "頂級大廚"
        repository.update_chef_name(user_id, chef_name)

    data = {}
    if "theme" in payload:
        theme = str(payload.get("theme") or "")
        if theme not in VALID_THEMES:
            raise ValidationError("主題設定不正確")
        data["theme"] = theme

    if "expiryReminderDays" in payload:
        days = _to_int(payload.get("expiryReminderDays"), "即期提醒天數")
        if days not in {1, 2, 3, 5, 7}:
            raise ValidationError("即期提醒天數只能是 1、2、3、5、7")
        data["expiry_reminder_days"] = days

    if "expiryPushTime" in payload:
        data["expiry_push_time"] = _valid_time(payload.get("expiryPushTime"), "即期推播時間")

    if "recipeUpdateTime" in payload:
        data["recipe_update_time"] = _valid_time(payload.get("recipeUpdateTime"), "食譜更新時間")

    if "tourSeen" in payload:
        data["tour_seen"] = 1 if bool(payload.get("tourSeen")) else 0

    if "restockDefaultsSet" in payload:
        data["restock_defaults_set"] = 1 if bool(payload.get("restockDefaultsSet")) else 0

    if "restockReminderIds" in payload:
        value = payload.get("restockReminderIds")
        if not isinstance(value, list):
            raise ValidationError("補貨提醒清單格式錯誤")
        data["restock_reminder_ids"] = [str(item) for item in value]

    repository.update_settings(user_id, data)
    return get_settings(user_id)


def _to_api(row: dict | None) -> dict:
    if not row:
        return {**DEFAULT_SETTINGS, "chefName": "頂級大廚"}

    restock_ids = row.get("restock_reminder_ids") or "[]"
    try:
        parsed_restock_ids = json.loads(restock_ids)
    except (TypeError, json.JSONDecodeError):
        parsed_restock_ids = []

    return {
        "chefName": row.get("chef_name") or "頂級大廚",
        "theme": row.get("theme") or DEFAULT_SETTINGS["theme"],
        "expiryReminderDays": row.get("expiry_reminder_days") or DEFAULT_SETTINGS["expiryReminderDays"],
        "expiryPushTime": row.get("expiry_push_time") or DEFAULT_SETTINGS["expiryPushTime"],
        "recipeUpdateTime": row.get("recipe_update_time") or DEFAULT_SETTINGS["recipeUpdateTime"],
        "tourSeen": bool(row.get("tour_seen")),
        "restockDefaultsSet": bool(row.get("restock_defaults_set")),
        "restockReminderIds": parsed_restock_ids if isinstance(parsed_restock_ids, list) else [],
    }


def _to_int(value, label: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{label}必須是數字")


def _valid_time(value, label: str) -> str:
    text = str(value or "").strip()
    parts = text.split(":")
    if len(parts) != 2:
        raise ValidationError(f"{label}格式錯誤")
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        raise ValidationError(f"{label}格式錯誤")
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValidationError(f"{label}格式錯誤")
    return f"{hour:02d}:{minute:02d}"
