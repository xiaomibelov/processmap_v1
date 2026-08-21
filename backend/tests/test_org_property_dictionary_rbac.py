import os
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
from app.storage import create_org_record, upsert_org_membership


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class OrgPropertyDictionaryRbacTests(unittest.TestCase):
    def setUp(self):
        self._orig_db_path = os.environ.get("PROCESS_DB_PATH")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_DB_PATH"] = os.path.join(self._temp_dir.name, "test.db")

        self.org_admin = create_user("propdict_org_admin@local", "password", is_admin=False)
        self.viewer = create_user("propdict_viewer@local", "password", is_admin=False)

        org = create_org_record("Property Dict Org", created_by=str(self.org_admin.get("id") or ""))
        self.org_id = str(org.get("id") or "")
        upsert_org_membership(self.org_id, str(self.org_admin.get("id") or ""), "org_admin")
        upsert_org_membership(self.org_id, str(self.viewer.get("id") or ""), "viewer")

    def tearDown(self):
        self._temp_dir.cleanup()
        if self._orig_db_path is not None:
            os.environ["PROCESS_DB_PATH"] = self._orig_db_path
        else:
            os.environ.pop("PROCESS_DB_PATH", None)

    def _req(self, user):
        return _DummyRequest(user, active_org_id=self.org_id)

    # ------------------------------------------------------------------
    # GET — viewer allowed
    # ------------------------------------------------------------------
    def test_viewer_get_operations_returns_200(self):
        from app.routers import org_property_dictionary as router
        result = router.list_org_property_dictionary_operations_endpoint(
            self.org_id,
            request=self._req(self.viewer),
        )
        self.assertIn("items", result)

    # ------------------------------------------------------------------
    # POST — viewer denied, org admin allowed
    # ------------------------------------------------------------------
    def test_viewer_post_operations_returns_403(self):
        from app.routers import org_property_dictionary as router
        with self.assertRaises(HTTPException) as ctx:
            router.create_or_update_org_property_dictionary_operation_endpoint(
                self.org_id,
                router.OperationUpsertIn(operation_key="cutting", operation_label="Резка"),
                request=self._req(self.viewer),
            )
        self.assertEqual(int(ctx.exception.status_code), 403)

    def test_org_admin_post_operations_returns_200(self):
        from app.routers import org_property_dictionary as router
        result = router.create_or_update_org_property_dictionary_operation_endpoint(
            self.org_id,
            router.OperationUpsertIn(operation_key="cutting", operation_label="Резка"),
            request=self._req(self.org_admin),
        )
        self.assertTrue(bool(result.get("ok")))
