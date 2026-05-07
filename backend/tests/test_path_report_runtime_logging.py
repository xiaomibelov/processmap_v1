import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def _make_payload(session_id: str, path_id: str, *, marker: str = "") -> dict:
    title = marker or "Step A"
    return {
        "session_id": session_id,
        "path_id": path_id,
        "path_name": f"Path {path_id}",
        "generated_at": "2026-05-07T00:00:00.000Z",
        "totals": {"steps_count": 1, "work_total_sec": 60, "wait_total_sec": 0, "total_sec": 60},
        "steps": [{"order_index": 1, "title": title}],
    }


class PathReportRuntimeLoggingTests(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_path_report_sync_mode = os.environ.get("PATH_REPORT_SYNC_MODE")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp_sessions.name) / "path_report_runtime.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ["PATH_REPORT_SYNC_MODE"] = "1"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app._legacy_main import (
            CreatePathReportVersionIn,
            CreateSessionIn,
            create_path_report_version,
            create_session,
            get_path_report_version_detail,
        )
        from app.storage import get_default_org_id

        self.CreatePathReportVersionIn = CreatePathReportVersionIn
        self.CreateSessionIn = CreateSessionIn
        self.create_path_report_version = create_path_report_version
        self.create_session = create_session
        self.get_path_report_version_detail = get_path_report_version_detail
        self.org_id = get_default_org_id()

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_project_storage_dir
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        if self.old_path_report_sync_mode is None:
            os.environ.pop("PATH_REPORT_SYNC_MODE", None)
        else:
            os.environ["PATH_REPORT_SYNC_MODE"] = self.old_path_report_sync_mode
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _create_report(self, sid: str, path_id: str = "primary", prompt_template_version: str = "v2", marker: str = ""):
        return self.create_path_report_version(
            sid,
            path_id,
            self.CreatePathReportVersionIn(
                steps_hash=f"hash_{path_id}",
                request_payload_json=_make_payload(sid, path_id, marker=marker),
                prompt_template_version=prompt_template_version,
            ),
        )

    def _logs(self, *, module_id="ai.path_report", session_id=""):
        from app.ai.execution_log import list_ai_executions

        return list_ai_executions(
            org_id=self.org_id,
            module_id=module_id,
            session_id=session_id,
            limit=20,
            offset=0,
        ).get("items") or []

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v2",
            "report_markdown": "## Runtime report",
            "payload_normalized": {"title": "Runtime report", "recommendations": [], "missing_data": [], "risks": []},
            "payload_raw": {"title": "Runtime report"},
            "report_json": {"title": "Runtime report"},
            "raw_json": {"title": "Runtime report"},
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "",
        },
    )
    def test_success_generation_writes_ai_path_report_execution_log(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Path runtime"))
        sid = str(created["id"])

        out = self._create_report(sid, "primary")
        rid = str((out.get("report") or {}).get("id") or "")
        detail = self.get_path_report_version_detail(sid, "primary", rid)
        self.assertEqual(str(detail.get("status") or "").lower(), "ok")
        self.assertIn("report_json", detail)
        self.assertIn("request_payload_json", detail)

        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        row = logs[0]
        self.assertEqual(row.get("module_id"), "ai.path_report")
        self.assertEqual(row.get("status"), "success")
        self.assertTrue(str(row.get("input_hash") or ""))
        self.assertEqual((row.get("usage") or {}).get("path_id"), "primary")
        self.assertEqual((row.get("usage") or {}).get("report_id"), rid)

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app.ai.deepseek_questions.generate_path_report", side_effect=RuntimeError("provider failed"))
    def test_error_generation_writes_error_execution_log(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Path runtime error"))
        sid = str(created["id"])

        out = self._create_report(sid, "primary")
        rid = str((out.get("report") or {}).get("id") or "")
        detail = self.get_path_report_version_detail(sid, "primary", rid)
        self.assertEqual(str(detail.get("status") or "").lower(), "error")

        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "error")
        self.assertEqual(logs[0].get("error_code"), "provider_failed")
        self.assertIn("provider failed", str(logs[0].get("error_message") or ""))

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "SECRET_SHOULD_NOT_LEAK", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_questions.generate_path_report",
        return_value={
            "status": "ok",
            "model": "deepseek-chat",
            "prompt_template_version": "v2",
            "report_markdown": "## Runtime report",
            "recommendations": [],
            "missing_data": [],
            "risks": [],
            "warnings": [],
            "raw_text": "",
        },
    )
    def test_execution_log_keeps_hash_not_raw_payload_or_api_key(self, _mock_report, _mock_llm):
        marker = "RAW_PATH_PAYLOAD_SHOULD_NOT_BE_STORED"
        created = self.create_session(self.CreateSessionIn(title="Path runtime safe log"))
        sid = str(created["id"])

        self._create_report(sid, "primary", marker=marker)

        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        text = str(logs[0])
        self.assertTrue(str(logs[0].get("input_hash") or ""))
        self.assertNotIn(marker, text)
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", text)
        self.assertNotIn("request_payload_json", text)

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app._legacy_main.check_ai_rate_limit")
    @patch("app.ai.deepseek_questions.generate_path_report")
    def test_rate_limit_block_marks_report_error_and_skips_provider(self, mock_report, mock_rate_limit, _mock_llm):
        mock_rate_limit.return_value = {"allowed": False, "limit": 1, "window_sec": 3600, "reset_at": 12345}
        created = self.create_session(self.CreateSessionIn(title="Path runtime rate"))
        sid = str(created["id"])

        out = self._create_report(sid, "primary")
        rid = str((out.get("report") or {}).get("id") or "")
        detail = self.get_path_report_version_detail(sid, "primary", rid)

        self.assertEqual(str(detail.get("status") or "").lower(), "error")
        self.assertIn("ai_rate_limit_exceeded", str(detail.get("error_message") or ""))
        mock_report.assert_not_called()
        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("error_code"), "ai_rate_limit_exceeded")

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app.ai.deepseek_questions._deepseek_chat_text")
    def test_active_prompt_overrides_and_fallback_preserves_path_prompt(self, mock_chat, _mock_llm):
        from app.ai.deepseek_questions import _PATH_REPORT_PROMPT_TEMPLATE_V2
        from app.ai.prompt_registry import activate_prompt_version, create_prompt_draft

        captured = []

        def _fake_chat(*, api_key, base_url, messages, timeout=30, max_tokens=None):
            captured.append(messages)
            return '{"title":"Runtime report","summary":["S1"],"recommendations":[],"missing_data":[],"risks":[]}'

        mock_chat.side_effect = _fake_chat
        created = self.create_session(self.CreateSessionIn(title="Path prompt fallback"))
        sid = str(created["id"])

        self._create_report(sid, "primary")
        self.assertEqual(str((captured[-1][0] or {}).get("content") or ""), _PATH_REPORT_PROMPT_TEMPLATE_V2)

        draft = create_prompt_draft(
            module_id="ai.path_report",
            version="v-test",
            template="ACTIVE PATH REPORT PROMPT",
            created_by="tester",
            scope_level="global",
        )
        activate_prompt_version(str(draft.get("prompt_id") or ""), actor_user_id="tester")

        created2 = self.create_session(self.CreateSessionIn(title="Path prompt active"))
        sid2 = str(created2["id"])
        self._create_report(sid2, "primary")
        self.assertEqual(str((captured[-1][0] or {}).get("content") or ""), "ACTIVE PATH REPORT PROMPT")

        logs = self._logs(session_id=sid2)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("prompt_id"), draft.get("prompt_id"))
        self.assertEqual(logs[0].get("prompt_version"), "v-test")


if __name__ == "__main__":
    unittest.main()
