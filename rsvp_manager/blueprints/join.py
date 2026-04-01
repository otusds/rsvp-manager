from flask import Blueprint, render_template, redirect, url_for, session
from flask_login import login_required, current_user
from rsvp_manager.extensions import limiter
from rsvp_manager.models import EventShareLink, Event
from rsvp_manager.services import cohost_service

bp = Blueprint("join", __name__)


@bp.route("/join/<token>")
@limiter.limit("20 per minute")
@login_required
def join_event(token):
    # Validate token before joining
    link = EventShareLink.query.filter_by(token=token, is_active=True).first()
    if not link:
        return render_template("join.html", error="This share link is invalid or has been disabled.")
    event = Event.query.filter_by(id=link.event_id).filter(Event.deleted_at.is_(None)).first()
    if not event:
        return render_template("join.html", error="This event no longer exists.")
    # Check if already a member
    if event.user_id == current_user.id:
        return redirect(url_for("events.event_detail", event_id=event.id))
    from rsvp_manager.models import EventCohost
    existing = EventCohost.query.filter_by(event_id=event.id, user_id=current_user.id).first()
    if existing:
        return redirect(url_for("events.event_detail", event_id=event.id))
    return render_template("join.html", event=event, link=link, token=token)


@bp.route("/join/<token>/accept", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def accept_join(token):
    event, role = cohost_service.join_event(token, current_user.id)
    if not event:
        return render_template("join.html", error="This share link is invalid or has been disabled.")
    session["_track"] = "cohost-added"
    return redirect(url_for("events.event_detail", event_id=event.id))
