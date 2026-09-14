"""Characterization tests for audit_telemetry storage repository methods
migrated to the generic base.py CRUD layer (refactor/storage-base-repository-v1,
step 2).

Bootstrap mirrors test_notes_repo_characterization.py: tmpdir-backed storage
via env vars, seeded default org and user.
"""
from __future__ import annotations

import os
import tempfile
import time
import unittest


class AuditTelemetryRepoCharacterizationTest(unittest.TestCase):
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
        from app.domains.storage.audit_telemetry import repository as audit_repo
        from app.domains.storage.org_auth.repository import append_audit_log
        from app.storage import get_default_org_id, get_storage

        self.audit_repo = audit_repo
        self.append_audit_log = append_audit_log
        self.get_default_org_id = get_default_org_id

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user("audit_repo_admin@local", "admin", is_admin=True)
        self.admin_id = str(self.admin.get("id") or "")
        self.now = int(time.time())

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

    def _append_audit(self, action, entity_id, *, ts=None, **kwargs):
        return self.append_audit_log(
            actor_user_id=self.admin_id,
            org_id=self.org_id,
            action=action,
            entity_type="session",
            entity_id=entity_id,
            ts=ts,
            **kwargs,
        )

    def _append_event(self, event_id, *, occurred_at=None, ingested_at=None, severity="error", **kwargs):
        occurred = int(occurred_at if occurred_at is not None else self.now)
        return self.audit_repo.append_error_event(
            id=event_id,
            schema_version=1,
            occurred_at=occurred,
            ingested_at=int(ingested_at if ingested_at is not None else occurred),
            source="web",
            event_type="js_error",
            severity=severity,
            message=f"message {event_id}",
            fingerprint=f"fp-{event_id}",
            org_id=self.org_id,
            **kwargs,
        )

    # --- append_audit_log / list / count --------------------------------------

    def test_append_audit_log_returns_mapped_payload(self):
        entry = self._append_audit("session.create", "sess_1", meta={"k": "v"})
        self.assertEqual(entry["action"], "session.create")
        self.assertEqual(entry["entity_id"], "sess_1")
        self.assertEqual(entry["status"], "ok")
        self.assertEqual(entry["meta"], {"k": "v"})
        self.assertEqual(entry["actor_user_id"], self.admin_id)

    def test_list_audit_log_orders_by_ts_desc_id_desc(self):
        self._append_audit("a.first", "e1", ts=self.now - 300)
        self._append_audit("a.second", "e2", ts=self.now - 200)
        self._append_audit("a.third", "e3", ts=self.now - 100)
        rows = self.audit_repo.list_audit_log(self.org_id)
        self.assertEqual([r["action"] for r in rows], ["a.third", "a.second", "a.first"])

    def test_list_audit_log_tie_breaks_by_id_desc(self):
        same_ts = self.now - 500
        entries = [
            self._append_audit(f"a.tie.{idx}", f"e{idx}", ts=same_ts)
            for idx in range(3)
        ]
        expected = sorted(entries, key=lambda e: e["id"], reverse=True)
        rows = self.audit_repo.list_audit_log(self.org_id)
        self.assertEqual([r["id"] for r in rows], [e["id"] for e in expected])

    def test_list_audit_log_wrong_org_is_empty(self):
        self._append_audit("a.hidden", "e1")
        self.assertEqual(self.audit_repo.list_audit_log("org_foreign"), [])
        self.assertEqual(self.audit_repo.count_audit_log("org_foreign"), 0)

    def test_list_audit_log_eq_and_range_filters(self):
        self._append_audit("a.keep", "e1", ts=self.now - 500)
        self._append_audit("a.drop", "e2", ts=self.now - 50)
        rows = self.audit_repo.list_audit_log(
            self.org_id, action="a.keep", updated_from=self.now - 1000, updated_to=self.now - 100
        )
        self.assertEqual([r["action"] for r in rows], ["a.keep"])
        self.assertEqual(
            self.audit_repo.count_audit_log(
                self.org_id, action="a.keep",
                updated_from=self.now - 1000, updated_to=self.now - 100,
            ),
            1,
        )

    def test_list_audit_log_like_filter_matches_any_column(self):
        self._append_audit("diagram.publish", "sess_alpha")
        self._append_audit("diagram.delete", "sess_beta")
        rows = self.audit_repo.list_audit_log(self.org_id, q="ALPHA")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["entity_id"], "sess_alpha")
        self.assertEqual(self.audit_repo.count_audit_log(self.org_id, q="beta"), 1)

    def test_list_audit_log_limit_clamped_to_500(self):
        for idx in range(5):
            self._append_audit(f"a.{idx}", f"e{idx}")
        rows = self.audit_repo.list_audit_log(self.org_id, limit=1000)
        self.assertEqual(len(rows), 5)

    # --- cleanup_audit_log -----------------------------------------------------

    def test_cleanup_audit_log_returns_rowcount_and_respects_threshold(self):
        old_ts = self.now - (120 * 24 * 60 * 60)
        self._append_audit("a.old", "e_old", ts=old_ts)
        self._append_audit("a.recent", "e_recent", ts=self.now - 100)
        removed = self.audit_repo.cleanup_audit_log(
            self.org_id, retention_days=90, now_ts=self.now
        )
        self.assertEqual(removed, 1)
        remaining = self.audit_repo.list_audit_log(self.org_id)
        self.assertEqual([r["action"] for r in remaining], ["a.recent"])

    def test_cleanup_audit_log_empty_org_returns_zero(self):
        self.assertEqual(self.audit_repo.cleanup_audit_log("", retention_days=90), 0)

    # --- append_error_event / get / list / count -------------------------------

    def test_append_error_event_returns_mapped_payload(self):
        event = self._append_event("evt_1", context_json={"a": 1})
        self.assertEqual(event["id"], "evt_1")
        self.assertEqual(event["severity"], "error")
        self.assertEqual(event["context_json"], {"a": 1})

    def test_get_error_event_returns_none_for_missing(self):
        self.assertIsNone(self.audit_repo.get_error_event("evt_missing"))

    def test_list_error_events_composite_ordering(self):
        t1 = self.now - 300
        t2 = self.now - 200
        self._append_event("evt_b", occurred_at=t1, severity="warning")
        self._append_event("evt_a", occurred_at=t2)
        self._append_event("evt_c", occurred_at=t2)
        asc = self.audit_repo.list_error_events(order="asc")
        self.assertEqual([r["id"] for r in asc], ["evt_b", "evt_a", "evt_c"])
        desc = self.audit_repo.list_error_events(order="desc")
        self.assertEqual([r["id"] for r in desc], ["evt_c", "evt_a", "evt_b"])

    def test_list_error_events_filters_eq_range(self):
        self._append_event("evt_old", occurred_at=self.now - 4000, severity="warning")
        self._append_event("evt_new", occurred_at=self.now - 10, severity="error")
        rows = self.audit_repo.list_error_events(
            severity="warning",
            occurred_from=self.now - 5000,
            occurred_to=self.now - 1000,
        )
        self.assertEqual([r["id"] for r in rows], ["evt_old"])
        self.assertEqual(
            self.audit_repo.count_error_events(
                severity="warning",
                occurred_from=self.now - 5000,
                occurred_to=self.now - 1000,
            ),
            1,
        )
        self.assertEqual(self.audit_repo.count_error_events(severity="error"), 1)

    def test_list_error_events_limit_clamped_to_100(self):
        for idx in range(3):
            self._append_event(f"evt_{idx}")
        rows = self.audit_repo.list_error_events(limit=1000)
        self.assertEqual(len(rows), 3)

    # --- update_error_event -----------------------------------------------------

    def test_update_error_event_patches_mutable_fields(self):
        self._append_event("evt_upd", severity="error")
        updated = self.audit_repo.update_error_event(
            "evt_upd", severity="WARNING", message="new text", context_json={"x": 1}
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated["severity"], "warning")
        self.assertEqual(updated["message"], "new text")
        self.assertEqual(updated["context_json"], {"x": 1})
        fetched = self.audit_repo.get_error_event("evt_upd")
        self.assertEqual(fetched["message"], "new text")

    def test_update_error_event_no_fields_returns_current(self):
        self._append_event("evt_same")
        updated = self.audit_repo.update_error_event("evt_same")
        self.assertIsNotNone(updated)
        self.assertEqual(updated["id"], "evt_same")

    def test_update_error_event_empty_message_raises(self):
        self._append_event("evt_bad")
        with self.assertRaises(ValueError):
            self.audit_repo.update_error_event("evt_bad", message="")

    def test_update_error_event_missing_id_returns_none(self):
        self.assertIsNone(self.audit_repo.update_error_event("evt_missing", severity="info"))

    # --- delete_error_event -----------------------------------------------------

    def test_delete_error_event_returns_bool(self):
        self._append_event("evt_del")
        self.assertTrue(self.audit_repo.delete_error_event("evt_del"))
        self.assertIsNone(self.audit_repo.get_error_event("evt_del"))
        self.assertFalse(self.audit_repo.delete_error_event("evt_del"))
        self.assertFalse(self.audit_repo.delete_error_event(""))

    # --- cleanup_error_events ----------------------------------------------------

    def test_cleanup_error_events_returns_rowcount(self):
        old_ts = self.now - (60 * 24 * 60 * 60)
        self._append_event("evt_old", occurred_at=old_ts, ingested_at=old_ts)
        self._append_event("evt_new", ingested_at=self.now - 10)
        removed = self.audit_repo.cleanup_error_events(
            retention_days=30, now_ts=self.now
        )
        self.assertEqual(removed, 1)
        self.assertIsNone(self.audit_repo.get_error_event("evt_old"))
        self.assertIsNotNone(self.audit_repo.get_error_event("evt_new"))


if __name__ == "__main__":
    unittest.main()
