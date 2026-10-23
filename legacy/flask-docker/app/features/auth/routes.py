from flask import request, session

from app.lib.auth import current_user_id
from app.lib.responses import fail, ok

from . import bp, service


@bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    try:
        user = service.register(data.get("username"), data.get("password"), data.get("chefName"))
    except ValueError as exc:
        return fail(str(exc), 400)
    session["user_id"] = int(user["id"])
    return ok(user, 201)


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    user = service.login(data.get("username"), data.get("password"))
    if not user:
        return fail("Email 或密碼錯誤", 401)
    session["user_id"] = int(user["id"])
    return ok(user)


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return ok({"loggedOut": True})


@bp.route("/password/change", methods=["PUT"])
def change_password():
    uid = current_user_id()
    if not uid:
        return fail("尚未登入", 401)
    data = request.get_json(silent=True) or {}
    try:
        service.change_password(uid, data.get("currentPassword"), data.get("newPassword"))
    except ValueError as exc:
        return fail(str(exc), 400)
    return ok({"changed": True})


@bp.route("/me", methods=["GET"])
def me():
    uid = current_user_id()
    user = service.get_user(uid) if uid else None
    if not user:
        session.clear()
        return fail("尚未登入", 401)
    return ok(user)
