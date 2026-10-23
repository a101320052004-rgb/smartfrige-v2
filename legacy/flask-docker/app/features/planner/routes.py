from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.gemini import GeminiError
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import PlannerError


@bp.route('/planner/image', methods=['POST'])
@login_required
def generate_image():
    """用 Gemini 2.0 Flash 為配餐食譜生成一張食物攝影圖，回傳 base64 data URL。"""
    body = request.get_json(silent=True) or {}
    title = str(body.get('title', '')).strip()
    description = str(body.get('description', '')).strip()
    if not title:
        return fail("缺少 title", 400)
    try:
        image_data = service.generate_recipe_image(title, description)
    except GeminiError as e:
        current_app.logger.warning("Gemini image error: %s", e)
        return fail(str(e), e.status_code or 503)
    except Exception:
        current_app.logger.exception("Failed to generate recipe image")
        return fail("圖片生成失敗", 500)
    return ok({"imageData": image_data})


@bp.route('/recipes/generate', methods=['POST'])
@login_required
def generate_recipes():
    """依登入者冰箱食材、飲食禁忌、指定食材，呼叫 Gemini 產生早午晚三道配餐建議。
    若帶 regenerate 參數，則只重新生成指定餐別的單道菜（換一道菜功能）。
    """
    body = request.get_json(silent=True) or {}

    specified   = body.get('specifiedIngredients')   # list[str] | None
    allergens   = body.get('excludeAllergens') or []  # list[str]
    diseases    = body.get('excludeDiseases')  or []  # list[{label, note}]
    avoid_styles = body.get('avoidCookingStyles') or [] # list[str]
    regenerate  = body.get('regenerate')              # {slotIndex, excludeCookingStyle} | None

    try:
        result = service.generate_meal_plan(
            current_user_id(),
            specified_ingredients=specified,
            exclude_allergens=allergens,
            exclude_diseases=diseases,
            avoid_cooking_styles=avoid_styles,
            regenerate=regenerate,
        )
    except PlannerError as e:
        return fail(str(e), 400)
    except GeminiError as e:
        current_app.logger.warning("Gemini error in planner: %s", e)
        return fail("AI 配餐暫時不可用，請稍後再試", e.status_code or 503)
    except Exception:
        current_app.logger.exception("Failed to generate meal plan")
        return fail("AI 配餐失敗", 500)
    return ok(result)
