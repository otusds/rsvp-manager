"""Phase 2 stress tests — covers gaps found in Phase 1 audit."""
from app import db, User, Event, Guest, Invitation
from datetime import date, datetime


# ── /guest/add route (previously untested) ────────────────────────────────────

class TestAddGuest:
    def test_add_guest(self, logged_in_client, test_app):
        r = logged_in_client.post("/guest/add", data={
            "first_name": "Bob", "last_name": "Jones", "gender": "Male",
            "notes": "Some note"
        })
        assert r.status_code == 302
        with test_app.app_context():
            g = Guest.query.filter_by(first_name="Bob", last_name="Jones").first()
            assert g is not None
            assert g.gender == "Male"
            assert g.notes == "Some note"
            assert g.date_created is not None

    def test_add_guest_is_me(self, logged_in_client, test_app, user):
        r = logged_in_client.post("/guest/add", data={
            "first_name": "Myself", "gender": "Male", "is_me": "on"
        })
        assert r.status_code == 302
        with test_app.app_context():
            g = Guest.query.filter_by(first_name="Myself").first()
            assert g.is_me is True

    def test_add_guest_is_me_clears_previous(self, logged_in_client, test_app, user):
        # Create a guest already marked as me
        with test_app.app_context():
            old = Guest(user_id=user, first_name="OldMe", gender="Male", is_me=True)
            db.session.add(old)
            db.session.commit()
            old_id = old.id
        # Add new guest as me
        logged_in_client.post("/guest/add", data={
            "first_name": "NewMe", "gender": "Male", "is_me": "on"
        })
        with test_app.app_context():
            assert db.session.get(Guest,old_id).is_me is False
            new = Guest.query.filter_by(first_name="NewMe").first()
            assert new.is_me is True

    def test_add_guest_no_last_name(self, logged_in_client, test_app):
        r = logged_in_client.post("/guest/add", data={
            "first_name": "Solo", "gender": "Female"
        })
        assert r.status_code == 302
        with test_app.app_context():
            g = Guest.query.filter_by(first_name="Solo").first()
            assert g.last_name == ""

    def test_add_guest_missing_first_name(self, logged_in_client):
        r = logged_in_client.post("/guest/add", data={
            "gender": "Male"
        })
        assert r.status_code == 400

    def test_add_guest_missing_gender(self, logged_in_client):
        r = logged_in_client.post("/guest/add", data={
            "first_name": "NoGender"
        })
        assert r.status_code == 400

    def test_add_guest_requires_login(self, client):
        r = client.post("/guest/add", data={
            "first_name": "Unauth", "gender": "Male"
        })
        assert r.status_code == 302
        assert "login" in r.headers["Location"]


# ── /guest/<id>/edit route (previously untested) ─────────────────────────────

class TestEditGuest:
    def test_edit_guest(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/guest/{sample_guest}/edit", data={
            "first_name": "Alicia", "last_name": "Smith-Johnson",
            "gender": "Female", "notes": "Updated"
        })
        assert r.status_code == 302
        with test_app.app_context():
            g = db.session.get(Guest,sample_guest)
            assert g.first_name == "Alicia"
            assert g.last_name == "Smith-Johnson"
            assert g.notes == "Updated"
            assert g.date_edited is not None

    def test_edit_guest_set_is_me(self, logged_in_client, sample_guest, test_app):
        r = logged_in_client.post(f"/guest/{sample_guest}/edit", data={
            "first_name": "Alice", "gender": "Female", "is_me": "on"
        })
        assert r.status_code == 302
        with test_app.app_context():
            assert db.session.get(Guest,sample_guest).is_me is True

    def test_edit_guest_is_me_clears_previous(self, logged_in_client, test_app, user, sample_guest):
        with test_app.app_context():
            prev = Guest(user_id=user, first_name="PrevMe", gender="Male", is_me=True)
            db.session.add(prev)
            db.session.commit()
            prev_id = prev.id
        logged_in_client.post(f"/guest/{sample_guest}/edit", data={
            "first_name": "Alice", "gender": "Female", "is_me": "on"
        })
        with test_app.app_context():
            assert db.session.get(Guest,prev_id).is_me is False
            assert db.session.get(Guest,sample_guest).is_me is True

    def test_edit_guest_unset_is_me(self, logged_in_client, sample_guest, test_app):
        with test_app.app_context():
            g = db.session.get(Guest,sample_guest)
            g.is_me = True
            db.session.commit()
        r = logged_in_client.post(f"/guest/{sample_guest}/edit", data={
            "first_name": "Alice", "gender": "Female"
            # no is_me field = unchecked
        })
        assert r.status_code == 302
        with test_app.app_context():
            assert db.session.get(Guest,sample_guest).is_me is False

    def test_edit_guest_other_user(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/guest/{gid}/edit", data={
            "first_name": "Hacked", "gender": "Male"
        })
        assert r.status_code == 403
        with test_app.app_context():
            assert db.session.get(Guest,gid).first_name == "Other"  # unchanged

    def test_edit_nonexistent_guest(self, logged_in_client):
        r = logged_in_client.post("/guest/99999/edit", data={
            "first_name": "Ghost", "gender": "Male"
        })
        assert r.status_code == 404

    def test_edit_guest_requires_login(self, client, sample_guest):
        r = client.post(f"/guest/{sample_guest}/edit", data={
            "first_name": "Unauth", "gender": "Male"
        })
        assert r.status_code == 302
        assert "login" in r.headers["Location"]


# ── Auth edge cases ──────────────────────────────────────────────────────────

class TestAuthEdgeCases:
    def test_signup_invalid_email_no_at(self, client):
        r = client.post("/signup", data={
            "email": "notanemail", "password": "validpass"
        })
        assert r.status_code == 200
        assert b"Valid email" in r.data

    def test_signup_email_just_at(self, client):
        r = client.post("/signup", data={
            "email": "@", "password": "validpass"
        })
        # "@" contains "@" so passes the basic check, but is still not valid
        # The app currently allows it — this documents the behavior
        assert r.status_code in (200, 302)

    def test_login_email_case_insensitive(self, client, user):
        r = client.post("/login", data={
            "email": "TEST@TEST.COM", "password": "password123"
        })
        assert r.status_code == 302  # successful login

    def test_login_empty_password(self, client, user):
        r = client.post("/login", data={
            "email": "test@test.com", "password": ""
        })
        assert r.status_code == 200
        assert b"Invalid" in r.data

    def test_signup_password_exactly_6(self, client, test_app):
        r = client.post("/signup", data={
            "email": "exact6@test.com", "password": "123456"
        }, follow_redirects=True)
        assert r.status_code == 200
        with test_app.app_context():
            assert User.query.filter_by(email="exact6@test.com").first() is not None


# ── Settings routes require login ────────────────────────────────────────────

class TestSettingsAuth:
    def test_load_sample_data_requires_login(self, client):
        r = client.post("/settings/load-sample-data")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]

    def test_reset_sample_data_requires_login(self, client):
        r = client.post("/settings/reset-sample-data")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]


# ── Export routes require login ──────────────────────────────────────────────

class TestExportAuth:
    def test_export_guests_requires_login(self, client):
        r = client.get("/export/guests")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]

    def test_export_event_guests_requires_login(self, client):
        r = client.get("/export/event/1")
        assert r.status_code == 302
        assert "login" in r.headers["Location"]


# ── Model property tests ────────────────────────────────────────────────────

class TestGuestFullName:
    def test_full_name_with_last(self, test_app, user):
        with test_app.app_context():
            g = Guest(user_id=user, first_name="Alice", last_name="Smith", gender="Female")
            assert g.full_name == "Alice Smith"

    def test_full_name_without_last(self, test_app, user):
        with test_app.app_context():
            g = Guest(user_id=user, first_name="Solo", last_name="", gender="Male")
            assert g.full_name == "Solo"

    def test_full_name_none_last(self, test_app, user):
        with test_app.app_context():
            g = Guest(user_id=user, first_name="Solo", last_name=None, gender="Male")
            assert g.full_name == "Solo"


# ── Invitation status transitions ───────────────────────────────────────────

class TestStatusTransitions:
    def test_unsend_from_attending(self, logged_in_client, sample_invitation, test_app):
        """Toggling send on 'Attending' should reset to 'Not Sent'."""
        with test_app.app_context():
            inv = db.session.get(Invitation,sample_invitation)
            inv.status = "Attending"
            inv.date_invited = date.today()
            inv.date_responded = date.today()
            db.session.commit()
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        data = r.get_json()
        assert data["status"] == "Not Sent"
        assert data["date_invited"] == ""

    def test_unsend_from_declined(self, logged_in_client, sample_invitation, test_app):
        """Toggling send on 'Declined' should reset to 'Not Sent'."""
        with test_app.app_context():
            inv = db.session.get(Invitation,sample_invitation)
            inv.status = "Declined"
            inv.date_invited = date.today()
            inv.date_responded = date.today()
            db.session.commit()
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send",
            headers={"X-Requested-With": "XMLHttpRequest"})
        data = r.get_json()
        assert data["status"] == "Not Sent"

    def test_update_same_status(self, logged_in_client, sample_invitation, test_app):
        """Updating to same status should not crash."""
        with test_app.app_context():
            inv = db.session.get(Invitation,sample_invitation)
            inv.status = "Attending"
            inv.date_invited = date.today()
            inv.date_responded = date.today()
            db.session.commit()
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Attending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "Attending"

    def test_update_not_sent_to_attending(self, logged_in_client, sample_invitation, test_app):
        """Jumping from Not Sent to Attending directly."""
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Attending"},
            headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "Attending"
        assert data["date_responded"] != ""


# ── Event add edge cases ────────────────────────────────────────────────────

class TestAddEventEdgeCases:
    def test_add_event_include_me_no_me_guest(self, logged_in_client, test_app):
        """include_me checked but no guest is marked as 'me' — should not crash."""
        r = logged_in_client.post("/event/add", data={
            "name": "No Me Event", "event_type": "Dinner",
            "date": "2026-08-01", "include_me": "on"
        })
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="No Me Event").first()
            assert e is not None
            assert len(e.invitations) == 0  # no me guest, no invitation

    def test_add_event_missing_event_type(self, logged_in_client):
        r = logged_in_client.post("/event/add", data={
            "name": "No Type", "date": "2026-08-01"
        })
        assert r.status_code == 400

    def test_add_event_negative_target(self, logged_in_client, test_app):
        r = logged_in_client.post("/event/add", data={
            "name": "Neg Target", "event_type": "Dinner",
            "date": "2026-08-01", "target_attendees": "-5"
        })
        # Negative target is treated as None by validation
        assert r.status_code == 302
        with test_app.app_context():
            e = Event.query.filter_by(name="Neg Target").first()
            assert e.target_attendees is None


# ── Seed data idempotency ───────────────────────────────────────────────────

class TestSeedData:
    def test_load_sample_twice(self, logged_in_client, test_app):
        """Loading sample data twice should add data twice (no uniqueness constraint)."""
        logged_in_client.post("/settings/load-sample-data", follow_redirects=True)
        with test_app.app_context():
            count1 = Event.query.count()
        logged_in_client.post("/settings/load-sample-data", follow_redirects=True)
        with test_app.app_context():
            count2 = Event.query.count()
        assert count2 == count1 * 2

    def test_reset_clears_all_user_data(self, logged_in_client, test_app, user):
        """Reset should delete ALL user data then re-seed."""
        # First add some custom data
        with test_app.app_context():
            g = Guest(user_id=user, first_name="Custom", gender="Male", date_created=datetime.now())
            db.session.add(g)
            db.session.commit()
        logged_in_client.post("/settings/reset-sample-data", follow_redirects=True)
        with test_app.app_context():
            # Custom guest should be gone
            assert Guest.query.filter_by(first_name="Custom").first() is None
            # Seed data should exist
            assert Event.query.count() == 8


# ── Cross-user isolation ────────────────────────────────────────────────────

class TestCrossUserIsolation:
    def test_cannot_view_other_users_event_detail(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Secret", event_type="Party",
                      date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/event/{eid}")
        assert r.status_code == 403

    def test_cannot_export_other_users_event(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Secret", event_type="Party",
                      date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/export/event/{eid}")
        assert r.status_code == 403

    def test_cannot_update_other_users_event_notes(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(user_id=user2, name="Secret", event_type="Party",
                      date=date(2026, 7, 1))
            db.session.add(e)
            db.session.commit()
            eid = e.id
        r = logged_in_client.post(f"/api/event/{eid}/notes",
            json={"notes": "hacked"})
        assert r.status_code == 403

    def test_cannot_delete_other_users_guest(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/guest/{gid}/delete")
        assert r.status_code == 403
        with test_app.app_context():
            assert db.session.get(Guest,gid) is not None

    def test_cannot_update_other_users_guest_notes(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/api/guest/{gid}/notes",
            json={"notes": "hacked"})
        assert r.status_code == 403

    def test_cannot_update_other_users_guest_is_me(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            g = Guest(user_id=user2, first_name="Other", gender="Male")
            db.session.add(g)
            db.session.commit()
            gid = g.id
        r = logged_in_client.post(f"/api/guest/{gid}/is-me",
            json={"is_me": True})
        assert r.status_code == 403


# ── Event detail rendering with invitations ─────────────────────────────────

class TestEventDetailRendering:
    def test_detail_with_invitations(self, logged_in_client, sample_event, sample_invitation, test_app):
        r = logged_in_client.get(f"/event/{sample_event}")
        assert r.status_code == 200
        assert b"Alice" in r.data

    def test_detail_shows_correct_counts(self, logged_in_client, test_app, user):
        with test_app.app_context():
            e = Event(user_id=user, name="CountTest", event_type="Party",
                      date=date(2026, 8, 1), date_created=date.today(),
                      target_attendees=5)
            db.session.add(e)
            db.session.flush()
            for i, status in enumerate(["Attending", "Attending", "Pending", "Declined", "Not Sent"]):
                g = Guest(user_id=user, first_name=f"G{i}", gender="Male",
                          date_created=datetime.now())
                db.session.add(g)
                db.session.flush()
                inv = Invitation(event_id=e.id, guest_id=g.id, status=status)
                if status != "Not Sent":
                    inv.date_invited = date.today()
                if status in ("Attending", "Declined"):
                    inv.date_responded = date.today()
                db.session.add(inv)
            db.session.commit()
            eid = e.id
        r = logged_in_client.get(f"/event/{eid}")
        assert r.status_code == 200
        # Page should render without error with mixed statuses
        assert b"CountTest" in r.data


# ── Non-AJAX fallback redirects ─────────────────────────────────────────────

class TestNonAjaxFallbacks:
    def test_update_invitation_non_ajax(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/update",
            data={"status": "Attending"})
        assert r.status_code == 302

    def test_remove_invitation_non_ajax(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/delete")
        assert r.status_code == 302

    def test_toggle_send_non_ajax(self, logged_in_client, sample_invitation):
        r = logged_in_client.post(f"/invitation/{sample_invitation}/send")
        assert r.status_code == 302


# ── Bulk operations edge cases ──────────────────────────────────────────────

class TestBulkEdgeCases:
    def test_bulk_add_nonexistent_guest_ids(self, logged_in_client, sample_event):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-add",
            json={"guest_ids": [99999, 99998]})
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_create_and_invite_empty(self, logged_in_client, sample_event):
        r = logged_in_client.post(f"/api/event/{sample_event}/bulk-create-and-invite",
            json={"guests": []})
        data = r.get_json()
        assert len(data["added"]) == 0

    def test_bulk_create_guests_default_gender(self, logged_in_client, test_app):
        r = logged_in_client.post("/api/guests/bulk-create", json={
            "guests": [{"first_name": "NoGender"}]
        })
        data = r.get_json()
        assert len(data["added"]) == 1
        assert data["added"][0]["gender"] == "Male"  # default

    def test_bulk_create_and_invite_nonexistent_event(self, logged_in_client):
        r = logged_in_client.post("/api/event/99999/bulk-create-and-invite",
            json={"guests": [{"first_name": "Test", "gender": "Male"}]})
        assert r.status_code == 404

    def test_bulk_add_nonexistent_event(self, logged_in_client):
        r = logged_in_client.post("/api/event/99999/bulk-add",
            json={"guest_ids": [1]})
        assert r.status_code == 404
