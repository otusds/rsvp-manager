import pytest
from app import app, db, User, Event, Guest, Invitation
from werkzeug.security import generate_password_hash
from datetime import date, datetime


@pytest.fixture()
def test_app():
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"  # in-memory
    app.config["SECRET_KEY"] = "test-secret"
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["SERVER_NAME"] = "localhost"

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(test_app):
    return test_app.test_client()


@pytest.fixture()
def user(test_app):
    with test_app.app_context():
        u = User(email="test@test.com", password_hash=generate_password_hash("password123"))
        db.session.add(u)
        db.session.commit()
        return u.id


@pytest.fixture()
def user2(test_app):
    with test_app.app_context():
        u = User(email="other@test.com", password_hash=generate_password_hash("password123"))
        db.session.add(u)
        db.session.commit()
        return u.id


@pytest.fixture()
def logged_in_client(client, user):
    client.post("/login", data={"email": "test@test.com", "password": "password123"})
    return client


@pytest.fixture()
def sample_event(test_app, user):
    with test_app.app_context():
        e = Event(
            user_id=user, name="Test Event", event_type="Dinner",
            location="Test Location", date=date(2026, 6, 15),
            date_created=date.today(), notes="Test notes", target_attendees=10
        )
        db.session.add(e)
        db.session.commit()
        return e.id


@pytest.fixture()
def sample_guest(test_app, user):
    with test_app.app_context():
        g = Guest(
            user_id=user, first_name="Alice", last_name="Smith",
            gender="Female", notes="Test guest", date_created=datetime.now()
        )
        db.session.add(g)
        db.session.commit()
        return g.id


@pytest.fixture()
def sample_invitation(test_app, sample_event, sample_guest):
    with test_app.app_context():
        inv = Invitation(
            event_id=sample_event, guest_id=sample_guest,
            status="Not Sent"
        )
        db.session.add(inv)
        db.session.commit()
        return inv.id
