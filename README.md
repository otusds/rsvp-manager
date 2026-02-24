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
| `FLASK_DEBUG` | No | Set to `1` to enable debug mode (local dev only). |

## Tech Stack

- Flask + SQLite (via Flask-SQLAlchemy) / PostgreSQL in production
- Flask-Login for authentication
- Jinja2 templates, vanilla JS
- openpyxl for Excel export
