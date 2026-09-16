import re
from io import BytesIO
from flask import send_file, make_response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from sqlalchemy.orm import joinedload, selectinload
from rsvp_manager.models import Guest, Invitation, InvitationAttributeValue, SeatAssignment
from rsvp_manager.utils import get_last_name_sort_key, format_date

HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2C3E50", end_color="2C3E50", fill_type="solid")


def _styled_sheet(wb, title, headers):
    ws = wb.active
    ws.title = re.sub(r"[/\\*?\[\]:]", "_", title)
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
    return ws


def _to_download(wb, filename):
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf, download_name=filename, as_attachment=True,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


def export_events_xlsx(events):
    wb = Workbook()
    ws = _styled_sheet(wb, "Events", ["Name", "Type", "Date", "Location", "Invited", "Attending", "Notes"])
    for e in events:
        attending = sum(1 for inv in e.invitations if inv.status == "Attending")
        ws.append([e.name, e.event_type, format_date(e.date, "iso"), e.location or "",
                   len(e.invitations), attending, e.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "events.xlsx")


def export_guests_xlsx(guests):
    wb = Workbook()
    ws = _styled_sheet(wb, "Guests", ["Last Name", "First Name", "Gender", "Tags",
                                       "Total Invited", "Total Attending", "Total Pending",
                                       "Total Declined", "Date Created", "Notes"])
    for g in guests:
        tags = ", ".join(t.name for t in g.tags if not t.deleted_at)
        invitations = [inv for inv in g.invitations if not inv.event.deleted_at] if g.invitations else []
        # "Invited" excludes "Not Sent" everywhere in the UI (see event_detail.html),
        # and counting it here also made the row fail to add up against its own
        # Attending/Pending/Declined columns.
        total_invited = sum(1 for inv in invitations if inv.status != "Not Sent")
        total_attending = sum(1 for inv in invitations if inv.status == "Attending")
        total_pending = sum(1 for inv in invitations if inv.status == "Pending")
        total_declined = sum(1 for inv in invitations if inv.status == "Declined")
        date_created = format_date(g.date_created, "iso")
        ws.append([g.last_name or "", g.first_name, g.gender, tags,
                   total_invited, total_attending, total_pending, total_declined,
                   date_created, g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "GuestCheck_Friends.xlsx")


def _event_invitations_for_export(event):
    """Invitations for an event with everything the export rows read preloaded.

    Walking event.invitations lazily cost one query per invitation for the seat
    assignment and another for the guest's tags.
    """
    return Invitation.query.options(
        joinedload(Invitation.guest).selectinload(Guest.tags),
        selectinload(Invitation.seat_assignment).joinedload(SeatAssignment.table),
        selectinload(Invitation.attribute_values).joinedload(InvitationAttributeValue.option),
    ).filter(Invitation.event_id == event.id).all()


def _get_seating_info(inv):
    """Get table name and seat number separately for an invitation."""
    assignments = inv.seat_assignment
    if not assignments:
        return "", ""
    sa = assignments[0] if isinstance(assignments, list) else assignments
    table = sa.table
    label = table.label or ("Table " + str(table.table_number))
    return label, str(sa.seat_position)


def export_event_guests_xlsx(event):
    # One extra column per attribute this event defines, after the fixed ones.
    attributes = sorted(event.attributes, key=lambda a: (a.position, a.id))
    wb = Workbook()
    ws = _styled_sheet(wb, event.name[:31],
                       ["Last Name", "First Name", "Gender", "Tags", "Sent",
                        "Invited On", "Status", "Responded On", "Table", "Seat", "Inv. Notes", "Guest Notes"]
                       + [a.name for a in attributes])
    for inv in _event_invitations_for_export(event):
        g = inv.guest
        if g.deleted_at:
            continue
        sent = "Yes" if inv.status != "Not Sent" else "No"
        tags = ", ".join(t.name for t in g.tags if not t.deleted_at)
        table_name, seat_num = _get_seating_info(inv)
        chosen = {v.attribute_id: v.option.label for v in inv.attribute_values}
        ws.append([g.last_name or "", g.first_name, g.gender, tags, sent,
                   format_date(inv.date_invited, "iso"),
                   inv.status,
                   format_date(inv.date_responded, "iso"),
                   table_name, seat_num,
                   inv.notes or "", g.notes or ""]
                  + [chosen.get(a.id, "") for a in attributes])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    safe_name = re.sub(r"[^\w\-]", "_", event.name).strip("_").lower()
    date_str = format_date(event.date, "iso")
    return _to_download(wb, f"GuestCheck_{safe_name}_{date_str}_guests.xlsx")


def export_event_guests_text(event):
    """Export attending/pending guests as formatted text for sharing."""
    attending = []
    pending = []
    for inv in _event_invitations_for_export(event):
        if inv.guest.deleted_at:
            continue
        g = inv.guest
        entry = (get_last_name_sort_key(g.last_name), g.first_name.lower(), g.full_name)
        if inv.status == "Attending":
            attending.append(entry)
        elif inv.status == "Pending":
            pending.append(entry)

    attending.sort()
    pending.sort()
    attending = [name for _, _, name in attending]
    pending = [name for _, _, name in pending]

    lines = []
    lines.append(f"{event.name} ({event.date.strftime('%d %B %Y')})")
    summary = f"✅ {len(attending)} attending"
    if pending:
        summary += f" · 🟠 {len(pending)} pending"
    lines.append(summary)
    lines.append("")

    if attending:
        lines.append("— Attending —")
        for name in attending:
            lines.append(f"• {name}")
        lines.append("")

    if pending:
        lines.append("— Pending —")
        for name in pending:
            lines.append(f"• {name}")
        lines.append("")

    text = "\n".join(lines)
    response = make_response(text)
    response.headers["Content-Type"] = "text/plain; charset=utf-8"
    return response
