import re
from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Tag, guest_tags
from rsvp_manager.services.history_service import log_action


def get_user_tags(user_id):
    return Tag.query.filter_by(user_id=user_id).order_by(Tag.name).all()


def get_owned_tag_or_404(tag_id, user_id):
    tag = db.session.get(Tag, tag_id)
    if not tag or tag.user_id != user_id:
        abort(404)
    return tag


def rename_tag(tag, user_id, new_name):
    new_name = new_name.strip()
    if not new_name or len(new_name) > 50:
        abort(400, description="Tag name must be 1-50 characters")
    existing = Tag.query.filter(
        Tag.user_id == user_id,
        db.func.lower(Tag.name) == new_name.lower(),
        Tag.id != tag.id,
    ).first()
    if existing:
        abort(400, description="A tag with that name already exists")
    old_name = tag.name
    tag.name = new_name
    db.session.commit()
    log_action(user_id, "renamed_tag", "tag", tag.id, f"You renamed tag '{old_name}' to '{new_name}'")
    return tag


def update_tag_color(tag, color):
    if color:
        if not re.match(r'^#[0-9A-Fa-f]{6}$', color):
            abort(400, description="Invalid color format")
        tag._color = color
    else:
        tag._color = None
    db.session.commit()
    return tag


def delete_tag(tag, user_id):
    name = tag.name
    db.session.execute(guest_tags.delete().where(guest_tags.c.tag_id == tag.id))
    db.session.delete(tag)
    db.session.commit()
    log_action(user_id, "deleted_tag", "tag", tag.id, f"You deleted tag '{name}'")


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
