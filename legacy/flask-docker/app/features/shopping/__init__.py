from flask import Blueprint

bp = Blueprint('shopping', __name__)

from . import routes  # noqa: E402,F401
