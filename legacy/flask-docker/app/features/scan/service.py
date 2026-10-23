from typing import Any

from app.lib.gemini import GeminiError, generate_json

from .shelf_life_reference import reference_days_left


VALID_CATEGORIES = {"grains", "vegetables", "protein", "dairy", "fruits", "fats", "other"}
VALID_STORAGE_TYPES = {"fridge", "freezer", "pantry"}
INVALID_QUANTITY_UNITS = ("公克", "公斤", "毫升", "公升", "克", "g", "kg", "ml", "l", "cc")


class ScanError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def scan_ingredients(image_bytes: bytes, mime_type: str) -> list[dict[str, Any]]:
    if not image_bytes:
        raise ScanError("請上傳要辨識的照片")

    prompt = """
請辨識圖片中的冰箱食材，只回傳 JSON，不要 Markdown，也不要多餘說明。
品名與數量請盡量使用台灣常用的繁體中文；若照片文字是英文、簡體中文或其他語言，請轉成繁體中文食材名稱與單位。
數量只使用照片中看得到、可直接判斷的單位，不要估重量或容量，也不要使用重量或容量單位。
請優先使用包裝或外觀可判斷的單位，例如 1 瓶、6 顆、1 盒、半顆、1 包、1 罐、1 條、1 把。
保存方式只能使用 fridge、freezer、pantry 三種。冷凍肉、海鮮、冰品請用 freezer；乳製飲品、豆類飲品、果汁等飲料請用 fridge；罐頭、泡麵、調味料請用 pantry；其餘請用 fridge。
格式如下：
{
  "items": [
    {
      "name": "食材名稱",
      "category": "grains|vegetables|protein|dairy|fruits|fats|other",
      "qty": "數量與單位，例如 1 瓶、6 顆、1 盒、半顆",
      "storageType": "fridge|freezer|pantry",
      "daysLeft": 7
    }
  ]
}
如果照片或包裝上看不出保存期限或無法合理判斷剩餘天數，daysLeft 請回傳 null，不要猜測。
如果是蔬菜或水果但沒有清楚日期，也請回傳 null，系統會依據生鮮蔬果建議儲運溫度參考資料補入可儲天數。
如果照片裡有多項食材，最多回傳 25 項。
""".strip()
    system_instruction = "你是食材辨識助理，請根據圖片內容辨識看得到的食材名稱、分類、保存方式與剩餘天數；看不清的食材不要列出，無法判斷天數就回傳 null。品名與數量盡量使用台灣繁體中文，只輸出有效 JSON。"

    try:
        result = generate_json(
            prompt,
            system_instruction=system_instruction,
            image_bytes=image_bytes,
            image_mime_type=mime_type,
            temperature=0.1,
        )
    except GeminiError as exc:
        if exc.status_code == 503:
            raise ScanError("Gemini 目前忙碌，請稍後再試。", 503) from exc
        raise ScanError(str(exc), 502) from exc

    raw_items = result.get("items") if isinstance(result, dict) else result
    if not isinstance(raw_items, list):
        raise ScanError("Gemini 沒有回傳食材清單")

    items: list[dict[str, Any]] = []
    for raw in raw_items[:25]:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name", "")).strip()
        if not name:
            continue
        category = str(raw.get("category", "other")).strip()
        storage_type = str(raw.get("storageType", "fridge")).strip()
        valid_category = category if category in VALID_CATEGORIES else "other"
        valid_storage_type = storage_type if storage_type in VALID_STORAGE_TYPES else "fridge"
        days_left = _safe_days(raw.get("daysLeft"), valid_storage_type)
        if days_left is None:
            days_left = reference_days_left(name, valid_category, valid_storage_type)
        items.append({
            "name": name[:80],
            "category": valid_category,
            "qty": _safe_qty(raw.get("qty")),
            "storageType": valid_storage_type,
            "daysLeft": days_left,
        })

    if not items:
        raise ScanError("沒有辨識到可加入庫存的食材")
    return items


def _safe_qty(value) -> str:
    qty = str(value or "").strip()[:40]
    if not qty:
        return "1 份"
    lowered = qty.lower()
    if any(unit in lowered for unit in INVALID_QUANTITY_UNITS):
        return "1 份"
    return qty


def _max_days_for_storage(storage_type: str) -> int:
    if storage_type == "freezer":
        return 180
    if storage_type == "pantry":
        return 365
    return 30


def _safe_days(value, storage_type: str) -> int | None:
    if value is None or value == "":
        return None
    try:
        days = int(value)
    except (TypeError, ValueError):
        return None
    return max(1, min(days, _max_days_for_storage(storage_type)))
