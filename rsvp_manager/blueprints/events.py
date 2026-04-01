from datetime import date
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, session
from flask_login import login_required, current_user
from rsvp_manager.models import EVENT_TYPES
from rsvp_manager.services import event_service
from rsvp_manager.services.cohost_service import require_event_access, get_event_roles_for_user, get_shared_event_ids

bp = Blueprint("events", __name__)


@bp.route("/")
@login_required
def home():
    page = request.args.get("page", 1, type=int)
    pagination = event_service.get_user_events(current_user.id, page=page)
    event_ids = [e.id for e in pagination.items]
    event_roles = get_event_roles_for_user(current_user.id, event_ids)
    shared_ids = get_shared_event_ids(event_ids)
    if request.args.get("partial"):
        return render_template(
            "partials/event_cards.html", events=pagination.items,
            today_date=date.today(), event_roles=event_roles, shared_ids=shared_ids
        )
    me_exists = event_service.check_me_exists(current_user.id)
    locations = event_service.get_user_locations(current_user.id)
    return render_template(
        "home.html", events=pagination.items, event_types=EVENT_TYPES,
        today_date=date.today(), me_exists=me_exists, pagination=pagination,
        locations=locations, event_roles=event_roles, shared_ids=shared_ids
    )


@bp.route("/event/add", methods=["POST"])
@login_required
def add_event():
    event = event_service.create_event(current_user.id, request.form)
    session["_track"] = "event-created"
    return redirect(url_for("events.event_detail", event_id=event.id))


@bp.route("/event/<int:event_id>")
@login_required
def event_detail(event_id):
    event, role = event_service.get_authorized_event(event_id, current_user.id)
    locations = event_service.get_user_locations(current_user.id)
    return render_template(
        "event_detail.html", event=event, event_types=EVENT_TYPES,
        locations=locations, role=role
    )


@bp.route("/event/<int:event_id>/edit", methods=["POST"])
@login_required
def edit_event(event_id):
    event, role = require_event_access(event_id, current_user.id, min_role="cohost")
    event_service.update_event(event, request.form)
    return redirect(url_for("events.event_detail", event_id=event.id))


@bp.route("/event/<int:event_id>/duplicate", methods=["POST"])
@login_required
def duplicate_event(event_id):
    event, role = require_event_access(event_id, current_user.id, min_role="cohost")
    new_date_str = request.form.get("date", "")
    try:
        new_date = date.fromisoformat(new_date_str) if new_date_str else None
    except ValueError:
        new_date = None
    reset_status = request.form.get("reset_status", "reset") == "reset"
    name = request.form.get("name", "").strip() or None
    new_event = event_service.duplicate_event(event, current_user.id, new_date=new_date, reset_status=reset_status, name=name)
    return redirect(url_for("events.event_detail", event_id=new_event.id))


@bp.route("/event/<int:event_id>/delete", methods=["POST"])
@login_required
def delete_event(event_id):
    event, role = require_event_access(event_id, current_user.id, min_role="owner")
    event_service.delete_event(event)
    return redirect(url_for("events.home"))


@bp.route("/api/event/<int:event_id>/notes", methods=["POST"])
@login_required
def update_event_notes(event_id):
    event, role = require_event_access(event_id, current_user.id, min_role="cohost")
    data = request.get_json() or {}
    event_service.update_event_notes(event, data.get("notes", ""))
    return jsonify(ok=True)
