import json
import re

from . import repository


STATE_KEY_RE = re.compile(r"^[a-zA-Z0-9:_-]{1,120}$")


class ValidationError(Exception):
    pass


def get_state(user_id, key: str) -> dict:
    key = _validate_key(key)
    raw = repository.fetch_state(user_id, key)
    return {"key": key, "value": _loads(raw)}


def get_states(user_id, keys: list[str]) -> dict:
    clean_keys = [_validate_key(key) for key in keys]
    rows = repository.fetch_states(user_id, clean_keys)
    return {key: _loads(rows.get(key)) for key in clean_keys}


def set_state(user_id, key: str, value) -> dict:
    key = _validate_key(key)
    repository.upsert_state(user_id, key, json.dumps(value, ensure_ascii=False))
    return {"key": key, "value": value}


def delete_state(user_id, key: str) -> dict:
    key = _validate_key(key)
    deleted = repository.delete_state(user_id, key)
    return {"deleted": deleted > 0}


def _validate_key(key) -> str:
    key = str(key or "").strip()
    if not STATE_KEY_RE.fullmatch(key):
        raise ValidationError("state key 格式不正確")
    return key


def _loads(raw: str | None):
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None
