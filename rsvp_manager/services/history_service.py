from datetime import datetime, timezone
from rsvp_manager.extensions import db
from rsvp_manager.models import ActivityLog


HISTORY_PER_PAGE = 30


def log_action(user_id, action, entity_type, entity_id, description, acting_user_id=None):
    entry = ActivityLog(
        user_id=user_id,
        acting_user_id=acting_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(entry)


def get_user_history(user_id, page=1):
    return ActivityLog.query.filter_by(user_id=user_id).order_by(
        ActivityLog.created_at.desc()
    ).paginate(page=page, per_page=HISTORY_PER_PAGE, error_out=False)
