from functools import wraps
from flask import Blueprint, jsonify, request, g, current_app
from flask_login import current_user
from flask_wtf.csrf import validate_csrf

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")


def api_success(data=None, status_code=200):
    """Standard success response."""
    body = {"status": "success"}
    if data is not None:
        body["data"] = data
    return jsonify(body), status_code


def api_error(message, code="ERROR", status_code=400):
    """Standard error response."""
    return jsonify({
        "status": "error",
        "message": message,
        "code": code,
    }), status_code


def api_auth_required(f):
    """Require a valid session with CSRF validation for state-changing methods."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if current_user.is_authenticated:
            if request.method not in ("GET", "HEAD", "OPTIONS") and current_app.config.get("WTF_CSRF_ENABLED", True):
                csrf_token = request.headers.get("X-CSRFToken") or request.headers.get("X-CSRF-Token")
                try:
                    validate_csrf(csrf_token)
                except Exception:
                    return api_error("CSRF token missing or invalid", "CSRF_ERROR", 403)
            g.api_user = current_user
            return f(*args, **kwargs)

        return api_error("Authentication required", "AUTH_REQUIRED", 401)
    return decorated


def get_api_user():
    """Get the authenticated user (set by api_auth_required)."""
    return g.api_user


# -- Serializers ---------------------------------------------------------------

def serialize_event(event):
    attending = sum(1 for inv in event.invitations if inv.status == "Attending")
    return {
        "id": event.id,
        "name": event.name,
        "event_type": event.event_type,
        "location": event.location or "",
        "date": event.date.isoformat(),
        "date_created": event.date_created.isoformat() if event.date_created else None,
        "notes": event.notes or "",
        "invitation_count": len(event.invitations),
        "attending_count": attending,
    }


def serialize_friend(guest):
    attending = sum(1 for inv in guest.invitations if inv.status == "Attending")
    pending = sum(1 for inv in guest.invitations if inv.status == "Pending")
    declined = sum(1 for inv in guest.invitations if inv.status == "Declined")
    invited = attending + pending + declined
    invitations = []
    for inv in guest.invitations:
        if inv.status != "Not Sent":
            invitations.append({
                "event_name": inv.event.name,
                "event_date": inv.event.date.strftime("%d/%m/%Y") if inv.event.date else "",
                "status": inv.status,
            })
    return {
        "id": guest.id,
        "first_name": guest.first_name,
        "last_name": guest.last_name or "",
        "gender": guest.gender,
        "is_me": guest.is_me,
        "is_archived": guest.is_archived,
        "notes": guest.notes or "",
        "full_name": guest.full_name,
        "date_created": guest.date_created.isoformat() if guest.date_created else None,
        "date_edited": guest.date_edited.isoformat() if guest.date_edited else None,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags],
        "invitation_summary": {
            "invited": invited,
            "attending": attending,
            "pending": pending,
            "declined": declined,
        },
        "invitations": invitations,
    }


def serialize_invitation(inv):
    return {
        "id": inv.id,
        "event_id": inv.event_id,
        "guest_id": inv.guest_id,
        "status": inv.status,
        "notes": inv.notes or "",
        "date_invited": inv.date_invited.strftime("%d %b %Y") if inv.date_invited else "",
        "date_invited_iso": inv.date_invited.isoformat() if inv.date_invited else "",
        "date_responded": inv.date_responded.strftime("%d %b %Y") if inv.date_responded else "",
        "date_responded_iso": inv.date_responded.isoformat() if inv.date_responded else "",
        "guest": {
            "id": inv.guest.id,
            "first_name": inv.guest.first_name,
            "last_name": inv.guest.last_name or "",
            "gender": inv.guest.gender,
            "full_name": inv.guest.full_name,
        },
    }


def serialize_invitation_brief(inv):
    """Invitation with inline guest info, for bulk/list responses."""
    return {
        "invitation_id": inv.id,
        "guest_id": inv.guest_id,
        "first_name": inv.guest.first_name,
        "last_name": inv.guest.last_name or "",
        "gender": inv.guest.gender,
        "status": inv.status,
        "notes": inv.notes or "",
        "guest_notes": inv.guest.notes or "",
        "guest_tags": [{"id": t.id, "name": t.name, "color": t.color} for t in inv.guest.tags],
        "date_invited": inv.date_invited.strftime("%d %b %Y") if inv.date_invited else "",
        "date_invited_iso": inv.date_invited.isoformat() if inv.date_invited else "",
        "date_responded": inv.date_responded.strftime("%d %b %Y") if inv.date_responded else "",
        "date_responded_iso": inv.date_responded.isoformat() if inv.date_responded else "",
    }


# -- Error handlers for API routes --------------------------------------------

@api_bp.errorhandler(400)
def handle_400(e):
    return api_error(e.description or "Bad request", "BAD_REQUEST", 400)


@api_bp.errorhandler(403)
def handle_403(e):
    return api_error("Access denied", "FORBIDDEN", 403)


@api_bp.errorhandler(404)
def handle_404(e):
    return api_error("Resource not found", "NOT_FOUND", 404)


@api_bp.errorhandler(422)
def handle_422(e):
    return api_error(e.description or "Unprocessable entity", "VALIDATION_ERROR", 422)


# -- Register sub-modules -----------------------------------------------------

from rsvp_manager.blueprints.api import events_api, friends_api, invitations_api, exports_api, tags_api, trash_api  # noqa: E402, F401
