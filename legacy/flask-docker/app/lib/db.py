"""MySQL connection helpers.

Keep Docker startup fast: Flask may start before MySQL is fully initialized,
so DB access does a short retry and then returns a clean 503 instead of a 500.
"""
from __future__ import annotations

from contextlib import contextmanager
import os
import time

import mysql.connector
from mysql.connector import Error as MySQLError
from flask import current_app, g


class DatabaseUnavailable(RuntimeError):
    """Raised when MySQL is still starting or the fresh schema is not ready yet."""


def init_app(app):
    """註冊連線生命週期：請求結束時關閉連線。"""
    app.teardown_appcontext(close_db_conn)


def close_db_conn(_exception=None):
    conn = g.pop('db_conn', None)
    if conn:
        conn.close()


def _is_startup_error(exc: MySQLError) -> bool:
    """MySQL fresh-volume startup / schema initialization errors that should be retried."""
    errno = getattr(exc, 'errno', None)
    # 2002/2003/2005: cannot connect / host not ready
    # 2013/2055: lost connection while MySQL is still starting
    # 1049: database not created yet
    # 1146: table not created yet while init SQL is still running
    return errno in {2002, 2003, 2005, 2013, 2055, 1049, 1146}


def get_db_conn():
    """取得（並快取在 Flask g 上的）MySQL 連線。

    Docker Compose should not block for a long healthcheck. Instead, first few
    requests wait briefly for MySQL and then return a friendly 503 if needed.
    """
    conn = g.get('db_conn')
    if conn is not None:
        return conn

    cfg = current_app.config
    attempts = int(os.environ.get('DB_CONNECT_RETRY_ATTEMPTS', '6'))
    delay = float(os.environ.get('DB_CONNECT_RETRY_DELAY_SECONDS', '0.35'))
    last_error: MySQLError | None = None

    for attempt in range(max(1, attempts)):
        try:
            conn = mysql.connector.connect(
                host=cfg['MYSQL_HOST'],
                user=cfg['MYSQL_USER'],
                password=cfg['MYSQL_PASSWORD'],
                database=cfg['MYSQL_DATABASE'],
                port=cfg['MYSQL_PORT'],
                charset=cfg.get('MYSQL_CHARSET', 'utf8mb4'),
                connection_timeout=2,
            )
            g.db_conn = conn
            return conn
        except MySQLError as exc:
            last_error = exc
            if not _is_startup_error(exc) or attempt == attempts - 1:
                break
            time.sleep(delay)

    raise DatabaseUnavailable("資料庫初始化中，請稍後再試") from last_error


@contextmanager
def get_cursor(dictionary: bool = False):
    conn = get_db_conn()
    cursor = conn.cursor(dictionary=dictionary)
    try:
        yield cursor
    except MySQLError as exc:
        # When `docker compose down -v` rebuilds MySQL, Flask can receive a request
        # exactly while 01-schema.sql is still creating tables. Turn that race into
        # a clean 503 instead of the generic internal-server-error screen.
        if _is_startup_error(exc):
            raise DatabaseUnavailable("資料庫初始化中，請稍後再試") from exc
        raise
    finally:
        cursor.close()
