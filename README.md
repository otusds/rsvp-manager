# RSVP Manager

A simple web app to manage events, guests, and invitations.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000 and sign up for an account. Load sample data from the Settings page.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes (production) | Flask session secret. Required when `DATABASE_URL` is set. |
| `DATABASE_URL` | No | PostgreSQL connection string. Falls back to local SQLite. |
| `RESEND_API_KEY` | Yes (production) | Resend API key. Without it every email fails: signup verification, password reset and email change. |
| `EMAIL_DEFAULT_SENDER` | No | From-address for outgoing mail. Defaults to `onboarding@resend.dev`. |
| `ADMIN_EMAILS` | No | Comma-separated emails granted admin access (`/admin`, the database browser and the stats API). Empty means nobody is an admin. |
| `APP_ENV` | No | `production` (default) or `staging`. Staging shows the TEST badge and enables the sample-data buttons in Settings. |
| `TRUST_PROXY_HEADERS` | No | Trust `X-Forwarded-For`/`-Proto`. Defaults on when `DATABASE_URL` is set. Required behind a proxy or rate limiting buckets every client together. |
| `SENTRY_DSN` | No | Enables Sentry error reporting. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Sentry trace sampling, default `0.1`. |
| `UMAMI_SCRIPT_URL` | No | Umami analytics script URL. Analytics are off unless set. |
| `UMAMI_WEBSITE_ID` | No | Umami site ID. |
| `UMAMI_DOMAINS` | No | Domains Umami should track. |
| `FLASK_DEBUG` | No | Set to `1` to enable debug mode (local dev only). |

## Deploying

Branches map to environments:

| Branch | Environment | Notes |
|--------|-------------|-------|
| `claude/*` | — | One branch per change, cut from `test`. |
| `test` | Test / staging | `APP_ENV=staging`. CI runs on every push. |
| `main` | Production | Promoted from `test` by pull request. |

The flow is: branch off `test` → merge into `test` → check it in the test
environment (look for the TEST badge) → open a `test` → `main` pull request.
Deploys run `flask db upgrade` on boot (see `Procfile`), so migrations apply
themselves; take a database snapshot before promoting a schema change.

### Known operational limits

Rate limiting uses Flask-Limiter's in-memory storage, so counters are per
gunicorn worker (the `Procfile` runs 2) and reset on every deploy. Effective
limits are roughly double those declared. Point the limiter at Redis if you
need them enforced exactly.

## Tech Stack

- Flask + SQLite (via Flask-SQLAlchemy) / PostgreSQL in production
- Flask-Login for authentication
- Jinja2 templates, vanilla JS
- openpyxl for Excel export
