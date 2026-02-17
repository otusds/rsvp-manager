from io import BytesIO
from datetime import date, datetime
from flask import Flask, render_template, request, redirect, url_for, send_file, jsonify
from flask_sqlalchemy import SQLAlchemy
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///rsvp.db"
db = SQLAlchemy(app)


# ── Models ────────────────────────────────────────────────────────────────────

EVENT_TYPES = ["Dinner", "Party", "Wedding", "Corporate", "Conference", "Ceremony", "Other"]


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    event_type = db.Column(db.String(50), nullable=False, default="Other")
    location = db.Column(db.String(200), nullable=False)
    date = db.Column(db.Date, nullable=False)
    notes = db.Column(db.Text, default="")
    invitations = db.relationship("Invitation", backref="event", cascade="all, delete-orphan")


class Guest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    gender = db.Column(db.String(10), nullable=False)
    notes = db.Column(db.Text, default="")
    invitations = db.relationship("Invitation", backref="guest", cascade="all, delete-orphan")


class Invitation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    guest_id = db.Column(db.Integer, db.ForeignKey("guest.id"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Not Sent")
    date_invited = db.Column(db.Date, nullable=True)
    date_responded = db.Column(db.Date, nullable=True)


# ── Event routes ──────────────────────────────────────────────────────────────

@app.route("/")
def home():
    events = Event.query.order_by(Event.date).all()
    return render_template("home.html", events=events, event_types=EVENT_TYPES)


@app.route("/event/add", methods=["GET", "POST"])
def add_event():
    if request.method == "POST":
        event = Event(
            name=request.form["name"],
            event_type=request.form["event_type"],
            location=request.form["location"],
            date=date.fromisoformat(request.form["date"]),
            notes=request.form.get("notes", ""),
        )
        db.session.add(event)
        db.session.commit()
        return redirect(url_for("home"))
    return render_template("edit_event.html", event=None, event_types=EVENT_TYPES)


@app.route("/event/<int:event_id>")
def event_detail(event_id):
    event = Event.query.get_or_404(event_id)
    invited_guest_ids = [inv.guest_id for inv in event.invitations]
    available_guests = Guest.query.filter(~Guest.id.in_(invited_guest_ids)).all() if invited_guest_ids else Guest.query.all()
    return render_template("event_detail.html", event=event, available_guests=available_guests)


@app.route("/event/<int:event_id>/edit", methods=["GET", "POST"])
def edit_event(event_id):
    event = Event.query.get_or_404(event_id)
    if request.method == "POST":
        event.name = request.form["name"]
        event.event_type = request.form["event_type"]
        event.location = request.form["location"]
        event.date = date.fromisoformat(request.form["date"])
        event.notes = request.form.get("notes", "")
        db.session.commit()
        return redirect(url_for("event_detail", event_id=event.id))
    return render_template("edit_event.html", event=event, event_types=EVENT_TYPES)


@app.route("/event/<int:event_id>/delete", methods=["POST"])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return redirect(url_for("home"))


# ── Guest routes ──────────────────────────────────────────────────────────────

@app.route("/guests")
def guests():
    all_guests = Guest.query.order_by(Guest.last_name, Guest.first_name).all()
    return render_template("guests.html", guests=all_guests)


@app.route("/guest/add", methods=["GET", "POST"])
def add_guest():
    if request.method == "POST":
        guest = Guest(
            first_name=request.form["first_name"],
            last_name=request.form["last_name"],
            gender=request.form["gender"],
            notes=request.form.get("notes", ""),
        )
        db.session.add(guest)
        db.session.commit()
        return redirect(url_for("guests"))
    return render_template("edit_guest.html", guest=None)


@app.route("/guest/<int:guest_id>/edit", methods=["GET", "POST"])
def edit_guest(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    if request.method == "POST":
        guest.first_name = request.form["first_name"]
        guest.last_name = request.form["last_name"]
        guest.gender = request.form["gender"]
        guest.notes = request.form.get("notes", "")
        db.session.commit()
        return redirect(url_for("guests"))
    return render_template("edit_guest.html", guest=guest)


@app.route("/guest/<int:guest_id>/delete", methods=["POST"])
def delete_guest(guest_id):
    guest = Guest.query.get_or_404(guest_id)
    db.session.delete(guest)
    db.session.commit()
    return redirect(url_for("guests"))


# ── Invitation routes ─────────────────────────────────────────────────────────

@app.route("/event/<int:event_id>/invite", methods=["POST"])
def invite_guest(event_id):
    invitation = Invitation(
        event_id=event_id,
        guest_id=int(request.form["guest_id"]),
        status="Not Sent",
        date_invited=None,
    )
    db.session.add(invitation)
    db.session.commit()
    return redirect(url_for("event_detail", event_id=event_id))


@app.route("/invitation/<int:invitation_id>/send", methods=["POST"])
def toggle_send_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
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
def update_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
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
def remove_invitation(invitation_id):
    invitation = Invitation.query.get_or_404(invitation_id)
    event_id = invitation.event_id
    db.session.delete(invitation)
    db.session.commit()
    return redirect(url_for("event_detail", event_id=event_id))


# ── API endpoints ─────────────────────────────────────────────────────────

@app.route("/api/guests/search")
def api_guest_search():
    q = request.args.get("q", "").strip().lower()
    event_id = request.args.get("event_id", type=int)
    if not q:
        return jsonify(guests=[])
    invited_ids = []
    if event_id:
        invited_ids = [inv.guest_id for inv in Invitation.query.filter_by(event_id=event_id).all()]
    query = Guest.query
    if invited_ids:
        query = query.filter(~Guest.id.in_(invited_ids))
    all_guests = query.order_by(Guest.first_name, Guest.last_name).all()
    results = []
    for g in all_guests:
        full_name = f"{g.first_name} {g.last_name}".lower()
        if q in full_name or q in g.first_name.lower() or q in g.last_name.lower():
            results.append({"id": g.id, "first_name": g.first_name, "last_name": g.last_name, "gender": g.gender})
    return jsonify(guests=results[:10])


@app.route("/event/<int:event_id>/quick-add", methods=["POST"])
def quick_add_guest(event_id):
    Event.query.get_or_404(event_id)
    data = request.get_json()
    guest_id = data.get("guest_id")
    if guest_id:
        guest = Guest.query.get_or_404(guest_id)
    else:
        guest = Guest(first_name=data["first_name"], last_name=data["last_name"],
                      gender=data.get("gender", "Male"), notes="")
        db.session.add(guest)
        db.session.flush()
    existing = Invitation.query.filter_by(event_id=event_id, guest_id=guest.id).first()
    if existing:
        return jsonify(error="Guest already invited"), 400
    invitation = Invitation(event_id=event_id, guest_id=guest.id, status="Not Sent")
    db.session.add(invitation)
    db.session.commit()
    return jsonify(invitation_id=invitation.id, guest_id=guest.id,
                   first_name=guest.first_name, last_name=guest.last_name, gender=guest.gender)


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
def export_events():
    wb = Workbook()
    ws = _styled_sheet(wb, "Events", ["Name", "Type", "Date", "Location", "Invited", "Attending", "Notes"])
    for e in Event.query.order_by(Event.date).all():
        attending = sum(1 for inv in e.invitations if inv.status == "Attending")
        ws.append([e.name, e.event_type, e.date.strftime("%Y-%m-%d"), e.location,
                   len(e.invitations), attending, e.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "events.xlsx")


@app.route("/export/guests")
def export_guests():
    wb = Workbook()
    ws = _styled_sheet(wb, "Guests", ["Last Name", "First Name", "Gender", "Notes"])
    for g in Guest.query.order_by(Guest.last_name, Guest.first_name).all():
        ws.append([g.last_name, g.first_name, g.gender, g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "guests.xlsx")


@app.route("/export/event/<int:event_id>")
def export_event_guests(event_id):
    event = Event.query.get_or_404(event_id)
    wb = Workbook()
    ws = _styled_sheet(wb, event.name[:31],
                       ["Last Name", "First Name", "Gender", "Invitation Sent", "Invited On",
                        "Response Status", "Responded On", "Notes"])
    for inv in event.invitations:
        g = inv.guest
        sent = "Yes" if inv.status != "Not Sent" else "No"
        ws.append([g.last_name, g.first_name, g.gender, sent,
                   inv.date_invited.strftime("%Y-%m-%d") if inv.date_invited else "",
                   inv.status,
                   inv.date_responded.strftime("%Y-%m-%d") if inv.date_responded else "",
                   g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    safe_name = event.name.replace(" ", "_").lower()
    return _to_download(wb, f"{safe_name}_guests.xlsx")


# ── Seed data ─────────────────────────────────────────────────────────────────

def seed():
    if Event.query.first():
        return

    events = [
        Event(name="Annual Gala Dinner", event_type="Dinner", location="Grand Hotel, New York", date=date(2026, 4, 12), notes="Black tie event"),
        Event(name="Team Building Retreat", event_type="Corporate", location="Lakehouse Resort, Vermont", date=date(2026, 5, 20), notes="Outdoor activities planned"),
        Event(name="Summer Garden Party", event_type="Party", location="Riverside Park, Boston", date=date(2026, 7, 4), notes="Casual dress code"),
        Event(name="Product Launch", event_type="Conference", location="Tech Hub, San Francisco", date=date(2026, 9, 15), notes="Press invited"),
    ]
    db.session.add_all(events)
    db.session.flush()

    guests = [
        Guest(first_name="Alice", last_name="Martin", gender="Female", notes="Vegetarian"),
        Guest(first_name="James", last_name="Wilson", gender="Male"),
        Guest(first_name="Sofia", last_name="Garcia", gender="Female", notes="Plus one confirmed"),
        Guest(first_name="Oliver", last_name="Brown", gender="Male"),
        Guest(first_name="Emma", last_name="Taylor", gender="Female"),
        Guest(first_name="William", last_name="Anderson", gender="Male", notes="Allergic to nuts"),
        Guest(first_name="Charlotte", last_name="Thomas", gender="Female"),
        Guest(first_name="Henry", last_name="Jackson", gender="Male"),
        Guest(first_name="Amelia", last_name="White", gender="Female", notes="Wheelchair accessible seating"),
        Guest(first_name="Lucas", last_name="Harris", gender="Male"),
        Guest(first_name="Isabella", last_name="Clark", gender="Female"),
        Guest(first_name="Benjamin", last_name="Lee", gender="Male", notes="VIP"),
    ]
    db.session.add_all(guests)
    db.session.flush()

    invitations = [
        # Gala Dinner — 8 guests (mix of sent and not sent)
        Invitation(event_id=events[0].id, guest_id=guests[0].id, status="Attending", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 5)),
        Invitation(event_id=events[0].id, guest_id=guests[1].id, status="Attending", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 3)),
        Invitation(event_id=events[0].id, guest_id=guests[2].id, status="Pending", date_invited=date(2026, 2, 1)),
        Invitation(event_id=events[0].id, guest_id=guests[3].id, status="Declined", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 10)),
        Invitation(event_id=events[0].id, guest_id=guests[4].id, status="Attending", date_invited=date(2026, 2, 5), date_responded=date(2026, 2, 8)),
        Invitation(event_id=events[0].id, guest_id=guests[8].id, status="Attending", date_invited=date(2026, 2, 5), date_responded=date(2026, 2, 7)),
        Invitation(event_id=events[0].id, guest_id=guests[10].id, status="Not Sent"),
        Invitation(event_id=events[0].id, guest_id=guests[11].id, status="Attending", date_invited=date(2026, 2, 1), date_responded=date(2026, 2, 2)),
        # Team Building — 6 guests
        Invitation(event_id=events[1].id, guest_id=guests[1].id, status="Attending", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 5)),
        Invitation(event_id=events[1].id, guest_id=guests[3].id, status="Attending", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 4)),
        Invitation(event_id=events[1].id, guest_id=guests[5].id, status="Pending", date_invited=date(2026, 3, 1)),
        Invitation(event_id=events[1].id, guest_id=guests[7].id, status="Declined", date_invited=date(2026, 3, 1), date_responded=date(2026, 3, 8)),
        Invitation(event_id=events[1].id, guest_id=guests[9].id, status="Not Sent"),
        Invitation(event_id=events[1].id, guest_id=guests[11].id, status="Not Sent"),
        # Garden Party — 5 guests
        Invitation(event_id=events[2].id, guest_id=guests[0].id, status="Attending", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 3)),
        Invitation(event_id=events[2].id, guest_id=guests[2].id, status="Attending", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 2)),
        Invitation(event_id=events[2].id, guest_id=guests[4].id, status="Pending", date_invited=date(2026, 4, 5)),
        Invitation(event_id=events[2].id, guest_id=guests[6].id, status="Attending", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 4)),
        Invitation(event_id=events[2].id, guest_id=guests[8].id, status="Declined", date_invited=date(2026, 4, 1), date_responded=date(2026, 4, 7)),
        # Product Launch — 4 guests (mostly not sent yet)
        Invitation(event_id=events[3].id, guest_id=guests[5].id, status="Not Sent"),
        Invitation(event_id=events[3].id, guest_id=guests[7].id, status="Not Sent"),
        Invitation(event_id=events[3].id, guest_id=guests[9].id, status="Attending", date_invited=date(2026, 5, 1), date_responded=date(2026, 5, 3)),
        Invitation(event_id=events[3].id, guest_id=guests[11].id, status="Attending", date_invited=date(2026, 5, 1), date_responded=date(2026, 5, 2)),
    ]
    db.session.add_all(invitations)
    db.session.commit()


# ── Run ───────────────────────────────────────────────────────────────────────

with app.app_context():
    db.create_all()
    seed()

if __name__ == "__main__":
    app.run(debug=True)
