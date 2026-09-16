"""Per-event guest attributes: definitions and guest answers."""
from flask import request

from rsvp_manager.blueprints.api import (
    api_auth_required, api_bp, api_error, api_success, get_api_user,
)
from rsvp_manager.extensions import db
from rsvp_manager.models import EventAttributeOption, Invitation
from rsvp_manager.services import attribute_service
from rsvp_manager.services.cohost_service import require_event_access


def _event(event_id, min_role="cohost"):
    user = get_api_user()
    event, _role = require_event_access(event_id, user.id, min_role=min_role)
    return event, user


def serialize_attribute(attribute):
    return {
        "id": attribute.id,
        "name": attribute.name,
        "position": attribute.position,
        "options": [
            {"id": o.id, "label": o.label, "position": o.position}
            for o in attribute.options
        ],
    }


# ── Definitions ─────────────────────────────────────────────────────────────

@api_bp.route("/events/<int:event_id>/attributes", methods=["GET"])
@api_auth_required
def list_attributes(event_id):
    event, _ = _event(event_id, min_role="viewer")
    return api_success([serialize_attribute(a) for a in attribute_service.get_attributes(event)])


@api_bp.route("/events/<int:event_id>/attributes", methods=["POST"])
@api_auth_required
def create_attribute(event_id):
    event, user = _event(event_id)
    data = request.get_json() or {}
    attribute = attribute_service.create_attribute(
        event, data.get("name"), data.get("options", []), user.id)
    return api_success(serialize_attribute(attribute), 201)


@api_bp.route("/events/<int:event_id>/attributes/<int:attribute_id>", methods=["PUT"])
@api_auth_required
def update_attribute(event_id, attribute_id):
    event, user = _event(event_id)
    attribute = attribute_service.get_owned_attribute_or_404(attribute_id, event)
    data = request.get_json() or {}
    attribute_service.update_attribute(
        attribute, name=data.get("name"), option_labels=data.get("options"),
        acting_user_id=user.id)
    return api_success(serialize_attribute(attribute))


@api_bp.route("/events/<int:event_id>/attributes/<int:attribute_id>", methods=["DELETE"])
@api_auth_required
def delete_attribute(event_id, attribute_id):
    event, user = _event(event_id)
    attribute = attribute_service.get_owned_attribute_or_404(attribute_id, event)
    attribute_service.delete_attribute(attribute, user.id)
    return "", 204


@api_bp.route("/events/<int:event_id>/attributes/reorder", methods=["POST"])
@api_auth_required
def reorder_attributes(event_id):
    event, user = _event(event_id)
    data = request.get_json() or {}
    attribute_service.reorder_attributes(event, data.get("attribute_ids", []), user.id)
    return api_success([serialize_attribute(a) for a in attribute_service.get_attributes(event)])


@api_bp.route("/events/<int:event_id>/attributes/<int:attribute_id>/options/<int:option_id>",
              methods=["PUT"])
@api_auth_required
def rename_option(event_id, attribute_id, option_id):
    """Rename in place, so guests already set to this option keep their answer."""
    event, user = _event(event_id)
    attribute = attribute_service.get_owned_attribute_or_404(attribute_id, event)
    option = EventAttributeOption.query.filter_by(
        id=option_id, attribute_id=attribute.id).first()
    if not option:
        return api_error("Option not found", "NOT_FOUND", 404)
    data = request.get_json() or {}
    attribute_service.rename_option(option, data.get("label"), user.id)
    return api_success(serialize_attribute(attribute))


# ── Guest answers ───────────────────────────────────────────────────────────

@api_bp.route("/invitations/<int:invitation_id>/attributes/<int:attribute_id>", methods=["PUT"])
@api_auth_required
def set_invitation_attribute(invitation_id, attribute_id):
    """Set one guest's answer. option_id null clears it back to "not set"."""
    invitation = db.session.get(Invitation, invitation_id)
    if not invitation:
        return api_error("Invitation not found", "NOT_FOUND", 404)
    event, _user = _event(invitation.event_id)
    attribute = attribute_service.get_owned_attribute_or_404(attribute_id, event)

    data = request.get_json() or {}
    option = attribute_service.set_value(invitation, attribute, data.get("option_id"))
    return api_success({
        "invitation_id": invitation.id,
        "attribute_id": attribute.id,
        "option_id": option.id if option else None,
        "label": option.label if option else None,
    })


@api_bp.route("/events/<int:event_id>/attributes/<int:attribute_id>/bulk", methods=["POST"])
@api_auth_required
def bulk_set_attribute(event_id, attribute_id):
    event, _user = _event(event_id)
    attribute = attribute_service.get_owned_attribute_or_404(attribute_id, event)
    data = request.get_json() or {}
    changed = attribute_service.bulk_set_value(
        event, data.get("invitation_ids", []), attribute, data.get("option_id"))
    return api_success({"changed": len(changed), "changed_ids": changed})


@api_bp.route("/events/<int:event_id>/attributes/summary", methods=["GET"])
@api_auth_required
def attribute_summary(event_id):
    event, _ = _event(event_id, min_role="viewer")
    return api_success([
        {
            "attribute": {"id": s["attribute"].id, "name": s["attribute"].name},
            "rows": s["rows"],
            "totals": s["totals"],
        }
        for s in attribute_service.summarize(event)
    ])
