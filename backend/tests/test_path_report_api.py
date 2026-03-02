import os
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch


def _make_payload(session_id: str, path_id: str) -> dict:
    return {
        "session_id": session_id,
        "path_id": path_id,
        "path_name": f"Path {path_id}",
        "generated_at": "2026-02-26T00:00:00.000Z",
        "totals": {"steps_count": 1, "work_total_sec": 60, "wait_total_sec": 0, "total_sec": 60},
        "steps": [{"order_index": 1, "title": "Step A"}],
    }


class PathReportApiTest(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_path_report_sync_mode = os.environ.get("PATH_REPORT_SYNC_MODE")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["PATH_REPORT_SYNC_MODE"] = "1"

        from app.main import (
            CreatePathReportVersionIn,
            CreateSessionIn,
            UpdateSessionIn,
            _set_report_active,
            create_path_report_version,
            create_session,
            delete_path_report_version,
            delete_report_version,
            get_storage,
            get_report_version,
            get_path_report_version_detail,
            get_session,
            list_path_report_versions,
            patch_session,
        )

        self.CreatePathReportVersionIn = CreatePathReportVersionIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self._set_report_active = _set_report_active
        self.create_path_report_version = create_path_report_version
        self.create_session = create_session
        self.delete_path_report_version = delete_path_report_version
        self.delete_report_version = delete_report_version
        self.get_storage = get_storage
        self.get_report_version = get_report_version
        self.get_path_report_version_detail = get_path_report_version_detail
        self.get_session = get_session
        self.list_path_report_versions = list_path_report_versions
        self.patch_session = patch_session

    def _wait_report_ready(self, report_id: str, timeout_sec: float = 3.0) -> dict:
        rid = str(report_id or "").strip()
        deadline = time.time() + max(0.1, float(timeout_sec or 0))
        snapshot = {}
        while time.time() < deadline:
            snapshot = self.get_report_version(rid)
            status = str((snapshot or {}).get("status") or "").strip().lower()
            if status in {"ok", "error"}:
                return snapshot
            time.sleep(0.02)
        return self.get_report_version(rid)

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_path_report_sync_mode is None:
            os.environ.pop("PATH_REPORT_SYNC_MODE", None)
        else:
            os.environ["PATH_REPORT_SYNC_MODE"] = self.old_path_report_sync_mode
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        side_effect=[
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# A1",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# A1",
            },
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# B1",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# B1",
            },
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# A2",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# A2",
            },
        ],
    )
    def test_version_autoincrement_scoped_by_session_and_path(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])

        req_a1 = self.CreatePathReportVersionIn(
            steps_hash="hash_a1",
            request_payload_json=_make_payload(sid, "path_a"),
            prompt_template_version="v1",
        )
        req_b1 = self.CreatePathReportVersionIn(
            steps_hash="hash_b1",
            request_payload_json=_make_payload(sid, "path_b"),
            prompt_template_version="v1",
        )
        req_a2 = self.CreatePathReportVersionIn(
            steps_hash="hash_a2",
            request_payload_json=_make_payload(sid, "path_a"),
            prompt_template_version="v1",
        )

        out_a1 = self.create_path_report_version(sid, "path_a", req_a1)
        out_b1 = self.create_path_report_version(sid, "path_b", req_b1)
        out_a2 = self.create_path_report_version(sid, "path_a", req_a2)

        self.assertEqual((out_a1.get("report") or {}).get("version"), 1)
        self.assertEqual((out_b1.get("report") or {}).get("version"), 1)
        self.assertEqual((out_a2.get("report") or {}).get("version"), 2)
        self._wait_report_ready(str((out_a1.get("report") or {}).get("id")))
        self._wait_report_ready(str((out_b1.get("report") or {}).get("id")))
        self._wait_report_ready(str((out_a2.get("report") or {}).get("id")))

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        side_effect=[
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# Report v1",
                "recommendations": [{"scope": "global", "text": "R1", "expected_effect": "E1"}],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# Report v1",
            },
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# Report v2",
                "recommendations": [{"scope": "global", "text": "R2", "expected_effect": "E2"}],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# Report v2",
            },
        ],
    )
    def test_repeat_generation_creates_new_version_without_overwrite(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        payload = _make_payload(sid, "manual_path")

        req1 = self.CreatePathReportVersionIn(
            steps_hash="h1",
            request_payload_json=payload,
            prompt_template_version="v1",
        )
        req2 = self.CreatePathReportVersionIn(
            steps_hash="h1",
            request_payload_json=payload,
            prompt_template_version="v1",
        )
        out1 = self.create_path_report_version(sid, "manual_path", req1)
        out2 = self.create_path_report_version(sid, "manual_path", req2)

        r1 = out1.get("report") or {}
        r2 = out2.get("report") or {}
        self.assertEqual(r1.get("version"), 1)
        self.assertEqual(r2.get("version"), 2)
        self.assertNotEqual(r1.get("id"), r2.get("id"))

        listing = self.list_path_report_versions(sid, "manual_path")
        self.assertEqual(len(listing), 2)
        self.assertEqual(listing[0].get("version"), 2)
        self.assertEqual(listing[1].get("version"), 1)

        d1 = self._wait_report_ready(str(r1.get("id")))
        d2 = self._wait_report_ready(str(r2.get("id")))
        self.assertEqual(d1.get("report_markdown"), "# Report v1")
        self.assertEqual(d2.get("report_markdown"), "# Report v2")

        loaded = self.get_session(sid)
        interview = loaded.get("interview") or {}
        by_path = interview.get("report_versions") or {}
        self.assertEqual(len(by_path.get("manual_path") or []), 2)

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app.ai.deepseek_questions.generate_path_report", side_effect=RuntimeError("deepseek unavailable"))
    def test_failed_generation_is_saved_as_error_version(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        req = self.CreatePathReportVersionIn(
            steps_hash="h_err",
            request_payload_json=_make_payload(sid, "manual_path"),
            prompt_template_version="v1",
        )

        out = self.create_path_report_version(sid, "manual_path", req)
        report = out.get("report") or {}
        self.assertEqual(report.get("status"), "running")
        detail = self._wait_report_ready(str(report.get("id")))
        self.assertEqual(detail.get("status"), "error")
        self.assertTrue("deepseek" in str(detail.get("error_message") or "").lower())

        listing = self.list_path_report_versions(sid, "manual_path")
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0].get("status"), "error")

    def test_reports_list_returns_empty_array_when_no_versions(self):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        rows = self.list_path_report_versions(sid, "primary")
        self.assertEqual(rows, [])

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v1",
            "report_markdown": "# Report scoped endpoint",
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "# Report scoped endpoint",
        },
    )
    def test_scoped_report_detail_endpoint_returns_saved_markdown(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_scoped_detail",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        self._wait_report_ready(rid)
        detail = self.get_path_report_version_detail(sid, "primary", rid)
        self.assertEqual(str(detail.get("id") or ""), rid)
        self.assertEqual(str(detail.get("status") or "").lower(), "ok")
        self.assertIn("scoped endpoint", str(detail.get("report_markdown") or "").lower())

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        side_effect=[
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# Report h1",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# Report h1",
            },
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# Report h2",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# Report h2",
            },
        ],
    )
    def test_list_path_report_versions_supports_steps_hash_filter(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        payload = _make_payload(sid, "manual_path")

        out1 = self.create_path_report_version(
            sid,
            "manual_path",
            self.CreatePathReportVersionIn(
                steps_hash="hash_h1",
                request_payload_json=payload,
                prompt_template_version="v1",
            ),
        )
        out2 = self.create_path_report_version(
            sid,
            "manual_path",
            self.CreatePathReportVersionIn(
                steps_hash="hash_h2",
                request_payload_json=payload,
                prompt_template_version="v1",
            ),
        )
        self._wait_report_ready(str((out1.get("report") or {}).get("id")))
        self._wait_report_ready(str((out2.get("report") or {}).get("id")))

        all_rows = self.list_path_report_versions(sid, "manual_path")
        self.assertEqual(len(all_rows), 2)
        self.assertIn("provider", all_rows[0])
        self.assertIn("error", all_rows[0])

        h1_rows = self.list_path_report_versions(sid, "manual_path", steps_hash="hash_h1")
        self.assertEqual(len(h1_rows), 1)
        self.assertEqual(h1_rows[0].get("steps_hash"), "hash_h1")

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v1",
            "report_markdown": "# Report persists",
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "# Report persists",
        },
    )
    def test_patch_session_interview_does_not_drop_report_versions(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_persist",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        self._wait_report_ready(rid)

        self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={"steps": [{"id": "s1", "title": "Only user interview payload"}]},
            ),
        )

        rows = self.list_path_report_versions(sid, "primary")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("steps_hash"), "hash_persist")

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v1",
            "report_markdown": "# Report survives stale patch",
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "# Report survives stale patch",
        },
    )
    def test_patch_session_with_stale_interview_report_keys_does_not_overwrite_server_reports(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_stale_patch",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        detail = self._wait_report_ready(rid)
        self.assertEqual(str(detail.get("status") or "").lower(), "ok")

        self.patch_session(
            sid,
            self.UpdateSessionIn(
                interview={
                    "steps": [{"id": "s1", "title": "stale interview payload"}],
                    "report_versions": {},
                    "path_reports": {},
                },
            ),
        )

        rows = self.list_path_report_versions(sid, "primary")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("steps_hash"), "hash_stale_patch")

    @patch("app.main._run_path_report_generation_async", return_value=None)
    @patch("app.main.load_llm_settings", return_value={"api_key": "", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    def test_list_marks_stale_running_versions_as_error(self, _mock_llm, _mock_worker):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_stale",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        self.assertTrue(rid)

        st = self.get_storage()
        sess = st.load(sid)
        iv = dict(getattr(sess, "interview", {}) or {})
        by_path = dict(iv.get("report_versions") or {})
        rows = list(by_path.get("primary") or [])
        self.assertEqual(len(rows), 1)
        rows[0]["status"] = "running"
        rows[0]["created_at"] = int(time.time()) - 10000
        rows[0]["error_message"] = None
        by_path["primary"] = rows
        iv["report_versions"] = by_path
        sess.interview = iv
        st.save(sess)

        listed = self.list_path_report_versions(sid, "primary")
        self.assertEqual(len(listed), 1)
        self.assertEqual(str(listed[0].get("status") or "").lower(), "error")
        details = self.get_report_version(rid)
        self.assertEqual(str(details.get("status") or "").lower(), "error")
        self.assertTrue("interrupted" in str(details.get("error_message") or "").lower())

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app.ai.deepseek_questions.generate_path_report")
    def test_generation_retries_with_compacted_payload_after_transport_error(self, mock_report, _mock_llm):
        calls = {"payloads": []}

        def _report_side_effect(*, payload, **kwargs):
            calls["payloads"].append(payload)
            if len(calls["payloads"]) == 1:
                raise RuntimeError("Response ended prematurely")
            return {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v1",
                "report_markdown": "# compact retry",
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "# compact retry",
            }

        mock_report.side_effect = _report_side_effect

        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        long_steps = [{"order_index": i + 1, "title": f"Step {i + 1}", "notes": "x" * 500} for i in range(120)]
        payload = _make_payload(sid, "primary")
        payload["steps"] = long_steps
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_compact",
                request_payload_json=payload,
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        details = self._wait_report_ready(rid)
        self.assertEqual(str(details.get("status") or "").lower(), "ok")
        warnings = details.get("warnings_json") or []
        self.assertIn("payload_compacted_retry", warnings)
        self.assertEqual(len(calls["payloads"]), 2)
        compact_meta = (calls["payloads"][1] or {}).get("_meta") or {}
        self.assertEqual(bool(compact_meta.get("compacted_for_llm")), True)

    @patch("app.main._run_path_report_generation_async", return_value=None)
    @patch("app.main.load_llm_settings", return_value={"api_key": "", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    def test_stale_marker_skips_active_running_report(self, _mock_llm, _mock_worker):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_active_running",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v1",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        self.assertTrue(rid)

        st = self.get_storage()
        sess = st.load(sid)
        iv = dict(getattr(sess, "interview", {}) or {})
        by_path = dict(iv.get("report_versions") or {})
        rows = list(by_path.get("primary") or [])
        rows[0]["status"] = "running"
        rows[0]["created_at"] = int(time.time()) - 10000
        rows[0]["error_message"] = None
        by_path["primary"] = rows
        iv["report_versions"] = by_path
        sess.interview = iv
        st.save(sess)

        self._set_report_active(rid, True)
        try:
            listed = self.list_path_report_versions(sid, "primary")
        finally:
            self._set_report_active(rid, False)
        self.assertEqual(len(listed), 1)
        self.assertEqual(str(listed[0].get("status") or "").lower(), "running")

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v2",
            "report_markdown": "## Structured",
            "report_json": {
                "title": "Structured",
                "summary": ["S1"],
                "kpis": {},
                "bottlenecks": [],
                "recommendations": [],
                "missing_data": [],
            },
            "raw_json": {"title": "Structured"},
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "",
        },
    )
    def test_detail_contains_structured_and_raw_json(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_json",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v2",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        detail = self._wait_report_ready(rid)
        self.assertEqual(str(detail.get("status") or "").lower(), "ok")
        self.assertEqual(str(detail.get("prompt_template_version") or ""), "v2")
        self.assertEqual((detail.get("report_json") or {}).get("title"), "Structured")
        self.assertEqual((detail.get("raw_json") or {}).get("title"), "Structured")
        self.assertTrue(isinstance(detail.get("request_payload_json"), dict))

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        side_effect=[
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v2",
                "report_markdown": "## First",
                "payload_normalized": {"title": "First", "summary": ["S1"], "kpis": {"steps_count": 1, "work_total_sec": 1, "wait_total_sec": 0, "total_sec": 1}, "recommendations": [], "improvements_top5": [], "missing_data": [], "risks": []},
                "payload_raw": {"title": "First"},
                "report_json": {"title": "First"},
                "raw_json": {"title": "First"},
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "",
            },
            {
                "status": "ok",
                "model": "deepseek-chat",
                "prompt_template_version": "v2",
                "report_markdown": "## Second",
                "payload_normalized": {"title": "Second", "summary": ["S2"], "kpis": {"steps_count": 1, "work_total_sec": 1, "wait_total_sec": 0, "total_sec": 1}, "recommendations": [], "improvements_top5": [], "missing_data": [], "risks": []},
                "payload_raw": {"title": "Second"},
                "report_json": {"title": "Second"},
                "raw_json": {"title": "Second"},
                "recommendations": [],
                "missing_data": [],
                "risks": [],
                "warnings": [],
                "raw_text": "",
            },
        ],
    )
    def test_delete_path_report_version_removes_row_and_repoints_latest(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        payload = _make_payload(sid, "primary")
        out1 = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_del_1",
                request_payload_json=payload,
                prompt_template_version="v2",
            ),
        )
        out2 = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_del_2",
                request_payload_json=payload,
                prompt_template_version="v2",
            ),
        )
        rid1 = str((out1.get("report") or {}).get("id") or "")
        rid2 = str((out2.get("report") or {}).get("id") or "")
        self._wait_report_ready(rid1)
        self._wait_report_ready(rid2)

        resp = self.delete_path_report_version(sid, "primary", rid2)
        self.assertEqual(getattr(resp, "status_code", 0), 204)

        rows = self.list_path_report_versions(sid, "primary")
        self.assertEqual(len(rows), 1)
        self.assertEqual(str(rows[0].get("id") or ""), rid1)
        self.assertEqual(self.get_report_version(rid2).get("error"), "not found")

        session = self.get_session(sid)
        latest = ((session.get("interview") or {}).get("path_reports") or {}).get("primary") or {}
        self.assertEqual(str(latest.get("id") or ""), rid1)

    @patch("app.main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v2",
            "report_markdown": "## Structured",
            "payload_normalized": {"title": "Structured", "summary": ["S1"], "kpis": {"steps_count": 1, "work_total_sec": 1, "wait_total_sec": 0, "total_sec": 1}, "recommendations": [], "improvements_top5": [], "missing_data": [], "risks": []},
            "payload_raw": {"title": "Structured"},
            "report_json": {"title": "Structured"},
            "raw_json": {"title": "Structured"},
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "",
        },
    )
    def test_delete_report_version_global_endpoint(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Reports"))
        sid = str(created["id"])
        out = self.create_path_report_version(
            sid,
            "primary",
            self.CreatePathReportVersionIn(
                steps_hash="hash_global_delete",
                request_payload_json=_make_payload(sid, "primary"),
                prompt_template_version="v2",
            ),
        )
        rid = str((out.get("report") or {}).get("id") or "")
        self._wait_report_ready(rid)

        resp = self.delete_report_version(rid)
        self.assertEqual(getattr(resp, "status_code", 0), 204)
        self.assertEqual(self.get_report_version(rid).get("error"), "not found")


if __name__ == "__main__":
    unittest.main()
