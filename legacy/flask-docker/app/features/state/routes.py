from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import ValidationError


@bp.route("/state/<path:key>", methods=["GET"])
@login_required
def get_state(key):
    try:
        return ok(service.get_state(current_user_id(), key))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to load user state")
        return fail("讀取使用者狀態失敗", 500)


@bp.route("/state/batch", methods=["POST"])
@login_required
def get_states():
    data = request.get_json(silent=True) or {}
    keys = data.get("keys") or []
    if not isinstance(keys, list):
        return fail("keys 必須是陣列", 400)
    try:
        return ok(service.get_states(current_user_id(), keys))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to load user states")
        return fail("讀取使用者狀態失敗", 500)


@bp.route("/state/<path:key>", methods=["PUT"])
@login_required
def set_state(key):
    data = request.get_json(silent=True) or {}
    try:
        return ok(service.set_state(current_user_id(), key, data.get("value")))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to save user state")
        return fail("儲存使用者狀態失敗", 500)


@bp.route("/state/<path:key>", methods=["DELETE"])
@login_required
def delete_state(key):
    try:
        return ok(service.delete_state(current_user_id(), key))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to delete user state")
        return fail("刪除使用者狀態失敗", 500)
