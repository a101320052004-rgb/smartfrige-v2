"""Ingredient API routes."""
from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import ValidationError


@bp.route('/ingredients', methods=['GET'])
@login_required
def get_ingredients():
    try:
        items = service.list_ingredients(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load ingredients")
        return fail("讀取食材失敗", 500)
    return ok(items)


@bp.route('/ingredients/removed', methods=['GET'])
@login_required
def get_removed_ingredients():
    try:
        items = service.list_removed_ingredients(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load removed ingredients")
        return fail("讀取移除食材紀錄失敗", 500)
    return ok(items)


@bp.route('/ingredients', methods=['POST'])
@login_required
def create_ingredient():
    try:
        created = service.create_ingredient(current_user_id(), request.get_json(silent=True))
    except ValidationError as e:
        return fail(str(e), 400)
    except Exception:
        current_app.logger.exception("Failed to create ingredient")
        return fail("新增食材失敗", 500)
    return ok(created, 201)


@bp.route('/ingredients/<int:ingredient_id>', methods=['PUT'])
@login_required
def update_ingredient(ingredient_id):
    try:
        updated = service.update_ingredient(
            current_user_id(), ingredient_id, request.get_json(silent=True)
        )
    except ValidationError as e:
        return fail(str(e), 400)
    except Exception:
        current_app.logger.exception("Failed to update ingredient")
        return fail("更新食材失敗", 500)
    if updated is None:
        return fail("找不到該食材", 404)
    return ok(updated)


@bp.route('/ingredients/<int:ingredient_id>', methods=['DELETE'])
@login_required
def delete_ingredient(ingredient_id):
    try:
        data = request.get_json(silent=True) or {}
        removed = service.delete_ingredient(
            current_user_id(),
            ingredient_id,
            data.get("reason", "wasted"),
        )
    except Exception:
        current_app.logger.exception("Failed to delete ingredient")
        return fail("刪除食材失敗", 500)
    if not removed:
        return fail("找不到該食材", 404)
    return ok({"deleted": True, "removed": removed})


@bp.route('/ingredients/removed/<int:removed_id>/restore', methods=['POST'])
@login_required
def restore_removed_ingredient(removed_id):
    try:
        restored = service.restore_removed_ingredient(current_user_id(), removed_id)
    except Exception:
        current_app.logger.exception("Failed to restore removed ingredient")
        return fail("復原食材失敗", 500)
    if restored is None:
        return fail("找不到可復原的食材紀錄", 404)
    return ok(restored)
