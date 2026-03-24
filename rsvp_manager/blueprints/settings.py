from flask import Blueprint, render_template, redirect, url_for, flash, current_app, abort
from flask_login import login_required, current_user
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Invitation, Tag, ActivityLog, guest_tags
from rsvp_manager.services.seed_service import seed

bp = Blueprint("settings", __name__)


@bp.route("/settings")
@login_required
def settings():
    return render_template("settings.html")


@bp.route("/settings/load-sample-data", methods=["POST"])
@login_required
def load_sample_data():
    if current_app.config.get("APP_ENV") != "staging":
        abort(404)
    seed(current_user.id)
    flash("Sample data loaded successfully.")
    return redirect(url_for("settings.settings"))


@bp.route("/settings/reset-sample-data", methods=["POST"])
@login_required
def reset_sample_data():
    if current_app.config.get("APP_ENV") != "staging":
        abort(404)
    uid = current_user.id
    # Delete in correct order to avoid FK violations on guest_tags
    event_ids = [e.id for e in Event.query.filter_by(user_id=uid).with_entities(Event.id)]
    if event_ids:
        Invitation.query.filter(Invitation.event_id.in_(event_ids)).delete(synchronize_session=False)
    guest_ids = [g.id for g in Guest.query.filter_by(user_id=uid).with_entities(Guest.id)]
    if guest_ids:
        db.session.execute(guest_tags.delete().where(guest_tags.c.guest_id.in_(guest_ids)))
    Event.query.filter_by(user_id=uid).delete()
    Guest.query.filter_by(user_id=uid).delete()
    Tag.query.filter_by(user_id=uid).delete()
    ActivityLog.query.filter_by(user_id=uid).delete()
    db.session.commit()
    seed(uid)
    flash("All data reset to sample data.")
    return redirect(url_for("settings.settings"))


