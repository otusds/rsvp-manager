"""Tests for export routes and event notes API."""
from app import db, Event, Guest, Invitation
from datetime import date, datetime


class TestExportEvents:
    def test_export_events(self, logged_in_client, sample_event):
        r = logged_in_client.get("/export/events")
        assert r.status_code == 200
        assert "spreadsheetml" in r.content_type

    def test_export_events_empty(self, logged_in_client):
        r = logged_in_client.get("/export/events")
        assert r.status_code == 200

    def test_export_events_requires_login(self, client):
        r = client.get("/export/events")
        assert r.status_code == 302


class TestExportGuests:
    def test_export_guests(self, logged_in_client, sample_guest):
        r = logged_in_client.get("/export/guests")
        assert r.status_code == 200
        assert "spreadsheetml" in r.content_type

    def test_export_guests_empty(self, logged_in_client):
        r = logged_in_client.get("/export/guests")
        assert r.status_code == 200


class TestExportEventGuests:
    def test_export_event_guests(self, logged_in_client, sample_event, sample_invitation):
        r = logged_in_client.get(f"/export/event/{sample_event}")
        assert r.status_code == 200
        assert "spreadsheetml" in r.content_type

    def test_export_event_guests_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/export/event/{eid}")
        assert r.status_code == 403

    def test_export_nonexistent_event(self, logged_in_client):
        r = logged_in_client.get("/export/event/99999")
        assert r.status_code == 404


class TestEventNotesAPI:
    def test_update_event_notes(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/api/event/{sample_event}/notes",
            json={"notes": "New notes"})
        assert r.status_code == 200
        with test_app.app_context():
            e = db.session.get(Event,sample_event)
            assert e.notes == "New notes"
            assert e.date_edited is not None

    def test_update_event_notes_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.post(f"/api/event/{eid}/notes",
            json={"notes": "hacked"})
        assert r.status_code == 403

    def test_update_event_notes_empty(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/api/event/{sample_event}/notes",
            json={"notes": ""})
        assert r.status_code == 200
        with test_app.app_context():
            e = db.session.get(Event,sample_event)
            assert e.notes == ""


class TestSettings:
    def test_settings_page(self, logged_in_client):
        r = logged_in_client.get("/settings")
        assert r.status_code == 200
        assert b"Settings" in r.data

    def test_settings_requires_login(self, client):
        r = client.get("/settings")
        assert r.status_code == 302

    def test_load_sample_data(self, logged_in_client, test_app):
        r = logged_in_client.post("/settings/load-sample-data", follow_redirects=True)
        assert r.status_code == 200
        with test_app.app_context():
            assert Event.query.count() > 0
            assert Guest.query.count() > 0

    def test_reset_sample_data(self, logged_in_client, sample_event, sample_guest, test_app):
        r = logged_in_client.post("/settings/reset-sample-data", follow_redirects=True)
        assert r.status_code == 200
        with test_app.app_context():
            # Should have seed data, not sample_event
            events = Event.query.all()
            assert len(events) == 8  # seed creates 8 events
            assert not any(e.name == "Test Event" for e in events)
