"""Tests for invitation routes: toggle send, update status, remove, field update."""
from app import db, Invitation, Event, Guest
from datetime import date, datetime
import json


class TestToggleSend:
    def test_send_invitation(self, logged_in_client, sample_invitation, test_app):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "Pending"
        assert data["date_invited"] != ""

    def test_unsend_invitation(self, logged_in_client, sample_invitation, test_app):
        # First send it
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        # Then unsend
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        data = r.get_json()
        assert data["status"] == "Not Sent"
        assert data["date_invited"] == ""

    def test_send_updates_event_date_edited(self, logged_in_client, sample_invitation, test_app, sample_event):
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        with test_app.app_context():
            e = db.session.get(Event,sample_event)
            assert e.date_edited is not None

    def test_send_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            g = Guest(user_id=user2, first_name="OtherG", gender="Male")
            db.session.add_all([e, g])
            db.session.flush()
            inv = Invitation(event_id=e.id, guest_id=g.id, status="Not Sent")
            db.session.add(inv)
            db.session.commit()
            inv_id = inv.id
        r = logged_in_client.post(f"/invitation/{inv_id}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 403

    def test_send_nonexistent(self, logged_in_client):
        r = logged_in_client.post("/invitation/99999/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 404

    def test_send_non_ajax_redirect(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send")
        assert r.status_code == 302


class TestUpdateStatus:
    def test_update_to_attending(self, logged_in_client, sample_invitation, test_app):
        # First send it
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        # Then update status
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Attending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "Attending"
        assert data["date_responded"] != ""

    def test_update_to_declined(self, logged_in_client, sample_invitation, test_app):
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Declined"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        data = r.get_json()
        assert data["status"] == "Declined"
        assert data["date_responded"] != ""

    def test_update_back_to_pending_clears_date(self, logged_in_client, sample_invitation, test_app):
        logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Attending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Pending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        data = r.get_json()
        assert data["date_responded"] == ""

    def test_update_missing_status(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={},
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 400

    def test_update_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            g = Guest(user_id=user2, first_name="OtherG", gender="Male")
            db.session.add_all([e, g])
            db.session.flush()
            inv = Invitation(event_id=e.id, guest_id=g.id, status="Pending",
                             date_invited=date.today())
            db.session.add(inv)
            db.session.commit()
            inv_id = inv.id
        r = logged_in_client.post(f"/invitation/{inv_id}/update",
            data={"status": "Attending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 403


class TestRemoveInvitation:
    def test_remove(self, logged_in_client, sample_invitation, test_app):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/delete",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True
        with test_app.app_context():
            assert db.session.get(Invitation,sample_invitation) is None

    def test_remove_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            g = Guest(user_id=user2, first_name="OtherG", gender="Male")
            db.session.add_all([e, g])
            db.session.flush()
            inv = Invitation(event_id=e.id, guest_id=g.id, status="Not Sent")
            db.session.add(inv)
            db.session.commit()
            inv_id = inv.id
        r = logged_in_client.post(f"/invitation/{inv_id}/delete",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 403

    def test_remove_nonexistent(self, logged_in_client):
        r = logged_in_client.post("/invitation/99999/delete",
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 404

    def test_remove_updates_event_date_edited(self, logged_in_client, sample_invitation, test_app, sample_event):
        logged_in_client.post(f"/invitation/{sample_invitation}/delete",
            headers={"X-Requested-With": "XMLHttpRequest"})
        with test_app.app_context():
            e = db.session.get(Event,sample_event)
            assert e.date_edited is not None


class TestInvitationFieldAPI:
    def test_update_channel(self, logged_in_client, sample_invitation, test_app):
        r = logged_in_client.post(f"/api/invitation/{sample_invitation}/field",
            json={"field": "channel", "value": "WhatsApp"})
        assert r.status_code == 200
        with test_app.app_context():
            inv = db.session.get(Invitation,sample_invitation)
            assert inv.channel == "WhatsApp"

    def test_update_notes(self, logged_in_client, sample_invitation, test_app):
        r = logged_in_client.post(f"/api/invitation/{sample_invitation}/field",
            json={"field": "notes", "value": "Updated note"})
        assert r.status_code == 200
        with test_app.app_context():
            inv = db.session.get(Invitation,sample_invitation)
            assert inv.notes == "Updated note"

    def test_update_invalid_field(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/api/invitation/{sample_invitation}/field",
            json={"field": "status", "value": "Attending"})
        assert r.status_code == 400

    def test_update_field_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Other", event_type="Party", date=date(2026, 7, 1))
            g = Guest(user_id=user2, first_name="OtherG", gender="Male")
            db.session.add_all([e, g])
            db.session.flush()
            inv = Invitation(event_id=e.id, guest_id=g.id, status="Not Sent")
            db.session.add(inv)
            db.session.commit()
            inv_id = inv.id
        r = logged_in_client.post(f"/api/invitation/{inv_id}/field",
            json={"field": "notes", "value": "hacked"})
        assert r.status_code == 403
