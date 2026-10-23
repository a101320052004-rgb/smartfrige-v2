from __future__ import annotations

from datetime import datetime, timedelta

from app.lib.db import get_cursor, get_db_conn


_COLUMNS = "id, channel, item_name, norm_name, price, unit, source_url, crawled_at"


def insert_price_records(items: list[dict]) -> int:
    if not items:
        return 0

    values = [
        (
            item["channel"],
            item["item_name"],
            item.get("norm_name"),
            item["price"],
            item.get("unit"),
            item.get("source_url"),
        )
        for item in items
    ]

    with get_cursor() as cur:
        cur.executemany(
            "INSERT INTO price_records "
            "(channel, item_name, norm_name, price, unit, source_url) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            values,
        )
        affected = cur.rowcount
    get_db_conn().commit()
    return affected


def fetch_latest_records(name: str | None = None, channel: str | None = None, limit: int = 50) -> list[dict]:
    where = []
    params: list = []

    if name:
        where.append("(norm_name LIKE %s OR item_name LIKE %s)")
        pattern = f"%{name}%"
        params.extend([pattern, pattern])
    if channel:
        where.append("channel=%s")
        params.append(channel)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.append(limit)

    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM price_records "
            f"{where_sql} ORDER BY crawled_at DESC, id DESC LIMIT %s",
            tuple(params),
        )
        return cur.fetchall()


def fetch_recent_records_for_terms(
    terms: list[str],
    channel: str = "px",
    max_age_days: int = 7,
    limit: int = 80,
) -> list[dict]:
    """Read scraper cache. Used to keep PXMart refresh at most weekly per search term."""
    clean_terms = []
    for term in terms:
        text = str(term or "").strip()
        if text and text not in clean_terms:
            clean_terms.append(text)

    if not clean_terms:
        return []

    cutoff = datetime.now() - timedelta(days=max_age_days)
    where = ["channel=%s", "crawled_at >= %s"]
    params: list = [channel, cutoff.strftime("%Y-%m-%d %H:%M:%S")]

    term_clauses = []
    for term in clean_terms:
        term_clauses.append("(norm_name LIKE %s OR item_name LIKE %s)")
        pattern = f"%{term}%"
        params.extend([pattern, pattern])
    where.append(f"({' OR '.join(term_clauses)})")
    params.append(limit)

    with get_cursor(dictionary=True) as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM price_records "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY crawled_at DESC, id DESC LIMIT %s",
            tuple(params),
        )
        return cur.fetchall()
