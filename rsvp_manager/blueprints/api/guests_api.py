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
    show_archived = request.args.get("show_archived", "0") == "1"
    pagination = guest_service.get_user_guests(get_api_user().id, page=page, show_archived=show_archived)
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

    if "is_archived" in data:
        if data["is_archived"]:
            guest_service.archive_guest(guest)
        else:
            guest_service.unarchive_guest(guest)

    if "tag_names" in data:
        from rsvp_manager.services import tag_service
        tag_service.update_guest_tags(guest, user.id, data["tag_names"])

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


@api_bp.route("/guests/bulk-archive", methods=["POST"])
@api_auth_required
def bulk_archive_guests():
    data = request.get_json()
    if not data or "guest_ids" not in data:
        return api_error("guest_ids required", "INVALID_FORMAT", 400)
    archived = guest_service.bulk_archive_guests(get_api_user().id, data["guest_ids"])
    return api_success({"archived": archived})


@api_bp.route("/guests/bulk-delete", methods=["POST"])
@api_auth_required
def bulk_delete_guests():
    data = request.get_json()
    if not data or "guest_ids" not in data:
        return api_error("guest_ids required", "INVALID_FORMAT", 400)
    deleted = guest_service.bulk_delete_guests(get_api_user().id, data["guest_ids"])
    return api_success({"deleted": deleted})


@api_bp.route("/guests/bulk-tag", methods=["POST"])
@api_auth_required
def bulk_tag_guests():
    data = request.get_json()
    if not data or "guest_ids" not in data or "tag_name" not in data:
        return api_error("guest_ids and tag_name required", "INVALID_FORMAT", 400)
    tag_name = data["tag_name"].strip()
    if not tag_name:
        return api_error("tag_name cannot be empty", "INVALID_FORMAT", 400)
    updated = guest_service.bulk_add_tag(get_api_user().id, data["guest_ids"], tag_name)
    return api_success(updated)


@api_bp.route("/guests/bulk-untag", methods=["POST"])
@api_auth_required
def bulk_untag_guests():
    data = request.get_json()
    if not data or "guest_ids" not in data or "tag_name" not in data:
        return api_error("guest_ids and tag_name required", "INVALID_FORMAT", 400)
    tag_name = data["tag_name"].strip()
    if not tag_name:
        return api_error("tag_name cannot be empty", "INVALID_FORMAT", 400)
    updated = guest_service.bulk_remove_tag(get_api_user().id, data["guest_ids"], tag_name)
    return api_success(updated)
