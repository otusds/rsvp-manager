from flask import Blueprint, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from rsvp_manager.services import invitation_service, event_service

bp = Blueprint("invitations", __name__)


@bp.route("/invitation/<int:invitation_id>/send", methods=["POST"])
@login_required
def toggle_send_invitation(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(invitation_id, current_user.id)
    invitation_service.toggle_send(invitation)
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(
            status=invitation.status,
            date_invited=invitation.date_invited.strftime("%b %d, %Y") if invitation.date_invited else "",
            date_invited_iso=invitation.date_invited.isoformat() if invitation.date_invited else "",
        )
    return redirect(url_for("events.event_detail", event_id=invitation.event_id))


@bp.route("/invitation/<int:invitation_id>/update", methods=["POST"])
@login_required
def update_invitation(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(invitation_id, current_user.id)
    new_status = request.form.get("status")
    if not new_status:
        return jsonify(error="Missing status"), 400
    invitation_service.update_status(invitation, new_status)
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(
            status=invitation.status,
            date_responded=invitation.date_responded.strftime("%b %d, %Y") if invitation.date_responded else "",
            date_responded_iso=invitation.date_responded.isoformat() if invitation.date_responded else "",
        )
    return redirect(url_for("events.event_detail", event_id=invitation.event_id))


@bp.route("/invitation/<int:invitation_id>/delete", methods=["POST"])
@login_required
def remove_invitation(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(invitation_id, current_user.id)
    event_id = invitation_service.remove_invitation(invitation)
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(ok=True)
    return redirect(url_for("events.event_detail", event_id=event_id))


@bp.route("/api/invitation/<int:invitation_id>/field", methods=["POST"])
@login_required
def update_invitation_field(invitation_id):
    invitation = invitation_service.get_owned_invitation_or_404(invitation_id, current_user.id)
    data = request.get_json()
    field = data.get("field")
    value = data.get("value", "")
    invitation_service.update_field(invitation, field, value)
    return jsonify(ok=True)


@bp.route("/api/event/<int:event_id>/available-guests")
@login_required
def api_available_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    result = invitation_service.get_available_guests(event, current_user.id)
    return jsonify(guests=result)


@bp.route("/api/event/<int:event_id>/bulk-add", methods=["POST"])
@login_required
def bulk_add_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    data = request.get_json()
    added = invitation_service.bulk_add_guests(event, data.get("guest_ids", []), current_user.id)
    return jsonify(added=added)


@bp.route("/api/event/<int:event_id>/bulk-create-and-invite", methods=["POST"])
@login_required
def bulk_create_and_invite(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    data = request.get_json()
    added = invitation_service.bulk_create_and_invite(event, data.get("guests", []), current_user.id)
    return jsonify(added=added)
