from flask import Blueprint


bp = Blueprint("state", __name__)

from . import routes  # noqa: E402,F401
