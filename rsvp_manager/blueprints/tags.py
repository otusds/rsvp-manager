from flask import Blueprint, render_template
from flask_login import login_required, current_user
from rsvp_manager.services import tag_service
from rsvp_manager.models import Tag

bp = Blueprint("tags", __name__)


@bp.route("/tags")
@login_required
def tags():
    user_tags = tag_service.get_user_tags(current_user.id)
    return render_template("tags.html", tags=user_tags, tag_colors=Tag.TAG_COLORS)
