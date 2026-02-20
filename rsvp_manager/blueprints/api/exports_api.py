from rsvp_manager.blueprints.api import api_bp, api_auth_required, get_api_user
from rsvp_manager.models import Event, Guest
from rsvp_manager.services import export_service, event_service


@api_bp.route("/events/export", methods=["GET"])
@api_auth_required
def export_events():
    events = Event.query.filter_by(user_id=get_api_user().id).order_by(Event.date).all()
    return export_service.export_events_xlsx(events)


@api_bp.route("/events/<int:event_id>/export", methods=["GET"])
@api_auth_required
def export_event_guests(event_id):
    event = event_service.get_owned_event_or_404(event_id, get_api_user().id)
    return export_service.export_event_guests_xlsx(event)


@api_bp.route("/guests/export", methods=["GET"])
@api_auth_required
def export_guests():
    guests = Guest.query.filter_by(user_id=get_api_user().id).order_by(
        Guest.last_name, Guest.first_name
    ).all()
    return export_service.export_guests_xlsx(guests)
