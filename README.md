# RSVP Manager

A simple web app to manage events, guests, and invitations.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

## Test Account

A pre-created account with sample data (4 events, 12 guests, 23 invitations):

- **Email:** test@test.com
- **Password:** 123456

Or sign up for a new account — check "Load sample data" to populate it automatically.

## Tech Stack

- Flask + SQLite (via Flask-SQLAlchemy)
- Flask-Login for authentication
- Jinja2 templates, vanilla JS
- openpyxl for Excel export
