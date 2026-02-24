import logging

from flask import Blueprint, render_template, request

bp = Blueprint("errors", __name__)
logger = logging.getLogger(__name__)


@bp.app_errorhandler(400)
def bad_request(e):
    return render_template("errors/400.html"), 400


@bp.app_errorhandler(403)
def forbidden(e):
    logger.warning("403 Forbidden: %s %s", request.method, request.path)
    return render_template("errors/403.html"), 403


@bp.app_errorhandler(404)
def not_found(e):
    return render_template("errors/404.html"), 404


@bp.app_errorhandler(500)
def internal_error(e):
    logger.error("500 Internal Server Error: %s %s", request.method, request.path, exc_info=e)
    return render_template("errors/500.html"), 500
