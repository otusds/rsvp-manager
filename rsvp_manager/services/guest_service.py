from datetime import datetime
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest

VALID_GENDERS = ("Male", "Female")


GUESTS_PER_PAGE = 50


def get_user_guests(user_id, page=1):
    return Guest.query.filter_by(user_id=user_id).order_by(
        Guest.last_name, Guest.first_name
    ).paginate(page=page, per_page=GUESTS_PER_PAGE, error_out=False)


def get_owned_guest_or_404(guest_id, user_id):
    guest = db.session.get(Guest, guest_id)
    if not guest:
        abort(404)
    if guest.user_id != user_id:
        abort(403)
    return guest


def create_guest(user_id, form_data):
    first_name = form_data.get("first_name", "").strip()
    if not first_name or len(first_name) > 100:
        abort(400, description="First name is required (max 100 characters)")
    gender = form_data.get("gender", "")
    if gender not in VALID_GENDERS:
        abort(400, description="Gender must be Male or Female")

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
        date_created=datetime.now(),
    )
    db.session.add(guest)
    db.session.commit()
    return guest


def update_guest(guest, user_id, form_data):
    first_name = form_data.get("first_name", "").strip()
    if not first_name or len(first_name) > 100:
        abort(400, description="First name is required (max 100 characters)")
    gender = form_data.get("gender", "")
    if gender not in VALID_GENDERS:
        abort(400, description="Gender must be Male or Female")

    is_me = bool(form_data.get("is_me"))
    if is_me and not guest.is_me:
        Guest.query.filter_by(user_id=user_id, is_me=True).update({"is_me": False})
    guest.first_name = first_name
    guest.last_name = form_data.get("last_name", "").strip()[:100]
    guest.gender = gender
    guest.is_me = is_me
    guest.notes = form_data.get("notes", "").strip()
    guest.date_edited = datetime.now()
    db.session.commit()
    return guest


def delete_guest(guest):
    db.session.delete(guest)
    db.session.commit()


def update_guest_name(guest, first_name, last_name):
    guest.first_name = first_name
    guest.last_name = last_name or ""
    guest.date_edited = datetime.now()
    db.session.commit()


def update_guest_gender(guest, gender):
    if gender not in VALID_GENDERS:
        abort(400, description="Gender must be Male or Female")
    guest.gender = gender
    guest.date_edited = datetime.now()
    db.session.commit()


def update_guest_notes(guest, notes):
    guest.notes = notes
    guest.date_edited = datetime.now()
    db.session.commit()


def update_guest_is_me(guest, user_id, is_me):
    if is_me and not guest.is_me:
        Guest.query.filter_by(user_id=user_id, is_me=True).update({"is_me": False})
    guest.is_me = is_me
    guest.date_edited = datetime.now()
    db.session.commit()
    return guest.is_me


def bulk_create_guests(user_id, guests_data):
    added = []
    for g_data in guests_data:
        first_name = g_data.get("first_name", "").strip()
        if not first_name:
            continue
        guest = Guest(
            user_id=user_id,
            first_name=first_name,
            last_name=g_data.get("last_name", "").strip(),
            gender=g_data.get("gender", "Male"),
            notes=g_data.get("notes", "").strip(),
            date_created=datetime.now()
        )
        db.session.add(guest)
        db.session.flush()
        added.append({
            "id": guest.id, "first_name": guest.first_name,
            "last_name": guest.last_name or "", "gender": guest.gender,
            "notes": guest.notes or "", "is_me": False,
            "date_created": guest.date_created.isoformat()
        })
    db.session.commit()
    return added
