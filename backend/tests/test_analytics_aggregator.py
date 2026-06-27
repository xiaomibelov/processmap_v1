"""Tests for the analytics aggregator publisher and task."""

from __future__ import annotations

import unittest
import uuid
from unittest.mock import MagicMock, patch

from app.save_services.analytics_aggregator.publisher import publish_session_saved
from app.save_services.analytics_aggregator.tasks import refresh_session_analytics_task


class TestAnalyticsAggregator(unittest.TestCase):
    @patch("app.save_services.analytics_aggregator.publisher.refresh_session_analytics_task")
    def test_publish_session_saved_enqueues_task(self, mock_task):
        publish_session_saved("sid_123", "org_456")
        mock_task.delay.assert_called_once_with("sid_123", "org_456")

    @patch("app.save_services.analytics_aggregator.tasks.refresh_analytics_for_session")
    def test_refresh_task_calls_refresh_analytics_for_session(self, mock_refresh):
        mock_refresh.return_value = {"session_id": "sid_123", "updated": True}
        result = refresh_session_analytics_task.run("sid_123", "org_456")
        mock_refresh.assert_called_once_with("sid_123", "org_456")
        self.assertEqual(result, {"session_id": "sid_123", "updated": True})

    @patch("app.save_services.analytics_aggregator.tasks.refresh_session_analytics_task.retry")
    @patch("app.save_services.analytics_aggregator.tasks.refresh_analytics_for_session")
    def test_refresh_task_retries_on_failure(self, mock_refresh, mock_retry):
        mock_refresh.side_effect = RuntimeError("analytics failed")
        mock_retry.return_value = MagicMock()
        with self.assertRaises(Exception):
            refresh_session_analytics_task.run("sid_123", "org_456")
        mock_refresh.assert_called_once_with("sid_123", "org_456")
        mock_retry.assert_called_once()

    @patch("app.save_services.analytics_aggregator.publisher.refresh_session_analytics_task")
    def test_properties_endpoint_enqueues_analytics_refresh(self, mock_task):
        from fastapi.testclient import TestClient

        from app.auth import create_access_token, create_user
        from app.main import app
        from app.storage import (
            create_org_record,
            get_storage,
            upsert_org_membership,
            upsert_project_membership,
        )

        st = get_storage()
        client = TestClient(app)

        suffix = uuid.uuid4().hex
        owner = create_user(f"owner_analytics_props_{suffix}@local", "password", is_admin=True)
        org_id = f"org_analytics_properties_{suffix}"
        create_org_record("Analytics Properties Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(owner["id"]), "owner")
        upsert_project_membership(org_id, "proj_1", str(owner["id"]), "owner")

        token = create_access_token(str(owner["id"]))
        sid = st.create(
            title="analytics-properties-session",
            user_id=str(owner["id"]),
            org_id=org_id,
            project_id="proj_1",
        )

        before = st.load(sid, org_id=org_id, is_admin=True)
        base = int(getattr(before, "diagram_state_version", 0) or 0)

        response = client.patch(
            f"/api/sessions/{sid}/properties",
            json={"bpmn_meta_json": {"custom_key": "custom_value"}, "base_diagram_state_version": base},
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        mock_task.delay.assert_called_once()
        args, _ = mock_task.delay.call_args
        self.assertEqual(args[0], sid)
        self.assertEqual(args[1], org_id)


if __name__ == "__main__":
    unittest.main()
