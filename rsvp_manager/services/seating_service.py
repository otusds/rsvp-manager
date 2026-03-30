import random
from rsvp_manager.extensions import db
from rsvp_manager.models import SeatingTable, SeatAssignment, Invitation, TABLE_SHAPES
from rsvp_manager.services.history_service import log_action


def get_seating_plan(event):
    """Return full seating plan: tables with their seat assignments."""
    tables = SeatingTable.query.filter_by(event_id=event.id).order_by(
        SeatingTable.table_number
    ).all()
    return tables


def get_next_table_number(event_id):
    max_num = db.session.query(db.func.max(SeatingTable.table_number)).filter_by(
        event_id=event_id
    ).scalar()
    return (max_num or 0) + 1


def create_table(event, label="", shape="rectangular", capacity=12, acting_user_id=None):
    if shape not in TABLE_SHAPES:
        raise ValueError(f"Invalid shape: {shape}")
    if capacity < 2 or capacity > 30:
        raise ValueError("Capacity must be between 2 and 30")

    table_number = get_next_table_number(event.id)
    table = SeatingTable(
        event_id=event.id,
        table_number=table_number,
        label=label.strip()[:100] if label else "",
        shape=shape,
        capacity=capacity,
    )
    db.session.add(table)
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.commit()
    return table


def update_table(table, label=None, shape=None, capacity=None, acting_user_id=None):
    if label is not None:
        table.label = label.strip()[:100]
    if shape is not None:
        if shape not in TABLE_SHAPES:
            raise ValueError(f"Invalid shape: {shape}")
        table.shape = shape
    if capacity is not None:
        if capacity < 2 or capacity > 30:
            raise ValueError("Capacity must be between 2 and 30")
        # Remove seat assignments that exceed new capacity
        if capacity < table.capacity:
            excess = SeatAssignment.query.filter(
                SeatAssignment.table_id == table.id,
                SeatAssignment.seat_position > capacity
            ).all()
            for sa in excess:
                db.session.delete(sa)
        table.capacity = capacity
    log_action(table.event.user_id, "updated_seating", "event", table.event_id,
               f"Changes to seating plan for {table.event.name}", acting_user_id=acting_user_id)
    db.session.commit()
    return table


def delete_table(table, acting_user_id=None):
    event = table.event
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.delete(table)
    db.session.commit()


def assign_seat(event, invitation_id, table_id, seat_position, acting_user_id=None):
    """Assign a guest (via invitation) to a specific seat at a table."""
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        raise ValueError("Table not found")

    invitation = Invitation.query.filter_by(id=invitation_id, event_id=event.id).first()
    if not invitation:
        raise ValueError("Invitation not found")

    if seat_position < 1 or seat_position > table.capacity:
        raise ValueError("Invalid seat position")

    # Check seat not already taken by someone else
    existing_at_seat = SeatAssignment.query.filter_by(
        table_id=table_id, seat_position=seat_position
    ).first()
    if existing_at_seat:
        if existing_at_seat.invitation_id == invitation_id:
            return existing_at_seat  # Already there
        raise ValueError("Seat is already occupied")

    # Remove any existing assignment for this invitation
    existing_for_guest = SeatAssignment.query.filter_by(invitation_id=invitation_id).first()
    if existing_for_guest:
        db.session.delete(existing_for_guest)

    assignment = SeatAssignment(
        table_id=table_id,
        invitation_id=invitation_id,
        seat_position=seat_position,
    )
    db.session.add(assignment)
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.commit()
    return assignment


def unseat_guest(event, assignment_id, acting_user_id=None):
    assignment = SeatAssignment.query.get(assignment_id)
    if not assignment or assignment.table.event_id != event.id:
        raise ValueError("Assignment not found")
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.delete(assignment)
    db.session.commit()


def clear_table_seats(table, acting_user_id=None):
    SeatAssignment.query.filter_by(table_id=table.id).delete()
    log_action(table.event.user_id, "updated_seating", "event", table.event_id,
               f"Changes to seating plan for {table.event.name}", acting_user_id=acting_user_id)
    db.session.commit()


def clear_all_seating(event, acting_user_id=None):
    table_ids = [t.id for t in SeatingTable.query.filter_by(event_id=event.id).all()]
    if table_ids:
        SeatAssignment.query.filter(SeatAssignment.table_id.in_(table_ids)).delete()
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.commit()


def get_unseated_attending(event):
    """Get attending invitations that don't have a seat assignment."""
    seated_inv_ids = db.session.query(SeatAssignment.invitation_id).join(
        SeatingTable
    ).filter(SeatingTable.event_id == event.id)

    return Invitation.query.filter(
        Invitation.event_id == event.id,
        Invitation.status == "Attending",
        ~Invitation.id.in_(seated_inv_ids.subquery().select())
    ).all()


def auto_assign(event, mode="random", acting_user_id=None):
    """Auto-assign unseated attending guests to empty seats.

    Modes:
      - 'random': random distribution
      - 'alternating': maximize M/F alternation, minimize same-gender runs
    """
    tables = SeatingTable.query.filter_by(event_id=event.id).order_by(
        SeatingTable.table_number
    ).all()
    if not tables:
        raise ValueError("No tables exist. Add tables first.")

    unseated = get_unseated_attending(event)
    if not unseated:
        raise ValueError("No unseated attending guests to assign.")

    # Build list of empty seats per table
    table_empty_seats = {}
    for table in tables:
        taken = {sa.seat_position for sa in table.seat_assignments}
        empty = [p for p in range(1, table.capacity + 1) if p not in taken]
        if empty:
            table_empty_seats[table.id] = (table, empty)

    total_empty = sum(len(seats) for _, seats in table_empty_seats.values())
    if total_empty == 0:
        raise ValueError("No empty seats available.")

    if mode == "random":
        _auto_assign_random(unseated, table_empty_seats)
    elif mode == "alternating":
        _auto_assign_alternating(unseated, table_empty_seats, tables)
    else:
        raise ValueError(f"Unknown mode: {mode}")

    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.commit()


def _auto_assign_random(unseated, table_empty_seats):
    """Randomly distribute guests across empty seats."""
    random.shuffle(unseated)
    # Flatten empty seats
    all_seats = []
    for table, empty in table_empty_seats.values():
        for pos in empty:
            all_seats.append((table.id, pos))
    random.shuffle(all_seats)

    for inv, (table_id, pos) in zip(unseated, all_seats):
        db.session.add(SeatAssignment(
            table_id=table_id, invitation_id=inv.id, seat_position=pos
        ))


def _auto_assign_alternating(unseated, table_empty_seats, tables):
    """Assign guests alternating M/F, minimizing same-gender runs.

    Strategy:
    1. Separate guests into M and F, shuffle each
    2. Distribute minority gender evenly across tables
    3. Fill seats alternating, spacing minority as breakers
    """
    males = [inv for inv in unseated if inv.guest.gender == "Male"]
    females = [inv for inv in unseated if inv.guest.gender == "Female"]
    random.shuffle(males)
    random.shuffle(females)

    # Determine majority/minority
    if len(males) >= len(females):
        majority, minority = males, females
        maj_gender, min_gender = "Male", "Female"
    else:
        majority, minority = females, males
        maj_gender, min_gender = "Female", "Male"

    # For each table, get empty seats and any already-seated guests (for context)
    table_info = []
    for table in tables:
        if table.id not in table_empty_seats:
            continue
        _, empty_positions = table_empty_seats[table.id]
        # Existing assignments for alternation context
        existing = {}
        for sa in table.seat_assignments:
            existing[sa.seat_position] = sa.invitation.guest.gender
        table_info.append({
            "table": table,
            "empty": sorted(empty_positions),
            "existing": existing,
            "capacity": table.capacity,
        })

    if not table_info:
        return

    # Distribute minority evenly across tables proportional to empty seats
    total_empty = sum(len(t["empty"]) for t in table_info)
    minority_remaining = list(minority)
    majority_remaining = list(majority)

    # Calculate how many minority to give each table
    minority_per_table = []
    for t in table_info:
        n_empty = len(t["empty"])
        # Proportional allocation
        if total_empty > 0:
            share = round(len(minority) * n_empty / total_empty)
        else:
            share = 0
        minority_per_table.append(min(share, n_empty))

    # Adjust to not exceed available minority
    while sum(minority_per_table) > len(minority_remaining):
        # Remove from table with most allocation
        idx = minority_per_table.index(max(minority_per_table))
        minority_per_table[idx] -= 1
    while sum(minority_per_table) < len(minority_remaining) and sum(minority_per_table) < total_empty:
        # Add to table with most empty seats relative to allocation
        best = -1
        best_ratio = -1
        for i, t in enumerate(table_info):
            remaining = len(t["empty"]) - minority_per_table[i]
            if remaining > 0 and (best == -1 or remaining > best_ratio):
                best = i
                best_ratio = remaining
        if best == -1:
            break
        minority_per_table[best] += 1

    # Now assign to each table
    for i, t in enumerate(table_info):
        n_minority = minority_per_table[i]
        n_majority = len(t["empty"]) - n_minority

        # Take guests from pools
        table_minority = minority_remaining[:n_minority]
        minority_remaining = minority_remaining[n_minority:]
        table_majority = majority_remaining[:n_majority]
        majority_remaining = majority_remaining[n_majority:]

        # Interleave for best alternation
        arranged = _interleave_for_table(
            table_minority, table_majority, t["empty"], t["existing"], t["table"]
        )
        for inv, pos in arranged:
            db.session.add(SeatAssignment(
                table_id=t["table"].id, invitation_id=inv.id, seat_position=pos
            ))

    # Assign any remaining guests (if rounding left some unassigned)
    leftover = minority_remaining + majority_remaining
    if leftover:
        all_remaining_seats = []
        for t in table_info:
            assigned_positions = {a[1] for a in _get_new_assignments_for_table(t["table"].id)}
            for pos in t["empty"]:
                if pos not in assigned_positions:
                    all_remaining_seats.append((t["table"].id, pos))
        for inv, (tid, pos) in zip(leftover, all_remaining_seats):
            db.session.add(SeatAssignment(
                table_id=tid, invitation_id=inv.id, seat_position=pos
            ))


def _get_new_assignments_for_table(table_id):
    """Get pending (not yet committed) assignments for a table from the session."""
    assignments = []
    for obj in db.session.new:
        if isinstance(obj, SeatAssignment) and obj.table_id == table_id:
            assignments.append((obj.invitation_id, obj.seat_position))
    return assignments


def _interleave_for_table(minority_guests, majority_guests, empty_positions, existing, table):
    """Place guests in empty positions, alternating genders.

    For the empty seats, arrange so minority guests are evenly spaced
    among majority guests, minimizing the longest same-gender run.
    """
    total = len(minority_guests) + len(majority_guests)
    if total == 0:
        return []

    # Build an arrangement sequence: interleave minority as evenly as possible
    sequence = []
    n_min = len(minority_guests)
    n_maj = len(majority_guests)

    if n_min == 0:
        sequence = list(majority_guests)
    elif n_maj == 0:
        sequence = list(minority_guests)
    else:
        # Place minority at evenly-spaced intervals among majority
        # E.g., 2 minority among 6 majority -> M m M M m M M M
        # The minority acts as "breakers" to prevent long same-gender runs
        sequence = []
        min_idx = 0
        maj_idx = 0

        # Calculate spacing: place a minority guest every N positions
        spacing = total / n_min  # e.g., 8 total / 2 minority = every 4 positions

        for pos_idx in range(total):
            # Place minority at evenly distributed positions
            # A minority goes at positions: spacing/2, spacing/2 + spacing, ...
            expected_minority_count = int((pos_idx + spacing / 2) / spacing)
            if min_idx < n_min and expected_minority_count > min_idx:
                sequence.append(minority_guests[min_idx])
                min_idx += 1
            elif maj_idx < n_maj:
                sequence.append(majority_guests[maj_idx])
                maj_idx += 1
            elif min_idx < n_min:
                sequence.append(minority_guests[min_idx])
                min_idx += 1

    # Map sequence to empty positions
    result = list(zip(sequence, sorted(empty_positions)))
    return result


def serialize_seating_plan(event):
    """Serialize complete seating plan for API response."""
    tables = get_seating_plan(event)
    unseated = get_unseated_attending(event)

    return {
        "tables": [_serialize_table(t) for t in tables],
        "unseated": [_serialize_unseated_inv(inv) for inv in unseated],
    }


def _serialize_table(table):
    seats = {}
    for sa in table.seat_assignments:
        guest = sa.invitation.guest
        seats[str(sa.seat_position)] = {
            "assignment_id": sa.id,
            "invitation_id": sa.invitation_id,
            "guest_id": guest.id,
            "first_name": guest.first_name,
            "last_name": guest.last_name or "",
            "gender": guest.gender,
            "full_name": guest.full_name,
        }
    return {
        "id": table.id,
        "table_number": table.table_number,
        "label": table.label or "",
        "shape": table.shape,
        "capacity": table.capacity,
        "seats": seats,
    }


def _serialize_unseated_inv(inv):
    return {
        "invitation_id": inv.id,
        "guest_id": inv.guest.id,
        "first_name": inv.guest.first_name,
        "last_name": inv.guest.last_name or "",
        "gender": inv.guest.gender,
        "full_name": inv.guest.full_name,
    }
