from datetime import datetime, timezone
from sqlalchemy import or_
from rsvp_manager.extensions import db
from rsvp_manager.models import ActivityLog, EventCohost, Event


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
    """Get history: own logs + logs for shared events (where I'm co-host)."""
    # Event IDs owned by users whose events I co-host
    cohosted_owner_ids = db.session.query(Event.user_id).join(
        EventCohost, EventCohost.event_id == Event.id
    ).filter(EventCohost.user_id == user_id).distinct().subquery()

    query = ActivityLog.query.filter(
        or_(
            ActivityLog.user_id == user_id,
            # Logs by event owners of events I co-host (shows their actions on shared events)
            db.and_(
                ActivityLog.user_id.in_(cohosted_owner_ids),
                ActivityLog.entity_type.in_(["event", "invitation"])
            )
        )
    ).order_by(ActivityLog.created_at.desc())

    return query.paginate(page=page, per_page=HISTORY_PER_PAGE, error_out=False)
