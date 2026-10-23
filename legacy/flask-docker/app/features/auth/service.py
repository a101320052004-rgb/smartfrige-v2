import re

from werkzeug.security import check_password_hash, generate_password_hash

from . import repository


EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.IGNORECASE)


def register(username: str, password: str, chef_name: str | None = None) -> dict:
    username = _normalize_email(username)
    if not username or not password:
        raise ValueError("請輸入 Email 與密碼")
    if not _is_valid_email(username):
        raise ValueError("Email 格式不正確")
    if len(password) < 8:
        raise ValueError("密碼至少 8 碼")
    if repository.find_by_username(username):
        raise ValueError("這個 Email 已經註冊")

    pw_hash = generate_password_hash(password)
    chef_name = (chef_name or username.split("@")[0]).strip()
    user_id = repository.create_user(username, pw_hash, chef_name)
    return _public(repository.find_by_id(user_id))


def login(username: str, password: str) -> dict | None:
    username = _normalize_email(username)
    if not _is_valid_email(username):
        return None

    user = repository.find_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password or ""):
        return None
    return _public(user)


def get_user(user_id) -> dict | None:
    user = repository.find_by_id(user_id)
    return _public(user) if user else None


def change_password(user_id, current_password: str, new_password: str) -> None:
    if not current_password or not new_password:
        raise ValueError("請輸入目前密碼與新密碼")
    if len(new_password) < 8:
        raise ValueError("新密碼至少需要 8 碼")

    user = repository.find_by_id(user_id)
    if not user or not check_password_hash(user["password_hash"], current_password):
        raise ValueError("目前密碼不正確")
    if check_password_hash(user["password_hash"], new_password):
        raise ValueError("新密碼不可與目前密碼相同")

    repository.update_password(user_id, generate_password_hash(new_password))


def _public(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "username": row["username"],
        "chefName": row.get("chef_name"),
        "chefRank": row.get("chef_rank"),
    }


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.fullmatch(value))
