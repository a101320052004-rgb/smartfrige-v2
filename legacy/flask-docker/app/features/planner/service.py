from app.lib import gemini
from app.lib.gemini import GeminiError

from . import repository


MEAL_TYPES = ["早餐", "午餐", "晚餐"]

_STORAGE_LABELS = {"fridge": "冷藏", "freezer": "冷凍", "pantry": "常溫"}

_REQUIRED_KEYS = (
    "mealType", "title", "fridgeIngredients", "suggestedIngredients",
    "sourceItem", "sourceCategory", "sourceDaysLeft", "steps",
)


class PlannerError(Exception):
    pass


def generate_meal_plan(
    user_id: int,
    *,
    specified_ingredients: list[str] | None = None,
    exclude_allergens: list[str] | None = None,
    exclude_diseases: list[dict] | None = None,
    avoid_cooking_styles: list[str] | None = None,
    regenerate: dict | None = None,
) -> dict:
    all_ingredients = repository.fetch_user_ingredients(user_id)
    if not all_ingredients:
        raise PlannerError("冰箱裡沒有食材，請先新增食材再使用 AI 配餐")

    if specified_ingredients:
        specified_set = set(specified_ingredients)
        ingredients = [item for item in all_ingredients if item["name"] in specified_set]
        if not ingredients:
            raise PlannerError("找不到指定的食材，請重新選擇")
    else:
        ingredients = all_ingredients

    allergens = exclude_allergens or []
    diseases = exclude_diseases or []
    avoid_styles = [str(style).strip() for style in (avoid_cooking_styles or []) if str(style).strip()]

    if regenerate:
        prompt = _build_regenerate_prompt(ingredients, regenerate, allergens, diseases, avoid_styles)
        raw = gemini.generate_json(prompt)
        if isinstance(raw, dict):
            raw = [raw]
    else:
        prompt = _build_prompt(ingredients, allergens, diseases, avoid_styles)
        raw = gemini.generate_json(prompt)

    return {"recipes": _validate(raw)}


def generate_recipe_image(title: str, description: str) -> str:
    prompt = (
        f"高品質食物攝影，白色或木質淺色背景，俯拍或斜45度角，"
        f"專業餐廳擺盤風格，料理名稱：「{title}」。{description} "
        f"柔和自然光，色彩鮮豔誘人，細節清晰，無文字水印，無人物。"
    )
    return gemini.generate_image(prompt)


def _ingredient_line(item: dict) -> str:
    storage = _STORAGE_LABELS.get(item.get("storage_type", ""), "冷藏")
    days = item.get("days_left")
    urgency = ""
    if days is not None and days <= 2:
        urgency = "（即期優先使用）"
    elif days is not None and days <= 5:
        urgency = "（近期可安排）"
    return f"- {item['name']}（{item['category']}，{storage}，{item['qty']}，剩 {days} 天）{urgency}"


def _diet_section(allergens: list[str], diseases: list[dict]) -> str:
    if not allergens and not diseases:
        return ""
    lines = ["飲食限制："]
    if allergens:
        lines.append(f"- 避免過敏原：{', '.join(allergens)}")
    for disease in diseases:
        label = disease.get("label", "")
        note = disease.get("note", "")
        lines.append(f"- {label}{'：' + note if note else ''}")
    return "\n".join(lines) + "\n\n"


def _avoid_style_section(avoid_cooking_styles: list[str]) -> str:
    if not avoid_cooking_styles:
        return ""
    return (
        "近期已出現過的料理方式或相似做法，請避免重複："
        f"{', '.join(avoid_cooking_styles)}。\n"
        "如果必須使用同一主食材，也要改變烹調法、口味方向、菜名與步驟。\n\n"
    )


def _build_prompt(
    ingredients: list[dict],
    allergens: list[str],
    diseases: list[dict],
    avoid_cooking_styles: list[str],
) -> str:
    ingredient_list = "\n".join(_ingredient_line(item) for item in ingredients)
    diet_section = _diet_section(allergens, diseases)
    avoid_section = _avoid_style_section(avoid_cooking_styles)
    has_frozen = any(item.get("storage_type") == "freezer" for item in ingredients)
    frozen_rule = "若使用冷凍食材，步驟中要提醒退冰或加熱安全。\n" if has_frozen else ""

    return f"""
你是 Smart Fridge 的 AI 配餐助手。請根據冰箱現有食材產生 3 道餐點建議，分別對應早餐、午餐、晚餐。

現有食材：
{ingredient_list}

{diet_section}{avoid_section}設計規則：
1. 優先使用即期食材，並讓 sourceItem 對應主要使用的庫存食材。
2. 每一道都要具體、可實作。steps 要有 6 到 8 個步驟，每個步驟必須包含：具體操作動作、使用的食材與份量、火力大小（大火／中火／小火）、加熱時間（幾分鐘或幾秒），讓完全沒下過廚的人也能照著做出來。
3. suggestedIngredients 只能放建議補充的調味料或常備料，不要把冰箱已有食材放進 suggestedIngredients。
4. 同一次回覆中的 3 道料理，cookingMethod 必須彼此不同，避免重複清炒、燉煮、煎烤等相同或高度相似的料理方式。
5. 避免推薦近期已出現過的料理方式；重複性質太高時，請改成不同烹調法、口味方向與菜名。
{frozen_rule}
只回傳 JSON 陣列，不要 markdown，不要額外說明：
[
  {{
    "mealType": "早餐",
    "title": "料理名稱",
    "description": "一句話描述",
    "cookingMethod": "料理方式，2 到 4 字，例如：清炒、湯品、蒸煮、烘烤、涼拌、燉煮",
    "fridgeIngredients": ["冰箱食材 份量"],
    "suggestedIngredients": ["補充調味料"],
    "sourceItem": "主要庫存食材名稱",
    "sourceCategory": "vegetables/protein/dairy/fruits/grains/fats/other",
    "sourceDaysLeft": 3,
    "steps": ["步驟 1（具體操作、份量、火力、時間）", "步驟 2", "步驟 3", "步驟 4", "步驟 5", "步驟 6"],
    "prepTime": 15,
    "calories": 300
  }}
]
"""


def _build_regenerate_prompt(
    ingredients: list[dict],
    regenerate: dict,
    allergens: list[str],
    diseases: list[dict],
    avoid_cooking_styles: list[str],
) -> str:
    slot_index = int(regenerate.get("slotIndex", 0))
    exclude_style = str(regenerate.get("excludeCookingStyle", "") or "").strip()
    meal_type = MEAL_TYPES[slot_index % len(MEAL_TYPES)]
    ingredient_list = "\n".join(_ingredient_line(item) for item in ingredients)
    diet_section = _diet_section(allergens, diseases)
    avoid_styles = [style for style in [exclude_style, *avoid_cooking_styles] if style]
    avoid_section = _avoid_style_section(avoid_styles)

    return f"""
你是 Smart Fridge 的 AI 配餐助手。請只重新生成「{meal_type}」的一道菜。

現有食材：
{ingredient_list}

{diet_section}{avoid_section}換菜規則：
1. 新推薦的 cookingMethod 必須和被替換料理不同。
2. 如果食材相同，也要換成不同烹調法、口味方向、菜名與步驟。
3. suggestedIngredients 只能放建議補充的調味料或常備料。
4. steps 要有 6 到 8 個步驟，每個步驟必須包含：具體操作動作、使用的食材與份量、火力大小（大火／中火／小火）、加熱時間（幾分鐘或幾秒），讓完全沒下過廚的人也能照著做出來。

只回傳單一 JSON 物件，不要 markdown，不要額外說明：
{{
  "mealType": "{meal_type}",
  "title": "料理名稱",
  "description": "一句話描述",
  "cookingMethod": "料理方式，2 到 4 字",
  "fridgeIngredients": ["冰箱食材 份量"],
  "suggestedIngredients": ["補充調味料"],
  "sourceItem": "主要庫存食材名稱",
  "sourceCategory": "vegetables/protein/dairy/fruits/grains/fats/other",
  "sourceDaysLeft": 3,
  "steps": ["步驟 1（具體操作、份量、火力、時間）", "步驟 2", "步驟 3", "步驟 4", "步驟 5", "步驟 6"],
  "prepTime": 15,
  "calories": 300
}}
"""


def _validate(raw) -> list[dict]:
    if not isinstance(raw, list) or len(raw) == 0:
        raise GeminiError("AI 回傳格式不正確")

    result = []
    for item in raw:
        if not isinstance(item, dict):
            raise GeminiError("AI 回傳格式不正確")
        if not all(key in item for key in _REQUIRED_KEYS):
            raise GeminiError("AI 回傳缺少必要欄位")
        if not isinstance(item["fridgeIngredients"], list):
            raise GeminiError("AI 回傳 fridgeIngredients 應為陣列")
        if not isinstance(item["steps"], list):
            raise GeminiError("AI 回傳 steps 應為陣列")

        result.append({
            "mealType": str(item["mealType"]),
            "title": str(item["title"]),
            "description": str(item.get("description", "")),
            "cookingMethod": str(item["cookingMethod"]) if item.get("cookingMethod") else None,
            "fridgeIngredients": [str(ingredient) for ingredient in item["fridgeIngredients"]],
            "suggestedIngredients": [str(ingredient) for ingredient in item.get("suggestedIngredients") or []],
            "sourceItem": str(item.get("sourceItem", "")),
            "sourceCategory": str(item.get("sourceCategory", "other")),
            "sourceDaysLeft": int(item.get("sourceDaysLeft") or 0),
            "steps": [str(step) for step in item["steps"]],
            "prepTime": int(item.get("prepTime") or 0),
            "calories": int(item.get("calories") or 0),
        })

    return result
