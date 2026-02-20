from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from rsvp_manager.services import guest_service

bp = Blueprint("guests", __name__)


@bp.route("/guests")
@login_required
def guests():
    all_guests = guest_service.get_user_guests(current_user.id)
    return render_template("guests.html", guests=all_guests)


@bp.route("/guest/add", methods=["POST"])
@login_required
def add_guest():
    guest_service.create_guest(current_user.id, request.form)
    return redirect(url_for("guests.guests"))


@bp.route("/guest/<int:guest_id>/edit", methods=["POST"])
@login_required
def edit_guest(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    guest_service.update_guest(guest, current_user.id, request.form)
    return redirect(url_for("guests.guests"))


@bp.route("/guest/<int:guest_id>/delete", methods=["POST"])
@login_required
def delete_guest(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    guest_service.delete_guest(guest)
    return redirect(url_for("guests.guests"))


@bp.route("/api/guest/<int:guest_id>/name", methods=["POST"])
@login_required
def update_guest_name(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json()
    guest_service.update_guest_name(
        guest, data.get("first_name", guest.first_name),
        data.get("last_name", guest.last_name or "")
    )
    return jsonify(ok=True, full_name=guest.full_name)


@bp.route("/api/guest/<int:guest_id>/gender", methods=["POST"])
@login_required
def update_guest_gender(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json()
    guest_service.update_guest_gender(guest, data.get("gender", guest.gender))
    return jsonify(ok=True)


@bp.route("/api/guest/<int:guest_id>/notes", methods=["POST"])
@login_required
def update_guest_notes(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json()
    guest_service.update_guest_notes(guest, data.get("notes", ""))
    return jsonify(ok=True)


@bp.route("/api/guest/<int:guest_id>/is-me", methods=["POST"])
@login_required
def update_guest_is_me(guest_id):
    guest = guest_service.get_owned_guest_or_404(guest_id, current_user.id)
    data = request.get_json()
    is_me = guest_service.update_guest_is_me(guest, current_user.id, data.get("is_me", False))
    return jsonify(ok=True, is_me=is_me)


@bp.route("/api/guests/bulk-create", methods=["POST"])
@login_required
def bulk_create_guests():
    data = request.get_json()
    added = guest_service.bulk_create_guests(current_user.id, data.get("guests", []))
    return jsonify(added=added)
