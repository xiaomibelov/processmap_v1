"""fix/tobe-element-provenance-persistence-v1 — sidecar-снапшот trace_map в meta сессии.

Канал 2 плана: create TO BE из draft принимает bpmn_meta={"provenance": {...}}
(extra="allow" в CreateSessionIn), персистит его в sessions.bpmn_meta_json;
GET /api/sessions/{id}/meta отдаёт provenance обратно.

Паттерн — test_sessions_drift.py / test_workspace_access_controls.py:
SQLite через PROCESS_DB_PATH/PROCESS_STORAGE_DIR/PROJECT_STORAGE_DIR, прямые
вызовы сервисов с _DummyRequest.
"""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


TRACE_MAP = [
    {
        "element_id": "AsIs_1",
        "element_type": "task",
        "name": "Шаг A",
        "fate": "transformed_to",
        "rule_id": "R01_move",
        "rule_name": "",
        "draft_node_ids": ["Task_a"],
        "note": "",
    },
    {
        "element_id": "AsIs_2",
        "element_type": "task",
        "name": "Шаг B",
        "fate": "pushed_below",
        "rule_id": None,
        "rule_name": "",
        "draft_node_ids": [],
        "note": "removed — только sidecar",
    },
]


class TobeProvenanceSidecarTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = str(Path(self._tmp.name) / "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = str(Path(self._tmp.name) / "projects")
        os.environ["PROCESS_DB_PATH"] = str(Path(self._tmp.name) / "processmap.sqlite3")
        for key in ("PROCESS_STORAGE_DIR", "PROJECT_STORAGE_DIR"):
            os.makedirs(os.environ[key], exist_ok=True)

        from app.auth import create_user
        from app.storage import get_default_org_id, get_storage, upsert_org_membership

        self.admin = create_user("prov_admin@local", "password", is_admin=False)
        self.org_id = get_default_org_id()
        upsert_org_membership(self.org_id, str(self.admin.get("id") or ""), "org_admin")
        _ = get_storage()

        from app._legacy_main import CreateProjectIn, create_project

        project = create_project(CreateProjectIn(title="Prov project"), self._req(self.admin))
        self.project_id = str(project.get("id") or "")

    def tearDown(self):
        for key in ("PROCESS_STORAGE_DIR", "PROJECT_STORAGE_DIR", "PROCESS_DB_PATH"):
            os.environ.pop(key, None)
        self._tmp.cleanup()

    def _req(self, user):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _create_tobe_session(self, extra_body=None):
        from app._legacy_main import CreateSessionIn, create_project_session

        body = {
            "title": "TO BE: процесс v1",
            "process_layer": "to_be",
            "derived_from_session_id": "asis_1",
        }
        if extra_body:
            body.update(extra_body)
        return create_project_session(
            self.project_id,
            CreateSessionIn(**body),
            "quick_skeleton",
            request=self._req(self.admin),
        )

    # ------------------------------------------------------------------
    # Канал 2: sidecar в bpmn_meta при create
    # ------------------------------------------------------------------
    def test_create_persists_provenance_sidecar_in_bpmn_meta(self):
        session = self._create_tobe_session(
            {"bpmn_meta": {"provenance": {"source": "transform_asis", "trace_map": TRACE_MAP}}}
        )
        sid = str(session.get("id") or "")
        self.assertTrue(sid)

        from app.storage import get_storage

        st = get_storage()
        sess = st.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        provenance = (sess.bpmn_meta or {}).get("provenance") or {}
        self.assertEqual(provenance.get("source"), "transform_asis")
        self.assertEqual(len(provenance.get("trace_map") or []), 2)
        # removed-элемент цел в sidecar (в XML его нет по определению)
        removed = [t for t in provenance["trace_map"] if t.get("element_id") == "AsIs_2"]
        self.assertEqual(len(removed), 1)
        self.assertEqual(removed[0].get("draft_node_ids"), [])

        # W4-поля не сломаны sidecar-записью
        self.assertEqual(str(getattr(sess, "process_layer", "")), "to_be")
        self.assertEqual(str(getattr(sess, "derived_from_session_id", "")), "asis_1")

    def test_create_without_bpmn_meta_keeps_empty_meta(self):
        session = self._create_tobe_session()
        sid = str(session.get("id") or "")

        from app.storage import get_storage

        sess = get_storage().load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        self.assertEqual(sess.bpmn_meta or {}, {})

    def test_create_rejects_non_serializable_bpmn_meta(self):
        with self.assertRaises(HTTPException) as ctx:
            self._create_tobe_session({"bpmn_meta": {"provenance": {"bad": object()}}})
        self.assertEqual(int(ctx.exception.status_code), 422)

    # ------------------------------------------------------------------
    # GET /api/sessions/{id}/meta отдаёт provenance
    # ------------------------------------------------------------------
    def test_get_session_meta_returns_provenance(self):
        session = self._create_tobe_session(
            {"bpmn_meta": {"provenance": {"source": "transform_asis", "trace_map": TRACE_MAP}}}
        )
        sid = str(session.get("id") or "")

        from app.services.session_service import get_session_meta

        meta = get_session_meta(sid, request=self._req(self.admin))
        self.assertEqual(str(meta.get("session_id") or ""), sid)
        provenance = meta.get("provenance") or {}
        self.assertEqual(provenance.get("source"), "transform_asis")
        self.assertEqual(len(provenance.get("trace_map") or []), 2)

    def test_get_session_meta_provenance_absent_when_no_sidecar(self):
        session = self._create_tobe_session()
        sid = str(session.get("id") or "")

        from app.services.session_service import get_session_meta

        meta = get_session_meta(sid, request=self._req(self.admin))
        self.assertTrue(meta.get("provenance") is None)

    # ------------------------------------------------------------------
    # Explorer-путь create (POST /api/projects/{id}/explorer/sessions)
    # ------------------------------------------------------------------
    def test_explorer_create_persists_provenance_sidecar(self):
        from app.routers.explorer import CreateSessionBody, create_session_in_project
        from app.storage import create_project_in_folder, create_workspace_folder, list_org_workspaces

        admin_id = str(self.admin.get("id") or "")
        workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        folder_id = str(
            create_workspace_folder(
                self.org_id, workspace_id, "Prov Folder", user_id=admin_id
            ).get("id") or ""
        )
        pid = str(
            create_project_in_folder(
                self.org_id, workspace_id, folder_id, "Prov Explorer Project", user_id=admin_id
            )
        )
        body = CreateSessionBody(
            name="TO BE: explorer v1",
            mode="quick_skeleton",
            process_layer="to_be",
            derived_from_session_id="asis_1",
            bpmn_meta={"provenance": {"source": "transform_asis", "trace_map": TRACE_MAP}},
        )
        out = create_session_in_project(pid, body, self._req(self.admin), workspace_id=workspace_id)
        sid = str(out.get("id") or "")
        self.assertTrue(sid)

        from app.storage import get_storage

        sess = get_storage().load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        provenance = (sess.bpmn_meta or {}).get("provenance") or {}
        self.assertEqual(len(provenance.get("trace_map") or []), 2)
        self.assertEqual(str(getattr(sess, "process_layer", "")), "to_be")


if __name__ == "__main__":
    unittest.main()
