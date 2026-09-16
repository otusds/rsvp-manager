from flask import request
from rsvp_manager.blueprints.api import (
    api_bp, api_success, api_error, api_auth_required, get_api_user,
    serialize_invitation, serialize_invitation_brief,
)
from rsvp_manager.extensions import limiter
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

    user_id = get_api_user().id

    if data.get("toggle_send"):
        invitation_service.toggle_send(invitation, acting_user_id=user_id)

    if "status" in data:
        invitation_service.update_status(invitation, data["status"], acting_user_id=user_id)

    if "notes" in data:
        invitation_service.update_field(invitation, "notes", data["notes"])

    return api_success(serialize_invitation(invitation))


@api_bp.route("/invitations/<int:invitation_id>", methods=["DELETE"])
@api_auth_required
def delete_invitation(invitation_id):
    """Remove a guest from an event, returning what is needed to undo it.

    This is a hard delete and the trash does not cover invitations, so the
    snapshot is the only way back. The client holds it for the undo toast.
    """
    invitation = invitation_service.get_owned_invitation_or_404(
        invitation_id, get_api_user().id
    )
    snapshot = invitation_service.snapshot_invitation(invitation)
    event_id = invitation.event_id
    invitation_service.remove_invitation(invitation)
    return api_success({"event_id": event_id, "snapshot": snapshot})


@api_bp.route("/events/<int:event_id>/invitations/restore", methods=["POST"])
@api_auth_required
def restore_invitations(event_id):
    """Undo a removal, from the snapshots the delete handed back."""
    user = get_api_user()
    event = event_service.get_owned_event_or_404(event_id, user.id)
    data = request.get_json() or {}
    restored = invitation_service.restore_invitations(
        event, data.get("snapshots", []), user.id)
    return api_success({
        "restored": len(restored),
        "invitations": [serialize_invitation_brief(inv) for inv in restored],
    })


@api_bp.route("/events/<int:event_id>/invitations/bulk", methods=["POST"])
@api_auth_required
@limiter.limit("20 per minute")
def bulk_add_invitations(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = invitation_service.bulk_add_guests(
        event, data.get("guest_ids", []), get_api_user().id
    )
    return api_success(added, 201)


@api_bp.route("/events/<int:event_id>/other-events-guests", methods=["GET"])
@api_auth_required
def other_events_guests(event_id):
    user_id = get_api_user().id
    current_event = event_service.get_owned_event_or_404(event_id, user_id)
    source_event_id = request.args.get("source_event_id", type=int)
    if source_event_id:
        source_event = event_service.get_owned_event_or_404(source_event_id, user_id)
        guests = invitation_service.get_event_guests_with_status(
            source_event, current_event, user_id
        )
        return api_success({"guests": guests})
    events = event_service.get_user_events_for_selector(user_id, exclude_event_id=event_id)
    return api_success({"events": events})


@api_bp.route("/events/<int:event_id>/invitations/bulk-create", methods=["POST"])
@api_auth_required
@limiter.limit("20 per minute")
def bulk_create_and_invite(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = invitation_service.bulk_create_and_invite(
        event, data.get("guests", []), get_api_user().id
    )
    return api_success(added, 201)
