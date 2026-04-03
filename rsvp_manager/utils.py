"""Shared utility functions and constants."""

VALID_GENDERS = ("Male", "Female")

# Nobility particles / tussenvoegsels across cultures.
# Ordered longest-first so greedy matching works correctly
# (e.g. "van der" is tested before "van").
NOBILITY_PARTICLES = [
    # Dutch compound
    "van het", "van den", "van der", "van de", "van 't",
    "op den", "op het", "op de",
    "in den", "in het", "in de", "in 't",
    "aan den", "aan het", "aan de",
    "uit den", "uit het", "uit de",
    "voor den", "voor de",
    "over de", "onder de", "bij de",
    # German compound
    "von und zu", "von dem", "von den", "von der",
    # Spanish compound
    "de las", "de los", "de la",
    # Italian compound
    "della", "delle", "dello", "degli",
    # Dutch / German / French / misc single or short
    "van", "von", "vom", "zum", "zur", "ver", "ten", "ter",
    "des", "del", "dei", "dos", "das",
    "bin", "ibn",
    "het", "les",
    "le", "la", "lo", "li",
    "de", "du", "da", "do", "di",
    "af", "av", "zu", "te",
    "d'", "l'",
    "e",
    "'t",
    # Arabic article
    "al-", "el-",
    # Space-separated variants (when apostrophe/hyphen is replaced by a space)
    "al", "el",
    # Single-letter particles (d', l', t' without the apostrophe)
    "d", "l", "t",
]


def get_last_name_sort_key(last_name):
    """Return a sort key for a last name that respects nobility particle conventions.

    Rules:
    - If the name starts with a known particle in **lowercase**, skip it and
      sort by the remainder (e.g. "de Séjournet" → "séjournet").
    - If the particle is **capitalized**, keep it as the sort key
      (e.g. "De Ridder" → "de ridder").
    - Names without a recognized particle sort normally.
    """
    if not last_name:
        return ""

    for particle in NOBILITY_PARTICLES:
        # Check for particles that end with an apostrophe (d', l') — no space after
        if particle.endswith("'"):
            if last_name.startswith(particle) and len(last_name) > len(particle):
                # Lowercase in actual name → skip; capitalized → keep
                if last_name[0].islower():
                    return last_name[len(particle):].lower()
                else:
                    return last_name.lower()
        # Check for particles ending with hyphen (al-, el-) — no space after
        elif particle.endswith("-"):
            if last_name.lower().startswith(particle) and len(last_name) > len(particle):
                if last_name[0].islower():
                    return last_name[len(particle):].lower()
                else:
                    return last_name.lower()
        else:
            prefix = particle + " "
            if last_name.lower().startswith(prefix) and len(last_name) > len(prefix):
                # The particle matches — now check the case in the actual name
                if last_name[0].islower():
                    return last_name[len(prefix):].lower()
                else:
                    return last_name.lower()

    return last_name.lower()


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
