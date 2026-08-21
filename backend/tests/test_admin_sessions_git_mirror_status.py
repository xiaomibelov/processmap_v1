import unittest


class AdminSessionsGitMirrorStatusTest(unittest.TestCase):
    def test_extract_publish_git_mirror_normalizes_payload(self):
        from app import _legacy_main

        out = _legacy_main._extract_publish_git_mirror(
            {
                "git_mirror_publish": {
                    "mirror_state": "SYNCED",
                    "current_bpmn": {
                        "version_number": "3",
                        "version_id": "v003",
                    },
                    "last_attempt_at": "123",
                    "last_error": "",
                }
            }
        )
        self.assertEqual(str(out.get("state") or ""), "synced")
        self.assertEqual(int(out.get("version_number") or 0), 3)
        self.assertEqual(str(out.get("version_id") or ""), "v003")
        self.assertEqual(int(out.get("last_attempt_at") or 0), 123)
        self.assertIsNone(out.get("last_error"))

    def test_session_row_for_admin_exposes_publish_git_mirror_fields(self):
        from app.routers.admin import _session_row_for_admin

        row = _session_row_for_admin(
            session={
                "id": "sess_1",
                "org_id": "org_1",
                "project_id": "proj_1",
                "owner_id": "user_1",
                "status": "ready",
                "updated_at": 100,
                "needs_attention": 0,
                "dod_artifacts": {
                    "bpmn_present": True,
                    "interview_filled": True,
                    "paths_mapped": True,
                    "ai_report_created": True,
                    "needs_attention": 0,
                },
            },
            project_title_by_id={"proj_1": "Project One"},
            org_name="Org One",
            meta_entry={
                "interview": {
                    "git_mirror_publish": {
                        "mirror_state": "skipped_invalid_config",
                        "current_bpmn": {"version_number": 0, "version_id": ""},
                        "last_error": "invalid config",
                    }
                },
                "bpmn_meta": {},
            },
            redis_runtime={"mode": "ON"},
        )

        self.assertEqual(str(row.get("publish_git_mirror_state") or ""), "skipped_invalid_config")
        self.assertEqual(int(row.get("publish_git_mirror_version_number") or 0), 0)
        self.assertEqual(str(row.get("publish_git_mirror_version_id") or ""), "")
        self.assertEqual(str(row.get("publish_git_mirror_last_error") or ""), "invalid config")

    def test_collect_publish_git_mirror_metrics_for_dashboard(self):
        from app.routers.admin import _collect_publish_git_mirror_metrics

        out = _collect_publish_git_mirror_metrics(
            sessions=[
                {"id": "sess_synced"},
                {"id": "sess_failed"},
                {"id": "sess_none"},
            ],
            meta_map={
                "sess_synced": {
                    "interview": {
                        "git_mirror_publish": {
                            "mirror_state": "synced",
                            "current_bpmn": {"version_number": 2, "version_id": "v002"},
                            "last_attempt_at": 100,
                        }
                    }
                },
                "sess_failed": {
                    "interview": {
                        "git_mirror_publish": {
                            "mirror_state": "failed",
                            "current_bpmn": {"version_number": 1, "version_id": "v001"},
                            "last_attempt_at": 200,
                            "last_error": "push failed",
                        }
                    }
                },
            },
        )

        self.assertEqual(int(out.get("published_bpmn_versions") or 0), 3)
        self.assertEqual(int(out.get("mirrored_to_git") or 0), 1)
        self.assertEqual(int(out.get("failed") or 0), 1)
        self.assertEqual(int(out.get("pending") or 0), 0)
        self.assertEqual(int(out.get("not_attempted") or 0), 1)
        self.assertEqual(str(out.get("latest_result_state") or ""), "failed")
        self.assertEqual(str(out.get("latest_result_session_id") or ""), "sess_failed")
        self.assertEqual(int(out.get("latest_result_version_number") or 0), 1)
        self.assertEqual(str(out.get("latest_result_error") or ""), "push failed")
        self.assertEqual(int(out.get("latest_attempt_at") or 0), 200)


if __name__ == "__main__":
    unittest.main()
