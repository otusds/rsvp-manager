from datetime import datetime, timezone, timedelta
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Tag, guest_tags
from rsvp_manager.services.history_service import log_action


TRASH_RETENTION_DAYS = 30


def get_trash(user_id):
    """Get all soft-deleted items for a user."""
    events = Event.query.filter(
        Event.user_id == user_id, Event.deleted_at.isnot(None)
    ).order_by(Event.deleted_at.desc()).all()

    guests = Guest.query.filter(
        Guest.user_id == user_id, Guest.deleted_at.isnot(None)
    ).order_by(Guest.deleted_at.desc()).all()

    tags = Tag.query.filter(
        Tag.user_id == user_id, Tag.deleted_at.isnot(None)
    ).order_by(Tag.deleted_at.desc()).all()

    return {"events": events, "guests": guests, "tags": tags}


def restore_event(event_id, user_id):
    event = db.session.get(Event, event_id)
    if not event or event.user_id != user_id or event.deleted_at is None:
        return None
    event.deleted_at = None
    log_action(user_id, "restored_event", "event", event.id, f"You restored event {event.name}")
    db.session.commit()
    return event


def restore_guest(guest_id, user_id):
    guest = db.session.get(Guest, guest_id)
    if not guest or guest.user_id != user_id or guest.deleted_at is None:
        return None
    guest.deleted_at = None
    log_action(user_id, "restored_guest", "guest", guest.id, f"You restored {guest.full_name}")
    db.session.commit()
    return guest


def restore_tag(tag_id, user_id):
    tag = db.session.get(Tag, tag_id)
    if not tag or tag.user_id != user_id or tag.deleted_at is None:
        return None
    tag.deleted_at = None
    log_action(user_id, "restored_tag", "tag", tag.id, f"You restored tag '{tag.name}'")
    db.session.commit()
    return tag


def permanently_delete_event(event_id, user_id):
    event = db.session.get(Event, event_id)
    if not event or event.user_id != user_id or event.deleted_at is None:
        return False
    db.session.delete(event)
    db.session.commit()
    return True


def permanently_delete_guest(guest_id, user_id):
    guest = db.session.get(Guest, guest_id)
    if not guest or guest.user_id != user_id or guest.deleted_at is None:
        return False
    db.session.delete(guest)
    db.session.commit()
    return True


def permanently_delete_tag(tag_id, user_id):
    tag = db.session.get(Tag, tag_id)
    if not tag or tag.user_id != user_id or tag.deleted_at is None:
        return False
    db.session.execute(guest_tags.delete().where(guest_tags.c.tag_id == tag.id))
    db.session.delete(tag)
    db.session.commit()
    return True


def purge_expired(user_id=None):
    """Permanently delete items older than TRASH_RETENTION_DAYS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
    filters = [Event.deleted_at < cutoff]
    if user_id:
        filters.append(Event.user_id == user_id)

    for event in Event.query.filter(*filters).all():
        db.session.delete(event)

    g_filters = [Guest.deleted_at < cutoff]
    if user_id:
        g_filters.append(Guest.user_id == user_id)
    for guest in Guest.query.filter(*g_filters).all():
        db.session.delete(guest)

    t_filters = [Tag.deleted_at < cutoff]
    if user_id:
        t_filters.append(Tag.user_id == user_id)
    for tag in Tag.query.filter(*t_filters).all():
        db.session.execute(guest_tags.delete().where(guest_tags.c.tag_id == tag.id))
        db.session.delete(tag)

    db.session.commit()
