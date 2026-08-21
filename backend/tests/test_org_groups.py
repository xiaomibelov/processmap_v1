import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class OrgGroupsTest(unittest.TestCase):
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
        from app.routers.org_groups import GroupCreateIn, GroupMemberIn, GroupPatchIn
        from app.services import org_groups as og
        from app.storage import (
            create_org_record,
            get_default_org_id,
            list_user_org_memberships,
            upsert_org_membership,
        )

        self.create_user = create_user
        self.GroupCreateIn = GroupCreateIn
        self.GroupPatchIn = GroupPatchIn
        self.GroupMemberIn = GroupMemberIn
        self.org_groups = og
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.list_user_org_memberships = list_user_org_memberships
        self.upsert_org_membership = upsert_org_membership

        self.admin = create_user("platform_admin@local", "strongpass1", is_admin=True)
        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Second Org", created_by=str(self.admin.get("id") or ""))
        self.org_b_id = str(self.org_b.get("id") or "")

        self.admin_request = _DummyRequest(
            self.admin,
            active_org_id=self.default_org_id,
            org_memberships=self.list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True),
        )

        self.member = create_user("member@local", "strongpass1")
        self.member_id = str(self.member.get("id") or "")
        self.upsert_org_membership(self.default_org_id, self.member_id, "editor")

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

    def test_create_list_update_delete_group(self):
        created = self.org_groups.create_group(
            self.default_org_id,
            self.GroupCreateIn(name="  QA Team  ", description="Quality Assurance"),
            self.admin_request,
        )
        self.assertTrue(created.get("ok"))
        group = created.get("item") or {}
        self.assertEqual(group.get("name"), "QA Team")
        self.assertEqual(group.get("description"), "Quality Assurance")

        listed = self.org_groups.list_groups(self.default_org_id, self.admin_request)
        self.assertTrue(listed.get("ok"))
        self.assertEqual(len(listed.get("items") or []), 1)

        updated = self.org_groups.update_group(
            self.default_org_id,
            group.get("id"),
            self.GroupPatchIn(name="QA Team Updated", description="Updated"),
            self.admin_request,
        )
        self.assertTrue(updated.get("ok"))
        self.assertEqual((updated.get("item") or {}).get("name"), "QA Team Updated")

        deleted = self.org_groups.delete_group(self.default_org_id, group.get("id"), self.admin_request)
        self.assertTrue(deleted.get("ok"))

        listed2 = self.org_groups.list_groups(self.default_org_id, self.admin_request)
        self.assertEqual(len(listed2.get("items") or []), 0)

    def test_add_and_remove_group_member(self):
        created = self.org_groups.create_group(
            self.default_org_id,
            self.GroupCreateIn(name="Engineering"),
            self.admin_request,
        )
        group_id = (created.get("item") or {}).get("id")

        added = self.org_groups.add_member(
            self.default_org_id,
            group_id,
            self.GroupMemberIn(user_id=self.member_id),
            self.admin_request,
        )
        self.assertTrue(added.get("ok"))
        self.assertEqual(len(added.get("items") or []), 1)

        members = self.org_groups.list_members(self.default_org_id, group_id, self.admin_request)
        self.assertEqual(len(members.get("items") or []), 1)
        self.assertEqual((members.get("items") or [])[0].get("user_id"), self.member_id)

        removed = self.org_groups.remove_member(
            self.default_org_id,
            group_id,
            self.member_id,
            self.admin_request,
        )
        self.assertTrue(removed.get("ok"))

        members2 = self.org_groups.list_members(self.default_org_id, group_id, self.admin_request)
        self.assertEqual(len(members2.get("items") or []), 0)

    def test_regular_member_cannot_create_group(self):
        request = _DummyRequest(
            self.member,
            active_org_id=self.default_org_id,
            org_memberships=self.list_user_org_memberships(self.member_id),
        )
        result = self.org_groups.create_group(
            self.default_org_id,
            self.GroupCreateIn(name="Rogue"),
            request,
        )
        self.assertEqual(getattr(result, "status_code", None), 403)


if __name__ == "__main__":
    unittest.main()
