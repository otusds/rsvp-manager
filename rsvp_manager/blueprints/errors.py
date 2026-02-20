from flask import Blueprint, render_template

bp = Blueprint("errors", __name__)


@bp.app_errorhandler(400)
def bad_request(e):
    return render_template("errors/400.html"), 400


@bp.app_errorhandler(403)
def forbidden(e):
    return render_template("errors/403.html"), 403


@bp.app_errorhandler(404)
def not_found(e):
    return render_template("errors/404.html"), 404


@bp.app_errorhandler(500)
def internal_error(e):
    return render_template("errors/500.html"), 500
