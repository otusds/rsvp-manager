from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from rsvp_manager.services import friend_service

bp = Blueprint("friends", __name__)


@bp.route("/friends")
@login_required
def friends():
    page = request.args.get("page", 1, type=int)
    show_archived = request.args.get("show_archived", "0")
    search = request.args.get("q", "").strip()
    pagination = friend_service.get_user_guests(current_user.id, page=page, show_archived=show_archived, search=search)
    if request.args.get("partial"):
        return render_template("partials/friend_rows.html", guests=pagination.items)
    has_any_friends = friend_service.get_user_guests(current_user.id, page=1, show_archived="1").total > 0 if not pagination.items else True
    return render_template("friends.html", guests=pagination.items, pagination=pagination, show_archived=show_archived, has_any_friends=has_any_friends)


@bp.route("/friend/add", methods=["POST"])
@login_required
def add_friend():
    friend_service.create_guest(current_user.id, request.form)
    return redirect(url_for("friends.friends"))


@bp.route("/friend/<int:guest_id>/edit", methods=["POST"])
@login_required
def edit_friend(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    friend_service.update_guest(guest, current_user.id, request.form)
    return redirect(url_for("friends.friends"))


@bp.route("/friend/<int:guest_id>/delete", methods=["POST"])
@login_required
def delete_friend(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    friend_service.delete_guest(guest)
    return redirect(url_for("friends.friends"))


@bp.route("/api/friend/<int:guest_id>/name", methods=["POST"])
@login_required
def update_friend_name(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json() or {}
    friend_service.update_guest_name(
        guest, data.get("first_name", guest.first_name),
        data.get("last_name", guest.last_name or "")
    )
    return jsonify(ok=True, full_name=guest.full_name)


@bp.route("/api/friend/<int:guest_id>/gender", methods=["POST"])
@login_required
def update_friend_gender(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json() or {}
    friend_service.update_guest_gender(guest, data.get("gender", guest.gender))
    return jsonify(ok=True)


@bp.route("/api/friend/<int:guest_id>/notes", methods=["POST"])
@login_required
def update_friend_notes(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json() or {}
    friend_service.update_guest_notes(guest, data.get("notes", ""))
    return jsonify(ok=True)


@bp.route("/api/friend/<int:guest_id>/is-me", methods=["POST"])
@login_required
def update_friend_is_me(guest_id):
    guest = friend_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json() or {}
    is_me = friend_service.update_guest_is_me(guest, current_user.id, data.get("is_me", False))
    return jsonify(ok=True, is_me=is_me)


@bp.route("/api/friends/bulk-create", methods=["POST"])
@login_required
def bulk_create_friends():
    data = request.get_json() or {}
    added = friend_service.bulk_create_guests(current_user.id, data.get("guests", []))
    return jsonify(added=added)
