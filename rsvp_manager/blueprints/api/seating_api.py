from flask import request
from rsvp_manager.blueprints.api import api_bp, api_success, api_error, api_auth_required, get_api_user
from rsvp_manager.services import seating_service
from rsvp_manager.services.cohost_service import require_event_access
from rsvp_manager.models import SeatingTable


def _get_event_for_seating(event_id, min_role="viewer"):
    user = get_api_user()
    event, role = require_event_access(event_id, user.id, min_role=min_role)
    return event, user


@api_bp.route("/events/<int:event_id>/seating", methods=["GET"])
@api_auth_required
def get_seating_plan(event_id):
    event, _ = _get_event_for_seating(event_id, min_role="viewer")
    return api_success(seating_service.serialize_seating_plan(event))


@api_bp.route("/events/<int:event_id>/seating/tables", methods=["POST"])
@api_auth_required
def create_seating_table(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    try:
        table = seating_service.create_table(
            event,
            label=data.get("label", ""),
            shape=data.get("shape", "rectangular"),
            capacity=data.get("capacity", 12),
            acting_user_id=user.id,
        )
    except ValueError as e:
        return api_error(str(e))
    return api_success(seating_service._serialize_table(table), status_code=201)


@api_bp.route("/events/<int:event_id>/seating/tables/<int:table_id>", methods=["PUT"])
@api_auth_required
def update_seating_table(event_id, table_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        return api_error("Table not found", "NOT_FOUND", 404)
    data = request.get_json() or {}
    try:
        seating_service.update_table(
            table,
            label=data.get("label"),
            shape=data.get("shape"),
            capacity=data.get("capacity"),
            acting_user_id=user.id,
        )
    except ValueError as e:
        return api_error(str(e))
    return api_success(seating_service._serialize_table(table))


@api_bp.route("/events/<int:event_id>/seating/tables/<int:table_id>/rotate", methods=["POST"])
@api_auth_required
def rotate_seating_table(event_id, table_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        return api_error("Table not found", "NOT_FOUND", 404)
    from rsvp_manager.extensions import db
    table.rotation = ((table.rotation or 0) + 90) % 360
    db.session.commit()
    return api_success({"rotation": table.rotation})


@api_bp.route("/events/<int:event_id>/seating/tables/<int:table_id>", methods=["DELETE"])
@api_auth_required
def delete_seating_table(event_id, table_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        return api_error("Table not found", "NOT_FOUND", 404)
    seating_service.delete_table(table, acting_user_id=user.id)
    return "", 204


@api_bp.route("/events/<int:event_id>/seating/assign", methods=["POST"])
@api_auth_required
def assign_seat(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON")
    try:
        assignment = seating_service.assign_seat(
            event,
            invitation_id=data["invitation_id"],
            table_id=data["table_id"],
            seat_position=data["seat_position"],
            acting_user_id=user.id,
        )
    except (ValueError, KeyError) as e:
        return api_error(str(e))
    return api_success({"assignment_id": assignment.id})


@api_bp.route("/events/<int:event_id>/seating/swap", methods=["POST"])
@api_auth_required
def swap_seats(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON")
    try:
        seating_service.swap_seats(
            event,
            assignment_id_a=data["assignment_id_a"],
            assignment_id_b=data["assignment_id_b"],
            acting_user_id=user.id,
        )
    except (ValueError, KeyError) as e:
        return api_error(str(e))
    return api_success()


@api_bp.route("/events/<int:event_id>/seating/assign/<int:assignment_id>", methods=["DELETE"])
@api_auth_required
def unseat_guest(event_id, assignment_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    try:
        seating_service.unseat_guest(event, assignment_id, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return "", 204


@api_bp.route("/events/<int:event_id>/seating/assign/<int:assignment_id>/lock", methods=["POST"])
@api_auth_required
def toggle_seat_lock(event_id, assignment_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    try:
        sa = seating_service.toggle_lock(event, assignment_id, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return api_success({"is_locked": sa.is_locked})


@api_bp.route("/events/<int:event_id>/seating/tables/<int:table_id>/lock", methods=["POST"])
@api_auth_required
def lock_table(event_id, table_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    lock = data.get("lock", True)
    try:
        seating_service.lock_table(event, table_id, lock=lock, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return api_success()


@api_bp.route("/events/<int:event_id>/seating/smart-assign", methods=["POST"])
@api_auth_required
def smart_assign_seating(event_id):
    """Auto-detect: if unseated guests exist, assign them. If all seated, shuffle unlocked."""
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    mode = data.get("mode", "random")
    unseated = seating_service.get_unseated_attending(event)
    try:
        if unseated:
            seating_service.auto_assign(event, mode=mode, acting_user_id=user.id)
        else:
            seating_service.shuffle_seating(event, mode=mode, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return api_success(seating_service.serialize_seating_plan(event))


@api_bp.route("/events/<int:event_id>/seating/auto-assign", methods=["POST"])
@api_auth_required
def auto_assign_seating(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    mode = data.get("mode", "random")
    try:
        seating_service.auto_assign(event, mode=mode, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return api_success(seating_service.serialize_seating_plan(event))


@api_bp.route("/events/<int:event_id>/seating/shuffle", methods=["POST"])
@api_auth_required
def shuffle_seating(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    mode = data.get("mode", "random")
    try:
        seating_service.shuffle_seating(event, mode=mode, acting_user_id=user.id)
    except ValueError as e:
        return api_error(str(e))
    return api_success(seating_service.serialize_seating_plan(event))


@api_bp.route("/events/<int:event_id>/seating/clear", methods=["POST"])
@api_auth_required
def clear_seating(event_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    data = request.get_json() or {}
    include_locked = data.get("include_locked", False)
    seating_service.clear_all_seating(event, include_locked=include_locked, acting_user_id=user.id)
    return api_success()


@api_bp.route("/events/<int:event_id>/seating/tables/<int:table_id>/clear", methods=["POST"])
@api_auth_required
def clear_table(event_id, table_id):
    event, user = _get_event_for_seating(event_id, min_role="cohost")
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        return api_error("Table not found", "NOT_FOUND", 404)
    data = request.get_json() or {}
    include_locked = data.get("include_locked", False)
    seating_service.clear_table_seats(table, include_locked=include_locked, acting_user_id=user.id)
    return api_success()
