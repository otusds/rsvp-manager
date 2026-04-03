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


def _normalize_apostrophes(s):
    """Replace curly/smart quotes with straight apostrophe for particle matching."""
    return s.replace("\u2019", "'").replace("\u2018", "'").replace("\u02BC", "'")


def _is_lowercase_particle(name, particle_len):
    """Check if the particle portion of a name is lowercase.

    For particles starting with a letter, check if that letter is lowercase.
    For particles starting with non-letter characters (e.g. 't), always treat
    them as lowercase particles (skip for sorting).
    """
    # Find the first letter in the particle portion
    for i in range(min(particle_len, len(name))):
        if name[i].isalpha():
            return name[i].islower()
    # No letter found in particle (e.g. "'t") — treat as lowercase
    return True


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

    # Normalize smart quotes for matching
    normalized = _normalize_apostrophes(last_name)

    for particle in NOBILITY_PARTICLES:
        # Check for particles that end with an apostrophe (d', l') — no space after
        if particle.endswith("'"):
            if normalized.lower().startswith(particle) and len(normalized) > len(particle):
                if _is_lowercase_particle(normalized, len(particle)):
                    return normalized[len(particle):].lower()
                else:
                    return normalized.lower()
        # Check for particles ending with hyphen (al-, el-) — no space after
        elif particle.endswith("-"):
            if normalized.lower().startswith(particle) and len(normalized) > len(particle):
                if _is_lowercase_particle(normalized, len(particle)):
                    return normalized[len(particle):].lower()
                else:
                    return normalized.lower()
        else:
            prefix = particle + " "
            if normalized.lower().startswith(prefix) and len(normalized) > len(prefix):
                if _is_lowercase_particle(normalized, len(prefix)):
                    return normalized[len(prefix):].lower()
                else:
                    return normalized.lower()

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
