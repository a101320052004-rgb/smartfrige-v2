from flask import current_app, request

from app.lib.auth import login_required
from app.lib.responses import fail, ok

from . import bp
from .service import ScanError, scan_ingredients


@bp.route('/scan', methods=['POST'])
@login_required
def scan():
    image = request.files.get('image')
    if image is None:
        return fail("請上傳照片", 400)

    try:
        items = scan_ingredients(image.read(), image.mimetype or "image/jpeg")
    except ScanError as exc:
        return fail(str(exc), exc.status_code)
    except Exception:
        current_app.logger.exception("Failed to scan ingredients")
        return fail("AI 辨識食材失敗，請稍後再試。", 500)

    return ok({"items": items})
