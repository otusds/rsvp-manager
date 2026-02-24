from rsvp_manager.blueprints.api import api_bp, api_success, api_auth_required, get_api_user
from rsvp_manager.services import tag_service


@api_bp.route("/tags", methods=["GET"])
@api_auth_required
def list_tags():
    tags = tag_service.get_user_tags(get_api_user().id)
    return api_success([{
        "id": t.id,
        "name": t.name,
        "color": t.color,
        "guest_count": len(t.guests),
    } for t in tags])
