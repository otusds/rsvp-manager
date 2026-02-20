from flask import request
from rsvp_manager.blueprints.api import (
    api_bp, api_success, api_error, api_auth_required, get_api_user,
    serialize_guest,
)
from rsvp_manager.services import guest_service


@api_bp.route("/guests", methods=["GET"])
@api_auth_required
def list_guests():
    page = request.args.get("page", 1, type=int)
    pagination = guest_service.get_user_guests(get_api_user().id, page=page)
    return api_success({
        "items": [serialize_guest(g) for g in pagination.items],
        "page": pagination.page,
        "pages": pagination.pages,
        "total": pagination.total,
    })


@api_bp.route("/guests/<int:guest_id>", methods=["GET"])
@api_auth_required
def get_guest(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, get_api_user().id)
    return api_success(serialize_guest(guest))


@api_bp.route("/guests", methods=["POST"])
@api_auth_required
def create_guest():
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    guest = guest_service.create_guest(get_api_user().id, data)
    return api_success(serialize_guest(guest), 201)


@api_bp.route("/guests/<int:guest_id>", methods=["PUT"])
@api_auth_required
def update_guest(guest_id):
    user = get_api_user()
    guest = guest_service.get_owned_guest_or_404(guest_id, user.id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)

    # Partial update: apply each field if present
    if "first_name" in data or "last_name" in data:
        guest_service.update_guest_name(
            guest,
            data.get("first_name", guest.first_name),
            data.get("last_name", guest.last_name or ""),
        )

    if "gender" in data:
        guest_service.update_guest_gender(guest, data["gender"])

    if "notes" in data:
        guest_service.update_guest_notes(guest, data["notes"])

    if "is_me" in data:
        guest_service.update_guest_is_me(guest, user.id, data["is_me"])

    return api_success(serialize_guest(guest))


@api_bp.route("/guests/<int:guest_id>", methods=["DELETE"])
@api_auth_required
def delete_guest(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, get_api_user().id)
    guest_service.delete_guest(guest)
    return "", 204


@api_bp.route("/guests/bulk", methods=["POST"])
@api_auth_required
def bulk_create_guests():
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = guest_service.bulk_create_guests(get_api_user().id, data.get("guests", []))
    return api_success(added, 201)
