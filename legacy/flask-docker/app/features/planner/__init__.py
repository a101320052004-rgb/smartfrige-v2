from flask import Blueprint

bp = Blueprint('planner', __name__)

from . import routes  # noqa: E402, F401
