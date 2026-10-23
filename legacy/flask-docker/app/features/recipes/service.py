import json

from . import repository


class ValidationError(Exception):
    pass


def list_recipes(user_id) -> list[dict]:
    return [_to_api(row, user_id) for row in repository.fetch_recipes(user_id)]


def create_recipe(user_id, payload: dict) -> dict:
    data = _from_api(payload or {}, require_public_fields=bool((payload or {}).get("isPublic")))
    recipe_id = repository.insert_recipe(user_id, data)
    return _to_api(repository.fetch_recipe(user_id, recipe_id), user_id)


def update_recipe(user_id, recipe_id, payload: dict) -> dict | None:
    data = _from_api(payload or {}, require_public_fields=bool((payload or {}).get("isPublic")))
    affected = repository.update_recipe(user_id, recipe_id, data)
    if affected == 0:
        return None
    return _to_api(repository.fetch_recipe(user_id, recipe_id), user_id)


def delete_recipe(user_id, recipe_id) -> bool:
    return repository.delete_recipe(user_id, recipe_id) > 0


def toggle_like(user_id, recipe_id) -> dict:
    return _stats_to_api(repository.toggle_like(user_id, recipe_id))


def toggle_save(user_id, recipe_id) -> dict:
    return _stats_to_api(repository.toggle_save(user_id, recipe_id))


def list_follows(user_id) -> list[str]:
    return [str(item) for item in repository.fetch_followed_ids(user_id)]


def follow_user(user_id, followed_id) -> list[str]:
    followed_id = _to_int(followed_id, "followedId")
    if int(user_id) == followed_id:
        raise ValidationError("不能追蹤自己")
    repository.follow_user(user_id, followed_id)
    return list_follows(user_id)


def unfollow_user(user_id, followed_id) -> list[str]:
    followed_id = _to_int(followed_id, "followedId")
    repository.unfollow_user(user_id, followed_id)
    return list_follows(user_id)


def _from_api(payload: dict, require_public_fields: bool) -> dict:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValidationError("食譜名稱必填")

    ingredients = _list_of_text(payload.get("ingredients"))
    steps = _list_of_text(payload.get("steps"))
    image_url = str(payload.get("image") or payload.get("imageUrl") or "").strip()
    prep_time = max(0, _to_int(payload.get("prepTime") or 0, "prepTime"))
    tags = _normalize_tags(payload.get("tags"))
    is_public = bool(payload.get("isPublic"))

    if require_public_fields:
        missing = []
        if not image_url:
            missing.append("成品照片")
        if not ingredients:
            missing.append("食材")
        if not steps:
            missing.append("步驟")
        if prep_time <= 0:
            missing.append("烹飪時間")
        if missing:
            raise ValidationError("公開分享前請補齊：" + "、".join(missing))

    description = str(payload.get("description") or "").strip()
    full_content = str(payload.get("fullContent") or "").strip()
    if not description:
        description = steps[0] if steps else (ingredients[0] if ingredients else "")
    if not full_content:
        full_content = " ".join(steps) if steps else description

    return {
        "name": name[:100],
        "description": description,
        "full_content": full_content,
        "image_url": image_url,
        "prep_time": prep_time,
        "rating": 5.0,
        "origin": "ai" if payload.get("origin") == "ai" else "manual",
        "is_public": is_public,
        "tags": tags,
        "ingredients": ingredients,
        "steps": steps,
    }


def _to_api(row: dict | None, user_id) -> dict | None:
    if not row:
        return None
    tags = row.get("tags") or "[]"
    try:
        parsed_tags = json.loads(tags)
    except (TypeError, json.JSONDecodeError):
        parsed_tags = []
    author_id = str(row["author_id"])
    chef_name = row.get("chef_name") or row.get("username") or "主廚"
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row.get("description") or "",
        "fullContent": row.get("full_content") or "",
        "image": row.get("image_url") or "",
        "prepTime": row.get("prep_time") or 0,
        "tags": parsed_tags if isinstance(parsed_tags, list) else [],
        "author": {
            "id": author_id,
            "name": chef_name,
            "avatar": chef_name[:1].upper(),
            "verified": True,
            "recipeCount": row.get("author_recipe_count") or 0,
        },
        "rating": float(row.get("rating") or 0),
        "createdAt": row["created_at"].strftime("%Y-%m-%d") if row.get("created_at") else "",
        "ingredients": row.get("ingredients") or [],
        "steps": row.get("steps") or [],
        "owner": "me" if int(row["author_id"]) == int(user_id) else "community",
        "isPublic": bool(row.get("is_public")),
        "origin": row.get("origin") or "manual",
        "likes": int(row.get("like_count") or 0),
        "liked": bool(row.get("liked")),
        "saved": bool(row.get("saved")),
    }


def _stats_to_api(row: dict) -> dict:
    return {
        "likes": int(row.get("likes") or 0),
        "liked": bool(row.get("liked")),
        "saved": bool(row.get("saved")),
    }


def _list_of_text(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _normalize_tags(value) -> list[str]:
    if isinstance(value, list):
        raw_tags = value
    else:
        raw_tags = []
    tags = []
    for tag in raw_tags:
        text = str(tag).strip()
        if not text:
            continue
        tags.append(text if text.startswith("#") else f"#{text}")
    return tags[:8]


def _to_int(value, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} 必須是數字")
