from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import ValidationError


@bp.route('/shopping-items', methods=['GET'])
@login_required
def get_shopping_items():
    try:
        items = service.list_items(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load shopping items")
        return fail("讀取採購清單失敗", 500)
    return ok(items)


@bp.route('/shopping-items', methods=['POST'])
@login_required
def create_shopping_item():
    try:
        created = service.create_item(current_user_id(), request.get_json(silent=True))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to create shopping item")
        return fail("新增採購項目失敗", 500)
    return ok(created, 201)


@bp.route('/shopping-items/<int:item_id>', methods=['PUT'])
@login_required
def update_shopping_item(item_id):
    try:
        updated = service.update_qty(current_user_id(), item_id, request.get_json(silent=True) or {})
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to update shopping item")
        return fail("更新採購項目失敗", 500)
    if updated is None:
        return fail("找不到採購項目", 404)
    return ok(updated)


@bp.route('/shopping-items/<int:item_id>', methods=['DELETE'])
@login_required
def delete_shopping_item(item_id):
    try:
        deleted = service.delete_item(current_user_id(), item_id)
    except Exception:
        current_app.logger.exception("Failed to delete shopping item")
        return fail("刪除採購項目失敗", 500)
    if not deleted:
        return fail("找不到採購項目", 404)
    return ok({"deleted": True})


@bp.route('/shopping-items/restock/<int:ingredient_id>', methods=['DELETE'])
@login_required
def delete_restock_shopping_item(ingredient_id):
    try:
        service.delete_restock_item(current_user_id(), ingredient_id)
    except Exception:
        current_app.logger.exception("Failed to delete restock shopping item")
        return fail("刪除補貨採購項目失敗", 500)
    return ok({"deleted": True})


@bp.route('/shopping-items/restock', methods=['DELETE'])
@login_required
def delete_all_restock_shopping_items():
    try:
        result = service.delete_all_restock_items(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to delete all restock shopping items")
        return fail("清除補貨採購項目失敗", 500)
    return ok(result)
