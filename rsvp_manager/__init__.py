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

    from rsvp_manager.blueprints.api import api_bp
    app.register_blueprint(api_bp)
    csrf.exempt(api_bp)

    ASSET_VERSION = "64"

    @app.context_processor
    def inject_asset_version():
        return {"v": ASSET_VERSION}

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
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
        )
        if response.content_type and ("css" in response.content_type or "javascript" in response.content_type):
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    return app
