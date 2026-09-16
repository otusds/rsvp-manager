"""Per-event guest attributes: definitions, answers and the summary."""
from datetime import date, datetime, timezone

import pytest

from rsvp_manager.extensions import db
from rsvp_manager.models import (
    Event, EventAttribute, EventAttributeOption, Guest, Invitation,
    InvitationAttributeValue,
)
from rsvp_manager.services import attribute_service


@pytest.fixture()
def hunt(test_app, user):
    e = Event(user_id=user, name="Boxing Day Hunt", event_type="Hunt",
              date=date(2026, 12, 26), date_created=date.today())
    db.session.add(e)
    db.session.commit()
    return e


def _guest(user, first, last="Test"):
    g = Guest(user_id=user, first_name=first, last_name=last, gender="Male",
              date_created=datetime.now(timezone.utc))
    db.session.add(g)
    db.session.commit()
    return g


def _invite(event, guest, status="Attending"):
    inv = Invitation(event_id=event.id, guest_id=guest.id, status=status)
    db.session.add(inv)
    db.session.commit()
    return inv


class TestDefinitions:
    def test_create_with_options(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        assert attr.name == "Hunting"
        assert [o.label for o in attr.options] == ["Hunter", "Follower"]

    def test_options_are_trimmed_deduped_and_ordered(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(
            hunt, "Meal", ["  Lunch ", "Dinner", "lunch", "", "   ", "Lunch + Dinner"])
        assert [o.label for o in attr.options] == ["Lunch", "Dinner", "Lunch + Dinner"]

    def test_name_must_be_unique_per_event(self, test_app, user, hunt):
        attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        with pytest.raises(Exception):
            attribute_service.create_attribute(hunt, "Hunting", ["Follower"])

    def test_same_name_allowed_on_a_different_event(self, test_app, user, hunt):
        other = Event(user_id=user, name="Second", event_type="Hunt",
                      date=date(2027, 1, 1), date_created=date.today())
        db.session.add(other)
        db.session.commit()
        attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        attribute_service.create_attribute(other, "Hunting", ["Hunter"])
        assert len(attribute_service.get_attributes(other)) == 1

    def test_at_least_one_option_required(self, test_app, user, hunt):
        with pytest.raises(Exception):
            attribute_service.create_attribute(hunt, "Empty", ["  ", ""])

    def test_rename_option_keeps_guest_answers(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        inv = _invite(hunt, _guest(user, "Ann"))
        attribute_service.set_value(inv, attr, attr.options[1].id)

        attribute_service.rename_option(attr.options[1], "Non-hunter")

        assert inv.value_for(attr.id).label == "Non-hunter", (
            "renaming an option must not unset the guests who chose it"
        )

    def test_deleting_an_attribute_removes_its_answers(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        inv = _invite(hunt, _guest(user, "Ann"))
        attribute_service.set_value(inv, attr, attr.options[0].id)
        attr_id = attr.id

        attribute_service.delete_attribute(attr)

        assert db.session.get(EventAttribute, attr_id) is None
        assert InvitationAttributeValue.query.filter_by(attribute_id=attr_id).count() == 0

    def test_deleting_the_event_removes_its_attributes(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        attr_id, event_id = attr.id, hunt.id
        db.session.delete(hunt)
        db.session.commit()
        assert db.session.get(EventAttribute, attr_id) is None
        assert EventAttributeOption.query.filter_by(attribute_id=attr_id).count() == 0


class TestDefaultsPerEventType:
    def test_hunt_gets_the_hunting_attribute(self, test_app, user, hunt):
        created = attribute_service.apply_defaults_for_type(hunt)
        assert len(created) == 1
        assert created[0].name == "Hunting"
        assert [o.label for o in created[0].options] == ["Hunter", "Follower"]

    def test_other_types_get_nothing(self, test_app, user):
        party = Event(user_id=user, name="Party", event_type="Party",
                      date=date(2026, 6, 1), date_created=date.today())
        db.session.add(party)
        db.session.commit()
        assert attribute_service.apply_defaults_for_type(party) == []

    def test_applying_twice_does_not_duplicate(self, test_app, user, hunt):
        attribute_service.apply_defaults_for_type(hunt)
        attribute_service.apply_defaults_for_type(hunt)
        assert len(attribute_service.get_attributes(hunt)) == 1


class TestGuestAnswers:
    def test_set_change_and_clear(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        hunter, follower = attr.options
        inv = _invite(hunt, _guest(user, "Ann"))

        assert inv.value_for(attr.id) is None, "starts not set"

        attribute_service.set_value(inv, attr, hunter.id)
        assert inv.value_for(attr.id).label == "Hunter"

        attribute_service.set_value(inv, attr, follower.id)
        assert inv.value_for(attr.id).label == "Follower", "changing replaces, not duplicates"
        assert InvitationAttributeValue.query.filter_by(invitation_id=inv.id).count() == 1

        attribute_service.set_value(inv, attr, None)
        assert inv.value_for(attr.id) is None, "clearing returns to not set"

    def test_option_from_another_attribute_is_rejected(self, test_app, user, hunt):
        hunting = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        meal = attribute_service.create_attribute(hunt, "Meal", ["Lunch"])
        inv = _invite(hunt, _guest(user, "Ann"))
        with pytest.raises(Exception):
            attribute_service.set_value(inv, hunting, meal.options[0].id)

    def test_attribute_from_another_event_is_rejected(self, test_app, user, hunt):
        other = Event(user_id=user, name="Other", event_type="Hunt",
                      date=date(2027, 2, 2), date_created=date.today())
        db.session.add(other)
        db.session.commit()
        foreign = attribute_service.create_attribute(other, "Hunting", ["Hunter"])
        inv = _invite(hunt, _guest(user, "Ann"))
        with pytest.raises(Exception):
            attribute_service.set_value(inv, foreign, foreign.options[0].id)

    def test_answers_do_not_leak_between_events(self, test_app, user, hunt):
        """The same person can be a Hunter here and a Follower there."""
        other = Event(user_id=user, name="Other", event_type="Hunt",
                      date=date(2027, 3, 3), date_created=date.today())
        db.session.add(other)
        db.session.commit()
        guest = _guest(user, "Ann")
        a1 = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        a2 = attribute_service.create_attribute(other, "Hunting", ["Hunter", "Follower"])
        i1, i2 = _invite(hunt, guest), _invite(other, guest)

        attribute_service.set_value(i1, a1, a1.options[0].id)
        attribute_service.set_value(i2, a2, a2.options[1].id)

        assert i1.value_for(a1.id).label == "Hunter"
        assert i2.value_for(a2.id).label == "Follower"

    def test_removing_a_guest_removes_their_answers(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        inv = _invite(hunt, _guest(user, "Ann"))
        attribute_service.set_value(inv, attr, attr.options[0].id)
        inv_id = inv.id
        db.session.delete(inv)
        db.session.commit()
        assert InvitationAttributeValue.query.filter_by(invitation_id=inv_id).count() == 0


class TestBulkAssign:
    def test_sets_many_and_reports_only_what_changed(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        hunter = attr.options[0]
        invs = [_invite(hunt, _guest(user, f"G{i}")) for i in range(4)]

        changed = attribute_service.bulk_set_value(hunt, [i.id for i in invs], attr, hunter.id)
        assert len(changed) == 4

        again = attribute_service.bulk_set_value(hunt, [i.id for i in invs], attr, hunter.id)
        assert again == [], "setting the same value again changes nothing"

        cleared = attribute_service.bulk_set_value(hunt, [i.id for i in invs], attr, None)
        assert len(cleared) == 4

    def test_ignores_invitations_from_another_event(self, test_app, user, hunt):
        other = Event(user_id=user, name="Other", event_type="Hunt",
                      date=date(2027, 4, 4), date_created=date.today())
        db.session.add(other)
        db.session.commit()
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        mine = _invite(hunt, _guest(user, "Mine"))
        theirs = _invite(other, _guest(user, "Theirs"))

        changed = attribute_service.bulk_set_value(
            hunt, [mine.id, theirs.id], attr, attr.options[0].id)

        assert changed == [mine.id]
        assert theirs.value_for(attr.id) is None


class TestSummary:
    def test_counts_by_option_and_status(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        hunter, follower = attr.options

        for name, status, option in [
            ("A", "Attending", hunter), ("B", "Attending", hunter),
            ("C", "Pending", hunter), ("D", "Attending", follower),
            ("E", "Declined", follower), ("F", "Attending", None),
            ("G", "Not Sent", hunter),
        ]:
            inv = _invite(hunt, _guest(user, name), status)
            if option:
                attribute_service.set_value(inv, attr, option.id)

        summary = attribute_service.summarize(hunt)
        assert len(summary) == 1
        rows = {r["label"]: r for r in summary[0]["rows"]}

        assert rows["Hunter"]["attending"] == 2
        assert rows["Hunter"]["pending"] == 1
        assert rows["Hunter"]["invited"] == 3, "'Not Sent' is excluded from Invited"
        assert rows["Follower"]["attending"] == 1
        assert rows["Follower"]["declined"] == 1
        assert rows["Not set"]["attending"] == 1
        assert summary[0]["totals"]["attending"] == 4

    def test_rows_add_up_to_the_total(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter", "Follower"])
        for i, opt in enumerate([attr.options[0], attr.options[1], None, attr.options[0]]):
            inv = _invite(hunt, _guest(user, f"G{i}"))
            if opt:
                attribute_service.set_value(inv, attr, opt.id)

        summary = attribute_service.summarize(hunt)[0]
        for key in ("attending", "pending", "declined", "invited"):
            assert sum(r[key] for r in summary["rows"]) == summary["totals"][key], (
                f"the {key} column must add up to the total row"
            )

    def test_not_set_row_is_hidden_when_everyone_is_set(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        inv = _invite(hunt, _guest(user, "A"))
        attribute_service.set_value(inv, attr, attr.options[0].id)
        labels = [r["label"] for r in attribute_service.summarize(hunt)[0]["rows"]]
        assert "Not set" not in labels

    def test_trashed_guests_are_excluded(self, test_app, user, hunt):
        attr = attribute_service.create_attribute(hunt, "Hunting", ["Hunter"])
        guest = _guest(user, "Gone")
        inv = _invite(hunt, guest)
        attribute_service.set_value(inv, attr, attr.options[0].id)

        guest.deleted_at = datetime.now(timezone.utc)
        db.session.commit()

        rows = {r["label"]: r for r in attribute_service.summarize(hunt)[0]["rows"]}
        assert rows["Hunter"]["attending"] == 0

    def test_no_attributes_means_no_summary(self, test_app, user, hunt):
        assert attribute_service.summarize(hunt) == []
