"""Tests for the /api/v1/ endpoints."""
import json
import secrets
from datetime import date, datetime

import pytest
from app import db, User, Event, Guest, Invitation
from werkzeug.security import generate_password_hash


# ── Helpers ──────────────────────────────────────────────────────────────────

def api_get(client, url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.get(url, headers=headers)


def api_post(client, url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.post(url, data=json.dumps(data or {}), headers=headers)


def api_put(client, url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.put(url, data=json.dumps(data or {}), headers=headers)


def api_delete(client, url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.delete(url, headers=headers)


# ── Auth Token Tests ─────────────────────────────────────────────────────────

class TestAuthToken:
    def test_get_token_success(self, client, user):
        resp = api_post(client, "/api/v1/auth/token", {
            "email": "test@test.com", "password": "password123"
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "success"
        assert "token" in data["data"]
        assert data["data"]["email"] == "test@test.com"

    def test_get_token_wrong_password(self, client, user):
        resp = api_post(client, "/api/v1/auth/token", {
            "email": "test@test.com", "password": "wrongpassword"
        })
        assert resp.status_code == 401
        data = resp.get_json()
        assert data["status"] == "error"
        assert data["code"] == "AUTH_ERROR"

    def test_get_token_nonexistent_email(self, client, user):
        resp = api_post(client, "/api/v1/auth/token", {
            "email": "nobody@test.com", "password": "password123"
        })
        assert resp.status_code == 401

    def test_get_token_missing_fields(self, client, user):
        resp = api_post(client, "/api/v1/auth/token", {"email": "test@test.com"})
        assert resp.status_code == 400

    def test_token_is_persistent(self, client, user):
        resp1 = api_post(client, "/api/v1/auth/token", {
            "email": "test@test.com", "password": "password123"
        })
        token1 = resp1.get_json()["data"]["token"]
        resp2 = api_post(client, "/api/v1/auth/token", {
            "email": "test@test.com", "password": "password123"
        })
        token2 = resp2.get_json()["data"]["token"]
        assert token1 == token2


# ── Token Auth Tests ─────────────────────────────────────────────────────────

class TestTokenAuth:
    def test_bearer_token_works(self, client, user):
        # Get a token
        resp = api_post(client, "/api/v1/auth/token", {
            "email": "test@test.com", "password": "password123"
        })
        token = resp.get_json()["data"]["token"]

        # Use token to access API
        resp = api_get(client, "/api/v1/events", token=token)
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "success"

    def test_invalid_token_returns_401(self, client, user):
        resp = api_get(client, "/api/v1/events", token="invalid-token-here")
        assert resp.status_code == 401
        assert resp.get_json()["code"] == "INVALID_TOKEN"

    def test_no_auth_returns_401(self, client, user):
        resp = client.get("/api/v1/events")
        assert resp.status_code == 401
        assert resp.get_json()["code"] == "AUTH_REQUIRED"

    def test_session_auth_works_on_api(self, logged_in_client):
        resp = logged_in_client.get("/api/v1/events")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "success"


# ── Events API Tests ─────────────────────────────────────────────────────────

class TestEventsAPI:
    def test_list_events(self, logged_in_client, sample_event):
        resp = logged_in_client.get("/api/v1/events")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "success"
        assert len(data["data"]["items"]) == 1
        assert data["data"]["items"][0]["name"] == "Test Event"
        assert data["data"]["page"] == 1
        assert data["data"]["total"] == 1

    def test_get_event(self, logged_in_client, sample_event):
        resp = logged_in_client.get(f"/api/v1/events/{sample_event}")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["name"] == "Test Event"
        assert "invitations" in data

    def test_get_event_not_found(self, logged_in_client):
        resp = logged_in_client.get("/api/v1/events/99999")
        assert resp.status_code == 404

    def test_create_event(self, logged_in_client):
        resp = api_post(logged_in_client, "/api/v1/events", {
            "name": "New Event",
            "event_type": "Dinner",
            "date": "2026-12-25",
            "location": "Home",
        })
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert data["name"] == "New Event"
        assert data["event_type"] == "Dinner"

    def test_create_event_missing_name(self, logged_in_client):
        resp = api_post(logged_in_client, "/api/v1/events", {
            "event_type": "Dinner",
            "date": "2026-12-25",
        })
        assert resp.status_code == 400

    def test_update_event(self, logged_in_client, sample_event):
        resp = api_put(logged_in_client, f"/api/v1/events/{sample_event}", {
            "name": "Updated Event",
            "event_type": "Party",
            "date": "2026-07-01",
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["name"] == "Updated Event"
        assert data["event_type"] == "Party"

    def test_update_event_notes_only(self, logged_in_client, sample_event):
        resp = api_put(logged_in_client, f"/api/v1/events/{sample_event}", {
            "notes": "Updated notes"
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["notes"] == "Updated notes"
        # Name should be unchanged
        assert data["name"] == "Test Event"

    def test_delete_event(self, logged_in_client, sample_event):
        resp = api_delete(logged_in_client, f"/api/v1/events/{sample_event}")
        assert resp.status_code == 204
        # Verify deleted
        resp = logged_in_client.get(f"/api/v1/events/{sample_event}")
        assert resp.status_code == 404

    def test_event_user_isolation(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            e = Event(
                user_id=user2, name="Other Event", event_type="Dinner",
                date=date(2026, 8, 1), date_created=date.today()
            )
            db.session.add(e)
            db.session.commit()
            other_id = e.id
        resp = logged_in_client.get(f"/api/v1/events/{other_id}")
        assert resp.status_code == 403


# ── Guests API Tests ─────────────────────────────────────────────────────────

class TestGuestsAPI:
    def test_list_guests(self, logged_in_client, sample_guest):
        resp = logged_in_client.get("/api/v1/guests")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["data"]["items"]) == 1
        assert data["data"]["items"][0]["first_name"] == "Alice"
        assert data["data"]["page"] == 1
        assert data["data"]["total"] == 1

    def test_get_guest(self, logged_in_client, sample_guest):
        resp = logged_in_client.get(f"/api/v1/guests/{sample_guest}")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["first_name"] == "Alice"
        assert data["full_name"] == "Alice Smith"

    def test_create_guest(self, logged_in_client):
        resp = api_post(logged_in_client, "/api/v1/guests", {
            "first_name": "Bob",
            "last_name": "Jones",
            "gender": "Male",
        })
        assert resp.status_code == 201
        assert resp.get_json()["data"]["first_name"] == "Bob"

    def test_update_guest_name(self, logged_in_client, sample_guest):
        resp = api_put(logged_in_client, f"/api/v1/guests/{sample_guest}", {
            "first_name": "Alicia",
            "last_name": "Johnson",
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["full_name"] == "Alicia Johnson"

    def test_update_guest_gender(self, logged_in_client, sample_guest):
        resp = api_put(logged_in_client, f"/api/v1/guests/{sample_guest}", {
            "gender": "Male",
        })
        assert resp.status_code == 200
        assert resp.get_json()["data"]["gender"] == "Male"

    def test_update_guest_invalid_gender(self, logged_in_client, sample_guest):
        resp = api_put(logged_in_client, f"/api/v1/guests/{sample_guest}", {
            "gender": "Other",
        })
        assert resp.status_code == 400

    def test_update_guest_notes(self, logged_in_client, sample_guest):
        resp = api_put(logged_in_client, f"/api/v1/guests/{sample_guest}", {
            "notes": "VIP guest",
        })
        assert resp.status_code == 200
        assert resp.get_json()["data"]["notes"] == "VIP guest"

    def test_update_guest_is_me(self, logged_in_client, sample_guest):
        resp = api_put(logged_in_client, f"/api/v1/guests/{sample_guest}", {
            "is_me": True,
        })
        assert resp.status_code == 200
        assert resp.get_json()["data"]["is_me"] is True

    def test_delete_guest(self, logged_in_client, sample_guest):
        resp = api_delete(logged_in_client, f"/api/v1/guests/{sample_guest}")
        assert resp.status_code == 204

    def test_bulk_create_guests(self, logged_in_client):
        resp = api_post(logged_in_client, "/api/v1/guests/bulk", {
            "guests": [
                {"first_name": "Charlie", "last_name": "Brown", "gender": "Male"},
                {"first_name": "Diana", "gender": "Female"},
            ]
        })
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert len(data) == 2


# ── Invitations API Tests ────────────────────────────────────────────────────

class TestInvitationsAPI:
    def test_list_invitations(self, logged_in_client, sample_invitation, sample_event):
        resp = logged_in_client.get(f"/api/v1/events/{sample_event}/invitations")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert len(data) == 1

    def test_toggle_send(self, logged_in_client, sample_invitation):
        # Toggle from Not Sent to Pending
        resp = api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "toggle_send": True,
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["status"] == "Pending"
        assert data["date_invited"] != ""

        # Toggle back to Not Sent
        resp = api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "toggle_send": True,
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["status"] == "Not Sent"
        assert data["date_invited"] == ""

    def test_update_status(self, logged_in_client, sample_invitation):
        # First send
        api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "toggle_send": True,
        })
        # Then update status
        resp = api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "status": "Attending",
        })
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["status"] == "Attending"
        assert data["date_responded"] != ""

    def test_update_invitation_notes(self, logged_in_client, sample_invitation):
        resp = api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "notes": "Bringing a plus one",
        })
        assert resp.status_code == 200
        assert resp.get_json()["data"]["notes"] == "Bringing a plus one"

    def test_update_invitation_channel(self, logged_in_client, sample_invitation):
        resp = api_put(logged_in_client, f"/api/v1/invitations/{sample_invitation}", {
            "channel": "WhatsApp",
        })
        assert resp.status_code == 200
        assert resp.get_json()["data"]["channel"] == "WhatsApp"

    def test_delete_invitation(self, logged_in_client, sample_invitation):
        resp = api_delete(logged_in_client, f"/api/v1/invitations/{sample_invitation}")
        assert resp.status_code == 204

    def test_available_guests(self, logged_in_client, sample_event, sample_guest):
        resp = logged_in_client.get(f"/api/v1/events/{sample_event}/available-guests")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert len(data) >= 1

    def test_bulk_add_invitations(self, logged_in_client, sample_event, sample_guest):
        resp = api_post(
            logged_in_client,
            f"/api/v1/events/{sample_event}/invitations/bulk",
            {"guest_ids": [sample_guest]},
        )
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert len(data) == 1
        assert data[0]["guest_id"] == sample_guest

    def test_bulk_create_and_invite(self, logged_in_client, sample_event):
        resp = api_post(
            logged_in_client,
            f"/api/v1/events/{sample_event}/invitations/bulk-create",
            {"guests": [
                {"first_name": "New", "last_name": "Guest", "gender": "Male"},
            ]},
        )
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert len(data) == 1
        assert data[0]["first_name"] == "New"


# ── Response Format Tests ────────────────────────────────────────────────────

class TestResponseFormat:
    def test_success_format(self, logged_in_client):
        resp = logged_in_client.get("/api/v1/events")
        data = resp.get_json()
        assert "status" in data
        assert data["status"] == "success"
        assert "data" in data

    def test_error_format(self, client):
        resp = client.get("/api/v1/events")  # No auth
        data = resp.get_json()
        assert data["status"] == "error"
        assert "message" in data
        assert "code" in data

    def test_404_returns_json(self, logged_in_client):
        resp = logged_in_client.get("/api/v1/events/99999")
        assert resp.status_code == 404
        data = resp.get_json()
        assert data["status"] == "error"
        assert data["code"] == "NOT_FOUND"

    def test_400_returns_json(self, logged_in_client):
        resp = api_post(logged_in_client, "/api/v1/events", {
            "event_type": "Dinner",
            "date": "2026-12-25",
            # Missing name
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["status"] == "error"


# ── Export API Tests ─────────────────────────────────────────────────────────

class TestExportsAPI:
    def test_export_events(self, logged_in_client, sample_event):
        resp = logged_in_client.get("/api/v1/events/export")
        assert resp.status_code == 200
        assert "spreadsheet" in resp.content_type

    def test_export_guests(self, logged_in_client, sample_guest):
        resp = logged_in_client.get("/api/v1/guests/export")
        assert resp.status_code == 200
        assert "spreadsheet" in resp.content_type

    def test_export_event_guests(self, logged_in_client, sample_event, sample_invitation):
        resp = logged_in_client.get(f"/api/v1/events/{sample_event}/export")
        assert resp.status_code == 200
        assert "spreadsheet" in resp.content_type
