from flask import request
from rsvp_manager.blueprints.api import api_bp, api_success, api_error, api_auth_required, get_api_user
from rsvp_manager.services import cohost_service


@api_bp.route("/events/<int:event_id>/share-links", methods=["GET"])
@api_auth_required
def get_share_links(event_id):
    event, role = cohost_service.require_event_access(event_id, get_api_user().id, "owner")
    from rsvp_manager.models import EventShareLink
    links = EventShareLink.query.filter_by(event_id=event_id, is_active=True).all()
    return api_success([{
        "id": l.id,
        "token": l.token,
        "role": l.role,
        "created_at": l.created_at.isoformat(),
    } for l in links])


@api_bp.route("/events/<int:event_id>/share-links", methods=["POST"])
@api_auth_required
def create_share_link(event_id):
    data = request.get_json() or {}
    role = data.get("role", "cohost")
    if role not in ("cohost", "viewer"):
        return api_error("Role must be 'cohost' or 'viewer'")
    link = cohost_service.create_share_link(event_id, get_api_user().id, role)
    return api_success({"token": link.token, "role": link.role, "id": link.id})


@api_bp.route("/share-links/<int:link_id>/disable", methods=["POST"])
@api_auth_required
def disable_share_link(link_id):
    cohost_service.disable_share_link(link_id, get_api_user().id)
    return api_success({"disabled": True})


@api_bp.route("/events/<int:event_id>/share-links/regenerate", methods=["POST"])
@api_auth_required
def regenerate_share_link(event_id):
    data = request.get_json() or {}
    role = data.get("role", "cohost")
    link = cohost_service.regenerate_share_link(event_id, get_api_user().id, role)
    return api_success({"token": link.token, "role": link.role, "id": link.id})


@api_bp.route("/events/<int:event_id>/cohosts", methods=["GET"])
@api_auth_required
def list_cohosts(event_id):
    event, role = cohost_service.require_event_access(event_id, get_api_user().id, "viewer")
    cohosts = cohost_service.get_event_cohosts(event_id)
    owner = event.user
    result = {
        "owner": {
            "user_id": owner.id,
            "name": owner.full_name,
            "email": owner.email,
        },
        "data": [{
            "id": c.id,
            "user_id": c.user_id,
            "name": c.user.full_name,
            "email": c.user.email,
            "role": c.role,
            "joined_at": c.joined_at.isoformat(),
        } for c in cohosts],
    }
    return api_success(result)


@api_bp.route("/events/<int:event_id>/cohosts/<int:cohost_user_id>", methods=["DELETE"])
@api_auth_required
def remove_cohost(event_id, cohost_user_id):
    cohost_service.remove_cohost(event_id, cohost_user_id, get_api_user().id)
    return "", 204
