from app.features.notifications import service as notifications_service

from . import repository


VALID_SOURCES = {"manual", "restock", "seed"}


class ValidationError(Exception):
    pass


def list_items(user_id) -> list[dict]:
    return [_to_api(row) for row in repository.fetch_items(user_id)]


def create_item(user_id, payload: dict) -> dict:
    data = _from_api(payload)
    item_id = repository.insert_item(user_id, data)
    if data.get("source") == "restock" and data.get("linked_ingredient_id"):
        notifications_service.create_restock_notification(
            user_id,
            data["linked_ingredient_id"],
            data["name"],
        )
    return _to_api(repository.fetch_item(user_id, item_id))


def update_qty(user_id, item_id, payload: dict) -> dict | None:
    qty = _to_int((payload or {}).get("qty"), "qty")
    qty = max(1, qty)
    affected = repository.update_qty(user_id, item_id, qty)
    if affected == 0:
        return None
    return _to_api(repository.fetch_item(user_id, item_id))


def delete_item(user_id, item_id) -> bool:
    return repository.delete_item(user_id, item_id) > 0


def delete_restock_item(user_id, ingredient_id) -> bool:
    repository.delete_restock_item(user_id, ingredient_id)
    notifications_service.clear_restock_notification(user_id, ingredient_id)
    return True


def delete_all_restock_items(user_id) -> dict:
    deleted = repository.delete_all_restock_items(user_id)
    notifications_service.clear_all_restock_notifications(user_id)
    return {"deleted": deleted}


def _to_api(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "category": row.get("category") or "",
        "qty": row.get("qty") or 1,
        "unit": row.get("unit") or "份",
        "pricePX": row.get("price_px") or 0,
        "priceCarrefour": row.get("price_carrefour") or 0,
        "source": row.get("source") or "manual",
        "linkedIngredientId": str(row["linked_ingredient_id"]) if row.get("linked_ingredient_id") else None,
    }


def _from_api(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("資料格式錯誤")

    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValidationError("品項名稱不可空白")

    source = str(payload.get("source") or "manual")
    if source not in VALID_SOURCES:
        raise ValidationError("source 必須是 manual / restock / seed")

    linked_id = payload.get("linkedIngredientId")
    linked_ingredient_id = _to_int(linked_id, "linkedIngredientId") if linked_id else None

    return {
        "name": name,
        "category": str(payload.get("category") or "")[:20],
        "qty": max(1, _to_int(payload.get("qty", 1), "qty")),
        "unit": str(payload.get("unit") or "份")[:20],
        "price_px": max(0, _to_int(payload.get("pricePX", 0), "pricePX")),
        "price_carrefour": max(0, _to_int(payload.get("priceCarrefour", 0), "priceCarrefour")),
        "price_amart": max(0, _to_int(payload.get("priceAMart", 0), "priceAMart")),
        "source": source,
        "linked_ingredient_id": linked_ingredient_id,
    }


def _to_int(value, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} 必須是數字")
