from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import ValidationError


@bp.route('/settings', methods=['GET'])
@login_required
def get_settings():
    try:
        settings = service.get_settings(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load user settings")
        return fail("讀取使用者設定失敗", 500)
    return ok(settings)


@bp.route('/settings', methods=['PUT'])
@login_required
def update_settings():
    try:
        settings = service.update_settings(current_user_id(), request.get_json(silent=True) or {})
    except ValidationError as e:
        return fail(str(e), 400)
    except Exception:
        current_app.logger.exception("Failed to update user settings")
        return fail("更新使用者設定失敗", 500)
    return ok(settings)
