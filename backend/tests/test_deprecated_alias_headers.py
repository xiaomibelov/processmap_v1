"""Regression tests: deprecation-alias headers must be latin-1-safe.

CI backend-contract nightly (2026-08-15) failed with
``UnicodeDecodeError: 'utf-8' codec can't decode byte 0x80`` when schemathesis
called a trailing-slash alias route with non-ASCII path params
(``/api/sessions/d3cf532202/paths/%C2%80/reports/%C2%85``): the middleware
embedded the raw decoded path into Warning/Link/Location headers.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.startup.middleware import _apply_deprecation_headers, _header_safe_canonical

RAW_NON_ASCII_PATH = "/api/sessions/s1/paths/\u0080/reports/\u0085"


def test_header_safe_canonical_percent_encodes_non_ascii():
    safe = _header_safe_canonical(RAW_NON_ASCII_PATH)
    assert safe == "/api/sessions/s1/paths/%C2%80/reports/%C2%85"
    safe.encode("latin-1")  # must not raise — headers are latin-1 encoded


def test_header_safe_canonical_keeps_ascii_path_untouched():
    path = "/api/sessions/s_123/paths/p-9/reports/r.1"
    assert _header_safe_canonical(path) == path


def test_apply_deprecation_headers_emits_only_latin1():
    class DummyResponse:
        def __init__(self):
            self.headers = {}

    resp = DummyResponse()
    _apply_deprecation_headers(resp, RAW_NON_ASCII_PATH)
    for name, value in resp.headers.items():
        value.encode("latin-1"), name  # raises if any header is not latin-1-safe
    assert "%C2%80" in resp.headers["Link"]


@pytest.mark.parametrize("suffix", ["/paths/%C2%80/reports/%C2%85/", "/path/%C2%80/reports/%C2%85"])
def test_alias_request_with_non_ascii_params_does_not_crash_client(suffix):
    """End-to-end through the real app: the exact CI failure shape.

    Before the fix, starlette_testclient raised UnicodeDecodeError while
    decoding the Warning/Link/Location headers produced for this request.
    """
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(f"/api/sessions/d3cf532202{suffix}")
    assert response.status_code in {200, 308, 401, 403, 404, 422}
    # TestClient decodes headers as UTF-8; reaching this line without
    # UnicodeDecodeError is the regression assertion. Additionally:
    for name, value in response.headers.items():
        value.encode("latin-1"), name
