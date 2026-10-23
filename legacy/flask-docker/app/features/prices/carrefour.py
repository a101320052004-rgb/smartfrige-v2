"""Carrefour / 統康線上購物商品價格資料擷取。

走搜尋結果頁 HTML，不碰 Selenium、不寫 DB。這支資料擷取邏輯只回候選商品，
讓前端用 localStorage 做 7 天快取與手動選擇，避免和其他人的 schema / DB 工作衝突。
"""
from __future__ import annotations

import re
from html import unescape
from typing import Any
from urllib.parse import quote, urljoin

import requests


BASE = "https://online.uni-prosperity.com.tw"
SEARCH_PATH = "/zh/search/"
UPDATE_GRID_PATH = "/on/demandware.store/Sites-Uniprosperity-Site/default/Search-UpdateGrid"
DEFAULT_TIMEOUT = 30
PAGE_SIZE = 24


class CarrefourCrawlerError(Exception):
    """Carrefour crawler failed."""


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", unescape(str(value or ""))).strip()


def parse_price(value: Any) -> int | None:
    if value is None:
        return None
    text = clean(value)
    match = re.search(r"\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    return int(float(match.group(0).replace(",", "")))


def extract_unit(text: str) -> str | None:
    if not text:
        return None
    match = re.search(
        r"(\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|入|包|瓶|罐|盒|袋|顆|粒|片|抽|組))",
        text,
    )
    return clean(match.group(1))[:20] if match else None


def normalize_name(name: str) -> str:
    value = clean(name)
    value = re.sub(r"※.*$", "", value)
    value = re.sub(r"[【\[]?(?:限時|特價|促銷|買一送一|第[二2]件\d+折)[】\]]?", "", value)
    return clean(value)[:100]


def make_session(keyword: str) -> requests.Session:
    session = requests.Session()
    encoded_keyword = quote(keyword, safe="")
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "Referer": f"{BASE}{SEARCH_PATH}?q={encoded_keyword}",
            "Origin": BASE,
        }
    )
    return session


def smart_keywords(keyword: str, selected_name: str | None = None, max_keywords: int = 4) -> list[str]:
    """Generate conservative search terms.

    Do not drop single Chinese characters. The user may search 梅 / 米 / 蛋.
    """
    terms: list[str] = []

    def add(value: Any) -> None:
        text = clean(value)
        if text and text not in terms:
            terms.append(text)

    add(selected_name)
    add(keyword)

    simplified = re.sub(r"[※＊*（(].*$", "", clean(keyword))
    add(simplified)

    # Keep Chinese/ASCII token groups. Single CJK chars are valid search words.
    for token in re.findall(r"[\u4e00-\u9fff]+|[A-Za-z0-9]+", clean(keyword)):
        add(token)

    return terms[:max_keywords]


def scrape(keyword: str, max_pages: int = 2) -> list[dict[str, Any]]:
    session = make_session(keyword)
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None, str | None]] = set()

    for page in range(1, max_pages + 1):
        html = _fetch_search_html(session, keyword, page)
        products = parse_products_from_html(html, keyword)

        # Some captured Carrefour URLs use ?q=q%3D鮮奶. Normal search should be
        # ?q=鮮奶, but this fallback keeps the scraper useful if their backend
        # currently expects the nested q= form in a given environment.
        if page == 1 and not products and not keyword.startswith("q="):
            html = _fetch_search_html(session, f"q={keyword}", page)
            products = parse_products_from_html(html, keyword)

        for product in products:
            key = (product.get("item_name") or "", product.get("price"), product.get("code"))
            if key in seen:
                continue
            seen.add(key)
            results.append(product)

        if not products:
            break

    return results


def scrape_smart(keyword: str, selected_name: str | None = None, max_pages: int = 2, max_keywords: int = 4) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None, str | None]] = set()

    for term in smart_keywords(keyword, selected_name, max_keywords=max_keywords):
        for item in scrape(term, max_pages=max_pages):
            key = (item.get("item_name") or "", item.get("price"), item.get("code"))
            if key in seen:
                continue
            seen.add(key)
            results.append(item)

    return results


def parse_products_from_html(html: str, keyword: str) -> list[dict[str, Any]]:
    """Parse Carrefour search result cards.

    The current site renders product cards with <a class="gtm-product-alink" ...>
    and repeats product data in data-* attributes. We use those attributes first,
    then fall back to nearby price/name markup when needed.
    """
    products: list[dict[str, Any]] = []
    if not html:
        return products

    for match in re.finditer(r"<a\b(?=[^>]*\bclass=['\"][^'\"]*\bgtm-product-alink\b[^'\"]*['\"])[^>]*>", html, re.I | re.S):
        tag = match.group(0)
        attrs = _parse_attrs(tag)

        name = clean(attrs.get("data-name") or attrs.get("title") or attrs.get("aria-label"))
        price = parse_price(attrs.get("data-price") or attrs.get("data-baseprice"))
        href = clean(attrs.get("href"))
        code = clean(attrs.get("data-pid")) or None
        variant = clean(attrs.get("data-variant"))

        # If the data attributes are incomplete, inspect a small chunk after the tag.
        if not name or price is None:
            tail = html[match.end() : match.end() + 1800]
            if not name:
                title_match = re.search(r"<a\b[^>]*title=['\"]([^'\"]+)['\"][^>]*>(.*?)</a>", tail, re.I | re.S)
                if title_match:
                    name = clean(title_match.group(1) or _strip_tags(title_match.group(2)))
            if price is None:
                price_match = re.search(r"<div\s+class=['\"]current-price['\"][^>]*>.*?<em>\s*\$?\s*([\d,]+(?:\.\d+)?)", tail, re.I | re.S)
                if price_match:
                    price = parse_price(price_match.group(1))

        if not name or price is None:
            continue

        source_url = urljoin(BASE, href) if href else f"{BASE}{SEARCH_PATH}?q={quote(keyword, safe='')}"
        unit = extract_unit(variant) or extract_unit(name)

        products.append(
            {
                "channel": "carrefour",
                "item_name": name[:100],
                "norm_name": normalize_name(name),
                "price": price,
                "unit": unit,
                "source_url": source_url,
                "raw_price": str(price),
                "code": code,
            }
        )

    return products


def _fetch_search_html(session: requests.Session, keyword: str, page: int) -> str:
    # First page should be the normal search URL. Subsequent pages use the same
    # SFCC update endpoint that the page's pagination JS calls.
    if page <= 1:
        response = session.get(f"{BASE}{SEARCH_PATH}", params={"q": keyword}, timeout=DEFAULT_TIMEOUT)
    else:
        response = session.get(
            f"{BASE}{UPDATE_GRID_PATH}",
            params={"q": keyword, "start": (page - 1) * PAGE_SIZE},
            timeout=DEFAULT_TIMEOUT,
        )

    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        text_head = clean(response.text[:240])
        raise CarrefourCrawlerError(f"家樂福搜尋 HTTP {response.status_code}: {text_head}") from exc

    return response.text


def _parse_attrs(tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for match in re.finditer(r"([\w:-]+)\s*=\s*(['\"])(.*?)\2", tag, re.S):
        attrs[match.group(1).lower()] = clean(match.group(3))
    return attrs


def _strip_tags(value: str) -> str:
    return clean(re.sub(r"<[^>]+>", "", value or ""))
