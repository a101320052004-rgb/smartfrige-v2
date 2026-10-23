from flask import current_app, request

from app.lib.responses import fail, ok

from . import bp, service
from .service import ValidationError


@bp.route('/prices/crawl', methods=['POST'])
def crawl_prices():
    """手動觸發價格資料取得。目前支援全聯 PXMart。"""
    payload = request.get_json(silent=True) or {}
    # 也支援 curl -X POST '/api/prices/crawl?keyword=梅&maxPages=2'
    for key in ("keyword", "q", "channel", "maxPages", "max_pages"):
        if key in request.args and key not in payload:
            payload[key] = request.args.get(key)

    try:
        result = service.crawl_prices(payload)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to crawl prices")
        return fail(f"價格資料取得失敗：{type(exc).__name__}: {exc}", 500)
    return ok(result, 201)


@bp.route('/prices', methods=['GET'])
def get_prices():
    """查詢已寫入 price_records 的最新價格資料。"""
    try:
        items = service.list_prices(request.args)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to load prices")
        return fail(f"讀取價格資料失敗：{type(exc).__name__}: {exc}", 500)
    return ok(items)


@bp.route('/prices/normalize', methods=['GET'])
def normalize_price_name():
    """輕量品名整理，不做 AI 自動判斷。"""
    try:
        result = service.normalize_price_name(request.args)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to normalize price item name")
        return fail(f"品名整理失敗：{type(exc).__name__}: {exc}", 500)
    return ok(result)


@bp.route('/prices/pxmart/candidates', methods=['GET'])
def get_pxmart_candidates():
    """取得某採購品項可手動選擇的全聯商品候選清單。

    此 API 只負責即時抓 PXMart 並回傳候選商品；不讀寫 price_records。
    每週快取與手動選擇由前端 localStorage 處理，避免和隊友的 DB/schema 工作衝突。
    """
    try:
        result = service.pxmart_candidates(request.args)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to load PXMart candidates")
        # 開發階段不要只回泛用錯誤，否則前端看不到是 DB、網路、還是 PXMart API 變動。
        return fail(f"讀取全聯候選商品失敗：{type(exc).__name__}: {exc}", 500)
    return ok(result)

@bp.route('/prices/carrefour/candidates', methods=['GET'])
def get_carrefour_candidates():
    """取得某採購品項可手動選擇的家樂福商品候選清單。

    此 API 只負責即時抓 Carrefour / 統康線上購物並回傳候選商品；不讀寫 price_records。
    每週快取與手動選擇由前端 localStorage 處理，避免和隊友的 DB/schema 工作衝突。
    """
    try:
        result = service.carrefour_candidates(request.args)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to load Carrefour candidates")
        return fail(f"讀取家樂福候選商品失敗：{type(exc).__name__}: {exc}", 500)
    return ok(result)



@bp.route('/prices/simplemart/candidates', methods=['GET'])
def get_simplemart_candidates():
    """取得某採購品項可手動選擇的美廉社商品候選清單。

    此 API 只負責即時抓 SimpleMart / GO 美廉並回傳候選商品；不讀寫 price_records。
    每週快取與手動選擇由前端 localStorage 處理。
    """
    try:
        result = service.simplemart_candidates(request.args)
    except ValidationError as exc:
        return fail(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Failed to load SimpleMart candidates")
        return fail(f"讀取美廉社候選商品失敗：{type(exc).__name__}: {exc}", 500)
    return ok(result)
