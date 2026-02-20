from flask import request
from rsvp_manager.blueprints.api import (
    api_bp, api_success, api_error, api_auth_required, get_api_user,
    serialize_event, serialize_invitation_brief,
)
from rsvp_manager.services import event_service


@api_bp.route("/events", methods=["GET"])
@api_auth_required
def list_events():
    page = request.args.get("page", 1, type=int)
    pagination = event_service.get_user_events(get_api_user().id, page=page)
    return api_success({
        "items": [serialize_event(e) for e in pagination.items],
        "page": pagination.page,
        "pages": pagination.pages,
        "total": pagination.total,
    })


@api_bp.route("/events/<int:event_id>", methods=["GET"])
@api_auth_required
def get_event(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = serialize_event(event)
    data["invitations"] = [serialize_invitation_brief(inv) for inv in event.invitations]
    return api_success(data)


@api_bp.route("/events", methods=["POST"])
@api_auth_required
def create_event():
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    event = event_service.create_event(get_api_user().id, data)
    return api_success(serialize_event(event), 201)


@api_bp.route("/events/<int:event_id>", methods=["PUT"])
@api_auth_required
def update_event(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)

    # Partial update: notes-only shortcut
    if "notes" in data and len(data) == 1:
        event_service.update_event_notes(event, data["notes"])
    else:
        event_service.update_event(event, data)

    return api_success(serialize_event(event))


@api_bp.route("/events/<int:event_id>", methods=["DELETE"])
@api_auth_required
def delete_event(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    event_service.delete_event(event)
    return "", 204
