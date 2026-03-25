from flask import Blueprint, render_template
from flask_login import login_required, current_user
from rsvp_manager.services import trash_service

bp = Blueprint("trash", __name__)


@bp.route("/trash")
@login_required
def trash():
    items = trash_service.get_trash(current_user.id)
    total = len(items["events"]) + len(items["guests"]) + len(items["tags"])
    return render_template("trash.html", items=items, total=total)
