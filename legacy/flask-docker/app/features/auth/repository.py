"""使用者資料存取層。"""
from app.lib.db import get_cursor, get_db_conn


def find_by_username(username: str) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT id, username, password_hash, chef_name, chef_rank "
            "FROM users WHERE username=%s",
            (username,),
        )
        return cur.fetchone()


def find_by_id(user_id) -> dict | None:
    with get_cursor(dictionary=True) as cur:
        cur.execute(
            "SELECT id, username, password_hash, chef_name, chef_rank FROM users WHERE id=%s",
            (user_id,),
        )
        return cur.fetchone()


def update_password(user_id, password_hash: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash=%s WHERE id=%s",
            (password_hash, user_id),
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def create_user(username: str, password_hash: str, chef_name: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO users (username, password_hash, chef_name) VALUES (%s, %s, %s)",
            (username, password_hash, chef_name),
        )
        new_id = cur.lastrowid
        cur.execute(
            "INSERT INTO user_settings (user_id) VALUES (%s)",
            (new_id,),
        )
    get_db_conn().commit()   # INSERT 一定要 commit，否則不會真的寫進去
    return new_id
