from __future__ import annotations

from typing import Literal


StorageKey = Literal["fridge", "pantry"]
FoodCategory = Literal["grains", "vegetables", "protein", "dairy", "fruits", "fats", "other"]
StorageType = Literal["fridge", "freezer", "pantry"]


# Source: team/生鮮蔬果建議儲運溫度參考資料.pdf
# Conservative lower-bound days are used from the reference ranges:
# fridge ~= 5°C column / optimal cold storage, pantry ~= 常溫 25°C column.
PRODUCE_SHELF_LIFE_DAYS: dict[str, dict[StorageKey, int]] = {
    "蘿蔔": {"fridge": 18, "pantry": 3},
    "白蘿蔔": {"fridge": 18, "pantry": 3},
    "胡蘿蔔": {"fridge": 70, "pantry": 7},
    "紅蘿蔔": {"fridge": 70, "pantry": 7},
    "甘藷": {"fridge": 5, "pantry": 30},
    "地瓜": {"fridge": 5, "pantry": 30},
    "牛蒡": {"fridge": 150, "pantry": 9},
    "芋頭": {"fridge": 20, "pantry": 10},
    "芋": {"fridge": 20, "pantry": 10},
    "蓮藕": {"fridge": 10, "pantry": 5},
    "筊白筍": {"fridge": 9, "pantry": 1},
    "蘆筍": {"fridge": 6, "pantry": 1},
    "萵苣": {"fridge": 10, "pantry": 1},
    "生菜": {"fridge": 10, "pantry": 1},
    "西洋芹": {"fridge": 40, "pantry": 2},
    "芹菜": {"fridge": 15, "pantry": 1},
    "茼蒿": {"fridge": 8, "pantry": 1},
    "筒萵": {"fridge": 8, "pantry": 1},
    "莧菜": {"fridge": 4, "pantry": 1},
    "空心菜": {"fridge": 6, "pantry": 1},
    "甕菜": {"fridge": 6, "pantry": 1},
    "蔥": {"fridge": 10, "pantry": 1},
    "青蔥": {"fridge": 10, "pantry": 1},
    "韭菜": {"fridge": 7, "pantry": 1},
    "韮菜": {"fridge": 7, "pantry": 1},
    "韭黃": {"fridge": 14, "pantry": 1},
    "韮黃": {"fridge": 14, "pantry": 1},
    "大蒜": {"fridge": 15, "pantry": 1},
    "九層塔": {"fridge": 1, "pantry": 1},
    "香菜": {"fridge": 12, "pantry": 1},
    "芫荽": {"fridge": 12, "pantry": 1},
    "紅鳳菜": {"fridge": 6, "pantry": 1},
    "甘藷葉": {"fridge": 4, "pantry": 1},
    "地瓜葉": {"fridge": 4, "pantry": 1},
    "菜豆": {"fridge": 8, "pantry": 2},
    "四季豆": {"fridge": 8, "pantry": 2},
    "豇豆": {"fridge": 9, "pantry": 1},
    "甜椒": {"fridge": 10, "pantry": 2},
    "彩椒": {"fridge": 10, "pantry": 2},
    "青椒": {"fridge": 10, "pantry": 2},
    "辣椒": {"fridge": 25, "pantry": 8},
    "甜玉米": {"fridge": 5, "pantry": 1},
    "玉米": {"fridge": 5, "pantry": 1},
    "玉米筍": {"fridge": 4, "pantry": 1},
    "扁蒲": {"fridge": 7, "pantry": 2},
    "絲瓜": {"fridge": 6, "pantry": 1},
    "冬瓜": {"fridge": 15, "pantry": 7},
    "南瓜": {"fridge": 14, "pantry": 14},
    "木瓜": {"fridge": 7, "pantry": 3},
    "西瓜": {"fridge": 14, "pantry": 3},
    "香蕉": {"fridge": 7, "pantry": 3},
    "甜瓜": {"fridge": 14, "pantry": 3},
    "哈密瓜": {"fridge": 14, "pantry": 3},
    "番石榴": {"fridge": 14, "pantry": 3},
    "芭樂": {"fridge": 14, "pantry": 3},
    "楊桃": {"fridge": 21, "pantry": 3},
    "鳳梨": {"fridge": 14, "pantry": 3},
    "蓮霧": {"fridge": 14, "pantry": 2},
    "檸檬": {"fridge": 30, "pantry": 7},
    "棗": {"fridge": 14, "pantry": 3},
    "枇杷": {"fridge": 21, "pantry": 2},
    "番荔枝": {"fridge": 21, "pantry": 2},
    "釋迦": {"fridge": 21, "pantry": 2},
    "火龍果": {"fridge": 14, "pantry": 3},
    "荔枝": {"fridge": 21, "pantry": 2},
    "龍眼": {"fridge": 14, "pantry": 2},
    "芒果": {"fridge": 14, "pantry": 3},
    "檬果": {"fridge": 14, "pantry": 3},
    "酪梨": {"fridge": 14, "pantry": 3},
    "百香果": {"fridge": 21, "pantry": 3},
    "文旦": {"fridge": 60, "pantry": 14},
    "柳橙": {"fridge": 120, "pantry": 14},
    "奇異果": {"fridge": 90, "pantry": 7},
    "石榴": {"fridge": 60, "pantry": 7},
    "安石榴": {"fridge": 60, "pantry": 7},
    "橄欖": {"fridge": 28, "pantry": 7},
    "金柑": {"fridge": 21, "pantry": 7},
    "草莓": {"fridge": 7, "pantry": 1},
    "桶柑": {"fridge": 30, "pantry": 7},
    "海梨柑": {"fridge": 60, "pantry": 7},
    "番茄": {"fridge": 7, "pantry": 3},
    "蕃茄": {"fridge": 7, "pantry": 3},
    "桃": {"fridge": 14, "pantry": 2},
    "水蜜桃": {"fridge": 14, "pantry": 2},
    "李": {"fridge": 21, "pantry": 2},
    "梅": {"fridge": 14, "pantry": 2},
    "葡萄": {"fridge": 49, "pantry": 2},
    "梨": {"fridge": 30, "pantry": 7},
    "蘋果": {"fridge": 30, "pantry": 7},
    "油桃": {"fridge": 14, "pantry": 2},
    "櫻桃": {"fridge": 14, "pantry": 2},
    "榴槤": {"fridge": 42, "pantry": 3},
    "紅毛丹": {"fridge": 7, "pantry": 2},
    "山竹": {"fridge": 14, "pantry": 2},
    "萊姆": {"fridge": 42, "pantry": 7},
}


def reference_days_left(name: str, category: FoodCategory, storage_type: StorageType) -> int | None:
    if category not in {"vegetables", "fruits"}:
        return None

    if storage_type == "freezer":
        return None

    normalized_name = (name or "").strip()
    if not normalized_name:
        return None

    storage_key: StorageKey = "pantry" if storage_type == "pantry" else "fridge"
    matches = [
        life[storage_key]
        for keyword, life in PRODUCE_SHELF_LIFE_DAYS.items()
        if keyword in normalized_name
    ]
    return min(matches) if matches else None
