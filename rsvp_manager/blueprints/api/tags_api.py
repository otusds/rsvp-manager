from flask import request
from rsvp_manager.blueprints.api import api_bp, api_success, api_auth_required, get_api_user
from rsvp_manager.services import tag_service


def serialize_tag(t):
    return {
        "id": t.id,
        "name": t.name,
        "color": t.color,
        "guest_count": len(t.guests),
    }


@api_bp.route("/tags", methods=["GET"])
@api_auth_required
def list_tags():
    tags = tag_service.get_user_tags(get_api_user().id)
    return api_success([serialize_tag(t) for t in tags])


@api_bp.route("/tags", methods=["POST"])
@api_auth_required
def create_tag():
    user = get_api_user()
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        from rsvp_manager.blueprints.api import api_error
        return api_error("Tag name is required")
    tag = tag_service.get_or_create_tag(user.id, name)
    if data.get("color"):
        tag = tag_service.update_tag_color(tag, data["color"])
    from rsvp_manager.extensions import db
    db.session.commit()
    return api_success(serialize_tag(tag)), 201


@api_bp.route("/tags/<int:tag_id>", methods=["PUT"])
@api_auth_required
def update_tag(tag_id):
    user = get_api_user()
    tag = tag_service.get_owned_tag_or_404(tag_id, user.id)
    data = request.get_json() or {}
    if "name" in data:
        tag = tag_service.rename_tag(tag, user.id, data["name"])
    if "color" in data:
        tag = tag_service.update_tag_color(tag, data["color"])
    return api_success(serialize_tag(tag))


@api_bp.route("/tags/<int:tag_id>", methods=["DELETE"])
@api_auth_required
def delete_tag(tag_id):
    user = get_api_user()
    tag = tag_service.get_owned_tag_or_404(tag_id, user.id)
    tag_service.delete_tag(tag, user.id)
    return api_success(), 204
