from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, render_template, abort, current_app, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func

from rsvp_manager.extensions import db
from rsvp_manager.models import (
    User, Event, Guest, Invitation, Tag, EventCohost,
    SeatingTable, SeatAssignment, ActivityLog, EventShareLink,
)

bp = Blueprint("admin_dashboard", __name__, url_prefix="/admin")


# ── Access control ───────────────────────────────────────────────────────────

def admin_required(f):
    """Require logged-in user whose email is in ADMIN_EMAILS."""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        admin_emails = current_app.config.get("ADMIN_EMAILS", [])
        if not admin_emails or current_user.email.lower() not in admin_emails:
            abort(404)  # 404 instead of 403 to not reveal the route exists
        return f(*args, **kwargs)
    return decorated


# ── Stats helpers ────────────────────────────────────────────────────────────

def _get_stats():
    """Compute all admin dashboard stats."""
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # Users
    total_users = User.query.count()
    verified_users = User.query.filter_by(email_verified=True).count()
    users_7d = User.query.filter(User.id >= db.session.query(
        func.coalesce(func.min(User.id), 0)
    ).filter(User.email_verification_sent_at >= seven_days_ago).scalar_subquery()).count() if total_users else 0
    # Simpler approach for recent users: use the ActivityLog for signup proxy
    users_7d = ActivityLog.query.filter(
        ActivityLog.action == "created_event",
        ActivityLog.created_at >= seven_days_ago
    ).with_entities(ActivityLog.user_id).distinct().count()

    # Events
    active_events = Event.query.filter(Event.deleted_at.is_(None)).count()
    deleted_events = Event.query.filter(Event.deleted_at.isnot(None)).count()
    events_7d = Event.query.filter(
        Event.deleted_at.is_(None),
        Event.date_created >= seven_days_ago.date()
    ).count()
    events_30d = Event.query.filter(
        Event.deleted_at.is_(None),
        Event.date_created >= thirty_days_ago.date()
    ).count()

    # Guests / Friends
    active_guests = Guest.query.filter(Guest.deleted_at.is_(None)).count()
    archived_guests = Guest.query.filter(
        Guest.deleted_at.is_(None), Guest.is_archived == True  # noqa: E712
    ).count()

    # Invitations
    total_invitations = Invitation.query.count()
    inv_attending = Invitation.query.filter_by(status="Attending").count()
    inv_pending = Invitation.query.filter_by(status="Pending").count()
    inv_declined = Invitation.query.filter_by(status="Declined").count()
    inv_not_sent = Invitation.query.filter_by(status="Not Sent").count()

    # Co-hosting
    total_cohosts = EventCohost.query.count()
    total_share_links = EventShareLink.query.filter_by(is_active=True).count()
    shared_events = db.session.query(EventCohost.event_id).distinct().count()

    # Seating
    total_tables = SeatingTable.query.count()
    events_with_seating = db.session.query(SeatingTable.event_id).distinct().count()
    total_seat_assignments = SeatAssignment.query.count()

    # Tags
    active_tags = Tag.query.filter(Tag.deleted_at.is_(None)).count()

    # Activity
    actions_7d = ActivityLog.query.filter(ActivityLog.created_at >= seven_days_ago).count()
    actions_30d = ActivityLog.query.filter(ActivityLog.created_at >= thirty_days_ago).count()
    active_users_7d = db.session.query(ActivityLog.user_id).filter(
        ActivityLog.created_at >= seven_days_ago
    ).distinct().count()
    active_users_30d = db.session.query(ActivityLog.user_id).filter(
        ActivityLog.created_at >= thirty_days_ago
    ).distinct().count()

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "unverified": total_users - verified_users,
            "active_7d": active_users_7d,
            "active_30d": active_users_30d,
        },
        "events": {
            "active": active_events,
            "deleted": deleted_events,
            "created_7d": events_7d,
            "created_30d": events_30d,
            "with_cohosts": shared_events,
        },
        "guests": {
            "active": active_guests,
            "archived": archived_guests,
        },
        "invitations": {
            "total": total_invitations,
            "attending": inv_attending,
            "pending": inv_pending,
            "declined": inv_declined,
            "not_sent": inv_not_sent,
        },
        "cohosts": {
            "total_memberships": total_cohosts,
            "active_share_links": total_share_links,
        },
        "seating": {
            "tables": total_tables,
            "events_with_seating": events_with_seating,
            "seat_assignments": total_seat_assignments,
        },
        "tags": {
            "active": active_tags,
        },
        "activity": {
            "actions_7d": actions_7d,
            "actions_30d": actions_30d,
        },
    }


# ── Admin dashboard route ────────────────────────────────────────────────────

@bp.route("/")
@admin_required
def dashboard():
    stats = _get_stats()
    return render_template("admin/dashboard.html", stats=stats)


# ── Public stats API (Option 3) ─────────────────────────────────────────────

_stats_cache = {"data": None, "expires": None}


@bp.route("/api/stats")
def public_stats():
    """Unauthenticated endpoint returning aggregate counts for marketing use.
    Cached for 1 hour to avoid repeated DB queries."""
    now = datetime.now(timezone.utc)
    if _stats_cache["data"] and _stats_cache["expires"] and _stats_cache["expires"] > now:
        return jsonify(_stats_cache["data"])

    data = {
        "total_users": User.query.count(),
        "total_events": Event.query.filter(Event.deleted_at.is_(None)).count(),
        "total_friends": Guest.query.filter(Guest.deleted_at.is_(None)).count(),
        "total_invitations": Invitation.query.count(),
    }
    _stats_cache["data"] = data
    _stats_cache["expires"] = now + timedelta(hours=1)

    response = jsonify(data)
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response
