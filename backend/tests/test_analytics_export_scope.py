import csv
import io
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class AnalyticsExportScopeTests(unittest.TestCase):
    """fix/analytics-export-scope: folder scope, search, project/session columns."""

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

        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.storage import get_default_org_id, get_storage, list_org_workspaces

        self.app = create_app()
        self.client = TestClient(self.app)
        self.get_storage = get_storage
        self.org_id = get_default_org_id()
        self.admin = create_user("export-admin@local", "admin", is_admin=False)
        self.other = create_user("export-other@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.other_id = str(self.other.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.other_id, "viewer")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        from app.storage import get_project_storage

        self.folder_a = self._insert_folder("Folder A")
        self.folder_b = self._insert_folder("Folder B")
        self.project_a = get_project_storage().create("Project A", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        self.project_b = get_project_storage().create("Project B", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        self._set_project_folder(self.project_a, self.folder_a)
        self._set_project_folder(self.project_b, self.folder_b)
        self.session_a = self._create_session("Session A", self.project_a, "source-alpha")
        self.session_b = self._create_session("Session B", self.project_b, "source-beta")

        self.admin_token = create_access_token(self.admin_id)
        self.other_token = create_access_token(self.other_id)

    def tearDown(self):
        for key, old in (
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("PROCESS_DB_PATH", self.old_db_path),
            ("FPC_DB_BACKEND", self.old_db_backend),
            ("DATABASE_URL", self.old_database_url),
        ):
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
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
                "INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
                [org_id, user_id, role],
            )
            con.execute("UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?", [role, org_id, user_id])
            con.commit()

    def _insert_folder(self, name: str) -> str:
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT INTO workspace_folders (id, org_id, workspace_id, parent_id, name, sort_order, created_by, created_at, updated_at)
                VALUES (lower(hex(randomblob(5))), ?, ?, '', ?, 0, '', strftime('%s','now'), strftime('%s','now'))
                """,
                [self.org_id, self.workspace_id, name],
            )
            con.commit()
            row = con.execute("SELECT id FROM workspace_folders WHERE name=?", (name,)).fetchone()
        return str(row[0])

    def _set_project_folder(self, project_id: str, folder_id: str):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE projects SET folder_id=? WHERE id=?", [folder_id, project_id])
            con.commit()

    def _create_session(self, title: str, project_id: str, source_marker: str) -> str:
        session_id = self.get_storage().create(
            title,
            project_id=project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
            is_admin=True,
        )
        self.get_storage().patch_session_meta(
            session_id,
            bpmn_meta={
                "camunda_extensions_by_element_id": {
                    "el-1": {
                        "properties": {
                            "extensionProperties": [
                                {"name": "ee_time", "value": "3.61"},
                                {"name": "ingredient_value", "value": source_marker},
                            ]
                        }
                    }
                }
            },
            base_diagram_state_version=0,
            user_id=self.admin_id,
            org_id=self.org_id,
            is_admin=True,
        )
        return session_id

    def _headers(self, token: str):
        return {"Authorization": f"Bearer {token}"}

    def _csv_rows(self, url: str, token: str | None = None):
        r = self.client.get(url, headers=self._headers(token or self.admin_token))
        self.assertEqual(r.status_code, 200, r.text[:200])
        return list(csv.DictReader(io.StringIO(r.text)))

    # ── folder scope ────────────────────────────────────────────────

    def test_export_csv_scope_folder_returns_only_folder_rows(self):
        rows = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}")
        self.assertTrue(rows)
        self.assertTrue(all(r["project_title"] == "Project A" for r in rows))
        self.assertTrue(all(r["session_title"] == "Session A" for r in rows))
        self.assertTrue(all("source-beta" not in (r["value"] or "") for r in rows))

    def test_export_csv_scope_folder_excludes_other_folder(self):
        rows_a = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}")
        rows_b = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_b}")
        self.assertTrue(all(r["project_title"] == "Project A" for r in rows_a))
        self.assertTrue(all(r["project_title"] == "Project B" for r in rows_b))

    def test_export_xlsx_scope_folder_valid_file(self):
        r = self.client.get(
            f"/api/analytics/properties/export.xlsx?scope=folder&scope_id={self.folder_a}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn("properties-folder-", r.headers.get("content-disposition", ""))
        self.assertTrue(r.content.startswith(b"PK"))

    def test_export_csv_scope_folder_unknown_id_404(self):
        r = self.client.get(
            "/api/analytics/properties/export.csv?scope=folder&scope_id=missing",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 404)

    def test_export_csv_scope_folder_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_properties_list_scope_folder(self):
        r = self.client.get(
            f"/api/analytics/properties?scope=folder&scope_id={self.folder_a}&page=1&limit=50",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200, r.text[:200])
        body = r.json()
        self.assertTrue(body["success"])
        self.assertTrue(all(row["project_title"] == "Project A" for row in body["data"]["rows"]))

    # ── search ──────────────────────────────────────────────────────

    def test_export_csv_search_filters_rows(self):
        rows = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}")
        self.assertTrue(any(r["value"] == "source-alpha" for r in rows))
        found = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}&search=source-alpha")
        self.assertTrue(found)
        self.assertTrue(all("source-alpha" in (r["value"] or "") or "source-alpha" in (r["source"] or "") for r in found))
        # case-insensitive: search by project title lowercased
        by_title = self._csv_rows(f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}&search=project a")
        self.assertEqual(len(by_title), len(rows))

    def test_export_csv_search_no_match_returns_header_only(self):
        rows = self._csv_rows("/api/analytics/properties/export.csv?scope=workspace&scope_id=" + self.workspace_id + "&search=zzz-no-such-zzz")
        self.assertEqual(rows, [])

    # ── columns ─────────────────────────────────────────────────────

    def test_export_csv_includes_project_and_session_columns(self):
        for scope, sid in (("workspace", self.workspace_id), ("project", self.project_a), ("session", self.session_a)):
            rows = self._csv_rows(f"/api/analytics/properties/export.csv?scope={scope}&scope_id={sid}")
            self.assertTrue(rows, scope)
            self.assertTrue(all("project_title" in r and "session_title" in r for r in rows))
            self.assertTrue(all(r["project_title"] for r in rows), scope)
            self.assertTrue(all(r["session_title"] for r in rows), scope)

    # ── regressions ─────────────────────────────────────────────────

    def test_export_csv_scope_workspace_covers_all_folders(self):
        rows = self._csv_rows(f"/api/analytics/properties/export.csv?scope=workspace&scope_id={self.workspace_id}")
        projects = {r["project_title"] for r in rows}
        self.assertIn("Project A", projects)
        self.assertIn("Project B", projects)

    def test_export_csv_scope_project_unchanged(self):
        rows = self._csv_rows(f"/api/analytics/properties/export.csv?scope=project&scope_id={self.project_a}")
        self.assertTrue(rows)
        self.assertTrue(all(r["project_title"] == "Project A" for r in rows))

    def test_export_csv_source_filter_still_works(self):
        rows = self._csv_rows(
            f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}&source_filter=Session A"
        )
        self.assertTrue(rows)
        self.assertTrue(all(r["source"] == "Session A" for r in rows))

    def test_export_csv_scope_folder_wrong_org_404(self):
        other_org = "org-other-0001"
        self._insert_membership(other_org, self.admin_id, "org_admin")
        r = self.client.get(
            f"/api/analytics/properties/export.csv?scope=folder&scope_id={self.folder_a}&org_id={other_org}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
