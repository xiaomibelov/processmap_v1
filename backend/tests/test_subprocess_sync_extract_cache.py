"""fix/subprocess-sync-extract-cache-v1 — контрактные тесты parse-once sync-блока.

Доказательства:
- побайтовый паритет extract_subprocess_xml (per-call) vs extract_subprocess_xml_from_root
  (общее дерево) на диаграммах с 0 / 1 / 33 subprocess + callActivity-ветка;
- общее дерево не мутируется между итерациями (последовательный extract всех 33);
- auto_create_subprocess_sessions: паритет набора созданных/обновлённых сессий
  и их child XML на эталонных диаграммах (0/1/33), идемпотентность повторного sync;
- невалидный XML: семантика ошибок прежняя (sync пропускается, удалений нет);
- middleware-форматтер рендерит extra duration_ms.
"""
import logging
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from types import SimpleNamespace

import pytest

pytestmark = pytest.mark.skip_if_hanging

from app.services.bpmn_navigation import (
    extract_subprocess_xml,
    extract_subprocess_xml_from_root,
    find_bpmn_element_from_root,
    find_subprocess_elements,
)
from app.services import session_service as svc


BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"


def _diagram(element_ids, include_nested=False):
    """Диаграмма с заданными id subprocess-элементов (без DI)."""
    subs = []
    for i, eid in enumerate(element_ids):
        inner = ""
        if include_nested and i == 0:
            inner = f'<subProcess id="{eid}_inner" name="Inner" />'
        subs.append(f'<subProcess id="{eid}" name="Sub {eid}">{inner}</subProcess>')
    body = "".join(subs)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<definitions xmlns="{BPMN}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'id="defs" targetNamespace="http://bpmn.io/schema/bpmn">'
        f'<process id="proc_main">{body}</process>'
        "</definitions>"
    )


def _diagram_with_callactivity(sub_id, called_id):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<definitions xmlns="{BPMN}" id="defs" targetNamespace="http://bpmn.io/schema/bpmn">'
        f'<process id="proc_main"><callActivity id="{sub_id}" calledElement="{called_id}" />'
        f'<process id="{called_id}"><task id="t_in_called" /></process>'
        "</process></definitions>"
    )


class TestExtractParity(unittest.TestCase):
    """Паритет per-call extract и from_root extract на 0/1/33 элементах."""

    def test_zero_elements_both_none(self):
        xml = _diagram([])
        root = ET.fromstring(xml)
        self.assertIsNone(extract_subprocess_xml(xml, "missing"))
        self.assertIsNone(extract_subprocess_xml_from_root(root, "missing"))

    def test_single_element_parity(self):
        xml = _diagram(["sub_a"])
        expected = extract_subprocess_xml(xml, "sub_a")
        root = ET.fromstring(xml)
        actual = extract_subprocess_xml_from_root(root, "sub_a")
        self.assertIsNotNone(expected)
        self.assertEqual(actual, expected)

    def test_33_elements_sequential_parity_and_root_intact(self):
        ids = [f"sub_{i:02d}" for i in range(33)]
        xml = _diagram(ids)
        root = ET.fromstring(xml)
        for eid in ids:
            per_call = extract_subprocess_xml(xml, eid)
            from_root = extract_subprocess_xml_from_root(root, eid)
            self.assertEqual(from_root, per_call, f"parity broken for {eid}")
        # общее дерево не мутировано: все subprocess-элементы на месте
        for eid in ids:
            el = find_bpmn_element_from_root(root, eid)
            self.assertIsNotNone(el, f"root lost element {eid}")

    def test_nested_subprocess_present_in_parent_tree(self):
        xml = _diagram(["sub_a"], include_nested=True)
        root = ET.fromstring(xml)
        out = extract_subprocess_xml_from_root(root, "sub_a")
        self.assertIsNotNone(out)
        self.assertIn('id="sub_a_inner"', out)

    def test_callactivity_branch_parity(self):
        xml = _diagram_with_callactivity("call_1", "proc_called")
        expected = extract_subprocess_xml(xml, "call_1")
        root = ET.fromstring(xml)
        actual = extract_subprocess_xml_from_root(root, "call_1")
        self.assertIsNotNone(expected)
        self.assertEqual(actual, expected)

    def test_embedded_process_lookup_from_root(self):
        xml = _diagram_with_callactivity("call_1", "proc_called")
        root = ET.fromstring(xml)
        el = find_bpmn_element_from_root(root, "proc_called")
        self.assertIsNotNone(el)


class TestAutoCreateSyncContract(unittest.TestCase):
    """Паритет семантики sync на 0/1/33 элементах + идемпотентность.

    Идём через svc.bpmn_save (wrapper legacy save + auto-create блок) — это
    реальный путь PUT /api/sessions/{id}/bpmn.
    """

    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._orig_db_path = os.environ.get("PROCESS_DB_PATH")
        self._orig_db_backend = os.environ.get("FPC_DB_BACKEND")
        self._orig_database_url = os.environ.get("DATABASE_URL")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.environ["PROCESS_DB_PATH"] = os.path.join(self._temp_dir.name, "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
        except Exception:
            pass

        from app.auth import create_user
        from app.storage import create_org_record, get_storage, upsert_org_membership

        self.st = get_storage()
        self.owner = create_user("sync-owner@local", "password", is_admin=True)
        create_org_record("Sync Fix Org", created_by=str(self.owner["id"]), org_id="org_sync_fix")
        upsert_org_membership("org_sync_fix", str(self.owner["id"]), "admin")
        self.org = "org_sync_fix"
        self.project = "proj_sync_fix"
        self._counter = 0

    def tearDown(self):
        for var, old in (
            ("PROCESS_STORAGE_DIR", self._orig_process_storage_dir),
            ("PROJECT_STORAGE_DIR", self._orig_project_storage_dir),
            ("PROCESS_DB_PATH", self._orig_db_path),
            ("FPC_DB_BACKEND", self._orig_db_backend),
            ("DATABASE_URL", self._orig_database_url),
        ):
            if old is None:
                os.environ.pop(var, None)
            else:
                os.environ[var] = old
        self._temp_dir.cleanup()
        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()

    def _save_bpmn(self, xml):
        from app.schemas.legacy_api import BpmnXmlIn

        self._counter += 1
        sid = self.st.create(
            title=f"parent_{self._counter}",
            user_id=str(self.owner["id"]),
            org_id=self.org,
            project_id=self.project,
        )
        req = _DummyRequest(self.owner, self.org)
        out = svc.bpmn_save(
            sid,
            BpmnXmlIn(
                xml=xml,
                bpmn_meta={},
                source_action="manual_save",
                import_note="",
            ),
            request=req,
        )
        return sid, out

    def _children(self, sid):
        from app.storage import list_session_children

        rows = list(
            list_session_children(
                self.org, self.project, sid, user_id=str(self.owner["id"])
            )
        )
        # list_session_children отдаёт проекцию без bpmn_xml — догружаем полную сессию
        out = []
        for row in rows:
            rid = str((row or {}).get("id") or "")
            full = self.st.load(rid, org_id=self.org, is_admin=True) if rid else None
            out.append(full if full is not None else row)
        return out

    def test_zero_elements_no_children_no_deletions(self):
        sid, out = self._save_bpmn(_diagram([]))
        self.assertTrue(out.get("ok"))
        self.assertNotIn("subprocesses_total", out)
        self.assertEqual(self._children(sid), [])

    def test_single_element_creates_one_session_with_expected_xml(self):
        sid, out = self._save_bpmn(_diagram(["sub_a"]))
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("subprocesses_total"), 1)
        self.assertEqual(out.get("subprocesses_created"), 1)
        children = self._children(sid)
        self.assertEqual(len(children), 1)
        child_xml = str(getattr(children[0], "bpmn_xml", "") or "")
        self.assertIn('id="sub_a"', child_xml)
        self.assertIn("Definitions_subprocess", child_xml)
        # валидный standalone-документ
        ET.fromstring(child_xml)

    def test_33_elements_create_all_sequentially(self):
        ids = [f"sub_{i:02d}" for i in range(33)]
        sid, out = self._save_bpmn(_diagram(ids))
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("subprocesses_total"), 33)
        self.assertEqual(out.get("subprocesses_created"), 33)
        children = self._children(sid)
        self.assertEqual(len(children), 33)
        titles = sorted(str(getattr(c, "title", "") or "") for c in children)
        self.assertEqual(titles, sorted(f"Sub {eid}" for eid in ids))

    def test_idempotent_second_sync_skips_existing(self):
        xml = _diagram(["sub_a", "sub_b"])
        sid, out1 = self._save_bpmn(xml)
        self.assertEqual(out1.get("subprocesses_created"), 2)
        # тот же XML ещё раз (аналог retry PUT): дублей нет, всё skipped
        from app.schemas.legacy_api import BpmnXmlIn

        req = _DummyRequest(self.owner, self.org)
        out2 = svc.bpmn_save(
            sid,
            BpmnXmlIn(xml=xml, bpmn_meta={}, source_action="manual_save", import_note=""),
            request=req,
        )
        self.assertTrue(out2.get("ok"))
        self.assertEqual(out2.get("subprocesses_created"), 0)
        self.assertEqual(out2.get("subprocesses_total"), 2)
        children = self._children(sid)
        self.assertEqual(len(children), 2)

    def test_invalid_xml_sync_skipped_no_deletions(self):
        # семантика прежняя: unparseable → sync пропущен (warning), никаких удалений
        self.assertFalse(svc._bpmn_xml_parseable("not xml at all <<<"))
        sid, out = self._save_bpmn("not xml at all <<<")
        self.assertTrue(out.get("ok"))
        self.assertNotIn("subprocesses_total", out)
        self.assertEqual(self._children(sid), [])


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class TestExtrasFormatter(unittest.TestCase):
    def test_duration_ms_rendered(self):
        from app.middleware.logging_middleware import _ExtrasFormatter

        formatter = _ExtrasFormatter("%(levelname)s %(name)s %(message)s")
        record = logging.LogRecord(
            name="backend.app.middleware.logging_middleware",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="bpmn_save_request",
            args=(),
            exc_info=None,
        )
        record.duration_ms = 123.45
        record.status_code = 200
        out = formatter.format(record)
        self.assertIn("bpmn_save_request", out)
        self.assertIn("duration_ms=123.45", out)
        self.assertIn("status_code=200", out)

    def test_no_extras_no_suffix(self):
        from app.middleware.logging_middleware import _ExtrasFormatter

        formatter = _ExtrasFormatter("%(levelname)s %(message)s")
        record = logging.LogRecord("x", logging.INFO, __file__, 1, "plain", (), None)
        self.assertEqual(formatter.format(record), "INFO plain")
