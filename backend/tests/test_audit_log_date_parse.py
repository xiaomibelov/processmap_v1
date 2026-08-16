"""Регрессия: GET /api/audit-log с не-ASCII цифрой в date_from/date_to.

Contract-fuzz (schemathesis) нашёл 500: `"¹".isdigit()` в Python — True
(unicode-superscript), но `int("¹")` бросает ValueError → необработанное
исключение → 500 вместо задокументированного 422.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routers.audit_log import _parse_date


def test_non_ascii_digit_date_is_422_not_value_error():
    # ¹ (U+00B9 SUPERSCRIPT ONE): isdigit() == True, int() -> ValueError.
    with pytest.raises(HTTPException) as exc_info:
        _parse_date("¹")
    assert exc_info.value.status_code == 422


def test_ascii_date_forms_still_work():
    assert _parse_date("") == 0
    assert _parse_date("1700000000") == 1700000000
    assert _parse_date("2026-08-16") > 0
    with pytest.raises(HTTPException) as exc_info:
        _parse_date("not-a-date")
    assert exc_info.value.status_code == 422
