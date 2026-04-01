from datetime import datetime, timezone
from flask import Blueprint, render_template, redirect, url_for, flash, current_app, abort, request
from flask_login import login_required, current_user
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Invitation, Tag, ActivityLog, guest_tags
from rsvp_manager.utils import VALID_GENDERS
from rsvp_manager.services.seed_service import seed

bp = Blueprint("settings", __name__)


@bp.route("/settings")
@login_required
def settings():
    # Backfill profile from is_me guest for existing users
    if not current_user.first_name:
        me_guest = Guest.query.filter_by(user_id=current_user.id, is_me=True).filter(Guest.deleted_at.is_(None)).first()
        if me_guest:
            current_user.first_name = me_guest.first_name
            current_user.last_name = me_guest.last_name or ""
            current_user.gender = me_guest.gender or ""
            db.session.commit()
    return render_template("settings.html")


@bp.route("/settings/profile", methods=["POST"])
@login_required
def update_profile():
    first_name = request.form.get("first_name", "").strip()
    last_name = request.form.get("last_name", "").strip()
    gender = request.form.get("gender", "")
    if not first_name:
        flash("First name is required.")
        return redirect(url_for("settings.settings"))
    if gender not in VALID_GENDERS:
        flash("Please select a gender.")
        return redirect(url_for("settings.settings"))
    current_user.first_name = first_name
    current_user.last_name = last_name
    current_user.gender = gender
    # Sync the is_me guest
    me_guest = Guest.query.filter_by(user_id=current_user.id, is_me=True).filter(Guest.deleted_at.is_(None)).first()
    if me_guest:
        me_guest.first_name = first_name
        me_guest.last_name = last_name
        me_guest.gender = gender
        me_guest.date_edited = datetime.now(timezone.utc)
    else:
        me_guest = Guest(user_id=current_user.id, first_name=first_name, last_name=last_name,
                         gender=gender, is_me=True, date_created=datetime.now(timezone.utc))
        db.session.add(me_guest)
    db.session.commit()
    flash("Profile updated.")
    return redirect(url_for("settings.settings"))


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


