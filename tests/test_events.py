"""Tests for event routes: home, add, edit, delete, detail."""
from app import db, Event, Guest
from datetime import date


class TestHome:
    def test_home_requires_login(self, client):
        r = client.get("/")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]

    def test_home_empty(self, logged_in_client):
        r = logged_in_client.get("/")
        assert r.status_code == 200
        assert b"No events yet" in r.data

    def test_home_with_events(self, logged_in_client, sample_event):
        r = logged_in_client.get("/")
        assert r.status_code == 200
        assert b"Test Event" in r.data

    def test_home_only_shows_own_events(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_event = Event(
                user_id=user2, name="Other User Event", event_type="Party",
                date=date(2026, 7, 1), date_created=date.today()
            )
            db.session.add(other_event)
            db.session.commit()
        r = logged_in_client.get("/")
        assert b"Other User Event" not in r.data


class TestAddEvent:
    def test_add_event_post(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": "New Event", "event_type": "Party",
            "location": "Test Loc", "date": "2026-08-01",
            "notes": "Some notes"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="New Event").first()
            assert e is not None
            assert e.event_type == "Party"
            assert e.location == "Test Loc"

    def test_add_event_with_target(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": "Target Event", "event_type": "Dinner",
            "date": "2026-08-01", "target_attendees": "25"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="Target Event").first()
            assert e.target_attendees == 25

    def test_add_event_with_include_me(self, logged_in_client, test_app, user):
        with test_app.app_context():
            me = Guest(user_id=user, first_name="Me", gender="Male", is_me=True)
            db.session.add(me)
            db.session.commit()
        r = logged_in_client.post("/event/add", data={
            "name": "Me Event", "event_type": "Dinner",
            "date": "2026-08-01", "include_me": "on"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="Me Event").first()
            assert len(e.invitations) == 1
            assert e.invitations[0].status == "Attending"

    def test_add_event_missing_name(self, logged_in_client):
        r = logged_in_client.post("/event/add", data={
            "event_type": "Party", "date": "2026-08-01"
        })
        assert r.status_code == 400

    def test_add_event_missing_date(self, logged_in_client):
        r = logged_in_client.post("/event/add", data={
            "name": "No Date", "event_type": "Party"
        })
        assert r.status_code == 400

    def test_add_event_invalid_date(self, logged_in_client):
        r = logged_in_client.post("/event/add", data={
            "name": "Bad Date", "event_type": "Party", "date": "not-a-date"
        })
        assert r.status_code == 500 or r.status_code == 400

    def test_add_event_empty_target(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": "No Target", "event_type": "Dinner",
            "date": "2026-08-01", "target_attendees": ""
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="No Target").first()
            assert e.target_attendees is None

    def test_add_event_very_long_name(self, logged_in_client, test_app):
        long_name = "A" * 500
        r = logged_in_client.post("/event/add", data={
            "name": long_name, "event_type": "Dinner", "date": "2026-08-01"
        })
        # Should succeed (db.String(200) may truncate silently or error)
        assert r.status_code in (302, 500)

    def test_add_event_special_chars(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": '<script>alert("xss")</script>', "event_type": "Dinner",
            "date": "2026-08-01"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name='<script>alert("xss")</script>').first()
            assert e is not None

    def test_add_event_requires_login(self, client):
        r = client.post("/event/add", data={
            "name": "Unauth Event", "event_type": "Party", "date": "2026-08-01"
        })
        assert r.status_code == 302
        assert "login" in r.headers["Location"]


class TestEditEvent:
    def test_edit_event(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/event/{sample_event}/edit", data={
            "name": "Updated Event", "event_type": "Wedding",
            "location": "New Loc", "date": "2026-09-01",
            "notes": "Updated notes", "target_attendees": "50"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.get(sample_event)
            assert e.name == "Updated Event"
            assert e.event_type == "Wedding"
            assert e.target_attendees == 50
            assert e.date_edited is not None

    def test_edit_event_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_event = Event(
                user_id=user2, name="Other Event", event_type="Party",
                date=date(2026, 7, 1), date_created=date.today()
            )
            db.session.add(other_event)
            db.session.commit()
            eid = other_event.id
        r = logged_in_client.post(f"/event/{eid}/edit", data={
            "name": "Hacked", "event_type": "Party", "date": "2026-07-01"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.get(eid)
            assert e.name == "Other Event"  # unchanged

    def test_edit_nonexistent_event(self, logged_in_client):
        r = logged_in_client.post("/event/99999/edit", data={
            "name": "Ghost", "event_type": "Party", "date": "2026-07-01"
        })
        assert r.status_code == 404

    def test_edit_event_invalid_date(self, logged_in_client, sample_event):
        r = logged_in_client.post(f"/event/{sample_event}/edit", data={
            "name": "Bad Date", "event_type": "Party", "date": "invalid"
        })
        assert r.status_code in (400, 500)

    def test_edit_event_clear_target(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/event/{sample_event}/edit", data={
            "name": "Test Event", "event_type": "Dinner",
            "date": "2026-06-15", "target_attendees": ""
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.get(sample_event)
            assert e.target_attendees is None


class TestDeleteEvent:
    def test_delete_event(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/event/{sample_event}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Event.query.get(sample_event) is None

    def test_delete_event_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_event = Event(
                user_id=user2, name="Other Event", event_type="Party",
                date=date(2026, 7, 1)
            )
            db.session.add(other_event)
            db.session.commit()
            eid = other_event.id
        r = logged_in_client.post(f"/event/{eid}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Event.query.get(eid) is not None  # not deleted

    def test_delete_cascades_invitations(self, logged_in_client, sample_invitation, sample_event, test_app):
        r = logged_in_client.post(f"/event/{sample_event}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            from app import Invitation
            assert Invitation.query.get(sample_invitation) is None

    def test_delete_nonexistent(self, logged_in_client):
        r = logged_in_client.post("/event/99999/delete")
        assert r.status_code == 404


class TestEventDetail:
    def test_event_detail(self, logged_in_client, sample_event):
        r = logged_in_client.get(f"/event/{sample_event}")
        assert r.status_code == 200
        assert b"Test Event" in r.data

    def test_event_detail_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_event = Event(
                user_id=user2, name="Other Event", event_type="Party",
                date=date(2026, 7, 1)
            )
            db.session.add(other_event)
            db.session.commit()
            eid = other_event.id
        r = logged_in_client.get(f"/event/{eid}")
        assert r.status_code == 302  # redirects to home

    def test_event_detail_nonexistent(self, logged_in_client):
        r = logged_in_client.get("/event/99999")
        assert r.status_code == 404
