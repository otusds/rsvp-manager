from flask_login import UserMixin
from rsvp_manager.extensions import db, login_manager


EVENT_TYPES = ["Dinner", "Party", "Weekend", "Hunt", "Corporate", "Holiday", "Other"]


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    first_name = db.Column(db.String(100), nullable=True, default="")
    last_name = db.Column(db.String(100), nullable=True, default="")
    gender = db.Column(db.String(10), nullable=True, default="")
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    email_verification_token = db.Column(db.String(64), nullable=True)
    email_verification_sent_at = db.Column(db.DateTime, nullable=True)
    password_reset_token = db.Column(db.String(64), nullable=True)
    password_reset_sent_at = db.Column(db.DateTime, nullable=True)
    events = db.relationship("Event", backref="user", cascade="all, delete-orphan")
    guests = db.relationship("Guest", backref="user", cascade="all, delete-orphan")
    tags = db.relationship("Tag", backref="user", cascade="all, delete-orphan")

    @property
    def full_name(self):
        parts = [self.first_name or "", self.last_name or ""]
        return " ".join(p for p in parts if p).strip() or self.email

    def __repr__(self):
        return f"<User {self.id} {self.email}>"


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    event_type = db.Column(db.String(50), nullable=False, default="Other")
    location = db.Column(db.String(200), nullable=True, default="")
    date = db.Column(db.Date, nullable=False)
    date_created = db.Column(db.Date, nullable=True)
    date_edited = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)
    notes = db.Column(db.Text, default="")
    invitations = db.relationship("Invitation", backref="event", cascade="all, delete-orphan")
    cohosts = db.relationship("EventCohost", backref="event", cascade="all, delete-orphan")
    share_links = db.relationship("EventShareLink", backref="event", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Event {self.id} {self.name!r}>"


class EventCohost(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    role = db.Column(db.String(10), nullable=False, default="cohost")
    joined_at = db.Column(db.DateTime, nullable=False)
    __table_args__ = (db.UniqueConstraint('event_id', 'user_id', name='uq_event_cohost'),)

    user = db.relationship("User", backref="cohosted_events")

    def __repr__(self):
        return f"<EventCohost event={self.event_id} user={self.user_id} {self.role}>"


class EventShareLink(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False, index=True)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    role = db.Column(db.String(10), nullable=False, default="cohost")
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    def __repr__(self):
        return f"<EventShareLink event={self.event_id} role={self.role}>"


guest_tags = db.Table('guest_tags',
    db.Column('guest_id', db.Integer, db.ForeignKey('guest.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'), primary_key=True),
)


class Guest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=True, default="")
    gender = db.Column(db.String(10), nullable=False)
    is_me = db.Column(db.Boolean, default=False)
    is_archived = db.Column(db.Boolean, default=False, server_default=db.text("false"), nullable=False)
    notes = db.Column(db.Text, default="")
    date_created = db.Column(db.DateTime, nullable=True)
    date_edited = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)
    invitations = db.relationship("Invitation", backref="guest", cascade="all, delete-orphan")
    tags = db.relationship("Tag", secondary=guest_tags, backref="guests")

    @property
    def full_name(self):
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    def __repr__(self):
        return f"<Guest {self.id} {self.full_name!r}>"


class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(50), nullable=False)
    _color = db.Column("color", db.String(7), nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)
    __table_args__ = (db.UniqueConstraint('user_id', 'name', name='uq_user_tag_name'),)

    TAG_COLORS = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#82E0AA',
    ]

    @property
    def color(self):
        return self._color or self.TAG_COLORS[self.id % len(self.TAG_COLORS)]

    def __repr__(self):
        return f"<Tag {self.id} {self.name!r}>"


class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    acting_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    action = db.Column(db.String(50), nullable=False)
    entity_type = db.Column(db.String(20), nullable=False)
    entity_id = db.Column(db.Integer, nullable=True)
    description = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, index=True)

    def __repr__(self):
        return f"<ActivityLog {self.id} {self.action}>"


class Invitation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False, index=True)
    guest_id = db.Column(db.Integer, db.ForeignKey("guest.id"), nullable=False, index=True)
    added_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="Not Sent", index=True)
    date_invited = db.Column(db.Date, nullable=True)
    sent_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    date_responded = db.Column(db.Date, nullable=True)
    status_changed_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    notes = db.Column(db.Text, nullable=True, default="")

    added_by_user = db.relationship("User", foreign_keys=[added_by], lazy="select")
    sent_by_user = db.relationship("User", foreign_keys=[sent_by], lazy="select")
    status_changed_by_user = db.relationship("User", foreign_keys=[status_changed_by], lazy="select")

    __table_args__ = (db.UniqueConstraint('event_id', 'guest_id', name='uq_invitation_event_guest'),)

    def __repr__(self):
        return f"<Invitation {self.id} event={self.event_id} guest={self.guest_id} {self.status}>"


TABLE_SHAPES = ["rectangular", "round", "long", "large_rect"]


class SeatingTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False, index=True)
    table_number = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(100), nullable=True, default="")
    shape = db.Column(db.String(20), nullable=False, default="rectangular")
    capacity = db.Column(db.Integer, nullable=False, default=12)
    rotation = db.Column(db.Integer, nullable=False, default=0, server_default=db.text("0"))
    seat_assignments = db.relationship("SeatAssignment", backref="table", cascade="all, delete-orphan")

    event = db.relationship("Event", backref="seating_tables")

    def __repr__(self):
        return f"<SeatingTable {self.id} event={self.event_id} #{self.table_number}>"


class SeatAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_id = db.Column(db.Integer, db.ForeignKey("seating_table.id"), nullable=False, index=True)
    invitation_id = db.Column(db.Integer, db.ForeignKey("invitation.id"), nullable=False, index=True)
    seat_position = db.Column(db.Integer, nullable=False)
    is_locked = db.Column(db.Boolean, default=False, server_default=db.text("false"), nullable=False)

    invitation = db.relationship("Invitation", backref="seat_assignment")

    __table_args__ = (
        db.UniqueConstraint('invitation_id', name='uq_seat_invitation'),
    )

    def __repr__(self):
        return f"<SeatAssignment {self.id} table={self.table_id} seat={self.seat_position}>"
