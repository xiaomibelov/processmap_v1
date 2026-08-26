import csv
import io
import os
import sqlite3
import sys
import tempfile
import unittest
import zipfile
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


class ProductActionsSessionExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "processmap.sqlite3")
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
            storage_module._PG_POOL = None
        except Exception:
            pass

        from app.auth import create_user
        from app.routers.product_action_suggestions import (
            export_product_actions,
            router as product_action_suggestions_router,
        )
        from app.storage import get_default_org_id, get_storage, upsert_project_membership

        self.export_product_actions = export_product_actions
        self.product_action_suggestions_router = product_action_suggestions_router
        self.get_storage = get_storage
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.user = create_user("export-user@local", "export-pass", is_admin=False)
        self.user_id = str(self.user.get("id") or "")
        self._insert_membership(self.org_id, self.user_id, "org_admin")
        self.session_id = self._seed_session_with_actions()

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_db_backend
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        try:
            from app.db.config import get_db_runtime_config

            get_db_runtime_config.cache_clear()
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self):
        return _DummyRequest(self.user, active_org_id=self.org_id)

    def _seed_session_with_actions(self):
        storage = self.get_storage()
        sid = storage.create("Export Session", roles=["Повар"], org_id=self.org_id, is_admin=True)
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.interview = {
            "analysis": {
                "product_actions": [
                    {
                        "id": "pa_1",
                        "action_text": "Перелить суп в гастроёмкость",
                        "product_group": "Супы",
                        "product_name": "Суп",
                        "action_type": "перетаривание",
                        "action_stage": "до разогрева",
                        "action_object": "суп",
                        "action_method": "перелить",
                        "step_label": "Разлить суп",
                        "role": "Повар",
                        "source": "manual",
                        "updated_at": "2026-08-26T00:00:00Z",
                    }
                ]
            }
        }
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def test_export_endpoint_registered(self):
        paths = {getattr(route, "path", "") for route in self.product_action_suggestions_router.routes}
        self.assertIn("/api/sessions/{session_id}/analysis/product-actions/export", paths)

    def test_csv_export_returns_bom_columns_and_data(self):
        response = self.export_product_actions(self.session_id, self._req(), format="csv")
        self.assertEqual(response.media_type, "text/csv; charset=utf-8")
        disposition = response.headers.get("content-disposition", "")
        self.assertIn(f"product-actions-{self.session_id}-", disposition)
        self.assertIn(".csv", disposition)

        body = bytes(response.body)
        self.assertTrue(body.startswith("\xef\xbb\xbf".encode("latin1")))
        text = body.decode("utf-8-sig")
        parsed = list(csv.reader(io.StringIO(text), delimiter=";"))
        self.assertGreaterEqual(len(parsed), 2)
        expected_columns = [
            "process_title",
            "product_group",
            "product_name",
            "action_text",
            "action_type",
            "action_stage",
            "action_object",
            "action_method",
            "step_label",
            "role",
            "source",
            "updated_at",
        ]
        self.assertEqual(parsed[0], expected_columns)
        self.assertIn("Перелить суп в гастроёмкость", parsed[1])
        self.assertIn("перетаривание", parsed[1])
        self.assertIn("до разогрева", parsed[1])

    def test_xlsx_export_returns_valid_workbook(self):
        response = self.export_product_actions(self.session_id, self._req(), format="xlsx")
        self.assertEqual(
            response.media_type,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        disposition = response.headers.get("content-disposition", "")
        self.assertIn(f"product-actions-{self.session_id}-", disposition)
        self.assertIn(".xlsx", disposition)

        body = bytes(response.body)
        with zipfile.ZipFile(io.BytesIO(body)) as workbook:
            names = set(workbook.namelist())
            self.assertIn("xl/workbook.xml", names)
            self.assertIn("xl/worksheets/sheet1.xml", names)
            sheet_xml = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
        self.assertIn("action_text", sheet_xml)
        self.assertIn("Перелить суп в гастроёмкость", sheet_xml)
        self.assertIn("перетаривание", sheet_xml)

    def test_invalid_format_returns_422(self):
        with self.assertRaises(HTTPException) as ctx:
            self.export_product_actions(self.session_id, self._req(), format="pdf")
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
