"""
services/text_utils.py — Shared text normalisation helpers.
"""
import unicodedata


def ascii_fold(s: str) -> str:
    """Lowercase + strip Vietnamese diacritics.

    'Đà Nẵng' → 'da nang'. Used to match destinations case- and accent-
    insensitively against DB rows that may have been written either way.
    """
    if not s:
        return ""
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
