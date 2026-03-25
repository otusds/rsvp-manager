from flask import request
from rsvp_manager.blueprints.api import api_bp, api_success, api_error, api_auth_required, get_api_user
from rsvp_manager.services import trash_service


@api_bp.route("/trash/<entity_type>/<int:entity_id>/restore", methods=["POST"])
@api_auth_required
def restore_item(entity_type, entity_id):
    user = get_api_user()
    restore_fn = {
        "event": trash_service.restore_event,
        "guest": trash_service.restore_guest,
        "tag": trash_service.restore_tag,
    }.get(entity_type)
    if not restore_fn:
        return api_error("Invalid entity type", status_code=400)
    result = restore_fn(entity_id, user.id)
    if not result:
        return api_error("Item not found in trash", status_code=404)
    return api_success({"restored": True})


@api_bp.route("/trash/<entity_type>/<int:entity_id>", methods=["DELETE"])
@api_auth_required
def permanently_delete_item(entity_type, entity_id):
    user = get_api_user()
    delete_fn = {
        "event": trash_service.permanently_delete_event,
        "guest": trash_service.permanently_delete_guest,
        "tag": trash_service.permanently_delete_tag,
    }.get(entity_type)
    if not delete_fn:
        return api_error("Invalid entity type", status_code=400)
    result = delete_fn(entity_id, user.id)
    if not result:
        return api_error("Item not found in trash", status_code=404)
    return api_success(), 204
