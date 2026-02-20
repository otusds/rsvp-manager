from datetime import date, datetime
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest, Invitation

VALID_STATUSES = ("Attending", "Pending", "Declined")


def get_owned_invitation_or_404(invitation_id, user_id):
    invitation = db.session.get(Invitation, invitation_id)
    if not invitation:
        abort(404)
    if invitation.event.user_id != user_id:
        abort(403)
    return invitation


def toggle_send(invitation):
    if invitation.status == "Not Sent":
        invitation.status = "Pending"
        invitation.date_invited = date.today()
    else:
        invitation.status = "Not Sent"
        invitation.date_invited = None
        invitation.date_responded = None
    invitation.event.date_edited = datetime.now()
    db.session.commit()
    return invitation


def update_status(invitation, new_status):
    if new_status not in VALID_STATUSES:
        abort(400, description="Invalid status")
    if new_status != invitation.status:
        invitation.status = new_status
        if new_status in ("Attending", "Declined"):
            invitation.date_responded = date.today()
        elif new_status == "Pending":
            invitation.date_responded = None
    invitation.event.date_edited = datetime.now()
    db.session.commit()
    return invitation


def remove_invitation(invitation):
    event_id = invitation.event_id
    invitation.event.date_edited = datetime.now()
    db.session.delete(invitation)
    db.session.commit()
    return event_id


def update_field(invitation, field, value):
    if field == "channel":
        invitation.channel = value
    elif field == "notes":
        invitation.notes = value
    else:
        abort(400, description="Invalid field")
    invitation.event.date_edited = datetime.now()
    db.session.commit()


def get_available_guests(event, user_id):
    invited_ids = {inv.guest_id for inv in event.invitations}
    all_guests = Guest.query.filter_by(user_id=user_id).order_by(
        Guest.first_name, Guest.last_name
    ).all()
    result = []
    for g in all_guests:
        result.append({
            "id": g.id, "first_name": g.first_name, "last_name": g.last_name or "",
            "gender": g.gender, "already_invited": g.id in invited_ids
        })
    return result


def bulk_add_guests(event, guest_ids, user_id):
    invited_ids = {inv.guest_id for inv in event.invitations}
    added = []
    for gid in guest_ids:
        if gid in invited_ids:
            continue
        guest = db.session.get(Guest, gid)
        if not guest or guest.user_id != user_id:
            continue
        inv = Invitation(event_id=event.id, guest_id=gid, status="Not Sent")
        db.session.add(inv)
        db.session.flush()
        added.append({
            "invitation_id": inv.id, "guest_id": guest.id,
            "first_name": guest.first_name, "last_name": guest.last_name or "",
            "gender": guest.gender, "status": "Not Sent"
        })
    if added:
        event.date_edited = datetime.now()
    db.session.commit()
    return added


def bulk_create_and_invite(event, guests_data, user_id):
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
        inv = Invitation(event_id=event.id, guest_id=guest.id, status="Not Sent")
        db.session.add(inv)
        db.session.flush()
        added.append({
            "invitation_id": inv.id, "guest_id": guest.id,
            "first_name": guest.first_name, "last_name": guest.last_name or "",
            "gender": guest.gender, "status": "Not Sent",
            "channel": "", "notes": "",
            "date_invited": "", "date_invited_iso": "",
            "date_responded": "", "date_responded_iso": ""
        })
    if added:
        event.date_edited = datetime.now()
    db.session.commit()
    return added
