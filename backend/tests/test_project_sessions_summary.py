import json
import os
import tempfile
import unittest

from fastapi import HTTPException


class ProjectSessionsSummaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app._legacy_main import CreateProjectIn, create_project, get_storage, list_project_sessions
        from app.storage import get_default_org_id

        self.CreateProjectIn = CreateProjectIn
        self.create_project = create_project
        self.get_storage = get_storage
        self.list_project_sessions = list_project_sessions
        self.org_id = get_default_org_id()

        project = self.create_project(self.CreateProjectIn(title="Payload project", passport={}))
        self.project_id = str(project.get("id") or "")
        self.assertTrue(self.project_id)

        storage = self.get_storage()
        self.session_id = storage.create(
            "Heavy session",
            roles=["cook", "tech"],
            project_id=self.project_id,
            mode="quick_skeleton",
            org_id=self.org_id,
            is_admin=True,
        )
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.bpmn_xml = "<bpmn:definitions>" + ("x" * 10000) + "</bpmn:definitions>"
        session.interview = {
            "status": "review",
            "stage": "audit",
            "report_versions": {"Path_1": [{"report_markdown": "r" * 8000}]},
        }
        session.bpmn_meta = {
            "drawio": {"svg": "s" * 7000},
            "camunda_extensions_by_element_id": {"Task_1": [{"name": "prop", "value": "value"}]},
        }
        session.notes_by_element = {"Task_1": {"body": "n" * 6000}}
        storage.save(session, org_id=self.org_id, is_admin=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_summary_view_excludes_heavy_session_fields(self):
        rows = self.list_project_sessions(self.project_id, view="summary")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.get("id"), self.session_id)
        self.assertEqual(row.get("session_id"), self.session_id)
        self.assertEqual(row.get("title"), "Heavy session")
        self.assertEqual(row.get("name"), "Heavy session")
        self.assertEqual(row.get("project_id"), self.project_id)
        self.assertEqual(row.get("mode"), "quick_skeleton")
        self.assertEqual(row.get("roles"), ["cook", "tech"])
        self.assertEqual(row.get("has_bpmn_xml"), True)

        for heavy_key in (
            "bpmn_xml",
            "interview",
            "bpmn_meta",
            "notes",
            "notes_by_element",
            "analytics",
            "resources",
            "normalized",
            "publish_git_mirror",
        ):
            self.assertNotIn(heavy_key, row)

        self.assertLess(len(json.dumps(rows, ensure_ascii=False)), 2000)

    def test_full_view_preserves_existing_project_sessions_contract(self):
        rows = self.list_project_sessions(self.project_id)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertIn("bpmn_xml", row)
        self.assertIn("interview", row)
        self.assertIn("bpmn_meta", row)
        self.assertIn("notes_by_element", row)
        self.assertGreater(len(str(row.get("bpmn_xml") or "")), 10000)
        self.assertEqual(row.get("interview", {}).get("status"), "review")

    def test_invalid_summary_view_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.list_project_sessions(self.project_id, view="tiny")
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
