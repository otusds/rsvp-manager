from flask import Blueprint, render_template, request, redirect, url_for
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from rsvp_manager.extensions import db
from rsvp_manager.models import User

bp = Blueprint("auth", __name__)


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
        login_user(user)
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
            return render_template("login.html", error="Invalid email or password")
        login_user(user)
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
