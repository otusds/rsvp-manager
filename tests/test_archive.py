"""Tests for guest archive/unarchive operations."""
import json
from rsvp_manager.extensions import db
from rsvp_manager.models import Guest


class TestArchiveViaAPI:
    def test_archive_guest(self, logged_in_client, sample_guest):
        resp = logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": True}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["is_archived"] is True

    def test_unarchive_guest(self, logged_in_client, sample_guest, test_app):
        # Archive first
        logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": True}),
            content_type="application/json")
        # Unarchive
        resp = logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": False}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["is_archived"] is False

    def test_archived_guest_hidden_by_default(self, logged_in_client, sample_guest):
        # Archive the guest
        logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": True}),
            content_type="application/json")
        # List without show_archived
        resp = logged_in_client.get("/api/v1/guests")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 0

    def test_archived_guest_visible_with_flag(self, logged_in_client, sample_guest):
        # Archive
        logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": True}),
            content_type="application/json")
        # Show all (show_archived=1 means show both)
        resp = logged_in_client.get("/api/v1/guests?show_archived=1")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 1

    def test_show_archived_only(self, logged_in_client, sample_guest):
        # Archive
        logged_in_client.put(f"/api/v1/guests/{sample_guest}",
            data=json.dumps({"is_archived": True}),
            content_type="application/json")
        # Show archived only (show_archived=2)
        resp = logged_in_client.get("/api/v1/guests?show_archived=2")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 1


class TestBulkArchive:
    def test_bulk_archive(self, logged_in_client, sample_guest):
        resp = logged_in_client.post("/api/v1/guests/bulk-archive",
            data=json.dumps({"guest_ids": [sample_guest]}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["archived"] == 1

    def test_bulk_archive_already_archived(self, logged_in_client, sample_guest):
        # Archive once
        logged_in_client.post("/api/v1/guests/bulk-archive",
            data=json.dumps({"guest_ids": [sample_guest]}),
            content_type="application/json")
        # Archive again - should count 0
        resp = logged_in_client.post("/api/v1/guests/bulk-archive",
            data=json.dumps({"guest_ids": [sample_guest]}),
            content_type="application/json")
        assert resp.get_json()["data"]["archived"] == 0

    def test_bulk_archive_invalid_ids(self, logged_in_client):
        resp = logged_in_client.post("/api/v1/guests/bulk-archive",
            data=json.dumps({"guest_ids": [99999]}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["archived"] == 0

    def test_bulk_archive_missing_field(self, logged_in_client):
        resp = logged_in_client.post("/api/v1/guests/bulk-archive",
            data=json.dumps({}),
            content_type="application/json")
        assert resp.status_code == 400


class TestBulkDelete:
    def test_bulk_delete(self, logged_in_client, sample_guest):
        resp = logged_in_client.post("/api/v1/guests/bulk-delete",
            data=json.dumps({"guest_ids": [sample_guest]}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["deleted"] == 1

    def test_bulk_delete_invalid_ids(self, logged_in_client):
        resp = logged_in_client.post("/api/v1/guests/bulk-delete",
            data=json.dumps({"guest_ids": [99999]}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["deleted"] == 0

    def test_bulk_delete_missing_field(self, logged_in_client):
        resp = logged_in_client.post("/api/v1/guests/bulk-delete",
            data=json.dumps({}),
            content_type="application/json")
        assert resp.status_code == 400
