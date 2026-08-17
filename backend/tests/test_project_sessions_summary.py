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

    def test_summary_includes_formal_subprocess_flag(self):
        """T1: summary отдаёт формальный признак сабпроцесса
        (parent_session_id / element_id_in_parent / is_subprocess) —
        пикер источника TO BE исключает сабпроцессы по флагу, не по имени."""
        storage = self.get_storage()
        child_id = storage.create(
            "Хранение шпильки в Холодильной камере",
            roles=["cook"],
            project_id=self.project_id,
            mode="quick_skeleton",
            org_id=self.org_id,
            is_admin=True,
        )
        child = storage.load(child_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(child)
        child.parent_session_id = self.session_id
        child.element_id_in_parent = "Activity_abc123"
        storage.save(child, org_id=self.org_id, is_admin=True)

        rows = self.list_project_sessions(self.project_id, view="summary")
        by_id = {str(row.get("id") or ""): row for row in rows}
        self.assertEqual(len(rows), 2)

        child_row = by_id[child_id]
        self.assertEqual(child_row.get("parent_session_id"), self.session_id)
        self.assertEqual(child_row.get("element_id_in_parent"), "Activity_abc123")
        self.assertEqual(child_row.get("is_subprocess"), True)

        root_row = by_id[self.session_id]
        self.assertEqual(root_row.get("parent_session_id"), "")
        self.assertEqual(root_row.get("is_subprocess"), False)

    def test_summary_derives_real_status_and_stage(self):
        """P2 [Б]: summary отдаёт реальный status/stage для StatusBadge дерева
        explorer (derive через derive_session_status: manual interview.status
        > report_versions > контент > draft), interview в payload не попадает."""
        rows = self.list_project_sessions(self.project_id, view="summary")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        # setUp: interview.status="review", stage="audit" — manual status побеждает
        self.assertEqual(row.get("status"), "review")
        self.assertEqual(row.get("stage"), "audit")
        self.assertNotIn("interview", row)

        # без manual status, но с report_versions → ready
        storage = self.get_storage()
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        session.interview = {"report_versions": {"Path_1": [{"report_markdown": "r"}]}}
        storage.save(session, org_id=self.org_id, is_admin=True)
        rows2 = self.list_project_sessions(self.project_id, view="summary")
        self.assertEqual(rows2[0].get("status"), "ready")

        # пустая сессия без контента → draft
        empty_id = storage.create(
            "Empty session", roles=["cook"], project_id=self.project_id,
            mode="quick_skeleton", org_id=self.org_id, is_admin=True,
        )
        rows3 = self.list_project_sessions(self.project_id, view="summary")
        by_id = {str(r.get("id") or ""): r for r in rows3}
        self.assertEqual(by_id[empty_id].get("status"), "draft")

    def test_invalid_summary_view_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.list_project_sessions(self.project_id, view="tiny")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_process_layer_in_summary_projection_and_cache(self):
        """W4/R3: process_layer и derived_from_session_id обязаны присутствовать
        во ВСЕХ read-path'ах сессии (класс бага «explicit SELECT без новой
        колонки» — встретился в summary, load_session_projection и кэше)."""
        storage = self.get_storage()
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.process_layer = "to_be"
        session.derived_from_session_id = "asis_sid_1"
        storage.save(session, org_id=self.org_id, is_admin=True)

        # 1. summary-список сессий проекта
        rows = self.list_project_sessions(self.project_id, view="summary")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("process_layer"), "to_be")
        self.assertEqual(rows[0].get("derived_from_session_id"), "asis_sid_1")

        # 2. projection (read-path GET /api/sessions/{id})
        proj = storage.load_session_projection(
            self.session_id, org_id=self.org_id, is_admin=True,
        )
        self.assertIsNotNone(proj)
        self.assertEqual(str(proj.get("process_layer") or ""), "to_be")
        self.assertEqual(str(proj.get("derived_from_session_id") or ""), "asis_sid_1")

        # 3. cache-проекция (то, что реально отдаёт GET /api/sessions/{id})
        from app.services.session_service import _build_session_projection
        cached = _build_session_projection(proj)
        self.assertEqual(cached.get("process_layer"), "to_be")
        self.assertEqual(cached.get("derived_from_session_id"), "asis_sid_1")

        # 4. as_is по умолчанию — не None и не пустая строка-None
        rows2 = self.list_project_sessions(self.project_id, view="summary")
        self.assertNotIn(rows2[0].get("process_layer"), (None, "None"))


if __name__ == "__main__":
    unittest.main()
