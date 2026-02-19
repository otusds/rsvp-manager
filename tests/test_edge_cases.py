"""Edge case and stress tests."""
from app import db, Event, Guest, Invitation
from datetime import date, datetime
import concurrent.futures
import time


class TestEdgeCases:
    def test_event_with_no_invitations_renders(self, logged_in_client, sample_event):
        """Event detail with zero guests should render fine."""
        r = logged_in_client.get(f"/event/{sample_event}")
        assert r.status_code == 200

    def test_event_with_zero_target(self, logged_in_client, test_app, user):
        """Target attendees = 0 should be treated as None."""
        r = logged_in_client.post("/event/add", data={
            "name": "Zero Target", "event_type": "Dinner",
            "date": "2026-08-01", "target_attendees": "0"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="Zero Target").first()
            # 0 is falsy, so `or None` makes it None
            assert e.target_attendees is None

    def test_guest_with_no_last_name(self, logged_in_client, test_app, user):
        with test_app.app_context():
            g = Guest(user_id=user, first_name="Solo", gender="Male",
                      date_created=datetime.now())
            db.session.add(g)
            db.session.commit()
        r = logged_in_client.get("/guests")
        assert r.status_code == 200
        assert b"Solo" in r.data

    def test_very_long_notes(self, logged_in_client, sample_event, test_app):
        """10KB notes should work fine with db.Text."""
        long_notes = "N" * 10000
        r = logged_in_client.post(f"/api/event/{sample_event}/notes",
            json={"notes": long_notes})
        assert r.status_code == 200
        with test_app.app_context():
            e = Event.query.get(sample_event)
            assert len(e.notes) == 10000

    def test_unicode_in_event_name(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": "Fête de Noël 🎄", "event_type": "Party",
            "date": "2026-12-25"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="Fête de Noël 🎄").first()
            assert e is not None

    def test_html_injection_in_guest_name(self, logged_in_client, test_app, user):
        """Guest names with HTML should be stored raw (Jinja auto-escapes on render)."""
        with test_app.app_context():
            g = Guest(user_id=user, first_name="<b>Bold</b>",
                      last_name='"><script>alert(1)</script>',
                      gender="Male", date_created=datetime.now())
            db.session.add(g)
            db.session.commit()
        r = logged_in_client.get("/guests")
        assert r.status_code == 200
        # Jinja auto-escapes, so raw <script> should not appear
        assert b"<script>" not in r.data
        assert b"&lt;b&gt;" in r.data or b"&lt;script&gt;" in r.data

    def test_concurrent_status_updates(self, logged_in_client, sample_invitation, test_app):
        """Multiple rapid status updates should not crash."""
        # First send the invitation
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})

        for status in ["Attending", "Pending", "Declined", "Attending", "Pending"]:
            r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
                data={"status": status},
                headers={"X-Requested-With": "XMLHttpRequest"})
            assert r.status_code == 200

        with test_app.app_context():
            inv = Invitation.query.get(sample_invitation)
            assert inv.status == "Pending"

    def test_duplicate_invitation_prevention(self, logged_in_client, sample_event,
                                               sample_guest, sample_invitation, test_app):
        """Bulk add should skip already-invited guests."""
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": [sample_guest, sample_guest, sample_guest]})
        data = r.get_json()
        assert len(data["added"]) == 0
        with test_app.app_context():
            count = Invitation.query.filter_by(
                event_id=sample_event, guest_id=sample_guest
            ).count()
            assert count == 1

    def test_delete_event_with_many_invitations(self, logged_in_client, test_app, user):
        """Deleting an event with many invitations should cascade."""
        with test_app.app_context():
            e = Event(user_id=user, name="Big Event", event_type="Party",
                      date=date(2026, 8, 1), date_created=date.today())
            db.session.add(e)
            db.session.flush()
            for i in range(50):
                g = Guest(user_id=user, first_name=f"Guest{i}", gender="Male",
                          date_created=datetime.now())
                db.session.add(g)
                db.session.flush()
                inv = Invitation(event_id=e.id, guest_id=g.id, status="Not Sent")
                db.session.add(inv)
            db.session.commit()
            eid = e.id
        r = logged_in_client.post(f"/event/{eid}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Event.query.get(eid) is None
            assert Invitation.query.filter_by(event_id=eid).count() == 0

    def test_rapid_send_toggle(self, logged_in_client, sample_invitation):
        """Rapidly toggling send should not crash."""
        for _ in range(10):
            r = logged_in_client.post(f"/invitation/{sample_invitation}/send",
                headers={"X-Requested-With": "XMLHttpRequest"})
            assert r.status_code == 200

    def test_export_with_special_chars_in_event_name(self, logged_in_client, test_app, user):
        """Export filename should handle special characters."""
        with test_app.app_context():
            e = Event(user_id=user, name="Event / With: Special <Chars>",
                      event_type="Party", date=date(2026, 8, 1), date_created=date.today())
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/export/event/{eid}")
        assert r.status_code == 200

    def test_past_event_renders(self, logged_in_client, test_app, user):
        """Past events should render on the home page."""
        with test_app.app_context():
            e = Event(user_id=user, name="Past Party", event_type="Party",
                      date=date(2020, 1, 1), date_created=date.today())
            db.session.add(e)
            db.session.commit()
        r = logged_in_client.get("/")
        assert r.status_code == 200
        assert b"Past Party" in r.data

    def test_event_target_with_over_capacity(self, logged_in_client, test_app, user):
        """More attending than target should render without error."""
        with test_app.app_context():
            e = Event(user_id=user, name="Overcrowded", event_type="Party",
                      date=date(2026, 8, 1), date_created=date.today(),
                      target_attendees=2)
            db.session.add(e)
            db.session.flush()
            for i in range(5):
                g = Guest(user_id=user, first_name=f"G{i}", gender="Male",
                          date_created=datetime.now())
                db.session.add(g)
                db.session.flush()
                inv = Invitation(event_id=e.id, guest_id=g.id, status="Attending",
                                 date_invited=date.today(), date_responded=date.today())
                db.session.add(inv)
            db.session.commit()
            eid = e.id
        # Home page
        r = logged_in_client.get("/")
        assert r.status_code == 200
        # Event detail
        r = logged_in_client.get(f"/event/{eid}")
        assert r.status_code == 200
