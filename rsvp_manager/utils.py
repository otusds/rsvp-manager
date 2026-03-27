"""Shared utility functions."""


def format_date(d, fmt="display"):
    """Format a date consistently across the app.

    Formats:
        display: "26 Mar 2026" (default, for UI display)
        iso: "2026-03-26" (for data attributes and exports)
        slash: "26/03/2026" (for compact display)
    """
    if not d:
        return ""
    if fmt == "iso":
        return d.isoformat()
    elif fmt == "slash":
        return d.strftime("%d/%m/%Y")
    return d.strftime("%d %b %Y")
