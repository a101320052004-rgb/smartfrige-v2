"""統一 API 回傳格式（對齊 ARCHITECTURE.md 第四節）。"""
from flask import jsonify


def ok(data=None, status: int = 200):
    """成功：{ success: true, data: ... }"""
    return jsonify({"success": True, "data": data}), status


def fail(error: str, code: int = 400):
    """失敗：{ success: false, error, code }"""
    return jsonify({"success": False, "error": error, "code": code}), code
