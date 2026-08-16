import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class UsersPreferencesTest(unittest.TestCase):
    """P1 [А]: GET/PATCH /api/users/me/preferences по PHASE2_USER_PREFERENCES_CONTRACT."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "test.sqlite3")

        import app.storage as storage
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        self.storage = storage

        from app.routers.users_preferences import (
            PreferencesPatchBody,
            get_my_preferences,
            patch_my_preferences,
        )

        self.get_my_preferences = get_my_preferences
        self.patch_my_preferences = patch_my_preferences
        self.PreferencesPatchBody = PreferencesPatchBody

        storage.get_storage()
        self.org_a = storage.get_default_org_id()
        self.org_b = "org_other_p1_test"
        self.user = {"id": "u_prefs_test", "email": "prefs@local", "is_admin": False}

    def tearDown(self):
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.storage._SCHEMA_READY = False
        self.storage._SCHEMA_DB_FILE = ""
        self.tmp.cleanup()

    def _request(self, org_id=None):
        return _DummyRequest(self.user, active_org_id=org_id or self.org_a)

    def _patch(self, body: dict, org_id=None):
        return self.patch_my_preferences(self._request(org_id), self.PreferencesPatchBody(**body))

    def test_get_empty_returns_200_with_empty_preferences(self):
        snap = self.get_my_preferences(self._request())
        self.assertEqual(snap["user_id"], "u_prefs_test")
        self.assertEqual(snap["version"], 0)
        self.assertEqual(snap["preferences"], {})

    def test_patch_set_increments_version_and_returns_snapshot(self):
        resp = self._patch({
            "base_version": 0,
            "set": {"explorer.tree.collapsed": {"ws_main": ["f1", "f3"]}},
        })
        self.assertEqual(resp["version"], 1)
        self.assertEqual(resp["preferences"]["explorer.tree.collapsed"], {"ws_main": ["f1", "f3"]})
        self.assertGreater(resp["updated_at"], 0)

        resp2 = self._patch({"base_version": 1, "set": {"explorer.density": "compact"}})
        self.assertEqual(resp2["version"], 2)
        self.assertEqual(resp2["preferences"]["explorer.density"], "compact")
        # значение ключа заменяется целиком
        resp3 = self._patch({
            "base_version": 2,
            "set": {"explorer.tree.collapsed": {"ws_main": ["f2"]}},
        })
        self.assertEqual(resp3["preferences"]["explorer.tree.collapsed"], {"ws_main": ["f2"]})

    def test_patch_null_and_unset_remove_keys(self):
        self._patch({"base_version": 0, "set": {"explorer.density": "compact", "explorer.columns": {"dod": True}}})
        resp = self._patch({"base_version": 1, "set": {"explorer.density": None}})
        self.assertNotIn("explorer.density", resp["preferences"])
        resp2 = self._patch({"base_version": 2, "unset": ["explorer.columns"]})
        self.assertNotIn("explorer.columns", resp2["preferences"])
        # version монотонен даже после удаления всех ключей
        resp3 = self._patch({"base_version": 3, "set": {"explorer.density": "comfortable"}})
        self.assertEqual(resp3["version"], 4)

    def test_patch_conflict_returns_409_with_current_snapshot(self):
        self._patch({"base_version": 0, "set": {"explorer.density": "compact"}})
        resp = self._patch({"base_version": 0, "set": {"explorer.density": "comfortable"}})
        self.assertEqual(getattr(resp, "status_code", None), 409)
        # тело 409 — актуальный снапшот (для LWW на клиенте)
        import json as _json
        payload = _json.loads(bytes(resp.body).decode("utf-8"))
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["preferences"]["explorer.density"], "compact")

    def test_unknown_key_returns_422(self):
        resp = self._patch({"base_version": 0, "set": {"explorer.typo": {}}})
        self.assertEqual(getattr(resp, "status_code", None), 422)
        resp2 = self._patch({"base_version": 0, "unset": ["explorer.typo"]})
        self.assertEqual(getattr(resp2, "status_code", None), 422)

    def test_collapsed_limits_and_types_return_422(self):
        resp = self._patch({"base_version": 0, "set": {"explorer.tree.collapsed": {"ws1": [1, 2]}}})
        self.assertEqual(getattr(resp, "status_code", None), 422)
        too_many = {"ws1": [f"f{i}" for i in range(501)]}
        resp2 = self._patch({"base_version": 0, "set": {"explorer.tree.collapsed": too_many}})
        self.assertEqual(getattr(resp2, "status_code", None), 422)
        resp3 = self._patch({"base_version": 0, "set": {"explorer.density": "wide"}})
        self.assertEqual(getattr(resp3, "status_code", None), 422)

    def test_per_org_isolation(self):
        self._patch({"base_version": 0, "set": {"explorer.density": "compact"}}, org_id=self.org_a)
        snap_b = self.get_my_preferences(self._request(self.org_b))
        self.assertEqual(snap_b["version"], 0)
        self.assertEqual(snap_b["preferences"], {})
        # независимые version-счётчики по org
        resp_b = self._patch({"base_version": 0, "set": {"explorer.density": "comfortable"}}, org_id=self.org_b)
        self.assertEqual(resp_b["version"], 1)
        snap_a = self.get_my_preferences(self._request(self.org_a))
        self.assertEqual(snap_a["preferences"]["explorer.density"], "compact")


if __name__ == "__main__":
    unittest.main()
