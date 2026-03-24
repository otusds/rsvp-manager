from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Tag
from rsvp_manager.services.history_service import log_action


def get_user_tags(user_id):
    return Tag.query.filter_by(user_id=user_id).order_by(Tag.name).all()


def get_or_create_tag(user_id, tag_name):
    tag_name = tag_name.strip()
    if not tag_name or len(tag_name) > 50:
        abort(400, description="Tag name must be 1-50 characters")

    tag = Tag.query.filter(
        Tag.user_id == user_id,
        db.func.lower(Tag.name) == tag_name.lower()
    ).first()

    if tag:
        return tag

    tag = Tag(user_id=user_id, name=tag_name)
    db.session.add(tag)
    db.session.flush()
    return tag


def update_guest_tags(guest, user_id, tag_names):
    old_tag_names = {t.name.lower() for t in guest.tags}
    new_tags = []
    new_tag_names = set()
    for name in tag_names:
        name = name.strip()
        if name:
            new_tags.append(get_or_create_tag(user_id, name))
            new_tag_names.add(name.lower())
    # Log added tags
    for tag in new_tags:
        if tag.name.lower() not in old_tag_names:
            log_action(user_id, "tagged_guest", "guest", guest.id, f"You tagged {guest.full_name} as {tag.name}")
    # Log removed tags
    for tag in guest.tags:
        if tag.name.lower() not in new_tag_names:
            log_action(user_id, "untagged_guest", "guest", guest.id, f"You removed tag {tag.name} from {guest.full_name}")
    guest.tags = new_tags
    db.session.commit()
    return guest.tags
