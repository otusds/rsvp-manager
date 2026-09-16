"""Regression tests for the issues found in the 2026-09 application audit."""
from datetime import date, datetime, timezone

from rsvp_manager.extensions import db
from rsvp_manager.models import Event, Guest, Invitation, SeatingTable, SeatAssignment
from rsvp_manager.services import seating_service


def _attending(test_app, event_id, guest_id):
    inv = Invitation(event_id=event_id, guest_id=guest_id, status="Attending")
    db.session.add(inv)
    db.session.commit()
    return inv


class TestTrashedGuestsAreNotSeated:
    """A guest in the trash is hidden everywhere else; seating must agree."""

    def test_trashed_guest_drops_out_of_unseated(self, test_app, user, sample_event, sample_guest):
        _attending(test_app, sample_event, sample_guest)
        event = db.session.get(Event, sample_event)
        assert any(i.guest_id == sample_guest for i in seating_service.get_unseated_attending(event))

        db.session.get(Guest, sample_guest).deleted_at = datetime.now(timezone.utc)
        db.session.commit()

        unseated = seating_service.get_unseated_attending(event)
        assert not any(i.guest_id == sample_guest for i in unseated), (
            "a trashed guest still appears in the unseated list and would be "
            "handed a chair by auto-assign"
        )

    def test_trashed_guest_drops_off_the_chart(self, test_app, user, sample_event, sample_guest):
        inv = _attending(test_app, sample_event, sample_guest)
        table = SeatingTable(event_id=sample_event, table_number=1, capacity=8, shape="round")
        db.session.add(table)
        db.session.commit()
        db.session.add(SeatAssignment(table_id=table.id, invitation_id=inv.id, seat_position=0))
        db.session.commit()

        event = db.session.get(Event, sample_event)
        seats = seating_service.serialize_seating_plan(event)["tables"][0]["seats"]
        assert "0" in seats, "precondition: guest should be seated"

        db.session.get(Guest, sample_guest).deleted_at = datetime.now(timezone.utc)
        db.session.commit()

        seats = seating_service.serialize_seating_plan(event)["tables"][0]["seats"]
        assert "0" not in seats, "a trashed guest is still shown on the seating chart"

    def test_restoring_the_guest_puts_them_back_in_their_seat(self, test_app, user, sample_event, sample_guest):
        inv = _attending(test_app, sample_event, sample_guest)
        table = SeatingTable(event_id=sample_event, table_number=1, capacity=8, shape="round")
        db.session.add(table)
        db.session.commit()
        db.session.add(SeatAssignment(table_id=table.id, invitation_id=inv.id, seat_position=3))
        db.session.commit()

        guest = db.session.get(Guest, sample_guest)
        guest.deleted_at = datetime.now(timezone.utc)
        db.session.commit()
        guest.deleted_at = None
        db.session.commit()

        event = db.session.get(Event, sample_event)
        seats = seating_service.serialize_seating_plan(event)["tables"][0]["seats"]
        assert seats["3"]["guest_id"] == sample_guest, (
            "restoring from the trash should return the guest to the same chair"
        )


class TestExportInvitedCount:
    """The export's 'Total Invited' must mean what the app means by 'Invited'."""

    def test_not_sent_is_excluded_and_row_adds_up(self, logged_in_client, test_app, user, sample_guest):
        import io
        import openpyxl

        e1 = Event(user_id=user, name="Sent", event_type="Dinner",
                   date=date(2026, 6, 1), date_created=date.today())
        e2 = Event(user_id=user, name="Unsent", event_type="Dinner",
                   date=date(2026, 7, 1), date_created=date.today())
        db.session.add_all([e1, e2])
        db.session.commit()
        db.session.add_all([
            Invitation(event_id=e1.id, guest_id=sample_guest, status="Attending"),
            Invitation(event_id=e2.id, guest_id=sample_guest, status="Not Sent"),
        ])
        db.session.commit()

        resp = logged_in_client.get("/export/friends")
        assert resp.status_code == 200
        ws = openpyxl.load_workbook(io.BytesIO(resp.data)).active
        header = [c.value for c in ws[1]]
        i_inv, i_att = header.index("Total Invited"), header.index("Total Attending")
        i_pen, i_dec = header.index("Total Pending"), header.index("Total Declined")

        row = next(r for r in ws.iter_rows(min_row=2, values_only=True) if r[1] == "Alice")
        assert row[i_inv] == 1, "'Not Sent' must not count towards Total Invited"
        assert row[i_inv] == row[i_att] + row[i_pen] + row[i_dec], (
            "Total Invited must equal Attending + Pending + Declined, or the "
            "spreadsheet visibly fails to add up"
        )


class TestPublicStatsAreAdminOnly:
    def test_anonymous_is_refused(self, client):
        assert client.get("/admin/api/stats").status_code in (302, 401, 403, 404)

    def test_non_admin_is_refused(self, logged_in_client):
        assert logged_in_client.get("/admin/api/stats").status_code in (302, 401, 403, 404)


class TestExportsDoNotScaleQueriesWithRowCount:
    """The exports used to run ~2 extra queries per friend (60 for 25 friends)."""

    def test_friends_export_query_count_is_flat(self, logged_in_client, test_app, user):
        from sqlalchemy import event as sa_event
        from sqlalchemy.engine import Engine

        def count_queries():
            seen = []

            def before(conn, cursor, statement, params, context, executemany):
                seen.append(statement)

            sa_event.listen(Engine, "before_cursor_execute", before)
            try:
                assert logged_in_client.get("/export/friends").status_code == 200
            finally:
                sa_event.remove(Engine, "before_cursor_execute", before)
            return len(seen)

        for i in range(3):
            db.session.add(Guest(user_id=user, first_name=f"G{i}", last_name="Small",
                                 gender="Female", date_created=datetime.now(timezone.utc)))
        db.session.commit()
        few = count_queries()

        for i in range(25):
            db.session.add(Guest(user_id=user, first_name=f"H{i}", last_name="Many",
                                 gender="Male", date_created=datetime.now(timezone.utc)))
        db.session.commit()
        many = count_queries()

        assert many <= few + 2, (
            f"export query count grew with row count ({few} -> {many}); the "
            f"eager-loading in exports.py has regressed into an N+1"
        )


class TestRemovingSeatedPeopleAndEvents:
    """Deleting anything that a seat assignment hangs off used to fail outright.

    seat_assignment.invitation_id and seating_table.event_id are both NOT NULL,
    and neither relationship cascaded, so SQLAlchemy tried to null them out and
    the database refused. Reported from the test environment as "I cannot remove
    a friend from an event, once he is seated at the table".
    """

    def _seated(self, user, label="Seated"):
        event = Event(user_id=user, name=label, event_type="Dinner",
                      date=date(2026, 12, 1), date_created=date.today())
        guest = Guest(user_id=user, first_name="Seat", last_name=label,
                      gender="Male", date_created=datetime.now(timezone.utc))
        db.session.add_all([event, guest])
        db.session.commit()
        inv = Invitation(event_id=event.id, guest_id=guest.id, status="Attending")
        db.session.add(inv)
        db.session.commit()
        table = SeatingTable(event_id=event.id, table_number=1, capacity=8, shape="round")
        db.session.add(table)
        db.session.commit()
        db.session.add(SeatAssignment(table_id=table.id, invitation_id=inv.id, seat_position=0))
        db.session.commit()
        return event, guest, inv, table

    def test_remove_seated_guest_from_event(self, test_app, user):
        from rsvp_manager.services import invitation_service

        event, guest, inv, table = self._seated(user, "RemoveInv")
        inv_id = inv.id
        invitation_service.remove_invitation(inv)
        assert db.session.get(Invitation, inv_id) is None
        assert SeatAssignment.query.filter_by(invitation_id=inv_id).count() == 0, (
            "the seat should be freed along with the invitation"
        )
        assert db.session.get(SeatingTable, table.id) is not None, "the table itself must survive"

    def test_delete_seated_guest(self, test_app, user):
        event, guest, inv, table = self._seated(user, "DelGuest")
        guest_id, inv_id = guest.id, inv.id
        db.session.delete(guest)
        db.session.commit()
        assert db.session.get(Guest, guest_id) is None
        assert SeatAssignment.query.filter_by(invitation_id=inv_id).count() == 0

    def test_delete_event_that_has_seating(self, test_app, user):
        event, guest, inv, table = self._seated(user, "DelEvent")
        event_id, table_id = event.id, table.id
        db.session.delete(event)
        db.session.commit()
        assert db.session.get(Event, event_id) is None
        assert db.session.get(SeatingTable, table_id) is None, "seating tables should go with the event"
        assert SeatAssignment.query.filter_by(table_id=table_id).count() == 0

    def test_delete_table_frees_its_seats_but_keeps_the_invitation(self, test_app, user):
        event, guest, inv, table = self._seated(user, "DelTable")
        inv_id = inv.id
        db.session.delete(table)
        db.session.commit()
        assert SeatAssignment.query.filter_by(invitation_id=inv_id).count() == 0
        assert db.session.get(Invitation, inv_id) is not None, (
            "removing a table must unseat people, not uninvite them"
        )


class TestDateFormatsAreUnified:
    """The app used to render the same kind of date four different ways.

    "16/09/2026" in the friend detail panel, "16 Sep 2026" on event cards,
    "16 September 2026" in email and ISO in spreadsheets. Everything a person
    reads is now "16 Sep 2026"; only exports stay ISO so they sort in Excel.
    """

    def test_helper_formats(self):
        from rsvp_manager.utils import format_date

        d = date(2026, 9, 6)
        assert format_date(d) == "06 Sep 2026"
        assert format_date(d, "iso") == "2026-09-06"
        assert format_date(None) == ""
        assert format_date(None, "iso") == ""

    def test_no_module_formats_dates_by_hand(self):
        """Every user-facing date must go through format_date, or they drift apart."""
        import re
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent / "rsvp_manager"
        offenders = []
        for py in root.rglob("*.py"):
            if py.name == "utils.py":
                continue  # the one place the formats are defined
            for i, line in enumerate(py.read_text().splitlines(), 1):
                if re.search(r'strftime\("%', line):
                    offenders.append(f"{py.relative_to(root)}:{i}: {line.strip()[:100]}")
        assert not offenders, (
            "hand-rolled date formatting found; call format_date() instead:\n  "
            + "\n  ".join(offenders)
        )
