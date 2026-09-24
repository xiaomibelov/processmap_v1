"""GET /api/settings/canvas-geometry + PUT /api/admin/canvas-geometry.

Контур: feature/canvas-geometry-settings (шаг 1: хранение и чтение).

Контракт:
- GET public: отдаёт {"ok": true, "settings": {task_width, task_height, sequence_gap}};
  незаполненные/битые значения в feature_flags заменяются дефолтами (130/80/100).
- PUT только admin (is_admin): иначе 403.
- Валидация: все три поля обязательны, только целые, границы
  task_width/task_height 60–400, sequence_gap 20–500; иначе 422
  с detail.code = CANVAS_GEOMETRY_INVALID_VALUE / _UNKNOWN_FIELD / _MISSING_FIELD.
- Roundtrip: PUT → GET возвращает сохранённое.

Прогон: python -m pytest tests/test_canvas_geometry_settings.py
"""

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in __import__("sys").path:
    import sys

    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(
            auth_user=user,
            active_org_id=active_org_id,
            org_id=active_org_id,
            org_memberships=[],
        )
        self.headers = {}


_VALID = {"task_width": 130, "task_height": 80, "sequence_gap": 100}


class CanvasGeometrySettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_env = {
            key: os.environ.get(key)
            for key in ("PROCESS_DB_PATH", "PROCESS_STORAGE_DIR", "FPC_DB_BACKEND", "DATABASE_URL")
        }
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "canvas_geometry.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import importlib

        import app.storage as storage

        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._AGENT_TABLES_READY = False
        storage._AGENT_TABLES_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin = create_user("cg_admin@local", "adminpass", is_admin=True)
        self.user = create_user("cg_user@local", "userpass", is_admin=False)

        from app.routers.feature_flags import (
            get_canvas_geometry_endpoint,
            put_canvas_geometry_endpoint,
        )

        self.get_endpoint = get_canvas_geometry_endpoint
        self.put_endpoint = put_canvas_geometry_endpoint

    def tearDown(self):
        for key, old in self.old_env.items():
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def _get(self):
        return self.get_endpoint(_DummyRequest(self.admin, active_org_id=self.org_id))

    def _put(self, payload, user=None):
        request = _DummyRequest(self.admin if user is None else user, active_org_id=self.org_id)
        return self.put_endpoint(request, payload)

    def test_defaults_when_unset(self):
        result = self._get()
        self.assertTrue(result.get("ok"))
        self.assertEqual(result["settings"], _VALID)

    def test_put_get_roundtrip(self):
        payload = {"task_width": 200, "task_height": 120, "sequence_gap": 250}
        result = self._put(payload)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result["settings"], payload)
        self.assertEqual(self._get()["settings"], payload)

    def test_non_admin_forbidden(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._put(_VALID, user=self.user)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_anonymous_forbidden(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._put(_VALID, user={})
        self.assertEqual(ctx.exception.status_code, 403)

    def test_bounds_accepted_at_edges(self):
        for payload in (
            {"task_width": 60, "task_height": 60, "sequence_gap": 20},
            {"task_width": 400, "task_height": 400, "sequence_gap": 500},
        ):
            result = self._put(payload)
            self.assertTrue(result.get("ok"), msg=f"payload={payload}")
            self.assertEqual(result["settings"], payload)

    def test_bounds_rejected_422(self):
        from fastapi import HTTPException

        cases = [
            ({**_VALID, "task_width": 59}, "task_width"),
            ({**_VALID, "task_width": 401}, "task_width"),
            ({**_VALID, "task_height": 59}, "task_height"),
            ({**_VALID, "task_height": 401}, "task_height"),
            ({**_VALID, "sequence_gap": 19}, "sequence_gap"),
            ({**_VALID, "sequence_gap": 501}, "sequence_gap"),
        ]
        for payload, field in cases:
            with self.assertRaises(HTTPException, msg=f"payload={payload}") as ctx:
                self._put(payload)
            self.assertEqual(ctx.exception.status_code, 422, msg=f"payload={payload}")
            detail = ctx.exception.detail
            self.assertEqual(detail["code"], "CANVAS_GEOMETRY_INVALID_VALUE", msg=f"payload={payload}")
            self.assertEqual(detail["field"], field, msg=f"payload={payload}")
        # Отклонённый PUT не должен менить хранимые значения.
        self.assertEqual(self._get()["settings"], _VALID)

    def test_non_integer_rejected_422(self):
        from fastapi import HTTPException

        for raw in ("130", 130.5, True, None, [130], {"v": 130}):
            payload = {**_VALID, "task_width": raw}
            with self.assertRaises(HTTPException, msg=f"raw={raw!r}") as ctx:
                self._put(payload)
            self.assertEqual(ctx.exception.status_code, 422, msg=f"raw={raw!r}")
            self.assertEqual(ctx.exception.detail["code"], "CANVAS_GEOMETRY_INVALID_VALUE")

    def test_unknown_field_rejected_422(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            self._put({**_VALID, "task_depth": 10})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail["code"], "CANVAS_GEOMETRY_UNKNOWN_FIELD")

    def test_missing_field_rejected_422(self):
        from fastapi import HTTPException

        payload = dict(_VALID)
        payload.pop("sequence_gap")
        with self.assertRaises(HTTPException) as ctx:
            self._put(payload)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail["code"], "CANVAS_GEOMETRY_MISSING_FIELD")

    def test_corrupt_stored_value_falls_back_to_default(self):
        from app.storage import set_feature_flag

        set_feature_flag("canvas_task_width", "not-a-number")
        settings = self._get()["settings"]
        self.assertEqual(settings["task_width"], 130)
        set_feature_flag("canvas_sequence_gap", "99999")  # вне границ → дефолт
        settings = self._get()["settings"]
        self.assertEqual(settings["sequence_gap"], 100)


if __name__ == "__main__":
    unittest.main()
