"""Тесты события `ops_committed` шины session events (feature/async-save-pipeline-step2).

TESTS.md §2.1: publisher после commit (operations-handler + full-save), payload
по API.md §1, rollback батча → события нет, redis pub/sub fan-in (§2),
redis down → деградация без 5xx.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
import uuid
from unittest.mock import patch

from test_session_operations_api import SAMPLE_BPMN_XML


class OpsCommittedEventTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_redis_url = os.environ.get("REDIS_URL")
        self.old_cas_bypass = os.environ.get("FPC_E2E_CAS_BYPASS")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("REDIS_URL", None)
        os.environ.pop("FPC_E2E_CAS_BYPASS", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")

        from fastapi.testclient import TestClient

        from app.auth import create_access_token, create_user
        from app.main import app
        from app.services.session_event_bus import get_session_event_bus
        from app.storage import get_storage

        self.client = TestClient(app)
        self.st = get_storage()
        enqueue_patch = patch.object(
            type(self.st), "_enqueue_rag_index_after_version", lambda *args, **kwargs: None
        )
        enqueue_patch.start()
        self.addCleanup(enqueue_patch.stop)
        suffix = uuid.uuid4().hex
        self.owner = create_user(f"owner_ev_{suffix}@local", "password", is_admin=True)
        self.token = create_access_token(str(self.owner["id"]))
        self.sid = self.st.create(title=f"ops-events-{suffix}", user_id=str(self.owner["id"]))
        sess = self.st.load(self.sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML
        sess.diagram_state_version = 7
        self.st.save(sess)
        self.base_version = 7
        self.bus = get_session_event_bus()

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_redis_url is None:
            os.environ.pop("REDIS_URL", None)
        else:
            os.environ["REDIS_URL"] = self.old_redis_url
        if self.old_cas_bypass is not None:
            os.environ["FPC_E2E_CAS_BYPASS"] = self.old_cas_bypass
        self.tmp.cleanup()

    # --- helpers -------------------------------------------------------

    def _post(self, body, extra_headers=None):
        headers = {"Authorization": f"Bearer {self.token}"}
        headers.update(extra_headers or {})
        return self.client.post(
            f"/api/sessions/{self.sid}/operations", json=body, headers=headers
        )

    def _next_event(self):
        try:
            return self.queue.get_nowait()
        except asyncio.QueueEmpty:
            self.fail("no ops_committed event published to local bus")

    # --- tests ---------------------------------------------------------

    def test_apply_ops_publishes_ops_committed_after_commit(self):
        self.queue = self.bus.subscribe(self.sid)
        try:
            resp = self._post(
                {
                    "baseVersion": self.base_version,
                    "operations": [
                        {"opId": "ev-1", "type": "element.updateProperties",
                         "elementId": "Task_1", "properties": {"name": "Event name"}},
                        {"opId": "ev-2", "type": "shape.move",
                         "elementId": "Task_1", "x": 300, "y": 200},
                    ],
                },
                extra_headers={"X-Client-Id": "client-42"},
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            event = self._next_event()
            self.assertEqual(event.get("type"), "ops_committed")
            data = event.get("data") or {}
            self.assertEqual(data.get("session_id"), self.sid)
            self.assertEqual(data.get("version"), self.base_version + 1)
            self.assertEqual(data.get("full"), False)
            self.assertIsInstance(data.get("at"), float)
            self.assertEqual(data.get("actor_client_id"), "client-42")
            ops = data.get("operations") or []
            self.assertEqual(len(ops), 2)
            self.assertEqual([op.get("opId") for op in ops], ["ev-1", "ev-2"])
            for op in ops:
                for key in op:
                    self.assertFalse(str(key).startswith("__"), f"service key {key} leaked")
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_full_save_publishes_ops_committed_with_full_flag(self):
        self.queue = self.bus.subscribe(self.sid)
        try:
            resp = self.client.put(
                f"/api/sessions/{self.sid}/bpmn",
                json={"xml": SAMPLE_BPMN_XML.replace('name="Old name"', 'name="Full event"'),
                      "base_diagram_state_version": self.base_version},
                headers={"Authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            event = self._next_event()
            self.assertEqual(event.get("type"), "ops_committed")
            data = event.get("data") or {}
            self.assertEqual(data.get("version"), self.base_version + 1)
            self.assertEqual(data.get("full"), True)
            self.assertEqual(data.get("operations"), [])
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_rolled_back_batch_does_not_publish_event(self):
        self.queue = self.bus.subscribe(self.sid)
        try:
            resp = self._post(
                {
                    "baseVersion": self.base_version,
                    "operations": [
                        {"opId": "ev-bad-1", "type": "shape.teleport",
                         "elementId": "Task_1", "x": 1, "y": 1},
                    ],
                }
            )
            self.assertEqual(resp.status_code, 422, resp.text)
            self.assertTrue(self.queue.empty(), "rollback batch must not publish ops_committed")
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_replay_does_not_publish_duplicate_event(self):
        body = {
            "baseVersion": self.base_version,
            "operations": [
                {"opId": "ev-replay-1", "type": "element.updateProperties",
                 "elementId": "Task_1", "properties": {"name": "Replay"}},
            ],
        }
        first = self._post(body)
        self.assertEqual(first.status_code, 200, first.text)
        self.queue = self.bus.subscribe(self.sid)
        try:
            second = self._post(body)
            self.assertEqual(second.status_code, 200, second.text)
            self.assertEqual(second.json().get("applied"), 0)
            self.assertTrue(self.queue.empty(), "replay fast path must not publish ops_committed")
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_inline_boundary_49_ops_inlined(self):
        """API.md §1 inline boundary: ≤ OPS_COMMITTED_INLINE_LIMIT ops инлайнятся."""
        import app._legacy_main as legacy

        self.assertEqual(legacy.OPS_COMMITTED_INLINE_LIMIT, 50)
        ops = [
            {"opId": f"inl-49-{i}", "type": "element.updateProperties",
             "elementId": "Task_1", "properties": {"name": f"Inlined {i}"}}
            for i in range(49)
        ]
        self.queue = self.bus.subscribe(self.sid)
        try:
            resp = self._post({"baseVersion": self.base_version, "operations": ops})
            self.assertEqual(resp.status_code, 200, resp.text)
            event = self._next_event()
            data = event.get("data") or {}
            self.assertEqual(data.get("full"), False)
            self.assertEqual(len(data.get("operations") or []), 49)
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_inline_boundary_51_ops_published_as_full(self):
        """API.md §1 inline boundary: батч крупнее лимита → full=true, operations=[]
        (клиенты догоняют по version+fetch)."""
        ops = [
            {"opId": f"inl-51-{i}", "type": "element.updateProperties",
             "elementId": "Task_1", "properties": {"name": f"Bulk {i}"}}
            for i in range(51)
        ]
        self.queue = self.bus.subscribe(self.sid)
        try:
            resp = self._post({"baseVersion": self.base_version, "operations": ops})
            self.assertEqual(resp.status_code, 200, resp.text)
            event = self._next_event()
            data = event.get("data") or {}
            self.assertEqual(data.get("full"), True, "batch above inline limit must be published as full")
            self.assertEqual(data.get("operations"), [])
            self.assertEqual(data.get("version"), self.base_version + 1)
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_publish_redis_failure_does_not_break_response(self):
        from app.services import session_event_bus

        self.queue = self.bus.subscribe(self.sid)
        try:
            with patch.object(session_event_bus, "_relay_event_to_redis", side_effect=RuntimeError("redis down")):
                resp = self._post(
                    {
                        "baseVersion": self.base_version,
                        "operations": [
                            {"opId": "ev-redisdown-1", "type": "element.updateProperties",
                             "elementId": "Task_1", "properties": {"name": "Still saved"}},
                        ],
                    }
                )
            self.assertEqual(resp.status_code, 200, resp.text)
            event = self._next_event()
            self.assertEqual(event.get("type"), "ops_committed")
        finally:
            self.bus.unsubscribe(self.sid, self.queue)

    def test_bus_publish_relays_to_redis_channel(self):
        from app.services import session_event_bus

        published: list[tuple[str, str]] = []

        def fake_publish(channel, message):
            published.append((channel, message))
            return True

        with patch.object(session_event_bus.redis_client, "publish_message", fake_publish, create=True):
            resp = self._post(
                {
                    "baseVersion": self.base_version,
                    "operations": [
                        {"opId": "ev-redis-1", "type": "element.updateProperties",
                         "elementId": "Task_1", "properties": {"name": "Relayed"}},
                    ],
                }
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(len(published), 1, "bus publish must relay exactly one redis message")
        channel, message = published[0]
        self.assertEqual(channel, "pm:session-events")
        payload = json.loads(message)
        self.assertEqual(payload.get("session_id"), self.sid)
        event = payload.get("event") or {}
        self.assertEqual(event.get("type"), "ops_committed")
        self.assertEqual((event.get("data") or {}).get("version"), self.base_version + 1)


class OpsCommittedRedisRelayTests(unittest.TestCase):
    """Fan-in: redis pub/sub сообщение релеится в локальную очередь SSE-подписчика."""

    def test_relay_task_delivers_matching_session_event(self):
        from app.routers import session_events as session_events_router

        message = {
            "type": "message",
            "channel": "pm:session-events",
            "data": json.dumps({
                "session_id": "sess-relay",
                "event": {"type": "ops_committed", "data": {"session_id": "sess-relay", "version": 9}},
            }),
        }

        class _FakePubSub:
            def __init__(self):
                self.calls = 0

            def get_message(self, *args, **kwargs):
                self.calls += 1
                if self.calls == 1:
                    return message
                # Имитация ожидания: relay-цикл крутится, пока таску не отменят.
                import time
                time.sleep(0.05)
                return None

            def close(self):
                return None

        fake_pubsub = _FakePubSub()

        async def _run():
            queue = asyncio.Queue()
            with patch.object(
                session_events_router.redis_client, "subscribe_channel",
                lambda channel: fake_pubsub, create=True,
            ):
                task = asyncio.create_task(
                    session_events_router._redis_relay_task("sess-relay", queue)
                )
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=5.0)
                    return event
                finally:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

        event = asyncio.run(_run())
        self.assertEqual(event.get("type"), "ops_committed")
        self.assertEqual((event.get("data") or {}).get("version"), 9)

    def test_relay_ignores_other_session_events(self):
        from app.routers import session_events as session_events_router

        message = {
            "type": "message",
            "channel": "pm:session-events",
            "data": json.dumps({
                "session_id": "other-session",
                "event": {"type": "ops_committed", "data": {"session_id": "other-session"}},
            }),
        }

        class _FakePubSub:
            def __init__(self):
                self.calls = 0

            def get_message(self, *args, **kwargs):
                self.calls += 1
                if self.calls == 1:
                    return message
                import time
                time.sleep(0.05)
                return None

            def close(self):
                return None

        async def _run():
            queue = asyncio.Queue()
            with patch.object(
                session_events_router.redis_client, "subscribe_channel",
                lambda channel: _FakePubSub(), create=True,
            ):
                task = asyncio.create_task(
                    session_events_router._redis_relay_task("sess-relay", queue)
                )
                try:
                    await asyncio.sleep(0.3)
                    self.assertTrue(queue.empty(), "foreign session event must not be relayed")
                finally:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

        asyncio.run(_run())
