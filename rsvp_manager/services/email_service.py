import logging
import secrets
from datetime import datetime, timedelta, timezone
import resend
from flask import url_for, render_template, current_app
from rsvp_manager.extensions import db
from rsvp_manager.models import User

logger = logging.getLogger(__name__)
TOKEN_EXPIRY_HOURS = 24


def _send_email(to, subject, html):
    resend.api_key = current_app.config["RESEND_API_KEY"]
    sender = current_app.config["EMAIL_DEFAULT_SENDER"]
    resend.Emails.send({"from": sender, "to": [to], "subject": subject, "html": html})


def _utcnow():
    """Naive UTC datetime (compatible with DateTime columns without timezone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def generate_verification_token(user):
    user.email_verification_token = secrets.token_urlsafe(32)
    user.email_verification_sent_at = _utcnow()
    db.session.commit()
    return user.email_verification_token


def send_verification_email(user):
    token = generate_verification_token(user)
    verify_url = url_for("auth.verify_email", token=token, _external=True)
    html = render_template("emails/verify_email.html", user=user, verify_url=verify_url)
    _send_email(user.email, "Verify your email — RSVP Manager", html)
    logger.info("Verification email sent to %s", user.email)


def verify_email_token(token):
    if not token:
        return None
    user = User.query.filter_by(email_verification_token=token).first()
    if not user:
        return None
    if user.email_verification_sent_at is None:
        return None
    if _utcnow() - user.email_verification_sent_at > timedelta(hours=TOKEN_EXPIRY_HOURS):
        return None
    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_sent_at = None
    db.session.commit()
    logger.info("Email verified for user %s", user.email)
    return user


def generate_password_reset_token(user):
    user.password_reset_token = secrets.token_urlsafe(32)
    user.password_reset_sent_at = _utcnow()
    db.session.commit()
    return user.password_reset_token


def send_password_reset_email(user):
    token = generate_password_reset_token(user)
    reset_url = url_for("auth.reset_password", token=token, _external=True)
    html = render_template("emails/reset_password.html", user=user, reset_url=reset_url)
    _send_email(user.email, "Reset your password — RSVP Manager", html)
    logger.info("Password reset email sent to %s", user.email)


def validate_reset_token(token):
    if not token:
        return None
    user = User.query.filter_by(password_reset_token=token).first()
    if not user:
        return None
    if user.password_reset_sent_at is None:
        return None
    if _utcnow() - user.password_reset_sent_at > timedelta(hours=TOKEN_EXPIRY_HOURS):
        return None
    return user


def consume_reset_token(user):
    user.password_reset_token = None
    user.password_reset_sent_at = None
    db.session.commit()
