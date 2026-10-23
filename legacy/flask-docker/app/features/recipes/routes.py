from flask import current_app, request

from app.lib.auth import current_user_id, login_required
from app.lib.responses import fail, ok

from . import bp
from . import service
from .service import ValidationError


@bp.route("/recipes", methods=["GET"])
@login_required
def get_recipes():
    try:
        recipes = service.list_recipes(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load recipes")
        return fail("讀取食譜失敗", 500)
    return ok(recipes)


@bp.route("/recipes", methods=["POST"])
@login_required
def create_recipe():
    try:
        recipe = service.create_recipe(current_user_id(), request.get_json(silent=True) or {})
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to create recipe")
        return fail("建立食譜失敗", 500)
    return ok(recipe, 201)


@bp.route("/recipes/<int:recipe_id>", methods=["PUT"])
@login_required
def update_recipe(recipe_id):
    try:
        recipe = service.update_recipe(current_user_id(), recipe_id, request.get_json(silent=True) or {})
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to update recipe")
        return fail("更新食譜失敗", 500)
    if recipe is None:
        return fail("找不到食譜", 404)
    return ok(recipe)


@bp.route("/recipes/<int:recipe_id>", methods=["DELETE"])
@login_required
def delete_recipe(recipe_id):
    try:
        deleted = service.delete_recipe(current_user_id(), recipe_id)
    except Exception:
        current_app.logger.exception("Failed to delete recipe")
        return fail("刪除食譜失敗", 500)
    if not deleted:
        return fail("找不到食譜", 404)
    return ok({"deleted": True})


@bp.route("/recipes/<int:recipe_id>/like", methods=["POST"])
@login_required
def like_recipe(recipe_id):
    try:
        stats = service.toggle_like(current_user_id(), recipe_id)
    except Exception:
        current_app.logger.exception("Failed to toggle recipe like")
        return fail("更新按讚失敗", 500)
    return ok(stats)


@bp.route("/recipes/<int:recipe_id>/save", methods=["POST"])
@login_required
def save_recipe(recipe_id):
    try:
        stats = service.toggle_save(current_user_id(), recipe_id)
    except Exception:
        current_app.logger.exception("Failed to toggle recipe save")
        return fail("更新收藏失敗", 500)
    return ok(stats)


@bp.route("/follows", methods=["GET"])
@login_required
def get_follows():
    try:
        follows = service.list_follows(current_user_id())
    except Exception:
        current_app.logger.exception("Failed to load follows")
        return fail("讀取追蹤失敗", 500)
    return ok(follows)


@bp.route("/follows", methods=["POST"])
@login_required
def follow_user():
    try:
        follows = service.follow_user(current_user_id(), (request.get_json(silent=True) or {}).get("followedId"))
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to follow user")
        return fail("追蹤失敗", 500)
    return ok(follows)


@bp.route("/follows/<int:followed_id>", methods=["DELETE"])
@login_required
def unfollow_user(followed_id):
    try:
        follows = service.unfollow_user(current_user_id(), followed_id)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception:
        current_app.logger.exception("Failed to unfollow user")
        return fail("取消追蹤失敗", 500)
    return ok(follows)
