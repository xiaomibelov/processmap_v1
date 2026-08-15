"""Regression test: calls.jsonl lines must be ASCII-safe single-line JSON.

Nightly backend-contract (run 31881626132, 2026-08-15) failed in the
``Coverage report`` step with ``JSONDecodeError: Unterminated string``:
``test_deprecated_alias_headers`` sends a request whose path contains raw
U+0085 (NEL); the recorder wrote it verbatim (``ensure_ascii=False``) and
``scripts/api_coverage_report.py`` reads the file with ``splitlines()``,
which splits on NEL — the JSONL line broke in the middle of the path string.

Fix: recorder dumps rows with ``ensure_ascii=True``.
"""
import json

import coverage_recorder

RAW_NON_ASCII_PATH = "/api/sessions/s1/paths/\u0080/reports/\u0085"


def _reset_recorder(monkeypatch, tmp_path):
    out_dir = tmp_path / "api-coverage-output"
    monkeypatch.setattr(coverage_recorder, "_OUTPUT_DIR", out_dir)
    monkeypatch.setattr(coverage_recorder, "_out_file", None)
    return out_dir


class FakeUrl:
    def __init__(self, path):
        self.path = path


def test_record_non_ascii_path_stays_single_line_ascii(monkeypatch, tmp_path):
    out_dir = _reset_recorder(monkeypatch, tmp_path)

    coverage_recorder._record("GET", FakeUrl(RAW_NON_ASCII_PATH), 401)

    raw = (out_dir / "calls.jsonl").read_bytes()
    assert raw.isascii(), "calls.jsonl must stay ASCII (no raw NEL/non-ASCII)"
    text = raw.decode("ascii")
    # splitlines() must not break the row (api_coverage_report.py reads this way)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["path"] == RAW_NON_ASCII_PATH
    assert row["status"] == 401


def test_record_non_api_path_is_skipped(monkeypatch, tmp_path):
    out_dir = _reset_recorder(monkeypatch, tmp_path)

    coverage_recorder._record("GET", FakeUrl("/healthz"), 200)

    assert not (out_dir / "calls.jsonl").exists()
