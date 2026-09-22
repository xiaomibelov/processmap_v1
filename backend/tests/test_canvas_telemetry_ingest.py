"""API-тесты ingest ленты канваса: POST /api/telemetry/canvas-events.

Контракт (API.md контура feature/canvas-telemetry-feed):
- локальная запись в монолит (canvas_event_raw), без notifications-proxy/fallback;
- auth: bearer; org/user из request.state перекрывают payload;
- идемпотентность: UNIQUE (session_id, event_id), ON CONFLICT DO NOTHING;
- rate-limit per session (429), валидация (422), redaction запрещённых полей.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402


def _event(event_id: str, kind: str = "command", session_id: str = "s_1", **over):
    ev = {
        "event_id": event_id,
        "seq": 1,
        "ts": 1727000000000,
        "kind": kind,
        "session_id": session_id,
        "project_id": "p_1",
        "command": {"type": "shape.move", "elementIds": ["Task_1"], "elementTypes": ["bpmn:Task"]},
    }
    ev.update(over)
    return ev


class CanvasTelemetryIngestTest(unittest.TestCase):
    def setUp(self):
        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.storage import get_default_org_id

        # изоляция между тестами: conftest подменяет PROCESS_DB_PATH на свежий файл,
        # глобальные флаги схемы/лимитера сбрасываем принудительно
        from app.domains.storage.canvas_telemetry import repository as canvas_repo
        import app.routers.canvas_telemetry as router_mod

        canvas_repo._reset_schema_flag_for_tests()
        router_mod._reset_rate_limiter_for_tests()

        self.app = create_app()
        self.client = TestClient(self.app)
        self.user = create_user("canvas.tel@local", "strongpass1", is_admin=True)
        self.token = create_access_token(self.user["id"] if isinstance(self.user, dict) else self.user)
        self.org_id = get_default_org_id()

    def _post(self, events, token="__default__"):
        headers = {"Content-Type": "application/json"}
        tok = self.token if token == "__default__" else token
        if tok:
            headers["Authorization"] = f"Bearer {tok}"
        return self.client.post("/api/telemetry/canvas-events", json={"events": events}, headers=headers)

    # -- A1: append batch --------------------------------------------------
    def test_append_batch_201_accepted_count(self):
        events = [_event("e1"), _event("e2", kind="op"), _event("e3", kind="ack")]
        resp = self._post(events)
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["accepted"], 3)

        from app.domains.storage.canvas_telemetry.repository import list_raw_events

        rows = list_raw_events(session_id="s_1")
        self.assertEqual(len(rows), 3)
        stored_kinds = [r["kind"] for r in rows]
        self.assertEqual(stored_kinds, ["command", "op", "ack"])
        self.assertEqual(rows[0]["org_id"], self.org_id)

    # -- A2: auth ----------------------------------------------------------
    def test_auth_required_without_bearer(self):
        resp = self._post([_event("e1")], token=None)
        self.assertEqual(resp.status_code, 401)

    def test_trusted_org_user_override_payload(self):
        ev = _event("e1", org_id="fake-org", user_id="fake-user")
        resp = self._post([ev])
        self.assertEqual(resp.status_code, 201, resp.text)
        from app.domains.storage.canvas_telemetry.repository import list_raw_events

        rows = list_raw_events(session_id="s_1")
        self.assertEqual(rows[0]["org_id"], self.org_id)
        self.assertNotEqual(rows[0]["user_id"], "fake-user")

    # -- A3: rate limit ----------------------------------------------------
    def test_rate_limit_per_session_429(self):
        import app.routers.canvas_telemetry as router_mod

        old_limit = router_mod.get_rate_limit_per_minute()
        router_mod.set_rate_limit_per_minute(5)
        try:
            events = [_event(f"e{i}") for i in range(6)]
            resp = self._post(events)
            self.assertEqual(resp.status_code, 429, resp.text)
            body = resp.json()
            self.assertIn("too_many_requests", json.dumps(body))
        finally:
            router_mod.set_rate_limit_per_minute(old_limit)

    def test_rate_limit_isolated_per_session(self):
        import app.routers.canvas_telemetry as router_mod

        old_limit = router_mod.get_rate_limit_per_minute()
        router_mod.set_rate_limit_per_minute(5)
        try:
            events = [_event(f"e{i}", session_id="s_A") for i in range(5)]
            resp = self._post(events)
            self.assertEqual(resp.status_code, 201, resp.text)
            # другая сессия — не ограничена чужим окном
            events_b = [_event(f"e{i}", session_id="s_B") for i in range(5)]
            resp_b = self._post(events_b)
            self.assertEqual(resp_b.status_code, 201, resp_b.text)
        finally:
            router_mod.set_rate_limit_per_minute(old_limit)

    # -- A4: валидация -----------------------------------------------------
    def test_too_many_events_422(self):
        events = [_event(f"e{i}") for i in range(101)]
        resp = self._post(events)
        self.assertEqual(resp.status_code, 422)

    def test_invalid_kind_422(self):
        resp = self._post([_event("e1", kind="wat")])
        self.assertEqual(resp.status_code, 422)

    def test_missing_event_id_422(self):
        ev = _event("e1")
        del ev["event_id"]
        resp = self._post([ev])
        self.assertEqual(resp.status_code, 422)

    # -- A5: server-side redaction -----------------------------------------
    def test_redaction_of_forbidden_fields(self):
        ev = _event(
            "e1",
            command={"type": "shape.move", "elementIds": ["Task_1"], "bpmn_xml": "<xml/>"},
            meta={"accessToken": "secret-token", "note": "x" * 500},
        )
        resp = self._post([ev])
        self.assertEqual(resp.status_code, 201, resp.text)
        from app.domains.storage.canvas_telemetry.repository import list_raw_events

        rows = list_raw_events(session_id="s_1")
        payload = json.loads(rows[0]["payload_json"])
        self.assertNotIn("<xml/>", json.dumps(payload))
        self.assertNotIn("secret-token", json.dumps(payload))
        self.assertNotIn("x" * 500, json.dumps(payload))

    # -- Идемпотентность ---------------------------------------------------
    def test_retry_batch_no_duplicates(self):
        events = [_event("e1"), _event("e2")]
        first = self._post(events)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()["accepted"], 2)
        # повтор той же пачки: конфликтующие строки пропускаются
        retry = self._post(events)
        self.assertEqual(retry.status_code, 201)
        self.assertEqual(retry.json()["accepted"], 0)
        from app.domains.storage.canvas_telemetry.repository import list_raw_events

        self.assertEqual(len(list_raw_events(session_id="s_1")), 2)


if __name__ == "__main__":
    unittest.main()


class CanvasTelemetrySchemaTypesTest(unittest.TestCase):
    """Дефект #2 (живой e2e-прогон, postgres): клиент шлёт ts в миллисекундах
    (~1.7e12), а DDL объявлял ts/first_seen/last_seen как INTEGER — в postgres
    это int32 (max ~2.1e9) → NumericValueOutOfRange → 500. SQLite имеет 64-битный
    INTEGER, поэтому pytest на sqlite дефект не ловил. Регрессионный стоп-кран
    по DDL: миллисекундные колонки обязаны быть BIGINT."""

    def test_millisecond_columns_are_bigint(self):
        from pathlib import Path
        import re

        repo_src = Path(__file__).resolve().parents[1] / "app" / "domains" / "storage" / "canvas_telemetry" / "repository.py"
        text = repo_src.read_text(encoding="utf-8")
        for column in ("ts", "first_seen", "last_seen"):
            match = re.search(rf'^\s*{column}\s+(\w+)', text, flags=re.MULTILINE | re.IGNORECASE)
            self.assertIsNotNone(match, f"column {column} not found in DDL")
            self.assertEqual(
                match.group(1).upper(),
                "BIGINT",
                f"column {column} must be BIGINT (client sends ms), got {match.group(1)}",
            )
