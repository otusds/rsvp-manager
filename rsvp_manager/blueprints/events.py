from datetime import date
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from rsvp_manager.models import EVENT_TYPES, CHANNELS
from rsvp_manager.services import event_service

bp = Blueprint("events", __name__)


@bp.route("/")
@login_required
def home():
    events = event_service.get_user_events(current_user.id)
    me_exists = event_service.check_me_exists(current_user.id)
    return render_template(
        "home.html", events=events, event_types=EVENT_TYPES,
        today_date=date.today(), me_exists=me_exists
    )


@bp.route("/event/add", methods=["POST"])
@login_required
def add_event():
    event = event_service.create_event(current_user.id, request.form)
    return redirect(url_for("events.event_detail", event_id=event.id))


@bp.route("/event/<int:event_id>")
@login_required
def event_detail(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    return render_template(
        "event_detail.html", event=event, channels=CHANNELS, event_types=EVENT_TYPES
    )


@bp.route("/event/<int:event_id>/edit", methods=["POST"])
@login_required
def edit_event(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    event_service.update_event(event, request.form)
    return redirect(url_for("events.event_detail", event_id=event.id))


@bp.route("/event/<int:event_id>/delete", methods=["POST"])
@login_required
def delete_event(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    event_service.delete_event(event)
    return redirect(url_for("events.home"))


@bp.route("/api/event/<int:event_id>/notes", methods=["POST"])
@login_required
def update_event_notes(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    data = request.get_json()
    event_service.update_event_notes(event, data.get("notes", ""))
    return jsonify(ok=True)
