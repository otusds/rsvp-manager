from flask_login import UserMixin
from rsvp_manager.extensions import db, login_manager


EVENT_TYPES = ["Dinner", "Party", "Weekend", "Hunt", "Corporate", "Other"]
CHANNELS = ["WhatsApp", "Email", "Call", "Live", "SMS", "Other"]


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    api_token = db.Column(db.String(64), unique=True, nullable=True, index=True)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    email_verification_token = db.Column(db.String(64), nullable=True)
    email_verification_sent_at = db.Column(db.DateTime, nullable=True)
    password_reset_token = db.Column(db.String(64), nullable=True)
    password_reset_sent_at = db.Column(db.DateTime, nullable=True)
    events = db.relationship("Event", backref="user", cascade="all, delete-orphan")
    guests = db.relationship("Guest", backref="user", cascade="all, delete-orphan")


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    name = db.Column(db.String(200), nullable=False)
    event_type = db.Column(db.String(50), nullable=False, default="Other")
    location = db.Column(db.String(200), nullable=True, default="")
    date = db.Column(db.Date, nullable=False)
    date_created = db.Column(db.Date, nullable=True)
    date_edited = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, default="")
    target_attendees = db.Column(db.Integer, nullable=True)
    invitations = db.relationship("Invitation", backref="event", cascade="all, delete-orphan")


class Guest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=True, default="")
    gender = db.Column(db.String(10), nullable=False)
    is_me = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text, default="")
    date_created = db.Column(db.DateTime, nullable=True)
    date_edited = db.Column(db.DateTime, nullable=True)
    invitations = db.relationship("Invitation", backref="guest", cascade="all, delete-orphan")

    @property
    def full_name(self):
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name


class Invitation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False, index=True)
    guest_id = db.Column(db.Integer, db.ForeignKey("guest.id"), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="Not Sent")
    channel = db.Column(db.String(50), nullable=True, default="")
    date_invited = db.Column(db.Date, nullable=True)
    date_responded = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True, default="")
