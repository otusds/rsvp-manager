import logging
from datetime import datetime, timezone
from flask import Blueprint, render_template, redirect, url_for, flash, current_app, abort, request
from flask_login import login_required, current_user
from werkzeug.security import check_password_hash, generate_password_hash
from rsvp_manager.extensions import db, limiter
from rsvp_manager.models import User, Event, Guest, Invitation, Tag, ActivityLog, guest_tags
from rsvp_manager.utils import VALID_GENDERS
from rsvp_manager.services.seed_service import seed
from rsvp_manager.services.email_service import send_email_change_verification, verify_email_change_token

logger = logging.getLogger(__name__)

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


@bp.route("/settings/email", methods=["POST"])
@login_required
@limiter.limit("5 per minute")
def update_email():
    new_email = request.form.get("email", "").strip().lower()
    if not new_email or "@" not in new_email:
        flash("Please enter a valid email address.")
        return redirect(url_for("settings.settings"))
    if new_email == current_user.email:
        flash("That's already your current email.")
        return redirect(url_for("settings.settings"))
    existing = User.query.filter_by(email=new_email).first()
    if existing:
        flash("That email is already in use.")
        return redirect(url_for("settings.settings"))
    try:
        send_email_change_verification(current_user, new_email)
        flash("Verification email sent to " + new_email + ". Please check your inbox to confirm the change.")
    except Exception:
        logger.exception("Failed to send email change verification to %s", new_email)
        flash("Could not send verification email. Please try again later.")
    return redirect(url_for("settings.settings"))


@bp.route("/settings/verify-email-change/<token>")
@login_required
def verify_email_change(token):
    user = verify_email_change_token(token)
    if user and user.id == current_user.id:
        flash("Your email has been updated to " + user.email + ".")
    else:
        flash("Invalid or expired verification link.")
    return redirect(url_for("settings.settings"))


@bp.route("/settings/password", methods=["POST"])
@login_required
@limiter.limit("5 per minute")
def update_password():
    current_password = request.form.get("current_password", "")
    new_password = request.form.get("new_password", "")
    confirm_password = request.form.get("confirm_password", "")
    if not check_password_hash(current_user.password_hash, current_password):
        flash("Current password is incorrect.")
        return redirect(url_for("settings.settings"))
    if len(new_password) < 8:
        flash("New password must be at least 8 characters.")
        return redirect(url_for("settings.settings"))
    if new_password != confirm_password:
        flash("New passwords do not match.")
        return redirect(url_for("settings.settings"))
    current_user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    logger.info("Password changed for user %s", current_user.email)
    flash("Password updated successfully.")
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


