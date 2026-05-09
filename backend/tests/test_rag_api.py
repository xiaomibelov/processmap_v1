import importlib
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class RagApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "rag_api.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.get_storage = get_storage
        self.get_project_storage = get_project_storage

        self.org_id = get_default_org_id()
        self.org_b = "org_beta_isolated"

        self.user = create_user("rag-api@local", "rag-api", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")

        self.project_id = get_project_storage().create(
            "RAG API Project", {}, user_id=self.user_id, org_id=self.org_id, is_admin=True
        )
        self.session_id = self._seed_session()

        from app.routers.rag import RagIndexIn, rag_index, rag_search
        self.rag_search = rag_search
        self.rag_index = rag_index
        self.RagIndexIn = RagIndexIn

    def tearDown(self):
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        if self.old_db_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_db_url
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(os.environ["PROCESS_DB_PATH"])

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role=? WHERE org_id=? AND user_id=?",
                [role, org_id, user_id],
            )
            con.commit()

    def _seed_session(self) -> str:
        storage = self.get_storage()
        sid = storage.create(
            "RAG Test Session",
            roles=["Повар"],
            project_id=self.project_id,
            org_id=self.org_id,
            is_admin=True,
        )
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        session.bpmn_xml = (
            "<definitions><bpmn:process><bpmn:userTask id='t1' name='Нарезка куриная грудка'/>"
            "<bpmn:serviceTask id='t2' name='Упаковка готового блюда'/>"
            "<bpmn:sequenceFlow id='f1' sourceRef='t1' targetRef='t2'/></bpmn:process></definitions>"
        )
        session.bpmn_xml_version = 1
        session.interview = {
            "analysis": {
                "product_actions": [
                    {
                        "id": "pa1",
                        "step_id": "s1",
                        "action_type": "нарезка",
                        "product_name": "куриная грудка",
                        "product_group": "мясо",
                        "stage": "подготовка",
                        "method": "нож",
                        "role": "Повар",
                    },
                    {
                        "id": "pa2",
                        "step_id": "s2",
                        "action_type": "упаковка",
                        "product_name": "готовое блюдо",
                        "product_group": "блюда",
                        "stage": "финал",
                        "method": "вручную",
                        "role": "Повар",
                    },
                ]
            }
        }
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _req(self, org_id: str = None):
        return _DummyRequest(self.user, active_org_id=org_id or self.org_id)

    def _index(self, source_type: str, session_id: str = None, force: bool = False, org_id: str = None):
        inp = self.RagIndexIn(source_type=source_type, session_id=session_id or self.session_id, force=force)
        return self.rag_index(inp, self._req(org_id))

    def _search(self, q: str, **kwargs):
        from fastapi import Query as Q
        return self.rag_search(
            request=self._req(kwargs.pop("org_id", None)),
            q=q,
            top_k=kwargs.get("top_k", 10),
            source_type=kwargs.get("source_type", None),
            session_id=kwargs.get("session_id", None),
            min_score=kwargs.get("min_score", 0.0),
        )

    # ── Router registration ──────────────────────────────────────────────────

    def test_router_is_registered(self):
        from app.routers import ROUTERS
        from app.routers.rag import router as rag_router
        self.assertIn(rag_router, ROUTERS)

    def test_router_has_rag_tag(self):
        from app.routers.rag import router as rag_router
        tags = set(rag_router.tags or [])
        self.assertIn("rag", tags)

    # ── Search endpoint ──────────────────────────────────────────────────────

    def test_search_empty_index_returns_ok(self):
        result = self._search("нарезка")
        self.assertTrue(result["ok"])
        self.assertEqual(result["results"], [])
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["query"], "нарезка")

    def test_search_after_bpmn_index_returns_results(self):
        self._index("bpmn_xml")
        result = self._search("нарезка куриная")
        self.assertTrue(result["ok"])
        self.assertGreater(result["total"], 0)
        for r in result["results"]:
            self.assertIn("chunk_id", r)
            self.assertIn("score", r)
            self.assertIn("chunk_text", r)
            self.assertIn("source_type", r)

    def test_search_after_product_action_index_returns_results(self):
        self._index("product_action")
        result = self._search("нарезка куриная грудка")
        self.assertTrue(result["ok"])
        self.assertGreater(result["total"], 0)

    def test_search_top_k_respected(self):
        self._index("bpmn_xml")
        self._index("product_action")
        result = self._search("нарезка упаковка", top_k=1)
        self.assertTrue(result["ok"])
        self.assertLessEqual(result["total"], 1)

    def test_search_min_score_filter_excludes_all(self):
        self._index("bpmn_xml")
        result = self._search("нарезка", min_score=9999.0)
        self.assertEqual(result["results"], [])
        self.assertEqual(result["total"], 0)

    def test_search_org_isolation(self):
        from app.auth import create_user

        self._index("bpmn_xml")

        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES (?, ?, strftime('%s','now'))",
                [self.org_b, "Org Beta Isolated"],
            )
            con.commit()

        user_b = create_user("rag-api-orgb@local", "rag-api-orgb", is_admin=False)
        user_b_id = str(user_b.get("id") or "")
        self._insert_membership(self.org_b, user_b_id, "org_admin")

        req_b = _DummyRequest(user_b, active_org_id=self.org_b)
        result = self.rag_search(
            request=req_b,
            q="нарезка куриная",
            top_k=10,
            source_type=None,
            session_id=None,
            min_score=0.0,
        )
        self.assertEqual(result["results"], [])
        self.assertEqual(result["total"], 0)


    def test_search_source_type_filter_bpmn(self):
        self._index("bpmn_xml")
        self._index("product_action")
        result = self._search("нарезка", source_type="bpmn_xml")
        for r in result["results"]:
            self.assertEqual(r["source_type"], "bpmn_xml")

    def test_search_source_type_filter_product_action(self):
        self._index("bpmn_xml")
        self._index("product_action")
        result = self._search("нарезка", source_type="product_action")
        for r in result["results"]:
            self.assertEqual(r["source_type"], "product_action")

    def test_search_session_id_filter(self):
        self._index("bpmn_xml")
        result = self._search("нарезка", session_id=self.session_id)
        for r in result["results"]:
            self.assertEqual(r["source_id"], self.session_id)

    # ── Index endpoint ───────────────────────────────────────────────────────

    def test_index_bpmn_xml_creates_chunks(self):
        result = self._index("bpmn_xml")
        self.assertTrue(result["ok"])
        self.assertTrue(result["was_updated"])
        self.assertGreater(result["chunks_created"], 0)
        self.assertEqual(result["source_type"], "bpmn_xml")
        self.assertEqual(result["session_id"], self.session_id)

    def test_index_product_action_creates_chunks(self):
        result = self._index("product_action")
        self.assertTrue(result["ok"])
        self.assertTrue(result["was_updated"])
        self.assertGreater(result["chunks_created"], 0)
        self.assertEqual(result["source_type"], "product_action")

    def test_index_dedup_unchanged_content(self):
        r1 = self._index("bpmn_xml")
        r2 = self._index("bpmn_xml")
        self.assertTrue(r1["was_updated"])
        self.assertFalse(r2["was_updated"])
        self.assertEqual(r1["doc_id"], r2["doc_id"])
        self.assertEqual(r2["chunks_created"], 0)

    def test_index_force_reindexes_unchanged(self):
        r1 = self._index("bpmn_xml")
        r2 = self._index("bpmn_xml", force=True)
        self.assertTrue(r1["was_updated"])
        self.assertTrue(r2["was_updated"])
        self.assertGreater(r2["chunks_created"], 0)

    def test_index_reindexes_on_content_change(self):
        r1 = self._index("bpmn_xml")
        session = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        session.bpmn_xml = "<definitions><bpmn:userTask id='t99' name='Новая задача'/></definitions>"
        session.bpmn_xml_version = 2
        self.get_storage().save(session, org_id=self.org_id, is_admin=True)
        r2 = self._index("bpmn_xml")
        self.assertTrue(r2["was_updated"])
        self.assertEqual(r1["doc_id"], r2["doc_id"])

    def test_index_invalid_source_type_raises_400(self):
        with self.assertRaises(HTTPException) as ctx:
            self._index("invalid_source")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_index_missing_session_id_raises_422(self):
        inp = self.RagIndexIn(source_type="bpmn_xml", session_id=None)
        with self.assertRaises(HTTPException) as ctx:
            self.rag_index(inp, self._req())
        self.assertEqual(ctx.exception.status_code, 422)

    def test_index_unknown_session_raises_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self._index("bpmn_xml", session_id="sess_doesnotexist_xyz")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_index_does_not_mutate_bpmn_xml(self):
        original_bpmn = None
        session_before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        original_bpmn = str(getattr(session_before, "bpmn_xml", "") or "")

        self._index("bpmn_xml")

        session_after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        self.assertEqual(str(getattr(session_after, "bpmn_xml", "") or ""), original_bpmn)

    def test_index_does_not_mutate_product_actions(self):
        import json
        session_before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        interview_before = json.dumps(
            (getattr(session_before, "interview", {}) or {}).get("analysis", {}).get("product_actions", []),
            sort_keys=True,
        )

        self._index("product_action")

        session_after = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True)
        interview_after = json.dumps(
            (getattr(session_after, "interview", {}) or {}).get("analysis", {}).get("product_actions", []),
            sort_keys=True,
        )
        self.assertEqual(interview_before, interview_after)


if __name__ == "__main__":
    unittest.main()
