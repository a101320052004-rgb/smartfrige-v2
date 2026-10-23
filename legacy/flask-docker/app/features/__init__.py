"""集中註冊所有 feature blueprint。新功能在這裡掛上去。"""


def register_features(app):
    from .auth import bp as auth_bp
    from .health import bp as health_bp
    from .ingredients import bp as ingredients_bp
    from .notifications import bp as notifications_bp
    from .prices import bp as prices_bp
    from .recipes import bp as recipes_bp
    from .scan import bp as scan_bp
    from .settings import bp as settings_bp
    from .shopping import bp as shopping_bp
    from .state import bp as state_bp
    from .planner import bp as planner_bp

    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(ingredients_bp, url_prefix='/api')
    app.register_blueprint(notifications_bp, url_prefix='/api')
    app.register_blueprint(prices_bp, url_prefix='/api')
    app.register_blueprint(recipes_bp, url_prefix='/api')
    app.register_blueprint(scan_bp, url_prefix='/api')
    app.register_blueprint(settings_bp, url_prefix='/api')
    app.register_blueprint(shopping_bp, url_prefix='/api')
    app.register_blueprint(state_bp, url_prefix='/api')
    app.register_blueprint(planner_bp, url_prefix='/api')
