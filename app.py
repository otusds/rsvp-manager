from rsvp_manager import create_app
from rsvp_manager.extensions import db
from rsvp_manager.models import User, Event, Guest, Invitation

app = create_app()

if __name__ == "__main__":
    import os
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
