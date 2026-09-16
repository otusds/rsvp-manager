"""Per-event guest attributes.

An attribute is a question asked about each guest of one event ("Hunting"), with
a fixed list of options ("Hunter", "Follower"). Each guest on the event may be
set to one option per attribute; no stored value means "not set".

Attributes belong to the event, never to the friends database, so the same
person can be a Hunter at one event and a Follower at the next.
"""
from datetime import datetime, timezone

from flask import abort
from sqlalchemy.orm import joinedload, selectinload

from rsvp_manager.extensions import db
from rsvp_manager.models import (
    DEFAULT_EVENT_ATTRIBUTES,
    EventAttribute,
    EventAttributeOption,
    Invitation,
    InvitationAttributeValue,
)
from rsvp_manager.services.history_service import log_action

NOT_SET = "Not set"


# ── Definitions ─────────────────────────────────────────────────────────────

def get_attributes(event):
    """Attributes of an event, in display order, with options preloaded."""
    return (
        EventAttribute.query.options(selectinload(EventAttribute.options))
        .filter_by(event_id=event.id)
        .order_by(EventAttribute.position, EventAttribute.id)
        .all()
    )


def get_owned_attribute_or_404(attribute_id, event):
    attribute = EventAttribute.query.filter_by(id=attribute_id, event_id=event.id).first()
    if not attribute:
        abort(404, description="Attribute not found")
    return attribute


def _next_position(model, **filters):
    highest = (
        db.session.query(db.func.max(model.position)).filter_by(**filters).scalar()
    )
    return (highest or 0) + 1


def create_attribute(event, name, option_labels, acting_user_id=None):
    """Add an attribute with its options. Duplicate option labels are collapsed."""
    name = (name or "").strip()
    if not name:
        abort(400, description="Attribute name is required")
    if EventAttribute.query.filter_by(event_id=event.id, name=name).first():
        abort(400, description=f'"{name}" already exists on this event')

    labels = _clean_labels(option_labels)
    if not labels:
        abort(400, description="At least one option is required")

    attribute = EventAttribute(
        event_id=event.id, name=name,
        position=_next_position(EventAttribute, event_id=event.id),
    )
    db.session.add(attribute)
    db.session.flush()
    for i, label in enumerate(labels, start=1):
        db.session.add(EventAttributeOption(attribute_id=attribute.id, label=label, position=i))

    event.date_edited = datetime.now(timezone.utc)
    log_action(acting_user_id or event.user_id, "added_attribute", "event", event.id,
               f"You added the attribute {name} to {event.name}")
    db.session.commit()
    return attribute


def update_attribute(attribute, name=None, option_labels=None, acting_user_id=None):
    """Rename an attribute and/or edit its options.

    Options are matched by label, so renaming an option is not supported here -
    an option whose label disappears is removed along with the guests' answers to
    it. rename_option() exists for the rename case, which keeps answers intact.
    """
    event = attribute.event
    if name is not None:
        name = name.strip()
        if not name:
            abort(400, description="Attribute name is required")
        clash = EventAttribute.query.filter(
            EventAttribute.event_id == event.id,
            EventAttribute.name == name,
            EventAttribute.id != attribute.id,
        ).first()
        if clash:
            abort(400, description=f'"{name}" already exists on this event')
        attribute.name = name

    if option_labels is not None:
        labels = _clean_labels(option_labels)
        if not labels:
            abort(400, description="At least one option is required")
        existing = {o.label: o for o in attribute.options}
        for i, label in enumerate(labels, start=1):
            if label in existing:
                existing.pop(label).position = i
            else:
                db.session.add(EventAttributeOption(
                    attribute_id=attribute.id, label=label, position=i))
        for orphan in existing.values():  # dropped by the caller
            db.session.delete(orphan)

    event.date_edited = datetime.now(timezone.utc)
    log_action(acting_user_id or event.user_id, "edited_attribute", "event", event.id,
               f"You edited the attribute {attribute.name} on {event.name}")
    db.session.commit()
    return attribute


def rename_option(option, label, acting_user_id=None):
    """Rename an option in place, keeping every guest's answer."""
    label = (label or "").strip()
    if not label:
        abort(400, description="Option name is required")
    clash = EventAttributeOption.query.filter(
        EventAttributeOption.attribute_id == option.attribute_id,
        EventAttributeOption.label == label,
        EventAttributeOption.id != option.id,
    ).first()
    if clash:
        abort(400, description=f'"{label}" already exists on this attribute')
    option.label = label
    event = option.attribute.event
    event.date_edited = datetime.now(timezone.utc)
    log_action(acting_user_id or event.user_id, "edited_attribute", "event", event.id,
               f"You renamed an option of {option.attribute.name} on {event.name}")
    db.session.commit()
    return option


def delete_attribute(attribute, acting_user_id=None):
    """Remove an attribute and every guest's answer to it."""
    event = attribute.event
    name = attribute.name
    db.session.delete(attribute)
    event.date_edited = datetime.now(timezone.utc)
    log_action(acting_user_id or event.user_id, "deleted_attribute", "event", event.id,
               f"You removed the attribute {name} from {event.name}")
    db.session.commit()


def reorder_attributes(event, attribute_ids, acting_user_id=None):
    by_id = {a.id: a for a in get_attributes(event)}
    for position, attribute_id in enumerate(attribute_ids, start=1):
        attribute = by_id.get(attribute_id)
        if attribute:
            attribute.position = position
    event.date_edited = datetime.now(timezone.utc)
    db.session.commit()


def apply_defaults_for_type(event, acting_user_id=None):
    """Seed the attributes an event type starts with. No-op for types without any."""
    created = []
    for name, labels in DEFAULT_EVENT_ATTRIBUTES.get(event.event_type, []):
        if EventAttribute.query.filter_by(event_id=event.id, name=name).first():
            continue
        created.append(create_attribute(event, name, labels, acting_user_id))
    return created


def _clean_labels(labels):
    """Strip, drop blanks, and de-duplicate while keeping the given order."""
    seen, out = set(), []
    for raw in labels or []:
        label = (raw or "").strip()
        if label and label.lower() not in seen:
            seen.add(label.lower())
            out.append(label)
    return out


# ── Guest answers ───────────────────────────────────────────────────────────

def set_value(invitation, attribute, option_id):
    """Set one guest's answer. option_id of None clears it back to "not set"."""
    if attribute.event_id != invitation.event_id:
        abort(404, description="Attribute not found")

    existing = InvitationAttributeValue.query.filter_by(
        invitation_id=invitation.id, attribute_id=attribute.id).first()

    if option_id is None:
        if existing:
            db.session.delete(existing)
        db.session.commit()
        return None

    option = EventAttributeOption.query.filter_by(
        id=option_id, attribute_id=attribute.id).first()
    if not option:
        abort(400, description="That option does not belong to this attribute")

    if existing:
        existing.option_id = option.id
    else:
        db.session.add(InvitationAttributeValue(
            invitation_id=invitation.id, attribute_id=attribute.id, option_id=option.id))
    db.session.commit()
    return option


def bulk_set_value(event, invitation_ids, attribute, option_id):
    """Set the same answer on many guests at once. Returns the ids changed."""
    if attribute.event_id != event.id:
        abort(404, description="Attribute not found")

    option = None
    if option_id is not None:
        option = EventAttributeOption.query.filter_by(
            id=option_id, attribute_id=attribute.id).first()
        if not option:
            abort(400, description="That option does not belong to this attribute")

    invitations = Invitation.query.filter(
        Invitation.event_id == event.id,
        Invitation.id.in_(invitation_ids or []),
    ).all()

    existing = {
        v.invitation_id: v
        for v in InvitationAttributeValue.query.filter(
            InvitationAttributeValue.attribute_id == attribute.id,
            InvitationAttributeValue.invitation_id.in_([i.id for i in invitations] or [0]),
        ).all()
    }

    changed = []
    for invitation in invitations:
        current = existing.get(invitation.id)
        if option is None:
            if current:
                db.session.delete(current)
                changed.append(invitation.id)
        elif current is None:
            db.session.add(InvitationAttributeValue(
                invitation_id=invitation.id, attribute_id=attribute.id, option_id=option.id))
            changed.append(invitation.id)
        elif current.option_id != option.id:
            current.option_id = option.id
            changed.append(invitation.id)

    db.session.commit()
    return changed


# ── Summary ─────────────────────────────────────────────────────────────────

STATUSES = ("Attending", "Pending", "Declined")


def summarize(event):
    """Counts per option per status, shaped like the gender summary above it.

    Returns a list of {attribute, rows, totals}, where each row is one option
    (plus a trailing "Not set" row) with a count for each status and an
    "invited" total that excludes "Not Sent", matching the rest of the app.
    """
    attributes = get_attributes(event)
    if not attributes:
        return []

    invitations = (
        Invitation.query.options(
            joinedload(Invitation.guest),
            selectinload(Invitation.attribute_values),
        )
        .filter(Invitation.event_id == event.id)
        .all()
    )
    live = [i for i in invitations if not i.guest.deleted_at]

    summaries = []
    for attribute in attributes:
        chosen = {}
        for invitation in live:
            for value in invitation.attribute_values:
                if value.attribute_id == attribute.id:
                    chosen[invitation.id] = value.option_id
                    break

        rows = []
        for option in attribute.options:
            members = [i for i in live if chosen.get(i.id) == option.id]
            rows.append(_row(option.label, members, option_id=option.id))

        unset = [i for i in live if i.id not in chosen]
        if unset:
            rows.append(_row(NOT_SET, unset, option_id=None))

        summaries.append({
            "attribute": attribute,
            "rows": rows,
            "totals": _row("Total", live),
        })
    return summaries


def _row(label, invitations, option_id=None):
    counts = {s: sum(1 for i in invitations if i.status == s) for s in STATUSES}
    return {
        "label": label,
        "option_id": option_id,
        "attending": counts["Attending"],
        "pending": counts["Pending"],
        "declined": counts["Declined"],
        "invited": sum(1 for i in invitations if i.status != "Not Sent"),
    }
