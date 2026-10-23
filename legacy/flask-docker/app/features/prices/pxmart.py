"""PXMart / 全聯全電商商品價格資料擷取。

This version uses the newer PXBox API observed from the 全聯全電商 search page:
POST https://api-pxbox.es.pxmart.com.tw/app/2.0/spu/single_search

It is intentionally DB-agnostic here. The service layer decides whether to store
results for /prices/crawl or simply return selectable candidates for the UI.
"""
from __future__ import annotations

import random
import re
import time
from typing import Any
from urllib.parse import quote

import requests


WEB_BASE = "https://pxbox.es.pxmart.com.tw"
API_BASE = "https://api-pxbox.es.pxmart.com.tw"
SINGLE_SEARCH_PATH = "/app/2.0/spu/single_search"
DEFAULT_TIMEOUT = 30
DEFAULT_PAGE_SIZE = 48


class PXMartCrawlerError(Exception):
    """PXMart crawler failed."""


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_price(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value)
    match = re.search(r"\d[\d,]*", text)
    if not match:
        return None
    return int(match.group(0).replace(",", ""))


def pick(obj: Any, *keys: str) -> Any:
    if not isinstance(obj, dict):
        return None
    for key in keys:
        value = obj.get(key)
        if value not in (None, ""):
            return value
    return None


def find_first_price(obj: Any) -> Any:
    price_keys = {
        "price",
        "salePrice",
        "sale_price",
        "sellingPrice",
        "selling_price",
        "productPrice",
        "product_price",
        "originalPrice",
        "original_price",
        "promotionPrice",
        "promotion_price",
        "ori_sp",
        "market_price",
    }

    if isinstance(obj, dict):
        # Prefer real selling prices before fallback prices.
        for key in ("sale_price", "salePrice", "sellingPrice", "selling_price", "price"):
            value = obj.get(key)
            if value not in (None, ""):
                return value
        for key, value in obj.items():
            if key in price_keys and value not in (None, ""):
                return value
        for value in obj.values():
            found = find_first_price(value)
            if found not in (None, ""):
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = find_first_price(value)
            if found not in (None, ""):
                return found
    return None


def find_first_name(obj: Any) -> str | None:
    name_keys = {
        "product_name",
        "title",
        "name",
        "productName",
        "displayName",
        "display_name",
        "itemName",
        "item_name",
    }

    if isinstance(obj, dict):
        for key in name_keys:
            value = obj.get(key)
            if isinstance(value, str) and clean(value):
                return value
        for value in obj.values():
            found = find_first_name(value)
            if found:
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = find_first_name(value)
            if found:
                return found
    return None


def extract_unit(text: str) -> str | None:
    """從商品名粗略抓出規格/單位，例如 936ml、2L、3入。"""
    if not text:
        return None
    match = re.search(
        r"(\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|公克|入|包|瓶|罐|盒|袋|顆|粒|片|抽|組))",
        text,
    )
    return clean(match.group(1))[:20] if match else None


def normalize_name(name: str) -> str:
    """暫時不用 AI 時的 norm_name：移除多餘空白與常見價格活動字樣。"""
    value = clean(name)
    value = re.sub(r"[【\[]?(?:限時|特價|促銷|買一送一|首購價|第[二2]件\d+折)[】\]]?", "", value)
    return clean(value)[:100]


def _visitor_id() -> str:
    """Generate a PXBox-style anonymous visitor id.

    The uploaded example uses a value like c.7390830755.6906443783. It does not
    need to be stable for our use case because manual user selection is stored
    in frontend localStorage, not on PXMart's side.
    """
    rnd = random.Random(time.time_ns())
    return f"c.{rnd.randrange(10**9, 10**10)}.{rnd.randrange(10**9, 10**10)}"


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
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": WEB_BASE,
            "Referer": f"{WEB_BASE}/search/result?keyword={encoded_keyword}",
        }
    )
    return session


def _single_search_payload(keyword: str, page: int, page_size: int, visitor_id: str) -> dict[str, Any]:
    return {
        "search_setting_type": 1,
        "keyword": keyword,
        "sort_type": 0,
        "page_index": page,
        "page_size": page_size,
        "filters": [],
        "visitor_id": visitor_id,
        "user_info_id": "",
    }


def api_single_search(
    session: requests.Session,
    keyword: str,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    visitor_id: str | None = None,
) -> dict[str, Any]:
    """Call PXBox single_search and return parsed JSON."""
    url = API_BASE + SINGLE_SEARCH_PATH
    payload = _single_search_payload(keyword, page, page_size, visitor_id or _visitor_id())

    try:
        response = session.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
    except requests.RequestException as exc:
        raise PXMartCrawlerError(f"PXBox single_search request failed: {exc}") from exc

    text_head = clean(response.text[:300])
    if response.status_code >= 400:
        raise PXMartCrawlerError(
            f"PXBox single_search HTTP {response.status_code}; payload={payload!r}; body={text_head}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise PXMartCrawlerError(f"PXBox single_search JSON parse failed: {exc}; body={text_head}") from exc

    code = str(data.get("code") or "") if isinstance(data, dict) else ""
    if code and code != "0000":
        raise PXMartCrawlerError(f"PXBox single_search returned code={code}; body={text_head}")

    return data


def _extract_product_list(search_json: Any) -> list[dict[str, Any]]:
    if not isinstance(search_json, dict):
        return []
    data = search_json.get("data")
    if isinstance(data, dict):
        products = data.get("product_list") or data.get("products") or data.get("items")
        if isinstance(products, list):
            return [item for item in products if isinstance(item, dict)]
    products = search_json.get("product_list") or search_json.get("products") or search_json.get("items")
    if isinstance(products, list):
        return [item for item in products if isinstance(item, dict)]
    return []


def _total_page(search_json: Any) -> int:
    if not isinstance(search_json, dict):
        return 1
    data = search_json.get("data")
    if isinstance(data, dict):
        for key in ("total_page", "pageCount", "page_count"):
            value = data.get(key)
            if value not in (None, ""):
                try:
                    return max(1, int(value))
                except (TypeError, ValueError):
                    pass
    return 1


def _search_url(keyword: str) -> str:
    return f"{WEB_BASE}/search/result?keyword={quote(keyword, safe='')}"


def _public_product_code(product: dict[str, Any]) -> Any:
    return pick(product, "sale_code", "item_no", "code", "productCode", "product_code")


def _looks_like_public_product_code(value: Any) -> bool:
    text = clean(value)
    # PXBox 商品編號 values are usually zero-padded codes like 00101530/00228537.
    # They are displayed on the product page, but /product/<商品編號> is not the route.
    return bool(re.fullmatch(r"0\d{5,}", text))


def _route_product_id(product: dict[str, Any]) -> Any:
    """Return PXBox's route id, not the public 商品編號/sale_code.

    PXBox product pages use an internal numeric route id such as /product/221883.
    The values exposed as sale_code/item_no are 商品編號 values such as 00228537;
    using those in /product/<id> returns a non-product/ended page.
    Some PXBox search responses expose both values, and in those responses
    product_id/productId is the safer route id while id may be the 商品編號.
    """
    public_code = clean(_public_product_code(product))
    for key in (
        "product_id",
        "productId",
        "spu_id",
        "spuId",
        "spu_info_id",
        "spuInfoId",
        "product_info_id",
        "productInfoId",
        "id",
    ):
        value = pick(product, key)
        text = clean(value)
        if not text:
            continue
        if public_code and text == public_code:
            continue
        if _looks_like_public_product_code(text):
            continue
        return value
    return None


def _product_url(product: dict[str, Any], keyword: str) -> str:
    """Build the public PXBox product detail URL only when the route id is available."""
    internal_link = clean(pick(product, "internal_link", "internalLink"))
    if internal_link.startswith("/product/"):
        product_id = internal_link.rsplit("/", 1)[-1].split("?", 1)[0].strip()
        if product_id and not _looks_like_public_product_code(product_id):
            return f"{WEB_BASE}{internal_link}"
    product_id = _route_product_id(product)
    if product_id not in (None, ""):
        return f"{WEB_BASE}/product/{quote(str(product_id), safe='')}"
    return _search_url(keyword)


def normalize_product(product: dict[str, Any], keyword: str) -> dict[str, Any] | None:
    if not isinstance(product, dict):
        return None

    # For price comparison, sold-out products should not become the cheapest suggestion.
    if product.get("is_sold_out") is True:
        return None

    name = clean(pick(product, "product_name", "title", "name", "productName") or find_first_name(product))
    if not name:
        return None

    raw_price = pick(product, "sale_price", "salePrice", "sellingPrice", "selling_price", "price")
    if raw_price in (None, ""):
        raw_price = find_first_price(product)

    price = parse_price(raw_price)
    if price is None:
        return None

    code = _public_product_code(product) or pick(product, "id")

    return {
        "channel": "px",
        "item_name": name[:100],
        "norm_name": normalize_name(name),
        "price": price,
        "unit": extract_unit(name),
        "source_url": _product_url(product, keyword),
        "raw_price": clean(raw_price),
        "code": code,
    }


def scrape(keyword: str = "梅", max_pages: int = 10) -> list[dict[str, Any]]:
    """Scrape PXBox search results for one keyword."""
    keyword = clean(keyword)
    if not keyword:
        return []

    session = make_session(keyword)
    visitor_id = _visitor_id()
    results: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()

    page = 1
    while page <= max_pages:
        search_json = api_single_search(
            session=session,
            keyword=keyword,
            page=page,
            page_size=DEFAULT_PAGE_SIZE,
            visitor_id=visitor_id,
        )
        products = _extract_product_list(search_json)
        if not products:
            break

        for product in products:
            item = normalize_product(product, keyword)
            if not item:
                continue
            key = (item["item_name"], item["price"], item.get("raw_price"), item.get("code"))
            if key in seen:
                continue
            seen.add(key)
            results.append(item)

        if page >= _total_page(search_json):
            break
        page += 1

    return results


def smart_keywords(keyword: str, selected_name: str | None = None, max_keywords: int = 4) -> list[str]:
    """Generate deterministic search terms to survive minor typos/noisy item names.

    The UI still lets the user pick the final product manually, so this should
    stay simple: exact query first, selected product name second, then cleaned
    variants/tokens.
    """
    values: list[str] = []

    def add(value: Any) -> None:
        text = clean(value)
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", text))
        min_len = 1 if has_cjk else 2
        if len(text) >= min_len and text not in values:
            values.append(text[:60])

    add(keyword)
    if selected_name:
        add(selected_name)

    base = clean(keyword)
    without_brackets = re.sub(r"[（(【\[].*?[）)】\]]", " ", base)
    without_units = re.sub(
        r"\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|公克|入|包|瓶|罐|盒|袋|顆|粒|片|抽|組)",
        " ",
        without_brackets,
    )
    add(without_units)

    tokens = [
        token
        for token in re.split(r"[\s,，、/／\\\-－_+＋:：|｜]+", without_units)
        if len(token) >= 2 and not token.isdigit()
    ]
    for token in sorted(tokens, key=len, reverse=True):
        add(token)

    compact = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", without_units)
    if len(compact) >= 5:
        add(compact[:4])
        add(compact[-4:])
    elif len(compact) >= 2:
        add(compact)

    return values[:max_keywords]


def scrape_smart(
    keyword: str,
    selected_name: str | None = None,
    max_pages: int = 2,
    max_keywords: int = 4,
) -> list[dict[str, Any]]:
    """Scrape PXMart with fallback keywords and de-duplicate results."""
    results: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    last_error: Exception | None = None

    terms = smart_keywords(keyword, selected_name, max_keywords=max_keywords)
    if not terms and clean(keyword):
        terms = [clean(keyword)]

    for term in terms:
        try:
            items = scrape(keyword=term, max_pages=max_pages)
        except Exception as exc:  # Keep later fallback terms available.
            last_error = exc
            continue

        for item in items:
            key = (normalize_name(str(item.get("item_name") or "")), item.get("unit"), item.get("code"))
            if key in seen:
                continue
            seen.add(key)
            results.append(item)

    if not results and last_error:
        raise PXMartCrawlerError(f"全聯商品搜尋失敗：{last_error}") from last_error
    return results
