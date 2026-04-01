"""Flask-Admin model views — read-only by default, admin-email gated."""

from flask import current_app, redirect, url_for
from flask_admin import AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user


def _is_admin():
    if not current_user.is_authenticated:
        return False
    admin_emails = current_app.config.get("ADMIN_EMAILS", [])
    return bool(admin_emails) and current_user.email.lower() in admin_emails


class ProtectedAdminIndex(AdminIndexView):
    @expose("/")
    def index(self):
        if not _is_admin():
            return redirect(url_for("events.home"))
        return redirect(url_for("admin_users.index_view"))


class ReadOnlyModelView(ModelView):
    """Base view: read-only, admin-only access."""
    can_create = False
    can_edit = False
    can_delete = False
    can_export = True
    page_size = 50

    def is_accessible(self):
        return _is_admin()

    def inaccessible_callback(self, name, **kwargs):
        return redirect(url_for("events.home"))


class UserView(ReadOnlyModelView):
    column_list = ["id", "email", "first_name", "last_name", "gender", "email_verified"]
    column_searchable_list = ["email", "first_name", "last_name"]
    column_filters = ["email_verified", "gender"]


class EventView(ReadOnlyModelView):
    column_list = ["id", "user_id", "name", "event_type", "location", "date", "date_created", "deleted_at"]
    column_searchable_list = ["name", "location"]
    column_filters = ["event_type", "deleted_at"]


class GuestView(ReadOnlyModelView):
    column_list = ["id", "user_id", "first_name", "last_name", "gender", "is_me", "is_archived", "deleted_at"]
    column_searchable_list = ["first_name", "last_name"]
    column_filters = ["gender", "is_me", "is_archived", "deleted_at"]


class InvitationView(ReadOnlyModelView):
    column_list = ["id", "event_id", "guest_id", "status", "date_invited", "date_responded", "added_by", "sent_by"]
    column_filters = ["status"]


class TagView(ReadOnlyModelView):
    column_list = ["id", "user_id", "name", "deleted_at"]
    column_searchable_list = ["name"]


class EventCohostView(ReadOnlyModelView):
    column_list = ["id", "event_id", "user_id", "role", "joined_at"]
    column_filters = ["role"]


class ActivityLogView(ReadOnlyModelView):
    column_list = ["id", "user_id", "action", "entity_type", "entity_id", "description", "created_at"]
    column_searchable_list = ["description"]
    column_filters = ["action", "entity_type"]
    column_default_sort = ("created_at", True)
