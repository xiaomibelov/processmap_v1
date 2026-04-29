import asyncio
import importlib
import os
import sys
import unittest
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


RUNTIME_ENV_KEYS = (
    "PROCESSMAP_APP_VERSION",
    "PROCESSMAP_BUILD_ID",
    "PROCESSMAP_GIT_SHA",
    "PROCESSMAP_MIN_SUPPORTED_FRONTEND_VERSION",
)


class ApiMetaRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.old_env = {key: os.environ.get(key) for key in RUNTIME_ENV_KEYS}
        for key in RUNTIME_ENV_KEYS:
            os.environ.pop(key, None)

    def tearDown(self):
        for key, value in self.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    async def _get_meta_async(self):
        import app._legacy_main as legacy_main
        import app.startup.app_factory as app_factory
        import app.routers as routers

        legacy_main.runtime_status = lambda force_ping=True: {
            "mode": "FALLBACK",
            "state": "fallback_unavailable",
            "degraded": True,
            "incident": False,
            "required": False,
        }
        legacy_main.get_storage = lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("/api/meta must not call storage")
        )
        importlib.reload(routers)
        importlib.reload(app_factory)

        app = app_factory.create_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.get("/api/meta")

    def test_runtime_build_meta_uses_processmap_env(self):
        os.environ["PROCESSMAP_APP_VERSION"] = "v1.2.3"
        os.environ["PROCESSMAP_BUILD_ID"] = "v1.2.3-abc123"
        os.environ["PROCESSMAP_GIT_SHA"] = "abc123def456"
        os.environ["PROCESSMAP_MIN_SUPPORTED_FRONTEND_VERSION"] = "v1.2.0"

        from app.services.runtime_meta import get_runtime_build_meta

        self.assertEqual(
            get_runtime_build_meta(),
            {
                "app_version": "v1.2.3",
                "build_id": "v1.2.3-abc123",
                "git_sha": "abc123def456",
                "min_supported_frontend_version": "v1.2.0",
            },
        )

    def test_runtime_build_meta_has_safe_fallbacks_when_env_missing(self):
        from app.services.runtime_meta import get_runtime_build_meta

        self.assertEqual(
            get_runtime_build_meta(),
            {
                "app_version": "unknown",
                "build_id": "unknown",
                "git_sha": None,
                "min_supported_frontend_version": "unknown",
            },
        )

    def test_runtime_build_meta_falls_back_to_git_sha_for_build_id(self):
        os.environ["PROCESSMAP_APP_VERSION"] = "v2.0.0"
        os.environ["PROCESSMAP_GIT_SHA"] = "feedface"

        from app.services.runtime_meta import get_runtime_build_meta

        self.assertEqual(get_runtime_build_meta()["build_id"], "feedface")

    def test_api_meta_preserves_old_fields_and_adds_runtime_identity_publicly(self):
        os.environ["PROCESSMAP_APP_VERSION"] = "v3.4.5"
        os.environ["PROCESSMAP_BUILD_ID"] = "stage-v3.4.5-789"
        os.environ["PROCESSMAP_GIT_SHA"] = "789abc"
        os.environ["PROCESSMAP_MIN_SUPPORTED_FRONTEND_VERSION"] = "v3.4.0"

        response = asyncio.run(self._get_meta_async())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("cache-control"), "no-store")
        payload = response.json()
        self.assertEqual(payload.get("api_version"), 2)
        self.assertIsInstance(payload.get("features"), dict)
        self.assertIsInstance(payload.get("redis"), dict)
        self.assertEqual(
            payload.get("runtime"),
            {
                "app_version": "v3.4.5",
                "build_id": "stage-v3.4.5-789",
                "git_sha": "789abc",
                "min_supported_frontend_version": "v3.4.0",
            },
        )
