"""Tests for guest routes: list, add, edit, delete, inline APIs."""
from app import db, Guest
from datetime import datetime


class TestGuestList:
    def test_guests_requires_login(self, client):
        r = client.get("/guests")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]

    def test_guests_empty(self, logged_in_client):
        r = logged_in_client.get("/guests")
        assert r.status_code == 200
        assert b"No guests yet" in r.data

    def test_guests_with_data(self, logged_in_client, sample_guest):
        r = logged_in_client.get("/guests")
        assert r.status_code == 200
        assert b"Alice" in r.data

    def test_guests_only_own(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_guest = Guest(
                user_id=user2, first_name="Other", gender="Male",
                date_created=datetime.now()
            )
            db.session.add(other_guest)
            db.session.commit()
        r = logged_in_client.get("/guests")
        assert b"Other" not in r.data


class TestDeleteGuest:
    def test_delete_guest(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/guest/{sample_guest}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Guest.query.get(sample_guest) is None

    def test_delete_guest_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            other_guest = Guest(
                user_id=user2, first_name="Other", gender="Male"
            )
            db.session.add(other_guest)
            db.session.commit()
            gid = other_guest.id
        r = logged_in_client.post(f"/guest/{gid}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Guest.query.get(gid) is not None  # not deleted

    def test_delete_cascades_invitations(self, logged_in_client, sample_invitation, sample_guest, test_app):
        from app import Invitation
        r = logged_in_client.post(f"/guest/{sample_guest}/delete")
        assert r.status_code == 302
        with test_app.app_context():
            assert Invitation.query.get(sample_invitation) is None

    def test_delete_nonexistent(self, logged_in_client):
        r = logged_in_client.post("/guest/99999/delete")
        assert r.status_code == 404


class TestGuestNameAPI:
    def test_update_name(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/api/guest/{sample_guest}/name",
            json={"first_name": "Bob", "last_name": "Jones"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True
        assert data["full_name"] == "Bob Jones"
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.first_name == "Bob"
            assert g.date_edited is not None

    def test_update_name_empty_first(self, logged_in_client, sample_guest, test_app):
        # Empty first_name - the API accepts it (no validation)
        r = logged_in_client.post(f"/api/guest/{sample_guest}/name",
            json={"first_name": "", "last_name": "Jones"})
        assert r.status_code == 200

    def test_update_name_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/api/guest/{gid}/name",
            json={"first_name": "Hacked"})
        assert r.status_code == 403

    def test_update_name_special_chars(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/api/guest/{sample_guest}/name",
            json={"first_name": "O'Brien", "last_name": "Müller-Schmidt"})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.first_name == "O'Brien"


class TestGuestGenderAPI:
    def test_update_gender(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/api/guest/{sample_guest}/gender",
            json={"gender": "Male"})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.gender == "Male"

    def test_update_gender_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/api/guest/{gid}/gender",
            json={"gender": "Female"})
        assert r.status_code == 403

    def test_update_gender_arbitrary_value(self, logged_in_client, sample_guest, test_app):
        # No validation — any string is accepted
        r = logged_in_client.post(f"/api/guest/{sample_guest}/gender",
            json={"gender": "InvalidGender"})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.gender == "InvalidGender"


class TestGuestNotesAPI:
    def test_update_notes(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/api/guest/{sample_guest}/notes",
            json={"notes": "Updated notes"})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.notes == "Updated notes"

    def test_update_notes_very_long(self, logged_in_client, sample_guest, test_app):
        long_notes = "A" * 10000
        r = logged_in_client.post(f"/api/guest/{sample_guest}/notes",
            json={"notes": long_notes})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert len(g.notes) == 10000


class TestGuestIsMeAPI:
    def test_set_is_me(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/api/guest/{sample_guest}/is-me",
            json={"is_me": True})
        assert r.status_code == 200
        data = r.get_json()
        assert data["is_me"] is True
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.is_me is True

    def test_unset_is_me(self, logged_in_client, sample_guest, test_app):
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            g.is_me = True
            db.session.commit()
        r = logged_in_client.post(f"/api/guest/{sample_guest}/is-me",
            json={"is_me": False})
        assert r.status_code == 200
        with test_app.app_context():
            g = Guest.query.get(sample_guest)
            assert g.is_me is False

    def test_is_me_clears_previous(self, logged_in_client, test_app, user):
        with test_app.app_context():
            g1 = Guest(user_id=user, first_name="First", gender="Male", is_me=True)
            g2 = Guest(user_id=user, first_name="Second", gender="Male")
            db.session.add_all([g1, g2])
            db.session.commit()
            g1_id, g2_id = g1.id, g2.id
        r = logged_in_client.post(f"/api/guest/{g2_id}/is-me",
            json={"is_me": True})
        assert r.status_code == 200
        with test_app.app_context():
            assert Guest.query.get(g1_id).is_me is False
            assert Guest.query.get(g2_id).is_me is True


class TestBulkCreateGuests:
    def test_bulk_create(self, logged_in_client, test_app):
        r = logged_in_client.post("/api/guests/bulk-create", json={
            "guests": [
                {"first_name": "Bob", "last_name": "Smith", "gender": "Male", "notes": ""},
                {"first_name": "Carol", "gender": "Female"}
            ]
        })
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["added"]) == 2

    def test_bulk_create_skips_empty_names(self, logged_in_client):
        r = logged_in_client.post("/api/guests/bulk-create", json={
            "guests": [
                {"first_name": "", "gender": "Male"},
                {"first_name": "  ", "gender": "Male"},
                {"first_name": "Valid", "gender": "Male"}
            ]
        })
        data = r.get_json()
        # Only "Valid" should be created; "  " strips to "" and is also skipped
        # Wait — "  ".strip() == "" so it's skipped too
        assert len(data["added"]) == 1

    def test_bulk_create_empty_list(self, logged_in_client):
        r = logged_in_client.post("/api/guests/bulk-create", json={"guests": []})
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_create_no_json(self, logged_in_client):
        r = logged_in_client.post("/api/guests/bulk-create",
            data="not json", content_type="text/plain")
        assert r.status_code in (400, 415, 500)
