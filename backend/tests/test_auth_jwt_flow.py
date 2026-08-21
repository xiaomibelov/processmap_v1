import os
import tempfile
import unittest


class AuthJwtFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp_storage = tempfile.TemporaryDirectory()
        self.old_storage = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_seed = os.environ.get("DEV_SEED_ADMIN")
        self.old_email = os.environ.get("ADMIN_EMAIL")
        self.old_password = os.environ.get("ADMIN_PASSWORD")
        self.old_secret = os.environ.get("JWT_SECRET")

        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_storage.name
        os.environ["DEV_SEED_ADMIN"] = "1"
        os.environ["ADMIN_EMAIL"] = "admin@local"
        os.environ["ADMIN_PASSWORD"] = "admin"
        os.environ["JWT_SECRET"] = "unit-test-secret"

        from app.auth import seed_admin_user_if_enabled

        seed_admin_user_if_enabled()

    def tearDown(self):
        if self.old_storage is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage

        if self.old_seed is None:
            os.environ.pop("DEV_SEED_ADMIN", None)
        else:
            os.environ["DEV_SEED_ADMIN"] = self.old_seed

        if self.old_email is None:
            os.environ.pop("ADMIN_EMAIL", None)
        else:
            os.environ["ADMIN_EMAIL"] = self.old_email

        if self.old_password is None:
            os.environ.pop("ADMIN_PASSWORD", None)
        else:
            os.environ["ADMIN_PASSWORD"] = self.old_password

        if self.old_secret is None:
            os.environ.pop("JWT_SECRET", None)
        else:
            os.environ["JWT_SECRET"] = self.old_secret

        self.tmp_storage.cleanup()

    def test_issue_rotate_and_revoke_refresh_token(self):
        from app.auth import (
            authenticate_user,
            issue_login_tokens,
            revoke_refresh_from_token,
            rotate_refresh_token,
            user_from_bearer_header,
        )

        user = authenticate_user("admin@local", "admin")
        issued = issue_login_tokens(user=user, user_agent="ua", ip="127.0.0.1")

        self.assertTrue(str(issued.get("access_token") or ""))
        self.assertTrue(str(issued.get("refresh_token") or ""))

        current = user_from_bearer_header(f"Bearer {issued['access_token']}")
        self.assertEqual(current.get("email"), "admin@local")

        rotated = rotate_refresh_token(issued["refresh_token"], user_agent="ua2", ip="127.0.0.2")
        self.assertTrue(str(rotated.get("access_token") or ""))
        self.assertTrue(str(rotated.get("refresh_token") or ""))

        revoked = revoke_refresh_from_token(rotated["refresh_token"])
        self.assertTrue(revoked)


if __name__ == "__main__":
    unittest.main()
