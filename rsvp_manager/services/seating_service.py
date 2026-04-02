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


def _smart_capacity(guest_count):
    """Return the smallest standard capacity that fits the guest count."""
    options = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30]
    # Round up to next even
    cap = guest_count if guest_count % 2 == 0 else guest_count + 1
    for opt in options:
        if opt >= cap:
            return opt
    return 30


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


def swap_seats(event, assignment_id_a, assignment_id_b, acting_user_id=None):
    """Swap two seated guests."""
    a = db.session.get(SeatAssignment, assignment_id_a)
    b = db.session.get(SeatAssignment, assignment_id_b)
    if not a or not b:
        raise ValueError("Assignment not found")
    if a.table.event_id != event.id or b.table.event_id != event.id:
        raise ValueError("Assignment not found")
    # Swap positions and tables
    a.table_id, b.table_id = b.table_id, a.table_id
    a.seat_position, b.seat_position = b.seat_position, a.seat_position
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.commit()


def unseat_guest(event, assignment_id, acting_user_id=None):
    assignment = db.session.get(SeatAssignment, assignment_id)
    if not assignment or assignment.table.event_id != event.id:
        raise ValueError("Assignment not found")
    log_action(event.user_id, "updated_seating", "event", event.id,
               f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
    db.session.delete(assignment)
    db.session.commit()


def toggle_lock(event, assignment_id, acting_user_id=None):
    """Toggle lock on a seat assignment."""
    assignment = db.session.get(SeatAssignment, assignment_id)
    if not assignment or assignment.table.event_id != event.id:
        raise ValueError("Assignment not found")
    assignment.is_locked = not assignment.is_locked
    db.session.commit()
    return assignment


def lock_table(event, table_id, lock=True, acting_user_id=None):
    """Lock or unlock all seats at a table."""
    table = SeatingTable.query.filter_by(id=table_id, event_id=event.id).first()
    if not table:
        raise ValueError("Table not found")
    for sa in table.seat_assignments:
        sa.is_locked = lock
    db.session.commit()


def clear_table_seats(table, include_locked=False, acting_user_id=None):
    q = SeatAssignment.query.filter_by(table_id=table.id)
    if not include_locked:
        q = q.filter_by(is_locked=False)
    q.delete()
    log_action(table.event.user_id, "updated_seating", "event", table.event_id,
               f"Changes to seating plan for {table.event.name}", acting_user_id=acting_user_id)
    db.session.commit()


def clear_all_seating(event, include_locked=False, acting_user_id=None):
    table_ids = [t.id for t in SeatingTable.query.filter_by(event_id=event.id).all()]
    if table_ids:
        q = SeatAssignment.query.filter(SeatAssignment.table_id.in_(table_ids))
        if not include_locked:
            q = q.filter_by(is_locked=False)
        q.delete()
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

    unseated = get_unseated_attending(event)
    if not unseated:
        raise ValueError("No unseated attending guests to assign.")

    if not tables:
        # Auto-create a default table sized to fit all attending guests
        cap = _smart_capacity(len(unseated))
        table = create_table(event, shape="rectangular", capacity=cap,
                             acting_user_id=acting_user_id)
        tables = [table]

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


def shuffle_seating(event, mode="random", acting_user_id=None):
    """Clear all unlocked seats and re-assign everyone (locked seats stay)."""
    tables = SeatingTable.query.filter_by(event_id=event.id).order_by(
        SeatingTable.table_number
    ).all()
    if not tables:
        # Nothing to shuffle — delegate to auto_assign which will create a table
        return auto_assign(event, mode=mode, acting_user_id=acting_user_id)

    # Clear unlocked assignments
    table_ids = [t.id for t in tables]
    SeatAssignment.query.filter(
        SeatAssignment.table_id.in_(table_ids),
        SeatAssignment.is_locked == False  # noqa: E712
    ).delete()
    db.session.flush()

    # Now auto-assign (all unlocked guests are now unseated)
    unseated = get_unseated_attending(event)
    if not unseated:
        log_action(event.user_id, "updated_seating", "event", event.id,
                   f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
        db.session.commit()
        return

    table_empty_seats = {}
    for table in tables:
        taken = {sa.seat_position for sa in table.seat_assignments}
        empty = [p for p in range(1, table.capacity + 1) if p not in taken]
        if empty:
            table_empty_seats[table.id] = (table, empty)

    if not table_empty_seats:
        log_action(event.user_id, "updated_seating", "event", event.id,
                   f"Changes to seating plan for {event.name}", acting_user_id=acting_user_id)
        db.session.commit()
        return

    if mode == "random":
        _auto_assign_random(unseated, table_empty_seats)
    elif mode == "alternating":
        _auto_assign_alternating(unseated, table_empty_seats, tables)

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
    """Assign guests to maximize M/F alternation, respecting locked seats.

    Strategy: greedy seat-by-seat placement. For each empty seat, score what
    gender would be best there based on its neighbors, then assign guests
    one at a time picking the seat+guest combo that minimizes same-gender
    adjacency across the whole plan.

    Table topology:
    - Round: seat N wraps to seat 1 (circular)
    - Rectangular: seats go clockwise — top row L→R, right end, bottom row R→L, left end
    - Long/Banquet: top row L→R then bottom row R→L (two parallel rows, no wrap)

    For all shapes, the seat numbering is sequential and the adjacency is
    pos-1 ↔ pos ↔ pos+1, with wrapping for round tables.
    """
    males = [inv for inv in unseated if inv.guest.gender == "Male"]
    females = [inv for inv in unseated if inv.guest.gender == "Female"]
    random.shuffle(males)
    random.shuffle(females)

    # Build per-table state: a map of position → gender for all seats (existing + to-fill)
    table_states = []
    for table in tables:
        if table.id not in table_empty_seats:
            continue
        _, empty_positions = table_empty_seats[table.id]
        # Map of position → gender for already-seated guests
        seat_map = {}
        for sa in table.seat_assignments:
            seat_map[sa.seat_position] = sa.invitation.guest.gender
        is_round = table.shape == "round"
        table_states.append({
            "table": table,
            "seat_map": seat_map,
            "empty": set(empty_positions),
            "capacity": table.capacity,
            "is_round": is_round,
        })

    if not table_states:
        return

    # Pool of guests by gender
    male_pool = list(males)
    female_pool = list(females)

    # Step 1: For each table, compute the ideal gender for each empty seat.
    # We do this by building the best possible gender pattern for the full
    # table, respecting locked positions, then reading off the empty seats.
    all_assignments = []  # (table_state, pos, gender_needed)

    for ts in table_states:
        if not ts["empty"]:
            continue
        pattern = _compute_ideal_pattern(
            ts["seat_map"], ts["capacity"], ts["is_round"],
            len(male_pool), len(female_pool)
        )
        for pos in sorted(ts["empty"]):
            all_assignments.append((ts, pos, pattern.get(pos)))

    # Step 2: Assign guests to match the ideal pattern
    # First pass: fill seats where we have the requested gender
    unmatched = []
    for ts, pos, ideal_gender in all_assignments:
        pool = male_pool if ideal_gender == "Male" else female_pool
        if pool:
            inv = pool.pop()
            ts["seat_map"][pos] = inv.guest.gender
            ts["empty"].discard(pos)
            db.session.add(SeatAssignment(
                table_id=ts["table"].id, invitation_id=inv.id, seat_position=pos
            ))
        else:
            unmatched.append((ts, pos))

    # Second pass: fill remaining seats with whatever gender is left
    remaining = male_pool + female_pool
    random.shuffle(remaining)
    for inv, (ts, pos) in zip(remaining, unmatched):
        ts["seat_map"][pos] = inv.guest.gender
        ts["empty"].discard(pos)
        db.session.add(SeatAssignment(
            table_id=ts["table"].id, invitation_id=inv.id, seat_position=pos
        ))


def _compute_ideal_pattern(seat_map, capacity, is_round, n_males_avail, n_females_avail):
    """Compute the ideal gender for each empty seat to maximize alternation.

    Strategy: space the minority gender evenly across ALL seats (including
    locked ones), then for each empty seat, read off the ideal gender.
    Locked seats are constraints; the pattern wraps around them.
    """
    n = capacity
    empty_positions = sorted(p for p in range(1, n + 1) if p not in seat_map)
    n_empty = len(empty_positions)
    if n_empty == 0:
        return {}

    existing_m = sum(1 for g in seat_map.values() if g == "Male")
    existing_f = sum(1 for g in seat_map.values() if g == "Female")

    # Calculate how many of each gender to place
    need_m = min(n_males_avail, n_empty)
    need_f = min(n_females_avail, n_empty)
    # Try to balance: aim for ~50/50 total
    total = existing_m + existing_f + n_empty
    ideal_m_total = (total + 1) // 2
    ideal_f_total = total - ideal_m_total
    want_m = max(0, min(ideal_m_total - existing_m, n_males_avail, n_empty))
    want_f = max(0, min(ideal_f_total - existing_f, n_females_avail, n_empty))
    leftover = n_empty - want_m - want_f
    if leftover > 0:
        if n_males_avail - want_m > 0:
            extra = min(leftover, n_males_avail - want_m)
            want_m += extra
            leftover -= extra
        if leftover > 0 and n_females_avail - want_f > 0:
            extra = min(leftover, n_females_avail - want_f)
            want_f += extra

    total_m = existing_m + want_m
    total_f = existing_f + want_f
    if total_f <= total_m:
        min_g, maj_g = "Female", "Male"
        n_min_total, n_maj_total = total_f, total_m
        need_min, need_maj = want_f, want_m
    else:
        min_g, maj_g = "Male", "Female"
        n_min_total, n_maj_total = total_m, total_f
        need_min, need_maj = want_m, want_f

    # Build ideal full-table pattern: place minority at evenly-spaced positions
    # across ALL n seats, then check if empty seats match.
    # The spacing between minority members should be ~ n / n_min_total.
    if n_min_total == 0:
        return {p: maj_g for p in empty_positions}

    spacing = n / n_min_total  # e.g., 10 seats / 3 minority = every 3.33 seats

    # Find best starting offset to align with existing locked minority positions
    # Try each possible offset and pick the one that conflicts least with locks
    best_offset = 0
    best_conflicts = n + 1
    for trial_offset in range(n):
        conflicts = 0
        min_positions = set()
        for i in range(n_min_total):
            pos = int(round(trial_offset + i * spacing)) % n + 1
            min_positions.add(pos)
        # Check conflicts with locked seats
        for pos, gender in seat_map.items():
            if pos in min_positions and gender != min_g:
                conflicts += 1
            elif pos not in min_positions and gender == min_g:
                conflicts += 1
        if conflicts < best_conflicts:
            best_conflicts = conflicts
            best_offset = trial_offset

    # Generate minority positions with best offset
    minority_positions = set()
    for i in range(n_min_total):
        pos = int(round(best_offset + i * spacing)) % n + 1
        minority_positions.add(pos)

    # Build the result: for each empty position, assign ideal gender
    result = {}
    min_placed = 0
    maj_placed = 0
    for pos in empty_positions:
        if pos in minority_positions and min_placed < need_min:
            result[pos] = min_g
            min_placed += 1
        elif pos not in minority_positions and maj_placed < need_maj:
            result[pos] = maj_g
            maj_placed += 1
        else:
            # Fallback: assign whatever we still need
            if min_placed < need_min:
                result[pos] = min_g
                min_placed += 1
            else:
                result[pos] = maj_g
                maj_placed += 1

    return result


def serialize_seating_plan(event):
    """Serialize complete seating plan for API response."""
    tables = get_seating_plan(event)
    unseated = get_unseated_attending(event)
    unseated.sort(key=lambda inv: (inv.guest.last_name_sort_key, inv.guest.first_name.lower()))

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
            "is_locked": sa.is_locked,
        }
    return {
        "id": table.id,
        "table_number": table.table_number,
        "label": table.label or "",
        "shape": table.shape,
        "capacity": table.capacity,
        "rotation": table.rotation or 0,
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
