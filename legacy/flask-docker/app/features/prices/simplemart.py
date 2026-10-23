"""SimpleMart / 美廉社 GO 美廉商品價格資料擷取。

美廉社搜尋 API 會把 request body 用 CryptoJS AES-CBC 加密後送到
/api/get_goods_arr。這裡照前端 main.js 的做法產生同樣 payload：

    JSON.stringify({type:1, keyword, html_name:"/sortview", data:{keyword}})
    AES-CBC key/iv = "absoietlj32fai12"

本資料擷取邏輯只回候選商品，不讀寫 DB；每週快取與手動選擇仍由前端
localStorage 處理。
"""
from __future__ import annotations

import base64
import json
import re
from html import unescape
from typing import Any
from urllib.parse import quote, urljoin, urlparse, parse_qs

import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend


BASE = "https://goshopping.simplemart.com.tw"
API_PATH = "/api/get_goods_arr"
SEARCH_PATH = "/sortview"
DEFAULT_TIMEOUT = 30
_AES_KEY = b"absoietlj32fai12"


class SimpleMartCrawlerError(Exception):
    """SimpleMart crawler failed."""


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
        r"(\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|入|包|瓶|罐|盒|袋|顆|粒|片|抽|張|捲|組))",
        text,
    )
    return clean(match.group(1))[:20] if match else None


def normalize_name(name: str) -> str:
    value = clean(name)
    value = re.sub(r"[【\[]?(?:限時|特價|促銷|美廉價|促銷價|買一送一|第[二2]件\d+折)[】\]]?", "", value)
    return clean(value)[:100]


def smart_keywords(keyword: str, selected_name: str | None = None, max_keywords: int = 4) -> list[str]:
    """Generate conservative search terms; keep single Chinese characters."""
    terms: list[str] = []

    def add(value: Any) -> None:
        text = clean(value)
        if text and text not in terms:
            terms.append(text)

    add(selected_name)
    add(keyword)

    simplified = re.sub(r"[※＊*（(].*$", "", clean(keyword))
    add(simplified)

    for token in re.findall(r"[\u4e00-\u9fff]+|[A-Za-z0-9]+", clean(keyword)):
        add(token)

    return terms[:max_keywords]


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
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": BASE,
            "Referer": f"{BASE}{SEARCH_PATH}?keyword={encoded_keyword}",
            "X-Requested-With": "XMLHttpRequest",
        }
    )
    return session


def scrape(keyword: str, max_pages: int = 2) -> list[dict[str, Any]]:
    session = make_session(keyword)
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None, str | None]] = set()

    for page in range(1, max_pages + 1):
        payload = _build_search_payload(keyword, page)
        response_json = _post_goods_arr(session, payload)
        products = parse_products(response_json, keyword)

        for product in products:
            key = (product.get("item_name") or "", product.get("price"), product.get("code"))
            if key in seen:
                continue
            seen.add(key)
            results.append(product)

        if not products or page >= _page_count(response_json):
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


def parse_products(response_json: dict[str, Any], keyword: str) -> list[dict[str, Any]]:
    if not isinstance(response_json, dict):
        return []
    if response_json.get("result") not in (None, "success"):
        raise SimpleMartCrawlerError(clean(response_json.get("error_msg") or response_json.get("message") or "美廉社 API 回傳失敗"))

    blocks: list[Any] = []
    for key in ("productblock", "productblocktwo", "productblockthree"):
        value = response_json.get(key)
        if isinstance(value, list):
            blocks.extend(value)

    products: list[dict[str, Any]] = []
    for raw in blocks:
        if not isinstance(raw, dict):
            continue

        name = clean(raw.get("title"))
        price = parse_price(raw.get("price"))
        link = clean(raw.get("link"))
        code = _code_from_link(link)
        if not name or price is None:
            continue

        source_url = urljoin(BASE, link) if link else search_url(keyword)
        products.append(
            {
                "channel": "amart",
                "item_name": name[:100],
                "norm_name": normalize_name(name),
                "price": price,
                "unit": extract_unit(name),
                "source_url": source_url,
                "raw_price": clean(raw.get("price")),
                "code": code,
            }
        )

    return products


def search_url(keyword: str) -> str:
    return f"{BASE}{SEARCH_PATH}?keyword={quote(clean(keyword), safe='')}"


def _build_search_payload(keyword: str, page: int) -> dict[str, Any]:
    data: dict[str, Any] = {"keyword": keyword}
    if page > 1:
        data = {"pageID": str(page), "keyword": keyword}
    return {
        "type": 1,
        "keyword": keyword,
        "html_name": SEARCH_PATH,
        "data": data,
    }


def _post_goods_arr(session: requests.Session, payload: dict[str, Any]) -> dict[str, Any]:
    encrypted = _encrypt_payload(payload)
    response = session.post(
        f"{BASE}{API_PATH}",
        json={"data": encrypted, "member_card": ""},
        timeout=DEFAULT_TIMEOUT,
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        text_head = clean(response.text[:240])
        raise SimpleMartCrawlerError(f"美廉社搜尋 HTTP {response.status_code}: {text_head}") from exc

    try:
        return response.json()
    except ValueError as exc:
        text_head = clean(response.text[:240])
        raise SimpleMartCrawlerError(f"美廉社 API 不是 JSON: {text_head}") from exc


def _encrypt_payload(payload: dict[str, Any]) -> str:
    # Match JS JSON.stringify + CryptoJS AES-CBC/Pkcs7 output as closely as possible.
    plain = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    pad_len = 16 - (len(plain) % 16)
    padded = plain + bytes([pad_len]) * pad_len
    cipher = Cipher(algorithms.AES(_AES_KEY), modes.CBC(_AES_KEY), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return base64.b64encode(ciphertext).decode("ascii")


def _page_count(response_json: dict[str, Any]) -> int:
    arr_page = response_json.get("arr_page") if isinstance(response_json, dict) else None
    page_map = arr_page.get("arr_page") if isinstance(arr_page, dict) else None
    if isinstance(page_map, dict) and page_map:
        pages = []
        for key, value in page_map.items():
            try:
                pages.append(int(key))
            except (TypeError, ValueError):
                if isinstance(value, dict):
                    try:
                        pages.append(int(value.get("html_page")))
                    except (TypeError, ValueError):
                        pass
        if pages:
            return max(pages)

    end_page = clean(arr_page.get("end_page")) if isinstance(arr_page, dict) else ""
    if end_page:
        qs = parse_qs(urlparse(end_page).query)
        try:
            return int((qs.get("pageID") or [1])[0])
        except (TypeError, ValueError):
            pass
    return 1


def _code_from_link(link: str) -> str | None:
    if not link:
        return None
    qs = parse_qs(urlparse(link).query)
    code = (qs.get("id") or [None])[0]
    return clean(code) or None
