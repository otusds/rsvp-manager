from rsvp_manager.blueprints.api import api_bp, api_auth_required, get_api_user
from rsvp_manager.models import Event, Guest
from rsvp_manager.services import export_service, event_service
from rsvp_manager.utils import get_last_name_sort_key


@api_bp.route("/events/export", methods=["GET"])
@api_auth_required
def export_events():
    events = Event.query.filter_by(user_id=get_api_user().id).filter(
        Event.deleted_at.is_(None)
    ).order_by(Event.date).all()
    return export_service.export_events_xlsx(events)


@api_bp.route("/events/<int:event_id>/export", methods=["GET"])
@api_auth_required
def export_event_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    return export_service.export_event_guests_xlsx(event)


@api_bp.route("/friends/export", methods=["GET"])
@api_auth_required
def export_friends():
    guests = Guest.query.filter_by(user_id=get_api_user().id).filter(
        Guest.deleted_at.is_(None)
    ).all()
    guests.sort(key=lambda g: (get_last_name_sort_key(g.last_name), g.first_name.lower()))
    return export_service.export_guests_xlsx(guests)
