from flask import request
from rsvp_manager.blueprints.api import (
    api_bp, api_success, api_error, api_auth_required, get_api_user,
    serialize_invitation, serialize_invitation_brief,
)
from rsvp_manager.services import invitation_service, event_service


@api_bp.route("/events/<int:event_id>/invitations", methods=["GET"])
@api_auth_required
def list_invitations(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    return api_success([serialize_invitation_brief(inv) for inv in event.invitations])


@api_bp.route("/events/<int:event_id>/available-guests", methods=["GET"])
@api_auth_required
def available_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    result = invitation_service.get_available_guests(event, get_api_user().id)
    return api_success(result)


@api_bp.route("/invitations/<int:invitation_id>", methods=["PUT"])
@api_auth_required
def update_invitation(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(
        invitation_id, get_api_user().id
    )
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)

    if data.get("toggle_send"):
        invitation_service.toggle_send(invitation)

    if "status" in data:
        invitation_service.update_status(invitation, data["status"])

    if "channel" in data:
        invitation_service.update_field(invitation, "channel", data["channel"])

    if "notes" in data:
        invitation_service.update_field(invitation, "notes", data["notes"])

    return api_success(serialize_invitation(invitation))


@api_bp.route("/invitations/<int:invitation_id>", methods=["DELETE"])
@api_auth_required
def delete_invitation(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(
        invitation_id, get_api_user().id
    )
    invitation_service.remove_invitation(invitation)
    return "", 204


@api_bp.route("/events/<int:event_id>/invitations/bulk", methods=["POST"])
@api_auth_required
def bulk_add_invitations(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = invitation_service.bulk_add_guests(
        event, data.get("guest_ids", []), get_api_user().id
    )
    return api_success(added, 201)


@api_bp.route("/events/<int:event_id>/invitations/bulk-create", methods=["POST"])
@api_auth_required
def bulk_create_and_invite(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = invitation_service.bulk_create_and_invite(
        event, data.get("guests", []), get_api_user().id
    )
    return api_success(added, 201)
