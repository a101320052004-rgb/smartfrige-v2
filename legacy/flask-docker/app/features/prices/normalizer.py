"""Lightweight price item name normalizer for name normalization.

This is intentionally rule-based instead of AI/Gemini.  The product match is
still decided by the user in the selector modal, but these helpers make search
keywords, localStorage keys, and cache keys stable when the shopping-list name
has extra spaces, punctuation, or quantity text.
"""
from __future__ import annotations

import re
from html import unescape
from typing import Any


_UNIT_RE = re.compile(
    r"\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|公升|cc|g|G|kg|KG|克|公斤|公克|入|包|瓶|罐|盒|袋|顆|粒|片|抽|張|捲|組|份|人份)",
)
_PROMO_RE = re.compile(
    r"(?:<[^>]{1,30}>|618必搶|限時|特價|促銷|美廉價|促銷價|首購價|買一送一|第二件\d+折|第2件\d+折|效期\d{4}[/-]\d{1,2}[/-]\d{1,2})",
    re.I,
)
_BRACKET_PROMO_RE = re.compile(r"[【\[]\s*(?:限時|特價|促銷|美廉價|促銷價|首購價|618必搶)\s*[】\]]")
_SPLIT_RE = re.compile(r"[\s,，、/／\\\-－_+＋:：|｜]+")
_TOKEN_RE = re.compile(r"[\u4e00-\u9fff]+|[A-Za-z0-9]+")


def clean(value: Any) -> str:
    """Collapse whitespace and HTML entities without changing meaning."""
    return re.sub(r"\s+", " ", unescape(str(value or ""))).strip()


def extract_units(value: Any) -> list[str]:
    """Return visible size/unit fragments such as 930ml, 200g, 6入."""
    text = clean(value)
    units: list[str] = []
    for match in _UNIT_RE.finditer(text):
        unit = clean(match.group(0))
        if unit and unit not in units:
            units.append(unit[:20])
    return units


def normalize_shopping_name(value: Any) -> str:
    """Normalize a shopping-list item name for display/search.

    This removes promo noise and redundant punctuation, but keeps meaningful
    brand/product words. It does NOT try to claim that 鮮奶 = 生乳 = 牛乳; the
    user still confirms the exact product in the selector modal.
    """
    text = clean(value)
    text = _BRACKET_PROMO_RE.sub(" ", text)
    text = _PROMO_RE.sub(" ", text)
    text = re.sub(r"[()（）\[\]{}<>《》「」『』]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:100]


def search_name(value: Any) -> str:
    """Search-friendly name: remove units/counts after the normalized name."""
    text = normalize_shopping_name(value)
    without_units = _UNIT_RE.sub(" ", text)
    without_units = re.sub(r"\s+", " ", without_units).strip()
    return (without_units or text)[:60]


def storage_key(value: Any) -> str:
    """Stable key for user manual product alignment in localStorage/JSON."""
    text = normalize_shopping_name(value).lower()
    compact = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)
    return compact or clean(value).lower()


def search_keywords(value: Any, selected_name: Any = None, max_keywords: int = 4) -> list[str]:
    """Generate conservative keywords; single CJK chars remain valid.

    Exact selected product comes first so a previously chosen product is more
    likely to still be found on refresh. Then use normalized item names and
    token fallbacks.
    """
    terms: list[str] = []

    def add(candidate: Any) -> None:
        text = clean(candidate)
        if not text:
            return
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", text))
        min_len = 1 if has_cjk else 2
        if len(text) >= min_len and text not in terms:
            terms.append(text[:60])

    add(selected_name)
    add(value)
    add(normalize_shopping_name(value))
    add(search_name(value))

    base = search_name(value)
    for token in _TOKEN_RE.findall(base):
        add(token)

    for token in sorted([t for t in _SPLIT_RE.split(base) if t and not t.isdigit()], key=len, reverse=True):
        add(token)

    compact = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", base)
    if len(compact) >= 5:
        add(compact[:4])
        add(compact[-4:])
    else:
        add(compact)

    return terms[:max_keywords]


def analyze_name(value: Any, selected_name: Any = None) -> dict[str, Any]:
    """Return a small normalized name profile used by API/debug/frontend."""
    original = clean(value)
    norm = normalize_shopping_name(original)
    query = search_name(norm)
    return {
        "originalName": original,
        "normName": norm,
        "searchName": query,
        "storageKey": storage_key(original),
        "detectedUnits": extract_units(original),
        "keywords": search_keywords(original, selected_name=selected_name, max_keywords=6),
    }
