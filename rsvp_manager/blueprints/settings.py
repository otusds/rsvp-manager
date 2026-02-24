import secrets
from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_required, current_user
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Invitation
from rsvp_manager.services.seed_service import seed

bp = Blueprint("settings", __name__)


@bp.route("/settings")
@login_required
def settings():
    return render_template("settings.html", api_token=current_user.api_token)


@bp.route("/settings/load-sample-data", methods=["POST"])
@login_required
def load_sample_data():
    seed(current_user.id)
    flash("Sample data loaded successfully.")
    return redirect(url_for("settings.settings"))


@bp.route("/settings/reset-sample-data", methods=["POST"])
@login_required
def reset_sample_data():
    uid = current_user.id
    Invitation.query.filter(Invitation.event.has(user_id=uid)).delete(synchronize_session=False)
    Event.query.filter_by(user_id=uid).delete()
    Guest.query.filter_by(user_id=uid).delete()
    db.session.commit()
    seed(uid)
    flash("All data reset to sample data.")
    return redirect(url_for("settings.settings"))


@bp.route("/settings/regenerate-token", methods=["POST"])
@login_required
def regenerate_token():
    current_user.api_token = secrets.token_urlsafe(32)
    db.session.commit()
    flash("API token regenerated.")
    return redirect(url_for("settings.settings"))
