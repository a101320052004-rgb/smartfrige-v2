"""登入狀態工具：所有 feature 都可用，做「只看自己的資料」就靠這個。"""
from functools import wraps

from flask import session

from app.lib.responses import fail


def current_user_id():
    """回傳目前登入者的 user_id；未登入則 None。"""
    return session.get('user_id')


def login_required(fn):
    """裝飾器：沒登入就回 401。用法：在 route 上加 @login_required。"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            return fail("請先登入", 401)
        return fn(*args, **kwargs)
    return wrapper
