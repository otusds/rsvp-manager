import re
from io import BytesIO
from flask import send_file
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

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
        ws.append([e.name, e.event_type, e.date.strftime("%Y-%m-%d"), e.location or "",
                   len(e.invitations), attending, e.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "events.xlsx")


def export_guests_xlsx(guests):
    wb = Workbook()
    ws = _styled_sheet(wb, "Guests", ["Last Name", "First Name", "Gender", "Notes"])
    for g in guests:
        ws.append([g.last_name or "", g.first_name, g.gender, g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    return _to_download(wb, "guests.xlsx")


def export_event_guests_xlsx(event):
    wb = Workbook()
    ws = _styled_sheet(wb, event.name[:31],
                       ["Last Name", "First Name", "Gender", "Sent", "Channel",
                        "Invited On", "Status", "Responded On", "Inv. Notes", "Guest Notes"])
    for inv in event.invitations:
        g = inv.guest
        sent = "Yes" if inv.status != "Not Sent" else "No"
        ws.append([g.last_name or "", g.first_name, g.gender, sent, inv.channel or "",
                   inv.date_invited.strftime("%Y-%m-%d") if inv.date_invited else "",
                   inv.status,
                   inv.date_responded.strftime("%Y-%m-%d") if inv.date_responded else "",
                   inv.notes or "", g.notes or ""])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    safe_name = re.sub(r"[^\w\-]", "_", event.name).strip("_").lower()
    return _to_download(wb, f"{safe_name}_guests.xlsx")
