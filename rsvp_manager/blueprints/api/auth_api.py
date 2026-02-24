import secrets
from flask import request
from werkzeug.security import check_password_hash
from rsvp_manager.blueprints.api import api_bp, api_success, api_error
from rsvp_manager.extensions import db
from rsvp_manager.models import User


@api_bp.route("/auth/token", methods=["POST"])
def get_token():
    """Exchange email + password for an API token."""
    data = request.get_json()
    if not data:
        return api_error("Request body must be JSON", "INVALID_FORMAT", 400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return api_error("Email and password are required", "VALIDATION_ERROR", 400)

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return api_error("Invalid email or password", "AUTH_ERROR", 401)

    # Generate token if user doesn't have one yet
    if not user.api_token:
        user.api_token = secrets.token_urlsafe(32)
        db.session.commit()

    return api_success({
        "token": user.api_token,
        "user_id": user.id,
        "email": user.email,
    })
