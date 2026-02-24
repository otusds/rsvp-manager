"""Tests for email verification and password reset flows."""
import secrets
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from app import db, User
from werkzeug.security import generate_password_hash, check_password_hash


# ── Email Verification Tests ────────────────────────────────────────────────


class TestEmailVerification:
    def test_signup_sends_verification_email(self, client, test_app):
        with patch("rsvp_manager.blueprints.auth.send_verification_email") as mock_send:
            resp = client.post("/signup", data={
                "email": "new@test.com", "password": "password123"
            }, follow_redirects=True)
            assert resp.status_code == 200
            mock_send.assert_called_once()
            user = mock_send.call_args[0][0]
            assert user.email == "new@test.com"

    def test_signup_works_if_email_fails(self, client, test_app):
        with patch("rsvp_manager.blueprints.auth.send_verification_email", side_effect=Exception("SMTP error")):
            resp = client.post("/signup", data={
                "email": "new@test.com", "password": "password123"
            }, follow_redirects=True)
            assert resp.status_code == 200
            with test_app.app_context():
                user = User.query.filter_by(email="new@test.com").first()
                assert user is not None
                assert user.email_verified is False

    def test_new_user_is_not_verified(self, test_app, user):
        with test_app.app_context():
            u = db.session.get(User, user)
            assert u.email_verified is False

    def test_verify_email_valid_token(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.email_verification_token = token
            u.email_verification_sent_at = datetime.utcnow()
            db.session.commit()

        resp = client.get(f"/verify-email/{token}")
        assert resp.status_code == 200
        assert b"verified" in resp.data.lower()

        with test_app.app_context():
            u = db.session.get(User, user)
            assert u.email_verified is True
            assert u.email_verification_token is None

    def test_verify_email_invalid_token(self, client, test_app, user):
        resp = client.get("/verify-email/bad-token-here")
        assert resp.status_code == 200
        assert b"invalid" in resp.data.lower() or b"expired" in resp.data.lower()

    def test_verify_email_expired_token(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.email_verification_token = token
            u.email_verification_sent_at = datetime.utcnow() - timedelta(hours=25)
            db.session.commit()

        resp = client.get(f"/verify-email/{token}")
        assert resp.status_code == 200
        assert b"invalid" in resp.data.lower() or b"expired" in resp.data.lower()

        with test_app.app_context():
            u = db.session.get(User, user)
            assert u.email_verified is False

    def test_resend_verification(self, logged_in_client, test_app, user):
        with patch("rsvp_manager.blueprints.auth.send_verification_email") as mock_send:
            resp = logged_in_client.post("/resend-verification", follow_redirects=True)
            assert resp.status_code == 200
            mock_send.assert_called_once()

    def test_resend_verification_already_verified(self, client, test_app):
        # Create a user that's already verified
        with test_app.app_context():
            u = User(
                email="verified@test.com",
                password_hash=generate_password_hash("password123"),
                email_verified=True,
            )
            db.session.add(u)
            db.session.commit()
        client.post("/login", data={"email": "verified@test.com", "password": "password123"})

        with patch("rsvp_manager.services.email_service.mail.send") as mock_mail:
            resp = client.post("/resend-verification", follow_redirects=True)
            assert resp.status_code == 200
            mock_mail.assert_not_called()


# ── Password Reset Tests ────────────────────────────────────────────────────


class TestPasswordReset:
    def test_forgot_password_page_loads(self, client, test_app):
        resp = client.get("/forgot-password")
        assert resp.status_code == 200
        assert b"Forgot Password" in resp.data

    def test_forgot_password_sends_email(self, client, test_app, user):
        with patch("rsvp_manager.blueprints.auth.send_password_reset_email") as mock_send:
            resp = client.post("/forgot-password", data={"email": "test@test.com"})
            assert resp.status_code == 200
            mock_send.assert_called_once()

    def test_forgot_password_nonexistent_email_no_leak(self, client, test_app):
        with patch("rsvp_manager.blueprints.auth.send_password_reset_email") as mock_send:
            resp = client.post("/forgot-password", data={"email": "nobody@test.com"})
            assert resp.status_code == 200
            mock_send.assert_not_called()
            # Same success message regardless
            assert b"reset link" in resp.data.lower()

    def test_reset_password_valid_token(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.password_reset_token = token
            u.password_reset_sent_at = datetime.utcnow()
            db.session.commit()

        # GET shows the form
        resp = client.get(f"/reset-password/{token}")
        assert resp.status_code == 200
        assert b"New Password" in resp.data

        # POST resets the password
        resp = client.post(f"/reset-password/{token}", data={
            "password": "newpassword123",
            "password_confirm": "newpassword123",
        }, follow_redirects=True)
        assert resp.status_code == 200
        assert b"reset" in resp.data.lower()

        with test_app.app_context():
            u = db.session.get(User, user)
            assert check_password_hash(u.password_hash, "newpassword123")
            assert u.password_reset_token is None

    def test_reset_password_invalid_token(self, client, test_app):
        resp = client.get("/reset-password/bad-token")
        assert resp.status_code == 200
        assert b"invalid" in resp.data.lower() or b"expired" in resp.data.lower()

    def test_reset_password_expired_token(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.password_reset_token = token
            u.password_reset_sent_at = datetime.utcnow() - timedelta(hours=25)
            db.session.commit()

        resp = client.get(f"/reset-password/{token}")
        assert resp.status_code == 200
        assert b"invalid" in resp.data.lower() or b"expired" in resp.data.lower()

    def test_reset_password_short_password(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.password_reset_token = token
            u.password_reset_sent_at = datetime.utcnow()
            db.session.commit()

        resp = client.post(f"/reset-password/{token}", data={
            "password": "short",
            "password_confirm": "short",
        })
        assert resp.status_code == 200
        assert b"at least 6" in resp.data.lower()

    def test_reset_password_mismatch(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.password_reset_token = token
            u.password_reset_sent_at = datetime.utcnow()
            db.session.commit()

        resp = client.post(f"/reset-password/{token}", data={
            "password": "newpassword123",
            "password_confirm": "differentpassword",
        })
        assert resp.status_code == 200
        assert b"do not match" in resp.data.lower()

    def test_login_with_new_password_after_reset(self, client, test_app, user):
        token = secrets.token_urlsafe(32)
        with test_app.app_context():
            u = db.session.get(User, user)
            u.password_reset_token = token
            u.password_reset_sent_at = datetime.utcnow()
            db.session.commit()

        client.post(f"/reset-password/{token}", data={
            "password": "newpassword123",
            "password_confirm": "newpassword123",
        }, follow_redirects=True)

        # Old password should fail
        resp = client.post("/login", data={
            "email": "test@test.com", "password": "password123"
        })
        assert b"Invalid" in resp.data

        # New password should work
        resp = client.post("/login", data={
            "email": "test@test.com", "password": "newpassword123"
        }, follow_redirects=True)
        assert resp.status_code == 200


# ── Email Service Unit Tests ────────────────────────────────────────────────


class TestEmailService:
    def test_generate_verification_token(self, test_app, user):
        from rsvp_manager.services.email_service import generate_verification_token
        with test_app.app_context():
            u = db.session.get(User, user)
            token = generate_verification_token(u)
            assert token is not None
            assert len(token) > 20
            assert u.email_verification_token == token
            assert u.email_verification_sent_at is not None

    def test_generate_password_reset_token(self, test_app, user):
        from rsvp_manager.services.email_service import generate_password_reset_token
        with test_app.app_context():
            u = db.session.get(User, user)
            token = generate_password_reset_token(u)
            assert token is not None
            assert len(token) > 20
            assert u.password_reset_token == token
            assert u.password_reset_sent_at is not None

    def test_verify_email_token_clears_token(self, test_app, user):
        from rsvp_manager.services.email_service import generate_verification_token, verify_email_token
        with test_app.app_context():
            u = db.session.get(User, user)
            token = generate_verification_token(u)
            result = verify_email_token(token)
            assert result is not None
            assert result.email_verified is True
            # Token should be cleared
            assert result.email_verification_token is None

    def test_validate_reset_token_does_not_clear(self, test_app, user):
        from rsvp_manager.services.email_service import generate_password_reset_token, validate_reset_token
        with test_app.app_context():
            u = db.session.get(User, user)
            token = generate_password_reset_token(u)
            result = validate_reset_token(token)
            assert result is not None
            # Token should still be there (cleared only on consume)
            assert result.password_reset_token == token

    def test_consume_reset_token(self, test_app, user):
        from rsvp_manager.services.email_service import generate_password_reset_token, consume_reset_token
        with test_app.app_context():
            u = db.session.get(User, user)
            generate_password_reset_token(u)
            consume_reset_token(u)
            assert u.password_reset_token is None
            assert u.password_reset_sent_at is None

    def test_send_verification_email_uses_mail(self, test_app, user):
        from rsvp_manager.services.email_service import send_verification_email
        with test_app.app_context():
            u = db.session.get(User, user)
            with patch("rsvp_manager.services.email_service.mail.send") as mock_send:
                send_verification_email(u)
                mock_send.assert_called_once()
                msg = mock_send.call_args[0][0]
                assert "Verify" in msg.subject
                assert u.email in msg.recipients

    def test_send_password_reset_email_uses_mail(self, test_app, user):
        from rsvp_manager.services.email_service import send_password_reset_email
        with test_app.app_context():
            u = db.session.get(User, user)
            with patch("rsvp_manager.services.email_service.mail.send") as mock_send:
                send_password_reset_email(u)
                mock_send.assert_called_once()
                msg = mock_send.call_args[0][0]
                assert "Reset" in msg.subject or "reset" in msg.subject
                assert u.email in msg.recipients
