"""Save-pipeline data-guard regression tests (audit P2-P6, track B).

Covers:
- B1/P2 (+C3): SQL-CAS on session row writes — concurrent PUT /bpmn and
  mixed-path PUT /bpmn ∥ PUT /sessions produce exactly one winner, no silent
  last-writer-wins loss.
- B2/P3: idempotent session create — unique natural key; parallel creates
  yield one 200 / one 409, incl. TO BE derived_from_session_id dedup.
- B3/P4: bpmn_versions snapshot is inserted in the same transaction as the
  session row; a failure leaves neither snapshot nor rev increment.
- B4/P5: GET /bpmn is read-only — even with a divergent graph fingerprint it
  does not change diagram_state_version nor grow bpmn_versions.
- B5/P6: explicit draft-graph (nodes/edges) writes on BPMN-XML-truth sessions
  are rejected with 409 instead of a silent no-op.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

import app.storage as storage_mod
from app.auth import create_access_token, create_user
from app.main import app
from app.models import Node
from app.storage import (
    get_default_org_id,
    get_storage,
)

# NOTE: other test modules in this suite call ``importlib.reload(app.storage)``
# (e.g. test_admin_agent_runs), which re-creates class objects in-place.
# Always resolve exception classes / the Storage class through the module at
# call time so assertRaises / patch.object stay correct after such reloads.


SIMPLE_BPMN_XML_A = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_guard_a"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_guard_a" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" name="Task A" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>"""

SIMPLE_BPMN_XML_B = SIMPLE_BPMN_XML_A.replace("guard_a", "guard_b").replace("Task A", "Task B")


class _SaveGuardTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")

        self.st = get_storage()
        suffix = uuid.uuid4().hex
        self.owner = create_user(f"save_guard_{suffix}@local", "password", is_admin=True)
        self.user_id = str(self.owner["id"])
        self.token = create_access_token(self.user_id)
        self.org_id = str(get_default_org_id() or "").strip() or "default"

    def tearDown(self):
        self.tmp.cleanup()

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "x-active-org-id": self.org_id,
        }

    def _new_client(self):
        return TestClient(app)

    def _create_project(self, title="guard-project"):
        from app._legacy_main import CreateProjectIn, create_project

        project = create_project(CreateProjectIn(title=title, passport={}))
        pid = str(project.get("id") or "")
        self.assertTrue(pid)
        return pid

    def _create_session(self, title="guard-session", project_id=None):
        return self.st.create(
            title=title,
            user_id=self.user_id,
            org_id=self.org_id,
            project_id=project_id,
            mode="quick_skeleton",
        )

    def _put_bpmn(self, sid, xml, base, client=None):
        c = client or self._new_client()
        return c.put(
            f"/api/sessions/{sid}/bpmn",
            json={"xml": xml, "base_diagram_state_version": base},
            headers=self._headers(),
        )


class TestConcurrentBpmnPutSqlCas(_SaveGuardTestBase):
    """B1/P2 + C3: concurrent PUT /bpmn with the same base — exactly one winner."""

    def test_parallel_bpmn_puts_exactly_one_winner(self):
        sid = self._create_session()
        barrier = threading.Barrier(2)
        results: dict[int, tuple[int, str]] = {}

        def worker(idx: int, xml: str):
            client = self._new_client()
            barrier.wait(timeout=10)
            resp = self._put_bpmn(sid, xml, base=0, client=client)
            results[idx] = (resp.status_code, resp.text)

        threads = [
            threading.Thread(target=worker, args=(0, SIMPLE_BPMN_XML_A)),
            threading.Thread(target=worker, args=(1, SIMPLE_BPMN_XML_B)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        statuses = sorted(code for code, _ in results.values())
        self.assertEqual(len(statuses), 2, results)
        self.assertEqual(statuses[0], 200, results)
        # Loser is rejected (CAS 409 or Redis-lock 423) — never a second 200.
        self.assertIn(statuses[1], (409, 423), results)

        reloaded = self.st.load(sid, is_admin=True)
        self.assertIsNotNone(reloaded)
        # Rev grows exactly by 1 — no lost update, no double increment.
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 1)
        winner_xml = SIMPLE_BPMN_XML_A if results[0][0] == 200 else SIMPLE_BPMN_XML_B
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), winner_xml)

    def test_mixed_path_put_bpmn_vs_put_session_exactly_one_winner(self):
        sid = self._create_session()
        barrier = threading.Barrier(2)
        results: dict[str, tuple[int, str]] = {}

        def put_bpmn():
            client = self._new_client()
            barrier.wait(timeout=10)
            resp = self._put_bpmn(sid, SIMPLE_BPMN_XML_A, base=0, client=client)
            results["bpmn"] = (resp.status_code, resp.text)

        def put_session():
            client = self._new_client()
            barrier.wait(timeout=10)
            resp = client.put(
                f"/api/sessions/{sid}",
                json={"notes": "concurrent-notes", "base_diagram_state_version": 0},
                headers=self._headers(),
            )
            results["session"] = (resp.status_code, resp.text)

        threads = [threading.Thread(target=put_bpmn), threading.Thread(target=put_session)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        statuses = sorted(code for code, _ in results.values())
        self.assertEqual(statuses[0], 200, results)
        self.assertIn(statuses[1], (409, 423), results)

        reloaded = self.st.load(sid, is_admin=True)
        self.assertIsNotNone(reloaded)
        # Core P2 invariant: rev +1 exactly — one of the two writes is rejected,
        # not silently dropped after a 200.
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 1)
        if results["bpmn"][0] == 200:
            self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), SIMPLE_BPMN_XML_A)
        else:
            self.assertIn("concurrent-notes", str(getattr(reloaded, "notes", "") or ""))

    def test_sequential_writes_keep_working_with_sql_cas(self):
        sid = self._create_session()
        client = self._new_client()
        r1 = self._put_bpmn(sid, SIMPLE_BPMN_XML_A, base=0, client=client)
        self.assertEqual(r1.status_code, 200, r1.text)
        self.assertEqual(int(r1.json().get("diagram_state_version") or 0), 1)

        r2 = client.put(
            f"/api/sessions/{sid}",
            json={"notes": "after-bpmn", "base_diagram_state_version": 1},
            headers=self._headers(),
        )
        self.assertEqual(r2.status_code, 200, r2.text)
        self.assertEqual(int(r2.json().get("diagram_state_version") or 0), 2)

        stale = self._put_bpmn(sid, SIMPLE_BPMN_XML_B, base=1, client=client)
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(str((stale.json().get("detail") or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

        reloaded = self.st.load(sid, is_admin=True)
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), SIMPLE_BPMN_XML_A)
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 2)


class TestSessionCreateIdempotency(_SaveGuardTestBase):
    """B2/P3: parallel create — one 200, one 409; sequential dup — 409."""

    def test_sequential_duplicate_title_rejected(self):
        pid = self._create_project()
        client = self._new_client()
        r1 = client.post(
            f"/api/projects/{pid}/sessions?mode=quick_skeleton",
            json={"title": "SeqDup"},
            headers=self._headers(),
        )
        self.assertEqual(r1.status_code, 200, r1.text)
        r2 = client.post(
            f"/api/projects/{pid}/sessions?mode=quick_skeleton",
            json={"title": "SeqDup"},
            headers=self._headers(),
        )
        self.assertEqual(r2.status_code, 409, r2.text)

    def test_parallel_create_same_title_single_winner(self):
        pid = self._create_project()
        barrier = threading.Barrier(2)
        results: dict[int, tuple[int, str]] = {}

        def worker(idx: int):
            client = self._new_client()
            barrier.wait(timeout=10)
            resp = client.post(
                f"/api/projects/{pid}/sessions?mode=quick_skeleton",
                json={"title": "RaceDup"},
                headers=self._headers(),
            )
            results[idx] = (resp.status_code, resp.text)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        statuses = sorted(code for code, _ in results.values())
        self.assertEqual(statuses[0], 200, results)
        self.assertEqual(statuses[1], 409, results)

        rows = self.st.list(project_id=pid, mode="quick_skeleton", limit=100, org_id=self.org_id, is_admin=True)
        matching = [r for r in rows if str((r or {}).get("title") or "") == "RaceDup"]
        self.assertEqual(len(matching), 1, matching)

    def test_parallel_tobe_create_same_source_single_winner(self):
        pid = self._create_project()
        asis_id = self._create_session(title="AS IS source", project_id=pid)
        barrier = threading.Barrier(2)
        results: dict[int, tuple[int, str]] = {}

        def worker(idx: int):
            client = self._new_client()
            barrier.wait(timeout=10)
            resp = client.post(
                f"/api/projects/{pid}/sessions?mode=quick_skeleton",
                json={
                    "title": f"TO BE copy {idx}",
                    "process_layer": "to_be",
                    "derived_from_session_id": asis_id,
                },
                headers=self._headers(),
            )
            results[idx] = (resp.status_code, resp.text)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        statuses = sorted(code for code, _ in results.values())
        self.assertEqual(statuses[0], 200, results)
        self.assertEqual(statuses[1], 409, results)

        rows = self.st.list(project_id=pid, limit=100, org_id=self.org_id, is_admin=True)
        derived = [
            r for r in rows
            if str((r or {}).get("derived_from_session_id") or "") == asis_id
            and str((r or {}).get("process_layer") or "") == "to_be"
        ]
        self.assertEqual(len(derived), 1, derived)


class TestBpmnSnapshotAtomicity(_SaveGuardTestBase):
    """B3/P4: snapshot + session save are one transaction."""

    def _snapshot_plan(self, xml, dsv):
        return {
            "bpmn_xml": xml,
            "source_action": "manual_save",
            "diagram_state_version": dsv,
            "session_payload_hash": "",
            "session_version": 0,
            "session_updated_at": 0,
            "created_by": self.user_id,
            "org_id": self.org_id,
            "import_note": "",
        }

    def test_snapshot_inserted_with_save_and_dict_filled(self):
        sid = self._create_session()
        s = self.st.load(sid, is_admin=True)
        s.bpmn_xml = SIMPLE_BPMN_XML_A
        s.diagram_state_version = 1
        snap = self._snapshot_plan(SIMPLE_BPMN_XML_A, 1)
        self.st.save(s, is_admin=True, expected_diagram_state_version=0, bpmn_snapshot=snap)
        self.assertEqual(int(snap.get("version_number") or 0), 1)
        self.assertTrue(str(snap.get("id") or "").strip())
        self.assertEqual(self.st.count_bpmn_versions(sid, org_id=self.org_id), 1)

    def test_stale_cas_conflict_leaves_no_snapshot(self):
        sid = self._create_session()
        s = self.st.load(sid, is_admin=True)
        s.bpmn_xml = SIMPLE_BPMN_XML_A
        s.diagram_state_version = 1
        self.st.save(s, is_admin=True, expected_diagram_state_version=0, bpmn_snapshot=self._snapshot_plan(SIMPLE_BPMN_XML_A, 1))

        s2 = self.st.load(sid, is_admin=True)
        s2.bpmn_xml = SIMPLE_BPMN_XML_B
        s2.diagram_state_version = 2
        with self.assertRaises(storage_mod.DiagramStateConflictError):
            self.st.save(s2, is_admin=True, expected_diagram_state_version=0, bpmn_snapshot=self._snapshot_plan(SIMPLE_BPMN_XML_B, 2))

        reloaded = self.st.load(sid, is_admin=True)
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 1)
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), SIMPLE_BPMN_XML_A)
        self.assertEqual(self.st.count_bpmn_versions(sid, org_id=self.org_id), 1)

    def test_snapshot_failure_rolls_back_session_write(self):
        sid = self._create_session()
        s = self.st.load(sid, is_admin=True)
        s.bpmn_xml = SIMPLE_BPMN_XML_A
        s.diagram_state_version = 1
        with patch.object(storage_mod.Storage, "_insert_bpmn_version_row", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.st.save(s, is_admin=True, expected_diagram_state_version=0, bpmn_snapshot=self._snapshot_plan(SIMPLE_BPMN_XML_A, 1))

        reloaded = self.st.load(sid, is_admin=True)
        # Neither the rev increment nor the xml change nor the snapshot survived.
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 0)
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), "")
        self.assertEqual(self.st.count_bpmn_versions(sid, org_id=self.org_id), 0)


class TestBpmnExportReadOnly(_SaveGuardTestBase):
    """B4/P5: GET /bpmn never writes, even with a divergent fingerprint."""

    def test_get_bpmn_with_divergent_fingerprint_does_not_persist(self):
        sid = self._create_session()
        client = self._new_client()
        r = self._put_bpmn(sid, SIMPLE_BPMN_XML_A, base=0, client=client)
        self.assertEqual(r.status_code, 200, r.text)
        versions_before = self.st.count_bpmn_versions(sid, org_id=self.org_id)
        self.assertEqual(versions_before, 1)

        # Diverge the graph fingerprint WITHOUT going through a save path:
        # nodes change but bpmn_graph_fingerprint/diagram_state_version stay.
        s = self.st.load(sid, is_admin=True)
        s.nodes = [Node(id="n_probe", title="Probe", parameters={}, equipment=[], disposition={})]
        self.st.save(s, is_admin=True)

        before = self.st.load(sid, is_admin=True)
        dsv_before = int(getattr(before, "diagram_state_version", 0) or 0)

        resp = client.get(
            f"/api/sessions/{sid}/bpmn?raw=0&include_overlay=0",
            headers=self._headers(),
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertIn("n_probe", resp.text)  # regenerated view is still served

        after = self.st.load(sid, is_admin=True)
        self.assertEqual(int(getattr(after, "diagram_state_version", 0) or 0), dsv_before)
        self.assertEqual(str(getattr(after, "bpmn_xml", "") or ""), SIMPLE_BPMN_XML_A)
        versions_after = self.st.count_bpmn_versions(sid, org_id=self.org_id)
        self.assertEqual(versions_after, versions_before)
        regenerate_rows = [
            row
            for row in self.st.list_bpmn_versions(sid, org_id=self.org_id, limit=100)
            if str(row.get("source_action") or "") == "export_regenerate"
        ]
        self.assertEqual(regenerate_rows, [])


class TestDraftGraphWriteRejectedOnXmlSessions(_SaveGuardTestBase):
    """B5/P6: nodes/edges writes on XML-truth sessions -> explicit 409."""

    def test_patch_nodes_on_xml_session_rejected(self):
        sid = self._create_session()
        client = self._new_client()
        r = self._put_bpmn(sid, SIMPLE_BPMN_XML_A, base=0, client=client)
        self.assertEqual(r.status_code, 200, r.text)

        resp = client.patch(
            f"/api/sessions/{sid}",
            json={
                "nodes": [{"id": "n1", "title": "N1"}],
                "base_diagram_state_version": 1,
            },
            headers=self._headers(),
        )
        self.assertEqual(resp.status_code, 409, resp.text)
        self.assertEqual(
            str((resp.json().get("detail") or {}).get("code") or ""),
            "DRAFT_GRAPH_READ_ONLY_XML_TRUTH",
        )
        reloaded = self.st.load(sid, is_admin=True)
        self.assertEqual(len(getattr(reloaded, "nodes", []) or []), 0)
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 1)

    def test_put_nodes_on_xml_session_rejected(self):
        sid = self._create_session()
        client = self._new_client()
        r = self._put_bpmn(sid, SIMPLE_BPMN_XML_A, base=0, client=client)
        self.assertEqual(r.status_code, 200, r.text)

        resp = client.put(
            f"/api/sessions/{sid}",
            json={
                "nodes": [{"id": "n1", "title": "N1"}],
                "base_diagram_state_version": 1,
            },
            headers=self._headers(),
        )
        self.assertEqual(resp.status_code, 409, resp.text)
        self.assertEqual(
            str((resp.json().get("detail") or {}).get("code") or ""),
            "DRAFT_GRAPH_READ_ONLY_XML_TRUTH",
        )

    def test_draft_session_without_xml_still_accepts_nodes(self):
        sid = self._create_session()
        client = self._new_client()
        resp = client.patch(
            f"/api/sessions/{sid}",
            json={
                "nodes": [{"id": "n1", "title": "N1"}],
                "base_diagram_state_version": 0,
            },
            headers=self._headers(),
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        reloaded = self.st.load(sid, is_admin=True)
        self.assertEqual(len(getattr(reloaded, "nodes", []) or []), 1)


if __name__ == "__main__":
    unittest.main()
