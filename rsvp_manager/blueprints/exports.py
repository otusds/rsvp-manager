from flask import Blueprint
from flask_login import login_required, current_user
from rsvp_manager.models import Event, Guest
from rsvp_manager.services import export_service, event_service

bp = Blueprint("exports", __name__)


@bp.route("/export/events")
@login_required
def export_events():
    events = Event.query.filter_by(user_id=current_user.id).filter(Event.deleted_at.is_(None)).order_by(Event.date).all()
    return export_service.export_events_xlsx(events)


@bp.route("/export/friends")
@login_required
def export_friends():
    guests = Guest.query.filter_by(user_id=current_user.id).filter(
        Guest.deleted_at.is_(None)
    ).order_by(Guest.last_name, Guest.first_name).all()
    return export_service.export_guests_xlsx(guests)


@bp.route("/export/event/<int:event_id>")
@login_required
def export_event_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    return export_service.export_event_guests_xlsx(event)


@bp.route("/export/event/<int:event_id>/text")
@login_required
def export_event_guests_text(event_id):
    event = event_service.get_owned_event_or_404(event_id, current_user.id)
    return export_service.export_event_guests_text(event)
