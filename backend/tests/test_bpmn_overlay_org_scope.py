"""Регрессия: GET /api/sessions/{id}/bpmn в overlay-режиме (default include_overlay=1)
для сессии в НЕ-default org возвращал ПУСТОЕ тело 200 — overlay-пайплайн грузил
сессию через _legacy_load_session_scoped(sid, None) без org-контекста запроса.
Сломанный путь использует TO BE-рабочее место (шаг «Импорт AS IS») → «Сессия AS IS пуста»
при живом источнике. Фикс: request проброшен через get_overlay → wired fetch/render.
"""
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import fakeredis

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="start"/>
    <bpmn:task id="Task_1" name="Нарезка томатов"/>
    <bpmn:endEvent id="EndEvent_1" name="end"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="200" y="80" width="140" height="70"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="420" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class BpmnOverlayOrgScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app._legacy_main import (
            BpmnXmlIn,
            CreateProjectIn,
            CreateSessionIn,
            create_project,
            create_project_session,
            session_bpmn_export,
            session_bpmn_save,
        )
        from app.storage import create_org_record, upsert_org_membership

        self.BpmnXmlIn = BpmnXmlIn

        import time as _time

        admin = create_user(f"overlay_org_admin_{int(_time.time() * 1000)}@local", "strongpass", is_admin=True)
        self.admin = admin
        foreign_org = create_org_record("Overlay Foreign Org", created_by=str(admin.get("id") or ""))
        self.org_id = str(foreign_org.get("id") or "")
        upsert_org_membership(self.org_id, str(admin.get("id") or ""), "org_admin")

        req = self._mk_req(admin, self.org_id)
        project = create_project(CreateProjectIn(title="Overlay project"), req)
        session = create_project_session(
            str(project.get("id") or ""),
            CreateSessionIn(title="Overlay session"),
            "quick_skeleton",
            request=req,
        )
        self.session_id = str(session.get("id") or "")
        self.assertTrue(self.session_id)
        saved = session_bpmn_save(self.session_id, BpmnXmlIn(xml=SAMPLE_BPMN_XML), req)
        self.assertTrue(bool((saved or {}).get("ok")))
        self.session_bpmn_export = session_bpmn_export

        # overlay_cache → fakeredis; celery-рендер не диспатчим.
        from app import overlay_cache

        self._oc = overlay_cache
        self._old_r = overlay_cache.r
        overlay_cache.r = fakeredis.FakeRedis(decode_responses=False)
        self._delay_patcher = patch("app.tasks.render_overlay_task.delay", lambda *a, **k: None)
        self._delay_patcher.start()

    def tearDown(self):
        self._delay_patcher.stop()
        self._oc.r = self._old_r
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _mk_req(self, user: dict, org_id: str):
        return _DummyRequest(user, active_org_id=org_id)

    def test_overlay_mode_returns_xml_for_non_default_org(self):
        # default: raw=0, include_overlay=1 — путь TO BE-рабочего места до фикса
        resp = self.session_bpmn_export(
            self.session_id,
            raw=0,
            include_overlay=1,
            zoom=1.0,
            pan_x=0.0,
            pan_y=0.0,
            request=self._mk_req(self.admin, self.org_id),
        )
        body = bytes(getattr(resp, "body", b"") or b"")
        self.assertGreater(len(body), 100, "overlay-режим вернул пустое тело для не-default org")
        self.assertIn(b"Task_1", body)

    def test_raw_mode_unaffected(self):
        resp = self.session_bpmn_export(
            self.session_id,
            raw=1,
            include_overlay=0,
            request=self._mk_req(self.admin, self.org_id),
        )
        body = bytes(getattr(resp, "body", b"") or b"")
        self.assertIn(b"Task_1", body)

    def test_overlay_cache_threads_request_to_wired_stubs(self):
        from app import overlay_cache

        sentinel = object()
        seen = {}

        def fake_fetch(sid, request=None):
            seen["fetch_request"] = request
            return "<bpmn/>"

        def fake_render(sid, xml, request=None):
            seen["render_request"] = request
            return "<bpmn>ok</bpmn>"

        with patch.object(overlay_cache, "fetch_session_bpmn", side_effect=fake_fetch):
            with patch.object(overlay_cache, "render_overlay_xml", side_effect=fake_render):
                res = overlay_cache.get_overlay("s-x", 1.0, 0, 0, request=sentinel)
        self.assertEqual(res.status, 200)
        self.assertIs(seen.get("fetch_request"), sentinel)
        self.assertIs(seen.get("render_request"), sentinel)


if __name__ == "__main__":
    unittest.main()
