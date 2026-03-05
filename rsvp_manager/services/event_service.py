from datetime import date, datetime, timezone
from flask import abort
from sqlalchemy.orm import joinedload
from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Invitation, EVENT_TYPES


EVENTS_PER_PAGE = 20


def get_user_events(user_id, page=1):
    return Event.query.filter_by(user_id=user_id).options(
        joinedload(Event.invitations)
    ).order_by(Event.date.desc()).paginate(
        page=page, per_page=EVENTS_PER_PAGE, error_out=False
    )


def get_owned_event_or_404(event_id, user_id):
    event = Event.query.options(
        joinedload(Event.invitations).joinedload(Invitation.guest).joinedload(Guest.tags),
    ).filter_by(id=event_id).first()
    if not event:
        abort(404)
    if event.user_id != user_id:
        abort(403)
    return event


def get_user_locations(user_id):
    rows = db.session.query(Event.location).filter(
        Event.user_id == user_id, Event.location.isnot(None), Event.location != ""
    ).distinct().order_by(Event.location).all()
    return [r[0] for r in rows]


def check_me_exists(user_id):
    return Guest.query.filter_by(user_id=user_id, is_me=True).first() is not None


def _parse_target_attendees(form_data):
    raw = form_data.get("target_attendees")
    if not raw:
        return None
    try:
        val = int(raw)
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


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
        target_attendees=_parse_target_attendees(form_data),
    )
    db.session.add(event)
    db.session.commit()

    if form_data.get("include_me"):
        me = Guest.query.filter_by(user_id=user_id, is_me=True).first()
        if me:
            inv = Invitation(
                event_id=event.id, guest_id=me.id,
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
    event.target_attendees = _parse_target_attendees(form_data)
    event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return event


def delete_event(event):
    db.session.delete(event)
    db.session.commit()


def get_user_events_for_selector(user_id, exclude_event_id):
    events = Event.query.filter(
        Event.user_id == user_id,
        Event.id != exclude_event_id
    ).order_by(Event.date.desc()).all()
    return [{
        "id": e.id,
        "name": e.name,
        "date": e.date.strftime("%d %b %Y"),
        "date_iso": e.date.isoformat(),
    } for e in events]


def update_event_notes(event, notes):
    event.notes = notes
    event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
