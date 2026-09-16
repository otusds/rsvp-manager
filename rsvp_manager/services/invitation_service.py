from datetime import date, datetime, timezone
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest, Invitation
from rsvp_manager.services.history_service import log_action
from rsvp_manager.utils import get_last_name_sort_key

VALID_STATUSES = ("Attending", "Pending", "Declined")


def get_owned_invitation_or_404(invitation_id, user_id):
    """Check user has at least cohost access to the invitation's event."""
    from rsvp_manager.services.cohost_service import require_event_access
    invitation = db.session.get(Invitation, invitation_id)
    if not invitation:
        abort(404)
    require_event_access(invitation.event_id, user_id, min_role="cohost")
    return invitation


def toggle_send(invitation, acting_user_id=None):
    if invitation.status == "Not Sent":
        invitation.status = "Pending"
        invitation.date_invited = date.today()
        invitation.sent_by = acting_user_id
        log_action(invitation.event.user_id, "sent_invitation", "invitation", invitation.id,
                   f"You sent an invitation to {invitation.guest.full_name} for {invitation.event.name}",
                   acting_user_id=acting_user_id)
    else:
        invitation.status = "Not Sent"
        invitation.date_invited = None
        invitation.sent_by = None
        invitation.date_responded = None
        invitation.status_changed_by = None
        log_action(invitation.event.user_id, "unsent_invitation", "invitation", invitation.id,
                   f"You unsent the invitation to {invitation.guest.full_name} for {invitation.event.name}",
                   acting_user_id=acting_user_id)
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return invitation


def update_status(invitation, new_status, acting_user_id=None):
    if new_status not in VALID_STATUSES:
        abort(400, description="Invalid status")
    if invitation.status == "Not Sent":
        abort(400, description="Cannot change status of an unsent invitation")
    if new_status != invitation.status:
        invitation.status = new_status
        invitation.status_changed_by = acting_user_id
        if new_status in ("Attending", "Declined"):
            invitation.date_responded = date.today()
        elif new_status == "Pending":
            invitation.date_responded = None
        status_labels = {"Attending": "attending", "Declined": "declined", "Pending": "pending"}
        label = status_labels.get(new_status, new_status.lower())
        log_action(invitation.event.user_id, "status_changed", "invitation", invitation.id,
                   f"You marked {invitation.guest.full_name} as {label} for {invitation.event.name}",
                   acting_user_id=acting_user_id)
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.commit()
    return invitation


def snapshot_invitation(invitation):
    """Everything needed to put a removed guest back exactly as they were.

    Removing a guest from an event is a hard delete and the trash does not cover
    invitations, so without this the action is unrecoverable. Captured before the
    delete: the invitation fields, the guest's attribute answers, and their seat
    if they had one.
    """
    seat = None
    assignments = invitation.seat_assignment
    if assignments:
        sa = assignments[0] if isinstance(assignments, list) else assignments
        seat = {"table_id": sa.table_id, "seat_position": sa.seat_position,
                "is_locked": sa.is_locked}
    return {
        "guest_id": invitation.guest_id,
        "status": invitation.status,
        "notes": invitation.notes or "",
        "added_by": invitation.added_by,
        "sent_by": invitation.sent_by,
        "status_changed_by": invitation.status_changed_by,
        "date_invited": invitation.date_invited.isoformat() if invitation.date_invited else None,
        "date_responded": invitation.date_responded.isoformat() if invitation.date_responded else None,
        "attributes": [{"attribute_id": v.attribute_id, "option_id": v.option_id}
                       for v in invitation.attribute_values],
        "seat": seat,
    }


def remove_invitation(invitation):
    event_id = invitation.event_id
    log_action(invitation.event.user_id, "removed_from_event", "invitation", invitation.id,
               f"You removed {invitation.guest.full_name} from {invitation.event.name}")
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.delete(invitation)
    db.session.commit()
    return event_id


def restore_invitations(event, snapshots, user_id):
    """Put guests removed from an event back, from snapshot_invitation() data.

    Only the user's own guests are restored, and a guest already back on the
    event is skipped, so a double undo cannot duplicate anyone.
    """
    from rsvp_manager.models import (
        EventAttribute, EventAttributeOption, InvitationAttributeValue,
        SeatAssignment, SeatingTable,
    )

    restored = []
    for snap in snapshots or []:
        guest = Guest.query.filter_by(
            id=snap.get("guest_id"), user_id=event.user_id
        ).filter(Guest.deleted_at.is_(None)).first()
        if not guest:
            continue
        if Invitation.query.filter_by(event_id=event.id, guest_id=guest.id).first():
            continue

        inv = Invitation(
            event_id=event.id,
            guest_id=guest.id,
            status=snap.get("status") or "Not Sent",
            notes=snap.get("notes") or "",
            added_by=snap.get("added_by") or user_id,
            sent_by=snap.get("sent_by"),
            status_changed_by=snap.get("status_changed_by"),
            date_invited=_parse_date(snap.get("date_invited")),
            date_responded=_parse_date(snap.get("date_responded")),
        )
        db.session.add(inv)
        db.session.flush()

        # Attribute answers, but only ones still defined on this event.
        for value in snap.get("attributes") or []:
            attribute = EventAttribute.query.filter_by(
                id=value.get("attribute_id"), event_id=event.id).first()
            if not attribute:
                continue
            option = EventAttributeOption.query.filter_by(
                id=value.get("option_id"), attribute_id=attribute.id).first()
            if not option:
                continue
            db.session.add(InvitationAttributeValue(
                invitation_id=inv.id, attribute_id=attribute.id, option_id=option.id))

        # Their seat, if the table is still there and the chair is still free.
        seat = snap.get("seat")
        if seat:
            table = SeatingTable.query.filter_by(
                id=seat.get("table_id"), event_id=event.id).first()
            taken = table and SeatAssignment.query.filter_by(
                table_id=table.id, seat_position=seat.get("seat_position")).first()
            if table and not taken:
                db.session.add(SeatAssignment(
                    table_id=table.id, invitation_id=inv.id,
                    seat_position=seat.get("seat_position"),
                    is_locked=bool(seat.get("is_locked"))))

        restored.append(inv)

    if restored:
        event.date_edited = datetime.now(timezone.utc)
        log_action(user_id, "restored_to_event", "event", event.id,
                   f"You put {len(restored)} guest(s) back on {event.name}")
    db.session.commit()
    return restored


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def update_field(invitation, field, value):
    if field == "notes":
        invitation.notes = value
    else:
        abort(400, description="Invalid field")
    invitation.event.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def get_available_guests(event, user_id):
    from rsvp_manager.services.friend_service import _normalize_name
    invited_ids = {inv.guest_id for inv in event.invitations}
    # Build set of normalized names already in the event (from all hosts)
    invited_names = set()
    for inv in event.invitations:
        if not inv.guest.deleted_at:
            norm = _normalize_name(inv.guest.first_name) + "|" + _normalize_name(inv.guest.last_name)
            invited_names.add(norm)
    all_guests = Guest.query.filter_by(user_id=user_id).filter(Guest.deleted_at.is_(None)).all()
    all_guests.sort(key=lambda g: (get_last_name_sort_key(g.last_name), g.first_name.lower()))
    result = []
    for g in all_guests:
        already_by_id = g.id in invited_ids
        name_key = _normalize_name(g.first_name) + "|" + _normalize_name(g.last_name)
        name_match = name_key in invited_names and not already_by_id
        result.append({
            "id": g.id, "first_name": g.first_name, "last_name": g.last_name or "",
            "last_name_sort_key": g.last_name_sort_key,
            "gender": g.gender,
            "already_invited": already_by_id,
            "name_match_in_event": name_match,
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
            "guest_owner_id": guest.user_id, "added_by": user_id,
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
    """Get guests from source event that belong to user's friend list."""
    current_invited_ids = {inv.guest_id for inv in current_event.invitations}
    result = []
    for inv in source_event.invitations:
        guest = inv.guest
        # Only show guests from the requesting user's friend list
        if guest.user_id != user_id or guest.deleted_at:
            continue
        result.append({
            "id": guest.id,
            "first_name": guest.first_name,
            "last_name": guest.last_name or "",
            "last_name_sort_key": guest.last_name_sort_key,
            "gender": guest.gender,
            "status": inv.status,
            "already_invited": guest.id in current_invited_ids,
            "is_archived": guest.is_archived,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in guest.tags if not t.deleted_at],
        })
    return result


def bulk_create_and_invite(event, guests_data, user_id):
    from rsvp_manager.utils import VALID_GENDERS
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
        inv = Invitation(event_id=event.id, guest_id=guest.id, added_by=user_id, status="Not Sent")
        db.session.add(inv)
        db.session.flush()
        log_action(user_id, "created_guest", "guest", guest.id, f"You added {guest.full_name} to your friends")
        log_action(user_id, "added_to_event", "invitation", inv.id, f"You added {guest.full_name} to {event.name}")
        added.append({
            "invitation_id": inv.id, "guest_id": guest.id,
            "guest_owner_id": guest.user_id, "added_by": user_id,
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
