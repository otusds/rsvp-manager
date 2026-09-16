"""Guard against inline event handlers, which the CSP blocks at runtime.

The app sends `script-src 'self'` with no 'unsafe-inline' (rsvp_manager/__init__.py),
so an inline on* attribute in a template is dead code: the browser refuses to run it
and the control silently does nothing. This has bitten the app twice (the empty-state
New Event button, then the Add Friend button), so it is enforced here rather than
left to review.

Bind handlers in the JS bundle instead. common.js has delegated handlers for the
common cases: .flash-dismiss, [data-click-proxy], [data-track-event] and
form[data-no-submit].
"""
import re
from pathlib import Path

import pytest

TEMPLATES = Path(__file__).resolve().parent.parent / "rsvp_manager" / "templates"

# Matches on<event>= as an HTML attribute (preceded by whitespace), which is what the
# browser would refuse to execute. Avoids matching e.g. python-esque "on_click=".
INLINE_HANDLER = re.compile(r'\son[a-z]+\s*=\s*["\']', re.IGNORECASE)


def _templates():
    return sorted(TEMPLATES.rglob("*.html"))


def test_templates_exist():
    assert _templates(), "no templates found - path wrong?"


@pytest.mark.parametrize("template", _templates(), ids=lambda p: p.name)
def test_no_inline_event_handlers(template):
    offenders = [
        f"{template.relative_to(TEMPLATES)}:{i}: {line.strip()[:120]}"
        for i, line in enumerate(template.read_text().splitlines(), 1)
        if INLINE_HANDLER.search(line)
    ]
    assert not offenders, (
        "Inline event handlers are blocked by the Content-Security-Policy and will "
        "never fire. Bind the handler in the JS bundle instead.\n  "
        + "\n  ".join(offenders)
    )


def test_csp_still_forbids_inline_scripts():
    """If the CSP ever gains 'unsafe-inline', the test above becomes pointless."""
    src = (TEMPLATES.parent / "__init__.py").read_text()
    assert "script-src {script_src}" in src, "CSP script-src directive moved; update this guard"
    assert "'unsafe-inline'" not in src.split("script-src")[1].split(";")[0], (
        "script-src now allows 'unsafe-inline' - either revert that or drop the "
        "inline-handler guard, but do not leave the two inconsistent"
    )
