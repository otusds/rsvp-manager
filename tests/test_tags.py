"""Tests for tag CRUD operations."""
import json
from rsvp_manager.extensions import db
from rsvp_manager.models import Tag, Guest


class TestTagAPI:
    def test_list_tags_empty(self, logged_in_client):
        resp = logged_in_client.get("/api/v1/tags")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data == []

    def test_list_tags_after_tagging(self, logged_in_client, sample_guest, test_app):
        with test_app.app_context():
            guest = db.session.get(Guest, sample_guest)
            tag = Tag(user_id=guest.user_id, name="VIP")
            db.session.add(tag)
            db.session.flush()
            guest.tags.append(tag)
            db.session.commit()

        resp = logged_in_client.get("/api/v1/tags")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert len(data) == 1
        assert data[0]["name"] == "VIP"
        assert data[0]["guest_count"] == 1

    def test_tags_user_isolation(self, logged_in_client, test_app, user2):
        with test_app.app_context():
            tag = Tag(user_id=user2, name="OtherTag")
            db.session.add(tag)
            db.session.commit()

        resp = logged_in_client.get("/api/v1/tags")
        assert resp.status_code == 200
        assert resp.get_json()["data"] == []


class TestBulkTag:
    def test_bulk_add_tag(self, logged_in_client, sample_guest):
        resp = logged_in_client.post("/api/v1/friends/bulk-tag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "Family"}),
            content_type="application/json")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert len(data) == 1
        assert any(t["name"] == "Family" for t in data[0]["tags"])

    def test_bulk_add_tag_creates_tag(self, logged_in_client, sample_guest, test_app):
        logged_in_client.post("/api/v1/friends/bulk-tag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "NewTag"}),
            content_type="application/json")

        with test_app.app_context():
            guest = db.session.get(Guest, sample_guest)
            assert Tag.query.filter_by(name="NewTag").first() is not None

    def test_bulk_add_tag_idempotent(self, logged_in_client, sample_guest):
        payload = json.dumps({"guest_ids": [sample_guest], "tag_name": "Double"})
        logged_in_client.post("/api/v1/friends/bulk-tag",
            data=payload, content_type="application/json")
        resp = logged_in_client.post("/api/v1/friends/bulk-tag",
            data=payload, content_type="application/json")
        data = resp.get_json()["data"]
        tag_names = [t["name"] for t in data[0]["tags"]]
        assert tag_names.count("Double") == 1

    def test_bulk_remove_tag(self, logged_in_client, sample_guest):
        # First add
        logged_in_client.post("/api/v1/friends/bulk-tag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "Temp"}),
            content_type="application/json")
        # Then remove
        resp = logged_in_client.post("/api/v1/friends/bulk-untag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "Temp"}),
            content_type="application/json")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert not any(t["name"] == "Temp" for t in data[0]["tags"])

    def test_bulk_remove_nonexistent_tag(self, logged_in_client, sample_guest):
        resp = logged_in_client.post("/api/v1/friends/bulk-untag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "NoSuchTag"}),
            content_type="application/json")
        assert resp.status_code == 200
        assert resp.get_json()["data"] == []

    def test_bulk_tag_missing_fields(self, logged_in_client):
        resp = logged_in_client.post("/api/v1/friends/bulk-tag",
            data=json.dumps({"guest_ids": [1]}),
            content_type="application/json")
        assert resp.status_code == 400

    def test_bulk_tag_empty_name(self, logged_in_client, sample_guest):
        resp = logged_in_client.post("/api/v1/friends/bulk-tag",
            data=json.dumps({"guest_ids": [sample_guest], "tag_name": "  "}),
            content_type="application/json")
        assert resp.status_code == 400


class TestGuestTagsViaAPI:
    def test_update_guest_tags(self, logged_in_client, sample_guest):
        resp = logged_in_client.put(f"/api/v1/friends/{sample_guest}",
            data=json.dumps({"tag_names": ["Alpha", "Beta"]}),
            content_type="application/json")
        assert resp.status_code == 200
        tags = resp.get_json()["data"]["tags"]
        tag_names = {t["name"] for t in tags}
        assert tag_names == {"Alpha", "Beta"}

    def test_update_guest_tags_replace(self, logged_in_client, sample_guest):
        # Set initial tags
        logged_in_client.put(f"/api/v1/friends/{sample_guest}",
            data=json.dumps({"tag_names": ["Old"]}),
            content_type="application/json")
        # Replace with new tags
        resp = logged_in_client.put(f"/api/v1/friends/{sample_guest}",
            data=json.dumps({"tag_names": ["New"]}),
            content_type="application/json")
        tags = resp.get_json()["data"]["tags"]
        tag_names = {t["name"] for t in tags}
        assert "Old" not in tag_names
        assert "New" in tag_names

    def test_update_guest_tags_clear(self, logged_in_client, sample_guest):
        # Set tags
        logged_in_client.put(f"/api/v1/friends/{sample_guest}",
            data=json.dumps({"tag_names": ["Remove"]}),
            content_type="application/json")
        # Clear all
        resp = logged_in_client.put(f"/api/v1/friends/{sample_guest}",
            data=json.dumps({"tag_names": []}),
            content_type="application/json")
        assert resp.get_json()["data"]["tags"] == []
