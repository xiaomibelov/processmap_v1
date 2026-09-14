"""Characterization tests for org_auth storage repository methods migrated to
the generic base.py CRUD layer (refactor/storage-base-repository-v1, step 4).

Bootstrap mirrors test_org_groups.py: tmpdir-backed storage via env vars,
seeded default org, platform admin, second org and member user.
"""
from __future__ import annotations

import os
import tempfile
import unittest


class OrgAuthRepoCharacterizationTest(unittest.TestCase):
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
        from app.domains.storage.org_auth import repository as org_repo
        from app.storage import (
            create_org_record,
            get_default_org_id,
            upsert_org_membership,
        )

        self.repo = org_repo
        self.create_user = create_user

        self.admin = create_user("org_auth_repo_admin@local", "strongpass1", is_admin=True)
        self.admin_id = str(self.admin.get("id") or "")
        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Second Org", created_by=self.admin_id)
        self.org_b_id = str(self.org_b.get("id") or "")

        self.member = create_user("org_auth_repo_member@local", "strongpass1")
        self.member_id = str(self.member.get("id") or "")
        upsert_org_membership(self.default_org_id, self.member_id, "editor")
        upsert_org_membership(self.org_b_id, self.member_id, "org_viewer")

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

    # --- get_org_group / list_org_groups ------------------------------------

    def test_get_org_group_returns_members_count(self):
        group = self.repo.create_org_group(self.default_org_id, "QA Team", created_by=self.admin_id)
        gid = str(group.get("id") or "")
        self.assertTrue(self.repo.add_group_member(self.default_org_id, gid, self.member_id, created_by=self.admin_id))

        found = self.repo.get_org_group(self.default_org_id, gid)
        self.assertIsNotNone(found)
        self.assertEqual(found["name"], "QA Team")
        self.assertEqual(int(found["members_count"] or 0), 1)

        # чужая org → не находит
        self.assertIsNone(self.repo.get_org_group(self.org_b_id, gid))
        self.assertIsNone(self.repo.get_org_group(self.default_org_id, "missing"))

    def test_list_org_groups_scoped_by_org(self):
        g1 = self.repo.create_org_group(self.default_org_id, "Alpha Group", created_by=self.admin_id)
        self.repo.create_org_group(self.org_b_id, "Beta Group", created_by=self.admin_id)

        default_groups = self.repo.list_org_groups(self.default_org_id)
        self.assertEqual([g["id"] for g in default_groups], [g1["id"]])

        other_groups = self.repo.list_org_groups(self.org_b_id)
        self.assertEqual(len(other_groups), 1)
        self.assertEqual(other_groups[0]["name"], "Beta Group")
        self.assertEqual(int(other_groups[0]["members_count"] or 0), 0)

    # --- rename_org_record / rename_workspace_record -------------------------

    def test_rename_org_record(self):
        renamed = self.repo.rename_org_record(self.org_b_id, "  Second Org Renamed  ")
        self.assertEqual(renamed["id"], self.org_b_id)
        self.assertEqual(renamed["name"], "Second Org Renamed")
        self.assertTrue(bool(renamed.get("is_active")))

        fetched = self.repo.get_org_git_mirror_config(self.org_b_id)
        self.assertEqual(fetched["org_id"], self.org_b_id)

    def test_rename_org_record_duplicate_and_missing(self):
        with self.assertRaises(ValueError):
            self.repo.rename_org_record(self.org_b_id, "Default")
        with self.assertRaises(ValueError):
            self.repo.rename_org_record("org_missing", "Whatever")

    def test_rename_workspace_record(self):
        org = self.repo.create_org_record("Third Org", created_by=self.admin_id)
        oid = str(org.get("id") or "")
        ws = self.repo.create_workspace_record(oid, "Custom Workspace", created_by=self.admin_id)
        wid = str(ws.get("id") or "")

        renamed = self.repo.rename_workspace_record(oid, wid, "  Renamed Workspace  ")
        self.assertEqual(renamed["id"], wid)
        self.assertEqual(renamed["name"], "Renamed Workspace")
        self.assertGreater(int(renamed["updated_at"] or 0), 0)

        fetched = self.repo.get_workspace_record(wid, org_id=oid)
        self.assertEqual(fetched["name"], "Renamed Workspace")
        # чужой org scope → не находит
        self.assertIsNone(self.repo.get_workspace_record(wid, org_id=self.default_org_id))

    # --- set_org_active / is_org_active --------------------------------------

    def test_set_org_active_toggles_and_is_org_active_reads(self):
        self.assertTrue(self.repo.is_org_active(self.org_b_id))

        updated = self.repo.set_org_active(self.org_b_id, False)
        self.assertFalse(bool(updated["is_active"]))
        self.assertFalse(self.repo.is_org_active(self.org_b_id))

        updated = self.repo.set_org_active(self.org_b_id, True)
        self.assertTrue(bool(updated["is_active"]))
        self.assertTrue(self.repo.is_org_active(self.org_b_id))

        with self.assertRaises(ValueError):
            self.repo.set_org_active("org_missing", False)
        self.assertFalse(self.repo.is_org_active(""))
        self.assertFalse(self.repo.is_org_active("org_missing"))

    # --- count_org_records ----------------------------------------------------

    def test_count_org_records(self):
        before = self.repo.count_org_records()
        self.assertGreaterEqual(before, 2)  # default org + Second Org
        self.repo.create_org_record("Counted Org", created_by=self.admin_id)
        self.assertEqual(self.repo.count_org_records(), before + 1)

    # --- org git mirror config -------------------------------------------------

    def test_get_and_update_org_git_mirror_config(self):
        with self.assertRaises(ValueError):
            self.repo.get_org_git_mirror_config("org_missing")

        updated = self.repo.update_org_git_mirror_config(
            self.org_b_id,
            git_mirror_enabled=True,
            git_provider="github",
            git_repository="git@github.com:example/repo.git",
            git_branch="main",
            git_base_path="processes",
            git_health_status="ok",
            git_health_message="all good",
            git_updated_by=self.admin_id,
        )
        self.assertEqual(updated["org_id"], self.org_b_id)
        self.assertTrue(bool(updated.get("git_mirror_enabled")))
        self.assertEqual(str(updated.get("git_provider") or ""), "github")
        self.assertEqual(str(updated.get("git_repository") or ""), "git@github.com:example/repo.git")
        self.assertEqual(str(updated.get("git_branch") or ""), "main")
        self.assertGreater(int(updated.get("git_updated_at") or 0), 0)

        fetched = self.repo.get_org_git_mirror_config(self.org_b_id)
        self.assertEqual(fetched, updated)

        with self.assertRaises(ValueError):
            self.repo.update_org_git_mirror_config(
                "org_missing",
                git_mirror_enabled=False,
                git_provider=None,
                git_repository="",
                git_branch="",
                git_base_path="",
                git_health_status=None,
                git_health_message="",
            )

    # --- org invites: list filters / revoke / promote --------------------------

    def _create_invite(self, email: str, **kwargs):
        return self.repo.create_org_invite(
            self.org_b_id,
            email,
            created_by=self.admin_id,
            **kwargs,
        )

    def test_list_org_invites_pending_filter(self):
        inv1 = self._create_invite("pending_one@local")
        self._create_invite("pending_two@local")
        accepted_email = "accepted@local"
        self.accepted_user = self.create_user(accepted_email, "strongpass1")
        self.accepted_user_id = str(self.accepted_user.get("id") or "")
        inv3 = self._create_invite(accepted_email)
        self.repo.accept_org_invite(
            self.org_b_id,
            inv3["token"],
            accepted_by=self.accepted_user_id,
            accepted_email=accepted_email,
        )

        all_invites = self.repo.list_org_invites(self.org_b_id)
        self.assertEqual(len(all_invites), 3)

        pending = self.repo.list_org_invites(self.org_b_id, include_inactive=False)
        pending_ids = {i["id"] for i in pending}
        self.assertIn(inv1["id"], pending_ids)
        self.assertEqual(len(pending), 2)

        by_id = self.repo.get_org_invite_by_id(self.org_b_id, inv1["id"])
        self.assertEqual(by_id["id"], inv1["id"])
        self.assertEqual(by_id["email"], "pending_one@local")
        self.assertEqual(by_id["status"], "pending")
        self.assertEqual(self.repo.get_org_invite_by_id(self.org_b_id, "missing"), {})
        self.assertEqual(self.repo.get_org_invite_by_id(self.default_org_id, inv1["id"]), {})

    def test_revoke_org_invite(self):
        invite = self._create_invite("revoke_me@local")
        self.assertTrue(self.repo.revoke_org_invite(self.org_b_id, invite["id"], revoked_by=self.admin_id))

        fetched = self.repo.get_org_invite_by_id(self.org_b_id, invite["id"])
        self.assertEqual(fetched["status"], "revoked")
        self.assertEqual(fetched["revoked_by"], self.admin_id)

        # повторный revoke не находит строку
        self.assertFalse(self.repo.revoke_org_invite(self.org_b_id, invite["id"], revoked_by=self.admin_id))
        self.assertFalse(self.repo.revoke_org_invite(self.org_b_id, "missing", revoked_by=self.admin_id))

    def test_promote_regenerated_org_invite(self):
        pending = self._create_invite("promote_me@local", activate_now=False)
        # до promote инвайт помечен revoked (system_regenerate_pending)
        self.assertEqual(pending.get("status"), "revoked")
        self.assertEqual(pending.get("revoked_by"), "system_regenerate_pending")

        self.assertTrue(
            self.repo.promote_regenerated_org_invite(
                self.org_b_id, "promote_me@local", pending["id"], actor=self.admin_id
            )
        )
        promoted = self.repo.get_org_invite_by_id(self.org_b_id, pending["id"])
        self.assertEqual(promoted["status"], "pending")
        self.assertEqual(int(promoted.get("revoked_at") or 0), 0)

        # повторный promote — уже не pending-regenerated → False
        self.assertFalse(
            self.repo.promote_regenerated_org_invite(
                self.org_b_id, "promote_me@local", pending["id"], actor=self.admin_id
            )
        )
        self.assertFalse(
            self.repo.promote_regenerated_org_invite(
                self.org_b_id, "nobody@local", pending["id"], actor=self.admin_id
            )
        )

    # --- delete_org_membership / remove_group_member ---------------------------

    def test_delete_org_membership_composite_key(self):
        self.assertTrue(self.repo.delete_org_membership(self.org_b_id, self.member_id))
        self.assertFalse(self.repo.delete_org_membership(self.org_b_id, self.member_id))
        # membership в другой org не тронута
        self.assertTrue(self.repo.user_has_org_membership(self.member_id, self.default_org_id))
        self.assertFalse(self.repo.delete_org_membership(self.org_b_id, "user_missing"))

    def test_remove_group_member_composite_key(self):
        group = self.repo.create_org_group(self.default_org_id, "Remove Me Group", created_by=self.admin_id)
        gid = str(group.get("id") or "")
        self.assertTrue(self.repo.add_group_member(self.default_org_id, gid, self.member_id, created_by=self.admin_id))

        # user не состоит в группе другой org → False
        self.assertFalse(self.repo.remove_group_member(self.org_b_id, gid, self.member_id))

        self.assertTrue(self.repo.remove_group_member(self.default_org_id, gid, self.member_id))
        self.assertFalse(self.repo.remove_group_member(self.default_org_id, gid, self.member_id))
        remaining = self.repo.list_group_members(self.default_org_id, gid)
        self.assertEqual(remaining, [])


if __name__ == "__main__":
    unittest.main()
