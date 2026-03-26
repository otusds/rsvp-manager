from datetime import date, datetime, timezone
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest, Invitation
from rsvp_manager.services.history_service import log_action

VALID_STATUSES = ("Attending", "Pending", "Declined")


def get_owned_invitation_or_404(invitation_id, user_id):
    """Check user has at least cohost access to the invitation's event."""
    from rsvp_manager.services.cohost_service import require_event_access
    invitation = db.session.get(Invitation, invitation_id)
    if not invitation:
        abort(404)
    require_event_access(invitation.event_id, user_id, min_role="cohost")
    return invitation


def toggle_send(invitation):
    if invitation.status == "Not Sent":
        invitation.status = "Pending"
        invitation.date_invited = date.today()
        log_action(invitation.event.user_id, "sent_invitation", "invitation", invitation.id,
                   f"You sent an invitation to {invitation.guest.full_name} for {invitation.event.name}")
    else:
        invitation.status = "Not Sent"
        invitation.date_invited = None
        invitation.date_responded = None
        log_action(invitation.event.user_id, "unsent_invitation", "invitation", invitation.id,
                   f"You unsent the invitation to {invitation.guest.full_name} for {invitation.event.name}")
    invitation.event.date_edited = datetime.now(timezone.utc)
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
        status_labels = {"Attending": "attending", "Declined": "declined", "Pending": "pending"}
        label = status_labels.get(new_status, new_status.lower())
        log_action(invitation.event.user_id, "status_changed", "invitation", invitation.id,
                   f"You marked {invitation.guest.full_name} as {label} for {invitation.event.name}")
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return invitation


def remove_invitation(invitation):
    event_id = invitation.event_id
    log_action(invitation.event.user_id, "removed_from_event", "invitation", invitation.id,
               f"You removed {invitation.guest.full_name} from {invitation.event.name}")
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.delete(invitation)
    db.session.commit()
    return event_id


def update_field(invitation, field, value):
    if field == "notes":
        invitation.notes = value
    else:
        abort(400, description="Invalid field")
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def get_available_guests(event, user_id):
    invited_ids = {inv.guest_id for inv in event.invitations}
    all_guests = Guest.query.filter_by(user_id=user_id).filter(Guest.deleted_at.is_(None)).order_by(
        Guest.first_name, Guest.last_name
    ).all()
    result = []
    for g in all_guests:
        result.append({
            "id": g.id, "first_name": g.first_name, "last_name": g.last_name or "",
            "gender": g.gender, "already_invited": g.id in invited_ids,
            "is_archived": g.is_archived,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in g.tags if not t.deleted_at],
        })
    return result


def bulk_add_guests(event, guest_ids, user_id):
    invited_ids = {inv.guest_id for inv in event.invitations}
    new_ids = [gid for gid in guest_ids if gid not in invited_ids]
    if not new_ids:
        return []
    guests_by_id = {
        g.id: g for g in Guest.query.filter(
            Guest.id.in_(new_ids), Guest.user_id == user_id,
            Guest.deleted_at.is_(None)
        ).all()
    }
    added = []
    for gid in new_ids:
        guest = guests_by_id.get(gid)
        if not guest:
            continue
        inv = Invitation(event_id=event.id, guest_id=gid, added_by=user_id, status="Not Sent")
        db.session.add(inv)
        db.session.flush()
        log_action(event.user_id, "added_to_event", "invitation", inv.id,
                   f"You added {guest.full_name} to {event.name}")
        added.append({
            "invitation_id": inv.id, "guest_id": guest.id,
            "first_name": guest.first_name, "last_name": guest.last_name or "",
            "gender": guest.gender, "status": "Not Sent",
            "notes": "", "guest_notes": guest.notes or "",
            "guest_tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags if not t.deleted_at],
            "date_invited": "", "date_invited_iso": "",
            "date_responded": "", "date_responded_iso": ""
        })
    if added:
        event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return added


def get_event_guests_with_status(source_event, current_event, user_id):
    current_invited_ids = {inv.guest_id for inv in current_event.invitations}
    result = []
    for inv in source_event.invitations:
        guest = inv.guest
        result.append({
            "id": guest.id,
            "first_name": guest.first_name,
            "last_name": guest.last_name or "",
            "gender": guest.gender,
            "status": inv.status,
            "already_invited": guest.id in current_invited_ids,
            "is_archived": guest.is_archived,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags if not t.deleted_at],
        })
    return result


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
            date_created=datetime.now(timezone.utc)
        )
        db.session.add(guest)
        db.session.flush()
        inv = Invitation(event_id=event.id, guest_id=guest.id, added_by=user_id, status="Not Sent")
        db.session.add(inv)
        db.session.flush()
        log_action(user_id, "created_guest", "guest", guest.id, f"You added {guest.full_name} to your friends")
        log_action(user_id, "added_to_event", "invitation", inv.id, f"You added {guest.full_name} to {event.name}")
        added.append({
            "invitation_id": inv.id, "guest_id": guest.id,
            "first_name": guest.first_name, "last_name": guest.last_name or "",
            "gender": guest.gender, "status": "Not Sent",
            "notes": "",
            "guest_notes": "", "guest_tags": [],
            "date_invited": "", "date_invited_iso": "",
            "date_responded": "", "date_responded_iso": ""
        })
    if added:
        event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return added
