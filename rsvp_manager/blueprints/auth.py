import logging

from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from rsvp_manager.extensions import db
from rsvp_manager.models import User
from rsvp_manager.services.email_service import (
    send_verification_email, verify_email_token,
    send_password_reset_email, validate_reset_token, consume_reset_token,
)

bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)


@bp.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("events.home"))
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        if not email or "@" not in email:
            return render_template("signup.html", error="Valid email is required")
        if User.query.filter_by(email=email).first():
            return render_template("signup.html", error="Email already registered")
        if len(password) < 6:
            return render_template("signup.html", error="Password must be at least 6 characters")
        user = User(email=email, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        try:
            send_verification_email(user)
        except Exception:
            pass
        login_user(user)
        logger.info("New user signed up: %s", email)
        flash("Account created! Check your email to verify your address.")
        return redirect(url_for("events.home"))
    return render_template("signup.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("events.home"))
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            logger.warning("Failed login attempt for %s", email)
            return render_template("login.html", error="Invalid email or password")
        login_user(user)
        logger.info("User logged in: %s", email)
        next_page = request.args.get("next")
        if next_page and (not next_page.startswith("/") or next_page.startswith("//")):
            next_page = None
        return redirect(next_page or url_for("events.home"))
    return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))


@bp.route("/verify-email/<token>")
def verify_email(token):
    user = verify_email_token(token)
    if user:
        return render_template("verify_email.html", success="Your email has been verified!")
    return render_template("verify_email.html", error="Invalid or expired verification link.")


@bp.route("/resend-verification", methods=["POST"])
@login_required
def resend_verification():
    if current_user.email_verified:
        flash("Your email is already verified.")
        return redirect(url_for("settings.settings"))
    try:
        send_verification_email(current_user)
        flash("Verification email sent! Check your inbox.")
    except Exception:
        flash("Could not send verification email. Please try again later.")
    return redirect(url_for("settings.settings"))


@bp.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if current_user.is_authenticated:
        return redirect(url_for("events.home"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        user = User.query.filter_by(email=email).first()
        if user:
            try:
                send_password_reset_email(user)
            except Exception:
                pass
        return render_template(
            "forgot_password.html",
            success="If that email is registered, you'll receive a reset link shortly.",
        )
    return render_template("forgot_password.html")


@bp.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    user = validate_reset_token(token)
    if not user:
        return render_template("verify_email.html", error="Invalid or expired reset link.")
    if request.method == "POST":
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")
        if len(password) < 6:
            return render_template("reset_password.html", error="Password must be at least 6 characters")
        if password != password_confirm:
            return render_template("reset_password.html", error="Passwords do not match")
        user.password_hash = generate_password_hash(password)
        consume_reset_token(user)
        logger.info("Password reset completed for %s", user.email)
        flash("Your password has been reset. Please log in.")
        return redirect(url_for("auth.login"))
    return render_template("reset_password.html")
