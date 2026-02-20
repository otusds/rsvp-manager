from flask import Flask
from rsvp_manager.config import Config
from rsvp_manager.extensions import db, migrate, login_manager, csrf


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    login_manager.login_view = "auth.login"

    from rsvp_manager.blueprints import auth, events, guests, invitations, exports, settings, errors
    app.register_blueprint(auth.bp)
    app.register_blueprint(events.bp)
    app.register_blueprint(guests.bp)
    app.register_blueprint(invitations.bp)
    app.register_blueprint(exports.bp)
    app.register_blueprint(settings.bp)
    app.register_blueprint(errors.bp)

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
