"""Tests for bulk operations: available guests, bulk add, bulk create+invite."""
from app import db, Event, Guest, Invitation
from datetime import date, datetime


class TestAvailableGuests:
    def test_available_guests(self, logged_in_client, sample_event, sample_guest, test_app):
        r = logged_in_client.get(f"/api/event/{sample_event}/available-guests")
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["guests"]) == 1
        assert data["guests"][0]["first_name"] == "Alice"
        assert data["guests"][0]["already_invited"] is False

    def test_available_guests_shows_already_invited(self, logged_in_client, sample_event,
                                                      sample_guest, sample_invitation, test_app):
        r = logged_in_client.get(f"/api/event/{sample_event}/available-guests")
        data = r.get_json()
        assert data["guests"][0]["already_invited"] is True

    def test_available_guests_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/api/event/{eid}/available-guests")
        assert r.status_code == 403

    def test_available_guests_nonexistent(self, logged_in_client):
        r = logged_in_client.get("/api/event/99999/available-guests")
        assert r.status_code == 404


class TestBulkAdd:
    def test_bulk_add_guests(self, logged_in_client, sample_event, test_app, user):
        with test_app.app_context():
            g1 = Guest(user_id=user, first_name="Bob", gender="Male", date_created=datetime.now())
            g2 = Guest(user_id=user, first_name="Carol", gender="Female", date_created=datetime.now())
            db.session.add_all([g1, g2])
            db.session.commit()
            ids = [g1.id, g2.id]
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": ids})
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["added"]) == 2

    def test_bulk_add_skips_already_invited(self, logged_in_client, sample_event,
                                             sample_guest, sample_invitation, test_app):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": [sample_guest]})
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_add_skips_other_users_guests(self, logged_in_client, sample_event,
                                                 test_app, user2):
        with test_app.app_context():
            other_guest = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(other_guest)
            db.session.commit()
            gid = other_guest.id
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": [gid]})
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_add_empty_list(self, logged_in_client, sample_event):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": []})
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_add_other_users_event(self, logged_in_client, test_app, user2, sample_guest):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.post(f"/api/event/{eid}/bulk-add",
            json={"guest_ids": [sample_guest]})
        assert r.status_code == 403

    def test_bulk_add_updates_date_edited(self, logged_in_client, sample_event, test_app, user):
        with test_app.app_context():
            g = Guest(user_id=user, first_name="New", gender="Male", date_created=datetime.now())
            db.session.add(g)
            db.session.commit()
            gid = g.id
        logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": [gid]})
        with test_app.app_context():
            e = Event.query.get(sample_event)
            assert e.date_edited is not None

    def test_bulk_add_no_update_if_none_added(self, logged_in_client, sample_event, test_app):
        logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": []})
        with test_app.app_context():
            e = Event.query.get(sample_event)
            assert e.date_edited is None


class TestBulkCreateAndInvite:
    def test_bulk_create_and_invite(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-create-and-invite",
            json={"guests": [
                {"first_name": "New", "last_name": "Guest", "gender": "Male", "notes": ""},
                {"first_name": "Another", "gender": "Female"}
            ]})
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["added"]) == 2
        assert data["added"][0]["status"] == "Not Sent"

    def test_bulk_create_skips_empty_names(self, logged_in_client, sample_event):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-create-and-invite",
            json={"guests": [
                {"first_name": "", "gender": "Male"},
                {"first_name": "Valid", "gender": "Male"}
            ]})
        data = r.get_json()
        assert len(data["added"]) == 1

    def test_bulk_create_other_users_event(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.post(f"/api/event/{eid}/bulk-create-and-invite",
            json={"guests": [{"first_name": "Hacked", "gender": "Male"}]})
        assert r.status_code == 403

    def test_bulk_create_special_characters(self, logged_in_client, sample_event, test_app):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-create-and-invite",
            json={"guests": [
                {"first_name": "José", "last_name": "García", "gender": "Male"},
                {"first_name": "小明", "last_name": "王", "gender": "Male"},
                {"first_name": "O'Brien", "gender": "Female"}
            ]})
        data = r.get_json()
        assert len(data["added"]) == 3
