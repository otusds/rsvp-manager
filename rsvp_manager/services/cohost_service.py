import secrets
from datetime import datetime, timezone
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, EventCohost, EventShareLink
from rsvp_manager.services.history_service import log_action


def get_event_with_role(event_id, user_id):
    """Returns (event, role) where role is 'owner', 'cohost', 'viewer', or None."""
    event = Event.query.filter_by(id=event_id).filter(Event.deleted_at.is_(None)).first()
    if not event:
        return None, None
    if event.user_id == user_id:
        return event, "owner"
    cohost = EventCohost.query.filter_by(event_id=event_id, user_id=user_id).first()
    if cohost:
        return event, cohost.role
    return event, None  # event exists but user has no role


ROLE_LEVELS = {"viewer": 1, "cohost": 2, "owner": 3}


def require_event_access(event_id, user_id, min_role="viewer"):
    """Abort 403/404 if user doesn't have at least min_role. Returns (event, role)."""
    event, role = get_event_with_role(event_id, user_id)
    if not event:
        abort(404)
    if role is None or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS[min_role]:
        abort(403)
    return event, role


def get_event_roles_for_user(user_id, event_ids):
    """Return dict of {event_id: role} for a user across multiple events."""
    if not event_ids:
        return {}
    roles = {}
    cohosts = EventCohost.query.filter(
        EventCohost.user_id == user_id,
        EventCohost.event_id.in_(event_ids)
    ).all()
    for c in cohosts:
        roles[c.event_id] = c.role
    # Events not in cohosts are owned by the user
    for eid in event_ids:
        if eid not in roles:
            roles[eid] = "owner"
    return roles


def get_shared_event_ids(event_ids):
    """Return set of event IDs that have at least one co-host/viewer."""
    if not event_ids:
        return set()
    rows = db.session.query(EventCohost.event_id).filter(
        EventCohost.event_id.in_(event_ids)
    ).distinct().all()
    return set(r[0] for r in rows)


def get_event_cohosts(event_id):
    """Get all cohosts/viewers for an event."""
    return EventCohost.query.filter_by(event_id=event_id).all()


def create_share_link(event_id, user_id, role="cohost"):
    """Create a share link for an event. Only owner can create."""
    event, event_role = get_event_with_role(event_id, user_id)
    if not event or event_role != "owner":
        abort(403)
    # Check if active link for this role already exists
    existing = EventShareLink.query.filter_by(
        event_id=event_id, role=role, is_active=True
    ).first()
    if existing:
        return existing
    link = EventShareLink(
        event_id=event_id,
        token=secrets.token_urlsafe(32),
        role=role,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(link)
    db.session.commit()
    return link


def disable_share_link(link_id, user_id):
    """Disable a share link."""
    link = db.session.get(EventShareLink, link_id)
    if not link:
        abort(404)
    event, role = get_event_with_role(link.event_id, user_id)
    if role != "owner":
        abort(403)
    link.is_active = False
    db.session.commit()
    return link


def regenerate_share_link(event_id, user_id, role="cohost"):
    """Disable existing links for this role and create a new one."""
    event, event_role = get_event_with_role(event_id, user_id)
    if not event or event_role != "owner":
        abort(403)
    EventShareLink.query.filter_by(
        event_id=event_id, role=role, is_active=True
    ).update({"is_active": False})
    link = EventShareLink(
        event_id=event_id,
        token=secrets.token_urlsafe(32),
        role=role,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(link)
    db.session.commit()
    return link


def join_event(token, user_id):
    """User joins an event via share link. Returns (event, role) or aborts."""
    link = EventShareLink.query.filter_by(token=token, is_active=True).first()
    if not link:
        return None, None
    event = Event.query.filter_by(id=link.event_id).filter(Event.deleted_at.is_(None)).first()
    if not event:
        return None, None
    if event.user_id == user_id:
        return event, "owner"  # already owner
    existing = EventCohost.query.filter_by(event_id=event.id, user_id=user_id).first()
    if existing:
        return event, existing.role  # already a member
    cohost = EventCohost(
        event_id=event.id,
        user_id=user_id,
        role=link.role,
        joined_at=datetime.now(timezone.utc),
    )
    db.session.add(cohost)
    db.session.commit()
    # Get joining user's name for log and notification
    from rsvp_manager.models import User
    joining_user = db.session.get(User, user_id)
    joining_name = joining_user.full_name if joining_user else "Someone"
    log_action(event.user_id, "cohost_joined", "event", event.id,
               f"{joining_name} joined {event.name} as {link.role}")
    # Notify event owner via email (best-effort)
    try:
        from rsvp_manager.services.email_service import send_cohost_notification
        send_cohost_notification(event, joining_user, link.role)
    except Exception:
        pass  # Don't fail join if email fails
    return event, link.role


def remove_cohost(event_id, cohost_user_id, acting_user_id):
    """Remove a cohost from an event. Owner or the cohost themselves can do this."""
    event, role = get_event_with_role(event_id, acting_user_id)
    if not event:
        abort(404)
    if role != "owner" and acting_user_id != cohost_user_id:
        abort(403)
    cohost = EventCohost.query.filter_by(event_id=event_id, user_id=cohost_user_id).first()
    if not cohost:
        abort(404)
    db.session.delete(cohost)
    db.session.commit()
    return True
