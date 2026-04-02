import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock


SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Demo Process" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Start"/>
    <bpmn:task id="Task_A" name="Task A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="priority" value="high"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="End_1" name="End"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_A"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="End_1"/>
  </bpmn:process>
</bpmn:definitions>
"""


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class PublishGitMirrorExecutionTest(unittest.TestCase):
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
        from app._legacy_main import (
            patch_org_git_mirror_endpoint,
            patch_session,
            session_bpmn_save,
        )
        from app.schemas.legacy_api import BpmnXmlIn, OrgGitMirrorPatchIn, UpdateSessionIn
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.patch_org_git_mirror_endpoint = patch_org_git_mirror_endpoint
        self.patch_session = patch_session
        self.session_bpmn_save = session_bpmn_save
        self.BpmnXmlIn = BpmnXmlIn
        self.OrgGitMirrorPatchIn = OrgGitMirrorPatchIn
        self.UpdateSessionIn = UpdateSessionIn
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.default_org_id = get_default_org_id()
        self.admin_user = create_user("publish_git_mirror_admin@local", "adminpass", is_admin=True)

        project_storage = self.get_project_storage()
        self.project_id = project_storage.create(
            "Mirror Project",
            user_id=str(self.admin_user.get("id") or ""),
            is_admin=True,
            org_id=self.default_org_id,
        )
        self.project = project_storage.load(self.project_id, org_id=self.default_org_id, is_admin=True)
        self.workspace_id = str(getattr(self.project, "workspace_id", "") or "")

        storage = self.get_storage()
        self.session_id = storage.create(
            "Mirror Session",
            project_id=self.project_id,
            user_id=str(self.admin_user.get("id") or ""),
            is_admin=True,
            org_id=self.default_org_id,
        )
        sess = storage.load(self.session_id, org_id=self.default_org_id, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML
        sess.bpmn_graph_fingerprint = "graph_fp_test"
        sess.interview = {"status": "in_progress"}
        storage.save(
            sess,
            user_id=str(self.admin_user.get("id") or ""),
            is_admin=True,
            org_id=self.default_org_id,
        )

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

    def _configure_mirror(self, **kwargs):
        payload = self.OrgGitMirrorPatchIn(**kwargs)
        out = self.patch_org_git_mirror_endpoint(self.default_org_id, payload, self._request())
        self.assertTrue(out.get("ok"))
        return out

    def test_publish_ready_status_skips_when_mirror_disabled(self):
        out = self.patch_session(
            self.session_id,
            self.UpdateSessionIn(status="ready"),
            self._request(),
        )
        interview = out.get("interview") or {}
        mirror = interview.get("git_mirror_publish") or {}
        self.assertEqual(str(mirror.get("mirror_state") or ""), "skipped_disabled")

    def test_publish_ready_status_skips_when_config_invalid(self):
        self._configure_mirror(git_mirror_enabled=True)
        out = self.patch_session(
            self.session_id,
            self.UpdateSessionIn(status="ready"),
            self._request(),
        )
        interview = out.get("interview") or {}
        mirror = interview.get("git_mirror_publish") or {}
        self.assertEqual(str(mirror.get("mirror_state") or ""), "skipped_invalid_config")

    def test_version_progression_monotonic(self):
        self._configure_mirror(
            git_mirror_enabled=True,
            git_provider="github",
            git_repository="acme/processmap",
            git_branch="main",
            git_base_path="publish/base",
        )

        calls = []

        def _fake_commit(*, provider, repository, branch, files, commit_message):
            calls.append(
                {
                    "provider": provider,
                    "repository": repository,
                    "branch": branch,
                    "files": dict(files),
                    "commit_message": commit_message,
                }
            )
            return f"commit-sha-{len(calls)}"

        with mock.patch(
            "app.services.publish_git_mirror._commit_publish_artifacts_to_provider",
            side_effect=_fake_commit,
        ):
            out_first = self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )
            out_second = self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )

        self.assertEqual(len(calls), 2)
        repo_root = (
            f"publish/base/orgs/{self.default_org_id}/workspaces/{self.workspace_id}/"
            f"projects/{self.project_id}/sessions/{self.session_id}"
        )
        expected_first = {
            f"{repo_root}/versions/v001.bpmn",
            f"{repo_root}/manifest.json",
            f"{repo_root}/properties.json",
            f"{repo_root}/robot_meta.json",
            f"{repo_root}/node_red.json",
        }
        expected_second = {
            f"{repo_root}/versions/v002.bpmn",
            f"{repo_root}/manifest.json",
            f"{repo_root}/properties.json",
            f"{repo_root}/robot_meta.json",
            f"{repo_root}/node_red.json",
        }
        self.assertEqual(set(calls[0]["files"].keys()), expected_first)
        self.assertEqual(set(calls[1]["files"].keys()), expected_second)

        manifest_first = json.loads(calls[0]["files"][f"{repo_root}/manifest.json"])
        self.assertEqual(str(manifest_first.get("schema_version") or ""), "processmap_publish_manifest_v1")
        self.assertEqual(str((manifest_first.get("current_bpmn") or {}).get("version_id") or ""), "v001")
        self.assertEqual(str((manifest_first.get("git") or {}).get("provider") or ""), "github")
        self.assertEqual(str((manifest_first.get("git") or {}).get("repository") or ""), "acme/processmap")
        self.assertEqual(str((manifest_first.get("git") or {}).get("branch") or ""), "main")

        mirror_first = (out_first.get("interview") or {}).get("git_mirror_publish") or {}
        mirror_second = (out_second.get("interview") or {}).get("git_mirror_publish") or {}
        self.assertEqual(str(mirror_first.get("mirror_state") or ""), "synced")
        self.assertEqual(str(mirror_second.get("mirror_state") or ""), "synced")
        self.assertEqual(int((mirror_second.get("current_bpmn") or {}).get("version_number") or 0), 2)
        self.assertEqual(str((mirror_second.get("git") or {}).get("commit_sha") or ""), "commit-sha-2")

    def test_interview_payload_cannot_reset_version(self):
        self._configure_mirror(
            git_mirror_enabled=True,
            git_provider="github",
            git_repository="acme/processmap",
            git_branch="main",
            git_base_path="publish/base",
        )

        calls = []

        def _fake_commit(*, provider, repository, branch, files, commit_message):
            calls.append(
                {
                    "provider": provider,
                    "repository": repository,
                    "branch": branch,
                    "files": dict(files),
                    "commit_message": commit_message,
                }
            )
            return f"commit-sha-{len(calls)}"

        with mock.patch(
            "app.services.publish_git_mirror._commit_publish_artifacts_to_provider",
            side_effect=_fake_commit,
        ):
            self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )
            self.patch_session(
                self.session_id,
                self.UpdateSessionIn(interview={"status": "in_progress"}),
                self._request(),
            )
            out_second = self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )

        self.assertEqual(len(calls), 2)
        repo_root = (
            f"publish/base/orgs/{self.default_org_id}/workspaces/{self.workspace_id}/"
            f"projects/{self.project_id}/sessions/{self.session_id}"
        )
        manifest_second = json.loads(calls[1]["files"][f"{repo_root}/manifest.json"])
        self.assertEqual(str((manifest_second.get("current_bpmn") or {}).get("version_id") or ""), "v002")
        mirror_second = (out_second.get("interview") or {}).get("git_mirror_publish") or {}
        self.assertEqual(int((mirror_second.get("current_bpmn") or {}).get("version_number") or 0), 2)

    def test_interview_payload_cannot_force_version(self):
        self._configure_mirror(
            git_mirror_enabled=True,
            git_provider="github",
            git_repository="acme/processmap",
            git_branch="main",
            git_base_path="publish/base",
        )

        calls = []

        def _fake_commit(*, provider, repository, branch, files, commit_message):
            calls.append(
                {
                    "provider": provider,
                    "repository": repository,
                    "branch": branch,
                    "files": dict(files),
                    "commit_message": commit_message,
                }
            )
            return f"commit-sha-{len(calls)}"

        with mock.patch(
            "app.services.publish_git_mirror._commit_publish_artifacts_to_provider",
            side_effect=_fake_commit,
        ):
            self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )
            self.patch_session(
                self.session_id,
                self.UpdateSessionIn(
                    interview={
                        "status": "in_progress",
                        "git_mirror_publish": {"current_bpmn": {"version_number": 999}},
                    }
                ),
                self._request(),
            )
            out_second = self.patch_session(
                self.session_id,
                self.UpdateSessionIn(status="ready"),
                self._request(),
            )

        self.assertEqual(len(calls), 2)
        repo_root = (
            f"publish/base/orgs/{self.default_org_id}/workspaces/{self.workspace_id}/"
            f"projects/{self.project_id}/sessions/{self.session_id}"
        )
        manifest_second = json.loads(calls[1]["files"][f"{repo_root}/manifest.json"])
        self.assertEqual(str((manifest_second.get("current_bpmn") or {}).get("version_id") or ""), "v002")
        mirror_second = (out_second.get("interview") or {}).get("git_mirror_publish") or {}
        self.assertEqual(int((mirror_second.get("current_bpmn") or {}).get("version_number") or 0), 2)

    def test_bpmn_save_path_does_not_trigger_publish_mirror(self):
        self._configure_mirror(
            git_mirror_enabled=True,
            git_provider="github",
            git_repository="acme/processmap",
            git_branch="main",
            git_base_path="publish/base",
        )
        with mock.patch(
            "app.services.publish_git_mirror._commit_publish_artifacts_to_provider",
            side_effect=AssertionError("mirror commit should not run for bpmn save path"),
        ):
            out = self.session_bpmn_save(
                self.session_id,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML),
                self._request(),
            )
            self.assertTrue(out.get("ok"))

        sess = self.get_storage().load(self.session_id, org_id=self.default_org_id, is_admin=True)
        interview = dict(getattr(sess, "interview", {}) or {})
        self.assertNotIn("git_mirror_publish", interview)


if __name__ == "__main__":
    unittest.main()
