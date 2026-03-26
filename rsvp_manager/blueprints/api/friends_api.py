from flask import request
from rsvp_manager.blueprints.api import (
    api_bp, api_success, api_error, api_auth_required, get_api_user,
    serialize_friend,
)
from rsvp_manager.services import friend_service


@api_bp.route("/friends", methods=["GET"])
@api_auth_required
def list_friends():
    page = request.args.get("page", 1, type=int)
    show_archived = request.args.get("show_archived", "0")
    pagination = friend_service.get_user_guests(get_api_user().id, page=page, show_archived=show_archived)
    return api_success({
        "items": [serialize_friend(g) for g in pagination.items],
        "page": pagination.page,
        "pages": pagination.pages,
        "total": pagination.total,
    })


@api_bp.route("/friends/<int:guest_id>", methods=["GET"])
@api_auth_required
def get_friend(guest_id):
    from rsvp_manager.extensions import db as _db
    from rsvp_manager.models import Guest, Invitation, EventCohost, Event
    user_id = get_api_user().id
    guest = _db.session.get(Guest, guest_id)
    if not guest or guest.deleted_at is not None:
        return api_error("Guest not found", "NOT_FOUND", 404)
    if guest.user_id == user_id:
        return api_success(serialize_friend(guest, viewer_user_id=user_id))
    # Allow read-only access if user owns or co-hosts an event with this guest
    shared_as_cohost = _db.session.query(Invitation).filter(
        Invitation.guest_id == guest_id
    ).join(EventCohost, EventCohost.event_id == Invitation.event_id).filter(
        EventCohost.user_id == user_id
    ).first()
    shared_as_owner = _db.session.query(Invitation).filter(
        Invitation.guest_id == guest_id
    ).join(Event, Event.id == Invitation.event_id).filter(
        Event.user_id == user_id
    ).first()
    if shared_as_cohost or shared_as_owner:
        from rsvp_manager.services.friend_service import _normalize_name
        data = serialize_friend(guest)
        # Check if viewer has a friend with the same name
        norm_first = _normalize_name(guest.first_name)
        norm_last = _normalize_name(guest.last_name)
        my_guests = Guest.query.filter_by(user_id=user_id).filter(Guest.deleted_at.is_(None)).all()
        data["name_match_in_my_friends"] = any(
            _normalize_name(g.first_name) == norm_first and _normalize_name(g.last_name) == norm_last
            for g in my_guests
        )
        return api_success(data)
    return api_error("Access denied", "FORBIDDEN", 403)


@api_bp.route("/friends", methods=["POST"])
@api_auth_required
def create_friend():
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    guest = friend_service.create_guest(get_api_user().id, data)
    return api_success(serialize_friend(guest), 201)


@api_bp.route("/friends/<int:guest_id>", methods=["PUT"])
@api_auth_required
def update_friend(guest_id):
    user = get_api_user()
    guest = friend_service.get_owned_guest_or_404(guest_id, user.id)
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)

    # Partial update: apply each field if present
    if "first_name" in data or "last_name" in data:
        friend_service.update_guest_name(
            guest,
            data.get("first_name", guest.first_name),
            data.get("last_name", guest.last_name or ""),
        )

    if "gender" in data:
        friend_service.update_guest_gender(guest, data["gender"])

    if "notes" in data:
        friend_service.update_guest_notes(guest, data["notes"])

    if "is_me" in data:
        friend_service.update_guest_is_me(guest, user.id, data["is_me"])

    if "is_archived" in data:
        if data["is_archived"]:
            friend_service.archive_guest(guest)
        else:
            friend_service.unarchive_guest(guest)

    if "tag_names" in data:
        from rsvp_manager.services import tag_service
        tag_service.update_guest_tags(guest, user.id, data["tag_names"])

    return api_success(serialize_friend(guest))


@api_bp.route("/friends/<int:guest_id>", methods=["DELETE"])
@api_auth_required
def delete_friend(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, get_api_user().id)
    friend_service.delete_guest(guest)
    return "", 204


@api_bp.route("/friends/bulk", methods=["POST"])
@api_auth_required
def bulk_create_friends():
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)
    added = friend_service.bulk_create_guests(get_api_user().id, data.get("guests", []))
    return api_success(added, 201)


@api_bp.route("/friends/bulk-archive", methods=["POST"])
@api_auth_required
def bulk_archive_friends():
    data = request.get_json()
    if not data or "guest_ids" not in data:
        return api_error("guest_ids required", "INVALID_FORMAT", 400)
    archived = friend_service.bulk_archive_guests(get_api_user().id, data["guest_ids"])
    return api_success({"archived": archived})


@api_bp.route("/friends/bulk-delete", methods=["POST"])
@api_auth_required
def bulk_delete_friends():
    data = request.get_json()
    if not data or "guest_ids" not in data:
        return api_error("guest_ids required", "INVALID_FORMAT", 400)
    deleted = friend_service.bulk_delete_guests(get_api_user().id, data["guest_ids"])
    return api_success({"deleted": deleted})


@api_bp.route("/friends/bulk-tag", methods=["POST"])
@api_auth_required
def bulk_tag_friends():
    data = request.get_json()
    if not data or "guest_ids" not in data or "tag_name" not in data:
        return api_error("guest_ids and tag_name required", "INVALID_FORMAT", 400)
    tag_name = data["tag_name"].strip()
    if not tag_name:
        return api_error("tag_name cannot be empty", "INVALID_FORMAT", 400)
    updated = friend_service.bulk_add_tag(get_api_user().id, data["guest_ids"], tag_name)
    return api_success(updated)


@api_bp.route("/friends/bulk-untag", methods=["POST"])
@api_auth_required
def bulk_untag_friends():
    data = request.get_json()
    if not data or "guest_ids" not in data or "tag_name" not in data:
        return api_error("guest_ids and tag_name required", "INVALID_FORMAT", 400)
    tag_name = data["tag_name"].strip()
    if not tag_name:
        return api_error("tag_name cannot be empty", "INVALID_FORMAT", 400)
    updated = friend_service.bulk_remove_tag(get_api_user().id, data["guest_ids"], tag_name)
    return api_success(updated)
