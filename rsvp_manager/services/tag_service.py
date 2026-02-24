from flask import abort
from rsvp_manager.extensions import db
from rsvp_manager.models import Tag


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
    new_tags = []
    for name in tag_names:
        name = name.strip()
        if name:
            new_tags.append(get_or_create_tag(user_id, name))
    guest.tags = new_tags
    db.session.commit()
    return guest.tags
