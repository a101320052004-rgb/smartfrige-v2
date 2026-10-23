from flask import Blueprint

bp = Blueprint('scan', __name__)

from . import routes  # noqa: E402,F401
