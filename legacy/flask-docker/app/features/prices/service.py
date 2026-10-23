from __future__ import annotations

import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any

from . import carrefour, normalizer, pxmart, repository, simplemart


VALID_CHANNELS = {"px", "carrefour", "amart"}
PX_PRICE_CACHE_DAYS = 7


class ValidationError(Exception):
    pass


def crawl_prices(payload: dict | None) -> dict[str, Any]:
    payload = payload or {}
    channel = str(payload.get("channel") or "px").strip().lower()
    if channel != "px":
        raise ValidationError("目前只完成全聯 PXMart：channel 請用 px")

    keyword = str(payload.get("keyword") or payload.get("q") or "梅").strip()
    if not keyword:
        raise ValidationError("keyword 不可空白")

    max_pages = _to_int(payload.get("maxPages", payload.get("max_pages", 10)), "maxPages")
    if max_pages < 1 or max_pages > 20:
        raise ValidationError("maxPages 必須介於 1 到 20")

    items = pxmart.scrape(keyword=keyword, max_pages=max_pages)
    inserted = repository.insert_price_records(_db_items(items))

    return {
        "channel": "px",
        "keyword": keyword,
        "maxPages": max_pages,
        "fetched": len(items),
        "inserted": inserted,
        "items": [_to_api(item) for item in items],
    }


def list_prices(params: dict | None) -> list[dict[str, Any]]:
    params = params or {}
    name = str(params.get("name") or "").strip() or None
    channel = str(params.get("channel") or "").strip().lower() or None
    if channel and channel not in VALID_CHANNELS:
        raise ValidationError("channel 必須是 px / carrefour / amart")

    limit = _to_int(params.get("limit", 50), "limit")
    if limit < 1 or limit > 200:
        raise ValidationError("limit 必須介於 1 到 200")

    return [_record_to_api(row) for row in repository.fetch_latest_records(name, channel, limit)]



def normalize_price_name(params: dict | None) -> dict[str, Any]:
    """Lightweight rule-based item-name normalization.

    This is not AI product matching. It only creates a stable normalized name,
    search keyword, localStorage key, and detected units so manual user product
    alignment is more stable.
    """
    params = params or {}
    name = str(params.get("name") or params.get("q") or "").strip()
    if not name:
        raise ValidationError("name 不可空白")
    selected_name = str(params.get("selectedName") or params.get("selected_name") or "").strip() or None
    return normalizer.analyze_name(name, selected_name=selected_name)

def pxmart_candidates(params: dict | None) -> dict[str, Any]:
    """Return selectable PXMart candidates for one shopping item."""
    return _scraped_candidates(
        params=params,
        channel="px",
        crawler=pxmart,
        max_pages_limit=5,
    )


def carrefour_candidates(params: dict | None) -> dict[str, Any]:
    """Return selectable Carrefour candidates for one shopping item.

    Like PXMart candidates, this endpoint intentionally does NOT read/write
    price_records. Weekly cache and manual selections are frontend localStorage
    only, so this avoids DB/schema conflicts with other teammates.
    """
    return _scraped_candidates(
        params=params,
        channel="carrefour",
        crawler=carrefour,
        max_pages_limit=3,
    )


def simplemart_candidates(params: dict | None) -> dict[str, Any]:
    """Return selectable SimpleMart / 美廉社 candidates for one shopping item.

    This endpoint intentionally does NOT read/write price_records. Weekly cache
    and manual selections are frontend localStorage only.
    """
    return _scraped_candidates(
        params=params,
        channel="amart",
        crawler=simplemart,
        max_pages_limit=3,
    )


def _scraped_candidates(
    params: dict | None,
    channel: str,
    crawler: Any,
    max_pages_limit: int,
) -> dict[str, Any]:
    params = params or {}
    name = str(params.get("name") or params.get("q") or "").strip()
    if not name:
        raise ValidationError("name 不可空白")

    selected_name = str(params.get("selectedName") or params.get("selected_name") or "").strip()
    max_pages = _to_int(params.get("maxPages", params.get("max_pages", 2)), "maxPages")
    if max_pages < 1 or max_pages > max_pages_limit:
        raise ValidationError(f"maxPages 必須介於 1 到 {max_pages_limit}")

    # Lightweight name alignment: create a stable normalized profile for
    # search/cache keys, but keep the final product match as a user decision.
    name_profile = normalizer.analyze_name(name, selected_name=selected_name or None)
    search_input = name_profile.get("searchName") or name

    searched_keywords = crawler.smart_keywords(search_input, selected_name or None, max_keywords=4)
    # Include normalizer-generated keywords in the debug response without
    # changing the crawler API contract.
    for term in name_profile.get("keywords") or []:
        if term and term not in searched_keywords:
            searched_keywords.append(term)
    searched_keywords = searched_keywords[:6]
    if not searched_keywords and name:
        searched_keywords = [name]

    scraped_items = crawler.scrape_smart(
        keyword=search_input,
        selected_name=selected_name or None,
        max_pages=max_pages,
        max_keywords=4,
    )

    merged_candidates = _merge_candidates([_to_api(item, channel=channel) for item in scraped_items])

    # PXBox / 全聯全電商 search is semantic: useful products may not literally
    # contain the user's keyword. Example: searching 鮮奶 can return
    # 「100%生乳保久乳」, which is a valid milk result even though the name does
    # not contain 鮮奶. Do not rank/truncate those away before the user gets a
    # chance to manually select them in the modal.
    if channel == "px":
        candidates = _prefer_selected_first(merged_candidates, selected_name)[:160]
    else:
        candidates = _rank_candidates(
            merged_candidates,
            name,
            selected_name,
        )[:60]
    selected = _find_selected(candidates, selected_name)
    cheapest = _find_cheapest(candidates)

    # If the user manually selected an item, use it only when it still appears
    # in the latest scraper result. If it disappeared, return 無.
    effective = selected if selected_name else cheapest
    price = effective.get("price") if effective else None

    return {
        "channel": channel,
        "query": name,
        "normName": name_profile.get("normName"),
        "searchName": name_profile.get("searchName"),
        "storageKey": name_profile.get("storageKey"),
        "detectedUnits": name_profile.get("detectedUnits"),
        "searchedKeywords": searched_keywords,
        "selectedName": selected_name or None,
        "selected": selected,
        "cheapest": cheapest,
        "price": price,
        "priceDisplay": str(price) if price is not None else "無",
        "candidates": candidates,
        # Server-side cache is disabled on purpose; frontend localStorage caches
        # this whole result for 7 days per item/selection.
        "fromCache": False,
        "refreshed": True,
        "inserted": 0,
        "cacheDays": PX_PRICE_CACHE_DAYS,
    }


def _db_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    db_items = []
    for item in items:
        if not item.get("item_name") or item.get("price") is None:
            continue
        db_items.append(
            {
                "channel": "px",
                "item_name": str(item["item_name"])[:100],
                "norm_name": str(item.get("norm_name") or item["item_name"])[:100],
                "price": int(item["price"]),
                "unit": (str(item.get("unit"))[:20] if item.get("unit") else None),
                "source_url": (str(item.get("source_url"))[:500] if item.get("source_url") else None),
            }
        )
    return db_items


def _to_api(item: dict[str, Any], channel: str = "px") -> dict[str, Any]:
    return {
        "channel": channel,
        "itemName": item.get("item_name"),
        "normName": item.get("norm_name"),
        "price": item.get("price"),
        "unit": item.get("unit"),
        "sourceUrl": item.get("source_url"),
        "rawPrice": item.get("raw_price"),
        "code": item.get("code"),
    }


def _record_to_api(row: dict[str, Any]) -> dict[str, Any]:
    crawled_at = row.get("crawled_at")
    if isinstance(crawled_at, datetime):
        crawled_at = crawled_at.isoformat()
    return {
        "id": str(row["id"]),
        "channel": row["channel"],
        "itemName": row["item_name"],
        "normName": row.get("norm_name"),
        "price": row["price"],
        "unit": row.get("unit"),
        "sourceUrl": row.get("source_url"),
        "crawledAt": crawled_at,
    }


def _merge_candidates(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for item in items:
        if not item.get("itemName") or item.get("price") is None:
            continue
        key = (
            _match_text(item.get("itemName")),
            str(item.get("unit") or ""),
            str(item.get("sourceUrl") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def _prefer_selected_first(items: list[dict[str, Any]], selected_name: str = "") -> list[dict[str, Any]]:
    """Keep crawler/API order, only moving a manually selected item to the top.

    PXBox already returns semantic search results in a useful order. If we sort by
    string similarity too early, items like 「生乳保久乳」 can disappear from the
    first page of selectable candidates for a query like 「鮮奶」.
    """
    selected_key = _match_text(selected_name)
    if not selected_key:
        return items

    selected_items: list[dict[str, Any]] = []
    other_items: list[dict[str, Any]] = []
    for item in items:
        if _match_text(item.get("itemName")) == selected_key:
            selected_items.append(item)
        else:
            other_items.append(item)
    return selected_items + other_items


def _rank_candidates(items: list[dict[str, Any]], query: str, selected_name: str = "") -> list[dict[str, Any]]:
    query_key = _match_text(query)
    selected_key = _match_text(selected_name)

    def score(item: dict[str, Any]) -> tuple[float, int, str]:
        name = str(item.get("itemName") or "")
        key = _match_text(name)
        price = int(item.get("price") or 999999)
        if selected_key and key == selected_key:
            return (-10_000, price, name)
        ratio = SequenceMatcher(None, query_key, key).ratio() if query_key and key else 0
        contains_bonus = 1 if query_key and (query_key in key or key in query_key) else 0
        return (-(contains_bonus * 2 + ratio), price, name)

    return sorted(items, key=score)


def _find_selected(items: list[dict[str, Any]], selected_name: str = "") -> dict[str, Any] | None:
    selected_key = _match_text(selected_name)
    if not selected_key:
        return None
    for item in items:
        if _match_text(item.get("itemName")) == selected_key:
            return item
    return None


def _find_cheapest(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    priced = [item for item in items if item.get("price") is not None]
    if not priced:
        return None
    return min(priced, key=lambda item: int(item.get("price") or 999999))


def _match_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", str(value or "")).lower()).strip()


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _to_int(value: Any, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} 必須是數字")
