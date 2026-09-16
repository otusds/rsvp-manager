import logging
import secrets
from datetime import datetime, timedelta, timezone
import resend
from flask import url_for, render_template, current_app
from rsvp_manager.extensions import db
from rsvp_manager.models import User
from rsvp_manager.utils import format_date

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
    _send_email(user.email, "Verify your email — GuestCheck", html)
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
    _send_email(user.email, "Reset your password — GuestCheck", html)
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


def send_email_change_verification(user, new_email):
    """Send a verification email to the new address to confirm an email change.

    The pending state is only persisted once the email has actually gone out, so a
    send failure does not leave the user with a pending change they never asked for.
    """
    token = secrets.token_urlsafe(32)
    verify_url = url_for("settings.verify_email_change", token=token, _external=True)
    html = render_template("emails/verify_email_change.html", user=user, new_email=new_email, verify_url=verify_url)
    _send_email(new_email, "Confirm your new email — GuestCheck", html)
    user.pending_email = new_email
    user.pending_email_token = token
    user.pending_email_sent_at = _utcnow()
    db.session.commit()
    logger.info("Email change verification sent to %s for user %s", new_email, user.email)


def send_email_change_notice(user, new_email):
    """Warn the current address that a change to new_email was requested."""
    html = render_template("emails/email_change_notice.html", user=user, new_email=new_email)
    _send_email(user.email, "Email change requested — GuestCheck", html)
    logger.info("Email change notice sent to %s", user.email)


def verify_email_change_token(token, expected_user_id=None):
    """Verify the email change token and swap the email.

    When expected_user_id is given the token must belong to that user; the swap is
    rejected before any change is made, rather than after.
    """
    if not token:
        return None
    user = User.query.filter_by(pending_email_token=token).first()
    if not user:
        return None
    if expected_user_id is not None and user.id != expected_user_id:
        return None
    if user.pending_email_sent_at is None:
        return None
    if _utcnow() - user.pending_email_sent_at > timedelta(hours=TOKEN_EXPIRY_HOURS):
        return None
    # Check that the new email isn't taken by another user
    existing = User.query.filter_by(email=user.pending_email).first()
    if existing and existing.id != user.id:
        return None
    old_email = user.email
    user.email = user.pending_email
    user.email_verified = True
    user.pending_email = None
    user.pending_email_token = None
    user.pending_email_sent_at = None
    db.session.commit()
    logger.info("Email changed from %s to %s", old_email, user.email)
    return user


def send_cohost_notification(event, joining_user, role):
    """Notify event owner that someone joined as co-host/viewer."""
    owner = db.session.get(User, event.user_id)
    if not owner or not owner.email:
        return
    role_label = "Co-Host" if role == "cohost" else "Viewer"
    subject = f"{joining_user.full_name} joined your event as {role_label}"
    event_url = url_for("events.event_detail", event_id=event.id, _external=True)
    html = render_template("emails/cohost_joined.html",
                           joining_name=joining_user.full_name,
                           event_name=event.name,
                           event_date=format_date(event.date),
                           event_location=event.location or "",
                           event_url=event_url,
                           role_label=role_label)
    _send_email(owner.email, subject, html)
