from flask import Flask, jsonify
from mysql.connector import Error as MySQLError

from .config import get_config
from .features import register_features

from .lib.db import DatabaseUnavailable, init_app as init_db
from .lib.migrations import run_startup_migrations
from .lib.scheduler import start_scheduler


def create_app(config_name: str | None = None) -> Flask:
    """Application factory：建立並設定 Flask app。"""
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    init_db(app)
    register_features(app)
    run_startup_migrations(app)
    start_scheduler(app)

    @app.errorhandler(DatabaseUnavailable)
    def database_unavailable(e):
        return jsonify({
            "success": False,
            "error": str(e) or "資料庫初始化中，請稍後再試",
            "code": 503,
        }), 503

    @app.errorhandler(MySQLError)
    def mysql_error(_e):
        # Avoid showing a generic 500 during first boot after `docker compose down -v`.
        return jsonify({
            "success": False,
            "error": "資料庫初始化中，請稍後再試",
            "code": 503,
        }), 503

    # 統一錯誤格式，對齊 ARCHITECTURE.md：{ success:false, error, code }
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"success": False, "error": "資源不存在", "code": 404}), 404

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"success": False, "error": "伺服器內部錯誤", "code": 500}), 500

    return app


app = create_app()
