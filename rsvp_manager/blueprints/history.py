from flask import Blueprint, render_template, request
from flask_login import login_required, current_user
from rsvp_manager.services import history_service

bp = Blueprint("history", __name__)


@bp.route("/history")
@login_required
def history():
    page = request.args.get("page", 1, type=int)
    pagination = history_service.get_user_history(current_user.id, page=page)
    return render_template("history.html", entries=pagination.items, pagination=pagination)
