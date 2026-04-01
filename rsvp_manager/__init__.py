import logging
import os

from flask import Flask, jsonify
from rsvp_manager.config import Config
from rsvp_manager.extensions import db, migrate, login_manager, csrf, limiter


def configure_logging(app):
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
    )
    handler.setFormatter(formatter)

    level = logging.DEBUG if app.debug else logging.INFO
    app.logger.setLevel(level)
    app.logger.addHandler(handler)


def init_sentry():
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    import sentry_sdk
    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        send_default_pii=False,
    )


def create_app(config_class=Config):
    init_sentry()

    app = Flask(__name__)
    app.config.from_object(config_class)

    configure_logging(app)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)

    login_manager.login_view = "auth.login"
    login_manager.login_message = None

    from rsvp_manager.blueprints import auth, events, friends, invitations, exports, settings, history, tags, trash, join, errors
    app.register_blueprint(auth.bp)
    app.register_blueprint(events.bp)
    app.register_blueprint(friends.bp)
    app.register_blueprint(invitations.bp)
    app.register_blueprint(exports.bp)
    app.register_blueprint(settings.bp)
    app.register_blueprint(history.bp)
    app.register_blueprint(tags.bp)
    app.register_blueprint(trash.bp)
    app.register_blueprint(join.bp)
    app.register_blueprint(errors.bp)

    from rsvp_manager.blueprints import admin as admin_bp_module
    app.register_blueprint(admin_bp_module.bp)

    from rsvp_manager.blueprints.api import api_bp
    app.register_blueprint(api_bp)
    csrf.exempt(api_bp)

    # Flask-Admin (database browser)
    from flask_admin import Admin
    from rsvp_manager.admin_views import (
        ProtectedAdminIndex, UserView, EventView, GuestView,
        InvitationView, TagView, EventCohostView, ActivityLogView,
    )
    from rsvp_manager.models import (
        User, Event, Guest, Invitation, Tag, EventCohost, ActivityLog,
    )
    flask_admin = Admin(
        app, name="GuestCheck Admin", index_view=ProtectedAdminIndex(url="/admin/db"),
    )
    flask_admin.add_view(UserView(User, db.session, name="Users", endpoint="admin_users"))
    flask_admin.add_view(EventView(Event, db.session, name="Events", endpoint="admin_events"))
    flask_admin.add_view(GuestView(Guest, db.session, name="Guests", endpoint="admin_guests"))
    flask_admin.add_view(InvitationView(Invitation, db.session, name="Invitations", endpoint="admin_invitations"))
    flask_admin.add_view(TagView(Tag, db.session, name="Tags", endpoint="admin_tags"))
    flask_admin.add_view(EventCohostView(EventCohost, db.session, name="Co-hosts", endpoint="admin_cohosts"))
    flask_admin.add_view(ActivityLogView(ActivityLog, db.session, name="Activity Log", endpoint="admin_activity"))

    ASSET_VERSION = "74"

    @app.context_processor
    def inject_globals():
        from flask import session, has_request_context
        track_event = ""
        if has_request_context():
            track_event = session.pop("_track", "")
        return {
            "v": ASSET_VERSION,
            "umami_script_url": app.config.get("UMAMI_SCRIPT_URL", ""),
            "umami_website_id": app.config.get("UMAMI_WEBSITE_ID", ""),
            "umami_domains": app.config.get("UMAMI_DOMAINS", ""),
            "track_event": track_event,
        }

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"})

    @app.route("/offline")
    def offline():
        from flask import render_template
        return render_template("offline.html")

    @app.route("/privacy")
    def privacy():
        from flask import render_template
        return render_template("privacy.html")

    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        umami_src = app.config.get("UMAMI_SCRIPT_URL", "")
        script_src = "'self'"
        connect_src = "'self'"
        if umami_src:
            from urllib.parse import urlparse
            umami_origin = urlparse(umami_src).scheme + "://" + urlparse(umami_src).netloc
            script_src += " " + umami_origin
            connect_src += " " + umami_origin
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self'; script-src {script_src}; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            f"img-src 'self' data:; connect-src {connect_src}; frame-ancestors 'none'"
        )
        if response.content_type and ("css" in response.content_type or "javascript" in response.content_type):
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    return app
