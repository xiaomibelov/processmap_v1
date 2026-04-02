import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class OrgGitMirrorConfigApiTest(unittest.TestCase):
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
        from app._legacy_main import get_org_git_mirror_endpoint, patch_org_git_mirror_endpoint
        from app.schemas.legacy_api import OrgGitMirrorPatchIn
        from app.storage import get_default_org_id

        self.create_user = create_user
        self.get_org_git_mirror_endpoint = get_org_git_mirror_endpoint
        self.patch_org_git_mirror_endpoint = patch_org_git_mirror_endpoint
        self.OrgGitMirrorPatchIn = OrgGitMirrorPatchIn
        self.default_org_id = get_default_org_id()
        self.admin_user = create_user("git_mirror_admin@local", "adminpass", is_admin=True)

    def tearDown(self):
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

    def _request(self):
        return _DummyRequest(self.admin_user, active_org_id=self.default_org_id)

    def test_default_git_mirror_state_is_disabled_unknown(self):
        out = self.get_org_git_mirror_endpoint(self.default_org_id, self._request())
        self.assertTrue(out.get("ok"))
        cfg = out.get("config") or {}
        self.assertEqual(cfg.get("git_mirror_enabled"), False)
        self.assertEqual(str(cfg.get("git_health_status") or ""), "unknown")

    def test_enabled_incomplete_config_becomes_invalid(self):
        out = self.patch_org_git_mirror_endpoint(
            self.default_org_id,
            self.OrgGitMirrorPatchIn(git_mirror_enabled=True),
            self._request(),
        )
        self.assertTrue(out.get("ok"))
        cfg = out.get("config") or {}
        self.assertEqual(str(cfg.get("git_health_status") or ""), "invalid")
        self.assertIn("required", str(cfg.get("git_health_message") or "").lower())

    def test_enabled_valid_config_becomes_valid(self):
        out = self.patch_org_git_mirror_endpoint(
            self.default_org_id,
            self.OrgGitMirrorPatchIn(
                git_mirror_enabled=True,
                git_provider="github",
                git_repository="acme/processmap",
                git_branch="main",
                git_base_path="published/processes",
            ),
            self._request(),
        )
        self.assertTrue(out.get("ok"))
        cfg = out.get("config") or {}
        self.assertEqual(str(cfg.get("git_health_status") or ""), "valid")
        self.assertEqual(str(cfg.get("git_provider") or ""), "github")
        self.assertEqual(str(cfg.get("git_repository") or ""), "acme/processmap")
        self.assertEqual(str(cfg.get("git_branch") or ""), "main")
        self.assertEqual(str(cfg.get("git_base_path") or ""), "published/processes")

    def test_disable_returns_unknown_health_and_keeps_runtime_db_truth(self):
        _ = self.patch_org_git_mirror_endpoint(
            self.default_org_id,
            self.OrgGitMirrorPatchIn(
                git_mirror_enabled=True,
                git_provider="gitlab",
                git_repository="group/subgroup/processmap",
                git_branch="release",
                git_base_path="mirror",
            ),
            self._request(),
        )
        out = self.patch_org_git_mirror_endpoint(
            self.default_org_id,
            self.OrgGitMirrorPatchIn(git_mirror_enabled=False),
            self._request(),
        )
        self.assertTrue(out.get("ok"))
        cfg = out.get("config") or {}
        self.assertEqual(cfg.get("git_mirror_enabled"), False)
        self.assertEqual(str(cfg.get("git_health_status") or ""), "unknown")

    def test_invalid_branch_ref_formats_are_rejected(self):
        invalid_branches = [
            "feature//x",
            "feature@{1}",
            "release.lock",
            "feature/.hidden",
        ]
        for branch in invalid_branches:
            with self.subTest(branch=branch):
                out = self.patch_org_git_mirror_endpoint(
                    self.default_org_id,
                    self.OrgGitMirrorPatchIn(
                        git_mirror_enabled=True,
                        git_provider="github",
                        git_repository="acme/processmap",
                        git_branch=branch,
                        git_base_path="published/processes",
                    ),
                    self._request(),
                )
                self.assertTrue(out.get("ok"))
                cfg = out.get("config") or {}
                self.assertEqual(str(cfg.get("git_health_status") or ""), "invalid")
                self.assertIn("branch", str(cfg.get("git_health_message") or "").lower())


if __name__ == "__main__":
    unittest.main()
