import unicodedata
from datetime import datetime, timezone
from flask import abort
from sqlalchemy.orm import joinedload
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest, Invitation
from rsvp_manager.services.history_service import log_action
from rsvp_manager.utils import VALID_GENDERS, get_last_name_sort_key


GUESTS_PER_PAGE = 50


class _Pagination:
    """Lightweight pagination wrapper compatible with Flask-SQLAlchemy's Pagination."""

    def __init__(self, items, total, page, per_page):
        self.items = items
        self.total = total
        self.page = page
        self.per_page = per_page
        self.pages = max(1, (total + per_page - 1) // per_page)
        self.has_prev = page > 1
        self.has_next = page < self.pages
        self.prev_num = page - 1 if self.has_prev else None
        self.next_num = page + 1 if self.has_next else None

    def iter_pages(self, left_edge=2, left_current=2, right_current=5, right_edge=2):
        last = 0
        for num in range(1, self.pages + 1):
            if (num <= left_edge or
                (self.page - left_current - 1 < num < self.page + right_current) or
                num > self.pages - right_edge):
                if last + 1 != num:
                    yield None
                yield num
                last = num


def _guest_sort_key(guest):
    return (guest.last_name_sort_key, guest.first_name.lower())


def get_user_guests(user_id, page=1, show_archived="0", search=""):
    query = Guest.query.filter_by(user_id=user_id).filter(Guest.deleted_at.is_(None)).options(
        joinedload(Guest.invitations).joinedload(Invitation.event),
        joinedload(Guest.tags),
    )
    if show_archived == "2":
        query = query.filter_by(is_archived=True)
    elif show_archived != "1":
        query = query.filter_by(is_archived=False)
    if search:
        like_pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                Guest.first_name.ilike(like_pattern),
                Guest.last_name.ilike(like_pattern),
                (Guest.first_name + " " + Guest.last_name).ilike(like_pattern),
            )
        )
    all_guests = query.all()
    all_guests.sort(key=_guest_sort_key)
    total = len(all_guests)
    start = (page - 1) * GUESTS_PER_PAGE
    end = start + GUESTS_PER_PAGE
    return _Pagination(all_guests[start:end], total, page, GUESTS_PER_PAGE)


def get_owned_guest_or_404(guest_id, user_id):
    guest = db.session.get(Guest, guest_id)
    if not guest or guest.deleted_at is not None:
        abort(404)
    if guest.user_id != user_id:
        abort(403)
    return guest


def _validate_guest_fields(form_data):
    """Validate and return cleaned guest fields from form data."""
    first_name = form_data.get("first_name", "").strip()
    if not first_name or len(first_name) > 100:
        abort(400, description="First name is required (max 100 characters)")
    gender = form_data.get("gender", "")
    if gender not in VALID_GENDERS:
        abort(400, description="Gender must be Male or Female")
    return first_name, gender


def create_guest(user_id, form_data):
    first_name, gender = _validate_guest_fields(form_data)

    is_me = bool(form_data.get("is_me"))
    if is_me:
        Guest.query.filter_by(user_id=user_id, is_me=True).update({"is_me": False})
    guest = Guest(
        user_id=user_id,
        first_name=first_name,
        last_name=form_data.get("last_name", "").strip()[:100],
        gender=gender,
        is_me=is_me,
        notes=form_data.get("notes", "").strip(),
        date_created=datetime.now(timezone.utc),
    )
    db.session.add(guest)
    db.session.flush()
    log_action(user_id, "created_guest", "guest", guest.id, f"You added {guest.full_name} to your friends")
    db.session.commit()
    return guest


def update_guest(guest, user_id, form_data):
    first_name, gender = _validate_guest_fields(form_data)

    is_me = bool(form_data.get("is_me"))
    if is_me and not guest.is_me:
        Guest.query.filter_by(user_id=user_id, is_me=True).update({"is_me": False})
    guest.first_name = first_name
    guest.last_name = form_data.get("last_name", "").strip()[:100]
    guest.gender = gender
    guest.is_me = is_me
    guest.notes = form_data.get("notes", "").strip()
    guest.date_edited = datetime.now(timezone.utc)
    log_action(user_id, "edited_guest", "guest", guest.id, f"You edited {guest.full_name}")
    db.session.commit()
    return guest


def delete_guest(guest):
    log_action(guest.user_id, "deleted_guest", "guest", guest.id, f"You deleted {guest.full_name}")
    guest.deleted_at = datetime.now(timezone.utc)
    db.session.commit()


def update_guest_name(guest, first_name, last_name):
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    if not first_name or len(first_name) > 100:
        abort(400, description="First name is required (max 100 characters)")
    if len(last_name) > 100:
        abort(400, description="Last name max 100 characters")
    guest.first_name = first_name
    guest.last_name = last_name
    guest.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def update_guest_gender(guest, gender):
    if gender not in VALID_GENDERS:
        abort(400, description="Gender must be Male or Female")
    guest.gender = gender
    guest.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def update_guest_notes(guest, notes):
    guest.notes = (notes or "")[:5000]
    guest.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def update_guest_is_me(guest, user_id, is_me):
    if is_me and not guest.is_me:
        Guest.query.filter_by(user_id=user_id, is_me=True).update({"is_me": False})
    guest.is_me = is_me
    guest.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return guest.is_me


def archive_guest(guest):
    guest.is_archived = True
    guest.date_edited = datetime.now(timezone.utc)
    log_action(guest.user_id, "archived_guest", "guest", guest.id, f"You archived {guest.full_name}")
    db.session.commit()


def unarchive_guest(guest):
    guest.is_archived = False
    guest.date_edited = datetime.now(timezone.utc)
    log_action(guest.user_id, "unarchived_guest", "guest", guest.id, f"You unarchived {guest.full_name}")
    db.session.commit()


def _get_owned_guests_by_ids(user_id, guest_ids):
    """Batch-fetch guests owned by user_id from a list of IDs."""
    if not guest_ids:
        return []
    return Guest.query.filter(
        Guest.id.in_(guest_ids), Guest.user_id == user_id,
        Guest.deleted_at.is_(None)
    ).all()


def bulk_archive_guests(user_id, guest_ids):
    guests = _get_owned_guests_by_ids(user_id, guest_ids)
    archived = 0
    for guest in guests:
        if not guest.is_archived:
            guest.is_archived = True
            guest.date_edited = datetime.now(timezone.utc)
            log_action(user_id, "archived_guest", "guest", guest.id, f"You archived {guest.full_name}")
            archived += 1
    db.session.commit()
    return archived


def bulk_delete_guests(user_id, guest_ids):
    guests = _get_owned_guests_by_ids(user_id, guest_ids)
    now = datetime.now(timezone.utc)
    for guest in guests:
        log_action(user_id, "deleted_guest", "guest", guest.id, f"You deleted {guest.full_name}")
        guest.deleted_at = now
    db.session.commit()
    return len(guests)


def bulk_add_tag(user_id, guest_ids, tag_name):
    from rsvp_manager.services import tag_service
    tag = tag_service.get_or_create_tag(user_id, tag_name)
    guests = _get_owned_guests_by_ids(user_id, guest_ids)
    updated = []
    for guest in guests:
        if tag not in guest.tags:
            guest.tags.append(tag)
            log_action(user_id, "tagged_guest", "guest", guest.id, f"You tagged {guest.full_name} as {tag_name}")
        updated.append({
            "id": guest.id,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags if not t.deleted_at],
        })
    db.session.commit()
    return updated


def bulk_remove_tag(user_id, guest_ids, tag_name):
    # Direct DB lookup instead of loading all tags into Python
    from rsvp_manager.models import Tag
    tag = Tag.query.filter(
        Tag.user_id == user_id,
        db.func.lower(Tag.name) == tag_name.lower(),
        Tag.deleted_at.is_(None)
    ).first()
    if not tag:
        return []
    guests = _get_owned_guests_by_ids(user_id, guest_ids)
    updated = []
    for guest in guests:
        if tag in guest.tags:
            guest.tags.remove(tag)
            log_action(user_id, "untagged_guest", "guest", guest.id, f"You removed tag {tag_name} from {guest.full_name}")
        updated.append({
            "id": guest.id,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags if not t.deleted_at],
        })
    db.session.commit()
    return updated


def bulk_create_guests(user_id, guests_data):
    added = []
    for g_data in guests_data:
        first_name = g_data.get("first_name", "").strip()[:100]
        if not first_name:
            continue
        gender = g_data.get("gender", "Male")
        if gender not in VALID_GENDERS:
            gender = "Male"
        guest = Guest(
            user_id=user_id,
            first_name=first_name,
            last_name=g_data.get("last_name", "").strip()[:100],
            gender=gender,
            notes=g_data.get("notes", "").strip(),
            date_created=datetime.now(timezone.utc)
        )
        db.session.add(guest)
        db.session.flush()
        log_action(user_id, "created_guest", "guest", guest.id, f"You added {guest.full_name} to your friends")
        added.append({
            "id": guest.id, "first_name": guest.first_name,
            "last_name": guest.last_name or "", "gender": guest.gender,
            "notes": guest.notes or "", "is_me": False,
            "date_created": guest.date_created.isoformat()
        })
    db.session.commit()
    return added


def _normalize_name(name):
    """Normalize name: remove accents, lowercase, collapse whitespace."""
    if not name:
        return ""
    nfkd = unicodedata.normalize('NFKD', name)
    result = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    # Collapse multiple spaces into one
    return " ".join(result.split())


def get_shared_invitations(guest, user_id):
    """Find events where a co-host's guest with the same name was invited.

    Returns list of dicts with event_name, event_date, status for events
    where the user is owner/co-host and another user's guest with matching
    name was invited.
    """
    from rsvp_manager.models import Event, EventCohost
    norm_first = _normalize_name(guest.first_name)
    norm_last = _normalize_name(guest.last_name)

    # Get events where user is owner or co-host
    owned_ids = db.session.query(Event.id).filter_by(user_id=user_id).filter(Event.deleted_at.is_(None))
    cohosted_ids = db.session.query(EventCohost.event_id).filter_by(user_id=user_id)
    my_event_ids = set(r[0] for r in owned_ids.all()) | set(r[0] for r in cohosted_ids.all())

    if not my_event_ids:
        return []

    # Find invitations in those events for guests owned by OTHER users with matching name
    results = []
    invitations = Invitation.query.filter(
        Invitation.event_id.in_(my_event_ids)
    ).join(Guest, Invitation.guest_id == Guest.id).filter(
        Guest.user_id != user_id,
        Guest.deleted_at.is_(None),
    ).all()

    for inv in invitations:
        g = inv.guest
        if _normalize_name(g.first_name) == norm_first and _normalize_name(g.last_name) == norm_last:
            results.append({
                "event_id": inv.event_id,
                "event_name": inv.event.name,
                "event_date": inv.event.date.strftime("%d/%m/%Y") if inv.event.date else "",
                "status": inv.status,
                "shared": True,
            })
    return results
