from datetime import date, datetime, timezone
from flask import abort
from sqlalchemy.orm import joinedload
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, EventCohost, Guest, Invitation, EVENT_TYPES
from rsvp_manager.services.history_service import log_action


EVENTS_PER_PAGE = 20


def get_user_events(user_id, page=1):
    """Get events owned by user OR where user is a co-host/viewer."""
    owned = Event.query.filter_by(user_id=user_id).filter(Event.deleted_at.is_(None))
    cohosted_ids = db.session.query(EventCohost.event_id).filter_by(user_id=user_id)
    shared = Event.query.filter(Event.id.in_(cohosted_ids), Event.deleted_at.is_(None))
    combined = owned.union(shared).options(
        joinedload(Event.invitations)
    ).order_by(Event.date.desc())
    return combined.paginate(page=page, per_page=EVENTS_PER_PAGE, error_out=False)


def get_authorized_event(event_id, user_id):
    """Load event with eager loading. Returns (event, role) or aborts."""
    from rsvp_manager.services.cohost_service import require_event_access
    event, role = require_event_access(event_id, user_id, min_role="viewer")
    # Eager load invitations + guests + tags for the event detail page
    event = Event.query.options(
        joinedload(Event.invitations).joinedload(Invitation.guest).joinedload(Guest.tags),
    ).filter_by(id=event_id).first()
    return event, role


# Keep backward compatibility — routes that haven't been updated yet
def get_owned_event_or_404(event_id, user_id):
    event, role = get_authorized_event(event_id, user_id)
    return event


def get_user_locations(user_id):
    rows = db.session.query(Event.location).filter(
        Event.user_id == user_id, Event.location.isnot(None), Event.location != "",
        Event.deleted_at.is_(None)
    ).distinct().order_by(Event.location).all()
    return [r[0] for r in rows]


def check_me_exists(user_id):
    return Guest.query.filter_by(user_id=user_id, is_me=True).filter(Guest.deleted_at.is_(None)).first() is not None



def _validate_event_fields(form_data):
    """Validate and return cleaned event fields from form data."""
    name = form_data.get("name", "").strip()
    if not name or len(name) > 200:
        abort(400, description="Event name is required (max 200 characters)")
    event_type = form_data.get("event_type", "")
    if event_type not in EVENT_TYPES:
        abort(400, description="Invalid event type")
    try:
        event_date = date.fromisoformat(form_data["date"])
    except (ValueError, KeyError):
        abort(400, description="Invalid date")
    return name, event_type, event_date


def create_event(user_id, form_data):
    name, event_type, event_date = _validate_event_fields(form_data)

    event = Event(
        user_id=user_id,
        name=name,
        event_type=event_type,
        location=form_data.get("location", "").strip()[:200],
        date=event_date,
        date_created=date.today(),
        notes=form_data.get("notes", "").strip(),
    )
    db.session.add(event)
    db.session.flush()
    log_action(user_id, "created_event", "event", event.id, f"You created event {event.name}")
    db.session.commit()

    if form_data.get("include_me"):
        me = Guest.query.filter_by(user_id=user_id, is_me=True).filter(Guest.deleted_at.is_(None)).first()
        if me:
            inv = Invitation(
                event_id=event.id, guest_id=me.id, added_by=user_id,
                status="Attending", date_invited=date.today(),
                date_responded=date.today()
            )
            db.session.add(inv)
            db.session.commit()

    return event


def update_event(event, form_data):
    name, event_type, event_date = _validate_event_fields(form_data)

    event.name = name
    event.event_type = event_type
    event.location = form_data.get("location", "").strip()[:200]
    event.date = event_date
    event.notes = form_data.get("notes", "").strip()
    event.date_edited = datetime.now(timezone.utc)
    log_action(event.user_id, "edited_event", "event", event.id, f"You edited event {event.name}")
    db.session.commit()
    return event


def delete_event(event):
    log_action(event.user_id, "deleted_event", "event", event.id, f"You deleted event {event.name}")
    event.deleted_at = datetime.now(timezone.utc)
    db.session.commit()


def get_user_events_for_selector(user_id, exclude_event_id):
    """Get events for the 'Add from Past Events' selector, including co-hosted."""
    owned = Event.query.filter(
        Event.user_id == user_id,
        Event.id != exclude_event_id,
        Event.deleted_at.is_(None)
    )
    cohosted_ids = db.session.query(EventCohost.event_id).filter_by(user_id=user_id)
    cohosted = Event.query.filter(
        Event.id.in_(cohosted_ids),
        Event.id != exclude_event_id,
        Event.deleted_at.is_(None)
    )
    events = owned.union(cohosted).order_by(Event.date.desc()).all()
    return [{
        "id": e.id,
        "name": e.name,
        "date": e.date.strftime("%d %b %Y"),
        "date_iso": e.date.isoformat(),
    } for e in events]


def duplicate_event(event, user_id, new_date=None, reset_status=True):
    """Create a copy of an event with the same guests."""
    new_event = Event(
        user_id=user_id,
        name=event.name + " (copy)",
        event_type=event.event_type,
        location=event.location,
        date=new_date or event.date,
        date_created=date.today(),
        notes=event.notes,
    )
    db.session.add(new_event)
    db.session.flush()
    # Copy invitations (only non-deleted guests owned by this user)
    for inv in event.invitations:
        if inv.guest.deleted_at or inv.guest.user_id != user_id:
            continue
        if reset_status:
            new_inv = Invitation(
                event_id=new_event.id,
                guest_id=inv.guest_id,
                added_by=user_id,
                status="Not Sent",
            )
        else:
            new_inv = Invitation(
                event_id=new_event.id,
                guest_id=inv.guest_id,
                added_by=user_id,
                status=inv.status,
                date_invited=inv.date_invited,
                date_responded=inv.date_responded,
                notes=inv.notes,
            )
        db.session.add(new_inv)
    log_action(user_id, "duplicated_event", "event", new_event.id,
               f"You duplicated event {event.name}")
    db.session.commit()
    return new_event


def update_event_notes(event, notes):
    event.notes = notes
    event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
