from app.lib.responses import ok

from . import bp


@bp.route('/health')
def health():
    """健康檢查：確認 Flask 活著。"""
    return ok({"status": "ok", "service": "smartfridge-flask"})
