import os
from datetime import timedelta


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)

    _database_url = os.environ.get("DATABASE_URL") or "sqlite:///rsvp.db"
    if _database_url.startswith("postgres://"):
        _database_url = _database_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = _database_url

    if _database_url.startswith("postgresql://"):
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_size": 5,
            "max_overflow": 10,
            "pool_recycle": 300,
        }

    APP_ENV = os.environ.get("APP_ENV", "production")

    RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
    EMAIL_DEFAULT_SENDER = os.environ.get("EMAIL_DEFAULT_SENDER", "onboarding@resend.dev")

    UMAMI_SCRIPT_URL = os.environ.get("UMAMI_SCRIPT_URL", "")
    UMAMI_WEBSITE_ID = os.environ.get("UMAMI_WEBSITE_ID", "")
    UMAMI_DOMAINS = os.environ.get("UMAMI_DOMAINS", "")

    if os.environ.get("DATABASE_URL"):
        _missing = [v for v in ("SECRET_KEY",) if not os.environ.get(v)]
        if _missing:
            raise RuntimeError(f"Missing required env vars for production: {', '.join(_missing)}")
        SECRET_KEY = os.environ["SECRET_KEY"]
        SESSION_COOKIE_SECURE = True
        REMEMBER_COOKIE_SECURE = True
    else:
        SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")


class TestConfig:
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = "test-secret"
    WTF_CSRF_ENABLED = False
    SERVER_NAME = "localhost"
    RESEND_API_KEY = "re_test_fake"
    EMAIL_DEFAULT_SENDER = "test@resend.dev"
    RATELIMIT_ENABLED = False
    APP_ENV = "staging"
