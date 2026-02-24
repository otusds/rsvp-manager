import logging
import os

from flask import Flask
from rsvp_manager.config import Config
from rsvp_manager.extensions import db, migrate, login_manager, csrf, mail


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
    mail.init_app(app)

    login_manager.login_view = "auth.login"

    from rsvp_manager.blueprints import auth, events, guests, invitations, exports, settings, errors
    app.register_blueprint(auth.bp)
    app.register_blueprint(events.bp)
    app.register_blueprint(guests.bp)
    app.register_blueprint(invitations.bp)
    app.register_blueprint(exports.bp)
    app.register_blueprint(settings.bp)
    app.register_blueprint(errors.bp)

    from rsvp_manager.blueprints.api import api_bp
    app.register_blueprint(api_bp)
    csrf.exempt(api_bp)

    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
        )
        return response

    return app
