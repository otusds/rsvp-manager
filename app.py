import os
from io import BytesIO
from datetime import date, datetime
from urllib.parse import urlparse
from flask import Flask, render_template, request, redirect, url_for, send_file, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

app = Flask(__name__)
database_url = os.environ.get("DATABASE_URL", "sqlite:///rsvp.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-me")
db = SQLAlchemy(app)

login_manager = LoginManager(app)
login_manager.login_view = "login"


# ── Constants ─────────────────────────────────────────────────────────────────

EVENT_TYPES = ["Dinner", "Party", "Wedding", "Corporate", "Conference", "Ceremony", "Other"]
CHANNELS = ["WhatsApp", "Email", "Call", "Live", "SMS", "Other"]


# ── Models ────────────────────────────────────────────────────────────────────

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    events = db.relationship("Event", backref="user", cascade="all, delete-orphan")
    guests = db.relationship("Guest", backref="user", cascade="all, delete-orphan")


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    event_type = db.Column(db.String(50), nullable=False, default="Other")
    location = db.Column(db.String(200), nullable=True, default="")
    date = db.Column(db.Date, nullable=False)
    notes = db.Column(db.Text, default="")
    invitations = db.relationship("Invitation", backref="event", cascade="all, delete-orphan")


class Guest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=True, default="")
    gender = db.Column(db.String(10), nullable=False)
    is_me = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text, default="")
    invitations = db.relationship("Invitation", backref="guest", cascade="all, delete-orphan")

    @property
    def full_name(self):
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name


class Invitation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    guest_id = db.Column(db.Integer, db.ForeignKey("guest.id"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Not Sent")
    channel = db.Column(db.String(50), nullable=True, default="")
    date_invited = db.Column(db.Date, nullable=True)
    date_responded = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True, default="")


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("home"))
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        if User.query.filter_by(email=email).first():
            return render_template("signup.html", error="Email already registered")
        if len(password) < 6:
            return render_template("signup.html", error="Password must be at least 6 characters")
        user = User(email=email, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        if request.form.get("sample_data"):
            seed(user.id)
        login_user(user)
        return redirect(url_for("home"))
    return render_template("signup.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("home"))
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            return render_template("login.html", error="Invalid email or password")
        login_user(user)
        next_page = request.args.get("next")
        if next_page and urlparse(next_page).netloc:
            next_page = None
        return redirect(next_page or url_for("home"))
    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))


# ── Event routes ──────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def home():
    events = Event.query.filter_by(user_id=current_user.id).order_by(Event.date).all()
    return render_template("home.html", events=events, event_types=EVENT_TYPES)


@app.route("/event/add", methods=["GET", "POST"])
@login_required
def add_event():
    if request.method == "POST":
        event = Event(
            user_id=current_user.id,
            name=request.form["name"],
            event_type=request.form["event_type"],
            location=request.form.get("location", ""),
            date=date.fromisoformat(request.form["date"]),
            notes=request.form.get("notes", ""),
        )
        db.session.add(event)
        db.session.commit()
        if request.form.get("include_me"):
            me = Guest.query.filter_by(user_id=current_user.id, is_me=True).first()
            if me:
                inv = Invitation(event_id=event.id, guest_id=me.id,
                                 status="Attending", date_invited=date.today(),
                                 date_responded=date.today())
                db.session.add(inv)
                db.session.commit()
        return redirect(url_for("event_detail", event_id=event.id))
    me_exists = Guest.query.filter_by(user_id=current_user.id, is_me=True).first() is not None
    return render_template("edit_event.html", event=None, event_types=EVENT_TYPES, me_exists=me_exists)


@app.route("/event/<int:event_id>")
@login_required
def event_detail(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        return redirect(url_for("home"))
    invited_guest_ids = [inv.guest_id for inv in event.invitations]
    available_guests = Guest.query.filter_by(user_id=current_user.id).filter(~Guest.id.in_(invited_guest_ids)).all() if invited_guest_ids else Guest.query.filter_by(user_id=current_user.id).all()
    return render_template("event_detail.html", event=event, available_guests=available_guests, channels=CHANNELS)


@app.route("/event/<int:event_id>/edit", methods=["GET", "POST"])
@login_required
def edit_event(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        return redirect(url_for("home"))
    if request.method == "POST":
        event.name = request.form["name"]
        event.event_type = request.form["event_type"]
        event.location = request.form.get("location", "")
        event.date = date.fromisoformat(request.form["date"])
        event.notes = request.form.get("notes", "")
        db.session.commit()
        return redirect(url_for("event_detail", event_id=event.id))
    return render_template("edit_event.html", event=event, event_types=EVENT_TYPES, me_exists=False)


@app.route("/event/<int:event_id>/delete", methods=["POST"])
@login_required
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        return redirect(url_for("home"))
    db.session.delete(event)
    db.session.commit()
    return redirect(url_for("home"))


# ── Guest routes ──────────────────────────────────────────────────────────────

@app.route("/guests")
@login_required
def guests():
    all_guests = Guest.query.filter_by(user_id=current_user.id).order_by(Guest.is_me.desc(), Guest.last_name, Guest.first_name).all()
    return render_template("guests.html", guests=all_guests)


@app.route("/guest/add", methods=["GET", "POST"])
@login_required
def add_guest():
    if request.method == "POST":
        is_me = bool(request.form.get("is_me"))
        if is_me:
            Guest.query.filter_by(user_id=current_user.id, is_me=True).update({"is_me": False})
        guest = Guest(
            user_id=current_user.id,
            first_name=request.form["first_name"],
            last_name=request.form.get("last_name", ""),
            gender=request.form["gender"],
            is_me=is_me,
            notes=request.form.get("notes", ""),
        )
        db.session.add(guest)
        db.session.commit()
        return redirect(url_for("guests"))
    return render_template("edit_guest.html", guest=None)


@app.route("/guest/<int:guest_id>/edit", methods=["GET", "POST"])
@login_required
def edit_guest(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    if guest.user_id != current_user.id:
        return redirect(url_for("guests"))
    if request.method == "POST":
        is_me = bool(request.form.get("is_me"))
        if is_me and not guest.is_me:
            Guest.query.filter_by(user_id=current_user.id, is_me=True).update({"is_me": False})
        guest.first_name = request.form["first_name"]
        guest.last_name = request.form.get("last_name", "")
        guest.gender = request.form["gender"]
        guest.is_me = is_me
        guest.notes = request.form.get("notes", "")
        db.session.commit()
        return redirect(url_for("guests"))
    return render_template("edit_guest.html", guest=guest)


@app.route("/guest/<int:guest_id>/delete", methods=["POST"])
@login_required
def delete_guest(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    if guest.user_id != current_user.id:
        return redirect(url_for("guests"))
    db.session.delete(guest)
    db.session.commit()
    return redirect(url_for("guests"))


# ── Invitation routes ─────────────────────────────────────────────────────────

@app.route("/event/<int:event_id>/invite", methods=["POST"])
@login_required
def invite_guest(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        abort(403)
    invitation = Invitation(event_id=event_id, guest_id=int(request.form["guest_id"]),
                            status="Not Sent", date_invited=None)
    db.session.add(invitation)
    db.session.commit()
    return redirect(url_for("event_detail", event_id=event_id))


@app.route("/invitation/<int:invitation_id>/send", methods=["POST"])
@login_required
def toggle_send_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
    if invitation.event.user_id != current_user.id:
        abort(403)
    if invitation.status == "Not Sent":
        invitation.status = "Pending"
        invitation.date_invited = date.today()
    else:
        invitation.status = "Not Sent"
        invitation.date_invited = None
        invitation.date_responded = None
    db.session.commit()
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(
            status=invitation.status,
            date_invited=invitation.date_invited.strftime("%b %d, %Y") if invitation.date_invited else "",
            date_invited_iso=invitation.date_invited.isoformat() if invitation.date_invited else "",
        )
    return redirect(url_for("event_detail", event_id=invitation.event_id))


@app.route("/invitation/<int:invitation_id>/update", methods=["POST"])
@login_required
def update_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
    if invitation.event.user_id != current_user.id:
        abort(403)
    new_status = request.form["status"]
    if new_status != invitation.status:
        invitation.status = new_status
        if new_status in ("Attending", "Declined"):
            invitation.date_responded = date.today()
        elif new_status == "Pending":
            invitation.date_responded = None
    db.session.commit()
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(
            status=invitation.status,
            date_responded=invitation.date_responded.strftime("%b %d, %Y") if invitation.date_responded else "",
            date_responded_iso=invitation.date_responded.isoformat() if invitation.date_responded else "",
        )
    return redirect(url_for("event_detail", event_id=invitation.event_id))


@app.route("/invitation/<int:invitation_id>/delete", methods=["POST"])
@login_required
def remove_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
    if invitation.event.user_id != current_user.id:
        abort(403)
    event_id = invitation.event_id
    db.session.delete(invitation)
    db.session.commit()
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(ok=True)
    return redirect(url_for("event_detail", event_id=event_id))


# ── API endpoints ─────────────────────────────────────────────────────────────

@app.route("/api/guests/search")
@login_required
def api_guest_search():
    q = request.args.get("q", "").strip().lower()
    event_id = request.args.get("event_id", type=int)
    if not q:
        return jsonify(guests=[])
    invited_ids = []
    if event_id:
        invited_ids = [inv.guest_id for inv in Invitation.query.filter_by(event_id=event_id).all()]
    query = Guest.query.filter_by(user_id=current_user.id)
    if invited_ids:
        query = query.filter(~Guest.id.in_(invited_ids))
    all_guests = query.order_by(Guest.first_name, Guest.last_name).all()
    results = []
    for g in all_guests:
        full = g.full_name.lower()
        if q in full or q in g.first_name.lower() or q in (g.last_name or "").lower():
            results.append({"id": g.id, "first_name": g.first_name, "last_name": g.last_name or "", "gender": g.gender})
    return jsonify(guests=results[:10])


@app.route("/event/<int:event_id>/quick-add", methods=["POST"])
@login_required
def quick_add_guest(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        abort(403)
    data = request.get_json()
    guest_id = data.get("guest_id")
    if guest_id:
        guest = Guest.query.get_or_404(guest_id)
    else:
        guest = Guest(user_id=current_user.id, first_name=data["first_name"],
                      last_name=data.get("last_name", ""),
                      gender=data.get("gender", "Male"), notes="")
        db.session.add(guest)
        db.session.flush()
    existing = Invitation.query.filter_by(event_id=event_id, guest_id=guest.id).first()
    if existing:
        return jsonify(error="Guest already invited"), 400
    sent = data.get("sent", False)
    status = data.get("status", "Not Sent") if sent else "Not Sent"
    channel = data.get("channel", "") if sent else ""
    notes = data.get("notes", "")
    date_invited = date.today() if sent else None
    date_responded = date.today() if status in ("Attending", "Declined") else None
    invitation = Invitation(event_id=event_id, guest_id=guest.id, status=status,
                            channel=channel, notes=notes,
                            date_invited=date_invited, date_responded=date_responded)
    db.session.add(invitation)
    db.session.commit()
    return jsonify(invitation_id=invitation.id, guest_id=guest.id,
                   first_name=guest.first_name, last_name=guest.last_name or "",
                   gender=guest.gender, status=invitation.status, channel=invitation.channel,
                   notes=invitation.notes or "",
                   date_invited=invitation.date_invited.strftime("%b %d, %Y") if invitation.date_invited else "",
                   date_invited_iso=invitation.date_invited.isoformat() if invitation.date_invited else "",
                   date_responded=invitation.date_responded.strftime("%b %d, %Y") if invitation.date_responded else "",
                   date_responded_iso=invitation.date_responded.isoformat() if invitation.date_responded else "")


@app.route("/api/guest/<int:guest_id>/gender", methods=["POST"])
@login_required
def update_guest_gender(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    if guest.user_id != current_user.id:
        abort(403)
    data = request.get_json()
    guest.gender = data.get("gender", guest.gender)
    db.session.commit()
    return jsonify(ok=True)


@app.route("/api/guest/<int:guest_id>/name", methods=["POST"])
@login_required
def update_guest_name(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    if guest.user_id != current_user.id:
        abort(403)
    data = request.get_json()
    guest.first_name = data.get("first_name", guest.first_name)
    guest.last_name = data.get("last_name", guest.last_name or "")
    db.session.commit()
    return jsonify(ok=True, full_name=guest.full_name)


@app.route("/api/invitation/<int:invitation_id>/field", methods=["POST"])
@login_required
def update_invitation_field(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
    if invitation.event.user_id != current_user.id:
        abort(403)
    data = request.get_json()
    field = data.get("field")
    value = data.get("value", "")
    if field == "channel":
        invitation.channel = value
    elif field == "notes":
        invitation.notes = value
    db.session.commit()
    return jsonify(ok=True)


@app.route("/api/event/<int:event_id>/notes", methods=["POST"])
@login_required
def update_event_notes(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        abort(403)
    data = request.get_json()
    event.notes = data.get("notes", "")
    db.session.commit()
    return jsonify(ok=True)


# ── Export helpers ─────────────────────────────────────────────────────────────

HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2C3E50", end_color="2C3E50", fill_type="solid")


def _styled_sheet(wb, title, headers):
    ws = wb.active
    ws.title = title
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
    return ws


def _to_download(wb, filename):
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, download_name=filename, as_attachment=True,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ── Export routes ─────────────────────────────────────────────────────────────

@app.route("/export/events")
@login_required
def export_events():
    wb = Workbook()
    ws = _styled_sheet(wb, "Events", ["Name", "Type", "Date", "Location", "Invited", "Attending", "Notes"])
    for e in Event.query.filter_by(user_id=current_user.id).order_by(Event.date).all():
        attending = sum(1 for inv in e.invitations if inv.status == "Attending")
        ws.append([e.name, e.event_type, e.date.strftime("%Y-%m-%d"), e.location or "",
                   len(e.invitations), attending, e.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "events.xlsx")


@app.route("/export/guests")
@login_required
def export_guests():
    wb = Workbook()
    ws = _styled_sheet(wb, "Guests", ["Last Name", "First Name", "Gender", "Notes"])
    for g in Guest.query.filter_by(user_id=current_user.id).order_by(Guest.last_name, Guest.first_name).all():
        ws.append([g.last_name or "", g.first_name, g.gender, g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "guests.xlsx")


@app.route("/export/event/<int:event_id>")
@login_required
def export_event_guests(event_id):
    event = Event.query.get_or_404(event_id)
    if event.user_id != current_user.id:
        abort(403)
    wb = Workbook()
    ws = _styled_sheet(wb, event.name[:31],
                       ["Last Name", "First Name", "Gender", "Sent", "Channel",
                        "Invited On", "Status", "Responded On", "Inv. Notes", "Guest Notes"])
    for inv in event.invitations:
        g = inv.guest
        sent = "Yes" if inv.status != "Not Sent" else "No"
        ws.append([g.last_name or "", g.first_name, g.gender, sent, inv.channel or "",
                   inv.date_invited.strftime("%Y-%m-%d") if inv.date_invited else "",
                   inv.status,
                   inv.date_responded.strftime("%Y-%m-%d") if inv.date_responded else "",
                   inv.notes or "", g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    safe_name = event.name.replace(" ", "_").lower()
    return _to_download(wb, f"{safe_name}_guests.xlsx")


# ── Seed data ─────────────────────────────────────────────────────────────────

def seed(user_id):
    """Populate a user's account with sample data."""
    events = [
        Event(user_id=user_id, name="Annual Gala Dinner", event_type="Dinner", location="Grand Hotel, New York", date=date(2026, 4, 12), notes="Black tie event"),
        Event(user_id=user_id, name="Team Building Retreat", event_type="Corporate", location="Lakehouse Resort, Vermont", date=date(2026, 5, 20), notes="Outdoor activities planned"),
        Event(user_id=user_id, name="Summer Garden Party", event_type="Party", location="Riverside Park, Boston", date=date(2026, 7, 4), notes="Casual dress code"),
        Event(user_id=user_id, name="Product Launch", event_type="Conference", location="Tech Hub, San Francisco", date=date(2026, 9, 15), notes="Press invited"),
    ]
    db.session.add_all(events)
    db.session.flush()

    guests = [
        Guest(user_id=user_id, first_name="Alice", last_name="Martin", gender="Female", notes="Vegetarian"),
        Guest(user_id=user_id, first_name="James", last_name="Wilson", gender="Male"),
        Guest(user_id=user_id, first_name="Sofia", last_name="Garcia", gender="Female", notes="Plus one confirmed"),
        Guest(user_id=user_id, first_name="Oliver", last_name="Brown", gender="Male"),
        Guest(user_id=user_id, first_name="Emma", last_name="Taylor", gender="Female"),
        Guest(user_id=user_id, first_name="William", last_name="Anderson", gender="Male", notes="Allergic to nuts"),
        Guest(user_id=user_id, first_name="Charlotte", last_name="Thomas", gender="Female"),
        Guest(user_id=user_id, first_name="Henry", last_name="Jackson", gender="Male"),
        Guest(user_id=user_id, first_name="Amelia", last_name="White", gender="Female", notes="Wheelchair accessible seating"),
        Guest(user_id=user_id, first_name="Lucas", last_name="Harris", gender="Male"),
        Guest(user_id=user_id, first_name="Isabella", last_name="Clark", gender="Female"),
        Guest(user_id=user_id, first_name="Benjamin", last_name="Lee", gender="Male", notes="VIP"),
    ]
    db.session.add_all(guests)
    db.session.flush()

    invitations = [
        # Gala Dinner — 8 guests
        Invitation(event_id=events[0].id, guest_id=guests[0].id, status="Attending", channel="Email", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 5), notes="Confirmed plus one"),
        Invitation(event_id=events[0].id, guest_id=guests[1].id, status="Attending", channel="WhatsApp", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 3)),
        Invitation(event_id=events[0].id, guest_id=guests[2].id, status="Pending", channel="Email", date_invited=date(2026, 2, 1)),
        Invitation(event_id=events[0].id, guest_id=guests[3].id, status="Declined", channel="Call", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 10), notes="Travel conflict"),
        Invitation(event_id=events[0].id, guest_id=guests[4].id, status="Attending", channel="Email", date_invited=date(2026, 2, 5), date_responded=date(2026, 2, 8)),
        Invitation(event_id=events[0].id, guest_id=guests[8].id, status="Attending", channel="Live", date_invited=date(2026, 2, 5), date_responded=date(2026, 2, 7)),
        Invitation(event_id=events[0].id, guest_id=guests[10].id, status="Not Sent"),
        Invitation(event_id=events[0].id, guest_id=guests[11].id, status="Attending", channel="Email", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 2), notes="VIP table"),
        # Team Building — 6 guests
        Invitation(event_id=events[1].id, guest_id=guests[1].id, status="Attending", channel="WhatsApp", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 5)),
        Invitation(event_id=events[1].id, guest_id=guests[3].id, status="Attending", channel="Email", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 4)),
        Invitation(event_id=events[1].id, guest_id=guests[5].id, status="Pending", channel="Call", date_invited=date(2026, 3, 1), notes="Call back tomorrow"),
        Invitation(event_id=events[1].id, guest_id=guests[7].id, status="Declined", channel="WhatsApp", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 8)),
        Invitation(event_id=events[1].id, guest_id=guests[9].id, status="Not Sent"),
        Invitation(event_id=events[1].id, guest_id=guests[11].id, status="Not Sent"),
        # Garden Party — 5 guests
        Invitation(event_id=events[2].id, guest_id=guests[0].id, status="Attending", channel="Live", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 3)),
        Invitation(event_id=events[2].id, guest_id=guests[2].id, status="Attending", channel="WhatsApp", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 2)),
        Invitation(event_id=events[2].id, guest_id=guests[4].id, status="Pending", channel="Email", date_invited=date(2026, 4, 5)),
        Invitation(event_id=events[2].id, guest_id=guests[6].id, status="Attending", channel="SMS", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 4)),
        Invitation(event_id=events[2].id, guest_id=guests[8].id, status="Declined", channel="Call", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 7), notes="Health reasons"),
        # Product Launch — 4 guests
        Invitation(event_id=events[3].id, guest_id=guests[5].id, status="Not Sent"),
        Invitation(event_id=events[3].id, guest_id=guests[7].id, status="Not Sent"),
        Invitation(event_id=events[3].id, guest_id=guests[9].id, status="Attending", channel="Email", date_invited=date(2026, 5, 1), date_responded=date(2026, 5, 3)),
        Invitation(event_id=events[3].id, guest_id=guests[11].id, status="Attending", channel="Email", date_invited=date(2026, 5, 1), date_responded=date(2026, 5, 2), notes="Keynote speaker"),
    ]
    db.session.add_all(invitations)
    db.session.commit()


# ── Run ───────────────────────────────────────────────────────────────────────

with app.app_context():
    db.create_all()
    # Migrate existing databases: add new columns if missing
    with db.engine.connect() as conn:
        for stmt in [
            "ALTER TABLE invitation ADD COLUMN channel VARCHAR(50) DEFAULT ''",
            "ALTER TABLE invitation ADD COLUMN notes TEXT DEFAULT ''",
            "ALTER TABLE guest ADD COLUMN is_me BOOLEAN DEFAULT 0",
            "ALTER TABLE event ADD COLUMN user_id INTEGER",
            "ALTER TABLE guest ADD COLUMN user_id INTEGER",
        ]:
            try:
                conn.execute(db.text(stmt))
            except Exception:
                pass
        conn.commit()
if __name__ == "__main__":
    app.run(debug=True)
