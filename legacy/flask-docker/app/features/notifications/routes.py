from flask import current_app

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service


@bp.route("/notifications", methods=["GET"])
@login_required
def get_notifications():
    try:
        notifications = service.list_notifications(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load notifications")
        return fail("讀取通知失敗", 500)
    return ok(notifications)


@bp.route("/notifications/sync-expiry", methods=["POST"])
@login_required
def sync_expiry_notifications():
    try:
        result = service.sync_expiry_notifications(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to sync expiry notifications")
        return fail("同步即期通知失敗", 500)
    return ok(result)


@bp.route("/notifications/<int:notification_id>/read", methods=["PUT"])
@login_required
def read_notification(notification_id):
    try:
        notification = service.mark_read(current_user_id(), notification_id)
    except Exception:
        current_app.logger.exception("Failed to mark notification as read")
        return fail("更新通知狀態失敗", 500)
    if notification is None:
        return fail("找不到通知", 404)
    return ok(notification)
