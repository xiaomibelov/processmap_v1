"""Shared parsing helpers used by analytics and calculation services."""

from __future__ import annotations

from typing import Any, Optional


def text(value: Any) -> str:
    return str(value or "").strip()


def parse_recalc_number(value: Any) -> Optional[float]:
    """Parse a numeric string for recalculation exports.

    Accepts commas as decimal separators, the per-unit coefficient form
    ``"0,33*n"`` (per-unit time/quantity multiplied by ``n`` units), and a
    leading threshold/comparison prefix (``">10"`` -> ``10``, ``"<5"`` -> ``5``).
    For the ``*n`` form the leading coefficient is returned (e.g. ``0,33*n`` ->
    ``0.33``); the caller multiplies it by ``ingredient_value`` (the unit count
    ``n``), so ``0,33*n`` with ``ingredient_value=10`` yields ``3.3``.
    """
    raw = text(value)
    if raw in ("", "—"):
        return None
    # Threshold/comparison prefix: ">10" / "<5" / "> 10" -> strip the leading sign.
    if raw[:1] in (">", "<"):
        raw = raw[1:].strip()
    # Per-unit coefficient form: "<number>*n" / "<number> * n" (case-insensitive).
    star = raw.find("*")
    if star > 0 and raw[star + 1 :].strip().lower() == "n":
        raw = raw[:star].strip()
    raw = raw.replace(",", ".")
    try:
        return float(raw)
    except Exception:
        return None
